import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { AccessToken, WebhookReceiver } from 'livekit-server-sdk'
import { PGlite } from '@electric-sql/pglite'

const sql = file => readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')
const id = '00000000-0000-0000-0000-000000000001'

test('verified LiveKit joins are routed; unsigned/tampered events fail and database failures request retries', async () => {
  const oldKey = process.env.LIVEKIT_API_KEY, oldSecret = process.env.LIVEKIT_API_SECRET
  process.env.LIVEKIT_API_KEY = 'testkey'
  process.env.LIVEKIT_API_SECRET = 'testsecret-long-enough-for-testing-only'
  const calls = []
  let fail = false
  const exports = {}
  const source = readFileSync(new URL('../src/app/api/livekit/webhook/route.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'exports', js)(name => ({
    'livekit-server-sdk': { WebhookReceiver },
    '@/lib/account-access': { assertAccountAccess: async () => {} },
    '@/lib/supabase': { supabaseAdmin: { rpc: async (...args) => { calls.push(args); return { error: fail ? {} : null } } } },
  })[name], exports)
  const body = JSON.stringify({ id: 'event1', createdAt: Math.floor(Date.now()/1000), event: 'participant_joined', room: { name: `session-${id}`, sid: 'RM_test' }, participant: { identity: 'tutor@test:tutor', sid: 'PA_test' } })
  const request = async (text, signed = true, hashBody = text) => {
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
    token.sha256 = createHash('sha256').update(hashBody).digest('base64')
    return new Request('https://test/api/livekit/webhook', { method: 'POST', body: text,
      headers: signed ? { authorization: await token.toJwt() } : {} })
  }
  try {
    assert.equal((await exports.POST(await request(body, false))).status, 401)
    assert.equal((await exports.POST(await request(body, true, 'different body'))).status, 401)
    assert.equal(calls.length, 0)
    for (const ignored of [body.replace('participant_joined', 'participant_left'), body.replace('tutor@test:tutor', 'student@test:student'), body.replace(`session-${id}`, 'unrelated')]) {
      assert.equal((await exports.POST(await request(ignored))).status, 204)
    }
    assert.equal(calls.filter(call => call[0] === 'notify_tutor_joined').length, 0)
    calls.length = 0
    assert.equal((await exports.POST(await request(body))).status, 204)
    assert.equal(calls[0][0], 'record_session_attendance')
    assert.deepEqual(calls[1], ['notify_tutor_joined', { p_problem_id: id, p_identity: 'tutor@test:tutor' }])
    fail = true
    assert.equal((await exports.POST(await request(body))).status, 503)
  } finally {
    if (oldKey === undefined) delete process.env.LIVEKIT_API_KEY; else process.env.LIVEKIT_API_KEY = oldKey
    if (oldSecret === undefined) delete process.env.LIVEKIT_API_SECRET; else process.env.LIVEKIT_API_SECRET = oldSecret
  }
})

test('join SQL only notifies the selected student once, rejects inactive/wrong participants, and protects execution', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table tutor_profiles(user_email text,subjects text[],verification_status text,verification_stage text,is_available boolean);
      create table problems(id uuid primary key,student_email text,subject text,duration_min integer,offer_price numeric,status text,
        accepted_bid_id uuid,settled_at timestamptz,session_started_at timestamptz,session_ended_at timestamptz,extension_minutes integer default 0);
      create table bids(id uuid primary key,problem_id uuid,tutor_email text,tutor_name text,price numeric,duration_min integer);
    `)
    await db.exec(sql('202609250003_realtime_notifications.sql'))
    await db.exec(sql('202609260001_tutor_join_notifications.sql'))
    await db.exec(sql('202609260001_tutor_join_notifications.sql'))
    await db.query(`insert into problems(id,student_email,subject,status,accepted_bid_id,session_started_at)
      values ($1,'student@test','Physics','accepted',$1,now());
    `, [id])
    await db.query("insert into bids values ($1,$1,'tutor@test','Tutor',500,30)", [id])
    const join = async (identity = 'tutor@test:tutor') => (await db.query('select notify_tutor_joined($1,$2) ok', [id, identity])).rows[0].ok
    assert.equal(await join('other@test:tutor'), false)
    assert.equal(await join('student@test:student'), false)
    assert.equal(await join(null), false)
    await db.query('update problems set session_started_at=null where id=$1', [id])
    assert.equal(await join(), false)
    await db.query("update problems set session_started_at=now()-interval '31 minutes' where id=$1", [id])
    assert.equal(await join(), false)
    await db.query('update problems set extension_minutes=5 where id=$1', [id])
    assert.equal(await join(), true)
    assert.equal(await join(), false)
    const rows = (await db.query("select * from notifications where kind='tutor_joined'")).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].recipient_email, 'student@test')
    assert.equal(rows[0].recipient_role, 'student')
    assert.equal(rows[0].read_at, null)
    assert.match(rows[0].message, /Tutor joined your Physics session/)
    await db.exec("delete from notifications where kind='tutor_joined'")
    for (const change of ["session_ended_at=now()", "session_ended_at=null,settled_at=now()", "settled_at=null,status='open'"]) {
      await db.exec(`update problems set ${change}`)
      assert.equal(await join(), false)
    }
    const privileges = (await db.query(`select
      has_function_privilege('anon','notify_tutor_joined(uuid,text)','execute') a,
      has_function_privilege('authenticated','notify_tutor_joined(uuid,text)','execute') b,
      has_function_privilege('service_role','notify_tutor_joined(uuid,text)','execute') c`)).rows[0]
    assert.deepEqual(privileges, { a: false, b: false, c: true })
  } finally { await db.close() }
})

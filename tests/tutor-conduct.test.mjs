import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

test('conduct persists, restricts actual bookings, clears with audit and only reevaluates new reviews', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table tutor_profiles(user_email text primary key,is_available boolean default true,verification_status text default 'verified');
      create table session_payments(problem_id uuid primary key default gen_random_uuid(),tutor_email text,rating integer,review_submitted_at timestamptz);
      create table bids(id uuid primary key default gen_random_uuid(),tutor_email text,status text default 'pending');
      create table notifications(recipient_email text,recipient_role text,kind text);
      insert into tutor_profiles(user_email) values ('tutor@test'),('other@test');
    `)
    const sql = readFileSync(new URL('../supabase/migrations/202609260003_tutor_conduct.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const review = async rating => db.query("insert into session_payments(tutor_email,rating,review_submitted_at) values('tutor@test',$1,clock_timestamp())", [rating])
    const status = async () => (await db.query("select status from tutor_conduct where tutor_email='tutor@test'")).rows[0].status
    const decision = async (action, request, email = 'tutor@test') => db.query('select admin_tutor_conduct($1,$2,$3,$4,$5)', [email,action,'Evidence reviewed by administrator','admin@test',request])
    for (let i = 0; i < 4; i++) await review(1)
    assert.equal(await status(), 'clear')
    await review(1); assert.equal(await status(), 'flagged')
    await db.exec("insert into bids(tutor_email) values ('tutor@test')")
    for (let i = 0; i < 3; i++) await review(1)
    assert.equal(await status(), 'restricted')
    assert.equal((await db.query("select conduct_status from tutor_profiles where user_email='tutor@test'")).rows[0].conduct_status, 'restricted')
    await assert.rejects(db.exec("insert into bids(tutor_email) values ('tutor@test')"), /restricted/)
    await assert.rejects(db.exec("update bids set status='accepted' where tutor_email='tutor@test'"), /restricted/)
    assert.equal((await db.query('select status from bids')).rows[0].status, 'pending')
    await assert.rejects(db.exec("update tutor_profiles set is_available=true where user_email='tutor@test'"), /restricted/)
    await db.exec("insert into notifications values ('tutor@test','tutor','new_request'),('other@test','tutor','new_request'),('tutor@test','tutor','bid_accepted')")
    assert.equal((await db.query('select count(*) from notifications')).rows[0].count, 2)
    // Verification actions and good subsequent feedback cannot silently erase a restriction.
    await db.exec("update tutor_profiles set verification_status='verified' where user_email='tutor@test'")
    await review(5); assert.equal(await status(), 'restricted')
    assert.equal((await db.query("select count(*) from tutor_conduct_events where tutor_email='tutor@test'")).rows[0].count, 2)
    const request = '00000000-0000-0000-0000-000000000001'
    await decision('clear', request); await decision('clear', request)
    assert.equal(await status(), 'clear')
    assert.equal((await db.query("select count(*) from tutor_conduct_events where tutor_email='tutor@test'")).rows[0].count, 3)
    await assert.rejects(decision('restrict', request), /conflict/)
    await db.exec("update bids set status='accepted' where tutor_email='tutor@test'")
    await db.exec(sql) // Old reviewed evidence must not immediately re-restrict.
    assert.equal(await status(), 'clear')
    await review(1); assert.equal(await status(), 'clear')
    for (let i = 0; i < 4; i++) await review(1)
    assert.equal(await status(), 'flagged')
    await decision('violation', '00000000-0000-0000-0000-000000000002', 'other@test')
    await decision('violation', '00000000-0000-0000-0000-000000000002', 'other@test')
    assert.equal((await db.query("select violations from tutor_conduct where tutor_email='other@test'")).rows[0].violations, 1)
    await decision('violation', '00000000-0000-0000-0000-000000000003', 'other@test')
    assert.equal((await db.query("select status from tutor_conduct where tutor_email='other@test'")).rows[0].status, 'restricted')
    const permissions = (await db.query(`select has_function_privilege('authenticated','admin_tutor_conduct(text,text,text,text,uuid)','execute') a,
      has_table_privilege('anon','tutor_conduct','select') b,
      has_function_privilege('service_role','admin_tutor_conduct(text,text,text,text,uuid)','execute') c`)).rows[0]
    assert.deepEqual(permissions, { a: false, b: false, c: true })
  } finally { await db.close() }
})

test('conduct API restricts queue/decisions to real admin and scopes tutor reads', async () => {
  let user = null
  const calls = []
  const query = { then(resolve) { resolve({ data: [], count: 0, error: null }) } }
  for (const method of ['select','eq','in','order','range','maybeSingle']) query[method] = (...args) => { calls.push([method,...args]); return query }
  const source = readFileSync(new URL('../src/app/api/tutor/conduct/route.ts', import.meta.url), 'utf8')
  const exports = {}
  const deps = {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => user },
    '@/lib/admin-auth': { isAdminEmail: email => email === 'admin@test' },
    '@/lib/supabase': { supabaseAdmin: { from: () => query, rpc: async (...args) => { calls.push(args); return { data: {}, error: null } } } },
  }
  new Function('require','exports',ts.transpileModule(source,{ compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name],exports)
  const get = query => exports.GET(new Request('https://test/api/tutor/conduct?' + query))
  const post = body => exports.POST(new Request('https://test/api/tutor/conduct', { method: 'POST', body: JSON.stringify(body) }))
  assert.equal((await get('')).status,401)
  user={email:'tutor@test',role:'tutor'}
  assert.equal((await get('queue=1')).status,403)
  assert.equal((await get('tutorEmail=other@test')).status,403)
  assert.equal((await post({})).status,403)
  assert.equal((await get('')).status,200)
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='tutor_email'&&c[2]==='tutor@test'))
  user={email:'admin@test',role:'tutor'}; assert.equal((await post({})).status,403)
  user={email:'admin@test',role:'admin'}
  assert.equal((await post({})).status,400)
  const body={email:'tutor@test',action:'restrict',note:'Reviewed session evidence',requestId:'00000000-0000-0000-0000-000000000001',actor:'fake'}
  assert.equal((await post(body)).status,200)
  assert.equal(calls.at(-1)[1].p_actor,'admin@test')
  assert.equal((await get('queue=1&page=2')).status,200)
  assert.ok(calls.some(c=>c[0]==='range'&&c[1]===50&&c[2]===74))
})

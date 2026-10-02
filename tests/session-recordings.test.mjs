import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
import { AccessToken, WebhookReceiver, EgressInfo, EgressStatus } from 'livekit-server-sdk'
import * as livekit from 'livekit-server-sdk'

const require = createRequire(import.meta.url)
const id = '00000000-0000-0000-0000-000000000001'
const key = `sessions/${id}/00000000-0000-0000-0000-000000000002.mp4`
function module(file, dependencies) {
  const js = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => dependencies[name] ?? require(name), exports)
  return exports
}
const auth = session => ({
  'next/headers': { cookies: async () => ({ get: () => ({ value: 'cookie' }) }) },
  '@/lib/auth': { decrypt: async () => session },
  '@/lib/admin-auth': { isAdminEmail: email => email === 'admin@test' },
})

test('recording SQL protects event ordering, file ownership, retention, held payments and deletion retries', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table problems(id uuid primary key,session_ended_at timestamptz,session_started_at timestamptz,extension_minutes integer default 0,accepted_bid_id uuid);
      create table bids(id uuid primary key,duration_min integer);
      create table session_payments(problem_id uuid primary key,status text,dispute text,release_at timestamptz);
    `)
    const sql = readFileSync(new URL('../supabase/migrations/202609300004_session_recordings.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    await db.query('insert into problems(id,session_ended_at) values($1,now())', [id])
    const save = (state, version, path = key, problem = id) => db.query('select save_recording_event($1,$2,$3,$4,$5)', ['egress1', problem, path, state, version])
    const row = async () => (await db.query("select * from session_recordings where egress_id='egress1'")).rows[0]
    const claim = async () => (await db.query("select claim_recording_deletion('egress1') value")).rows[0].value
    await save('recording', 10)
    await save('starting', 9)
    assert.equal((await row()).state, 'recording')
    await save('ready', 20)
    await save('processing', 20)
    await save('recording', 30)
    assert.equal((await row()).state, 'ready')
    await assert.rejects(save('ready', 21, 'sessions/other/file.mp4'), /Invalid recording key/)
    await assert.rejects(save('ready', 21, null), /no file/)
    await assert.rejects(save('ready', 0), /Invalid recording event/)
    assert.equal(await claim(), null)
    await db.query("insert into session_payments values($1,'pending',null,now())", [id])
    assert.equal((await db.query("select round(extract(epoch from release_at-now())) seconds from session_payments")).rows[0].seconds, '1200')
    assert.equal(await claim(), null)
    await db.query("update session_payments set status='held',dispute='Bad explanation' where problem_id=$1", [id])
    await db.query("update problems set session_ended_at=now()-interval '21 minutes' where id=$1", [id])
    await db.query("update session_payments set release_at=now()-interval '1 minute' where problem_id=$1", [id])
    assert.equal(await claim(), null)
    assert.equal((await db.query('select * from recording_cleanup_candidates(50)')).rows.length, 0)
    await db.query("update session_payments set status='refunded' where problem_id=$1", [id])
    assert.equal((await db.query('select * from recording_cleanup_candidates(50)')).rows.length, 1)
    assert.equal(await claim(), key)
    assert.equal(await claim(), key) // storage delete/DB acknowledgement retries are safe
    await save('ready', 99)
    assert.equal((await row()).state, 'deleting')
    await assert.rejects(db.query("update session_payments set dispute='New dispute',status='held' where problem_id=$1", [id]), /window has closed/)
    await db.exec("update session_recordings set state='deleted'")
    assert.equal(await claim(), null)
    const privileges = (await db.query("select has_table_privilege('authenticated','session_recordings','select') read,has_function_privilege('anon','claim_recording_deletion(text)','execute') delete,has_function_privilege('service_role','save_recording_event(text,uuid,text,text,bigint)','execute') save")).rows[0]
    assert.deepEqual(privileges, { read: false, delete: false, save: true })
  } finally { await db.close() }
})

test('admin playback rejects every non-admin, scopes recording to session and never signs a deleted or unsafe path', async () => {
  const filters = [], signed = []
  let state = 'ready', path = key
  const query = {
    select() { return this }, eq(...args) { filters.push(args); return this },
    maybeSingle: async () => ({ data: { state, object_key: path } }),
  }
  const dependencies = {
    '@/lib/supabase': { supabaseAdmin: { from: () => query } },
    '@/lib/recordings': { validRecordingKey: (problem, value) => value === key && problem === id, recordingPlayback: async value => { signed.push(value); return 'https://storage.test/private' } },
  }
  const req = () => new Request(`https://app.test/api/admin/recordings?problemId=${id}&egressId=egress1`)
  for (const session of [null, { email: 'student@test', role: 'student' }, { email: 'tutor@test', role: 'tutor' }, { email: 'admin@test', role: 'student' }, { email: 'other@test', role: 'admin' }]) {
    const api = module('src/app/api/admin/recordings/route.ts', { ...dependencies, ...auth(session) })
    assert.equal((await api.GET(req())).status, 403)
  }
  assert.equal(filters.length, 0)
  const api = module('src/app/api/admin/recordings/route.ts', { ...dependencies, ...auth({ email: 'admin@test', role: 'admin' }) })
  const response = await api.GET(req())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(filters, [['problem_id', id], ['egress_id', 'egress1']])
  for (state of ['starting', 'processing', 'deleted', 'failed', 'deleting']) assert.equal((await api.GET(req())).status, 409)
  state = 'ready'; path = '../unrelated.mp4'
  assert.equal((await api.GET(req())).status, 503)
  assert.equal(signed.length, 1)
})

test('signed egress webhooks save state; invalid signatures do not, and storage failures request retry', async () => {
  const before = { key: process.env.LIVEKIT_API_KEY, secret: process.env.LIVEKIT_API_SECRET }
  process.env.LIVEKIT_API_KEY = 'testkey'
  process.env.LIVEKIT_API_SECRET = 'testing-only-long-secret'
  let saves = 0, fail = false
  try {
    const api = module('src/app/api/livekit/webhook/route.ts', {
      'livekit-server-sdk': { WebhookReceiver }, '@/lib/supabase': {}, '@/lib/account-access': {},
      '@/lib/recordings': { saveEgress: async info => { assert.equal(info.egressId, 'egress1'); saves++; if (fail) throw new Error('offline') } },
    })
    const text = JSON.stringify({ event: 'egress_ended', egressInfo: { egressId: 'egress1', roomName: `session-${id}`, status: 'EGRESS_COMPLETE' } })
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
    token.sha256 = createHash('sha256').update(text).digest('base64')
    const jwt = await token.toJwt()
    const request = authorization => new Request('https://app.test/api/livekit/webhook', { method: 'POST', body: text, headers: { authorization } })
    assert.equal((await api.POST(request('invalid'))).status, 401)
    assert.equal(saves, 0)
    assert.equal((await api.POST(request(jwt))).status, 204)
    fail = true
    assert.equal((await api.POST(request(jwt))).status, 503)
    assert.equal(saves, 2)
  } finally {
    for (const [name, value] of [['LIVEKIT_API_KEY', before.key], ['LIVEKIT_API_SECRET', before.secret]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value
    }
  }
})

test('recording helper keeps nanosecond event precision and rejects foreign storage paths', async () => {
  const calls = []
  const api = module('src/lib/recordings.ts', { '@/lib/supabase': { supabaseAdmin: { rpc: async (...args) => { calls.push(args); return {} } } } })
  const info = new EgressInfo({ egressId: 'egress1', roomName: `session-${id}`, status: EgressStatus.EGRESS_COMPLETE, updatedAt: BigInt('1800000000000000001'), fileResults: [{ filename: key }] })
  await api.saveEgress(info)
  assert.equal(calls[0][1].p_version, '1800000000000000001')
  assert.equal(calls[0][1].p_state, 'ready')
  info.fileResults[0].filename = 'sessions/foreign/video.mp4'
  await assert.rejects(api.saveEgress(info), /Unexpected recording path/)
  assert.equal(calls.length, 1)
})

test('maintenance requires its dedicated bearer secret before any database or storage work', async () => {
  const old = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'test-cron-secret'
  const calls = []
  const api = module('src/app/api/cron/recordings/route.ts', {
    '@/lib/recordings': { maintainRecordings: async () => { calls.push('maintenance'); return { failures: [] } } },
    '@/lib/supabase': { supabaseAdmin: { rpc: async () => { calls.push('settlement'); return {} } } },
  })
  try {
    for (const token of ['', 'Bearer wrong', 'test-cron-secret']) assert.equal((await api.GET(new Request('https://app.test/api/cron/recordings', { headers: { authorization: token } }))).status, 401)
    assert.deepEqual(calls, [])
    assert.equal((await api.GET(new Request('https://app.test/api/cron/recordings', { headers: { authorization: 'Bearer test-cron-secret' } }))).status, 200)
    assert.deepEqual(calls, ['settlement', 'maintenance'])
  } finally { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old }
})

test('auto recording is configured once before joining and disabled mode needs no storage credentials', async () => {
  const names = ['RECORDING_ENABLED','R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','CRON_SECRET','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','NEXT_PUBLIC_LIVEKIT_URL']
  const before = Object.fromEntries(names.map(name => [name,process.env[name]]))
  const created = []
  let rooms = [], dbCalls = 0
  class RoomServiceClient {
    async listRooms() { return rooms }
    async createRoom(options) { created.push(options); rooms = [{ metadata: options.metadata }] }
  }
  const api = module('src/lib/recordings.ts', {
    'livekit-server-sdk': { ...livekit, RoomServiceClient },
    '@/lib/supabase': { supabaseAdmin: { from: () => { dbCalls++; return { select: () => ({ limit: async () => ({}) }) } } } },
  })
  try {
    process.env.RECORDING_ENABLED = 'false'
    await api.prepareRecordingRoom(`session-${id}`)
    assert.equal(dbCalls, 0)
    Object.assign(process.env, { RECORDING_ENABLED: 'true', R2_ENDPOINT: 'https://test.r2.cloudflarestorage.com', R2_BUCKET: 'private', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', CRON_SECRET: 'cron-secret', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret', NEXT_PUBLIC_LIVEKIT_URL: 'wss://test.livekit.cloud' })
    await api.prepareRecordingRoom(`session-${id}`)
    await api.prepareRecordingRoom(`session-${id}`)
    assert.equal(created.length, 1)
    const recording = created[0].egress.room
    assert.equal(recording.roomName, `session-${id}`)
    assert.equal(recording.fileOutputs[0].output.value.bucket, 'private')
    assert.equal(recording.fileOutputs[0].disableManifest, true)
    assert.equal(api.validRecordingKey(id, recording.fileOutputs[0].filepath), true)
    rooms = [{ metadata: '' }]
    await assert.rejects(api.prepareRecordingRoom(`session-${id}`), /before recording was enabled/)
  } finally {
    for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name] }
  }
})

test('maintenance keeps reconciling independently and does not stop a concurrently extended room', async () => {
  const names = ['LIVEKIT_API_KEY','LIVEKIT_API_SECRET','NEXT_PUBLIC_LIVEKIT_URL']
  const before = Object.fromEntries(names.map(name => [name,process.env[name]]))
  const filters = [], closed = []
  class EgressClient { async listEgress() { throw new Error('Temporary egress outage') } }
  class RoomServiceClient {
    async listRooms() { return [{name:`session-${id}`} ] }
    async deleteRoom(name) { closed.push(name) }
  }
  const api = module('src/lib/recordings.ts', {
    'livekit-server-sdk': { ...livekit, EgressClient, RoomServiceClient },
    '@/lib/supabase': { supabaseAdmin: {
      rpc: async name => { assert.equal(name,'recording_cleanup_candidates'); return {data:[]} },
      from: table => {
        let updating = false
        const query = {
          select() { return this }, eq(...args) { filters.push(args); return this }, is() { return this },
          update() { updating = true; return this },
          single: async () => ({ data: table === 'bids' ? { duration_min: 30 } : { status: 'accepted', session_started_at: new Date(Date.now()-31*60000).toISOString(), extension_minutes: 0, accepted_bid_id: id } }),
          then(resolve) { assert.equal(updating,true); resolve({data:[]}) }, // extension won compare-and-set
        }
        return query
      },
    } },
  })
  try {
    Object.assign(process.env,{LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret',NEXT_PUBLIC_LIVEKIT_URL:'wss://test.livekit.cloud'})
    const result = await api.maintainRecordings()
    assert.deepEqual(result.failures,['list-egress'])
    assert.deepEqual(closed,[])
    assert.ok(filters.some(([name,value]) => name === 'extension_minutes' && value === 0))
  } finally { for (const name of names) { if (before[name] === undefined) delete process.env[name]; else process.env[name] = before[name] } }
})

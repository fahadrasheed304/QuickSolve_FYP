import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const require = createRequire(import.meta.url)
function moduleAt(file, dependencies) {
  const js = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => dependencies[name] ?? require(name), exports)
  return exports
}

test('notification triggers target relevant available tutors and the problem owner, atomically and without duplicates', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table tutor_profiles(user_email text, subjects text[], verification_status text, verification_stage text, is_available boolean);
      create table problems(id uuid primary key default gen_random_uuid(),student_email text,subject text,duration_min integer,offer_price numeric,status text default 'open',accepted_bid_id uuid);
      create table bids(id uuid primary key default gen_random_uuid(),problem_id uuid references problems(id),tutor_email text,tutor_name text,price numeric);
      insert into tutor_profiles values
        ('physics@test',array['Physics'],'verified','verified',true),
        ('offline@test',array['Physics'],'verified','verified',false),
        ('math@test',array['Math'],'verified','verified',true),
        ('pending@test',array['Physics'],'pending','submitted',true),
        ('empty@test',array[]::text[],'verified','verified',true),
        ('student@test',array['Physics'],'verified','verified',true);
    `)
    const sql = readFileSync(new URL('../supabase/migrations/202609250003_realtime_notifications.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const problem = (await db.query("insert into problems(student_email,subject,duration_min,offer_price) values ('student@test','Physics',30,500) returning id")).rows[0].id
    let rows = (await db.query('select * from notifications')).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].recipient_email, 'physics@test')
    assert.equal(rows[0].kind, 'new_request')
    const bid = (await db.query("insert into bids(problem_id,tutor_email,tutor_name,price) values ($1,'physics@test','Physics Tutor',400) returning id", [problem])).rows[0].id
    rows = (await db.query("select * from notifications where kind='new_bid'")).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].recipient_email, 'student@test')
    assert.equal(rows[0].recipient_role, 'student')
    await db.query("update problems set status='accepted',accepted_bid_id=$2 where id=$1", [problem, bid])
    await db.query("update problems set status='accepted' where id=$1", [problem])
    rows = (await db.query("select * from notifications where kind='bid_accepted'")).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].recipient_email, 'physics@test')
    assert.equal((await db.query("select count(*) from notifications where kind in ('new_request','new_bid') and read_at is null")).rows[0].count, 0)
    // Source rollback must also roll back its notification.
    await db.exec('begin')
    await db.query("insert into problems(student_email,subject,duration_min,offer_price) values ('student@test','Physics',30,500)")
    await db.exec('rollback')
    assert.equal((await db.query('select count(*) from notifications')).rows[0].count, 3)
    const privileges = (await db.query("select has_table_privilege('anon','notifications','select') a,has_table_privilege('authenticated','notifications','insert') b,has_table_privilege('service_role','notifications','select') c")).rows[0]
    assert.deepEqual(privileges, { a: false, b: false, c: true })
  } finally { await db.close() }
})

test('notification API scopes reads and mark-read updates to authenticated email and role', async () => {
  const calls = []
  let account = { email: 'owner@test', role: 'student' }
  const query = { then(resolve) { resolve({ data: [], error: null }) } }
  for (const method of ['select', 'eq', 'order', 'limit', 'update', 'in', 'is']) query[method] = (...args) => { calls.push([method, ...args]); return query }
  const api = moduleAt('src/app/api/notifications/route.ts', {
    '@/lib/notification-auth': { notificationAccount: async () => account },
    '@/lib/supabase': { supabaseAdmin: { from: () => query } },
  })
  assert.equal((await api.GET()).status, 200)
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'recipient_email', 'owner@test'])))
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'recipient_role', 'student'])))
  calls.length = 0
  const request = body => new Request('https://test/api/notifications', { method: 'PATCH', body: JSON.stringify(body) })
  assert.equal((await api.PATCH(request({ ids: ['bad'] }))).status, 400)
  assert.equal(calls.length, 0)
  const id = '00000000-0000-0000-0000-000000000001'
  assert.equal((await api.PATCH(request({ ids: [id], email: 'victim@test', role: 'tutor' }))).status, 200)
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'recipient_email', 'owner@test'])))
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'recipient_role', 'student'])))
  account = null
  assert.equal((await api.GET()).status, 401)
  assert.equal((await api.PATCH(request({ ids: [id] }))).status, 401)
})

test('live stream waits for subscription, filters both account and role, and closes its channel on disconnect', async () => {
  let callback, subscribed, filter
  let removed = 0
  const channel = {
    on(_type, options, cb) { filter = options; callback = cb; return this },
    subscribe(cb) { subscribed = cb; return this },
  }
  const api = moduleAt('src/app/api/notifications/stream/route.ts', {
    '@/lib/notification-auth': { notificationAccount: async () => ({ email: 'owner@test', role: 'student', expiresAt: Date.now() + 60000 }) },
    '@/lib/supabase': { supabaseAdmin: {
      from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }),
      channel: () => channel, removeChannel: async () => { removed++ },
    } },
  })
  const abort = new AbortController()
  const response = await api.GET(new Request('https://test/api/notifications/stream', { signal: abort.signal }))
  assert.equal(response.headers.get('content-type'), 'text/event-stream')
  assert.equal(filter.filter, 'recipient_email=eq.owner@test')
  const reader = response.body.getReader()
  subscribed('SUBSCRIBED')
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/)
  callback({ new: { recipient_email: 'victim@test', recipient_role: 'student' } })
  callback({ new: { recipient_email: 'owner@test', recipient_role: 'tutor' } })
  callback({ new: { recipient_email: 'owner@test', recipient_role: 'student' } })
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: changed/)
  abort.abort()
  assert.equal((await reader.read()).done, true)
  assert.equal(removed, 1)
})

test('client recovers missed notifications on reconnect without repeating toasts and clears private data on cleanup', async () => {
  const originals = { fetch: globalThis.fetch, window: globalThis.window, EventSource: globalThis.EventSource }
  let cleanup, source, state = {}, notifications = []
  const toasts = []
  let refreshes = 0
  const events = new EventTarget()
  events.setInterval = () => 1
  events.clearInterval = () => {}
  events.addEventListener('quicksolve:notification-refresh', () => refreshes++)
  globalThis.window = events
  globalThis.fetch = async () => Response.json({ notifications })
  const sources = []
  globalThis.EventSource = class extends EventTarget {
    constructor() { super(); sources.push(this) }
    close() { this.closed = true }
  }
  const store = {
    setState(update) { state = { ...state, ...(typeof update === 'function' ? update(state) : update) } },
    getState() { return state },
  }
  const item = id => ({ id, kind: 'new_bid', message: id, read_at: null })
  const flush = () => new Promise(resolve => setImmediate(resolve))
  try {
    const { useNotifications } = moduleAt('src/hooks/use-notifications.ts', {
      react: { useEffect: effect => { cleanup = effect() } },
      'react-toastify': { toast: { info: (...args) => toasts.push(args) } },
      '@/stores/notifications-store': { useNotificationsStore: store },
    })
    notifications = [item('old')]
    useNotifications('owner@test', 'student')
    source = sources[0]
    await flush()
    assert.equal(toasts.length, 0) // Initial history is not new activity.
    source.dispatchEvent(new Event('ready'))
    await flush()
    notifications = [item('new'), item('old')]
    source.dispatchEvent(new Event('changed'))
    source.dispatchEvent(new Event('changed'))
    await flush()
    assert.equal(toasts.length, 1)
    source.onerror()
    assert.equal(state.connected, false)
    notifications = [item('missed'), item('new'), item('old')]
    source.dispatchEvent(new Event('ready'))
    await flush()
    assert.equal(state.connected, true)
    assert.equal(toasts.length, 2)
    assert.equal(state.items[0].id, 'missed')
    assert.ok(refreshes >= 3)
    cleanup()
    assert.equal(source.closed, true)
    assert.deepEqual(state.items, [])
    assert.equal(state.account, null)
  } finally {
    cleanup?.()
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})

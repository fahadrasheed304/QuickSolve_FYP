import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
const require = createRequire(import.meta.url)
function route(file, dependencies) {
  const js = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => dependencies[name] ?? require(name), exports)
  return exports
}

test('wallet SQL totals all records, isolates roles and pages tied timestamps without skipping older transactions', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table role_wallets(user_email text,role text,balance numeric);
      create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_email text,user_role text,type text,amount numeric,method text,description text,status text,payment_reference text,created_at timestamptz);
      create table session_payments(problem_id uuid default gen_random_uuid(),tutor_email text,amount numeric,status text,release_at timestamptz);
      insert into role_wallets values ('tutor@test','tutor',610.61),('tutor@test','student',9000),('other@test','tutor',8000),('empty@test','tutor',0);
      insert into wallet_transactions(user_email,user_role,type,amount,method,status,payment_reference,created_at)
      select 'tutor@test','tutor','credit',10.01,'Session','completed','session-payout:'||n,'2026-09-26T12:00:00.123456Z' from generate_series(1,61) n;
      insert into wallet_transactions(user_email,user_role,type,amount,method,status,payment_reference,created_at) values
      ('tutor@test','student','credit',9999,'Session','completed','session-payout:student','2026-09-26'),
      ('other@test','tutor','credit',9999,'Session','completed','session-payout:other','2026-09-26'),
      ('tutor@test','tutor','credit',100,'Adjustment','completed','adjustment:one','2026-09-25'),
      ('tutor@test','tutor','debit',5.55,'Adjustment','completed','adjustment:two','2026-09-25'),
      ('tutor@test','tutor','credit',500,'Session','pending','session-payout:pending','2026-09-25');
      insert into session_payments(tutor_email,amount,status) values ('tutor@test',123.45,'pending'),('tutor@test',67.89,'held'),('tutor@test',500,'refunded'),('other@test',9999,'held');
    `)
    const migration = readFileSync(new URL('../supabase/migrations/202609260002_tutor_wallet_history.sql', import.meta.url), 'utf8')
    await db.exec(migration); await db.exec(migration)
    const get = async ({ email = 'tutor@test', type = 'all', from = null, until = null, cursor = null, limit = 25 } = {}) =>
      (await db.query('select get_tutor_wallet_history($1,$2,$3,$4,$5,$6,$7) result', [email,type,from,until,cursor?.date || null,cursor?.id || null,limit])).rows[0].result
    const first = await get()
    assert.equal(first.balance, 610.61)
    assert.equal(first.earnings, 610.61)
    assert.equal(first.filteredCredits, 710.61)
    assert.equal(first.filteredDebits, 5.55)
    assert.equal(first.filteredCount, 64)
    assert.equal(first.pending, 123.45)
    assert.equal(first.held, 67.89)
    assert.equal(first.transactions.length, 25)
    assert.match(first.nextCursor.date, /123456/)
    const ids = first.transactions.map(row => row.id)
    // A newer credit arriving between requests must not shift older pages.
    await db.exec("insert into wallet_transactions(user_email,user_role,type,amount,status,created_at) values ('tutor@test','tutor','credit',1,'completed','2026-09-27')")
    let cursor = first.nextCursor
    while (cursor) { const next = await get({ cursor }); ids.push(...next.transactions.map(row => row.id)); cursor = next.nextCursor }
    assert.equal(ids.length, 64)
    assert.equal(new Set(ids).size, 64)
    const filtered = await get({ from: '2026-09-26', until: '2026-09-27' })
    assert.equal(filtered.filteredCount, 61)
    assert.equal(filtered.filteredCredits, 610.61)
    const debit = await get({ type: 'debit' })
    assert.equal(debit.transactions.length, 1)
    assert.equal(debit.filteredDebits, 5.55)
    assert.equal(debit.nextCursor, null)
    assert.equal((await get({ email: 'empty@test' })).balance, 0)
    assert.equal((await get({ email: 'missing@test' })).balance, null)
    await assert.rejects(get({ type: 'invalid' }))
    await assert.rejects(get({ limit: 101 }))
    const privileges = (await db.query(`select has_function_privilege('anon','get_tutor_wallet_history(text,text,timestamptz,timestamptz,timestamptz,uuid,integer)','execute') a,
      has_function_privilege('authenticated','get_tutor_wallet_history(text,text,timestamptz,timestamptz,timestamptz,uuid,integer)','execute') b,
      has_function_privilege('service_role','get_tutor_wallet_history(text,text,timestamptz,timestamptz,timestamptz,uuid,integer)','execute') c`)).rows[0]
    assert.deepEqual(privileges, { a: false, b: false, c: true })
  } finally { await db.close() }
})

test('tutor wallet validates filters and uses authenticated identity, never browser identity', async () => {
  let session = { email: 'Tutor@Test', role: 'tutor' }, fail = false, balance = 0
  const calls = []
  const api = route('src/app/api/tutor/wallet/route.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/supabase': { supabaseAdmin: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { balance }, error: fail ? {} : null } } } },
  })
  const get = query => api.GET(new Request('https://test/api/tutor/wallet?' + query))
  for (const query of ['type=invalid','from=2026-02-30','from=2026-09-27&to=2026-09-26','cursor=null','cursor=%7B%7D']) assert.equal((await get(query)).status, 400)
  assert.equal(calls.length, 0)
  const response = await get('email=other@test&role=student&from=2026-09-26&to=2026-09-26')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(calls[0].args.p_email, 'tutor@test')
  assert.equal(calls[0].args.p_until, '2026-09-27T00:00:00.000Z')
  fail = true; assert.equal((await get('')).status, 503)
  fail = false; balance = null; assert.equal((await get('')).status, 404)
  session = { email: 'student@test', role: 'student' }; assert.equal((await get('')).status, 401)
  session = null; assert.equal((await get('')).status, 401)
})

test('payment history supports pages beyond 50, account scoping, statuses and failures', async () => {
  let session = { email: 'tutor@test', role: 'tutor' }, fail = false
  const calls = []
  const query = { then(resolve) { resolve({ data: [], count: 80, error: fail ? {} : null }) } }
  for (const method of ['select','eq','order','range']) query[method] = (...args) => { calls.push([method,...args]); return query }
  const api = route('src/app/api/sessions/payments/route.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/supabase': { supabaseAdmin: { from: () => query } },
  })
  const get = params => api.GET(new Request('https://test/api/sessions/payments?' + params))
  assert.equal((await get('page=-1')).status, 400)
  assert.equal((await get('status=invalid')).status, 400)
  assert.equal((await get('page=2&status=released')).status, 200)
  assert.ok(calls.some(call => call[0] === 'range' && call[1] === 50 && call[2] === 74))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'tutor_email' && call[2] === 'tutor@test'))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'status' && call[2] === 'released'))
  calls.length = 0
  session = { email: 'student@test', role: 'student' }
  assert.equal((await get('')).status, 200)
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'student_email' && call[2] === 'student@test'))
  fail = true; assert.equal((await get('')).status, 503)
  session = null; assert.equal((await get('')).status, 401)
})

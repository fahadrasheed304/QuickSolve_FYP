import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('dual-role accounts appear once in both role filters with accurate totals', async () => {
  const rows = {
    users: [{ id: '1', email: 'dual@test', role: 'tutor' }, { id: '2', email: 'student@test', role: 'student' }],
    role_wallets: [{ user_email: 'dual@test', role: 'student' }, { user_email: 'dual@test', role: 'tutor' }],
    tutor_profiles: [{ user_email: 'dual@test' }],
  }
  const deps = {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => ({ role: 'admin', email: 'admin@test' }) },
    '@/lib/admin-auth': { isAdminEmail: () => true },
    '@/lib/supabase': { supabaseAdmin: { from(table) {
      const query = { then(resolve) { resolve({ data: rows[table], error: null }) } }
      for (const method of ['select','order','range','in','limit']) query[method] = () => query
      return query
    } } },
  }
  const exports = {}
  const source = readFileSync(new URL('../src/app/api/admin/users/route.ts', import.meta.url), 'utf8')
  new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name],exports)
  for (const [role, count] of [['all',2], ['student',2], ['tutor',1]]) {
    const response = await exports.GET(new Request(`https://test/api/admin/users?role=${role}`))
    const body = await response.json()
    assert.equal(body.count,count)
    assert.deepEqual(body.users[0].roles,['student','tutor'])
    assert.equal(body.users.filter(user => user.email === 'dual@test').length,1)
  }
  const response = await exports.GET(new Request('https://test/api/admin/users?role=student&page=1'))
  assert.deepEqual(await response.json(),{users:[],count:2})
})

test('user management enforces admin access, bounded searches and read-only access', async () => {
  let session = null
  let result = { data: [], count: 0, error: null }
  const calls = []
  const query = { then(resolve) { resolve(result) } }
  for (const method of ['select', 'eq', 'in', 'or', 'order', 'range', 'update', 'maybeSingle', 'limit']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query }
  }
  const deps = {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/admin-auth': { isAdminEmail: email => email.trim().toLowerCase() === 'admin@test' },
    '@/lib/supabase': { supabaseAdmin: { from: () => query } },
  }
  const source = readFileSync(new URL('../src/app/api/admin/users/route.ts', import.meta.url), 'utf8')
  const exports = {}
  new Function('require', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => deps[name], exports)
  const get = (params = '') => exports.GET(new Request('https://test/api/admin/users?' + params))
  assert.equal(exports.PATCH, undefined)
  assert.equal((await get()).status, 401)
  for (const user of [{ email: 'student@test', role: 'student' }, { email: 'admin@test', role: 'tutor' }, { email: 'fake@test', role: 'admin' }]) {
    session = user
    assert.equal((await get()).status, 403)
  }
  assert.equal(calls.length, 0)
  session = { email: 'admin@test', role: 'admin' }
  for (const params of ['page=-1', 'page=1.5', 'role=owner', 'search=a%2Cb', 'search=%25']) assert.equal((await get(params)).status, 400)
  assert.equal((await get('page=2&role=student&search=Ali')).status, 200)
  assert.ok(calls.filter(call => call[0] === 'select').every(call => !call[1].includes('password') && !call[1].includes('*')))
  result = { data: null, error: { message: 'private database detail' } }
  const failed = await get()
  assert.equal(failed.status, 503)
  assert.ok(!(await failed.text()).includes('private database detail'))
})

test('detail reads are admin-only, role histories are separate and failures are explicit', async () => {
  let session = null
  let fail = false
  const calls = []
  const user = { id: 'u1', email: 'person@test', role: 'student', fullname: 'Person' }
  const db = { from(table) {
    const query = { then(resolve) { resolve(table === 'users' ? { data: user, error: null } : table === 'tutor_profiles' ? { data: null, error: null } : { data: [], error: fail && table === 'session_payments' ? { message: 'private error' } : null }) } }
    for (const method of ['select','eq','order','range','maybeSingle','in']) query[method] = (...args) => { calls.push([table, method, ...args]); return query }
    return query
  } }
  const deps = {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/admin-auth': { isAdminEmail: email => email === 'admin@test' },
    '@/lib/supabase': { supabaseAdmin: db },
  }
  const source = readFileSync(new URL('../src/app/api/admin/users/detail/route.ts', import.meta.url), 'utf8')
  const exports = {}
  new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name],exports)
  const get = () => exports.GET(new Request('https://test/api/admin/users/detail?email=person@test'))
  assert.equal((await get()).status,401)
  session = { role: 'student', email: 'person@test' }
  assert.equal((await get()).status,403)
  assert.equal(calls.length,0)
  session = { role: 'admin', email: 'admin@test' }
  let response = await get()
  assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'no-store')
  let body = await response.json()
  assert.deepEqual(body.studentSessions,[])
  assert.deepEqual(body.tutorSessions,[])
  assert.ok(calls.some(call => call[0] === 'session_payments' && call[1] === 'eq' && call[2] === 'student_email'))
  assert.ok(calls.some(call => call[0] === 'session_payments' && call[1] === 'eq' && call[2] === 'tutor_email'))
  assert.ok(calls.filter(call => call[1] === 'select').every(call => !call[2].includes('*') && !call[2].includes('password')))
  fail = true
  response = await get(); body = await response.json()
  assert.equal(body.studentPayments,null)
  assert.ok(body.warnings.includes('Student payments'))
  assert.ok(!JSON.stringify(body).includes('private error'))
})

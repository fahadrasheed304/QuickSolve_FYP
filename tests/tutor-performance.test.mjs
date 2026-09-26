import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function moduleAt(path, dependencies = {}) {
  const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => dependencies[name], exports)
  return exports
}
const { evaluateTutorPerformance: evaluate } = moduleAt('src/lib/tutor-performance.ts')
const rows = (rating, count = 5, status = 'released') => Array.from({ length: count }, (_, index) => ({ problem_id: String(index), rating, status, feedback: '', dispute: null }))

test('performance requires evidence, ignores unrated sessions, and improves after new outcomes', () => {
  assert.equal(evaluate([]).status, 'Not enough feedback')
  assert.equal(evaluate(rows(1, 4)).status, 'Not enough feedback')
  assert.equal(evaluate(rows(3)).status, 'Needs attention')
  assert.equal(evaluate(rows(4)).status, 'Good standing')
  assert.equal(evaluate(rows(5)).status, 'Excellent')
  const mixed = evaluate([...rows(5), ...rows(0, 10, 'pending')])
  assert.equal(mixed.average, 5)
  assert.equal(mixed.reviews, 5)
  assert.equal(mixed.pending, 10)
  assert.equal(evaluate([...rows(3), ...rows(5, 15)]).status, 'Excellent')
  assert.equal(evaluate([...rows(3, 5), ...rows(4, 5)]).status, 'Good standing')
})

test('refund outcomes use resolved payments; pending disputes alone do not imply poor performance', () => {
  const held = rows(0, 5, 'held').map(row => ({ ...row, dispute: 'Review requested' }))
  assert.equal(evaluate(held).status, 'Not enough feedback')
  assert.equal(evaluate([...rows(5), ...held]).status, 'Good standing')
  assert.equal(evaluate([...rows(0, 3), ...rows(0, 2, 'refunded')]).status, 'Needs attention')
  assert.equal(evaluate(rows(0, 4, 'refunded')).status, 'Not enough feedback')
  assert.equal(evaluate([...rows(5, 7), ...rows(5, 3, 'refunded')]).status, 'Needs attention')
  assert.equal(evaluate([...rows(5, 8), ...rows(5, 2, 'refunded')]).status, 'Good standing')
  const feedback = evaluate(rows(4, 8).map(row => ({ ...row, feedback: 'Helpful explanation' }))).feedback
  assert.equal(feedback.length, 5)
})

test('performance API isolates tutors, allows authorized admins, orders the window and reports database failure', async () => {
  let session = null, failure = false
  const calls = []
  const query = { then(resolve) { resolve({ data: rows(5), error: failure ? {} : null }) } }
  for (const method of ['select', 'eq', 'order', 'limit']) query[method] = (...args) => { calls.push([method, ...args]); return query }
  const { GET } = moduleAt('src/app/api/tutor/performance/route.ts', {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'token' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/admin-auth': { isAdminEmail: email => email === 'admin@test' },
    '@/lib/supabase': { supabaseAdmin: { from: () => query } },
    '@/lib/tutor-performance': { evaluateTutorPerformance: evaluate },
  })
  const request = email => new Request('https://test/api/tutor/performance' + (email ? '?tutorEmail=' + email : ''))
  assert.equal((await GET(request())).status, 401)
  session = { role: 'student', email: 'student@test' }
  assert.equal((await GET(request())).status, 403)
  session = { role: 'tutor', email: 'tutor@test' }
  assert.equal((await GET(request('other@test'))).status, 403)
  assert.equal(calls.length, 0)
  const response = await GET(request())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.json()).performance.status, 'Excellent')
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'tutor_email', 'tutor@test'])))
  assert.ok(calls.some(call => call[0] === 'limit' && call[1] === 20))
  assert.ok(calls.some(call => call[0] === 'order' && call[1] === 'release_at' && call[2].ascending === false))
  session = { role: 'admin', email: 'unauthorized@test' }
  assert.equal((await GET(request('other@test'))).status, 403)
  session = { role: 'admin', email: 'admin@test' }
  assert.equal((await GET(request())).status, 400)
  calls.length = 0
  assert.equal((await GET(request('other@test'))).status, 200)
  assert.ok(calls.some(call => call[0] === 'eq' && call[2] === 'other@test'))
  failure = true
  assert.equal((await GET(request('other@test'))).status, 503)
})

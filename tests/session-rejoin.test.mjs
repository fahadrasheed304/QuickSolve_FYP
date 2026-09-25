import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)
function setup(session, result) {
  const filters = []
  const query = {}
  for (const method of ['select', 'eq', 'is']) query[method] = (...args) => { filters.push([method, ...args]); return query }
  query.order = async () => result
  const dependencies = {
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'cookie' }) }) },
    '@/lib/auth': { decrypt: async () => session },
    '@/lib/supabase': { supabaseAdmin: { from: () => query } },
  }
  const source = readFileSync(new URL('../src/app/api/student/active-sessions/route.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const api = {}
  new Function('require', 'exports', js)(name => dependencies[name] ?? require(name), api)
  return { api, filters }
}

test('rejoin discovers ongoing sessions from the authenticated account without browser state', async () => {
  const bid = { problem_id: 'problem-1', tutor_name: 'Tutor', price: 400, duration_min: 30,
    problems: { subject: 'Math', class: '10', session_started_at: new Date().toISOString() } }
  const { api, filters } = setup({ email: ' Student@Example.test ', role: 'student' }, { data: [bid,
    { ...bid, problem_id: 'expired', problems: { ...bid.problems, session_started_at: '2020-01-01T00:00:00Z' } },
    { ...bid, problem_id: 'not-started', problems: [{ ...bid.problems, session_started_at: null }] },
    { ...bid, problem_id: 'extended', problems: { ...bid.problems, session_started_at: new Date(Date.now()-35*60000).toISOString(), extension_minutes: 10 } },
    { ...bid, problem_id: 'ended', problems: { ...bid.problems, session_ended_at: new Date().toISOString() } },
  ] })
  const response = await api.GET()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const { sessions, pendingReviews } = await response.json()
  assert.deepEqual(sessions.map(session => session.roomName), ['session-problem-1', 'session-not-started', 'session-extended'])
  assert.deepEqual(pendingReviews.map(session => session.roomName), ['session-expired', 'session-ended'])
  assert.ok(pendingReviews.every(session => session.needsReview))
  assert.ok(filters.some(filter => JSON.stringify(filter) === JSON.stringify(['eq', 'problems.student_email', 'student@example.test'])))
  for (const filter of [['eq', 'status', 'accepted'], ['eq', 'problems.status', 'accepted'], ['is', 'problems.settled_at', null]]) {
    assert.ok(filters.some(actual => JSON.stringify(actual) === JSON.stringify(filter)))
  }
})

test('rejoin rejects unauthenticated users and tutors', async () => {
  for (const session of [null, { email: 'tutor@example.test', role: 'tutor' }]) {
    const { api, filters } = setup(session, { data: [] })
    assert.equal((await api.GET()).status, 401)
    assert.equal(filters.length, 0)
  }
})

test('rejoin reports database failures rather than pretending no session exists', async () => {
  const { api } = setup({ email: 'student@example.test', role: 'student' }, { error: new Error('offline') })
  assert.equal((await api.GET()).status, 503)
})

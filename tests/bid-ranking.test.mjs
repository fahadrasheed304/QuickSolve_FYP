import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
function moduleAt(path, deps = {}) {
  const js = ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require','exports',js)(name => deps[name], exports)
  return exports
}
const ranking = moduleAt('src/lib/bid-ranking.ts')
const baseline = { rating: null, reviews: 0, released: 0, refunded: 0, testPassed: false, testScore: null }
test('ranking combines live ratings, outcomes and valid test results without excluding new/admin-verified tutors', () => {
  const score = overrides => ranking.rankTutor({ ...baseline, ...overrides }).score
  assert.equal(score({}), 72.5)
  assert.ok(score({ rating: 5, reviews: 20 }) > score({ rating: 3, reviews: 20 }))
  assert.ok(score({ rating: 5, reviews: 20 }) > score({ rating: 5, reviews: 1 }))
  assert.ok(score({ released: 10 }) > score({ released: 5, refunded: 5 }))
  assert.ok(score({ testPassed: true, testScore: 95 }) > score({}))
  assert.equal(score({ testPassed: false, testScore: 95 }), score({}))
  assert.equal(score({ testPassed: true, testScore: 101 }), score({}))
  const bids = ['b','a'].map(id => ({ id, created_at: '2026-09-26', ranking: ranking.rankTutor(baseline) }))
  assert.equal(bids.sort(ranking.compareRankedBids)[0].id, 'a')
})

test('student bids use fresh evidence, stay within their request, remove rejected bids and fail explicitly on missing evidence', async () => {
  let failed = false, highRating = 5
  const profiles = ['high@test','low@test'].map(user_email => ({ user_email, verification_status: 'verified', subject_test_passed: false }))
  const degrees = [
    { tutor_email: 'high@test', degree_name: 'BS Physics', institution: 'North University', year_completed: 2020 },
    { tutor_email: 'high@test', degree_name: 'MSc Physics', institution: 'Central University', year_completed: 2024 },
    { tutor_email: 'low@test', degree_name: 'BEd', institution: 'City University', year_completed: 2021 },
  ]
  const { rankStudentBids } = moduleAt('src/lib/rank-student-bids.ts', {
    '@/lib/bid-ranking': ranking,
    '@/lib/supabase': { supabaseAdmin: {
      from(table) {
        if (table === 'tutor_profiles') return { select: () => ({ in: async () => ({ data: profiles, error: null }) }) }
        if (table === 'tutor_degrees') return { select: () => ({ in: () => ({ order: async (_column, options) => ({ data: [...degrees].sort((a,b) => options?.ascending ? a.year_completed - b.year_completed : b.year_completed - a.year_completed), error: null }) }) }) }
        const query = { select() { return this }, eq() { return this }, order() { return this }, limit: async () => ({ data: [{ status: 'held' }], error: failed ? {} : null }) }
        return query
      },
      rpc: async (_name, args) => ({ data: { rating: args.p_email === 'high@test' ? highRating : 3, review_count: 20 }, error: null }),
    } },
  })
  const problems = [{ status: 'open', bids: [
    { id: 'low', tutor_email: 'low@test', tutor_rating: 5, status: 'pending' },
    { id: 'high', tutor_email: 'high@test', tutor_rating: 1, status: 'pending' },
    { id: 'rejected', tutor_email: 'high@test', status: 'rejected' },
    { id: 'unverified', tutor_email: 'unknown@test', status: 'pending' },
  ] }, { status: 'accepted', bids: [{ id: 'historical' }] }]
  const result = await rankStudentBids(problems)
  assert.deepEqual(result[0].bids.map(b => b.id), ['high','low'])
  assert.equal(result[0].bids[0].tutor_rating, 5)
  assert.equal('ranking' in result[0].bids[0], false)
  assert.equal('qualification' in result[0].bids[0], false)
  assert.equal(result[1], problems[1])
  assert.equal(problems[0].bids.length, 4)
  highRating = 1
  assert.equal((await rankStudentBids(problems))[0].bids[0].id, 'low')
  failed = true
  await assert.rejects(rankStudentBids(problems), /ranking unavailable/)
})

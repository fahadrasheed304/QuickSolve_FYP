import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import Stripe from 'stripe'

const require = createRequire(import.meta.url)
// Compile the actual route modules, substituting only network/auth dependencies.
function route(file, dependencies) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('require', 'exports', js)(name => dependencies[name] ?? require(name), exports)
  return exports
}
const auth = (session = { email: 'student@example.test', role: 'student' }) => ({
  'next/headers': { cookies: async () => ({ get: () => ({ value: 'test-cookie' }) }) },
  '@/lib/auth': { decrypt: async () => session },
})
const request = (body, headers = {}) => new Request('http://localhost/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
})

test('wallet exposes only the signed-in student escrow and distinguishes reserved funds from available funds', async () => {
  const calls = []
  let failed = false
  const query = {
    select() { return this },
    eq(...args) { calls.push(args); return this },
    then(resolve) { resolve(failed ? { error: { message: 'Missing migration' } } : { data: [{ amount: '500' }, { amount: '83.33' }] }) },
  }
  const dependencies = {
    '@/lib/db': { DB: { getWalletBalance: async () => ({ balance: 100, transactions: [{ type: 'debit', amount: 500, method: 'Session escrow' }] }) } },
    '@/lib/supabase': { supabaseAdmin: { from(name) { assert.equal(name, 'session_escrows'); return query } } },
  }
  const api = route('src/app/api/wallet/route.ts', { ...auth(), ...dependencies })
  const data = await (await api.GET()).json()
  assert.equal(data.balance, 100)
  assert.equal(data.escrowBalance, 583.33)
  assert.equal(data.transactions[0].type, 'escrow')
  assert.deepEqual(calls, [['student_email', 'student@example.test'], ['status', 'reserved']])
  failed = true
  assert.equal((await api.GET()).status, 503)
  const unauthorized = route('src/app/api/wallet/route.ts', { ...auth(null), ...dependencies })
  assert.equal((await unauthorized.GET()).status, 401)
  calls.length = 0
  const tutor = route('src/app/api/wallet/route.ts', { ...auth({ email: 'tutor@test', role: 'tutor' }), ...dependencies })
  assert.equal((await (await tutor.GET()).json()).escrowBalance, 0)
  assert.equal(calls.length, 0)
})

test('payment resolution requires actual admin role, ignores client amount/identity and validates decisions', async () => {
  const calls = []
  const dependencies = {
    '@/lib/admin-auth': { isAdminEmail: email => email === 'admin@test' },
    '@/lib/supabase': { supabaseAdmin: { rpc: async (...args) => { calls.push(args); return { data: { status: 'refunded' } } } } },
  }
  const body = { problemId: '00000000-0000-0000-0000-000000000001', action: 'refund', note: 'Tutor did not attend the session', amount: 99999, admin: 'spoofed@test' }
  for (const session of [null, { email: 'student@test', role: 'student' }, { email: 'admin@test', role: 'student' }, { email: 'other@test', role: 'admin' }]) {
    const api = route('src/app/api/admin/payments/route.ts', { ...auth(session), ...dependencies })
    assert.equal((await api.POST(request(body))).status, 403)
    assert.equal((await api.GET(new Request('https://test/api/admin/payments'))).status, 403)
  }
  assert.equal(calls.length, 0)
  const api = route('src/app/api/admin/payments/route.ts', { ...auth({ email: 'admin@test', role: 'admin' }), ...dependencies })
  for (const changed of [{ action: 'credit' }, { note: '' }, { note: 'x'.repeat(2001) }, { problemId: 'bad' }]) {
    assert.equal((await api.POST(request({ ...body, ...changed }))).status, 400)
  }
  assert.equal(calls.length, 0)
  assert.equal((await api.POST(request(body))).status, 200)
  assert.deepEqual(calls[0], ['resolve_session_payment', { p_problem_id: body.problemId, p_action: 'refund', p_admin: 'admin@test', p_note: body.note }])
})

test('admin payment listing paginates and includes session evidence without exposing an unfiltered list', async () => {
  const calls = []
  const tables = {
    session_payments: [{ problem_id: 'p1', status: 'held', amount: 500 }],
    problems: [{ id: 'p1', accepted_bid_id: 'b1', subject: 'Physics', session_started_at: '2026-09-25T10:00:00Z' }],
    bids: [{ id: 'b1', duration_min: 30, price: 500 }],
  }
  const api = route('src/app/api/admin/payments/route.ts', {
    ...auth({ email: 'admin@test', role: 'admin' }),
    '@/lib/admin-auth': { isAdminEmail: () => true },
    '@/lib/supabase': { supabaseAdmin: { from: table => {
      const query = { then: resolve => resolve({ data: tables[table], count: 30 }) }
      for (const method of ['select', 'eq', 'order', 'range', 'in']) query[method] = (...args) => { calls.push([table, method, ...args]); return query }
      return query
    } } },
  })
  const response = await api.GET(new Request('https://test/api/admin/payments?status=held&page=1'))
  const data = await response.json()
  assert.equal(data.payments[0].problem.bid.duration_min, 30)
  assert.equal(data.count, 30)
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['session_payments', 'range', 25, 49])))
  assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(['session_payments', 'eq', 'status', 'held'])))
  assert.equal((await api.GET(new Request('https://test/api/admin/payments?status=anything'))).status, 400)
  assert.equal((await api.GET(new Request('https://test/api/admin/payments?page=-1'))).status, 400)
})

test('extension uses authenticated student and server pricing, validating duration and retry identity', async () => {
  const calls = []
  const dependencies = { '@/lib/supabase': { supabaseAdmin: { rpc: async (...args) => {
    calls.push(args); return { data: { amount: 166.67, endsAt: Date.now()+600000, serverNow: Date.now() } }
  } } } }
  const api = route('src/app/api/sessions/extend/route.ts', { ...auth(), ...dependencies })
  const body = { problemId: '00000000-0000-0000-0000-000000000001', requestId: '00000000-0000-0000-0000-000000000002', minutes: 10, expectedMinutes: 0 }
  for (const minutes of [0, -5, 7, 1000, '10', null]) assert.equal((await api.POST(request({ ...body, minutes }))).status,400)
  assert.equal((await api.POST(request({ ...body, requestId: 'bad' }))).status,400)
  assert.equal((await api.POST(request({ ...body, expectedMinutes: -1 }))).status,400)
  assert.equal(calls.length,0)
  assert.equal((await api.POST(request({ ...body, amount: 1, email: 'other@test' }))).status,200)
  assert.deepEqual(calls[0],['extend_student_session',{
    p_problem_id: body.problemId,p_email: 'student@example.test',p_minutes: 10,p_request_id: body.requestId,p_expected_minutes: 0,
  }])
  const tutor = route('src/app/api/sessions/extend/route.ts', { ...auth({ email: 'tutor@test',role: 'tutor' }), ...dependencies })
  assert.equal((await tutor.POST(request(body))).status,401)
  assert.equal(calls.length,1)
})

test('session settlement rejects browser-only amounts and uses the authenticated owner', async () => {
  const calls = []
  const api = route('src/app/api/sessions/complete/route.ts', {
    ...auth(), '@/lib/supabase': { supabaseAdmin: { rpc: async (...args) => { calls.push(args); return { data: { balance: 500 } } } } },
  })
  for (const amount of [-500, 0, '100', 100]) assert.equal((await api.POST(request({ amount }))).status, 400)
  assert.equal(calls.length, 0)
  const problemId = '00000000-0000-0000-0000-000000000001'
  assert.equal((await api.POST(request({ problemId, rating: 5, amount: -100, email: 'other@example.test' }))).status, 200)
  assert.deepEqual(calls[0], ['submit_session_review', { p_problem_id: problemId, p_email: 'student@example.test', p_rating: 5, p_feedback: '', p_dispute: null }])
})

test('saved tutor rating travels through database profile and authenticated tutor API', async () => {
  const query = { select(){return this}, eq(){return this}, single:async()=>({data:{user_email:'tutor@test',rating:5,fullname:'Tutor'}}) }
  const {DB} = route('src/lib/db.ts', {'./supabase':{supabaseAdmin:{
    from:()=>query,
    rpc:async(name,args)=>{
      assert.equal(name,'get_tutor_rating'); assert.equal(args.p_email,'tutor@test')
      return {data:{rating:3.5,review_count:2}}
    },
  }}})
  const profile = await DB.getTutorProfile('tutor@test')
  assert.equal(profile.rating,3.5)
  const api = route('src/app/api/auth/me/route.ts', {
    ...auth({email:'tutor@test',role:'tutor'}),
    '@/lib/tutor-verification':{getTutorVerificationState:()=>({status:'verified',isSubmitted:true})},
    '@/lib/db':{DB:{
      findUserByEmail:async()=>({email:'tutor@test',role:'tutor'}),getTutorProfile:async()=>profile,
      getDegrees:async()=>[],getDocuments:async()=>[],getWalletBalance:async()=>({balance:0}),
    }},
  })
  const response = await api.GET()
  assert.equal(response.status,200)
  const {user}=await response.json()
  assert.equal(user.tutorProfile.rating,3.5)
  assert.equal(user.tutorProfile.reviewCount,2)
})

test('review stars and selected highlights are validated and saved together', async () => {
  const calls=[]
  const api=route('src/app/api/sessions/complete/route.ts', {
    ...auth(), '@/lib/supabase':{supabaseAdmin:{rpc:async(...args)=>{calls.push(args);return {data:{status:'pending'}}}}},
  })
  const problemId='00000000-0000-0000-0000-000000000001'
  for(const rating of [0,6,-1,3.5,'5']) assert.equal((await api.POST(request({problemId,rating}))).status,400)
  assert.equal(calls.length,0)
  assert.equal((await api.POST(request({problemId,rating:4,tags:['Patient teacher','invalid','Patient teacher'],feedback:' Clear explanation '}))).status,200)
  assert.equal(calls[0][1].p_feedback,'Highlights: Patient teacher\nClear explanation')
  assert.equal(calls[0][1].p_rating,4)
})

test('topup validates amount and never credits the wallet directly', async () => {
  let checkoutCalls = 0
  const api = route('src/app/api/wallet/topup/route.ts', {
    ...auth(), '@/lib/db': { DB: { getWalletBalance: async () => ({ balance: 0 }), requireWalletMigration: async () => {} } },
    '@/lib/app-url': { getAppUrl: () => 'http://localhost:3000' },
    '@/lib/stripe': { getStripe: () => ({ checkout: { sessions: { create: async data => {
      checkoutCalls++
      assert.equal(data.line_items[0].price_data.unit_amount, 10000)
      assert.equal(data.metadata.email, 'student@example.test')
      return { url: 'https://checkout.stripe.com/test' }
    } } } }) },
  })
  const previous = { key: process.env.STRIPE_SECRET_KEY, webhook: process.env.STRIPE_WEBHOOK_SECRET }
  try {
    delete process.env.STRIPE_SECRET_KEY
    assert.equal((await api.POST(request({ amount: 100, method: 'stripe' }))).status, 503)
    for (const amount of [-1, 0, 99, 100001, 100.5, '100', null]) {
      assert.equal((await api.POST(request({ amount, method: 'stripe' }))).status, 400)
    }
    assert.equal((await api.POST(request({ amount: 100, method: 'bank' }))).status, 400)
    assert.equal(checkoutCalls, 0)
    process.env.STRIPE_SECRET_KEY = 'sk_test_local_only'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_only'
    assert.equal((await api.POST(request({ amount: 100, method: 'stripe' }))).status, 200)
    assert.equal(checkoutCalls, 1)
  } finally {
    for (const [name, value] of [['STRIPE_SECRET_KEY', previous.key], ['STRIPE_WEBHOOK_SECRET', previous.webhook]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value
    }
  }
})

test('webhook verifies signatures, paid state and currency before crediting', async () => {
  const stripe = new Stripe('sk_test_local_only')
  const secret = 'whsec_local_only'
  const previous = process.env.STRIPE_WEBHOOK_SECRET
  process.env.STRIPE_WEBHOOK_SECRET = secret
  const credits = []
  let failCredit = false
  const api = route('src/app/api/stripe/webhook/route.ts', {
    '@/lib/stripe': { getStripe: () => stripe },
    '@/lib/db': { DB: { applyWalletTransaction: async (...args) => {
      if (failCredit) throw new Error('Simulated database outage')
      credits.push(args)
    } } },
  })
  const event = { id: 'evt_test', type: 'checkout.session.completed', livemode: false, data: { object: {
    id: 'cs_test_example', mode: 'payment', payment_status: 'paid', amount_total: 10000, currency: 'pkr',
    metadata: { purpose: 'wallet_topup', email: 'student@example.test', role: 'student' },
  } } }
  const send = body => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(body), secret })
    return api.POST(request(body, { 'stripe-signature': signature }))
  }
  try {
    assert.equal((await api.POST(request(event))).status, 400)
    assert.equal((await api.POST(request(event, { 'stripe-signature': 'invalid' }))).status, 400)
    assert.equal((await send({ ...event, livemode: true })).status, 400)
    assert.equal((await send({ ...event, data: { object: { ...event.data.object, payment_status: 'unpaid' } } })).status, 200)
    assert.equal((await send({ ...event, data: { object: { ...event.data.object, currency: 'usd' } } })).status, 400)
    assert.equal(credits.length, 0)
    assert.equal((await send(event)).status, 200)
    assert.equal(credits[0][2].amount, 100)
    assert.equal(credits[0][3], 'stripe:cs_test_example')
    failCredit = true
    assert.equal((await send(event)).status, 500) // Provider must retry failed settlement.
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
    else process.env.STRIPE_WEBHOOK_SECRET = previous
  }
})

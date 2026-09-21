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

test('session settlement rejects browser-only amounts and uses the authenticated owner', async () => {
  const calls = []
  const api = route('src/app/api/sessions/complete/route.ts', {
    ...auth(), '@/lib/supabase': { supabaseAdmin: { rpc: async (...args) => { calls.push(args); return { data: { balance: 500 } } } } },
  })
  for (const amount of [-500, 0, '100', 100]) assert.equal((await api.POST(request({ amount }))).status, 400)
  assert.equal(calls.length, 0)
  const problemId = '00000000-0000-0000-0000-000000000001'
  assert.equal((await api.POST(request({ problemId, amount: -100, email: 'other@example.test' }))).status, 200)
  assert.deepEqual(calls[0], ['complete_student_session', { p_problem_id: problemId, p_email: 'student@example.test' }])
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

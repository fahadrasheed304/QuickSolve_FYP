import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { DB } from '@/lib/db'
import type Stripe from 'stripe'

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret)
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }
  if (event.livemode) return NextResponse.json({ error: 'Only sandbox payments are supported' }, { status: 400 })
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return NextResponse.json({ received: true })
  }
  const checkout = event.data.object
  if (checkout.metadata?.purpose !== 'wallet_topup' || checkout.payment_status !== 'paid') {
    return NextResponse.json({ received: true })
  }
  const { email, role } = checkout.metadata
  const amount = checkout.amount_total
  if (checkout.mode !== 'payment' || checkout.currency !== 'pkr' || role !== 'student' || !email ||
      amount === null || !Number.isSafeInteger(amount) || amount < 10000 || amount > 10000000 || amount % 100 !== 0) {
    return NextResponse.json({ error: 'Invalid wallet payment' }, { status: 400 })
  }
  try {
    await DB.applyWalletTransaction(email, role, {
      id: checkout.id, type: 'credit', amount: amount / 100, method: 'stripe',
      description: 'Added via Stripe (sandbox)', status: 'completed', date: new Date().toISOString(),
    }, `stripe:${checkout.id}`)
    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    console.error('Wallet credit failed:', error instanceof Error ? error.message : 'Unknown error')
    // Stripe retries non-2xx responses; the database reference prevents double credit.
    return NextResponse.json({ error: 'Wallet credit failed; retry required' }, { status: 500 })
  }
}

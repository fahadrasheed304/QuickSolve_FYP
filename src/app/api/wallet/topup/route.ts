import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { getAppUrl } from '@/lib/app-url'

export async function POST(request: Request) {
  try {
    const session = await decrypt((await cookies()).get('auth_token')?.value)
    if (typeof session?.email !== 'string' || session.role !== 'student') {
      return NextResponse.json({ error: 'Student login required' }, { status: 401 })
    }
    const { amount, method } = await request.json()
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 100 || amount > 100000) {
      return NextResponse.json({ error: 'Amount must be a whole number between Rs. 100 and Rs. 100,000' }, { status: 400 })
    }
    if (method !== 'stripe') {
      return NextResponse.json({ error: 'This payment method is not available yet. Please use Stripe Card.' }, { status: 400 })
    }
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || !process.env.STRIPE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Card payments are not configured yet.' }, { status: 503 })
    }
    await DB.getWalletBalance(session.email, 'student')
    await DB.requireWalletMigration()
    const baseUrl = getAppUrl(request)
    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'],
      customer_email: session.email, billing_address_collection: 'required',
      line_items: [{ price_data: { currency: 'pkr', unit_amount: amount * 100, product_data: { name: 'QuickSolve wallet top-up' } }, quantity: 1 }],
      metadata: { purpose: 'wallet_topup', email: session.email.toLowerCase().trim(), role: 'student' },
      success_url: `${baseUrl}/student/wallet?checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/student/wallet?payment=cancelled`,
    })
    return NextResponse.json({ success: true, checkoutUrl: checkout.url })
  } catch (error: unknown) {
    console.error('Checkout creation failed:', error instanceof Error ? error.name : 'Unknown')
    return NextResponse.json({ error: 'Unable to start card payment. Please try again.' }, { status: 503 })
  }
}

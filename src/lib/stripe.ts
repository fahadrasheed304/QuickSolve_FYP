import Stripe from 'stripe'

let client: Stripe | undefined
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key?.startsWith('sk_test_')) throw new Error('Stripe sandbox is not configured. Add a test secret key.')
  client ??= new Stripe(key)
  return client
}

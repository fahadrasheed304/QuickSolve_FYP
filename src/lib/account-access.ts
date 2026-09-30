// Fetch keeps this shared session check usable in the Next.js proxy as well as APIs.
export class AccountRestrictedError extends Error {
  constructor(message: string) { super(message); this.name = 'AccountRestrictedError' }
}
export async function assertAccountAccess(email: string) {
  const normalized = email.toLowerCase().trim()
  if (normalized === 'quicksolve.officials@gmail.com') return
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Account access check unavailable')
  const params = new URLSearchParams({ select: 'status,suspended_until', user_email: `eq.${normalized}` })
  const response = await fetch(`${url}/rest/v1/account_moderation?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Account access check unavailable. Please contact support.')
  const rows = await response.json()
  if (!Array.isArray(rows)) throw new Error('Account access check unavailable')
  const status = rows[0]
  if (status?.status === 'banned') throw new AccountRestrictedError('Your account is permanently banned. Contact support to appeal.')
  if (status?.status === 'suspended' && (!Number.isFinite(Date.parse(status.suspended_until)) || Date.parse(status.suspended_until) > Date.now())) {
    throw new AccountRestrictedError(`Your account is suspended${status.suspended_until ? ` until ${new Date(status.suspended_until).toUTCString()}` : ''}. Contact support for assistance.`)
  }
}

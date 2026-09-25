import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'

export async function notificationAccount() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (typeof session?.email !== 'string' || !['student', 'tutor'].includes(String(session.role))) return null
  return { email: session.email.toLowerCase().trim(), role: String(session.role), expiresAt: Number(session.exp) * 1000 }
}

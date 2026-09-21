import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'

type SignupUser = {
  fullname: string; email: string; password: string; role: string;
  phone?: string; city?: string; subjects?: string[];
  highestEducation?: string; university?: string; experienceYears?: number;
}
export type PendingSignup = { otpHash: string; user: SignupUser; expires: number }

export const generateOtp = () => randomInt(100000, 1000000).toString()

export function matchesOtp(otp: string, stored: string) {
  if (!/^\d{6}$/.test(otp)) return false
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(otp, salt, 32)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function getPendingSignup(email: string): Promise<PendingSignup | null> {
  const { data, error } = await supabaseAdmin.from('pending_signups')
    .select('otp_hash,user_data,expires_at').eq('email', email).maybeSingle()
  if (error) throw new Error('Unable to load signup verification. Check the pending_signups migration.')
  return data ? { otpHash: data.otp_hash, user: data.user_data, expires: Date.parse(data.expires_at) } : null
}

export async function savePendingSignup(email: string, user: SignupUser, otp: string) {
  const salt = randomBytes(16).toString('hex')
  const otpHash = `${salt}:${scryptSync(otp, salt, 32).toString('hex')}`
  const { error } = await supabaseAdmin.from('pending_signups').upsert({
    email, user_data: user, otp_hash: otpHash,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }, { onConflict: 'email' })
  if (error) throw new Error('Unable to save signup verification. Check the pending_signups migration.')
  return otpHash
}

export async function removePendingSignup(email: string, otpHash: string) {
  // A delayed request must never remove a newer signup/resend code.
  const { error } = await supabaseAdmin.from('pending_signups').delete()
    .eq('email', email).eq('otp_hash', otpHash)
  if (error) throw new Error('Unable to clear signup verification.')
}

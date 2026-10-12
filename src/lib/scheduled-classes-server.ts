import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { isClassId, type ScheduledClass, type ClassBooking } from '@/lib/scheduled-classes'

export const classHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
export async function classAccount() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (typeof session?.email !== 'string' || !['student','tutor','admin'].includes(String(session.role))) return null
  const email = session.email.toLowerCase().trim()
  if (session.role === 'admin' && !isAdminEmail(email)) return null
  return { email, role: String(session.role) }
}
export async function classAccess(id: string, account: {email: string; role: string}) {
  if (!isClassId(id)) return null
  const { data, error } = await supabaseAdmin.from('scheduled_classes').select('*').eq('id',id).maybeSingle()
  if (error) throw new Error('Scheduled classes unavailable. Apply the scheduled classes migration.')
  if (!data) return null
  const c = data as ScheduledClass
  if (account.role === 'admin' || (account.role === 'tutor' && c.tutor_email === account.email)) return { c, booking: null }
  if (account.role !== 'student') return null
  const { data: bookings, error: bookingError } = await supabaseAdmin.from('scheduled_class_bookings').select('*')
    .eq('class_id',id).eq('student_email',account.email).order('created_at',{ascending:false}).order('id').limit(1)
  if (bookingError) throw new Error('Bookings unavailable')
  return { c, booking: bookings?.[0] as ClassBooking | undefined || null }
}
export function classRpcError(error: {code?: string; message?: string}) {
  return Response.json({error: error.code === 'P0001' ? error.message : 'Class action could not be saved. Please retry.'}, {status:error.code === 'P0001' ? 409 : 503,headers:classHeaders})
}

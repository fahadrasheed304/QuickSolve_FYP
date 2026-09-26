import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { evaluateTutorPerformance } from '@/lib/tutor-performance'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (typeof session?.email !== 'string') return Response.json({ error: 'Login required' }, { status: 401 })
  const admin = session.role === 'admin' && isAdminEmail(session.email)
  if (!admin && session.role !== 'tutor') return Response.json({ error: 'Tutor or admin access required' }, { status: 403 })
  const requested = new URL(request.url).searchParams.get('tutorEmail')?.toLowerCase().trim()
  const ownEmail = session.email.toLowerCase().trim()
  if (!admin && requested && requested !== ownEmail) return Response.json({ error: 'Access denied' }, { status: 403 })
  const email = admin ? requested : ownEmail
  if (!email) return Response.json({ error: 'Select a tutor' }, { status: 400 })
  try {
    const { data, error } = await supabaseAdmin.from('session_payments')
      .select('problem_id,rating,feedback,status,dispute').eq('tutor_email', email)
      .order('release_at', { ascending: false }).order('problem_id').limit(20)
    if (error) throw error
    return Response.json({ performance: evaluateTutorPerformance(data || []) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Performance unavailable. Please retry.' }, { status: 503 })
  }
}

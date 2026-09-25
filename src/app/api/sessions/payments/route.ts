import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session?.email || !['student', 'tutor'].includes(String(session.role))) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  const { data, error } = await supabaseAdmin.from('session_payments')
    .select('problem_id,amount,rating,feedback,status,release_at,dispute,review_submitted_at,hold_reason,resolution_note,resolved_at')
    .eq(session.role === 'tutor' ? 'tutor_email' : 'student_email', String(session.email).toLowerCase().trim())
    .order('release_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: 'Payments unavailable' }, { status: 503 })
  return NextResponse.json({ payments: data }, { headers: { 'Cache-Control': 'no-store' } })
}

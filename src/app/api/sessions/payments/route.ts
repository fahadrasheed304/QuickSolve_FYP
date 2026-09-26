import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session?.email || !['student', 'tutor'].includes(String(session.role))) return NextResponse.json({ error: 'Login required' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const page = Number(params.get('page') || '0')
  const status = params.get('status') || 'all'
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000000 || !['all', 'pending', 'held', 'released', 'refunded'].includes(status)) {
    return NextResponse.json({ error: 'Invalid payment filters' }, { status: 400 })
  }
  let query = supabaseAdmin.from('session_payments')
    .select('problem_id,amount,rating,feedback,status,release_at,dispute,review_submitted_at,hold_reason,resolution_note,resolved_at', { count: 'exact' })
    .eq(session.role === 'tutor' ? 'tutor_email' : 'student_email', String(session.email).toLowerCase().trim())
    .order('release_at', { ascending: false }).order('problem_id', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)
  const { data, count, error } = await query.range(page * 25, page * 25 + 24)
  if (error) return NextResponse.json({ error: 'Payments unavailable' }, { status: 503 })
  return NextResponse.json({ payments: data, count: count || 0, page }, { headers: { 'Cache-Control': 'no-store' } })
}

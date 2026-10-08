import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { demoSession } from '@/lib/teaching-demos-server'
import { DEMO_CRITERIA } from '@/lib/teaching-demos'
import { sendDemoReviewEmail } from '@/lib/demo-review-email'

export const maxDuration = 60

export async function GET(request: Request) {
  const session = await demoSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const email = new URL(request.url).searchParams.get('tutorEmail')
  let query = supabaseAdmin.from('tutor_teaching_demos')
    .select('id,tutor_email,subject,topic,class_level,status,duration_seconds,scores,feedback,created_at,review_email_status')
    .in('status', ['pending', 'approved', 'rejected']).order('created_at', { ascending: false })
  if (email) query = query.eq('tutor_email', email.toLowerCase().trim())
  else query = query.or('status.eq.pending,and(status.eq.rejected,review_email_status.in.(pending,failed,sending))')
  const { data, error } = await query.limit(100)
  if (error) return NextResponse.json({ error: 'Could not load demo reviews' }, { status: 503 })
  return NextResponse.json({ demos: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const session = await demoSession()
  if (session?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  try {
    const body = await request.json()
    if (body.action === 'resend_email' && typeof body.id === 'string') {
      return NextResponse.json({ success: true, emailStatus: await sendDemoReviewEmail(body.id, request) })
    }
    if (typeof body.id !== 'string' || !['approve', 'reject'].includes(body.action) || typeof body.feedback !== 'string' || body.feedback.length > 2000) {
      return NextResponse.json({ error: 'Invalid review' }, { status: 400 })
    }
    if (body.action === 'approve' && !DEMO_CRITERIA.every(key => Number.isInteger(body.scores?.[key]) && body.scores[key] >= 1 && body.scores[key] <= 5)) {
      return NextResponse.json({ error: 'Score all four criteria from 1 to 5' }, { status: 400 })
    }
    const { error } = await supabaseAdmin.rpc('review_tutor_demo', {
      p_id: body.id, p_admin: session.email, p_approve: body.action === 'approve',
      p_scores: body.scores || {}, p_feedback: body.feedback,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    if (body.action === 'reject') {
      try { return NextResponse.json({ success: true, emailStatus: await sendDemoReviewEmail(body.id, request) }) }
      catch { return NextResponse.json({ success: true, emailStatus: 'failed', warning: 'Review saved. Email could not be confirmed; refresh and retry the email.' }) }
    }
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Could not save review' }, { status: 400 }) }
}

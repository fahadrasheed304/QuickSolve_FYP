import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const session = await decrypt((await cookies()).get('auth_token')?.value)
    if (!session?.email || session.role !== 'student') {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }
    const { data, error } = await supabaseAdmin.from('bids')
      .select('id, problem_id, tutor_name, price, duration_min, problems!bids_problem_id_fkey!inner(subject, class, session_started_at,session_ended_at,extension_minutes)')
      .eq('status', 'accepted')
      .eq('problems.student_email', String(session.email).toLowerCase().trim())
      .eq('problems.status', 'accepted')
      .is('problems.settled_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    const outstanding = (data || []).flatMap(bid => {
      const problem = Array.isArray(bid.problems) ? bid.problems[0] : bid.problems
      if (!problem) return []
      const endsAt = problem.session_started_at
        ? Date.parse(problem.session_started_at) + (Number(bid.duration_min) + Number(problem.extension_minutes || 0)) * 60000 : null
      const needsReview = Boolean(problem.session_ended_at || (endsAt !== null && endsAt <= Date.now()))
      return [{ roomName: `session-${bid.problem_id}`, tutorName: bid.tutor_name,
        subject: problem.subject, class: problem.class, price: bid.price,
        durationMin: bid.duration_min, endsAt, needsReview }]
    })
    return NextResponse.json({ sessions: outstanding.filter(item => !item.needsReview), pendingReviews: outstanding.filter(item => item.needsReview), serverNow: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load active sessions' }, { status: 503 })
  }
}

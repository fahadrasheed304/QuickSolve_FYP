import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET: Check if the tutor has any accepted sessions they can join
export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('auth_token')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const payload = await decrypt(sessionToken)
    if (!payload?.email || payload.role !== 'tutor') {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const tutorEmail = (payload.email as string).toLowerCase().trim()

    // Find bids placed by this tutor on problems that have been accepted
    const { data: bids, error } = await supabaseAdmin
      .from('bids')
      .select('id, problem_id, price, duration_min, problems!bids_problem_id_fkey!inner(id, subject, class, status, student_email)')
      .eq('tutor_email', tutorEmail)
      .eq('status', 'accepted')
      .eq('problems.status', 'accepted')
      .is('problems.settled_at', null)
      .is('problems.session_ended_at', null)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('Error fetching accepted sessions:', error)
      return NextResponse.json({ error: 'Unable to load active sessions' }, { status: 503 })
    }

    const sessions = (bids || []).map((bid) => ({
      bidId: bid.id,
      problemId: bid.problem_id,
      roomName: `session-${bid.problem_id}`,
      subject: (Array.isArray(bid.problems) ? bid.problems[0] : bid.problems)?.subject || 'Unknown',
      class: (Array.isArray(bid.problems) ? bid.problems[0] : bid.problems)?.class || '',
      price: bid.price,
      durationMin: bid.duration_min,
    }))

    return NextResponse.json({ sessions })
  } catch (caughtError: unknown) {
    const err = caughtError instanceof Error ? caughtError : new Error('Unexpected error')
    console.error('Active sessions error:', err)
    return NextResponse.json({ error: err.message || 'Failed to check sessions' }, { status: 500 })
  }
}

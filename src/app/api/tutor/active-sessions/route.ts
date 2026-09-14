import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// GET: Check if the tutor has any accepted sessions they can join
export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const payload = await decrypt(sessionToken)
    if (!payload?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const tutorEmail = (payload.email as string).toLowerCase().trim()

    // Find the tutor's name from their profile
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles')
      .select('fullname')
      .eq('user_email', tutorEmail)
      .single()

    const tutorName = profile?.fullname || tutorEmail

    // Find bids placed by this tutor on problems that have been accepted
    const { data: bids, error } = await supabaseAdmin
      .from('bids')
      .select('id, problem_id, price, duration_min, problems!inner(id, subject, class, status, student_email)')
      .eq('tutor_name', tutorName)
      .eq('problems.status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('Error fetching accepted sessions:', error)
      return NextResponse.json({ sessions: [] })
    }

    const sessions = (bids || []).map((bid: any) => ({
      bidId: bid.id,
      problemId: bid.problem_id,
      roomName: `session-${bid.problem_id}`,
      subject: bid.problems?.subject || 'Unknown',
      class: bid.problems?.class || '',
      price: bid.price,
      durationMin: bid.duration_min,
    }))

    return NextResponse.json({ sessions })
  } catch (err: any) {
    console.error('Active sessions error:', err)
    return NextResponse.json({ error: err.message || 'Failed to check sessions' }, { status: 500 })
  }
}

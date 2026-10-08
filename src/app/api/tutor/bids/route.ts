import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { demoSubjectsReady } from '@/lib/teaching-demos-server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await decrypt(token)
    if (!session?.email || session.role !== 'tutor') {
      return NextResponse.json({ error: 'Invalid tutor session' }, { status: 401 })
    }

    const body = await request.json()
    const problemId = String(body.problemId || '')
    const price = Number(body.price)
    const durationMin = Number(body.durationMin)

    if (!problemId || !price || !durationMin) {
      return NextResponse.json({ error: 'Missing required bid fields' }, { status: 400 })
    }

    if (price < 200 || price > 2000) {
      return NextResponse.json({ error: 'Bid price must be between Rs. 200 and Rs. 2,000' }, { status: 400 })
    }

    const user = await DB.findUserByEmail(session.email as string)

    const profile = await DB.getTutorProfile(session.email as string)

    if (!user || !profile) {
      return NextResponse.json({ error: 'Tutor profile not found' }, { status: 404 })
    }

    if (profile.conduct_status === 'restricted') return NextResponse.json({ error: 'New bookings are restricted. See your dashboard for the review reason.' }, { status: 403 })

    if (profile.verification_status !== 'verified' && profile.verification_stage !== 'verified') {
      return NextResponse.json({ error: 'Only verified tutors can place bids' }, { status: 403 })
    }

    if (profile.is_available === false) {
      return NextResponse.json({ error: 'Turn availability on before placing a bid' }, { status: 403 })
    }

    const { data: problem, error: problemError } = await supabaseAdmin.from('problems')
      .select('subject').eq('id', problemId).maybeSingle()
    if (problemError) return NextResponse.json({ error: 'Problem could not be loaded. Please retry.' }, { status: 503 })
    if (!problem) return NextResponse.json({ error: 'Problem request not found' }, { status: 404 })
    // Use the same exact subject matching as the request feed and notifications.
    // Neither the tutor identity nor the subject is trusted from the request body.
    if (!Array.isArray(profile.subjects) || !profile.subjects.includes(problem.subject)) {
      return NextResponse.json({ error: 'You can only bid on problems in your profile subjects.' }, { status: 403 })
    }

    if (!await demoSubjectsReady(String(session.email), [problem.subject], true)) {
      return NextResponse.json({ error: 'An approved teaching demo is required for this subject. Open My Subjects to submit your demo.' }, { status: 403 })
    }

    const bid = await DB.createBid({
      problemId,
      tutorEmail: String(session.email).toLowerCase().trim(),
      tutorName: profile.fullname || user.fullname || user.email.split('@')[0],
      tutorRating: profile.rating ?? 0,
      tutorSessions: profile.total_sessions || 0,
      tutorSubject: problem.subject,
      responseTimeMin: profile.response_time_min || 3,
      price,
      durationMin,
    })

    return NextResponse.json({ success: true, bid })
  } catch (error: unknown) {
    console.error('Tutor bid error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    if (message === 'An approved teaching demo is required for this subject') return NextResponse.json({ error: message }, { status: 403 })
    if (message === 'Tutor subject does not match problem') return NextResponse.json({ error: 'You can only bid on problems in your profile subjects.' }, { status: 403 })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

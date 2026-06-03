import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

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

    if (profile.verification_status !== 'verified' && profile.verification_stage !== 'verified') {
      return NextResponse.json({ error: 'Only verified tutors can place bids' }, { status: 403 })
    }

    if (profile.is_available === false) {
      return NextResponse.json({ error: 'Turn availability on before placing a bid' }, { status: 403 })
    }

    const bid = await DB.createBid({
      problemId,
      tutorName: profile.fullname || user.fullname || user.email.split('@')[0],
      tutorRating: profile.rating || 5,
      tutorSessions: profile.total_sessions || 0,
      tutorSubject: Array.isArray(profile.subjects) && profile.subjects.length > 0
        ? profile.subjects[0]
        : 'Subject Tutor',
      responseTimeMin: profile.response_time_min || 3,
      price,
      durationMin,
    })

    return NextResponse.json({ success: true, bid })
  } catch (error: unknown) {
    console.error('Tutor bid error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

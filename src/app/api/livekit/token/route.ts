import { AccessToken } from 'livekit-server-sdk'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { decrypt } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // Authenticate the user via session cookie
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('auth_token')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const payload = await decrypt(sessionToken)
    if (!payload?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const room = req.nextUrl.searchParams.get('room')
    if (!room) {
      return NextResponse.json({ error: 'Missing room parameter' }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'LiveKit credentials not configured' }, { status: 500 })
    }

    const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL
    if (!serverUrl || !serverUrl.startsWith('wss://')) {
      return NextResponse.json({ error: 'LiveKit server URL not configured' }, { status: 503 })
    }
    const problemId = room.replace(/^session-/, '')
    if (!/^session-[0-9a-f-]{36}$/i.test(room)) return NextResponse.json({ error: 'Invalid session room' }, { status: 400 })
    const { data: problem, error: problemError } = await supabaseAdmin.from('problems')
      .select('id,student_email,status,settled_at,accepted_bid_id,session_started_at').eq('id', problemId).single()
    if (problemError) return NextResponse.json({ error: 'Unable to load session. Check session clock migration.' }, { status: 503 })
    if (!problem || problem.status !== 'accepted' || problem.settled_at) return NextResponse.json({ error: 'Session is not active' }, { status: 409 })
    const { data: bid, error: bidError } = await supabaseAdmin.from('bids').select('tutor_name,duration_min').eq('id', problem.accepted_bid_id).single()
    if (bidError || !bid) return NextResponse.json({ error: 'Accepted bid unavailable' }, { status: 503 })
    const email = String(payload.email).toLowerCase().trim()
    let allowed = payload.role === 'student' && problem.student_email === email
    if (payload.role === 'tutor') {
      const { data: profile } = await supabaseAdmin.from('tutor_profiles').select('fullname').eq('user_email', email).single()
      allowed = bid.tutor_name === (profile?.fullname || email)
    }
    if (!allowed) return NextResponse.json({ error: 'You are not a participant in this session' }, { status: 403 })
    if (!problem.session_started_at) {
      const { error } = await supabaseAdmin.from('problems').update({ session_started_at: new Date().toISOString() }).eq('id', problemId).is('session_started_at', null)
      if (error) return NextResponse.json({ error: 'Unable to start session clock' }, { status: 503 })
    }
    const { data: clock, error: clockError } = await supabaseAdmin.from('problems').select('session_started_at').eq('id', problemId).single()
    if (clockError || !clock?.session_started_at) return NextResponse.json({ error: 'Session clock unavailable' }, { status: 503 })
    const endsAt = Date.parse(clock.session_started_at) + Number(bid.duration_min) * 60000
    if (endsAt <= Date.now()) return NextResponse.json({ error: 'Session time has expired' }, { status: 409 })
    const identity = email + ':' + String(payload.role)
    const name = (payload.fullname as string) || (payload.email as string)

    // Create access token with grants
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: '2h',
    })

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    const token = await at.toJwt()
    return NextResponse.json({ token, serverUrl, endsAt, serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } })
  } catch (caughtError: unknown) {
    const err = caughtError instanceof Error ? caughtError : new Error('Unexpected error')
    console.error('LiveKit token error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to generate token' },
      { status: 500 }
    )
  }
}

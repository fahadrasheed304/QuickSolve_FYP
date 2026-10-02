import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { RoomServiceClient } from 'livekit-server-sdk'
import { stopRecordings } from '@/lib/recordings'

async function handle(request: Request, end: boolean) {
  try {
    const session = await decrypt((await cookies()).get('auth_token')?.value)
    if (!session?.email || !['student', 'tutor'].includes(String(session.role))) return NextResponse.json({ error: 'Login required' }, { status: 401 })
    const id = new URL(request.url).searchParams.get('problemId') || ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Invalid session' }, { status: 400 })
    const { data: problem, error } = await supabaseAdmin.from('problems')
      .select('student_email,accepted_bid_id,status,session_ended_at,settled_at,session_started_at,extension_minutes').eq('id', id).single()
    if (error || !problem) return NextResponse.json({ error: 'Session state unavailable' }, { status: 503 })
    const email = String(session.email).toLowerCase().trim()
    let allowed = session.role === 'student' && problem.student_email === email
    const { data: bid, error: bidError } = await supabaseAdmin.from('bids').select('tutor_name,tutor_email,duration_min,price').eq('id', problem.accepted_bid_id).single()
    if (bidError || !bid) return NextResponse.json({ error: 'Session rate unavailable' }, { status: 503 })
    if (session.role === 'tutor' && bid) {
      allowed = bid.tutor_email === email
    }
    if (!allowed) return NextResponse.json({ error: 'Not a session participant' }, { status: 403 })
    if (end) {
      if (problem.status !== 'accepted') return NextResponse.json({ error: 'Session not active' }, { status: 409 })
      const { error: writeError } = await supabaseAdmin.from('problems').update({ session_ended_at: new Date().toISOString() }).eq('id', id).is('session_ended_at', null)
      if (writeError) return NextResponse.json({ error: 'Unable to end session. Please retry.' }, { status: 503 })
      try { await stopRecordings(`session-${id}`) }
      catch { console.error('Recording stop deferred to room closure and scheduled cleanup.') }
      try {
        const client = new RoomServiceClient(process.env.NEXT_PUBLIC_LIVEKIT_URL!.replace('wss:', 'https:'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
        await client.deleteRoom(`session-${id}`)
      } catch { console.error('Room cleanup unavailable; clients will close through session polling.') }
    }
    const endsAt = problem.session_started_at ? Date.parse(problem.session_started_at) + (Number(bid.duration_min) + Number(problem.extension_minutes || 0)) * 60000 : null
    const serverNow = Date.now()
    const expired = endsAt !== null && serverNow >= endsAt
    return NextResponse.json({ ended: Boolean(end || problem.status !== 'accepted' || problem.session_ended_at || problem.settled_at || expired),
      endsAt, serverNow, bidPrice: Number(bid.price), durationMin: Number(bid.duration_min), extensionMinutes: Number(problem.extension_minutes || 0),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Session state unavailable' }, { status: 503 })
  }
}
export const GET = (request: Request) => handle(request, false)
export const POST = (request: Request) => handle(request, true)

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

type Context = { params: Promise<{ id: string }> }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function authorize(id: string) {
  if (!uuid.test(id)) return null
  const cookieStore = await cookies()
  const session = await decrypt(cookieStore.get('auth_token')?.value)
  if (!session?.email || (session.role !== 'student' && session.role !== 'tutor')) return null

  const { data: problem } = await supabaseAdmin.from('problems')
    .select('id,student_email,status,settled_at,session_ended_at,session_started_at,extension_minutes,accepted_bid_id')
    .eq('id', id).maybeSingle()
  if (!problem || problem.status !== 'accepted' || problem.settled_at || problem.session_ended_at) return null

  const email = String(session.email).toLowerCase().trim()
  if (session.role === 'student' && String(problem.student_email || '').toLowerCase().trim() !== email) return null
  let bidDuration = 0
  if (session.role === 'tutor') {
    const { data: bid } = await supabaseAdmin.from('bids').select('tutor_email,duration_min').eq('id', problem.accepted_bid_id).maybeSingle()
    if (!bid || String(bid.tutor_email || '').toLowerCase().trim() !== email) return null
    bidDuration = Number(bid.duration_min)
  } else {
    const { data: bid } = await supabaseAdmin.from('bids').select('duration_min').eq('id', problem.accepted_bid_id).maybeSingle()
    if (!bid) return null
    bidDuration = Number(bid.duration_min)
  }
  if (problem.session_started_at && Date.parse(problem.session_started_at) + (bidDuration + Number(problem.extension_minutes || 0)) * 60_000 <= Date.now()) return null
  return { session, problem }
}

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params
  const access = await authorize(id)
  if (!access) return NextResponse.json({ error: 'Session access denied' }, { status: 403 })
  const { data, error } = await supabaseAdmin.from('session_whiteboards').select('snapshot').eq('problem_id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Whiteboard storage is unavailable. Apply the session whiteboard migration.' }, { status: 503 })
  return NextResponse.json({ snapshot: data?.snapshot ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest, context: Context) {
  const { id } = await context.params
  const access = await authorize(id)
  if (!access) return NextResponse.json({ error: 'Session access denied' }, { status: 403 })
  const raw = await request.text()
  if (raw.length > 2_000_000) return NextResponse.json({ error: 'Whiteboard snapshot is too large' }, { status: 413 })
  let body: { snapshot?: unknown }
  try { body = JSON.parse(raw) as { snapshot?: unknown } } catch { return NextResponse.json({ error: 'Invalid snapshot' }, { status: 400 }) }
  if (!body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)) return NextResponse.json({ error: 'Invalid snapshot' }, { status: 400 })
  const { error } = await supabaseAdmin.from('session_whiteboards').upsert({ problem_id: id, snapshot: body.snapshot, updated_at: new Date().toISOString() }, { onConflict: 'problem_id' })
  if (error) return NextResponse.json({ error: 'Whiteboard could not be saved' }, { status: 503 })
  return NextResponse.json({ ok: true })
}

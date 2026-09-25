import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function POST(request: Request) {
  try {
    const session = await decrypt((await cookies()).get('auth_token')?.value)
    if (!session?.email || session.role !== 'student') return NextResponse.json({ error: 'Student login required' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body || !uuid.test(body.problemId) || !uuid.test(body.requestId) || ![5,10,15,30].includes(body.minutes)
      || !Number.isInteger(body.expectedMinutes) || body.expectedMinutes < 0) {
      return NextResponse.json({ error: 'Invalid extension request' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin.rpc('extend_student_session', {
      p_problem_id: body.problemId, p_email: String(session.email).toLowerCase().trim(),
      p_minutes: body.minutes, p_request_id: body.requestId, p_expected_minutes: body.expectedMinutes,
    })
    if (error) {
      const message = error.code === 'P0001' ? error.message : 'Session extension unavailable. Please retry.'
      return NextResponse.json({ error: message }, { status: error.code === 'P0001' ? 409 : 503 })
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Session extension unavailable. Please retry.' }, { status: 503 })
  }
}

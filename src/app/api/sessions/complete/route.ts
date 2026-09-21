import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    const session = await decrypt((await cookies()).get('auth_token')?.value)
    if (!session?.email || session.role !== 'student') {
      return NextResponse.json({ error: 'Student login required' }, { status: 401 })
    }
    const { problemId } = await request.json()
    if (typeof problemId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(problemId)) {
      return NextResponse.json({ error: 'A valid session problem ID is required' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin.rpc('complete_student_session', {
      p_problem_id: problemId, p_email: session.email,
    })
    if (error) {
      console.error('Session settlement failed:', error.code)
      const status = error.code === 'P0001' ? 409 : 503
      return NextResponse.json({ error: status === 409 ? error.message : 'Session payment is temporarily unavailable' }, { status })
    }
    return NextResponse.json({ success: true, ...data })
  } catch {
    return NextResponse.json({ error: 'Unable to complete session payment' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { demoPlayback, demoSession } from '@/lib/teaching-demos-server'

export async function GET(request: Request) {
  const session = await demoSession()
  if (!session) return NextResponse.json({ error: 'Sign in to view teaching demos' }, { status: 401 })
  const params = new URL(request.url).searchParams
  try {
    let query = supabaseAdmin.from('tutor_teaching_demos').select('id,tutor_email,subject,topic,class_level,object_key,status')
    if (session.role === 'student') {
      // Resolve tutor and subject from a bid owned by this student, never from client claims.
      const { data: bid, error } = await supabaseAdmin.from('bids').select('tutor_email,problem_id').eq('id', params.get('bidId') || '').maybeSingle()
      if (error || !bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 })
      const { data: problem, error: problemError } = await supabaseAdmin.from('problems').select('subject')
        .eq('id', bid.problem_id).eq('student_email', session.email).maybeSingle()
      if (problemError || !problem) return NextResponse.json({ error: 'Bid not found' }, { status: 404 })
      query = query.eq('tutor_email', bid.tutor_email).eq('subject', problem.subject).eq('status', 'approved')
    } else if (session.role === 'admin' || session.role === 'tutor') {
      query = query.eq('id', params.get('id') || '').in('status', ['pending', 'approved', 'rejected'])
      if (session.role === 'tutor') query = query.eq('tutor_email', session.email)
    } else return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    const { data: demo, error } = await query.maybeSingle()
    if (error) throw error
    if (!demo) return NextResponse.json({ error: 'No approved teaching demo is available for this subject yet.' }, { status: 404 })
    return NextResponse.json({ url: await demoPlayback(demo.object_key), topic: demo.topic, subject: demo.subject, classLevel: demo.class_level }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Video unavailable. Please retry.' }, { status: 503 }) }
}

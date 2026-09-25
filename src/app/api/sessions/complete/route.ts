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
    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid review' }, { status: 400 })
    const { problemId, rating, feedback, dispute, tags } = body
    if (typeof problemId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(problemId)) {
      return NextResponse.json({ error: 'A valid session problem ID is required' }, { status: 400 })
    }
    if (!Number.isInteger(rating) || rating < 0 || rating > 5 || (rating === 0 && !(typeof dispute === 'string' && dispute.trim()))) {
      return NextResponse.json({ error: 'Choose a rating or provide a dispute reason' }, { status: 400 })
    }
    const allowedTags = ['Explained clearly', 'Patient teacher', 'On time', 'Good use of whiteboard', 'Solved my exact problem']
    const selectedTags = Array.isArray(tags) ? allowedTags.filter(tag => tags.includes(tag)) : []
    const savedFeedback = [selectedTags.length ? `Highlights: ${selectedTags.join(', ')}` : '', typeof feedback === 'string' ? feedback.trim() : ''].filter(Boolean).join('\n').slice(0, 4000)
    const { data, error } = await supabaseAdmin.rpc('submit_session_review', {
      p_problem_id: problemId, p_email: session.email, p_rating: rating, p_feedback: savedFeedback, p_dispute: typeof dispute === 'string' ? dispute.slice(0,1000) : null,
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

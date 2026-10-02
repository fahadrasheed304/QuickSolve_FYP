import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    const profile = await DB.getTutorProfile(session.email as string)
    if (!profile) {
      return NextResponse.json({ error: 'Tutor profile not found' }, { status: 404 })
    }

    if (profile.verification_status !== 'verified' && profile.verification_stage !== 'verified') {
      return NextResponse.json({ problems: [] })
    }

    if (profile.is_available === false || profile.conduct_status === 'restricted') {
      return NextResponse.json({ problems: [] })
    }

    const subjects = Array.isArray(profile.subjects) ? profile.subjects : []
    const problems = await DB.getOpenProblemsForTutors(subjects)

    const emails = [...new Set(problems.map(problem => problem.student_email.toLowerCase().trim()))]
    const { data: ratings, error: ratingsError } = emails.length
      ? await supabaseAdmin.rpc('get_student_ratings', { p_emails: emails }) : { data: [], error: null }
    const { data: students } = emails.length
      ? await supabaseAdmin.from('users').select('email, fullname').in('email', emails)
      : { data: [] }
    return NextResponse.json({ problems: problems.map(problem => {
      const email = problem.student_email.toLowerCase().trim()
      const rating = ratings?.find((row: { student_email: string }) => row.student_email.toLowerCase().trim() === email)
      const student = students?.find((row: { email: string }) => row.email.toLowerCase().trim() === email)
      return { ...problem, student_name: student?.fullname || null, student_rating: rating?.rating ?? null, student_review_count: rating?.review_count ?? 0, student_rating_available: !ratingsError }
    }) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    console.error('Tutor open problems error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { getTestRetakeInfo } from '@/lib/test-retake'

// GET /api/tutor/test/questions
// Get test questions for tutor's selected subjects
export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await decrypt(token)
    if (!session?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Get tutor profile to check subjects
    const profile = await DB.getTutorProfile(session.email as string)
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check if tutor is allowed to take test
    const allowedStatuses = ['pending', 'under_review', 'test_invited', 'test_failed']
    if (!allowedStatuses.includes(profile.verification_stage || '')) {
      return NextResponse.json({
        error: 'Not eligible for test',
        stage: profile.verification_stage
      }, { status: 403 })
    }

    if (profile.verification_stage === 'test_failed') {
      const retakeInfo = getTestRetakeInfo(profile.last_test_date)
      if (!retakeInfo.canRetake) {
        return NextResponse.json({
          error: retakeInfo.message,
          stage: profile.verification_stage,
          retakeAvailableAt: retakeInfo.retakeAvailableAt,
          remainingMs: retakeInfo.remainingMs,
        }, { status: 403 })
      }
    }

    // Get subjects
    const subjects = profile.subjects || []
    if (subjects.length === 0) {
      return NextResponse.json({ error: 'No subjects selected' }, { status: 400 })
    }

    // Fetch profile photo document for face verification
    const documents = await DB.getDocuments(session.email as string)
    const profilePhotoDoc = documents.find((d: any) => d.document_type === 'profile_photo')
    const profilePhotoUrl = profilePhotoDoc ? profilePhotoDoc.document_url : null

    // Get questions for subjects (40 questions, 30 sec each = 20 minutes)
    const questions = await DB.getTestQuestions(subjects, 40)

    // If no questions found in DB, return an error
    if (questions.length === 0) {
      return NextResponse.json({ error: 'No test questions available for the selected subjects at the moment.' }, { status: 404 })
    }

    // Format to match UI expectations
    const formattedQuestions = questions.map((q: any) => ({
      id: q.id,
      subject: q.subject,
      question: q.question_text,
      options: [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean),
      // We don't send correct answers to the client for security,
      // but for this mock implementation we'll omit it or keep it undefined on client
    }))

    const totalSeconds = questions.reduce((acc: number, q: any) => acc + (q.time_seconds || 30), 0)

    return NextResponse.json({
      questions: formattedQuestions,
      timeLimit: totalSeconds, // UI expects timeLimit in seconds
      passingScore: 80,
      profilePhotoUrl
    })

  } catch (error: any) {
    console.error('Get test questions error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get test questions' },
      { status: 500 }
    )
  }
}

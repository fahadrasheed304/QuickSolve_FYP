import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { getTutorVerificationState } from '@/lib/tutor-verification'
import { getCurrentTutorDocuments } from '@/lib/tutor-documents'
import { getTestRetakeInfo } from '@/lib/test-retake'

const getTestAttemptFingerprint = (result: any) => [
  result.total_questions,
  result.correct_answers,
  result.wrong_answers,
  result.skipped_questions,
  Math.round(Number(result.score_percentage || 0)),
  result.test_status || 'completed',
  result.time_taken_seconds || 0,
].join(':')

const countUniqueTestAttempts = (results: any[]) => {
  const sortedResults = [...results].sort((a, b) => {
    return new Date(a.test_date || 0).getTime() - new Date(b.test_date || 0).getTime()
  })
  const uniqueAttempts: any[] = []

  for (const result of sortedResults) {
    const resultTime = new Date(result.test_date || 0).getTime()
    const resultFingerprint = getTestAttemptFingerprint(result)
    const isDuplicate = uniqueAttempts.some((attempt) => {
      const attemptTime = new Date(attempt.test_date || 0).getTime()
      return Math.abs(resultTime - attemptTime) <= 60_000 &&
        getTestAttemptFingerprint(attempt) === resultFingerprint
    })

    if (!isDuplicate) uniqueAttempts.push(result)
  }

  return uniqueAttempts.length
}

// GET /api/tutor/verification-status
// Get current tutor verification status
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
    
    const profile = await DB.getTutorProfile(session.email as string)
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    
    // Get counts
    const degrees = await DB.getDegrees(session.email as string)
    const documents = getCurrentTutorDocuments(await DB.getDocuments(session.email as string))
    const uniqueDocumentsCount = documents.length
    const verification = getTutorVerificationState(profile, degrees, documents)

    if (!verification.isSubmitted) {
      return NextResponse.json({
        requiresProfileCompletion: true,
        status: 'not_started',
        stage: 'not_started',
        message: 'Please complete and submit your tutor profile first.',
        stats: {
          degreesCount: degrees.length,
          documentsCount: uniqueDocumentsCount,
          testResultsCount: 0,
        },
      }, { status: 409 })
    }

    const testResults = await DB.getTestResults(session.email as string)
    const uniqueTestAttempts = countUniqueTestAttempts(testResults)
    const notes = await DB.getVerificationNotes(session.email as string)
    const retakeInfo = getTestRetakeInfo(profile.last_test_date)
    
    // Status messages for each stage
    const stageMessages: Record<string, string> = {
      'submitted': 'Your application has been submitted and is waiting for review.',
      'pending': 'Your documents are pending review by our admin team.',
      'under_review': 'An admin is currently reviewing your documents and degrees.',
      'test_invited': 'Great! You are invited to take the subject proficiency test.',
      'test_scheduled': 'Your test has been scheduled. Please prepare!',
      'test_passed': 'Congratulations! You passed the test. Final verification in progress.',
      'test_failed': 'You did not pass the test. You can retake after 7 days.',
      'verified': 'You are fully verified! You can now start teaching.',
      'rejected': 'Your application was rejected. Please contact support.',
    }
    
    return NextResponse.json({
      status: verification.status,
      stage: verification.stage,
      message: verification.stage === 'test_failed' && !retakeInfo.canRetake
        ? retakeInfo.message
        : stageMessages[verification.stage] || stageMessages.submitted,
      canTakeTest: verification.stage === 'test_invited' ||
        (verification.stage === 'test_failed' && retakeInfo.canRetake),
      canRetakeTest: verification.stage === 'test_failed' && retakeInfo.canRetake,
      retakeAvailableAt: verification.stage === 'test_failed' ? retakeInfo.retakeAvailableAt : null,
      retakeRemainingMs: verification.stage === 'test_failed' ? retakeInfo.remainingMs : 0,
      testAttempts: uniqueTestAttempts,
      lastTestScore: profile.subject_test_score,
      testPassed: profile.subject_test_passed,
      stats: {
        degreesCount: degrees.length,
        documentsCount: uniqueDocumentsCount,
        testResultsCount: uniqueTestAttempts,
      },
      adminNotes: notes.filter((n: any) => n.note_type === 'admin_to_tutor').map((n: any) => n.message),
    })
    
  } catch (error: any) {
    console.error('Get verification status error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get status' },
      { status: 500 }
    )
  }
}

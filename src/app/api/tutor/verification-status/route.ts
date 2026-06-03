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
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
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

// POST /api/tutor/test/submit
// Submit test results
export async function POST(request: Request) {
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

    if (profile.verification_stage === 'test_failed') {
      const retakeInfo = getTestRetakeInfo(profile.last_test_date)
      if (!retakeInfo.canRetake) {
        return NextResponse.json({
          error: retakeInfo.message,
          retakeAvailableAt: retakeInfo.retakeAvailableAt,
          remainingMs: retakeInfo.remainingMs,
        }, { status: 403 })
      }
    }
    
    const body = await request.json()
    const {
      answers,  // Array of {questionId, answerGiven, timeTaken}
      tabSwitches,
      warningsGiven,
      testStatus,
      timeTakenSeconds,
    } = body
    
    // Validate answers
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json({ error: 'Answers are required' }, { status: 400 })
    }
    
    const getCorrectAnswerValue = (question: any) => {
      const correct = String(question.correct_answer || '').trim()
      const optionMap: Record<string, string> = {
        A: question.option_a,
        B: question.option_b,
        C: question.option_c,
        D: question.option_d,
      }

      return optionMap[correct.toUpperCase()] || correct
    }

    // Check each answer
    let correctCount = 0
    let wrongCount = 0
    let skippedCount = 0
    const detailedAnswers = []
    
    for (const answer of answers) {
      const question = await DB.getQuestionById(answer.questionId)
      if (!question) continue
      
      const isSkipped = !answer.answerGiven || answer.answerGiven === ''
      const correctAnswerValue = getCorrectAnswerValue(question)
      const isCorrect = !isSkipped && (
        String(answer.answerGiven).trim().toLowerCase() === String(question.correct_answer).trim().toLowerCase() ||
        String(answer.answerGiven).trim().toLowerCase() === String(correctAnswerValue).trim().toLowerCase()
      )
      
      if (isSkipped) {
        skippedCount++
      } else if (isCorrect) {
        correctCount++
      } else {
        wrongCount++
      }
      
      detailedAnswers.push({
        questionId: answer.questionId,
        answerGiven: answer.answerGiven || 'SKIPPED',
        correctAnswer: correctAnswerValue,
        isCorrect,
        isSkipped,
        timeTaken: answer.timeTaken || 30,
      })
    }
    
    const totalQuestions = answers.length
    const scorePercentage = (correctCount / totalQuestions) * 100
    const passingScore = 80
    const passed = scorePercentage >= passingScore
    
    // If test was cancelled due to cheating
    const finalStatus = testStatus === 'cancelled' ? 'cancelled' : 'completed'
    const finalPassed = finalStatus === 'cancelled' ? false : passed
    const priorResults = await DB.getTestResults(session.email as string)
    const currentFingerprint = [
      totalQuestions,
      correctCount,
      wrongCount,
      skippedCount,
      Math.round(scorePercentage),
      finalStatus,
      timeTakenSeconds || 0,
    ].join(':')
    const recentDuplicate = priorResults.find((result: any) => {
      const resultTime = new Date(result.test_date || 0).getTime()
      return Date.now() - resultTime <= 60_000 &&
        getTestAttemptFingerprint(result) === currentFingerprint
    })

    if (recentDuplicate) {
      return NextResponse.json({
        success: true,
        duplicateIgnored: true,
        result: {
          totalQuestions,
          correctAnswers: correctCount,
          wrongAnswers: wrongCount,
          skippedQuestions: skippedCount,
          scorePercentage: Math.round(scorePercentage),
          passed: finalPassed,
          testStatus: finalStatus,
        },
      })
    }
    
    // Save test result
    await DB.saveTestResult({
      tutorEmail: session.email as string,
      questions: detailedAnswers,
      totalQuestions,
      correctAnswers: correctCount,
      wrongAnswers: wrongCount,
      skippedQuestions: skippedCount,
      scorePercentage,
      passed: finalPassed,
      tabSwitches: tabSwitches || 0,
      warningsGiven: warningsGiven || 0,
      testStatus: finalStatus,
      timeTakenSeconds: timeTakenSeconds || 0,
    })
    const allResults = await DB.getTestResults(session.email as string)
    const uniqueTestAttempts = countUniqueTestAttempts(allResults)
    
    // Update tutor profile
    await DB.updateTutorProfile(session.email as string, {
      test_attempts: uniqueTestAttempts,
      last_test_date: new Date().toISOString(),
      subject_test_score: Math.round(scorePercentage),
      subject_test_passed: finalPassed,
      verification_stage: finalPassed ? 'test_passed' : 'test_failed',
      verification_status: finalPassed ? 'under_review' : 'pending',
    })
    
    // Add note
    if (finalPassed) {
      await DB.addVerificationNote(session.email as string, {
        noteType: 'system',
        message: `Test passed with ${Math.round(scorePercentage)}%. Waiting for final admin verification.`,
        createdBy: 'system',
      })
    } else {
      await DB.addVerificationNote(session.email as string, {
        noteType: 'system',
        message: finalStatus === 'cancelled' 
          ? 'Test cancelled due to cheating detection (tab switches).' 
          : `Test failed with ${Math.round(scorePercentage)}%. Required 80% to pass. Can retake.`,
        createdBy: 'system',
      })
    }
    
    return NextResponse.json({
      success: true,
      result: {
        totalQuestions,
        correctAnswers: correctCount,
        wrongAnswers: wrongCount,
        skippedQuestions: skippedCount,
        scorePercentage: Math.round(scorePercentage),
        passed: finalPassed,
        testStatus: finalStatus,
      },
    })
    
  } catch (error: any) {
    console.error('Submit test error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to submit test' },
      { status: 500 }
    )
  }
}

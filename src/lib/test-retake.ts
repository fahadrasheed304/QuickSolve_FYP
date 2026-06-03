export const TEST_RETAKE_WAIT_MS = 7 * 24 * 60 * 60 * 1000

export function getTestRetakeInfo(lastTestDate?: string | null) {
  if (!lastTestDate) {
    return {
      canRetake: true,
      retakeAvailableAt: null,
      remainingMs: 0,
      message: 'You can retake the subject test now.',
    }
  }

  const lastAttemptTime = new Date(lastTestDate).getTime()
  if (Number.isNaN(lastAttemptTime)) {
    return {
      canRetake: true,
      retakeAvailableAt: null,
      remainingMs: 0,
      message: 'You can retake the subject test now.',
    }
  }

  const retakeAvailableAt = new Date(lastAttemptTime + TEST_RETAKE_WAIT_MS)
  const remainingMs = retakeAvailableAt.getTime() - Date.now()

  if (remainingMs <= 0) {
    return {
      canRetake: true,
      retakeAvailableAt: retakeAvailableAt.toISOString(),
      remainingMs: 0,
      message: 'You can retake the subject test now.',
    }
  }

  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))

  return {
    canRetake: false,
    retakeAvailableAt: retakeAvailableAt.toISOString(),
    remainingMs,
    message: `You can retake this test after ${remainingDays} day${remainingDays === 1 ? '' : 's'}.`,
  }
}

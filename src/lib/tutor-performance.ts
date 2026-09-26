export type PerformanceSession = {
  problem_id: string; rating: number; feedback: string | null; status: string; dispute: string | null
}

// Input is the latest 20 payment records, newest first. Unrated sessions never
// count as zero-star reviews; an unresolved dispute is not a finding of fault.
export function evaluateTutorPerformance(sessions: PerformanceSession[]) {
  const rated = sessions.filter(row => row.rating >= 1 && row.rating <= 5)
  const average = rated.length ? rated.reduce((sum, row) => sum + row.rating, 0) / rated.length : null
  const lowRatings = rated.filter(row => row.rating <= 3).length
  const refunded = sessions.filter(row => row.status === 'refunded').length
  const resolved = sessions.filter(row => ['released', 'refunded'].includes(row.status)).length
  const openDisputes = sessions.filter(row => row.status === 'held' && row.dispute?.trim()).length
  const refundRate = resolved ? refunded / resolved : 0
  const reasons: string[] = []
  if (rated.length >= 5 && average !== null && average < 3.5) reasons.push('Average rating is below 3.5/5.')
  if (resolved >= 5 && refundRate >= 0.3) reasons.push('At least 30% of resolved payments were refunded; review session context.')
  const status = reasons.length ? 'Needs attention' : rated.length < 5 ? 'Not enough feedback'
    : average !== null && average >= 4.5 && refunded === 0 && openDisputes === 0 ? 'Excellent' : 'Good standing'
  return {
    status, reasons, sessions: sessions.length, reviews: rated.length,
    average: average === null ? null : Math.round(average * 100) / 100,
    lowRatings, released: sessions.filter(row => row.status === 'released').length,
    refunded, openDisputes, pending: sessions.filter(row => row.status === 'pending').length,
    held: sessions.filter(row => row.status === 'held').length,
    feedback: sessions.filter(row => row.feedback?.trim()).slice(0, 5).map(row => ({
      problemId: row.problem_id, rating: row.rating, text: row.feedback,
    })),
  }
}
export type TutorPerformance = ReturnType<typeof evaluateTutorPerformance>

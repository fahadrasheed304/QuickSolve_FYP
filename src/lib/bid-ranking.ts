export type RankingEvidence = {
  rating: number | null; reviews: number; released: number; refunded: number
  testPassed: boolean; testScore: number | null
}

export function rankTutor(evidence: RankingEvidence) {
  const reviews = Math.max(0, Number(evidence.reviews) || 0)
  const rating = Number(evidence.rating)
  const validRating = reviews > 0 && Number.isFinite(rating) && rating >= 1 && rating <= 5
  // Five neutral prior reviews prevent a single review dominating established tutors.
  const ratingScore = validRating ? ((rating * reviews + 3.5 * 5) / (reviews + 5)) * 20 : 70
  const released = Math.max(0, evidence.released), refunded = Math.max(0, evidence.refunded)
  // Only resolved outcomes count. Pending disputes are not findings against tutors.
  const outcomeScore = ((released + 4) / (released + refunded + 5)) * 100
  const hasTest = evidence.testPassed && evidence.testScore !== null && Number.isFinite(evidence.testScore)
    && evidence.testScore >= 80 && evidence.testScore <= 100
  const testScore = hasTest ? evidence.testScore! : 70
  return {
    score: Math.round((ratingScore * 0.6 + outcomeScore * 0.25 + testScore * 0.15) * 100) / 100,
    reviews, rating: validRating ? rating : null,
    test: hasTest ? 'Subject test passed' : 'Admin verified; no qualifying test result',
    reasons: [validRating ? `${rating}/5 from ${reviews} reviews` : 'New tutor: neutral rating baseline',
      `${released} released / ${released + refunded} resolved recent session payments`,
      hasTest ? `Subject test: ${evidence.testScore}%` : 'Neutral test baseline for admin verification'],
  }
}
export type BidRanking = ReturnType<typeof rankTutor>

export function compareRankedBids(a: { id: string; created_at?: string; ranking?: BidRanking }, b: { id: string; created_at?: string; ranking?: BidRanking }) {
  return (b.ranking?.score ?? -1) - (a.ranking?.score ?? -1)
    || (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id)
}

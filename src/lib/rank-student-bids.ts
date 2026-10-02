import { supabaseAdmin } from '@/lib/supabase'
import { compareRankedBids, rankTutor, type BidRanking } from '@/lib/bid-ranking'

type Bid = { id: string; tutor_email?: string; created_at?: string; tutor_rating?: number; status?: string; qualification?: string; ranking?: BidRanking }
type Problem = { status: string; bids?: Bid[] }

export async function rankStudentBids<T extends Problem>(problems: T[]): Promise<T[]> {
  const emails = [...new Set(problems.filter(p => p.status === 'open').flatMap(p => (p.bids || [])
    .filter(b => !b.status || b.status === 'pending').map(b => b.tutor_email?.toLowerCase().trim()).filter((email): email is string => !!email)))]
  const rankings = new Map<string, BidRanking>()
  const qualifications = new Map<string, string>()
  // Bound network concurrency and batch size even when a student has many bids.
  for (let offset = 0; offset < emails.length; offset += 5) {
    const batch = emails.slice(offset, offset + 5)
    const { data: profiles, error } = await supabaseAdmin.from('tutor_profiles')
      .select('user_email,verification_status,verification_stage,subject_test_passed,subject_test_score,conduct_status').in('user_email', batch)
    if (error) throw new Error('Tutor ranking unavailable')
    const { data: degrees, error: degreeError } = await supabaseAdmin.from('tutor_degrees')
      .select('tutor_email,degree_name,institution,year_completed').in('tutor_email', batch)
      .order('year_completed', { ascending: false })
    if (degreeError) throw new Error('Tutor qualification unavailable')
    for (const degree of degrees || []) {
      const email = degree.tutor_email.toLowerCase().trim()
      if (qualifications.has(email)) continue
      qualifications.set(email, [degree.degree_name, degree.institution].filter(Boolean).join(' · ') || 'Qualification not listed')
    }
    await Promise.all(batch.map(async email => {
      const profile = profiles?.find(p => p.user_email.toLowerCase().trim() === email)
      if (!profile || profile.conduct_status === 'restricted' || (profile.verification_status !== 'verified' && profile.verification_stage !== 'verified')) return
      const [rating, payments] = await Promise.all([
        supabaseAdmin.rpc('get_tutor_rating', { p_email: email }),
        supabaseAdmin.from('session_payments').select('status').eq('tutor_email', email)
          .order('release_at', { ascending: false }).order('problem_id', { ascending: false }).limit(20),
      ])
      if (rating.error || payments.error || !rating.data) throw new Error('Tutor ranking unavailable')
      rankings.set(email, rankTutor({ rating: rating.data.rating === null ? null : Number(rating.data.rating),
        reviews: Number(rating.data.review_count),
        released: (payments.data || []).filter(p => p.status === 'released').length,
        refunded: (payments.data || []).filter(p => p.status === 'refunded').length,
        testPassed: profile.subject_test_passed === true,
        testScore: profile.subject_test_score == null ? null : Number(profile.subject_test_score),
      }))
    }))
  }
  return problems.map(problem => problem.status !== 'open' ? problem : ({ ...problem,
    bids: (problem.bids || []).filter(bid => (!bid.status || bid.status === 'pending') && rankings.has(bid.tutor_email?.toLowerCase().trim() || ''))
      .map(bid => { const email = bid.tutor_email!.toLowerCase().trim(); const ranking = rankings.get(email)!; return { ...bid, tutor_rating: ranking.rating ?? 0, qualification: qualifications.get(email) || 'Qualification not listed', ranking } })
      .sort(compareRankedBids)
      .map(({ ranking: _ranking, ...bid }) => bid),
  }))
}

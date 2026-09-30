import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
// Page through records so totals do not silently stop at Supabase's row limit.
async function records(table: string, fields: string, column: string, email: string) {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin.from(table).select(fields).eq(column, email)
      .order(['session_payments','student_reviews'].includes(table) ? 'problem_id' : 'id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...((data || []) as unknown as Record<string, unknown>[]))
    if (!data || data.length < 500) return rows
  }
}

export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session) return Response.json({ error: 'Admin login required.' }, { status: 401 })
  if (session.role !== 'admin' || typeof session.email !== 'string' || !isAdminEmail(session.email)) return Response.json({ error: 'Admin access required.' }, { status: 403 })
  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email || email.length > 254) return Response.json({ error: 'Select a user.' }, { status: 400 })
  try {
    const { data: user, error } = await supabaseAdmin.from('users').select('id,email,fullname,phone,role,created_at').eq('email', email).maybeSingle()
    if (error) throw error
    if (!user) return Response.json({ error: 'User not found.' }, { status: 404 })
    const settled = await Promise.allSettled([
      records('problems', 'id,subject,class,status,created_at,session_started_at,session_ended_at,accepted_bid_id', 'student_email', email),
      records('bids', 'id,status', 'tutor_email', email),
      records('session_payments', 'problem_id,student_email,tutor_email,amount,rating,feedback,dispute,status,release_at', 'student_email', email),
      records('session_payments', 'problem_id,student_email,tutor_email,amount,rating,feedback,dispute,status,release_at', 'tutor_email', email),
      supabaseAdmin.from('tutor_profiles').select('fullname,phone,city,cnic,bio,subjects,highest_education,university,experience_years,verification_status,verification_stage,is_available').eq('user_email', email).maybeSingle(),
      records('tutor_degrees', 'id,degree_name,institution,board_university,year_completed', 'tutor_email', email),
      records('test_results', 'id,score_percentage,passed,test_status,test_date,total_questions,correct_answers,wrong_answers,skipped_questions,time_taken_seconds', 'tutor_email', email),
      supabaseAdmin.from('role_wallets').select('role,balance').eq('user_email', email),
      records('tutor_documents', 'id,document_type,document_url,file_name,uploaded_at', 'tutor_email', email),
      records('student_reviews', 'problem_id,tutor_email,rating,feedback,created_at', 'student_email', email),
    ])
    // Missing data is reported as unavailable, never as a zero statistic.
    const warnings: string[] = []
    const names = ['Student sessions', 'Tutor sessions', 'Student payments', 'Tutor reviews', 'Tutor profile', 'Qualifications', 'Assessment results', 'Wallets', 'Documents', 'Student ratings']
    const values = settled.map((result, index) => {
      if (result.status === 'rejected') { warnings.push(names[index]); return null }
      const value = result.value
      if (Array.isArray(value)) return value
      if (value.error) { warnings.push(names[index]); return null }
      return value.data
    })
    const [studentSessions, bids, studentPayments, tutorPayments, profile, degrees, tests, wallets, documents, studentReviews] = values
    let tutorSessions: Record<string, unknown>[] | null = bids ? [] : null
    if (Array.isArray(bids) && bids.length) {
      try {
        for (let offset = 0; offset < bids.length; offset += 100) {
          const { data, error: problemError } = await supabaseAdmin.from('problems')
            .select('id,subject,class,status,created_at,session_started_at,session_ended_at,accepted_bid_id')
            .in('accepted_bid_id', (bids as Record<string, unknown>[]).slice(offset, offset + 100).map(bid => bid.id))
          if (problemError) throw problemError
          tutorSessions!.push(...(data || []))
        }
      } catch { tutorSessions = null; warnings.push('Tutor session history') }
    }
    return Response.json({ user, studentSessions, tutorSessions, studentPayments, tutorPayments, profile, degrees, tests, wallets, documents, studentReviews, warnings }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Account details could not be loaded. Please retry.' }, { status: 503 }) }
}

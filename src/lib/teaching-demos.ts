export const DEMO_MAX_BYTES = 50 * 1024 * 1024
export const DEMO_MAX_SECONDS = 300
export const DEMO_BUCKET = 'tutor-demos'
export const DEMO_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'General Science',
  'English', 'Urdu', 'Islamiat', 'Pak Studies', 'Mathematics (FSc)', 'Physics (FSc)',
  'Chemistry (FSc)', 'Biology (FSc)', 'Computer Science (ICS)', 'Statistics (ICS)',
  'Economics (FA/ICS)', 'Accounting (ICom)', 'Business Math (ICom)', 'Principles of Commerce (ICom)',
  'Education (FA)', 'Sociology (FA)', 'English (Compulsory)', 'Urdu (Compulsory)',
  'Islamic Studies (Compulsory)', 'Pakistan Studies (Compulsory)',
]
export const DEMO_CRITERIA = ['accuracy', 'clarity', 'example', 'communication'] as const
export type DemoScores = Record<typeof DEMO_CRITERIA[number], number>
export type TeachingDemo = {
  review_email_status?: 'not_required' | 'pending' | 'sending' | 'sent' | 'failed'
  id: string; subject: string; topic: string; class_level: string
  status: 'uploading' | 'pending' | 'approved' | 'rejected' | 'superseded' | 'cancelled'
  duration_seconds: number | null; feedback: string; scores: DemoScores | null; created_at: string
}

export function demoReviewReturnPath(id: string | null) {
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? `/tutor/waiting-verification?demo=${id}#teaching-demos` : null
}

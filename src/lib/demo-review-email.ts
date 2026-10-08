import { supabaseAdmin } from '@/lib/supabase'
import { sendMail } from '@/lib/mail'
import { getAppUrl } from '@/lib/app-url'
import { demoReviewReturnPath } from '@/lib/teaching-demos'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export async function sendDemoReviewEmail(id: string, request: Request) {
  const attemptedAt = new Date().toISOString()
  const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  // Claim a delivery once. A crashed request can be retried after five minutes.
  const { data: demo, error } = await supabaseAdmin.from('tutor_teaching_demos')
    .update({ review_email_status: 'sending', review_email_attempted_at: attemptedAt })
    .eq('id', id).eq('status', 'rejected')
    .or(`review_email_status.in.(pending,failed),and(review_email_status.eq.sending,review_email_attempted_at.lt.${stale})`)
    .select('id,tutor_email,subject,topic,feedback').maybeSingle()
  if (error) throw new Error('Could not prepare the review email')
  if (!demo) return 'unchanged' as const
  const path = demoReviewReturnPath(demo.id)
  if (!path) throw new Error('Invalid demo link')
  const link = `${getAppUrl(request)}${path}`
  const text = `Your ${demo.subject} teaching demo (${demo.topic}) needs changes.\n\nAdmin feedback:\n${demo.feedback}\n\nSign in to your tutor account and upload a revised demo:\n${link}\n\nYour other subject demos are unchanged.`
  let sent = false
  try {
    sent = await sendMail(demo.tutor_email, `QuickSolve: revise your ${demo.subject} teaching demo`, text,
      `<h2>Teaching demo: changes requested</h2><p><strong>Subject:</strong> ${escapeHtml(demo.subject)}<br><strong>Topic:</strong> ${escapeHtml(demo.topic)}</p><p><strong>Admin feedback:</strong></p><p style="white-space:pre-wrap">${escapeHtml(demo.feedback)}</p><p><a href="${escapeHtml(link)}">Upload revised demo</a></p><p>Sign in with your tutor account. Your other subject demos are unchanged.</p>`)
  } catch { sent = false }
  const status = sent ? 'sent' : 'failed'
  const { error: saveError } = await supabaseAdmin.from('tutor_teaching_demos').update({ review_email_status: status })
    .eq('id', id).eq('review_email_status', 'sending').eq('review_email_attempted_at', attemptedAt)
  if (saveError) throw new Error('Review saved, but email delivery status could not be saved. Refresh before retrying.')
  return status
}

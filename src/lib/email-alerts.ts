import { supabaseAdmin } from '@/lib/supabase'
import { sendMail } from '@/lib/mail'
import { getAppUrl } from '@/lib/app-url'
import { sendDemoReviewEmail } from '@/lib/demo-review-email'

export type EmailAlert = { id: string; recipient_email: string; subject: string; message: string; path: string; attempts: number; claim_token: string; expires_at?: string | null }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export function renderEmailAlert(alert: EmailAlert, baseUrl: string) {
  const base = new URL(baseUrl)
  const link = new URL(alert.path, base)
  if (!alert.path.startsWith('/') || alert.path.startsWith('//') || link.origin !== base.origin || !['https:', 'http:'].includes(link.protocol)) throw new Error('Invalid email link')
  return {
    text: `${alert.message}\n\nView your QuickSolve account:\n${link.href}\n\nThis is an automated account alert.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>${escapeHtml(alert.subject)}</h2><p style="white-space:pre-wrap">${escapeHtml(alert.message)}</p><p><a href="${escapeHtml(link.href)}">View your QuickSolve account</a></p><p style="color:#666">This is an automated account alert.</p></div>`,
  }
}

export async function deliverEmailAlerts(request: Request) {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) throw new Error('SMTP is not configured')
  const { data, error } = await supabaseAdmin.rpc('claim_email_alerts', { p_limit: 10 })
  if (error) throw new Error('Email queue unavailable; apply the email alerts migration')
  const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: demos, error: demoError } = await supabaseAdmin.from('tutor_teaching_demos').select('id')
    .eq('status', 'rejected')
    .or(`review_email_status.in.(pending,failed),and(review_email_status.eq.sending,review_email_attempted_at.lt.${stale})`)
    .order('review_email_attempted_at', { ascending: true, nullsFirst: true }).limit(5)
  if (demoError) throw new Error('Demo email retry queue unavailable')
  const resultsPromise = Promise.all((data as EmailAlert[] || []).map(async alert => {
    let sent = false
    try {
      if (alert.expires_at && Date.parse(alert.expires_at)<=Date.now()) throw new Error('Time-sensitive email expired')
      const content = renderEmailAlert(alert, getAppUrl(request))
      sent = await sendMail(alert.recipient_email, `QuickSolve: ${alert.subject}`, content.text, content.html)
    } catch { sent = false }
    const { error: saveError } = await supabaseAdmin.from('email_alerts').update({
      status: sent ? 'sent' : 'failed', sent_at: sent ? new Date().toISOString() : null,
      available_at: new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.min(alert.attempts - 1, 6)) * 1000).toISOString(),
    }).eq('id', alert.id).eq('status', 'sending').eq('claim_token', alert.claim_token)
    return sent && !saveError
  }))
  const demoResultsPromise = Promise.all((demos || []).map(async demo => {
    try { return await sendDemoReviewEmail(demo.id, request) } catch { return 'failed' }
  }))
  const [results, demoResults] = await Promise.all([resultsPromise, demoResultsPromise])
  const deliveries = [...results, ...demoResults.filter(result => result !== 'unchanged').map(result => result === 'sent')]
  return { processed: deliveries.length, sent: deliveries.filter(Boolean).length, failed: deliveries.filter(result => !result).length }
}

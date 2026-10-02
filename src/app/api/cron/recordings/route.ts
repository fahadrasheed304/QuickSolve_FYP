import { timingSafeEqual } from 'crypto'
import { maintainRecordings } from '@/lib/recordings'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const received = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    // Classify completed/abandoned sessions before evaluating evidence retention.
    const { error } = await supabaseAdmin.rpc('prepare_session_payments')
    if (error) throw new Error('Session settlement unavailable')
    const result = await maintainRecordings()
    return Response.json(result, { status: result.failures.length ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Recording maintenance failed; retry the job' }, { status: 503 })
  }
}

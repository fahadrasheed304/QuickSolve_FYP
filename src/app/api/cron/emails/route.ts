import { timingSafeEqual } from 'crypto'
import { deliverEmailAlerts } from '@/lib/email-alerts'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const received = Buffer.from(request.headers.get('authorization') || '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await deliverEmailAlerts(request)
    return Response.json(result, { status: result.failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Email delivery job failed:', error)
    return Response.json({ error: 'Email delivery unavailable; check configuration and retry' }, { status: 503 })
  }
}

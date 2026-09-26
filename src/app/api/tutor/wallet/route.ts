import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function dateFilter(value: string | null) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error()
  const date = new Date(value + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error()
  return date
}

export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session || typeof session.email !== 'string' || session.role !== 'tutor') {
    return Response.json({ error: 'Tutor login required' }, { status: 401 })
  }
  let filters
  try {
    const params = new URL(request.url).searchParams
    const type = params.get('type') || 'all'
    if (!['all', 'credit', 'debit'].includes(type)) throw new Error()
    const from = dateFilter(params.get('from')), to = dateFilter(params.get('to'))
    if (from && to && from > to) throw new Error()
    if (to) to.setUTCDate(to.getUTCDate() + 1)
    const raw = params.get('cursor')
    if (raw && raw.length > 250) throw new Error()
    const cursor = raw ? JSON.parse(raw) : null
    if (raw && (!cursor || typeof cursor.date !== 'string' || typeof cursor.id !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.date)
      || !Number.isFinite(Date.parse(cursor.date))
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id))) throw new Error()
    filters = { p_email: session.email.toLowerCase().trim(), p_type: type,
      p_from: from?.toISOString() || null, p_until: to?.toISOString() || null,
      p_before: cursor?.date || null, p_before_id: cursor?.id || null, p_limit: 25 }
  } catch {
    return Response.json({ error: 'Invalid filters. Check dates, transaction type and page cursor.' }, { status: 400 })
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('get_tutor_wallet_history', filters)
    if (error || !data) throw new Error()
    if (data.balance === null) return Response.json({ error: 'Tutor wallet not found. Please contact support.' }, { status: 404 })
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Wallet unavailable. Please retry shortly.' }, { status: 503 })
  }
}

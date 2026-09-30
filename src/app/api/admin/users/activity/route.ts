import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const sources = {
  requests: { table: 'problems', owner: 'student_email', fields: 'id,subject,class,status,offer_price,duration_min,created_at,session_started_at,session_ended_at', statuses: ['open', 'accepted', 'completed', 'cancelled', 'expired'] },
  bids: { table: 'bids', owner: 'tutor_email', fields: 'id,problem_id,status,price,duration_min,created_at', statuses: ['pending', 'accepted', 'rejected', 'cancelled'] },
  transactions: { table: 'wallet_transactions', owner: 'user_email', fields: 'id,user_role,type,amount,method,description,status,created_at', statuses: ['pending', 'completed', 'failed'] },
} as const

export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session) return Response.json({ error: 'Login required.' }, { status: 401 })
  if (session.role !== 'admin' || typeof session.email !== 'string' || !isAdminEmail(session.email)) return Response.json({ error: 'Admin access required.' }, { status: 403 })
  const params = new URL(request.url).searchParams
  const email = params.get('email')?.trim().toLowerCase()
  const kind = params.get('kind') || 'requests'
  const status = params.get('status') || 'all'
  const role = params.get('role') || 'all'
  const page = Number(params.get('page') || 0)
  if (!email || email.length > 254 || !Object.hasOwn(sources, kind) || !Number.isSafeInteger(page) || page < 0 || page > 100000 || !['all','student','tutor'].includes(role)) return Response.json({ error: 'Invalid activity filters.' }, { status: 400 })
  const source = sources[kind as keyof typeof sources]
  if (status !== 'all' && !(source.statuses as readonly string[]).includes(status)) return Response.json({ error: 'Invalid activity status.' }, { status: 400 })
  try {
    const account = await supabaseAdmin.from('users').select('id').eq('email', email).maybeSingle()
    if (account.error) throw account.error
    if (!account.data) return Response.json({ error: 'User not found.' }, { status: 404 })
    let query = supabaseAdmin.from(source.table).select(source.fields, { count: 'exact' }).eq(source.owner, email)
    if (status !== 'all') query = query.eq('status', status)
    if (kind === 'transactions' && role !== 'all') query = query.eq('user_role', role)
    const { data, count, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 20, page * 20 + 19)
    if (error) throw error
    return Response.json({ records: data || [], count: count || 0, page }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Activity history unavailable. Please retry.' }, { status: 503 }) }
}

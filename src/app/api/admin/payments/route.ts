import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function adminAccount() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  return session?.role === 'admin' && typeof session.email === 'string' && isAdminEmail(session.email)
    ? session.email.toLowerCase().trim() : null
}

export async function GET(request: Request) {
  if (!await adminAccount()) return Response.json({ error: 'Admin login required' }, { status: 403 })
  const params = new URL(request.url).searchParams
  const status = params.get('status') || 'held'
  const page = Number(params.get('page') || 0)
  if (!['held', 'pending', 'released', 'refunded'].includes(status) || !Number.isSafeInteger(page) || page < 0 || page > 100000) {
    return Response.json({ error: 'Invalid payment filter' }, { status: 400 })
  }
  const { data, count, error } = await supabaseAdmin.from('session_payments')
    .select('*', { count: 'exact' })
    .eq('status', status).order('release_at', { ascending: true }).order('problem_id').range(page * 25, page * 25 + 24)
  if (error) return Response.json({ error: 'Payments could not be loaded' }, { status: 503 })
  if (!data?.length) return Response.json({ payments: [], count: count || 0, page }, { headers: { 'Cache-Control': 'no-store' } })
  const { data: problems, error: problemError } = await supabaseAdmin.from('problems')
    .select('id,subject,class,accepted_bid_id,session_started_at,session_ended_at,extension_minutes').in('id', data.map(payment => payment.problem_id))
  if (problemError) return Response.json({ error: 'Session details could not be loaded' }, { status: 503 })
  const bidIds = (problems || []).map(problem => problem.accepted_bid_id).filter(Boolean)
  const { data: bids, error: bidError } = bidIds.length ? await supabaseAdmin.from('bids').select('id,duration_min,price').in('id', bidIds) : { data: [], error: null }
  if (bidError) return Response.json({ error: 'Session pricing could not be loaded' }, { status: 503 })
  const byId = new Map((problems || []).map(problem => [problem.id, { ...problem, bid: bids?.find(bid => bid.id === problem.accepted_bid_id) || null }]))
  return Response.json({ payments: data.map(payment => ({ ...payment, problem: byId.get(payment.problem_id) || null })), count, page }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const admin = await adminAccount()
  if (!admin) return Response.json({ error: 'Admin login required' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.problemId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.problemId)
    || !['release', 'refund'].includes(body.action) || typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.length > 2000) {
    return Response.json({ error: 'Choose an action and write a resolution note (5–2000 characters)' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.rpc('resolve_session_payment', {
    p_problem_id: body.problemId, p_action: body.action, p_admin: admin, p_note: body.note.trim(),
  })
  if (error) return Response.json({ error: error.code === 'P0001' ? error.message : 'Payment resolution failed. Please retry.' }, { status: error.code === 'P0001' ? 409 : 503 })
  return Response.json({ payment: data })
}

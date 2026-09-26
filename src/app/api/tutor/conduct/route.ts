import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
async function account() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (typeof session?.email !== 'string') return null
  return { email: session.email.toLowerCase().trim(), role: session.role,
    admin: session.role === 'admin' && isAdminEmail(session.email) }
}
export async function GET(request: Request) {
  const user = await account()
  if (!user) return Response.json({ error: 'Login required' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const page = Number(params.get('page') || 0)
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000000) return Response.json({ error: 'Invalid page' }, { status: 400 })
  const requested = params.get('tutorEmail')?.toLowerCase().trim()
  if (!user.admin && (user.role !== 'tutor' || (requested && requested !== user.email) || params.has('queue'))) {
    return Response.json({ error: 'Access denied' }, { status: 403 })
  }
  try {
    if (user.admin && params.has('queue')) {
      const { data, count, error } = await supabaseAdmin.from('tutor_conduct').select('*', { count: 'exact' })
        .in('status', ['flagged', 'restricted']).order('updated_at', { ascending: false }).order('tutor_email').range(page * 25, page * 25 + 24)
      if (error) throw error
      return Response.json({ tutors: data, count }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const email = user.admin ? requested : user.email
    if (!email) return Response.json({ error: 'Select a tutor' }, { status: 400 })
    const [state, events] = await Promise.all([
      supabaseAdmin.from('tutor_conduct').select('status,reason,violations,updated_at').eq('tutor_email', email).maybeSingle(),
      supabaseAdmin.from('tutor_conduct_events').select('id,action,reason,created_at', { count: 'exact' }).eq('tutor_email', email)
        .order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19),
    ])
    if (state.error || events.error) throw new Error()
    return Response.json({ conduct: state.data || { status: 'clear', reason: '', violations: 0 }, events: events.data, count: events.count }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Conduct review unavailable. Please retry.' }, { status: 503 }) }
}
export async function POST(request: Request) {
  const user = await account()
  if (!user?.admin) return Response.json({ error: 'Admin access required' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.email !== 'string' || !body.email.trim() || body.email.length > 320
    || !['clear', 'restrict', 'violation'].includes(body.action) || typeof body.note !== 'string'
    || body.note.trim().length < 10 || body.note.length > 2000 || typeof body.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId)) {
    return Response.json({ error: 'Choose an action and enter a reason (10–2000 characters).' }, { status: 400 })
  }
  try {
    const { data, error } = await supabaseAdmin.rpc('admin_tutor_conduct', {
      p_email: body.email.toLowerCase().trim(), p_action: body.action, p_note: body.note.trim(), p_actor: user.email, p_request: body.requestId,
    })
    if (error) return Response.json({ error: error.code === 'P0001' ? error.message : 'Decision unavailable. Retry the same decision.' }, { status: error.code === 'P0001' ? 409 : 503 })
    return Response.json({ conduct: data })
  } catch { return Response.json({ error: 'Decision unavailable. Retry the same decision.' }, { status: 503 }) }
}

import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { RoomServiceClient } from 'livekit-server-sdk'

export const dynamic = 'force-dynamic'
async function admin() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  return session?.role === 'admin' && typeof session.email === 'string' && isAdminEmail(session.email) ? session.email.toLowerCase().trim() : null
}
export async function GET(request: Request) {
  if (!await admin()) return Response.json({ error: 'Admin access required.' }, { status: 403 })
  const params = new URL(request.url).searchParams
  const email = params.get('email')?.toLowerCase().trim()
  const page = Number(params.get('page') || 0)
  if (!email || email.length > 254 || !Number.isSafeInteger(page) || page < 0 || page > 100000) return Response.json({ error: 'Invalid account or page.' }, { status: 400 })
  const results = await Promise.allSettled([
    supabaseAdmin.from('account_moderation').select('status,reason,suspended_until,revision,updated_at,updated_by').eq('user_email', email).maybeSingle(),
    supabaseAdmin.from('account_moderation_events').select('id,action,reason,suspended_until,actor,created_at', { count: 'exact' }).eq('user_email', email).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19),
    supabaseAdmin.from('tutor_conduct').select('status,reason,violations,updated_at').eq('tutor_email', email).maybeSingle(),
    supabaseAdmin.from('tutor_conduct_events').select('id,action,reason,created_at', { count: 'exact' }).eq('tutor_email', email).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19),
  ])
  const values = results.map(result => result.status === 'fulfilled' && !result.value.error ? result.value : null)
  if (!values[0] || !values[1]) return Response.json({ error: 'Account moderation unavailable. Apply the account moderation migration and retry.' }, { status: 503 })
  return Response.json({ state: values[0].data || { status: 'active', revision: 0, reason: '', suspended_until: null }, events: values[1].data, count: values[1].count,
    conduct: values[2]?.data || null, conductAvailable: !!values[2] && !!values[3], conductEvents: values[3]?.data || [], conductCount: values[3]?.count || 0 }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const actor = await admin()
  if (!actor) return Response.json({ error: 'Admin access required.' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.email !== 'string' || !body.email.trim() || body.email.length > 254 || !['suspend','ban','restore'].includes(body.action)
    || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 2000
    || !Number.isSafeInteger(body.revision) || body.revision < 0 || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId)
    || (body.action === 'suspend' && (!Number.isInteger(body.days) || body.days < 1 || body.days > 365))
    || (body.action === 'ban' && body.confirmEmail !== body.email)) return Response.json({ error: 'Complete the decision, reason and confirmation.' }, { status: 400 })
  if (isAdminEmail(body.email)) return Response.json({ error: 'Administrator accounts cannot be moderated.' }, { status: 403 })
  const email = body.email.toLowerCase().trim()
  const { data, error } = await supabaseAdmin.rpc('admin_moderate_account', { p_email: email, p_action: body.action, p_reason: body.reason.trim(), p_days: body.action === 'suspend' ? body.days : null, p_actor: actor, p_revision: body.revision, p_request: body.requestId })
  if (error) return Response.json({ error: error.code === 'P0001' ? error.message : 'Decision could not be saved. Check the moderation migration and retry.' }, { status: error.code === 'P0001' ? 409 : 503 })
  let warning = ''
  if (data.status !== 'active') {
    try {
      const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
      if (!url || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) throw new Error()
      const client = new RoomServiceClient(url.replace('wss:', 'https:'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
      for (const room of await client.listRooms()) {
        const participants = await client.listParticipants(room.name)
        for (const participant of participants) {
          if ([email, `${email}:student`, `${email}:tutor`].includes(participant.identity)) await client.removeParticipant(room.name, participant.identity)
        }
      }
    } catch { warning = 'Restriction saved, but live-call disconnection could not be confirmed. Retry this decision to retry disconnection.' }
  }
  return Response.json({ state: data, warning }, { headers: { 'Cache-Control': 'no-store' } })
}

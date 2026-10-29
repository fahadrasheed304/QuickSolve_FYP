import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { RoomServiceClient } from 'livekit-server-sdk'
import { dispatchEmailAlerts } from '@/lib/email-alert-dispatch'

export const dynamic = 'force-dynamic'
async function admin() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  return session?.role === 'admin' && typeof session.email === 'string' && isAdminEmail(session.email) ? session.email.toLowerCase().trim() : null
}
export async function GET(request: Request) {
  if (!await admin()) return Response.json({ error: 'Admin access required.' }, { status: 403 })
  const params = new URL(request.url).searchParams
  const email = params.get('email')?.toLowerCase().trim()
  const role = params.get('role')?.toLowerCase().trim()
  const page = Number(params.get('page') || 0)
  if (!email || email.length > 254 || !['student','tutor'].includes(role || '') || !Number.isSafeInteger(page) || page < 0 || page > 100000) return Response.json({ error: 'Invalid account, role or page.' }, { status: 400 })
  const results = await Promise.allSettled([
    supabaseAdmin.from('role_account_moderation').select('status,reason,suspended_until,revision,updated_at,updated_by').eq('user_email', email).eq('role',role).maybeSingle(),
    supabaseAdmin.from('role_account_moderation_events').select('id,action,reason,suspended_until,actor,created_at,role', { count: 'exact' }).eq('user_email', email).eq('role',role).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19),
    supabaseAdmin.from('tutor_conduct').select('status,reason,violations,updated_at').eq('tutor_email', email).maybeSingle(),
    supabaseAdmin.from('tutor_conduct_events').select('id,action,reason,created_at', { count: 'exact' }).eq('tutor_email', email).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19),
  ])
  const values = results.map(result => result.status === 'fulfilled' && !result.value.error ? result.value : null)
  if (!values[0] || !values[1]) return Response.json({ error: 'Role-specific account moderation unavailable. Apply the role moderation migration and retry.' }, { status: 503 })
  return Response.json({ state: values[0].data || { status: 'active', revision: 0, reason: '', suspended_until: null }, events: values[1].data, count: values[1].count,
    conduct: values[2]?.data || null, conductAvailable: !!values[2] && !!values[3], conductEvents: values[3]?.data || [], conductCount: values[3]?.count || 0 }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const actor = await admin()
  if (!actor) return Response.json({ error: 'Admin access required.' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.email !== 'string' || !body.email.trim() || body.email.length > 254 || !['student','tutor'].includes(body.role) || !['suspend','ban','restore'].includes(body.action)
    || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 2000
    || !Number.isSafeInteger(body.revision) || body.revision < 0 || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId)
    || (body.action === 'suspend' && (!Number.isInteger(body.days) || body.days < 1 || body.days > 365))
    || (body.action === 'ban' && body.confirmEmail !== body.email)) return Response.json({ error: 'Complete the decision, reason and confirmation.' }, { status: 400 })
  if (isAdminEmail(body.email)) return Response.json({ error: 'Administrator accounts cannot be moderated.' }, { status: 403 })
  const email = body.email.toLowerCase().trim()
  const { data, error } = await supabaseAdmin.rpc('admin_moderate_role_account', { p_email: email, p_role: body.role, p_action: body.action, p_reason: body.reason.trim(), p_days: body.action === 'suspend' ? body.days : null, p_actor: actor, p_revision: body.revision, p_request: body.requestId })
  if (error) return Response.json({ error: error.code === 'P0001' ? error.message : 'Decision could not be saved. Check the moderation migration and retry.' }, { status: error.code === 'P0001' ? 409 : 503 })
  dispatchEmailAlerts(request)
  let warning = ''
  if (data.status !== 'active') {
    try {
      const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
      if (!url || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) throw new Error()
      const client = new RoomServiceClient(url.replace('wss:', 'https:'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
      for (const room of await client.listRooms()) {
        const groupIdentities:string[]=[]
        if (/^class-[0-9a-f-]{36}$/i.test(room.name)) {
          const classId=room.name.slice(6)
          const [owner,bookings]=await Promise.all([
            supabaseAdmin.from('scheduled_classes').select('tutor_email').eq('id',classId).single(),
            supabaseAdmin.from('scheduled_class_bookings').select('id').eq('class_id',classId).eq('student_email',email),
          ])
          if (owner.error || bookings.error) throw new Error('Class participants unavailable')
          if (body.role === 'tutor' && owner.data.tutor_email===email) groupIdentities.push(`${classId}:tutor`)
          if (body.role === 'student') for (const booking of bookings.data || []) groupIdentities.push(`${booking.id}:student`)
        }
        const participants = await client.listParticipants(room.name)
        for (const participant of participants) {
          if ([`${email}:${body.role}`,...groupIdentities].includes(participant.identity)) await client.removeParticipant(room.name, participant.identity)
        }
      }
    } catch { warning = 'Restriction saved, but live-call disconnection could not be confirmed. Retry this decision to retry disconnection.' }
  }
  return Response.json({ state: data, warning }, { headers: { 'Cache-Control': 'no-store' } })
}

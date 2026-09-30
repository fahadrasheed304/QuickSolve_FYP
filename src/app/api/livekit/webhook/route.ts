import { WebhookReceiver, RoomServiceClient } from 'livekit-server-sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { assertAccountAccess, AccountRestrictedError } from '@/lib/account-access'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const key = process.env.LIVEKIT_API_KEY
  const secret = process.env.LIVEKIT_API_SECRET
  if (!key || !secret) return new Response('LiveKit unavailable', { status: 503 })

  let event
  try {
    // The SDK verifies both the signed token and the hash of the raw body.
    event = await new WebhookReceiver(key, secret).receive(
      await request.text(), request.headers.get('authorization') || undefined,
    )
  } catch {
    return new Response('Invalid webhook', { status: 401 })
  }

  const room = event.room?.name || ''
  const identity = event.participant?.identity || ''
  if (['participant_joined', 'participant_left', 'room_finished'].includes(event.event || '') && /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room)) {
    const seconds = Number(event.createdAt)
    if (!event.id || !seconds || !event.room?.sid) return new Response('Attendance event metadata missing', { status: 400 })
    const { error } = await supabaseAdmin.rpc('record_session_attendance', {
      p_event_id: event.id, p_problem: room.slice(8), p_room_sid: event.room.sid,
      p_participant_sid: event.participant?.sid || null, p_identity: identity || null,
      p_kind: event.event, p_at: new Date(seconds * 1000).toISOString(),
    })
    if (error) return new Response('Attendance unavailable; retry', { status: 503 })
  }
  if (event.event !== 'participant_joined' || !/:(student|tutor)$/.test(identity) ||
    !/^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room)) {
    return new Response(null, { status: 204 })
  }
  try {
    await assertAccountAccess(identity.replace(/:(student|tutor)$/, ''))
  } catch (error) {
    if (!(error instanceof AccountRestrictedError)) return new Response('Account check unavailable; retry', { status: 503 })
    try {
      const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
      if (!url) throw new Error()
      await new RoomServiceClient(url.replace('wss:', 'https:'), key, secret).removeParticipant(room, identity)
      return new Response(null, { status: 204 })
    } catch { return new Response('Disconnection unavailable; retry', { status: 503 }) }
  }
  if (!identity.endsWith(':tutor')) return new Response(null, { status: 204 })
  try {
    const { error } = await supabaseAdmin.rpc('notify_tutor_joined', {
      p_problem_id: room.slice('session-'.length),
      p_identity: identity,
    })
    if (error) return new Response('Notification unavailable; retry', { status: 503 })
    return new Response(null, { status: 204 })
  } catch {
    return new Response('Notification unavailable; retry', { status: 503 })
  }
}

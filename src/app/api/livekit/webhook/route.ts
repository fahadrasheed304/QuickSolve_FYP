import { WebhookReceiver } from 'livekit-server-sdk'
import { supabaseAdmin } from '@/lib/supabase'

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
  if (event.event !== 'participant_joined' || !identity.endsWith(':tutor') ||
    !/^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room)) {
    return new Response(null, { status: 204 })
  }
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

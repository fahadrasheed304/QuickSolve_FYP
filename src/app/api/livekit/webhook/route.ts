import { WebhookReceiver, RoomServiceClient } from 'livekit-server-sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { assertAccountAccess, AccountRestrictedError } from '@/lib/account-access'
import { saveEgress } from '@/lib/recordings'
import { classIdFromRoom, saveScheduledEgress } from '@/lib/scheduled-class-recordings'

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

  if (['egress_started', 'egress_updated', 'egress_ended'].includes(event.event || '')) {
    if (!event.egressInfo) return new Response('Recording event metadata missing', { status: 400 })
    try {
      if (event.egressInfo.roomName.startsWith('class-')) await saveScheduledEgress(event.egressInfo)
      else await saveEgress(event.egressInfo)
      return new Response(null, { status: 204 })
    } catch { return new Response('Recording state unavailable; retry', { status: 503 }) }
  }

  const room = event.room?.name || ''
  const identity = event.participant?.identity || ''
  if (room.startsWith('class-')) {
    const classId=classIdFromRoom(room)
    if (!classId) return new Response('Invalid class room',{status:400})
    if (!['participant_joined','participant_left'].includes(event.event || '') || !/:(student|tutor)$/.test(identity)) return new Response(null,{status:204})
    if (!event.id || !event.participant?.sid || !Number(event.createdAt)) return new Response('Class attendance metadata missing',{status:400})
    try {
      let email: string | undefined
      if (identity===`${classId}:tutor`) {
        const {data,error}=await supabaseAdmin.from('scheduled_classes').select('tutor_email,status').eq('id',classId).single()
        if (error) throw error
        if (['scheduled','live'].includes(data.status)) email=data.tutor_email
      } else {
        const {data,error}=await supabaseAdmin.from('scheduled_class_bookings').select('student_email,status,payment_status')
          .eq('class_id',classId).eq('id',identity.replace(/:student$/,'')).maybeSingle()
        if (error) throw error
        if (data?.status==='booked' && data.payment_status==='reserved') email=data.student_email
      }
      if (event.event==='participant_joined') {
        let allowed=!!email
        if (email) { try {await assertAccountAccess(email)} catch (error) {if (!(error instanceof AccountRestrictedError)) throw error; allowed=false} }
        if (!allowed) {
          const url=process.env.NEXT_PUBLIC_LIVEKIT_URL
          if (!url) throw new Error('LiveKit unavailable')
          await new RoomServiceClient(url.replace('wss:','https:'),key,secret).removeParticipant(room,identity)
          return new Response(null,{status:204})
        }
      }
      const {error}=await supabaseAdmin.rpc('record_scheduled_attendance',{p_event:event.id,p_class:classId,p_identity:identity,p_sid:event.participant.sid,
        p_kind:event.event,p_at:new Date(Number(event.createdAt)*1000).toISOString()})
      if (error) throw error
      return new Response(null,{status:204})
    } catch {return new Response('Class attendance unavailable; retry',{status:503})}
  }
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

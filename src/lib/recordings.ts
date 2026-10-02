import { randomUUID } from 'crypto'
import { RoomServiceClient, RoomEgress, RoomCompositeEgressRequest, EncodedFileOutput, EncodedFileType, EncodingOptionsPreset, EgressClient, EgressStatus, type EgressInfo, type Room } from 'livekit-server-sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const recordingEnabled = () => process.env.RECORDING_ENABLED === 'true'
export const sessionIdFromRoom = (room: string) => /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(room) ? room.slice(8) : null
export const validRecordingKey = (id: string, key: string) => new RegExp(`^sessions/${id}/[0-9a-f-]{36}\\.mp4$`, 'i').test(key)
function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Recording setup missing: ${name}`)
  return value
}
function livekitHost() { return required('NEXT_PUBLIC_LIVEKIT_URL').replace('wss:', 'https:') }
function storage() {
  const endpoint = required('R2_ENDPOINT')
  if (!/^https:\/\/[a-z0-9.-]+\.r2\.cloudflarestorage\.com\/?$/i.test(endpoint)) throw new Error('R2_ENDPOINT must be your Cloudflare R2 S3 endpoint')
  return { endpoint, bucket: required('R2_BUCKET'), accessKey: required('R2_ACCESS_KEY_ID'), secret: required('R2_SECRET_ACCESS_KEY'), region: 'auto', forcePathStyle: true }
}
function s3() {
  const config = storage()
  return new S3Client({ endpoint: config.endpoint, region: 'auto', forcePathStyle: true, credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secret } })
}
export function egressClient() { return new EgressClient(livekitHost(), required('LIVEKIT_API_KEY'), required('LIVEKIT_API_SECRET')) }

export async function prepareRecordingRoom(room: string) {
  if (!recordingEnabled()) return
  const id = sessionIdFromRoom(room)
  if (!id) throw new Error('Invalid recording room')
  const config = storage()
  required('CRON_SECRET')
  const { error } = await supabaseAdmin.from('session_recordings').select('egress_id').limit(0)
  if (error) throw new Error('Apply the session recording migration before enabling recording')
  const client = new RoomServiceClient(livekitHost(), required('LIVEKIT_API_KEY'), required('LIVEKIT_API_SECRET'))
  const rooms = await client.listRooms([room])
  if (rooms.length) {
    if (rooms[0].metadata !== 'quicksolve-recording-v1') throw new Error('This call began before recording was enabled. Finish existing calls before enabling recording.')
    return
  }
  // Auto-egress is configured before any participant receives a join token.
  // Concurrent CreateRoom calls for the same name reuse the existing room.
  await client.createRoom({ name: room, metadata: 'quicksolve-recording-v1', emptyTimeout: 60, departureTimeout: 30, egress: new RoomEgress({ room: new RoomCompositeEgressRequest({
    roomName: room, layout: 'grid', options: { case: 'preset', value: EncodingOptionsPreset.H264_720P_30 },
    fileOutputs: [new EncodedFileOutput({ fileType: EncodedFileType.MP4, filepath: `sessions/${id}/${randomUUID()}.mp4`, disableManifest: true, output: { case: 's3', value: config } })],
  }) }) })
}

export async function saveEgress(info: EgressInfo) {
  const id = sessionIdFromRoom(info.roomName)
  if (!id) return
  const request = info.request.case === 'roomComposite' ? info.request.value : null
  const key = info.fileResults[0]?.filename || request?.fileOutputs[0]?.filepath || null
  // Never trust arbitrary playback URLs or paths supplied in event payloads.
  if (key && !validRecordingKey(id, key)) throw new Error('Unexpected recording path')
  const states: Record<number,string> = { [EgressStatus.EGRESS_STARTING]: 'starting', [EgressStatus.EGRESS_ACTIVE]: 'recording', [EgressStatus.EGRESS_ENDING]: 'processing', [EgressStatus.EGRESS_COMPLETE]: 'ready' }
  const state = states[info.status] || 'failed'
  const { error } = await supabaseAdmin.rpc('save_recording_event', { p_egress: info.egressId, p_problem: id, p_key: key, p_state: state, p_version: String(info.updatedAt || info.endedAt || info.startedAt) })
  if (error) throw new Error('Recording state could not be saved')
}
export async function stopRecordings(room: string) {
  if (!recordingEnabled()) return
  const client = egressClient()
  for (const info of await client.listEgress({ roomName: room, active: true })) {
    await saveEgress(info)
    if (info.status !== EgressStatus.EGRESS_ENDING) await saveEgress(await client.stopEgress(info.egressId))
  }
}
export async function recordingPlayback(key: string) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: storage().bucket, Key: key, ResponseContentType: 'video/mp4', ResponseContentDisposition: 'inline' }), { expiresIn: 900 })
}
export async function deleteRecording(egressId: string) {
  const { data: key, error } = await supabaseAdmin.rpc('claim_recording_deletion', { p_egress: egressId })
  if (error) throw new Error('Retention claim failed')
  if (!key) return false
  const id = sessionIdFromRoom('session-' + String(key).split('/')[1])
  if (!id || !validRecordingKey(id, key)) throw new Error('Unexpected deletion path')
  await s3().send(new DeleteObjectCommand({ Bucket: storage().bucket, Key: key }), { abortSignal: AbortSignal.timeout(8000) })
  const result = await supabaseAdmin.from('session_recordings').update({ state: 'deleted', deleted_at: new Date().toISOString() }).eq('egress_id', egressId).eq('state','deleting')
  if (result.error) throw new Error('Deletion acknowledgement failed; retry cleanup')
  return true
}

// Runs independently of browsers. Reconcile missed webhooks before deleting files.
export async function maintainRecordings() {
  const failures: string[] = []
  let reconciled = 0, stopped = 0, deleted = 0
  const deadline = Date.now() + 45000
  const client = egressClient()
  let egresses: EgressInfo[] = []
  try { egresses = await client.listEgress() }
  catch { failures.push('list-egress') }
  for (const info of egresses) {
    if (Date.now() >= deadline) { failures.push('reconcile-time-budget'); break }
    if (!sessionIdFromRoom(info.roomName)) continue
    try { await saveEgress(info); reconciled++ }
    catch { failures.push(`reconcile:${info.egressId}`) }
  }
  const rooms = new RoomServiceClient(livekitHost(), required('LIVEKIT_API_KEY'), required('LIVEKIT_API_SECRET'))
  let activeRooms: Room[] = []
  try { activeRooms = await rooms.listRooms() }
  catch { failures.push('list-rooms') }
  for (const room of activeRooms) {
    if (Date.now() >= deadline) { failures.push('room-time-budget'); break }
    const id = sessionIdFromRoom(room.name)
    if (!id) continue
    try {
      const { data: problem, error } = await supabaseAdmin.from('problems')
        .select('session_ended_at,session_started_at,extension_minutes,status,settled_at,accepted_bid_id').eq('id', id).single()
      if (error || !problem) throw new Error('Session unavailable')
      let ended = Boolean(problem.session_ended_at || problem.settled_at || problem.status !== 'accepted')
      if (!ended && problem.session_started_at) {
        const { data: bid, error: bidError } = await supabaseAdmin.from('bids').select('duration_min').eq('id', problem.accepted_bid_id).single()
        if (bidError || !bid) throw new Error('Duration unavailable')
        const deadline = Date.parse(problem.session_started_at) + (Number(bid.duration_min) + Number(problem.extension_minutes || 0)) * 60000
        if (deadline <= Date.now()) {
          // An extension racing this job must not have its room closed.
          const result = await supabaseAdmin.from('problems').update({ session_ended_at: new Date(deadline).toISOString() })
            .eq('id', id).eq('extension_minutes', problem.extension_minutes).is('session_ended_at', null).select('id')
          if (result.error) throw new Error('Session end unavailable')
          ended = Boolean(result.data?.length)
        }
      }
      if (ended) {
        // Room closure also stops egress when an explicit stop races completion.
        try { await stopRecordings(room.name) } finally { await rooms.deleteRoom(room.name) }
        stopped++
      }
    } catch { failures.push(`stop:${id}`) }
  }
  const { data: candidates, error } = await supabaseAdmin.rpc('recording_cleanup_candidates', { p_limit: 50 })
  if (error) throw new Error('Recording cleanup candidates unavailable')
  for (const row of candidates || []) {
    if (Date.now() >= deadline) { failures.push('delete-time-budget'); break }
    try { if (await deleteRecording(row.egress_id)) deleted++ }
    catch { failures.push(`delete:${row.egress_id}`) }
  }
  return { reconciled, stopped, deleted, failures }
}

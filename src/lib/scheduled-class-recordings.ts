import { randomUUID } from 'crypto'
import { RoomServiceClient, RoomEgress, RoomCompositeEgressRequest, EncodedFileOutput, EncodedFileType, EncodingOptionsPreset, EgressStatus, type EgressInfo, type Room } from 'livekit-server-sdk'
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { supabaseAdmin } from '@/lib/supabase'
import { recordingEnabled, recordingStorage, recordingStorageClient, egressClient } from '@/lib/recordings'
import { isClassId } from '@/lib/scheduled-classes'

export const classIdFromRoom = (room: string) => room.startsWith('class-') && isClassId(room.slice(6)) ? room.slice(6) : null
export const validClassRecordingKey = (id: string,key: string) => isClassId(id) && new RegExp(`^classes/${id}/[0-9a-f-]{36}\\.mp4$`,'i').test(key)
export function assertScheduledRecordingConfig() {
  if (!recordingEnabled()) throw new Error('Enable recording before creating scheduled classes')
  recordingStorage()
  for (const key of ['LIVEKIT_API_KEY','LIVEKIT_API_SECRET','CRON_SECRET']) if (!process.env[key]) throw new Error(`Missing ${key}`)
  if (!process.env.NEXT_PUBLIC_LIVEKIT_URL?.startsWith('wss://') || !process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')) throw new Error('Public HTTPS app and LiveKit WSS URLs are required for recording')
}
export function scheduledRoomClient() {
  if (!process.env.NEXT_PUBLIC_LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) throw new Error('LiveKit unavailable')
  return new RoomServiceClient(process.env.NEXT_PUBLIC_LIVEKIT_URL.replace('wss:','https:'),process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET)
}
export async function prepareScheduledRoom(id: string, capacity: number) {
  if (!isClassId(id)) throw new Error('Invalid class')
  assertScheduledRecordingConfig()
  const client=scheduledRoomClient(), name=`class-${id}`
  const existing=await client.listRooms([name])
  if (existing.length) {
    if (existing[0].metadata!=='quicksolve-scheduled-recording-v1') throw new Error('Class recording configuration is unavailable')
    return
  }
  await client.createRoom({name,metadata:'quicksolve-scheduled-recording-v1',maxParticipants:capacity+2,emptyTimeout:600,departureTimeout:60,
    egress:new RoomEgress({room:new RoomCompositeEgressRequest({roomName:name,layout:'grid',
      customBaseUrl:`${process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/,'')}/recording-template`,
      options:{case:'preset',value:EncodingOptionsPreset.H264_720P_30},
      fileOutputs:[new EncodedFileOutput({fileType:EncodedFileType.MP4,filepath:`classes/${id}/${randomUUID()}.mp4`,disableManifest:true,output:{case:'s3',value:recordingStorage()}})],
    })})})
}
export async function saveScheduledEgress(info: EgressInfo) {
  const id=classIdFromRoom(info.roomName)
  if (!id) return
  const request=info.request.case==='roomComposite'?info.request.value:null
  const key=info.fileResults[0]?.filename || request?.fileOutputs[0]?.filepath || null
  if (key && !validClassRecordingKey(id,key)) throw new Error('Unexpected class recording path')
  const states:Record<number,string>={[EgressStatus.EGRESS_STARTING]:'starting',[EgressStatus.EGRESS_ACTIVE]:'recording',[EgressStatus.EGRESS_ENDING]:'processing',[EgressStatus.EGRESS_COMPLETE]:'ready'}
  const {error}=await supabaseAdmin.rpc('save_scheduled_recording',{p_egress:info.egressId,p_class:id,p_key:key,p_state:states[info.status]||'failed',p_version:String(info.updatedAt||info.endedAt||info.startedAt)})
  if (error) throw new Error('Class recording event could not be saved')
}
export async function closeScheduledRoom(id: string) {
  const client=scheduledRoomClient()
  const name=`class-${id}`
  if (!(await client.listRooms([name])).length) return
  const egress=egressClient()
  try {
    for (const info of await egress.listEgress({roomName:name,active:true})) {
      await saveScheduledEgress(info)
      if (info.status!==EgressStatus.EGRESS_ENDING) await saveScheduledEgress(await egress.stopEgress(info.egressId))
    }
  } finally { await client.deleteRoom(name) }
}
export async function classRecordingUrl(key: string,id: string,seconds: number,download=true) {
  if (!validClassRecordingKey(id,key)) throw new Error('Invalid recording path')
  return getSignedUrl(recordingStorageClient(),new GetObjectCommand({Bucket:recordingStorage().bucket,Key:key,ResponseContentType:'video/mp4',
    ResponseContentDisposition:download?`attachment; filename="QuickSolve-Class-${id}-${key.split('/').pop()}"`:'inline'}),{expiresIn:Math.max(1,Math.min(300,seconds))})
}
export async function maintainScheduledClasses() {
  const failures:string[]=[]
  // Database maintenance/reminders must run even if external recording services fail.
  let client:RoomServiceClient|undefined
  try {client=scheduledRoomClient()} catch {failures.push('livekit-config')}
  const snapshotAt=new Date().toISOString()
  let roomSnapshotAvailable=false
  let rooms:Room[]=[]
  try {if(client){rooms=await client.listRooms();roomSnapshotAvailable=true}} catch {failures.push('list-rooms')}
  const deadline=Date.now()+45000
  for (const room of rooms) {
    const id=classIdFromRoom(room.name)
    if (!id) continue
    if (Date.now()>deadline) {failures.push('room-time-budget');break}
    try {
      const participants=await client!.listParticipants(room.name)
      for (const p of participants) {
        if (!p.identity.endsWith(':tutor') && !p.identity.endsWith(':student')) continue
        const {error}=await supabaseAdmin.rpc('record_scheduled_attendance',{p_event:`reconciled-join:${p.sid}`,p_class:id,p_identity:p.identity,p_sid:p.sid,
          p_kind:'participant_joined',p_at:new Date(Number(p.joinedAt)*1000).toISOString()})
        if (error) throw error
      }
      const {error:absenceError}=await supabaseAdmin.rpc('reconcile_scheduled_absence',{p_class:id,p_present:participants.map(p=>p.sid),p_at:snapshotAt})
      if(absenceError)throw absenceError
    } catch {failures.push(`attendance:${id}`)}
  }
  if(roomSnapshotAvailable){
    const {data:live,error}=await supabaseAdmin.from('scheduled_classes').select('id').eq('status','live')
    if(error)failures.push('live-classes')
    else for(const c of live || []){
      if(rooms.some(room=>room.name===`class-${c.id}`))continue
      if(Date.now()>deadline){failures.push('absence-time-budget');break}
      const {error}=await supabaseAdmin.rpc('reconcile_scheduled_absence',{p_class:c.id,p_present:[],p_at:snapshotAt})
      if(error)failures.push(`absence:${c.id}`)
    }
  }
  const {error:tickError}=await supabaseAdmin.rpc('scheduled_class_tick')
  if (tickError) throw new Error('Scheduled class maintenance failed')
  for (const room of rooms) {
    const id=classIdFromRoom(room.name)
    if (!id) continue
    if (Date.now()>deadline) {failures.push('close-time-budget');break}
    try {
      const {data,error}=await supabaseAdmin.from('scheduled_classes').select('status').eq('id',id).single()
      if (error) throw error
      if (['completed','cancelled'].includes(data.status)) await closeScheduledRoom(id)
    } catch {failures.push(`close:${id}`)}
  }
  try {
    for (const info of await egressClient().listEgress()) {
      if (!classIdFromRoom(info.roomName)) continue
      if (Date.now()>deadline) {failures.push('egress-time-budget');break}
      try {await saveScheduledEgress(info)} catch {failures.push(`egress:${info.egressId}`)}
    }
  } catch {failures.push('list-egress')}
  const {data:recordings,error}=await supabaseAdmin.rpc('scheduled_recording_cleanup_candidates',{p_limit:50})
  if (error) throw new Error('Class recording cleanup unavailable')
  for (const r of recordings || []) {
    if (Date.now()>deadline) {failures.push('cleanup-time-budget');break}
    try {
      const {data:key,error:claimError}=await supabaseAdmin.rpc('claim_scheduled_recording_deletion',{p_egress:r.egress_id})
      if (claimError) throw claimError
      if (!key) continue
      if (!validClassRecordingKey(r.class_id,key)) throw new Error('Invalid deletion path')
      await recordingStorageClient().send(new DeleteObjectCommand({Bucket:recordingStorage().bucket,Key:key}),{abortSignal:AbortSignal.timeout(8000)})
      const {error:doneError}=await supabaseAdmin.rpc('finish_scheduled_recording_deletion',{p_egress:r.egress_id})
      if (doneError) throw doneError
    } catch {failures.push(`cleanup:${r.egress_id}`)}
  }
  return {failures}
}

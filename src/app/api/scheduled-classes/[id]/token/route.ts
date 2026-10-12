import { AccessToken } from 'livekit-server-sdk'
import { classAccount, classAccess, classHeaders, classRpcError } from '@/lib/scheduled-classes-server'
import { supabaseAdmin } from '@/lib/supabase'
import { classJoinWindow } from '@/lib/scheduled-classes'
import { prepareScheduledRoom } from '@/lib/scheduled-class-recordings'

export const dynamic='force-dynamic'
export async function POST(request: Request,{params}:{params:Promise<{id:string}>}) {
  const account=await classAccount()
  if (!account || !['student','tutor'].includes(account.role)) return Response.json({error:'Login required'},{status:401})
  const {id}=await params
  const body=await request.json().catch(()=>null)
  if (body?.consent!==true) return Response.json({error:'Accept the recording notice before joining'},{status:400})
  try {
    const access=await classAccess(id,account)
    if (!access || (account.role==='student' && (access.booking?.status!=='booked' || access.booking.payment_status!=='reserved'))) return Response.json({error:'A confirmed booking is required'},{status:403})
    const {c,booking}=access
    if (!classJoinWindow(c,Date.now())) return Response.json({error:'Join from 10 minutes before start until the class ends'},{status:409})
    if (!c.tutor_joined_at && Date.now()>=Date.parse(c.starts_at)+10*60000) return Response.json({error:'Tutor grace period expired. Your refund will be processed automatically.'},{status:409})
    const {error}=await supabaseAdmin.rpc('assert_scheduled_join',{p_class:c.id,p_email:account.email,p_role:account.role})
    if(error)return classRpcError(error)
    await prepareScheduledRoom(c.id,c.capacity)
    const at=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{identity:`${account.role==='tutor'?c.id:booking!.id}:${account.role}`,
      name:account.role==='tutor'?c.tutor_name:booking!.student_name,ttl:300})
    at.addGrant({roomJoin:true,room:`class-${c.id}`,canPublish:true,canSubscribe:true,canPublishData:true})
    return Response.json({token:await at.toJwt(),serverUrl:process.env.NEXT_PUBLIC_LIVEKIT_URL,endsAt:Date.parse(c.ends_at),serverNow:Date.now()},{headers:classHeaders})
  } catch {return Response.json({error:'Could not connect to the recorded class. Please retry.'},{status:503,headers:classHeaders})}
}

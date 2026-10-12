import { supabaseAdmin } from '@/lib/supabase'
import { dispatchEmailAlerts } from '@/lib/email-alert-dispatch'
import { classAccount, classAccess, classHeaders, classRpcError } from '@/lib/scheduled-classes-server'
import { isClassId, publicClass, publicBooking } from '@/lib/scheduled-classes'
import { closeScheduledRoom } from '@/lib/scheduled-class-recordings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(request: Request, {params}: {params:Promise<{id:string}>}) {
  const account = await classAccount()
  if (!account) return Response.json({error:'Login required'},{status:401})
  const {id}=await params
  const rosterPage=Number(new URL(request.url).searchParams.get('rosterPage')||0)
  if(!Number.isSafeInteger(rosterPage)||rosterPage<0||rosterPage>100000)return Response.json({error:'Invalid roster page'},{status:400})
  try {
    const access=await classAccess(id,account)
    if (!access) return Response.json({error:'Class not found'},{status:404})
    const {c,booking}=access
    // Emails and other students' payment details never reach the student response.
    const canSeeRoster=account.role==='tutor'||account.role==='admin'
    const rosterResult=canSeeRoster?await supabaseAdmin.from('scheduled_class_bookings')
      .select('id,student_name,status,payment_status,amount,created_at,cancelled_at,joined_at,dispute,resolution_note',{count:'exact'})
      .eq('class_id',id).order('created_at',{ascending:false}).order('id').range(rosterPage*25,rosterPage*25+24):{data:undefined,count:0,error:null}
    if(rosterResult.error)throw rosterResult.error
    const {data:summary,error:summaryError}=await supabaseAdmin.rpc('scheduled_class_summary',{p_class:id})
    if(summaryError)throw summaryError
    const {data:recordings,error:recordingError}=await supabaseAdmin.from('scheduled_class_recordings')
      .select('egress_id,state,ready_at,download_until').eq('class_id',id).order('created_at').limit(100)
    if (recordingError) throw recordingError
    let present: string[]=[]
    if (canSeeRoster) {
      const result=await supabaseAdmin.from('scheduled_class_attendance').select('identity,participant_sid,kind,happened_at').eq('class_id',id).order('happened_at',{ascending:false}).limit(10000)
      if (result.error) throw result.error
      const connections=new Map<string,{identity:string;joined:boolean}>()
      for (const event of (result.data || []).reverse()) connections.set(event.participant_sid,{identity:event.identity,joined:event.kind==='participant_joined'})
      present=[...new Set([...connections.values()].filter(event=>event.joined).map(event=>event.identity))]
    }
    let tutorAttendanceSeconds:number|undefined
    if (account.role==='admin') {
      const result=await supabaseAdmin.rpc('scheduled_tutor_attendance_seconds',{p_class:id})
      if(result.error)throw result.error
      tutorAttendanceSeconds=Number(result.data)
    }
    return Response.json({class:{...publicClass(c),booked_count:Number(summary.booked_count)},booking:booking?publicBooking(booking):null,tutorAttendanceSeconds,
      roster:rosterResult.data,rosterCount:rosterResult.count,rosterPage,summary:canSeeRoster?summary:undefined,
      present:canSeeRoster?present:undefined,recordings:canSeeRoster||booking?.status==='booked'?recordings:[],serverNow:Date.now()}, {headers:classHeaders})
  } catch { return Response.json({error:'Could not load this class. Please retry.'},{status:503,headers:classHeaders}) }
}
export async function POST(request: Request, {params}: {params:Promise<{id:string}>}) {
  const account=await classAccount()
  if (!account || !['student','tutor'].includes(account.role)) return Response.json({error:'Login required'},{status:401})
  const {id}=await params
  const body=await request.json().catch(()=>null)
  if (!isClassId(id) || !body || !['book','cancel_booking','cancel_class','finish','dispute'].includes(body.action)) return Response.json({error:'Invalid class action'},{status:400})
  try {
    const access=await classAccess(id,account)
    if (!access) return Response.json({error:'Class not found'},{status:404})
    let result
    if (body.action==='book' && account.role==='student') {
      if (!isClassId(body.requestId) || body.consent!==true) return Response.json({error:'Accept the class policy before booking'},{status:400})
      result=await supabaseAdmin.rpc('book_scheduled_class',{p_class:id,p_student:account.email,p_request:body.requestId,p_consent:true})
    } else if (['cancel_booking','dispute'].includes(body.action) && account.role==='student') {
      if (!access.booking || body.bookingId!==access.booking.id) return Response.json({error:'Booking not found'},{status:404})
      if (body.action==='dispute') {
        if (typeof body.reason!=='string' || body.reason.length>1000) return Response.json({error:'Describe the payment issue'},{status:400})
        result=await supabaseAdmin.rpc('dispute_scheduled_booking',{p_booking:access.booking.id,p_student:account.email,p_reason:body.reason})
      } else result=await supabaseAdmin.rpc('cancel_scheduled_booking',{p_booking:access.booking.id,p_student:account.email})
    } else if (account.role==='tutor' && ['cancel_class','finish'].includes(body.action)) {
      if (body.action==='cancel_class') {
        if (typeof body.reason!=='string' || body.reason.length>2000) return Response.json({error:'Provide a cancellation reason'},{status:400})
        result=await supabaseAdmin.rpc('cancel_scheduled_class',{p_class:id,p_tutor:account.email,p_reason:body.reason})
      } else result=await supabaseAdmin.rpc('finish_scheduled_class',{p_class:id,p_tutor:account.email})
    } else return Response.json({error:'This action is not allowed'},{status:403})
    if (result.error) return classRpcError(result.error)
    dispatchEmailAlerts(request)
    let warning: string|undefined
    if (['finish','cancel_class'].includes(body.action)) {
      try { await closeScheduledRoom(id) } catch { warning='Decision saved. Background maintenance will retry closing the room.' }
    }
    return Response.json({success:true,warning},{headers:classHeaders})
  } catch { return Response.json({error:'Class action unavailable. Please retry.'},{status:503,headers:classHeaders}) }
}

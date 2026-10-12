import { supabaseAdmin } from '@/lib/supabase'
import { dispatchEmailAlerts } from '@/lib/email-alert-dispatch'
import { classAccount, classHeaders, classRpcError } from '@/lib/scheduled-classes-server'
import { isClassId } from '@/lib/scheduled-classes'

export const dynamic='force-dynamic'
export const maxDuration=60
export async function GET(request:Request) {
  const account=await classAccount()
  if (account?.role!=='admin') return Response.json({error:'Administrator login required'},{status:403})
  const params=new URL(request.url).searchParams
  const status=params.get('status')||'held', page=Number(params.get('page')||0)
  if (!['reserved','pending','held','released','refunded'].includes(status)||!Number.isSafeInteger(page)||page<0||page>100000) return Response.json({error:'Invalid payment filter'},{status:400})
  const {data,count,error}=await supabaseAdmin.from('scheduled_class_bookings').select('*,scheduled_classes(*)',{count:'exact'})
    .eq('payment_status',status).order('created_at',{ascending:false}).order('id').range(page*25,page*25+24)
  if (error) return Response.json({error:'Scheduled class payments unavailable'},{status:503})
  return Response.json({payments:data,count:count||0,page},{headers:classHeaders})
}
export async function POST(request:Request) {
  const account=await classAccount()
  if (account?.role!=='admin') return Response.json({error:'Administrator login required'},{status:403})
  const body=await request.json().catch(()=>null)
  if (!body||!isClassId(body.bookingId)||!['release','refund'].includes(body.action)||typeof body.note!=='string'||body.note.trim().length<5||body.note.length>2000) return Response.json({error:'Choose a payment and provide a resolution note (5–2000 characters)'},{status:400})
  const {data,error}=await supabaseAdmin.rpc('resolve_scheduled_booking',{p_booking:body.bookingId,p_action:body.action,p_actor:account.email,p_note:body.note.trim()})
  if (error) return classRpcError(error)
  dispatchEmailAlerts(request)
  return Response.json({payment:data},{headers:classHeaders})
}

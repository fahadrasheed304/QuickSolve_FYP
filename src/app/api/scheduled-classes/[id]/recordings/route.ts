import { supabaseAdmin } from '@/lib/supabase'
import { classAccount, classAccess, classHeaders } from '@/lib/scheduled-classes-server'
import { classRecordingUrl } from '@/lib/scheduled-class-recordings'

export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const account=await classAccount()
  if (!account) return Response.json({error:'Login required'},{status:401})
  const {id}=await params
  try {
    const access=await classAccess(id,account)
    if (!access || (account.role!=='admin' && (account.role!=='student'||access.booking?.status!=='booked'))) return Response.json({error:'Recording access denied'},{status:403})
    if (access.c.status!=='completed') return Response.json({error:'Recording is available after class ends'},{status:409})
    const egress=new URL(request.url).searchParams.get('egressId')
    if (!egress || egress.length>200) return Response.json({error:'Choose a recording'},{status:400})
    const {data,error}=await supabaseAdmin.from('scheduled_class_recordings').select('object_key,state,download_until').eq('class_id',id).eq('egress_id',egress).maybeSingle()
    if (error) throw error
    if (!data || data.state!=='ready' || !data.object_key) return Response.json({error:'Recording is processing, failed or no longer available'},{status:409})
    const remaining=Math.floor((Date.parse(data.download_until)-Date.now())/1000)
    if (account.role!=='admin' && (!Number.isFinite(remaining)||remaining<=0)) return Response.json({error:'The 15-minute download window has closed'},{status:410})
    return Response.json({url:await classRecordingUrl(data.object_key,id,account.role==='admin'?300:remaining,account.role!=='admin')},{headers:classHeaders})
  } catch {return Response.json({error:'Recording download unavailable. Please retry.'},{status:503,headers:classHeaders})}
}

import { supabaseAdmin } from '@/lib/supabase'
import { classAccount, classHeaders, classRpcError } from '@/lib/scheduled-classes-server'
import { isClassId, publicClass, type ScheduledClass } from '@/lib/scheduled-classes'
import { assertScheduledRecordingConfig } from '@/lib/scheduled-class-recordings'

export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const account = await classAccount()
  if (!account || !['student','tutor'].includes(account.role)) return Response.json({error:'Student or tutor login required'},{status:401})
  const params = new URL(request.url).searchParams
  const page = Number(params.get('page') || 0)
  const mode = params.get('mode') || 'browse'
  if (!Number.isSafeInteger(page) || page<0 || page>100000 || !['browse','mine','past'].includes(mode)) return Response.json({error:'Invalid class filter'},{status:400})
  try {
    let classes: ScheduledClass[] = [], count = 0
    if (account.role==='student' && mode!=='browse') {
      const result=await supabaseAdmin.rpc('scheduled_student_classes',{p_email:account.email,p_mode:mode,p_page:page})
      if (result.error) throw result.error
      count=Number(result.data.count)
      classes=result.data.classes as ScheduledClass[]
    } else {
      let query = supabaseAdmin.from('scheduled_classes').select('*',{count:'exact'})
      if (account.role==='tutor') query=query.eq('tutor_email',account.email)
      if (mode==='past') query=query.in('status',['completed','cancelled'])
      else query=query.in('status',['scheduled','live'])
      if (account.role==='student') query=query.gt('starts_at',new Date(Date.now()+10*60000).toISOString())
      const result = await query.order('starts_at',{ascending:mode!=='past'}).order('id').range(page*12,page*12+11)
      if (result.error) throw result.error
      count=result.count || 0
      classes=(result.data || []).map(row=>publicClass(row as ScheduledClass))
    }
    if (classes.length) {
      const ids=[...new Set(classes.map(c=>c.id))]
      const result = await supabaseAdmin.from('scheduled_class_bookings').select('class_id,amount').in('class_id',ids).eq('status','booked')
      if (result.error) throw result.error
      classes=classes.map(c=>({...c,booked_count:(result.data || []).filter(b=>b.class_id===c.id).length,
        ...(account.role==='tutor' ? {expected_earnings:(result.data || []).filter(b=>b.class_id===c.id).reduce((sum,b)=>sum+Number(b.amount),0)} : {})}))
    }
    return Response.json({classes,count,page},{headers:classHeaders})
  } catch { return Response.json({error:'Could not load scheduled classes. Check the migration and retry.'},{status:503,headers:classHeaders}) }
}
export async function POST(request: Request) {
  const account = await classAccount()
  if (account?.role!=='tutor') return Response.json({error:'Tutor login required'},{status:403})
  const body = await request.json().catch(()=>null)
  if (!body || !isClassId(body.requestId) || typeof body.subject!=='string' || typeof body.topic!=='string' || typeof body.classLevel!=='string'
    || typeof body.description!=='string' || typeof body.startsAt!=='string' || !Number.isFinite(Date.parse(body.startsAt))
    || !Number.isInteger(body.durationMin) || !Number.isInteger(body.capacity) || typeof body.fee!=='number' || !Number.isFinite(body.fee)) return Response.json({error:'Complete the class details'},{status:400})
  if (body.durationMin < 15 || body.durationMin > 300) return Response.json({error:'Duration must be between 15 and 300 minutes (maximum 5 hours).'},{status:400})
  try { assertScheduledRecordingConfig() } catch { return Response.json({error:'Scheduled classes require configured LiveKit recording and storage. Contact the administrator.'},{status:503}) }
  const {data,error} = await supabaseAdmin.rpc('create_scheduled_class',{
    p_id:body.requestId,p_tutor:account.email,p_subject:body.subject,p_topic:body.topic,p_level:body.classLevel,p_description:body.description,
    p_starts:body.startsAt,p_duration:body.durationMin,p_fee:body.fee,p_capacity:body.capacity,
  })
  if (error) return classRpcError(error)
  return Response.json({class:publicClass(data)},{headers:classHeaders})
}

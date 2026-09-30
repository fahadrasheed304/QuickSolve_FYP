import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const validId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (session?.role !== 'tutor' || typeof session.email !== 'string') return Response.json({error:'Tutor login required'},{status:403})
  const id = new URL(request.url).searchParams.get('session')
  if (!validId(id)) return Response.json({error:'Invalid session'},{status:400})
  const {data,error}=await supabaseAdmin.from('student_reviews').select('rating,feedback').eq('problem_id',id).eq('tutor_email',session.email.toLowerCase().trim()).maybeSingle()
  if(error) return Response.json({error:'Student reviews unavailable. Apply the student reviews migration.'},{status:503})
  return Response.json({review:data},{headers:{'Cache-Control':'no-store'}})
}
export async function POST(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (session?.role !== 'tutor' || typeof session.email !== 'string') return Response.json({error:'Tutor login required'},{status:403})
  const body=await request.json().catch(()=>null)
  if(!body || !validId(body.problemId) || !Number.isInteger(body.rating) || body.rating<1 || body.rating>5 || typeof body.feedback!=='string' || body.feedback.length>2000) return Response.json({error:'Choose 1–5 stars and feedback up to 2000 characters.'},{status:400})
  const {data,error}=await supabaseAdmin.rpc('submit_student_review',{p_problem:body.problemId,p_tutor:session.email.toLowerCase().trim(),p_rating:body.rating,p_feedback:body.feedback.trim()})
  if(error) return Response.json({error:error.code==='P0001'?error.message:'Student review could not be saved. Please retry.'},{status:error.code==='P0001'?409:503})
  return Response.json({review:data})
}

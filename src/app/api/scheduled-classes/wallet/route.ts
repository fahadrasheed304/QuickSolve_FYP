import { supabaseAdmin } from '@/lib/supabase'
import { classAccount, classHeaders } from '@/lib/scheduled-classes-server'
export const dynamic='force-dynamic'
export async function GET(){
  const account=await classAccount()
  if(!account||!['student','tutor'].includes(account.role))return Response.json({error:'Login required'},{status:401})
  const {data,error}=await supabaseAdmin.rpc('scheduled_wallet_summary',{p_email:account.email,p_role:account.role})
  if(error)return Response.json({error:'Group class balances unavailable. Apply the scheduled classes migration.'},{status:503})
  return Response.json(data,{headers:classHeaders})
}

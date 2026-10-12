import { timingSafeEqual } from 'crypto'
import { maintainScheduledClasses } from '@/lib/scheduled-class-recordings'
export const runtime='nodejs'
export const maxDuration=60
export const dynamic='force-dynamic'
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET
  const received=Buffer.from(request.headers.get('authorization')||'')
  const expected=Buffer.from(`Bearer ${secret}`)
  if (!secret||received.length!==expected.length||!timingSafeEqual(received,expected)) return Response.json({error:'Unauthorized'},{status:401})
  try {
    const result=await maintainScheduledClasses()
    return Response.json(result,{status:result.failures.length?503:200,headers:{'Cache-Control':'no-store'}})
  } catch {return Response.json({error:'Class maintenance unavailable; retry the job'},{status:503})}
}

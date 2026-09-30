import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { summarizeAttendance, type AttendanceEvent } from '@/lib/session-attendance'

export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (session?.role !== 'admin' || typeof session.email !== 'string' || !isAdminEmail(session.email)) return Response.json({ error: 'Admin access required.' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('session')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: 'Invalid session.' }, { status: 400 })
  try {
    const events: AttendanceEvent[] = []
    for (let offset=0;;offset+=500) {
      const { data,error } = await supabaseAdmin.from('session_attendance_events').select('event_id,room_sid,participant_sid,identity,kind,occurred_at').eq('problem_id',id).order('occurred_at').order('event_id').range(offset,offset+499)
      if (error) throw error
      events.push(...(data || []))
      if (!data || data.length<500) break
    }
    return Response.json({ attendance: summarizeAttendance(events) },{headers:{'Cache-Control':'no-store'}})
  } catch { return Response.json({error:'Attendance unavailable. Apply the attendance migration and retry.'},{status:503}) }
}

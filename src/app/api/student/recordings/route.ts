import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { recordingDownload } from '@/lib/recordings'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

export async function GET(request: Request) {
  try {
    const session = await decrypt((await cookies()).get('auth_token')?.value)
    if (session?.role !== 'student' || typeof session.email !== 'string') return Response.json({ error: 'Student login required' }, { status: 401, headers })
    const params = new URL(request.url).searchParams
    const problemId = params.get('problemId') || ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(problemId)) return Response.json({ error: 'Invalid session' }, { status: 400, headers })
    const { data: problem, error } = await supabaseAdmin.from('problems')
      .select('session_ended_at').eq('id', problemId).eq('student_email', session.email.toLowerCase().trim()).maybeSingle()
    if (error) throw error
    if (!problem) return Response.json({ error: 'Session not found' }, { status: 404, headers })
    if (!problem.session_ended_at) return Response.json({ error: 'Recording will be available after the session ends. Please retry shortly.' }, { status: 409, headers })
    const expiresAt = Date.parse(problem.session_ended_at) + 15 * 60000
    if (Date.now() >= expiresAt) return Response.json({ error: 'The 15-minute recording download window has closed.' }, { status: 410, headers })
    const egressId = params.get('egressId')
    if (egressId) {
      const { data, error } = await supabaseAdmin.from('session_recordings').select('object_key,state')
        .eq('problem_id', problemId).eq('egress_id', egressId).maybeSingle()
      if (error) throw error
      if (!data) return Response.json({ error: 'Recording not found' }, { status: 404, headers })
      if (data.state !== 'ready' || !data.object_key) return Response.json({ error: 'Recording is not available for download.' }, { status: 409, headers })
      return Response.json({ url: await recordingDownload(data.object_key, problemId, Math.max(1, Math.min(300, Math.floor((expiresAt - Date.now()) / 1000)))) }, { headers })
    }
    const { data, error: listError } = await supabaseAdmin.from('session_recordings')
      .select('egress_id,state').eq('problem_id', problemId).order('created_at').limit(100)
    if (listError) throw listError
    return Response.json({ recordings: data || [], expiresAt }, { headers })
  } catch {
    return Response.json({ error: 'Could not load recordings. Please retry.' }, { status: 503, headers })
  }
}

import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { recordingPlayback, validRecordingKey } from '@/lib/recordings'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

export async function GET(request: Request) {
  try {
    const session = await decrypt((await cookies()).get('auth_token')?.value)
    if (session?.role !== 'admin' || typeof session.email !== 'string' || !isAdminEmail(session.email)) {
      return Response.json({ error: 'Admin login required' }, { status: 403, headers })
    }
    const params = new URL(request.url).searchParams
    const problemId = params.get('problemId') || ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(problemId)) {
      return Response.json({ error: 'Invalid session' }, { status: 400, headers })
    }
    const egressId = params.get('egressId')
    if (egressId) {
      const { data, error } = await supabaseAdmin.from('session_recordings')
        .select('object_key,state').eq('problem_id', problemId).eq('egress_id', egressId).maybeSingle()
      if (error) throw new Error('Recording unavailable')
      if (!data) return Response.json({ error: 'Recording not found' }, { status: 404, headers })
      if (data.state !== 'ready' || !data.object_key) return Response.json({ error: 'Recording is not available for playback' }, { status: 409, headers })
      if (!validRecordingKey(problemId, data.object_key)) throw new Error('Invalid recording path')
      return Response.json({ url: await recordingPlayback(data.object_key), expiresIn: 900 }, { headers })
    }
    const { data, error } = await supabaseAdmin.from('session_recordings')
      .select('egress_id,state,created_at,updated_at,deleted_at').eq('problem_id', problemId).order('created_at').limit(100)
    if (error) throw new Error('Recording list unavailable')
    return Response.json({ recordings: data || [] }, { headers })
  } catch {
    return Response.json({ error: 'Recordings unavailable. Check recording setup or retry.' }, { status: 503, headers })
  }
}

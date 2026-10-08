import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { DEMO_BUCKET, DEMO_SUBJECTS } from '@/lib/teaching-demos'
import { demoSession, inspectDemo } from '@/lib/teaching-demos-server'

export const runtime = 'nodejs'
export const maxDuration = 60
const fields = 'id,subject,topic,class_level,status,duration_seconds,feedback,scores,created_at'

export async function GET() {
  const session = await demoSession()
  if (session?.role !== 'tutor') return NextResponse.json({ error: 'Tutor access required' }, { status: 403 })
  const { data, error } = await supabaseAdmin.from('tutor_teaching_demos').select(fields)
    .eq('tutor_email', session.email).in('status', ['uploading', 'pending', 'approved', 'rejected'])
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Teaching demos unavailable. Please contact support.' }, { status: 503 })
  return NextResponse.json({ demos: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const session = await demoSession()
  if (session?.role !== 'tutor') return NextResponse.json({ error: 'Tutor access required' }, { status: 403 })
  try {
    const body = await request.json()
    if (body.action === 'reserve') {
      const subject = String(body.subject || '')
      const topic = String(body.topic || '').trim()
      const classLevel = String(body.classLevel || '').trim()
      if (!DEMO_SUBJECTS.includes(subject) || topic.length < 3 || topic.length > 120 || !classLevel || classLevel.length > 60) {
        return NextResponse.json({ error: 'Select a subject, topic (3-120 characters) and class (up to 60 characters).' }, { status: 400 })
      }
      const { data: demo, error } = await supabaseAdmin.rpc('reserve_tutor_demo', {
        p_email: session.email, p_subject: subject, p_topic: topic, p_class: classLevel,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 409 })
      const { data: upload, error: uploadError } = await supabaseAdmin.storage.from(DEMO_BUCKET).createSignedUploadUrl(demo.object_key)
      if (uploadError || !upload) {
        await supabaseAdmin.from('tutor_teaching_demos').update({ status: 'cancelled' }).eq('id', demo.id).eq('status', 'uploading')
        return NextResponse.json({ error: 'Could not prepare upload. Please retry.' }, { status: 503 })
      }
      return NextResponse.json({ id: demo.id, uploadUrl: upload.signedUrl })
    }
    if (!['complete', 'cancel'].includes(body.action) || typeof body.id !== 'string') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    const { data: demo, error } = await supabaseAdmin.from('tutor_teaching_demos').select('*').eq('id', body.id).eq('tutor_email', session.email).maybeSingle()
    if (error) throw new Error('Could not load demo')
    if (!demo) return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
    if (body.action === 'cancel') {
      const { data, error: cancelError } = await supabaseAdmin.from('tutor_teaching_demos').update({ status: 'cancelled' })
        .eq('id', demo.id).in('status', ['uploading', 'pending']).select('id')
      if (cancelError) throw new Error('Could not cancel demo')
      if (!data?.length) return NextResponse.json({ error: 'This submission can no longer be cancelled' }, { status: 409 })
      // Leave cancelled objects private: upload tokens can remain valid for two hours.
      return NextResponse.json({ success: true })
    }
    if (demo.status !== 'uploading') return NextResponse.json({ error: 'This upload is no longer awaiting completion' }, { status: 409 })
    const { data: video, error: downloadError } = await supabaseAdmin.storage.from(DEMO_BUCKET).download(demo.object_key)
    if (downloadError || !video) return NextResponse.json({ error: 'Upload has not finished. Retry after uploading the file.' }, { status: 409 })
    let duration: number
    try { duration = inspectDemo(await video.arrayBuffer()) } catch (err) {
      await supabaseAdmin.from('tutor_teaching_demos').update({ status: 'cancelled' }).eq('id', demo.id).eq('status', 'uploading')
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid video' }, { status: 400 })
    }
    const { data, error: saveError } = await supabaseAdmin.from('tutor_teaching_demos')
      .update({ status: 'pending', duration_seconds: duration, file_size: video.size })
      .eq('id', demo.id).eq('status', 'uploading').select('id')
    if (saveError) throw new Error('Could not submit demo. Retry completion.')
    if (!data?.length) return NextResponse.json({ error: 'Submission changed. Refresh and retry.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Teaching demo upload:', err)
    return NextResponse.json({ error: 'Could not process demo. Please retry.' }, { status: 503 })
  }
}

import { cookies } from 'next/headers'
import { createFile, type Movie } from 'mp4box'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { DEMO_BUCKET, DEMO_MAX_BYTES, DEMO_MAX_SECONDS } from '@/lib/teaching-demos'

export async function demoSession() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session || typeof session.email !== 'string') return null
  return { email: session.email.toLowerCase().trim(), role: session.role }
}

export async function demoSubjectsReady(email: string, subjects: string[], approved: boolean) {
  const { data, error } = await supabaseAdmin.from('tutor_teaching_demos').select('subject')
    .eq('tutor_email', email.toLowerCase().trim()).in('status', approved ? ['approved'] : ['pending', 'approved'])
  if (error) throw new Error('Teaching demos unavailable. Apply the teaching demo migration and retry.')
  const ready = new Set((data || []).map(d => d.subject))
  return subjects.length > 0 && subjects.every(subject => ready.has(subject))
}

export async function demoPlayback(key: string) {
  const { data, error } = await supabaseAdmin.storage.from(DEMO_BUCKET).createSignedUrl(key, 600)
  if (error || !data) throw new Error('Video unavailable. Please retry.')
  return data.signedUrl
}

export function inspectDemo(buffer: ArrayBuffer) {
  if (!buffer.byteLength || buffer.byteLength > DEMO_MAX_BYTES) throw new Error('Video must be at most 50 MB')
  const file = createFile()
  let metadata: Movie | undefined
  let invalid = false
  file.onReady = info => { metadata = info }
  file.onError = () => { invalid = true }
  const input = buffer as Parameters<typeof file.appendBuffer>[0]
  input.fileStart = 0
  try { file.appendBuffer(input); file.flush() } catch { invalid = true }
  if (invalid || !metadata || !metadata.videoTracks.length || !metadata.audioTracks.length || metadata.isFragmented) {
    throw new Error('Upload a standard MP4 with both video and audio')
  }
  const duration = Math.max(metadata.duration / metadata.timescale,
    ...metadata.tracks.map(track => track.duration / track.timescale))
  if (!Number.isFinite(duration) || duration <= 0 || duration > DEMO_MAX_SECONDS) throw new Error('Demo must be no longer than 5 minutes')
  return duration
}

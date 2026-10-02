"use client"

import { useEffect, useRef, useState } from 'react'

type Recording = { egress_id: string; state: string; created_at: string }
const labels: Record<string, string> = { starting: 'Starting', recording: 'Recording', processing: 'Processing video', ready: 'Ready', failed: 'Recording failed', deleting: 'Being deleted', deleted: 'Deleted after retention window' }

export function AdminSessionRecordings({ problemId }: { problemId: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Recording[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [video, setVideo] = useState<{ id: string; url: string } | null>(null)
  const playbackRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/admin/recordings?problemId=${encodeURIComponent(problemId)}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        if (!controller.signal.aborted) { setRows(data.recordings); setError('') }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load recordings')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    const timer = setInterval(load, 15000)
    return () => { controller.abort(); clearInterval(timer); playbackRequest.current?.abort() }
  }, [open, problemId])

  const play = async (id: string) => {
    playbackRequest.current?.abort()
    const controller = new AbortController()
    playbackRequest.current = controller
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/recordings?problemId=${encodeURIComponent(problemId)}&egressId=${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (!controller.signal.aborted) setVideo({ id, url: data.url })
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Playback unavailable')
    } finally { if (!controller.signal.aborted) setBusy(false) }
  }

  return <section className="space-y-3 border-t border-border pt-3">
    <button className="rounded-lg border border-border px-3 py-2 text-sm font-semibold" aria-expanded={open} onClick={() => { setOpen(value => !value); setVideo(null); setBusy(false) }}>{open ? 'Close recordings' : 'View session recordings'}</button>
    {open && <>
      <p className="text-xs text-text-muted">Private evidence for admin review. Held payments preserve recordings until resolution. Other recordings are eligible for deletion 20 minutes after the session ends.</p>
      {loading && !rows.length && <p role="status" className="text-sm">Loading recordings...</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!loading && !error && !rows.length && <p className="text-sm text-text-muted">No recording was saved for this session.</p>}
      {rows.map((row, index) => <div key={row.egress_id} className="flex flex-wrap items-center gap-3 text-sm">
        <span>Part {index + 1} · {new Date(row.created_at).toLocaleString()} · {labels[row.state] || row.state}</span>
        {row.state === 'ready' && <button disabled={busy} className="rounded border border-border px-3 py-1 font-semibold text-primary disabled:opacity-50" onClick={() => void play(row.egress_id)}>{busy ? 'Loading...' : 'Play / renew link'}</button>}
      </div>)}
      {video && <video key={video.url} src={video.url} controls playsInline preload="metadata" className="max-h-[480px] w-full rounded-lg bg-black" aria-label="Session recording" onError={() => setError('Video could not load. Renew the playback link; it expires after 15 minutes.')} />}
    </>}
  </section>
}

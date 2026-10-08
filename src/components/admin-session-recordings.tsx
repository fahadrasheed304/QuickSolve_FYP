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

  return <section className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black">Session recordings</h3><p className="mt-1 text-xs text-text-muted">Private playback for admin review</p></div><button className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold transition hover:border-primary hover:text-primary" aria-expanded={open} onClick={() => { setOpen(value => !value); setVideo(null); setBusy(false) }}>{open ? 'Close recordings' : 'View recordings'}</button></div>
    {open && <>
      <p className="text-xs leading-5 text-text-muted">Held payments preserve recordings until resolution. Other recordings become eligible for deletion 15 minutes after the session ends.</p>
      {loading && !rows.length && <p role="status" className="rounded-lg bg-surface p-4 text-sm text-text-muted">Loading recordings...</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!loading && !error && !rows.length && <p className="rounded-lg bg-surface p-4 text-sm text-text-muted">No recording was saved for this session.</p>}
      {rows.map((row, index) => <div key={row.egress_id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="font-bold">Recording part {index + 1}</p><p className="mt-1 text-xs text-text-muted">{new Date(row.created_at).toLocaleString()} <span className="px-1">-</span> {labels[row.state] || row.state}</p></div>
        {row.state === 'ready' && <button disabled={busy} className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-50" onClick={() => void play(row.egress_id)}>{busy ? 'Loading video...' : video?.id === row.egress_id ? 'Renew playback link' : 'Play recording'}</button>}
      </div>)}
      {video && <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-lg"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-white"><div><p className="text-sm font-bold">Session recording playback</p><p className="mt-0.5 text-xs text-slate-400">Secure link expires after 15 minutes</p></div><button className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-semibold hover:bg-white/10" onClick={() => setVideo(null)}>Close player</button></div><video key={video.url} src={video.url} controls playsInline preload="metadata" className="aspect-video max-h-[72vh] w-full bg-black object-contain" aria-label="Session recording" onError={() => setError('Video could not load. Renew the playback link; it expires after 15 minutes.')} /></div>}
    </>}
  </section>
}

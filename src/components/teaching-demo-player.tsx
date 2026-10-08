"use client"

import { useRef, useState } from 'react'
import { Play, RefreshCw, X } from 'lucide-react'

export function TeachingDemoPlayer({ id, bidId }: { id?: string; bidId?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [data, setData] = useState<{ url: string; topic: string; subject: string; classLevel: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function load() {
    setLoading(true); setError(''); setData(null)
    try {
      const params = new URLSearchParams(bidId ? { bidId } : { id: id || '' })
      const response = await fetch(`/api/demos/playback?${params}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setData(result)
    } catch (err) { setError(err instanceof Error ? err.message : 'Video unavailable') }
    finally { setLoading(false) }
  }
  function close() { video.current?.pause(); dialog.current?.close(); setData(null) }
  return <>
    <button type="button" onClick={() => { dialog.current?.showModal(); void load() }} className="mr-3 inline-flex items-center gap-2 py-2 text-sm font-semibold text-primary">
      <Play className="h-4 w-4 shrink-0" />Watch teaching demo
    </button>
    <dialog ref={dialog} onCancel={close} onClose={() => video.current?.pause()} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-lg border border-border bg-surface p-5 text-text-main backdrop:bg-black/60">
      <div className="flex items-start justify-between gap-4">
        <h2 className="break-words text-lg font-bold">{data?.topic || 'Teaching demo'}</h2>
        <button type="button" onClick={close} title="Close video" aria-label="Close video" className="shrink-0 p-2"><X className="h-5 w-5" /></button>
      </div>
      {data && <p className="mb-3 text-sm text-text-muted">{data.subject} / {data.classLevel}</p>}
      {loading && <p role="status" className="py-12 text-center">Loading video...</p>}
      {error && <div role="alert" className="py-6"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 text-primary"><RefreshCw className="h-4 w-4" />Retry</button></div>}
      {data && <video ref={video} src={data.url} controls playsInline preload="metadata" aria-label={data.topic} className="aspect-video w-full rounded bg-black object-contain" onError={() => setError('Video could not play. Retry to refresh the playback link.')} />}
    </dialog>
  </>
}

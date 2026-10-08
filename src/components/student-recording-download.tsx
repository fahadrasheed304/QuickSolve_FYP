'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Recording = { egress_id: string; state: string }

export function StudentRecordingDownload({ problemId, onContinue, fromHistory = false }: { problemId: string; onContinue: () => void; fromHistory?: boolean }) {
  const [wanted, setWanted] = useState(fromHistory)
  const [rows, setRows] = useState<Recording[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState<string[]>([])

  useEffect(() => {
    if (!wanted) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      let retry = true
      try {
        const response = await fetch(`/api/student/recordings?problemId=${encodeURIComponent(problemId)}`, { cache: 'no-store', signal: controller.signal })
        const data = await response.json()
        if (!response.ok) {
          retry = ![400, 401, 404, 410].includes(response.status)
          if (response.status === 410) setRows([])
          throw new Error(data.error)
        }
        setRows(data.recordings)
        setError('')
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load recordings.')
      } finally {
        if (retry && !controller.signal.aborted) timer = setTimeout(load, 4000)
      }
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [wanted, problemId])

  const download = async (id: string) => {
    setBusy(id)
    try {
      const response = await fetch(`/api/student/recordings?problemId=${encodeURIComponent(problemId)}&egressId=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      const link = document.createElement('a')
      link.href = data.url
      link.referrerPolicy = 'no-referrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setDownloaded(previous => [...previous, id])
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Download failed. Please retry.')
    } finally { setBusy(null) }
  }

  return <Dialog open onOpenChange={onContinue}>
    <DialogContent className="sm:max-w-md">
      <h2 className="text-xl font-black text-text-main">Save your session recording?</h2>
      <p className="text-sm text-text-muted">Download an MP4 to watch offline later. Downloads are available here and in Session History for 15 minutes after the session ends. Keep this window open while the recording finishes processing.</p>
      {!wanted ? <div className="mt-4 flex gap-3"><Button onClick={() => setWanted(true)}>Yes, download</Button><Button variant="outline" onClick={onContinue}>Skip</Button></div> : <div className="mt-4 space-y-3">
        <div role="status" className="space-y-3 text-sm text-text-main">
          {!rows.length && !error && <p>Waiting for the recording. If this session was not recorded, {fromHistory ? 'close this window' : 'choose Continue to review'}.</p>}
          {rows.map((row, index) => <div key={row.egress_id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span>Recording {index + 1}</span>
            {row.state === 'ready' ? <Button size="sm" disabled={busy !== null} onClick={() => void download(row.egress_id)}>{busy === row.egress_id ? 'Starting…' : downloaded.includes(row.egress_id) ? 'Download again' : 'Download MP4'}</Button> : <span className="text-text-muted">{['starting', 'recording', 'processing'].includes(row.state) ? 'Processing…' : row.state === 'failed' ? 'Recording failed' : 'No longer available'}</span>}
          </div>)}
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!!downloaded.length && <p className="text-xs text-text-muted">Download requested. Check your browser downloads for progress.</p>}
        <Button variant="outline" onClick={onContinue}>{fromHistory ? 'Close' : 'Continue to review'}</Button>
      </div>}
    </DialogContent>
  </Dialog>
}

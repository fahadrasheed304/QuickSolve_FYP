"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, RefreshCw, X, CheckCircle } from 'lucide-react'
import { DEMO_MAX_BYTES, type TeachingDemo } from '@/lib/teaching-demos'
import { TeachingDemoPlayer } from '@/components/teaching-demo-player'

async function command(body: object) {
  const response = await fetch('/api/tutor/demos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not save demo')
  return data
}

export function TutorTeachingDemos({ subjects, onReadyChange }: { subjects: string[]; onReadyChange?: (subjects: string[]) => void }) {
  const [demos, setDemos] = useState<TeachingDemo[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const focused = useRef(false)
  const section = useRef<HTMLElement>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/tutor/demos', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      const rows = data.demos as TeachingDemo[]
      setDemos(rows); setError('')
      onReadyChange?.(rows.filter(d => ['pending', 'approved'].includes(d.status)).map(d => d.subject))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load demos')
      onReadyChange?.([])
    } finally { setLoading(false) }
  }, [onReadyChange])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('demo')
    const target = demos.find(d => d.id === id)
    if (!target || focused.current) return
    const element = Array.from(section.current?.querySelectorAll<HTMLElement>('[data-demo-subject]') || [])
      .find(el => el.dataset.demoSubject === target.subject)
    if (element) { element.focus(); element.scrollIntoView({ block: 'center' }); focused.current = true }
  }, [demos])
  const ready = subjects.filter(subject => demos.some(d => d.subject === subject && ['pending', 'approved'].includes(d.status))).length
  return <section ref={section} id="teaching-demos" className="min-w-0 space-y-4 py-5">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Teaching demos</h2><p className="text-sm text-text-muted">{ready} of {subjects.length} subjects submitted</p></div><button type="button" title="Refresh demos" aria-label="Refresh demos" disabled={loading} onClick={() => void load()} className="p-2"><RefreshCw className="h-4 w-4" /></button></div>
    {loading && <p role="status">Loading demos...</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="divide-y divide-border">{subjects.map(subject => <SubjectDemo key={subject} subject={subject} demos={demos.filter(d => d.subject === subject)} onSaved={load} disabled={loading || Boolean(error)} />)}</div>
  </section>
}

function SubjectDemo({ subject, demos, onSaved, disabled }: { subject: string; demos: TeachingDemo[]; onSaved: () => Promise<void>; disabled: boolean }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [topic, setTopic] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const approved = demos.find(d => d.status === 'approved')
  const active = demos.find(d => ['uploading', 'pending'].includes(d.status))
  const rejected = demos[0]?.status === 'rejected' ? demos[0] : null
  async function upload(event: React.FormEvent) {
    event.preventDefault()
    if (!file || busy || disabled || active) return
    if (file.type !== 'video/mp4' || file.size > DEMO_MAX_BYTES || file.size === 0) { setError('Choose an MP4 video up to 50 MB.'); return }
    setBusy(true); setError(''); setProgress('Preparing upload...')
    let reservation: string | undefined
    let uploaded = false
    try {
      const data = await command({ action: 'reserve', subject, topic, classLevel })
      reservation = data.id
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', data.uploadUrl)
        xhr.setRequestHeader('Content-Type', 'video/mp4')
        xhr.timeout = 10 * 60 * 1000
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(`Uploading ${Math.round(e.loaded / e.total * 100)}%`) }
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Please retry.'))
        xhr.onerror = () => reject(new Error('Upload connection failed. Please retry.'))
        xhr.ontimeout = () => reject(new Error('Upload timed out. Please retry.'))
        xhr.send(file)
      })
      uploaded = true
      setProgress('Checking video...')
      await command({ action: 'complete', id: reservation })
      setFile(null); setFileKey(k => k + 1); setTopic(''); setProgress('Demo submitted for review.')
      await onSaved()
    } catch (err) {
      if (reservation && !uploaded) await command({ action: 'cancel', id: reservation }).catch(() => {})
      await onSaved()
      setError(err instanceof Error ? err.message : 'Upload failed'); setProgress('')
    } finally { setBusy(false) }
  }
  async function update(id: string, action: 'cancel' | 'complete') {
    setBusy(true); setError('')
    try { await command({ id, action }); await onSaved() }
    catch (err) { setError(err instanceof Error ? err.message : 'Please retry') }
    finally { setBusy(false) }
  }
  const form = <form onSubmit={upload} aria-label={`${subject} demo upload`} className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm font-semibold">Class / level<input required maxLength={60} value={classLevel} disabled={busy || disabled} onChange={e => setClassLevel(e.target.value)} placeholder="Matric, Class 10" className="min-w-0 rounded border border-border bg-surface p-2" /></label>
    <label className="grid gap-1 text-sm font-semibold">Topic<input required minLength={3} maxLength={120} value={topic} disabled={busy || disabled} onChange={e => setTopic(e.target.value)} className="min-w-0 rounded border border-border bg-surface p-2" /></label>
    <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Demo video (MP4, up to 5 minutes, 50 MB)<input key={fileKey} type="file" required accept="video/mp4,.mp4" disabled={busy || disabled} onChange={e => setFile(e.target.files?.[0] || null)} className="w-full min-w-0 rounded border border-border p-2 text-sm" /></label>
    <div className="sm:col-span-2"><button type="submit" disabled={busy || disabled || !file} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50"><Upload className="h-4 w-4" />{busy ? 'Submitting...' : rejected ? 'Re-upload demo' : 'Submit demo'}</button></div>
  </form>
  return <article tabIndex={-1} data-demo-subject={subject} className="min-w-0 space-y-2 py-5 focus:outline-primary">
    <h3 className="break-words text-lg font-semibold">{subject}</h3>
    {approved && <div><p className="flex items-center gap-2 text-sm text-success"><CheckCircle className="h-4 w-4" />Demo approved</p><TeachingDemoPlayer id={approved.id} /></div>}
    {!approved && !active && !rejected && <p className="text-sm text-text-muted">Demo required</p>}
    {rejected && <div className="border-l-4 border-amber-500 pl-3"><p className="font-semibold text-amber-700">Changes requested: {rejected.topic}</p><p className="whitespace-pre-wrap break-words text-sm">{rejected.feedback}</p><TeachingDemoPlayer id={rejected.id} /></div>}
    {active && <div className="text-sm"><p className="break-words">{active.topic}: <strong>{active.status === 'uploading' ? 'Upload incomplete' : 'Awaiting review'}</strong></p>
      {active.status === 'pending' ? <TeachingDemoPlayer id={active.id} /> : <button type="button" disabled={busy} onClick={() => void update(active.id, 'complete')} className="mr-4 inline-flex items-center gap-1 py-2 text-primary"><RefreshCw className="h-4 w-4" />Retry submission</button>}
      <button type="button" disabled={busy} onClick={() => void update(active.id, 'cancel')} className="inline-flex items-center gap-1 py-2 text-red-600"><X className="h-4 w-4" />Cancel submission</button>
    </div>}
    {!active && (approved && !rejected ? <details><summary className="cursor-pointer text-sm font-semibold text-primary">Replace demo</summary>{form}</details> : form)}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <p role="status" className="text-sm">{progress}</p>
  </article>
}

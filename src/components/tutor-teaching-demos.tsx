"use client"

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Upload, RefreshCw, X, CheckCircle, Video, Clock3, AlertCircle, FileVideo2, ArrowUpFromLine } from 'lucide-react'
import { DEMO_MAX_BYTES, type TeachingDemo } from '@/lib/teaching-demos'
import { TeachingDemoPlayer } from '@/components/teaching-demo-player'

async function command(body: object) {
  const response = await fetch('/api/tutor/demos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Could not save demo')
  return data
}

export function TutorTeachingDemos({ subjects, onReadyChange, onRequiredChange }: { subjects: string[]; onReadyChange?: (subjects: string[]) => void; onRequiredChange?: (required: boolean) => void }) {
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
      onRequiredChange?.(data.required === true)
      onReadyChange?.(rows.filter(d => ['pending', 'approved'].includes(d.status)).map(d => d.subject))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load demos')
      onReadyChange?.([])
    } finally { setLoading(false) }
  }, [onReadyChange, onRequiredChange])
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
  return <section ref={section} id="teaching-demos" className="min-w-0 space-y-5 py-2">
    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-surface to-secondary/[0.07] p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20"><Video className="size-6" /></div>
          <div><h2 className="text-xl font-bold tracking-tight text-text-main">Teaching demos</h2><p className="mt-1 text-sm text-text-muted">Show students how you teach, one subject at a time.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-text-main">{ready} of {subjects.length} submitted</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-amber-700"><Clock3 className="size-3.5" />MP4 · up to 5 min · 50 MB</span>
            </div>
          </div>
        </div>
        <button type="button" title="Refresh demos" aria-label="Refresh demos" disabled={loading} onClick={() => void load()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text-main shadow-sm transition hover:border-primary/40 hover:text-primary disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />Refresh status</button>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-primary/10" role="progressbar" aria-label="Teaching demos submitted" aria-valuemin={0} aria-valuemax={subjects.length} aria-valuenow={ready}>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500" style={{ width: `${subjects.length ? ready / subjects.length * 100 : 0}%` }} />
      </div>
    </div>
    {loading && <p role="status" className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">Loading your subject demos…</p>}
    {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-error/20 bg-red-50 p-4 text-sm text-error"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
    <div className="grid gap-4 xl:grid-cols-2">{subjects.map(subject => <SubjectDemo key={subject} subject={subject} demos={demos.filter(d => d.subject === subject)} onSaved={load} disabled={loading || Boolean(error)} />)}</div>
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
  const inputId = useId()
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
  const form = <form onSubmit={upload} aria-label={`${subject} demo upload`} className="mt-5 grid gap-4 sm:grid-cols-2">
    <label className="grid gap-1.5 text-sm font-semibold text-text-main">Class / level<input required maxLength={60} value={classLevel} disabled={busy || disabled} onChange={e => setClassLevel(e.target.value)} placeholder="e.g. Matric, Class 10" className="min-w-0 rounded-xl border border-border bg-background px-3.5 py-3 font-normal outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60" /></label>
    <label className="grid gap-1.5 text-sm font-semibold text-text-main">Demo topic<input required minLength={3} maxLength={120} value={topic} disabled={busy || disabled} onChange={e => setTopic(e.target.value)} placeholder="e.g. Solving quadratic equations" className="min-w-0 rounded-xl border border-border bg-background px-3.5 py-3 font-normal outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60" /></label>
    <div className="sm:col-span-2"><label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-text-main">Teaching video</label><input id={inputId} key={fileKey} type="file" required accept="video/mp4,.mp4" disabled={busy || disabled} onChange={e => setFile(e.target.files?.[0] || null)} className="sr-only" />
      <label htmlFor={inputId} className={`flex min-h-[76px] cursor-pointer items-center gap-3 rounded-xl border border-dashed border-primary/35 bg-primary/[0.035] px-4 py-3 transition hover:border-primary hover:bg-primary/[0.07] ${busy || disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{file ? <FileVideo2 className="size-5" /> : <ArrowUpFromLine className="size-5" />}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-text-main">{file?.name || 'Choose a demo video'}</span><span className="mt-1 block text-xs text-text-muted">MP4 video with audio · maximum 5 minutes and 50 MB</span></span>
        <span className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-text-main">Browse</span>
      </label>
    </div>
    <div className="sm:col-span-2"><button type="submit" disabled={busy || disabled || !file} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-bold text-white shadow-md shadow-primary/15 transition hover:-translate-y-0.5 hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"><Upload className="size-4" />{busy ? 'Submitting…' : rejected ? 'Re-upload demo' : 'Submit demo for review'}</button></div>
  </form>
  return <article tabIndex={-1} data-demo-subject={subject} className="min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-primary/25 hover:shadow-md focus:outline-primary sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">Subject demo</p><h3 className="mt-1 break-words text-xl font-bold tracking-tight text-text-main">{subject}</h3></div>
      {approved ? <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1.5 text-xs font-bold text-success"><CheckCircle className="size-3.5" />Approved</span> : active ? <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"><Clock3 className="size-3.5" />{active.status === 'uploading' ? 'Upload incomplete' : 'In review'}</span> : rejected ? <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700"><AlertCircle className="size-3.5" />Changes requested</span> : <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700">Required</span>}
    </div>
    {approved && <div className="mt-4"><p className="mb-2 text-sm text-text-muted">Your approved demo is visible to students with your bid.</p><TeachingDemoPlayer id={approved.id} /></div>}
    {rejected && <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4"><p className="font-semibold text-amber-800">Feedback for: {rejected.topic}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">{rejected.feedback}</p><div className="mt-3"><TeachingDemoPlayer id={rejected.id} /></div></div>}
    {active && <div className="text-sm"><p className="break-words">{active.topic}: <strong>{active.status === 'uploading' ? 'Upload incomplete' : 'Awaiting review'}</strong></p>
      {active.status === 'pending' ? <div className="mt-3"><TeachingDemoPlayer id={active.id} /></div> : <button type="button" disabled={busy} onClick={() => void update(active.id, 'complete')} className="mr-4 mt-2 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 font-semibold text-primary"><RefreshCw className="size-4" />Retry submission</button>}
      <button type="button" disabled={busy} onClick={() => void update(active.id, 'cancel')} className="mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-2 font-semibold text-error hover:bg-red-50"><X className="size-4" />Cancel submission</button>
    </div>}
    {!active && (approved && !rejected ? <details className="mt-4 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-bold text-primary marker:text-primary">Replace demo</summary>{form}</details> : form)}
    {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-error"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
    {progress && <p role="status" className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-primary">{progress}</p>}
  </article>
}

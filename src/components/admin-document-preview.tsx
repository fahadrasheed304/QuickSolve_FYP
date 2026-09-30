'use client'

import { useRef, useState } from 'react'
import { X } from 'lucide-react'

export function documentUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

export function AdminDocumentPreview({ url, label, avatar = false, pdf = false }: { url: string; label: string; avatar?: boolean; pdf?: boolean }) {
  const [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  function close() { dialog.current?.close(); setOpen(false) }
  return <>
    <button type="button" onClick={() => { setOpen(true); dialog.current?.showModal() }} className={avatar ? 'block size-full' : 'block w-full overflow-hidden rounded-xl border border-border bg-surface text-primary'} aria-label={`Preview ${label}`}>
      {pdf ? <span className="block p-4 text-sm font-semibold">Preview PDF</span> : failed ? <span className="block p-3 text-xs">Image unavailable</span> : <>
        {/* Uploaded document URLs are served directly, without image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} loading={avatar ? 'eager' : 'lazy'} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={avatar ? 'size-full object-cover' : 'h-36 w-full object-contain'} />
      </>}
    </button>
    <dialog ref={dialog} aria-label={`${label} preview`} onCancel={event => { event.preventDefault(); event.stopPropagation(); close() }} onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close() }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-slate-950/70">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3"><h2 className="truncate text-sm font-bold">{label}</h2><button type="button" autoFocus onClick={close} aria-label="Close preview" className="rounded-lg p-2 hover:bg-muted"><X size={18} /></button></header>
      {open && (pdf ? <iframe src={url} title={`${label} PDF preview`} className="h-[65dvh] w-full border-0" /> : failed ? <p className="p-6 text-sm">Image could not be loaded.</p> :
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[65dvh] w-full object-contain p-3" />)}
    </dialog>
  </>
}

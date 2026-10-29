'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { classFetch, money } from '@/components/scheduled-classes'

type Summary = { reserved: number; pending: number; held: number; released: number; refunded: number }

export default function ScheduledWalletSummary({ role }: { role: 'student' | 'tutor' }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await classFetch('/api/scheduled-classes/wallet')
        if (!cancelled) { setSummary(data); setError('') }
      } catch {
        if (!cancelled) setError('Group class balances unavailable. Please refresh after setup.')
      }
    }
    void load()
    const timer = setInterval(() => { void load() }, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const metrics = summary ? [
    ['Reserved seats', summary.reserved, 'text-blue-700'],
    ['Pending settlement', summary.pending, 'text-amber-700'],
    ['Held for review', summary.held, 'text-rose-700'],
    [role === 'tutor' ? 'Group class earnings' : 'Class fees paid', summary.released, 'text-emerald-700'],
  ] as const : []

  return <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan-500/10 text-cyan-700"><CalendarDays size={19}/></span><div><p className="text-xs font-bold uppercase tracking-wide text-text-muted">Group teaching</p><h2 className="font-black text-text-main">Scheduled classes</h2></div></div>
      <Link href={`/${role}/scheduled-classes`} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-primary transition hover:bg-primary/5">View classes<ChevronRight size={16}/></Link>
    </div>
    <div className="p-5 md:px-6">
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : summary ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([label, amount, tone]) => <div key={label} className="rounded-xl border border-border bg-surface-container-low/60 p-4"><p className="min-h-8 text-xs font-semibold leading-4 text-text-muted">{label}</p><p className={`mt-2 text-xl font-black ${tone}`}>{money(Number(amount))}</p></div>)}</div> : <div role="status" className="h-24 animate-pulse rounded-xl bg-surface-container-low"/>}
      <p className="mt-4 text-xs leading-5 text-text-muted">{role === 'student' ? 'Reserved, pending and held fees have already been deducted from your available wallet balance.' : 'Reserved, pending and held seat fees are credited only after class settlement.'}</p>
    </div>
  </section>
}

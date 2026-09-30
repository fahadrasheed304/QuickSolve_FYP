'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw } from 'lucide-react'
import { adminPages } from '@/components/admin-shell'

const metrics = [
  { label: 'Registered users', url: '/api/admin/users', href: '/admin/users', note: 'All registered accounts' },
  { label: 'Students', url: '/api/admin/users?role=student', href: '/admin/users', note: 'Accounts with student access' },
  { label: 'Tutors', url: '/api/admin/users?role=tutor', href: '/admin/verifications', note: 'Accounts with tutor access' },
  { label: 'Held payments', url: '/api/admin/payments?status=held', href: '/admin/payments', note: 'Payments awaiting a decision' },
]

export default function AdminDashboard() {
  const [counts, setCounts] = useState<(number | null)[]>([])
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      const results = await Promise.allSettled(metrics.map(async metric => {
        const response = await fetch(metric.url, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (typeof data.count !== 'number') throw new Error()
        return data.count as number
      }))
      if (!controller.signal.aborted) { setCounts(results.map(result => result.status === 'fulfilled' ? result.value : null)); setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [revision])
  return <main className="space-y-6">
    <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-black">Platform overview</h2><p className="text-sm text-text-muted">Current account and payment totals.</p></div><button disabled={loading} onClick={() => setRevision(value => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric, index) => <Link key={metric.label} href={metric.href} className="qs-panel group rounded-xl border border-border p-6 transition hover:border-primary/40 hover:shadow-md"><div className="flex items-center justify-between"><p className="text-sm font-bold text-text-muted">{metric.label}</p><ArrowUpRight size={18} className="text-primary" /></div><p className="my-3 text-3xl font-black" aria-live="polite">{loading ? '…' : counts[index] === null ? 'Unavailable' : counts[index]?.toLocaleString()}</p><p className="text-xs text-text-muted">{metric.note}</p></Link>)}</div>
    {!loading && counts.includes(null) && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Some totals could not be loaded. Refresh to try again.</p>}
    <section className="qs-panel rounded-2xl border border-border p-5 sm:p-6"><h2 className="text-lg font-black">Manage your platform</h2><p className="mt-1 text-sm text-text-muted">Choose a workspace to review details and take action.</p><div className="mt-5 grid gap-4 md:grid-cols-2">{adminPages.slice(1).map(page => <Link href={page.href} key={page.href} className="flex items-start gap-4 rounded-xl border border-border p-5 transition hover:border-primary/40 hover:bg-primary/5"><span className="rounded-xl bg-primary/10 p-3 text-primary"><page.icon size={22} /></span><div className="flex-1"><h3 className="font-bold">{page.label}</h3><p className="mt-2 text-sm leading-relaxed text-text-muted">{page.description}</p></div><ArrowUpRight size={18} className="shrink-0 text-text-muted" /></Link>)}</div></section>
  </main>
}

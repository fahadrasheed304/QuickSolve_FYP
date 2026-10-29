"use client"

import { useEffect, useState } from 'react'
import { SessionPayments } from '@/components/session-payments'
import ScheduledWalletSummary from '@/components/scheduled-wallet-summary'
import { ArrowDownLeft, ArrowUpRight, BadgeAlert, ChevronLeft, ChevronRight, Clock3, RefreshCw, RotateCcw, Wallet as WalletIcon } from 'lucide-react'

type Cursor = { date: string; id: string }
type Wallet = {
  balance: number; earnings: number; pending: number; held: number
  filteredCount: number; filteredCredits: number; filteredDebits: number; nextCursor: Cursor | null
  transactions: { id: string; type: string; amount: number; method: string; description: string; status: string; reference: string | null; date: string }[]
}
const money = (amount: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount)

export default function TutorWalletPage() {
  const [filters, setFilters] = useState({ type: 'all', from: '', to: '' })
  const [draft, setDraft] = useState(filters)
  const [cursors, setCursors] = useState<(Cursor | null)[]>([null])
  const [wallet, setWallet] = useState<{ key: string; data: Wallet } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const cursor = cursors[cursors.length - 1]
  const key = JSON.stringify({ ...filters, cursor, revision })
  const data = wallet?.key === key ? wallet.data : null

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams(filters)
        if (cursor) params.set('cursor', JSON.stringify(cursor))
        const response = await fetch(`/api/tutor/wallet?${params}`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Wallet could not be loaded')
        if (!controller.signal.aborted) setWallet({ key, data: body })
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Wallet could not be loaded')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [key, cursor, filters])

  const field = 'mt-1.5 block min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text-main shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15'
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50'

  return <main className="mx-auto max-w-[1500px] space-y-7 p-4 pb-20 md:p-8">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-bold text-primary"><WalletIcon size={14}/>Tutor wallet</span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-text-main md:text-4xl">Wallet & earnings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Track completed session earnings, upcoming payouts and account activity in one place.</p>
      </div>
      <button className={`${button} border border-border bg-surface text-text-main shadow-sm hover:border-primary/40 hover:text-primary`} disabled={loading} onClick={() => { setCursors([null]); setRevision(value => value + 1) }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>Refresh wallet</button>
    </header>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
    {data && <section aria-label="Wallet summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-br from-[#123c9a] via-[#1767e8] to-[#07a6a5] p-5 text-white shadow-lg shadow-blue-950/10 sm:col-span-2 xl:col-span-1">
        <div className="absolute -right-8 -top-8 -z-10 size-36 rounded-full border-[22px] border-white/10"/>
        <div className="flex items-center gap-2 text-sm font-semibold text-white/80"><WalletIcon size={17}/>Available wallet balance</div>
        <p className="mt-5 text-3xl font-black tracking-tight">{money(Number(data.balance))}</p>
        <p className="mt-2 text-xs text-white/75">Ready to use in QuickSolve</p>
      </article>
      {([
        { label: '1:1 session earnings', value: data.earnings, icon: ArrowDownLeft, tone: 'text-emerald-600 bg-emerald-500/10', note: 'Completed credits' },
        { label: 'Pending payments', value: data.pending, icon: Clock3, tone: 'text-amber-600 bg-amber-500/10', note: 'Awaiting settlement' },
        { label: 'Held for review', value: data.held, icon: BadgeAlert, tone: 'text-rose-600 bg-rose-500/10', note: 'Under payment review' },
      ] as const).map(({ label, value, icon: Icon, tone, note }) => <article key={label} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-text-muted">{label}</h2><p className="mt-4 text-2xl font-black tracking-tight text-text-main">{money(Number(value))}</p></div><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon size={19}/></span></div>
        <p className="mt-3 text-xs text-text-muted">{note}</p>
      </article>)}
    </section>}
    {loading && !data && <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(item => <div key={item} className="h-32 animate-pulse rounded-2xl border border-border bg-surface"/>)}<span className="sr-only">Loading wallet…</span></div>}

    <ScheduledWalletSummary role="tutor"/>

    <section aria-labelledby="transaction-heading" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border px-5 py-5 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Account activity</p><h2 id="transaction-heading" className="mt-1 text-xl font-black text-text-main">Transaction history</h2><p className="mt-1 text-sm text-text-muted">Filter and review your wallet movements.</p></div>{data && <span className="rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-bold text-text-muted">{data.filteredCount} transactions</span>}</div>
        <form className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,0.8fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto_auto] xl:items-end" onSubmit={event => { event.preventDefault(); setCursors([null]); setFilters({ ...draft }); setRevision(value => value + 1) }}>
          <label className="text-xs font-bold text-text-muted">Transaction type<select className={field} value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}><option value="all">All transactions</option><option value="credit">Credits</option><option value="debit">Debits</option></select></label>
          <label className="text-xs font-bold text-text-muted">From date (UTC)<input type="date" className={field} value={draft.from} max={draft.to || undefined} onChange={event => setDraft({ ...draft, from: event.target.value })}/></label>
          <label className="text-xs font-bold text-text-muted">Through date (UTC)<input type="date" className={field} value={draft.to} min={draft.from || undefined} onChange={event => setDraft({ ...draft, to: event.target.value })}/></label>
          <button className={`${button} bg-primary text-white shadow-sm shadow-primary/20 hover:bg-primary-dark`}><RefreshCw size={15}/>Apply filters</button>
          <button type="button" className={`${button} border border-border bg-background text-text-main hover:bg-surface-container-low`} onClick={() => { const empty = { type: 'all', from: '', to: '' }; setDraft(empty); setFilters(empty); setCursors([null]) }}><RotateCcw size={15}/>Clear</button>
        </form>
      </div>

      {data && <>
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border bg-surface-container-low/50 px-5 py-3 text-xs text-text-muted md:px-6"><span><strong className="text-text-main">Credits:</strong> {money(Number(data.filteredCredits))}</span><span><strong className="text-text-main">Debits:</strong> {money(Number(data.filteredDebits))}</span></div>
        {data.transactions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
          <caption className="sr-only">Tutor wallet transactions, newest first. Dates shown in your local timezone.</caption>
          <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-text-muted"><tr>{['Date (local)', 'Details', 'Type', 'Amount', 'Status', 'Reference'].map(label => <th key={label} scope="col" className="px-5 py-3 font-bold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{data.transactions.map(tx => <tr key={tx.id} className="transition-colors hover:bg-surface-container-low/60">
            <td className="whitespace-nowrap px-5 py-4 text-xs text-text-muted"><time dateTime={tx.date}>{new Date(tx.date).toLocaleString()}</time></td>
            <td className="min-w-48 px-5 py-4"><p className="font-semibold text-text-main">{tx.description || tx.method || 'Wallet transaction'}</p><p className="mt-1 text-xs text-text-muted">{tx.method}</p></td>
            <td className="px-5 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tx.type === 'credit' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}>{tx.type === 'credit' ? <ArrowDownLeft size={13}/> : <ArrowUpRight size={13}/>} {tx.type}</span></td>
            <td className={`whitespace-nowrap px-5 py-4 font-black ${tx.type === 'credit' ? 'text-emerald-700' : 'text-text-main'}`}>{tx.type === 'credit' ? '+' : '−'}{money(Number(tx.amount))}</td>
            <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-700' : tx.status === 'pending' ? 'bg-amber-500/10 text-amber-700' : 'bg-surface-container-low text-text-muted'}`}>{tx.status}</span></td>
            <td title={tx.reference || tx.id} className="max-w-64 break-all px-5 py-4 font-mono text-[11px] text-text-muted">{tx.reference || tx.id}</td>
          </tr>)}</tbody>
        </table></div> : <div className="px-5 py-14 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/5 text-primary"><WalletIcon size={22}/></span><p className="mt-3 font-bold text-text-main">No matching transactions</p><p className="mt-1 text-sm text-text-muted">Change the filters or clear them to see more activity.</p></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 md:px-6"><p className="text-xs text-text-muted">Showing newest transactions first</p><nav aria-label="Transaction pages" className="flex items-center gap-2"><button aria-label="Previous page" disabled={loading || cursors.length === 1} className={`${button} min-h-10 border border-border bg-background px-3 text-text-main hover:bg-surface-container-low`} onClick={() => setCursors(value => value.slice(0, -1))}><ChevronLeft size={17}/>Previous</button><span className="px-2 text-sm font-bold text-text-muted">{cursors.length}</span><button aria-label="Next page" disabled={loading || !data.nextCursor} className={`${button} min-h-10 border border-border bg-background px-3 text-text-main hover:bg-surface-container-low`} onClick={() => { if (data.nextCursor) setCursors(value => [...value, data.nextCursor]) }}>Next<ChevronRight size={17}/></button></nav></div>
      </>}
    </section>
    <SessionPayments />
  </main>
}

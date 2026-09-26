"use client"
import { useEffect, useState } from 'react'
import { SessionPayments } from '@/components/session-payments'

type Cursor = { date: string; id: string }
type Wallet = {
  balance: number; earnings: number; pending: number; held: number
  filteredCount: number; filteredCredits: number; filteredDebits: number; nextCursor: Cursor | null
  transactions: { id: string; type: string; amount: number; method: string; description: string; status: string; reference: string | null; date: string }[]
}
const money = (amount: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(amount)

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
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Wallet could not be loaded')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [key, cursor, filters])
  return <main className="space-y-6 p-4 pb-20 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold">Wallet & earnings</h1>
      <button className="rounded border border-border px-4 py-2" onClick={() => { setCursors([null]); setRevision(value => value + 1) }}>Refresh wallet</button>
    </div>
    <p className="text-sm text-text-muted">Earnings are completed session credits. Pending and held payments are not yet credited to your wallet.</p>
    {loading && <p role="status">Loading wallet…</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {data && <section aria-label="Wallet summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {([['Wallet balance', data.balance], ['Lifetime session earnings', data.earnings], ['Pending payments', data.pending], ['Held for review', data.held]] as const).map(([label, value]) =>
        <article key={label} className="rounded-lg border border-border bg-surface p-5"><h2 className="text-sm text-text-muted">{label}</h2><p className="mt-2 text-2xl font-bold">{money(Number(value))}</p></article>)}
    </section>}
    <section className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h2 className="text-xl font-bold">Transaction history</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); setCursors([null]); setFilters({ ...draft }); setRevision(value => value + 1) }}>
        <label>Type<select className="block rounded border border-border bg-surface p-2" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}>
          <option value="all">All transactions</option><option value="credit">Credits</option><option value="debit">Debits</option>
        </select></label>
        <label>From (UTC)<input type="date" className="block rounded border border-border bg-surface p-2" value={draft.from} max={draft.to || undefined} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
        <label>Through (UTC)<input type="date" className="block rounded border border-border bg-surface p-2" value={draft.to} min={draft.from || undefined} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
        <button className="rounded bg-primary px-4 py-2 text-white">Apply filters</button>
        <button type="button" className="rounded border border-border px-4 py-2" onClick={() => { const empty = { type: 'all', from: '', to: '' }; setDraft(empty); setFilters(empty); setCursors([null]) }}>Clear</button>
      </form>
      {data && <>
        <p className="text-sm">{data.filteredCount} matching transactions · Completed credits: {money(Number(data.filteredCredits))} · Completed debits: {money(Number(data.filteredDebits))}</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <caption className="sr-only">Tutor wallet transactions, newest first. Dates shown in your local timezone.</caption>
          <thead><tr>{['Date (local)', 'Details', 'Type', 'Amount', 'Status', 'Reference'].map(label => <th key={label} className="border-b border-border p-3">{label}</th>)}</tr></thead>
          <tbody>{data.transactions.map(tx => <tr key={tx.id}>
            <td className="whitespace-nowrap p-3"><time dateTime={tx.date}>{new Date(tx.date).toLocaleString()}</time></td>
            <td className="min-w-48 p-3"><p>{tx.description || tx.method || 'Wallet transaction'}</p><p className="text-xs text-text-muted">{tx.method}</p></td>
            <td className="p-3">{tx.type}</td><td className="whitespace-nowrap p-3 font-bold">{tx.type === 'credit' ? '+' : '−'}{money(Number(tx.amount))}</td>
            <td className="p-3">{tx.status}</td><td className="max-w-64 break-all p-3 text-xs">{tx.reference || tx.id}</td>
          </tr>)}</tbody>
        </table></div>
        {!data.transactions.length && <p>No transactions match these filters.</p>}
      </>}
      <div className="flex items-center gap-3">
        <button disabled={loading || cursors.length === 1} className="rounded border border-border px-3 py-2 disabled:opacity-40" onClick={() => setCursors(value => value.slice(0, -1))}>Previous</button>
        <span>Page {cursors.length}</span>
        <button disabled={loading || !data?.nextCursor} className="rounded border border-border px-3 py-2 disabled:opacity-40" onClick={() => { if (data?.nextCursor) setCursors(value => [...value, data.nextCursor]) }}>Next</button>
      </div>
    </section>
    <SessionPayments />
  </main>
}

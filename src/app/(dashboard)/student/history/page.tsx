"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, History, Loader2, RefreshCw, Search, XCircle } from 'lucide-react'

type BidRow = {
  id: string
  tutor_name?: string | null
  tutor_rating?: number | null
  price?: number | null
  duration_min?: number | null
  created_at?: string | null
}

type ProblemRow = {
  id: string
  subject?: string | null
  class?: string | null
  details?: string | null
  offer_price?: number | null
  duration_min?: number | null
  status?: string | null
  created_at?: string | null
  bids?: BidRow[]
}

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  return new Date(value).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const getTitle = (item: ProblemRow) => {
  const details = item.details?.trim()
  if (!details) return `${item.subject || 'Problem'} request`
  return details.length > 54 ? `${details.slice(0, 54)}...` : details
}

const getBestBid = (item: ProblemRow) =>
  [...(item.bids || [])].sort((a, b) =>
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  )[0]

const getStatusMeta = (status?: string | null) => {
  switch (status) {
    case 'accepted':
      return {
        label: 'Accepted',
        className: 'bg-success-subtle text-success',
        icon: CheckCircle2,
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'bg-red-50 text-red-600',
        icon: XCircle,
      }
    case 'expired':
      return {
        label: 'Expired',
        className: 'bg-amber-50 text-amber-700',
        icon: AlertCircle,
      }
    default:
      return {
        label: 'Open',
        className: 'bg-primary-subtle text-primary',
        icon: Clock,
      }
  }
}

export default function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [history, setHistory] = useState<ProblemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/problems', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Could not load your history.')
      }

      setHistory(data.problems || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your history.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
    const intervalId = window.setInterval(() => fetchHistory(true), 15000)
    return () => window.clearInterval(intervalId)
  }, [fetchHistory])

  const filtered = useMemo(() => {
    const query = searchTerm.toLowerCase().trim()
    if (!query) return history

    return history.filter((item) => {
      const bid = getBestBid(item)
      return `${getTitle(item)} ${item.subject || ''} ${item.status || ''} ${bid?.tutor_name || ''}`
        .toLowerCase()
        .includes(query)
    })
  }, [history, searchTerm])

  return (
    <div className="p-4 md:p-8 pb-20 qs-page-enter">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="qs-kicker rounded-full px-3 py-1.5">
            <History className="h-4 w-4" />
            Problem archive
          </div>
          <h1 className="mt-4 text-4xl font-black text-text-main">History</h1>
          <p className="mt-1 text-text-muted">Review your posted problems, bids, and session outcomes.</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="qs-input h-11 w-full rounded-lg pl-10 pr-4 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => fetchHistory()}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-black text-text-muted transition hover:bg-surface-hover hover:text-primary disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="qs-card overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-surface-hover text-xs font-black uppercase text-text-muted">
                <th className="p-4 pl-6">Topic / Subject</th>
                <th className="p-4">Tutor</th>
                <th className="p-4">Date</th>
                <th className="p-4">Duration</th>
                <th className="p-4">Status</th>
                <th className="p-4 pr-6 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!loading && filtered.map((item) => {
                const bid = getBestBid(item)
                const statusMeta = getStatusMeta(item.status)
                const StatusIcon = statusMeta.icon
                const cost = bid?.price || item.offer_price || 0
                const duration = bid?.duration_min || item.duration_min || 0

                return (
                  <tr key={item.id} className="transition-colors hover:bg-surface-hover/70">
                    <td className="p-4 pl-6">
                      <p className="font-black text-text-main">{getTitle(item)}</p>
                      <p className="mt-0.5 text-xs font-bold text-primary">{item.subject || 'General'}{item.class ? ` / ${item.class}` : ''}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-text-main">{bid?.tutor_name || 'No tutor selected'}</p>
                      {bid?.tutor_rating ? (
                        <p className="mt-0.5 text-xs font-black text-text-muted">{bid.tutor_rating.toFixed(1)} rating</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap p-4 text-sm font-semibold text-text-muted">{formatDate(item.created_at)}</td>
                    <td className="whitespace-nowrap p-4">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-text-muted">
                        <Clock className="h-4 w-4" />
                        {duration ? `${duration}m` : 'N/A'}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${statusMeta.className}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {statusMeta.label}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right font-black text-text-main">
                      {cost ? `Rs. ${cost.toLocaleString()}` : 'N/A'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 p-10 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-semibold">Loading history...</span>
          </div>
        )}

        {!loading && error && (
          <div className="p-10 text-center font-semibold text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="p-10 text-center text-text-muted font-semibold">
            {history.length === 0 ? 'No problem history yet.' : 'No history records match your search.'}
          </div>
        )}
      </div>
    </div>
  )
}

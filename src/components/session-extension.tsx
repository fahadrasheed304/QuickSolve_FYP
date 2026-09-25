"use client"

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session-store'
import { useWalletStore } from '@/stores/wallet-store'
import { notifySuccess } from '@/lib/toast'

export function SessionExtension({ problemId, rate }: {
  problemId: string
  rate: { bidPrice: number; durationMin: number; extensionMinutes: number }
}) {
  const seconds = useSessionStore(state => state.timeLeftSeconds)
  const endsAt = useSessionStore(state => state.endsAt)
  const [minutes, setMinutes] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ requestId: string; minutes: number; expectedMinutes: number } | null>(null)
  const submitting = useRef(false)
  if (!endsAt || seconds > 300 || seconds <= 0) return null

  const amount = Math.round(rate.bidPrice * minutes / rate.durationMin * 100) / 100
  const extend = async () => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const attempt = pending ?? { requestId: crypto.randomUUID(), minutes, expectedMinutes: rate.extensionMinutes }
      setPending(attempt)
      const response = await fetch('/api/sessions/extend', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId, ...attempt }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status < 500) setPending(null)
        throw new Error(data.error || 'Extension failed. Please retry.')
      }
      useSessionStore.getState().syncClock(data.endsAt, data.serverNow)
      setPending(null)
      void useWalletStore.getState().fetchWallet()
      notifySuccess(`Session extended. Rs. ${Number(data.amount).toFixed(2)} deducted from your wallet.`)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connection failed. Retry to confirm your extension.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section aria-label="Session extension reminder" className="shrink-0 border-y border-amber-300/30 bg-amber-950 px-4 py-3 text-amber-50">
      <p role="status" className="text-sm font-bold">Less than 5 minutes left. Need more time?</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor="extension-minutes" className="text-sm">Add</label>
        <select id="extension-minutes" value={minutes} disabled={busy || !!pending} onChange={event => setMinutes(Number(event.target.value))} className="rounded border border-amber-300/40 bg-amber-950 p-2 text-sm">
          {[5,10,15,30].map(value => <option key={value} value={value}>{value} minutes</option>)}
        </select>
        <Button disabled={busy} onClick={extend} size="sm">{busy ? 'Extending...' : `Pay Rs. ${amount.toFixed(2)} & Extend`}</Button>
      </div>
      <p className="mt-1 text-xs">Your tutor&apos;s accepted rate: Rs. {rate.bidPrice} / {rate.durationMin} min. Extra payment is deducted now.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-200">{error}</p>}
    </section>
  )
}

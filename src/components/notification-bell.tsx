"use client"

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useNotificationsStore } from '@/stores/notifications-store'
import { useAuthStore } from '@/stores/auth-store'
import { notifyError } from '@/lib/toast'

export function NotificationBell() {
  const { account, items, connected, error } = useNotificationsStore()
  const user = useAuthStore(state => state.user)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const currentAccount = user ? `${user.role}:${user.email.toLowerCase().trim()}` : null
  const visible = account === currentAccount ? items : []
  const unread = visible.filter(item => !item.read_at)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  const markRead = async (ids: string[]) => {
    if (!ids.length) return
    setBusy(true)
    try {
      const response = await fetch('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      if (!response.ok) throw new Error()
      if (useNotificationsStore.getState().account === account) {
        useNotificationsStore.setState(state => ({ items: state.items.map(item => ids.includes(item.id) ? { ...item, read_at: new Date().toISOString() } : item) }))
      }
    } catch { notifyError('Could not mark notifications as read. Please retry.') }
    finally { setBusy(false) }
  }

  return <div ref={container} className="relative">
    <button type="button" onClick={() => setOpen(value => !value)} aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`} aria-expanded={open}
      className="relative rounded-lg border border-border bg-surface p-2.5 text-text-muted shadow-sm hover:bg-surface-hover">
      <Bell className="h-5 w-5" />
      {unread.length > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-primary px-1.5 text-xs font-bold text-white">{unread.length}</span>}
    </button>
    {open && <section aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-border p-4">
        <h2 className="font-bold text-text-main">Notifications</h2>
        <button type="button" disabled={busy || !unread.length} onClick={() => void markRead(unread.map(item => item.id))} className="text-xs font-bold text-primary disabled:opacity-40">Mark read</button>
      </div>
      <p role="status" className="px-4 py-2 text-xs text-text-muted">{error || (connected ? 'Latest 50 notifications' : 'Reconnecting to live updates…')}</p>
      <div className="max-h-80 overflow-y-auto">
        {!visible.length && !error && <p className="p-6 text-center text-sm text-text-muted">No notifications yet.</p>}
        {visible.map(item => <Link key={item.id} href={`/${user?.role === 'tutor' ? 'tutor' : 'student'}/dashboard`}
          onClick={() => { if (!item.read_at) void markRead([item.id]); setOpen(false) }}
          className={`block border-t border-border px-4 py-3 hover:bg-surface-hover ${!item.read_at ? 'bg-primary-subtle' : ''}`}>
          <p className="text-sm text-text-main">{!item.read_at && <span className="mr-1 text-primary" aria-label="Unread">●</span>}{item.message}</p>
          <time dateTime={item.created_at} className="mt-1 block text-xs text-text-muted">{new Date(item.created_at).toLocaleString()}</time>
        </Link>)}
      </div>
    </section>}
  </div>
}

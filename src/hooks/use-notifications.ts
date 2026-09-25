"use client"

import { useEffect } from 'react'
import { toast } from 'react-toastify'
import { useNotificationsStore, type AppNotification } from '@/stores/notifications-store'

export const NOTIFICATION_REFRESH = 'quicksolve:notification-refresh'

// One authenticated connection per dashboard layout, shared by all its pages.
export function useNotifications(email?: string, role?: string) {
  useEffect(() => {
    if (!email || !role || !['student', 'tutor'].includes(role)) return
    const account = `${role}:${email.toLowerCase().trim()}`
    useNotificationsStore.setState({ account, items: [], connected: false, error: null })
    let stopped = false
    let initialized = false
    let loading = false
    let queued = false
    const seen = new Set<string>()
    const controller = new AbortController()
    const load = async () => {
      if (stopped) return
      if (loading) { queued = true; return }
      loading = true
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Notifications could not be loaded. Retrying automatically.')
        const { notifications } = await response.json() as { notifications: AppNotification[] }
        if (stopped) return
        for (const item of [...notifications].reverse()) {
          if (initialized && !seen.has(item.id) && !item.read_at && item.kind !== 'request_closed') {
            toast.info(item.message, { toastId: `notification:${item.id}` })
          }
          seen.add(item.id)
        }
        initialized = true
        useNotificationsStore.setState({ items: notifications, error: null })
      } catch {
        if (!stopped) useNotificationsStore.setState({ error: 'Notifications could not be loaded. Retrying automatically.' })
      } finally {
        loading = false
        if (queued && !stopped) { queued = false; void load() }
      }
    }
    const refresh = () => {
      if (stopped) return
      void load()
      window.dispatchEvent(new Event(NOTIFICATION_REFRESH))
    }
    const source = new EventSource('/api/notifications/stream')
    source.addEventListener('ready', () => {
      if (stopped) return
      useNotificationsStore.setState({ connected: true })
      refresh() // Subscribe before snapshot: changes during connection setup are recovered.
    })
    source.addEventListener('changed', refresh)
    source.onerror = () => {
      if (!stopped) useNotificationsStore.setState({ connected: false })
      // EventSource reconnects; the ready snapshot recovers missed notifications.
    }
    void load()
    const fallback = window.setInterval(() => {
      if (!useNotificationsStore.getState().connected) refresh()
    }, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      stopped = true
      controller.abort()
      source.close()
      window.clearInterval(fallback)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      useNotificationsStore.setState({ account: null, items: [], connected: false, error: null })
    }
  }, [email, role])
}

// Push handles new activity; a slow reconciliation also expires old requests and
// recovers transient API errors. This replaces the former five-second polling.
export function subscribeToRequestUpdates(refresh: () => void) {
  let pending: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    if (pending) return
    pending = setTimeout(() => { pending = undefined; refresh() }, 100)
  }
  window.addEventListener(NOTIFICATION_REFRESH, schedule)
  window.addEventListener('focus', schedule)
  const timer = window.setInterval(schedule, 60000)
  return () => {
    window.removeEventListener(NOTIFICATION_REFRESH, schedule)
    window.removeEventListener('focus', schedule)
    window.clearInterval(timer)
    clearTimeout(pending)
  }
}

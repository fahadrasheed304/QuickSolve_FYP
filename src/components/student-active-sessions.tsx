"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/stores/session-store'

interface ActiveSession {
  roomName: string
  tutorName: string
  subject: string
  class: string
  price: number
  durationMin: number
  needsReview: boolean
}

export function StudentActiveSessions() {
  const router = useRouter()
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const refresh = async () => {
      try {
        const response = await fetch('/api/student/active-sessions', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('Unable to load sessions')
        const data = await response.json()
        if (controller.signal.aborted) return
        setSessions([...data.sessions, ...(data.pendingReviews || [])])
        setError(false)
      } catch {
        if (!controller.signal.aborted) setError(true)
      }
    }
    void refresh()
    const interval = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])

  return (
    <div className="space-y-3 mb-8">
      {error && <p role="alert" className="text-sm text-text-muted">Active sessions could not be loaded. Retrying automatically...</p>}
      {sessions.map(session => (
        <div key={session.roomName} className="qs-panel rounded-lg p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-text-main">{session.needsReview ? 'Your session is ready for review' : 'Your session is still active'}</h2>
            <p className="text-sm text-text-muted">{session.tutorName} · {session.subject} / {session.class}</p>
            <p className="mt-1 text-sm text-text-muted">{session.needsReview ? 'Share your rating and complete the session payment.' : 'Left the call? Rejoin here to continue.'}</p>
          </div>
          <Button onClick={() => {
            useSessionStore.getState().startSession(session.tutorName, session.durationMin, session.price, session.roomName)
            if (session.needsReview) useSessionStore.getState().endSession()
            router.push('/student/session/active')
          }}>{session.needsReview ? 'Rate Session' : 'Rejoin Video Session'}</Button>
        </div>
      ))}
    </div>
  )
}

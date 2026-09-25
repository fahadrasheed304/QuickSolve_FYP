"use client"
import { useCallback, useRef, useState } from 'react'
import { notifyError } from '@/lib/toast'

export function useEndSession(roomName: string | null, onEnded: () => void) {
  const pending = useRef(false)
  const [isEnding, setIsEnding] = useState(false)
  const endCall = useCallback(async () => {
    if (pending.current || !roomName) return
    pending.current = true
    setIsEnding(true)
    try {
      const response = await fetch('/api/sessions/state?problemId=' + encodeURIComponent(roomName.replace(/^session-/, '')), {
        method: 'POST', signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw new Error('Unable to end session')
      onEnded()
    } catch { notifyError('Could not end the session. Please retry.') }
    finally { pending.current = false; setIsEnding(false) }
  }, [roomName, onEnded])
  return { endCall, isEnding }
}

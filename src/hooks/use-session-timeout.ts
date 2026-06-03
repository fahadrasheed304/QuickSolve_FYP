"use client"

import { useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes in milliseconds
const CHECK_INTERVAL = 60 * 1000 // Check every minute

export function useSessionTimeout() {
  const router = useRouter()
  const lastActivityRef = useRef<number>(0)
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    localStorage.setItem('last_activity', Date.now().toString())
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      localStorage.removeItem('last_activity')
      router.push('/signin-page')
    } catch (err) {
      console.error('Auto logout failed:', err)
    }
  }, [router])

  useEffect(() => {
    // Check if there's a stored last activity (browser was closed and reopened)
    const storedActivity = localStorage.getItem('last_activity')
    if (storedActivity) {
      const lastActivity = parseInt(storedActivity)
      const now = Date.now()
      
      // If more than 15 minutes passed since last activity, logout immediately
      if (now - lastActivity > INACTIVITY_TIMEOUT) {
        logout()
        return
      }
      
      lastActivityRef.current = lastActivity
    } else {
      lastActivityRef.current = Date.now()
    }

    // Activity event listeners
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    
    const handleActivity = () => {
      updateActivity()
    }

    // Add event listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    // Periodic check for inactivity
    checkIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const lastActivity = lastActivityRef.current
      
      if (now - lastActivity > INACTIVITY_TIMEOUT) {
        console.log('Session expired due to inactivity')
        logout()
      }
    }, CHECK_INTERVAL)

    // Handle browser/tab close
    const handleBeforeUnload = () => {
      localStorage.setItem('last_activity', Date.now().toString())
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
      
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
      
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [logout, updateActivity])

  return { updateActivity }
}

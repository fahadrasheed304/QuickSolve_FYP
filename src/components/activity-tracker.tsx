import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Clock } from 'lucide-react'

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes
const WARNING_BEFORE = 60 * 1000 // Show warning 1 minute before
const CHECK_INTERVAL = 30 * 1000 // Check every 30 seconds

export function ActivityTracker() {
  const { user, updateActivity, logout, lastActivity } = useAuthStore()
  const [showWarning, setShowWarning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(60)

  // Update activity on user interaction
  const handleActivity = useCallback(() => {
    if (user) {
      updateActivity()
      setShowWarning(false)
      setTimeLeft(60)
    }
  }, [user, updateActivity])

  // Add event listeners for user activity
  useEffect(() => {
    if (!user) return

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove']
    
    events.forEach(event => {
      window.addEventListener(event, handleActivity)
    })

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
    }
  }, [user, handleActivity])

  // Check inactivity periodically
  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      const now = Date.now()
      const inactive = now - lastActivity

      // If inactive for more than timeout, logout
      if (inactive >= INACTIVITY_TIMEOUT) {
        console.log('Auto-logout due to inactivity')
        logout()
        return
      }

      // If within warning period, show warning
      const timeUntilLogout = INACTIVITY_TIMEOUT - inactive
      if (timeUntilLogout <= WARNING_BEFORE) {
        setShowWarning(true)
        setTimeLeft(Math.ceil(timeUntilLogout / 1000))
      } else {
        setShowWarning(false)
      }
    }, CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [user, lastActivity, logout])

  // Countdown timer for warning dialog
  useEffect(() => {
    if (!showWarning) return
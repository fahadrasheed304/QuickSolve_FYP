"use client"

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
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          logout()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [showWarning, logout])

  const handleStayLoggedIn = () => {
    handleActivity()
    setShowWarning(false)
    setTimeLeft(60)
  }

  // Only render if user is logged in
  if (!user) return null

  return (
    <Dialog open={showWarning} onOpenChange={setShowWarning}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-6 h-6" />
            Session Expiring Soon
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-amber-200 flex items-center justify-center">
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-amber-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                {timeLeft}
              </div>
            </div>
          </div>
          
          <p className="text-center text-gray-600 mb-2">
            You have been inactive for a while.
          </p>
          <p className="text-center text-sm text-gray-500">
            Your session will expire in <span className="font-bold text-amber-600">{timeLeft} seconds</span> due to inactivity.
          </p>
        </div>

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={logout}
            className="flex-1"
          >
            Logout Now
          </Button>
          <Button 
            onClick={handleStayLoggedIn}
            className="flex-1 bg-amber-600 hover:bg-amber-700"
          >
            Stay Logged In
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

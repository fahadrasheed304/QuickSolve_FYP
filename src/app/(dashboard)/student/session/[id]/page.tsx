import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Video as VideoIcon, MonitorUp, PhoneOff, Clock, Send, PenTool, Eraser, Square, Circle, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/session-store'
import { useWalletStore } from '@/stores/wallet-store'
import { ReviewModal } from '@/components/rating/review-modal'
import { notifyError, notifySuccess } from '@/lib/toast'

export default function SessionPage() {
  const router = useRouter()
  const { isActive, timeLeftSeconds, tutorName, price, endSession, extendSession, tickTime } = useSessionStore()
  const { balance, moveToEscrow } = useWalletStore()
  const [isWhiteboard, setIsWhiteboard] = useState(false)
  const [chatMessage, setChatMessage] = useState("")
  const [showExtensionModal, setShowExtensionModal] = useState(false)
  const [extensionAmount, setExtensionAmount] = useState(250)
  const [extensionTime, setExtensionTime] = useState(30)
  const [showReview, setShowReview] = useState(false)

  const handleEndSession = useCallback(() => {
    endSession()
    setShowReview(true)
  }, [endSession])

  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      const currentTimeLeft = useSessionStore.getState().timeLeftSeconds
      if (currentTimeLeft <= 1) {
        handleEndSession()
        return
      }
      tickTime()
    }, 1000)

    return () => clearInterval(interval)
  }, [handleEndSession, isActive, tickTime])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const handleRequestExtension = () => {
    if (balance >= extensionAmount) {
      moveToEscrow(extensionAmount)
      extendSession(extensionTime)
      setShowExtensionModal(false)
      notifySuccess(`Session extended by ${extensionTime} minutes.`)
    } else {
      notifyError("Your wallet balance is too low to extend this session. Please top up and try again.")
    }
  }

  useEffect(() => {
    if (!isActive && !showReview) {
      router.push('/student/dashboard')
    }
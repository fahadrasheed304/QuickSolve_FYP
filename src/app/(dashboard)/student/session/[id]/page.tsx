"use client"

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/session-store'
import { ReviewModal } from '@/components/rating/review-modal'
import dynamic from 'next/dynamic'
import { useClientReady } from '@/hooks/use-client-ready'

// Dynamically import VideoRoom to avoid SSR issues with LiveKit
const VideoRoom = dynamic(() => import('@/components/livekit/video-room'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#08111f]">
      <div className="text-center space-y-3">
        <div className="h-10 w-10 mx-auto border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-white/60 text-sm font-semibold">Loading video call...</p>
      </div>
    </div>
  ),
})

export default function SessionPage() {
  const router = useRouter()
  const clientReady = useClientReady()
  const { isActive, timeLeftSeconds, tutorName, price, sessionId, roomName, endSession, tickTime } = useSessionStore()

  const [showReview, setShowReview] = useState(false)
  const reviewOpen = showReview || (!isActive && !!roomName)

  const handleEndSession = useCallback(() => {
    endSession()
    setShowReview(true)
  }, [endSession])

  const handlePopOutWindow = () => {
    window.open(window.location.href, 'QuickSolve_LiveSession', 'width=1280,height=750,resizable=yes,scrollbars=yes,status=no,location=no,toolbar=no')
  }

  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      const currentTimeLeft = useSessionStore.getState().timeLeftSeconds
      if (useSessionStore.getState().endsAt && currentTimeLeft <= 1) {
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

  useEffect(() => {
    if (clientReady && !isActive && !reviewOpen) {
      router.push('/student/dashboard')
    }
      }, [clientReady, isActive, reviewOpen, router])

  if (!isActive && !showReview) return null

  const isEndingSoon = isActive && timeLeftSeconds <= 300
  const liveKitRoomName = roomName || sessionId || 'default-room'

  return (
    <div className="h-screen flex flex-col bg-[#101d32] text-white overflow-hidden">
      <header className="h-16 bg-[#111c2d]/92 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 bg-premium-gradient ring-2 ring-white/10">
            <AvatarFallback className="bg-transparent text-white font-black">{tutorName.charAt(0) || 'T'}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-sm font-black">{tutorName || 'Active Session'}</h2>
            <div className="flex items-center gap-1 text-xs text-amber-300 font-bold">
              <Star className="h-3 w-3 fill-current" />
              4.9 Expert
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className={cn("text-2xl font-mono font-black", isEndingSoon ? "text-red-300 animate-pulse" : "text-white")}>
            {formatTime(timeLeftSeconds)}
          </div>
          <div className="text-[10px] text-white/45 uppercase font-black">Remaining</div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handlePopOutWindow} variant="outline" size="sm" className="font-bold border-white/20 text-white bg-white/10 hover:bg-white/20">
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Pop Out Window
          </Button>
          <Button onClick={handleEndSession} variant="destructive" size="sm" className="font-bold px-5">
            End
          </Button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* ── LiveKit Video Room ── */}
        <div className="flex-1 relative flex flex-col">
          <VideoRoom roomName={liveKitRoomName} />
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-surface text-text-main md:flex">
          <div className="border-b border-border bg-surface-hover p-4">
            <h3 className="mb-1 text-lg font-black">Session Info</h3>
            <p className="mb-1 text-sm font-semibold text-text-muted">Physics / Class 10</p>
            <p className="mb-4 text-sm font-black text-success">Rs. {price}</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
              <div
                className={cn("h-full transition-all", isEndingSoon ? "bg-red-500" : "bg-premium-gradient")}
                style={{ width: `${(timeLeftSeconds / (30 * 60)) * 100}%` }}
              />
            </div>
          </div>

          <p className="p-4 text-sm text-text-muted">Use the Chat button in the call controls to message the other participant.</p>
        </aside>
      </main>

      <ReviewModal isOpen={reviewOpen} onClose={() => setShowReview(false)} tutorName={tutorName} problemId={(roomName || "").replace(/^session-/, "")} />
    </div>
  )
}

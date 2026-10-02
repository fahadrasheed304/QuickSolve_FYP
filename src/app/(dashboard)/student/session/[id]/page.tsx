"use client"

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/session-store'
import { ReviewModal } from '@/components/rating/review-modal'
import dynamic from 'next/dynamic'
import { useEndSession } from '@/hooks/use-end-session'
import { useClientReady } from '@/hooks/use-client-ready'
import { SessionExtension } from '@/components/session-extension'

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
  const { isActive, timeLeftSeconds, tutorName, sessionId, roomName, endSession, tickTime } = useSessionStore()
  const isEndingSoon = isActive && timeLeftSeconds <= 300

  const [showReview, setShowReview] = useState(false)
  const [rate, setRate] = useState<{ bidPrice: number; durationMin: number; extensionMinutes: number } | null>(null)
  const reviewOpen = showReview || (!isActive && !!roomName)

  const closeLocalSession = useCallback(() => {
    endSession()
    setShowReview(true)
  }, [endSession])

  const { endCall: handleEndSession, isEnding } = useEndSession(roomName, closeLocalSession)

  useEffect(() => {
    if (!isActive || !roomName) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/sessions/state?problemId=' + encodeURIComponent(roomName.replace(/^session-/, '')), { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (data.ended) closeLocalSession()
        else {
          if (data.endsAt) useSessionStore.getState().syncClock(data.endsAt, data.serverNow)
          setRate(data)
        }
      } catch { /* Retry on the next poll. */ }
    }
    void check()
    const timer = setInterval(check, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [isActive, roomName, closeLocalSession])

  const handlePopOutWindow = () => {
    window.open(window.location.href, 'QuickSolve_LiveSession', 'width=1280,height=750,resizable=yes,scrollbars=yes,status=no,location=no,toolbar=no')
  }

  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      tickTime()
    }, 1000)

    return () => clearInterval(interval)
  }, [isActive, tickTime])

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

  if (!isActive && !reviewOpen) return null

  const liveKitRoomName = roomName || sessionId || 'default-room'

  return (
    <div className="h-screen flex flex-col bg-[#101d32] text-white overflow-hidden">
      <header className="h-14 md:h-16 bg-[#111c2d]/92 backdrop-blur-xl flex items-center justify-between gap-2 px-3 md:px-6 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 md:h-10 md:w-10 bg-premium-gradient ring-2 ring-white/10">
            <AvatarFallback className="bg-transparent text-white font-black">{tutorName.charAt(0) || 'T'}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="max-w-[34vw] truncate text-xs font-black md:max-w-none md:text-sm">{tutorName || 'Active Session'}</h2>
            <div className="flex items-center gap-1 text-[10px] text-amber-300 font-bold md:text-xs">
              Live tutoring session
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className={cn("text-lg font-mono font-black md:text-2xl", isEndingSoon ? "text-red-300 animate-pulse" : "text-white")}>
            {formatTime(timeLeftSeconds)}
          </div>
          <div className="hidden text-[10px] text-white/45 uppercase font-black sm:block">Remaining</div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <Button aria-label="Pop out session window" title="Pop out session window" onClick={handlePopOutWindow} variant="outline" size="sm" className="h-9 px-2 font-bold border-white/20 text-white bg-white/10 hover:bg-white/20 sm:px-3">
            <ExternalLink className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Pop out</span>
          </Button>
          <Button onClick={handleEndSession} disabled={isEnding} variant="destructive" size="sm" className="h-9 px-3 font-bold sm:px-4">
            <span className="sm:hidden">End</span><span className="hidden sm:inline">{isEnding ? 'Ending...' : 'End call'}</span>
          </Button>
        </div>
      </header>

      {isActive && rate && roomName && <SessionExtension key={roomName} problemId={roomName.replace(/^session-/, '')} rate={rate} />}

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── LiveKit Video Room ── */}
        <div className="relative flex min-h-0 w-full flex-1 flex-col">
          {isActive && <VideoRoom roomName={liveKitRoomName} onDisconnected={closeLocalSession} onEndSession={handleEndSession} isEnding={isEnding} />}
        </div>


      </main>

      <ReviewModal isOpen={reviewOpen} onClose={() => setShowReview(false)} tutorName={tutorName} problemId={(roomName || "").replace(/^session-/, "")} />
    </div>
  )
}

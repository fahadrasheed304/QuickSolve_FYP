"use client"

import { StudentReview } from '@/components/student-review'
import { useCallback, useEffect, use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/session-store'
import dynamic from 'next/dynamic'
import { useEndSession } from '@/hooks/use-end-session'
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

export default function TutorSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = use(params)
  const router = useRouter()
  const [ended, setEnded] = useState(false)
  const clientReady = useClientReady()
  const { isActive, timeLeftSeconds, endSession, tickTime } = useSessionStore()


  const closeLocalSession = useCallback(() => {
    endSession()
    setEnded(true)
  }, [endSession])

  const { endCall: handleEndSession, isEnding } = useEndSession(roomId, closeLocalSession)

  useEffect(() => {
    if (!isActive || !roomId) return
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch('/api/sessions/state?problemId=' + encodeURIComponent(roomId.replace(/^session-/, '')), { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (data.ended) closeLocalSession()
        else if (data.endsAt) useSessionStore.getState().syncClock(data.endsAt, data.serverNow)
      } catch { /* Retry on the next poll. */ }
    }
    void check()
    const timer = setInterval(check, 3000)

  return () => { cancelled = true; clearInterval(timer) }
  }, [isActive, roomId, closeLocalSession])

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

  const isEndingSoon = isActive && timeLeftSeconds <= 300
  if (!clientReady) return null
  if (ended) return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Session ended</h1><StudentReview problemId={roomId.replace(/^session-/, "")} /><Button className="mt-4" onClick={() => router.push("/tutor/dashboard")}>Back to dashboard</Button></main>

  return (
    <div className="h-screen flex flex-col bg-[#101d32] text-white overflow-hidden">
      <header className="h-16 bg-[#111c2d]/92 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 shrink-0 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 bg-premium-gradient ring-2 ring-white/10">
            <AvatarFallback className="bg-transparent text-white font-black">S</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-sm font-black">Live Tutoring Session</h2>
            <div className="flex items-center gap-1 text-xs text-amber-300 font-bold">
              <Star className="h-3 w-3 fill-current" />
              Session in progress
            </div>
          </div>
        </div>

        {isActive && (
          <div className="flex flex-col items-center">
            <div className={cn("text-2xl font-mono font-black", isEndingSoon ? "text-red-300 animate-pulse" : "text-white")}>
              {formatTime(timeLeftSeconds)}
            </div>
            <div className="text-[10px] text-white/45 uppercase font-black">Remaining</div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={handlePopOutWindow} variant="outline" size="sm" className="font-bold border-white/20 text-white bg-white/10 hover:bg-white/20">
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Pop Out Window
          </Button>
          <Button onClick={handleEndSession} disabled={isEnding} variant="destructive" size="sm" className="font-bold px-5">
            {isEnding ? 'Ending...' : 'End Call'}
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── LiveKit Video Room ── */}
        <div className="relative flex min-h-0 w-full flex-1 flex-col">
          <VideoRoom roomName={roomId} onEndSession={handleEndSession} isEnding={isEnding} />
        </div>


      </main>
    </div>
  )
}

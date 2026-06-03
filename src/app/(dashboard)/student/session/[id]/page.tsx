"use client"

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
      }, [isActive, showReview, router])

  if (!isActive && !showReview) return null

  const isEndingSoon = isActive && timeLeftSeconds <= 300

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

        <Button onClick={handleEndSession} variant="destructive" size="sm" className="font-bold px-5">
          End
        </Button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative flex flex-col items-center justify-center bg-[#08111f] surface-grid">
          {!isWhiteboard ? (
            <div className="w-full h-full relative p-4 flex flex-col items-center justify-center">
              <div className="relative flex aspect-video w-full max-w-5xl items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#16253b] shadow-2xl">
                <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(22,103,255,0.14),transparent_45%,rgba(0,167,165,0.14))]" />
                <Avatar className="h-32 w-32 border-4 border-white/10 bg-white/10">
                  <AvatarFallback className="bg-transparent text-4xl text-white/60">{tutorName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="absolute bottom-4 left-4 rounded-lg bg-black/45 px-3 py-1 text-sm font-bold backdrop-blur-sm">
                  {tutorName}
                </div>
              </div>
              <div className="absolute bottom-24 right-6 w-44 aspect-video rounded-lg border border-white/15 bg-[#16253b] shadow-xl flex items-center justify-center text-sm font-bold text-white/55">
                You
              </div>
            </div>
          ) : (
            <div className="w-full h-full bg-surface text-text-main relative flex flex-col">
              <div className="h-14 bg-surface border-b border-border flex items-center justify-center gap-2 px-4">
                <button className="p-2 bg-primary-subtle text-primary rounded-lg hover:bg-primary/15"><PenTool className="w-5 h-5" /></button>
                <button className="p-2 text-text-muted rounded-lg hover:bg-surface-hover"><Eraser className="w-5 h-5" /></button>
                <div className="w-px h-6 bg-border mx-2" />
                <button className="p-2 text-text-muted rounded-lg hover:bg-surface-hover"><Square className="w-5 h-5" /></button>
                <button className="p-2 text-text-muted rounded-lg hover:bg-surface-hover"><Circle className="w-5 h-5" /></button>
                <div className="w-px h-6 bg-border mx-2" />
                <div className="flex gap-1 ml-2">
                  {['#172033', '#e5484d', '#1667ff', '#12a874'].map(color => (
                    <button key={color} className="w-6 h-6 rounded-full border border-border shadow-sm" style={{ backgroundColor: color }} />
                  ))}
                </div>
                              </div>
              <div className="flex-1 flex items-center justify-center text-text-muted font-bold">
                Shared Canvas
              </div>
            </div>
          )}

          <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-white/10 bg-[#111c2d]/82 p-3 shadow-2xl backdrop-blur-xl">
            <button className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/15">
              <Mic className="w-5 h-5" />
            </button>
            <button className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/15">
              <VideoIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsWhiteboard(!isWhiteboard)}
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-lg transition-colors shadow-lg",
                isWhiteboard ? "bg-primary text-white" : "bg-white/10 hover:bg-white/15 text-white"
              )}
            >
              <MonitorUp className="w-5 h-5" />
            </button>
            <div className="mx-1 h-8 w-px bg-white/15" />
            <button onClick={handleEndSession} className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700">
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
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

          <div className="flex-1 space-y-4 overflow-y-auto bg-surface p-4">
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-surface-hover px-4 py-2.5 text-sm font-semibold shadow-sm">
                Salam, apko detail samaj aagai problem ki?
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-4 py-2.5 text-sm font-semibold leading-relaxed text-white shadow-sm">
                Walaikumsalam. Yes I have seen the question. I will solve it on the whiteboard now.
              </div>
            </div>
          </div>

          {isEndingSoon && (
            <div className="border-t border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-black text-amber-800">Session ending soon</span>
              </div>
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-amber-200 bg-white px-2 text-sm font-semibold text-text-main"
                                   value={extensionTime}
                  onChange={(e) => {
                    const time = parseInt(e.target.value)
                    setExtensionTime(time)
                    setExtensionAmount(time === 15 ? 125 : time === 30 ? 250 : 375)
                  }}
                >
                  <option value={15}>+15 min (Rs. 125)</option>
                  <option value={30}>+30 min (Rs. 250)</option>
                  <option value={45}>+45 min (Rs. 375)</option>
                </select>
                <Button onClick={() => setShowExtensionModal(true)} size="sm" className="bg-amber-600 hover:bg-amber-700">Extend</Button>
              </div>
            </div>
          )}

          <div className="border-t border-border bg-surface p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Type your message..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setChatMessage('') }}
              />
              <Button size="icon" onClick={() => setChatMessage('')} className="shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </aside>
      </main>

      <Dialog open={showExtensionModal} onOpenChange={setShowExtensionModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">Extend Session?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <p className="text-text-muted">Additional {extensionTime} minutes</p>
            <p className="text-3xl font-black text-text-main">Rs. {extensionAmount}</p>
            <div className={cn(
              "rounded-lg border p-3 text-sm font-bold",
              balance >= extensionAmount ? "bg-success-subtle text-success border-green-200" : "bg-red-50 text-red-700 border-red-200"
            )}>
              Current Balance: Rs. {balance}
            </div>
            {balance >= extensionAmount ? (
              <Button onClick={handleRequestExtension} className="h-12 w-full text-base">Confirm & Pay</Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-red-600">Insufficient balance. Please recharge wallet.</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowExtensionModal(false)}>Cancel</Button>
                  <Button className="flex-1" onClick={() => router.push('/student/wallet')}>Recharge</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ReviewModal isOpen={showReview} onClose={() => setShowReview(false)} tutorName={tutorName} />
    </div>
  )
}

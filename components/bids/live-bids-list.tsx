"use client"
"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useBidsStore } from '@/stores/bids-store'
import { useWalletStore } from '@/stores/wallet-store'
import { useSessionStore } from '@/stores/session-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle, Clock3, Loader2, Star, XCircle } from 'lucide-react'
import { notifyError, notifySuccess } from '@/lib/toast'

type LiveBid = ReturnType<typeof useBidsStore.getState>['bids'][number]

export function LiveBidsList() {
  const router = useRouter()
  const bids = useBidsStore((state) => state.bids)
  const acceptBid = useBidsStore((state) => state.acceptBid)
  const cancelProblem = useBidsStore((state) => state.cancelProblem)
  const balance = useWalletStore((state) => state.balance)
  const moveToEscrow = useWalletStore((state) => state.moveToEscrow)
  const startSession = useSessionStore((state) => state.startSession)
  const [showWalletWarning, setShowWalletWarning] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null)

  if (bids.length === 0) return null

  const handleAcceptBid = async (bid: LiveBid) => {
    if (balance < bid.price) {
      setShowWalletWarning(true)
      return
    }

    setAcceptingBidId(bid.id)
    const accepted = await acceptBid(bid.id)
    setAcceptingBidId(null)

    if (accepted) {
      moveToEscrow(bid.price)
      startSession(bid.tutorName, bid.durationMin, bid.price)
      notifySuccess('Bid accepted. Starting your live session.')
      router.push('/student/session/active')
    } else {
      notifyError('This bid could not be accepted. Please refresh and try again.')
    }
  }

  const handleCancelRequest = async () => {
    const problemId = bids[0]?.problemId
    if (!problemId) return

    const shouldCancel = window.confirm('Cancel this request and hide all current bids?')
    if (!shouldCancel) return

    setIsCancelling(true)
    await cancelProblem(problemId)
    setIsCancelling(false)
  }

  return (
    <div className="mt-8">
      {balance < 500 && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="font-black text-amber-800">Low balance</h4>
            <p className="text-sm text-amber-700">Add money so you can accept bids without delay.</p>
          </div>
          <Link href="/student/wallet">
            <Button variant="outline" className="border-amber-300 bg-white text-amber-700 hover:bg-amber-100">
              Recharge Now
            </Button>
          </Link>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success-subtle px-3 py-1 text-xs font-black uppercase text-success">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            Live bids
          </div>
          <h3 className="mt-3 text-2xl font-black text-text-main">Tutors are ready to help</h3>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <p className="text-sm font-semibold text-text-muted">
            Problem: {bids[0]?.problemSubject || bids[0]?.tutorSubject} / {bids[0]?.problemClass || 'Class'}
          </p>
          <button
            type="button"
            onClick={handleCancelRequest}
            disabled={isCancelling}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Cancel request
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {bids.map((bid) => (
          <div key={bid.id} className="qs-card rounded-lg p-5 transition-all hover:border-primary/40">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar className="h-14 w-14 border-2 border-white shadow-sm bg-premium-gradient">
                <AvatarFallback className="bg-transparent text-white font-black text-lg">{bid.tutorName.charAt(0)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <h4 className="text-lg font-black text-text-main">{bid.tutorName}</h4>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex items-center gap-1 font-bold text-accent">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {bid.tutorRating}
                  </span>
                  <span className="text-text-muted">({bid.tutorSessions} sessions)</span>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span className="text-text-muted">{bid.tutorSubject}</span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-success">
                  <Clock3 className="h-3.5 w-3.5" />
                  Usually responds in {bid.responseTimeMin} min
                </p>
              </div>

              <div className="w-full sm:w-auto sm:text-right">
                <div className="mb-3 flex items-center justify-between gap-4 sm:block">
                  <div className="text-2xl font-black text-text-main">Rs. {bid.price}</div>
                  <div className="rounded-full bg-surface-hover px-3 py-1 text-xs font-bold text-text-muted sm:mt-1 sm:inline-block">{bid.durationMin} mins</div>
                </div>
                <Button
                  onClick={() => handleAcceptBid(bid)}
                  disabled={acceptingBidId === bid.id}
                  className="w-full sm:w-40"
                >
                  {acceptingBidId === bid.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept & Start
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showWalletWarning} onOpenChange={setShowWalletWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6" />
              Insufficient Balance
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-text-muted">You do not have enough wallet balance to accept this bid. Please recharge your wallet to proceed.</p>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="ghost" onClick={() => setShowWalletWarning(false)}>Cancel</Button>
            <Link href="/student/wallet">
              <Button onClick={() => setShowWalletWarning(false)}>Recharge Wallet</Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

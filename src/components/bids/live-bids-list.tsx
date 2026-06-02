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
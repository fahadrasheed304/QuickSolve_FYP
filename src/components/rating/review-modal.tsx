"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Flag } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/session-store'
import { notifyError, notifySuccess } from '@/lib/toast'

interface ReviewModalProps {
  isOpen: boolean
  onClose: () => void
  tutorName: string
}

const TAGS = [
  "Explained clearly", "Patient teacher", "On time",
  "Good use of whiteboard", "Solved my exact problem"
]

const DISPUTE_REASONS = [
  "Tutor did not show up", "Poor explanation", "Technical issues", "Other"
]

export function ReviewModal({ isOpen, onClose, tutorName }: ReviewModalProps) {
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [feedback, setFeedback] = useState("")
  const [hasDispute, setHasDispute] = useState(false)
  const [disputeReason, setDisputeReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { price } = useSessionStore()

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const handleSubmit = async () => {
    if (rating === 0 && !hasDispute) {
      notifyError("Please choose a star rating before submitting your review.")
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/sessions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: price,
          tutorName,
          rating,
          tags: selectedTags,
          feedback,
          dispute: hasDispute ? disputeReason : null
        })
      })
      if (!res.ok) {
        notifyError("We could not save the session review, but your session has ended.")
      } else {
        notifySuccess("Thanks for your feedback.")
      }
    } catch (e) {
      console.error("Failed to complete session:", e)
      notifyError("We could not save the session review right now. Please check your connection.")
    } finally {
              setIsSubmitting(false)
      onClose()
      router.push('/student/dashboard')
      router.refresh()
    }
  }

  const getRatingLabel = () => {
    const val = hoveredRating || rating
    switch (val) {
      case 1: return "Poor"
      case 2: return "Fair"
      case 3: return "Good"
      case 4: return "Very Good"
      case 5: return "Excellent"
      default: return "Select Rating"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-hero-gradient surface-grid p-6 text-center text-white">
          <h2 className="mb-1 text-2xl font-black">Session Completed</h2>
          <p className="text-sm text-white/75">Thank you for using QuickSolve.</p>
        </div>

        <div className="p-6">
          <div className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-surface-hover p-4">
            <Avatar className="h-12 w-12 border-2 border-white shadow-sm bg-premium-gradient">
              <AvatarFallback className="bg-transparent text-white font-black">{tutorName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-black text-text-main">{tutorName}</p>
              <p className="text-sm text-text-muted">Physics / Class 10</p>
            </div>
          </div>

          <div className="mb-6 text-center">
            <p className="mb-2 text-sm font-bold text-text-main">How was your session?</p>
            <div className="mb-2 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(star)}
                  className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Star
                    className={cn(
                      "h-10 w-10 transition-colors",
                      (hoveredRating >= star || rating >= star)
                        ? "fill-amber-500 text-amber-500"
                        : "fill-surface-hover text-border"
                    )}
                  />
                </button>
              ))}
            </div>
            <p className={cn("text-xs font-black", rating > 0 ? "text-amber-600" : "text-text-muted")}>
              {getRatingLabel()}
            </p>
          </div>

          <div className="mb-6">
            <p className="mb-2 text-sm font-bold text-text-main">What went well?</p>
            <div className="flex flex-wrap gap-2">
              {TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                                    onClick={() => toggleTag(tag)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
                    selectedTags.includes(tag)
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-text-muted hover:border-primary/40 hover:bg-surface-hover"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <Textarea
              placeholder="Any additional feedback? (Optional)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="h-20 resize-none"
            />
          </div>

          <div className="mb-6 border-t border-border pt-4">
            <label className="group flex cursor-pointer items-start gap-2">
              <div className="flex h-5 items-center">
                <input
                  type="checkbox"
                  checked={hasDispute}
                  onChange={(e) => setHasDispute(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-amber-600 focus:ring-amber-500"
                />
              </div>
              <div className="flex-1 text-sm">
                <span className="font-bold text-text-muted group-hover:text-text-main transition-colors">
                  I had issues with this session
                </span>
                {hasDispute && (
                  <div className="mt-3">
                    <select
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      className="qs-input w-full rounded-lg p-2 text-sm"
                    >
                      <option value="" disabled>Select reason...</option>
                      {DISPUTE_REASONS.map(reason => (
                        <option key={reason} value={reason}>{reason}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </label>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn("h-12 w-full text-base", (hasDispute || (rating > 0 && rating < 3)) && "bg-amber-600 hover:bg-amber-700")}
          >
            {isSubmitting ? "Processing..." : (hasDispute || (rating > 0 && rating < 3)) ? (
              <>
                <Flag className="mr-2 h-5 w-5" />
                Submit & Report Issue
              </>
            ) : "Submit Review"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
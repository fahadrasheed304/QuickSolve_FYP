import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, BookOpen, Users, Star, Zap, Bell, Shield, Clock, CheckCircle, AlertCircle, GraduationCap, FileText, Send, Loader2, MapPin, Award } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth-store'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'
import Link from 'next/link'

interface OpenProblem {
  id: string
  subject: string
  class: string
  details: string
  offer_price: number
  duration_min: number
  image_url?: string | null
  created_at: string
  bids?: Array<{ id: string }>
}

export default function TutorDashboard() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [showNotifications, setShowNotifications] = useState(false)
  const [openProblems, setOpenProblems] = useState<OpenProblem[]>([])
  const [isLoadingProblems, setIsLoadingProblems] = useState(false)
  const [bidPrices, setBidPrices] = useState<Record<string, string>>({})
  const [placingBidId, setPlacingBidId] = useState<string | null>(null)
  const [bidMessage, setBidMessage] = useState<string | null>(null)
  const [localAvailability, setLocalAvailability] = useState<boolean | null>(null)
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false)
  const profile = user?.tutorProfile
  const verificationStatus = profile?.verificationStatus || 'not_started'
  const totalSessions = profile?.totalSessions || 0
  const totalEarnings = profile?.totalEarnings || 0
  const subjects = profile?.subjects || []
  const isAvailable = localAvailability ?? profile?.isAvailable ?? true
  const displayName = (user?.fullname || user?.email || 'Tutor').split(' ')[0].split('@')[0]

  useEffect(() => {
    if (user?.role === 'tutor' && (!user.tutorProfile || user.tutorProfile.requiresProfileCompletion)) {
      router.replace('/tutor/complete-profile')
    }
  }, [user, router])

  useEffect(() => {
    if (profile?.isAvailable !== undefined) {
      setLocalAvailability(profile.isAvailable)
    }
  }, [profile?.isAvailable])

  useEffect(() => {
    let cancelled = false
    const loadOpenProblems = async () => {
      setIsLoadingProblems(true)
      try {
        const res = await fetch('/api/tutor/open-problems', { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        if (res.ok) {
          const problems = data.problems || []
          setOpenProblems(problems)
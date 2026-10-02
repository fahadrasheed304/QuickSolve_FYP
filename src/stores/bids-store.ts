import { create } from 'zustand'

interface Bid {
  id: string
  problemId: string
  tutorName: string
  tutorRating: number
  tutorSessions: number
  tutorSubject: string
  responseTimeMin: number
  price: number
  durationMin: number
  problemSubject?: string
  problemClass?: string
}

interface SupabaseBid {
  id: string
  problem_id: string
  tutor_name: string
  tutor_rating: number
  tutor_sessions: number
  tutor_subject: string
  response_time_min: number
  price: number
  duration_min: number
}

interface SupabaseProblem {
  id: string
  subject: string
  class: string
  details?: string
  offer_price: number
  duration_min: number
  status: string
  created_at?: string
  bids?: SupabaseBid[]
}

interface BidsState {
  hasPostedProblem: boolean
  activeProblems: SupabaseProblem[]
  bids: Bid[]
  isLoading: boolean
  error: string | null
  postProblem: (subject: string, amount: number, duration: number, details?: string, classStr?: string, imageFile?: File | null) => Promise<boolean>
  fetchStudentBids: () => Promise<void>
  cancelProblem: (problemId: string) => Promise<boolean>
  acceptBid: (bidId: string) => Promise<boolean>
}

export const useBidsStore = create<BidsState>((set) => ({
  hasPostedProblem: false,
  activeProblems: [],
  bids: [],
  isLoading: false,
  error: null,
  
  postProblem: async (subject, amount, duration, details, classStr, imageFile) => {
    set({ isLoading: true, error: null })
    try {
      const formData = new FormData()
      formData.append('subject', subject)
      formData.append('amount', amount.toString())
      formData.append('duration', duration.toString())
      if (details) formData.append('details', details)
      if (classStr) formData.append('class', classStr)
      if (imageFile) formData.append('image', imageFile)

      const res = await fetch('/api/problems', {
        method: 'POST',
        // Note: Do not set Content-Type header manually when using FormData
        body: formData
      })
      const data = await res.json()
      
      if (!res.ok) {
        set({ isLoading: false, error: data.error })
        return false
      }

      const formattedBids = ((data.bids || []) as SupabaseBid[]).map((b) => ({
        id: b.id,
        problemId: b.problem_id,
        tutorName: b.tutor_name,
        tutorRating: b.tutor_rating,
        tutorSessions: b.tutor_sessions,
        tutorSubject: b.tutor_subject,
        responseTimeMin: b.response_time_min,
        price: b.price,
        durationMin: b.duration_min,
      }))

      set({
        hasPostedProblem: true,
        activeProblems: data.problem ? [data.problem as SupabaseProblem] : [],
        bids: formattedBids,
        isLoading: false,
      })
      return true
    } catch {
      set({ isLoading: false, error: 'We could not post your problem right now. Please check your connection and try again.' })
      return false
    }
  },

  fetchStudentBids: async () => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch('/api/problems', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        set({ isLoading: false, error: data.error || 'We could not load your tutor bids. Please refresh and try again.' })
        return
      }

      const problems = (data.problems || []) as SupabaseProblem[]
      const activeProblems = problems.filter((problem) => problem.status === 'open')
      const formattedBids = activeProblems.flatMap((problem) =>
        (problem.bids || []).map((b) => ({
          id: b.id,
          problemId: b.problem_id,
          tutorName: b.tutor_name,
          tutorRating: b.tutor_rating,
          tutorSessions: b.tutor_sessions,
          tutorSubject: b.tutor_subject,
          responseTimeMin: b.response_time_min,
          price: b.price,
          durationMin: b.duration_min,
          problemSubject: problem.subject,
          problemClass: problem.class,
        }))
      )

      set({
        hasPostedProblem: activeProblems.length > 0,
        activeProblems,
        bids: formattedBids,
        isLoading: false,
      })
    } catch {
      set({ isLoading: false, error: 'We could not load your tutor bids right now. Please check your connection and try again.' })
    }
  },

  cancelProblem: async (problemId) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(`/api/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      const data = await res.json()

      if (!res.ok) {
        set({ isLoading: false, error: data.error || 'We could not cancel this problem. Please try again.' })
        return false
      }

      set((state) => {
        const activeProblems = state.activeProblems.filter((problem) => problem.id !== problemId)
        const bids = state.bids.filter((bid) => bid.problemId !== problemId)

        return {
          activeProblems,
          bids,
          hasPostedProblem: activeProblems.length > 0,
          isLoading: false,
        }
      })
      return true
    } catch {
      set({ isLoading: false, error: 'We could not cancel this problem right now. Please check your connection and try again.' })
      return false
    }
  },
  
  acceptBid: async (bidId) => {
    const bid = useBidsStore.getState().bids.find((item) => item.id === bidId)
    if (!bid) {
      set({ error: 'This bid is no longer available. Please refresh and try again.' })
      return false
    }

    try {
      const res = await fetch(`/api/problems/${bid.problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept', bidId }),
      })
      const data = await res.json()

      if (!res.ok) {
        set({ error: data.error || 'We could not accept this bid. Please try another bid or refresh.' })
        return false
      }

      set({
        hasPostedProblem: false,
        activeProblems: [],
        bids: [],
        error: null,
      })
      return true
    } catch {
      set({ error: 'We could not accept this bid right now. Please check your connection and try again.' })
      return false
    }
  }
}))

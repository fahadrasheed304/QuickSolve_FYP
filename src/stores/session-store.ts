import { create } from 'zustand'

interface SessionState {
  sessionId: string | null
  isActive: boolean
  timeLeftSeconds: number
  tutorName: string
  price: number
  startSession: (tutorName: string, durationMinutes: number, price: number) => void
  endSession: () => void
  extendSession: (minutes: number) => void
  tickTime: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  isActive: false,
  timeLeftSeconds: 0,
  tutorName: "",
  price: 0,
  startSession: (tutorName, durationMinutes, price) => set({
    sessionId: Math.random().toString(36).substring(7),
    isActive: true,
    timeLeftSeconds: durationMinutes * 60,
    tutorName,
    price
  }),
  endSession: () => set({ isActive: false, sessionId: null }),
  extendSession: (minutes) => set((state) => ({ 
    timeLeftSeconds: state.timeLeftSeconds + (minutes * 60) 
  })),
  tickTime: () => set((state) => ({ 
    timeLeftSeconds: Math.max(0, state.timeLeftSeconds - 1) 
  }))
}))

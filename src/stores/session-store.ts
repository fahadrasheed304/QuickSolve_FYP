import { create } from 'zustand'

interface SessionState {
  sessionId: string | null
  roomName: string | null
  isActive: boolean
  timeLeftSeconds: number
  tutorName: string
  price: number
  startSession: (tutorName: string, durationMinutes: number, price: number, roomName?: string) => void
  endSession: () => void
  extendSession: (minutes: number) => void
  tickTime: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  roomName: null,
  isActive: false,
  timeLeftSeconds: 0,
  tutorName: "",
  price: 0,
  startSession: (tutorName, durationMinutes, price, roomName) => {
    const sessionId = Math.random().toString(36).substring(7)
    set({
      sessionId,
      roomName: roomName || `session-${sessionId}`,
      isActive: true,
      timeLeftSeconds: durationMinutes * 60,
      tutorName,
      price
    })
  },
  endSession: () => set({ isActive: false, sessionId: null, roomName: null }),
  extendSession: (minutes) => set((state) => ({ 
    timeLeftSeconds: state.timeLeftSeconds + (minutes * 60) 
  })),
  tickTime: () => set((state) => ({ 
    timeLeftSeconds: Math.max(0, state.timeLeftSeconds - 1) 
  }))
}))

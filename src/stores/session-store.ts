import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  endsAt: number | null
  clockOffset: number
  syncClock: (endsAt: number, serverNow: number) => void
  sessionId: string | null
  roomName: string | null
  isActive: boolean
  timeLeftSeconds: number
  tutorName: string
  price: number
  startSession: (tutorName: string, durationMinutes: number, price: number, roomName?: string) => void
  endSession: () => void
  clearSession: () => void
  extendSession: (minutes: number) => void
  tickTime: () => void
}

export const useSessionStore = create<SessionState>()(persist((set) => ({
  endsAt: null,
  clockOffset: 0,
  syncClock: (endsAt, serverNow) => set({ endsAt, clockOffset: serverNow - Date.now(), timeLeftSeconds: Math.max(0, Math.ceil((endsAt - serverNow) / 1000)) }),
  sessionId: null,
  roomName: null,
  isActive: false,
  timeLeftSeconds: 0,
  tutorName: "",
  price: 0,
  startSession: (tutorName, durationMinutes, price, roomName) => {
    const sessionId = Math.random().toString(36).substring(7)
    set({
      endsAt: null,
      sessionId,
      roomName: roomName || `session-${sessionId}`,
      isActive: true,
      timeLeftSeconds: durationMinutes * 60,
      tutorName,
      price
    })
  },
  endSession: () => set({ isActive: false }),
  clearSession: () => set({ endsAt: null, clockOffset: 0, isActive: false, sessionId: null, roomName: null, price: 0, tutorName: "", timeLeftSeconds: 0 }),
  extendSession: (minutes) => set((state) => ({
    timeLeftSeconds: state.timeLeftSeconds + (minutes * 60)
  })),
  tickTime: () => set((state) => ({
    timeLeftSeconds: state.endsAt ? Math.max(0, Math.ceil((state.endsAt - Date.now() - state.clockOffset) / 1000)) : state.timeLeftSeconds
  }))
}), { name: 'quicksolve-session', version: 1 }))

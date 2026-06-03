import { create } from 'zustand'

interface TutorProfile {
  id: string;
  fullname: string;
  phone: string;
  cnic: string;
  city: string;
  bio: string;
  profileImageUrl: string;
  highestEducation: string;
  university: string;
  graduationYear: string;
  subjects: string[];
  experienceYears: number;
  verificationStatus: string;
  verificationStage: string;
  profileSubmitted: boolean;
  requiresProfileCompletion: boolean;
  documentsUploaded: string[];
  subjectTestScore: number | null;
  subjectTestPassed: boolean;
  rating: number | null;
  availableDays: string[];
  availableHoursStart: string;
  availableHoursEnd: string;
  isAvailable: boolean;
  totalEarnings: number;
  totalSessions: number;
  responseTimeMin: number;
}

interface User {
  id: string;
  fullname: string;
  email: string;
  role: string;
  class: string | null;
  group: string | null;
  sessions: number;
  rating: number | null;
  walletBalance: number;
  tutorProfile: TutorProfile | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  lastActivity: number;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  updateActivity: () => void;
}

const INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes in milliseconds

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  lastActivity: Date.now(),
  fetchUser: async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (!res.ok) {
        set({ user: null, isLoading: false })
        // Only force logout + redirect on 401 (truly unauthorized)
        // 404 means user record issue — don't hard-redirect, let layout handle
        if (res.status === 401) {
          await fetch('/api/auth/logout', { method: 'POST' })
          // Avoid redirect loop: only redirect if not already on auth page
          const path = window.location.pathname
          if (!path.startsWith('/signin-page') && !path.startsWith('/signup-page')) {
            window.location.href = '/signin-page'
          }
        }
        return
      }
      const data = await res.json()
      if (data && data.user) {
        set({ user: data.user, isLoading: false })
      } else {
        set({ isLoading: false })
      }
    } catch (e) {
      set({ isLoading: false })
    }
  },
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      set({ user: null, lastActivity: Date.now() })
      window.location.href = '/signin-page'
    } catch (e) {}
  },

  updateActivity: () => {
    set({ lastActivity: Date.now() })
  }
}))

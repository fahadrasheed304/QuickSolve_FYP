import { create } from 'zustand'

export interface WalletTransaction {
  id: string
  type: 'credit' | 'debit' | 'escrow'
  amount: number
  method: string
  description: string
  date: string
  status: 'completed' | 'pending' | 'failed'
}

interface WalletState {
  balance: number
  transactions: WalletTransaction[]
  isLoading: boolean
  error: string | null
  fetchWallet: () => Promise<void>
  topUp: (amount: number, method: string) => Promise<{ success: boolean; message: string }>
  // Legacy in-memory helpers — used by session flow (no API call)
  deductBalance: (amount: number) => void
  moveToEscrow: (amount: number) => void
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  transactions: [],
  isLoading: false,
  error: null,

  fetchWallet: async () => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch('/api/wallet', { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json()
        set({ error: data.error || 'We could not load your wallet. Please refresh and try again.', isLoading: false })
        return
      }
      const data = await res.json()
      set({
        balance: data.balance ?? 0,
        transactions: data.transactions ?? [],
        isLoading: false,
      })
    } catch {
      set({ error: 'We could not load your wallet right now. Please check your connection and try again.', isLoading: false })
    }
  },

  topUp: async (amount: number, method: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, method }),
      })
      const data = await res.json()
      if (!res.ok) {
        set({ isLoading: false, error: data.error })
        return { success: false, message: data.error || 'We could not top up your wallet. Please try again.' }
      }
      // Update local state immediately
      set((state) => ({
        balance: data.newBalance,
        transactions: [data.transaction, ...state.transactions],
        isLoading: false,
      }))
      return { success: true, message: data.message }
    } catch {
      set({ isLoading: false, error: 'We could not top up your wallet right now. Please check your connection and try again.' })
      return { success: false, message: 'We could not top up your wallet right now. Please check your connection and try again.' }
    }
  },

  // Legacy in-memory helpers — keep session flow working without API call
  deductBalance: (amount: number) =>
    set((state) => ({ balance: Math.max(0, state.balance - amount) })),

  moveToEscrow: (amount: number) =>
    set((state) => ({ balance: Math.max(0, state.balance - amount) })),
}))

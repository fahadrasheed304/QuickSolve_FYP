import { create } from 'zustand'

export type AppNotification = {
  id: string
  kind: 'new_request' | 'new_bid' | 'bid_accepted' | 'bid_rejected' | 'request_closed'
  problem_id: string
  message: string
  created_at: string
  read_at: string | null
}

export const useNotificationsStore = create<{
  account: string | null
  items: AppNotification[]
  connected: boolean
  error: string | null
}>(() => ({ account: null, items: [], connected: false, error: null }))

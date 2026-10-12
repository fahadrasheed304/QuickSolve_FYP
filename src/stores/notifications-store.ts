import { create } from 'zustand'

export type AppNotification = {
  id: string
  kind: 'new_request' | 'new_bid' | 'bid_accepted' | 'bid_rejected' | 'request_closed' | 'tutor_joined' | 'scheduled_class'
  problem_id: string | null
  class_id?: string | null
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

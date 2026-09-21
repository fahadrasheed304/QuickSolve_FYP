'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}
export function useClientReady() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

const subscribeLocation = (callback: () => void) => {
  window.addEventListener('popstate', callback)
  return () => window.removeEventListener('popstate', callback)
}
export function useQueryRole(): 'student' | 'tutor' {
  return useSyncExternalStore(subscribeLocation,
    () => new URLSearchParams(window.location.search).get('role') === 'tutor' ? 'tutor' : 'student',
    () => 'student')
}

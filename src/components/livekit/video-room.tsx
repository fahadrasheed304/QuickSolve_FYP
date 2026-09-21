"use client"

import { useSessionStore } from '@/stores/session-store'
import { useEffect, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react'
import '@livekit/components-styles'

interface VideoRoomProps {
  roomName: string
  onDisconnected?: () => void
}

export default function VideoRoom({ roomName, onDisconnected }: VideoRoomProps) {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!roomName) return

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    let cancelled = false
    const fetchToken = async () => {
      try {
        const res = await fetch(`/api/livekit/token?room=${encodeURIComponent(roomName)}`, { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to get token')
        }
        const data = await res.json()
        if (cancelled) return
        if (!data.token || !data.serverUrl) throw new Error('Video configuration is incomplete. Please redeploy with LiveKit variables.')
        setServerUrl(data.serverUrl)
        useSessionStore.getState().syncClock(data.endsAt, data.serverNow)
        setToken(data.token)
      } catch (caughtError: unknown) {
    const err = caughtError instanceof Error ? caughtError : new Error('Unexpected error')
        console.error('Failed to fetch LiveKit token:', err)
        if (!cancelled) setError(controller.signal.aborted ? 'Connection timed out. Please retry.' : err.message)
      }
    }

    fetchToken().finally(() => clearTimeout(timeout))
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout) }
  }, [roomName, attempt])

  useEffect(() => {
    if (!token || connected) return
    const timeout = setTimeout(() => setError('Could not connect to the video server. Check your connection and retry.'), 30000)
    return () => clearTimeout(timeout)
  }, [token, connected])

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08111f]">
        <div className="text-center space-y-3">
          <div className="text-red-400 text-lg font-bold">Connection Error</div>
          <p className="text-white/60 text-sm max-w-sm">{error}</p>
          <button
            onClick={() => { setError(null); setToken(null); setConnected(false); setAttempt(value => value + 1) }}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08111f]">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 mx-auto border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 text-sm font-semibold">Connecting to video call...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full [--lk-bg:#08111f] [--lk-bg2:#16253b] [--lk-accent-bg:#1667ff] [--lk-control-bg:rgba(255,255,255,0.1)] [--lk-control-hover-bg:rgba(255,255,255,0.15)]">
      <LiveKitRoom
        video={false}
        audio={false}
        token={token}
        serverUrl={serverUrl}
        connect={true}
        onConnected={() => setConnected(true)}
        onError={(error) => setError(error.message || 'Video connection failed')}
        onDisconnected={() => { setConnected(false); setError('Call disconnected. Retry to rejoin.'); onDisconnected?.() }}
        style={{ height: '100%' }}
        data-lk-theme="default"
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}

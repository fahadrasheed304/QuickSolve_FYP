"use client"

import { useSessionStore } from '@/stores/session-store'
import { useEffect, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  useIsRecording,
} from '@livekit/components-react'
import '@livekit/components-styles'

function RecordingNotice({ enabled }: { enabled: boolean }) {
  const recording = useIsRecording()
  if (!enabled && !recording) return null
  return <div role="status" className="shrink-0 bg-[#16253b] px-3 py-2 text-xs text-white">
    <span className={recording ? 'font-bold text-red-300' : 'font-bold text-amber-200'}>{recording ? '● Recording' : 'Recording is not active yet'}</span>
    {' · '}Session audio, video and shared screens are recorded for admin dispute review. Recordings are kept for 20 minutes after the session ends, or until a held payment is resolved.
  </div>
}

interface VideoRoomProps {
  roomName: string
  onDisconnected?: () => void
  onEndSession: () => Promise<void>
  isEnding?: boolean
}

export default function VideoRoom({ roomName, onDisconnected, onEndSession, isEnding }: VideoRoomProps) {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const [connected, setConnected] = useState(false)
  const [recordingEnabled, setRecordingEnabled] = useState(false)

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
        setRecordingEnabled(data.recordingEnabled === true)
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
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        data-lk-theme="default"
      >
        <RecordingNotice enabled={recordingEnabled} />
        <VideoConference style={{ flex: 1, minHeight: 0 }} aria-busy={isEnding} onClickCapture={event => {
          // Route pointer and keyboard clicks through the same server action as
          // the header button, before LiveKit disconnects this browser locally.
          if (!(event.target instanceof Element) || !event.target.closest('.lk-disconnect-button')) return
          event.preventDefault()
          event.stopPropagation()
          if (!isEnding) void onEndSession()
        }} />
      </LiveKitRoom>
    </div>
  )
}

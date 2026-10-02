"use client"

import { useSessionStore } from '@/stores/session-store'
import { useEffect, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  useIsRecording,
} from '@livekit/components-react'
import { PenTool, Video } from 'lucide-react'
import SessionWhiteboard from './session-whiteboard'
import '@livekit/components-styles'

function RecordingNotice({ enabled }: { enabled: boolean }) {
  const recording = useIsRecording()
  if (!enabled && !recording) return null
  return <div role="status" className="shrink-0 border-b border-white/10 bg-[#16253b] px-3 py-2 text-[11px] leading-4 text-white sm:px-4 sm:text-xs">
    <span className={recording ? 'font-bold text-red-300' : 'font-bold text-amber-200'}>{recording ? 'Recording' : 'Recording is not active yet'}</span>
    <span className="hidden sm:inline"> - Session audio, video and shared screens are recorded for admin dispute review. Recordings are kept for 20 minutes after the session ends, or until a held payment is resolved.</span>
    <span className="sm:hidden"> - Audio, video and screen are saved for admin review.</span>
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
  const [mobileTab, setMobileTab] = useState<'call' | 'board'>('call')

  const handleDisconnected = async () => {
    setConnected(false)
    try {
      const problemId = roomName.replace(/^session-/, '')
      const response = await fetch(`/api/sessions/state?problemId=${encodeURIComponent(problemId)}`, { cache: 'no-store' })
      if (response.ok) {
        const state = await response.json()
        if (state.ended) {
          onDisconnected?.()
          return
        }
      }
    } catch {
      // If session state cannot be checked, treat this as a regular disconnect.
    }
    setError('Call disconnected. Retry to rejoin.')
  }

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
        onDisconnected={handleDisconnected}
        style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        data-lk-theme="default"
      >
        <RecordingNotice enabled={recordingEnabled} />
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)] lg:grid-rows-1 lg:gap-2">
          <nav aria-label="Session view" className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1 lg:hidden">
            <button type="button" aria-pressed={mobileTab === 'call'} onClick={() => setMobileTab('call')} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${mobileTab === 'call' ? 'bg-white text-slate-950 shadow' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}><Video size={17} />Call</button>
            <button type="button" aria-pressed={mobileTab === 'board'} onClick={() => setMobileTab('board')} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${mobileTab === 'board' ? 'bg-white text-slate-950 shadow' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}><PenTool size={17} />Whiteboard</button>
          </nav>
          <div className={`${mobileTab === 'call' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 lg:flex`}>
            <VideoConference style={{ height: '100%', minHeight: 0 }} aria-busy={isEnding} onClickCapture={event => {
              // Route pointer and keyboard clicks through the same server action as
              // the header button, before LiveKit disconnects this browser locally.
              if (!(event.target instanceof Element) || !event.target.closest('.lk-disconnect-button')) return
              event.preventDefault()
              event.stopPropagation()
              if (!isEnding) void onEndSession()
            }} />
          </div>
          <div className={`${mobileTab === 'board' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 lg:flex`}>
            <SessionWhiteboard problemId={roomName.replace(/^session-/, '')} />
          </div>
        </section>
      </LiveKitRoom>
    </div>
  )
}

"use client"

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
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

  useEffect(() => {
    if (!roomName) return

    const fetchToken = async () => {
      try {
        const res = await fetch(`/api/livekit/token?room=${encodeURIComponent(roomName)}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to get token')
        }
        const data = await res.json()
        setToken(data.token)
      } catch (err: any) {
        console.error('Failed to fetch LiveKit token:', err)
        setError(err.message || 'Could not connect to video call')
      }
    }

    fetchToken()
  }, [roomName])

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08111f]">
        <div className="text-center space-y-3">
          <div className="text-red-400 text-lg font-bold">Connection Error</div>
          <p className="text-white/60 text-sm max-w-sm">{error}</p>
          <button
            onClick={() => { setError(null); setToken(null) }}
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
        video={true}
        audio={true}
        token={token}
        serverUrl={serverUrl}
        connect={true}
        onDisconnected={onDisconnected}
        style={{ height: '100%' }}
        data-lk-theme="default"
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  )
}

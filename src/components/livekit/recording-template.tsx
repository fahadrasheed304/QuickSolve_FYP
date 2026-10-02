"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer, useChat, useRoomContext, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import SessionWhiteboard from './session-whiteboard'
import '@livekit/components-styles'

function RecordingView() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: true })
  const room = useRoomContext()
  const visibleTracks = tracks.filter(track => track.participant.identity !== room.localParticipant.identity)
  const { chatMessages } = useChat()
  const messagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight }, [chatMessages])
  return <main className="recording-template">
    <header className="recording-header"><strong>QuickSolve · Live session</strong><span>Session recording</span></header>
    <section className="recording-board"><SessionWhiteboard problemId="" recording readOnly /></section>
    <aside className="recording-side">
      <div className="recording-videos">
        {visibleTracks.length ? <GridLayout tracks={visibleTracks}><ParticipantTile /></GridLayout> : <div className="recording-empty">Waiting for tutor and student video…</div>}
      </div>
      <section className="recording-chat">
        <h2>Session chat</h2>
        <div className="recording-messages" ref={messagesRef}>
          {chatMessages.map((item, index) => <article key={`${item.timestamp}-${index}`}>
            <strong>{item.from?.name || item.from?.identity || 'Participant'}</strong>
            <p>{item.message}</p>
          </article>)}
        </div>
      </section>
    </aside>
    <RoomAudioRenderer />
  </main>
}

export default function RecordingTemplate() {
  const [params, setParams] = useState<{ url: string; token: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const url = query.get('url') || ''
    const token = query.get('token') || ''
    if (!url.startsWith('wss://') || !token) { setError('LiveKit recording parameters are missing'); return }
    setParams({ url, token })
  }, [])

  const onConnected = useMemo(() => () => {
    // LiveKit Egress starts capture after this exact console signal.
    setTimeout(() => console.log('START_RECORDING'), 1500)
  }, [])
  if (error) return <div className="recording-template-error">{error}</div>
  if (!params) return <div className="recording-template-error">Connecting recording layout…</div>
  return <div className="recording-root">
    <LiveKitRoom token={params.token} serverUrl={params.url} connect audio={false} video={false} onConnected={onConnected} onDisconnected={() => console.log('END_RECORDING')} onError={err => setError(err.message)}>
      <RecordingView />
    </LiveKitRoom>
  </div>
}

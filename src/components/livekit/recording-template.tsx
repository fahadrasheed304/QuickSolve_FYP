"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer, useChat, useRoomContext, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import SessionWhiteboard from './session-whiteboard'
import '@livekit/components-styles'

function RecordingView() {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ], { onlySubscribed: true })
  const room = useRoomContext()
  const visibleTracks = tracks.filter(track => track.participant.identity !== room.localParticipant.identity)
  const { chatMessages } = useChat()
  const [hasWhiteboardContent, setHasWhiteboardContent] = useState(false)
  const messagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight }, [chatMessages])

  const hasChat = chatMessages.length > 0
  const remoteParticipants = [...room.remoteParticipants.values()]
    .filter(participant => participant.identity !== room.localParticipant.identity)

  if (room.name.startsWith('class-')) return <main className={`recording-template recording-template--class${hasChat ? ' recording-template--chat' : ''}`}>
    <header className="recording-header"><strong>QuickSolve · Scheduled group class</strong><span>Session recording</span></header>
    <div className="recording-content">
      <section className="recording-videos">
        {visibleTracks.length ? <GridLayout tracks={visibleTracks}><ParticipantTile /></GridLayout> : <AudioOnlyStage participants={remoteParticipants} />}
      </section>
      {hasChat && <aside className="recording-chat">
        <h2>Class chat</h2>
        <div className="recording-messages" ref={messagesRef}>
          {chatMessages.map((item, index) => <article key={`${item.timestamp}-${index}`}>
            <strong>{item.from?.name || item.from?.identity || 'Participant'}</strong><p>{item.message}</p>
          </article>)}
        </div>
      </aside>}
    </div>
    <RoomAudioRenderer />
  </main>

  return <main className={`recording-template${hasWhiteboardContent ? ' recording-template--board' : ''}${hasChat ? ' recording-template--chat' : ''}`}>
    <header className="recording-header"><strong>QuickSolve · Live session</strong><span>Session recording</span></header>
    <div className="recording-content">
      <section className={`recording-stage${hasWhiteboardContent ? ' recording-stage--board' : ''}`}>
        <div className="recording-videos">
          {visibleTracks.length ? <GridLayout tracks={visibleTracks}><ParticipantTile /></GridLayout> : <AudioOnlyStage participants={remoteParticipants} />}
        </div>
        <section className="recording-board" aria-label="Shared whiteboard">
          <SessionWhiteboard problemId="" recording readOnly onContentChange={setHasWhiteboardContent} />
        </section>
      </section>
      {hasChat && <aside className="recording-chat">
        <h2>Session chat</h2>
        <div className="recording-messages" ref={messagesRef}>
          {chatMessages.map((item, index) => <article key={`${item.timestamp}-${index}`}>
            <strong>{item.from?.name || item.from?.identity || 'Participant'}</strong><p>{item.message}</p>
          </article>)}
        </div>
      </aside>}
    </div>
    <RoomAudioRenderer />
  </main>
}

function AudioOnlyStage({ participants }: { participants: { name?: string; identity: string }[] }) {
  return <div className="recording-audio-stage">
    <div className="recording-audio-card">
      <span className="recording-audio-mark">Q</span>
      <strong>{participants.length ? participants.map(participant => participant.name || participant.identity).join(' · ') : 'QuickSolve session'}</strong>
      <span>{participants.length ? 'Audio session · camera is off' : 'Waiting for participants to join'}</span>
    </div>
  </div>
}

export default function RecordingTemplate() {
  const [params, setParams] = useState<{ url: string; token: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const url = query.get('url') || ''
    const token = query.get('token') || ''
    void Promise.resolve().then(() => {
      if (!url.startsWith('wss://') || !token) { setError('LiveKit recording parameters are missing'); return }
      setParams({ url, token })
    })
  }, [])

  const onConnected = useMemo(() => () => {
    // LiveKit Egress starts capture after this exact console signal.
    setTimeout(() => console.log('START_RECORDING'), 1500)
  }, [])
  if (error) return <div className="recording-template-error">{error}</div>
  if (!params) return <div className="recording-template-error">Connecting recording layout...</div>
  return <div className="recording-root">
    <LiveKitRoom token={params.token} serverUrl={params.url} connect audio={false} video={false} onConnected={onConnected} onDisconnected={() => console.log('END_RECORDING')} onError={err => setError(err.message)}>
      <RecordingView />
    </LiveKitRoom>
  </div>
}

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
  if (room.name.startsWith('class-')) return <main style={{width:'100vw',height:'100vh',display:'flex',flexDirection:'column',background:'#08111f',color:'white',fontFamily:'Arial,sans-serif'}}>
    <header style={{padding:'20px 32px',fontSize:24,fontWeight:700,borderBottom:'1px solid #26344b'}}>QuickSolve · Scheduled group class</header>
    <div style={{display:'grid',gridTemplateColumns:'3fr 1fr',minHeight:0,flex:1,gap:16,padding:20}}>
      <section style={{minHeight:0,overflow:'hidden'}}>{visibleTracks.length?<GridLayout tracks={visibleTracks}><ParticipantTile/></GridLayout>:<p>Waiting for class participants…</p>}</section>
      <aside style={{background:'#16253b',padding:20,overflow:'hidden'}}><h2 style={{fontSize:20,fontWeight:700}}>Class chat</h2><div ref={messagesRef} style={{height:'90%',overflow:'auto'}}>{chatMessages.map((item,index)=><article key={`${item.timestamp}-${index}`} style={{marginTop:16}}><strong>{item.from?.name||'Participant'}</strong><p style={{whiteSpace:'pre-wrap',marginTop:4}}>{item.message}</p></article>)}</div></aside>
    </div><RoomAudioRenderer/>
  </main>
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
    void Promise.resolve().then(()=>{
      if (!url.startsWith('wss://') || !token) { setError('LiveKit recording parameters are missing'); return }
      setParams({ url, token })
    })
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

'use client'
import { useEffect, useState } from 'react'
import { LiveKitRoom, VideoConference, useRoomContext, useIsRecording } from '@livekit/components-react'
import '@livekit/components-styles'

function RoomState({ended}:{ended:boolean}){
  const room=useRoomContext()
  useEffect(()=>{if(ended)void room.disconnect()},[ended,room])
  const recording=useIsRecording()
  return <div role="status" className="border-b border-white/10 bg-[#16253b] px-4 py-2 text-xs text-white"><strong className={recording?'text-red-300':'text-amber-200'}>{recording?'Recording active':'Recording is starting'}</strong> · Audio, video and shared screens are recorded. Booked students can download each recording within 15 minutes after it becomes available following class.</div>
}
export default function ScheduledClassRoom({token,serverUrl,role,title,endsAt,ended,onLeave,onFinish}:{token:string;serverUrl:string;classId:string;role:'student'|'tutor';title:string;endsAt:number;ended:boolean;onLeave:()=>void;onFinish:()=>void}){
  const [error,setError]=useState('')
  return <div className="scheduled-class-room flex h-full min-h-0 w-full flex-col overflow-hidden text-white [--lk-bg:#08111f] [--lk-bg2:#16253b] [--lk-accent-bg:#1667ff] [--lk-control-bg:rgba(255,255,255,0.1)] [--lk-control-hover-bg:rgba(255,255,255,0.15)]"><header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs text-white/60">Ends at {new Date(endsAt).toLocaleTimeString()}</p></div><div className="flex gap-3">{role==='tutor'&&<button onClick={onFinish} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold">End class for everyone</button>}<button onClick={onLeave} className="rounded-lg border border-white/30 px-3 py-2 text-sm">Leave room</button></div></header>
    {error&&<p role="alert" className="bg-red-950 p-3 text-sm text-red-200">{error}. Leave this room and retry joining. Check your camera and microphone permissions.</p>}
    <LiveKitRoom token={token} serverUrl={serverUrl} connect audio video onDisconnected={onLeave} onError={error=>setError(error.message)} style={{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}} className="scheduled-class-livekit flex min-h-0 w-full flex-1 flex-col"><RoomState ended={ended}/><div className="scheduled-class-conference min-h-0 w-full flex-1 overflow-hidden"><VideoConference style={{height:'100%',minHeight:0,flex:1}}/></div></LiveKitRoom>
  </div>
}

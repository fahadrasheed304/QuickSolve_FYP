'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { CalendarDays, Users, Clock3, Download, ArrowLeft, Video, ShieldCheck } from 'lucide-react'
import { classFetch, classTime, money } from '@/components/scheduled-classes'
import { classJoinWindow, type ScheduledClass, type ClassBooking, type ClassRecording } from '@/lib/scheduled-classes'
import { useWalletStore } from '@/stores/wallet-store'

const ClassRoom=dynamic(()=>import('@/components/livekit/scheduled-class-room'),{ssr:false,loading:()=> <div className="p-8 text-white">Loading class room…</div>})
const primary='inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-50'
type Details={class:ScheduledClass;booking:ClassBooking|null;roster:ClassBooking[];rosterCount:number;summary:{reserved:number;released:number};present:string[];recordings:ClassRecording[];serverNow:number}

export default function ScheduledClassDetails({id,role}:{id:string;role:'student'|'tutor'}) {
  const [data,setData]=useState<Details|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false)
  const [room,setRoom]=useState<{token:string;serverUrl:string}|null>(null),[now,setNow]=useState(0),[offset,setOffset]=useState(0)
  const [reason,setReason]=useState(''),[decision,setDecision]=useState<'cancel_class'|'cancel_booking'|'dispute'|'finish'|null>(null),[notice,setNotice]=useState('')
  const [rosterPage,setRosterPage]=useState(0)
  const requestId=useRef<string|null>(null)
  const loadSequence=useRef<symbol|null>(null)
  const load=useCallback(async()=>{
    const sequence=Symbol('class-load');loadSequence.current=sequence
    try {const result=await classFetch(`/api/scheduled-classes/${id}?rosterPage=${rosterPage}`);if(sequence===loadSequence.current){setData(result);setOffset(result.serverNow-Date.now());setNow(result.serverNow)}}
    catch(error){if(sequence===loadSequence.current)setError(error instanceof Error?error.message:'Could not load class')}
  },[id,rosterPage])
  useEffect(()=>{void Promise.resolve().then(load);const timer=setInterval(()=>{void load()},5000);return()=>{clearInterval(timer);loadSequence.current=null}},[load])
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+offset),1000);return()=>clearInterval(timer)},[offset])
  const c=data?.class,b=data?.booking
  async function act(action:string){
    setBusy(true);setError('');setNotice('')
    requestId.current ||= crypto.randomUUID()
    try {
      const result=await classFetch(`/api/scheduled-classes/${id}`,{action,requestId:requestId.current,consent,bookingId:b?.id,reason})
      requestId.current=null;setNotice(result.warning||'Your class update has been saved.');setDecision(null);setReason('');if(action==='finish')setRoom(null);await load();void useWalletStore.getState().fetchWallet()
    }catch(error){setError(error instanceof Error?error.message:'Action failed')}
    finally{setBusy(false)}
  }
  async function join(){
    setBusy(true);setError('')
    try {const result=await classFetch(`/api/scheduled-classes/${id}/token`,{consent});setRoom(result)}
    catch(error){setError(error instanceof Error?error.message:'Could not join class')}
    finally{setBusy(false)}
  }
  async function download(egressId:string){
    setBusy(true);setError('')
    try {const result=await classFetch(`/api/scheduled-classes/${id}/recordings?egressId=${encodeURIComponent(egressId)}`);window.location.assign(result.url)}
    catch(error){setError(error instanceof Error?error.message:'Could not download recording')}
    finally{setBusy(false)}
  }
  if (!data) return <div className="p-8">{error?<p role="alert" className="text-red-600">{error}<button onClick={()=>{void load()}} className="ml-4 text-primary">Retry</button></p>:'Loading class…'}</div>
  if (!c) return null
  const canJoin=classJoinWindow(c,now)&&(role==='tutor'||b?.status==='booked')
  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
    <Link href={`/${role}/scheduled-classes`} className="inline-flex items-center gap-2 text-sm font-bold text-primary"><ArrowLeft size={16}/>Scheduled classes</Link>
    <header className="rounded-2xl bg-hero-gradient p-6 text-white sm:p-8"><span className="text-xs font-bold uppercase tracking-wide">{c.subject} · {c.class_level} · {c.status}</span><h1 className="mt-3 text-3xl font-black">{c.topic}</h1><p className="mt-2 text-white/80">With {c.tutor_name}</p><p className="mt-4 max-w-3xl text-sm leading-6 text-white/85">{c.description}</p></header>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-primary/10 p-4 text-sm text-primary">{notice}</p>}
    <div className="grid gap-4 sm:grid-cols-3">{[
      [CalendarDays,'Starts in your timezone',classTime(c.starts_at)],
      [Clock3,'Duration & fee',`${c.duration_min} minutes · ${money(c.fee)}`],
      [Users,'Seats booked',`${c.booked_count||0} / ${c.capacity}`],
    ].map(([Icon,label,value],index)=>{const InfoIcon=Icon as typeof CalendarDays;return <div key={index} className="rounded-xl border border-border bg-surface p-5"><InfoIcon size={20} className="text-primary"/><p className="mt-3 text-xs font-bold text-text-muted">{String(label)}</p><p className="mt-1 font-bold">{String(value)}</p></div>})}</div>
    {c.cancellation_reason&&<p className="rounded-xl border border-border bg-surface p-4 text-sm">Class cancelled: {c.cancellation_reason}</p>}
    <section className="rounded-2xl border border-border bg-surface p-6"><h2 className="flex items-center gap-2 font-black"><ShieldCheck size={19} className="text-primary"/>Booking & recording policy</h2><p className="mt-3 text-sm leading-6 text-text-muted">Your wallet fee is reserved when you book. Cancel at least 2 hours before start for a full refund. A late cancellation or student absence is charged if the class takes place. Tutor cancellation or no-show gets a full refund. Audio, video and shared screens are recorded and may be downloaded by booked students. Each recording has a 15-minute download window once available after class. Report payment issues within 20 minutes after class ends.</p>
      {['scheduled','live'].includes(c.status)&&<label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} className="mt-1"/><span>I agree to these policies and consent to this recorded group class.</span></label>}
      <div className="mt-5 flex flex-wrap gap-3">
        {role==='student'&&c.status==='scheduled'&&b?.status!=='booked'&&<button disabled={busy||!consent||now>=Date.parse(c.starts_at)-10*60000||(c.booked_count||0)>=c.capacity} onClick={()=>{void act('book')}} className={primary}>Book seat · {money(c.fee)}</button>}
        {canJoin&&<button disabled={busy||!consent} onClick={()=>{void join()}} className={primary}><Video size={17}/>{role==='tutor'?'Join & teach':'Join class'}</button>}
        {role==='student'&&b?.status==='booked'&&['scheduled','live'].includes(c.status)&&now<Date.parse(c.starts_at)&&<button disabled={busy} onClick={()=>setDecision('cancel_booking')} className="rounded-xl border border-border px-4 py-3 text-sm font-bold">Cancel booking</button>}
        {role==='tutor'&&(c.status==='scheduled'||(c.status==='live'&&now<Date.parse(c.starts_at)))&&<button disabled={busy} onClick={()=>setDecision('cancel_class')} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-600">Cancel class & refund seats</button>}
        {role==='tutor'&&c.status==='live'&&now>=Date.parse(c.starts_at)&&<button disabled={busy} onClick={()=>setDecision('finish')} className="rounded-xl border border-border px-4 py-3 text-sm font-bold">End class for everyone</button>}
      </div><p className="mt-3 text-xs text-text-muted">Booking closes 10 minutes before start. Join opens 10 minutes before start. Tutor absence beyond the 10-minute grace period cancels the class.</p>
    </section>
    {b&&<section className="rounded-2xl border border-border bg-surface p-6"><h2 className="font-black">Your booking</h2><div className="mt-3 flex flex-wrap gap-4 text-sm"><span className="capitalize">Booking: <strong>{b.status}</strong></span><span className="capitalize">Payment: <strong>{b.payment_status}</strong></span><span>{money(b.amount)}</span></div>{b.resolution_note&&<p className="mt-3 text-sm text-text-muted">{b.resolution_note}</p>}{b.dispute&&<p className="mt-3 text-sm">Reported issue: {b.dispute}</p>}
      {c.status==='completed'&&c.ended_at&&now<Date.parse(c.ended_at)+20*60000&&['pending','held'].includes(b.payment_status)&&<button disabled={busy} onClick={()=>setDecision('dispute')} className="mt-4 text-sm font-bold text-primary">Report a payment issue</button>}
    </section>}
    {role==='tutor'&&<section className="rounded-2xl border border-border bg-surface p-6"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-black">Student bookings</h2><p className="text-sm text-text-muted">Reserved: {money(data.summary?.reserved||0)} · Released: {money(data.summary?.released||0)}</p></div>
      {!data.roster?.length?<p className="mt-4 text-sm text-text-muted">No students have booked yet.</p>:<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-text-muted">{['Student','Booked at','Booking','Attendance','Fee','Payment'].map(label=><th key={label} className="px-3 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{data.roster.map(row=><tr key={row.id} className="border-b border-border/50"><td className="px-3 py-3 font-bold">{row.student_name}</td><td className="px-3 py-3">{classTime(row.created_at)}</td><td className="px-3 py-3 capitalize">{row.status}</td><td className="px-3 py-3">{row.status==='cancelled'?'Cancelled':data.present.includes(`${row.id}:student`)&&['scheduled','live'].includes(c.status)?'In room':row.joined_at?'Joined earlier':c.status==='completed'?'Absent':'Not joined'}</td><td className="px-3 py-3">{money(row.amount)}</td><td className="px-3 py-3 capitalize">{row.payment_status}</td></tr>)}</tbody></table></div>}
      {data.rosterCount>25&&<div className="mt-4 flex justify-end gap-4 text-sm"><button disabled={rosterPage===0} onClick={()=>setRosterPage(value=>value-1)} className="disabled:opacity-40">Previous bookings</button><span>Page {rosterPage+1}</span><button disabled={(rosterPage+1)*25>=data.rosterCount} onClick={()=>setRosterPage(value=>value+1)} className="disabled:opacity-40">Next bookings</button></div>}
    </section>}
    {role==='student'&&b?.status==='booked'&&c.status==='completed'&&<section className="rounded-2xl border border-border bg-surface p-6"><h2 className="font-black">Download your class recording</h2><p className="mt-2 text-sm text-text-muted">Save a copy to your device. The countdown starts when each recording becomes available.</p>{!data.recordings.length&&<p className="mt-4 text-sm">Recording is processing. This page refreshes automatically; we will also email you when ready.</p>}{data.recordings.map((recording,index)=>{
      const seconds=recording.download_until?Math.max(0,Math.floor((Date.parse(recording.download_until)-now)/1000)):0
      return <div key={recording.egress_id} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background p-4"><div><strong className="text-sm">Recording {index+1}</strong><p className="mt-1 text-xs text-text-muted">{recording.state==='ready'?seconds>0?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining · Until ${classTime(recording.download_until!)}`:'Download window closed':recording.state==='failed'?'Recording failed. Contact support.':recording.state==='deleted'||recording.state==='deleting'?'Recording expired':`Recording ${recording.state}…`}</p></div><button disabled={busy||recording.state!=='ready'||seconds<=0} onClick={()=>{void download(recording.egress_id)}} className={primary}><Download size={16}/>Download MP4</button></div>
    })}</section>}
    {decision&&<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"><section role="dialog" aria-modal="true" aria-label="Confirm class action" className="w-full max-w-xl rounded-2xl border border-primary/30 bg-surface p-6"><h2 className="font-black">{decision==='dispute'?'Report your payment issue':decision==='finish'?'End this class for everyone?':'Confirm cancellation'}</h2><p className="my-3 text-sm text-text-muted">{decision==='cancel_booking'?now<=Date.parse(c.starts_at)-2*3600000?'Your reserved fee will be fully refunded.':'This is a late cancellation. Your fee stays reserved and is charged if the class takes place.':decision==='finish'?'All participants will be disconnected. Ending before the announced end holds payments for admin review.':decision==='cancel_class'?'All reserved seat fees will be refunded. Students will receive an email.':'An administrator will review your report before resolving this payment.'}</p>
      {['cancel_class','dispute'].includes(decision)&&<textarea aria-label="Reason" value={reason} onChange={event=>setReason(event.target.value)} placeholder="Write the reason" maxLength={decision==='dispute'?1000:2000} rows={3} className="w-full rounded-xl border border-border bg-background p-3 text-sm"/>}{error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-4 flex gap-3"><button disabled={busy||(['cancel_class','dispute'].includes(decision)&&reason.trim().length<5)} onClick={()=>{void act(decision)}} className={primary}>{busy?'Saving…':'Confirm'}</button><button disabled={busy} onClick={()=>{setDecision(null);setReason('')}} className="px-4 text-sm font-bold">Go back</button></div></section></div>}
    {room&&<div className="fixed inset-0 z-50 bg-[#08111f]"><ClassRoom token={room.token} serverUrl={room.serverUrl} classId={id} role={role} title={c.topic} endsAt={Date.parse(c.ends_at)} ended={['completed','cancelled'].includes(c.status)||now>=Date.parse(c.ends_at)} onLeave={()=>{setRoom(null);void load()}} onFinish={()=>setDecision(now<Date.parse(c.starts_at)?'cancel_class':'finish')}/></div>}
  </div>
}

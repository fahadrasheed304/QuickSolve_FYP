'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Clock3, Users, Video, ArrowRight, Plus, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import type { ScheduledClass } from '@/lib/scheduled-classes'

const input='w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary'
const button='inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50'
export async function classFetch(url:string,body?:unknown) {
  const response=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})
  const data=await response.json()
  if (!response.ok) throw new Error(data.error || 'Request failed. Please retry.')
  return data
}
export const classTime=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})
export const money=(value:number)=>`Rs. ${Number(value).toLocaleString()}`

export default function ScheduledClasses({role,archive=false}:{role:'student'|'tutor';archive?:boolean}) {
  const user=useAuthStore(state=>state.user)
  const [mode,setMode]=useState(archive?'past':role==='tutor'?'mine':'browse')
  const [page,setPage]=useState(0),[count,setCount]=useState(0)
  const [classes,setClasses]=useState<ScheduledClass[]>([])
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[showCreate,setShowCreate]=useState(false),[saving,setSaving]=useState(false)
  const requestId=useRef<string|null>(null)
  const loadSequence=useRef<symbol|null>(null)
  const load=useCallback(async()=>{
    const sequence=Symbol('classes-load');loadSequence.current=sequence
    setLoading(true);setError('')
    try {const data=await classFetch(`/api/scheduled-classes?mode=${mode}&page=${page}`);if(sequence===loadSequence.current){setClasses(data.classes);setCount(data.count)}}
    catch(error){if(sequence===loadSequence.current)setError(error instanceof Error?error.message:'Could not load classes')}
    finally{if(sequence===loadSequence.current)setLoading(false)}
  },[mode,page])
  useEffect(()=>{void Promise.resolve().then(load);return()=>{loadSequence.current=null}},[load])
  useEffect(()=>{
    const interval=setInterval(()=>{void load()},60000)
    return()=>clearInterval(interval)
  },[load])
  async function create(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError('')
    const form=new FormData(event.currentTarget)
    requestId.current ||= crypto.randomUUID()
    try {
      await classFetch('/api/scheduled-classes',{requestId:requestId.current,subject:String(form.get('subject')),topic:String(form.get('topic')),
        classLevel:String(form.get('classLevel')),description:String(form.get('description')),startsAt:new Date(String(form.get('startsAt'))).toISOString(),
        durationMin:Number(form.get('durationMin')),fee:Number(form.get('fee')),capacity:Number(form.get('capacity'))})
      requestId.current=null;setShowCreate(false);setMode('mine');setPage(0);await load()
    }catch(error){setError(error instanceof Error?error.message:'Could not create class')}
    finally{setSaving(false)}
  }
  return <div className={archive?'my-8 space-y-6':'mx-auto max-w-6xl space-y-6 p-4 sm:p-8'}>
    {archive ? <header><h2 className="text-2xl font-black text-text-main">Scheduled class history</h2><p className="mt-2 text-sm text-text-muted">Completed and cancelled classes, including refunds and payment outcomes.</p></header> : <header className="surface-grid rounded-2xl bg-hero-gradient p-6 text-white sm:p-8">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold"><CalendarDays size={16}/>Learn together</span>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black">Scheduled classes</h1><p className="mt-2 max-w-xl text-sm text-white/80">{role==='tutor'?'Plan a topic, set your fee and teach a small group. Manage every seat from one place.':'Book a seat with a verified tutor and learn a topic with a small group.'}</p></div>
      {role==='tutor'&&<button onClick={()=>setShowCreate(value=>!value)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-primary"><Plus size={18}/>{showCreate?'Close form':'Create a class'}</button>}</div>
    </header>}
    {!archive&&<div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted"><strong className="text-text-main">Recorded group classes.</strong> Your seat fee is reserved at booking. Cancel at least 2 hours before start for a full refund. Download recordings within 15 minutes after they become available. Times below use your device timezone.</div>}
    {error&&<p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {showCreate&&role==='tutor'&&<form onSubmit={create} onChange={()=>{requestId.current=null}} className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-black">Create your next class</h2><p className="mt-1 text-sm text-text-muted">30 minutes to 90 days ahead. Published details stay fixed; cancel and recreate to change them.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-bold">Subject<select name="subject" required className={input}><option value="">Choose your subject</option>{user?.tutorProfile?.subjects.map(subject=><option key={subject}>{subject}</option>)}</select></label>
        <label className="space-y-2 text-sm font-bold">Topic<input name="topic" required minLength={3} maxLength={120} placeholder="Newton's laws with worked examples" className={input}/></label>
        <label className="space-y-2 text-sm font-bold">Class level<input name="classLevel" required maxLength={60} placeholder="Grade 10" className={input}/></label>
        <label className="space-y-2 text-sm font-bold">Start time (your timezone)<input name="startsAt" type="datetime-local" required className={input}/></label>
        <label className="space-y-2 text-sm font-bold">Duration (minutes)<input name="durationMin" type="number" defaultValue={60} min={15} max={180} required className={input}/></label>
        <label className="space-y-2 text-sm font-bold">Fee per student (Rs.)<input name="fee" type="number" defaultValue={500} min={0.01} max={100000} step={0.01} required className={input}/></label>
        <label className="space-y-2 text-sm font-bold">Maximum seats<input name="capacity" type="number" defaultValue={10} min={2} max={10} required className={input}/></label>
        <label className="space-y-2 text-sm font-bold sm:col-span-2">What students will learn<textarea name="description" maxLength={2000} rows={3} className={input}/></label>
      </div><p className="my-4 text-xs leading-5 text-text-muted">You must join within 10 minutes of the announced start. Tutor cancellation or no-show refunds all seats. Early completion or insufficient attendance requires administrator payment review. Audio, video and shared screens are recorded.</p>
      <button disabled={saving} className={button}>{saving?'Publishing…':'Publish class'}</button>
    </form>}
    <div className="flex flex-wrap items-center justify-between gap-3">{!archive&&<nav className="flex gap-2" aria-label="Class filters">
      {(role==='student'?[['browse','Browse classes'],['mine','My bookings'],['past','Past classes']]:[['mine','Upcoming'],['past','Past classes']]).map(([value,label])=><button key={value} onClick={()=>{setMode(value);setPage(0)}} className={`rounded-xl px-4 py-2 text-sm font-bold ${mode===value?'bg-primary text-white':'border border-border bg-surface text-text-muted'}`}>{label}</button>)}</nav>}
      <button onClick={()=>{void load()}} disabled={loading} className="flex items-center gap-2 text-sm font-bold text-primary"><RefreshCw size={16}/>Refresh</button></div>
    {loading&&classes.length===0?<p className="p-8 text-center text-text-muted">Loading classes…</p>:!classes.length&&!error?<div className="rounded-2xl border border-dashed border-border p-12 text-center"><CalendarDays className="mx-auto text-primary" size={36}/><h2 className="mt-4 text-lg font-bold">No classes here yet</h2><p className="mt-2 text-sm text-text-muted">{role==='tutor'?'Create your first scheduled class to open bookings.':'Check back for new classes from your tutors.'}</p></div>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{classes.map((c,index)=><article key={`${c.id}-${index}`} className="flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{c.subject}</span><span className="text-xs font-bold capitalize text-text-muted">{c.status}</span></div>
      <h2 className="mt-4 text-xl font-black text-text-main">{c.topic}</h2><p className="mt-1 text-sm text-text-muted">{c.class_level} · {c.tutor_name}</p>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-muted">{c.description||'A focused live group lesson with your tutor.'}</p>
      <div className="my-5 space-y-2 text-sm"><p className="flex items-center gap-2"><CalendarDays size={16} className="text-primary"/>{classTime(c.starts_at)}</p><p className="flex items-center gap-2"><Clock3 size={16} className="text-primary"/>{c.duration_min} minutes</p><p className="flex items-center gap-2"><Users size={16} className="text-primary"/>{c.booked_count||0}/{c.capacity} seats booked</p></div>
      {c.my_booking&&<p className="mb-3 text-xs font-bold capitalize text-primary">Booking {c.my_booking.status} · Payment {c.my_booking.payment_status}{c.my_booking.payment_status==='refunded'&&` · ${money(c.my_booking.amount)} returned to your wallet`}</p>}
      {role==='tutor'&&<p className="mb-3 text-xs text-text-muted">Booked seat value: {money(c.expected_earnings||0)}</p>}
      <div className="mt-auto flex items-center justify-between border-t border-border pt-4"><div><strong className="text-lg">{money(c.fee)}</strong><span className="block text-xs text-text-muted">per student</span></div><Link href={`/${role}/scheduled-classes/${c.id}`} className={button}><Video size={16}/>{role==='tutor'?'Manage':'View class'}<ArrowRight size={14}/></Link></div>
    </article>)}</div>}
    <div className="flex items-center justify-between text-sm text-text-muted"><span>{count} {mode==='mine'&&role==='student'?'bookings':'classes'}</span><div className="flex gap-3"><button disabled={page===0||loading} onClick={()=>setPage(value=>value-1)} className="disabled:opacity-40">Previous</button><span>Page {page+1}</span><button disabled={(page+1)*12>=count||loading} onClick={()=>setPage(value=>value+1)} className="disabled:opacity-40">Next</button></div></div>
  </div>
}

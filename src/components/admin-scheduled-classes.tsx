'use client'
import { useCallback, useEffect, useState } from 'react'
import { classFetch, classTime, money } from '@/components/scheduled-classes'
import type { ClassBooking, ScheduledClass, ClassRecording } from '@/lib/scheduled-classes'
type Payment=ClassBooking & {scheduled_classes:ScheduledClass;student_email:string}
export default function AdminScheduledClasses(){
  const [status,setStatus]=useState('held'),[page,setPage]=useState(0),[count,setCount]=useState(0)
  const [payments,setPayments]=useState<Payment[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [selected,setSelected]=useState<Payment|null>(null),[note,setNote]=useState(''),[recordings,setRecordings]=useState<ClassRecording[]>([]),[seconds,setSeconds]=useState<number|null>(null)
  const load=useCallback(async()=>{
    setBusy(true);setError('')
    try{const result=await classFetch(`/api/admin/scheduled-classes?status=${status}&page=${page}`);setPayments(result.payments);setCount(result.count)}
    catch(error){setError(error instanceof Error?error.message:'Payments unavailable')}
    finally{setBusy(false)}
  },[status,page])
  useEffect(()=>{void Promise.resolve().then(load)},[load])
  async function inspect(payment:Payment){
    setSelected(payment);setNote('');setRecordings([]);setSeconds(null);setError('')
    try{const result=await classFetch(`/api/scheduled-classes/${payment.class_id}`);setRecordings(result.recordings);setSeconds(result.tutorAttendanceSeconds)}
    catch(error){setError(error instanceof Error?error.message:'Evidence unavailable')}
  }
  async function resolve(action:'release'|'refund'){
    if(!selected)return
    setBusy(true);setError('')
    try{await classFetch('/api/admin/scheduled-classes',{bookingId:selected.id,action,note});setSelected(null);await load()}
    catch(error){setError(error instanceof Error?error.message:'Decision failed')}
    finally{setBusy(false)}
  }
  async function play(egress:string){
    if(!selected)return
    try{const result=await classFetch(`/api/scheduled-classes/${selected.class_id}/recordings?egressId=${encodeURIComponent(egress)}`);window.open(result.url,'_blank','noopener,noreferrer')}
    catch(error){setError(error instanceof Error?error.message:'Playback unavailable')}
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-text-muted">Resolve each booked seat independently using attendance and retained recordings.</p><select aria-label="Payment status" value={status} onChange={event=>{setStatus(event.target.value);setPage(0);setSelected(null)}} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">{['held','pending','reserved','released','refunded'].map(value=><option key={value}>{value}</option>)}</select><button onClick={()=>{void load()}} disabled={busy} className="text-sm font-bold text-primary">Refresh</button></div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!payments.length?<p className="rounded-xl border border-border bg-surface p-8 text-center text-text-muted">{busy?'Loading…':'No payments in this category.'}</p>:<div className="overflow-x-auto rounded-xl border border-border bg-surface"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-text-muted">{['Class','Student','Amount','Status','Issue','Details'].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{payments.map(payment=><tr key={payment.id} className="border-b border-border"><td className="px-4 py-4"><strong>{payment.scheduled_classes.topic}</strong><p className="mt-1 text-xs text-text-muted">{payment.scheduled_classes.tutor_name} · {classTime(payment.scheduled_classes.starts_at)}</p></td><td className="px-4 py-4">{payment.student_name}</td><td className="px-4 py-4">{money(payment.amount)}</td><td className="px-4 py-4 capitalize">{payment.payment_status}</td><td className="max-w-xs px-4 py-4">{payment.dispute||payment.resolution_note||'—'}</td><td className="px-4 py-4"><button onClick={()=>{void inspect(payment)}} className="font-bold text-primary">Review</button></td></tr>)}</tbody></table></div>}
    {selected&&<section className="rounded-2xl border border-primary/30 bg-surface p-6"><h2 className="font-black">{selected.scheduled_classes.topic} · {selected.student_name}</h2><p className="mt-3 text-sm">Student: {selected.student_email}<br/>Tutor: {selected.scheduled_classes.tutor_email}<br/>Class: {selected.scheduled_classes.status}<br/>Student joined: {selected.joined_at?classTime(selected.joined_at):'No attendance recorded'}<br/>Tutor attendance: {seconds===null?'Loading evidence…':`${Math.round(seconds/60)} / ${selected.scheduled_classes.duration_min} minutes`}</p><p className="mt-3 text-sm text-text-muted">{selected.dispute||selected.resolution_note}</p><div className="my-4 flex flex-wrap gap-3">{recordings.map((recording,index)=><button key={recording.egress_id} disabled={recording.state!=='ready'} onClick={()=>{void play(recording.egress_id)}} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Recording {index+1}: {recording.state}</button>)}</div>
      {selected.payment_status==='held'&&<><label className="text-sm font-bold">Resolution note<textarea value={note} onChange={event=>setNote(event.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm"/></label><div className="mt-4 flex flex-wrap gap-3"><button disabled={busy||note.trim().length<5} onClick={()=>{void resolve('release')}} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Release to tutor</button><button disabled={busy||note.trim().length<5} onClick={()=>{void resolve('refund')}} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-600 disabled:opacity-50">Refund student</button></div></>}<button onClick={()=>setSelected(null)} className="mt-4 text-sm font-bold text-text-muted">Close review</button>
    </section>}
    <div className="flex justify-between text-sm text-text-muted"><span>{count} payments</span><div className="flex gap-4"><button disabled={page===0||busy} onClick={()=>setPage(value=>value-1)} className="disabled:opacity-40">Previous</button><span>Page {page+1}</span><button disabled={(page+1)*25>=count||busy} onClick={()=>setPage(value=>value+1)} className="disabled:opacity-40">Next</button></div></div>
  </div>
}

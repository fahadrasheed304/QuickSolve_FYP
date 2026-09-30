'use client'
import { useEffect, useState } from 'react'

export function StudentReview({ problemId }: { problemId: string }) {
  const [rating,setRating]=useState(0)
  const [feedback,setFeedback]=useState('')
  const [saved,setSaved]=useState(false)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    const controller=new AbortController()
    async function load(){
      setLoading(true);setError('')
      try{
        const res=await fetch(`/api/sessions/student-review?session=${encodeURIComponent(problemId)}`,{cache:'no-store',signal:controller.signal})
        const data=await res.json();if(!res.ok)throw new Error(data.error)
        if(!controller.signal.aborted && data.review){setRating(data.review.rating);setFeedback(data.review.feedback);setSaved(true)}
      }catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Review unavailable')}
      finally{if(!controller.signal.aborted)setLoading(false)}
    }void load();return()=>controller.abort()
  },[problemId,retry])
  async function save(){
    setBusy(true);setError('')
    try{
      const res=await fetch('/api/sessions/student-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problemId,rating,feedback})})
      const data=await res.json();if(!res.ok)throw new Error(data.error)
      setSaved(true)
    }catch(err){setError(err instanceof Error?err.message:'Review could not be saved')}
    finally{setBusy(false)}
  }
  return <section className="mt-4 space-y-3 rounded-xl border border-border bg-surface p-5 text-text-main"><h3 className="font-bold">{saved?'Your rating of this student':'Rate your student'}</h3><p className="text-xs text-text-muted">Rate participation, communication and respectful conduct. One review per completed session; it does not change payments.</p>{loading?<p role="status">Loading review…</p>:<><div className="flex gap-2" role="group" aria-label="Student rating">{[1,2,3,4,5].map(value=><button key={value} disabled={saved||busy} aria-label={`${value} stars`} aria-pressed={rating===value} onClick={()=>setRating(value)} className={`text-3xl ${rating>=value?'text-amber-500':'text-slate-300'}`}>★</button>)}</div>{saved?<p className="whitespace-pre-wrap text-sm">{feedback || 'Rating saved.'}</p>:<><label className="block text-sm">Feedback (optional)<textarea disabled={busy} maxLength={2000} value={feedback} onChange={event=>setFeedback(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background p-3" /></label><button disabled={busy||!rating} onClick={()=>void save()} className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50">{busy?'Saving…':'Submit student rating'}</button></>}</>}{error&&<p role="alert" className="text-sm text-red-600">{error} <button onClick={()=>setRetry(value=>value+1)} className="underline">Reload</button></p>}</section>
}

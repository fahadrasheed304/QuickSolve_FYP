'use client'
import { useState } from 'react'
import type { summarizeAttendance } from '@/lib/session-attendance'

export function AdminSessionAttendance({ sessionId }: { sessionId: string }) {
  const [rows,setRows] = useState<ReturnType<typeof summarizeAttendance> | null>(null)
  const [open,setOpen] = useState(false)
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  async function load() {
    setOpen(true);setLoading(true);setError('')
    try {
      const res=await fetch(`/api/admin/users/attendance?session=${encodeURIComponent(sessionId)}`,{cache:'no-store'})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error)
      setRows(data.attendance)
    } catch(err){setError(err instanceof Error?err.message:'Attendance unavailable.')} finally{setLoading(false)}
  }
  return <div className="min-w-56 text-sm"><button className="font-semibold text-primary underline" onClick={()=>open?setOpen(false):void load()}>{open?'Hide attendance':'Student / tutor time'}</button>{open && <div className="mt-3 space-y-3">{loading && <p role="status">Loading…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && rows?.map(row=><div key={row.role} className="rounded-lg border border-border p-3"><p className="font-bold capitalize">{row.role}: {!row.tracked?'Not tracked':`${Math.floor(row.seconds/60)}m ${row.seconds%60}s${row.incomplete?' (partial)':''}`}</p>{row.tracked && <><p className="text-xs text-muted-foreground">{row.connections} connections · closed intervals only</p>{row.incomplete && <p className="text-xs">Join/leave evidence incomplete or participant still connected.</p>}<details><summary className="mt-2 cursor-pointer">Join / leave timeline</summary>{row.intervals.map((interval,index)=><p className="mt-2 text-xs" key={index}>Joined: {new Date(interval.joined).toLocaleString()}<br/>Left: {interval.left?new Date(interval.left).toLocaleString():'Not recorded'}{interval.endSource==='room_finished'?' (room closed)':''}</p>)}</details></>}</div>)}<button disabled={loading} onClick={()=>void load()} className="text-primary underline">Refresh attendance</button><p className="text-xs text-muted-foreground">Connection time comes from LiveKit events. It does not measure attention or speaking time.</p></div>}</div>
}

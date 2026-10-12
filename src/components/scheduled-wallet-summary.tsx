'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { classFetch, money } from '@/components/scheduled-classes'
type Summary={reserved:number;pending:number;held:number;released:number;refunded:number}
export default function ScheduledWalletSummary({role}:{role:'student'|'tutor'}){
  const [summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false
    const load=async()=>{try{const data=await classFetch('/api/scheduled-classes/wallet');if(!cancelled){setSummary(data);setError('')}}catch{if(!cancelled)setError('Group class balances unavailable. Please refresh after setup.')}}
    void load();const timer=setInterval(()=>{void load()},30000)
    return()=>{cancelled=true;clearInterval(timer)}
  },[])
  return <section className="rounded-xl border border-border bg-surface p-5"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-bold">Scheduled group classes</h2><Link href={`/${role}/scheduled-classes`} className="text-sm font-bold text-primary">View classes</Link></div>{error?<p className="mt-3 text-sm text-red-600">{error}</p>:summary?<div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[
    ['Reserved seats',summary.reserved],['Pending settlement',summary.pending],['Held for review',summary.held],[role==='tutor'?'Group class earnings':'Class fees paid',summary.released],
  ].map(([label,amount])=><div key={String(label)}><p className="text-xs text-text-muted">{label}</p><p className="mt-1 text-lg font-bold">{money(Number(amount))}</p></div>)}</div>:<p className="mt-3 text-sm text-text-muted">Loading class balances…</p>}<p className="mt-3 text-xs text-text-muted">{role==='student'?'Reserved, pending and held fees have already been deducted from your available wallet balance.':'Reserved, pending and held seat fees are credited only after class settlement.'}</p></section>
}

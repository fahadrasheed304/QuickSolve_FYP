'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Clock3, Video } from 'lucide-react'
import { classTime, money } from '@/components/scheduled-classes'
import type { ScheduledClass } from '@/lib/scheduled-classes'

type ActiveClass = ScheduledClass

export default function ActiveScheduledClasses({ role }: { role: 'student' | 'tutor' }) {
  const [classes, setClasses] = useState<ActiveClass[]>([])
  const [now, setNow] = useState(Date.now())

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/scheduled-classes/active', { cache: 'no-store' })
      if (!response.ok) return
      const result = await response.json()
      setClasses(result.classes || [])
      setNow(result.serverNow || Date.now())
    } catch {
      // Keep the last active-class state if a brief network request fails.
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 10000)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!classes.length) return null

  return <section aria-label="Scheduled classes happening now" className="mb-8 rounded-2xl border border-primary/20 bg-surface p-5 shadow-sm md:p-6">
    <div className="mb-4 flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarClock size={21}/></span>
      <div><h2 className="font-black text-text-main">Your scheduled class is starting</h2><p className="text-sm text-text-muted">Join from here when its scheduled start time arrives.</p></div>
    </div>
    <div className="grid gap-3">
      {classes.map(item => {
        const start = Date.parse(item.starts_at)
        const noShow = !item.tutor_joined_at && now >= start + 10 * 60000
        const studentCanJoin = role === 'student' && item.my_booking?.status === 'booked' && item.my_booking.payment_status === 'reserved'
        const canJoin = now >= start && now < Date.parse(item.ends_at) && !noShow
          && (role === 'tutor' || studentCanJoin)
        return <article key={item.id} className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{item.subject}</span>
              <span className="rounded-full bg-surface-container-low px-2.5 py-1 text-text-muted">Class {item.class_level}</span>
              <span className="inline-flex items-center gap-1 text-text-muted"><Clock3 size={13}/>{item.duration_min} min</span>
            </div>
            <h3 className="mt-2 truncate text-lg font-black text-text-main">{item.topic}</h3>
            <p className="mt-1 text-sm text-text-muted">{role === 'student' ? `With ${item.tutor_name}` : `Starts ${classTime(item.starts_at)}`}</p>
            {role === 'student' && item.my_booking && <p className="mt-1 text-xs text-text-muted">Your seat · {money(item.my_booking.amount)}</p>}
            {noShow && <p className="mt-1 text-sm font-semibold text-amber-700">Tutor has not joined yet. Open class details to report if needed.</p>}
          </div>
          <Link href={`/${role}/scheduled-classes/${item.id}`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition hover:opacity-90">
            <Video size={17}/>{canJoin ? 'Join class' : noShow ? 'Open class' : 'Class details'}
          </Link>
        </article>
      })}
    </div>
  </section>
}

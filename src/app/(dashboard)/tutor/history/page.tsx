import Link from 'next/link'
import { ArrowUpRight, History, Wallet } from 'lucide-react'
import { SessionPayments } from '@/components/session-payments'

export default function TutorHistoryPage() {
  return <main className="space-y-6 p-4 pb-20 md:p-8">
    <header className="relative overflow-hidden rounded-lg bg-hero-gradient p-6 text-white md:p-8">
      <History aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-56 w-56 text-white/5" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase"><History className="h-4 w-4" />Your teaching journey</span><h1 className="mt-4 text-3xl font-black md:text-4xl">Teaching history</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80">Revisit your sessions, see what students shared and keep track of every payment.</p></div>
        <Link href="/tutor/wallet" className="inline-flex w-fit items-center gap-3 rounded-lg border border-white/25 bg-white/10 px-5 py-4 text-sm font-bold transition hover:bg-white/20"><Wallet className="h-5 w-5" />View wallet & earnings<ArrowUpRight className="h-4 w-4" /></Link>
      </div>
    </header>
    <SessionPayments />
  </main>
}

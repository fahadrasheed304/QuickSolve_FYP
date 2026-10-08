'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { LayoutDashboard, Users, ShieldCheck, ClipboardCheck, CreditCard, LogOut, Video } from 'lucide-react'

export const adminPages = [
  { href: '/admin/dashboard', label: 'Overview', title: 'Admin dashboard', description: 'Your central workspace for people, tutor approvals and session payments.', icon: LayoutDashboard },
  { href: '/admin/demos', label: 'Teaching demos', title: 'Teaching demo reviews', description: 'Pending teaching demonstrations.', icon: Video },
  { href: '/admin/users', label: 'Registered users', title: 'All registered users', description: 'Explore student and tutor profiles, session history and feedback.', icon: Users },
  { href: '/admin/verifications', label: 'Verifications', title: 'Tutor verification desk', description: 'Review applications, qualifications and assessments in one place.', icon: ShieldCheck },
  { href: '/admin/conduct', label: 'Tutor conduct', title: 'Tutor conduct review', description: 'Review flagged tutors and manage booking restrictions.', icon: ClipboardCheck },
  { href: '/admin/payments', label: 'Payments & disputes', title: 'Session payments & disputes', description: 'Review held payments, resolve disputes and track payment outcomes.', icon: CreditCard },
]

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const current = adminPages.find(page => pathname.startsWith(page.href)) || adminPages[0]
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  async function logout() {
    setSigningOut(true); setError('')
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error()
      window.location.assign('/admin/signin')
    } catch { setError('Sign out failed. Please try again.'); setSigningOut(false) }
  }
  return <div className="min-h-screen bg-background text-text-main">
    <div className="border-b border-border bg-surface/95"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
      <Link href="/admin/dashboard" className="flex items-center gap-3 font-black"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-xl text-white">Q</span><span className="text-xl">QuickSolve<span className="ml-3 hidden border-l border-border pl-3 text-xs font-semibold uppercase tracking-wider text-text-muted sm:inline">Admin workspace</span></span></Link>
      <button onClick={logout} disabled={signingOut} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold hover:bg-primary/5 disabled:opacity-50"><LogOut size={16} />{signingOut ? 'Signing out…' : 'Sign out'}</button>
    </div></div>
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      {error && <p role="alert" className="mb-4 text-red-600">{error}</p>}
      <header className="surface-grid mb-5 overflow-hidden rounded-2xl bg-hero-gradient p-6 text-white shadow-xl shadow-primary/10 sm:p-8">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider"><ShieldCheck size={15} />Administration</span>
        <h1 className="text-3xl font-black sm:text-4xl">{current.title}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">{current.description}</p>
      </header>
      <nav aria-label="Admin navigation" className="mb-6 flex gap-2 overflow-x-auto rounded-xl border border-border bg-surface p-2 shadow-sm">{adminPages.map(page => <Link key={page.href} href={page.href} aria-current={current.href === page.href ? 'page' : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition ${current.href === page.href ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:bg-primary/5 hover:text-primary'}`}><page.icon size={17} />{page.label}</Link>)}</nav>
      {children}
    </div>
  </div>
}

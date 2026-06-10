"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Menu,
  MessageSquareText,
  PenTool,
  Sparkles,
  Star,
  UserCheck,
  Video,
  X,
  Zap,
} from 'lucide-react'

const navItems = [
  { label: 'How it works', href: '#how' },
  { label: 'Live workflow', href: '#workflow' },
  { label: 'Students & tutors', href: '#roles' },
]

const stats = [
  { label: 'Sessions solved', value: '150k+' },
  { label: 'Verified tutors', value: '5,000+' },
  { label: 'Avg. response', value: '3 min' },
  { label: 'Student rating', value: '4.9' },
]

const steps = [
  {
    icon: PenTool,
    title: 'Post the exact problem',
    text: 'Upload a photo, choose the subject, and set the session time without leaving the page.',
  },
  {
    icon: UserCheck,
    title: 'Pick a verified tutor',
    text: 'Compare bids, ratings, response speed, and subject fit before you start.',
  },
  {
    icon: Video,
    title: 'Solve live together',
    text: 'Use whiteboard, chat, video, and wallet flow in one focused learning room.',
  },
]

const workflow = [
  { label: 'Question posted', value: 'Algebra II', tone: 'bg-primary-subtle text-primary' },
  { label: 'Best bid', value: 'Rs. 400', tone: 'bg-secondary-subtle text-secondary-dark' },
  { label: 'Tutor match', value: '4.9 rating', tone: 'bg-accent-subtle text-accent' },
]

const studentFeatures = ['Photo-based problem upload', 'Live bids with clear pricing', 'Session history and wallet tracking']
const tutorFeatures = ['Verification and profile progress', 'Fast bid workflow', 'Dashboard for earnings and sessions']

export default function Home() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const closeMenu = () => setIsMobileMenuOpen(false)

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-text-main">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-surface/86 backdrop-blur-2xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="QuickSolve home">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-premium-gradient text-lg font-black text-white shadow-lg shadow-primary/20">Q</span>
            <span className="text-2xl font-black text-gradient-primary">QuickSolve</span>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-bold text-text-muted md:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="transition-colors hover:text-text-main">
                {item.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link href="/signin-page" className="rounded-lg px-4 py-2 text-sm font-bold text-text-muted transition-all hover:bg-surface-hover hover:text-text-main">
              Log in
            </Link>
            <Link href="/signup-page" className="inline-flex h-11 items-center gap-2 rounded-lg bg-premium-gradient px-5 text-sm font-black text-white shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            className="rounded-lg p-2 text-text-muted transition hover:bg-surface-hover md:hidden"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label="Toggle menu"
            type="button"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </nav>

        {isMobileMenuOpen && (
          <div className="border-t border-border bg-surface px-4 py-4 shadow-xl md:hidden">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <a key={item.href} onClick={closeMenu} href={item.href} className="rounded-lg px-3 py-2 font-semibold text-text-muted hover:bg-surface-hover">
                  {item.label}
                </a>
              ))}
              <Link onClick={closeMenu} href="/signin-page" className="rounded-lg px-3 py-2 font-semibold text-text-muted hover:bg-surface-hover">Log in</Link>
              <Link onClick={closeMenu} href="/signup-page" className="rounded-lg bg-premium-gradient px-3 py-2 text-center font-bold text-white">Get started</Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden px-4 text-white sm:px-6">
          <div className="absolute inset-0 -z-20 bg-hero-gradient surface-grid" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_28%_16%,rgba(255,122,89,0.22),transparent_28%),linear-gradient(90deg,rgba(16,29,50,0.94)_0%,rgba(16,29,50,0.66)_52%,rgba(16,29,50,0.34)_100%)]" />

          <div className="pointer-events-none absolute inset-0 hidden xl:block">
            <div className="qs-drift absolute right-[7%] top-[13%] w-[420px] rounded-lg border border-white/18 bg-white/12 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-white/48">Live problem room</p>
                  <h3 className="mt-1 text-2xl font-black">Quadratic equations</h3>
                </div>
                <span className="rounded-full bg-success px-3 py-1 text-xs font-black text-white">Online</span>
              </div>
              <div className="rounded-lg bg-white p-4 text-text-main">
                <div className="mb-3 flex items-center gap-2 text-sm font-black text-primary">
                  <PenTool className="h-4 w-4" />
                  Whiteboard
                </div>
                <div className="space-y-3">
                  <div className="h-3 w-3/4 rounded-full bg-surface-container-high" />
                  <div className="h-3 w-2/3 rounded-full bg-primary/30" />
                  <div className="rounded-lg border border-border bg-surface-hover p-4 font-mono text-sm">
                    x = (-b +/- sqrt(b^2 - 4ac)) / 2a
                  </div>
                </div>
              </div>
            </div>

            <div className="qs-drift-slow absolute bottom-[18%] right-[8%] w-64 rounded-lg border border-white/18 bg-white/14 p-4 shadow-2xl backdrop-blur-xl">
              <p className="text-xs font-black uppercase text-white/50">Winning bid</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-4xl font-black">Rs. 400</p>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">30 min</span>
              </div>
            </div>

            <div className="qs-drift-alt absolute right-[12%] top-[63%] w-72 rounded-lg border border-white/18 bg-white/14 p-4 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white font-black text-primary">A</span>
                <div>
                  <p className="font-black">Ayesha M.</p>
                  <p className="flex items-center gap-1 text-sm font-bold text-amber-200">
                    <Star className="h-4 w-4 fill-current" />
                    4.9 expert tutor
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto flex min-h-[calc(92svh-4rem)] max-w-7xl items-center py-16 sm:py-20">
            <div className="max-w-3xl qs-page-enter xl:max-w-[650px]">
              <div className="qs-kicker rounded-full px-4 py-2">
                <Sparkles className="h-4 w-4" />
                On-demand tutoring marketplace
              </div>
              <h1 className="mt-7 text-5xl font-black leading-[1.02] sm:text-6xl lg:text-7xl">
                QuickSolve
              </h1>
              <p className="mt-5 max-w-2xl text-2xl font-bold leading-tight text-white/92 sm:text-3xl">
                Live problem solving with verified tutors, instant bids, and a focused whiteboard room.
              </p>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
                Post a question, compare tutor offers, and start a session while the problem is still fresh.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup-page?role=student" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 font-black text-primary shadow-xl transition-all hover:-translate-y-0.5 hover:bg-surface-hover">
                  I am a Student
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/signup-page?role=tutor" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/28 bg-white/10 px-6 font-black text-white backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/20">
                  Become a Tutor
                  <GraduationCap className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map((item) => (
                  <div key={item.label} className="rounded-lg border border-white/14 bg-white/10 p-3 backdrop-blur-md">
                    <p className="text-2xl font-black">{item.value}</p>
                    <p className="mt-1 text-xs font-bold uppercase text-white/58">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10">
              <div>
                <div className="qs-kicker rounded-full px-3 py-1.5">How it works</div>
                <h2 className="mt-4 max-w-2xl text-4xl font-black text-text-main">A calm workflow for urgent questions.</h2>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon

                return (
                  <article key={step.title} className="qs-card hover-lift rounded-lg p-6">
                    <div className="mb-6 flex items-center justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="text-sm font-black text-text-muted">0{index + 1}</span>
                    </div>
                    <h3 className="text-xl font-black text-text-main">{step.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-text-muted">{step.text}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-24 px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <div className="qs-kicker rounded-full px-3 py-1.5">Live workflow</div>
              <h2 className="mt-4 text-4xl font-black text-text-main">Designed around the real tutoring moment.</h2>
              <p className="mt-4 max-w-xl leading-7 text-text-muted">
                The main experience feels like a control room: problem context, tutor bids, session tools, and progress signals stay visible without clutter.
              </p>
            </div>

            <div className="qs-panel overflow-hidden rounded-lg p-4">
              <div className="grid gap-3 md:grid-cols-3">
                {workflow.map((item) => (
                  <div key={item.label} className="rounded-lg border border-border bg-surface p-4">
                    <p className="text-xs font-black uppercase text-text-muted">{item.label}</p>
                    <p className={`mt-3 inline-flex rounded-lg px-3 py-2 text-lg font-black ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="rounded-lg border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-black text-primary">
                    <MessageSquareText className="h-4 w-4" />
                    Session board
                  </div>
                  <div className="space-y-3">
                    <div className="h-3 w-4/5 rounded-full bg-surface-container-high" />
                    <div className="h-3 w-3/5 rounded-full bg-secondary/25" />
                    <div className="rounded-lg border border-border bg-surface-hover p-4 font-mono text-sm text-text-main">
                      Factor first, then apply the formula only when needed.
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="h-16 rounded-lg bg-primary-subtle" />
                      <div className="h-16 rounded-lg bg-secondary-subtle" />
                      <div className="h-16 rounded-lg bg-accent-subtle" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg bg-royal-gradient p-5 text-white shadow-xl">
                    <p className="text-xs font-black uppercase text-white/55">Tutor status</p>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white font-black text-primary">A</span>
                      <div>
                        <p className="font-black">Ayesha M.</p>
                        <p className="text-sm font-bold text-white/68">Online now</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-success/20 bg-success-subtle p-5">
                    <p className="text-xs font-black uppercase text-success">Session ready</p>
                    <p className="mt-2 text-2xl font-black text-text-main">3 min avg.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="roles" className="scroll-mt-24 px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-2">
            <article className="qs-card hover-lift rounded-lg p-8">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <BookOpenCheck className="h-6 w-6" />
              </div>
              <h2 className="text-3xl font-black text-text-main">For Students</h2>
              <p className="mt-3 leading-7 text-text-muted">Get a tutor on the exact problem instead of searching through generic explanations.</p>
              <ul className="mt-7 space-y-3 text-sm font-semibold text-text-main">
                {studentFeatures.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/signup-page?role=student" className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-premium-gradient px-5 font-bold text-white shadow-lg shadow-primary/20">
                Find a tutor
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>

            <article className="qs-card hover-lift rounded-lg p-8">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-subtle text-secondary">
                <Zap className="h-6 w-6" />
              </div>
              <h2 className="text-3xl font-black text-text-main">For Tutors</h2>
              <p className="mt-3 leading-7 text-text-muted">Turn subject expertise into paid live sessions with a polished tutor workflow.</p>
              <ul className="mt-7 space-y-3 text-sm font-semibold text-text-main">
                {tutorFeatures.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/signup-page?role=tutor" className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-premium-gradient px-5 font-bold text-white shadow-lg shadow-primary/20">
                Apply to teach
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          </div>
        </section>

        <section className="px-4 pb-20 pt-8 sm:px-6">
          <div className="qs-landing-cta mx-auto max-w-7xl rounded-lg p-8 text-white shadow-2xl md:p-12">
            <div className="relative z-10 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-black uppercase">
                  <Clock3 className="h-4 w-4" />
                  Built for urgent learning moments
                </div>
                <h2 className="max-w-3xl text-4xl font-black">Solve the next problem while the motivation is still alive.</h2>
              </div>
              <Link href="/signup-page" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-6 font-black text-primary shadow-xl transition-all hover:-translate-y-0.5">
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-black text-gradient-primary">QuickSolve</p>
            <p className="mt-2 text-sm text-text-muted">On-demand academic help with verified tutors.</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-text-muted">
            <Link href="/signup-page?role=student" className="hover:text-text-main">Students</Link>
            <Link href="/signup-page?role=tutor" className="hover:text-text-main">Tutors</Link>
            <Link href="/privacy" className="hover:text-text-main">Privacy</Link>
            <Link href="/terms" className="hover:text-text-main">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

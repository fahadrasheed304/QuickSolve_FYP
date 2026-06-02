import Link from 'next/link'
import { ArrowRight, BookOpenCheck, Clock3, Star, Wallet } from 'lucide-react'

const metrics = [
  { label: 'Completed', value: '12', icon: BookOpenCheck },
  { label: 'Hours', value: '24', icon: Clock3 },
  { label: 'Wallet', value: 'Rs. 2k', icon: Wallet },
  { label: 'Rating', value: '4.9', icon: Star },
]

export default function StudentDashboardOverviewPage() {
  return (
    <main className="min-h-screen bg-background p-4 md:p-8 qs-page-enter">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="qs-kicker rounded-full px-3 py-1.5">Preview</div>
            <h1 className="mt-4 text-4xl font-black text-text-main">Student Dashboard Overview</h1>
            <p className="mt-1 text-text-muted">A polished snapshot of the student workspace.</p>
          </div>
          <Link href="/student/dashboard" className="inline-flex h-11 items-center gap-2 rounded-lg bg-premium-gradient px-5 font-bold text-white shadow-lg shadow-primary/20">
            Open live dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <section className="mb-6 rounded-lg bg-hero-gradient surface-grid p-8 text-white shadow-2xl">
          <p className="text-sm font-bold uppercase text-white/60">Next milestone</p>
          <h2 className="mt-3 text-4xl font-black">Good morning, Alex</h2>
          <p className="mt-2 text-white/75">You have a problem-solving session ready to start.</p>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <div key={metric.label} className="qs-card rounded-lg p-5">
                <Icon className="mb-4 h-7 w-7 text-primary" />
                <p className="text-xs font-black uppercase text-text-muted">{metric.label}</p>
                <h3 className="mt-1 text-3xl font-black text-text-main">{metric.value}</h3>
              </div>
            )
          })}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.75fr]">
          <div className="qs-card rounded-lg p-6">
            <h3 className="text-xl font-black text-text-main">Recommended Tutors</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {['Alan Miller', 'Sarah Chen', 'Prof. Marcus'].map((name) => (
                <div key={name} className="rounded-lg border border-border bg-surface-hover p-4">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-premium-gradient font-black text-white">{name.charAt(0)}</div>
                  <p className="font-black text-text-main">{name}</p>
                  <p className="text-xs font-semibold text-text-muted">Math and Science</p>
                </div>
              ))}
            </div>
          </div>
          <div className="qs-card rounded-lg p-6">
            <h3 className="text-xl font-black text-text-main">Recent Activity</h3>
            <div className="mt-5 space-y-3">
              {['Mathematics session completed', 'Wallet topped up', 'Tutor review submitted'].map((item) => (
                <div key={item} className="rounded-lg bg-surface-hover p-3 text-sm font-bold text-text-main">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
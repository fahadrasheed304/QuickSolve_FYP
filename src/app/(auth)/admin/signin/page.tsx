"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Mail, LockKeyhole, Loader2 } from 'lucide-react'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { AuthSidebar } from '@/components/layout/AuthSidebar'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

export default function AdminSigninPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (res.ok) {
        notifySuccess('Admin access verified. Opening the dashboard.')
        window.location.href = data.redirectTo || '/admin/verifications'
        return
      }

      const message = getApiMessage(data, 'Admin sign in failed. Please check your credentials and try again.')
      setError(message)
      notifyError(message)
    } catch {
      const message = 'We could not reach the admin sign in service. Please check your connection and try again.'
      setError(message)
      notifyError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full bg-background text-text-main overflow-x-hidden">
      <AuthSidebar
        title={<>QuickSolve<br />admin control</>}
        features={[
          {
            icon: 'admin_panel_settings',
            title: 'Verification Review',
            description: 'Manage tutor applications, documents, and test invitation stages from one secure workspace.',
            iconColorClass: 'text-primary',
            iconBgClass: 'bg-primary-subtle',
          },
        ]}
      />

      <section className="w-full lg:w-[55%] bg-surface flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[480px]">
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary lg:mx-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-[32px] font-extrabold tracking-tight text-text-main mb-2">Admin Sign In</h1>
            <p className="text-text-muted font-medium">Restricted access for authorized administrators.</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="admin-email">
                Admin Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  id="admin-email"
                  type="email"
                  required
                  name="quicksolve-admin-email"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full h-12 rounded-lg border border-border bg-surface-hover px-4 pl-11 text-sm text-text-main outline-none transition-all focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
                  placeholder="Enter admin email"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-text-muted" htmlFor="admin-password">
                Password
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <PasswordInput
                  id="admin-password"
                  required
                  name="quicksolve-admin-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full h-12 rounded-lg border border-border bg-surface-hover px-4 pl-11 text-sm text-text-main outline-none transition-all focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20"
                  placeholder="Enter password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-bold tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark disabled:opacity-70"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'SIGNING IN...' : 'SIGN IN AS ADMIN'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <Link href="/signin-page" className="text-sm font-bold text-primary hover:underline">
              Back to student or tutor sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

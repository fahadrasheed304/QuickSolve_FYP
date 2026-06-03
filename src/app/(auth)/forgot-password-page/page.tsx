"use client"

"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { AuthSidebar } from '@/components/layout/AuthSidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (res.ok) {
        setMessage(data.message)
        notifySuccess(data.message, 'If an account exists, reset instructions have been sent.')
      } else {
        const message = getApiMessage(data, 'We could not send reset instructions. Please try again shortly.')
        setError(message)
        notifyError(message)
      }
    } catch {
      const message = 'We could not reach the password reset service. Please check your connection and try again.'
      setError(message)
      notifyError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full bg-background text-text-main overflow-x-hidden">
      <AuthSidebar
        title={<>Reset access<br />without friction.</>}
        description="We will send a secure reset link to your email so you can get back to solving problems."
        features={[
          {
            icon: 'lock_reset',
            title: 'Secure reset',
            description: 'Password changes are token based and expire automatically.'
          }
        ]}
      />

      <section className="w-full lg:w-[55%] bg-surface/92 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[480px] qs-page-enter">
          <Link href="/signin-page" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              <MailCheck className="h-6 w-6" />
            </div>
            <h1 className="text-4xl font-black text-text-main">Forgot password?</h1>
            <p className="mt-2 text-text-muted">Enter your account email and we will send reset instructions.</p>
          </div>

          {message && (
            <div className="mb-6 rounded-lg border border-green-200 bg-success-subtle p-4 text-sm font-semibold text-success">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-600">
              {error}
            </div>
          )}

          {!message ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-black uppercase text-text-muted" htmlFor="email">
                  Email address
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button disabled={loading} type="submit" className="h-12 w-full">
                {loading ? 'Sending link...' : 'Send reset link'}
              </Button>
            </form>
          ) : (
            <Link href="/signin-page" className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-border bg-surface font-bold text-text-main shadow-sm hover:bg-surface-hover">
              Return to login
            </Link>
          )}
        </div>
      </section>
    </main>
  )
}

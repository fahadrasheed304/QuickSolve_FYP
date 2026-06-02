import React, { useState } from 'react'
import Link from 'next/link'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

export default function TutorForgotPasswordPage() {
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
        notifySuccess(data.message, 'If a tutor account exists, reset instructions have been sent.')
      } else {
        const message = getApiMessage(data, 'We could not send reset instructions. Please try again shortly.')
        setError(message)
        notifyError(message)
      }
    } catch (err) {
      const message = 'We could not reach the password reset service. Please check your connection and try again.'
      setError(message)
      notifyError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full bg-surface text-on-surface overflow-x-hidden">
      <section className="hidden lg:flex w-[45%] bg-royal-gradient relative flex-col justify-between p-12 overflow-hidden">
        <div className="z-10">
          <Link href="/" className="text-2xl font-black tracking-tighter text-white">QuickSolve</Link>
        </div>
        <div className="z-10 max-w-lg mt-12 mb-auto">
          <h1 className="text-white text-5xl font-black leading-[1.1] tracking-tight mb-8">
            Get back to<br />teaching quickly
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed">
            Enter the email associated with your tutor account and we'll send you a secure link to reset your password.
          </p>
        </div>
        <div className="z-20 relative mt-auto">
          <p className="text-blue-200 text-xs font-medium">© 2026 QuickSolve Inc. All rights reserved.</p>
        </div>
      </section>

      <section className="w-full lg:w-[55%] bg-surface-container-lowest flex items-center justify-center p-6 sm:p-12">
                <div className="w-full max-w-[480px]">
          <header className="mb-8 text-center lg:text-left">
            <h2 className="text-[32px] font-extrabold tracking-tight text-on-surface mb-2">Forgot Password</h2>
            <p className="text-on-surface-variant font-medium">No worries, we'll send you reset instructions.</p>
          </header>

          {message && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm font-medium flex items-start gap-3">
              <span className="material-symbols-outlined text-green-600">check_circle</span>
              <span>{message}<br /><span className="text-xs mt-1 block">Check your inbox.</span></span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm font-medium">
              {error}
            </div>
          )}

          {!message ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-2" htmlFor="email">Email Address</label>
                <input
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-4 bg-surface-container-low border border-outline-variant/60 focus:border-[#006c4a] focus:bg-surface focus:ring-1 focus:ring-[#006c4a]/20 transition-all duration-200 outline-none text-on-surface rounded-lg text-sm"
                  id="email"
                  placeholder="name@example.com"
                  type="email"
                />
              </div>

              <button
                disabled={loading}
                className="w-full h-11 bg-[#006c4a] hover:bg-green-800 disabled:opacity-70 text-white font-bold rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-[0.98] mt-2 tracking-widest text-[13px]"
                type="submit"
              >
                {loading ? "SENDING LINK..." : "RESET PASSWORD"}
              </button>
            </form>
          ) : (
            <div className="text-center pt-4">
              <Link href="/tutor/signin" className="w-full inline-flex justify-center items-center h-11 border border-outline-variant hover:bg-surface-container-low text-on-surface font-bold rounded-lg transition-all">
                Return to Login
              </Link>
            </div>
          )}

          {!message && (
            <div className="text-center mt-8">
              <Link href="/tutor/signin" className="text-sm text-on-surface-variant font-medium hover:text-[#006c4a] transition-colors flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to login
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
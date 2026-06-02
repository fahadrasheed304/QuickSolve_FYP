
import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      const message = "This reset link is missing or invalid. Please request a new password reset link."
      setError(message)
      notifyError(message)
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (password !== confirmPassword) {
      const message = "Passwords do not match. Please re-enter both passwords."
      setError(message)
      notifyError(message)
      return
    }

    if (password.length < 8) {
      const message = "Password must be at least 8 characters."
      setError(message)
      notifyError(message)
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage(data.message)
        notifySuccess(data.message, "Password reset successfully. Redirecting to login.")
        setTimeout(() => {
          router.push('/signin-page')
        }, 3000)
      } else {
        const message = getApiMessage(data, "We could not reset your password. Please request a fresh reset link and try again.")
        setError(message)
        notifyError(message)
      }
    } catch (err) {
      const message = "We could not reach the password reset service. Please check your connection and try again."
      setError(message)
      notifyError(message)
    } finally {
      setLoading(false)
    }
  }

  // Password strength logic (basic)
  const strength = password.length > 7 ? (/[A-Z]/.test(password) ? (/[0-9]/.test(password) ? 3 : 2) : 1) : 0

  return (
    <main className="flex min-h-screen w-full bg-surface text-on-surface overflow-x-hidden">
      <section className="hidden lg:flex w-[45%] bg-royal-gradient relative flex-col justify-between p-12 overflow-hidden">
        <div className="z-10">
          <Link href="/" className="text-2xl font-black tracking-tighter text-white">QuickSolve</Link>
        </div>
        <div className="z-10 max-w-lg mt-12 mb-auto">
          <h1 className="text-white text-5xl font-black leading-[1.1] tracking-tight mb-8">
            Create a secure<br />new password
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed">
              Ensure your account stays safe by using a strong password with a mix of letters, numbers, and symbols.
          </p>
        </div>
        <div className="z-20 relative mt-auto">
          <p className="text-blue-200 text-xs font-medium">© 2026 QuickSolve Inc. All rights reserved.</p>
        </div>
      </section>

      <section className="w-full lg:w-[55%] bg-surface-container-lowest flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[480px]">
          <header className="mb-8 text-center lg:text-left">
            <h2 className="text-[32px] font-extrabold tracking-tight text-on-surface mb-2">Reset Password</h2>
            <p className="text-on-surface-variant font-medium">Please enter your new password below.</p>
          </header>

          {message && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-md text-sm font-medium flex items-start gap-3">
              <span className="material-symbols-outlined text-green-600">check_circle</span>
              <span>{message}<br/><span className="text-xs mt-1 block">Redirecting to login...</span></span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm font-medium">
              {error}
            </div>
          )}

          {!message && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-2" htmlFor="password">New Password</label>
                <PasswordInput
                  required
                  disabled={!token}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 bg-surface-container-low border border-outline-variant/60 focus:border-primary focus:bg-surface focus:ring-1 focus:ring-primary/20 transition-all duration-200 outline-none text-on-surface rounded-lg tracking-widest placeholder:tracking-normal placeholder:text-sm" 
                  id="password" 
                  placeholder="Enter new password"
                />
                {password.length > 0 && (
                  <div className="h-1 w-full bg-surface-container-high rounded-full overflow-hidden mt-2">
                    <div className={`h-full transition-all duration-300 ${strength === 0 ? 'w-0' : strength === 1 ? 'w-1/3 bg-red-400' : strength === 2 ? 'w-2/3 bg-amber-400' : 'w-full bg-primary'}`}></div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-2" htmlFor="confirmPassword">Confirm Password</label>
                <PasswordInput
                  required
                  disabled={!token}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 px-4 bg-surface-container-low border border-outline-variant/60 focus:border-primary focus:bg-surface focus:ring-1 focus:ring-primary/20 transition-all duration-200 outline-none text-on-surface rounded-lg tracking-widest placeholder:tracking-normal placeholder:text-sm" 
                  id="confirmPassword" 
                  placeholder="Confirm new password"
                />
              </div>

              <button 
                disabled={loading || !token || password !== confirmPassword || password.length < 8}
                className="w-full h-11 bg-[#0A52D1] hover:bg-primary-container disabled:opacity-70 text-white font-bold rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-[0.98] mt-2 tracking-widest text-[13px]" 
                type="submit"
              >
                {loading ? "RESETTING..." : "CONFIRM NEW PASSWORD"}
              </button>
            </form>
          )}

          <div className="text-center mt-8">
            <Link href="/signin-page" className="text-sm text-on-surface-variant font-medium hover:text-primary transition-colors flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to login
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-surface">Loading secure session...</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}

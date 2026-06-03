"use client"

import React, { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

function TutorVerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ""

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const showError = (message: string) => {
    setError(message)
    notifyError(message)
  }

  useEffect(() => {
    if (!email) {
      router.push('/tutor/signup')
    }
  }, [email, router])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pasted = value.slice(0, 6).split('')
      const newOtp = [...otp]
      pasted.forEach((char, i) => {
        newOtp[i] = char
      })
      setOtp(newOtp)
      const lastIndex = Math.min(pasted.length, 5)
      inputRefs.current[lastIndex]?.focus()
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')

    if (code.length !== 6) {
      showError("Please enter the 6-digit verification code from your email.")
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code })
      })

      const data = await res.json()

      if (res.ok) {
        notifySuccess(data.message, "Your email has been verified successfully.")
        // Check if admin email - redirect to admin panel
        if (data.isAdmin) {
          window.location.href = '/admin/verifications'
          return
        }
        window.location.href = '/tutor/complete-profile';
      } else {
        showError(getApiMessage(data, "That verification code is not valid. Please check the code and try again."))
      }
    } catch (err) {
      showError("We could not verify the code right now. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError('')
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (res.ok) {
        notifySuccess(data.message, "A new verification code has been sent to your email.")
      } else {
        showError(getApiMessage(data, "We could not resend the code. Please wait a moment and try again."))
      }
    } catch (err) {
      showError("We could not resend the code right now. Please check your connection and try again.")
    }
  }

  return (
    <main className="flex min-h-screen w-full bg-surface text-on-surface overflow-x-hidden">
      {/* Left Panel */}
      <section className="hidden lg:flex w-[45%] bg-royal-gradient relative flex-col justify-between p-12 overflow-hidden">
        <div className="z-10">
          <Link href="/" className="text-2xl font-black tracking-tighter text-white">QuickSolve</Link>
        </div>
        <div className="z-10 max-w-lg">
          <h1 className="text-white text-5xl font-black leading-tight tracking-tight mb-8">
            Secure your<br />tutor account.
          </h1>
          <p className="text-blue-100 text-lg leading-relaxed">
            We verify every tutor to ensure students connect with trusted, qualified experts only.
          </p>
        </div>
        <div className="z-20 relative">
          <p className="text-blue-200 text-xs font-medium">© 2026 QuickSolve Inc. All rights reserved.</p>
        </div>
        </section>

      {/* Right Panel: OTP Form */}
      <section className="w-full lg:w-[55%] bg-surface-container-lowest flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[480px]">
          <header className="mb-10 text-center lg:text-left">
            <div className="w-12 h-12 bg-[#006c4a]/10 text-[#006c4a] rounded-2xl flex items-center justify-center mb-6 lg:mx-0 mx-auto">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
            </div>
            <h2 className="text-[32px] font-extrabold tracking-tight text-on-surface mb-2">Check your email</h2>
            <p className="text-on-surface-variant font-medium">
              We sent a 6-digit verification code to <br />
              <span className="font-bold text-on-surface">{email}</span>
            </p>
          </header>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-8">
            <div className="flex justify-between gap-2 max-w-sm mx-auto lg:mx-0">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { inputRefs.current[index] = el }}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-12 h-14 text-center text-xl font-black bg-surface-container-low border border-outline-variant rounded-xl focus:border-[#006c4a] focus:ring-2 focus:ring-[#006c4a]/20 transition-all outline-none"
                />
              ))}
            </div>

            <button
              disabled={loading}
              className="w-full h-11 bg-[#006c4a] hover:bg-green-800 disabled:opacity-70 text-white font-bold rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-[0.98]"
              type="submit"
            >
              {loading ? "VERIFYING..." : "VERIFY EMAIL"}
            </button>
          </form>

          <div className="mt-8 text-center lg:text-left">
            <p className="text-sm text-on-surface-variant font-medium">
              Didn't receive the email? <button type="button" onClick={handleResend} className="text-[#006c4a] font-bold hover:underline ml-1">Resend code</button>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function TutorVerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-surface">Loading secure verification...</div>}>
      <TutorVerifyEmailForm />
    </Suspense>
  )
}

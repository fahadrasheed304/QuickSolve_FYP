"use client"

import React, { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthSidebar } from '@/components/layout/AuthSidebar'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

function VerifyEmailForm() {
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
      router.push('/signup-page')
    }
  }, [email, router])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const pasted = value.slice(0, 6).split('')
      const newOtp = [...otp]
      pasted.forEach((char, i) => {
        newOtp[i] = char
      })
      setOtp(newOtp)
      // Focus last filled input
      const lastIndex = Math.min(pasted.length, 5)
      inputRefs.current[lastIndex]?.focus()
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    // Move to next input if filled
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
      
      // Debug: Log the role received
      console.log('Verify OTP response:', data)
      console.log('Role received:', data.role, '| Type:', typeof data.role)
      
      if (res.ok) {
        notifySuccess(data.message, "Your email has been verified successfully.")
        // Check if admin email - redirect to admin panel first
        if (data.isAdmin) {
          window.location.href = '/admin/verifications'
          return
        }
        
        // Redirect based on role
        if (data.role === 'tutor') {
          console.log('Redirecting to /tutor/complete-profile')
          window.location.href = '/tutor/complete-profile'
        } else {
          console.log('Redirecting to /student/dashboard (role was:', data.role + ')')
          window.location.href = '/student/dashboard'
        }
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
      <AuthSidebar
        title={<>Secure your<br/>account easily.</>}
        description="We use multi-factor algorithms to ensure that only you have access to your educational progress and bidding wallet."
        alignCenter={true}
      />

      {/* Right Panel: OTP Form */}
      <section className="w-full lg:w-[55%] bg-surface-container-lowest flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[480px]">
          <header className="mb-10 text-center lg:text-left">
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 lg:mx-0 mx-auto">
              <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
            </div>
            <h2 className="text-[32px] font-extrabold tracking-tight text-on-surface mb-2">Check your email</h2>
            <p className="text-on-surface-variant font-medium">
              We sent a 6-digit verification code to <br/>
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
                  className="w-12 h-14 text-center text-xl font-black bg-surface-container-low border border-outline-variant rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              ))}
            </div>

            <button 
              disabled={loading}
              className="w-full h-11 bg-primary hover:bg-primary-container disabled:opacity-70 text-on-primary font-bold rounded-lg shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" 
              type="submit"
            >
              {loading ? "VERIFYING..." : "VERIFY EMAIL"}
            </button>
          </form>

          <div className="mt-8 text-center lg:text-left">
            <p className="text-sm text-on-surface-variant font-medium">
              Didn't receive the email? <button type="button" onClick={handleResend} className="text-primary font-bold hover:underline ml-1">Resend code</button>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-surface">Loading secure verification...</div>}>
      <VerifyEmailForm />
    </Suspense>
  )
}

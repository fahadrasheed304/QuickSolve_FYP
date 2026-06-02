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

      <section className="w-full lg:w-[55%] bg-surface-container-lowest flex items-center justify-center p-6 sm:p-12"></section>
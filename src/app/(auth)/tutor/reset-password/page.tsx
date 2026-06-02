import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

function TutorResetPasswordForm() {
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
          router.push('/tutor/signin')
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
            Ensure your tutor account stays safe by using a strong password with a mix of letters, numbers, and symbols.
          </p>
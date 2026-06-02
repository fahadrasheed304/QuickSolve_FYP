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
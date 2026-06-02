import React, { useState } from 'react'
import Link from 'next/link'
import { useGoogleLogin } from '@react-oauth/google'
import { AuthSidebar } from '@/components/layout/AuthSidebar'
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

export default function TutorSigninPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const showError = (message: string) => {
    setError(message)
    notifyError(message)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, requestedRole: 'tutor' }),
      })

      const data = await res.json()

      if (res.ok) {
        notifySuccess(data.message, "Signed in successfully.")
        // Check if admin email - redirect to admin panel
        if (data.isAdmin) {
          window.location.href = '/admin/verifications'
          return
        }
        
        // Check if tutor needs to complete profile first
        if (data.requiresProfileCompletion) {
          window.location.href = '/tutor/complete-profile'
          return
        }
        
        if (data.verificationStage === 'verified') {
          window.location.href = '/tutor/dashboard'
          return
        }

        // Check if profile is submitted but pending verification - go to waiting page
        // 'pending' = submitted, waiting admin | 'not_started' or null = not submitted yet
        if (data.verificationStage && data.verificationStage !== 'not_started' && data.verificationStage !== '') {
          window.location.href = '/tutor/waiting-verification'
          return
        }
        
        // Check if the user is actually a tutor
        const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
        const meData = await meRes.json()
        if (meData.user?.role === 'tutor') {
          window.location.href = '/tutor/complete-profile'
        } else {
          showError("This account is not a tutor account. Please use the student login.")
          // Log them out
          await fetch('/api/auth/logout', { method: 'POST' })
        }
      } else {
        showError(getApiMessage(data, "We could not sign you in. Please check your email and password."))
      }
    } catch (err) {
      showError("We could not reach the login service. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }
    const handleGoogleLogin = useGoogleLogin({
    scope: 'email profile openid',
    onSuccess: async (tokenResponse) => {
      setError('')
      setLoading(true)
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenResponse.access_token, role: 'tutor' })
        })
        const data = await res.json()
        if (res.ok) {
          // Check if admin email - redirect to admin panel
          if (data.isAdmin) {
            window.location.href = '/admin/verifications'
            return
          }
          
          // If new tutor, redirect to complete-profile
          if (data.isNewUser) {
            window.location.href = '/tutor/complete-profile'
            return
          }
          
          // If needs profile completion
          if (data.requiresProfileCompletion) {
            window.location.href = '/tutor/complete-profile'
            return
          }
          
          if (data.verificationStage === 'verified') {
            window.location.href = '/tutor/dashboard'
            return
          }

          // If profile submitted but pending verification - go to waiting page
          if (data.verificationStage && data.verificationStage !== 'not_started' && data.verificationStage !== '') {
            window.location.href = '/tutor/waiting-verification'
            return
          }
          
          // Otherwise keep the tutor in onboarding.
          window.location.href = '/tutor/complete-profile'
        } else {
          showError(getApiMessage(data, "Google sign in could not be completed. Please try again."))
          setLoading(false)
        }
      } catch (err) {
        showError("Google sign in is temporarily unavailable. Please try again or use email login.")
        setLoading(false)
      }
    },
    onError: () => {
      showError("Google sign in was cancelled or the connection failed.")
    }
  })

  return (
    <>
      <main className="flex min-h-screen w-full bg-surface text-on-surface overflow-x-hidden">
        {/* Left Panel */}
        <AuthSidebar 
          title={<>Welcome back,<br />expert tutor</>}
          features={[
            {
              icon: 'auto_graph',
              title: 'Grow Your Business',
              description: 'Access thousands of students looking for your expertise. Real-time bidding on problems.'
            }
          ]}
        />

        {/* Right Panel: Form */}
        <section className="w-full lg:w-[55%] bg-surface-container-lowest flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-[480px]">
            <header className="mb-8 text-center lg:text-left">
              <h2 className="text-[32px] font-extrabold tracking-tight text-on-surface mb-2">Tutor Sign In</h2>
              <p className="text-on-surface-variant font-medium">Welcome back! Enter your details below.</p>
            </header>
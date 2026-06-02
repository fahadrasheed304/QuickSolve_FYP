import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useGoogleLogin } from '@react-oauth/google'
import { AuthSidebar } from '@/components/layout/AuthSidebar'
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'
export default function TutorSignupPage() {
  const router = useRouter()

  const [fullname, setFullname] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+92')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const showError = (message: string) => {
    setError(message)
    notifyError(message)
  }

  const calculateStrength = () => {
    let score = 0
    if (password.length > 7) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9!@#$%^&*)(+=._-]/.test(password)) score++
    return score
  }
  const strength = calculateStrength()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!terms) {
      showError("Please agree to the Terms of Service before creating your tutor account.")
      return
    }
    if (strength < 2) {
      showError("Please choose a stronger password with at least 8 characters and a number or symbol.")
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullname, email, phone: `${countryCode}${phone}`, password, role: 'tutor',
        }),
      })

      const data = await res.json()

      if (res.ok) {
        notifySuccess(data.message, "We are sending your tutor verification code now.")
        router.push(`/tutor/verify-email?email=${encodeURIComponent(email)}`)
      } else {
        showError(getApiMessage(data, "We could not create your tutor account. Please review your details and try again."))
              }
    } catch (err) {
      showError("We could not reach the signup service. Please check your connection and try again.")
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
          
          // New tutors OR incomplete profile go to complete-profile
          if (data.isNewUser || data.requiresProfileCompletion) {
            window.location.href = '/tutor/complete-profile'
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
          showError(getApiMessage(data, "Google signup could not be completed. Please try again."))
          setLoading(false)
        }
      } catch (err) {
        showError("Google signup is temporarily unavailable. Please try again or use email signup.")
        setLoading(false)
      }
    },
    onError: () => {
      showError("Google signup was cancelled or the connection failed.")
    }
  })

  return (
      <main className="flex min-h-screen w-full bg-surface text-on-surface overflow-x-hidden">
        {/* Left Panel: Brand & Value Props */}
        <AuthSidebar
          title="Turn your expertise into earnings."
          features={[
            {
              icon: 'auto_graph',
              title: 'Flexible Schedule',
              description: 'Set your own hours and work from anywhere. You control your availability.',
            },
            {
              icon: 'payments',
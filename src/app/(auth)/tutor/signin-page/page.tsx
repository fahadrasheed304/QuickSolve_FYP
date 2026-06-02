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
                       {/* Google Login */}
            <GoogleLoginButton onClick={handleGoogleLogin} isLoading={loading} disabled={loading} />

            <AuthDivider label="OR" />

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-2" htmlFor="email">Email Address</label>
                <input
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-4 bg-surface-container-low border border-outline-variant/60 focus:border-[#006c4a] focus:bg-surface focus:ring-1 focus:ring-[#006c4a]/20 transition-all duration-200 outline-none text-on-surface rounded-lg text-sm"
                  id="email"
                  name="quicksolve-tutor-signin-email"
                  autoComplete="off"
                  placeholder="Enter email"
                  type="email"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant" htmlFor="password">Password</label>
                  <Link href="/tutor/forgot-password" className="text-xs font-bold text-[#006c4a] hover:underline">Forgot Password?</Link>
                </div>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 bg-surface-container-low border border-outline-variant/60 focus:border-[#006c4a] focus:bg-surface focus:ring-1 focus:ring-[#006c4a]/20 transition-all duration-200 outline-none text-on-surface rounded-lg text-lg tracking-widest placeholder:tracking-normal placeholder:text-sm"
                  toggleClassName="hover:bg-surface-container-high focus:ring-[#006c4a]/20"
                  id="password"
                  name="quicksolve-tutor-signin-password"
                  autoComplete="new-password"
                  placeholder="Enter password"
                />
              </div>

              <button
                disabled={loading}
                className="w-full h-11 bg-[#006c4a] hover:bg-green-800 disabled:opacity-70 text-white font-bold rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-[0.98] mt-2 tracking-widest text-[13px]"
                type="submit"
              >
                {loading ? "SIGNING IN..." : "SIGN IN"}
              </button>
            </form>

            <div className="text-center mt-8">
              <p className="text-sm text-on-surface-variant font-medium">
                Don't have a tutor account? <Link className="text-[#006c4a] font-bold hover:underline ml-1" href="/tutor/signup">Apply to Teach</Link>
              </p>
            </div>

            <div className="text-center mt-4">
              <Link href="/signin-page" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Student? Log in here
              </Link>
            </div>

            <div className="mt-5">
              <Link
                href="/admin/signin"
                className="flex h-11 w-full items-center justify-center rounded-lg border border-[#006c4a]/25 bg-green-50 text-sm font-bold text-[#006c4a] transition-colors hover:border-[#006c4a] hover:bg-green-100"
              >
                Sign in as Admin
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
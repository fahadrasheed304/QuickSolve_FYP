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
                            iconColorClass: 'text-secondary-container',
              iconBgClass: 'bg-secondary-container/20',
              title: 'Competitive Earnings',
              description: 'Earn top PKR rates per session with automated billing and instant payouts.',
            },
            {
              icon: 'verified',
              title: 'Verified Badge',
              description: 'Complete our verification process and stand out as a trusted, top-rated tutor.',
            }
          ]}
        />
        {/* Right Panel: Form */}
        <section className="w-full lg:w-[55%] bg-surface-container-lowest flex items-center justify-center p-6 sm:p-12 overflow-y-auto">
          <div className="w-full max-w-[480px] py-4">
            <header className="mb-8 text-center lg:text-left">
              <h2 className="text-3xl font-extrabold tracking-tight text-on-surface mb-2">Become a Tutor</h2>
              <p className="text-on-surface-variant">Already have an account? <Link className="text-primary font-semibold hover:underline" href="/tutor/signin">Log in</Link></p>
            </header>

            {/* Google Login */}
            <GoogleLoginButton onClick={handleGoogleLogin} disabled={loading} isLoading={loading} />

            <AuthDivider label="OR" />

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-5" autoComplete="off">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5" htmlFor="fullname">Full Name</label>
                <input
                  required
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                  className="w-full h-11 px-4 bg-surface-container-low border-b-2 border-outline-variant focus:border-primary focus:ring-0 transition-all duration-200 outline-none text-on-surface rounded-t-lg"
                  name="quicksolve-tutor-signup-fullname"
                  autoComplete="off"
                  id="fullname" placeholder="Enter full name" type="text"
                />
              </div>

              {/* Email + Phone Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5" htmlFor="email">Email</label>
                  <input
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 px-4 bg-surface-container-low border-b-2 border-outline-variant focus:border-primary focus:ring-0 transition-all duration-200 outline-none text-on-surface rounded-t-lg"
                    name="quicksolve-tutor-signup-email"
                    autoComplete="off"
                    id="email" placeholder="Enter email" type="email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5" htmlFor="phone">Phone (WhatsApp)</label>
                  <div className="flex">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-[90px] h-11 px-2 bg-surface-container-low border-b-2 border-r-2 border-outline-variant focus:border-primary outline-none text-on-surface rounded-tl-lg text-sm"
                    >
                                              <option value="+92">+92</option>
                      <option value="+1">+1</option>
                      <option value="+44">+44</option>
                      <option value="+971">+971</option>
                      <option value="+966">+966</option>
                      <option value="+61">+61</option>
                    </select>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 h-11 px-4 bg-surface-container-low border-b-2 border-outline-variant focus:border-primary focus:ring-0 transition-all duration-200 outline-none text-on-surface rounded-tr-lg"
                      name="quicksolve-tutor-signup-phone"
                      autoComplete="off"
                      id="phone" placeholder="Enter phone number" type="tel"
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5" htmlFor="password">Create Password</label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 bg-surface-container-low border-b-2 border-outline-variant focus:border-primary focus:ring-0 transition-all duration-200 outline-none text-on-surface rounded-t-lg"
                  toggleClassName="hover:bg-surface-container-high"
                  name="quicksolve-tutor-signup-password"
                  autoComplete="new-password"
                  id="password"
                  placeholder="Enter password"
                />
                <div className="h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${strength === 0 ? 'w-0' : strength === 1 ? 'w-1/3 bg-red-400' : strength === 2 ? 'w-2/3 bg-amber-400' : 'w-full bg-primary'}`}></div>
                </div>
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <div className="flex items-center h-5">
                  <input
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    className="w-4 h-4 text-primary border-outline-variant rounded focus:ring-primary/20"
                    id="terms" type="checkbox"
                  />
                </div>
                <label className="text-xs text-on-surface-variant leading-relaxed" htmlFor="terms">
                  I agree to the <Link className="text-primary font-semibold hover:underline" href="/terms">Terms of Service</Link> and <Link className="text-primary font-semibold hover:underline" href="/privacy">Privacy Policy</Link>.
                </label>
              </div>

              {/* Submit */}
              <button
                disabled={loading}
                className="w-full h-11 bg-[#006c4a] hover:bg-green-800 disabled:opacity-70 text-white font-bold rounded-lg shadow-lg shadow-green-900/20 transition-all active:scale-[0.98]"
                type="submit"
              >
                {loading ? "CREATING ACCOUNT..." : "APPLY TO TEACH"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </>
  )
}
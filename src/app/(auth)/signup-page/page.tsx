"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { AuthSidebar } from '@/components/layout/AuthSidebar';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast';
import { COUNTRY_PHONE_OPTIONS, formatCountryPhoneOption, getCountryPhoneOption, sanitizePhoneDigits } from '@/lib/phone';
export default function SignupPagePage() {
  const router = useRouter();
  
  const [role, setRole] = useState<'student'|'tutor'>('student');
  const roleRef = useRef(role);
  useEffect(() => { roleRef.current = role; }, [role]);
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+92');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const showError = (message: string) => {
    setError(message);
    notifyError(message);
  };

  useEffect(() => {
    // We use window.location.search instead of useSearchParams to avoid Suspense boundaries 
    // requirement for a simple query param read on initial load
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const roleParam = searchParams.get('role');
      if (roleParam === 'tutor' || roleParam === 'student') {
        setRole(roleParam);
      }
    }
  }, []);

  const calculateStrength = () => {
    let score = 0;
    if (password.length > 7) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9!@#\$%\^\&*\)\(+=._-]/.test(password)) score++;
    return score;
  };
  const strength = calculateStrength();
  const selectedCountry = getCountryPhoneOption(countryCode);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!terms) {
      showError("Please agree to the Terms of Service before creating your account.");
      return;
    }
    if (strength < 2) {
      showError("Please choose a stronger password with at least 8 characters and a number or symbol.");
      return;
    }
    if (phone.length !== selectedCountry.maxDigits) {
      showError(`Please enter a valid ${selectedCountry.maxDigits}-digit phone number for ${selectedCountry.label}.`);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullname, email, phone: `${countryCode}${phone}`, password, role }),
      });

      const data = await res.json();
      if (res.ok) {
        notifySuccess(data.message, "We are sending your verification code now.");
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        showError(getApiMessage(data, "We could not create your account. Please review your details and try again."));
      }
    } catch (err) {
      showError("We could not reach the signup service. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = useGoogleLogin({
    scope: 'email profile openid',
    onSuccess: async (tokenResponse) => {
      setError('');
      setLoading(true);
      try {
        const res = await fetch('/api/auth/google', { 
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ token: tokenResponse.access_token, role: roleRef.current })
        });
        const data = await res.json();
        if (res.ok) {
          // Check if admin email - redirect to admin panel (overrides everything)
          if (data.isAdmin) {
            window.location.href = '/admin/verifications';
            return;
          }
          
          // Redirect based on role and profile completion
          if (role === 'tutor') {
            // If new user OR profile incomplete, go to complete-profile
            if (data.isNewUser || data.requiresProfileCompletion) {
              window.location.href = '/tutor/complete-profile'
            } else {
              window.location.href = data.verificationStage && data.verificationStage !== 'not_started'
                ? '/tutor/waiting-verification'
                : '/tutor/complete-profile'
            }
          } else {
            window.location.href = '/student/dashboard'
          }
        } else {
          showError(getApiMessage(data, "Google signup could not be completed. Please try again."));
          setLoading(false);
        }
      } catch (err) {
        showError("Google signup is temporarily unavailable. Please try again or use email signup.");
        setLoading(false);
      }
    },
    onError: () => {
      showError("Google signup was cancelled or the connection failed.");
    }
  });

  return (
      <main className="flex min-h-screen w-full bg-background text-text-main overflow-x-hidden">
        {/* Left Panel: Brand & Value Props (45%) */}
        <AuthSidebar
          title={<>Unlock your potential with expert guidance.</>}
          features={[
            {
              icon: 'school',
              title: 'For Students',
              description: 'Access top-tier tutors across 50+ subjects and solve complex problems in minutes.',
              iconColorClass: 'text-secondary',
              iconBgClass: 'bg-secondary-subtle'
            },
            {
              icon: 'auto_graph',
              title: 'For Tutors',
              description: 'Grow your professional tutoring business with our integrated dashboard and global reach.'
                          }
          ]}
        />

        {/* Right Panel: Form (55%) */}
        <section className="w-full lg:w-[55%] bg-surface flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-[480px]">
            {/* Header */}
            <header className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-extrabold tracking-tight text-text-main mb-2">Create your account</h2>
              <p className="text-text-muted">Already have an account? <Link className="text-primary font-semibold hover:underline" href="/signin-page">Log in</Link></p>
            </header>

            {/* Role Selector */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <button 
                type="button"
                onClick={() => setRole('student')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 ${role === 'student' ? 'border-primary bg-primary-subtle/50 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-surface-hover bg-surface'}`}
              >
                <span className={`material-symbols-outlined mb-2 ${role === 'student' ? 'text-primary' : 'text-text-muted'}`} style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                <span className={`text-sm font-bold ${role === 'student' ? 'text-primary' : 'text-text-muted'}`}>Student</span>
              </button>
              <button 
                type="button"
                onClick={() => setRole('tutor')}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 ${role === 'tutor' ? 'border-secondary bg-secondary-subtle/50 shadow-sm' : 'border-border hover:border-secondary/50 hover:bg-surface-hover bg-surface'}`}
              >
                <span className={`material-symbols-outlined mb-2 ${role === 'tutor' ? 'text-secondary' : 'text-text-muted'}`}>history_edu</span>
                <span className={`text-sm font-bold ${role === 'tutor' ? 'text-secondary' : 'text-text-muted'}`}>Tutor</span>
              </button>
            </div>

            {/* Social Logins */}
            <GoogleLoginButton onClick={handleGoogleLogin} isLoading={loading} disabled={loading} />

            <AuthDivider label="OR" />

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            {/* Signup Form */}
            <form onSubmit={handleSignup} className="space-y-6" autoComplete="off">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5" htmlFor="fullname">Full Name</label>
                <input 
                  required
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                  className="w-full h-12 px-4 bg-surface-hover border border-border focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none text-text-main rounded-xl" 
                  name="quicksolve-signup-fullname"
                  autoComplete="off"
                  id="fullname" placeholder="Enter full name" type="text" 
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5" htmlFor="email">Work or Personal Email</label>
                <input 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-surface-hover border border-border focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none text-text-main rounded-xl" 
                  name="quicksolve-signup-email"
                  autoComplete="off"
                  id="email" placeholder="Enter email" type="email" 
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5" htmlFor="phone">Phone Number</label>
                                <div className="flex">
                  <select
                    value={countryCode}
                    onChange={(e) => {
                      const nextCountry = getCountryPhoneOption(e.target.value);
                      setCountryCode(nextCountry.code);
                      setPhone((current) => sanitizePhoneDigits(current, nextCountry.maxDigits));
                    }}
                    className="w-[118px] h-12 px-3 bg-surface-hover border-y border-l border-border focus:border-primary focus:bg-surface outline-none text-text-main rounded-l-xl text-sm transition-all"
                  >
                    {COUNTRY_PHONE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {formatCountryPhoneOption(option)}
                      </option>
                    ))}
                  </select>
                  <input 
                    required
                    value={phone}
                    onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value, selectedCountry.maxDigits))}
                    maxLength={selectedCountry.maxDigits}
                    className="flex-1 h-12 px-4 bg-surface-hover border border-border focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none text-text-main rounded-r-xl" 
                    name="quicksolve-signup-phone"
                    autoComplete="off"
                    id="phone" placeholder={countryCode === '+92' ? '3XXXXXXXXX' : 'Enter phone number'} type="tel" 
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5" htmlFor="password">Create Password</label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 bg-surface-hover border border-border focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none text-text-main rounded-xl" 
                  name="quicksolve-signup-password"
                  autoComplete="new-password"
                  id="password"
                  placeholder="Enter password"
                />
                
                {/* Password Strength Meter */}
                <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-300 ${strength === 0 ? 'w-0' : strength === 1 ? 'w-1/3 bg-red-400' : strength === 2 ? 'w-2/3 bg-amber-400' : 'w-full bg-success'}`}></div>
                </div>
                
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <div className="flex items-center h-5">
                  <input 
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                    className="w-4 h-4 text-primary border-border rounded focus:ring-primary/20" 
                    id="terms" type="checkbox" 
                  />
                </div>
                <label className="text-xs text-text-muted leading-relaxed" htmlFor="terms">
                  I agree to the <Link className="text-primary font-semibold hover:underline" href="/terms">Terms of Service</Link> and <Link className="text-primary font-semibold hover:underline" href="/privacy">Privacy Policy</Link>, including the use of cookies.
                </label>
              </div>

              {/* Submit Button */}
              <button 
                disabled={loading}
                className="w-full h-12 bg-primary hover:bg-primary-dark disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" 
                type="submit"
              >
                {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
              </button>
            </form>
          </div>
        </section>
      </main>
  );
}

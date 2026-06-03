"use client"

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { AuthSidebar } from '@/components/layout/AuthSidebar';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast';
export default function SigninPage() {
  const router = useRouter();
  const [role, setRole] = useState<'student'|'tutor'>('student');
  const roleRef = useRef(role);
  useEffect(() => { roleRef.current = role; }, [role]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const showError = (message: string) => {
    setError(message);
    notifyError(message);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const roleParam = searchParams.get('role');
      if (roleParam === 'tutor' || roleParam === 'student') {
        setRole(roleParam);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Submitting login...")
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, requestedRole: role }),
      });

      const data = await res.json();

      if (res.ok) {
        notifySuccess(data.message, "Signed in successfully.");
        // Check if admin email - redirect to admin panel
        if (data.isAdmin) {
          window.location.href = '/admin/verifications';
          return;
        }
        
        // Check if tutor needs to complete profile first
        if (data.requiresProfileCompletion) {
          window.location.href = '/tutor/complete-profile';
          return;
        }
        
        // Check if profile is submitted but pending verification - go to waiting page
        // 'pending' = submitted, waiting admin | 'not_started' or null = not submitted yet
        if (data.verificationStage && data.verificationStage !== 'not_started' && data.verificationStage !== '') {
          window.location.href = '/tutor/waiting-verification';
           return;
        }
        
        // Redirect based on actual role
        const dest = data.role === 'tutor' ? '/tutor/complete-profile' : '/student/dashboard';
        window.location.href = dest;
      } else {
        // Check if it's a role mismatch error
        if (data.error === 'Role mismatch' && data.actualRole) {
          showError(`${data.message} Or switch to "${data.actualRole}" role below.`);
        } else {
          showError(getApiMessage(data, "We could not sign you in. Please check your email, password, and selected role."));
        }
      }
    } catch (err) {
      showError("We could not reach the login service. Please check your connection and try again.");
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
          // Check if admin email - redirect to admin panel
          if (data.isAdmin) {
            window.location.href = '/admin/verifications';
            return;
          }
          
          // If needs profile completion
          if (data.requiresProfileCompletion) {
            window.location.href = '/tutor/complete-profile';
            return;
          }
          
          // If profile submitted but pending verification - go to waiting page
          if (data.verificationStage && data.verificationStage !== 'not_started' && data.verificationStage !== '') {
            window.location.href = '/tutor/waiting-verification';
            return;
          }
          
          // Redirect based on role
          const dest = data.role === 'tutor' ? '/tutor/complete-profile' : '/student/dashboard';
          window.location.href = dest;
        } else {
          showError(getApiMessage(data, "Google sign in could not be completed. Please try again."));
          setLoading(false);
        }
      } catch (err) {
        showError("Google sign in is temporarily unavailable. Please try again or use email login.");
        setLoading(false);
      }
    },
    onError: () => {
      showError("Google sign in was cancelled or the connection failed.");
    }
  });

  return (
    
      <main className="flex min-h-screen w-full bg-background text-text-main overflow-x-hidden">
        {/* Left Panel: Brand & Value Props (45%) */}
        <AuthSidebar
          title={<>Welcome back to<br />your learning<br />community</>}
          features={[
            {
              icon: 'school',
              title: 'Expert Live Tutoring',
              description: 'Connect with top-tier tutors for real-time problem solving and academic acceleration.',
              iconColorClass: 'text-secondary',
              iconBgClass: 'bg-secondary-subtle'
            }
          ]}
        />


        {/* Right Panel: Form (55%) */}
        <section className="w-full lg:w-[55%] bg-surface flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-[480px]">
            {/* Header */}
            <header className="mb-8 text-center lg:text-left">
              <h2 className="text-[32px] font-extrabold tracking-tight text-text-main mb-2">Sign In to QuickSolve</h2>
              <p className="text-text-muted font-medium">Welcome back! Please enter your details.</p>
            </header>

            {/* Role Selection */}
            <div className="mb-6 mt-2">
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface-hover rounded-xl">
                <button
                  type="button"
                  onClick={() => setRole('student')}
                  className={`flex flex-col items-center justify-center py-3 px-4 rounded-lg transition-all duration-200 ${
                    role === 'student'
                      ? 'bg-surface shadow-sm border-2 border-primary text-primary'
                      : 'text-text-muted hover:text-text-main hover:bg-surface-hover/80'
                  }`}
                >
                  <span className="material-symbols-outlined mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>school</span>
                  <span className="text-sm font-semibold">Student</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('tutor')}
                  className={`flex flex-col items-center justify-center py-3 px-4 rounded-lg transition-all duration-200 ${
                    role === 'tutor'
                      ? 'bg-surface shadow-sm border-2 border-secondary text-secondary'
                      : 'text-text-muted hover:text-text-main hover:bg-surface-hover/80'
                  }`}
                >
                  <span className="material-symbols-outlined mb-1" style={{ fontVariationSettings: "'FILL' 1" }}>person_raised_hand</span>
                  <span className="text-sm font-semibold">Tutor</span>
                </button>
              </div>
            </div>

            {/* Google Login */}
            <GoogleLoginButton onClick={handleGoogleLogin} isLoading={loading} disabled={loading} />

            {/* Divider */}
            <AuthDivider label="OR" />

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-sm font-medium">
                {error}
              </div>
            )}

            {/* Signin Form */}
            <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
              {/* Email */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5" htmlFor="signin-email">
                  Email
                </label>
                <input
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 px-4 bg-surface-hover border border-border focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none text-text-main rounded-xl"
                  name="quicksolve-signin-email"
                  autoComplete="off"
                  id="signin-email"
                  placeholder="Enter email"
                  type="email"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5" htmlFor="signin-password">
                  Password
                </label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 px-4 bg-surface-hover border border-border focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/20 transition-all duration-200 outline-none text-text-main rounded-xl"
                  name="quicksolve-signin-password"
                  autoComplete="current-password"
                  id="signin-password"
                  placeholder="Enter password"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:underline">
                  Forgot password?
                </Link>
                <Link href="/signup-page" className="text-sm font-semibold text-text-muted hover:text-primary">
                  Create account
                </Link>
              </div>

              <button
                disabled={loading}
                className="w-full h-12 bg-primary hover:bg-primary-dark disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
                type="submit"
              >
                {loading ? 'SIGNING IN...' : 'SIGN IN'}
              </button>
            </form>
          </div>
        </section>
      </main>
  );
}

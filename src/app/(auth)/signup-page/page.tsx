import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { AuthSidebar } from '@/components/layout/AuthSidebar';
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton';
import { AuthDivider } from '@/components/auth/AuthDivider';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast';
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
              description: 'Grow your professional tutoring business with our integrated dashboard and global reach.'s
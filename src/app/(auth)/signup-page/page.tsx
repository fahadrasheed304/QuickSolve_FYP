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

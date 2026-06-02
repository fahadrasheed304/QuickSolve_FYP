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

import React, { useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Mail, LockKeyhole, Loader2 } from 'lucide-react'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { AuthSidebar } from '@/components/layout/AuthSidebar'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

export default function AdminSigninPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (res.ok) {
        notifySuccess('Admin access verified. Opening the dashboard.')
        window.location.href = data.redirectTo || '/admin/verifications'
        return
      }

      const message = getApiMessage(data, 'Admin sign in failed. Please check your credentials and try again.')
      setError(message)
      notifyError(message)
    } catch {
      const message = 'We could not reach the admin sign in service. Please check your connection and try again.'
      setError(message)
      notifyError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full bg-background text-text-main overflow-x-hidden">
      <AuthSidebar
        title={<>QuickSolve<br />admin control</>}
        features={[
          {
            icon: 'admin_panel_settings',
            title: 'Verification Review',
            description: 'Manage tutor applications, documents, and test invitation stages from one secure workspace.',
            iconColorClass: 'text-primary',
            iconBgClass: 'bg-primary-subtle',
          },
        ]}
      />

      <section className="w-full lg:w-[55%] bg-surface flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-[480px]">
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-subtle text-primary lg:mx-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-[32px] font-extrabold tracking-tight text-text-main mb-2">Admin Sign In</h1>
            <p className="text-text-muted font-medium">Restricted access for authorized administrators.</p>
```

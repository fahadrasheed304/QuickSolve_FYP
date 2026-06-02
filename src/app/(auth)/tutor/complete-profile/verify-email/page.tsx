import React, { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

function TutorVerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ""

  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const showError = (message: string) => {
    setError(message)
    notifyError(message)
  }

  useEffect(() => {
    if (!email) {
      router.push('/tutor/signup')
    }
  }, [email, router])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pasted = value.slice(0, 6).split('')
      const newOtp = [...otp]
      pasted.forEach((char, i) => {
        newOtp[i] = char
      })
      setOtp(newOtp)
      const lastIndex = Math.min(pasted.length, 5)
      inputRefs.current[lastIndex]?.focus()
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')

    if (code.length !== 6) {
      showError("Please enter the 6-digit verification code from your email.")
      return
    }

    setLoading(true)
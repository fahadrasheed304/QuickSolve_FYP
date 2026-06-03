import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { DB, pendingSignups } from '@/lib/db'

// Admin emails that get automatic admin access
const ADMIN_EMAILS = ['quicksolve.officials@gmail.com']

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json()

    if (!email || !otp) {
      return NextResponse.json({ error: "Missing email or OTP" }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const pending = pendingSignups[normalizedEmail]

    if (!pending) {
      return NextResponse.json({ error: "No pending signup found or OTP expired." }, { status: 400 })
    }

    if (Date.now() > pending.expires) {
      delete pendingSignups[normalizedEmail]
      return NextResponse.json({ error: "OTP expired, please sign up again." }, { status: 400 })
    }

    if (pending.otp !== otp) {
      return NextResponse.json({ error: "Incorrect OTP code." }, { status: 401 })
    }

    const hasRequestedRole = await DB.userHasRole(pending.user.email, pending.user.role)
    if (hasRequestedRole) {
      delete pendingSignups[normalizedEmail]
      return NextResponse.json({
        error: "Email already registered for this role",

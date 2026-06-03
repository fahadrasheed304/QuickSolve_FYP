import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { DB } from '@/lib/db'
import { hashPassword, isPasswordHash, verifyPassword } from '@/lib/password'
import { getTutorVerificationState } from '@/lib/tutor-verification'

// Admin emails that get automatic admin access
const ADMIN_EMAILS = [
  'quicksolve.officials@gmail.com',
]

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, requestedRole } = body
    
    // Check if this is admin email
    const isAdminEmail = ADMIN_EMAILS.includes(email.toLowerCase())

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 })
    }

    // Check DB (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim()
    const user = await DB.findUserByEmail(normalizedEmail)

    // Check if this is a Google OAuth account (no password set)
    if (user && user.password === '') {
      return NextResponse.json({ error: "This account was created with Google. Please use 'Continue with Google' to sign in." }, { status: 401 })
    }

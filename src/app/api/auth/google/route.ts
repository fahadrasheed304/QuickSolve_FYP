import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { DB } from '@/lib/db'
import { getTutorVerificationState } from '@/lib/tutor-verification'

// Admin emails that get automatic admin access
const ADMIN_EMAILS = [
  'quicksolve.officials@gmail.com',
]

export async function POST(request: Request) {
  try {
    const { token, role: requestedRole } = await request.json()

    if (!token) {
       return NextResponse.json({ error: "Missing Google Token" }, { status: 400 })
    }
    
    // Default to student, but allow tutor role to be passed
    const userRole = requestedRole === 'tutor' ? 'tutor' : 'student'

    // Securely fetch user data from Google using the issued access token
    const googleResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!googleResponse.ok) {
       return NextResponse.json({ error: "Invalid Google Token" }, { status: 401 })
    }

    const googleUser = await googleResponse.json()
    const googleEmail = googleUser.email

    // Check if user already exists
    let user = await DB.findUserByEmail(googleEmail)
    const isNewUser = !user // Track if this is a new signup
    
    if (!user) {
      // Create user from Google Identity automatically
      user = await DB.createUser({

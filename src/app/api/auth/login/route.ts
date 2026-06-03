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

    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Seamlessly migrate old plaintext passwords after a successful login.
    if (user.password && !isPasswordHash(user.password)) {
      await DB.updateUserPassword(user.email, hashPassword(password))
    }

    // Use only roles that this email has actually registered for.
    const sessionRole = requestedRole === 'tutor' ? 'tutor' : 'student'
    const hasRequestedRole = await DB.userHasRole(user.email, sessionRole)
    if (!hasRequestedRole) {
      return NextResponse.json({
        error: "Role not registered",
        message: `This email is not registered as a ${sessionRole}. Please sign up for that role first.`,
        actualRole: user.role,
      }, { status: 403 })
    }

    // Check if tutor profile is complete (for tutor role only)
    let profileComplete = true
    let verificationStage = 'not_started'
    if (sessionRole === 'tutor') {
      const tutorProfile = await DB.getTutorProfile(user.email)
      const degrees = tutorProfile ? await DB.getDegrees(user.email) : []
      const documents = tutorProfile ? await DB.getDocuments(user.email) : []
      const verification = getTutorVerificationState(tutorProfile, degrees, documents)

      verificationStage = verification.stage
      profileComplete = verification.isSubmitted
    }

    // Create secure HTTP only cookie params
    const { session, expiresAt } = await createSession(user.email, user.email, sessionRole)

    const response = NextResponse.json({ 
      success: true, 
      message: "Logged in successfully", 
      role: sessionRole,
      profileComplete,
      verificationStage,
      requiresProfileCompletion: sessionRole === 'tutor' && !profileComplete,
      isAdmin: isAdminEmail,
      redirectTo: isAdminEmail ? '/admin/verifications' : null
    })
    response.cookies.set('auth_token', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      sameSite: 'lax',
      path: '/',
    })
    
    return response

  } catch (error: any) {
    console.error("Login error:", error)
    return NextResponse.json({ error: error.message || "Failed to login" }, { status: 500 })
  }
}

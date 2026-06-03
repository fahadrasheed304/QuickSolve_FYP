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
        fullname: googleUser.name || googleEmail.split('@')[0], 
        email: googleEmail, 
        phone: "", // Cannot extract phone from default read scopes
        password: "", // Handled by OAuth Provider
        role: userRole 
      })
      
    }

    // Determine session role (allow role switching like regular login)
    const sessionRole = userRole || user.role || 'student'
    await DB.getWalletBalance(user.email, sessionRole)

    if (sessionRole === 'tutor') {
      try {
        const existingProfile = await DB.getTutorProfile(user.email)
        if (!existingProfile) {
          await DB.createTutorProfile({
            userEmail: user.email,
            fullname: googleUser.name || googleEmail.split('@')[0],
            phone: '',
            city: '',
            subjects: [],
            highestEducation: '',
            university: '',
            experienceYears: 0,
          })
        }
      } catch (profileErr: any) {
        console.error("Tutor profile creation error (Google):", profileErr)
        // Don't block signup if profile creation fails
      }
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

    // Create session cookie automatically via jose
    const { session, expiresAt } = await createSession(user.email, user.email, sessionRole)

    // Check if admin email
    const isAdminEmail = ADMIN_EMAILS.includes(user.email.toLowerCase())

    const response = NextResponse.json({ 
      success: true, 
      message: "Logged in via Google successfully",
      role: sessionRole,
      isNewUser, // Frontend can check if this was a new signup
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
    console.error("Google Auth error:", error)
    return NextResponse.json({ error: error.message || "Failed to authenticate with Google" }, { status: 500 })
  }
}


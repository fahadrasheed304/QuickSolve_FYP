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
        message: `This email is already registered as a ${pending.user.role}. Please log in instead.`,
      }, { status: 400 })
    }

    // Check if user already exists with different role
    let newUser = await DB.findUserByEmail(pending.user.email)
    
    if (newUser && newUser.role !== pending.user.role) {
      // User exists but with different role - update role to new role
      // This allows same email to be both student and tutor (role switching)
      await DB.updateUserRole(newUser.email, pending.user.role)
      newUser = { ...newUser, role: pending.user.role }
      await DB.getWalletBalance(newUser.email, pending.user.role)
    } else if (!newUser) {
      // Create new user
      newUser = await DB.createUser(pending.user)
    }

    // If tutor role, also create a tutor_profile row (if not exists)
    if (pending.user.role === 'tutor') {
      try {
        const existingProfile = await DB.getTutorProfile(newUser.email)
        if (!existingProfile) {
          await DB.createTutorProfile({
            userEmail: newUser.email,
            fullname: pending.user.fullname,
            phone: pending.user.phone || '',
            city: pending.user.city || '',
            subjects: pending.user.subjects || [],
            highestEducation: pending.user.highestEducation || '',
            university: pending.user.university || '',
            experienceYears: pending.user.experienceYears || 0,
          })
        }
      } catch (profileErr: any) {
        console.error("Tutor profile creation error:", profileErr)
        // Don't block signup if profile creation fails
      }
    }

    // Remove from pending
    delete pendingSignups[normalizedEmail]

    // Create session cookie
    const { session, expiresAt } = await createSession(newUser.email, newUser.email, newUser.role)

    // Check if admin email
    const isAdmin = ADMIN_EMAILS.includes(newUser.email.toLowerCase())

    const response = NextResponse.json({ 
      success: true, 
      message: "Account verified successfully!", 
      role: newUser.role,
      isAdmin,
      redirectTo: isAdmin ? '/admin/verifications' : null
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
    console.error("OTP verification error:", error)
    return NextResponse.json({ error: error.message || "Failed to verify OTP" }, { status: 500 })
  }
}

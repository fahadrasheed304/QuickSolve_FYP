import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { getTutorVerificationState } from '@/lib/tutor-verification'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    const session = await decrypt(token)
    if (!session || !session.email) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 })
    }
    
    const user = await DB.findUserByEmail(session.email as string)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    
    let tutorProfile = null
    let tutorVerification = null
    const effectiveRole = (session.role as string) || user.role || 'student'
    
    if (effectiveRole === 'tutor') {
      tutorProfile = await DB.getTutorProfile(user.email)
      if (tutorProfile) {
        const degrees = await DB.getDegrees(user.email)
        const documents = await DB.getDocuments(user.email)
        tutorVerification = getTutorVerificationState(tutorProfile, degrees, documents)
      }
    }

    const wallet = await DB.getWalletBalance(user.email, effectiveRole)

    return NextResponse.json({ 
      user: {
        id: user.id,
        fullname: typeof user.fullname === 'string' && user.fullname.trim() !== '' 
          ? user.fullname 
          : (typeof user.email === 'string' ? user.email.split('@')[0] : 'API_GUEST'),
        email: user.email,
        role: effectiveRole,
        class: (user as any).class || null,
        group: (user as any).group || null,
        sessions: (user as any).sessions || 0,
        rating: (user as any).rating || null,
        walletBalance: wallet.balance ?? 0,
        tutorProfile: tutorProfile ? {
          id: tutorProfile.id,
          fullname: tutorProfile.fullname,
          phone: tutorProfile.phone,
          cnic: tutorProfile.cnic,
          city: tutorProfile.city,
          bio: tutorProfile.bio,
          profileImageUrl: tutorProfile.profile_image_url,
          highestEducation: tutorProfile.highest_education,
          university: tutorProfile.university,
          graduationYear: tutorProfile.graduation_year,
          subjects: tutorProfile.subjects,
          experienceYears: tutorProfile.experience_years,
          verificationStatus: tutorVerification?.status || 'not_started',
          verificationStage: tutorVerification?.stage || 'not_started',
          profileSubmitted: tutorVerification?.isSubmitted || false,
          requiresProfileCompletion: !(tutorVerification?.isSubmitted || false),
          documentsUploaded: tutorProfile.documents_uploaded,
          subjectTestScore: tutorProfile.subject_test_score,
          subjectTestPassed: tutorProfile.subject_test_passed,
          availableDays: tutorProfile.available_days,
          availableHoursStart: tutorProfile.available_hours_start,
          availableHoursEnd: tutorProfile.available_hours_end,
          isAvailable: tutorProfile.is_available,
          totalEarnings: tutorProfile.total_earnings,
          totalSessions: tutorProfile.total_sessions,
          responseTimeMin: tutorProfile.response_time_min,
        } : null,
      } 
    })
  } catch (error: any) {
    console.error('Auth /me error:', error.stack)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

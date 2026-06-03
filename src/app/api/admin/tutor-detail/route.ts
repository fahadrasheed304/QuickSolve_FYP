import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { getCurrentTutorDocuments } from '@/lib/tutor-documents'

// Hardcoded admin emails (fallback if env not set)
const HARDCODED_ADMIN_EMAILS = ['quicksolve.officials@gmail.com']

// Helper to check admin
async function isAdmin(email: string): Promise<boolean> {
  const adminEmails = [...HARDCODED_ADMIN_EMAILS, ...(process.env.ADMIN_EMAILS?.split(',') || [])]
  return adminEmails.includes(email.toLowerCase()) || email.endsWith('@admin.quicksolve.pk')
}

// GET /api/admin/tutor-detail?tutorEmail=xyz
// Get complete tutor details for admin review
export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const session = await decrypt(token)
    if (!session?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    
    if (!await isAdmin(session.email as string)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    const { searchParams } = new URL(request.url)
    const tutorEmail = searchParams.get('tutorEmail')
    
    if (!tutorEmail) {
      return NextResponse.json({ error: 'Tutor email required' }, { status: 400 })
    }
    
    // Get tutor profile
    let profile = await DB.getTutorProfile(tutorEmail)
    if (!profile) {
      return NextResponse.json({ error: 'Tutor not found' }, { status: 404 })
    }

    const currentStage = profile.verification_stage || 'submitted'
    const shouldMarkUnderReview = ['submitted', 'pending'].includes(currentStage)

    if (shouldMarkUnderReview) {
      profile = await DB.updateTutorProfile(tutorEmail, {
        verification_stage: 'under_review',
        verification_status: 'pending',
        verified_by: session.email,
      })

      await DB.addVerificationNote(tutorEmail, {
        noteType: 'admin_to_tutor',
        message: 'Admin review started.',
        createdBy: session.email as string,
      })
    }
    
    // Get degrees
    const degrees = await DB.getDegrees(tutorEmail)

    // Get documents
    const documents = getCurrentTutorDocuments(await DB.getDocuments(tutorEmail))
    
    // Get verification notes
    const notes = await DB.getVerificationNotes(tutorEmail)
    
    // Get test results
    const testResults = await DB.getTestResults(tutorEmail)
    
    // Get user info
    const user = await DB.findUserByEmail(tutorEmail)
    
    return NextResponse.json({
      profile,
      degrees,
      documents,
      notes,
      testResults,
      user: {
        email: user?.email,
        fullname: user?.fullname,
        phone: user?.phone,
        createdAt: user?.created_at,
      },
    })
    
  } catch (error: any) {
    console.error('Get tutor detail error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get tutor details' },
      { status: 500 }
    )
  }
}

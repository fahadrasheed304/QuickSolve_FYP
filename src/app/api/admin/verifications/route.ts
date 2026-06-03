import { NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentTutorDocuments } from '@/lib/tutor-documents'

// Hardcoded admin emails (fallback if env not set)
const HARDCODED_ADMIN_EMAILS = ['quicksolve.officials@gmail.com']

// Helper to check if user is admin (simple check - you can expand this)
async function isAdmin(email: string): Promise<boolean> {
  // For now, check against a list of admin emails or a specific domain
  // You can also have an is_admin column in users table
  const adminEmails = [...HARDCODED_ADMIN_EMAILS, ...(process.env.ADMIN_EMAILS?.split(',') || [])]
  return adminEmails.includes(email.toLowerCase()) || email.endsWith('@admin.quicksolve.pk')
}

// GET /api/admin/verifications
// Get all tutors pending verification
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
    
    // Check admin
    if (!await isAdmin(session.email as string)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    // Get filter from query params (optional - if not provided, get all tutors)
    const { searchParams } = new URL(request.url)
    const stage = searchParams.get('stage')
    
    // Get all tutors with profiles
    let query = supabaseAdmin
      .from('tutor_profiles')
      .select(`
        *,
        users: user_email (email, fullname, created_at)
      `)
      .order('created_at', { ascending: true })
    
    // Only filter by stage if explicitly provided
    if (stage) {
      query = query.eq('verification_stage', stage)
    }
    
    const { data: profiles, error } = await query
    
    if (error) {
      console.error('Get verifications error:', error)
      return NextResponse.json({ error: 'Failed to fetch verifications' }, { status: 500 })
    }
    
    // Fetch degree and document counts for each profile
    const tutorsWithCounts = await Promise.all((profiles || []).map(async (p: any) => {
      const { count: degreeCount } = await supabaseAdmin
        .from('tutor_degrees')
        .select('*', { count: 'exact', head: true })
        .eq('tutor_email', p.user_email)
      
      const { data: documents } = await supabaseAdmin
        .from('tutor_documents')
        .select('id, document_type, document_url, file_name, uploaded_at')
        .eq('tutor_email', p.user_email)
        .order('uploaded_at', { ascending: false })
      
      return {
        ...p,
        _degreeCount: degreeCount || 0,
        _docCount: getCurrentTutorDocuments(documents || []).length,
      }
    }))
    
    return NextResponse.json({ tutors: tutorsWithCounts || [] })
    
  } catch (error: any) {
    console.error('Admin verifications error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get verifications' },
      { status: 500 }
    )
  }
}

// POST /api/admin/verifications
// Update tutor verification status (admin action)
export async function POST(request: Request) {
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
    
    // Check admin
    if (!await isAdmin(session.email as string)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    
    const body = await request.json()
    const { tutorEmail, action, newStage: stageFromFrontend, newStatus: statusFromFrontend, notes, adminNote } = body
    
    // Support both 'action' (legacy) and 'newStage' (new format)
    const actionOrStage = action || stageFromFrontend
    const noteText = notes || adminNote || ''
    
    if (!tutorEmail || !actionOrStage) {
      return NextResponse.json({ error: 'Tutor email and action/stage are required' }, { status: 400 })
    }
    
    let newStage = ''
    let newStatus = ''
    let message = ''
    
    switch (actionOrStage) {
      case 'invite_test':
      case 'test_invited':
        newStage = 'test_invited'
        newStatus = 'pending'
        message = 'Test invitation sent. Tutor can now take the subject test.'
        break
      case 'verify_documents':
        newStage = 'under_review'
        newStatus = 'pending'
        message = 'Documents verified. Tutor can now take the test.'
        break
      case 'reject':
      case 'rejected':
        newStage = 'rejected'
        newStatus = 'rejected'
        message = `Application rejected. ${noteText}`
        break
      case 'final_verify':
        newStage = 'verified'
        newStatus = 'verified'
        message = 'Tutor fully verified! Can now start teaching.'
        break
      case 'request_documents':
        newStage = 'pending'
        newStatus = 'pending'
        message = `Please re-submit documents. ${noteText}`
        break
      case 'under_review':
        newStage = 'under_review'
        newStatus = statusFromFrontend || 'pending'
        message = noteText || 'Admin review started.'
        break
      case 'verified':
        newStage = 'verified'
        newStatus = 'verified'
        message = noteText || 'Tutor fully verified! Can now start teaching.'
        break
      case 'pending':
        newStage = 'pending'
        newStatus = statusFromFrontend || 'pending'
        message = noteText || 'Application moved back to pending review.'
        break
      case 'submitted':
        newStage = 'submitted'
        newStatus = statusFromFrontend || 'pending'
        message = noteText || 'Application marked as submitted.'
        break
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    
    // Update tutor profile
    await DB.updateTutorProfile(tutorEmail, {
      verification_stage: newStage,
      verification_status: newStatus,
      verified_by: session.email,
    })
    
    // Add verification note
    await DB.addVerificationNote(tutorEmail, {
      noteType: 'admin_to_tutor',
      message: message,
      createdBy: session.email as string,
    })
    
    // Send email notification for test invitation
    if (newStage === 'test_invited') {
      try {
        const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #006c4a;">Subject Test Invitation</h2>
  <p>Hello,</p>
  <p>Congratulations! Your profile has been reviewed and you are invited to take the subject test.</p>
  <p><strong>Next Steps:</strong></p>
  <ol>
    <li>Login to your QuickSolve tutor account</li>
    <li>Go to your dashboard</li>
    <li>Click on "Take Test" button</li>
  </ol>
  <p>The test will assess your knowledge in the subjects you selected. Good luck!</p>
  <br>
  <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/tutor/waiting-verification" 
     style="background: #006c4a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
    Go to Dashboard
  </a>
  <br><br>
  <p style="color: #666; font-size: 12px;">If you have any questions, please contact us at support@quicksolve.com</p>
</div>`

        await sendMail(
          tutorEmail,
          'QuickSolve - Subject Test Invitation',
          'You are invited to take the subject test. Login to your dashboard to start.',
          emailHtml
        )
      } catch (emailErr) {
        console.error('Failed to send test invitation email:', emailErr)
        // Don't fail the API if email fails
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Verification status updated',
      newStage,
      newStatus,
    })
    
  } catch (error: any) {
    console.error('Admin update verification error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update verification' },
      { status: 500 }
    )
  }
}



import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

type SubmittedDocument = {
  documentType?: string
}

// POST /api/tutor/submit-for-verification
// Tutor submits complete profile for admin verification
export async function POST(request: Request) {
  try {
    // 1. Verify authentication
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const session = await decrypt(token)
    if (!session?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }
    
    // 2. Verify user is a tutor
    const user = await DB.findUserByEmail(session.email as string)
    if (!user || user.role !== 'tutor') {
      return NextResponse.json({ error: 'Only tutors can submit for verification' }, { status: 403 })
    }
    
    // 3. Parse submission data
    const body = await request.json()
    const { personalDetails } = body
    const subjects = Array.isArray(body.subjects) ? body.subjects : []
    const degrees = Array.isArray(body.degrees) ? body.degrees : []
    const documents = Array.isArray(body.documents) ? body.documents : []
    
    // 4. Validate required data
    if (!subjects || subjects.length === 0) {
      return NextResponse.json({ error: 'At least one subject is required' }, { status: 400 })
    }
    
    if (!degrees || degrees.length === 0) {
      return NextResponse.json({ error: 'At least one degree is required' }, { status: 400 })
    }
    
    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'Required documents are missing' }, { status: 400 })
    }
    
    // Check for required documents
    const hasCnicFront = documents.some((d: SubmittedDocument) => d.documentType === 'cnic_front')
    const hasCnicBack = documents.some((d: SubmittedDocument) => d.documentType === 'cnic_back')
    const hasProfilePhoto = documents.some((d: SubmittedDocument) => d.documentType === 'profile_photo')
    
    if (!hasCnicFront || !hasCnicBack) {
      return NextResponse.json({ error: 'CNIC front and back images are required' }, { status: 400 })
    }
    
    if (!hasProfilePhoto) {
      return NextResponse.json({ error: 'Profile photo is required' }, { status: 400 })
    }
    
    // 5. Submit for verification
    await DB.submitProfileForVerification(session.email as string, {
      personalDetails,
      subjects,
      degrees,
      documents,
    })
    
    // 6. Add system note
    await DB.addVerificationNote(session.email as string, {
      noteType: 'system',
      message: 'Profile submitted for verification. Documents and degrees uploaded.',
      createdBy: 'system',
    })
    
    return NextResponse.json({ 
      success: true, 
      message: 'Profile submitted successfully. Your documents are under review.',
      status: 'pending',
    })
    
  } catch (error: unknown) {
    console.error('Submit for verification error:', error)
    const message = error instanceof Error ? error.message : 'Failed to submit profile'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}


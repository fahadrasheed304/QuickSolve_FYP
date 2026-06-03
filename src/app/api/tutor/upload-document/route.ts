import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/tutor/upload-document
// Uploads tutor documents (CNIC, degrees, profile photo) to Supabase Storage
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
    
    const email = session.email as string
    
    // 2. Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const documentType = formData.get('documentType') as string
    
    if (!file || !documentType) {
      return NextResponse.json({ error: 'Missing file or document type' }, { status: 400 })
    }
    
    // 3. Validate file
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size exceeds 5MB limit' }, { status: 400 })
    }
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Allowed: JPG, PNG, WebP, PDF' 
      }, { status: 400 })
    }

    if (['cnic_front', 'profile_photo'].includes(documentType) && !file.type.startsWith('image/')) {
      return NextResponse.json({
        error: documentType === 'profile_photo'
          ? 'Profile photo must be an image with a clear human face'
          : 'CNIC front must be an image',
      }, { status: 400 })
    }
    
    // 4. Generate unique filename
    const fileExt = file.name.split('.').pop()
    const fileName = `${email}/${documentType}_${Date.now()}.${fileExt}`
    
    // 5. Upload to Supabase Storage
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('tutor-documents')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: true,
      })
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }
    
    // 6. Get public URL
    const { data: publicUrlData } = supabaseAdmin
      .storage
      .from('tutor-documents')
      .getPublicUrl(fileName)
    
    const documentUrl = publicUrlData.publicUrl
    
    // 7. Save to database
    const docRecord = await DB.addDocument(email, {
      documentType,
      documentUrl,
      fileName: file.name,
      fileSize: file.size,
    })
    
    return NextResponse.json({
      success: true,
      documentId: docRecord.id,
      documentUrl,
      documentType,
    })
    
  } catch (error: unknown) {
    console.error('Document upload error:', error)
    const message = error instanceof Error ? error.message : 'Failed to upload document'
    return NextResponse.json(
      { error: message }, 
      { status: 500 }
    )
  }
}

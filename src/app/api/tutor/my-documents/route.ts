import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { getCurrentTutorDocuments } from '@/lib/tutor-documents'

// GET /api/tutor/my-documents
// Get all documents for the logged-in tutor
export async function GET() {
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
    
    const documents = getCurrentTutorDocuments(await DB.getDocuments(session.email as string))
    
    return NextResponse.json({ documents })
    
  } catch (error: any) {
    console.error('Get documents error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get documents' },
      { status: 500 }
    )
  }
}

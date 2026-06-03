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


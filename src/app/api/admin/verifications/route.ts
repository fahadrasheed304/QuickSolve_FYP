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
    

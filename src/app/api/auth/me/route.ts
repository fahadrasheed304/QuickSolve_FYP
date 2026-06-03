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

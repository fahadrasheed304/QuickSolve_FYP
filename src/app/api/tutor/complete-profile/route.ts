import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

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

    // Verify user is a tutor
    const user = await DB.findUserByEmail(session.email as string)
    if (!user || user.role !== 'tutor') {
      return NextResponse.json({ error: 'Only tutors can access this endpoint' }, { status: 403 })
    }

    const body = await request.json()
    const { subjects, highestEducation, university, city, experienceYears, bio } = body

    // Validate required fields
    if (!subjects || subjects.length === 0) {
      return NextResponse.json({ error: 'At least one subject is required' }, { status: 400 })
    }

    // Update tutor profile
    await DB.updateTutorProfile(session.email as string, {
      subjects: subjects,
      highest_education: highestEducation || '',
      university: university || '',
      city: city || '',
      experience_years: experienceYears || 0,
      bio: bio || '',
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully' 
    })

  } catch (error: any) {
    console.error('Complete profile error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update profile' },
      { status: 500 }
    )
  }
}

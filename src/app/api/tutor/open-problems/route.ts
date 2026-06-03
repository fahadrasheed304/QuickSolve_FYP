import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await decrypt(token)
    if (!session?.email || session.role !== 'tutor') {
      return NextResponse.json({ error: 'Invalid tutor session' }, { status: 401 })
    }

    const profile = await DB.getTutorProfile(session.email as string)
    if (!profile) {
      return NextResponse.json({ error: 'Tutor profile not found' }, { status: 404 })
    }

    if (profile.verification_status !== 'verified' && profile.verification_stage !== 'verified') {
      return NextResponse.json({ problems: [] })
    }

    if (profile.is_available === false) {
      return NextResponse.json({ problems: [] })
    }

    const subjects = Array.isArray(profile.subjects) ? profile.subjects : []
    const problems = await DB.getOpenProblemsForTutors(subjects)

    return NextResponse.json({ problems })
  } catch (error: unknown) {
    console.error('Tutor open problems error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

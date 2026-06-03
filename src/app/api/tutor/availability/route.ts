import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
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

    const body = await request.json()
    const isAvailable = Boolean(body.isAvailable)

    const profile = await DB.updateTutorProfile(session.email as string, {
      is_available: isAvailable,
    })

    return NextResponse.json({
      success: true,
      isAvailable: profile.is_available,
    })
  } catch (error: unknown) {
    console.error('Tutor availability update error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

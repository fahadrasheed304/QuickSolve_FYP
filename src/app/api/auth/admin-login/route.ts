import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { ADMIN_EMAIL, verifyAdminCredentials } from '@/lib/admin-auth'

export async function POST(request: Request) {
  try {
    if (!process.env.ADMIN_PASSWORD) return NextResponse.json({ error: 'Admin password is not configured' }, { status: 503 })
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
    }

    if (!verifyAdminCredentials(email, password)) {
      return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 })
    }

    const { session } = await createSession(ADMIN_EMAIL, ADMIN_EMAIL, 'admin')
    const response = NextResponse.json({
      success: true,
      role: 'admin',
      redirectTo: '/admin/dashboard',
    })

    response.cookies.set('auth_token', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // Session cookie: do not persist login across normal browser restarts.
      sameSite: 'lax',
      path: '/',
    })

    return response
  } catch (error: unknown) {
    console.error('Admin login error:', error)
    const message = error instanceof Error ? error.message : 'Failed to login as admin'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

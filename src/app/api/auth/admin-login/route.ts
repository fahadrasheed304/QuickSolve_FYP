import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { ADMIN_EMAIL, verifyAdminCredentials } from '@/lib/admin-auth'

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
    }

    if (!verifyAdminCredentials(email, password)) {
      return NextResponse.json({ error: 'Invalid admin credentials' }, { status: 401 })
    }

    const { session, expiresAt } = await createSession(ADMIN_EMAIL, ADMIN_EMAIL, 'admin')
    const response = NextResponse.json({
      success: true,
      role: 'admin',
      redirectTo: '/admin/verifications',
    })

    response.cookies.set('auth_token', session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
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

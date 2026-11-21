import { NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { ADMIN_EMAIL, verifyAdminCredentials } from '@/lib/admin-auth'
import { normalizeEmail } from '@/lib/auth-input-validation'

export async function POST(request: Request) {
  try {
    if (!process.env.ADMIN_PASSWORD) return NextResponse.json({ error: 'Admin password is not configured' }, { status: 503 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid admin login details' }, { status: 400 })
    }
    const { email, password } = body as Record<string, unknown>
    const normalizedEmail = normalizeEmail(email)
    if (!normalizedEmail || typeof password !== 'string' || !password || password.length > 512) {
      return NextResponse.json({ error: 'Enter the admin email and password.' }, { status: 400 })
    }

    if (!verifyAdminCredentials(normalizedEmail, password)) {
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

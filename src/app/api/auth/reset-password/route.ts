import { NextResponse } from 'next/server'
import { verifyResetToken } from '@/lib/auth'
import { DB } from '@/lib/db'
import { hashPassword } from '@/lib/password'
import { isStrongPassword, PASSWORD_REQUIREMENTS } from '@/lib/auth-input-validation'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid password reset details' }, { status: 400 })
    }
    const { token, newPassword } = body as Record<string, unknown>

    if (typeof token !== 'string' || !token) return NextResponse.json({ error: 'Reset token is required' }, { status: 400 })
    if (!isStrongPassword(newPassword)) return NextResponse.json({ error: PASSWORD_REQUIREMENTS }, { status: 400 })

    const email = await verifyResetToken(token)

    if (!email) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 })
    }

    // Verify user exists
    const user = await DB.findUserByEmail(email)
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    await DB.updateUserPassword(email, hashPassword(newPassword))

    return NextResponse.json({ success: true, message: "Password reset successfully" })

  } catch (caughtError: unknown) {
    const error = caughtError instanceof Error ? caughtError : new Error("Unexpected error")
    console.error("Reset password error:", error)
    return NextResponse.json({ error: error.message || "Failed to process request" }, { status: 500 })
  }
}

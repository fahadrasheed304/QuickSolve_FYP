import { NextResponse } from 'next/server'
import { verifyResetToken } from '@/lib/auth'
import { DB } from '@/lib/db'
import { hashPassword } from '@/lib/password'

export async function POST(request: Request) {
  try {
    const { token, newPassword } = await request.json()

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

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

  } catch (error: any) {
    console.error("Reset password error:", error)
    return NextResponse.json({ error: error.message || "Failed to process request" }, { status: 500 })
  }
}

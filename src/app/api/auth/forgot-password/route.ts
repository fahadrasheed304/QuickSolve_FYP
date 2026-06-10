import { NextResponse } from 'next/server'
import { DB } from '@/lib/db'
import { sendMail } from '@/lib/mail'
import { createResetToken } from '@/lib/auth'
import { getAppUrl } from '@/lib/app-url'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await DB.findUserByEmail(email)

    if (!user) {
      // Return success even if user not found to prevent email enumeration attacks
      return NextResponse.json({ success: true, message: "If an account exists, a reset link has been sent." })
    }

    const token = await createResetToken(email)
    
    const baseUrl = getAppUrl(request)
    const resetLink = `${baseUrl}/reset-password?token=${token}`

    const html = `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Password Reset Request</h2>
                    <p>We received a request to reset your QuickSolve password.</p>
                    <p>Click the link below to securely create a new password:</p>
                    <a href="${resetLink}" style="display:inline-block; padding: 10px 20px; background-color: #2563EB; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0;">Reset Password</a>
                    <p>If you didn't request this, you can safely ignore this email.</p>
                    <p>This link will expire in 15 minutes.</p>
                   </div>`

    const sent = await sendMail(email, 'Reset Your QuickSolve Password', `Reset your password here: ${resetLink}`, html)
    
    if (!sent) {
      return NextResponse.json({ error: "Failed to send email. Please try again later." }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "If an account exists, a reset link has been sent." })

  } catch (error: any) {
    console.error("Forgot password error:", error)
    return NextResponse.json({ error: error.message || "Failed to process request" }, { status: 500 })
  }
}

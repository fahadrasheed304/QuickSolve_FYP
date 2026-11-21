import { after, NextResponse } from 'next/server'
import { getPendingSignup, savePendingSignup, generateOtp } from '@/lib/pending-signups'
import { sendMail } from '@/lib/mail'
import { normalizeEmail } from '@/lib/auth-input-validation'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const normalizedEmail = body && typeof body === 'object' && !Array.isArray(body)
      ? normalizeEmail((body as Record<string, unknown>).email)
      : null
    if (!normalizedEmail) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    const pending = await getPendingSignup(normalizedEmail)

    if (!pending) {
      return NextResponse.json({ error: "No pending signup found for this email." }, { status: 400 })
    }

    // Generate new 6 digit OTP
    const newOtp = generateOtp()

    // Update pending signup with new OTP and refresh expiry
    const otpHash = await savePendingSignup(normalizedEmail, pending.user, newOtp)

    const html = `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>QuickSolve Update</h2>
                    <p>Here is your new secure verification code:</p>
                    <h1 style="color: #2563EB; font-size: 32px; letter-spacing: 5px;">${newOtp}</h1>
                    <p>This code will expire in 15 minutes.</p>
                   </div>`

    after(async () => {
      try {
        // Ignore stale resend callbacks if a newer code was requested meanwhile.
        const latest = await getPendingSignup(normalizedEmail)
        if (!latest || latest.otpHash !== otpHash) return

        const sent = await sendMail(
          normalizedEmail,
          'Your New QuickSolve Verification Code',
          `Your new OTP code is: ${newOtp}`,
          html,
        )
        if (!sent) console.error('Failed to send resent signup OTP email')
      } catch (error) {
        console.error('Resent signup OTP delivery failed:', error)
      }
    })

    return NextResponse.json(
      { success: true, message: 'Your new verification code is being sent. Check your inbox shortly.' },
      { status: 202 },
    )

  } catch (caughtError: unknown) {
    const error = caughtError instanceof Error ? caughtError : new Error("Unexpected error")
    console.error("Resend OTP error:", error)
    return NextResponse.json({ error: error.message || "Failed to resend OTP" }, { status: 500 })
  }
}

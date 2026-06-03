import { NextResponse } from 'next/server'
import { pendingSignups } from '@/lib/db'
import { sendMail } from '@/lib/mail'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const pending = pendingSignups[normalizedEmail]

    if (!pending) {
      return NextResponse.json({ error: "No pending signup found for this email." }, { status: 400 })
    }

    // Generate new 6 digit OTP
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString()

    // Update pending signup with new OTP and refresh expiry
    pendingSignups[normalizedEmail] = {
      ...pending,
      otp: newOtp,
      expires: Date.now() + 15 * 60 * 1000
    }

    const html = `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>QuickSolve Update</h2>
                    <p>Here is your new secure verification code:</p>
                    <h1 style="color: #2563EB; font-size: 32px; letter-spacing: 5px;">${newOtp}</h1>
                    <p>This code will expire in 15 minutes.</p>
                   </div>`

    const sent = await sendMail(normalizedEmail, 'Your New QuickSolve Verification Code', `Your new OTP code is: ${newOtp}`, html)

    if (sent) {
      return NextResponse.json({ success: true, message: "New OTP sent successfully" })
    } else {
      return NextResponse.json({ error: "Failed to send email. Please try again later." }, { status: 500 })
    }

  } catch (error: any) {
    console.error("Resend OTP error:", error)
    return NextResponse.json({ error: error.message || "Failed to resend OTP" }, { status: 500 })
  }
}

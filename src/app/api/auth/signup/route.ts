import { after, NextResponse } from "next/server";
import { DB } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { getPendingSignup, savePendingSignup, generateOtp } from "@/lib/pending-signups";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fullname, email, phone, password, role } = body;

    if (!email || !password || !fullname) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Check if user already exists (case-insensitive)
    const normalizedEmail = email.toLowerCase().trim();
    const requestedRole = role === "tutor" ? "tutor" : "student";
    const hasRequestedRole = await DB.userHasRole(
      normalizedEmail,
      requestedRole,
    );

    // Block SAME ROLE duplicate signups - different roles are OK
    if (hasRequestedRole) {
      return NextResponse.json(
        {
          error: "Email already registered for this role",
          message: `This email is already registered as a ${requestedRole}. Please log in instead.`,
        },
        { status: 400 },
      );
    }

    const pending = await getPendingSignup(normalizedEmail);
    const isRetryingPendingSignup =
      pending?.user?.role === requestedRole && Date.now() <= pending.expires;

    // Generate 6 digit OTP
    const otp = generateOtp();

    await savePendingSignup(normalizedEmail, {
      fullname, email: normalizedEmail, phone,
      password: hashPassword(password), role: requestedRole,
    }, otp);

    const html = `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Welcome to QuickSolve!</h2>
                    <p>Your secure verification code is:</p>
                    <h1 style="color: #2563EB; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                    <p>This code will expire in 15 minutes.</p>
                   </div>`;

    after(async () => {
      const sent = await sendMail(
        normalizedEmail,
        "Your QuickSolve Verification Code",
        `Your OTP code is: ${otp}`,
        html,
      );

      if (!sent) {
        // Keep the durable record so Resend code can retry delivery.
        console.error("Failed to send signup OTP email");
      }
    });

    // Respond immediately while the OTP email is sent after the response.
    return NextResponse.json({
      success: true,
      message: isRetryingPendingSignup
        ? "A new verification code is being sent"
        : "OTP email is being sent",
    });
  } catch (caughtError: unknown) {
    const error = caughtError instanceof Error ? caughtError : new Error("Unexpected error")
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create account" },
      { status: 500 },
    );
  }
}

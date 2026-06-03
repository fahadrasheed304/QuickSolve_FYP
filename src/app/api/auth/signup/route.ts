import { after, NextResponse } from "next/server";
import { DB, pendingSignups } from "@/lib/db";
import { sendMail } from "@/lib/mail";
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

    const pending = pendingSignups[normalizedEmail];
    const isRetryingPendingSignup =
      pending?.user?.role === requestedRole && Date.now() <= pending.expires;

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store temporarily for 15 minutes. If the user is retrying an unfinished
    // signup, refresh the pending details and send a fresh OTP instead of
    // blocking them with an error.
    // Include tutor-specific fields so verify-otp can create tutor_profile
    pendingSignups[normalizedEmail] = {
      otp,
      user: {
        fullname,
        email: normalizedEmail,
        phone,
        password: hashPassword(password),
        role: requestedRole,
      },
      expires: Date.now() + 15 * 60 * 1000,
    };

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

      const latestPending = pendingSignups[normalizedEmail];
      if (!sent && latestPending?.otp === otp) {
        delete pendingSignups[normalizedEmail];
        console.error(`Failed to send signup OTP email to ${normalizedEmail}`);
      }
    });

    // Respond immediately while the OTP email is sent after the response.
    return NextResponse.json({
      success: true,
      message: isRetryingPendingSignup
        ? "A new verification code is being sent"
        : "OTP email is being sent",
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create account" },
      { status: 500 },
    );
  }
}

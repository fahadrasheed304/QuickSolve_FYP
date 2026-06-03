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

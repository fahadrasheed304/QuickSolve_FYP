import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" })
  response.cookies.delete('auth_token')
  return response
}

// GET handler so you can logout by visiting /api/auth/logout in the browser
export async function GET() {
  const response = NextResponse.redirect(new URL('/signin-page', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'))
  response.cookies.delete('auth_token')
  return response
}

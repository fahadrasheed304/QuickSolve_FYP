import { NextResponse } from 'next/server'
import { getAppUrl } from '@/lib/app-url'

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out successfully" })
  response.cookies.delete('auth_token')
  return response
}

// GET handler so you can logout by visiting /api/auth/logout in the browser
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL('/signin-page', getAppUrl(request)))
  response.cookies.delete('auth_token')
  return response
}

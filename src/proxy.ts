import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  // Extract the "auth_token" from cookies
  const cookie = request.cookies.get('auth_token')?.value
  const session = await decrypt(cookie)

  // 1. Protect Student Routes
  if (request.nextUrl.pathname.startsWith('/student')) {
    if (!session) {
      return NextResponse.redirect(new URL('/signin-page', request.url))
    }
    if (session.role === 'admin') {
      return NextResponse.redirect(new URL('/admin/verifications', request.url))
    }
    // If student role tries to access tutor routes, redirect
    if (session.role === 'tutor') {
      return NextResponse.redirect(new URL('/tutor/waiting-verification', request.url))
    }
  }

  // 2. Protect Tutor Routes
  if (request.nextUrl.pathname.startsWith('/tutor')) {
    // Pages that don't require authentication (public auth pages)
    const isTutorPublicPage = [
      '/tutor/signin',
      '/tutor/signup',
      '/tutor/forgot-password',
      '/tutor/reset-password',
    ].includes(request.nextUrl.pathname)

    // Onboarding pages - accessible to logged-in tutors
    const isTutorOnboardingPage = [
      '/tutor/verify-email', // Can access with or without session
      '/tutor/complete-profile', // Need to be logged in but accessible
    ].includes(request.nextUrl.pathname)

    // Combined list for auth check
    const isTutorAuthPage = isTutorPublicPage || isTutorOnboardingPage

    // Protect non-auth tutor pages
    if (!isTutorAuthPage) {
      if (!session) {
        return NextResponse.redirect(new URL('/tutor/signin', request.url))
      }
      if (session.role === 'admin') {
        return NextResponse.redirect(new URL('/admin/verifications', request.url))
      }
      // If student role tries to access tutor dashboard, redirect
      if (session.role !== 'tutor') {
        return NextResponse.redirect(new URL('/student/dashboard', request.url))
      }
      
      // Note: Profile completion check happens on API level
      // Middleware can't easily check Supabase, so we rely on API/page-level checks
    }

    // Only redirect away from PUBLIC auth pages (not onboarding)
    // e.g., if logged-in tutor tries to access /tutor/signin, redirect to dashboard
    if (isTutorPublicPage && session && session.role === 'tutor') {
      return NextResponse.redirect(new URL('/tutor/waiting-verification', request.url))
    }
    if (isTutorPublicPage && session && session.role === 'admin') {
      return NextResponse.redirect(new URL('/admin/verifications', request.url))
    }
  }

  // 3. Protect Admin Routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const isAdminSigninPage = request.nextUrl.pathname === '/admin/signin'

    if (isAdminSigninPage && session?.role === 'admin') {
      return NextResponse.redirect(new URL('/admin/verifications', request.url))
    }

    if (!isAdminSigninPage) {
      if (!session) {
        return NextResponse.redirect(new URL('/admin/signin', request.url))
      }

      if (session.role !== 'admin') {
        const dest = session.role === 'tutor' ? '/tutor/waiting-verification' : '/student/dashboard'
        return NextResponse.redirect(new URL(dest, request.url))
      }
    }
  }

  // 4. Prevent logged in users from seeing student login/signup pages again
  if (
    request.nextUrl.pathname === '/signin-page' || 
    request.nextUrl.pathname === '/signup-page'
  ) {
    if (session) {
      const dest = session.role === 'admin'
        ? '/admin/verifications'
        : session.role === 'tutor'
          ? '/tutor/waiting-verification'
          : '/student/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }
  }

  return NextResponse.next()
}

// Ensure the middleware runs on student, tutor, and auth routes
export const config = {
  matcher: ['/student/:path*', '/tutor/:path*', '/admin/:path*', '/signin-page', '/signup-page'],
}

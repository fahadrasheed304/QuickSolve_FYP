import { AccessToken } from 'livekit-server-sdk'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    // Authenticate the user via session cookie
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    const payload = await decrypt(sessionToken)
    if (!payload?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const room = req.nextUrl.searchParams.get('room')
    if (!room) {
      return NextResponse.json({ error: 'Missing room parameter' }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: 'LiveKit credentials not configured' }, { status: 500 })
    }

    const identity = payload.email as string
    const name = (payload.fullname as string) || (payload.email as string)

    // Create access token with grants
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: '2h',
    })

    at.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    const token = await at.toJwt()
    return NextResponse.json({ token })
  } catch (err: any) {
    console.error('LiveKit token error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to generate token' },
      { status: 500 }
    )
  }
}

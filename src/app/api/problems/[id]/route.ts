import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('auth_token')?.value

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await decrypt(token)
    if (!session?.email) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const body = await request.json()
    const action = String(body.action || '')
    const { id } = await params

    if (!['cancel', 'accept'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
    }

    const problem = action === 'accept'
      ? await DB.acceptBidForStudent(id, session.email as string)
      : await DB.cancelProblemForStudent(id, session.email as string)

    return NextResponse.json({ success: true, problem })
  } catch (error: unknown) {
    console.error('Problem update error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

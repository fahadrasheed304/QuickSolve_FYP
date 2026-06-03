import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/wallet — fetch current user's wallet balance + transactions
export async function GET() {
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

    const wallet = await DB.getWalletBalance(session.email as string, (session.role as string) || 'student')
    if (!wallet) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      balance: wallet.balance,
      transactions: wallet.transactions,
    })
  } catch (error: any) {
    console.error('Wallet GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

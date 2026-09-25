import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

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

    let escrowBalance = 0
    if (session.role === 'student') {
      const { data, error } = await supabaseAdmin.from('session_escrows').select('amount')
        .eq('student_email', String(session.email).toLowerCase().trim()).eq('status', 'reserved')
      if (error) return NextResponse.json({ error: 'Wallet escrow is temporarily unavailable' }, { status: 503 })
      escrowBalance = (data || []).reduce((sum, row) => sum + Number(row.amount), 0)
    }
    return NextResponse.json({
      balance: wallet.balance,
      escrowBalance: Math.round(escrowBalance * 100) / 100,
      transactions: wallet.transactions.map(tx => ({ ...tx,
        type: tx.method === 'Session escrow' || tx.method === 'Session escrow extension' ? 'escrow' : tx.type,
      })),
    })
  } catch (caughtError: unknown) {
    const error = caughtError instanceof Error ? caughtError : new Error("Unexpected error")
    console.error('Wallet GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

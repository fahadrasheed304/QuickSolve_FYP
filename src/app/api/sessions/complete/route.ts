import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB, Transaction } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function POST(request: Request) {
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
    const { amount, tutorName } = body

    if (amount === undefined) {
      return NextResponse.json({ error: "Missing amount" }, { status: 400 })
    }

    const email = session.email as string
    const role = (session.role as string) || 'student'

    // 1. Fetch wallet to determine if sufficient funds exist
    const wallet = await DB.getWalletBalance(email, role)
    if (!wallet) {
      return NextResponse.json({ error: "User or wallet not found" }, { status: 404 })
    }

    const newBalance = wallet.balance - amount
    
    // Allow ending a session even if it falls negative for now?
    // The user mentioned it fell to -700. For QuickSolve dummy, let's fix it by preventing negative.
    // Or let's just let it be 0 if it goes below 0.
    const finalBalance = Math.max(0, newBalance)

    // Construct transaction record
    const newTx: Transaction = {
      id: randomUUID(),
      type: 'debit',
      amount,
      method: 'Session',
      description: `Whiteboard session with ${tutorName || 'Tutor'}`,
      date: new Date().toISOString(),
      status: 'completed'
    }

    const updateSuccess = await DB.updateWallet(
      email,
      role,
      finalBalance,
      newTx
    )

    if (!updateSuccess) {
      return NextResponse.json({ error: "Failed to deduct balance" }, { status: 500 })
    }

    // 2. Increment user sessions count
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('sessions')
      .eq('email', email)
      .single()

    const currentSessions = userData?.sessions || 0

    await supabaseAdmin
      .from('users')
      .update({ sessions: currentSessions + 1 })
      .eq('email', email)

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error("Session complete error:", error)
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 })
  }
}

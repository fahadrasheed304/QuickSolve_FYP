import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB, Transaction } from '@/lib/db'
import { randomUUID } from 'crypto'

// POST /api/wallet/topup — add money to wallet
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
    const { amount, method } = body

    const numAmount = parseInt(amount)
    if (!numAmount || numAmount < 100 || numAmount > 100000) {
      return NextResponse.json(
        { error: 'Amount must be between Rs. 100 and Rs. 100,000' },
        { status: 400 }
      )
    }

    const validMethods = ['easypaisa', 'jazzcash', 'bank']
    if (!validMethods.includes(method)) {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
    }

    const email = session.email as string
    const role = (session.role as string) || 'student'
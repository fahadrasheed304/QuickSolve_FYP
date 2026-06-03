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

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { DB } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase'

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

    const formData = await request.formData()
    const subject = formData.get('subject') as string
    const amount = Number(formData.get('amount'))
    const duration = Number(formData.get('duration'))
    const details = formData.get('details') as string | null
    const studentClass = formData.get('class') as string | null
    const image = formData.get('image') as File | null

    if (!subject || !amount || !duration) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    let imageUrl: string | undefined = undefined

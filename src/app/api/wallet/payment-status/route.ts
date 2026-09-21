import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session?.email || session.role !== 'student') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !/^cs_test_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: 'Invalid checkout ID' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('wallet_transactions').select('id')
    .eq('user_email', session.email).eq('user_role', 'student').eq('payment_reference', `stripe:${id}`).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to confirm payment yet' }, { status: 503 })
  return NextResponse.json({ credited: !!data })
}

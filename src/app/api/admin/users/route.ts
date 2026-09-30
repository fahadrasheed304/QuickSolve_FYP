import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { isAdminEmail } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const fields = 'id,email,fullname,phone,role,created_at'

async function authorize() {
  const session = await decrypt((await cookies()).get('auth_token')?.value)
  if (!session) return Response.json({ error: 'Please sign in as admin.' }, { status: 401 })
  if (session.role !== 'admin' || typeof session.email !== 'string' || !isAdminEmail(session.email)) {
    return Response.json({ error: 'Admin access required.' }, { status: 403 })
  }
}

export async function GET(request: Request) {
  const denied = await authorize()
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const page = Number(params.get('page') || 0)
  const role = params.get('role') || 'all'
  const search = (params.get('search') || '').trim()
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000 || !['all', 'student', 'tutor', 'admin'].includes(role)
    || search.length > 100 || /[(),%*\\"\x00-\x1f]/.test(search)) {
    return Response.json({ error: 'Invalid filter. Search by name or email without special query characters.' }, { status: 400 })
  }
  try {
    const users = []
    // Filter by registered roles, not the most recently selected login role.
    // Read in batches to avoid silently truncating accounts at the database row limit.
    for (let offset = 0; ; offset += 250) {
      let query = supabaseAdmin.from('users').select(fields)
      if (search) {
        const literal = search.replace(/_/g, '\\_')
        query = query.or(`fullname.ilike.%${literal}%,email.ilike.%${literal}%`)
      }
      const { data, error } = await query.order('created_at', { ascending: false }).order('id').range(offset, offset + 249)
      if (error) throw error
      if (!data?.length) break
      const emails = data.map(user => user.email)
      const results = await Promise.allSettled([
        supabaseAdmin.from('role_wallets').select('user_email,role').in('user_email', emails).limit(750),
        supabaseAdmin.from('tutor_profiles').select('user_email').in('user_email', emails).limit(250),
      ])
      const [wallets, profiles] = results.map(result => {
        if (result.status === 'rejected' || result.value.error) throw new Error('Roles unavailable')
        return result.value.data || []
      })
      for (const user of data) {
        const registered = new Set<string>([user.role])
        for (const wallet of wallets) if (wallet.user_email === user.email && 'role' in wallet && ['student', 'tutor'].includes(String(wallet.role))) registered.add(String(wallet.role))
        if (profiles.some(profile => profile.user_email === user.email)) registered.add('tutor')
        const roles = ['student', 'tutor', 'admin'].filter(value => registered.has(value))
        if (role === 'all' || roles.includes(role)) users.push({ ...user, roles })
      }
      if (data.length < 250) break
    }
    return Response.json({ users: users.slice(page * 25, page * 25 + 25), count: users.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Users could not be loaded. Please retry.' }, { status: 503 })
  }
}

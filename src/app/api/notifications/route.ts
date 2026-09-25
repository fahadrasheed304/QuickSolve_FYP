import { notificationAccount } from '@/lib/notification-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const account = await notificationAccount()
  if (!account) return Response.json({ error: 'Login required' }, { status: 401 })
  const { data, error } = await supabaseAdmin.from('notifications')
    .select('id,kind,problem_id,message,created_at,read_at')
    .eq('recipient_email', account.email).eq('recipient_role', account.role)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50)
  if (error) return Response.json({ error: 'Notifications are temporarily unavailable' }, { status: 503 })
  return Response.json({ notifications: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: Request) {
  const account = await notificationAccount()
  if (!account) return Response.json({ error: 'Login required' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const ids = body?.ids
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return Response.json({ error: 'Invalid notification IDs' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('recipient_email', account.email).eq('recipient_role', account.role).in('id', ids).is('read_at', null)
  if (error) return Response.json({ error: 'Could not mark notifications as read' }, { status: 503 })
  return Response.json({ success: true })
}

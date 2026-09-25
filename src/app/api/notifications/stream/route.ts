import { notificationAccount } from '@/lib/notification-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const account = await notificationAccount()
  if (!account) return new Response('Login required', { status: 401 })
  // Fail explicitly when the migration has not been applied.
  const { error } = await supabaseAdmin.from('notifications').select('id').limit(0)
  if (error) return new Response('Notifications unavailable', { status: 503 })
  const encoder = new TextEncoder()
  let cleanup = () => {}
  const body = new ReadableStream({
    start(controller) {
      let closed = false
      const channel = supabaseAdmin.channel(`notifications:${crypto.randomUUID()}`)
      const send = (event: string) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`))
      }
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keepalive\n\n'))
      }, 15000)
      // Rotate before host timeouts and reauthenticate on every reconnection.
      const lifetime = setTimeout(() => cleanup(), Math.max(0, Math.min(55000, account.expiresAt - Date.now())))
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        clearTimeout(lifetime)
        request.signal.removeEventListener('abort', cleanup)
        void supabaseAdmin.removeChannel(channel)
        try { controller.close() } catch { /* Reader already cancelled. */ }
      }
      request.signal.addEventListener('abort', cleanup, { once: true })
      if (request.signal.aborted) { cleanup(); return }
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications', filter: `recipient_email=eq.${account.email}`,
      }, payload => {
        // The server uses a privileged client: always enforce both account and role.
        const row = payload.new as { recipient_email?: string; recipient_role?: string }
        if (row.recipient_email === account.email && row.recipient_role === account.role) send('changed')
      }).subscribe(status => {
        if (closed) return
        if (status === 'SUBSCRIBED') send('ready')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') cleanup()
      })
    },
    cancel() { cleanup() },
  })
  return new Response(body, { headers: {
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  } })
}

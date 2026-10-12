import { after } from 'next/server'
import { deliverEmailAlerts } from '@/lib/email-alerts'

// The durable outbox remains the retry source; successful actions also wake delivery.
export function dispatchEmailAlerts(request: Request) {
  after(async () => {
    try {
      await deliverEmailAlerts(request)
    } catch (error) {
      console.error('Post-action email delivery failed; queued alerts will retry:', error)
    }
  })
}

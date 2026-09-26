import Link from 'next/link'
import { SessionPayments } from '@/components/session-payments'

export default function TutorHistoryPage() {
  return <main className="space-y-6 p-4 pb-20 md:p-8">
    <h1 className="text-3xl font-bold">Teaching history</h1>
    <p>Browse saved session payments, student reviews and payment decisions.</p>
    <Link href="/tutor/wallet" className="inline-block font-bold text-primary">View wallet, earnings and transaction history</Link>
    <SessionPayments />
  </main>
}

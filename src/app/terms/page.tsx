import Link from 'next/link'

const sections = [
  {
    title: 'Accounts',
    body: 'You are responsible for the information you provide, keeping your login details secure, and using QuickSolve only for lawful learning or tutoring purposes.',
  },
  {
    title: 'Tutor Verification',
    body: 'Tutors may be asked to submit identity, education, profile, and test information. QuickSolve may approve, reject, or request updated information before a tutor can teach.',
  },
  {
    title: 'Sessions and Conduct',
    body: 'Students and tutors must communicate respectfully, avoid cheating or impersonation, and not share harmful, illegal, or abusive content during sessions.',
  },
  {
    title: 'Payments',
    body: 'Wallet balances, top-ups, payouts, and session charges are shown inside the app. Disputes should be reported promptly so our team can review the activity.',
  },
  {
    title: 'Scheduled Group Classes',
    body: 'Class time, topic, per-student fee and maximum seats are fixed when published. Booking reserves the fee from your wallet. Student cancellation at least two hours before start gets a full refund; late cancellation or student absence is charged if the class takes place. Tutor cancellation or failure to join within ten minutes of the announced start refunds reserved fees. Join opens ten minutes before start. Report payment issues within twenty minutes after class ends; disputed, early-ended or insufficient-attendance classes require administrator payment review. Recorded group classes require recording consent, and booked students have a fifteen-minute download window for each available recording part.',
  },
  {
    title: 'Platform Changes',
    body: 'We may update features, pricing, verification requirements, or these terms as the service improves. Continued use means you accept the latest version.',
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-text-main">
      <section className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
        <Link href="/signup-page" className="text-sm font-bold text-primary hover:underline">
          Back
        </Link>
        <h1 className="mt-6 text-3xl font-black">Terms of Service</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">
          These terms explain the basic rules for using QuickSolve as a student, tutor, or administrator.
        </p>

        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-bold">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-text-muted">{section.body}</p>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}

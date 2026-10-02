import Link from 'next/link'

const sections = [
  {
    title: 'Information We Collect',
    body: 'We collect account details, contact information, tutor verification documents, test activity, wallet records, and session-related information needed to operate QuickSolve.',
  },
  {
    title: 'How We Use Information',
    body: 'We use information to create accounts, verify tutors, match students with tutors, process payments, protect the platform, and provide support.',
  },
  {
    title: 'Camera and Test Data',
    body: 'During tutor tests, camera access may be used for identity and proctoring checks. QuickSolve uses this to reduce impersonation and test misuse.',
  },
  {
    title: 'Session Recordings',
    body: 'When recording is enabled, session audio, video and shared screens are recorded for administrator dispute review. Recordings are stored privately and playback is restricted to administrators. They become eligible for automatic deletion 20 minutes after the session ends. Recordings linked to held payments remain until an administrator resolves the payment and the retention window has passed. Deletion occurs during scheduled cleanup.',
  },
  {
    title: 'Sharing',
    body: 'We do not sell personal information. We may share limited data with service providers, payment systems, or administrators when needed to run and protect the platform.',
  },
  {
    title: 'Your Choices',
    body: 'You can contact QuickSolve support to request account help, correction of profile information, or review of verification and session records.',
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-text-main">
      <section className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
        <Link href="/signup-page" className="text-sm font-bold text-primary hover:underline">
          Back
        </Link>
        <h1 className="mt-6 text-3xl font-black">Privacy Policy</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">
          This policy explains how QuickSolve handles information used for accounts, tutoring, verification, payments, and safety.
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

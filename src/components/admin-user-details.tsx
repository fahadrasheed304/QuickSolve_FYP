'use client'

import { useEffect, useRef, useState } from 'react'
import { AdminSessionAttendance } from '@/components/admin-session-attendance'
import { AdminActivityHistory } from '@/components/admin-activity-history'
import { AdminAccountModeration } from '@/components/admin-account-moderation'
import { AdminDocumentPreview, documentUrl } from '@/components/admin-document-preview'
import { getCurrentTutorDocuments } from '@/lib/tutor-documents'
import { X, UserRound, BookOpen, Star, Wallet, ShieldCheck } from 'lucide-react'

type User = { id: string; email: string; fullname: string; phone: string | null; role: string; roles?: string[]; created_at: string }
type Row = Record<string, string | number | boolean | string[] | null>
type Details = { studentReviews: Row[] | null; user: User; studentSessions: Row[] | null; tutorSessions: Row[] | null; studentPayments: Row[] | null; tutorPayments: Row[] | null; profile: Row | null; degrees: Row[] | null; tests: Row[] | null; wallets: Row[] | null; documents: Row[] | null; warnings: string[] }
const display = (value: unknown) => value === null || value === undefined || value === '' ? 'Not provided' : Array.isArray(value) ? value.join(', ') || 'Not provided' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value).replaceAll('_', ' ')
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
function Fields({ fields }: { fields: [string, unknown][] }) {
  return <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="break-words text-sm font-medium">{display(value)}</dd></div>)}</dl>
}
function HistoryPager({ page, count, onPage, label }: { page: number; count: number; onPage: (value: number) => void; label: string }) {
  const style = 'rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50'
  return <nav aria-label={label + ' pagination'} className="flex items-center gap-3"><button className={style} disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><span className="text-sm">Page {page + 1} of {Math.max(1, Math.ceil(count / 10))}</span><button className={style} disabled={(page + 1) * 10 >= count} onClick={() => onPage(page + 1)}>Next</button></nav>
}
function Activity({ title, sessions, payments, tutor, received = null }: { title: string; sessions: Row[] | null; payments: Row[] | null; tutor: boolean; received?: Row[] | null }) {
  const [sessionPage, setSessionPage] = useState(0)
  const [reviewPage, setReviewPage] = useState(0)
  const rated = payments?.filter(row => Number(row.rating) > 0 && Number(row.rating) <= 5)
  const average = rated?.length ? (rated.reduce((sum, row) => sum + Number(row.rating), 0) / rated.length).toFixed(2) : null
  const recent = sessions ? [...sessions].filter(row => row.session_started_at).sort((a, b) => String(b.session_started_at).localeCompare(String(a.session_started_at))) : []
  const stats = [
    ['Sessions started', sessions ? sessions.filter(row => row.session_started_at).length : 'Unavailable'],
    ['Sessions ended', sessions ? sessions.filter(row => row.session_started_at && row.session_ended_at).length : 'Unavailable'],
    [tutor ? "Tutor rating" : "Student rating", tutor ? payments ? average ? average + " / 5" : "Not rated yet" : "Unavailable" : received ? received.length ? (received.reduce((sum, row) => sum + Number(row.rating), 0) / received.length).toFixed(2) + " / 5" : "Not rated yet" : "Unavailable"],
    ['Open disputes', payments ? payments.filter(row => row.dispute && row.status === 'held').length : 'Unavailable'],
  ]
  return <section className="space-y-5"><h3 className="flex items-center gap-2 text-lg font-bold"><BookOpen size={20} className="text-blue-500" />{title}</h3>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-blue-500/5 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}</div>
    {!tutor && <p className="rounded-xl bg-amber-500/10 p-3 text-sm">Student rating is feedback received from tutors. Payment reviews below are ratings the student gave to tutors.</p>}
    <p className="text-sm text-muted-foreground">{rated ? `${rated.length} ${tutor ? 'received' : 'submitted'} reviews${!tutor && average ? ` · Average rating given: ${average}/5` : ''}` : 'Reviews unavailable'} · {payments ? `${payments.filter(row => row.status === 'refunded').length} refunded payments` : 'Payments unavailable'}</p>
    <h4 className="text-sm font-bold">Session history <span className="font-normal text-muted-foreground">({recent.length} records)</span></h4>
    {!sessions ? <p>Session history unavailable.</p> : !recent.length ? <p className="text-sm text-muted-foreground">No started sessions yet.</p> : <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr>{['Subject', 'Class', 'Started', 'Session', 'Attendance'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{recent.slice(sessionPage * 10, sessionPage * 10 + 10).map(row => <tr className="border-t border-border" key={String(row.id)}><td className="p-3">{display(row.subject)}</td><td className="p-3">{display(row.class)}</td><td className="p-3 whitespace-nowrap">{date(row.session_started_at)}</td><td className="p-3">{row.session_ended_at ? 'Ended' : 'End not recorded'}</td><td className="p-3"><AdminSessionAttendance sessionId={String(row.id)} /></td></tr>)}</tbody></table></div>}
    <HistoryPager page={sessionPage} count={recent.length} onPage={setSessionPage} label="sessions" />
    <h4 className="flex items-center gap-2 text-sm font-bold"><Star size={16} /> Reviews & payment outcomes</h4>
    {payments && !payments.length && <p className="text-sm text-muted-foreground">No reviews or payment records yet.</p>}
    {payments && [...payments].sort((a, b) => String(b.release_at).localeCompare(String(a.release_at))).slice(reviewPage * 10, reviewPage * 10 + 10).map(row => <article key={String(row.problem_id)} className="rounded-xl border border-border p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{Number(row.rating) > 0 ? `${row.rating}/5 stars` : 'Not rated'} · {display(row.status)}</span><span>PKR {Number(row.amount).toLocaleString()}</span></div><p className="mt-1 text-xs text-muted-foreground">{tutor ? 'Student' : 'Tutor'}: {display(tutor ? row.student_email : row.tutor_email)}</p>{row.feedback && <p className="mt-3 whitespace-pre-wrap break-words">{String(row.feedback)}</p>}{row.dispute && <p className="mt-2 break-words text-amber-600">Dispute: {String(row.dispute)}</p>}</article>)}
    <HistoryPager page={reviewPage} count={payments?.length || 0} onPage={setReviewPage} label="reviews and payments" />
  </section>
}

export function UserDetailsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<Details | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState('overview')
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    element.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setError(''); setData(null)
      try {
        const response = await fetch(`/api/admin/users/detail?email=${encodeURIComponent(user.email)}`, { cache: 'no-store', signal: controller.signal })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Details unavailable.')
        if (!controller.signal.aborted) setData(result)
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Details unavailable.') }
    }
    void load()
    return () => controller.abort()
  }, [user.email, retry])
  const documents = getCurrentTutorDocuments((data?.documents || []).map(row => ({ ...row, file_name: String(row.file_name || ""), id: String(row.id), document_type: String(row.document_type || ''), document_url: typeof row.document_url === 'string' ? row.document_url : null, uploaded_at: typeof row.uploaded_at === 'string' ? row.uploaded_at : null })))
  const photo = documentUrl(documents.find(row => row.document_type === 'profile_photo')?.document_url)
  const roles = user.roles || [user.role]
  const tutor = roles.includes('tutor') || !!data?.profile || !!data?.tutorSessions?.length
  return <dialog ref={dialog} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }} aria-labelledby="account-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-3xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm">
    <div className="flex max-h-[90dvh] flex-col">
      <header className="relative shrink-0 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-700 p-6 text-white sm:p-8"><button autoFocus onClick={onClose} aria-label="Close account details" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 hover:bg-white/20"><X size={20} /></button><div className="flex items-center gap-4 pr-8"><div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-2xl font-bold">{photo ? <AdminDocumentPreview key={photo} url={photo} label={user.fullname + " profile photo"} avatar /> : user.fullname?.slice(0, 1).toUpperCase() || <UserRound />}</div><div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-blue-200">{roles.join(" + ")} account</p><h2 id="account-title" className="text-2xl font-bold">{user.fullname || 'Account details'}</h2><p className="mt-1 break-all text-sm text-blue-100">{user.email}</p></div></div></header>
      <nav aria-label="Account detail sections" className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-6 py-3">{[['overview', 'Overview'], ['history', 'Activity records'], ['safety', 'Safety & restrictions'], ['student', 'Student activity'], ...(tutor ? [['tutor', 'Tutor profile & activity']] : [])].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-blue-600 text-white' : 'hover:bg-muted'}`}>{label}</button>)}</nav>
      <div className="overflow-y-auto p-6 sm:p-8">
        {error ? <div role="alert"><p>{error}</p><button className="mt-3 text-primary underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : !data ? <p role="status" className="py-12 text-center text-muted-foreground">Loading profile and activity…</p> : <div className="space-y-7">
          {!!data.warnings.length && <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm">Some information is unavailable: {data.warnings.join(', ')}. <button className="underline" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
          {tab === 'overview' && <><section className="rounded-2xl border border-border p-5"><h3 className="mb-5 flex items-center gap-2 font-bold"><UserRound size={19} /> Personal information</h3><Fields fields={[[ 'Full name', data.user.fullname ], ['Email', data.user.email], ['Phone', data.user.phone], ['Registered roles', roles.join(' + ')], ['Registered', date(data.user.created_at)], ['Account ID', data.user.id]]} /></section><section className="rounded-2xl border border-border p-5"><h3 className="mb-4 flex items-center gap-2 font-bold"><Wallet size={19} /> Wallet balances</h3>{data.wallets ? data.wallets.length ? <Fields fields={data.wallets.map(row => [`${display(row.role)} wallet`, `PKR ${Number(row.balance).toLocaleString()}`])} /> : <p className="text-sm text-muted-foreground">No wallets created.</p> : <p>Wallets unavailable.</p>}</section><p className="text-xs text-muted-foreground">Account information is read-only. Use the activity tabs to review sessions and feedback.</p></>}
          {tab === 'history' && <AdminActivityHistory email={user.email} />}
          {tab === 'safety' && <AdminAccountModeration email={user.email} role={user.role} payments={data.studentPayments && data.tutorPayments ? Array.from(new Map([...data.studentPayments, ...data.tutorPayments].map(row => [row.problem_id, row])).values()) : null} />}
          {tab === 'student' && <Activity received={data.studentReviews} title="Learning activity" sessions={data.studentSessions} payments={data.studentPayments} tutor={false} />}
          {tab === 'tutor' && <><section className="rounded-2xl border border-border p-5"><h3 className="mb-5 flex items-center gap-2 font-bold"><ShieldCheck size={19} /> Tutor profile</h3>{data.profile ? <Fields fields={Object.entries(data.profile).map(([key, value]) => [key.replaceAll('_', ' '), value])} /> : <p>Tutor profile not available.</p>}</section><section><h3 className="mb-4 text-lg font-bold">Qualifications</h3>{data.degrees?.length ? data.degrees.map(row => <div key={String(row.id)} className="mb-3 rounded-xl border border-border p-4"><Fields fields={Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) => [key.replaceAll('_', ' '), value])} /></div>) : <p className="text-sm text-muted-foreground">{data.degrees ? 'No qualifications submitted.' : 'Qualifications unavailable.'}</p>}</section><section><h3 className="mb-4 text-lg font-bold">Assessment history</h3>{data.tests?.length ? data.tests.map(row => <div key={String(row.id)} className="mb-3 rounded-xl border border-border p-4"><Fields fields={Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) => [key.replaceAll('_', ' '), key === 'test_date' ? date(value) : value])} /></div>) : <p className="text-sm text-muted-foreground">{data.tests ? 'No assessments taken.' : 'Assessments unavailable.'}</p>}</section><section><h3 className="mb-4 text-lg font-bold">Submitted documents</h3>{data.documents?.length ? documents.map(row => <div className="mb-3 rounded-xl border border-border p-4" key={String(row.id)}><div className="mb-4">{documentUrl(row.document_url) && (/\.(png|jpe?g|webp|gif|avif|bmp)(?:[?#]|$)/i.test(String(row.document_url)) || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(String(row.file_name)) || row.document_type === "profile_photo") ? <AdminDocumentPreview key={String(row.document_url)} url={documentUrl(row.document_url)!} label={display(row.document_type)} /> : documentUrl(row.document_url) ? <AdminDocumentPreview key={String(row.document_url)} url={documentUrl(row.document_url)!} label={display(row.document_type)} pdf /> : <p className="text-sm text-muted-foreground">Preview unavailable</p>}</div><Fields fields={[["Type", row.document_type], ["File", row.file_name], ["Uploaded", date(row.uploaded_at)]]} /></div>) : <p className="text-sm text-muted-foreground">{data.documents ? "No documents submitted." : "Documents unavailable."}</p>}</section><Activity title="Teaching activity" sessions={data.tutorSessions} payments={data.tutorPayments} tutor /></>}
        </div>}
      </div>
    </div>
  </dialog>
}

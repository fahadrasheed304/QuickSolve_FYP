import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, CheckCircle2, Clock3, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useBidsStore } from '@/stores/bids-store'
import { notifyError, notifySuccess } from '@/lib/toast'

const SUBJECTS_MATRIC = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'Computer Science', 'General Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies'
]
const SUBJECTS_INTER = [
  'Mathematics (FSc)', 'Physics (FSc)', 'Chemistry (FSc)', 'Biology (FSc)',
  'Computer Science (ICS)', 'Statistics (ICS)', 'Economics (FA/ICS)', 
  'Accounting (ICom)', 'Business Math (ICom)', 'Principles of Commerce (ICom)',
  'Education (FA)', 'Sociology (FA)',
  'English (Compulsory)', 'Urdu (Compulsory)', 'Islamic Studies (Compulsory)', 'Pakistan Studies (Compulsory)'
]

const DURATIONS = [
  { label: '15 min', price: 200, value: 15 },
  { label: '30 min', price: 400, value: 30 },
  { label: '45 min', price: 600, value: 45 },
  { label: '60 min', price: 800, value: 60 },
]

export default function PostProblemPage() {
  const router = useRouter()
  const postProblem = useBidsStore((state) => state.postProblem)
  const [activeClass, setActiveClass] = useState('10th')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedDuration, setSelectedDuration] = useState(30)
  const [offerPrice, setOfferPrice] = useState('400')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [details, setDetails] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)

  const isInter = ['1st Year', '2nd Year'].includes(activeClass)
  const subjects = isInter ? SUBJECTS_INTER : SUBJECTS_MATRIC

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSubject) {
      notifyError('Please select a subject before posting your problem.')
      return
    }

    setIsSubmitting(true)
    const success = await postProblem(selectedSubject, parseInt(offerPrice) || 400, selectedDuration, details, activeClass, imageFile)
    setIsSubmitting(false)
    if (success) {
      notifySuccess('Your problem has been posted. Tutors can now place bids.')
      setShowSuccess(true)
    } else {
              notifyError('We could not post your problem. Please check your details and try again.')
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-4xl qs-page-enter">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <div className="qs-kicker rounded-full px-3 py-1.5">
            <UploadCloud className="h-4 w-4" />
            New problem request
          </div>
          <h1 className="mt-4 text-4xl font-black text-text-main">Post Your Problem</h1>
          <p className="mt-2 text-text-muted">Details / Preferences / Confirm</p>
        </div>

        <Card>
          <CardContent className="p-5 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-3">
                <label className="text-sm font-bold text-text-main">Your Class</label>
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-hover p-1 sm:grid-cols-4">
                  {['9th', '10th', '1st Year', '2nd Year'].map((cls) => (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => { setActiveClass(cls); setSelectedSubject('') }}
                      className={cn(
                        "rounded-lg px-3 py-2 text-sm font-bold transition-all",
                        activeClass === cls ? "bg-surface text-primary shadow-sm" : "text-text-muted hover:text-text-main"
                      )}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-text-main">Select Subject <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {subjects.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setSelectedSubject(sub)}
                      className={cn(
                        "rounded-lg border p-3 text-left text-sm font-bold transition-all",
                        selectedSubject === sub
                          ? "border-primary bg-primary-subtle text-primary shadow-sm"
                          : "border-border bg-surface hover:border-primary/40 hover:bg-surface-hover text-text-main"
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
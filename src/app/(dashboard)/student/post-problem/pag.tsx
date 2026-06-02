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
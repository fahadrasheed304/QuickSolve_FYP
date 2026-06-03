

"use client"

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, BookOpen, GraduationCap, FileText, Camera, ChevronRight, ChevronLeft, Plus, X, Upload, Eye, AlertCircle, User, ShieldCheck, MapPin, Hash, ClipboardCheck, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { getApiMessage, notifyError, notifySuccess, notifyWarning } from '@/lib/toast'
import Tesseract from 'tesseract.js'

// Available subjects
const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'Computer Science', 'General Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies',
  'Mathematics (FSc)', 'Physics (FSc)', 'Chemistry (FSc)', 'Biology (FSc)',
  'Computer Science (ICS)', 'Statistics (ICS)', 'Economics (FA/ICS)', 
  'Accounting (ICom)', 'Business Math (ICom)', 'Principles of Commerce (ICom)',
  'Education (FA)', 'Sociology (FA)',
  'English (Compulsory)', 'Urdu (Compulsory)', 'Islamic Studies (Compulsory)', 'Pakistan Studies (Compulsory)'
]

// Degree categories
const SCHOOL_DEGREES = [
  'Matriculation (Science)',
  'Matriculation (Arts)',
  'O Levels',
  'A Levels',
  'FSc Pre-Medical',
  'FSc Pre-Engineering',
  'ICS (Computer Science)',
  'ICS (Statistics)',
  'ICS (Physics)',
  'ICom (Commerce)',
  'FA (Arts)',
  'FA (Humanities)',
  'FA (General Science)',
  'DAE Civil',
  'DAE Electrical',
  'DAE Mechanical',
  'DAE Electronics',
  'DAE Computer Information Technology',
  'DAE Chemical',
  'DAE Auto and Diesel',
]

const UNIVERSITY_DEGREES = [
  'ADP Computer Science',
  'ADP Commerce',
  'ADP Arts',
  'ADP Science',
  'ADP Education',
  'BA',
  'BSc',
  'BCom',
  'BBA',
  'BS Accounting and Finance',
  'BS Agriculture',
  'BS Applied Psychology',
  'BS Artificial Intelligence',
  'BS Aviation Management',
  'BS Biochemistry',
  'BS Bioinformatics',
  'BS Biotechnology',
  'BS Botany',
  'BS Business Analytics',

'BS Business Administration',
  'BS Chemistry',
  'BS Civil Engineering',
  'BS Commerce',
  'BS Computer Engineering',
  'BS Computer Science',
  'BS Cyber Security',
  'BS Data Science',
  'BS Economics',
  'BS Education',
  'BS Electrical Engineering',
  'BS Electronics',
  'BS English',
  'BS Environmental Sciences',
  'BS Finance',
  'BS Food Science and Technology',
  'BS Information Technology',
  'BS International Relations',
  'BS Islamic Studies',
  'BS Law',
  'BS Mathematics',
  'BS Mechanical Engineering',
  'BS Media and Communication Studies',
  'BS Microbiology',
  'BS Physics',
  'BS Political Science',
  'BS Psychology',
  'BS Public Administration',
  'BS Software Engineering',
  'BS Sociology',
  'BS Statistics',
  'BS Urdu',
  'BS Zoology',
  'BEd',
  'BEd Hons',
  'LLB',
  'MBBS',
  'BDS',
  'DPT',
  'Pharm D',
  'DVM',
  'BArch',
  'BE Civil Engineering',
  'BE Electrical Engineering',
  'BE Mechanical Engineering',
  'BE Software Engineering',
  'BE Computer Systems Engineering',
  'MSc Mathematics',
  'MSc Physics',
  'MSc Chemistry',
  'MSc Biology',
  'MSc Botany',
  'MSc Zoology',
  'MSc Computer Science',
  'MSc Statistics',
  'MA English',
  'MA Urdu',
  'MA Education',
  'MA Islamic Studies',
  'MA Economics',
  'MA Political Science',
  'MA International Relations',
  'MA Psychology',
  'MA Sociology',
  'MCom',
   'MBA',
  'MPA',
  'MEd',
  'LLM',
  'MS Computer Science',
  'MS Software Engineering',
  'MS Data Science',
  'MS Artificial Intelligence',
  'MS Cyber Security',
  'MS Mathematics',
  'MS Physics',
  'MS Chemistry',
  'MS Biology',
  'MS Biotechnology',
  'MS Economics',
  'MS Education',
  'MS Management Sciences',
  'MS Electrical Engineering',
  'MS Mechanical Engineering',
  'MS Civil Engineering',
  'MPhil Computer Science',
  'MPhil Mathematics',
  'MPhil Physics',
  'MPhil Chemistry',
  'MPhil Biology',
  'MPhil English',
  'MPhil Urdu',
  'MPhil Education',
  'MPhil Economics',
  'MPhil Islamic Studies',
  'PhD Computer Science',
  'PhD Mathematics',
  'PhD Physics',
  'PhD Chemistry',
  'PhD Biology',
  'PhD English',
  'PhD Education',
  'PhD Economics',
  'PhD Engineering',
  'PhD Management Sciences',
]

const DEGREE_NAMES = [...SCHOOL_DEGREES, ...UNIVERSITY_DEGREES, 'Other']

// Boards for school-level degrees
const PAKISTAN_BOARDS = [
  'Lahore Board',
  'Federal Board (Islamabad)',
  'Rawalpindi Board',
  'Karachi Board',
  'Peshawar Board',
  'Quetta Board',
  'Multan Board',
  'Gujranwala Board',
  'Faisalabad Board',
  'Sargodha Board',
  'Bahawalpur Board',
  'Dera Ghazi Khan Board',
  'Sahiwal Board',
  'Other Board',
]

// Helper to check if degree is school-level
const isSchoolDegree = (degreeName: string) => SCHOOL_DEGREES.some(d => degreeName?.includes(d?.split(' ')[0])) || 
  ['Matriculation', 'FSc', 'ICS', 'ICom', 'FA'].some(prefix => degreeName?.startsWith(prefix))
  interface Degree {
  id: string
  degreeName: string
  institution: string
  boardUniversity: string
  yearCompleted: string
}

interface Document {
  id: string
  documentType: string
  documentUrl: string
  fileName: string
  fileSize: number
}

interface DegreeRow {
  id: string
  degree_name: string
  institution: string
  board_university: string
  year_completed: string
}

interface DocumentRow {
  id: string
  document_type: string
  document_url: string
  file_name: string
  file_size: number
}

const CNIC_LENGTH = 13

type CnicOcrVariant = {
  name: string
  source: string | File
}

type CnicCrop = {
  name: string
  x: number
  y: number
  width: number
  height: number
}

const CNIC_OCR_CROPS: CnicCrop[] = [
  { name: 'full-enhanced', x: 0, y: 0, width: 1, height: 1 },
  { name: 'lower-text-band', x: 0, y: 0.42, width: 1, height: 0.52 },
  { name: 'right-number-area', x: 0.32, y: 0.32, width: 0.66, height: 0.55 },
  { name: 'left-number-area', x: 0, y: 0.34, width: 0.72, height: 0.55 },
]

// Build several OCR-friendly versions because CNIC photos vary a lot in glare,
// rotation, contrast, and where the identity number appears.
const createCnicOcrVariants = (file: File): Promise<CnicOcrVariant[]> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.src = objectUrl
    img.onload = () => {
      const variants: CnicOcrVariant[] = [{ name: 'original', source: file }]
      const minWidth = 1400
       const maxWidth = 2200
      const scale = img.width < minWidth ? minWidth / img.width : img.width > maxWidth ? maxWidth / img.width : 1

      const renderVariant = (crop: CnicCrop, threshold: boolean) => {
        const sourceX = Math.round(img.width * crop.x)
        const sourceY = Math.round(img.height * crop.y)
        const sourceWidth = Math.round(img.width * crop.width)
        const sourceHeight = Math.round(img.height * crop.height)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(sourceWidth * scale)
        canvas.height = Math.round(sourceHeight * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.imageSmoothingEnabled = true
        ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          let gray = 0.299 * r + 0.587 * g + 0.114 * b
          gray = (gray - 128) * 2.55 + 145
          gray = Math.max(0, Math.min(255, gray))
          if (threshold) {
            gray = gray > 150 ? 255 : 0
          }

          data[i] = gray
          data[i + 1] = gray
          data[i + 2] = gray
        }

        ctx.putImageData(imageData, 0, 0)
        variants.push({
          name: `${crop.name}${threshold ? '-threshold' : ''}`,
          source: canvas.toDataURL('image/png'),
        })
      }

      for (const crop of CNIC_OCR_CROPS) {
        renderVariant(crop, false)
      }

      renderVariant(CNIC_OCR_CROPS[0], true)
      renderVariant(CNIC_OCR_CROPS[1], true)

      URL.revokeObjectURL(objectUrl)
      resolve(variants)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl)
      reject(err)
    }
  })
}

// Helper to calculate Longest Common Subsequence for robust fuzzy matching
const getLCSLength = (s1: string, s2: string): number => {
  const m = s1.length
  const n = s2.length
  const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp[m][n]
}

const getEditDistance = (s1: string, s2: string): number => {
  const m = s1.length
  const n = s2.length
  const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[m][n]
}

const normalizeCnic = (value: string) => value.replace(/\D/g, '').slice(0, CNIC_LENGTH)

const normalizeOcrTextForCnic = (text: string) => text
  .replace(/[OoQ]/g, '0')
  .replace(/[Ss$]/g, '5')
  .replace(/[Bb]/g, '8')
  .replace(/[Il|]/g, '1')
  .replace(/[Zz]/g, '2')
  .replace(/[\u2013\u2014_]/g, '-')

const addDigitWindows = (value: string, candidates: Set<string>) => {
  const digits = value.replace(/\D/g, '')
  if (digits.length < CNIC_LENGTH) return

  if (digits.length === CNIC_LENGTH) {
    candidates.add(digits)
    return
  }

  for (let i = 0; i <= digits.length - CNIC_LENGTH; i++) {
    candidates.add(digits.slice(i, i + CNIC_LENGTH))
  }
}

const extractCnicCandidates = (ocrText: string): string[] => {
  const normalizedText = normalizeOcrTextForCnic(ocrText)
  const candidates = new Set<string>()
  const formattedCnicPattern = /(?:^|[^\d])(\d{5})[^\d]{0,6}(\d{7})[^\d]{0,6}(\d)(?=$|[^\d])/g
  const numericChunkPattern = /[0-9][0-9\s\-:./]{8,}[0-9]/g

  for (const match of normalizedText.matchAll(formattedCnicPattern)) {
    candidates.add(`${match[1]}${match[2]}${match[3]}`)
  }

  for (const match of normalizedText.matchAll(numericChunkPattern)) {
    addDigitWindows(match[0], candidates)
  }

  addDigitWindows(normalizedText, candidates)

  return Array.from(candidates)
}

const hasFormattedCnicCandidate = (ocrText: string) => {
  const normalizedText = normalizeOcrTextForCnic(ocrText)
  const formattedCnicPattern = /(?:^|[^\d])(\d{5})[^\d]{0,6}(\d{7})[^\d]{0,6}(\d)(?=$|[^\d])/g
  return formattedCnicPattern.test(normalizedText)
}

const getCnicOcrMatch = (expectedCnic: string, ocrText: string) => {
  const expected = normalizeCnic(expectedCnic)
  const candidates = extractCnicCandidates(ocrText)
  const hasClearCnicShape = hasFormattedCnicCandidate(ocrText)

  if (expected.length !== CNIC_LENGTH) {
    return { matched: false, inconclusive: false, shouldBlock: true, candidates, bestCandidate: '', bestScore: 0, bestDistance: CNIC_LENGTH }
  }

  let bestCandidate = ''
  let bestScore = 0
  let bestDistance = CNIC_LENGTH

  for (const candidate of candidates) {
    const score = getLCSLength(expected, candidate)
    const distance = getEditDistance(expected, candidate)

    if (candidate === expected) {
      return { matched: true, inconclusive: false, shouldBlock: false, candidates, bestCandidate: candidate, bestScore: CNIC_LENGTH, bestDistance: 0 }
    }

    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      bestCandidate = candidate
      bestScore = score
      bestDistance = distance
    }
  }

  const prefixLikelyMatches = bestCandidate
    ? getLCSLength(expected.slice(0, 5), bestCandidate.slice(0, 5)) >= 4
    : false
  const matched = bestDistance <= 1 || bestScore >= 12 || (bestScore >= 11 && prefixLikelyMatches)
  const shouldBlock = !matched && hasClearCnicShape && bestScore <= 9
  const inconclusive = !matched && !shouldBlock

  return { matched, inconclusive, shouldBlock, candidates, bestCandidate, bestScore, bestDistance }
}

type FaceApiModule = typeof import('@vladmandic/face-api')
type FaceApiRuntimeModule = FaceApiModule & {
  tf: {
    setBackend: (backend: string) => Promise<boolean>
    ready: () => Promise<void>
  }
}

let faceApiLoadPromise: Promise<FaceApiModule> | null = null
const loadProfilePhotoFaceApi = async () => {
  if (!faceApiLoadPromise) {
    faceApiLoadPromise = import('@vladmandic/face-api').then(async (faceapi) => {
      const faceRuntime = faceapi as unknown as FaceApiRuntimeModule
      await faceRuntime.tf.setBackend('cpu')
      await faceRuntime.tf.ready()
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models')
      return faceapi
    })
  }

  return faceApiLoadPromise
}

const loadImageForFaceCheck = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl)
      reject(err)
    }
    img.src = objectUrl
  })
}

const validateProfilePhotoFace = async (file: File) => {
  const faceapi = await loadProfilePhotoFaceApi()
  const image = await loadImageForFaceCheck(file)
  const detections = await faceapi.detectAllFaces(
    image,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 })
  )

  if (detections.length === 0) {
    return {
      valid: false,
      error: 'Profile photo must show a clear human face. Random images are not allowed.',
    }
  }

  if (detections.length > 1) {
    return {
      valid: false,
      error: 'Profile photo must show only one person. Please upload a solo, clear face photo.',
    }
  }

  const { box } = detections[0]
  const faceWidthRatio = box.width / image.naturalWidth
  const faceHeightRatio = box.height / image.naturalHeight

  if (faceWidthRatio < 0.12 || faceHeightRatio < 0.12) {
    return {
      valid: false,
      error: 'Face is too small in this photo. Please upload a closer, clearer profile photo.',
    }
  }
   return { valid: true, error: '' }
}

export default function TutorCompleteProfilePage() {
  const router = useRouter()
  const { user, fetchUser, logout } = useAuthStore()
  const userId = user?.id

  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [faceLoading, setFaceLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  useEffect(() => {
    if (error) {
      notifyError(error)
    }
  }, [error])
  
  // Step 1: Personal Details
  const [personalDetails, setPersonalDetails] = useState({
    city: '',
    cnic: '',
    bio: '',
  })
  
  // Step 2: Subjects
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  
  // Step 3: Degrees
  const [degrees, setDegrees] = useState<Degree[]>([])
  const [showDegreeForm, setShowDegreeForm] = useState(false)
  const [newDegree, setNewDegree] = useState<Partial<Degree>>({
    degreeName: '',
    institution: '',
    boardUniversity: '',
    yearCompleted: '',
  })
  
  // Step 4: Documents
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  
  // Document types required
  const requiredDocs = [
    { type: 'cnic_front', label: 'CNIC Front', icon: <FileText className="w-5 h-5" /> },
    { type: 'cnic_back', label: 'CNIC Back', icon: <FileText className="w-5 h-5" /> },
    { type: 'profile_photo', label: 'Profile Photo', icon: <Camera className="w-5 h-5" /> },
  ]

  const toggleSubject = (sub: string) => {
    setSelectedSubjects(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    )
  }

  const addDegree = () => {
    const isSchool = isSchoolDegree(newDegree.degreeName || '')
    const degreeName = newDegree.degreeName || ''
    const boardUniversity = newDegree.boardUniversity || ''
    const yearCompleted = newDegree.yearCompleted || ''
    const institution = isSchool ? (newDegree.institution || '') : boardUniversity
    
    if (isSchool && !institution) {
      setError('Please fill all degree fields')
      return
    }
    
    if (!degreeName || !boardUniversity || !yearCompleted) {
      setError('Please fill all degree fields')
      return
    }
    
    const degree: Degree = {
      id: Date.now().toString(),
      degreeName,
      // For uni degrees, institution = boardUniversity (same value)
      institution,
      boardUniversity,
      yearCompleted,
    }
    
    setDegrees([...degrees, degree])
    setNewDegree({ degreeName: '', institution: '', boardUniversity: '', yearCompleted: '' })
    setShowDegreeForm(false)
    setError('')
  }

  const removeDegree = (id: string) => {
    setDegrees(degrees.filter(d => d.id !== id))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('File size must be less than 5MB'); return }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) { setError('Only JPG, PNG, WebP, or PDF files allowed'); return }

    setUploading(docType)
    setError('')

    if (docType === 'cnic_front' && normalizeCnic(personalDetails.cnic).length !== CNIC_LENGTH) {
      setUploading(null)
      setError('Enter a valid 13-digit CNIC before uploading the front image')
      return
    }

    if (docType === 'cnic_front' && !file.type.startsWith('image/')) {
      setUploading(null)
      setError('CNIC front must be an image so we can match it with the entered CNIC number')
      return
    }

    if (docType === 'profile_photo' && !file.type.startsWith('image/')) {
      setUploading(null)
      setError('Profile photo must be an image with a clear human face')
      return
    }

    if (docType === 'cnic_front') {
      let worker: Awaited<ReturnType<typeof Tesseract.createWorker>> | null = null
      let cnicShouldBlock = false
      let cnicInconclusive = false
      try {
         setOcrLoading(true)
        const ocrVariants = await createCnicOcrVariants(file)
        worker = await Tesseract.createWorker('eng')
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
          tessedit_char_whitelist: '0123456789- ',
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
        })

        let ocrText = ''
        let match = getCnicOcrMatch(personalDetails.cnic, ocrText)

        for (const variant of ocrVariants) {
          const ret = await worker.recognize(variant.source)
          ocrText = `${ocrText}\n${ret.data.text}`
          match = getCnicOcrMatch(personalDetails.cnic, ocrText)
          if (match.matched) break
        }

        cnicInconclusive = match.inconclusive
        cnicShouldBlock = match.shouldBlock
      } catch (err) {
        console.error('CNIC OCR error:', err)
        cnicInconclusive = true
      } finally {
        if (worker) await worker.terminate()
        setOcrLoading(false)
      }

      if (cnicShouldBlock) {
        setUploading(null)
        setError('CNIC image does not match the entered CNIC number. Upload blocked. Please upload the front-side CNIC image for the same number.')
        return
      }

      if (cnicInconclusive) {
        notifyWarning('CNIC OCR could not confidently read the number. Upload allowed, but admin will review the CNIC manually.')
      }
    }

    if (docType === 'profile_photo') {
      try {
        setFaceLoading(true)
        const faceCheck = await validateProfilePhotoFace(file)
        if (!faceCheck.valid) {
          setUploading(null)
          setError(faceCheck.error)
          return
        }
      } catch (err) {
        console.error('Profile photo face check error:', err)
        setUploading(null)
        setError('Could not verify a clear human face in this profile photo. Please upload another image.')
        return
      } finally {
        setFaceLoading(false)
      }
    }

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', docType)
      const res = await fetch('/api/tutor/upload-document', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        setDocuments(prev => {
          const nextDoc = {
            id: data.documentId,
            documentType: docType,
            documentUrl: data.documentUrl,
            fileName: file.name,
            fileSize: file.size,
          }

          if (docType === 'degree_certificate') return [...prev, nextDoc]
          return [...prev.filter(d => d.documentType !== docType), nextDoc]
        })
      } else {
        setError(getApiMessage(data, 'We could not upload this document. Please try another file or try again.'))
      }
    } catch (err) {
      console.error('Document upload error:', err)
      setError('We could not upload this document right now. Please check your connection and try again.')
    } finally {
      setUploading(null)
      setOcrLoading(false)
      setFaceLoading(false)
    }
  }

  const handleNext = () => {
    if (step === 1) {
      if (!personalDetails.city || !personalDetails.cnic) {
        setError('Please fill all required fields (City, CNIC)')
        return
      }
      if (normalizeCnic(personalDetails.cnic).length !== CNIC_LENGTH) {
        setError('CNIC must be exactly 13 digits without dashes')
        return
      }
    }
    if (step === 2 && selectedSubjects.length === 0) {
      setError('Please select at least one subject')
      return
    }
    if (step === 3 && degrees.length === 0) {
      setError('Please add at least one degree')
      return
    }
    if (step === 4) {
      // Check required documents
      const hasCnicFront = documents.some(d => d.documentType === 'cnic_front')
      const hasCnicBack = documents.some(d => d.documentType === 'cnic_back')
      const hasProfilePhoto = documents.some(d => d.documentType === 'profile_photo')

      if (!hasCnicFront || !hasCnicBack) {
        setError('CNIC front and back images are required')
        return
      }
      if (!hasProfilePhoto) {
        setError('Profile photo is required')
        return
      }
          }

    setError('')
    setStep(step + 1)
  }

  const handleBack = () => {
    setError('')
    setStep(step - 1)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/tutor/submit-for-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalDetails: {
            ...personalDetails,
          },
          subjects: selectedSubjects,
          degrees: degrees.map(d => ({
            degreeName: d.degreeName,
            institution: d.institution,
            boardUniversity: d.boardUniversity,
            yearCompleted: d.yearCompleted,
          })),
          documents: documents.map(d => ({
            documentType: d.documentType,
            documentUrl: d.documentUrl,
            fileName: d.fileName,
            fileSize: d.fileSize,
          })),
        })
      })

      const data = await res.json()

      if (res.ok) {
        notifySuccess(data.message, 'Your profile has been submitted for verification.')
        // Clear saved progress
        localStorage.removeItem('tutor_profile_progress')
        router.push('/tutor/waiting-verification')
      } else {
        setError(getApiMessage(data, 'We could not submit your profile. Please review the required details and try again.'))
        setSubmitting(false)
      }
    } catch {
      setError("We could not submit your profile right now. Please check your connection and try again.")
      setSubmitting(false)
    }
  }

  // Check for saved data on mount (and fetch existing profile)
  useEffect(() => {
    if (!user) {
      fetchUser()
    }
  }, [user, fetchUser])

  useEffect(() => {
    const profile = user?.tutorProfile
        if (!profile) return

    setPersonalDetails(prev => ({
      city: prev.city || profile.city || '',
      cnic: prev.cnic || profile.cnic || '',
      bio: prev.bio || profile.bio || '',
    }))

    if (selectedSubjects.length === 0 && profile.subjects?.length) {
      setSelectedSubjects(profile.subjects)
    }
  }, [user?.tutorProfile, selectedSubjects.length])

  useEffect(() => {
    if (!userId) return

    const loadData = async () => {
      // Load from localStorage only if it belongs to the current user
      const savedData = localStorage.getItem('tutor_profile_progress')
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData)
          if (parsed.userId && parsed.userId === userId) {
            if (parsed.personalDetails) setPersonalDetails(parsed.personalDetails)
            if (parsed.subjects) setSelectedSubjects(parsed.subjects)
            if (parsed.degrees) setDegrees(parsed.degrees)
            if (parsed.documents) setDocuments(parsed.documents)
            if (parsed.step && parsed.step > 1) setStep(parsed.step)
          } else {
            // Different user or old format - clear stale data
            localStorage.removeItem('tutor_profile_progress')
          }
        } catch {
          localStorage.removeItem('tutor_profile_progress')
        }
      }
      
      // Also fetch any existing degrees/documents from server
      try {
        const [degreesRes, docsRes] = await Promise.all([
          fetch('/api/tutor/my-degrees'),
          fetch('/api/tutor/my-documents'),
        ])
        
        if (degreesRes.ok) {
          const degreesData = await degreesRes.json() as { degrees?: DegreeRow[] }
          const fetchedDegrees = degreesData.degrees || []
          if (fetchedDegrees.length > 0) {
            setDegrees(fetchedDegrees.map((d) => ({
              id: d.id,
              degreeName: d.degree_name,
              institution: d.institution,
              boardUniversity: d.board_university,
              yearCompleted: d.year_completed,
            })))
          }
        }
        
        if (docsRes.ok) {
          const docsData = await docsRes.json() as { documents?: DocumentRow[] }
          const fetchedDocuments = docsData.documents || []
          if (fetchedDocuments.length > 0) {
            setDocuments(fetchedDocuments.map((d) => ({
              id: d.id,
              documentType: d.document_type,
                            documentUrl: d.document_url,
              fileName: d.file_name,
              fileSize: d.file_size,
            })))
          }
        }
      } catch (err) {
        console.error('Failed to fetch existing data:', err)
      }
    }
    
    loadData()
  }, [userId])

  // Save progress on change - store userId to prevent cross-user data leaks
  useEffect(() => {
    if (!userId) return
    localStorage.setItem('tutor_profile_progress', JSON.stringify({
      userId,
      personalDetails,
      subjects: selectedSubjects,
      degrees,
      documents,
      step,
    }))
  }, [personalDetails, selectedSubjects, degrees, documents, step, userId])

  const getDocumentByType = (type: string) => documents.find(d => d.documentType === type)
  const degreeCertificates = documents.filter(d => d.documentType === 'degree_certificate')
  const documentLabels: Record<string, string> = {
    cnic_front: 'CNIC Front',
    cnic_back: 'CNIC Back',
    profile_photo: 'Profile Photo',
  }
  const steps = [
    { id: 1, label: 'Personal', title: 'Personal details', caption: 'City, CNIC, and short bio', icon: <User className="h-4 w-4" /> },
    { id: 2, label: 'Subjects', title: 'Teaching subjects', caption: 'Pick the subjects you can teach', icon: <BookOpen className="h-4 w-4" /> },
    { id: 3, label: 'Education', title: 'Academic record', caption: 'Add degrees and institutions', icon: <GraduationCap className="h-4 w-4" /> },
    { id: 4, label: 'Documents', title: 'Identity documents', caption: 'CNIC, profile photo, certificates', icon: <FileText className="h-4 w-4" /> },
    { id: 5, label: 'Review', title: 'Final review', caption: 'Confirm and submit', icon: <ClipboardCheck className="h-4 w-4" /> },
  ]
  const currentStep = steps.find(item => item.id === step) || steps[0]
  const progressPercent = Math.round((step / steps.length) * 100)
  const requiredUploadedCount = requiredDocs.filter(doc => getDocumentByType(doc.type)).length
  const inputClass = 'qs-input w-full rounded-lg px-3 py-2.5 text-sm'
  const labelClass = 'mb-1.5 block text-sm font-semibold text-text-main'

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 overflow-hidden rounded-lg border border-border bg-hero-gradient surface-grid px-5 py-5 text-white shadow-xl shadow-primary/10 sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-bold uppercase text-white ring-1 ring-white/20">
                <ShieldCheck className="h-3.5 w-3.5" />
                Tutor verification
              </span>
              <h1 className="mt-4 text-2xl font-bold sm:text-3xl">Complete your profile</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/78">
                Welcome, {(user?.fullname || 'Tutor').split(' ')[0]}. Add your teaching details, verify CNIC, and submit a clean application for review.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                            <Button
                type="button"
                onClick={logout}
                className="h-11 border border-white/20 bg-white/10 px-4 text-white hover:bg-white/20"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>

              <div className="min-w-[220px] rounded-lg border border-white/18 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-white/80">Application progress</span>
                  <span className="font-bold">{progressPercent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/18">
                  <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
                <p className="mt-3 text-xs font-medium text-white/72">Step {step} of {steps.length}: {currentStep.label}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="qs-panel rounded-lg p-4">
              <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-text-main">{user?.fullname || 'Tutor profile'}</p>
                  <p className="truncate text-xs text-text-muted">{user?.email || 'Verification draft'}</p>
                </div>
              </div>

              <div className="space-y-2">
                {steps.map(item => {
                  const isActive = item.id === step
                  const isDone = item.id < step
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.id > step}
                      onClick={() => item.id <= step && setStep(item.id)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-all ${
                        isActive
                          ? 'border-primary bg-primary text-white shadow-md shadow-primary/15'
                          : isDone
                            ? 'border-secondary/25 bg-secondary-subtle text-secondary-dark'
                            : 'border-border bg-surface/70 text-text-muted opacity-80'
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          isActive ? 'bg-white/18 text-white' : isDone ? 'bg-white/70 text-secondary-dark' : 'bg-surface-hover text-text-muted'
                        }`}>
                          {isDone ? <CheckCircle className="h-4 w-4" /> : item.icon}
                        </span>
                        <span>
                          <span className="block text-sm font-bold">{item.title}</span>
                          <span className={`mt-0.5 block text-xs ${isActive ? 'text-white/76' : 'text-text-muted'}`}>{item.caption}</span>
                        </span>
                      </span>
                                          </button>
                  )
                })}
              </div>

              <div className="mt-4 rounded-lg border border-primary/15 bg-primary-subtle/60 p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-primary-dark">
                  <ShieldCheck className="h-4 w-4" />
                  CNIC match assisted by OCR
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  Clear mismatches are blocked. If OCR is unclear, upload continues for admin review.
                </p>
              </div>
            </div>
          </aside>

          <section className="qs-panel overflow-hidden rounded-lg">
            <div className="border-b border-border bg-surface/80 px-5 py-5 sm:px-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-primary">Step {step} of {steps.length}</p>
                  <h2 className="mt-1 text-2xl font-bold text-text-main">{currentStep.title}</h2>
                  <p className="mt-1 text-sm text-text-muted">{currentStep.caption}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[260px]">
                  <div className="rounded-lg border border-border bg-surface px-3 py-2">
                    <p className="text-lg font-bold text-primary">{selectedSubjects.length}</p>
                    <p className="text-[11px] font-semibold text-text-muted">Subjects</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface px-3 py-2">
                    <p className="text-lg font-bold text-secondary-dark">{degrees.length}</p>
                    <p className="text-[11px] font-semibold text-text-muted">Degrees</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface px-3 py-2">
                    <p className="text-lg font-bold text-accent">{requiredUploadedCount}/3</p>
                    <p className="text-[11px] font-semibold text-text-muted">Docs</p>
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-5 mt-5 flex items-start gap-3 rounded-lg border border-error/25 bg-red-50 px-4 py-3 text-sm font-medium text-error sm:mx-7">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-5 sm:p-7">
              {step === 1 && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelClass}>City *</label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={personalDetails.city}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^A-Za-z\s]/g, '')
                            setPersonalDetails(prev => ({ ...prev, city: val }))
                          }}
                          placeholder="Lahore, Karachi, Islamabad"
                                      className={`${inputClass} pl-9`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>CNIC number *</label>
                      <div className="relative">
                        <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                        <input
                          type="text"
                          value={personalDetails.cnic}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, CNIC_LENGTH)
                            setPersonalDetails(prev => ({ ...prev, cnic: val }))
                          }}
                          placeholder="13 digits without dashes"
                          maxLength={CNIC_LENGTH}
                          className={`${inputClass} pl-9`}
                        />
                      </div>
                      <p className="mt-1 text-xs font-medium text-text-muted">{normalizeCnic(personalDetails.cnic).length}/{CNIC_LENGTH} digits entered</p>
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>About you</label>
                    <textarea
                      value={personalDetails.bio}
                      onChange={(e) => setPersonalDetails(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Share your teaching experience, style, and strengths."
                      rows={6}
                      className={`${inputClass} min-h-36 resize-none leading-6`}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-2">
                    {SUBJECTS.map((sub) => {
                      const selected = selectedSubjects.includes(sub)
                      return (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => toggleSubject(sub)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${
                            selected
                              ? 'border-primary bg-primary text-white shadow-md shadow-primary/15'
                              : 'border-border bg-surface text-text-muted hover:border-primary/50 hover:bg-primary-subtle/35 hover:text-text-main'
                          }`}
                        >
                          {sub}
                        </button>
                      )
                    })}
                  </div>

                  <div className="rounded-lg border border-secondary/20 bg-secondary-subtle/45 px-4 py-3 text-sm font-semibold text-secondary-dark">
                    {selectedSubjects.length > 0 ? `${selectedSubjects.length} subject(s) selected` : 'Select at least one subject to continue'}
                  </div>
                </div>
              )}
                            {step === 3 && (
                <div className="space-y-5">
                  {degrees.length > 0 && (
                    <div className="grid gap-3">
                      {degrees.map((degree) => (
                        <div key={degree.id} className="rounded-lg border border-border bg-surface px-4 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="font-bold text-text-main">{degree.degreeName}</h3>
                              <p className="mt-1 text-sm text-text-muted">{degree.institution || degree.boardUniversity}</p>
                              <p className="mt-1 text-xs font-semibold text-text-muted">{degree.boardUniversity} / {degree.yearCompleted}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDegree(degree.id)}
                              className="rounded-lg p-2 text-error transition-colors hover:bg-red-50"
                              aria-label="Remove degree"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {showDegreeForm ? (
                    <div className="rounded-lg border border-border bg-surface-container-low/70 p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        <h3 className="font-bold text-text-main">Add degree</h3>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label className={labelClass}>Degree name</label>
                          <select
                            value={newDegree.degreeName}
                            onChange={(e) => setNewDegree({ ...newDegree, degreeName: e.target.value })}
                            className={inputClass}
                          >
                            <option value="">Select degree...</option>
                            {DEGREE_NAMES.map(name => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </div>

                        {isSchoolDegree(newDegree.degreeName || '') && (
                          <div className="md:col-span-2">
                            <label className={labelClass}>Institution or school</label>
                            <input
                              type="text"
                              value={newDegree.institution}
                              onChange={(e) => setNewDegree({ ...newDegree, institution: e.target.value })}
                              placeholder="Govt. College Lahore"
                              className={inputClass}
                            />
                          </div>
                        )}

                        <div className={isSchoolDegree(newDegree.degreeName || '') ? '' : 'md:col-span-2'}>
                          <label className={labelClass}>{isSchoolDegree(newDegree.degreeName || '') ? 'Board' : 'University or institution'}</label>
                          {isSchoolDegree(newDegree.degreeName || '') ? (
                                                        <select
                              value={newDegree.boardUniversity}
                              onChange={(e) => setNewDegree({ ...newDegree, boardUniversity: e.target.value })}
                              className={inputClass}
                            >
                              <option value="">Select board...</option>
                              {PAKISTAN_BOARDS.map(board => (
                                <option key={board} value={board}>{board}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={newDegree.boardUniversity}
                              onChange={(e) => {
                                const value = e.target.value
                                setNewDegree({ ...newDegree, boardUniversity: value, institution: value })
                              }}
                              placeholder="UET Lahore, FAST, LUMS"
                              className={inputClass}
                            />
                          )}
                        </div>

                        <div>
                          <label className={labelClass}>Year completed</label>
                          <select
                            value={newDegree.yearCompleted}
                            onChange={(e) => setNewDegree({ ...newDegree, yearCompleted: e.target.value })}
                            className={inputClass}
                          >
                            <option value="">Select year...</option>
                            {Array.from({ length: 47 }, (_, i) => 2026 - i).map(year => (
                              <option key={year} value={year}>{year}</option>
                            ))}
                          </select>
                        </div>

                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        <Button type="button" onClick={addDegree}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add degree
                        </Button>
                        <Button type="button" onClick={() => setShowDegreeForm(false)} variant="outline">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDegreeForm(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/35 bg-primary-subtle/35 px-4 py-5 text-sm font-bold text-primary transition-colors hover:bg-primary-subtle"
                    >
                      <Plus className="h-4 w-4" />
                      Add degree
                    </button>
                  )}
                </div>
              )}

              {step === 4 && (
                                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    {requiredDocs.map((doc) => {
                      const uploadedDoc = getDocumentByType(doc.type)
                      const isWorking = uploading === doc.type
                      return (
                        <div key={doc.type} className={`rounded-lg border bg-surface p-4 transition-all ${
                          uploadedDoc ? 'border-success/35 bg-success-subtle/45' : 'border-border'
                        }`}>
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                                uploadedDoc ? 'bg-white text-success' : 'bg-primary-subtle text-primary'
                              }`}>
                                {doc.icon}
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-text-main">{doc.label}</h3>
                                <p className="text-xs font-medium text-text-muted">
                                  {doc.type === 'profile_photo' ? 'Clear face image only' : doc.type === 'cnic_front' ? 'Image only' : 'Image or PDF'}
                                </p>
                              </div>
                            </div>
                            {uploadedDoc && <CheckCircle className="h-5 w-5 text-success" />}
                          </div>

                          {uploadedDoc ? (
                            <div className="flex items-center justify-between gap-3">
                              {(uploadedDoc.documentUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) || uploadedDoc.documentUrl.startsWith('data:image') || uploadedDoc.documentUrl.includes('supabase')) ? (
                                <button type="button" onClick={() => setPreviewImage(uploadedDoc.documentUrl)} className="group flex items-center gap-2 text-left">
                                  <img
                                    src={uploadedDoc.documentUrl}
                                    alt={`${doc.label} preview`}
                                    className="h-12 w-16 rounded-lg border border-border object-cover shadow-sm transition-all group-hover:ring-2 group-hover:ring-primary/35"
                                  />
                                  <span className="text-xs font-semibold text-text-muted group-hover:text-primary">Preview</span>
                                </button>
                              ) : (
                                <a
                                  href={uploadedDoc.documentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 rounded-lg bg-primary-subtle px-3 py-2 text-xs font-bold text-primary"
                                >
                                  <Eye className="h-4 w-4" />
                                  View PDF
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => setDocuments(prev => prev.filter(d => d.id !== uploadedDoc.id))}
                                className="rounded-lg px-2 py-1 text-xs font-bold text-error transition-colors hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className={`block ${uploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                              <input
                                type="file"
                                accept={doc.type === 'cnic_front' || doc.type === 'profile_photo' ? 'image/*' : 'image/*,.pdf'}
                                onChange={(e) => handleFileUpload(e, doc.type)}
                                className="hidden"
                                disabled={!!uploading}
                              />
                                                            <span className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-container-low px-3 py-3 text-sm font-bold text-text-main transition-colors hover:border-primary/50 hover:text-primary">
                                {isWorking ? (
                                  ocrLoading ? 'Verifying CNIC...' : faceLoading ? 'Checking face...' : 'Uploading...'
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4" />
                                    Upload
                                  </>
                                )}
                              </span>
                            </label>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary-subtle text-secondary-dark">
                          <Camera className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-text-main">Degree certificates</h3>
                          <p className="text-sm text-text-muted">Optional, but recommended for a stronger application.</p>
                        </div>
                      </div>
                      <label className={`inline-flex ${uploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => handleFileUpload(e, 'degree_certificate')}
                          className="hidden"
                          disabled={!!uploading}
                        />
                        <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-subtle px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary hover:text-white">
                          <Plus className="h-4 w-4" />
                          {uploading === 'degree_certificate' ? 'Uploading...' : 'Add certificate'}
                        </span>
                      </label>
                    </div>

                    {degreeCertificates.length > 0 && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {degreeCertificates.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-container-low px-3 py-2">
                            <span className="truncate text-sm font-semibold text-text-main">{doc.fileName}</span>
                            <button
                              type="button"
                              onClick={() => setDocuments(prev => prev.filter(d => d.id !== doc.id))}
                              className="rounded-lg p-1.5 text-error hover:bg-red-50"
                              aria-label="Remove certificate"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 5 && (
                                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-border bg-surface p-4">
                      <h3 className="mb-3 flex items-center gap-2 font-bold text-text-main"><User className="h-4 w-4 text-primary" /> Personal</h3>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-semibold text-text-muted">City:</span> <span className="font-bold text-text-main">{personalDetails.city || 'N/A'}</span></p>
                        <p><span className="font-semibold text-text-muted">CNIC:</span> <span className="font-bold text-text-main">{personalDetails.cnic || 'N/A'}</span></p>
                        <p className="leading-6 text-text-main"><span className="block font-semibold text-text-muted">Bio</span>{personalDetails.bio || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-surface p-4">
                      <h3 className="mb-3 flex items-center gap-2 font-bold text-text-main"><BookOpen className="h-4 w-4 text-secondary-dark" /> Subjects</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedSubjects.map(sub => (
                          <span key={sub} className="rounded-lg bg-primary-subtle px-3 py-1 text-xs font-bold text-primary-dark">
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-bold text-text-main"><GraduationCap className="h-4 w-4 text-accent" /> Education</h3>
                    <div className="grid gap-2 md:grid-cols-2">
                      {degrees.map((degree, idx) => (
                        <div key={degree.id} className="rounded-lg border border-border bg-surface-container-low px-3 py-3 text-sm">
                          <p className="font-bold text-text-main">{idx + 1}. {degree.degreeName}</p>
                          <p className="mt-1 text-text-muted">{degree.institution || degree.boardUniversity} / {degree.yearCompleted}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface p-4">
                    <h3 className="mb-3 flex items-center gap-2 font-bold text-text-main"><FileText className="h-4 w-4 text-primary" /> Documents</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {['cnic_front', 'cnic_back', 'profile_photo'].map(type => {
                        const doc = getDocumentByType(type)
                        return (
                          <div key={type} className="flex items-center gap-3 rounded-lg border border-border bg-surface-container-low px-3 py-3">
                            {doc ? (
                              (doc.documentUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) || doc.documentUrl.startsWith('data:image') || doc.documentUrl.includes('supabase')) ? (
                                <img
                                  src={doc.documentUrl}
                                  alt={documentLabels[type]}
                                  className="h-12 w-14 cursor-pointer rounded-lg border border-border object-cover"
                                  onClick={() => setPreviewImage(doc.documentUrl)}
                                />
                              ) : (
                                <div className="flex h-12 w-14 items-center justify-center rounded-lg border border-border bg-primary-subtle text-primary">
                                  <FileText className="h-5 w-5" />
                                </div>
                              )
                            ) : (
                              <div className="flex h-12 w-14 items-center justify-center rounded-lg border border-error/20 bg-red-50 text-error">
                                <X className="h-5 w-5" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-bold text-text-main">{documentLabels[type]}</p>
                              <p className="text-xs font-medium text-text-muted">{doc ? 'Uploaded' : 'Missing'}</p>
                            </div>
                          </div>
                                                  )
                      })}
                      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-container-low px-3 py-3">
                        <div className="flex h-12 w-14 items-center justify-center rounded-lg bg-secondary-subtle text-lg font-bold text-secondary-dark">
                          {degreeCertificates.length}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-text-main">Degree certificates</p>
                          <p className="text-xs font-medium text-text-muted">Optional uploads</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-warning/30 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    <div className="flex gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                      <p><strong>Important:</strong> After submission, admin review starts. If approved, you will be invited to the subject proficiency test.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-border bg-surface/65 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <Button type="button" variant="outline" onClick={handleBack} disabled={step === 1 || submitting} className={step === 1 ? 'invisible' : ''}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>

              {step < 5 ? (
                <Button type="button" onClick={handleNext} disabled={!!uploading}>
                  Continue
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit for Verification'}
                  {!submitting && <ChevronRight className="ml-2 h-4 w-4" />}
                </Button>
              )}
            </div>
          </section>
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setPreviewImage(null)}>
          <div className="relative flex max-h-[90vh] w-full max-w-5xl items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 rounded-full bg-black/50 p-2 text-white transition-colors hover:text-error"
              aria-label="Close preview"
            >
              <X className="h-8 w-8" />
            </button>
            <img src={previewImage} alt="Document preview" className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </main>
  )
}

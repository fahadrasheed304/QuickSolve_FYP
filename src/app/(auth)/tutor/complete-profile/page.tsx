

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
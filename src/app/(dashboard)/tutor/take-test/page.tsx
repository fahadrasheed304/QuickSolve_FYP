import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, AlertTriangle, CheckCircle, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { notifyError } from '@/lib/toast'

interface Question {
  id: string
  subject?: string
  question: string
  options: string[]
  correctAnswer: number  // Not sent to client in production
}

interface TestData {
  questions: Question[]
  timeLimit: number
  passingScore: number
}

type NativeFaceDetectorResult = {
  boundingBox: DOMRectReadOnly
}

type NativeFaceDetector = {
  detect: (image: CanvasImageSource) => Promise<NativeFaceDetectorResult[]>
}

type FaceApiModule = typeof import('@vladmandic/face-api')
type FaceApiRuntimeModule = FaceApiModule & {
  tf: {
    setBackend: (backend: string) => Promise<boolean>
    ready: () => Promise<void>
  }
}

type DetectedFace = {
  descriptor: Float32Array
  landmarks: Parameters<typeof isLookingAwayFromCamera>[0]
}

type NativeFaceDetectorConstructor = new (options?: {
  fastMode?: boolean
  maxDetectedFaces?: number
}) => NativeFaceDetector

type WindowWithFaceDetector = Window & {
  FaceDetector?: NativeFaceDetectorConstructor
}

const getNativeFaceDetector = () => {
  const Detector = (window as WindowWithFaceDetector).FaceDetector
  if (!Detector) return null

  try {
    return new Detector({ fastMode: true, maxDetectedFaces: 2 })
  } catch {
    return null
  }
}

let faceApiLoadPromise: Promise<FaceApiModule> | null = null

const loadFaceRecognitionApi = async () => {
    node.srcObject = streamRef.current;
      node.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (verificationError) {
      notifyError(verificationError)
    }
  }, [verificationError])

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Cleanup stream on unmount
  useEffect(() => {
    return stopCameraStream
  }, [stopCameraStream])
  // Fetch test questions
  useEffect(() => {
    console.log('[TakeTest] Component mounted - fetching questions...')
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 15000)
    let isMounted = true

    const fetchTest = async () => {
      try {
        const res = await fetch('/api/tutor/test/questions', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const status = res.status
        console.log('[TakeTest] API response status:', status)
        if (!isMounted) return

        if (res.ok) {
          const data = await res.json()
          console.log('[TakeTest] Questions loaded:', data.questions?.length)
          setTestData(data)
          setTimeLeft(data.timeLimit || TEST_DURATION)
          setProfilePhotoUrl(data.profilePhotoUrl || null)
        } else {
          const body = await res.json().catch(() => ({}))
          console.log('[TakeTest] API error body:', body)
          if (status === 403) {
            setError('You are not eligible to take the test yet. Please complete the previous verification step first.')
          } else if (status === 401) {
            setError('Please sign in again before taking the tutor test.')
          } else {
            setError(body.error || 'We could not load your test questions. Please refresh and try again.')
          }
        }
      } catch (err) {
        console.error('[TakeTest] fetch exception:', err)
        if (isMounted) {
          setError(err instanceof DOMException && err.name === 'AbortError'
            ? 'Test questions took too long to load. Please refresh and try again.'
            : 'We could not reach the test service. Please check your connection and try again.'
          )
        }
        reject(new Error('Could not load profile photo for verification.'))
    }
    image.crossOrigin = 'anonymous'
    image.src = src
  })
}

const hasUsableCameraFrame = (video: HTMLVideoElement) => {
  if (video.videoWidth === 0 || video.videoHeight === 0) return false

  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 72
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let sum = 0
  let sumSquares = 0
  const sampleCount = data.length / 4

  for (let i = 0; i < data.length; i += 4) {
    const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3
    sum += luminance
    sumSquares += luminance * luminance
  }

  const mean = sum / sampleCount
  const variance = sumSquares / sampleCount - mean * mean
  return mean > 12 && variance > 5
}

const getPointCenter = (points: Array<{ x: number; y: number }>) => {
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  )
  return { x: total.x / points.length, y: total.y / points.length }
}

const isLookingAwayFromCamera = (landmarks: any) => {
  const leftEye = landmarks.getLeftEye?.()
  const rightEye = landmarks.getRightEye?.()
  const nose = landmarks.getNose?.()
  const mouth = landmarks.getMouth?.()

  if (!leftEye?.length || !rightEye?.length || !nose?.length || !mouth?.length) return false

  const leftEyeCenter = getPointCenter(leftEye)
  const rightEyeCenter = getPointCenter(rightEye)
  const eyeMidpoint = {
    x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
    y: (leftEyeCenter.y + rightEyeCenter.y) / 2,
  }
  const mouthCenter = getPointCenter(mouth)
  const noseTip = nose[3] || nose[Math.floor(nose.length / 2)]
  const eyeDistance = Math.hypot(rightEyeCenter.x - leftEyeCenter.x, rightEyeCenter.y - leftEyeCenter.y)
  const faceVerticalSpan = Math.max(1, mouthCenter.y - eyeMidpoint.y)

  if (eyeDistance <= 0) return false

  const yawRatio = Math.abs(noseTip.x - eyeMidpoint.x) / eyeDistance
  const pitchRatio = (noseTip.y - eyeMidpoint.y) / faceVerticalSpan
  const rollDegrees = Math.abs(
    Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x) * 180 / Math.PI
  )
   return yawRatio > 0.34 || pitchRatio < 0.28 || pitchRatio > 0.86 || rollDegrees > 20
}

const MAX_WARNINGS = 3
const TEST_DURATION = 20 * 60 // 20 minutes in seconds
const FACE_MATCH_THRESHOLD = 0.62
const FACE_MATCH_MEDIAN_THRESHOLD = 0.68
const FACE_MATCH_AVERAGE_THRESHOLD = 0.7
const FACE_TRACKING_MISMATCH_THRESHOLD = 0.74
const LIVE_MATCH_SAMPLE_COUNT = 9
const MIN_LIVE_FACE_SAMPLES = 2
const FACE_ATTENTION_CHECK_INTERVAL_MS = 2000
const IDENTITY_CHECK_INTERVAL_MS = 4000

const FACE_DETECTOR_SETTINGS = [
  { inputSize: 416, scoreThreshold: 0.45 },
  { inputSize: 608, scoreThreshold: 0.35 },
  { inputSize: 320, scoreThreshold: 0.25 },
]

export default function TakeTestPage() {
  const router = useRouter()
  const [testData, setTestData] = useState<TestData | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warningCount, setWarningCount] = useState(0)
  const [testStarted, setTestStarted] = useState(false)
  const [testFinished, setTestFinished] = useState(false)
  const [result, setResult] = useState<{score: number; passed: boolean} | null>(null)
  const [, setTabSwitches] = useState(0)
  const [warningMessage, setWarningMessage] = useState('')
  const [showWarningModal, setShowWarningModal] = useState(false)

  useEffect(() => {
    if (error) {
      notifyError(error)
    }
  }, [error])

  // Face Verification States
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  const [verificationPassed, setVerificationPassed] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [faceTrackingReady, setFaceTrackingReady] = useState(false)
  const [verificationStep, setVerificationStep] = useState('')
  const [verificationError, setVerificationError] = useState('')
  const faceDetectorRef = useRef<NativeFaceDetector | null>(null)
  const faceApiRef = useRef<FaceApiModule | null>(null)
  const referenceFaceDescriptorRef = useRef<Float32Array | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const handleSubmitRef = useRef<((autoSubmit?: boolean) => Promise<void>) | null>(null)
  const warningCountRef = useRef(0)
  const tabSwitchesRef = useRef(0)
  const submitInProgressRef = useRef(false)
  const lastTabSwitchWarningAtRef = useRef(0)
  
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current && node.srcObject !== streamRef.current) {
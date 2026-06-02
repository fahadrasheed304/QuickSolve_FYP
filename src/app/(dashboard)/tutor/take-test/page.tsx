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
        } finally {
        window.clearTimeout(timeoutId)
        if (isMounted) setLoading(false)
      }
    }
    fetchTest()

    return () => {
      isMounted = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  const handleProctoringWarning = useCallback((reason: string) => {
    setWarningCount(prev => {
      const newCount = prev + 1
      warningCountRef.current = newCount
      if (newCount >= MAX_WARNINGS) {
        if (handleSubmitRef.current) handleSubmitRef.current(true)
      } else {
        setWarningMessage(reason)
        setShowWarningModal(true)
      }
      return newCount
    })
  }, [])

  const handleTabSwitchWarning = useCallback(() => {
    const now = Date.now()
    if (now - lastTabSwitchWarningAtRef.current < 1500) return

    lastTabSwitchWarningAtRef.current = now
    setTabSwitches(prev => {
      const next = prev + 1
      tabSwitchesRef.current = next
      return next
    })
    handleProctoringWarning("Tab switching or minimizing the browser detected.")
  }, [handleProctoringWarning])

  // Proctoring: Tab visibility detection
  useEffect(() => {
    if (!testStarted || testFinished) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleTabSwitchWarning()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [testStarted, testFinished, handleTabSwitchWarning])

  // Proctoring: Window blur detection
  useEffect(() => {
    if (!testStarted || testFinished) return

    const handleBlur = () => {
      handleTabSwitchWarning()
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [testStarted, testFinished, handleTabSwitchWarning])
  useEffect(() => {
    if (!testStarted || testFinished || !faceTrackingReady || !verificationPassed) return;
    const faceDetector = faceDetectorRef.current;
    const faceapi = faceApiRef.current;
    const referenceDescriptor = referenceFaceDescriptorRef.current;

    let isActive = true;
    let missingFaceFrames = 0;
    let identityMismatchFrames = 0;
    let lookingAwayFrames = 0;
    let lastFaceAnalysisCheck = 0;
    let lastIdentityCheck = 0;

    const trackFace = async () => {
      if (!isActive) return;
      if (showWarningModal) {
        // Pause tracking while warning is shown
        setTimeout(trackFace, 1000);
        return;
      }
      
      if (videoRef.current && streamRef.current && videoRef.current.readyState === 4) {
        try {
          const detections = faceDetector
            ? await faceDetector.detect(videoRef.current)
            : null
          const faceMissing = detections
            ? detections.length === 0
            : !hasUsableCameraFrame(videoRef.current)
          
          if (faceMissing) {
            missingFaceFrames++;
            if (missingFaceFrames > 3) {
              handleProctoringWarning("No face detected in the camera frame.");
              missingFaceFrames = 0;
            }
          } else {
            missingFaceFrames = 0; // reset
          }

          const now = Date.now()
          if (!faceMissing && faceapi && referenceDescriptor && now - lastFaceAnalysisCheck > FACE_ATTENTION_CHECK_INTERVAL_MS) {
            lastFaceAnalysisCheck = now
            const liveFace = await faceapi
              .detectSingleFace(
                videoRef.current,
                new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 })
              )
              .withFaceLandmarks()
              .withFaceDescriptor()

            if (liveFace) {
              if (isLookingAwayFromCamera(liveFace.landmarks)) {
                lookingAwayFrames++
                if (lookingAwayFrames >= 2) {
                  handleProctoringWarning("Please keep your face directed toward the screen during the test.")
                  lookingAwayFrames = 0
                }
              } else {
                lookingAwayFrames = 0
              }

              if (now - lastIdentityCheck > IDENTITY_CHECK_INTERVAL_MS) {
                lastIdentityCheck = now
                const distance = faceapi.euclideanDistance(referenceDescriptor, liveFace.descriptor)
                if (distance > FACE_TRACKING_MISMATCH_THRESHOLD) {
                  identityMismatchFrames++
                  if (identityMismatchFrames >= 2) {
                    handleProctoringWarning("Camera face does not match the verified profile photo.")
                    identityMismatchFrames = 0
                  }
                } else {
                  identityMismatchFrames = 0
                }
              }
            }
          }
        } catch (e) {
          console.error("Face tracking error:", e);
        }
      }

      if (isActive) {
        setTimeout(trackFace, 1000);
      }
    };

    trackFace();

    return () => {
      isActive = false;
    };
  }, [testStarted, testFinished, faceTrackingReady, verificationPassed, showWarningModal, handleProctoringWarning]);

  // Timer
  useEffect(() => {
    if (!testStarted || testFinished || timeLeft <= 0) return

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time's up - auto submit
          if (handleSubmitRef.current) handleSubmitRef.current(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [testStarted, testFinished, timeLeft])

  const startTest = () => {
    if (!verificationPassed || !faceTrackingReady || !referenceFaceDescriptorRef.current) {
      const message = 'Please complete face verification with the same verified profile photo before starting the test.'
      setVerificationError(message)
      notifyError(message)
      return
    }

    setTestStarted(true)
    // Enter fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  const startVerification = async () => {
    if (!profilePhotoUrl) {
         setVerificationError('No profile photo found in your account. Please update your profile.')
      return
    }
    
    setVerifying(true)
    setVerificationError('')
    setVerificationPassed(false)
    setFaceTrackingReady(false)
    referenceFaceDescriptorRef.current = null
    setVerificationStep('Starting camera...')
    
    try {
      const faceDetector = faceDetectorRef.current || getNativeFaceDetector()
      faceDetectorRef.current = faceDetector
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      
      setVerificationStep('Reading live camera frame...')
      if (!videoRef.current) throw new Error("Video not available")
      await waitForVideoReady(videoRef.current)
      await wait(650)

      if (!hasUsableCameraFrame(videoRef.current)) {
        setVerificationError('Camera is active but the frame is too dark or blank. Please improve lighting and try again.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      setVerificationStep('Loading face match model...')
      const faceapi = faceApiRef.current || await loadFaceRecognitionApi()
      faceApiRef.current = faceapi

      setVerificationStep('Checking profile photo...')
      const referenceImage = await loadImage(profilePhotoUrl)
      let profileFaces: DetectedFace[] = []
      for (const settings of FACE_DETECTOR_SETTINGS) {
        profileFaces = await faceapi
          .detectAllFaces(referenceImage, new faceapi.TinyFaceDetectorOptions(settings))
          .withFaceLandmarks()
          .withFaceDescriptors()
        if (profileFaces.length > 0) break
      }

      if (profileFaces.length === 0) {
        setVerificationError('Could not detect a clear face in your profile picture. Please upload a better profile photo.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      if (profileFaces.length > 1) {
        setVerificationError('Your profile picture must show only one person. Please upload a solo, clear face photo.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      setVerificationStep('Matching live face...')
      let bestLiveDescriptor: Float32Array | null = null
      let bestMatchDistance = Number.POSITIVE_INFINITY
      let detectedLiveFace = false
      let multiplePeopleVisible = false
      let lookingAway = false
      const matchDistances: number[] = []

      for (let sample = 0; sample < LIVE_MATCH_SAMPLE_COUNT; sample++) {
        await wait(sample === 0 ? 0 : 550)
        if (!videoRef.current) break

        let liveFaces: DetectedFace[] = []
        for (const settings of FACE_DETECTOR_SETTINGS) {
          liveFaces = await faceapi
            .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions(settings))
            .withFaceLandmarks()
            .withFaceDescriptors()
          if (liveFaces.length > 0) break
        }

        if (liveFaces.length > 1) {
          multiplePeopleVisible = true
          break
        }

        if (liveFaces.length === 1) {
          detectedLiveFace = true
          if (isLookingAwayFromCamera(liveFaces[0].landmarks)) {
            lookingAway = true
            continue
          }

          const distance = faceapi.euclideanDistance(profileFaces[0].descriptor, liveFaces[0].descriptor)
          matchDistances.push(distance)
          if (distance < bestMatchDistance) {
            bestMatchDistance = distance
            bestLiveDescriptor = liveFaces[0].descriptor
          }
        }
      }

      if (!detectedLiveFace) {
        setVerificationError('Could not detect a face in the camera. Please ensure good lighting and look directly at the camera.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      if (lookingAway && matchDistances.length === 0) {
        setVerificationError('Please look directly at the camera while matching your face.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      if (multiplePeopleVisible) {
        setVerificationError('Only one person should be visible during the test.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      const sortedDistances = [...matchDistances].sort((a, b) => a - b)
      const medianDistance = sortedDistances[Math.floor(sortedDistances.length / 2)] ?? Number.POSITIVE_INFINITY
      const averageDistance = matchDistances.length
        ? matchDistances.reduce((sum, value) => sum + value, 0) / matchDistances.length
        : Number.POSITIVE_INFINITY
      const strongMatches = matchDistances.filter(distance => distance <= FACE_MATCH_THRESHOLD).length

      if (
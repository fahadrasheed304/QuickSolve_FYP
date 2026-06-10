"use client"

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

type PreparedReferenceFace = {
  descriptor: Float32Array | null
  count: number
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
const referenceFaceCache = new Map<string, Promise<PreparedReferenceFace>>()

const loadFaceRecognitionApi = async () => {
  if (!faceApiLoadPromise) {
    faceApiLoadPromise = import('@vladmandic/face-api').then(async (faceapi) => {
      const runtime = faceapi as unknown as FaceApiRuntimeModule
      await runtime.tf.setBackend('webgl').catch(() => runtime.tf.setBackend('cpu'))
      await runtime.tf.ready()
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
      ])
      return faceapi
    })
  }

  return faceApiLoadPromise
}

const getPreparedReferenceFace = (faceapi: FaceApiModule, profilePhotoUrl: string) => {
  const cached = referenceFaceCache.get(profilePhotoUrl)
  if (cached) return cached

  const prepared = loadImage(profilePhotoUrl).then(async (referenceImage) => {
    let profileFaces: DetectedFace[] = []
    for (const settings of FACE_DETECTOR_SETTINGS) {
      profileFaces = await faceapi
        .detectAllFaces(referenceImage, new faceapi.TinyFaceDetectorOptions(settings))
        .withFaceLandmarks()
        .withFaceDescriptors()
      if (profileFaces.length > 0) break
    }

    return {
      descriptor: profileFaces[0]?.descriptor || null,
      count: profileFaces.length,
    }
  })

  referenceFaceCache.set(profilePhotoUrl, prepared)
  return prepared
}

const loadImage = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => {
      reject(new Error('Could not load profile photo for verification.'))
    }
    image.crossOrigin = 'anonymous'
    image.src = src
  })
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const waitForVideoReady = (video: HTMLVideoElement) => {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      resolve()
      return
    }

    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('Camera did not become ready in time.'))
    }, 8000)

    const handleReady = () => {
      if (video.videoWidth > 0) {
        cleanup()
        resolve()
      }
    }

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      video.removeEventListener('loadeddata', handleReady)
      video.removeEventListener('canplay', handleReady)
    }

    video.addEventListener('loadeddata', handleReady)
    video.addEventListener('canplay', handleReady)
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
const FACE_TRACKING_LOOP_INTERVAL_MS = 700
const FACE_ATTENTION_CHECK_INTERVAL_MS = 1000
const IDENTITY_CHECK_INTERVAL_MS = 2500
const MISSING_FACE_WARNING_FRAMES = 2
const LOOKING_AWAY_WARNING_FRAMES = 1
const IDENTITY_MISMATCH_WARNING_FRAMES = 1

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

  useEffect(() => {
    if (!profilePhotoUrl) return

    let cancelled = false
    loadFaceRecognitionApi()
      .then((faceapi) => {
        if (cancelled) return
        faceApiRef.current = faceapi
        return getPreparedReferenceFace(faceapi, profilePhotoUrl)
      })
      .catch((err) => {
        console.error('Face match preload error:', err)
      })

    return () => {
      cancelled = true
    }
  }, [profilePhotoUrl])

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
      if (prev >= MAX_WARNINGS) {
        setWarningMessage(reason)
        setShowWarningModal(true)
        return prev
      }

      const newCount = prev + 1
      warningCountRef.current = newCount
      setWarningMessage(reason)
      setShowWarningModal(true)
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
        setTimeout(trackFace, FACE_TRACKING_LOOP_INTERVAL_MS);
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
            if (missingFaceFrames >= MISSING_FACE_WARNING_FRAMES) {
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
                if (lookingAwayFrames >= LOOKING_AWAY_WARNING_FRAMES) {
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
                  if (identityMismatchFrames >= IDENTITY_MISMATCH_WARNING_FRAMES) {
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
        setTimeout(trackFace, FACE_TRACKING_LOOP_INTERVAL_MS);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })
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
      const profileFace = await getPreparedReferenceFace(faceapi, profilePhotoUrl)

      if (profileFace.count === 0 || !profileFace.descriptor) {
        setVerificationError('Could not detect a clear face in your profile picture. Please upload a better profile photo.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      if (profileFace.count > 1) {
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

          const distance = faceapi.euclideanDistance(profileFace.descriptor, liveFaces[0].descriptor)
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
         !bestLiveDescriptor ||
        matchDistances.length < MIN_LIVE_FACE_SAMPLES ||
        strongMatches < MIN_LIVE_FACE_SAMPLES ||
        medianDistance > FACE_MATCH_MEDIAN_THRESHOLD ||
        averageDistance > FACE_MATCH_AVERAGE_THRESHOLD
      ) {
        setVerificationError('Face does not match the verified profile photo. Only the tutor who uploaded the profile photo can start this test.')
        stopCameraStream()
        setVerifying(false)
        return
      }

      referenceFaceDescriptorRef.current = profileFace.descriptor
      setFaceTrackingReady(true)
      setVerificationPassed(true)
      
    } catch (err: unknown) {
      console.error('Verification error:', err)
      setVerificationError(err instanceof Error ? err.message : 'Error accessing camera or performing verification.')
      stopCameraStream()
    } finally {
      setVerifying(false)
      setVerificationStep('')
    }
  }

  const handleAnswer = (questionId: string, optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }))
  }

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  const handleSubmit = async (autoSubmit: boolean = false) => {
    if (submitInProgressRef.current) return
    submitInProgressRef.current = true

    if (timerRef.current) clearInterval(timerRef.current)
    setTestFinished(true)
    
    stopCameraStream()
    
    // Exit fullscreen
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }

    setLoading(true)

    // Submit to server
    try {
      const finalWarningCount = warningCountRef.current
      const finalTestStatus = finalWarningCount >= MAX_WARNINGS ? 'cancelled' : 'completed'

      const res = await fetch('/api/tutor/test/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: (testData?.questions || []).map((q) => {
            const selectedOptionIdx = answers[q.id]
            const answerGiven = selectedOptionIdx === undefined ? '' : (q.options[selectedOptionIdx] || '')
            return {
              questionId: q.id,
              answerGiven,
              timeTaken: 30
               }
          }),
          timeTakenSeconds: (testData?.timeLimit || TEST_DURATION) - timeLeft,
          tabSwitches: tabSwitchesRef.current,
          warningsGiven: finalWarningCount,
          testStatus: finalTestStatus,
          autoSubmitted: autoSubmit,
        })
      })

      if (res.ok) {
        const data = await res.json()
        setResult({ 
          score: data.result.scorePercentage, 
          passed: data.result.passed 
        })
      } else {
        setError('We could not submit your test properly. Please contact support if this continues.')
      }
    } catch (err) {
      console.error('Failed to submit test:', err)
      setError('We could not submit your test right now. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#006c4a] mx-auto mb-4" />
          <p className="text-muted-foreground">Loading test...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Cannot Start Test</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => router.push('/tutor/waiting-verification')}>
            Go Back
          </Button>
        </div>
      </main>
    )
  }

  // Verification screen
  if (!verificationPassed && !testFinished && !testStarted) {
    return (
      <main className="min-h-screen bg-background py-12 px-4 flex flex-col items-center justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="p-8">
            <h1 className="text-2xl font-bold text-center mb-6">Identity Verification</h1>
            <p className="text-muted-foreground text-center mb-6 text-sm">
              Please position your face clearly in the camera before starting the test.
            </p>
            
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-6 flex items-center justify-center">
              <video 
                ref={handleVideoRef} 
                className="w-full h-full object-cover"
                playsInline 
                muted 
              />
              {!verifying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-white text-sm">Camera inactive</span>
                </div>
              )}
            </div>

            {verificationError && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-md text-center">
                {verificationError}
              </div>
            )}

            <Button 
              onClick={startVerification} 
              disabled={verifying}
              className="w-full bg-[#006c4a] hover:bg-green-800"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {verificationStep || 'Verifying Identity...'}
                </>
              ) : (
                'Start Verification'
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Instructions screen
  if (!testStarted && !testFinished && verificationPassed) {
    return (
      <main className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <video ref={handleVideoRef} className="hidden" playsInline muted />
          <Card>
            <CardContent className="p-8">
              <h1 className="text-2xl font-bold text-foreground mb-4">Subject Proficiency Test</h1>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-[#006c4a] mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Duration: 20 minutes</p>
                    <p className="text-sm text-muted-foreground">The timer starts when you begin and cannot be paused.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#006c4a] mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Passing Score: 80%</p>
                    <p className="text-sm text-muted-foreground">You need to answer at least 80% correctly to pass.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Proctored Test</p>
                    <p className="text-sm text-muted-foreground">
                      • Do not switch tabs or windows<br/>
                      • Do not minimize the browser<br/>
                      • You will receive a warning if tab switching is detected<br/>
                      • Test auto-submits after 3 warnings
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <strong>Important:</strong> Make sure you have a stable internet connection and are in a quiet environment before starting. Once started, you cannot pause or retake immediately.
                </p>
              </div>

              <Button 
                onClick={startTest} 
                className="w-full bg-[#006c4a] hover:bg-green-800"
              >
                Start Test
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  // Results screen
  if (testFinished && result) {
    return (
      <main className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
                result.passed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
              }`}>
                {result.passed ? (
                  <CheckCircle className="w-10 h-10 text-green-600" />
                ) : (
                  <AlertTriangle className="w-10 h-10 text-red-600" />
                )}
              </div>
              
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {result.passed ? 'Congratulations!' : 'Test Not Passed'}
              </h1>
              
              <p className="text-muted-foreground mb-6">
                {result.passed 
                  ? 'You have passed the subject proficiency test.' 
                  : 'You did not meet the passing score requirement.'}
              </p>
              <div className="bg-muted rounded-lg p-6 mb-6">
                <p className="text-sm text-muted-foreground mb-1">Your Score</p>
                <p className={`text-4xl font-bold ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {result.score}%
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Passing: {testData?.passingScore || 80}%
                </p>
              </div>

              {!result.passed && (
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    You can retake this test after 7 days. Please review the subject material and try again.
                  </p>
                </div>
              )}

              <Button 
                onClick={() => router.push('/tutor/waiting-verification')}
                className="bg-[#006c4a] hover:bg-green-800"
              >
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  const currentQ = testData?.questions[currentQuestion]
  const totalQuestions = testData?.questions.length || 0
  const answeredCount = Object.keys(answers).length
  const answeredProgress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0

  return (
    <main 
      className="min-h-screen bg-background py-8 px-4 select-none"
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
    >
      {/* Hidden video element for continuous tracking */}
      <video ref={handleVideoRef} className="hidden" playsInline muted />

      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">Subject Proficiency Test</h1>
          
          <div className="flex items-center gap-4">
            {warningCount > 0 && (
              <div className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Warning {warningCount}/{MAX_WARNINGS}</span>
              </div>
            )}
            
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold ${
              timeLeft < 60 ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-muted text-foreground'
            }`}>
              <Clock className="w-4 h-4" />
              {formatTime(timeLeft)}
            </div>
          </div>
           </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
            <span>Question {currentQuestion + 1} of {totalQuestions}</span>
            <span>{Math.round(answeredProgress)}% answered</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#006c4a] transition-all duration-300"
              style={{ width: `${answeredProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-8">
            {currentQ?.subject && (
              <div className="mb-4 inline-flex items-center rounded-full bg-[#006c4a]/10 px-3 py-1 text-xs font-bold text-[#006c4a]">
                Subject: {currentQ.subject}
              </div>
            )}
            <h2 className="text-lg font-medium text-foreground mb-6">
              {currentQ?.question}
            </h2>

            <div className="space-y-3">
              {currentQ?.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(currentQ.id, idx)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    answers[currentQ.id] === idx
                      ? 'border-[#006c4a] bg-[#006c4a]/10'
                      : 'border-border hover:border-[#006c4a]/40 hover:bg-muted/50'
                  }`}
                >
                  <span className="font-medium text-foreground">{String.fromCharCode(65 + idx)}.</span>{' '}
                  <span className="text-foreground">{option}</span>
                </button>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                disabled={currentQuestion === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              {currentQuestion < totalQuestions - 1 ? (
                <Button
                  onClick={() => setCurrentQuestion(prev => prev + 1)}
                  className="bg-[#006c4a] hover:bg-green-800"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
                ) : (
                <Button
                  onClick={() => handleSubmit(false)}
                  className="bg-[#006c4a] hover:bg-green-800"
                >
                  Submit Test
                  <CheckCircle className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Question navigator */}
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {testData?.questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setCurrentQuestion(idx)}
              className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                idx === currentQuestion
                  ? 'bg-[#006c4a] text-white'
                  : answers[q.id] !== undefined
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-card text-foreground border border-border hover:border-[#006c4a]/40'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Answered: {answeredCount} / {totalQuestions}
        </p>
      </div>

      {/* Warning modal */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Warning #{warningCount}</h3>
            </div>
            <p className="text-foreground font-medium mb-2 text-red-600">
              {warningMessage}
            </p>
              <p className="text-muted-foreground mb-4 text-sm">
               {warningCount >= MAX_WARNINGS
                 ? 'This is your final warning. Your test will be submitted after you acknowledge this message.'
                 : `This is your ${warningCount} of ${MAX_WARNINGS} warnings. After ${MAX_WARNINGS} warnings, your test will be automatically submitted.`}
              </p>
              <Button 
               onClick={() => {
                 setShowWarningModal(false)
                 if (warningCountRef.current >= MAX_WARNINGS && handleSubmitRef.current) {
                   void handleSubmitRef.current(true)
                 }
               }}
                className="w-full bg-[#006c4a] hover:bg-green-800"
              >
               {warningCount >= MAX_WARNINGS ? 'I Understand - Submit Test' : 'I Understand - Continue Test'}
              </Button>
          </div>
        </div>
      )}
    </main>
  )
}

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
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
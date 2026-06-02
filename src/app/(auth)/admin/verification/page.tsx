"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  Camera,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileText,
  GraduationCap,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getCurrentTutorDocuments } from '@/lib/tutor-documents'
import { getApiMessage, notifyError, notifySuccess } from '@/lib/toast'

interface TutorDegree {
  degree_name?: string | null
  institution?: string | null
  board_university?: string | null
  year_completed?: string | number | null
}

interface TutorDocument {
  id?: string
  document_type?: string | null
  document_url?: string | null
  file_name?: string | null
  uploaded_at?: string | null
}

interface TutorNote {
  message: string
  note_type: string
  created_at: string
}

interface Tutor {
  user_email: string
  fullname: string
  email?: string
  phone?: string
  subjects?: string[]
  verification_status?: string
  verification_stage?: string
  city?: string
  test_attempts?: number
  subject_test_passed?: boolean
  _degreeCount?: number
  _docCount?: number
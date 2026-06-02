

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
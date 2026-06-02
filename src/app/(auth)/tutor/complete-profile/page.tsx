

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


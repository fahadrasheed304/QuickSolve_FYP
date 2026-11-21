export const SUBJECTS_MATRIC = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'Computer Science', 'General Science', 'English', 'Urdu', 'Islamiat', 'Pak Studies',
] as const

export const SUBJECTS_INTER = [
  'Mathematics (FSc)', 'Physics (FSc)', 'Chemistry (FSc)', 'Biology (FSc)',
  'Computer Science (ICS)', 'Statistics (ICS)', 'Economics (FA/ICS)',
  'Accounting (ICom)', 'Business Math (ICom)', 'Principles of Commerce (ICom)',
  'Education (FA)', 'Sociology (FA)',
  'English (Compulsory)', 'Urdu (Compulsory)', 'Islamic Studies (Compulsory)', 'Pakistan Studies (Compulsory)',
] as const

export const STUDENT_CLASS_LEVELS = ['9th', '10th', '1st Year', '2nd Year'] as const
export const SESSION_DURATIONS = [15, 30, 45, 60] as const

export type StudentClassLevel = typeof STUDENT_CLASS_LEVELS[number]

export function isStudentClassLevel(value: string): value is StudentClassLevel {
  return (STUDENT_CLASS_LEVELS as readonly string[]).includes(value)
}

export function getStudentSubjects(classLevel: StudentClassLevel) {
  return classLevel === '1st Year' || classLevel === '2nd Year' ? SUBJECTS_INTER : SUBJECTS_MATRIC
}

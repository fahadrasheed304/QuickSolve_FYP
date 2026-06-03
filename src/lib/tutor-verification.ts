const SUBMITTED_REVIEW_STAGES = new Set([
  'submitted',
  'under_review',
  'test_invited',
  'test_scheduled',
  'test_passed',
  'test_failed',
  'verified',
  'rejected',
])

const EARLY_REVIEW_STAGES = new Set(['submitted', 'pending', 'under_review'])

const REQUIRED_DOCUMENT_TYPES = ['cnic_front', 'profile_photo']

type TutorProfileLike = {
  city?: string | null
  cnic?: string | null
  subjects?: string[] | null
  verification_status?: string | null
  verification_stage?: string | null
}

type DocumentLike = {
  document_type?: string | null
  documentType?: string | null
}

const normalizeStage = (stage?: string | null) => {
  const value = (stage || '').trim()
    return value || 'not_started'
}

const normalizeStatus = (status?: string | null) => {
  const value = (status || '').trim()
  return value || 'not_started'
}

export const hasRequiredTutorSubmissionData = (
  profile: TutorProfileLike | null | undefined,
  degrees: unknown[] = [],
  documents: DocumentLike[] = []
) => {
  if (!profile) return false

  const documentTypes = new Set(
    documents.map((doc) => doc.document_type || doc.documentType).filter(Boolean)
  )
  const hasRequiredDocuments = REQUIRED_DOCUMENT_TYPES.every((type) => documentTypes.has(type))
  const cnic = (profile.cnic || '').replace(/\D/g, '')

  return Boolean(
    profile.city &&
    cnic.length === 13 &&
    Array.isArray(profile.subjects) &&
    profile.subjects.length > 0 &&
    degrees.length > 0 &&
    hasRequiredDocuments
  )
}

export const getTutorVerificationState = (
  profile: TutorProfileLike | null | undefined,
  degrees: unknown[] = [],
  documents: DocumentLike[] = []
) => {
  const stage = normalizeStage(profile?.verification_stage)
  const status = normalizeStatus(profile?.verification_status)
  const hasRequiredData = hasRequiredTutorSubmissionData(profile, degrees, documents)
  const hasSubmittedStage = SUBMITTED_REVIEW_STAGES.has(stage) || stage === 'pending'
  const isSubmitted =
    (hasSubmittedStage && (!EARLY_REVIEW_STAGES.has(stage) || hasRequiredData)) ||
    (status !== 'not_started' && hasRequiredData)

  if (!isSubmitted) {
    return {
      isSubmitted: false,
      hasRequiredData,
      stage: 'not_started',
      status: 'not_started',
    }
  }

  return {
    isSubmitted: true,
    hasRequiredData,
    stage: stage === 'not_started' ? 'submitted' : stage,
    status: status === 'not_started' ? 'pending' : status,
  }
}

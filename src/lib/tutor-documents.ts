export type TutorDocumentRow = {
  id?: string
  document_type?: string | null
  document_url?: string | null
  file_name?: string | null
  uploaded_at?: string | null
}

const SINGLE_CURRENT_DOCUMENT_TYPES = new Set(['cnic_front', 'cnic_back', 'profile_photo'])

const getDocumentTime = (doc: TutorDocumentRow) => {
  const time = doc.uploaded_at ? new Date(doc.uploaded_at).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

export const getCurrentTutorDocuments = <T extends TutorDocumentRow>(documents: T[]) => {
  const sortedDocuments = [...documents].sort((left, right) => getDocumentTime(right) - getDocumentTime(left))
  const seenSingleTypes = new Set<string>()
  const seenCertificates = new Set<string>()

  return sortedDocuments.filter((doc) => {
    const documentType = doc.document_type || ''

    if (SINGLE_CURRENT_DOCUMENT_TYPES.has(documentType)) {
      if (seenSingleTypes.has(documentType)) return false
      seenSingleTypes.add(documentType)
      return true
    }

    const certificateKey = doc.document_url || doc.id || `${documentType}:${doc.file_name || ''}`
    if (seenCertificates.has(certificateKey)) return false
    seenCertificates.add(certificateKey)
    return true
  })
}
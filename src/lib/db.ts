// ============================================================
// db.ts — Supabase-backed database layer
// Replaces the old db.json file-based approach
// NEVER import in middleware or client components!
// ============================================================
import { supabaseAdmin } from './supabase'

const PROBLEM_EXPIRY_MINUTES = 15

export interface Transaction {
  id: string
  type: 'credit' | 'debit' | 'escrow'
  amount: number
  method: string
  description: string
  date: string   // ISO string (maps from created_at)
  status: 'completed' | 'pending' | 'failed'
}

export const DB = {
  // ── AUTH ────────────────────────────────────────────────────
  findUserByEmail: async (email: string) => {
    const normalizedEmail = email.toLowerCase().trim()
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single()
    if (error || !data) return null
    return data
  },

  createUser: async (user: {
    fullname: string
        email: string
    phone?: string
    password: string
    role?: string
  }) => {
    const normalizedEmail = user.email.toLowerCase().trim()
    const role = user.role || 'student'
    
    // Create user
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        fullname: user.fullname,
        email: normalizedEmail,
        phone: user.phone || '',
        password: user.password,
        role: role,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    
    // Create role-specific wallet for new user
    try {
      await supabaseAdmin
        .from('role_wallets')
        .insert({ user_email: normalizedEmail, role, balance: 0 })
    } catch (walletErr) {
      // Wallet might already exist, ignore error
      console.log('Wallet creation skipped or error:', walletErr)
    }
    
    return data
  },
  
  // ── ROLE-BASED WALLETS ──────────────────────────────────────
  getWalletBalance: async (email: string, role: string) => {
    const normalizedEmail = email.toLowerCase().trim()
    
    // Get or create role-specific wallet using database function
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .rpc('get_or_create_wallet', {
        p_email: normalizedEmail,
        p_role: role
      })
    
    if (walletErr) {
      console.error('Error getting wallet:', walletErr)
      // Fallback: try direct query
      const { data: existingWallet } = await supabaseAdmin
        .from('role_wallets')
        .select('*')
        .eq('user_email', normalizedEmail)
        .eq('role', role)
        .single()
      
      if (existingWallet) {
        return {
          balance: existingWallet.balance ?? 0,
          transactions: [],
        }
      }
      
      // Create wallet if not exists
      const { data: newWallet } = await supabaseAdmin
        .from('role_wallets')
        .insert({ user_email: normalizedEmail, role, balance: 0 })
        .select()
                .single()
      
      return {
        balance: newWallet?.balance ?? 0,
        transactions: [],
      }
    }

    // Fetch transactions for this role
    const { data: txs } = await supabaseAdmin
      .from('wallet_transactions')
      .select('*')
      .eq('user_email', normalizedEmail)
      .eq('user_role', role)
      .order('created_at', { ascending: false })

    return {
      balance: wallet?.balance ?? 0,
      transactions: (txs || []).map((tx: any) => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        method: tx.method || '',
        description: tx.description,
        status: tx.status,
        date: tx.created_at,
      })),
    }
  },

  updateWalletBalance: async (email: string, role: string, amount: number) => {
    const normalizedEmail = email.toLowerCase().trim()
    
    // Use database function to update wallet
        const { data: wallet, error } = await supabaseAdmin
      .rpc('update_wallet_balance', {
        p_email: normalizedEmail,
        p_role: role,
        p_amount: amount
      })
    
    if (error) {
      console.error('Error updating wallet:', error)
      
      // Fallback: manual update
      const { data: existing } = await supabaseAdmin
        .from('role_wallets')
        .select('balance')
        .eq('user_email', normalizedEmail)
        .eq('role', role)
        .single()
      
      if (existing) {
        const newBalance = (existing.balance ?? 0) + amount
        const { error: updateErr } = await supabaseAdmin
          .from('role_wallets')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('user_email', normalizedEmail)
          .eq('role', role)
        
        return !updateErr
      } else {
        // Create new wallet with initial amount
        const { error: insertErr } = await supabaseAdmin
          .from('role_wallets')
          .insert({ user_email: normalizedEmail, role, balance: amount })
        
        return !insertErr
              }
    }

    return !!wallet
  },

  updateWallet: async (
    email: string,
    role: string,
    newBalance: number,
    newTransaction: Transaction
  ): Promise<boolean> => {
    // Update balance
    const updated = await DB.updateWalletBalance(email, role, newBalance - (await DB.getWalletBalance(email, role)).balance)
    if (!updated) return false

    // Insert transaction record
    const { error: txErr } = await supabaseAdmin
      .from('wallet_transactions')
      .insert({
        id: newTransaction.id,
        user_email: email,
        user_role: role,
        type: newTransaction.type,
        amount: newTransaction.amount,
        description: newTransaction.description,
        status: newTransaction.status,
      })
    if (txErr) return false

    return true
  },

  updateUserPassword: async (email: string, password: string) => {
        const normalizedEmail = email.toLowerCase().trim()
    const { error } = await supabaseAdmin
      .from('users')
      .update({ password })
      .eq('email', normalizedEmail)

    if (error) throw new Error(error.message)
    return true
  },

  // ── PROBLEMS ────────────────────────────────────────────────
  createProblem: async (problem: {
    studentEmail: string
    subject: string
    class: string
    details?: string
    offerPrice: number
    durationMin: number
    imageUrl?: string
  }) => {
    const { data, error } = await supabaseAdmin
      .from('problems')
      .insert({
        student_email: problem.studentEmail,
        subject: problem.subject,
        class: problem.class,
        details: problem.details || '',
        offer_price: problem.offerPrice,
        duration_min: problem.durationMin,
        image_url: problem.imageUrl || null,
        status: 'open',
      })
      .select()
      .single()
          if (error) throw new Error(error.message)
    return data
  },

  expireOldOpenProblems: async () => {
    const cutoff = new Date(Date.now() - PROBLEM_EXPIRY_MINUTES * 60 * 1000).toISOString()
    const { error } = await supabaseAdmin
      .from('problems')
      .update({ status: 'expired' })
      .eq('status', 'open')
      .lt('created_at', cutoff)

    if (error) throw new Error(error.message)
  },

  getProblemsForStudent: async (email: string) => {
    const normalizedEmail = email.toLowerCase().trim()
    await DB.expireOldOpenProblems()
    const { data, error } = await supabaseAdmin
      .from('problems')
      .select('*, bids(*)')
      .eq('student_email', normalizedEmail)
      .order('created_at', { ascending: false })
    if (error) return []
    return data
  },

  getOpenProblemsForTutors: async (subjects?: string[]) => {
    await DB.expireOldOpenProblems()
    const cutoff = new Date(Date.now() - PROBLEM_EXPIRY_MINUTES * 60 * 1000).toISOString()
    let query = supabaseAdmin
      .from('problems')
      .select('*, bids(*)')
      .eq('status', 'open')
            .gte('created_at', cutoff)
      .order('created_at', { ascending: false })

    const cleanedSubjects = (subjects || []).filter(Boolean)
    if (cleanedSubjects.length > 0) {
      query = query.in('subject', cleanedSubjects)
    }

    const { data, error } = await query
    if (error) return []
    return data
  },

  // ── BIDS ────────────────────────────────────────────────────
  createBid: async (bid: {
    problemId: string
    tutorName: string
    tutorRating: number
    tutorSessions: number
    tutorSubject: string
    responseTimeMin: number
    price: number
    durationMin: number
  }) => {
    await DB.expireOldOpenProblems()
    const cutoff = new Date(Date.now() - PROBLEM_EXPIRY_MINUTES * 60 * 1000).toISOString()
    const { data: problem, error: problemError } = await supabaseAdmin
      .from('problems')
      .select('id, status, created_at')
      .eq('id', bid.problemId)
      .single()

    if (problemError || !problem) throw new Error('Problem request not found')
    if (problem.status !== 'open' || new Date(problem.created_at).getTime() < new Date(cutoff).getTime()) {
              throw new Error('This problem request has expired. Please bid on a newer request.')
    }

    const { data, error } = await supabaseAdmin
      .from('bids')
      .insert({
        problem_id: bid.problemId,
        tutor_name: bid.tutorName,
        tutor_rating: bid.tutorRating,
        tutor_sessions: bid.tutorSessions,
        tutor_subject: bid.tutorSubject,
        response_time_min: bid.responseTimeMin,
        price: bid.price,
        duration_min: bid.durationMin,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  getBidsForProblem: async (problemId: string) => {
    const { data, error } = await supabaseAdmin
      .from('bids')
      .select('*')
      .eq('problem_id', problemId)
      .order('created_at', { ascending: true })
    if (error) return []
    return data
  },

  getOpenProblemsForStudent: async (email: string) => {
    await DB.expireOldOpenProblems()
    const cutoff = new Date(Date.now() - PROBLEM_EXPIRY_MINUTES * 60 * 1000).toISOString()
        const { data, error } = await supabaseAdmin
      .from('problems')
      .select('id, subject, class, offer_price, duration_min, status, created_at')
      .eq('student_email', email)
      .eq('status', 'open')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
    if (error) return []
    return data
  },

  // ── TUTOR PROFILES ──────────────────────────────────────────
  cancelProblemForStudent: async (problemId: string, studentEmail: string) => {
    const normalizedEmail = studentEmail.toLowerCase().trim()
    const { data, error } = await supabaseAdmin
      .from('problems')
      .update({ status: 'cancelled' })
      .eq('id', problemId)
      .eq('student_email', normalizedEmail)
      .eq('status', 'open')
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data
  },

  acceptBidForStudent: async (problemId: string, studentEmail: string) => {
    const normalizedEmail = studentEmail.toLowerCase().trim()
    await DB.expireOldOpenProblems()
    const cutoff = new Date(Date.now() - PROBLEM_EXPIRY_MINUTES * 60 * 1000).toISOString()
    const { data, error } = await supabaseAdmin
      .from('problems')
      .update({ status: 'accepted' })
            .eq('id', problemId)
      .eq('student_email', normalizedEmail)
      .eq('status', 'open')
      .gte('created_at', cutoff)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data
  },

  createTutorProfile: async (profile: {
    userEmail: string
    fullname: string
    phone?: string
    city?: string
    subjects?: string[]
    highestEducation?: string
    university?: string
    experienceYears?: number
  }) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_profiles')
      .insert({
        user_email: profile.userEmail,
        fullname: profile.fullname,
        phone: profile.phone || '',
        city: profile.city || '',
        subjects: profile.subjects || [],
        highest_education: profile.highestEducation || '',
        university: profile.university || '',
        experience_years: profile.experienceYears || 0,
        verification_status: 'not_started',
        verification_stage: 'not_started',
              })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  getTutorProfile: async (email: string) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_profiles')
      .select('*')
      .eq('user_email', email)
      .single()
    if (error || !data) return null
    return data
  },

  updateTutorProfile: async (email: string, updates: Record<string, any>) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_profiles')
      .update(updates)
      .eq('user_email', email)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  // ── ROLE SWITCHING ──────────────────────────────────────────
  updateUserRole: async (email: string, newRole: string) => {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ role: newRole })
      .eq('email', email)
            .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  userHasRole: async (email: string, role: string) => {
    const normalizedEmail = email.toLowerCase().trim()
    const normalizedRole = role.toLowerCase().trim()

    const user = await DB.findUserByEmail(normalizedEmail)
    if (String(user?.role || '').toLowerCase().trim() === normalizedRole) return true

    const { data: wallet } = await supabaseAdmin
      .from('role_wallets')
      .select('id')
      .eq('user_email', normalizedEmail)
      .eq('role', normalizedRole)
      .maybeSingle()
    if (wallet) return true

    if (normalizedRole === 'tutor') {
      const profile = await DB.getTutorProfile(normalizedEmail)
      if (profile) return true
    }

    return false
  },

  getTutorsByVerificationStatus: async (status: string) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_profiles')
      .select('*')
      .eq('verification_status', status)
            .order('created_at', { ascending: true })
    if (error) return []
    return data
  },

  // ── TUTOR DEGREES ───────────────────────────────────────────
  addDegree: async (email: string, degree: {
    degreeName: string;
    institution: string;
    boardUniversity: string;
    yearCompleted: string;
  }) => {
    const degreeRow = {
      tutor_email: email,
      degree_name: degree.degreeName,
      institution: degree.institution,
      board_university: degree.boardUniversity,
      year_completed: degree.yearCompleted,
    }

    let { data, error } = await supabaseAdmin
      .from('tutor_degrees')
      .insert(degreeRow)
      .select()
      .single()

    if (error && error.message.toLowerCase().includes('grade_marks')) {
      const fallback = await supabaseAdmin
        .from('tutor_degrees')
        .insert({ ...degreeRow, grade_marks: 'Not provided' })
        .select()
        .single()
      data = fallback.data
      error = fallback.error
          }

    if (error) throw new Error(error.message)
    return data
  },

  getDegrees: async (email: string) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_degrees')
      .select('*')
      .eq('tutor_email', email)
      .order('year_completed', { ascending: false })
    if (error) return []
    return data
  },

  deleteDegree: async (degreeId: string) => {
    const { error } = await supabaseAdmin
      .from('tutor_degrees')
      .delete()
      .eq('id', degreeId)
    if (error) throw new Error(error.message)
    return true
  },

  // ── TUTOR DOCUMENTS ─────────────────────────────────────────
  addDocument: async (email: string, doc: {
    documentType: string;
    documentUrl: string;
    fileName: string;
    fileSize?: number;
  }) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_documents')
            .insert({
        tutor_email: email,
        document_type: doc.documentType,
        document_url: doc.documentUrl,
        file_name: doc.fileName,
        file_size: doc.fileSize || 0,
        verification_status: 'pending',
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  getDocuments: async (email: string) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_documents')
      .select('*')
      .eq('tutor_email', email)
      .order('uploaded_at', { ascending: false })
    if (error) return []
    return data
  },

  updateDocumentStatus: async (docId: string, status: string, adminNotes?: string) => {
    const { data, error } = await supabaseAdmin
      .from('tutor_documents')
      .update({
        verification_status: status,
        admin_notes: adminNotes || '',
        verified_at: status !== 'pending' ? new Date().toISOString() : null,
      })
      .eq('id', docId)
      .select()
            .single()
    if (error) throw new Error(error.message)
    return data
  },

  // ── TEST QUESTIONS ──────────────────────────────────────────
  getTestQuestions: async (subjects: string[], limit: number = 40) => {
    if (!subjects || subjects.length === 0) return []

    // Fetch all active questions for the selected subjects
    const { data, error } = await supabaseAdmin
      .from('test_questions')
      .select('*')
      .in('subject', subjects)
      .eq('is_active', true)

    if (error || !data) return []

    // Group questions by subject
    const questionsBySubject: Record<string, any[]> = {}
    subjects.forEach(sub => {
      questionsBySubject[sub] = []
    })

    data.forEach(q => {
      if (questionsBySubject[q.subject]) {
        questionsBySubject[q.subject].push(q)
      }
    })

    // Calculate distribution
    const numSubjects = subjects.length
    const basePerSubject = Math.floor(limit / numSubjects)
    let remainder = limit % numSubjects
    
    const selectedQuestions: any[] = []
    let shortfall = 0

    // First pass: Try to pick equally from each subject
    subjects.forEach(sub => {
      let needed = basePerSubject
      if (remainder > 0) {
        needed += 1
        remainder -= 1
      }

      let subjectQs = questionsBySubject[sub] || []
      // Shuffle the questions for this subject randomly
      subjectQs = subjectQs.sort(() => Math.random() - 0.5)

      if (subjectQs.length < needed) {
        // If this subject doesn't have enough questions, note the shortfall
        shortfall += (needed - subjectQs.length)
        selectedQuestions.push(...subjectQs)
        // Remove used questions
        questionsBySubject[sub] = []
      } else {
        selectedQuestions.push(...subjectQs.slice(0, needed))
        // Keep the unused ones in case we need to make up for a shortfall
        questionsBySubject[sub] = subjectQs.slice(needed)
      }
    })

    // Second pass: Make up for any shortfall from other subjects that still have questions left
    if (shortfall > 0) {
      const remainingAvailable = Object.values(questionsBySubject).flat().sort(() => Math.random() - 0.5)
      if (remainingAvailable.length > 0) {
        selectedQuestions.push(...remainingAvailable.slice(0, shortfall))
              }
    }

    // Shuffle the final combined list so subjects appear in mixed order during the test
    return selectedQuestions.sort(() => Math.random() - 0.5)
  },

  getQuestionById: async (id: string) => {
    const { data, error } = await supabaseAdmin
      .from('test_questions')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return data
  },

  // ── TEST RESULTS ─────────────────────────────────────────────
  saveTestResult: async (result: {
    tutorEmail: string;
    questions: any[];
    totalQuestions: number;
    correctAnswers: number;
    wrongAnswers: number;
    skippedQuestions: number;
    scorePercentage: number;
    passed: boolean;
    tabSwitches: number;
    warningsGiven: number;
    testStatus: string;
    timeTakenSeconds: number;
  }) => {
    const { data, error } = await supabaseAdmin
      .from('test_results')
            .insert({
        tutor_email: result.tutorEmail,
        questions: result.questions,
        total_questions: result.totalQuestions,
        correct_answers: result.correctAnswers,
        wrong_answers: result.wrongAnswers,
        skipped_questions: result.skippedQuestions,
        score_percentage: result.scorePercentage,
        passed: result.passed,
        tab_switches: result.tabSwitches,
        warnings_given: result.warningsGiven,
        test_status: result.testStatus,
        time_taken_seconds: result.timeTakenSeconds,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  getTestResults: async (email: string) => {
    const { data, error } = await supabaseAdmin
      .from('test_results')
      .select('*')
      .eq('tutor_email', email)
      .order('test_date', { ascending: false })
    if (error) return []
    return data
  },

  // ── VERIFICATION NOTES ────────────────────────────────────
  addVerificationNote: async (email: string, note: {
    noteType: string;
    message: string;
        createdBy: string;
  }) => {
    const { data, error } = await supabaseAdmin
      .from('verification_notes')
      .insert({
        tutor_email: email,
        note_type: note.noteType,
        message: note.message,
        created_by: note.createdBy,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  getVerificationNotes: async (email: string) => {
    const { data, error } = await supabaseAdmin
      .from('verification_notes')
      .select('*')
      .eq('tutor_email', email)
      .order('created_at', { ascending: true })
    if (error) return []
    return data
  },

  // ── COMPLETE PROFILE SUBMISSION ───────────────────────────
  submitProfileForVerification: async (email: string, data: {
    personalDetails?: { phone: string; city: string; cnic: string; bio: string };
    subjects: string[];
    degrees: Array<{
      degreeName: string;
      institution: string;
      boardUniversity: string;
            yearCompleted: string;
    }>;
    documents: Array<{
      documentType: string;
      documentUrl: string;
      fileName: string;
      fileSize?: number;
    }>;
  }) => {
    // Update tutor profile with personal details, subjects and status
    const updateData: Record<string, string | string[]> = {
      subjects: data.subjects,
      verification_status: 'pending',
      verification_stage: 'submitted',
    }
    
    // Add personal details if provided
    if (data.personalDetails) {
      updateData.phone = data.personalDetails.phone
      updateData.city = data.personalDetails.city
      updateData.cnic = data.personalDetails.cnic
      updateData.bio = data.personalDetails.bio
    }
    
    const { error: profileError } = await supabaseAdmin
      .from('tutor_profiles')
      .update(updateData)
      .eq('user_email', email)
    if (profileError) throw new Error(profileError.message)

    // Replace degrees with the latest wizard state so re-submits do not duplicate rows.
    const { error: deleteDegreesError } = await supabaseAdmin
      .from('tutor_degrees')
      .delete()
            .eq('tutor_email', email)
    if (deleteDegreesError) throw new Error(deleteDegreesError.message)

    const degreeRows = data.degrees.map((degree) => ({
      tutor_email: email,
      degree_name: degree.degreeName,
      institution: degree.institution,
      board_university: degree.boardUniversity,
      year_completed: degree.yearCompleted,
    }))

    if (degreeRows.length > 0) {
      let { error: degreeError } = await supabaseAdmin
        .from('tutor_degrees')
        .insert(degreeRows)

      if (degreeError && degreeError.message.toLowerCase().includes('grade_marks')) {
        const fallbackRows = degreeRows.map((degree) => ({
          ...degree,
          grade_marks: 'Not provided',
        }))
        const fallback = await supabaseAdmin
          .from('tutor_degrees')
          .insert(fallbackRows)
        degreeError = fallback.error
      }

      if (degreeError) throw new Error(degreeError.message)
    }

    // Document uploads are saved immediately. Only insert payload docs that are not already saved.
    const existingDocuments = await DB.getDocuments(email)
    const existingDocumentUrls = new Set(
      existingDocuments
              .map((doc: { document_url?: string }) => doc.document_url)
        .filter(Boolean)
    )
    const missingDocumentRows = data.documents
      .filter((doc) => doc.documentUrl && !existingDocumentUrls.has(doc.documentUrl))
      .map((doc) => ({
        tutor_email: email,
        document_type: doc.documentType,
        document_url: doc.documentUrl,
        file_name: doc.fileName,
        file_size: doc.fileSize || 0,
        verification_status: 'pending',
      }))

    if (missingDocumentRows.length > 0) {
      const { error: documentError } = await supabaseAdmin
        .from('tutor_documents')
        .insert(missingDocumentRows)
      if (documentError) throw new Error(documentError.message)
    }

    return { success: true }
  },
}

// ── PENDING SIGNUPS (in-memory, OTP flow) ───────────────────
// Uses globalThis so it survives Next.js hot-reloads in dev
const globalForPending = globalThis as unknown as {
  pendingSignups: Record<string, { otp: string; user: any; expires: number }>
}
if (!globalForPending.pendingSignups) {
  globalForPending.pendingSignups = {}
}
export const pendingSignups = globalForPending.pendingSignups

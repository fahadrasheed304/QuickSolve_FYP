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
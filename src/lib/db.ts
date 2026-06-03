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
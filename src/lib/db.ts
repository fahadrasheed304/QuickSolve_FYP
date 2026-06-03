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
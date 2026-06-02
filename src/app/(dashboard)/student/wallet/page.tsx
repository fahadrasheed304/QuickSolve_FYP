import { useState, useEffect } from 'react'
import { ArrowDown, ArrowUp, Lock, RefreshCw, WalletCards } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWalletStore } from '@/stores/wallet-store'
import { notifyError, notifySuccess } from '@/lib/toast'

const PRESET_AMOUNTS = ['500', '1000', '2000', '5000']

const PAYMENT_METHODS = [
  {
    id: 'easypaisa' as const,
    label: 'Easypaisa',
    subtitle: 'Mobile Account',
    icon: <span className="font-black text-success text-sm">EP</span>,
    iconBg: 'bg-success-subtle',
    activeBorder: 'border-success bg-success-subtle',
    placeholder: '03XX-XXXXXXX',
    inputLabel: 'Easypaisa Mobile Number',
  },
  {
    id: 'jazzcash' as const,
    label: 'JazzCash',
    subtitle: 'Mobile Account',
    icon: <span className="font-black text-red-600 text-sm">JC</span>,
    iconBg: 'bg-red-50',
    activeBorder: 'border-red-400 bg-red-50',
    placeholder: '03XX-XXXXXXX',
    inputLabel: 'JazzCash Mobile Number',
  },
  {
    id: 'bank' as const,
    label: 'Bank Transfer',
    subtitle: 'HBL, UBL, Meezan, etc.',
    icon: <WalletCards className="w-5 h-5 text-primary" />,
    iconBg: 'bg-primary-subtle',
    activeBorder: 'border-primary bg-primary-subtle',
    placeholder: 'PK00 IBAN 0000 0000 0000 0000',
    inputLabel: 'Bank Account IBAN',
  },
]

type TabType = 'all' | 'credit' | 'debit' | 'escrow'

export default function WalletPage() {
  const { balance, transactions, isLoading, error, fetchWallet, topUp } = useWalletStore()
  const [amount, setAmount] = useState('1000')
  const [method, setMethod] = useState<'easypaisa' | 'jazzcash' | 'bank'>('easypaisa')
  const [accountInput, setAccountInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('all')

  useEffect(() => {
    fetchWallet()
  }, [fetchWallet])

  useEffect(() => {
    if (error) {
      notifyError(error)
    }
  }, [error])

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accountInput.trim()) {
      notifyError(`Please enter your ${selectedMethod.inputLabel.toLowerCase()} before topping up.`)
      return
    }

    setSubmitting(true)
    const result = await topUp(parseInt(amount), method)
    setSubmitting(false)

    if (result.success) {
      notifySuccess(result.message, 'Wallet topped up successfully.')
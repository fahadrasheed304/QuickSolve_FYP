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
            setAccountInput('')
    } else {
      notifyError(result.message, 'We could not top up your wallet. Please try again.')
    }
  }

  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === method)!
  const filteredTxs = transactions.filter((tx) => activeTab === 'all' ? true : tx.type === activeTab)

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="relative mx-auto max-w-6xl p-4 pb-20 md:p-8 qs-page-enter">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="qs-kicker rounded-full px-3 py-1.5">Wallet</div>
          <h1 className="mt-4 text-4xl font-black text-text-main">Money and transactions</h1>
          <p className="mt-1 text-text-muted">Top up balance and track escrow movement.</p>
        </div>
        <button
          onClick={fetchWallet}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-bold text-text-muted shadow-sm transition-all hover:bg-surface-hover hover:text-primary"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Card className="mesh-sheen overflow-hidden border-transparent bg-hero-gradient text-white">
            <CardContent className="p-8">
              <p className="text-sm font-bold text-white/65">Available Balance</p>
              {isLoading ? (
                <div className="my-6 h-14 w-44 animate-pulse rounded-lg bg-white/15" />
              ) : (
                <h2 className="my-5 text-5xl font-black">Rs. {balance.toLocaleString()}</h2>
              )}
              <p className="mb-3 text-xs font-black uppercase text-white/55">Quick Add</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_AMOUNTS.map((val) => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className={cn(
                      'rounded-lg border px-4 py-2 text-sm font-black transition-all',
                      amount === val
                        ? 'border-white bg-white text-primary shadow-md'
                        : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                    )}
                  >
                    Rs. {parseInt(val).toLocaleString()}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h3 className="mb-4 text-xl font-black text-text-main">Add Money</h3>

              <div className="mb-5 space-y-2">
                {PAYMENT_METHODS.map((m) => (
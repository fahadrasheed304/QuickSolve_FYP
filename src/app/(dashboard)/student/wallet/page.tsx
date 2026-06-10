"use client"

import { useState, useEffect } from 'react'
import { ArrowDown, ArrowUp, Lock, RefreshCw, WalletCards } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWalletStore } from '@/stores/wallet-store'
import { notifyError, notifySuccess } from '@/lib/toast'
import { sanitizePhoneDigits } from '@/lib/phone'

const PRESET_AMOUNTS = ['500', '1000', '2000', '5000']
const PAKISTAN_MOBILE_DIGITS = 11

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

    if (method !== 'bank' && !/^03\d{9}$/.test(sanitizePhoneDigits(accountInput, PAKISTAN_MOBILE_DIGITS))) {
      notifyError('Please enter an 11-digit mobile number, for example 03XXXXXXXXX.')
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

  const handlePaymentMethodChange = (nextMethod: typeof method) => {
    setMethod(nextMethod)
    setAccountInput((current) => (
      nextMethod === 'bank' ? current : sanitizePhoneDigits(current, PAKISTAN_MOBILE_DIGITS)
    ))
  }

  const handleAccountInputChange = (value: string) => {
    setAccountInput(method === 'bank' ? value.toUpperCase().slice(0, 34) : sanitizePhoneDigits(value, PAKISTAN_MOBILE_DIGITS))
  }

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
                                      <button
                    key={m.id}
                    onClick={() => handlePaymentMethodChange(m.id)}
                    className={cn(
                      'flex w-full items-center rounded-lg border p-4 text-left transition-all',
                      method === m.id ? m.activeBorder : 'border-border bg-surface hover:bg-surface-hover'
                    )}
                  >
                    <div className={cn('mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full', m.iconBg)}>
                      {m.icon}
                    </div>
                    <div>
                      <div className="text-sm font-black text-text-main">{m.label}</div>
                      <div className="text-xs text-text-muted">{m.subtitle}</div>
                    </div>
                    {method === m.id && <div className="ml-auto h-4 w-4 rounded-full bg-primary ring-4 ring-primary/20" />}
                  </button>
                ))}
              </div>

              <form onSubmit={handleTopUp} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-text-main">
                    {selectedMethod.inputLabel}
                  </label>
                  <Input
                    type="text"
                    inputMode={method === 'bank' ? 'text' : 'numeric'}
                    maxLength={method === 'bank' ? 34 : PAKISTAN_MOBILE_DIGITS}
                    placeholder={selectedMethod.placeholder}
                    value={accountInput}
                    onChange={(e) => handleAccountInputChange(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-text-main">Amount (PKR)</label>
                  <Input
                    type="number"
                    min={100}
                    max={100000}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-xs text-text-muted">Min: Rs. 100 / Max: Rs. 100,000</p>
                </div>
                <Button type="submit" disabled={submitting || isLoading} className="mt-2 h-12 w-full text-base">
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    `Add Rs. ${parseInt(amount || '0').toLocaleString()}`
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-xl font-black text-text-main">Transaction History</h3>
            <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
              {(['all', 'credit', 'debit', 'escrow'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm font-black capitalize whitespace-nowrap transition-all',
                    activeTab === tab ? 'bg-text-main text-white' : 'bg-surface-hover text-text-muted hover:text-text-main'
                  )}
                >
                  {tab === 'credit' ? 'Added' : tab === 'debit' ? 'Spent' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
                       {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-surface-hover" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 rounded bg-surface-hover" />
                      <div className="h-3 w-1/2 rounded bg-surface-hover" />
                    </div>
                    <div className="h-4 w-16 rounded bg-surface-hover" />
                  </div>
                ))}
              </div>
            ) : filteredTxs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-surface-hover">
                  <ArrowDown className="w-7 h-7 text-text-muted" />
                </div>
                <p className="mb-1 font-black text-text-main">No transactions yet</p>
                <p className="text-sm text-text-muted">
                  {activeTab === 'all'
                    ? 'Add money to your wallet to get started.'
                    : `No ${activeTab === 'credit' ? 'added' : activeTab === 'debit' ? 'spent' : activeTab} transactions.`}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTxs.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-surface-hover">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                        tx.type === 'credit' ? 'bg-success-subtle text-success' :
                        tx.type === 'debit' ? 'bg-red-50 text-red-600' :
                        'bg-amber-50 text-amber-600'
                      )}
                    >
                      {tx.type === 'credit' && <ArrowDown className="w-5 h-5" />}
                      {tx.type === 'debit' && <ArrowUp className="w-5 h-5" />}
                      {tx.type === 'escrow' && <Lock className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-text-main">{tx.description}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-text-muted">{formatDate(tx.date)}</span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-black uppercase',
                            tx.status === 'completed' ? 'bg-success-subtle text-success' :
                            tx.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          )}
                        >
                          {tx.status}
                        </span>
                      </div>
                    </div>
                    <div
                      className={cn(
                        'shrink-0 text-sm font-black',
                        tx.type === 'credit' ? 'text-success' :
                        tx.type === 'debit' ? 'text-red-600' :
                        'text-amber-600'
                      )}
                    >
                      {tx.type === 'credit' ? '+' : '-'} Rs. {tx.amount.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

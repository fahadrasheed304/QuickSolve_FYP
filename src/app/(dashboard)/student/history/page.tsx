"use client"

import React, { useState } from 'react'
import { CheckCircle2, Search, XCircle, Clock, Star, History } from 'lucide-react'

const DUMMY_HISTORY = [
  { id: '1', title: 'Algebra equation derivation', subject: 'Math', tutor: 'Sarah Khan', date: 'Oct 12, 2026', duration: '30m', amount: 250, status: 'completed', rating: 5 },
  { id: '2', title: 'Physics projectile motion', subject: 'Physics', tutor: 'Ali Raza', date: 'Oct 10, 2026', duration: '45m', amount: 350, status: 'completed', rating: 4 },
  { id: '3', title: 'Chemistry bonding theory', subject: 'Chemistry', tutor: 'Ayesha M', date: 'Sep 28, 2026', duration: '20m', amount: 150, status: 'cancelled', rating: null },
]

export default function HistoryPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const filtered = DUMMY_HISTORY.filter((item) =>
    `${item.title} ${item.subject} ${item.tutor}`.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-4 md:p-8 pb-20 qs-page-enter">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="qs-kicker rounded-full px-3 py-1.5">
            <History className="h-4 w-4" />
            Session archive
          </div>
          <h1 className="mt-4 text-4xl font-black text-text-main">Session History</h1>
          <p className="mt-1 text-text-muted">Review past whiteboard sessions and payments.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="qs-input h-11 w-full rounded-lg pl-10 pr-4 text-sm"
          />
        </div>
      </div>

      <div className="qs-card overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-surface-hover text-xs font-black uppercase text-text-muted">
                <th className="p-4 pl-6">Topic / Subject</th>
                <th className="p-4">Tutor</th>
                <th className="p-4">Date</th>
                <th className="p-4">Duration</th>
                <th className="p-4">Status</th>
                <th className="p-4 pr-6 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-surface-hover/70">
                  <td className="p-4 pl-6">
                    <p className="font-black text-text-main">{item.title}</p>
                    <p className="mt-0.5 text-xs font-bold text-primary">{item.subject}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-text-main">{item.tutor}</p>
                    {item.rating && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs font-black text-text-muted">{item.rating}.0</span>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap p-4 text-sm font-semibold text-text-muted">{item.date}</td>
                  <td className="whitespace-nowrap p-4">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-text-muted">
                      <Clock className="h-4 w-4" />
                      {item.duration}
                    </div>
                  </td>
                  <td className="p-4">
                    {item.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-xs font-black text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-600">
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelled
                      </span>
                    )}
                  </td>
                  <td className="p-4 pr-6 text-right font-black text-text-main">- Rs. {item.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-text-muted font-semibold">
            No sessions match your search.
          </div>
        )}
      </div>
    </div>
  )
}

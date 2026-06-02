import React from 'react'

interface AuthDividerProps {
  label?: string
}

export function AuthDivider({ label = "OR" }: AuthDividerProps) {
  return (
    <div className="relative flex items-center mb-6">
      <div className="flex-grow border-t border-border"></div>
      <span className="flex-shrink mx-4 text-[10px] font-black uppercase text-text-muted">
        {label}
      </span>
      <div className="flex-grow border-t border-border"></div>
    </div>
  )
}

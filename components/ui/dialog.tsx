"use client"
import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!open) return null;
  if (!isMounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#101d32]/58 p-4 shadow-xl backdrop-blur-sm animate-scale-in">
      <div className="qs-card relative max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg">
        <button onClick={() => onOpenChange(false)} className="absolute right-4 top-4 text-text-muted hover:text-text-main z-10 rounded-full p-1 hover:bg-surface-hover transition-colors">
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>,
    document.body
  )
}

export function DialogContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={cn("p-6", className)}>{children}</div>
}

export function DialogHeader({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left mb-4", className)}>{children}</div>
}

export function DialogTitle({ children, className }: { children: React.ReactNode, className?: string }) {
  return <h2 className={cn("text-lg font-bold leading-none", className)}>{children}</h2>
}

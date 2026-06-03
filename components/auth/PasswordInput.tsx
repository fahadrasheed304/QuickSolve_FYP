"use client"

"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  toggleClassName?: string
}

export function PasswordInput({
  className,
  toggleClassName,
  disabled,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = React.useState(false)

  return (
    <div className="relative">
      <input
        {...props}
        disabled={disabled}
        type={isVisible ? "text" : "password"}
        className={cn(className, "pr-12")}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsVisible((value) => !value)}
        className={cn(
          "absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
          toggleClassName
        )}
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

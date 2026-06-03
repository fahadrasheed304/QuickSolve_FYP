import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "bg-premium-gradient text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-secondary/20",
      destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
      outline: "border border-border bg-surface/85 hover:bg-surface-hover text-text-main shadow-sm",
      secondary: "bg-secondary-subtle text-secondary-dark hover:bg-secondary hover:text-white shadow-sm",
      ghost: "hover:bg-surface-hover hover:text-text-main",
      link: "text-primary underline-offset-4 hover:underline",
    }
    const sizes = {
      default: "h-11 px-5 py-2.5",
      sm: "h-9 rounded-lg px-4 text-xs",
      lg: "h-12 rounded-xl px-8 text-lg",
      icon: "h-11 w-11",
    }
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }

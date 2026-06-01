import React from 'react'

const NavLink = ({ children }: { children: React.ReactNode }) => (
  <a className="text-sm text-slate-700 hover:text-slate-900 px-3 py-2 rounded-md" href="#">
    {children}
  </a>
)

export default function Navbar() {
  return (
    <header className="border-b">
      <div className="container flex items-center justify-between h-16">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center font-semibold">QS</div>
          <span className="font-semibold">QuickSolve</span>
        </div>

        <nav className="hidden md:flex items-center gap-2">
          <NavLink>How it works</NavLink>
          <NavLink>Features</NavLink>
          <NavLink>Pricing</NavLink>
          <NavLink>Resources</NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <a className="text-sm text-slate-600 hover:text-slate-900" href="#">Sign In</a>
          <a className="hidden sm:inline-block bg-slate-900 text-white px-4 py-2 rounded-md text-sm" href="#">Get Started</a>
        </div>
      </div>
    </header>
  )
}

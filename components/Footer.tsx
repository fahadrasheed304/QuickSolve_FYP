import React from 'react'

export default function Footer() {
  return (
    <footer className="border-t bg-white">
      <div className="container py-6 flex flex-col md:flex-row items-center justify-between text-sm text-slate-600">
        <div>© {new Date().getFullYear()} QuickSolve. All rights reserved.</div>
        <div className="flex items-center gap-4 mt-3 md:mt-0">
          <a href="#" className="hover:underline">Terms</a>
          <a href="#" className="hover:underline">Privacy</a>
          <a href="#" className="hover:underline">Contact</a>
        </div>
      </div>
    </footer>
  )
}

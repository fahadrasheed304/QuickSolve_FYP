import React from 'react'

export default function Hero() {
  return (
    <section className="py-20">
      <div className="container text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Micro tutoring, big results</h1>
        <p className="max-w-2xl mx-auto text-slate-600 mb-8">QuickSolve connects learners with focused, expert tutors for short, actionable sessions designed to close knowledge gaps fast.</p>
        <div className="flex items-center justify-center gap-4">
          <a href="#" className="bg-slate-900 text-white px-6 py-3 rounded-md font-medium">Get Started</a>
          <a href="#features" className="text-slate-700 px-4 py-2">See Features</a>
        </div>
      </div>
    </section>
  )
}

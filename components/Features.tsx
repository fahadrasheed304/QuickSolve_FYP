import React from 'react'

const Card = ({ title, desc }: { title: string; desc: string }) => (
  <div className="border rounded-lg p-6 shadow-sm hover:shadow md:flex-1">
    <h3 className="text-lg font-semibold mb-2">{title}</h3>
    <p className="text-sm text-slate-600">{desc}</p>
  </div>
)

export default function Features() {
  return (
    <section id="features" className="py-16 bg-slate-50">
      <div className="container">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold">Why learners love QuickSolve</h2>
          <p className="text-slate-600">Short sessions, expert tutors, measurable progress.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <Card title="Focused Sessions" desc="15-30 minute micro-sessions designed to address specific questions and gaps." />
          <Card title="Expert Tutors" desc="Vetted tutors with proven teaching strategies and quick feedback." />
          <Card title="Track Progress" desc="Session notes, action items, and follow-up tasks to keep learning moving." />
        </div>
      </div>
    </section>
  )
}

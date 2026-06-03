import React from 'react'
import Link from 'next/link'

export interface AuthFeature {
  icon: string
  title: string
  description: string
  iconColorClass?: string
  iconBgClass?: string
}

interface AuthSidebarProps {
  title: React.ReactNode
  description?: React.ReactNode
  features?: AuthFeature[]
  alignCenter?: boolean
}

export function AuthSidebar({ title, description, features, alignCenter = false }: AuthSidebarProps) {
  return (
    <section className="hidden lg:flex w-[45%] bg-hero-gradient surface-grid relative flex-col justify-between p-12 overflow-hidden shadow-2xl">
      <div className="z-10 flex items-center justify-between">
        <Link href="/" className="text-2xl font-black text-white">QuickSolve</Link>
        <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold text-white/85">
          Live help
        </span>
      </div>

      <div className={`z-10 max-w-lg ${alignCenter ? '' : 'mt-12 mb-auto'}`}>
        <div className="qs-kicker mb-6 rounded-full border-white/20 bg-white/10 px-3 py-1.5 text-white">
          Verified tutors. Faster answers.
        </div>
        <h1 className="text-white text-5xl font-black leading-tight mb-8">
          {title}
        </h1>
        {description && (
          <p className="text-white/80 text-lg leading-relaxed mb-8">
            {description}
          </p>
        )}

        {features && features.length > 0 && (
          <div className="qs-stagger space-y-4">
            {features.map((feature, idx) => (
              <div key={idx} className="flex gap-4 items-start rounded-lg border border-white/15 bg-white/10 p-5 text-left text-white shadow-2xl shadow-black/10 backdrop-blur-md">
                <div className={`${feature.iconBgClass || 'bg-white/15 text-white'} flex h-10 w-10 items-center justify-center rounded-lg`}>
                  <span className={`material-symbols-outlined ${feature.iconColorClass || 'text-white'}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                    {feature.icon}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{feature.title}</h3>
                  <p className="text-white/70 text-sm leading-relaxed mt-1 font-medium">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="z-20 relative mt-auto">
        <p className="text-white/58 text-xs font-medium flex items-center justify-between">
          <span>(c) {new Date().getFullYear()} QuickSolve Inc.</span>
          <span>All rights reserved.</span>
        </p>
      </div>
    </section>
  )
}

import { Star } from 'lucide-react'

export function RatingStars({ value }: { value: number | null }) {
  return <span className="inline-flex gap-1" role="img" aria-label={value ? `${value} out of 5 stars` : 'Not rated yet'}>
    {[1, 2, 3, 4, 5].map(star => <span key={star} className="relative h-4 w-4">
      <Star aria-hidden="true" className="absolute h-4 w-4 text-text-muted/30" />
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, (value ?? 0) - star + 1)) * 100}%` }}>
        <Star aria-hidden="true" className="h-4 w-4 fill-amber-400 text-amber-400" />
      </span>
    </span>)}
  </span>
}

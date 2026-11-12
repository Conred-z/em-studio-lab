import type { EMFrame } from '@/types'

export function BrandMark() {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-teal-light" aria-hidden="true">
      <svg viewBox="0 0 40 40" className="h-full w-full">
        <path d="M6 30.5H34" stroke="#4f7c6b" strokeOpacity="0.25" />
        <path d="M5 30C10 30 10.5 14 16 14S22 30 27 30 30 9 33 9 35 30 36 30" fill="none" stroke="#4f7c6b" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M5 31C10 31 12 23 17 23S23 31 28 31 31 20 34 20 36 31 37 31" fill="none" stroke="#d9795b" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16" cy="14" r="2" fill="#4f7c6b" /><circle cx="33" cy="9" r="2" fill="#d9795b" />
      </svg>
    </span>
  )
}

function density(x: number, mean: number, variance: number) {
  return Math.exp(-0.5 * ((x - mean) ** 2) / variance) / Math.sqrt(2 * Math.PI * variance)
}

export function MiniMixture() {
  const width = 180
  const curves = [
    { mean: -1.6, variance: 0.35, weight: 0.75, color: '#d9795b' },
    { mean: 0.15, variance: 0.55, weight: 0.65, color: '#4f7c6b' },
    { mean: 1.9, variance: 0.28, weight: 0.8, color: '#d6a94a' },
  ]
  const path = (mean: number, variance: number, weight: number) => Array.from({ length: 55 }, (_, i) => {
    const x = -4 + (i / 54) * 8
    return `${i === 0 ? 'M' : 'L'}${((i / 54) * width).toFixed(2)},${(50 - density(x, mean, variance) * weight * 80).toFixed(2)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${width} 58`} className="h-14 w-40" aria-hidden="true">
      <line x1="0" y1="50" x2={width} y2="50" stroke="#dfe5de" />
      {curves.map((curve) => <path key={curve.mean} d={`${path(curve.mean, curve.variance, curve.weight)} L${width},50 L0,50 Z`} fill={curve.color} fillOpacity="0.07" stroke={curve.color} strokeOpacity="0.6" strokeWidth="1.4" />)}
    </svg>
  )
}

export function LikelihoodSparkline({ frames }: { frames: EMFrame[] }) {
  const width = 260
  const values = frames.map((frame) => frame.log_likelihood)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
    const y = 43 - ((value - min) / range) * 34
    return [x, y] as const
  })
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const last = points.at(-1) ?? [width / 2, 26]
  return (
    <svg viewBox={`0 0 ${width} 52`} className="mt-3 h-12 w-full" aria-hidden="true">
      <line x1="0" y1="44" x2={width} y2="44" stroke="#dce3dc" strokeDasharray="3 4" />
      {points.length > 1 && <path d={`${line} L${width},48 L0,48 Z`} fill="#4f7c6b" fillOpacity="0.06" />}
      {points.length > 1 ? <path d={line} fill="none" stroke="#4f7c6b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /> : <line x1="0" y1={last[1]} x2={width} y2={last[1]} stroke="#4f7c6b" strokeOpacity="0.3" strokeDasharray="3 5" />}
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="#d9795b" stroke="#f7f8f5" strokeWidth="2" />
    </svg>
  )
}

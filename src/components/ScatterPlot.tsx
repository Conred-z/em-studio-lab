import { useMemo } from 'react'
import type { EMFrame } from '@/types'
import { formatNumber } from '@/lib/format'

interface Props {
  points: number[][]
  frame: EMFrame | null
  features: string[]
  colors: string[]
  trueLabels: number[] | null
  showEllipses: boolean
  colorByTruth: boolean
  selectedPoint: number | null
  onSelectPoint: (index: number) => void
}

const W = 820
const H = 480
const M = { left: 62, right: 24, top: 28, bottom: 54 }

function extent(values: number[], padding = 0.08) {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 1e-8) { min -= 1; max += 1 }
  const pad = (max - min) * padding
  return [min - pad, max + pad] as const
}

function OneDimensionalPlot({ points, frame, features, colors, selectedPoint, onSelectPoint }: Props) {
  const dimension = points[0]?.length ?? 1
  if (dimension !== 1 || !frame) return null
  const [xMin, xMax] = extent([...points.map((p) => p[0]), ...frame.means.map((m) => m[0])])
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * (W - M.left - M.right)
  const grid = Array.from({ length: 180 }, (_, i) => xMin + (i / 179) * (xMax - xMin))
  const densities = grid.map((x) => frame.means.map((mean, k) => {
    const variance = Math.max(frame.covariances[k][0][0], 1e-10)
    return frame.weights[k] * Math.exp(-0.5 * ((x - mean[0]) ** 2) / variance) / Math.sqrt(2 * Math.PI * variance)
  }))
  const totals = densities.map((row) => row.reduce((a, b) => a + b, 0))
  const yMax = Math.max(...totals, 0.01) * 1.15
  const base = H - M.bottom
  const sy = (y: number) => base - (y / yMax) * (H - M.top - M.bottom - 24)
  const pathFor = (k: number | null) => grid.map((x, i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(2)},${sy(k === null ? totals[i] : densities[i][k]).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full max-h-[500px] w-full" role="img" aria-label="一维高斯混合密度与样本分布">
      <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="#fbfcf9" />
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1={M.left} x2={W - M.right} y1={M.top + ratio * (H - M.top - M.bottom)} y2={M.top + ratio * (H - M.top - M.bottom)} stroke="#e2e7df" strokeDasharray="3 5" />)}
      {frame.means.map((_, k) => <path key={k} d={`${pathFor(k)} L${sx(xMax)},${base} L${sx(xMin)},${base} Z`} fill={colors[k]} fillOpacity={0.12} stroke={colors[k]} strokeWidth={1.6} />)}
      <path d={pathFor(null)} fill="none" stroke="#203c35" strokeWidth={2.6} />
      {points.map((point, i) => {
        const label = frame.labels[i] ?? 0
        const confidence = frame.responsibilities ? Math.max(...frame.responsibilities[i]) : 0.85
        return <g key={i} onClick={() => onSelectPoint(i)} onKeyDown={(event) => { if (event.key === 'Enter') onSelectPoint(i) }} tabIndex={i === 0 ? 0 : -1} role="button" aria-label={`样本 ${i + 1}，数值 ${formatNumber(point[0])}`} className="cursor-pointer outline-none">
          <line x1={sx(point[0])} x2={sx(point[0])} y1={base - 9} y2={base + 4} stroke={colors[label]} strokeOpacity={0.25 + confidence * 0.65} strokeWidth={selectedPoint === i ? 4 : 2.2} />
          <title>样本 {i + 1}：{formatNumber(point[0])}，分量 {label + 1}</title>
        </g>
      })}
      {frame.means.map((mean, k) => <g key={k}><line x1={sx(mean[0])} x2={sx(mean[0])} y1={M.top} y2={base + 5} stroke={colors[k]} strokeDasharray="4 4" strokeWidth={1.2} /><text x={sx(mean[0]) + 4} y={M.top + 13 + k * 15} fill={colors[k]} fontSize={12} fontWeight={600}>μ{k + 1}={formatNumber(mean[0], 2)}</text></g>)}
      <line x1={M.left} x2={W - M.right} y1={base + 5} y2={base + 5} stroke="#7b8981" />
      {Array.from({ length: 6 }, (_, i) => {
        const value = xMin + (i / 5) * (xMax - xMin)
        return <g key={i}><text x={sx(value)} y={base + 28} textAnchor="middle" fill="#65736b" fontSize={12}>{formatNumber(value, 1)}</text></g>
      })}
      <text x={W / 2} y={H - 7} textAnchor="middle" fill="#42554c" fontSize={13}>{features[0]} · 混合密度 p(x)</text>
    </svg>
  )
}

export function ScatterPlot(props: Props) {
  const { points, frame, features, colors, trueLabels, showEllipses, colorByTruth, selectedPoint, onSelectPoint } = props
  const dimension = points[0]?.length ?? 0
  const scales = useMemo(() => {
    if (dimension < 2 || !frame) return null
    const xValues = [...points.map((p) => p[0])]
    const yValues = [...points.map((p) => p[1])]
    frame.means.forEach((mean, k) => {
      xValues.push(mean[0] - 2.6 * Math.sqrt(Math.max(frame.covariances[k][0][0], 0)), mean[0] + 2.6 * Math.sqrt(Math.max(frame.covariances[k][0][0], 0)))
      yValues.push(mean[1] - 2.6 * Math.sqrt(Math.max(frame.covariances[k][1][1], 0)), mean[1] + 2.6 * Math.sqrt(Math.max(frame.covariances[k][1][1], 0)))
    })
    const [xMin, xMax] = extent(xValues, 0.04)
    const [yMin, yMax] = extent(yValues, 0.06)
    return {
      xMin, xMax, yMin, yMax,
      sx: (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * (W - M.left - M.right),
      sy: (y: number) => H - M.bottom - ((y - yMin) / (yMax - yMin)) * (H - M.top - M.bottom),
      ux: (W - M.left - M.right) / (xMax - xMin),
      uy: (H - M.top - M.bottom) / (yMax - yMin),
    }
  }, [points, frame, dimension])

  if (!frame || !points.length) return <div className="flex min-h-80 items-center justify-center text-sm text-ink-muted">载入数据后开始实验</div>
  if (dimension === 1) return <OneDimensionalPlot {...props} />
  if (!scales) return null
  const { xMin, xMax, yMin, yMax, sx, sy, ux, uy } = scales

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full max-h-[500px] w-full" role="img" aria-label="EM 聚类散点图与高斯等高线">
      <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="#fbfcf9" />
      {Array.from({ length: 6 }, (_, i) => {
        const x = xMin + (i / 5) * (xMax - xMin)
        const y = yMin + (i / 5) * (yMax - yMin)
        return <g key={i}>
          <line x1={sx(x)} x2={sx(x)} y1={M.top} y2={H - M.bottom} stroke="#e2e7df" strokeDasharray="3 5" />
          <line x1={M.left} x2={W - M.right} y1={sy(y)} y2={sy(y)} stroke="#e2e7df" strokeDasharray="3 5" />
          <text x={sx(x)} y={H - M.bottom + 24} textAnchor="middle" fill="#65736b" fontSize={12}>{formatNumber(x, 1)}</text>
          <text x={M.left - 12} y={sy(y) + 4} textAnchor="end" fill="#65736b" fontSize={12}>{formatNumber(y, 1)}</text>
        </g>
      })}
      {showEllipses && frame.means.map((mean, k) => {
        const cov = frame.covariances[k]
        const a = Math.max(cov[0][0], 1e-10)
        const b = cov[0][1] ?? 0
        const d = Math.max(cov[1]?.[1] ?? a, 1e-10)
        const root = Math.sqrt(((a - d) / 2) ** 2 + b ** 2)
        const lambda1 = Math.max((a + d) / 2 + root, 1e-10)
        const lambda2 = Math.max((a + d) / 2 - root, 1e-10)
        const angle = 0.5 * Math.atan2(2 * b, a - d) * 180 / Math.PI
        return <g key={k} transform={`translate(${sx(mean[0])} ${sy(mean[1])}) rotate(${-angle})`} pointerEvents="none">
          {[2, 1].map((sigma) => <ellipse key={sigma} cx={0} cy={0} rx={Math.sqrt(lambda1) * ux * sigma} ry={Math.sqrt(lambda2) * uy * sigma} fill={colors[k]} fillOpacity={sigma === 1 ? 0.055 : 0.018} stroke={colors[k]} strokeOpacity={sigma === 1 ? 0.85 : 0.4} strokeWidth={sigma === 1 ? 1.8 : 1.2} strokeDasharray={sigma === 2 ? '5 5' : undefined} />)}
        </g>
      })}
      {points.map((point, i) => {
        const modelLabel = frame.labels[i] ?? 0
        const label = colorByTruth && trueLabels ? (trueLabels[i] ?? modelLabel) : modelLabel
        const confidence = frame.responsibilities ? Math.max(...frame.responsibilities[i]) : 0.9
        return <circle key={i} cx={sx(point[0])} cy={sy(point[1])} r={selectedPoint === i ? 6 : 3.5} fill={colors[label] ?? '#65736b'} fillOpacity={colorByTruth ? 0.75 : 0.32 + confidence * 0.65} stroke={selectedPoint === i ? '#203c35' : '#fbfcf9'} strokeWidth={selectedPoint === i ? 2.2 : 0.65} onClick={() => onSelectPoint(i)} onKeyDown={(event) => { if (event.key === 'Enter') onSelectPoint(i) }} tabIndex={i === 0 ? 0 : -1} role="button" aria-label={`样本 ${i + 1}，分量 ${modelLabel + 1}`} className="cursor-pointer outline-none transition-[r] focus:stroke-teal">
          <title>样本 {i + 1} · ({formatNumber(point[0])}, {formatNumber(point[1])}) · 分量 {modelLabel + 1} · 置信度 {formatNumber(confidence * 100, 1)}%</title>
        </circle>
      })}
      {frame.means.map((mean, k) => <g key={k} transform={`translate(${sx(mean[0])} ${sy(mean[1])})`} pointerEvents="none">
        <circle r={8} fill="#fbfcf9" stroke={colors[k]} strokeWidth={2} />
        <path d="M-4 0H4M0-4V4" stroke={colors[k]} strokeWidth={1.8} />
        <text x={11} y={-9} fill="#203c35" fontSize={12} fontWeight={700}>C{k + 1}</text>
      </g>)}
      <line x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} stroke="#7b8981" />
      <line x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} stroke="#7b8981" />
      <text x={W / 2} y={H - 9} textAnchor="middle" fill="#42554c" fontSize={13}>{features[0]}</text>
      <text x={16} y={H / 2} textAnchor="middle" fill="#42554c" fontSize={13} transform={`rotate(-90 16 ${H / 2})`}>{features[1]}</text>
    </svg>
  )
}

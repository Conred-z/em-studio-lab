import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, TrendingDown } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatNumber } from '@/lib/format'
import type { EMFrame, SweepItem } from '@/types'

const tooltipStyle = { background: '#fbfcf9', border: '1px solid #dce3dc', borderRadius: 8, color: '#203c35', fontSize: 12 }

export function ConvergenceView({ frames, colors }: { frames: EMFrame[]; colors: string[] }) {
  const data = frames.map((frame) => ({ iteration: frame.iteration, ll: frame.log_likelihood, delta: frame.delta ?? 0, ...Object.fromEntries(frame.weights.map((weight, i) => [`C${i + 1}`, weight])) }))
  return (
    <div className="grid gap-5 p-5 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-2"><h3 className="text-sm font-semibold text-ink">平均对数似然</h3><p className="mt-1 text-xs text-ink-muted">标准 EM 中应单调不减，越陡表示本轮改进越明显。</p></div>
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 12, left: 2, bottom: 2 }}><CartesianGrid stroke="#e2e7df" strokeDasharray="3 5" /><XAxis dataKey="iteration" tick={{ fontSize: 11, fill: '#65736b' }} label={{ value: '迭代次数', position: 'insideBottomRight', offset: -2, fontSize: 11 }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#65736b' }} tickFormatter={(v) => Number(v).toFixed(5)} width={68} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatNumber(Number(value), 5), 'log L']} /><Line isAnimationActive={false} type="monotone" dataKey="ll" stroke="#1f6f5c" strokeWidth={2.4} dot={{ r: 2.5, fill: '#1f6f5c' }} /></LineChart></ResponsiveContainer></div>
      </div>
      <div className="min-w-0">
        <div className="mb-2"><h3 className="text-sm font-semibold text-ink">混合权重 πₖ 的轨迹</h3><p className="mt-1 text-xs text-ink-muted">堆积面积始终为 1，可观察分量扩张、收缩或退化。</p></div>
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 12, right: 12, left: 2, bottom: 2 }}><CartesianGrid stroke="#e2e7df" strokeDasharray="3 5" /><XAxis dataKey="iteration" tick={{ fontSize: 11, fill: '#65736b' }} /><YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#65736b' }} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => formatNumber(Number(value), 3)} />{Object.keys(colors).map((_, k) => <Area key={k} isAnimationActive={false} type="monotone" dataKey={`C${k + 1}`} stackId="1" stroke={colors[k]} fill={colors[k]} fillOpacity={0.65} />)}</AreaChart></ResponsiveContainer></div>
      </div>
      <div className="rounded-lg bg-mist px-4 py-3 text-sm leading-6 text-ink-soft lg:col-span-2">
        当前似然增量 <strong className="font-mono text-ink">{formatNumber(frames.at(-1)?.delta, 6)}</strong>。若收敛很慢，可尝试 K-means++、增加随机重启或调整协方差结构；不要仅靠放大最大迭代次数掩盖奇异协方差问题。
      </div>
    </div>
  )
}

export function ResponsibilityView({ frame, points, colors, onSelectPoint }: { frame: EMFrame; points: number[][]; colors: string[]; onSelectPoint: (index: number) => void }) {
  const rows = useMemo(() => {
    if (!frame.responsibilities) return []
    return frame.responsibilities.map((resp, index) => ({ index, resp, uncertainty: 1 - Math.max(...resp) })).sort((a, b) => b.uncertainty - a.uncertainty).slice(0, 18)
  }, [frame])
  if (!frame.responsibilities) return <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><p className="font-medium text-ink">当前为历史轨迹帧</p><p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">拖动时间轴到最终迭代，查看完整的样本责任度；散点着色仍使用该帧真实标签。</p></div>
  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-semibold text-ink">最不确定的 18 个样本</h3><p className="mt-1 text-xs text-ink-muted">按 1 − max(γₖ) 排序；点击一行可在散点图中定位。</p></div><span className="font-mono text-xs text-ink-muted">Σ γ(zₙₖ | xₙ) = 1</span></div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead><tr className="bg-mist text-left text-xs text-ink-muted"><th className="px-3 py-2.5 font-medium">样本</th><th className="px-3 py-2.5 font-medium">观测值</th><th className="px-3 py-2.5 font-medium">预测</th>{frame.weights.map((_, k) => <th key={k} className="px-3 py-2.5 text-right font-medium" style={{ color: colors[k] }}>γ{k + 1}</th>)}</tr></thead>
          <tbody>{rows.map(({ index, resp }) => <tr key={index} onClick={() => onSelectPoint(index)} onKeyDown={(event) => { if (event.key === 'Enter') onSelectPoint(index) }} tabIndex={0} className="cursor-pointer border-t border-line outline-none transition hover:bg-mist focus-visible:bg-mist"><td className="px-3 py-2.5 font-mono text-xs">#{String(index + 1).padStart(3, '0')}</td><td className="max-w-40 truncate px-3 py-2.5 font-mono text-xs text-ink-muted">[{points[index].map((v) => formatNumber(v, 2)).join(', ')}]</td><td className="px-3 py-2.5"><span className="inline-flex rounded px-2 py-0.5 text-xs font-semibold" style={{ background: `${colors[frame.labels[index]]}18`, color: colors[frame.labels[index]] }}>C{frame.labels[index] + 1}</span></td>{resp.map((value, k) => <td key={k} className="px-3 py-2.5 text-right font-mono text-xs" style={{ background: `color-mix(in srgb, ${colors[k]} ${Math.round(value * 24)}%, transparent)`, color: value > 0.5 ? colors[k] : '#42554c', fontWeight: value > 0.5 ? 700 : 400 }}>{formatNumber(value, 3)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

export function ParameterView({ frame, features, colors }: { frame: EMFrame; features: string[]; colors: string[] }) {
  return (
    <div className="space-y-5 p-5">
      <div><h3 className="text-sm font-semibold text-ink">当前迭代的参数估计</h3><p className="mt-1 text-xs text-ink-muted">参数已反变换到原始数据尺度；协方差矩阵记为 Σₖ。</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        {frame.means.map((mean, k) => <section key={k} className="rounded-lg border border-line p-4">
          <div className="mb-3 flex items-center justify-between"><h4 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[k] }} />分量 C{k + 1}</h4><span className="font-mono text-xs text-ink-muted">π = {formatNumber(frame.weights[k], 4)}</span></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-xs text-ink-muted">均值向量 μ</span><p className="mt-1 break-words font-mono text-xs leading-5 text-ink">[{mean.map((v) => formatNumber(v, 3)).join(', ')}]</p></div>
            <div><span className="text-xs text-ink-muted">分配样本</span><p className="mt-1 font-mono text-xs text-ink">{frame.labels.filter((label) => label === k).length}</p></div>
          </div>
          <div className="mt-3 overflow-x-auto"><span className="text-xs text-ink-muted">协方差 Σ</span><table className="mt-1 border-collapse font-mono text-xs"><tbody>{frame.covariances[k].map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j} className="border border-line bg-mist/50 px-2.5 py-1.5 text-right" title={`${features[i]} / ${features[j]}`}>{formatNumber(value, 3)}</td>)}</tr>)}</tbody></table></div>
        </section>)}
      </div>
      <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-max text-sm"><thead><tr className="bg-mist text-left text-xs text-ink-muted"><th className="px-3 py-2.5 font-medium">迭代</th><th className="px-3 py-2.5 text-right font-medium">log L</th><th className="px-3 py-2.5 text-right font-medium">Δ log L</th>{frame.weights.map((_, k) => <th key={k} className="px-3 py-2.5 text-right font-medium">π{k + 1}</th>)}</tr></thead><tbody><tr className="border-t border-line"><td className="px-3 py-2.5 font-mono">{frame.iteration}</td><td className="px-3 py-2.5 text-right font-mono">{formatNumber(frame.log_likelihood, 5)}</td><td className="px-3 py-2.5 text-right font-mono">{formatNumber(frame.delta, 6)}</td>{frame.weights.map((weight, k) => <td key={k} className="px-3 py-2.5 text-right font-mono">{formatNumber(weight, 4)}</td>)}</tr></tbody></table></div>
    </div>
  )
}

export function SweepDialog({ open, onOpenChange, results, busy, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; results: SweepItem[]; busy: boolean; onApply: (k: number) => void }) {
  const best = results.length ? results.reduce((a, b) => a.bic < b.bic ? a : b) : null
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="border-line bg-paper sm:max-w-3xl"><DialogHeader><DialogTitle className="flex items-center gap-2 text-ink"><TrendingDown size={20} className="text-teal" />K 值模型选择</DialogTitle><DialogDescription>在相同数据和初始化策略下拟合 K = 1…6；BIC 越小，拟合与复杂度的折中越好。</DialogDescription></DialogHeader>
    {busy ? <div className="flex min-h-64 items-center justify-center text-sm text-ink-muted"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-teal border-t-transparent" />正在执行多组独立 EM 拟合…</div> : <><div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={results} margin={{ top: 16, right: 20, left: 12, bottom: 8 }}><CartesianGrid stroke="#e2e7df" strokeDasharray="3 5" /><XAxis dataKey="k" allowDecimals={false} label={{ value: '分量数 K', position: 'insideBottom', offset: -4, fontSize: 12 }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} /><Tooltip contentStyle={tooltipStyle} formatter={(value) => formatNumber(Number(value), 2)} /><Line isAnimationActive={false} name="AIC" dataKey="aic" stroke="#e6ad32" strokeWidth={2} dot={{ r: 3 }} /><Line isAnimationActive={false} name="BIC" dataKey="bic" stroke="#1f6f5c" strokeWidth={2.4} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-mist px-4 py-3"><p className="text-sm text-ink-soft">BIC 推荐 <strong className="text-ink">K = {best?.k ?? '—'}</strong><span className="ml-2 text-xs text-ink-muted">统计建议仍需结合散点结构判断</span></p><button type="button" disabled={!best} onClick={() => best && onApply(best.k)} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-teal px-4 text-sm font-semibold text-paper hover:bg-teal-dark disabled:opacity-50"><Check size={16} />采用推荐 K 并重新初始化</button></div>
      <div className="flex gap-4 text-xs text-ink-muted"><span className="flex items-center gap-1.5"><i className="h-0.5 w-5 bg-mustard" />AIC</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-5 bg-teal" />BIC</span></div></>}
  </DialogContent></Dialog>
}

import { Activity, ArrowUpRight, CircleDot, MousePointer2, Sigma } from 'lucide-react'
import type { EMFrame, Metrics } from '@/types'
import { formatNumber } from '@/lib/format'
import { LikelihoodSparkline } from './Visuals'

interface Props {
  frame: EMFrame | null
  previous: EMFrame | null
  frames: EMFrame[]
  metrics: Metrics | null
  colors: string[]
  points: number[][]
  features: string[]
  selectedPoint: number | null
  restarts: number
  playing: boolean
}

export function Inspector({ frame, previous, frames, metrics, colors, points, features, selectedPoint, restarts, playing }: Props) {
  if (!frame || !metrics) return <aside className="bg-paper p-5 text-sm text-ink-muted xl:border-l xl:border-line">等待计算结果…</aside>
  const meanShift = previous ? Math.max(...frame.means.map((mean, k) => Math.sqrt(mean.reduce((sum, value, j) => sum + (value - previous.means[k][j]) ** 2, 0)))) : 0
  const selectedResp = selectedPoint !== null ? frame.responsibilities?.[selectedPoint] : undefined
  return (
    <aside className="inspector-panel border-line bg-paper xl:border-l">
      <div className="space-y-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">当前结果</h2>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${playing ? 'bg-orange-light text-orange-dark' : 'bg-teal-light text-teal-dark'}`}><i className={`h-1.5 w-1.5 rounded-full ${playing ? 'bg-orange' : 'bg-teal'}`} />{playing ? '正在迭代' : frame.converged ? '已经收敛' : '可以继续迭代'}</span>
        </div>

        <section className="rounded-xl bg-mist/65 p-4">
          <div className="flex items-start justify-between gap-3">
            <div><span className="text-xs text-ink-muted">平均对数似然</span><div className="mt-0.5 font-mono text-xs text-ink-muted">log L / N</div></div>
            <span className="flex items-center gap-1 font-mono text-xs text-teal"><ArrowUpRight size={13} />{formatNumber(frame.delta, 5)}</span>
          </div>
          <div className="mt-3 break-all font-mono text-[32px] font-medium leading-none tracking-[-0.045em] text-ink">{formatNumber(frame.log_likelihood, 4)}</div>
          <LikelihoodSparkline frames={frames.slice(-24)} />
          <div className="mt-2 flex items-center justify-between border-t border-line/80 pt-3 text-xs text-ink-muted"><span>第 {String(frame.iteration).padStart(2, '0')} 次迭代</span><span>{restarts} 次独立重启</span></div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-3"><span className="step-letter-natural bg-teal-light text-teal-dark">E</span><div><strong className="text-sm font-medium text-ink">计算归属概率</strong><p className="mt-0.5 text-xs text-ink-muted">每个样本对各分量都有责任度 γ</p></div></div>
          <div className="flex items-center gap-3"><span className="step-letter-natural bg-orange-light text-orange-dark">M</span><div><strong className="text-sm font-medium text-ink">更新混合参数</strong><p className="mt-0.5 text-xs text-ink-muted">用责任度重新估计 π、μ 和 Σ</p></div></div>
          <div className="flex items-center justify-between pt-1 text-xs"><span className="text-ink-muted">本轮最大均值位移</span><strong className="font-mono font-medium text-ink">{formatNumber(meanShift, 4)}</strong></div>
        </section>

        <section className="border-t border-line pt-5">
          <h2 className="section-heading"><Sigma size={16} className="text-teal" />模型评估</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-5">
            <div><dt className="text-xs text-ink-muted">AIC <span className="ml-1">↓</span></dt><dd className="metric-value-natural">{formatNumber(metrics.aic, 1)}</dd></div>
            <div><dt className="text-xs text-ink-muted">BIC <span className="ml-1">↓</span></dt><dd className="metric-value-natural">{formatNumber(metrics.bic, 1)}</dd></div>
            <div><dt className="text-xs text-ink-muted">轮廓系数 <span className="ml-1">↑</span></dt><dd className="metric-value-natural">{formatNumber(metrics.silhouette, 3)}</dd></div>
            <div><dt className="text-xs text-ink-muted">平均熵 <span className="ml-1">↓</span></dt><dd className="metric-value-natural">{formatNumber(metrics.entropy, 3)}</dd></div>
          </dl>
          <div className="mt-4 flex items-center justify-between text-xs text-ink-muted"><span>ICL {formatNumber(metrics.icl, 1)}</span><span>{metrics.parameters} 个独立参数</span></div>
        </section>

        <section className="border-t border-line pt-5">
          <h2 className="section-heading"><Activity size={16} className="text-teal" />混合权重<span className="ml-auto font-mono text-xs font-normal text-ink-muted">Σπ = 1</span></h2>
          <div className="mt-4 space-y-3.5">{frame.weights.map((weight, k) => <div key={k}><div className="mb-1.5 flex justify-between text-xs"><span className="flex items-center gap-2 font-medium text-ink"><i className="h-2.5 w-2.5 rounded-full" style={{ background: colors[k] }} />分量 C{k + 1}</span><span className="font-mono text-ink-muted">{formatNumber(weight * 100, 1)}%</span></div><div className="weight-track"><div className="weight-fill" style={{ width: `${weight * 100}%`, background: colors[k] }} /></div></div>)}</div>
        </section>

        <section className="border-t border-line pt-5">
          <h2 className="section-heading"><MousePointer2 size={16} className="text-teal" />看看某个样本</h2>
          {selectedPoint === null || !points[selectedPoint] ? <div className="sample-empty"><CircleDot size={20} className="text-teal" /><p className="mt-2 leading-6">点击散点或责任度表格，<br />看看它被分给每个分量的概率。</p></div> : <div className="mt-3 rounded-xl bg-mist/65 p-4"><div className="flex items-center justify-between"><strong className="text-sm text-ink">样本 #{selectedPoint + 1}</strong><span className="font-mono text-xs text-teal-dark">C{frame.labels[selectedPoint] + 1}</span></div><p className="mt-2 break-words font-mono text-xs leading-5 text-ink-muted">{features.map((feature, j) => `${feature}=${formatNumber(points[selectedPoint][j], 2)}`).join(' · ')}</p>{selectedResp ? <div className="mt-3 space-y-2">{selectedResp.map((value, k) => <div key={k} className="flex items-center gap-2"><span className="w-5 text-xs font-medium" style={{ color: colors[k] }}>γ{k + 1}</span><div className="h-1.5 flex-1 rounded-full bg-paper"><div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: colors[k] }} /></div><span className="w-11 text-right font-mono text-xs text-ink">{formatNumber(value, 3)}</span></div>)}</div> : <p className="mt-3 text-xs leading-5 text-ink-muted">历史帧未保存完整责任度，请切换到最终迭代查看。</p>}</div>}
        </section>
      </div>
    </aside>
  )
}

import { useState } from 'react'
import { ChevronRight, Database, Dices, FileUp, FlaskConical, ScanSearch, SlidersHorizontal } from 'lucide-react'
import type { Dataset, EMConfig, InitMethod } from '@/types'
import { AdvancedSection, Field, LogSlider, RangeField, SectionTitle, inputClass } from './Controls'

interface Props {
  dataset: Dataset | null
  config: EMConfig
  features: string[]
  preprocess: string
  dirty: boolean
  busy: boolean
  onOpenData: () => void
  onConfigChange: (config: EMConfig) => void
  onFeaturesChange: (features: string[]) => void
  onPreprocessChange: (method: string) => void
  onInitialize: () => void
  onSweep: () => void
}

export function ParameterPanel({ dataset, config, features, preprocess, dirty, busy, onOpenData, onConfigChange, onFeaturesChange, onPreprocessChange, onInitialize, onSweep }: Props) {
  const [advanced, setAdvanced] = useState(false)
  const update = (patch: Partial<EMConfig>) => {
    const next = { ...config, ...patch }
    if (patch.k !== undefined && next.init_method === 'manual') {
      const old = next.initial_means ?? []
      next.initial_means = Array.from({ length: next.k }, (_, k) => Array.from({ length: features.length }, (_, j) => old[k]?.[j] ?? (dataset?.stats[dataset.columns.indexOf(features[j])]?.mean ?? 0) + (k - (next.k - 1) / 2) * 0.5))
    }
    onConfigChange(next)
  }
  const chooseInit = (method: InitMethod) => {
    if (method === 'manual') {
      const old = config.initial_means ?? []
      const means = Array.from({ length: config.k }, (_, k) => Array.from({ length: features.length }, (_, j) => old[k]?.[j] ?? (dataset?.stats[dataset.columns.indexOf(features[j])]?.mean ?? 0) + (k - (config.k - 1) / 2) * 0.7))
      update({ init_method: method, initial_means: means })
    } else update({ init_method: method })
  }
  const toggleFeature = (feature: string) => {
    if (features.includes(feature)) {
      if (features.length > 1) onFeaturesChange(features.filter((f) => f !== feature))
    } else if (features.length < 8) onFeaturesChange([...features, feature])
  }

  return (
    <aside className="parameter-panel border-line bg-paper xl:border-r">
      <div className="p-5">
        <div className="mb-6 flex items-center gap-3 border-b border-line pb-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-light text-teal"><SlidersHorizontal size={19} /></span>
          <div><h1 className="text-base font-semibold text-ink">实验设置</h1><p className="mt-0.5 text-xs text-ink-muted">调整参数，观察每一步变化</p></div>
        </div>

        <div className="space-y-6">
          <section>
            <SectionTitle>数据与特征</SectionTitle>
            <button type="button" onClick={onOpenData} className="dataset-picker group">
              <span className="flex items-start gap-3"><span className="dataset-icon"><Database size={19} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{dataset?.name ?? '正在载入…'}</strong><span className="mt-1 block text-xs text-ink-muted">{dataset ? `${dataset.rows} 条记录 · ${dataset.columns.length} 个数值字段` : '连接计算服务中'}</span></span><FileUp size={15} className="mt-1 text-ink-muted transition group-hover:-translate-y-0.5 group-hover:text-teal" /></span>
            </button>
            {dataset && dataset.dropped_rows > 0 && <p className="mt-2 text-xs leading-5 text-orange-dark">已剔除或抽样处理 {dataset.dropped_rows} 条原始记录。</p>}
            <div className="mt-4">
              <Field label="建模特征" hint={`${features.length} / 8`}>
                <div className="flex flex-wrap gap-2">
                  {dataset?.columns.map((column) => {
                    const active = features.includes(column)
                    return <button key={column} type="button" aria-pressed={active} onClick={() => toggleFeature(column)} className={`feature-chip ${active ? 'feature-chip-active' : ''}`}>{column}</button>
                  })}
                </div>
              </Field>
              <p className="mt-2 text-xs leading-5 text-ink-muted">前两个特征用于坐标轴；更多特征参与建模，图示为对应二维边缘分布。</p>
            </div>
            <div className="mt-4"><Field label="数据预处理"><select className={inputClass} value={preprocess} onChange={(event) => onPreprocessChange(event.target.value)}><option value="none">保持原始尺度</option><option value="zscore">Z-score 标准化</option><option value="minmax">Min-Max 缩放</option></select></Field></div>
          </section>

          <section className="border-t border-line pt-5">
            <SectionTitle aside={<button type="button" onClick={onSweep} disabled={!dataset || busy} className="scan-button"><ScanSearch size={14} />扫描 K</button>}>模型结构</SectionTitle>
            <div className="space-y-5">
              <RangeField label="混合分量数 K" value={config.k} onChange={(k) => update({ k })} min={1} max={8} />
              <Field label="协方差结构"><select className={inputClass} value={config.covariance_type} onChange={(event) => update({ covariance_type: event.target.value as EMConfig['covariance_type'] })}><option value="full">完整 full · 每簇独立椭圆</option><option value="tied">共享 tied · 同形同向</option><option value="diag">对角 diag · 轴对齐椭圆</option><option value="spherical">球形 spherical · 各向同性</option></select></Field>
              <Field label="初始化策略"><select className={inputClass} value={config.init_method} onChange={(event) => chooseInit(event.target.value as InitMethod)}><option value="kmeans">K-means++ + Lloyd</option><option value="random">随机选择样本作为质心</option><option value="random_resp">随机责任度（软初始化）</option><option value="manual">手动指定初始质心</option></select></Field>
              {config.init_method === 'manual' && <div className="rounded-xl border border-line bg-mist/50 p-3"><div className="mb-2 text-xs font-medium text-ink">初始质心（原始尺度）</div><div className="max-h-52 overflow-auto"><table className="border-collapse"><thead><tr><th className="p-1 text-xs text-ink-muted">μ</th>{features.map((feature) => <th key={feature} className="p-1 text-xs text-ink-muted">{feature}</th>)}</tr></thead><tbody>{Array.from({ length: config.k }, (_, k) => <tr key={k}><td className="p-1 text-xs font-semibold text-ink">C{k + 1}</td>{features.map((feature, j) => <td key={feature} className="p-1"><input aria-label={`分量 ${k + 1} 的 ${feature} 初始质心`} className="h-9 w-20 rounded-md border border-line bg-paper px-1.5 font-mono text-xs outline-none focus:border-teal" type="number" step="0.1" value={config.initial_means?.[k]?.[j] ?? 0} onChange={(event) => { const means = (config.initial_means ?? []).map((row) => [...row]); means[k][j] = Number(event.target.value); update({ initial_means: means }) }} /></td>)}</tr>)}</tbody></table></div></div>}
              <RangeField label="最大迭代次数" value={config.max_iter} onChange={(max_iter) => update({ max_iter })} min={1} max={300} />
              <LogSlider label="收敛阈值 ε" value={config.tol} onChange={(tol) => update({ tol })} min={-8} max={-1} />
              <LogSlider label="协方差正则化 λ" value={config.reg_covar} onChange={(reg_covar) => update({ reg_covar })} min={-10} max={-1} />
            </div>
          </section>

          <AdvancedSection title="高级与可复现性" open={advanced} onToggle={() => setAdvanced(!advanced)}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="随机重启"><input className={inputClass} type="number" min={1} max={10} value={config.n_init} onChange={(event) => update({ n_init: Math.max(1, Math.min(10, Number(event.target.value))) })} /></Field>
              <Field label="K-means 轮数"><input className={inputClass} type="number" min={1} max={30} value={config.init_iter} onChange={(event) => update({ init_iter: Math.max(1, Math.min(30, Number(event.target.value))) })} /></Field>
            </div>
            <Field label="随机种子"><div className="flex gap-2"><input className={inputClass} type="number" min={0} max={999999} value={config.seed} onChange={(event) => update({ seed: Number(event.target.value) })} /><button type="button" aria-label="随机生成种子" title="随机生成种子" onClick={() => update({ seed: Math.floor(Math.random() * 100000) })} className="flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line text-ink-muted transition hover:border-teal hover:bg-teal-light hover:text-teal"><Dices size={17} /></button></div></Field>
            <Field label="收敛判据"><select className={inputClass} value={config.criterion} onChange={(event) => update({ criterion: event.target.value as EMConfig['criterion'] })}><option value="absolute">绝对增量 |ΔL| ≤ ε</option><option value="relative">相对增量 |ΔL / L| ≤ ε</option></select></Field>
            <Field label="空簇处理"><select className={inputClass} value={config.empty_action} onChange={(event) => update({ empty_action: event.target.value as EMConfig['empty_action'] })}><option value="reinit">随机重新初始化</option><option value="preserve">保留原均值并正则化</option></select></Field>
            <p className="rounded-lg bg-mist p-3 text-xs leading-5 text-ink-muted">随机重启仅在“运行至收敛”时完整执行，并保留最终对数似然最高的一次；逐步模式使用首个种子，便于复现每一步。</p>
          </AdvancedSection>

          <button type="button" onClick={onInitialize} disabled={!dataset || busy} className={`initialize-button ${dirty ? 'initialize-button-dirty' : ''}`}><FlaskConical size={17} /><span>{busy ? '正在计算…' : dirty ? '应用参数并重新初始化' : '重新初始化实验'}</span><ChevronRight size={16} className="ml-auto" /></button>
          <p className="text-center text-xs text-ink-muted">由 Flask + NumPy 计算服务处理</p>
        </div>
      </div>
    </aside>
  )
}

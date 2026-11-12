import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, ChevronRight, CircleStop, Database, Download, FastForward, FlaskConical, History, LoaderCircle, Pause, Play, RotateCcw, StepForward } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { api } from '@/lib/api'
import { covarianceNames, downloadBlob, formatNumber, initNames } from '@/lib/format'
import type { Dataset, EMConfig, EMFrame, ExperimentRecord, Metrics, Preset, RunResponse, SweepItem } from '@/types'
import { DataDialog } from '@/components/DataDialog'
import { ParameterPanel } from '@/components/ParameterPanel'
import { ScatterPlot } from '@/components/ScatterPlot'
import { ConvergenceView, ParameterView, ResponsibilityView, SweepDialog } from '@/components/AnalysisViews'
import { Inspector } from '@/components/Inspector'
import { TheoryView } from '@/components/TheoryView'
import { HistoryView } from '@/components/HistoryView'
import { BrandMark, MiniMixture } from '@/components/Visuals'

const DEFAULT_CONFIG: EMConfig = {
  k: 3, covariance_type: 'full', init_method: 'kmeans', max_iter: 100,
  tol: 1e-4, reg_covar: 1e-6, seed: 42, n_init: 3, init_iter: 10,
  criterion: 'absolute', empty_action: 'reinit', initial_means: null,
}

const DEFAULT_COLORS = ['#ef6a4c', '#1f8a70', '#e6ad32', '#5271c4', '#b25f9f', '#3c9aaf', '#8b6f47', '#d4516c']
const vizTabs = [
  { id: 'cluster', label: '聚类空间' },
  { id: 'convergence', label: '收敛分析' },
  { id: 'responsibility', label: '责任度' },
  { id: 'parameters', label: '参数估计' },
] as const

type VizTab = typeof vizTabs[number]['id']
type Page = 'experiment' | 'theory' | 'history'

function readRecords(): ExperimentRecord[] {
  try { return JSON.parse(localStorage.getItem('em-studio-records') ?? '[]') as ExperimentRecord[] } catch { return [] }
}

export default function App() {
  const [page, setPage] = useState<Page>('experiment')
  const [presets, setPresets] = useState<Preset[]>([])
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [config, setConfig] = useState<EMConfig>(DEFAULT_CONFIG)
  const [features, setFeatures] = useState<string[]>([])
  const [modelFeatures, setModelFeatures] = useState<string[]>([])
  const [preprocess, setPreprocess] = useState('none')
  const [dataOpen, setDataOpen] = useState(false)
  const [healthy, setHealthy] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(450)
  const [sessionId, setSessionId] = useState('')
  const [points, setPoints] = useState<number[][]>([])
  const [frames, setFrames] = useState<EMFrame[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [colors, setColors] = useState(DEFAULT_COLORS)
  const [restarts, setRestarts] = useState(1)
  const [vizTab, setVizTab] = useState<VizTab>('cluster')
  const [showEllipses, setShowEllipses] = useState(true)
  const [colorByTruth, setColorByTruth] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null)
  const [sweepOpen, setSweepOpen] = useState(false)
  const [sweepBusy, setSweepBusy] = useState(false)
  const [sweepResults, setSweepResults] = useState<SweepItem[]>([])
  const [records, setRecords] = useState<ExperimentRecord[]>(readRecords)
  const booted = useRef(false)
  const stepRef = useRef<() => Promise<void>>(async () => {})
  const savedRuns = useRef(new Set<string>())

  const frame = frames[currentIndex] ?? null
  const previous = currentIndex > 0 ? frames[currentIndex - 1] : null

  useEffect(() => { localStorage.setItem('em-studio-records', JSON.stringify(records)) }, [records])

  const applyResponse = (response: RunResponse, fullRun: boolean) => {
    setSessionId(response.session_id)
    setPoints(response.points)
    setModelFeatures(response.features)
    setColors(response.colors)
    setRestarts(response.restarts)
    setMetrics(response.metrics)
    const nextFrames = fullRun ? [...response.frames.slice(0, -1), response.frame] : [response.frame]
    setFrames(nextFrames)
    setCurrentIndex(fullRun ? nextFrames.length - 1 : 0)
    setSelectedPoint(null)
    setDirty(false)
  }

  const initializeFor = async (targetDataset: Dataset, targetFeatures: string[], targetPreprocess: string, targetConfig: EMConfig, quiet = false) => {
    setBusy('init')
    setPlaying(false)
    try {
      const response = await api.init(targetDataset.id, targetFeatures, targetPreprocess, targetConfig)
      applyResponse(response, false)
      if (!quiet) toast.success('参数已应用，实验已回到第 0 次迭代')
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : '初始化失败')
    } finally { setBusy(null) }
  }

  const loadDataset = (nextDataset: Dataset, override?: Partial<EMConfig>, quiet = false) => {
    const nextFeatures = nextDataset.columns.slice(0, Math.min(2, nextDataset.columns.length))
    const naturalK = nextDataset.true_labels ? Math.max(...nextDataset.true_labels) + 1 : config.k
    const nextConfig = { ...config, k: naturalK, init_method: config.init_method === 'manual' ? 'kmeans' as const : config.init_method, initial_means: null, ...override }
    setDataset(nextDataset)
    setFeatures(nextFeatures)
    setConfig(nextConfig)
    setColorByTruth(false)
    void initializeFor(nextDataset, nextFeatures, preprocess, nextConfig, quiet)
  }

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void Promise.all([api.health(), api.presets(), api.generate({ preset: 'three_blobs', samples: 360, seed: 42, separation: 1, noise: 1 })])
      .then(([health, presetList, generated]) => {
        setHealthy(health.status === 'ok')
        setPresets(presetList)
        loadDataset(generated, undefined, true)
      })
      .catch((reason) => { setHealthy(false); toast.error(reason instanceof Error ? reason.message : '无法连接计算服务') })
    // Initial data bootstrap is intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveRecord = (id: string, finalFrame: EMFrame, finalMetrics: Metrics) => {
    if (!dataset || savedRuns.current.has(id)) return
    savedRuns.current.add(id)
    const record: ExperimentRecord = {
      id, createdAt: new Date().toISOString(), datasetName: dataset.name,
      config, features, preprocess, iterations: finalFrame.iteration,
      logLikelihood: finalFrame.log_likelihood, bic: finalMetrics.bic, silhouette: finalMetrics.silhouette,
    }
    setRecords((old) => [record, ...old.filter((item) => item.id !== id)].slice(0, 40))
  }

  const stepOnce = async () => {
    if (busy || !frame) return
    if (dirty) { setPlaying(false); toast.warning('参数已修改，请先应用并重新初始化'); return }
    if (currentIndex < frames.length - 1) { setCurrentIndex((index) => index + 1); return }
    if (frame.converged) { setPlaying(false); return }
    setBusy('step')
    try {
      const response = await api.step(sessionId)
      setFrames([...frames, response.frame])
      setCurrentIndex(frames.length)
      setMetrics(response.metrics)
      if (response.frame.converged) {
        setPlaying(false)
        saveRecord(sessionId, response.frame, response.metrics)
        toast.success(response.frame.stop_reason)
      }
    } catch (reason) {
      setPlaying(false)
      toast.error(reason instanceof Error ? reason.message : '迭代失败')
    } finally { setBusy(null) }
  }
  useEffect(() => { stepRef.current = stepOnce })

  useEffect(() => {
    if (!playing || busy || page !== 'experiment') return
    const timer = window.setTimeout(() => { void stepRef.current() }, speed)
    return () => window.clearTimeout(timer)
  }, [playing, busy, currentIndex, speed, page])

  const togglePlay = () => {
    if (playing) { setPlaying(false); return }
    if (dirty) { toast.warning('请先应用修改后的参数'); return }
    if (frame?.converged && frames.length > 1) setCurrentIndex(0)
    setPlaying(true)
  }

  const runToConvergence = async () => {
    if (!dataset || busy) return
    setBusy('run')
    setPlaying(false)
    try {
      const response = await api.run(dataset.id, features, preprocess, config)
      applyResponse(response, true)
      saveRecord(response.session_id, response.frame, response.metrics)
      toast.success(`${response.frame.stop_reason}，共 ${response.frame.iteration} 次迭代；已保存实验记录`)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : '运行失败') }
    finally { setBusy(null) }
  }

  const updateConfig = (next: EMConfig) => { setConfig(next); setDirty(true); setPlaying(false) }
  const updateFeatures = (next: string[]) => {
    setFeatures(next)
    if (config.init_method === 'manual') {
      const means = Array.from({ length: config.k }, (_, k) => next.map((feature, j) => config.initial_means?.[k]?.[j] ?? dataset?.stats[dataset.columns.indexOf(feature)]?.mean ?? 0))
      setConfig({ ...config, initial_means: means })
    }
    setDirty(true); setPlaying(false); setSelectedPoint(null)
  }
  const updatePreprocess = (method: string) => { setPreprocess(method); setDirty(true); setPlaying(false) }

  const startSweep = async () => {
    if (!dataset) return
    setSweepOpen(true); setSweepBusy(true); setSweepResults([])
    try { setSweepResults((await api.sweep(dataset.id, features, preprocess, config)).results) }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'K 值扫描失败'); setSweepOpen(false) }
    finally { setSweepBusy(false) }
  }

  const applySweepK = (k: number) => {
    if (!dataset) return
    const next = { ...config, k, init_method: config.init_method === 'manual' ? 'kmeans' as const : config.init_method, initial_means: null }
    setConfig(next); setSweepOpen(false)
    void initializeFor(dataset, features, preprocess, next)
  }

  const exportJSON = () => {
    if (!dataset || !frame) return
    downloadBlob(JSON.stringify({ system: 'EM Studio', exported_at: new Date().toISOString(), dataset: { name: dataset.name, rows: dataset.rows, source: dataset.source }, features: modelFeatures, preprocess, config, metrics, iterations: frames }, null, 2), `EM实验_K${config.k}_${Date.now()}.json`, 'application/json;charset=utf-8')
    toast.success('完整参数与迭代轨迹已导出')
  }

  const exportCSV = () => {
    if (!frame || !points.length) return
    const responsibilityFrame = frame.responsibilities ? frame : [...frames].reverse().find((item) => item.responsibilities)
    const headers = [...modelFeatures, 'cluster', ...frame.weights.map((_, k) => `responsibility_C${k + 1}`)]
    const rows = points.map((point, i) => [...point, frame.labels[i], ...(responsibilityFrame?.responsibilities?.[i] ?? [])].join(','))
    downloadBlob([headers.join(','), ...rows].join('\n'), `EM聚类结果_迭代${frame.iteration}.csv`, 'text/csv;charset=utf-8')
    toast.success('样本标签与责任度已导出')
  }

  const loadDemo = async (kind: 'covariance' | 'local' | 'soft') => {
    setPage('experiment')
    const preset = kind === 'covariance' ? 'anisotropic' : 'overlap'
    const override: Partial<EMConfig> = kind === 'covariance' ? { k: 3, covariance_type: 'full', init_method: 'kmeans' } : kind === 'local' ? { k: 2, init_method: 'random', n_init: 1, seed: 7 } : { k: 2, covariance_type: 'full', init_method: 'kmeans' }
    setBusy('data')
    try { loadDataset(await api.generate({ preset, samples: 360, seed: 42, separation: 1, noise: 1 }), override, true); setVizTab(kind === 'soft' ? 'responsibility' : 'cluster') }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : '演示载入失败'); setBusy(null) }
  }

  const selectPoint = (index: number) => { setSelectedPoint(index); if (vizTab === 'responsibility') setVizTab('cluster') }

  return (
    <div className="app-shell min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur-md">
        <div className="flex min-h-[68px] flex-col md:flex-row md:items-center">
          <div className="flex min-h-[68px] items-center justify-between px-5 md:w-72 md:shrink-0 md:border-r md:border-line">
            <button type="button" onClick={() => setPage('experiment')} className="flex cursor-pointer items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30"><BrandMark /><span><strong className="block text-base font-semibold tracking-normal text-ink">EM 实验室</strong><span className="mt-0.5 block text-xs text-ink-muted">看见聚类如何一步步发生</span></span></button>
            <span className="flex items-center gap-1.5 text-xs text-ink-muted md:hidden"><i className={`h-1.5 w-1.5 rounded-full ${healthy === false ? 'bg-orange' : 'bg-teal'}`} />{healthy === false ? '服务离线' : '计算就绪'}</span>
          </div>
          <nav className="flex flex-1 items-center gap-1 px-2 pb-2 md:px-5 md:pb-0" aria-label="主导航">
            {([{ id: 'experiment', label: '实验台', icon: FlaskConical }, { id: 'theory', label: '算法讲解', icon: BookOpen }, { id: 'history', label: '实验记录', icon: History }] as const).map((item) => <button key={item.id} type="button" onClick={() => { setPage(item.id); setPlaying(false) }} className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25 md:flex-none ${page === item.id ? 'bg-teal-light font-medium text-teal-dark' : 'font-normal text-ink-muted hover:bg-mist hover:text-ink'}`}><item.icon size={16} />{item.label}</button>)}
          </nav>
          <div className="hidden items-center gap-2 px-6 text-xs text-ink-muted md:flex"><span className={`h-2 w-2 rounded-full ${healthy === false ? 'bg-orange' : 'bg-teal'}`} />{healthy === null ? '正在连接' : healthy ? 'NumPy 计算服务' : '计算服务未连接'}</div>
        </div>
      </header>

      {page === 'theory' && <TheoryView onDemo={(kind) => { void loadDemo(kind) }} />}
      {page === 'history' && <HistoryView records={records} onLoad={(record) => { setConfig(record.config); const valid = record.features.every((feature) => dataset?.columns.includes(feature)); if (valid) setFeatures(record.features); setPreprocess(record.preprocess); setDirty(true); setPage('experiment'); toast.success('参数已载入，请应用到当前数据集') }} onDelete={(id) => setRecords((old) => old.filter((item) => item.id !== id))} onClear={() => { if (window.confirm('确定清空当前浏览器中的全部实验记录吗？')) setRecords([]) }} />}

      {page === 'experiment' && <div className="grid grid-cols-1 xl:grid-cols-[292px_minmax(0,1fr)_310px] 2xl:grid-cols-[308px_minmax(0,1fr)_330px]">
        <ParameterPanel dataset={dataset} config={config} features={features} preprocess={preprocess} dirty={dirty} busy={busy !== null} onOpenData={() => setDataOpen(true)} onConfigChange={updateConfig} onFeaturesChange={updateFeatures} onPreprocessChange={updatePreprocess} onInitialize={() => dataset && void initializeFor(dataset, features, preprocess, config)} onSweep={() => { void startSweep() }} />

        <main className="workspace-main min-w-0 p-4 md:p-6">
          <div className="flex items-center justify-between gap-5">
            <div><h1 className="text-2xl font-semibold tracking-normal text-ink">{dataset?.name ?? '正在准备实验'}</h1><p className="mt-1.5 text-sm text-ink-muted">高斯混合模型 <span className="mx-1.5 text-line">·</span> K = {frame?.weights.length ?? config.k}</p><p className="mt-2 text-xs leading-5 text-ink-muted">{covarianceNames[config.covariance_type]} · {initNames[config.init_method]} · 随机种子 {config.seed} · {preprocess === 'none' ? '原始尺度' : preprocess === 'zscore' ? 'Z-score 标准化' : 'Min-Max 缩放'}</p></div>
            <div className="hidden shrink-0 opacity-75 lg:block"><MiniMixture /></div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs text-ink-muted"><i className={`h-1.5 w-1.5 rounded-full ${playing ? 'bg-orange' : 'bg-teal'}`} />{busy ? '正在计算，请稍候' : playing ? '正在一步一步更新参数' : frame?.converged ? '本次实验已完成' : '准备好了，可以试试单步运行'}</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" title="以当前参数重新初始化" onClick={() => dataset && void initializeFor(dataset, features, preprocess, config)} disabled={!dataset || busy !== null} className="action-button"><RotateCcw size={15} /><span className="hidden sm:inline">重置</span></button>
              <button type="button" onClick={() => { void stepOnce() }} disabled={!frame || busy !== null || !!frame?.converged} className="action-button"><StepForward size={15} />单步</button>
              <button type="button" onClick={togglePlay} disabled={!frame || busy !== null} className="action-button">{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? '暂停' : '连续'}</button>
              <button type="button" onClick={() => { void runToConvergence() }} disabled={!dataset || busy !== null} className="primary-action">{busy === 'run' ? <LoaderCircle size={15} className="animate-spin" /> : <FastForward size={15} />}运行至收敛</button>
            </div>
          </div>

          {dirty && <div role="status" className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-orange-light/70 px-4 py-2.5 text-xs text-orange-dark"><span>参数有修改，当前图还保留上一次的结果。</span><button type="button" onClick={() => dataset && void initializeFor(dataset, features, preprocess, config)} className="flex min-h-8 shrink-0 cursor-pointer items-center gap-1 font-medium hover:underline">应用参数 <ChevronRight size={14} /></button></div>}

          <div className="mt-6 grid grid-cols-2 rounded-xl border border-line bg-paper md:grid-cols-4">
            <div className="metric-cell"><span>当前迭代</span><strong>{String(frame?.iteration ?? 0).padStart(2, '0')}<small> / {config.max_iter}</small></strong></div>
            <div className="metric-cell"><span>有效样本</span><strong>{dataset?.rows ?? '—'}<small> 条</small></strong></div>
            <div className="metric-cell"><span>建模维度</span><strong>{modelFeatures.length || features.length}<small> D</small></strong></div>
            <div className="metric-cell"><span>计算耗时</span><strong>{metrics ? formatNumber(metrics.runtime_ms, 1) : '—'}<small> ms</small></strong></div>
          </div>

          <section className="visual-card mt-5 overflow-hidden rounded-xl border border-line bg-paper">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="可视化视图">{vizTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={vizTab === tab.id} onClick={() => setVizTab(tab.id)} className={`min-h-10 cursor-pointer rounded-lg px-3 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/25 ${vizTab === tab.id ? 'bg-teal-light font-medium text-teal-dark' : 'font-normal text-ink-muted hover:bg-mist hover:text-ink'}`}>{tab.label}</button>)}</div>
              <div className="flex gap-1"><button type="button" title="导出当前聚类 CSV" onClick={exportCSV} disabled={!frame} className="export-button"><Download size={14} />CSV</button><button type="button" title="导出完整实验 JSON" onClick={exportJSON} disabled={!frame} className="export-button"><Download size={14} />JSON</button></div>
            </div>

            <div className="min-h-[360px]">
              {busy === 'init' && !frame ? <div className="flex h-[360px] items-center justify-center text-sm text-ink-muted"><LoaderCircle size={20} className="mr-2 animate-spin text-teal" />正在构建初始模型…</div> : vizTab === 'cluster' ? <div className="h-[360px] p-2 md:h-[480px] md:p-4"><ScatterPlot points={points} frame={frame} features={modelFeatures} colors={colors} trueLabels={dataset?.true_labels ?? null} showEllipses={showEllipses} colorByTruth={colorByTruth} selectedPoint={selectedPoint} onSelectPoint={setSelectedPoint} /></div> : vizTab === 'convergence' ? <ConvergenceView frames={frames} colors={colors} /> : vizTab === 'responsibility' && frame ? <ResponsibilityView frame={frame} points={points} colors={colors} onSelectPoint={selectPoint} /> : vizTab === 'parameters' && frame ? <ParameterView frame={frame} features={modelFeatures} colors={colors} /> : null}
            </div>

            <div className="border-t border-line px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <button type="button" onClick={togglePlay} disabled={!frame || busy !== null} className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-teal text-paper transition hover:bg-teal-dark disabled:opacity-40" aria-label={playing ? '暂停轨迹' : '播放轨迹'}>{playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}</button>
                <span className="whitespace-nowrap font-mono text-xs text-ink-muted">第 <strong className="font-medium text-ink">{currentIndex}</strong> / {Math.max(frames.length - 1, 0)} 步</span>
                <input aria-label="迭代时间轴" className="em-range min-w-28 flex-1" type="range" min={0} max={Math.max(frames.length - 1, 0)} value={currentIndex} onChange={(event) => { setPlaying(false); setCurrentIndex(Number(event.target.value)); setSelectedPoint(null) }} disabled={frames.length < 2} />
                <select aria-label="播放速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="h-9 rounded-lg border-line bg-paper px-2 font-mono text-xs text-ink outline-none focus:border-teal"><option value={800}>0.5×</option><option value={450}>1×</option><option value={180}>2×</option><option value={60}>4×</option></select>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3">
                <div className="flex flex-wrap gap-2">{frame?.weights.map((_, k) => <button key={k} type="button" onClick={() => { const index = frame.labels.findIndex((label) => label === k); if (index >= 0) { setSelectedPoint(index); setVizTab('cluster') } }} className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-xs text-ink-soft transition hover:bg-mist"><i className="h-2.5 w-2.5 rounded-full" style={{ background: colors[k] }} />C{k + 1}<span className="font-mono text-xs text-ink-muted">{formatNumber(frame.weights[k], 2)}</span></button>)}</div>
                <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
                  {modelFeatures.length > 1 && <label className="flex min-h-8 cursor-pointer items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-teal" checked={showEllipses} onChange={(event) => setShowEllipses(event.target.checked)} />显示椭圆</label>}
                  {dataset?.true_labels && <label className="flex min-h-8 cursor-pointer items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-teal" checked={colorByTruth} onChange={(event) => setColorByTruth(event.target.checked)} />真实类别</label>}
                </div>
              </div>
            </div>
          </section>
          <p className="mt-3 text-xs leading-5 text-ink-muted">点的深浅表示归属置信度，十字是均值。想看某个样本的归属概率，直接点它就可以。</p>
        </main>

        <Inspector frame={frame} previous={previous} frames={frames} metrics={metrics} colors={colors} points={points} features={modelFeatures} selectedPoint={selectedPoint} restarts={restarts} playing={playing} />
      </div>}

      <DataDialog open={dataOpen} onOpenChange={setDataOpen} presets={presets} onLoad={(data) => loadDataset(data)} />
      <SweepDialog open={sweepOpen} onOpenChange={setSweepOpen} results={sweepResults} busy={sweepBusy} onApply={applySweepK} />
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      {busy === 'data' && <div role="status" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-paper px-5 py-4 text-sm text-ink shadow-xl"><CircleStop size={18} className="animate-pulse text-teal" />正在准备课堂演示…</div>}
      {healthy === false && page === 'experiment' && !dataset && <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-xl rounded-lg border border-orange/30 bg-paper p-4 text-sm text-orange-dark shadow-lg"><Database size={18} className="mr-2 inline" />计算服务未连接，请使用 npm run dev 启动本地服务。<Check size={16} className="ml-2 inline" /></div>}
    </div>
  )
}

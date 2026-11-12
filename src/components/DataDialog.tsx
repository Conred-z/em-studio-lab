import { useRef, useState } from 'react'
import { Database, FileUp, LoaderCircle, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import type { Dataset, Preset } from '@/types'
import { Field, RangeField, inputClass } from './Controls'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: Preset[]
  onLoad: (dataset: Dataset) => void
}

export function DataDialog({ open, onOpenChange, presets, onLoad }: Props) {
  const [tab, setTab] = useState<'generate' | 'upload'>('generate')
  const [preset, setPreset] = useState('three_blobs')
  const [samples, setSamples] = useState(360)
  const [seed, setSeed] = useState(42)
  const [separation, setSeparation] = useState(1)
  const [noise, setNoise] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async (loader: () => Promise<Dataset>) => {
    setBusy(true)
    setError('')
    try {
      onLoad(await loader())
      onOpenChange(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '数据载入失败')
    } finally {
      setBusy(false)
    }
  }

  const upload = (file?: File) => {
    if (!file) return
    setFileName(file.name)
    void load(() => api.upload(file))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-line bg-paper p-0 sm:max-w-2xl" aria-describedby="data-dialog-description">
        <DialogHeader className="border-b border-line px-6 pb-5 pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl text-ink"><Database size={21} className="text-teal" />选择实验数据</DialogTitle>
          <DialogDescription id="data-dialog-description" className="text-ink-muted">生成可控样本，或上传 CSV 并自动识别数值字段。</DialogDescription>
        </DialogHeader>
        <div className="px-6">
          <div className="grid grid-cols-2 rounded-lg bg-mist p-1" role="tablist" aria-label="数据来源">
            <button type="button" role="tab" aria-selected={tab === 'generate'} onClick={() => { setTab('generate'); setError('') }} className={`min-h-11 cursor-pointer rounded-md text-sm font-medium transition ${tab === 'generate' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}><Sparkles size={15} className="mr-2 inline" />内置数据生成器</button>
            <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => { setTab('upload'); setError('') }} className={`min-h-11 cursor-pointer rounded-md text-sm font-medium transition ${tab === 'upload' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}><FileUp size={15} className="mr-2 inline" />上传 CSV 文件</button>
          </div>
        </div>
        {tab === 'generate' ? (
          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-2 sm:grid-cols-2">
              {presets.map((item) => (
                <button key={item.id} type="button" onClick={() => { setPreset(item.id); if (item.id === 'one_dimensional') setSamples(300) }} className={`min-h-20 cursor-pointer rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${preset === item.id ? 'border-teal bg-teal-light' : 'border-line bg-paper hover:border-ink-muted'}`}>
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">{item.name}<span className="font-mono text-xs font-normal text-ink-muted">{item.dimensions}D / {item.clusters} 簇</span></span>
                  <span className="mt-1 block text-xs leading-5 text-ink-muted">{item.description}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <RangeField label="样本数量" value={samples} onChange={setSamples} min={30} max={1500} step={30} />
              <RangeField label="簇间距离倍数" value={separation} onChange={setSeparation} min={0.6} max={2} step={0.1} unit="×" />
              <RangeField label="噪声标准差倍数" value={noise} onChange={setNoise} min={0.4} max={2} step={0.1} unit="×" />
              <Field label="数据随机种子"><input className={inputClass} type="number" min={0} max={99999} value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></Field>
            </div>
            <button type="button" disabled={busy} onClick={() => void load(() => api.generate({ preset, samples, seed, separation, noise }))} className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-teal px-4 text-sm font-semibold text-paper transition hover:bg-teal-dark disabled:opacity-60">
              {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}生成并初始化实验
            </button>
          </div>
        ) : (
          <div className="space-y-5 px-6 pb-6">
            <input ref={fileRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => upload(event.target.files?.[0])} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files[0]) }} className="flex min-h-52 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-teal bg-teal-light/45 px-6 text-center transition hover:bg-teal-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60">
              {busy ? <LoaderCircle size={30} className="mb-3 animate-spin text-teal" /> : <FileUp size={30} className="mb-3 text-teal" />}
              <span className="text-base font-semibold text-ink">{busy ? '正在解析并识别字段…' : '点击选择或拖入 CSV 文件'}</span>
              <span className="mt-2 max-w-md text-sm leading-6 text-ink-muted">首行须为字段名；自动筛选数值列，剔除含缺失值的记录。支持 UTF-8 / GB18030，最大 6 MB。</span>
              {fileName && <span className="mt-3 rounded bg-paper px-3 py-1 font-mono text-xs text-teal-dark">{fileName}</span>}
            </button>
            <div className="rounded-lg border border-line p-4 text-sm leading-6 text-ink-soft">
              <strong className="text-ink">数据隐私：</strong>文件仅发送到当前计算服务并保存在内存中，不会写入数据库；服务重启或休眠后需重新上传。超过 1,500 条记录会固定随机抽样以保证交互流畅。
            </div>
          </div>
        )}
        {error && <div role="alert" className="mx-6 mb-6 rounded-md border border-orange/30 bg-orange-light px-4 py-3 text-sm text-orange-dark">{error}</div>}
      </DialogContent>
    </Dialog>
  )
}

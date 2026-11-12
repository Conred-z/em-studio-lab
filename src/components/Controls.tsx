import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-soft">
        {label}
        {hint && <span className="font-mono text-xs text-ink-muted">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export const inputClass = 'h-11 w-full rounded-lg border border-line/90 bg-paper px-3 text-sm text-ink shadow-[0_1px_2px_rgba(23,63,54,0.025)] outline-none transition hover:border-teal/50 focus:border-teal focus:bg-white focus:ring-2 focus:ring-teal/10 disabled:cursor-not-allowed disabled:opacity-50'

export function LogSlider({ value, onChange, min, max, label }: { value: number; onChange: (value: number) => void; min: number; max: number; label: string }) {
  const exponent = Math.log10(value)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-soft">{label}</span>
        <span className="parameter-value">{value.toExponential(0)}</span>
      </div>
      <input aria-label={label} className="em-range w-full" type="range" min={min} max={max} step={1} value={exponent} onChange={(event) => onChange(10 ** Number(event.target.value))} />
      <div className="mt-1 flex justify-between font-mono text-xs text-ink-muted"><span>10^{min}</span><span>10^{max}</span></div>
    </div>
  )
}

export function RangeField({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-soft">{label}</span>
        <span className="parameter-value">{value}{unit}</span>
      </div>
      <input aria-label={label} className="em-range w-full" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  )
}

export function AdvancedSection({ title, children, open, onToggle }: { title: string; children: ReactNode; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-t border-line pt-3">
      <button type="button" onClick={onToggle} className="group flex min-h-12 w-full cursor-pointer items-center justify-between text-left text-sm font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal" aria-expanded={open}>
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-orange" />{title}</span>
        <span className="grid h-7 w-7 place-items-center rounded-md bg-mist text-ink-muted transition group-hover:bg-teal-light group-hover:text-teal"><ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && <div className="space-y-4 pb-2 pt-2">{children}</div>}
    </div>
  )
}

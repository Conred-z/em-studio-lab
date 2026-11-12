import type { Dataset, EMConfig, Preset, RunResponse, SweepItem } from '@/types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`)
  return body as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  health: () => request<{ status: string; engine: string }>('/api/health'),
  presets: () => request<Preset[]>('/api/presets'),
  generate: (config: { preset: string; samples: number; seed: number; separation: number; noise: number }) =>
    request<Dataset>('/api/dataset/generate', json(config)),
  upload: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Dataset>('/api/dataset/upload', { method: 'POST', body: form })
  },
  init: (datasetId: string, features: string[], preprocess: string, config: EMConfig) =>
    request<RunResponse>('/api/em/init', json({ dataset_id: datasetId, features, preprocess, config })),
  step: (sessionId: string) =>
    request<{ frame: RunResponse['frame']; metrics: RunResponse['metrics'] }>('/api/em/step', json({ session_id: sessionId })),
  run: (datasetId: string, features: string[], preprocess: string, config: EMConfig) =>
    request<RunResponse>('/api/em/run', json({ dataset_id: datasetId, features, preprocess, config })),
  sweep: (datasetId: string, features: string[], preprocess: string, config: EMConfig, maxK = 6) =>
    request<{ results: SweepItem[] }>('/api/em/sweep', json({ dataset_id: datasetId, features, preprocess, config, max_k: maxK })),
}

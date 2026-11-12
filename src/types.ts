export type CovarianceType = 'full' | 'tied' | 'diag' | 'spherical'
export type InitMethod = 'kmeans' | 'random' | 'random_resp' | 'manual'

export interface EMConfig {
  k: number
  covariance_type: CovarianceType
  init_method: InitMethod
  max_iter: number
  tol: number
  reg_covar: number
  seed: number
  n_init: number
  init_iter: number
  criterion: 'absolute' | 'relative'
  empty_action: 'reinit' | 'preserve'
  initial_means: number[][] | null
}

export interface DatasetStats {
  name: string
  mean: number
  std: number
  min: number
  max: number
}

export interface Dataset {
  id: string
  name: string
  source: 'built-in' | 'upload'
  columns: string[]
  points: number[][]
  rows: number
  dropped_rows: number
  true_labels: number[] | null
  preview: number[][]
  stats: DatasetStats[]
}

export interface Preset {
  id: string
  name: string
  description: string
  dimensions: number
  clusters: number
}

export interface EMFrame {
  iteration: number
  log_likelihood: number
  delta: number | null
  weights: number[]
  means: number[][]
  covariances: number[][][]
  labels: number[]
  responsibilities?: number[][]
  converged: boolean
  stop_reason: string
}

export interface Metrics {
  aic: number
  bic: number
  icl: number
  entropy: number
  silhouette: number | null
  parameters: number
  runtime_ms: number
}

export interface RunResponse {
  session_id: string
  config: EMConfig
  features: string[]
  points: number[][]
  colors: string[]
  frames: EMFrame[]
  frame: EMFrame
  metrics: Metrics
  restarts: number
  preprocess: string
}

export interface SweepItem {
  k: number
  log_likelihood: number
  aic: number
  bic: number
  iterations: number
}

export interface ExperimentRecord {
  id: string
  createdAt: string
  datasetName: string
  config: EMConfig
  features: string[]
  preprocess: string
  iterations: number
  logLikelihood: number
  bic: number
  silhouette: number | null
}

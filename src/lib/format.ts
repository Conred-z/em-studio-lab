export function formatNumber(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const absolute = Math.abs(value)
  if (absolute !== 0 && (absolute >= 10000 || absolute < 0.001)) return value.toExponential(2)
  return value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob(['\ufeff', content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export const covarianceNames = {
  full: '完整协方差',
  tied: '共享协方差',
  diag: '对角协方差',
  spherical: '球形协方差',
}

export const initNames = {
  kmeans: 'K-means++',
  random: '随机样本',
  random_resp: '随机责任度',
  manual: '手动质心',
}

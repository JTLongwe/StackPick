/** Shared display formatting. Kept out of components so the verdict engine,
 *  tables and charts all phrase the same number the same way. */

export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'N/A'
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function formatFull(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'N/A'
  return n.toLocaleString()
}

export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes == null || !+bytes) return 'N/A'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

/** Signed percentage, e.g. "+42%" / "-15%". */
export function formatPercent(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return 'N/A'
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export function monthsSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return (Date.now() - t) / (1000 * 60 * 60 * 24 * 30.44)
}

/** "3 months ago" / "2 years ago". Vaguer as it gets older, which is honest. */
export function formatAge(iso: string | null | undefined): string {
  const months = monthsSince(iso)
  if (months == null) return 'N/A'
  if (months < 1) return 'this month'
  if (months < 2) return 'last month'
  if (months < 18) return `${Math.round(months)} months ago`
  const years = months / 12
  return years < 2 ? 'over a year ago' : `${Math.floor(years)} years ago`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'N/A'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 'N/A' : new Date(t).toLocaleDateString()
}

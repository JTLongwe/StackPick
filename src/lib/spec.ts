import type { Comparison, Ecosystem } from '../types'

/** Keep in step with MAX_PACKAGES in netlify/functions/compare.ts. */
export const MAX_PACKAGES = 8

export const NAME_PATTERNS: Record<Ecosystem, RegExp> = {
  npm: /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/,
  nuget: /^[A-Za-z0-9._-]+$/,
}

/**
 * What a comparison page needs to render, from either source: a curated YAML
 * file or ad-hoc query parameters. Both paths produce this shape so the view
 * doesn't branch on where the comparison came from.
 */
export interface ComparisonSpec {
  title: string
  question?: string
  note?: string
  ecosystem: Ecosystem
  packages: string[]
  curated: boolean
}

export function specFromComparison(c: Comparison): ComparisonSpec {
  return {
    title: c.title,
    question: c.question,
    note: c.note,
    ecosystem: c.ecosystem,
    packages: c.packages,
    curated: true,
  }
}

export function parsePackages(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[,\s]+/)
      .map(p => p.trim())
      .filter(Boolean)
  )]
}

export interface SpecResult {
  spec?: ComparisonSpec
  error?: string
}

/** Validate ad-hoc input before it reaches the network, with the same rules the
 *  function enforces, so a typo produces a readable message rather than a 400. */
export function specFromQuery(
  rawEcosystem: unknown,
  rawPackages: unknown
): SpecResult {
  const ecosystem = String(rawEcosystem ?? 'npm') as Ecosystem
  if (ecosystem !== 'npm' && ecosystem !== 'nuget') {
    return { error: `Unknown ecosystem "${ecosystem}". Use npm or nuget.` }
  }

  const packages = parsePackages(String(rawPackages ?? ''))

  if (packages.length < 2) {
    return { error: 'Give at least two packages to compare.' }
  }
  if (packages.length > MAX_PACKAGES) {
    return { error: `Compare at most ${MAX_PACKAGES} packages at once.` }
  }

  const invalid = packages.filter(p => !NAME_PATTERNS[ecosystem].test(p))
  if (invalid.length) {
    return { error: `Not a valid ${ecosystem} package name: ${invalid.join(', ')}` }
  }

  return {
    spec: {
      title: packages.join(' vs '),
      ecosystem,
      packages,
      curated: false,
    },
  }
}

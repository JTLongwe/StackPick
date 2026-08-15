import type { PackageResult } from '../types'
import { formatCompact, formatPercent, formatAge, monthsSince } from './format'

/**
 * Turns registry metrics into a recommendation.
 *
 * The scoring is deliberately simple and every component is surfaced in the UI.
 * A verdict is an editorial claim, so it has to show its working. The goal is
 * "here is what the numbers say", not an oracle. Anything the data can't support
 * becomes a caveat rather than a silent assumption.
 */

export type Tone = 'good' | 'bad' | 'neutral'

export interface Reason {
  text: string
  tone: Tone
}

export interface ScoreBreakdown {
  name: string
  score: number
  momentum: number | null
  adoption: number | null
  maintenance: number | null
  community: number | null
  security: number | null
  penalty: number
  flags: Flag[]
}

export interface Flag {
  label: string
  detail: string
  tone: Tone
}

export interface Verdict {
  winner: ScoreBreakdown | null
  runnerUp: ScoreBreakdown | null
  /** How far apart the top two are. Drives whether we call it at all. */
  confidence: 'clear' | 'moderate' | 'close'
  headline: string
  reasons: Reason[]
  caveats: string[]
  scores: ScoreBreakdown[]
}

const WEIGHTS = {
  momentum: 0.30,
  adoption: 0.20,
  maintenance: 0.20,
  community: 0.10,
  security: 0.20,
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/**
 * Momentum is scored on an absolute scale, not relative to the other packages:
 * if everything in the comparison is declining, nobody should score well on it.
 * -50% YoY maps to 0, +100% to 1.
 */
function momentumScore(growth: number | null | undefined): number | null {
  if (growth == null) return null
  return clamp01((growth + 50) / 150)
}

/**
 * Adoption is relative to the largest package in the set, on a log scale, so a
 * 2x gap between two popular libraries reads as near-parity while a 1000x gap
 * reads as decisive. Raw download counts flatter incumbents; this doesn't.
 */
function adoptionScore(downloads: number | undefined, max: number): number | null {
  if (downloads == null || max <= 0) return null
  return clamp01(Math.log10(downloads + 1) / Math.log10(max + 1))
}

function maintenanceScore(pkg: PackageResult): number | null {
  const parts: number[] = []

  if (pkg.releasesLastYear != null) {
    // A release a month is a healthy ceiling; more isn't better.
    parts.push(clamp01(pkg.releasesLastYear / 12))
  }

  const age = monthsSince(pkg.lastPublish)
  if (age != null) {
    // Fresh for three months, then decaying to nothing at two years.
    parts.push(clamp01((24 - age) / 21))
  }

  if (!parts.length) return null
  return parts.reduce((a, b) => a + b, 0) / parts.length
}

function communityScore(pkg: PackageResult, maxStars: number): number | null {
  const parts: number[] = []

  if (pkg.github?.stars != null && maxStars > 0) {
    parts.push(clamp01(Math.log10(pkg.github.stars + 1) / Math.log10(maxStars + 1)))
  }

  const open = pkg.github?.openIssues
  const closed = pkg.github?.closedIssues
  if (open != null && closed != null && open + closed > 0) {
    parts.push(clamp01(closed / (open + closed)))
  }

  if (!parts.length) return null
  return parts.reduce((a, b) => a + b, 0) / parts.length
}

/**
 * Security posture: known vulnerabilities, supply-chain surface and the
 * OpenSSF Scorecard, blended.
 *
 * Unlike compatibility, this genuinely is a quality signal, so it counts. A
 * clean scorecard on a package with an unpatched critical still scores badly,
 * because the vulnerability term dominates.
 */
function securityScore(pkg: PackageResult): number | null {
  const parts: number[] = []

  const vulns = pkg.vulnerabilities
  if (vulns) {
    if (vulns.count === 0) {
      parts.push(1)
    } else {
      const floor =
        vulns.maxSeverity === 'CRITICAL' ? 0
        : vulns.maxSeverity === 'HIGH' ? 0.15
        : vulns.maxSeverity === 'MODERATE' ? 0.45
        : vulns.maxSeverity === 'LOW' ? 0.7
        : 0.35 // graded by nobody, but present
      // More findings drag it further down, without ever going below the floor.
      parts.push(clamp01(floor * (1 / (1 + (vulns.count - 1) * 0.15))))
    }
  }

  if (pkg.scorecard) parts.push(clamp01(pkg.scorecard.score / 10))

  // Supply-chain surface. Zero deps is ideal; 50+ is a lot of trust to extend.
  if (pkg.transitiveDeps != null) {
    parts.push(clamp01(1 - Math.log10(pkg.transitiveDeps + 1) / Math.log10(51)))
  }

  if (!parts.length) return null
  return parts.reduce((a, b) => a + b, 0) / parts.length
}

function collectFlags(pkg: PackageResult): Flag[] {
  const flags: Flag[] = []

  if (pkg.deprecated) {
    flags.push({
      label: 'Deprecated',
      detail: pkg.deprecated,
      tone: 'bad',
    })
  }

  if (pkg.github?.archived) {
    flags.push({
      label: 'Archived',
      detail: 'The GitHub repository is archived and accepts no further changes.',
      tone: 'bad',
    })
  }

  const age = monthsSince(pkg.lastPublish)
  if (age != null && age >= 24) {
    flags.push({
      label: 'Dormant',
      detail: `No release in ${formatAge(pkg.lastPublish).replace(' ago', '')}.`,
      tone: 'bad',
    })
  } else if (age != null && age >= 12) {
    flags.push({
      label: 'Slow cadence',
      detail: `Last release ${formatAge(pkg.lastPublish)}.`,
      tone: 'neutral',
    })
  }

  const vulns = pkg.vulnerabilities
  if (vulns?.count) {
    const sev = vulns.maxSeverity
    flags.push({
      label: sev === 'CRITICAL' || sev === 'HIGH' ? `${sev} vulnerability` : 'Known vulnerabilities',
      detail: `${vulns.count} advisory${vulns.count === 1 ? '' : 'ies'} affecting the current version${vulns.ids.length ? `: ${vulns.ids.join(', ')}` : '.'}`,
      tone: sev === 'CRITICAL' || sev === 'HIGH' ? 'bad' : 'neutral',
    })
  }

  if (pkg.transitiveDeps != null && pkg.transitiveDeps === 0) {
    flags.push({
      label: 'No dependencies',
      detail: 'Pulls in nothing else, so the supply-chain surface is just this package.',
      tone: 'good',
    })
  } else if (pkg.transitiveDeps != null && pkg.transitiveDeps >= 30) {
    flags.push({
      label: `${pkg.transitiveDeps} deps`,
      detail: `Installing this pulls in ${pkg.transitiveDeps} packages in total.`,
      tone: 'neutral',
    })
  }

  if (pkg.growthYoY != null && pkg.growthYoY <= -20) {
    flags.push({
      label: 'Declining',
      detail: `Downloads are ${formatPercent(pkg.growthYoY)} year over year.`,
      tone: 'bad',
    })
  } else if (pkg.growthYoY != null && pkg.growthYoY >= 40) {
    flags.push({
      label: 'Growing fast',
      detail: `Downloads are ${formatPercent(pkg.growthYoY)} year over year.`,
      tone: 'good',
    })
  }

  return flags
}

/** Hard signals that should override a good-looking metric profile. */
function penaltyFor(pkg: PackageResult): number {
  let penalty = 1
  if (pkg.deprecated) penalty *= 0.15
  if (pkg.github?.archived) penalty *= 0.25
  const age = monthsSince(pkg.lastPublish)
  if (age != null && age >= 24) penalty *= 0.6
  // An unpatched critical is a reason not to pick something, not a rounding
  // error in a weighted average.
  if (pkg.vulnerabilities?.maxSeverity === 'CRITICAL') penalty *= 0.4
  else if (pkg.vulnerabilities?.maxSeverity === 'HIGH') penalty *= 0.65
  return penalty
}

/**
 * Weighted mean over whichever signals exist. A missing signal redistributes its
 * weight across the rest rather than scoring zero, so a package isn't punished
 * for an API that happened to be down.
 */
function combine(parts: Record<keyof typeof WEIGHTS, number | null>): number {
  let total = 0
  let weightUsed = 0

  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const value = parts[key]
    if (value == null) continue
    total += value * WEIGHTS[key]
    weightUsed += WEIGHTS[key]
  }

  return weightUsed === 0 ? 0 : (total / weightUsed) * 100
}

export function buildVerdict(results: PackageResult[], ecosystem: string): Verdict {
  const usable = results.filter(r => !r.error)

  const empty: Verdict = {
    winner: null,
    runnerUp: null,
    confidence: 'close',
    headline: 'Not enough data to call this one.',
    reasons: [],
    caveats: [],
    scores: [],
  }

  if (usable.length < 2) return empty

  const maxDownloads = Math.max(...usable.map(r => r.weeklyDownloads ?? 0))
  const maxStars = Math.max(...usable.map(r => r.github?.stars ?? 0))

  const scores: ScoreBreakdown[] = usable.map(pkg => {
    const parts = {
      momentum: momentumScore(pkg.growthYoY),
      adoption: adoptionScore(pkg.weeklyDownloads, maxDownloads),
      maintenance: maintenanceScore(pkg),
      community: communityScore(pkg, maxStars),
      security: securityScore(pkg),
    }
    const penalty = penaltyFor(pkg)

    return {
      name: pkg.name,
      score: combine(parts) * penalty,
      ...parts,
      penalty,
      flags: collectFlags(pkg),
    }
  })

  const ranked = [...scores].sort((a, b) => b.score - a.score)
  const winner = ranked[0]
  const runnerUp = ranked[1]

  const gap = winner.score - runnerUp.score
  const confidence: Verdict['confidence'] = gap >= 20 ? 'clear' : gap >= 8 ? 'moderate' : 'close'

  const winnerPkg = usable.find(r => r.name === winner.name)!
  const runnerUpPkg = usable.find(r => r.name === runnerUp.name)!

  const headline =
    confidence === 'close'
      ? `${winner.name} and ${runnerUp.name} are too close to separate`
      : `Pick ${winner.name}`

  return {
    winner,
    runnerUp,
    confidence,
    headline,
    reasons: buildReasons(winnerPkg, runnerUpPkg, confidence),
    caveats: buildCaveats(usable, ecosystem),
    scores: ranked,
  }
}

function buildReasons(
  winner: PackageResult,
  runnerUp: PackageResult,
  confidence: Verdict['confidence']
): Reason[] {
  const reasons: Reason[] = []

  // Momentum first. It is the signal totals hide, and the reason this tool
  // exists rather than just linking to npm.
  if (winner.growthYoY != null && runnerUp.growthYoY != null) {
    const w = formatPercent(winner.growthYoY)
    const r = formatPercent(runnerUp.growthYoY)
    if (winner.growthYoY > runnerUp.growthYoY + 10) {
      reasons.push({
        text: `${winner.name} is growing ${w} year over year while ${runnerUp.name} is at ${r}.`,
        tone: 'good',
      })
    } else if (runnerUp.growthYoY > winner.growthYoY + 10) {
      reasons.push({
        text: `${runnerUp.name} is actually growing faster (${r} vs ${w}), so keep an eye on it.`,
        tone: 'neutral',
      })
    }
  }

  if (winner.weeklyDownloads != null && runnerUp.weeklyDownloads != null && runnerUp.weeklyDownloads > 0) {
    const ratio = winner.weeklyDownloads / runnerUp.weeklyDownloads
    if (ratio >= 1.5) {
      reasons.push({
        text: `${ratio.toFixed(1)}× the downloads of ${runnerUp.name} (${formatCompact(winner.weeklyDownloads)} vs ${formatCompact(runnerUp.weeklyDownloads)}).`,
        tone: 'good',
      })
    } else if (ratio <= 0.67) {
      reasons.push({
        text: `${runnerUp.name} is still downloaded more often (${formatCompact(runnerUp.weeklyDownloads)} vs ${formatCompact(winner.weeklyDownloads)}).`,
        tone: 'neutral',
      })
    }
  }

  if (runnerUp.vulnerabilities?.count && !winner.vulnerabilities?.count) {
    const sev = runnerUp.vulnerabilities.maxSeverity
    reasons.push({
      text: `${runnerUp.name} has ${runnerUp.vulnerabilities.count} known ${sev ? sev.toLowerCase() + ' ' : ''}advisory against its current version; ${winner.name} has none.`,
      tone: 'bad',
    })
  }

  if (
    winner.transitiveDeps != null &&
    runnerUp.transitiveDeps != null &&
    runnerUp.transitiveDeps - winner.transitiveDeps >= 10
  ) {
    reasons.push({
      text: `${winner.name} pulls in ${winner.transitiveDeps} packages against ${runnerUp.transitiveDeps} for ${runnerUp.name}.`,
      tone: 'good',
    })
  }

  if (runnerUp.deprecated) {
    reasons.push({ text: `${runnerUp.name} is marked deprecated on the registry.`, tone: 'bad' })
  }
  if (runnerUp.github?.archived) {
    reasons.push({ text: `${runnerUp.name}'s repository is archived.`, tone: 'bad' })
  }

  const runnerUpAge = monthsSince(runnerUp.lastPublish)
  const winnerAge = monthsSince(winner.lastPublish)
  if (runnerUpAge != null && winnerAge != null && runnerUpAge >= 12 && runnerUpAge > winnerAge * 2) {
    reasons.push({
      text: `${runnerUp.name} last shipped ${formatAge(runnerUp.lastPublish)}; ${winner.name} ${formatAge(winner.lastPublish)}.`,
      tone: 'bad',
    })
  }

  if (winner.releasesLastYear != null && runnerUp.releasesLastYear != null) {
    if (winner.releasesLastYear >= runnerUp.releasesLastYear * 2 && winner.releasesLastYear >= 4) {
      reasons.push({
        text: `${winner.releasesLastYear} releases in the last year against ${runnerUp.releasesLastYear}.`,
        tone: 'good',
      })
    }
  }

  if (confidence === 'close') {
    reasons.push({
      text: 'These two are close enough that the numbers cannot separate them. Pick on API fit instead.',
      tone: 'neutral',
    })
  }

  if (!reasons.length) {
    reasons.push({
      text: `${winner.name} edges ahead on the combined score, but no single metric separates them clearly.`,
      tone: 'neutral',
    })
  }

  return reasons
}

function buildCaveats(results: PackageResult[], ecosystem: string): string[] {
  const caveats: string[] = []

  if (ecosystem === 'nuget') {
    caveats.push('NuGet publishes no download time series, so momentum is unavailable and the score leans on release cadence and adoption.')
  }

  if (results.some(r => !r.github)) {
    caveats.push('GitHub data is missing for at least one package, so its score is based on fewer signals than the others.')
  }

  caveats.push('Downloads count CI runs and mirrors as well as people. Use this as a starting point, not the decision.')

  return caveats
}

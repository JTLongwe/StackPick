import type { PackageResult, Ecosystem } from '../types'

/**
 * The reader's own constraints.
 *
 * Compatibility is not a quality judgement. A package requiring Node 22 is not
 * worse than one requiring Node 18, it is simply unusable if you are on 18. So
 * none of this feeds the verdict score. It answers a different question: "can I
 * actually use this?", and only the person building the thing knows the answer.
 */
export interface Requirements {
  /** Major Node version the reader targets, e.g. 18. */
  node: number | null
  /** Module system their build can consume. */
  moduleFormat: 'esm' | 'cjs' | 'any'
  /** .NET target framework moniker, e.g. "net8.0" or "netstandard2.0". */
  targetFramework: string | null
}

export const emptyRequirements: Requirements = {
  node: null,
  moduleFormat: 'any',
  targetFramework: null,
}

export const NODE_CHOICES = [18, 20, 22, 24]

export const TFM_CHOICES = [
  'net10.0',
  'net9.0',
  'net8.0',
  'net6.0',
  'netstandard2.0',
  'net472',
]

export type FitLevel = 'fits' | 'unknown' | 'fails'

export interface FitResult {
  level: FitLevel
  reasons: string[]
}

/** Lowest major version satisfying a semver range like ">=22" or "^18.17.0". */
function minNodeMajor(range: string | null | undefined): number | null {
  if (!range) return null
  const majors = [...range.matchAll(/(\d+)(?:\.\d+)*/g)].map(m => Number(m[1]))
  if (!majors.length) return null
  return Math.min(...majors)
}

/** Normalise the many spellings NuGet uses into something comparable. */
function normaliseTfm(tfm: string): string {
  const t = tfm.toLowerCase().replace(/\s/g, '')
  if (t.startsWith('.netstandard')) return `netstandard${t.replace('.netstandard', '')}`
  if (t.startsWith('.netframework')) return `net${t.replace('.netframework', '').replace(/\./g, '')}`
  if (t.startsWith('.netcoreapp')) return `netcoreapp${t.replace('.netcoreapp', '')}`
  return t
}

/**
 * .NET Standard 2.0 is consumable from .NET Core 2.0+, .NET 5+ and Framework
 * 4.6.1+, so a package targeting it fits nearly everything.
 */
function tfmSatisfies(available: string[], wanted: string): boolean {
  const norm = available.map(normaliseTfm)
  const want = normaliseTfm(wanted)

  if (norm.includes(want)) return true
  if (norm.some(t => t.startsWith('netstandard2'))) return true

  // A modern net8.0 consumer can use anything older in the net5+ line.
  const wantMajor = /^net(\d+)\.0$/.exec(want)
  if (wantMajor) {
    return norm.some(t => {
      const m = /^net(\d+)\.0$/.exec(t)
      return m ? Number(m[1]) <= Number(wantMajor[1]) : false
    })
  }

  return false
}

export function checkFit(
  pkg: PackageResult,
  req: Requirements,
  ecosystem: Ecosystem
): FitResult {
  const reasons: string[] = []
  let level: FitLevel = 'fits'
  let sawAnything = false

  const demote = (next: FitLevel) => {
    if (next === 'fails') level = 'fails'
    else if (level === 'fits') level = next
  }

  if (ecosystem === 'npm') {
    if (req.node != null) {
      const min = minNodeMajor(pkg.compat?.engines)
      if (min == null) {
        // No engines field means no stated constraint, which is a pass.
        sawAnything = true
      } else {
        sawAnything = true
        if (min > req.node) {
          demote('fails')
          reasons.push(`Needs Node ${pkg.compat?.engines}, you target ${req.node}.`)
        }
      }
    }

    if (req.moduleFormat !== 'any') {
      const fmt = pkg.compat?.moduleFormat
      if (!fmt) {
        demote('unknown')
        reasons.push('Module format could not be determined.')
      } else {
        sawAnything = true
        if (fmt !== 'dual' && fmt !== req.moduleFormat) {
          demote('fails')
          reasons.push(
            fmt === 'esm'
              ? 'ESM only, and you need CommonJS.'
              : 'CommonJS only, and you need ESM.'
          )
        }
      }
    }
  }

  if (ecosystem === 'nuget' && req.targetFramework) {
    const tfms = pkg.compat?.targetFrameworks
    if (!tfms?.length) {
      demote('unknown')
      reasons.push('No target frameworks listed.')
    } else {
      sawAnything = true
      if (!tfmSatisfies(tfms, req.targetFramework)) {
        demote('fails')
        reasons.push(`Does not target ${req.targetFramework}.`)
      }
    }
  }

  if (!sawAnything && level === 'fits' && !hasAnyRequirement(req, ecosystem)) {
    return { level: 'unknown', reasons: [] }
  }

  if (level === 'fits' && !reasons.length) reasons.push('Meets your stated constraints.')

  return { level, reasons }
}

export function hasAnyRequirement(req: Requirements, ecosystem: Ecosystem): boolean {
  return ecosystem === 'npm'
    ? req.node != null || req.moduleFormat !== 'any'
    : !!req.targetFramework
}

const STORAGE_KEY = 'stackpick:requirements'

/** Constraints are a property of the developer, not the comparison, so they
 *  persist across pages rather than resetting on every navigation. */
export function loadRequirements(): Requirements {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...emptyRequirements, ...JSON.parse(raw) } : { ...emptyRequirements }
  } catch {
    return { ...emptyRequirements }
  }
}

export function saveRequirements(req: Requirements) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(req))
  } catch {
    // Private browsing or a full quota. Not worth surfacing.
  }
}

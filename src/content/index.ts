import type { Comparison } from '../types'

// Every YAML file in comparisons/ is a comparison; adding a file is all it takes
// to add one to the site.
const modules = import.meta.glob('./comparisons/*.yaml', { eager: true })

export const comparisons: Comparison[] = Object.values(modules)
  .map((m: any) => (m.default ?? m) as Comparison)
  .sort((a, b) => a.title.localeCompare(b.title))

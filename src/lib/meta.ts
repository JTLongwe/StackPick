export const SITE_NAME = 'StackPick'
export const DEFAULT_TITLE = 'StackPick: which library should I pick?'
export const DEFAULT_DESCRIPTION =
  'Compare npm and NuGet packages on live registry data. Download momentum, release cadence, security and maintenance signals, with a verdict that shows how it got there.'

export interface PageMeta {
  title?: string
  description?: string
  /** Absolute or root-relative path this page canonically lives at. */
  path?: string
}

function setTag(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Update the document head for the current route.
 *
 * The prerender step writes the same values into the static HTML, so crawlers
 * that don't run JavaScript see them too. This keeps them right during
 * client-side navigation.
 */
export function applyMeta({ title, description, path }: PageMeta) {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : DEFAULT_TITLE
  const desc = description || DEFAULT_DESCRIPTION

  document.title = fullTitle
  setTag('meta[name="description"]', 'name', 'description', desc)
  setTag('meta[property="og:title"]', 'property', 'og:title', fullTitle)
  setTag('meta[property="og:description"]', 'property', 'og:description', desc)

  if (path) {
    const url = new URL(path, window.location.origin).toString()
    setTag('meta[property="og:url"]', 'property', 'og:url', url)
    setLink('canonical', url)
  }
}

/** One-line summary of a comparison, used for both the meta description and
 *  the prerendered body copy. */
export function comparisonDescription(
  packages: string[],
  ecosystem: string,
  question?: string
): string {
  const list =
    packages.length > 1
      ? `${packages.slice(0, -1).join(', ')} and ${packages[packages.length - 1]}`
      : packages[0]

  const lead = question ? `${question} ` : ''
  return `${lead}Compare ${list} on live ${ecosystem} data: download momentum, release cadence, security advisories, supply-chain size and maintenance.`
}

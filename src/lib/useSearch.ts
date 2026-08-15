import { ref, watch, type Ref } from 'vue'
import type { Ecosystem, PackageSummary } from '../types'

const MIN_QUERY = 2
const DEBOUNCE_MS = 250

// Shared across component instances. Backspacing through a query should be
// instant, and two pickers on one page shouldn't each pay for the same prefix.
const cache = new Map<string, PackageSummary[]>()

/**
 * Debounced, abortable package search.
 *
 * Every keystroke cancels the request in flight, so a fast typist issues one
 * network call rather than one per character, and out-of-order responses can't
 * overwrite newer results.
 */
export function useSearch(query: Ref<string>, ecosystem: Ref<Ecosystem>) {
  const results = ref<PackageSummary[]>([])
  const loading = ref(false)

  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  async function run(q: string, eco: Ecosystem) {
    const key = `${eco}:${q}`

    const cached = cache.get(key)
    if (cached) {
      results.value = cached
      loading.value = false
      return
    }

    controller?.abort()
    controller = new AbortController()
    loading.value = true

    try {
      const params = new URLSearchParams({ ecosystem: eco, q })
      const res = await fetch(`/api/search?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data: PackageSummary[] = await res.json()
      cache.set(key, data)
      results.value = data
    } catch (e: any) {
      // An aborted request is the expected path while typing, not a failure.
      if (e?.name !== 'AbortError') results.value = []
    } finally {
      // A newer request may already be in flight; don't clear its spinner.
      if (!controller?.signal.aborted) loading.value = false
    }
  }

  watch([query, ecosystem], ([q, eco]) => {
    clearTimeout(timer)
    const trimmed = q.trim()

    if (trimmed.length < MIN_QUERY) {
      controller?.abort()
      results.value = []
      loading.value = false
      return
    }

    timer = setTimeout(() => run(trimmed, eco), DEBOUNCE_MS)
  })

  function reset() {
    clearTimeout(timer)
    controller?.abort()
    results.value = []
    loading.value = false
  }

  return { results, loading, reset }
}

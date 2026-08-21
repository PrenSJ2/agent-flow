'use client'

import { useEffect, useState } from 'react'

/**
 * Reads the local harness console API.
 *
 * harness inventories this machine's Claude Code capabilities into a SQLite
 * graph and shelves the never-invoked ones to reclaim context tokens. Its data
 * — the capability graph, and what it has learned from its own use — is
 * genuinely different from the agent event stream this app already renders, so
 * it is fetched rather than derived.
 *
 * Failure is silent and non-fatal on purpose: harness is optional, and this app
 * must render its own views perfectly well when the console is not running.
 */

export const HARNESS_URL = 'http://127.0.0.1:4242'

export interface HarnessNode {
  i: string; n: string; k: string; o: string; s: string
  t: number; u: number; p: string; pl: string | null
  /** Domain, and the term that put it there — see tare's `categories.py`. */
  d: string; dw: string | null
}

export interface HarnessLearned {
  kind: string; subject: string; detail: string; evidence: string[]
}

export interface HarnessData {
  totals: { live_tokens: number; never_invoked_tokens: number; before: number }
  nodes: HarnessNode[]
  edges: { s: string; d: string }[]
  memory: {
    learned: HarnessLearned[]
    projects: Record<string, [string, number][]>
    instructions: { tok: number; lines: number; proj: string; file: string }[]
    index_tokens: number
    event_counts: Record<string, number>
  }
}

export function useHarness(pollMs = 15000) {
  const [data, setData] = useState<HarnessData | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`${HARNESS_URL}/api/data`, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const next = (await res.json()) as HarnessData
        if (!cancelled) { setData(next); setReachable(true) }
      } catch {
        // Not running, or not installed. Both are ordinary states.
        if (!cancelled) setReachable(false)
      }
    }

    load()
    // Polled rather than streamed: the underlying data changes when a scan or
    // a shelve runs, which is minutes apart, not milliseconds.
    const timer = setInterval(load, pollMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [pollMs])

  return { data, reachable }
}

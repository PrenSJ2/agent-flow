'use client'

import { useState } from 'react'
import { COLORS } from '@/lib/colors'
import { DOMAIN_COLORS } from './skills-page'
import type { HarnessHistory, HarnessHistoryEntry, HarnessNode } from '@/hooks/use-harness'

/**
 * How the configuration got to be the way it is, beside the graph of what it
 * currently is.
 *
 * Four lists, from two records that answer different questions. The filesystem
 * knows when every capability appeared and when it last changed — complete and
 * retroactive, but anonymous. Transcripts know which session edited what, with
 * the project that did it — attributable, but only where a transcript survives.
 *
 * The distinction matters enough to state on the page: a capability with no
 * recorded session edit was NOT necessarily hand-written. Transcripts age out
 * and an edit made in an editor was never in one. Labelling that "written by
 * you" would be inventing provenance, so the copy says what is actually known.
 */
export function HistorySidebar({
  history, nodes, onPick,
}: {
  history: HarnessHistory
  nodes: HarnessNode[]
  onPick: (node: HarnessNode) => void
}) {
  const [tab, setTab] = useState<keyof typeof TABS>('added')
  const byId = new Map(nodes.map(n => [n.i, n]))
  const { counts } = history

  const rows = history[tab]

  return (
    <aside
      className="flex flex-col gap-2 overflow-hidden"
      style={{ width: 268, flexShrink: 0, borderLeft: `1px solid ${COLORS.holoBg10}` }}
    >
      <div className="px-3 pt-2">
        <div className="text-[10px] font-mono tracking-wider" style={{ color: COLORS.textMuted }}>
          HISTORY
        </div>
        <div className="text-[9px] font-mono mt-1" style={{ color: COLORS.textMuted }}>
          {counts.own} yours · {counts.from_plugins} from plugins
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-3">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono"
            style={{
              background: tab === key ? COLORS.holoBright : 'transparent',
              color: tab === key ? COLORS.void : COLORS.textMuted,
              border: `1px solid ${COLORS.holoBg10}`,
            }}
          >
            {TABS[key].label} {history[key].length}
          </button>
        ))}
      </div>

      <div className="text-[9px] px-3 leading-relaxed" style={{ color: COLORS.textMuted }}>
        {TABS[tab].blurb}
      </div>

      <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-1.5">
        {rows.length === 0 && (
          <div className="text-[9px] font-mono" style={{ color: COLORS.textMuted }}>
            nothing recorded
          </div>
        )}
        {rows.map(entry => (
          <Row
            key={`${tab}-${entry.id}`}
            entry={entry}
            stamp={TABS[tab].stamp}
            node={byId.get(entry.id)}
            onPick={onPick}
          />
        ))}
      </div>
    </aside>
  )
}

const TABS = {
  added: {
    label: 'added',
    stamp: 'born' as const,
    blurb: 'Your own skills and agents, newest first, by when the file appeared.',
  },
  evolved: {
    label: 'evolved',
    stamp: 'changed' as const,
    blurb: 'Changed after it was created — an old capability still being worked on.',
  },
  session_edited: {
    label: 'by a session',
    stamp: 'last_edit' as const,
    // The one place provenance is actually known, and the one place the
    // absence of a row means nothing at all.
    blurb: 'Edited by Claude from inside a session. Absence here is not evidence: '
      + 'transcripts age out, and an edit made in an editor was never in one.',
  },
  installed: {
    label: 'installed',
    stamp: 'born' as const,
    blurb: 'Came with a plugin. The date is when it was cached on this machine, '
      + 'not when it was written.',
  },
}

function Row({
  entry, stamp, node, onPick,
}: {
  entry: HarnessHistoryEntry
  stamp: 'born' | 'changed' | 'last_edit'
  node: HarnessNode | undefined
  onPick: (node: HarnessNode) => void
}) {
  const when = (entry[stamp] ?? '').slice(0, 10)
  const hue = node ? (DOMAIN_COLORS[node.d] ?? DOMAIN_COLORS.other) : COLORS.textMuted
  const last = entry.edits[entry.edits.length - 1]

  return (
    <button
      onClick={() => node && onPick(node)}
      className="text-left p-1.5 rounded"
      style={{
        background: 'transparent',
        border: `1px solid ${COLORS.holoBg10}`,
        cursor: node ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: hue,
          display: 'inline-block', flexShrink: 0,
        }} />
        <span className="text-[10px] font-mono truncate" style={{ color: COLORS.textPrimary }}>
          {entry.n}
        </span>
        {entry.s !== 'live' && (
          <span className="text-[8px] font-mono" style={{ color: COLORS.idle }}>{entry.s}</span>
        )}
      </div>
      <div className="text-[9px] font-mono" style={{ color: COLORS.textMuted }}>
        {when}{entry.pl ? ` · ${entry.pl}` : ''}
      </div>
      {last && (
        <div className="text-[9px] font-mono truncate" style={{ color: COLORS.textMuted }}>
          {entry.edit_count}× · {last.tool} in {shortProject(last.project)}
        </div>
      )}
    </button>
  )
}

/** Project keys are encoded absolute paths; only the tail is legible. */
function shortProject(key: string): string {
  return key.replace(/^-Users-[^-]+-/, '').replace(/^Documents-Code-?/, '') || key
}

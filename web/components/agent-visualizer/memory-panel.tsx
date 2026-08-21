'use client'

import { Z } from '@/lib/agent-types'
import { COLORS } from '@/lib/colors'
import { useHarness, HARNESS_URL } from '@/hooks/use-harness'
import { PanelHeader, ProgressBar, SlidingPanel } from './shared-ui'

interface MemoryPanelProps {
  visible: boolean
  onClose: () => void
}

/**
 * What the tooling has learned about itself.
 *
 * Not project facts — those live in a project's own CLAUDE.md, where they sit
 * beside the code they describe and go stale visibly. This is usage: searches
 * that found nothing, shelving decisions that turned out wrong, and which
 * project leans on what. It rots differently, because a lookup that happened
 * stays true; it only loses relevance with age.
 */
export function MemoryPanel({ visible, onClose }: MemoryPanelProps) {
  const { data, reachable } = useHarness()
  if (!visible) return null

  const body = () => {
    if (reachable === false) {
      return (
        <div className="text-[9px] font-mono py-2 leading-relaxed" style={{ color: COLORS.textMuted }}>
          harness console not reachable at {HARNESS_URL}
        </div>
      )
    }
    if (!data) {
      return <div className="text-[9px] font-mono py-2" style={{ color: COLORS.textMuted }}>reading…</div>
    }

    const { learned, instructions, index_tokens: indexTokens } = data.memory
    // An instruction file loads on every turn in its project, exactly like the
    // capability index — and is routinely far larger, which nothing else
    // measures.
    const weights = [
      { label: 'capability index', tok: indexTokens, own: true },
      ...instructions.slice(0, 4).map(i => ({ label: `${i.proj}/${i.file}`, tok: i.tok, own: false })),
    ]
    const maxWeight = Math.max(...weights.map(w => w.tok), 1)

    return (
      <>
        <div className="text-[8px] font-mono tracking-wider mb-1" style={{ color: COLORS.textMuted }}>
          LEARNED FROM USE
        </div>
        <div className="space-y-2 max-h-[190px] overflow-y-auto mb-3">
          {learned.length === 0 && (
            <div className="text-[9px] font-mono py-1" style={{ color: COLORS.textMuted }}>
              nothing yet — it learns from lookups and activations
            </div>
          )}
          {learned.slice(0, 6).map((item, i) => (
            <div key={`${item.kind}-${i}`}>
              <div className="text-[9px] font-mono" style={{ color: COLORS.textPrimary }}>
                [{item.kind}] {item.subject}
              </div>
              <div className="text-[8px] font-mono leading-relaxed" style={{ color: COLORS.textMuted }}>
                {item.detail}
              </div>
            </div>
          ))}
        </div>

        <div className="text-[8px] font-mono tracking-wider mb-1" style={{ color: COLORS.textMuted }}>
          LOADED EVERY TURN
        </div>
        <div className="space-y-1 max-h-[150px] overflow-y-auto">
          {weights.map(w => (
            <div key={w.label}>
              <div className="flex justify-between text-[9px] font-mono">
                <span className="truncate mr-2" style={{ color: w.own ? COLORS.textPrimary : COLORS.textMuted }}>
                  {w.label}
                </span>
                <span style={{ color: COLORS.textMuted }}>{w.tok.toLocaleString()}</span>
              </div>
              <ProgressBar percent={(100 * w.tok) / maxWeight} color={COLORS.textPrimary} />
            </div>
          ))}
        </div>
      </>
    )
  }

  return (
    <SlidingPanel visible={visible} position={{ top: 48, right: 12 }} zIndex={Z.sidePanel} width={260}>
      <div className="glass-card relative">
        <PanelHeader onClose={onClose}>
          <span className="text-[10px] font-mono tracking-wider" style={{ color: COLORS.textPrimary }}>
            MEMORY
          </span>
        </PanelHeader>
        {body()}
      </div>
    </SlidingPanel>
  )
}

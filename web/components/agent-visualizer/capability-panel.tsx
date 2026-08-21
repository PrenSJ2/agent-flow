'use client'

import { Z } from '@/lib/agent-types'
import { COLORS } from '@/lib/colors'
import { useHarness, HARNESS_URL } from '@/hooks/use-harness'
import { PanelHeader, ProgressBar, SlidingPanel } from './shared-ui'

interface CapabilityPanelProps {
  visible: boolean
  onClose: () => void
}

/**
 * What this machine can do, and what knowing about it costs.
 *
 * This app shows agents as they run. This panel shows the other half: the
 * capabilities they can reach for, most of which are listed in every prompt
 * and never invoked. On the author's machine that was 87% of ~19,800 tokens
 * per turn.
 */
export function CapabilityPanel({ visible, onClose }: CapabilityPanelProps) {
  const { data, reachable } = useHarness()
  if (!visible) return null

  const body = () => {
    if (reachable === false) {
      return (
        <div className="text-[9px] font-mono py-2 leading-relaxed" style={{ color: COLORS.textMuted }}>
          harness console not reachable at {HARNESS_URL}
          <br /><br />
          start it with <span style={{ color: COLORS.textPrimary }}>harness console --start</span>
        </div>
      )
    }
    if (!data) {
      return <div className="text-[9px] font-mono py-2" style={{ color: COLORS.textMuted }}>reading…</div>
    }

    const shelved = data.nodes.filter(n => n.s !== 'live')
    const reclaimed = data.totals.before - data.totals.live_tokens
    const deadPct = data.totals.live_tokens
      ? Math.round((100 * data.totals.never_invoked_tokens) / data.totals.live_tokens)
      : 0

    // Who dispatches the most — the suites that make shelving on usage alone
    // dangerous, since an orchestrator's sub-skills never appear by name.
    const outDegree = new Map<string, number>()
    for (const e of data.edges) outDegree.set(e.s, (outDegree.get(e.s) ?? 0) + 1)
    const byId = new Map(data.nodes.map(n => [n.i, n]))
    const routers = [...outDegree.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ name: byId.get(id)?.n ?? id, count }))
    const maxRoute = Math.max(...routers.map(r => r.count), 1)

    return (
      <>
        <div className="grid grid-cols-2 gap-1 mb-2">
          {[
            ['loaded', `${data.totals.live_tokens.toLocaleString()} tok`],
            ['reclaimed', `−${reclaimed.toLocaleString()} tok`],
            ['capabilities', String(data.nodes.length)],
            ['shelved', String(shelved.length)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[8px] font-mono tracking-wider" style={{ color: COLORS.textMuted }}>
                {k.toUpperCase()}
              </div>
              <div className="text-[11px] font-mono" style={{ color: COLORS.textPrimary }}>{v}</div>
            </div>
          ))}
        </div>

        <div className="text-[8px] font-mono tracking-wider mb-1" style={{ color: COLORS.textMuted }}>
          NEVER INVOKED — {deadPct}% OF WHAT IS LOADED
        </div>
        <ProgressBar percent={deadPct} color={COLORS.textPrimary} />

        <div className="text-[8px] font-mono tracking-wider mt-3 mb-1" style={{ color: COLORS.textMuted }}>
          DISPATCHES THE MOST
        </div>
        <div className="space-y-1 max-h-[180px] overflow-y-auto">
          {routers.map(r => (
            <div key={r.name}>
              <div className="flex justify-between text-[9px] font-mono" style={{ color: COLORS.textPrimary }}>
                <span className="truncate mr-2">{r.name}</span>
                <span style={{ color: COLORS.textMuted }}>{r.count}</span>
              </div>
              <ProgressBar percent={(100 * r.count) / maxRoute} color={COLORS.textPrimary} />
            </div>
          ))}
          {routers.length === 0 && (
            <div className="text-[9px] font-mono py-1" style={{ color: COLORS.textMuted }}>
              no routes-to edges yet — run <span style={{ color: COLORS.textPrimary }}>harness build</span>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <SlidingPanel visible={visible} position={{ top: 48, right: 12 }} zIndex={Z.sidePanel} width={260}>
      <div className="glass-card relative">
        <PanelHeader onClose={onClose}>
          <span className="text-[10px] font-mono tracking-wider" style={{ color: COLORS.textPrimary }}>
            CAPABILITIES
          </span>
        </PanelHeader>
        {body()}
      </div>
    </SlidingPanel>
  )
}

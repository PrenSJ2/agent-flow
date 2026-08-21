'use client'

import { COLORS } from '@/lib/colors'
import { useHarness } from '@/hooks/use-harness'
import { Stats, Unreachable } from './skills-page'

/**
 * What the tooling has learned about itself.
 *
 * Machine-wide, not session-scoped — which is why this is a page rather than a
 * panel beside the agent canvas. It is also deliberately NOT project facts:
 * those belong in a project's own CLAUDE.md, where they sit beside the code
 * they describe and go stale visibly. This is usage — searches that found
 * nothing, shelving decisions that turned out wrong, and what each project
 * actually leans on.
 */
export function MemoryPage() {
  const { data, reachable } = useHarness()

  if (reachable === false) return <Unreachable />
  if (!data) {
    return <div className="p-6 text-[11px] font-mono" style={{ color: COLORS.textMuted }}>reading…</div>
  }

  const { learned, projects, instructions, index_tokens: indexTokens, event_counts: counts } = data.memory
  const gaps = learned.filter(l => l.kind === 'gap').length

  const weights = [
    { label: 'capability index (all projects)', tok: indexTokens, own: true },
    ...instructions.slice(0, 6).map(i => ({ label: `${i.proj}/${i.file}`, tok: i.tok, own: false })),
  ]
  const maxWeight = Math.max(...weights.map(w => w.tok), 1)

  const ranked = Object.entries(projects)
    .map(([name, uses]) => ({ name, uses, total: uses.reduce((s, [, c]) => s + c, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const shortProj = (n: string) =>
    n.replace(/^-Users-[^-]+-/, '').replace(/^Documents-Code-?/, '') || 'Code'

  return (
    <div className="p-4 h-full flex flex-col gap-5 overflow-auto">
      <Stats items={[
        ['searches', String(counts.lookup ?? 0)],
        ['invocations mined', String(counts.invocation ?? 0)],
        ['gaps found', String(gaps)],
        ['projects', String(Object.keys(projects).length)],
        ['instruction files', String(instructions.length)],
      ]} />

      <section>
        <Heading>Learned from use</Heading>
        {learned.length === 0 ? (
          <div className="text-[10px] font-mono" style={{ color: COLORS.textMuted }}>
            nothing yet — it learns from lookups and activations
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {learned.map((item, i) => (
              <div key={`${item.kind}-${i}`} className="pl-2"
                   style={{ borderLeft: `2px solid ${COLORS.complete}` }}>
                <div className="text-[11px] font-mono" style={{ color: COLORS.textPrimary }}>
                  [{item.kind}] {item.subject}
                </div>
                <div className="text-[10px]" style={{ color: COLORS.textMuted }}>{item.detail}</div>
                {item.evidence.slice(0, 3).map((e, j) => (
                  <div key={j} className="text-[9px] font-mono" style={{ color: COLORS.textMuted }}>· {e}</div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <Heading>Loaded every turn</Heading>
        <div className="flex flex-col gap-1">
          {weights.map(w => (
            <div key={w.label} className="flex items-center gap-3">
              <div className="text-[10px] font-mono truncate" style={{ width: 240, color: w.own ? COLORS.textPrimary : COLORS.textMuted }}>
                {w.label}
              </div>
              <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: COLORS.holoBg10 }}>
                <div style={{
                  width: `${(100 * w.tok) / maxWeight}%`, height: '100%',
                  background: w.own ? COLORS.complete : COLORS.tool,
                }} />
              </div>
              <div className="text-[10px] font-mono" style={{ color: COLORS.textMuted, width: 70, textAlign: 'right' }}>
                {w.tok.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[9px] font-mono mt-1" style={{ color: COLORS.textMuted }}>
          a project&apos;s instruction file loads on every turn in that project, exactly like the index above
        </div>
      </section>

      <section>
        <Heading>What each project leans on</Heading>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {ranked.map(p => (
            <div key={p.name} className="p-2 rounded" style={{ border: `1px solid ${COLORS.holoBg10}` }}>
              <div className="text-[10px] font-mono mb-1 truncate" style={{ color: COLORS.textPrimary }}>
                {shortProj(p.name)}
              </div>
              {p.uses.slice(0, 5).map(([n, c]) => (
                <div key={n} className="flex justify-between text-[10px]" style={{ color: COLORS.textMuted }}>
                  <span className="truncate mr-2">{n.replace(/^superpowers:/, '')}</span>
                  <span className="font-mono">{c}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono tracking-wider mb-2" style={{ color: COLORS.textMuted }}>
      {String(children).toUpperCase()}
    </div>
  )
}

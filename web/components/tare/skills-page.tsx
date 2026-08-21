'use client'

import { useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { useHarness, HARNESS_URL, type HarnessNode } from '@/hooks/use-harness'

/**
 * The capability graph: everything this machine can do, and what knowing about
 * it costs.
 *
 * A full page rather than a session panel, because none of this is scoped to a
 * session. The agent view answers "what is happening right now"; this answers
 * "what could happen at all", which is true regardless of which session is
 * selected or whether any are running.
 *
 * Rendered on canvas with a small force simulation rather than a graph library:
 * 209 nodes and 419 edges is well within what canvas handles, and it keeps the
 * bundle unchanged.
 */
export function SkillsPage() {
  const { data, reachable } = useHarness()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [picked, setPicked] = useState<HarnessNode | null>(null)
  const [filter, setFilter] = useState<'all' | 'routed' | 'shelved'>('all')

  // Positions live outside React state: they change every frame, and putting
  // them through setState would re-render the whole page 60 times a second.
  const sim = useRef<{ p: any[]; e: [number, number][]; pos: Map<string, { x: number; y: number }>; alpha: number }>({
    p: [], e: [], pos: new Map(), alpha: 0,
  })

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !data) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const degree = new Map<string, number>()
    for (const edge of data.edges) {
      degree.set(edge.s, (degree.get(edge.s) ?? 0) + 1)
      degree.set(edge.d, (degree.get(edge.d) ?? 0) + 1)
    }
    const keep = data.nodes.filter(n =>
      filter === 'all' ? true : filter === 'routed' ? degree.has(n.i) : n.s !== 'live')
    const present = new Set(keep.map(n => n.i))

    const state = sim.current
    state.p = keep.map((n, i) => {
      const prev = state.pos.get(n.i)
      return {
        n,
        x: prev?.x ?? cv.width / 2 + Math.cos(i * 2.4) * (140 + (i % 7) * 22),
        y: prev?.y ?? cv.height / 2 + Math.sin(i * 2.4) * (120 + (i % 5) * 18),
        vx: 0, vy: 0,
        r: 3 + Math.min(7, Math.sqrt((n.t || 1) / 9)),
      }
    })
    const index = new Map(state.p.map((p, i) => [p.n.i, i]))
    state.e = data.edges
      .filter(e => present.has(e.s) && present.has(e.d))
      .map(e => [index.get(e.s)!, index.get(e.d)!] as [number, number])
    state.alpha = 1

    let raf = 0
    const frame = () => {
      const s = sim.current
      if (s.alpha > 0.005) {
        s.alpha *= 0.985
        const cx = cv.width / 2, cy = cv.height / 2
        for (const p of s.p) { p.vx += (cx - p.x) * 0.0016; p.vy += (cy - p.y) * 0.0016 }
        for (let i = 0; i < s.p.length; i++) for (let j = i + 1; j < s.p.length; j++) {
          const a = s.p[i], b = s.p[j]
          let dx = b.x - a.x, dy = b.y - a.y
          const d2 = dx * dx + dy * dy
          if (d2 > 42000 || d2 === 0) continue
          const f = 210 / d2
          dx *= f; dy *= f
          a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy
        }
        for (const [i, j] of s.e) {
          const a = s.p[i], b = s.p[j]
          if (!a || !b) continue
          const dx = b.x - a.x, dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 1
          const f = (d - 58) * 0.0045
          a.vx += (dx / d) * f; a.vy += (dy / d) * f
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
        }
        for (const p of s.p) { p.x += (p.vx *= 0.86); p.y += (p.vy *= 0.86); s.pos.set(p.n.i, { x: p.x, y: p.y }) }
      }

      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.lineWidth = 1
      for (const [i, j] of s.e) {
        const a = s.p[i], b = s.p[j]
        if (!a || !b) continue
        const hot = picked && (a.n.i === picked.i || b.n.i === picked.i)
        ctx.strokeStyle = hot ? COLORS.complete : COLORS.holoBg10
        ctx.globalAlpha = hot ? 0.95 : 0.4
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
      ctx.globalAlpha = 1
      for (const p of s.p) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832)
        ctx.fillStyle = p.n.s !== 'live' ? COLORS.idle : p.n.o === 'plugin' ? COLORS.tool : COLORS.complete
        ctx.fill()
        if (p.n.u > 0) { ctx.strokeStyle = COLORS.holoBright; ctx.lineWidth = 1.3; ctx.stroke() }
        if (picked && p.n.i === picked.i) {
          ctx.strokeStyle = COLORS.complete; ctx.lineWidth = 2
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, 6.2832); ctx.stroke(); ctx.lineWidth = 1
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [data, filter, picked])

  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const x = (ev.clientX - rect.left) * (cv.width / rect.width)
    const y = (ev.clientY - rect.top) * (cv.height / rect.height)
    let best: HarnessNode | null = null, bd = 200
    for (const p of sim.current.p) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bd) { bd = d; best = p.n }
    }
    setPicked(best)
  }

  if (reachable === false) {
    return <Unreachable />
  }
  if (!data) {
    return <div className="p-6 text-[11px] font-mono" style={{ color: COLORS.textMuted }}>reading…</div>
  }

  const shelved = data.nodes.filter(n => n.s !== 'live').length
  const reclaimed = data.totals.before - data.totals.live_tokens
  const outs = picked ? data.edges.filter(e => e.s === picked.i) : []
  const byId = new Map(data.nodes.map(n => [n.i, n]))

  return (
    <div className="p-4 h-full flex flex-col gap-3 overflow-auto">
      <Stats items={[
        ['capabilities', String(data.nodes.length)],
        ['shelved', String(shelved)],
        ['loaded now', `${data.totals.live_tokens.toLocaleString()} tok`],
        ['reclaimed', `−${reclaimed.toLocaleString()} tok`],
        ['routes-to', String(data.edges.length)],
      ]} />

      <div className="flex gap-2 items-center">
        {(['all', 'routed', 'shelved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-2 py-0.5 rounded text-[10px] font-mono"
            style={{
              background: filter === f ? COLORS.holoBright : 'transparent',
              color: filter === f ? COLORS.bg : COLORS.textMuted,
              border: `1px solid ${COLORS.holoBg10}`,
            }}
          >{f}</button>
        ))}
        <span className="text-[10px] font-mono" style={{ color: COLORS.textMuted }}>
          click a node · ring = used · size = tokens
        </span>
      </div>

      <div className="relative rounded" style={{ border: `1px solid ${COLORS.holoBg10}` }}>
        <canvas ref={canvasRef} width={1200} height={560} onClick={onClick}
                className="w-full block" style={{ cursor: 'crosshair' }} />
        {picked && (
          <div className="absolute top-3 right-3 p-3 rounded glass-card" style={{ width: 280 }}>
            <div className="text-[11px] font-mono" style={{ color: COLORS.textPrimary }}>{picked.n}</div>
            <div className="text-[9px] font-mono mb-1" style={{ color: COLORS.textMuted }}>
              {picked.k} · {picked.s} · {picked.t} tok · {picked.u} use{picked.u === 1 ? '' : 's'}
            </div>
            {picked.p && <div className="text-[10px]" style={{ color: COLORS.textMuted }}>{picked.p}</div>}
            {outs.length > 0 && (
              <ul className="mt-2 text-[9px] font-mono list-none p-0" style={{ color: COLORS.textMuted }}>
                {outs.slice(0, 8).map(e => <li key={e.d}>routes to {byId.get(e.d)?.n ?? e.d}</li>)}
                {outs.length > 8 && <li>… {outs.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="text-[9px] font-mono tracking-wider" style={{ color: COLORS.textMuted }}>
            {k.toUpperCase()}
          </div>
          <div className="text-[15px] font-mono" style={{ color: COLORS.textPrimary }}>{v}</div>
        </div>
      ))}
    </div>
  )
}

export function Unreachable() {
  return (
    <div className="p-6 text-[11px] font-mono leading-relaxed" style={{ color: COLORS.textMuted }}>
      tare console not reachable at {HARNESS_URL}
      <br /><br />
      start it with <span style={{ color: COLORS.textPrimary }}>tare console --start</span>
    </div>
  )
}

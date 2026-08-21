'use client'

import { useEffect, useRef, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { useHarness, HARNESS_URL, type HarnessNode } from '@/hooks/use-harness'
import { HistorySidebar } from './history-sidebar'

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
/**
 * One hue per domain, distinct enough to tell apart as 4px dots.
 *
 * The domains come from the server (tare's `categories.py`); anything it does
 * not recognise arrives as `other` and takes the grey.
 */
export const DOMAIN_COLORS: Record<string, string> = {
  code: '#66ccff',
  marketing: '#ff9a3c',
  video: '#cc88ff',
  design: '#ff6b9d',
  process: '#66ffaa',
  infra: '#4ecdc4',
  writing: '#ffd93d',
  data: '#7c9aff',
  other: '#7a8899',
}

// Node radius, driven by invocations. The floor keeps a never-invoked
// capability visible -- most of them are -- and the ceiling stops the one
// node with 165 invocations from swallowing its neighbours.
const NODE_R_MIN = 3.5
const NODE_R_MAX = 16
const NODE_R_SCALE = 1.45

// Where the layout is declared finished. Higher than the old 0.005 so it
// settles in a couple of seconds rather than creeping for a minute.
const ALPHA_FLOOR = 0.02

export function SkillsPage() {
  const { data, reachable } = useHarness()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [picked, setPicked] = useState<HarnessNode | null>(null)
  const [filter, setFilter] = useState<'all' | 'routed' | 'shelved'>('all')
  const [domain, setDomain] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [openResult, setOpenResult] = useState<string>('')
  const [query, setQuery] = useState('')

  // Positions live outside React state: they change every frame, and putting
  // them through setState would re-render the whole page 60 times a second.
  const sim = useRef<{
    p: any[]; e: [number, number][]; pos: Map<string, { x: number; y: number }>
    alpha: number; sig: string; view: { x: number; y: number; k: number }
  }>({ p: [], e: [], pos: new Map(), alpha: 0, sig: '', view: { x: 0, y: 0, k: 1 } })

  const [zoomLabel, setZoomLabel] = useState('100%')

  // The draw loop reads the query through a ref: putting it in the effect's
  // deps would tear down and restart the simulation on every keystroke.
  const queryRef = useRef('')
  queryRef.current = query.trim().toLowerCase()

  // Same reasoning for the domain: picking one dims the rest of the graph
  // rather than re-laying it out, so the positions you had just learned stay
  // put and the cross-domain edges stay visible.
  const domainRef = useRef<string | null>(null)
  domainRef.current = domain

  // Read through a ref for the same reason as the query: selecting a node
  // changes only what is highlighted, and having it in the effect's deps
  // meant every click tore down the simulation and re-shook the layout.
  const pickedRef = useRef<HarnessNode | null>(null)
  pickedRef.current = picked

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
        // Sized by how often it is actually invoked, not by what it costs.
        // Token weight is what the vault cares about; on this graph the
        // question is which capabilities carry the work -- and 24 of 209
        // nodes have any usage at all, so the unused ones need to stay
        // legible rather than vanish. Square root, because the top node has
        // 165 invocations against a median of 5 among used ones and a linear
        // scale would leave everything else as dots around it.
        r: Math.min(NODE_R_MAX, NODE_R_MIN + NODE_R_SCALE * Math.sqrt(n.u || 0)),
      }
    })
    const index = new Map(state.p.map((p, i) => [p.n.i, i]))
    state.e = data.edges
      .filter(e => present.has(e.s) && present.has(e.d))
      .map(e => [index.get(e.s)!, index.get(e.d)!] as [number, number])

    // Reheat only when the graph actually changed shape.
    //
    // The payload polls every 15 seconds and arrives as a fresh object every
    // time, so this effect re-ran and set alpha to 1 on every poll -- the
    // whole layout shook itself apart and re-settled, for ever. That was the
    // vibration: not the forces, the reheating.
    const signature = `${keep.length}:${state.e.length}:${filter}`
    state.alpha = signature === state.sig ? 0 : 1
    state.sig = signature

    let raf = 0
    const frame = () => {
      const s = sim.current
      if (s.alpha > ALPHA_FLOOR) {
        s.alpha *= 0.985
        // Every force is scaled by alpha, which is what makes the layout
        // actually come to rest.
        //
        // Before this, alpha only decided WHETHER to run the simulation and
        // the forces ran at full strength until it crossed the floor. Nodes
        // reached the point where repulsion and springs balance, overshot,
        // were pulled back, and overshot again -- a permanent jitter that
        // never damped, because nothing ever got weaker.
        const k = s.alpha
        const cx = cv.width / 2, cy = cv.height / 2
        for (const p of s.p) { p.vx += (cx - p.x) * 0.0016 * k; p.vy += (cy - p.y) * 0.0016 * k }
        for (let i = 0; i < s.p.length; i++) for (let j = i + 1; j < s.p.length; j++) {
          const a = s.p[i], b = s.p[j]
          let dx = b.x - a.x, dy = b.y - a.y
          const d2 = dx * dx + dy * dy
          if (d2 > 42000 || d2 === 0) continue
          const f = (210 / d2) * k
          dx *= f; dy *= f
          a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy
        }
        for (const [i, j] of s.e) {
          const a = s.p[i], b = s.p[j]
          if (!a || !b) continue
          const dx = b.x - a.x, dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 1
          const f = (d - 58) * 0.0045 * k
          a.vx += (dx / d) * f; a.vy += (dy / d) * f
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
        }
        for (const p of s.p) { p.x += (p.vx *= 0.86); p.y += (p.vy *= 0.86); s.pos.set(p.n.i, { x: p.x, y: p.y }) }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      const view = sim.current.view
      ctx.translate(view.x, view.y)
      ctx.scale(view.k, view.k)
      ctx.lineWidth = 1 / view.k
      for (const [i, j] of s.e) {
        const a = s.p[i], b = s.p[j]
        if (!a || !b) continue
        const hot = pickedRef.current && (a.n.i === pickedRef.current.i || b.n.i === pickedRef.current.i)
        ctx.strokeStyle = hot ? COLORS.complete : COLORS.holoBg10
        ctx.globalAlpha = hot ? 0.95 : 0.4
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
      ctx.globalAlpha = 1
      const needle = queryRef.current
      const only = domainRef.current
      for (const p of s.p) {
        // A search dims non-matches rather than removing them: dropping nodes
        // would tear holes in the graph and hide the very relationships you
        // are searching for.
        const match = (!needle || (p.n.n + ' ' + (p.n.p ?? '') + ' ' + (p.n.pl ?? ''))
          .toLowerCase().includes(needle)) && (!only || p.n.d === only)
        // Shelved capabilities keep their domain hue at reduced strength.
        // Colouring them grey would have made "shelved" and "unclassified" the
        // same colour, and the whole point of the domain is to be visible
        // whether or not the capability is currently loaded.
        ctx.globalAlpha = match ? (p.n.s === 'live' ? 1 : 0.45) : 0.1
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832)
        ctx.fillStyle = DOMAIN_COLORS[p.n.d] ?? DOMAIN_COLORS.other
        ctx.fill()
        if (p.n.u > 0) { ctx.strokeStyle = COLORS.holoBright; ctx.lineWidth = 1.3; ctx.stroke() }
        if (pickedRef.current && p.n.i === pickedRef.current.i) {
          ctx.strokeStyle = COLORS.complete; ctx.lineWidth = 2 / view.k
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, 6.2832); ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      // Labels once zoomed in, or on the matches of a search at any zoom --
      // an unlabelled highlight tells you something matched but not what.
      if (view.k > 1.3 || needle || only) {
        ctx.fillStyle = COLORS.textMuted
        ctx.font = `${9 / view.k}px ui-monospace, monospace`
        for (const p of s.p) {
          const match = !needle || (p.n.n + ' ' + (p.n.p ?? '')).toLowerCase().includes(needle)
          if (needle && !match) continue
          if (only && p.n.d !== only) continue
          // Radius now IS usage, so the old `p.r > 4` said the same thing as
          // the clause beside it. Labelled if it has ever been invoked.
          if (!needle && !only && p.n.u === 0) continue
          ctx.fillText(p.n.n, p.x + p.r + 3 / view.k, p.y + 3 / view.k)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [data, filter])

  // Wheel and pointer handlers are attached imperatively: wheel must be
  // non-passive to preventDefault (otherwise the page scrolls instead of the
  // graph zooming), and React's onWheel is passive.
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const view = sim.current.view
      const rect = cv.getBoundingClientRect()
      const px = (ev.clientX - rect.left) * (cv.width / rect.width)
      const py = (ev.clientY - rect.top) * (cv.height / rect.height)
      const next = Math.min(6, Math.max(0.3, view.k * (ev.deltaY < 0 ? 1.12 : 0.89)))
      // Anchor on the cursor: keep the world point under the pointer fixed,
      // so zooming goes where you are looking rather than to the origin.
      view.x = px - ((px - view.x) / view.k) * next
      view.y = py - ((py - view.y) / view.k) * next
      view.k = next
      setZoomLabel(`${Math.round(next * 100)}%`)
    }

    let drag: { x: number; y: number; vx: number; vy: number } | null = null
    const down = (ev: PointerEvent) => {
      drag = { x: ev.clientX, y: ev.clientY, vx: sim.current.view.x, vy: sim.current.view.y }
    }
    const move = (ev: PointerEvent) => {
      if (!drag) return
      const cvRect = cv.getBoundingClientRect()
      const scale = cv.width / cvRect.width
      sim.current.view.x = drag.vx + (ev.clientX - drag.x) * scale
      sim.current.view.y = drag.vy + (ev.clientY - drag.y) * scale
    }
    const up = () => { drag = null }

    cv.addEventListener('wheel', onWheel, { passive: false })
    cv.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      cv.removeEventListener('wheel', onWheel)
      cv.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // Depends on `data`, NOT []. The canvas does not exist on first render --
    // the component returns "reading…" until the fetch lands -- so an effect
    // with empty deps ran once against a null ref and never attached
    // anything. Pan and zoom silently did nothing.
  }, [data])

  const resetView = () => {
    sim.current.view = { x: 0, y: 0, k: 1 }
    sim.current.alpha = Math.max(sim.current.alpha, 0.3)
    setZoomLabel('100%')
  }

  const onClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const view = sim.current.view
    // Screen -> world: undo the pan and zoom the frame was drawn with, or
    // clicks land on whatever was under that pixel before you zoomed.
    const x = ((ev.clientX - rect.left) * (cv.width / rect.width) - view.x) / view.k
    const y = ((ev.clientY - rect.top) * (cv.height / rect.height) - view.y) / view.k
    let best: HarnessNode | null = null, bd = 200 / (view.k * view.k)
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

  const domainCounts = new Map<string, number>()
  for (const n of data.nodes) domainCounts.set(n.d, (domainCounts.get(n.d) ?? 0) + 1)
  const domains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])

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
              color: filter === f ? COLORS.void : COLORS.textMuted,
              border: `1px solid ${COLORS.holoBg10}`,
            }}
          >{f}</button>
        ))}
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="search capabilities…"
          className="px-2 py-0.5 rounded text-[10px] font-mono"
          style={{ background: 'transparent', color: COLORS.textPrimary,
                   border: `1px solid ${COLORS.holoBg10}`, outline: 'none', minWidth: 190 }}
        />
        <button
          onClick={resetView}
          className="px-2 py-0.5 rounded text-[10px] font-mono"
          style={{ background: 'transparent', color: COLORS.textMuted, border: `1px solid ${COLORS.holoBg10}` }}
        >reset view</button>
        <span className="text-[10px] font-mono" style={{ color: COLORS.textMuted }}>
          {zoomLabel} · scroll to zoom · drag to pan · click a node · ring = used · size = tokens
        </span>
      </div>

      {/* Domain row. Colour is the legend -- the dot beside each name is the
          same hue the node takes on the canvas, so the row doubles as the key
          for the graph rather than needing a separate one. */}
      <div className="flex gap-1.5 items-center flex-wrap">
        <button
          onClick={() => setDomain(null)}
          className="px-2 py-0.5 rounded text-[10px] font-mono"
          style={{
            background: domain === null ? COLORS.holoBright : 'transparent',
            color: domain === null ? COLORS.void : COLORS.textMuted,
            border: `1px solid ${COLORS.holoBg10}`,
          }}
        >every domain</button>
        {domains.map(([name, count]) => {
          const hue = DOMAIN_COLORS[name] ?? DOMAIN_COLORS.other
          const on = domain === name
          return (
            <button
              key={name}
              onClick={() => setDomain(on ? null : name)}
              className="px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1.5"
              style={{
                background: on ? `${hue}22` : 'transparent',
                color: on ? hue : COLORS.textMuted,
                border: `1px solid ${on ? hue : COLORS.holoBg10}`,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: hue, display: 'inline-block', flexShrink: 0,
              }} />
              {name} <span style={{ opacity: 0.6 }}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3 items-stretch">
      <div className="relative rounded flex-1 min-w-0" style={{ border: `1px solid ${COLORS.holoBg10}` }}>
        <canvas ref={canvasRef} width={1200} height={560} onClick={onClick}
                className="w-full block" style={{ cursor: 'grab', touchAction: 'none' }} />
        {picked && (
          <div className="absolute top-3 right-3 p-3 rounded glass-card" style={{ width: 280 }}>
            <div className="text-[11px] font-mono" style={{ color: COLORS.textPrimary }}>{picked.n}</div>
            <div className="text-[9px] font-mono mb-1" style={{ color: COLORS.textMuted }}>
              {picked.k} · {picked.s} · {picked.t} tok · {picked.u} use{picked.u === 1 ? '' : 's'}
            </div>
            {/* The deciding term is shown, not just the domain: grouping by
                keyword gets things wrong, and a wrong grouping you can see the
                reason for is one you can go and fix. */}
            <div className="text-[9px] font-mono mb-1"
                 style={{ color: DOMAIN_COLORS[picked.d] ?? DOMAIN_COLORS.other }}>
              {picked.d}{picked.dw ? ` · matched “${picked.dw}”` : ' · nothing matched'}
            </div>
            {picked.p && <div className="text-[10px]" style={{ color: COLORS.textMuted }}>{picked.p}</div>}

            {/* Where it lives, and a way in. The path is the answer to "which
                file do I edit"; the button saves the round trip through a
                terminal. The server resolves the id to a path itself, so no
                path is ever sent from here -- see tare's `open_capability`. */}
            {picked.f && (
              <div className="mt-2 flex flex-col gap-1">
                <button
                  onClick={() => { navigator.clipboard?.writeText(picked.f); setCopied(picked.i) }}
                  className="text-left text-[9px] font-mono break-all"
                  style={{ color: COLORS.textMuted, background: 'transparent',
                           border: 'none', padding: 0, cursor: 'pointer' }}
                  title="click to copy the path"
                >
                  {copied === picked.i ? 'copied ✓' : picked.f}
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => openCapability(picked.i, setOpenResult)}
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                    style={{ background: 'transparent', color: COLORS.textPrimary,
                             border: `1px solid ${COLORS.holoBg10}`, cursor: 'pointer' }}
                  >open</button>
                  {picked.pl && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                          style={{ color: COLORS.tool, border: `1px solid ${COLORS.holoBg10}` }}>
                      {picked.pl} plugin
                    </span>
                  )}
                </div>
                {openResult && (
                  <div className="text-[9px] font-mono" style={{ color: COLORS.textMuted }}>
                    {openResult}
                  </div>
                )}
              </div>
            )}
            {outs.length > 0 && (
              <ul className="mt-2 text-[9px] font-mono list-none p-0" style={{ color: COLORS.textMuted }}>
                {outs.slice(0, 8).map(e => <li key={e.d}>routes to {byId.get(e.d)?.n ?? e.d}</li>)}
                {outs.length > 8 && <li>… {outs.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}
      </div>
        {data.history && (
          <HistorySidebar history={data.history} nodes={data.nodes} onPick={setPicked} />
        )}
      </div>
    </div>
  )
}

/**
 * Ask the harness to open a capability's own file.
 *
 * The id goes over, never a path: the server resolves it through the graph,
 * so the only things this can open are capabilities that already exist.
 */
async function openCapability(id: string, report: (message: string) => void) {
  try {
    const res = await fetch(`${HARNESS_URL}/api/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const data = await res.json()
    report(data.ok ? `opened ${data.detail}` : `could not open: ${data.detail}`)
  } catch {
    // The API is a separate process and may simply not be up.
    report('could not reach the harness API')
  }
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

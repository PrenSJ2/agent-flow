'use client'

import { useState } from 'react'
import { COLORS } from '@/lib/colors'
import { resolveTabColor } from '@/lib/tabcolor'
import { useHarness } from '@/hooks/use-harness'

/**
 * What is running in a shell right now, per project.
 *
 * The canvas shows tool calls while they are in flight, but a backgrounded
 * command finishes its tool call immediately and then keeps running for
 * hours -- so a session polling `kubectl logs` since yesterday looked
 * completely idle. This is read from the process table rather than the
 * transcript, which records that a command was launched and never that it
 * stopped.
 *
 * Grouped by PROJECT, and labelled that way, because that is genuinely as far
 * as the attribution goes: a `claude` process exposes its working directory
 * and not its session id, so two sessions in one repository are
 * indistinguishable from out here. Saying "session" would be a nicer word and
 * a false one.
 */
export function RunningShells() {
  const { data } = useHarness()
  const [open, setOpen] = useState(false)

  const shells = data?.shells
  if (!shells || shells.unavailable) return null

  const projects = Object.entries(shells.projects)
  const total = projects.reduce((sum, [, items]) => sum + items.length, 0)
  if (total === 0) return null

  return (
    <div
      className="absolute font-mono"
      style={{ bottom: 12, left: 12, zIndex: 30, maxWidth: 520 }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2 py-1 rounded text-[10px] flex items-center gap-2"
        style={{
          background: COLORS.panelBg,
          border: `1px solid ${COLORS.holoBg10}`,
          color: COLORS.textPrimary,
          cursor: 'pointer',
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: COLORS.tool, boxShadow: `0 0 5px ${COLORS.tool}` }}
        />
        {total} shell{total === 1 ? '' : 's'} running
        <span style={{ color: COLORS.textMuted }}>
          {projects.map(([p, items]) => `${p} ${items.length}`).join(' · ')}
        </span>
        <span style={{ color: COLORS.textMuted }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div
          className="mt-1 p-2 rounded flex flex-col gap-2"
          style={{ background: COLORS.panelBg, border: `1px solid ${COLORS.holoBg10}` }}
        >
          {projects
            .sort((a, b) => b[1].length - a[1].length)
            .map(([project, items]) => (
              <div key={project}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span style={{
                    width: 7, height: 7, borderRadius: 2, flexShrink: 0,
                    background: resolveTabColor(project), display: 'inline-block',
                  }} />
                  <span className="text-[10px]" style={{ color: resolveTabColor(project) }}>
                    {project}
                  </span>
                </div>
                {items
                  .sort((a, b) => b.secs - a.secs)
                  .map(item => (
                    <div key={item.pid} className="flex gap-2 text-[9px]"
                         style={{ color: COLORS.textMuted }}>
                      <span style={{ width: 46, flexShrink: 0, textAlign: 'right' }}>
                        {clock(item.secs)}
                      </span>
                      <span className="truncate" title={item.cmd}>{item.cmd}</span>
                    </div>
                  ))}
              </div>
            ))}
          <div className="text-[9px]" style={{ color: COLORS.textMuted, opacity: 0.7 }}>
            by project — a session id is not recoverable from a process
            {shells.services > 0 && ` · ${shells.services} MCP service(s) not counted`}
          </div>
        </div>
      )}
    </div>
  )
}

/** Coarse: "21h26m" is the useful shape, seconds are noise at this age. */
function clock(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(seconds / 86400)}d${String(Math.floor((seconds % 86400) / 3600)).padStart(2, '0')}h`
}

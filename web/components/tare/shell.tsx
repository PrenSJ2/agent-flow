'use client'

import { useState } from 'react'
import { AgentVisualizer } from '../agent-visualizer'
import { COLORS } from '@/lib/colors'
import { SkillsPage } from './skills-page'
import { MemoryPage } from './memory-page'

type View = 'agents' | 'skills' | 'memory'

/**
 * Top-level view switch.
 *
 * Skills and Memory are separate views rather than panels inside the agent
 * canvas because they are not scoped to a session. Files, Chat and Timeline
 * describe the agents in the selected session; the capability graph and the
 * usage memory are properties of the machine, true whether or not anything is
 * running. Docking them next to session-scoped panels implied a relationship
 * that does not exist.
 *
 * The agent view stays MOUNTED when another view is shown, only hidden. It
 * holds a live event stream and a running simulation; unmounting it would drop
 * the connection and lose in-flight state every time someone glanced at the
 * capability graph.
 */
export function TareShell() {
  const [view, setView] = useState<View>('agents')

  const tab = (id: View, label: string) => (
    <button
      key={id}
      onClick={() => setView(id)}
      className="px-3 py-1 text-[11px] font-mono tracking-wider transition-colors"
      style={{
        background: view === id ? COLORS.holoBright : 'transparent',
        color: view === id ? COLORS.bg : COLORS.textMuted,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="w-full h-full flex flex-col" style={{ background: COLORS.bg }}>
      <div
        className="flex items-center gap-1 px-2 py-1 flex-shrink-0"
        style={{ borderBottom: `1px solid ${COLORS.holoBg10}` }}
      >
        <span className="text-[11px] font-mono mr-2 tracking-widest" style={{ color: COLORS.textMuted }}>
          tare
        </span>
        {tab('agents', 'AGENTS')}
        {tab('skills', 'SKILLS')}
        {tab('memory', 'MEMORY')}
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div style={{ display: view === 'agents' ? 'block' : 'none', width: '100%', height: '100%' }}>
          <AgentVisualizer />
        </div>
        {view === 'skills' && <SkillsPage />}
        {view === 'memory' && <MemoryPage />}
      </div>
    </div>
  )
}

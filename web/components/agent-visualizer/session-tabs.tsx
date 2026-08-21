'use client'

import { useEffect, useRef, useCallback } from 'react'
import { COLORS } from '@/lib/colors'
import { projectOf, resolveTabColor } from '@/lib/tabcolor'
import { ALL_SESSIONS } from '@/lib/session-namespace'
import type { SessionInfo } from '@/lib/vscode-bridge'

interface SessionTabsProps {
  sessions: SessionInfo[]
  selectedSessionId: string | null
  sessionsWithActivity: Set<string>
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
  followSessions: boolean
  onToggleFollow: (follow: boolean) => void
}

export function SessionTabs({
  sessions,
  selectedSessionId,
  sessionsWithActivity,
  onSelectSession,
  onCloseSession,
  followSessions,
  onToggleFollow,
}: SessionTabsProps) {
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const setButtonRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) buttonRefs.current.set(id, el)
    else buttonRefs.current.delete(id)
  }, [])

  // Scroll selected tab into view whenever it changes
  useEffect(() => {
    if (!selectedSessionId) return
    const el = buttonRefs.current.get(selectedSessionId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selectedSessionId])

  const activeCount = sessions.filter(s => s.status === 'active').length
  const allSelected = selectedSessionId === ALL_SESSIONS

  return (
    <div className="flex gap-1">
      {/* Every session on one canvas. First in the strip because it is the
          overview the others are views into, and because its position should
          not move as sessions come and go. */}
      {sessions.length > 1 && (
        <button
          onClick={() => onSelectSession(ALL_SESSIONS)}
          className="px-1.5 py-0.5 rounded transition-all flex items-center gap-1"
          style={{
            flexShrink: 0,
            whiteSpace: 'nowrap',
            background: allSelected ? COLORS.tabSelectedBg : COLORS.tabInactiveBg,
            border: `1px solid ${allSelected ? COLORS.holoBright : COLORS.holoBg10}`,
            opacity: allSelected ? 1 : 0.82,
            color: allSelected ? COLORS.holoBright : COLORS.textMuted,
          }}
          title="every session's agents on one canvas"
        >
          ALL
          <span style={{ opacity: 0.6 }}>{activeCount || sessions.length}</span>
        </button>
      )}
      {/* Whether a session waking up takes the view. ALL is never stolen from
          regardless, so this governs the per-session tabs. */}
      <button
        onClick={() => onToggleFollow(!followSessions)}
        className="px-1.5 py-0.5 rounded transition-all flex items-center gap-1"
        style={{
          flexShrink: 0,
          whiteSpace: 'nowrap',
          background: 'transparent',
          border: `1px solid ${COLORS.holoBg10}`,
          color: followSessions ? COLORS.complete : COLORS.textMuted,
          opacity: followSessions ? 1 : 0.6,
        }}
        title={followSessions
          ? 'following: a session that wakes up takes the view'
          : 'not following: the view stays where you put it'}
      >
        {followSessions ? '\u29BF' : '\u25CB'} follow
      </button>
      {sessions.map(session => {
        const isSelected = session.id === selectedSessionId
        const isActive = session.status === 'active'
        const hasActivity = sessionsWithActivity.has(session.id)
        // Green dot: session is active, OR has unseen background activity
        const showGreen = isActive || hasActivity
        const project = projectOf(session.cwd ?? '')
        const projectColor = resolveTabColor(
          projectOf(session.cwd ?? session.label),
          session.cwd,
        )
        // A session with no chat text yet carries "Session <id>", which says
        // nothing the repository name does not say better. Showing
        // "swarm - Session a1b2c3d4" would be noise on every fresh tab.
        const isPlaceholder = /^Session [0-9a-f]+$/i.test(session.label)
        const chat = isPlaceholder ? '' : session.label

        return (
          <button
            key={session.id}
            ref={(el) => setButtonRef(session.id, el)}
            onClick={() => onSelectSession(session.id)}
            className="group px-1.5 py-0.5 rounded transition-all flex items-center gap-1"
            style={{
              flexShrink: 0,
              whiteSpace: 'nowrap',
              background: isSelected ? COLORS.tabSelectedBg : COLORS.tabInactiveBg,
              // Outline in the same colour the terminal gives this project, so
              // a session here and its iTerm tab read as the same workspace.
              // Muted when the tab is not selected so the accent stays a cue
              // rather than a row of competing colours.
              border: `1px solid ${projectColor}`,
              boxShadow: isSelected ? `inset 0 0 0 1px ${projectColor}` : 'none',
              opacity: isSelected ? 1 : 0.82,
              color: isSelected ? COLORS.holoBright : COLORS.textMuted,
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{
                background: showGreen ? COLORS.complete : COLORS.idle + '40',
                boxShadow: showGreen ? `0 0 4px ${COLORS.complete}` : 'none',
                animation: hasActivity && !isSelected ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            {/* Repository first and never truncated: it is the part that
                identifies the workspace, and it is what the terminal tab and
                the outline colour both key on. The chat text is the part that
                gives way when the row runs out of room. */}
            {project ? (
              <>
                <span style={{ flexShrink: 0 }}>{project}</span>
                {chat && (
                  <>
                    <span style={{ opacity: 0.45, flexShrink: 0 }}>-</span>
                    <span className="truncate" style={{ maxWidth: 160 }}>{chat}</span>
                  </>
                )}
              </>
            ) : (
              <span className="truncate" style={{ maxWidth: 200 }}>{session.label}</span>
            )}
            <span
              className="ml-0.5 opacity-0 group-hover:opacity-60 transition-opacity cursor-pointer"
              style={{ color: COLORS.tabClose, fontSize: 8, lineHeight: '10px' }}
              onClick={(e) => {
                e.stopPropagation()
                onCloseSession(session.id)
              }}
            >
              ✕
            </span>
          </button>
        )
      })}
    </div>
  )
}

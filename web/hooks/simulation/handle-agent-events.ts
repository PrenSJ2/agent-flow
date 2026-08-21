import {
  type Agent,
  type TimelineEntry,
  emptyContextBreakdown,
} from '@/lib/agent-types'
import { COLORS } from '@/lib/colors'
import { AGENT_SPAWN_DISTANCE, ROOT_SPACING } from '@/lib/canvas-constants'
import { pushTimelineBlock, type ProcessEventContext, type MutableEventState } from './process-event'
import { edgeId, asString, asBoolean } from './types'

function countRoots(state: MutableEventState, exclude: string): number {
  let n = 0
  for (const a of state.agents.values()) if (!a.parentId && a.id !== exclude) n++
  return n
}

/**
 * Lay every session root out evenly on one ring.
 *
 * Called whenever a root appears, because the ring's size depends on how many
 * there are: placing each new root at the widest gap and leaving the others
 * alone gave a lumpy ring whose radius was chosen for whatever the count
 * happened to be at the time.
 *
 * The radius is derived from the neighbour spacing rather than fixed --
 * `spacing / (2 sin(pi/n))` is the circle on which n points sit exactly
 * `spacing` apart -- so two sessions sit close together and twelve spread out
 * only as far as they must. A fixed radius does the opposite: needlessly wide
 * for two, cramped for twelve.
 *
 * Children move with their root. Without that the re-layout tears each fleet
 * apart and leaves subagents orbiting where their parent used to be.
 *
 * A pinned root is one the operator dragged somewhere deliberately, so it is
 * left exactly where it was put and simply takes its place in the order.
 */
export function respaceRoots(state: MutableEventState): void {
  const roots = []
  for (const a of state.agents.values()) if (!a.parentId) roots.push(a)
  if (roots.length < 2) return

  // Stable order, so an arriving root does not permute the ones already
  // placed and send every fleet sliding to a new spoke.
  roots.sort((a, b) => (a.spawnTime - b.spawnTime) || a.id.localeCompare(b.id))

  const n = roots.length
  const radius = ROOT_SPACING / (2 * Math.sin(Math.PI / n))

  // Which root each agent belongs to, so children can be carried along.
  const rootOf = new Map<string, string>()
  for (const agent of state.agents.values()) {
    let cursor = agent
    const seen = new Set<string>()
    while (cursor.parentId && !seen.has(cursor.id)) {
      seen.add(cursor.id)
      const parent = state.agents.get(cursor.parentId)
      if (!parent) break
      cursor = parent
    }
    rootOf.set(agent.id, cursor.id)
  }

  const shift = new Map<string, { dx: number; dy: number }>()
  roots.forEach((root, i) => {
    if (root.pinned) return
    const angle = (i / n) * Math.PI * 2
    const nx = Math.cos(angle) * radius
    const ny = Math.sin(angle) * radius
    shift.set(root.id, { dx: nx - root.x, dy: ny - root.y })
    root.x = nx
    root.y = ny
  })

  for (const agent of state.agents.values()) {
    if (!agent.parentId) continue
    const delta = shift.get(rootOf.get(agent.id) ?? '')
    if (!delta) continue
    agent.x += delta.dx
    agent.y += delta.dy
  }
}

export function handleAgentSpawn(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const name = asString(payload.name)
  const parentId = typeof payload.parent === 'string' ? payload.parent : undefined
  const isMain = asBoolean(payload.isMain)
  const task = typeof payload.task === 'string' ? payload.task : undefined
  const model = typeof payload.model === 'string' ? payload.model : undefined
  const runtime = payload.runtime === 'codex' ? 'codex' as const : undefined

  // If the agent already exists (e.g. session resuming after inactivity),
  // reactivate it instead of replacing — preserves accumulated stats.
  const existing = state.agents.get(name)
  if (existing) {
    state.agents.set(name, {
      ...existing,
      state: 'idle',
      ...(task ? { task } : {}),
      ...(model ? { model, tokensMax: ctx.getContextWindowSize(model) } : {}),
      ...(runtime ? { runtime } : {}),
    })
    return
  }

  let x = 0, y = 0
  if (parentId) {
    const parent = state.agents.get(parentId)
    if (parent) {
      // Collect angles of existing siblings so we can avoid spawning too close
      const siblingAngles: number[] = []
      for (const a of state.agents.values()) {
        if (a.parentId === parentId && a.id !== name) {
          siblingAngles.push(Math.atan2(a.y - parent.y, a.x - parent.x))
        }
      }

      let angle: number
      if (siblingAngles.length === 0) {
        // First child: use hash-based angle
        const hash = name.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0)
        angle = (Math.abs(hash) % 360) * (Math.PI / 180)
      } else {
        // Find the largest angular gap between existing siblings and place in the middle
        siblingAngles.sort((a, b) => a - b)
        let bestGap = 0
        let bestMid = 0
        for (let i = 0; i < siblingAngles.length; i++) {
          const next = i + 1 < siblingAngles.length ? siblingAngles[i + 1] : siblingAngles[0] + Math.PI * 2
          const gap = next - siblingAngles[i]
          if (gap > bestGap) {
            bestGap = gap
            bestMid = siblingAngles[i] + gap / 2
          }
        }
        angle = bestMid
      }

      x = parent.x + Math.cos(angle) * AGENT_SPAWN_DISTANCE
      y = parent.y + Math.sin(angle) * AGENT_SPAWN_DISTANCE
    }
  } else {
    // A root: the head of its own session, with no parent to hang off.
    //
    // These used to spawn at exactly (0, 0). Invisible with one session and
    // useless with six -- every orchestrator stacked in one spot. Coincident
    // nodes are also the one case the repulsion force cannot resolve, since
    // there is no direction to separate them along, so they stayed put.
    //
    // The real placement happens in `respaceRoots` below, once this agent is
    // in the map: every root has to move when a new one arrives, or the ring
    // is sized for a count that no longer holds. Starting off-origin only
    // avoids a one-frame flash at the centre.
    const rootCount = countRoots(state, name)
    const angle = rootCount * 2.399963  // golden angle: never repeats a spoke
    x = Math.cos(angle) * ROOT_SPACING
    y = Math.sin(angle) * ROOT_SPACING
  }

  // Derived once from the parent rather than walked at draw time: the parent
  // is already in hand here, and a walk would run for every agent on every
  // frame.
  const depth = parentId ? ((state.agents.get(parentId)?.depth ?? 0) + 1) : 0

  const agent: Agent = {
    id: name, name, state: 'idle',
    parentId: parentId || null,
    depth,
    tokensUsed: 0, tokensMax: ctx.getContextWindowSize(model),
    contextBreakdown: emptyContextBreakdown(),
    toolCalls: 0, timeAlive: 0,
    x, y, vx: 0, vy: 0,
    pinned: false, isMain,
    ...(runtime ? { runtime } : {}),
    ...(model ? { model } : {}),
    task,
    spawnTime: currentTime,
    opacity: 0, scale: 0.3,
    messageBubbles: [],
  }
  state.agents.set(name, agent)

  // A new root changes the ring every other root sits on, so the layout is
  // recomputed here rather than guessed at spawn time.
  if (!parentId) respaceRoots(state)

  if (parentId) {
    state.edges.push({ id: edgeId(parentId, name), from: parentId, to: name, type: 'parent-child', opacity: 0 })
  }

  const timelineEntry: TimelineEntry = {
    id: `timeline-${name}`,
    agentId: name,
    agentName: name,
    startTime: currentTime,
    blocks: [],
  }
  pushTimelineBlock(timelineEntry, currentTime, { type: 'idle', label: 'Starting', color: COLORS.idle }, ctx)
  state.timelineEntries.set(name, timelineEntry)

  state.conversations.set(name, [])

  if (!ctx.skipForceSync) {
    setTimeout(() => ctx.syncForceSimulation(state.agents, state.edges), 0)
  }
}

export function handleAgentComplete(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const name = asString(payload.name)
  const agent = state.agents.get(name)
  if (agent && agent.state !== 'complete') {
    state.agents.set(name, { ...agent, state: 'complete', completeTime: currentTime })

    const entry = state.timelineEntries.get(name)
    if (entry) {
      pushTimelineBlock(entry, currentTime, { type: 'complete', label: 'Done', color: COLORS.complete, endTime: currentTime }, ctx)
      entry.endTime = currentTime
    }

    const agentsToComplete = [name]
    for (const [childId, childAgent] of state.agents) {
      if (childAgent.parentId === name && childAgent.state !== 'complete') {
        state.agents.set(childId, { ...childAgent, state: 'complete', completeTime: currentTime })
        agentsToComplete.push(childId)
        const childEntry = state.timelineEntries.get(childId)
        if (childEntry) {
          pushTimelineBlock(childEntry, currentTime, { type: 'complete', label: 'Done', color: COLORS.complete, endTime: currentTime }, ctx)
          childEntry.endTime = currentTime
        }
      }
    }

    for (const [tcId, tc] of state.toolCalls) {
      if (agentsToComplete.includes(tc.agentId) && tc.state === 'running') {
        state.toolCalls.set(tcId, { ...tc, state: 'complete', completeTime: currentTime })
      }
    }
  }
}

export function handlePermissionRequested(
  payload: Record<string, unknown>,
  currentTime: number,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const agentName = asString(payload.agent, 'Orchestrator')
  const agent = state.agents.get(agentName)
  if (agent && agent.state !== 'complete') {
    state.agents.set(agentName, {
      ...agent,
      state: 'waiting_permission',
    })

    const entry = state.timelineEntries.get(agentName)
    if (entry) {
      pushTimelineBlock(entry, currentTime, { type: 'idle', label: 'Permission', color: COLORS.waiting_permission }, ctx)
    }
  }
}

export function handleAgentIdle(
  payload: Record<string, unknown>,
  state: MutableEventState,
): void {
  const idleName = asString(payload.name)
  const idleAgent = state.agents.get(idleName)
  if (idleAgent && (idleAgent.state === 'tool_calling' || idleAgent.state === 'waiting_permission')) {
    state.agents.set(idleName, { ...idleAgent, state: 'thinking', currentTool: undefined })
  }
}

export function handleModelDetected(
  payload: Record<string, unknown>,
  state: MutableEventState,
  ctx: ProcessEventContext,
): void {
  const agentName = asString(payload.agent)
  const model = asString(payload.model)
  const agent = state.agents.get(agentName)
  if (agent) {
    state.agents.set(agentName, {
      ...agent,
      model,
      tokensMax: ctx.getContextWindowSize(model),
    })
  }
}

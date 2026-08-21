import type { SessionInfo } from './bridge-types'
import type { SimulationEvent } from './agent-types'
import { projectOf } from './tabcolor'

/**
 * Making several sessions' events safe to pour into one simulation.
 *
 * The simulation keys agents by NAME and nothing else — `state.agents.get(name)`
 * — and every session's root agent is called the same thing: the relay spawns
 * it as `orchestrator`, a constant. Merge two sessions without doing anything
 * and their roots become one node that belongs to neither, with both sessions'
 * subagents hanging off it. Same for any subagent type used in two places at
 * once, which for a `code-reviewer` is most of the time.
 *
 * So names are namespaced at the boundary, on the way in, and the simulation is
 * left alone. Four payload fields carry an agent name and all four have to move
 * together or the edges point at nodes that do not exist.
 */

/** The payload fields that hold an agent's name. Miss one and edges dangle. */
const AGENT_NAME_FIELDS = ['name', 'agent', 'parent', 'child'] as const

export const ALL_SESSIONS = '__all__'

/**
 * A short, stable, unique label for a session.
 *
 * The repository alone is not enough: three sessions in `cctv` is a normal
 * afternoon, and they would collide with each other exactly as the raw names
 * do. The session id disambiguates; the repository is what makes the node
 * readable on the canvas. Stability matters more than either — a tag that
 * changed as sessions came and went would rename live nodes mid-run.
 */
export function sessionTag(session: SessionInfo | undefined, sessionId: string): string {
  const short = sessionId.slice(0, 4)
  const repo = session ? projectOf(session.cwd ?? '') : ''
  return repo ? `${repo}#${short}` : short
}

/** `cctv#cc75/code-reviewer` -> `code-reviewer`, for display. */
export function stripTag(name: string): string {
  const cut = name.indexOf('/')
  return cut === -1 ? name : name.slice(cut + 1)
}

/** `cctv#cc75/code-reviewer` -> `cctv#cc75`, or '' when untagged. */
export function tagOf(name: string): string {
  const cut = name.indexOf('/')
  return cut === -1 ? '' : name.slice(0, cut)
}

/**
 * A copy of the event with every agent reference prefixed.
 *
 * Copies rather than mutates: the same event object sits in the per-session
 * buffer that single-session view replays from, and rewriting it in place
 * would leave tagged names behind after switching back to one session.
 */
export function namespaceEvent(event: SimulationEvent, tag: string): SimulationEvent {
  const payload = event.payload
  if (!payload || typeof payload !== 'object') return event

  let next: Record<string, unknown> | null = null
  for (const field of AGENT_NAME_FIELDS) {
    const value = (payload as Record<string, unknown>)[field]
    if (typeof value !== 'string' || !value) continue
    next = next ?? { ...(payload as Record<string, unknown>) }
    next[field] = `${tag}/${value}`
  }
  return next ? { ...event, payload: next } : event
}

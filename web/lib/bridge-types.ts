/**
 * Shared types for the VS Code bridge protocol.
 *
 * These types mirror extension/src/protocol.ts and are kept separate
 * to avoid cross-project imports. When updating these, also update
 * the canonical definitions in extension/src/protocol.ts.
 */

export interface AgentEvent {
  time: number
  type: string
  payload: Record<string, unknown>
  sessionId?: string
}

export interface SessionInfo {
  id: string
  label: string
  /**
   * Working directory the session runs in, when the relay supplies it.
   *
   * Optional because the relay does not send it today, though the hook payload
   * carries it. The tab colour falls back to hashing `label`, so plumbing this
   * through later is purely additive and simply makes the match exact.
   */
  cwd?: string
  status: 'active' | 'completed'
  startTime: number
  lastActivityTime: number
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'watching'

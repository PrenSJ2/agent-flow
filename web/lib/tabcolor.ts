/**
 * The same tab colours the terminal uses.
 *
 * Ported from `tabcolor.zsh` (PrenSJ2/iterm2-setup), which colours iTerm2 tabs
 * by git project. Keeping the algorithm identical is the whole point: a
 * session for the `tare` repo gets the same colour here as its terminal tab,
 * so the two read as one workspace rather than two unrelated tools.
 *
 * Three rules, all of them load-bearing for that match:
 *
 *  - the project is the **git repo basename**, not the full path
 *  - the colour is FNV-1a(project) modulo the palette length
 *  - `~/.config/tabcolor/overrides.conf` wins over the hash
 *
 * The override file cannot be read from the browser, so the server hands it
 * over; see `resolveTabColor`.
 */

// Order matters — the hash indexes into this array, so reordering it silently
// recolours every unpinned project.
export const TABCOLOR_NAMES = [
  'crimson', 'rust', 'amber', 'olive', 'green', 'sea', 'teal', 'cyan',
  'azure', 'indigo', 'violet', 'magenta', 'rose', 'slate',
  'maroon', 'coral', 'sand', 'forest', 'mint', 'sky', 'navy', 'lilac', 'plum', 'steel',
] as const

export const TABCOLOR_HEX: Record<string, string> = {
  crimson: '#C0392B', rust: '#A8552A', amber: '#D19000', olive: '#7F8C2E',
  green: '#3A8F45', sea: '#23896B', teal: '#1B8A94', cyan: '#2596BE',
  azure: '#2C6FD1', indigo: '#4E52B0', violet: '#7E4FC0', magenta: '#A93F96',
  rose: '#CE4C74', slate: '#5F6C7B', maroon: '#7E2B33', coral: '#E2725B',
  sand: '#D9B382', forest: '#1F6B3A', mint: '#5CB88A', sky: '#6FB4E8',
  navy: '#29457E', lilac: '#B08FE0', plum: '#6E2C6B', steel: '#8A9BA8',
}

/**
 * FNV-1a, 32-bit, matching the zsh implementation exactly.
 *
 * `>>> 0` after each step keeps the value unsigned; without it JavaScript's
 * signed 32-bit bitwise result diverges from zsh's `& 0xFFFFFFFF` and the
 * colours stop matching the terminal — which is the one thing this must not do.
 */
export function fnv1a(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

/** The project name for a working directory: the git repo basename. */
export function projectOf(cwd: string | undefined | null): string {
  if (!cwd) return ''
  const parts = cwd.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || ''
}

/**
 * The colour for a project. `overrides` maps project (or absolute path, for
 * directories that are not repos) to a palette name, exactly as the conf file
 * does.
 */
export function resolveTabColor(
  project: string,
  cwd?: string | null,
  overrides: Record<string, string> = {},
): string {
  const pinned = overrides[project] ?? (cwd ? overrides[cwd] : undefined)
  if (pinned && TABCOLOR_HEX[pinned]) return TABCOLOR_HEX[pinned]
  if (!project) return TABCOLOR_HEX.steel
  const name = TABCOLOR_NAMES[fnv1a(project) % TABCOLOR_NAMES.length]
  return TABCOLOR_HEX[name]
}

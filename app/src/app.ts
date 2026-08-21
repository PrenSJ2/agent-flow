/**
 * tare console — the local UI. Forked from Agent Flow
 * (github.com/patoles/agent-flow, Apache-2.0); renamed because its
 * TRADEMARK.md withholds the name from redistribution.
 *
 * Starts a local server that:
 *   1. Receives events from agent hooks
 *   2. Watches JSONL transcript files for active sessions
 *   3. Serves the visualizer UI and streams events via SSE
 *   4. Opens the browser automatically
 *
 * Usage: tare console [--port <number>] [--no-open]
 */
import { parseArgs } from './args'
import { ensureSetup } from '../../scripts/setup'
import { startServer } from './server'

const args = parseArgs(process.argv.slice(2))

console.log('tare console\n')

// Ensure hooks are configured
ensureSetup()

// Start the server
startServer({
  port: args.port,
  openBrowser: args.open,
  workspace: process.cwd(),
  verbose: args.verbose,
})

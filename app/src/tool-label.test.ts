import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toolLabel, parseMcpToolName, summarizeInput } from '../../extension/src/tool-summarizer'

/**
 * Every input below is a real shape taken from this machine's transcripts:
 * 91 `Skill` calls and several hundred `mcp__*` calls, all of which the
 * diagram used to render as the bare tool name.
 */

test('a skill call is named for the skill, not for the Skill tool', () => {
  assert.equal(
    toolLabel('Skill', { skill: 'superpowers:brainstorming' }),
    'brainstorming',
  )
  // The plugin is what the raw name threw away, so it goes in the args.
  assert.match(
    summarizeInput('Skill', { skill: 'superpowers:brainstorming' }),
    /superpowers plugin/,
  )
})

test('an unqualified skill keeps its own name', () => {
  assert.equal(toolLabel('Skill', { skill: 'hyperframes' }), 'hyperframes')
})

test('a skill call with no skill falls back rather than showing nothing', () => {
  assert.equal(toolLabel('Skill', {}), 'Skill')
})

test('an MCP tool is split into its server and its tool', () => {
  assert.deepEqual(
    parseMcpToolName('mcp__playwright__browser_click'),
    { server: 'playwright', tool: 'browser_click' },
  )
  assert.equal(toolLabel('mcp__playwright__browser_click'), 'browser_click')
  // "browser_click" alone does not say whose browser.
  assert.match(summarizeInput('mcp__playwright__browser_click', { ref: 'e3' }), /^playwright/)
})

test('an MCP server whose own name contains underscores still splits correctly', () => {
  assert.deepEqual(
    parseMcpToolName('mcp__claude_ai_Gmail__authenticate'),
    { server: 'claude_ai_Gmail', tool: 'authenticate' },
  )
})

test('a name that merely starts with mcp is not treated as one', () => {
  assert.equal(parseMcpToolName('mcp__nope'), null)
  assert.equal(toolLabel('mcp__nope'), 'mcp__nope')
})

test('ordinary tools are left exactly as they were', () => {
  // These drive file-attention counters by name, so relabelling them would
  // silently break the heatmap.
  for (const name of ['Bash', 'Read', 'Edit', 'Write', 'Agent', 'Task']) {
    assert.equal(toolLabel(name, { file_path: '/x/y.ts' }), name)
  }
})

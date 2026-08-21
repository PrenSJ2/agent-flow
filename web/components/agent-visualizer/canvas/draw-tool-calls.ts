import { ToolCallNode } from '@/lib/agent-types'
import { COLORS, withAlpha } from '@/lib/colors'
import { TOOL_MAX_CARD_W, TOOL_DRAW } from '@/lib/canvas-constants'
import { truncateText } from './draw-misc'
import { measureTextCached } from './render-cache'

export function drawToolCalls(
  ctx: CanvasRenderingContext2D,
  toolCalls: Map<string, ToolCallNode>,
  time: number,
  selectedToolCallId?: string | null,
) {
  for (const [id, tool] of toolCalls) {
    const isRunning = tool.state === 'running'
    const isError = tool.state === 'error'
    const pulse = isRunning ? Math.sin(time * 4) * 0.2 + 0.8 : isError ? Math.sin(time * 6) * 0.15 + 0.85 : 0.5

    ctx.save()
    ctx.globalAlpha = tool.opacity

    ctx.font = `${TOOL_DRAW.fontSize}px monospace`
    const toolLabel = `${tool.toolName}: ${tool.args}`
    const label = truncateText(ctx, toolLabel, TOOL_MAX_CARD_W - 12)
    const textWidth = Math.min(measureTextCached(ctx, label) + 12, TOOL_MAX_CARD_W)
    const cardW = Math.max(60, textWidth)
    const cardH = (!isRunning && (tool.tokenCost || isError)) ? TOOL_DRAW.expandedHeight : TOOL_DRAW.collapsedHeight
    const cardX = tool.x - cardW / 2
    const cardY = tool.y - cardH / 2

    const isSelected = id === selectedToolCallId

    // Error glow
    if (isError) {
      ctx.shadowColor = COLORS.error
      ctx.shadowBlur = TOOL_DRAW.errorGlowBase + Math.sin(time * 6) * TOOL_DRAW.errorGlowPulse
    }

    // A skill or a plugin is a capability being reached for, not a command
    // being run, and drawing all three identically threw that away: an agent
    // that invoked `brainstorming` looked exactly like one that ran `ls`.
    // They keep the card shape -- they are still calls with a result -- and
    // are marked out by hue and a heavier border.
    const kindColor = tool.kind === 'skill' ? COLORS.dispatch
      : tool.kind === 'plugin' ? COLORS.contextReasoning
      : null

    ctx.beginPath()
    ctx.roundRect(cardX, cardY, cardW, cardH, TOOL_DRAW.borderRadius)
    ctx.fillStyle = isError
      ? withAlpha(COLORS.toolCardErrorBase, 0.8 * pulse)
      : isSelected ? withAlpha(COLORS.toolCardSelectedBase, 0.15 * pulse) : withAlpha(COLORS.toolCardBase, 0.7 * pulse)
    ctx.fill()
    ctx.strokeStyle = isError
      ? COLORS.error + '90'
      : isSelected ? COLORS.holoBase + 'aa'
      : kindColor ? kindColor + 'cc'
      : isRunning ? COLORS.tool + '60' : COLORS.return + '40'
    ctx.lineWidth = isError ? 2 : isSelected ? 1.5 : kindColor ? 1.5 : 1
    ctx.stroke()

    // A tick down the leading edge, so the kind survives at the zoom levels
    // where a border colour stops being legible.
    if (kindColor && !isError) {
      ctx.beginPath()
      ctx.moveTo(cardX + 1.5, cardY + 3)
      ctx.lineTo(cardX + 1.5, cardY + cardH - 3)
      ctx.strokeStyle = kindColor
      ctx.lineWidth = 2.5
      ctx.stroke()
    }

    ctx.shadowBlur = 0

    // Spinning ring
    if (isRunning) {
      ctx.beginPath()
      ctx.arc(tool.x, tool.y, Math.max(cardW, cardH) / 2 + TOOL_DRAW.spinRingPadding, time * TOOL_DRAW.spinSpeed, time * TOOL_DRAW.spinSpeed + TOOL_DRAW.spinArc)
      ctx.strokeStyle = COLORS.tool + '50'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Crack lines for errors
    if (isError) {
      ctx.save()
      ctx.strokeStyle = COLORS.error + '40'
      ctx.lineWidth = 0.8
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5
        ctx.beginPath()
        ctx.moveTo(tool.x, tool.y)
        ctx.lineTo(tool.x + Math.cos(a) * cardW * 0.5, tool.y + Math.sin(a) * cardH * 0.6)
        ctx.stroke()
      }
      ctx.restore()
    }

    const truncatedLabel = truncateText(ctx, toolLabel, cardW - 8)

    ctx.font = `${TOOL_DRAW.fontSize}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (isRunning) {
      ctx.fillStyle = COLORS.tool
      ctx.fillText(truncatedLabel, tool.x, tool.y)
    } else if (isError) {
      ctx.fillStyle = COLORS.error
      ctx.fillText(truncateText(ctx, `${tool.toolName}: FAILED`, cardW - 8), tool.x, tool.y - TOOL_DRAW.twoLineOffset)
      ctx.font = `${TOOL_DRAW.errorFontSize}px monospace`
      ctx.fillStyle = COLORS.error + 'aa'
      ctx.fillText(truncateText(ctx, tool.errorMessage || tool.result || '', cardW - 8), tool.x, tool.y + TOOL_DRAW.twoLineOffset + 2)
    } else {
      // Completed card: show action + file path (most useful info at a glance)
      ctx.fillStyle = COLORS.return
      ctx.fillText(truncatedLabel, tool.x, tool.y - TOOL_DRAW.twoLineOffset)
      if (tool.tokenCost) {
        // Token cost as dim text below
        ctx.fillStyle = COLORS.tool + '90'
        ctx.font = `${TOOL_DRAW.tokenFontSize}px monospace`
        ctx.fillText(`${tool.tokenCost} tok`, tool.x, tool.y + TOOL_DRAW.twoLineOffset + 2)
      }
    }

    ctx.restore()
  }
}

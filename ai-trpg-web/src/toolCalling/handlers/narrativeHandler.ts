import type { ToolHandler, ToolHandlerContext, ToolHandlerResult } from '../types'

const TOOL_NAMES = ['transition_scene', 'grant_clue'] as const

export const narrativeHandler: ToolHandler = {
  toolNames: [...TOOL_NAMES],
  handle(toolName: string, args: Record<string, unknown>, context: ToolHandlerContext): ToolHandlerResult {
    const displayMessages: ToolHandlerResult['displayMessages'] = []
    const id = context.generateId()
    const ts = Date.now()

    if (toolName === 'transition_scene') {
      const sceneName = String(args.sceneName ?? '')
      if (sceneName) {
        context.transitionToScene(sceneName)
        displayMessages.push({ id, timestamp: ts, role: 'system', content: `场景切换: ${sceneName}` })
        return { content: `Scene transitioned to: ${sceneName}`, displayMessages }
      }
      return { content: 'error: sceneName required', displayMessages: [] }
    }

    if (toolName === 'grant_clue') {
      const description = String(args.description ?? '')
      if (description) {
        context.addClue(description)
        displayMessages.push({ id, timestamp: ts, role: 'system', content: `获得线索: ${description}` })
        return { content: `Clue granted: ${description}`, displayMessages }
      }
      return { content: 'error: description required', displayMessages: [] }
    }

    return { content: 'error: unknown tool', displayMessages: [] }
  },
}

import type { TRPGScript, RAGChunk } from '../types/script'

export function parseScript(content: string): TRPGScript {
  const data = JSON.parse(content) as TRPGScript
  if (!data.meta || !data.scenes) {
    throw new Error('Invalid script: missing meta or scenes')
  }
  if (data.meta.ruleSystem !== 'coc' && data.meta.ruleSystem !== 'dnd') {
    throw new Error('Invalid script: ruleSystem must be coc or dnd')
  }
  return data
}

export function scriptToChunks(script: TRPGScript, scriptId: string): RAGChunk[] {
  const chunks: RAGChunk[] = []

  for (const scene of script.scenes) {
    const parts: string[] = [`场景: ${scene.name}`, scene.description || '']
    if (scene.transitionCondition) {
      parts.push(`过渡条件: ${scene.transitionCondition}`)
    }
    chunks.push({
      id: `scene-${scriptId}-${scene.id}`,
      content: parts.filter(Boolean).join('\n'),
      type: 'scene',
      metadata: { scriptId, sceneId: scene.id },
    })
  }

  if (script.npcs) {
    for (const npc of script.npcs) {
      const parts: string[] = [`NPC: ${npc.name}`, npc.description || '', npc.dialogueStyle ? `台词风格: ${npc.dialogueStyle}` : '']
      chunks.push({
        id: `npc-${scriptId}-${npc.id}`,
        content: parts.filter(Boolean).join('\n'),
        type: 'npc',
        metadata: { scriptId, npcId: npc.id },
      })
    }
  }

  if (script.clues) {
    for (const clue of script.clues) {
      const parts: string[] = [clue.description || '', clue.obtainCondition ? `获得条件: ${clue.obtainCondition}` : '']
      chunks.push({
        id: `clue-${scriptId}-${clue.id}`,
        content: parts.filter(Boolean).join('\n'),
        type: 'clue',
        metadata: { scriptId, clueId: clue.id },
      })
    }
  }

  return chunks
}

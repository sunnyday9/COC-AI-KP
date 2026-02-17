export type RuleSystem = 'coc' | 'dnd'

export interface ScriptMeta {
  title: string
  author?: string
  ruleSystem: RuleSystem
  version?: string
}

export interface ScriptScene {
  id: string
  name: string
  description?: string
  npcIds?: string[]
  clueIds?: string[]
  encounterIds?: string[]
  transitionCondition?: string
}

export interface ScriptNpc {
  id: string
  name: string
  description?: string
  dialogueStyle?: string
}

export interface ScriptClue {
  id: string
  description?: string
  obtainCondition?: string
}

export interface ScriptCheck {
  id: string
  skill: string
  difficulty?: string
  dc?: number
  successSceneId?: string
  failSceneId?: string
}

export interface COCScript {
  meta: ScriptMeta
  scenes: ScriptScene[]
  npcs?: ScriptNpc[]
  clues?: ScriptClue[]
  checks?: ScriptCheck[]
}

export interface DNDScript {
  meta: ScriptMeta
  scenes: ScriptScene[]
  npcs?: ScriptNpc[]
  clues?: ScriptClue[]
  encounters?: unknown[]
  checks?: ScriptCheck[]
}

export type TRPGScript = COCScript | DNDScript

export interface RAGChunk {
  id: string
  content: string
  type: 'scene' | 'npc' | 'clue' | 'check' | 'rule'
  metadata: {
    scriptId?: string
    sceneId?: string
    npcId?: string
    clueId?: string
    checkId?: string
  }
}

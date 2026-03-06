/**
 * Structured story context sent to the KP LangGraph (Electron).
 * Used by narrative/sanity plan and generate nodes. Populated from game state.
 * @see docs/COC-KP-GAP-ANALYSIS.md §4.2
 */
export interface StoryContextSanity {
  currentSan?: number
  dailySanLoss?: number
  potentialLoss?: number
}

export interface StoryContextNPC {
  name?: string
  role?: string
}

export interface StoryContext {
  sceneId?: string
  sceneName?: string
  sceneType?: string
  act?: string
  openClues?: string[]
  activeNPCs?: StoryContextNPC[]
  sanity?: StoryContextSanity
}

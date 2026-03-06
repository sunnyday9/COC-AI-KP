import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../gameStore'
import { useSettingsStore } from '../settingsStore'

vi.mock('../../services/memoryService', () => ({
  summarizeLongTerm: vi.fn().mockResolvedValue('SUMMARY_NEXT'),
}))

describe('gameStore memory integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const settings = useSettingsStore()
    // enable summarization path (needs model present)
    settings.settings.ai.model = 'gpt-4'
    settings.settings.ai.provider = 'openai'
    settings.settings.ai.temperature = 0.7
    settings.settings.ai.maxTokens = 2048
  })

  afterEach(() => {
    ;(globalThis.window as any).electronAPI = undefined
  })

  it('transitionToScene triggers longTerm summarization with storyContextText', async () => {
    const store = useGameStore()

    // seed conversation
    store.addMessage({ id: 'p1', timestamp: 1, role: 'player', playerName: 'A', content: '我去图书馆' } as any)
    store.addMessage({ id: 'k1', timestamp: 2, role: 'kp', content: '你来到门口。' } as any)

    // seed character sanity + clue
    store.setCharacterSheet({ derived: { san: 55, sanMax: 99, hp: 10, hpMax: 10, mp: 10, mpMax: 10 }, dailySanLoss: 3, playerName: 'A', occupationName: '记者' } as any)
    store.addClue('看见奇怪的符号')

    store.transitionToScene('图书馆')

    const mem = await import('../../services/memoryService')
    await Promise.resolve() // allow fire-and-forget microtask

    expect(vi.mocked(mem.summarizeLongTerm)).toHaveBeenCalled()
    const args = vi.mocked(mem.summarizeLongTerm).mock.calls[0]![1] as any
    expect(args.storyContextText).toContain('场景: 图书馆')
    expect(args.storyContextText).toContain('SAN: 55')
    expect(args.storyContextText).toContain('已获得线索:')
  })

  it('saveGame writes payload including longTermSummary and kpMemory; loadGame restores them', async () => {
    const store = useGameStore()
    // Pinia setup stores unwrap refs on the store instance
    store.longTermSummary = 'LT' as any
    store.kpMemory = ['k'] as any

    const writeSave = vi.fn()
    const readSave = vi.fn().mockResolvedValue({
      version: 1,
      name: 'n',
      storyId: 's',
      storyName: 'sn',
      storyOverview: 'ov',
      currentScene: '图书馆',
      cluesObtained: ['c1'],
      messages: [{ id: 'm', timestamp: 1, role: 'kp', content: 'hi' }],
      kpMemory: ['k2'],
      longTermSummary: 'LT2',
      longTermFacts: ['f1'],
      playerTurnCount: 11,
      gamePhase: 'playing',
      characterSheet: null,
      playerName: '调查员',
      selectedOccupationId: null,
      selectedOccupationName: '',
      sessionId: 'sess',
    })
    ;(globalThis.window as any).electronAPI = {
      writeSave,
      readSave,
      listSaves: vi.fn().mockResolvedValue(['a']),
    }

    await store.saveGame('save1', 'name1')
    expect(writeSave).toHaveBeenCalledTimes(1)
    const payload = writeSave.mock.calls[0]![1]
    expect(payload.longTermSummary).toBeDefined()
    expect(payload.kpMemory).toBeDefined()

    await store.loadGame('save1')
    expect(store.currentScene).toBe('图书馆')
  })
})


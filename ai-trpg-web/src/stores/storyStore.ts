import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fileToChunks } from '../services/storyService'
import { indexScript } from '../services/ragService'
import type { TRPGScript } from '../types/script'
import { chat, isStreamResponse, consumeStream } from '../services/ai'
import { useSettingsStore } from './settingsStore'

export interface StoryFile {
  name: string
  path: string
}

export const useStoryStore = defineStore('story', () => {
  const storyFiles = ref<StoryFile[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function loadStories() {
    const api = (window as { electronAPI?: { listStories: () => Promise<StoryFile[]> } }).electronAPI
    if (!api?.listStories) return
    try {
      isLoading.value = true
      error.value = null
      storyFiles.value = await api.listStories()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load stories'
    } finally {
      isLoading.value = false
    }
  }

  async function importStory() {
    const api = (window as { electronAPI?: { importStory: () => Promise<{ ok: boolean; path?: string; name?: string; error?: string }> } }).electronAPI
    if (!api?.importStory) return { ok: false, error: 'No Electron' }
    const result = await api.importStory()
    if (result?.ok) await loadStories()
    return result
  }

  async function deleteStory(path: string) {
    const api = (window as { electronAPI?: { deleteStory: (path: string) => Promise<void> } }).electronAPI
    if (!api?.deleteStory) return
    await api.deleteStory(path)
    await loadStories()
  }

  function pathToStoryId(path: string): string {
    const name = path.split(/[/\\]/).pop() || path
    // 去掉扩展名（支持 txt/md/json/pdf 等）
    return name.replace(/\.[^./\\]+$/i, '') || 'story'
  }

  async function indexStoryForRag(path: string): Promise<{ ok: boolean; error?: string; indexed?: number }> {
    const api = (window as { electronAPI?: { readStory: (path: string) => Promise<string> } }).electronAPI
    if (!api?.readStory) return { ok: false, error: 'No Electron' }
    try {
      const content = await api.readStory(path)
      const storyId = pathToStoryId(path)
      const filename = path.split(/[/\\]/).pop() || 'story.txt'
      const chunks = fileToChunks(content, storyId, filename)
      const result = await indexScript(storyId, chunks)
      return result.ok ? { ok: true, indexed: result.indexed } : { ok: false, error: 'Index failed' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  async function indexAllStories(): Promise<{ ok: boolean; total: number; errors: string[] }> {
    await loadStories()
    const errors: string[] = []
    let total = 0
    for (const story of storyFiles.value) {
      const result = await indexStoryForRag(story.path)
      if (result.ok) {
        total += result.indexed || 0
      } else {
        errors.push(`${story.name}: ${result.error || 'Unknown error'}`)
      }
    }
    return { ok: errors.length === 0, total, errors }
  }

  /**
   * 使用当前 AI Provider 将故事文件（通常是 PDF 提取的长文本）结构化为 TRPGScript JSON，
   * 并保存到 scripts 目录，供「剧本管理」和现有 RAG 流程使用。
   */
  async function generateScriptFromStory(path: string): Promise<{ ok: boolean; error?: string; scriptPath?: string }> {
    const api = (window as { electronAPI?: { readStory: (p: string) => Promise<string>; saveScriptToLibrary: (filename: string, content: string) => Promise<{ ok: boolean; path: string; name: string }> } }).electronAPI
    if (!api?.readStory || !api?.saveScriptToLibrary) return { ok: false, error: 'No Electron API' }
    try {
      const raw = await api.readStory(path)
      const storyId = pathToStoryId(path)

      // 构建提示词（system + user），要求严格输出 COCScript JSON
      const systemPrompt = [
        '你是一个严谨的 COC（克苏鲁的呼唤）剧本结构化助手。',
        '任务：从给定的剧本文本中抽取一个完整的 COC 剧本 JSON。',
        'JSON 必须 EXACTLY 符合下列结构（字段名与大小写必须严格一致）：',
        '',
        'interface ScriptScene {',
        '  id: string;              // 例如 "scene_001"',
        '  name: string;            // 场景名称',
        '  description?: string;    // 场景详细描述，给 KP 朗读',
        '  npcIds?: string[];       // 出现在该场景的 NPC id 列表',
        '  clueIds?: string[];      // 在该场景可以获得的线索 id 列表',
        '  transitionCondition?: string; // 该场景结束/切换到其他场景的条件，用自然语言概述',
        '}',
        '',
        'interface ScriptNpc {',
        '  id: string;           // 例如 "npc_001"',
        '  name: string;',
        '  description?: string; // 外貌、背景、动机',
        '  dialogueStyle?: string; // 说话风格、口吻',
        '}',
        '',
        'interface ScriptClue {',
        '  id: string;             // 例如 "clue_001"',
        '  description?: string;   // 线索内容',
        '  obtainCondition?: string; // 如何获得这条线索（动作 + 检定）',
        '}',
        '',
        'interface ScriptCheck {',
        '  id: string;             // 例如 "check_001"',
        '  skill: string;          // 技能名称，如 "侦查"、"图书馆使用"',
        '  difficulty?: string;    // "普通" | "困难" | "极难" 等',
        '  dc?: number;            // 目标值（若文中给出大致数值）',
        '  successSceneId?: string;// 成功时跳转的场景 id',
        '  failSceneId?: string;   // 失败时跳转的场景 id',
        '}',
        '',
        'interface COCScript {',
        '  meta: {',
        '    title: string;',
        '    author?: string;',
        '    ruleSystem: "coc";',
        '    version?: string;',
        '  };',
        '  scenes: ScriptScene[];',
        '  npcs?: ScriptNpc[];',
        '  clues?: ScriptClue[];',
        '  checks?: ScriptCheck[];',
        '}',
        '',
        '输出规则：',
        '1. 只输出一个 COCScript 对象的 JSON 字符串，不要任何解释、不要代码块标记、不要前后多余文本。',
        '2. meta.title 必须存在；meta.ruleSystem 必须是 "coc"（如果原文没写就设为 "coc"）。',
        '3. scenes 必须是非空数组，按剧情实际顺序排列。',
        '4. 所有引用到的 id（sceneId / npcId / clueId / checkId）必须在对应数组中定义，不能引用不存在的 id。',
      ].join('\n')

      // 使用 PDF 提取的完整原文，不截断，确保剧本能完整生成
      const userPrompt = [
        '请根据以下 COC 剧本文本，抽取出完整的 COCScript JSON 结构。',
        '',
        '【剧本文本开始】',
        raw,
        '【剧本文本结束】',
      ].join('\n')

      const settingsStore = useSettingsStore()
      // Pinia 会自动解包 ref/computed；不要使用 .value
      const aiConfig = settingsStore.settings.ai

      // 剧本 JSON 可能很长，需要更大的输出 token 上限（默认 2048 容易截断）
      const SCRIPT_MAX_TOKENS = 32768
      const result = await chat(aiConfig, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        maxTokens: SCRIPT_MAX_TOKENS,
      })

      const rawContent = isStreamResponse(result) ? await consumeStream(result) : (result.content ?? '')
      let text = rawContent.trim()
      // 去掉可能的 ```json 包裹
      if (text.startsWith('```')) {
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
        text = text.replace(/```$/, '').trim()
      }

      const parsed = JSON.parse(text) as TRPGScript
      if (!parsed?.meta?.title || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
        throw new Error('生成的 JSON 缺少 meta.title 或 scenes')
      }
      // 确保 ruleSystem 为 coc
      parsed.meta.ruleSystem = 'coc'

      // 生成的剧本文件名：与源文件同名，仅扩展名改为 .json
      const originalName = path.split(/[/\\]/).pop() || `${storyId}.json`
      const filename = originalName.replace(/\.[^./\\]+$/i, '') + '.json'
      const saveResult = await api.saveScriptToLibrary(filename, JSON.stringify(parsed, null, 2))
      if (!saveResult?.ok) {
        return { ok: false, error: '保存剧本失败' }
      }
      return { ok: true, scriptPath: saveResult.path }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return {
    storyFiles,
    isLoading,
    error,
    loadStories,
    importStory,
    deleteStory,
    indexStoryForRag,
    indexAllStories,
    generateScriptFromStory,
  }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fileToChunks } from '../services/storyService'
import { indexStory } from '../services/ragService'
import { pathToId } from '../utils/pathUtils'

export interface StoryFile {
  name: string
  path: string
}

export const useStoryStore = defineStore('story', () => {
  const storyFiles = ref<StoryFile[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function loadStories() {
    const api = window.electronAPI
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
    const api = window.electronAPI
    if (!api?.importStory) return { ok: false, error: 'No Electron' }
    const result = await api.importStory()
    if (result?.ok) await loadStories()
    return result
  }

  async function deleteStory(path: string) {
    const api = window.electronAPI
    if (!api?.deleteStory) return
    await api.deleteStory(path)
    await loadStories()
  }

  const pathToStoryId = (path: string) => pathToId(path)

  async function indexStoryForRag(path: string): Promise<{ ok: boolean; error?: string; indexed?: number }> {
    const api = window.electronAPI
    if (!api?.readStory) return { ok: false, error: 'No Electron' }
    try {
      const content = await (api.readStoryForRag ?? api.readStory)(path)
      const storyId = pathToStoryId(path)
      const filename = path.split(/[/\\]/).pop() || 'story.txt'
      const displayName = filename.replace(/\.[^./\\]+$/i, '')
      const isMarkdown = /\.(md|markdown)$/i.test(filename)
      const chunks = fileToChunks(content, storyId, filename, {
        useStructuredMarkdown: isMarkdown,
      })
      const result = await indexStory(storyId, chunks, { name: displayName })
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

  return {
    storyFiles,
    isLoading,
    error,
    loadStories,
    importStory,
    deleteStory,
    indexStoryForRag,
    indexAllStories,
  }
})

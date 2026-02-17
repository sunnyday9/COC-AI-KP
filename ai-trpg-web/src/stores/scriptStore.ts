import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TRPGScript } from '../types/script'
import { scriptToChunks } from '../services/scriptService'
import { indexScript } from '../services/ragService'

export interface ScriptFile {
  name: string
  path: string
}

export const useScriptStore = defineStore('script', () => {
  const scriptFiles = ref<ScriptFile[]>([])
  const currentScript = ref<TRPGScript | null>(null)
  const currentScriptPath = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function loadScripts() {
    const api = window.electronAPI
    if (!api?.listScripts) return
    try {
      isLoading.value = true
      error.value = null
      scriptFiles.value = await api.listScripts()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load scripts'
    } finally {
      isLoading.value = false
    }
  }

  async function loadScript(path: string) {
    const api = window.electronAPI
    if (!api?.readScript) return
    try {
      isLoading.value = true
      error.value = null
      const content = await api.readScript(path)
      const data = JSON.parse(content) as TRPGScript
      currentScript.value = data
      currentScriptPath.value = path
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load script'
      currentScript.value = null
      currentScriptPath.value = null
    } finally {
      isLoading.value = false
    }
  }

  async function importScript() {
    const api = window.electronAPI
    if (!api?.importScript) return { ok: false }
    const result = await api.importScript()
    if (result?.ok) await loadScripts()
    return result
  }

  async function deleteScript(path: string) {
    const api = window.electronAPI
    if (!api?.deleteScript) return
    await api.deleteScript(path)
    if (currentScriptPath.value === path) {
      currentScript.value = null
      currentScriptPath.value = null
    }
    await loadScripts()
  }

  function clearCurrent() {
    currentScript.value = null
    currentScriptPath.value = null
  }

  function pathToScriptId(path: string): string {
    const name = path.split(/[/\\]/).pop() || path
    return name.replace(/\.(json|jsonc)$/i, '') || 'script'
  }

  async function indexForRag(path: string): Promise<{ ok: boolean; error?: string }> {
    const api = window.electronAPI
    if (!api?.readScript) return { ok: false, error: 'No Electron' }
    try {
      const content = await api.readScript(path)
      const script = JSON.parse(content) as TRPGScript
      const scriptId = pathToScriptId(path)
      const chunks = scriptToChunks(script, scriptId)
      const result = await indexScript(scriptId, chunks)
      return result.ok ? { ok: true } : { ok: false, error: 'Index failed' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return {
    scriptFiles,
    currentScript,
    currentScriptPath,
    pathToScriptId,
    isLoading,
    error,
    loadScripts,
    loadScript,
    importScript,
    deleteScript,
    clearCurrent,
    indexForRag,
  }
})

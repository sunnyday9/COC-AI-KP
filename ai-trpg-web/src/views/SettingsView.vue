<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../stores/settingsStore'
import { useStoryStore } from '../stores/storyStore'
import { useScriptStore } from '../stores/scriptStore'
import { chat, isStreamResponse, consumeStream } from '../services/ai'
import { getModelOptions } from '../services/ai/modelListService'

const settingsStore = useSettingsStore()
const storyStore = useStoryStore()
const scriptStore = useScriptStore()
const { settings } = storeToRefs(settingsStore)
const { storyFiles, isLoading: storiesLoading } = storeToRefs(storyStore)

const testStatus = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')
const testError = ref('')
const modelList = ref<{ value: string; label: string }[]>([])
const modelListLoading = ref(false)
const modelListError = ref('')

const providerOptions = [
  { value: 'vllm', label: 'vLLM (本地)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
] as const

const needsBaseUrl = computed(() => ['vllm'].includes(settings.value.ai.provider))
const needsApiKey = computed(() =>
  ['openai', 'openrouter'].includes(settings.value.ai.provider)
)

const displayModelList = computed(() => {
  const list = modelList.value
  const current = settings.value.ai.model
  if (current && !list.some((m) => m.value === current)) {
    return [...list, { value: current, label: `${current} (自定义)` }]
  }
  return list
})

async function loadModelList() {
  modelListLoading.value = true
  modelListError.value = ''
  try {
    const opts = await getModelOptions(settings.value.ai.provider, {
      apiKey: settings.value.ai.apiKey,
      baseUrl: settings.value.ai.baseUrl,
    })
    modelList.value = opts
    const first = opts[0]
    if (first && !opts.some((m) => m.value === settings.value.ai.model)) {
      settings.value.ai.model = first.value
    }
  } catch (e) {
    modelListError.value = e instanceof Error ? e.message : '获取模型列表失败'
    modelList.value = []
  } finally {
    modelListLoading.value = false
  }
}

watch(
  () => settings.value.ai.provider,
  () => {
    settings.value.ai.model = ''
    loadModelList()
  }
)

onMounted(() => {
  loadModelList()
  storyStore.loadStories()
})

async function handleSave() {
  await settingsStore.save()
  alert('设置已保存')
}

async function handleTest() {
  testStatus.value = 'loading'
  testError.value = ''
  try {
    const result = await chat(settings.value.ai, {
      messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
      stream: false,
    })
    const content = isStreamResponse(result) ? await consumeStream(result) : result.content
    testStatus.value = content?.trim() ? 'ok' : 'error'
    if (!content?.trim()) testError.value = 'Empty response'
  } catch (e) {
    testStatus.value = 'error'
    testError.value = e instanceof Error ? e.message : String(e)
  }
}

const indexStatus = ref<{ [path: string]: 'idle' | 'loading' | 'ok' | 'error' }>({})
const indexError = ref<{ [path: string]: string }>({})

async function handleIndexStory(path: string) {
  indexStatus.value[path] = 'loading'
  indexError.value[path] = ''
  try {
    const result = await storyStore.indexStoryForRag(path)
    if (result.ok) {
      indexStatus.value[path] = 'ok'
      alert(`索引成功！共 ${result.indexed || 0} 个块`)
    } else {
      indexStatus.value[path] = 'error'
      indexError.value[path] = result.error || '索引失败'
    }
  } catch (e) {
    indexStatus.value[path] = 'error'
    indexError.value[path] = e instanceof Error ? e.message : String(e)
  }
}

async function handleIndexAllStories() {
  if (!confirm(`确定要索引全部 ${storyFiles.value.length} 个故事文件吗？`)) return
  const result = await storyStore.indexAllStories()
  if (result.ok) {
    alert(`索引完成！共索引 ${result.total} 个块`)
  } else {
    alert(`索引完成，但有错误：\n${result.errors.join('\n')}\n\n共索引 ${result.total} 个块`)
  }
}

const generateStatus = ref<{ [path: string]: 'idle' | 'loading' | 'ok' | 'error' }>({})
const generateError = ref<{ [path: string]: string }>({})

async function handleGenerateScript(path: string) {
  generateStatus.value[path] = 'loading'
  generateError.value[path] = ''
  try {
    const result = await storyStore.generateScriptFromStory(path)
    if (result.ok) {
      generateStatus.value[path] = 'ok'
      await scriptStore.loadScripts()
      alert('已生成剧本 JSON，并保存到剧本库。')
    } else {
      generateStatus.value[path] = 'error'
      generateError.value[path] = result.error || '生成剧本失败'
      alert(`生成剧本失败：${result.error || '未知错误'}`)
    }
  } catch (e) {
    generateStatus.value[path] = 'error'
    const msg = e instanceof Error ? e.message : String(e)
    generateError.value[path] = msg
    alert(`生成剧本失败：${msg}`)
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">设置</h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">AI Provider、RAG、同步服务等</p>

    <div class="mt-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">AI 提供商</label>
        <select
          v-model="settings.ai.provider"
          @change="loadModelList"
          class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
        >
          <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>

      <div v-if="needsBaseUrl">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Base URL</label>
        <input
          v-model="settings.ai.baseUrl"
          type="text"
          :placeholder="settings.ai.provider === 'vllm' ? 'http://localhost:8000/v1' : 'http://localhost:11434'"
          class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
        />
      </div>

      <div>
        <div class="flex items-center justify-between">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">模型</label>
          <button
            type="button"
            @click="loadModelList"
            :disabled="modelListLoading"
            class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            刷新
          </button>
        </div>
        <select
          v-model="settings.ai.model"
          :disabled="modelListLoading"
          class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 disabled:opacity-50"
        >
          <option v-for="opt in displayModelList" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <p v-if="modelListLoading" class="mt-1 text-sm text-gray-500">加载模型中...</p>
        <p v-if="modelListError" class="mt-1 text-sm text-amber-600 dark:text-amber-400">{{ modelListError }}</p>
        <p v-else-if="!modelListLoading && needsApiKey && !settings.ai.apiKey" class="mt-1 text-sm text-gray-500">填写 API Key 后加载可用模型</p>
        <p v-else-if="!modelListLoading && needsBaseUrl && !settings.ai.baseUrl" class="mt-1 text-sm text-gray-500">填写 Base URL 后加载可用模型</p>
      </div>

      <div v-if="needsApiKey">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">API Key</label>
        <input
          v-model="settings.ai.apiKey"
          type="password"
          placeholder="sk-..."
          class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">RAG 服务 URL</label>
        <input
          v-model="settings.ragUrl"
          type="text"
          placeholder="http://localhost:8001"
          class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
        />
      </div>

      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">故事库管理</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          将故事文件（.txt、.md、.json）索引到 RAG 向量数据库，供 AI KP 参考使用。
        </p>

        <div class="space-y-2 mb-3">
          <button
            type="button"
            @click="storyStore.importStory()"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            导入故事文件
          </button>
          <button
            type="button"
            @click="storyStore.loadStories()"
            :disabled="storiesLoading"
            class="ml-2 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            刷新列表
          </button>
        </div>

        <div v-if="storyFiles.length === 0" class="text-sm text-gray-500 dark:text-gray-400 py-2">
          暂无故事文件。点击「导入故事文件」添加。
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="story in storyFiles"
            :key="story.path"
            class="flex items-center justify-between p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
          >
            <span class="text-sm text-gray-700 dark:text-gray-300">{{ story.name }}</span>
            <div class="flex gap-2">
              <button
                type="button"
                @click="handleIndexStory(story.path)"
                :disabled="indexStatus[story.path] === 'loading'"
                class="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {{ indexStatus[story.path] === 'loading' ? '索引中...' : indexStatus[story.path] === 'ok' ? '已索引' : '索引' }}
              </button>
              <button
                type="button"
                @click="handleGenerateScript(story.path)"
                :disabled="generateStatus[story.path] === 'loading'"
                class="text-xs px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {{ generateStatus[story.path] === 'loading' ? '生成中...' : generateStatus[story.path] === 'ok' ? '已生成剧本' : '生成剧本' }}
              </button>
              <button
                type="button"
                @click="storyStore.deleteStory(story.path)"
                class="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
              >
                删除
              </button>
            </div>
          </div>
          <button
            type="button"
            @click="handleIndexAllStories"
            class="mt-2 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
          >
            索引全部故事
          </button>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">同步服务 URL</label>
        <input
          v-model="settings.syncServerUrl"
          type="text"
          placeholder="http://localhost:3000"
          class="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100"
        />
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          @click="handleSave"
          class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          保存设置
        </button>
        <button
          type="button"
          @click="handleTest"
          :disabled="testStatus === 'loading'"
          class="rounded-md bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {{ testStatus === 'loading' ? '测试中...' : '测试连接' }}
        </button>
      </div>
      <p v-if="testStatus === 'ok'" class="text-green-600 dark:text-green-400 text-sm">连接成功</p>
      <p v-if="testStatus === 'error'" class="text-red-600 dark:text-red-400 text-sm">{{ testError }}</p>
    </div>
  </div>
</template>

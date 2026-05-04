<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../stores/settingsStore'
import { chat, isStreamResponse, consumeStream } from '../services/ai'

const isDev = import.meta.env.DEV
import { getModelOptions } from '../services/ai/modelListService'
import { useToast } from '../composables/useToast'
import {
  PRESET_PROVIDERS,
  CUSTOM_PROVIDERS,
  getProviderDef,
  type AIProviderType,
} from '../services/ai/types'

const toast = useToast()
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const testStatus = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')
const testError = ref('')
const modelList = ref<{ value: string; label: string }[]>([])
const modelListLoading = ref(false)
const modelListError = ref('')
const customModel = ref('')

const embeddingModelList = ref<{ value: string; label: string }[]>([])
const embeddingModelListLoading = ref(false)
const embeddingModelListError = ref('')
const embeddingCustomModel = ref('')

const embeddingTestStatus = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')
const embeddingTestError = ref('')

const currentDef = computed(() => getProviderDef(settings.value.ai.provider))

const isPreset = computed(() =>
  PRESET_PROVIDERS.some((p) => p.id === settings.value.ai.provider)
)

const showBaseUrl = computed(() => {
  if (!isPreset.value) return true
  const def = currentDef.value
  return def && 'needsBaseUrl' in def && def.needsBaseUrl
})

const showApiKey = computed(() => {
  if (!isPreset.value) return true
  const def = currentDef.value
  return def && 'needsApiKey' in def ? def.needsApiKey : true
})

const baseUrlPlaceholder = computed(() => currentDef.value?.defaultBaseUrl ?? '')
const apiKeyPlaceholder = computed(() => currentDef.value?.apiKeyPlaceholder ?? 'sk-...')

const displayModelList = computed(() => {
  const list = modelList.value
  const current = settings.value.ai.model
  if (current && !list.some((m) => m.value === current)) {
    return [...list, { value: current, label: `${current} (当前)` }]
  }
  return list
})

const displayEmbeddingModelList = computed(() => {
  const list = embeddingModelList.value
  const current = settings.value.rag?.model
  if (current && !list.some((m) => m.value === current)) {
    return [...list, { value: current, label: `${current} (当前)` }]
  }
  return list
})

const sections = ref({
  ai: true,
  services: false,
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

async function loadEmbeddingModelList() {
  if (settings.value.rag?.provider !== 'api') return
  embeddingModelListLoading.value = true
  embeddingModelListError.value = ''
  try {
    const opts = await getModelOptions(settings.value.ai.provider, {
      apiKey: settings.value.ai.apiKey,
      baseUrl: settings.value.ai.baseUrl,
    }, 'embeddings')
    embeddingModelList.value = opts

    const current = settings.value.rag?.model
    if ((!current || !current.trim()) && opts[0]) {
      settings.value.rag.model = opts[0].value
    }
  } catch (e) {
    embeddingModelListError.value = e instanceof Error ? e.message : '获取嵌入模型列表失败'
    embeddingModelList.value = []
  } finally {
    embeddingModelListLoading.value = false
  }
}

function selectProvider(id: AIProviderType) {
  if (settings.value.ai.provider === id) return
  settings.value.ai.provider = id
  settings.value.ai.model = ''
  settings.value.ai.baseUrl = ''
  settings.value.ai.apiKey = ''
  loadModelList()
}

function applyCustomModel() {
  if (customModel.value.trim()) {
    settings.value.ai.model = customModel.value.trim()
    customModel.value = ''
  }
}

function applyCustomEmbeddingModel() {
  if (embeddingCustomModel.value.trim() && settings.value.rag) {
    settings.value.rag.model = embeddingCustomModel.value.trim()
    embeddingCustomModel.value = ''
  }
}

watch(
  () => settings.value.ai.provider,
  () => {
    loadModelList()
    if (settings.value.rag?.provider === 'api') loadEmbeddingModelList()
  }
)

onMounted(() => {
  loadModelList()
  if (settings.value.rag?.provider === 'api') loadEmbeddingModelList()
})

async function handleSave() {
  await settingsStore.save()
  toast.success('设置已保存')
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
    if (content?.trim()) {
      toast.success('连接成功')
    } else {
      testError.value = 'Empty response'
      toast.error('连接失败：空响应')
    }
  } catch (e) {
    testStatus.value = 'error'
    testError.value = e instanceof Error ? e.message : String(e)
    toast.error(`连接失败：${testError.value}`)
  }
}

async function handleTestEmbedding() {
  embeddingTestStatus.value = 'loading'
  embeddingTestError.value = ''
  try {
    const result = await window.electronAPI?.ragTestEmbedding?.()
    if (!result?.ok) throw new Error(result?.error || 'Unknown error')
    embeddingTestStatus.value = 'ok'
    const len = typeof result.vectorLength === 'number' ? result.vectorLength : 0
    if (len > 0) toast.success(`嵌入连接正常（vector=${len}）`)
    else toast.success('嵌入连接正常')
  } catch (e) {
    embeddingTestStatus.value = 'error'
    embeddingTestError.value = e instanceof Error ? e.message : String(e)
    toast.error(`嵌入连接失败：${embeddingTestError.value}`)
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col relative bg-cover bg-center bg-no-repeat bg-fixed"
       style="background-image: url('/src/assets/bg/bg_archives.png');">
    <!-- Thematic dark overlay -->
    <div class="absolute inset-0 bg-black/80 pointer-events-none z-0"></div>

    <div class="relative z-10 flex flex-col flex-1">
      <div class="px-6 pt-8 pb-4 max-w-3xl mx-auto w-full">
        <h1 class="gothic-heading text-2xl font-bold text-white" style="text-shadow: 0 1px 4px rgba(0,0,0,0.8);">设置</h1>
        <p class="mt-1 text-sm" style="color: hsl(220, 10%, 65%);">AI 提供商、故事库与服务配置</p>
        <div class="mt-3 max-w-[80px] ink-divider" />
      </div>

    <div class="flex-1 px-6 pb-12 max-w-3xl mx-auto w-full space-y-4">

      <!-- Section: AI Provider -->
      <section class="gothic-card bg-black/50 backdrop-blur-md overflow-hidden">
        <button type="button"
                @click="sections.ai = !sections.ai"
                class="w-full flex items-center justify-between px-5 py-3.5 text-left
                       transition-colors section-toggle">
          <h2 class="gothic-heading text-sm font-bold flex items-center gap-2">
            <span style="color: hsl(165, 50%, 60%);">⚙</span> AI 提供商
          </h2>
          <span class="text-xs" style="color: hsl(220, 10%, 55%);">{{ sections.ai ? '▾' : '▸' }}</span>
        </button>
        <div v-if="sections.ai" class="px-5 pb-5 space-y-5 pt-4 section-content">

          <!-- Preset providers -->
          <div>
            <label class="block text-xs font-medium mb-2" style="color: hsl(220, 10%, 55%);">常用服务商</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="preset in PRESET_PROVIDERS"
                :key="preset.id"
                type="button"
                @click="selectProvider(preset.id)"
                class="px-3 py-2.5 rounded-lg text-left transition-all duration-200 provider-card"
                :class="settings.ai.provider === preset.id ? 'provider-active' : 'provider-dim'"
              >
                <div class="text-sm font-medium"
                     :style="{ color: settings.ai.provider === preset.id ? 'hsl(165, 50%, 78%)' : 'hsl(38, 30%, 65%)' }">
                  {{ preset.label }}
                </div>
                <div class="text-[10px] mt-0.5 leading-tight"
                     :style="{ color: settings.ai.provider === preset.id ? 'hsl(165, 40%, 55%)' : 'hsl(220, 10%, 25%)' }">
                  {{ preset.description }}
                </div>
              </button>
            </div>
          </div>

          <!-- Custom compatible providers -->
          <div>
            <label class="block text-xs font-medium mb-2" style="color: hsl(220, 10%, 55%);">自定义兼容端点</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="custom in CUSTOM_PROVIDERS"
                :key="custom.id"
                type="button"
                @click="selectProvider(custom.id)"
                class="px-3 py-2.5 rounded-lg text-left transition-all duration-200 provider-card"
                :class="settings.ai.provider === custom.id ? 'provider-active' : 'provider-dim'"
              >
                <div class="text-sm font-medium"
                     :style="{ color: settings.ai.provider === custom.id ? 'hsl(165, 50%, 78%)' : 'hsl(38, 30%, 65%)' }">
                  {{ custom.label }}
                </div>
                <div class="text-[10px] mt-0.5 leading-tight"
                     :style="{ color: settings.ai.provider === custom.id ? 'hsl(165, 40%, 55%)' : 'hsl(220, 10%, 25%)' }">
                  {{ custom.description }}
                </div>
              </button>
            </div>
          </div>

          <!-- Divider -->
          <div class="ink-divider" />

          <!-- Base URL -->
          <div v-if="showBaseUrl">
            <label class="block text-xs font-medium mb-1.5" style="color: hsl(220, 10%, 30%);">Base URL</label>
            <input v-model="settings.ai.baseUrl" type="text"
                   :placeholder="baseUrlPlaceholder || '请输入 API 地址'"
                   class="gothic-input text-sm" />
            <p v-if="baseUrlPlaceholder" class="mt-1 text-[11px]" style="color: hsl(220, 10%, 22%);">
              留空则使用默认值：{{ baseUrlPlaceholder }}
            </p>
          </div>

          <!-- API Key -->
          <div v-if="showApiKey">
            <label class="block text-xs font-medium mb-1.5" style="color: hsl(220, 10%, 30%);">API Key</label>
            <input v-model="settings.ai.apiKey" type="password"
                   :placeholder="apiKeyPlaceholder"
                   class="gothic-input text-sm" />
          </div>

          <!-- Model -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium" style="color: hsl(220, 10%, 30%);">模型</label>
              <button type="button" @click="loadModelList" :disabled="modelListLoading"
                      class="text-[10px] disabled:opacity-50" style="color: hsl(165, 50%, 50%);">
                刷新列表
              </button>
            </div>

            <select v-if="displayModelList.length > 0"
                    v-model="settings.ai.model" :disabled="modelListLoading"
                    class="gothic-select text-sm disabled:opacity-50">
              <option value="" disabled>— 选择模型 —</option>
              <option v-for="opt in displayModelList" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>

            <div class="mt-2 flex items-center gap-2">
              <input v-model="customModel" type="text"
                     placeholder="或手动输入模型名称"
                     class="gothic-input text-sm flex-1"
                     @keydown.enter="applyCustomModel" />
              <button type="button" @click="applyCustomModel"
                      :disabled="!customModel.trim()"
                      class="gothic-btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">
                应用
              </button>
            </div>

            <p v-if="settings.ai.model" class="mt-1.5 text-[11px]" style="color: hsl(38, 25%, 55%);">
              当前模型：{{ settings.ai.model }}
            </p>
            <p v-if="modelListLoading" class="mt-1 text-[11px]" style="color: hsl(220, 10%, 30%);">加载模型中...</p>
            <p v-if="modelListError" class="mt-1 text-[11px]" style="color: hsl(42, 65%, 55%);">{{ modelListError }}</p>
          </div>

          <!-- Advanced settings -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1.5" style="color: hsl(220, 10%, 30%);">Temperature</label>
              <input v-model.number="settings.ai.temperature" type="number" step="0.1" min="0" max="2"
                     class="gothic-input text-sm" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1.5" style="color: hsl(220, 10%, 30%);">Max Tokens</label>
              <input v-model.number="settings.ai.maxTokens" type="number" step="256" min="256" max="32768"
                     class="gothic-input text-sm" />
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 pt-2">
            <button type="button" @click="handleSave" class="gothic-btn text-sm">保存设置</button>
            <button type="button" @click="handleTest" :disabled="testStatus === 'loading'"
                    class="gothic-btn-secondary text-sm">
              {{ testStatus === 'loading' ? '测试中...' : '测试连接' }}
            </button>
            <span v-if="testStatus === 'ok'" class="text-xs" style="color: hsl(165, 50%, 60%);">✓ 连接正常</span>
            <span v-if="testStatus === 'error'" class="text-xs" style="color: hsl(0, 55%, 65%);">✕ {{ testError }}</span>
          </div>
        </div>
      </section>

      <!-- Section: Services -->
      <section class="gothic-card bg-black/50 backdrop-blur-md overflow-hidden">
        <button type="button"
                @click="sections.services = !sections.services"
                class="w-full flex items-center justify-between px-5 py-3.5 text-left
                       transition-colors section-toggle">
          <h2 class="gothic-heading text-sm font-bold flex items-center gap-2">
            <span style="color: hsl(42, 60%, 65%);">⚡</span> 服务配置
          </h2>
          <span class="text-xs" style="color: hsl(220, 10%, 55%);">{{ sections.services ? '▾' : '▸' }}</span>
        </button>
        <div v-if="sections.services" class="px-5 pb-5 space-y-4 pt-4 section-content">
          <div class="flex items-center gap-2 px-3 py-2 rounded-md rag-notice mb-3">
            <span class="text-xs" style="color: hsl(165, 50%, 50%);">✓</span>
            <span class="text-xs" style="color: hsl(165, 40%, 65%);">RAG 向量检索已内置于 Electron，无需单独启动服务</span>
          </div>
          <div v-if="settings.rag" class="space-y-3">
            <p class="text-[11px]" style="color: hsl(220, 10%, 22%);">
              RAG 向量检索始终使用嵌入向量（内置模型或你的嵌入 API），不再使用 TF-IDF。
            </p>
            <div class="space-y-3 pl-3 rag-options">
              <div class="flex flex-col gap-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="settings.rag.provider" type="radio" value="builtin"
                         class="radio-input" />
                  <span class="text-xs font-medium" style="color: hsl(220, 10%, 30%);">内置中文嵌入模型（无需 API，首次使用会下载）</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="settings.rag.provider" type="radio" value="api"
                         class="radio-input" />
                  <span class="text-xs font-medium" style="color: hsl(220, 10%, 30%);">使用我的嵌入 API（上方 AI 的 Base URL 与 API Key）</span>
                </label>
              </div>
              <div v-if="settings.rag.provider === 'api'">
                <div class="flex items-center justify-between gap-3">
                  <label class="block text-xs font-medium mb-1.5" style="color: hsl(220, 10%, 30%);">嵌入模型名</label>
                  <button
                    type="button"
                    @click="loadEmbeddingModelList"
                    :disabled="embeddingModelListLoading"
                    class="text-[11px] disabled:opacity-50" style="color: hsl(165, 50%, 50%);">
                    刷新
                  </button>
                </div>

                <div class="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    @click="handleTestEmbedding"
                    :disabled="embeddingTestStatus === 'loading' || settings.rag.provider !== 'api'"
                    class="gothic-btn-secondary text-xs"
                  >
                    {{ embeddingTestStatus === 'loading' ? '测试中...' : '测试嵌入连接' }}
                  </button>
                  <span v-if="embeddingTestStatus === 'ok'" class="text-xs" style="color: hsl(165, 50%, 60%);">✓ 嵌入正常</span>
                  <span v-if="embeddingTestStatus === 'error'" class="text-xs" style="color: hsl(0, 55%, 65%);">✕ {{ embeddingTestError }}</span>
                </div>

                <div v-if="embeddingModelListLoading && displayEmbeddingModelList.length === 0"
                     class="text-xs mt-1" style="color: hsl(220, 10%, 30%);">
                  加载中...
                </div>

                <div v-else class="space-y-2">
                  <select
                    v-if="displayEmbeddingModelList.length > 0"
                    v-model="settings.rag.model"
                    class="gothic-select text-sm disabled:opacity-50"
                  >
                    <option v-for="opt in displayEmbeddingModelList" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>

                  <div class="mt-1 flex items-center gap-2">
                    <input
                      v-model="embeddingCustomModel"
                      type="text"
                      placeholder="或手动输入模型名"
                      class="gothic-input text-sm flex-1"
                      @keydown.enter="applyCustomEmbeddingModel"
                    />
                    <button
                      type="button"
                      @click="applyCustomEmbeddingModel"
                      :disabled="!embeddingCustomModel.trim()"
                      class="gothic-btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
                    >
                      应用
                    </button>
                  </div>

                  <p v-if="embeddingModelListError" class="text-[11px]" style="color: hsl(42, 65%, 55%);">
                    {{ embeddingModelListError }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1.5" style="color: hsl(220, 10%, 30%);">同步服务 URL</label>
            <input v-model="settings.syncServerUrl" type="text" placeholder="http://localhost:3000"
                   class="gothic-input text-sm" />
          </div>
          <button type="button" @click="handleSave" class="gothic-btn text-sm">保存</button>
        </div>
      </section>

      <!-- Section: Debug (dev only) -->
      <section v-if="isDev" class="gothic-card bg-black/50 backdrop-blur-md overflow-hidden">
        <div class="px-5 py-3.5">
          <h2 class="gothic-heading text-sm font-bold flex items-center gap-2">
            <span style="color: hsl(42, 65%, 55%);">🔍</span> 开发调试
            <span class="text-[10px] px-1.5 py-0.5 rounded ml-2 dev-badge">DEV ONLY</span>
          </h2>
        </div>
        <div class="px-5 pb-5 space-y-3 pt-4 section-content">
          <label class="flex items-center gap-3 cursor-pointer">
            <input v-model="settings.debugMode" type="checkbox"
                   class="w-4 h-4 rounded checkbox-input" />
            <div>
              <span class="text-sm" style="color: hsl(38, 30%, 65%);">启用 KPTrace 追踪</span>
              <p class="text-[11px] mt-0.5" style="color: hsl(220, 10%, 22%);">记录 Agent 循环、RAG 检索、工具执行等全链路事件</p>
            </div>
          </label>
          <div class="flex items-center gap-3 text-xs" style="color: hsl(220, 10%, 30%);">
            <span>快捷键：在游戏房间按 <kbd class="px-1 py-0.5 rounded kbd-key">Ctrl+Shift+D</kbd> 打开/关闭 Debug Panel</span>
          </div>
          <div class="flex items-center gap-3 text-xs" style="color: hsl(220, 10%, 30%);">
            <span>RAG Inspector：访问 <code class="px-1 py-0.5 rounded kbd-key">/rag-inspector</code> 检查 RAG 索引和 GraphRAG 提取结果</span>
          </div>
          <button type="button" @click="handleSave" class="gothic-btn text-sm">保存</button>
        </div>
      </section>

    </div>
    </div>
  </div>
</template>

<style scoped>
.section-toggle:hover {
  background: hsla(220, 16%, 14%, 0.4);
}
.section-content {
  border-top: 1px solid hsla(220, 14%, 16%, 0.5);
}

.provider-card {
  border: 1px solid transparent;
}
.provider-active {
  background: hsla(165, 45%, 22%, 0.2);
  border-color: hsla(165, 55%, 28%, 0.5);
  box-shadow: 0 0 8px hsla(165, 60%, 35%, 0.1);
}
.provider-dim {
  background: hsla(220, 16%, 11%, 0.4);
  border-color: hsla(220, 14%, 16%, 0.4);
}
.provider-dim:hover {
  border-color: hsla(220, 12%, 22%, 0.6);
  background: hsla(220, 16%, 14%, 0.5);
}

.rag-notice {
  background: hsla(165, 35%, 10%, 0.3);
  border: 1px solid hsla(165, 45%, 22%, 0.2);
}
.rag-options {
  border-left: 2px solid hsla(220, 14%, 16%, 0.5);
}

.radio-input {
  accent-color: hsl(165, 60%, 35%);
}
.checkbox-input {
  accent-color: hsl(42, 65%, 55%);
  background: hsl(220, 16%, 11%);
  border: 1px solid hsl(220, 14%, 16%);
}

.dev-badge {
  background: hsla(42, 40%, 14%, 0.4);
  border: 1px solid hsla(42, 55%, 35%, 0.3);
  color: hsl(42, 60%, 60%);
}
.kbd-key {
  background: hsl(220, 16%, 11%);
  border: 1px solid hsl(220, 14%, 16%);
  color: hsl(220, 10%, 30%);
}
</style>

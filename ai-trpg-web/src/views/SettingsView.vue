<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '../stores/settingsStore'
import { chat, isStreamResponse, consumeStream } from '../services/ai'
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

watch(
  () => settings.value.ai.provider,
  () => {
    loadModelList()
  }
)

onMounted(() => {
  loadModelList()
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
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <div class="px-6 pt-8 pb-4 max-w-3xl mx-auto w-full">
      <h1 class="gothic-heading text-2xl font-bold">设置</h1>
      <p class="mt-1 text-sm text-gray-500">AI 提供商、故事库与服务配置</p>
      <div class="mt-2 w-16 h-px bg-gradient-to-r from-eldritch-500 to-transparent" />
    </div>

    <div class="flex-1 px-6 pb-12 max-w-3xl mx-auto w-full space-y-4">

      <!-- Section: AI Provider -->
      <section class="gothic-card overflow-hidden">
        <button type="button"
                @click="sections.ai = !sections.ai"
                class="w-full flex items-center justify-between px-5 py-3.5 text-left
                       hover:bg-gray-800/40 transition-colors">
          <h2 class="gothic-heading text-sm font-semibold flex items-center gap-2">
            <span class="text-eldritch-400">⚙</span> AI 提供商
          </h2>
          <span class="text-gray-500 text-xs">{{ sections.ai ? '▾' : '▸' }}</span>
        </button>
        <div v-if="sections.ai" class="px-5 pb-5 space-y-5 border-t border-gray-800/60 pt-4">

          <!-- ═══ Preset providers ═══ -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-2">常用服务商</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="preset in PRESET_PROVIDERS"
                :key="preset.id"
                type="button"
                @click="selectProvider(preset.id)"
                class="px-3 py-2.5 rounded-lg border text-left transition-all duration-200"
                :class="settings.ai.provider === preset.id
                  ? 'bg-eldritch-600/20 border-eldritch-500/60 shadow-sm shadow-eldritch-500/10'
                  : 'bg-gray-800/30 border-gray-700/40 hover:border-gray-600 hover:bg-gray-800/50'"
              >
                <div class="text-sm font-medium"
                     :class="settings.ai.provider === preset.id ? 'text-eldritch-300' : 'text-parchment-300'">
                  {{ preset.label }}
                </div>
                <div class="text-[10px] mt-0.5 leading-tight"
                     :class="settings.ai.provider === preset.id ? 'text-eldritch-400/70' : 'text-gray-600'">
                  {{ preset.description }}
                </div>
              </button>
            </div>
          </div>

          <!-- ═══ Custom compatible providers ═══ -->
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-2">自定义兼容端点</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="custom in CUSTOM_PROVIDERS"
                :key="custom.id"
                type="button"
                @click="selectProvider(custom.id)"
                class="px-3 py-2.5 rounded-lg border text-left transition-all duration-200"
                :class="settings.ai.provider === custom.id
                  ? 'bg-eldritch-600/20 border-eldritch-500/60 shadow-sm shadow-eldritch-500/10'
                  : 'bg-gray-800/30 border-gray-700/40 hover:border-gray-600 hover:bg-gray-800/50'"
              >
                <div class="text-sm font-medium"
                     :class="settings.ai.provider === custom.id ? 'text-eldritch-300' : 'text-parchment-300'">
                  {{ custom.label }}
                </div>
                <div class="text-[10px] mt-0.5 leading-tight"
                     :class="settings.ai.provider === custom.id ? 'text-eldritch-400/70' : 'text-gray-600'">
                  {{ custom.description }}
                </div>
              </button>
            </div>
          </div>

          <!-- ═══ Divider ═══ -->
          <div class="w-full h-px bg-gradient-to-r from-transparent via-gray-700/60 to-transparent" />

          <!-- ═══ Configuration fields ═══ -->

          <!-- Base URL -->
          <div v-if="showBaseUrl">
            <label class="block text-xs font-medium text-gray-400 mb-1.5">Base URL</label>
            <input v-model="settings.ai.baseUrl" type="text"
                   :placeholder="baseUrlPlaceholder || '请输入 API 地址'"
                   class="gothic-input text-sm" />
            <p v-if="baseUrlPlaceholder" class="mt-1 text-[11px] text-gray-600">
              留空则使用默认值：{{ baseUrlPlaceholder }}
            </p>
          </div>

          <!-- API Key -->
          <div v-if="showApiKey">
            <label class="block text-xs font-medium text-gray-400 mb-1.5">API Key</label>
            <input v-model="settings.ai.apiKey" type="password"
                   :placeholder="apiKeyPlaceholder"
                   class="gothic-input text-sm" />
          </div>

          <!-- Model -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-gray-400">模型</label>
              <button type="button" @click="loadModelList" :disabled="modelListLoading"
                      class="text-[10px] text-eldritch-400 hover:text-eldritch-300 disabled:opacity-50">
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

            <p v-if="settings.ai.model" class="mt-1.5 text-[11px] text-parchment-400">
              当前模型：{{ settings.ai.model }}
            </p>
            <p v-if="modelListLoading" class="mt-1 text-[11px] text-gray-500">加载模型中...</p>
            <p v-if="modelListError" class="mt-1 text-[11px] text-amber-400">{{ modelListError }}</p>
          </div>

          <!-- Advanced settings -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1.5">Temperature</label>
              <input v-model.number="settings.ai.temperature" type="number" step="0.1" min="0" max="2"
                     class="gothic-input text-sm" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1.5">Max Tokens</label>
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
            <span v-if="testStatus === 'ok'" class="text-xs text-cthulhu-200">✓ 连接正常</span>
            <span v-if="testStatus === 'error'" class="text-xs text-blood-300">✕ {{ testError }}</span>
          </div>
        </div>
      </section>

      <!-- Section: Services -->
      <section class="gothic-card overflow-hidden">
        <button type="button"
                @click="sections.services = !sections.services"
                class="w-full flex items-center justify-between px-5 py-3.5 text-left
                       hover:bg-gray-800/40 transition-colors">
          <h2 class="gothic-heading text-sm font-semibold flex items-center gap-2">
            <span class="text-sanity-300">⚡</span> 服务配置
          </h2>
          <span class="text-gray-500 text-xs">{{ sections.services ? '▾' : '▸' }}</span>
        </button>
        <div v-if="sections.services" class="px-5 pb-5 space-y-4 border-t border-gray-800/60 pt-4">
          <div class="flex items-center gap-2 px-3 py-2 rounded-md bg-cthulhu-900/30 border border-cthulhu-700/20 mb-3">
            <span class="text-cthulhu-300 text-xs">✓</span>
            <span class="text-xs text-cthulhu-200">RAG 向量检索已内置于 Electron，无需单独启动服务</span>
          </div>
          <div v-if="settings.rag" class="space-y-3">
            <p class="text-[11px] text-gray-600">
              RAG 向量检索始终使用嵌入向量（内置模型或你的嵌入 API），不再使用 TF-IDF。
            </p>
            <div class="space-y-3 pl-1 border-l-2 border-gray-700/60">
              <div class="flex flex-col gap-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="settings.rag.provider" type="radio" value="builtin"
                         class="rounded-full border-gray-600 bg-gray-800 text-eldritch-500 focus:ring-eldritch-500" />
                  <span class="text-xs font-medium text-gray-400">内置中文嵌入模型（无需 API，首次使用会下载）</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input v-model="settings.rag.provider" type="radio" value="api"
                         class="rounded-full border-gray-600 bg-gray-800 text-eldritch-500 focus:ring-eldritch-500" />
                  <span class="text-xs font-medium text-gray-400">使用我的嵌入 API（上方 AI 的 Base URL 与 API Key）</span>
                </label>
              </div>
              <div v-if="settings.rag.provider === 'api'">
                <label class="block text-xs font-medium text-gray-400 mb-1.5">嵌入模型名</label>
                <input v-model="settings.rag.model" type="text" placeholder="text-embedding-3-small"
                       class="gothic-input text-sm" />
              </div>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1.5">同步服务 URL</label>
            <input v-model="settings.syncServerUrl" type="text" placeholder="http://localhost:3000"
                   class="gothic-input text-sm" />
          </div>
          <button type="button" @click="handleSave" class="gothic-btn text-sm">保存</button>
        </div>
      </section>

    </div>
  </div>
</template>

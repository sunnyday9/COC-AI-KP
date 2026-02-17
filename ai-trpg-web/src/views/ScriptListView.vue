<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useScriptStore } from '../stores/scriptStore'

const scriptStore = useScriptStore()
const { scriptFiles, currentScript, currentScriptPath, isLoading, error } = storeToRefs(scriptStore)
const indexLoading = ref(false)

const hasElectron = computed(() => !!window.electronAPI)

onMounted(() => {
  scriptStore.loadScripts()
})

async function handleIndexRag(path: string) {
  indexLoading.value = true
  try {
    const result = await scriptStore.indexForRag(path)
    if (result.ok) alert('RAG 索引已建立')
    else alert('索引失败: ' + (result.error || '未知错误'))
  } finally {
    indexLoading.value = false
  }
}

async function handleImport() {
  const result = await scriptStore.importScript()
  if (result?.ok) {
    alert('导入成功')
  } else if (result?.error && result.error !== 'cancelled') {
    alert('导入失败: ' + result.error)
  }
}

async function handleDelete(path: string, name: string) {
  if (!confirm(`确定要删除剧本「${name}」吗？`)) return
  await scriptStore.deleteScript(path)
}

function handleSelect(path: string) {
  scriptStore.loadScript(path)
}

function closeDetail() {
  scriptStore.clearCurrent()
}
</script>

<template>
  <div class="p-6 flex flex-col h-full">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">剧本管理</h1>
        <p class="mt-1 text-gray-600 dark:text-gray-400">导入、浏览和管理 TRPG 剧本（COC / D&D）</p>
      </div>
      <button
        v-if="hasElectron"
        type="button"
        @click="handleImport"
        class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        :disabled="isLoading"
      >
        导入剧本
      </button>
    </div>

    <p v-if="!hasElectron" class="mt-4 text-amber-600 dark:text-amber-400 text-sm">
      请在 Electron 环境中使用剧本管理功能
    </p>

    <p v-if="error" class="mt-4 text-red-600 dark:text-red-400">{{ error }}</p>

    <div v-if="isLoading && scriptFiles.length === 0" class="mt-6 text-gray-500">加载中...</div>

    <ul v-else-if="scriptFiles.length" class="mt-6 space-y-2 flex-1 overflow-auto">
      <li
        v-for="file in scriptFiles"
        :key="file.path"
        class="flex items-center justify-between p-3 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700"
      >
        <button
          type="button"
          class="flex-1 text-left"
          @click="handleSelect(file.path)"
        >
          <span class="font-medium text-gray-900 dark:text-gray-100">{{ file.name }}</span>
        </button>
        <button
          v-if="hasElectron"
          type="button"
          @click="handleDelete(file.path, file.name)"
          class="ml-2 text-red-600 hover:text-red-700 dark:text-red-400"
          title="删除"
        >
          删除
        </button>
      </li>
    </ul>

    <p v-else-if="!isLoading && hasElectron" class="mt-6 text-gray-500">暂无剧本，点击「导入剧本」添加</p>

    <!-- Detail panel -->
    <div
      v-if="currentScript"
      class="mt-6 p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
    >
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">{{ currentScript.meta.title }}</h2>
        <button type="button" @click="closeDetail" class="text-gray-500 hover:text-gray-700">关闭</button>
      </div>
      <dl class="grid grid-cols-2 gap-2 text-sm">
        <dt class="text-gray-500">作者</dt>
        <dd>{{ currentScript.meta.author || '-' }}</dd>
        <dt class="text-gray-500">规则</dt>
        <dd>{{ currentScript.meta.ruleSystem === 'coc' ? '克苏鲁' : 'D&D' }}</dd>
        <dt class="text-gray-500">场景数</dt>
        <dd>{{ currentScript.scenes.length }}</dd>
        <dt class="text-gray-500">NPC 数</dt>
        <dd>{{ currentScript.npcs?.length ?? 0 }}</dd>
      </dl>
      <div class="mt-3 text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-auto">
        <p class="font-medium mb-1">场景列表</p>
        <ul class="list-disc list-inside">
          <li v-for="s in currentScript.scenes" :key="s.id">{{ s.name }}</li>
        </ul>
      </div>
      <button
        v-if="currentScriptPath"
        type="button"
        @click="handleIndexRag(currentScriptPath)"
        :disabled="indexLoading"
        class="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {{ indexLoading ? '索引中...' : '建立 RAG 索引' }}
      </button>
    </div>
  </div>
</template>

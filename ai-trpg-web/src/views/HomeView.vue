<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useScriptStore } from '../stores/scriptStore'
import { useGameStore } from '../stores/gameStore'

const router = useRouter()
const scriptStore = useScriptStore()
const gameStore = useGameStore()
const { scriptFiles, isLoading } = storeToRefs(scriptStore)
const hasElectron = computed(() => !!(window as { electronAPI?: unknown }).electronAPI)

onMounted(() => {
  scriptStore.loadScripts()
})

async function goToSetup(path: string) {
  await gameStore.startGame({ scriptPath: path })
  router.push('/occupation')
}
</script>

<template>
  <div class="p-6 max-w-2xl">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">AI TRPG</h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">欢迎来到 AI TRPG 桌面应用</p>
    <p class="mt-4 text-sm text-gray-500 dark:text-gray-500">请先选择一个剧本来开始游戏</p>

    <div class="mt-6">
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">选择剧本</h2>
      <p v-if="!hasElectron" class="mt-2 text-amber-600 dark:text-amber-400 text-sm">
        请在 Electron 环境中使用剧本功能
      </p>
      <p v-else-if="isLoading && scriptFiles.length === 0" class="mt-2 text-gray-500">加载中...</p>
      <ul v-else-if="scriptFiles.length" class="mt-2 space-y-2">
        <li
          v-for="file in scriptFiles"
          :key="file.path"
          class="flex items-center justify-between p-3 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700"
        >
          <span class="font-medium text-gray-900 dark:text-gray-100">{{ file.name }}</span>
          <button
            type="button"
            @click="goToSetup(file.path)"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            开始游戏
          </button>
        </li>
      </ul>
      <p v-else class="mt-2 text-gray-500">暂无剧本，请先到「剧本管理」导入</p>
      <router-link
        v-if="scriptFiles.length === 0"
        to="/scripts"
        class="mt-3 inline-block text-blue-600 hover:text-blue-700 dark:text-blue-400"
      >
        前往剧本管理 →
      </router-link>
    </div>
  </div>
</template>

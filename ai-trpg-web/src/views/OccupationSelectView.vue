<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { COC7_OCCUPATIONS } from '../data/coc7'

const router = useRouter()
const gameStore = useGameStore()
const { scriptId, script } = storeToRefs(gameStore)

function selectOccupation(id: string, name: string) {
  gameStore.setOccupation(id, name)
  router.push('/character-create')
}

onMounted(() => {
  if (!scriptId.value) router.replace('/')
})
</script>

<template>
  <div class="p-6 max-w-2xl">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">选择职业</h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">
      剧本：{{ script?.meta?.title ?? scriptId ?? '—' }}。请根据 COC 7th 规则选择调查员职业，后续将进行技能加点与属性投点。
    </p>
    <p class="mt-1 text-sm text-gray-500 dark:text-gray-500">此步骤不使用 AI，纯规则逻辑。</p>

    <ul class="mt-6 space-y-2">
      <li
        v-for="occ in COC7_OCCUPATIONS"
        :key="occ.id"
        class="flex items-center justify-between p-3 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700"
      >
        <span class="font-medium text-gray-900 dark:text-gray-100">{{ occ.name }}</span>
        <span class="text-sm text-gray-500 dark:text-gray-400">{{ occ.nameEn }}</span>
        <button
          type="button"
          @click="selectOccupation(occ.id, occ.name)"
          class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        >
          选择
        </button>
      </li>
    </ul>
  </div>
</template>

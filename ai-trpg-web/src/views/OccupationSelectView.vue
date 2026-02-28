<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import {
  COC7_OCCUPATIONS,
  OCCUPATION_CATEGORIES,
  type OccupationCategory,
  type COCOccupationDef,
} from '../data/coc7'

const router = useRouter()
const gameStore = useGameStore()
const { storyId, storyName } = storeToRefs(gameStore)

const searchQuery = ref('')
const selectedCategory = ref<OccupationCategory | 'all'>('all')
const selectedEra = ref<'any' | 'classic' | 'modern' | 'all'>('all')
const hoveredOcc = ref<string | null>(null)

const categoryEntries = computed(() => {
  return [
    { key: 'all' as const, label: '全部' },
    ...Object.entries(OCCUPATION_CATEGORIES).map(([key, label]) => ({
      key: key as OccupationCategory,
      label,
    })),
  ]
})

const eraOptions = [
  { key: 'all' as const, label: '全时代' },
  { key: 'any' as const, label: '通用' },
  { key: 'classic' as const, label: '1920s' },
  { key: 'modern' as const, label: '现代' },
]

function matchSearch(occ: COCOccupationDef, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    occ.name.toLowerCase().includes(q) ||
    occ.nameEn.toLowerCase().includes(q) ||
    occ.id.toLowerCase().includes(q)
  )
}

const filteredOccupations = computed(() => {
  return COC7_OCCUPATIONS.filter((occ) => {
    if (selectedCategory.value !== 'all' && occ.category !== selectedCategory.value) return false
    if (selectedEra.value !== 'all' && occ.era !== selectedEra.value) return false
    return matchSearch(occ, searchQuery.value)
  })
})

const categoryCounts = computed(() => {
  const counts: Record<string, number> = { all: 0 }
  for (const occ of COC7_OCCUPATIONS) {
    if (selectedEra.value !== 'all' && occ.era !== selectedEra.value) continue
    if (!matchSearch(occ, searchQuery.value)) continue
    counts.all = (counts.all || 0) + 1
    counts[occ.category] = (counts[occ.category] || 0) + 1
  }
  return counts
})

function selectOccupation(id: string, name: string) {
  gameStore.setOccupation(id, name)
  router.push('/character-create')
}

function eraLabel(era: 'any' | 'classic' | 'modern'): string {
  if (era === 'classic') return '1920s'
  if (era === 'modern') return '现代'
  return ''
}

onMounted(() => {
  if (!storyId.value) router.replace('/')
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Progress indicator -->
    <div class="px-6 pt-8 pb-4 max-w-4xl mx-auto w-full">
      <div class="flex items-center justify-center gap-2 mb-8">
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-eldritch-600 border border-eldritch-500
                       flex items-center justify-center text-xs font-bold text-parchment-200">1</span>
          <span class="text-xs font-medium text-parchment-300">选择职业</span>
        </div>
        <div class="w-8 h-px bg-gray-700" />
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-gray-800 border border-gray-700
                       flex items-center justify-center text-xs text-gray-500">2</span>
          <span class="text-xs text-gray-600">技能与属性</span>
        </div>
        <div class="w-8 h-px bg-gray-700" />
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-gray-800 border border-gray-700
                       flex items-center justify-center text-xs text-gray-500">3</span>
          <span class="text-xs text-gray-600">进入游戏</span>
        </div>
      </div>

      <h1 class="gothic-heading text-2xl font-bold text-center">选择职业</h1>
      <p class="mt-2 text-center text-sm text-gray-500">
        故事：<span class="text-parchment-400">{{ storyName || storyId || '—' }}</span>
      </p>
      <div class="mt-2 mx-auto w-16 h-px bg-gradient-to-r from-transparent via-eldritch-500 to-transparent" />
    </div>

    <!-- Search + Filters -->
    <div class="px-6 max-w-4xl mx-auto w-full space-y-4 pb-4">
      <!-- Search bar -->
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索职业名称（中文 / 英文）…"
          class="gothic-input w-full pl-10 pr-4 py-2.5 text-sm"
        />
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      </div>

      <!-- Era filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500 shrink-0">时代：</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="era in eraOptions"
            :key="era.key"
            type="button"
            @click="selectedEra = era.key"
            class="px-3 py-1 rounded-md text-xs font-medium transition-all duration-200 border"
            :class="selectedEra === era.key
              ? 'bg-eldritch-600/30 border-eldritch-500/60 text-eldritch-300'
              : 'bg-gray-800/40 border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600'"
          >{{ era.label }}</button>
        </div>
      </div>

      <!-- Category filter -->
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="cat in categoryEntries"
          :key="cat.key"
          type="button"
          @click="selectedCategory = cat.key"
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 border"
          :class="selectedCategory === cat.key
            ? 'bg-eldritch-600/30 border-eldritch-500/60 text-eldritch-300'
            : 'bg-gray-800/40 border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600'"
        >
          {{ cat.label }}
          <span v-if="categoryCounts[cat.key]" class="ml-1 opacity-60">{{ categoryCounts[cat.key] }}</span>
        </button>
      </div>
    </div>

    <!-- Occupation grid -->
    <div class="flex-1 px-6 pb-12 max-w-4xl mx-auto w-full">
      <p v-if="filteredOccupations.length === 0"
         class="text-center text-gray-600 py-12 text-sm">
        未找到匹配的职业，请尝试其他搜索关键词或筛选条件
      </p>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          v-for="occ in filteredOccupations"
          :key="occ.id"
          type="button"
          @click="selectOccupation(occ.id, occ.name)"
          @mouseenter="hoveredOcc = occ.id"
          @mouseleave="hoveredOcc = null"
          class="gothic-card p-4 text-left group hover:border-eldritch-600/60
                 hover:shadow-eldritch transition-all duration-300 relative"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h3 class="font-serif font-medium text-parchment-200 group-hover:text-parchment-100
                         transition-colors truncate">
                {{ occ.name }}
              </h3>
              <p class="text-xs text-gray-500 mt-0.5 truncate">{{ occ.nameEn }}</p>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span v-if="occ.era !== 'any'"
                    class="text-[10px] px-1.5 py-0.5 rounded border"
                    :class="occ.era === 'classic'
                      ? 'text-amber-400/80 border-amber-700/30 bg-amber-900/20'
                      : 'text-cyan-400/80 border-cyan-700/30 bg-cyan-900/20'">
                {{ eraLabel(occ.era) }}
              </span>
            </div>
          </div>

          <!-- Credit range -->
          <div class="mt-2 flex items-center gap-2">
            <span class="text-[10px] text-gray-600">信用</span>
            <div class="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-eldritch-700 to-eldritch-500 rounded-full transition-all"
                   :style="{ marginLeft: occ.creditRange[0] + '%', width: (occ.creditRange[1] - occ.creditRange[0]) + '%' }" />
            </div>
            <span class="text-[10px] text-gray-600 font-mono w-14 text-right">{{ occ.creditRange[0] }}-{{ occ.creditRange[1] }}</span>
          </div>

          <!-- Hover: select indicator -->
          <span class="absolute right-3 bottom-3 text-xs text-eldritch-400
                       bg-eldritch-800/40 px-2 py-0.5 rounded border border-eldritch-700/30
                       opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            选择
          </span>
        </button>
      </div>

      <!-- Count summary -->
      <p class="mt-6 text-center text-xs text-gray-600">
        共 {{ filteredOccupations.length }} 个职业
        <span v-if="filteredOccupations.length !== COC7_OCCUPATIONS.length">
          / 总计 {{ COC7_OCCUPATIONS.length }} 个
        </span>
      </p>
    </div>
  </div>
</template>

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
  <div class="min-h-screen flex flex-col relative bg-cover bg-center bg-no-repeat bg-fixed"
       style="background-image: url('/src/assets/bg/bg_desk.png');">
    <!-- Thematic dark overlay for contrast -->
    <div class="absolute inset-0 bg-black/70 pointer-events-none z-0"></div>

    <div class="relative z-10 flex flex-col flex-1">
      <!-- Progress indicator -->
      <div class="px-6 pt-8 pb-4 max-w-4xl mx-auto w-full">
        <div class="flex items-center justify-center gap-2 mb-8">
          <!-- Step 1 — Active -->
          <div class="flex items-center gap-2">
            <span class="step-circle step-active">1</span>
            <span class="text-xs font-medium" style="color: hsl(38, 35%, 85%);">选择职业</span>
          </div>
          <div class="step-line step-line-dim" />
          <!-- Step 2 -->
          <div class="flex items-center gap-2">
            <span class="step-circle step-dim">2</span>
            <span class="text-xs" style="color: hsl(220, 10%, 45%);">技能与属性</span>
          </div>
          <div class="step-line step-line-dim" />
          <!-- Step 3 -->
          <div class="flex items-center gap-2">
            <span class="step-circle step-dim">3</span>
            <span class="text-xs" style="color: hsl(220, 10%, 45%);">进入游戏</span>
          </div>
        </div>

        <h1 class="gothic-heading text-2xl font-bold text-center text-white" style="text-shadow: 0 1px 4px rgba(0,0,0,0.8);">选择职业</h1>
        <p class="mt-2 text-center text-sm" style="color: hsl(220, 10%, 60%);">
          故事：<span style="color: hsl(38, 50%, 75%);">{{ storyName || storyId || '—' }}</span>
        </p>
        <div class="mt-3 mx-auto max-w-[80px] ink-divider" />
      </div>

    <!-- Search + Filters -->
    <div class="px-6 max-w-4xl mx-auto w-full space-y-4 pb-4">
      <!-- Search bar -->
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索职业名称（中文 / 英文）…"
          class="gothic-input w-full pl-10 pr-4 py-2.5 text-sm bg-black/40 backdrop-blur-md"
        />
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
             style="color: hsl(220, 10%, 50%);"
             fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      </div>

      <!-- Era filter -->
      <div class="flex items-center gap-2">
        <span class="text-xs shrink-0" style="color: hsl(220, 10%, 30%);">时代：</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="era in eraOptions"
            :key="era.key"
            type="button"
            @click="selectedEra = era.key"
            class="filter-pill"
            :class="selectedEra === era.key ? 'filter-pill-active' : 'filter-pill-dim'"
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
          class="filter-pill"
          :class="selectedCategory === cat.key ? 'filter-pill-active' : 'filter-pill-dim'"
        >
          {{ cat.label }}
          <span v-if="categoryCounts[cat.key]" class="ml-1 opacity-60">{{ categoryCounts[cat.key] }}</span>
        </button>
      </div>
    </div>

    <!-- Occupation grid -->
    <div class="flex-1 px-6 pb-12 max-w-4xl mx-auto w-full">
      <p v-if="filteredOccupations.length === 0"
         class="text-center py-12 text-sm font-serif italic"
         style="color: hsl(220, 10%, 22%);">
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
          class="gothic-card bg-black/50 backdrop-blur-sm border-black/40 p-4 text-left group transition-all duration-300 relative
                 hover:shadow-eldritch hover:-translate-y-0.5 hover:bg-black/70"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h3 class="font-serif font-semibold transition-colors break-words"
                  style="color: hsl(38, 50%, 88%);">
                {{ occ.name }}
              </h3>
              <p class="text-xs mt-0.5 break-words" style="color: hsl(220, 10%, 30%);">{{ occ.nameEn }}</p>
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span v-if="occ.era !== 'any'"
                    class="text-[10px] px-1.5 py-0.5 rounded"
                    :class="occ.era === 'classic' ? 'era-classic' : 'era-modern'">
                {{ eraLabel(occ.era) }}
              </span>
            </div>
          </div>

          <!-- Credit range -->
          <div class="mt-3 flex items-center gap-2">
            <span class="text-[10px]" style="color: hsl(220, 10%, 25%);">信用</span>
            <div class="flex-1 h-1 rounded-full overflow-hidden" style="background: hsl(220, 16%, 11%);">
              <div class="h-full rounded-full transition-all"
                   style="background: linear-gradient(90deg, hsl(42, 55%, 32%), hsl(42, 70%, 50%));"
                   :style="{ marginLeft: occ.creditRange[0] + '%', width: (occ.creditRange[1] - occ.creditRange[0]) + '%' }" />
            </div>
            <span class="text-[10px] font-mono w-14 text-right" style="color: hsl(220, 10%, 25%);">{{ occ.creditRange[0] }}-{{ occ.creditRange[1] }}</span>
          </div>

          <!-- Hover: select indicator -->
          <span class="absolute right-3 bottom-3 text-xs px-2.5 py-1 rounded-md
                       opacity-0 group-hover:opacity-100 transition-all duration-200"
                style="background: hsla(165, 35%, 10%, 0.5);
                       border: 1px solid hsla(165, 45%, 22%, 0.3);
                       color: hsl(165, 50%, 78%);">
            选择
          </span>
        </button>
      </div>

      <!-- Count summary -->
      <p class="mt-6 text-center text-xs" style="color: hsl(220, 10%, 45%);">
        共 {{ filteredOccupations.length }} 个职业
        <span v-if="filteredOccupations.length !== COC7_OCCUPATIONS.length">
          / 总计 {{ COC7_OCCUPATIONS.length }} 个
        </span>
      </p>
    </div>
  </div>
</div>
</template>

<style scoped>
.step-circle {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: 'Cinzel Decorative', serif;
}
.step-active {
  background: hsla(165, 45%, 22%, 0.6);
  border: 1px solid hsl(165, 55%, 28%);
  color: hsl(165, 50%, 78%);
  box-shadow: 0 0 10px hsla(165, 60%, 35%, 0.2);
}
.step-dim {
  background: hsl(220, 16%, 11%);
  border: 1px solid hsl(220, 14%, 16%);
  color: hsl(220, 10%, 25%);
}
.step-line {
  width: 2rem;
  height: 1px;
}
.step-line-dim { background: hsl(220, 14%, 16%); }
.step-line-active { background: hsl(165, 55%, 28%); }

.filter-pill {
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.filter-pill-active {
  background: hsla(165, 45%, 22%, 0.3);
  border-color: hsla(165, 55%, 28%, 0.5);
  color: hsl(165, 50%, 78%);
}
.filter-pill-dim {
  background: hsla(220, 16%, 11%, 0.5);
  border-color: hsla(220, 14%, 16%, 0.5);
  color: hsl(220, 10%, 30%);
}
.filter-pill-dim:hover {
  color: hsl(38, 25%, 55%);
  border-color: hsla(220, 12%, 22%, 0.6);
}

.era-classic {
  background: hsla(42, 40%, 14%, 0.4);
  border: 1px solid hsla(42, 55%, 35%, 0.3);
  color: hsl(42, 60%, 70%);
}
.era-modern {
  background: hsla(210, 35%, 15%, 0.4);
  border: 1px solid hsla(210, 50%, 35%, 0.3);
  color: hsl(210, 50%, 70%);
}
</style>

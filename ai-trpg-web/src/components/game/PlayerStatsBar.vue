<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../../stores/gameStore'
import { getSkillName } from '../../data/coc7'
import type { COCAttributes } from '../../types/character'

const gameStore = useGameStore()
const { characterSheet, derivedStatsVersion } = storeToRefs(gameStore)

const char = computed(() => characterSheet.value)
/** 依赖 derivedStatsVersion，确保 HP/MP/SAN 被 KP 工具更新后信息栏立即刷新 */
const derived = computed(() => {
  derivedStatsVersion.value
  return char.value?.derived ?? { hp: 0, hpMax: 0, mp: 0, mpMax: 0, san: 0, sanMax: 0 }
})
const skills = computed(() => {
  const s = char.value?.skills ?? {}
  return Object.entries(s)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
})
const attributes = computed((): COCAttributes => char.value?.attributes ?? {
  str: 0, con: 0, siz: 0, dex: 0, app: 0, int: 0, pow: 0, edu: 0, luck: 0,
})

const hpPct = computed(() => {
  const max = derived.value.hpMax
  return max > 0 ? Math.min(100, Math.max(0, (derived.value.hp / max) * 100)) : 0
})
const mpPct = computed(() => {
  const max = derived.value.mpMax
  return max > 0 ? Math.min(100, Math.max(0, (derived.value.mp / max) * 100)) : 0
})
const sanPct = computed(() => {
  const max = derived.value.sanMax
  return max > 0 ? Math.min(100, Math.max(0, (derived.value.san / max) * 100)) : 0
})
</script>

<template>
  <div v-if="char" class="flex flex-wrap items-center gap-4 p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
    <div class="flex items-center gap-3 text-sm">
      <span class="font-semibold text-gray-800 dark:text-gray-100">
        {{ char.playerName }} · {{ char.occupationName }}
      </span>
    </div>
    <div class="flex flex-wrap gap-6">
      <!-- HP -->
      <div class="flex items-center gap-2 min-w-[140px]">
        <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 shrink-0">HP</span>
        <div class="flex-1 min-w-[80px]">
          <div class="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="hpPct <= 25 ? 'bg-red-600' : hpPct <= 50 ? 'bg-amber-500' : 'bg-emerald-500'"
              :style="{ width: `${hpPct}%` }"
            />
          </div>
          <div class="flex items-center justify-between mt-0.5">
            <span class="text-xs font-mono text-gray-700 dark:text-gray-300">{{ derived.hp }}/{{ derived.hpMax }}</span>
          </div>
        </div>
      </div>

      <!-- MP -->
      <div class="flex items-center gap-2 min-w-[140px]">
        <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 shrink-0">MP</span>
        <div class="flex-1 min-w-[80px]">
          <div class="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 rounded-full transition-all duration-300"
              :style="{ width: `${mpPct}%` }"
            />
          </div>
          <div class="flex items-center justify-between mt-0.5">
            <span class="text-xs font-mono text-gray-700 dark:text-gray-300">{{ derived.mp }}/{{ derived.mpMax }}</span>
          </div>
        </div>
      </div>

      <!-- SAN -->
      <div class="flex items-center gap-2 min-w-[140px]">
        <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 shrink-0">SAN</span>
        <div class="flex-1 min-w-[80px]">
          <div class="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="sanPct <= 30 ? 'bg-rose-500' : sanPct <= 60 ? 'bg-violet-500' : 'bg-indigo-500'"
              :style="{ width: `${sanPct}%` }"
            />
          </div>
          <div class="flex items-center justify-between mt-0.5">
            <span class="text-xs font-mono text-gray-700 dark:text-gray-300">{{ derived.san }}/{{ derived.sanMax }}</span>
          </div>
        </div>
      </div>

      <!-- Luck -->
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-gray-600 dark:text-gray-400">Luck</span>
        <div class="inline-flex items-center justify-center min-w-[3rem] h-8 px-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700">
          <span class="font-mono font-bold text-amber-800 dark:text-amber-200">{{ attributes.luck }}</span>
        </div>
      </div>

      <!-- Attributes summary -->
      <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span>STR {{ attributes.str }}</span>
        <span>CON {{ attributes.con }}</span>
        <span>SIZ {{ attributes.siz }}</span>
        <span>DEX {{ attributes.dex }}</span>
        <span>APP {{ attributes.app }}</span>
        <span>INT {{ attributes.int }}</span>
        <span>POW {{ attributes.pow }}</span>
        <span>EDU {{ attributes.edu }}</span>
      </div>
    </div>

    <!-- Skills row -->
    <div v-if="skills.length > 0" class="flex flex-wrap gap-x-3 gap-y-1 text-xs pt-2 border-t border-gray-200 dark:border-gray-600 mt-2">
      <span class="text-gray-500 dark:text-gray-400 shrink-0">技能：</span>
      <div class="flex flex-wrap gap-x-3 gap-y-0.5">
        <span
          v-for="[name, val] in skills"
          :key="name"
          class="text-gray-700 dark:text-gray-300"
        >
          {{ getSkillName(name) }} <span class="font-mono text-gray-600 dark:text-gray-400">{{ val }}%</span>
        </span>
      </div>
    </div>
  </div>
</template>

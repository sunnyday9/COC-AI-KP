<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../../stores/gameStore'
import { getSkillName } from '../../data/coc7'
import type { COCAttributes } from '../../types/character'

const gameStore = useGameStore()
const { characterSheet, derivedStatsVersion } = storeToRefs(gameStore)

const showSkills = ref(false)
const char = computed(() => characterSheet.value)
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
  <div v-if="char" class="border-t border-gray-800 bg-gray-900/80">
    <!-- Main stats row -->
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
      <!-- Character name -->
      <div class="flex items-center gap-2 text-sm shrink-0">
        <span class="w-6 h-6 rounded-full bg-eldritch-800 border border-eldritch-700/50
                     flex items-center justify-center text-[10px] text-parchment-300 font-serif">
          {{ char.playerName.charAt(0) }}
        </span>
        <span class="font-serif text-parchment-300 text-xs">{{ char.playerName }}</span>
      </div>

      <!-- HP bar -->
      <div class="flex items-center gap-2 min-w-[130px]">
        <span class="text-[10px] font-bold tracking-wider w-7 shrink-0"
              :class="hpPct <= 25 ? 'text-blood-300' : 'text-blood-400'">HP</span>
        <div class="flex-1">
          <div class="h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
            <div class="h-full rounded-full transition-all duration-500"
                 :class="hpPct <= 25 ? 'bg-blood-500 shadow-blood' : hpPct <= 50 ? 'bg-amber-600' : 'bg-emerald-600'"
                 :style="{ width: `${hpPct}%` }" />
          </div>
          <span class="text-[10px] font-mono text-gray-500 mt-0.5 block">{{ derived.hp }}/{{ derived.hpMax }}</span>
        </div>
      </div>

      <!-- MP bar -->
      <div class="flex items-center gap-2 min-w-[130px]">
        <span class="text-[10px] font-bold tracking-wider text-blue-400 w-7 shrink-0">MP</span>
        <div class="flex-1">
          <div class="h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
            <div class="h-full bg-blue-600 rounded-full transition-all duration-500"
                 :style="{ width: `${mpPct}%` }" />
          </div>
          <span class="text-[10px] font-mono text-gray-500 mt-0.5 block">{{ derived.mp }}/{{ derived.mpMax }}</span>
        </div>
      </div>

      <!-- SAN bar -->
      <div class="flex items-center gap-2 min-w-[130px]">
        <span class="text-[10px] font-bold tracking-wider w-7 shrink-0"
              :class="sanPct <= 30 ? 'text-rose-400' : 'text-sanity-300'">SAN</span>
        <div class="flex-1">
          <div class="h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700/50">
            <div class="h-full rounded-full transition-all duration-500"
                 :class="sanPct <= 30 ? 'bg-rose-600 shadow-blood' : sanPct <= 60 ? 'bg-violet-600' : 'bg-sanity-500'"
                 :style="{ width: `${sanPct}%` }" />
          </div>
          <span class="text-[10px] font-mono text-gray-500 mt-0.5 block">{{ derived.san }}/{{ derived.sanMax }}</span>
        </div>
      </div>

      <!-- Luck badge -->
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="text-[10px] font-bold tracking-wider text-parchment-500">Luck</span>
        <span class="font-mono font-bold text-xs text-parchment-300 bg-parchment-900/30
                     border border-parchment-700/30 rounded px-2 py-0.5">{{ attributes.luck }}</span>
      </div>

      <!-- Attributes compact -->
      <div class="hidden lg:flex items-center gap-2 text-[10px] text-gray-500 font-mono">
        <span>STR:{{ attributes.str }}</span>
        <span>CON:{{ attributes.con }}</span>
        <span>SIZ:{{ attributes.siz }}</span>
        <span>DEX:{{ attributes.dex }}</span>
        <span>INT:{{ attributes.int }}</span>
        <span>POW:{{ attributes.pow }}</span>
        <span>EDU:{{ attributes.edu }}</span>
      </div>

      <!-- Toggle skills -->
      <button v-if="skills.length > 0"
              type="button"
              @click="showSkills = !showSkills"
              class="ml-auto text-[10px] text-gray-500 hover:text-gray-300 transition-colors shrink-0">
        {{ showSkills ? '收起技能' : '展开技能' }}
      </button>
    </div>

    <!-- Skills row (collapsible) -->
    <div v-if="showSkills && skills.length > 0"
         class="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[11px] border-t border-gray-800/60 pt-2">
      <span v-for="[name, val] in skills"
            :key="name"
            class="text-gray-400">
        {{ getSkillName(name) }} <span class="font-mono text-gray-500">{{ val }}%</span>
      </span>
    </div>
  </div>
</template>

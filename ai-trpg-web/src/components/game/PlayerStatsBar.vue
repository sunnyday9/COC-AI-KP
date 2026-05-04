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
const sanPct = computed(() => {
  const max = derived.value.sanMax
  return max > 0 ? Math.min(100, Math.max(0, (derived.value.san / max) * 100)) : 0
})
</script>

<template>
  <div v-if="char" class="relative z-20">
    <!-- Main stats strip -->
    <div class="dossier-bar px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
      
      <!-- Character Identity -->
      <div class="flex items-center gap-3 shrink-0 mr-4">
        <div class="avatar-stamp flex items-center justify-center font-display text-lg">
          {{ char.playerName.charAt(0) }}
        </div>
        <div class="flex flex-col">
          <span class="font-serif text-sm tracking-wide dossier-name">{{ char.playerName }}</span>
          <span class="font-mono text-[10px] uppercase tracking-widest text-slate-500">Subject Record</span>
        </div>
      </div>

      <!-- Core Stats (Typographical) -->
      <div class="flex items-end gap-8 flex-1 min-w-[300px]">
        <!-- SAN -->
        <div class="stat-block group relative">
          <span class="stat-label">SAN</span>
          <div class="stat-values" :class="{ 'san-critical': sanPct <= 30 }">
            <span class="stat-current">{{ derived.san }}</span>
            <span class="stat-divider">/</span>
            <span class="stat-max">{{ derived.sanMax }}</span>
          </div>
        </div>

        <!-- HP -->
        <div class="stat-block group relative">
          <span class="stat-label">HP</span>
          <div class="stat-values" :class="{ 'hp-critical': hpPct <= 25 }">
            <span class="stat-current">{{ derived.hp }}</span>
            <span class="stat-divider">/</span>
            <span class="stat-max">{{ derived.hpMax }}</span>
          </div>
        </div>

        <!-- MP -->
        <div class="stat-block group relative">
          <span class="stat-label">MP</span>
          <div class="stat-values">
            <span class="stat-current">{{ derived.mp }}</span>
            <span class="stat-divider">/</span>
            <span class="stat-max">{{ derived.mpMax }}</span>
          </div>
        </div>
        
        <!-- Luck -->
        <div class="stat-block group relative">
          <span class="stat-label">LUCK</span>
          <div class="stat-values luck-values">
            <span class="stat-current">{{ attributes.luck }}</span>
          </div>
        </div>
      </div>

      <!-- Attributes Strip (Desktop only) -->
      <div class="hidden xl:flex items-center gap-2 text-[11px] font-mono tracking-widest attr-strip px-4 py-1">
        <span>STR.{{ attributes.str }}</span><span class="attr-dot">·</span>
        <span>CON.{{ attributes.con }}</span><span class="attr-dot">·</span>
        <span>SIZ.{{ attributes.siz }}</span><span class="attr-dot">·</span>
        <span>DEX.{{ attributes.dex }}</span><span class="attr-dot">·</span>
        <span>INT.{{ attributes.int }}</span><span class="attr-dot">·</span>
        <span>POW.{{ attributes.pow }}</span><span class="attr-dot">·</span>
        <span>EDU.{{ attributes.edu }}</span>
      </div>

      <!-- Drawer Toggle -->
      <button v-if="skills.length > 0"
              type="button"
              @click="showSkills = !showSkills"
              class="ml-auto flex items-center gap-2 px-3 py-1.5 classified-tab shrink-0 transition-all duration-300"
              :class="{ 'tab-active': showSkills }">
        <span class="w-1.5 h-1.5 rounded-full" :class="showSkills ? 'bg-eldritch-400' : 'bg-slate-500'"></span>
        <span>[ CLASSIFIED: SKILLS ]</span>
      </button>
    </div>

    <!-- Skills Drawer (Absolute Overlay) -->
    <transition name="drawer">
      <div v-if="showSkills && skills.length > 0" class="skills-drawer absolute bottom-full left-0 w-full p-6 shadow-2xl">
        <div class="flex items-center justify-between mb-6 border-b border-white/5 pb-3">
          <h3 class="font-display text-lg tracking-widest text-parchment-300">Investigator Competencies</h3>
          <button @click="showSkills = false" class="text-slate-500 hover:text-parchment-300 transition-colors">
            <span class="font-mono text-xs">[ CLOSE ]</span>
          </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          <div v-for="[name, val] in skills" :key="name" class="flex justify-between items-baseline group border-b border-white/5 pb-1">
            <span class="font-serif text-sm text-slate-300 group-hover:text-parchment-200 transition-colors">{{ getSkillName(name) }}</span>
            <span class="font-mono text-sm text-parchment-500">{{ val }}</span>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.dossier-bar {
  background: hsla(220, 18%, 7%, 0.95);
  border-top: 1px solid hsla(220, 14%, 22%, 0.8);
  box-shadow: 0 -4px 24px hsla(220, 20%, 4%, 0.8);
  backdrop-filter: blur(12px);
}

.avatar-stamp {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 4px;
  background: hsla(38, 18%, 18%, 0.4);
  border: 1px solid hsla(38, 20%, 30%, 0.3);
  color: hsl(38, 35%, 68%);
  box-shadow: inset 0 0 10px hsla(220, 20%, 4%, 0.5);
}

.dossier-name {
  color: hsl(38, 50%, 88%);
}

.stat-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
}

.stat-label {
  font-family: 'Fira Code', monospace;
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  color: hsl(220, 10%, 40%);
  text-transform: uppercase;
}

.stat-values {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  font-family: 'Crimson Text', serif;
}

.stat-current {
  font-size: 1.75rem;
  line-height: 1;
  color: hsl(38, 40%, 78%);
  transition: all 0.3s ease;
}

.stat-divider {
  font-size: 1rem;
  color: hsl(220, 10%, 30%);
}

.stat-max {
  font-size: 1rem;
  color: hsl(220, 10%, 40%);
}

/* Critical States */
.san-critical .stat-current {
  color: hsl(330, 60%, 65%);
  text-shadow: 0 0 12px hsla(330, 60%, 50%, 0.6), 0 0 24px hsla(330, 60%, 40%, 0.4);
  animation: sanity-flicker 3s ease-in-out infinite alternate;
}

.hp-critical .stat-current {
  color: hsl(0, 60%, 60%);
  text-shadow: 0 0 12px hsla(0, 65%, 45%, 0.6);
  animation: pulse-slow 2s ease-in-out infinite;
}

.luck-values .stat-current {
  color: hsl(42, 50%, 60%);
  font-size: 1.25rem;
}

.attr-strip {
  background: hsla(220, 16%, 11%, 0.5);
  border: 1px solid hsla(220, 14%, 16%, 0.5);
  border-radius: 4px;
  color: hsl(220, 10%, 40%);
}

.attr-dot {
  color: hsl(220, 14%, 22%);
}

.classified-tab {
  font-family: 'Fira Code', monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: hsl(220, 10%, 40%);
  background: hsla(220, 16%, 11%, 0.6);
  border: 1px solid hsla(220, 14%, 22%, 0.4);
  border-radius: 4px;
}

.classified-tab:hover, .tab-active {
  color: hsl(38, 35%, 68%);
  border-color: hsla(38, 30%, 40%, 0.4);
  background: hsla(220, 16%, 14%, 0.8);
}

.skills-drawer {
  background: hsla(220, 18%, 6%, 0.96);
  border-top: 1px solid hsla(38, 20%, 30%, 0.2);
  backdrop-filter: blur(16px);
  max-height: 50vh;
  overflow-y: auto;
}

/* Animations */
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(20px);
  opacity: 0;
}

@keyframes sanity-flicker {
  0%, 100% { opacity: 1; text-shadow: 0 0 12px hsla(330, 60%, 50%, 0.6); }
  30% { opacity: 0.8; text-shadow: 0 0 16px hsla(330, 60%, 50%, 0.8); }
  40% { opacity: 1; text-shadow: 0 0 8px hsla(330, 60%, 50%, 0.4); }
  80% { opacity: 0.9; text-shadow: 0 0 20px hsla(330, 60%, 50%, 0.7); }
}

@keyframes pulse-slow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>

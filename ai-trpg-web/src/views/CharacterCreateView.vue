<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { OCCUPATION_SKILL_VALUES, PERSONAL_INTEREST_BONUS, PERSONAL_INTEREST_COUNT } from '../types/character'
import {
  COC7_OCCUPATIONS,
  COC7_SKILLS,
  INTERPERSONAL_SKILL_IDS,
  getSkillName,
} from '../data/coc7'
import {
  buildCharacterSheet as buildSheet,
  rollAttributes,
  getSkillBase,
} from '../logic/coc7Character'
import type { COCAttributes } from '../types/character'

const router = useRouter()
const gameStore = useGameStore()
const { selectedOccupationId, selectedOccupationName } = storeToRefs(gameStore)

const occupation = computed(() =>
  COC7_OCCUPATIONS.find((o) => o.id === selectedOccupationId.value) ?? null
)

const occupationSkillKeys = ref<string[]>([])
const slotTypes = ref<('fixed' | 'interpersonal' | 'any')[]>([])
const attributes = ref<COCAttributes | null>(null)
const personalInterestKeys = ref<string[]>(['', '', '', ''])
const playerName = ref('调查员')
const attrAnimating = ref(false)

function availableForAnySlot(slotIndex: number): string[] {
  const keys = occupationSkillKeys.value
  const used = new Set<string>()
  keys.forEach((k, idx) => {
    if (k && idx !== slotIndex) used.add(k)
  })
  return COC7_SKILLS.filter((s) => s.id !== 'Cthulhu Mythos' && (!used.has(s.id) || keys[slotIndex] === s.id)).map((s) => s.id)
}

function availableForInterpersonalSlot(slotIndex: number): string[] {
  const occKeys = occupationSkillKeys.value
  const used = new Set<string>()
  occKeys.forEach((k, idx) => {
    if (k && idx !== slotIndex) used.add(k)
  })
  return INTERPERSONAL_SKILL_IDS.filter((id) => !used.has(id) || occKeys[slotIndex] === id)
}

function interestSkillLabel(skillId: string): string {
  const occIdx = occupationSkillKeys.value.indexOf(skillId)
  const base = getSkillBase(skillId)
  if (occIdx >= 0 && OCCUPATION_SKILL_VALUES[occIdx] != null) {
    const occVal = OCCUPATION_SKILL_VALUES[occIdx]
    return `${getSkillName(skillId)} (职业${occVal}% → ${Math.min(99, occVal + PERSONAL_INTEREST_BONUS)}%)`
  }
  return `${getSkillName(skillId)} (基础${base}% → ${Math.min(99, base + PERSONAL_INTEREST_BONUS)}%)`
}

function availableForInterestSlot(slotIndex: number): string[] {
  const interestKeys = personalInterestKeys.value
  const used = new Set<string>()
  interestKeys.forEach((k, idx) => {
    if (k && idx !== slotIndex) used.add(k)
  })
  return COC7_SKILLS.filter(
    (s) => s.id !== 'Cthulhu Mythos' && (!used.has(s.id) || interestKeys[slotIndex] === s.id)
  ).map((s) => s.id)
}

function initOccupationSlots() {
  if (!occupation.value) return
  const template = occupation.value.skillTemplate
  const keys: string[] = []
  const types: ('fixed' | 'interpersonal' | 'any')[] = []
  for (let i = 0; i < 8; i++) {
    const t = template[i]
    if (t === 'interpersonal') {
      keys.push(INTERPERSONAL_SKILL_IDS[0])
      types.push('interpersonal')
    } else if (t === 'any') {
      keys.push('')
      types.push('any')
    } else {
      keys.push(t ?? '')
      types.push('fixed')
    }
  }
  keys.push('Credit Rating')
  types.push('fixed')
  occupationSkillKeys.value = keys
  slotTypes.value = types
}

function setSlotSkill(index: number, skillId: string) {
  const next = [...occupationSkillKeys.value]
  next[index] = skillId
  occupationSkillKeys.value = next
}

function setPersonalInterest(index: number, skillId: string) {
  const next = [...personalInterestKeys.value]
  next[index] = skillId
  personalInterestKeys.value = next
}

function rollAttrs() {
  attrAnimating.value = true
  attributes.value = rollAttributes()
  setTimeout(() => { attrAnimating.value = false }, 600)
}

function canConfirm(): boolean {
  if (!occupation.value || !attributes.value || !playerName.value.trim()) return false
  const occ = occupationSkillKeys.value
  if (occ.length !== 9 || occ.some((k) => !k)) return false
  const pers = personalInterestKeys.value.filter(Boolean)
  if (pers.length < PERSONAL_INTEREST_COUNT) return false
  return true
}

function confirm() {
  if (!canConfirm() || !occupation.value || !attributes.value) return
  const sheet = buildSheet(
    occupation.value.id,
    occupation.value.name,
    playerName.value.trim(),
    occupationSkillKeys.value,
    personalInterestKeys.value.filter(Boolean),
    attributes.value
  )
  gameStore.setCharacterSheet(sheet)
  gameStore.confirmCharacterAndEnterGame()
  router.push('/game')
}

onMounted(() => {
  if (!selectedOccupationId.value) {
    router.replace('/occupation')
    return
  }
  initOccupationSlots()
})
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Progress indicator -->
    <div class="px-6 pt-8 pb-4 max-w-3xl mx-auto w-full">
      <div class="flex items-center justify-center gap-2 mb-6">
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-eldritch-800 border border-eldritch-700/50
                       flex items-center justify-center text-xs text-eldritch-300">✓</span>
          <span class="text-xs text-gray-500">选择职业</span>
        </div>
        <div class="w-8 h-px bg-eldritch-600" />
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-eldritch-600 border border-eldritch-500
                       flex items-center justify-center text-xs font-bold text-parchment-200">2</span>
          <span class="text-xs font-medium text-parchment-300">技能与属性</span>
        </div>
        <div class="w-8 h-px bg-gray-700" />
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-gray-800 border border-gray-700
                       flex items-center justify-center text-xs text-gray-500">3</span>
          <span class="text-xs text-gray-600">进入游戏</span>
        </div>
      </div>

      <h1 class="gothic-heading text-2xl font-bold text-center">创建角色</h1>
      <p class="mt-1 text-center text-sm text-gray-500">
        职业：<span class="text-parchment-400 font-serif">{{ selectedOccupationName }}</span>
      </p>
      <div class="mt-2 mx-auto w-16 h-px bg-gradient-to-r from-transparent via-eldritch-500 to-transparent" />
    </div>

    <!-- Content -->
    <div class="flex-1 px-6 pb-12 max-w-3xl mx-auto w-full space-y-8">

      <!-- Occupation Skills -->
      <section class="gothic-card p-5">
        <h2 class="gothic-heading text-base font-semibold mb-4 flex items-center gap-2">
          <span class="text-eldritch-400">⚔</span>
          职业技能
          <span class="text-xs font-normal text-gray-500 font-body">(9 项：70, 60, 60, 50, 50, 50, 40, 40, 40)</span>
        </h2>
        <div class="space-y-2">
          <div
            v-for="(key, i) in occupationSkillKeys"
            :key="i"
            class="flex items-center gap-3 py-1.5"
          >
            <span class="w-10 text-right text-xs font-mono font-bold shrink-0"
                  :class="(OCCUPATION_SKILL_VALUES[i] ?? 0) >= 60 ? 'text-parchment-300' : 'text-gray-500'">
              {{ OCCUPATION_SKILL_VALUES[i] ?? 0 }}%
            </span>

            <!-- Fixed skill -->
            <span v-if="slotTypes[i] === 'fixed'"
                  class="text-sm text-parchment-200 font-medium">
              {{ getSkillName(key) }}
            </span>

            <!-- Interpersonal selector -->
            <select v-else-if="slotTypes[i] === 'interpersonal'"
                    :value="key"
                    @change="(e) => setSlotSkill(i, (e.target as HTMLSelectElement).value)"
                    class="gothic-select text-sm min-w-[12rem] max-w-xs py-1.5">
              <option value="">— 选择人际技能 —</option>
              <option v-for="sid in availableForInterpersonalSlot(i)" :key="sid" :value="sid">{{ getSkillName(sid) }}</option>
            </select>

            <!-- Any skill selector -->
            <select v-else
                    :value="key"
                    @change="(e) => setSlotSkill(i, (e.target as HTMLSelectElement).value)"
                    class="gothic-select text-sm min-w-[12rem] max-w-xs py-1.5">
              <option value="">— 选择技能 —</option>
              <option v-for="sid in availableForAnySlot(i)" :key="sid" :value="sid">{{ getSkillName(sid) }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Attributes -->
      <section class="gothic-card p-5">
        <h2 class="gothic-heading text-base font-semibold mb-4 flex items-center gap-2">
          <span class="text-amber-400">🎲</span>
          属性投掷
          <span class="text-xs font-normal text-gray-500 font-body">(3d6×5)</span>
        </h2>
        <button type="button" @click="rollAttrs"
                class="gothic-btn text-sm px-5">
          {{ attributes ? '重新投掷' : '投掷属性' }}
        </button>
        <div v-if="attributes"
             class="mt-4 grid grid-cols-3 gap-3"
             :class="{ 'animate-fade-in': attrAnimating }">
          <div v-for="(v, k) in attributes" :key="k"
               class="flex items-center justify-between px-3 py-2 rounded-lg
                      bg-gray-800/60 border border-gray-700/50">
            <span class="text-xs font-bold tracking-wider text-gray-400 uppercase">{{ k }}</span>
            <span class="font-mono font-bold text-parchment-200">{{ v }}</span>
          </div>
        </div>
      </section>

      <!-- Personal Interest Skills -->
      <section class="gothic-card p-5">
        <h2 class="gothic-heading text-base font-semibold mb-4 flex items-center gap-2">
          <span class="text-cthulhu-300">✦</span>
          兴趣技能
          <span class="text-xs font-normal text-gray-500 font-body">(任选 4 项，每项 +20%，可与职业技能重叠叠加)</span>
        </h2>
        <div class="space-y-2">
          <div v-for="(pk, idx) in personalInterestKeys" :key="idx"
               class="flex items-center gap-3">
            <span class="w-10 text-right text-xs font-mono text-cthulhu-400 shrink-0">+{{ PERSONAL_INTEREST_BONUS }}%</span>
            <select :value="pk"
                    @change="(e) => setPersonalInterest(idx, (e.target as HTMLSelectElement).value)"
                    class="gothic-select text-sm flex-1 max-w-md py-1.5">
              <option value="">— 选择 —</option>
              <option v-for="sid in availableForInterestSlot(idx)" :key="sid" :value="sid">
                {{ interestSkillLabel(sid) }}
              </option>
            </select>
          </div>
        </div>
      </section>

      <!-- Player Name -->
      <section class="gothic-card p-5">
        <h2 class="gothic-heading text-base font-semibold mb-3 flex items-center gap-2">
          <span class="text-parchment-400">✎</span>
          调查员姓名
        </h2>
        <input v-model="playerName" type="text"
               class="gothic-input max-w-xs text-sm"
               placeholder="调查员" />
      </section>

      <!-- Action buttons -->
      <div class="flex items-center gap-3 pt-2 pb-4">
        <button type="button"
                @click="router.push('/occupation')"
                class="gothic-btn-secondary text-sm">
          返回选职业
        </button>
        <button type="button"
                @click="confirm"
                :disabled="!canConfirm()"
                class="gothic-btn text-sm px-6">
          确认角色并进入游戏
        </button>
      </div>
    </div>
  </div>
</template>

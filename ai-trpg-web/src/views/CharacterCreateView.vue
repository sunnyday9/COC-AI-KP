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
  <div class="min-h-screen flex flex-col relative bg-cover bg-center bg-no-repeat bg-fixed"
       style="background-image: url('/src/assets/bg/bg_desk.png');">
    <!-- Thematic dark overlay for contrast -->
    <div class="absolute inset-0 bg-black/70 pointer-events-none z-0"></div>

    <div class="relative z-10 flex flex-col flex-1">
      <!-- Progress indicator -->
      <div class="px-6 pt-8 pb-4 max-w-3xl mx-auto w-full">
        <div class="flex items-center justify-center gap-2 mb-6">
          <div class="flex items-center gap-2">
            <span class="step-circle step-done">✓</span>
            <span class="text-xs" style="color: hsl(220, 10%, 60%);">选择职业</span>
          </div>
          <div class="step-line step-line-active" />
          <div class="flex items-center gap-2">
            <span class="step-circle step-active">2</span>
            <span class="text-xs font-medium" style="color: hsl(38, 35%, 85%);">技能与属性</span>
          </div>
          <div class="step-line step-line-dim" />
          <div class="flex items-center gap-2">
            <span class="step-circle step-dim">3</span>
            <span class="text-xs" style="color: hsl(220, 10%, 45%);">进入游戏</span>
          </div>
        </div>

        <h1 class="gothic-heading text-2xl font-bold text-center text-white" style="text-shadow: 0 1px 4px rgba(0,0,0,0.8);">创建角色</h1>
        <p class="mt-1 text-center text-sm" style="color: hsl(220, 10%, 60%);">
          职业：<span class="font-display" style="color: hsl(38, 50%, 75%); text-shadow: 0 0 10px rgba(0,0,0,0.5);">{{ selectedOccupationName }}</span>
        </p>
        <div class="mt-3 mx-auto max-w-[80px] ink-divider" />
      </div>

    <!-- Content -->
    <div class="flex-1 px-6 pb-12 max-w-3xl mx-auto w-full space-y-8">

      <!-- Occupation Skills -->
      <section class="gothic-card bg-black/50 p-6">
        <h2 class="gothic-heading text-base font-bold mb-4 flex items-center gap-2">
          <span style="color: hsl(165, 50%, 60%);">⚔</span>
          职业技能
          <span class="text-xs font-normal font-body" style="color: hsl(220, 10%, 60%);">(9 项：70, 60, 60, 50, 50, 50, 40, 40, 40)</span>
        </h2>
        <div class="space-y-2">
          <div
            v-for="(key, i) in occupationSkillKeys"
            :key="i"
            class="flex items-center gap-3 py-1.5"
          >
            <span class="w-10 text-right text-xs font-mono font-bold shrink-0"
                  :style="{ color: (OCCUPATION_SKILL_VALUES[i] ?? 0) >= 60 ? 'hsl(38, 35%, 68%)' : 'hsl(220, 10%, 30%)' }">
              {{ OCCUPATION_SKILL_VALUES[i] ?? 0 }}%
            </span>

            <!-- Fixed skill -->
            <span v-if="slotTypes[i] === 'fixed'"
                  class="text-sm font-serif font-medium" style="color: hsl(38, 40%, 78%);">
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
      <section class="gothic-card bg-black/50 p-6">
        <h2 class="gothic-heading text-base font-bold mb-4 flex items-center gap-2">
          <span style="color: hsl(42, 65%, 65%);">🎲</span>
          属性投掷
          <span class="text-xs font-normal font-body" style="color: hsl(220, 10%, 60%);">(3d6×5)</span>
        </h2>
        <button type="button" @click="rollAttrs" class="gothic-btn text-sm px-5">
          {{ attributes ? '重新投掷' : '投掷属性' }}
        </button>
        <div v-if="attributes"
             class="mt-4 grid grid-cols-3 gap-3"
             :class="{ 'animate-fade-in': attrAnimating }">
          <div v-for="(v, k) in attributes" :key="k"
               class="flex items-center justify-between px-3 py-2.5 rounded-lg attr-cell">
            <span class="text-xs font-bold tracking-wider uppercase font-mono" style="color: hsl(220, 10%, 30%);">{{ k }}</span>
            <span class="font-mono font-bold" style="color: hsl(38, 50%, 88%);">{{ v }}</span>
          </div>
        </div>
      </section>

      <!-- Personal Interest Skills -->
      <section class="gothic-card bg-black/50 p-6">
        <h2 class="gothic-heading text-base font-bold mb-4 flex items-center gap-2">
          <span style="color: hsl(165, 50%, 60%);">✦</span>
          兴趣技能
          <span class="text-xs font-normal font-body" style="color: hsl(220, 10%, 60%);">(任选 4 项，每项 +20%，可与职业技能重叠叠加)</span>
        </h2>
        <div class="space-y-2">
          <div v-for="(pk, idx) in personalInterestKeys" :key="idx"
               class="flex items-center gap-3">
            <span class="w-10 text-right text-xs font-mono shrink-0" style="color: hsl(165, 50%, 50%);">+{{ PERSONAL_INTEREST_BONUS }}%</span>
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
      <section class="gothic-card bg-black/50 p-6">
        <h2 class="gothic-heading text-base font-bold mb-3 flex items-center gap-2">
          <span style="color: hsl(38, 30%, 65%);">✎</span>
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
                class="gothic-btn text-sm px-6 bg-black/60">
          确认角色并进入游戏
        </button>
      </div>
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
.step-done {
  background: hsla(165, 40%, 15%, 0.5);
  border: 1px solid hsla(165, 45%, 22%, 0.5);
  color: hsl(165, 50%, 60%);
}
.step-dim {
  background: hsl(220, 16%, 11%);
  border: 1px solid hsl(220, 14%, 16%);
  color: hsl(220, 10%, 25%);
}
.step-line { width: 2rem; height: 1px; }
.step-line-dim { background: hsl(220, 14%, 16%); }
.step-line-active { background: hsl(165, 55%, 28%); }

.attr-cell {
  background: hsla(220, 16%, 11%, 0.6);
  border: 1px solid hsla(220, 14%, 16%, 0.5);
}
</style>

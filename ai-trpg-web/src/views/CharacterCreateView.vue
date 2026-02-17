<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'
import { OCCUPATION_SKILL_VALUES, PERSONAL_INTEREST_COUNT } from '../types/character'
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

/** 9 个职业技能键（8 来自模板解析 + Credit Rating），与 OCCUPATION_SKILL_VALUES 一一对应 */
const occupationSkillKeys = ref<string[]>([])
/** 每个槽位是固定技能还是需选择：'fixed' | 'interpersonal' | 'any' */
const slotTypes = ref<('fixed' | 'interpersonal' | 'any')[]>([])
/** 属性（投掷后填入） */
const attributes = ref<COCAttributes | null>(null)
/** 4 个兴趣技能 id */
const personalInterestKeys = ref<string[]>(['', '', '', ''])
const playerName = ref('调查员')

/** 可选技能：用于「任选一」槽位（排除其他槽位已选，但保留当前槽位已选以便显示） */
function availableForAnySlot(slotIndex: number): string[] {
  const keys = occupationSkillKeys.value
  const used = new Set<string>()
  keys.forEach((k, idx) => {
    if (k && idx !== slotIndex) used.add(k)
  })
  return COC7_SKILLS.filter((s) => s.id !== 'Cthulhu Mythos' && (!used.has(s.id) || keys[slotIndex] === s.id)).map((s) => s.id)
}

/** 人际技能可选：排除其他槽位已选（含职业技和其他人际槽位），保留当前槽位已选 */
function availableForInterpersonalSlot(slotIndex: number): string[] {
  const occKeys = occupationSkillKeys.value
  const used = new Set<string>()
  occKeys.forEach((k, idx) => {
    if (k && idx !== slotIndex) used.add(k)
  })
  return INTERPERSONAL_SKILL_IDS.filter((id) => !used.has(id) || occKeys[slotIndex] === id)
}

/** 兴趣技能可选：仅排除其他兴趣槽位已选（可与职业技能重叠，叠加成功率），保留当前槽位已选 */
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
  attributes.value = rollAttributes()
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
  <div class="p-6 max-w-2xl space-y-6">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">创建角色</h1>
    <p class="text-gray-600 dark:text-gray-400">
      职业：<strong>{{ selectedOccupationName }}</strong>。分配职业技能与兴趣技能，投掷属性。此步骤不使用 AI。
    </p>

    <section>
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-4">职业技能（9 项：70, 60, 60, 50, 50, 50, 40, 40, 40）</h2>
      <ul class="mt-2 space-y-2">
        <li
          v-for="(key, i) in occupationSkillKeys"
          :key="i"
          class="flex items-center gap-2 flex-wrap"
        >
          <span class="w-8 text-gray-500 dark:text-gray-400">{{ OCCUPATION_SKILL_VALUES[i] }}%</span>
          <template v-if="slotTypes[i] === 'fixed'">
            <span class="font-medium text-gray-900 dark:text-gray-100">{{ getSkillName(key) }}</span>
          </template>
          <template v-else-if="slotTypes[i] === 'interpersonal'">
            <select
              :value="key"
              @change="(e) => setSlotSkill(i, (e.target as HTMLSelectElement).value)"
              class="block min-w-[11rem] py-2 px-3 min-h-[2.5rem] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— 选择 —</option>
              <option v-for="sid in availableForInterpersonalSlot(i)" :key="sid" :value="sid">{{ getSkillName(sid) }}</option>
            </select>
          </template>
          <template v-else>
            <select
              :value="key"
              @change="(e) => setSlotSkill(i, (e.target as HTMLSelectElement).value)"
              class="block min-w-[11rem] py-2 px-3 min-h-[2.5rem] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">— 选择 —</option>
              <option v-for="sid in availableForAnySlot(i)" :key="sid" :value="sid">{{ getSkillName(sid) }}</option>
            </select>
          </template>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-4">属性（3d6×5）</h2>
      <button
        type="button"
        @click="rollAttrs"
        class="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700"
      >
        投掷属性
      </button>
      <div v-if="attributes" class="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div v-for="(v, k) in attributes" :key="k" class="capitalize">
          {{ k }}: <strong>{{ v }}</strong>
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-4">兴趣技能（任选 4 项，每项 +20%）</h2>
      <ul class="mt-2 space-y-2">
        <li v-for="(pk, idx) in personalInterestKeys" :key="idx" class="flex items-center gap-2">
          <select
            :value="pk"
            @change="(e) => setPersonalInterest(idx, (e.target as HTMLSelectElement).value)"
            class="block w-full min-w-[14rem] max-w-md py-2 px-3 min-h-[2.5rem] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">— 选择 —</option>
            <option v-for="sid in availableForInterestSlot(idx)" :key="sid" :value="sid">
              {{ getSkillName(sid) }} (基础{{ getSkillBase(sid) }}% → {{ getSkillBase(sid) + 20 }}%)
            </option>
          </select>
        </li>
      </ul>
    </section>

    <section>
      <label class="block text-gray-700 dark:text-gray-300 mt-4">调查员姓名</label>
      <input
        v-model="playerName"
        type="text"
        class="mt-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-gray-100 w-48"
        placeholder="调查员"
      />
    </section>

    <div class="flex gap-3 pt-4">
      <button
        type="button"
        @click="router.push('/occupation')"
        class="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300"
      >
        返回选职业
      </button>
      <button
        type="button"
        @click="confirm"
        :disabled="!canConfirm()"
        class="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        确认角色并进入游戏
      </button>
    </div>
  </div>
</template>

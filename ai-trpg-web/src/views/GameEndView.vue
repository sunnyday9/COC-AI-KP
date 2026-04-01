<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useGameStore } from '../stores/gameStore'

const router = useRouter()
const gameStore = useGameStore()
const { endingState, storyName, storyId, playerName } = storeToRefs(gameStore)

const exporting = ref(false)

const title = computed(() => endingState.value?.title || '结局')
const outcome = computed(() => endingState.value?.outcome || 'unknown')
const summary = computed(() => endingState.value?.summary || '')

const outcomeLabel = computed(() => {
  const o = outcome.value
  if (o === 'victory') return '胜利'
  if (o === 'defeat') return '失败'
  if (o === 'partial') return '部分成功'
  if (o === 'survival') return '幸存'
  return '未知'
})

function download(name: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function buildMarkdownReport(): string {
  const e = endingState.value
  if (!e) return '# 结局报告\n\n(无结局数据)\n'
  const lines: string[] = []
  lines.push(`# 结局报告：${e.title}`)
  lines.push('')
  lines.push(`- **故事**: ${e.storyName || storyName.value || storyId.value || ''}`)
  lines.push(`- **调查员**: ${playerName.value || ''}`)
  lines.push(`- **结局**: ${outcomeLabel.value} (${e.outcome})`)
  lines.push(`- **结束时间**: ${new Date(e.endedAt).toLocaleString('zh-CN')}`)
  lines.push('')
  lines.push('## 总结')
  lines.push(e.summary)
  lines.push('')
  if (e.keyFacts?.length) {
    lines.push('## 关键事实 / 真相')
    for (const f of e.keyFacts) lines.push(`- ${f}`)
    lines.push('')
  }
  if (e.epilogueOptions?.length) {
    lines.push('## 尾声 / 后续选项')
    for (const o of e.epilogueOptions) lines.push(`- ${o}`)
    lines.push('')
  }
  if (e.scenesVisited?.length) {
    lines.push('## 到访场景')
    for (const s of e.scenesVisited) lines.push(`- ${s}`)
    lines.push('')
  }
  if (e.cluesObtained?.length) {
    lines.push('## 获得线索')
    for (const c of e.cluesObtained) lines.push(`- ${c}`)
    lines.push('')
  }
  if (e.finalSnapshot) {
    lines.push('## 最终状态')
    const fs = e.finalSnapshot
    lines.push(`- HP: ${fs.hp ?? '?'} / ${fs.hpMax ?? '?'}`)
    lines.push(`- SAN: ${fs.san ?? '?'} / ${fs.sanMax ?? '?'}`)
    lines.push(`- MP: ${fs.mp ?? '?'} / ${fs.mpMax ?? '?'}`)
    if (fs.luck != null) lines.push(`- Luck: ${fs.luck}`)
    if (fs.insanityState) lines.push(`- Insanity: ${fs.insanityState}`)
    if (fs.dailySanLoss != null) lines.push(`- Daily SAN Loss: ${fs.dailySanLoss}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function exportReport() {
  exporting.value = true
  try {
    const md = buildMarkdownReport()
    const json = JSON.stringify(endingState.value ?? {}, null, 2)
    download(`ending-report-${Date.now()}.md`, md, 'text/markdown;charset=utf-8')
    download(`ending-report-${Date.now()}.json`, json, 'application/json;charset=utf-8')
  } finally {
    exporting.value = false
  }
}

function startNew() {
  gameStore.reset()
  router.replace('/')
}
</script>

<template>
  <div class="min-h-screen px-6 py-10 max-w-4xl mx-auto">
    <div class="gothic-card p-6 md:p-8">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="font-serif text-2xl md:text-3xl text-parchment-200 tracking-wide truncate">
            {{ title }}
          </h1>
          <p class="mt-2 text-sm text-gray-400">
            {{ outcomeLabel }} · {{ storyName || storyId }} · {{ playerName }}
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="gothic-btn-secondary text-sm" @click="router.replace('/game')">
            回看对话
          </button>
          <button class="gothic-btn text-sm" :disabled="exporting" @click="exportReport">
            {{ exporting ? '导出中...' : '导出报告' }}
          </button>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-2">
          <h2 class="font-serif text-parchment-200 text-lg mb-2">结局总结</h2>
          <div class="p-4 rounded-lg bg-gray-950/40 border border-gray-800 text-sm text-parchment-200 leading-relaxed whitespace-pre-wrap">
            {{ summary || '（无结局摘要）' }}
          </div>
        </div>
        <div class="md:col-span-1 space-y-4">
          <div v-if="endingState?.keyFacts?.length" class="p-4 rounded-lg bg-gray-950/40 border border-gray-800">
            <h3 class="text-sm text-parchment-200 font-serif mb-2">关键事实</h3>
            <ul class="text-xs text-gray-300 space-y-1">
              <li v-for="(f, idx) in endingState.keyFacts" :key="idx">- {{ f }}</li>
            </ul>
          </div>
          <div v-if="endingState?.epilogueOptions?.length" class="p-4 rounded-lg bg-gray-950/40 border border-gray-800">
            <h3 class="text-sm text-parchment-200 font-serif mb-2">尾声选项</h3>
            <ul class="text-xs text-gray-300 space-y-1">
              <li v-for="(o, idx) in endingState.epilogueOptions" :key="idx">- {{ o }}</li>
            </ul>
          </div>
          <div class="p-4 rounded-lg bg-gray-950/40 border border-gray-800">
            <h3 class="text-sm text-parchment-200 font-serif mb-2">下一步</h3>
            <div class="flex flex-col gap-2">
              <button class="gothic-btn text-sm" @click="startNew">开始新游戏</button>
              <router-link to="/scripts" class="gothic-btn-secondary text-sm text-center">故事管理</router-link>
              <router-link to="/settings" class="gothic-btn-secondary text-sm text-center">设置</router-link>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 rounded-lg bg-gray-950/40 border border-gray-800">
          <h3 class="text-sm text-parchment-200 font-serif mb-2">到访场景</h3>
          <div v-if="endingState?.scenesVisited?.length" class="text-xs text-gray-300 space-y-1">
            <div v-for="(s, idx) in endingState.scenesVisited" :key="idx">- {{ s }}</div>
          </div>
          <p v-else class="text-xs text-gray-500">（无记录）</p>
        </div>
        <div class="p-4 rounded-lg bg-gray-950/40 border border-gray-800">
          <h3 class="text-sm text-parchment-200 font-serif mb-2">获得线索</h3>
          <div v-if="endingState?.cluesObtained?.length" class="text-xs text-gray-300 space-y-1 max-h-40 overflow-auto pr-1">
            <div v-for="(c, idx) in endingState.cluesObtained" :key="idx">- {{ c }}</div>
          </div>
          <p v-else class="text-xs text-gray-500">（无记录）</p>
        </div>
      </div>
    </div>
  </div>
</template>


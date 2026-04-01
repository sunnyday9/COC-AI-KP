# 记忆与 Prompt 管理优化设计文档

**日期**: 2026-03-31  
**最后更新**: 2026-04-01（第 17 节：Trace A–F 实施记录）  
**依据**: `TRACE-ANALYSIS-SESSION-1.md` 中对 12 轮实际游戏 trace 的分析
**范围**: 8 个问题的全量修复
**实施状态**: ✅ 第 1–11 节（原 8 项 + Code Review）已完成；✅ 第 12–16 节（Trace A–F）**已部分落地代码**（见第 **17** 节实施记录与待办）

---

## 0. 问题总览

| # | 优先级 | 问题 | 根因文件 | 影响 |
|---|--------|------|----------|------|
| 1 | P0 | kpMemory 存完整回复→prompt 膨胀 | `gameStore.ts`, `kpPromptService.ts` | 12 轮 prompt +133% |
| 2 | P0 | longTermSummary 更新频率过低 | `gameStore.ts`, `memoryService.ts` | 6 轮无更新，关键事件丢失 |
| 3 | P1 | chunkCount 追踪全程为 0 | `ragService.ts` | 无法评估检索质量 |
| 4 | P1 | GraphRAG/UserGraph 追踪失真 | `ragService.ts`, `gameStore.ts` | 可观测性数据不可信 |
| 5 | P1 | Combat Agent 每次触发 forceTools | `kpGraph.mjs` | 额外 LLM 调用+延迟 |
| 6 | P2 | Scene-change RAG query 过长 | `gameStore.ts` | 检索精度下降 |
| 7 | P2 | Opening 路由到 generic 而非 narrative | `kpGraph.mjs` | 叙事受限 |
| 8 | P2 | longTermSummary 过短 | `memoryService.ts` | 信息压缩过度 |

---

## 1. [P0] kpMemory 存储完整回复导致 Prompt 膨胀

### 根因

`gameStore.ts` 第 549/609 行将 KP 完整回复原文推入 kpMemory：

```typescript
kpMemory.value = [...kpMemory.value.slice(-MAX_MEMORY_ENTRIES + 1), sanitizeKpResponse(fullContent)]
```

每条 KP 回复 300–600 字，12 条上限意味着 kpMemory 独占 3,600–7,200 字 prompt 空间。

`kpPromptService.ts` 的 `buildMemoryBlock()` 将这些全文作为 bullet list 注入 system prompt，用途仅为"提醒 KP 不要重复自己"——一个不需要原文保真度的功能。

### 方案

**新建 `src/services/memoryExtractService.ts`**：

每轮结束后，调用轻量 LLM（maxTokens: 128）从 KP 回复中提取结构化要点：

```typescript
const EXTRACT_SYSTEM = `从守密人回复中提取3-5条关键信息要点，每条≤40字，JSON数组格式。
提取重点：描述了什么场景/NPC、告知了什么信息、发生了什么事件、提供了什么选项。
示例输出：["描述了雾中校门口场景","介绍了保卫处处长李建国","告知12名学生失踪","给出三个行动选项"]`

export async function extractMemoryPoints(
  aiConfig: AIProviderConfig,
  kpResponse: string
): Promise<string[]> {
  // maxTokens: 128, stream: false
  // 解析 JSON 数组；失败时 fallback 为 [kpResponse.slice(0, 80) + '…']
}
```

**修改 `gameStore.ts`**：

```typescript
// 之前：
kpMemory.value = [...kpMemory.value.slice(-MAX_MEMORY_ENTRIES + 1), sanitizeKpResponse(fullContent)]

// 之后：
const points = await extractMemoryPoints(aiConfig, sanitizeKpResponse(fullContent))
  .catch(() => [sanitizeKpResponse(fullContent).slice(0, 80) + '…'])
kpMemory.value = [...kpMemory.value.slice(-(MAX_MEMORY_ENTRIES - points.length)), ...points]
```

**修改 `kpPromptService.ts`**：

- `MAX_MEMORY_ENTRIES` 从 12 提升到 **30**（因为每条现在 ≤40 字，30 条约 1,200 字，低于之前 12 条的 3,600 字）
- `buildMemoryBlock` 无需修改，结构不变

**预期效果**：kpMemory 区域的 prompt 占用从 ~3,600–7,200 字压缩到 ~1,200 字（-67% ~ -83%）。

### Fallback 策略

`extractMemoryPoints` 失败时（LLM 调用失败、JSON 解析失败、429 限流）：
- 降级为截断：取回复前 80 字 + `'…'` 作为单条记忆
- 不阻塞主流程——extractMemoryPoints 以 fire-and-forget 方式执行

---

## 2. [P0] longTermSummary 更新频率过低

### 根因

`runLongTermSummarization()` 仅在两处被调用：

1. `transitionToScene()` — 场景切换时（`gameStore.ts` 第 208 行）
2. `sendPlayerMessage()` 末尾的周期性检查（第 617 行），触发条件 `playerTurnCount % 10 === 0`

trace 显示 Turn 2–7（6 轮）无场景切换，摘要完全未更新。这 6 轮中发生了 NPC 对话获取关键情报、两轮战斗、搜身获取物品等高价值事件，全部丢失。

同时 `memoryService.ts` 中的 prompt 限制"300 字以内"过于激进，产出仅 200–275 字。

### 方案

**三处修改**：

#### 2a. 降低周期触发阈值

`gameStore.ts`：

```typescript
// 之前：
const LONG_TERM_SUMMARY_EVERY_N_TURNS = 10

// 之后：
const LONG_TERM_SUMMARY_EVERY_N_TURNS = 5
```

#### 2b. 增加关键工具触发

在 `processToolCalls` 的结果处理后，检查是否包含高影响工具，若有则触发摘要：

```typescript
const HIGH_IMPACT_TOOLS = new Set(['grant_clue', 'melee_attack', 'ranged_attack', 'san_check', 'trigger_insanity'])

// processToolCalls 完成后：
const hasHighImpact = toolCalls.some(t => HIGH_IMPACT_TOOLS.has(t.name))
if (hasHighImpact) {
  runLongTermSummarization()
}
```

加入防抖：同一 trace 内最多触发一次 summarization（用一个 `summarizationTriggeredThisTurn` flag）。

#### 2c. 放宽摘要长度

`memoryService.ts`：

```typescript
// prompt 修改：
// 之前："控制在 300 字以内"
// 之后："控制在 500 字以内"
// 之前：maxTokens: 512
// 之后：maxTokens: 768

// prompt 新增要求：
// "必须包含：所有已获得线索的名称、所有到过的场景、关键NPC及态度、战斗/受伤记录、角色当前持有的重要物品。"
```

**预期效果**：最长 5 轮无更新（之前最长 10 轮）；关键工具执行后立即触发更新；摘要从 ~250 字提升到 ~450 字，覆盖更多关键细节。

---

## 3. [P1] chunkCount 追踪全程为 0

### 根因

`ragService.ts` 第 131 行：**硬编码** `chunkCount: 0`。

```typescript
traceBus.emit('rag_retrieval', 'rag_context_received', {
  chunkCount: 0,                                    // ← 硬编码
  contextLength: result?.context?.length ?? 0,
  hasGraphSummary: !!(result?.graphSummary),
  hasUserGraph: false,                               // ← 也是硬编码
})
```

后端 `graphRag.mjs` 的 `buildContextWithGraph()` 返回 `{ context, graphSummary }` 中没有包含 chunk 数量字段。

### 方案

#### 3a. 后端返回 chunkCount

修改 `electron/rag/graphRag.mjs`：

```javascript
// buildContextWithGraph 返回值添加 chunkCount
return { context, graphSummary: graphSummary || undefined, chunkCount: allChunks.length }
```

#### 3b. IPC 层透传

修改 `electron/ipc/ragHandlers.cjs` 的 `rag:context` handler：

```javascript
// 当前只返回 { context, graphSummary }
// 修改为也返回 chunkCount
const result = await graphRag.buildContextWithGraph({ ... })
return { context: result.context, graphSummary: result.graphSummary, chunkCount: result.chunkCount ?? 0 }
```

#### 3c. 前端使用真实值

修改 `src/services/ragService.ts`：

```typescript
traceBus.emit('rag_retrieval', 'rag_context_received', {
  chunkCount: result?.chunkCount ?? 0,        // 使用后端返回值
  contextLength: result?.context?.length ?? 0,
  hasGraphSummary: !!(result?.graphSummary),
  // 移除 hasUserGraph（此层无法准确获知，移至 fetchRagContext）
})
```

修改 `src/env.d.ts` 的 `ragContext` 返回类型，添加 `chunkCount?: number`。

---

## 4. [P1] GraphRAG / UserGraph 追踪失真

### 根因

**GraphRAG**：`graphRag.mjs` 中 `getGraph(scriptId)` 返回 null，说明该故事未完成 GraphRAG 索引。这是 indexing 阶段的问题：graph 索引依赖 LLM 做实体提取（`ragHandlers.cjs` 第 76–82 行），如果 LLM 不可用则被静默跳过。

**UserGraph trace**：`getContext()` 中 `hasUserGraph: false` 是硬编码。实际的 userGraph 拼接发生在更外层的 `fetchRagContext()`（`gameStore.ts` 第 440–444 行），trace 事件发射点和实际逻辑不在同一位置。

### 方案

#### 4a. 修复 UserGraph trace

在 `gameStore.ts` 的 `fetchRagContext()` 末尾追加正确的 trace 事件：

```typescript
async function fetchRagContext(query: string): Promise<string> {
  // ... 现有逻辑 ...
  const hasUserGraph = !!(userSummary?.trim())
  if (hasUserGraph) {
    traceBus.emit('rag_retrieval', 'user_graph_appended', {
      userGraphLength: userSummary!.trim().length,
    })
  }
  return ctx
}
```

从 `ragService.ts` 的 `rag_context_received` 事件中移除 `hasUserGraph` 字段。

#### 4b. GraphRAG 索引状态提示

不在本次修改范围内做强制修复，但在 RAG Inspector 页面的 Graph Browser tab 中，当 graph 为空时显示明确提示：
> "此故事尚未生成 GraphRAG 索引。请确保在索引时 LLM 可用（需要 API Key 和网络连接）。"

---

## 5. [P1] Combat Agent 每次触发 forceTools

### 根因

`kpGraph.mjs` 中 combat 计划的 `required: ['skill_check']`，但 LLM 使用了 `melee_attack`（一站式近战工具），验证节点检测不到独立的 `skill_check`，触发 `missing_tools` → `forceTools`。

`melee_attack` 内部已经包含了 skill_check + roll_dice + adjust_hp 的完整逻辑，不需要单独再调用 skill_check。

### 方案

#### 5a. 添加工具等价映射

在 `kpGraph.mjs` 中添加：

```javascript
var TOOL_EQUIVALENTS = {
  'melee_attack': ['skill_check', 'roll_dice', 'adjust_hp'],
  'ranged_attack': ['skill_check', 'roll_dice', 'adjust_hp'],
}
```

#### 5b. 修改验证逻辑

在 `createValidateNode()` 中，将 `calledNames` 展开为包含等价工具：

```javascript
// 在现有 calledNames 构建之后
var expandedNames = calledNames.slice()
for (var i = 0; i < calledNames.length; i++) {
  var equiv = TOOL_EQUIVALENTS[calledNames[i]]
  if (equiv) {
    for (var j = 0; j < equiv.length; j++) {
      if (expandedNames.indexOf(equiv[j]) < 0) expandedNames.push(equiv[j])
    }
  }
}
// 用 expandedNames 替代 calledNames 进行 missingTools 检查
```

#### 5c. 修改 combat required 为空

将 combat 的 `required` 改为 `[]`，因为 plan 文本中已有明确的工具调用指令，且 LLM 实际使用了更高级的组合工具（melee_attack）。这是更合理的行为。

```javascript
combat: {
  required: [],       // 之前是 ['skill_check']
  plan: '战斗行动。你必须调用 melee_attack 或 ranged_attack 工具进行攻击/防御检定。' +
    '若使用分步方式，调用 skill_check → roll_dice → adjust_hp 完整工具链。' +
    '禁止在文字中编造任何骰子数字或 HP 变化。',
},
```

**选择 5a+5b 或 5c 均可**。推荐 **5a+5b**：保留 required 约束的安全网，同时通过等价映射避免误报。如果 LLM 既没调 melee_attack 也没调 skill_check，forceTools 依然会补救——这是正确行为。

---

## 6. [P2] Scene-change RAG query 过长

### 根因

`gameStore.ts` 第 236 行的 `ragQuery` 拼接了场景名 + 最多 5 条完整线索描述：

```typescript
const ragQuery = [currentScene.value, ...cluesObtained.value.slice(0, 5)].filter(Boolean).join(' ')
```

线索如"校门口立着一张学校平面图，清晰标示了行政楼（校长与总务处）、教学楼与图书馆、学生宿舍及天台的相对位置与进出路线。"使得 query 长度失控。

### 方案

```typescript
// 之前：
const ragQuery = [currentScene.value, ...cluesObtained.value.slice(0, 5)].filter(Boolean).join(' ') || '当前场景 已获线索 调查进展'

// 之后：每条线索只取前 15 字作为关键词
const clueKeywords = cluesObtained.value.slice(0, 5).map(c => c.slice(0, 15)).join(' ')
const ragQuery = [currentScene.value, clueKeywords].filter(Boolean).join(' ') || '当前场景'
```

---

## 7. [P2] Opening 路由到 generic 而非 narrative

### 根因

`kpGraph.mjs` 第 660 行的路由条件中，`narrative` 意图没有映射到 narrative agent：

```javascript
if (intent === 'investigate' || intent === 'explore' || intent === 'talk_npc' || intent === 'move' || intent === 'tool_continuation') return 'narrative'
// 'narrative' 不在上面的列表中 → fall through → return 'generic'
```

generic agent 的 prompt 包含额外限制："不要主动调用 transition_scene 或 grant_clue"。这导致 Opening 时 KP 的叙事能力和工具使用被不必要地限制。

### 方案

```javascript
// 之前：
if (intent === 'investigate' || intent === 'explore' || intent === 'talk_npc' || intent === 'move' || intent === 'tool_continuation') return 'narrative'

// 之后：添加 'narrative'
if (intent === 'investigate' || intent === 'explore' || intent === 'talk_npc' || intent === 'move' || intent === 'tool_continuation' || intent === 'narrative') return 'narrative'
```

generic agent 仅用于真正的 fallback（无法识别的意图或 skill_check 等直接检定请求）。

---

## 8. [P2] longTermSummary 过短

### 根因与方案

已合并到 **问题 2** 的方案 2c 中。具体修改：

- prompt 中"300 字"→"**500 字**"
- `maxTokens` 512 → **768**
- 新增要求明确列出必须包含的信息类型

---

## 修改文件清单

| 文件 | 操作 | 对应问题 |
|------|------|----------|
| `src/services/memoryExtractService.ts` | **新建** | #1 |
| `src/stores/gameStore.ts` | 修改 | #1, #2, #4, #6 |
| `src/services/kpPromptService.ts` | 修改（MAX_MEMORY_ENTRIES） | #1 |
| `src/services/memoryService.ts` | 修改（prompt + maxTokens） | #2, #8 |
| `src/services/ragService.ts` | 修改（chunkCount + trace） | #3, #4 |
| `src/env.d.ts` | 修改（ragContext 返回类型） | #3 |
| `electron/rag/graphRag.mjs` | 修改（返回 chunkCount） | #3 |
| `electron/ipc/ragHandlers.cjs` | 修改（透传 chunkCount） | #3 |
| `electron/agent/kpGraph.mjs` | 修改（等价映射 + 路由） | #5, #7 |

---

## 预期改善指标

| 指标 | 修复前（Turn 12） | 修复后（预估 Turn 12） | 变化 |
|------|-------------------|----------------------|------|
| Prompt totalLength | 15,454 字 | ~10,500 字 | -32% |
| kpMemory 占用 | ~5,000 字（12 条全文） | ~1,200 字（30 条要点） | -76% |
| longTermSummary 长度 | 275 字 | ~450 字 | +64% |
| 最长无摘要更新间隔 | 6 轮 | ≤5 轮（或关键工具触发） | 改善 |
| Combat forceTools 触发率 | 100% (2/2) | 0% | 消除 |
| chunkCount 追踪准确度 | 0%（硬编码） | 100%（实际值） | 修复 |
| narrative 意图路由正确性 | generic（受限） | narrative（完整） | 修复 |

---

## 实施顺序建议

1. **问题 3 + 4**（trace 修复）— 最简单，一行代码级别，立即提升可观测性可信度
2. **问题 7**（路由修复）— 一行代码，立即提升 Opening 和纯叙事回合的质量
3. **问题 5**（combat 验证）— 小范围修改 kpGraph.mjs，消除冗余 LLM 调用
4. **问题 6**（RAG query 截断）— 一行代码优化
5. **问题 2 + 8**（摘要频率+长度）— 涉及 gameStore + memoryService 的协调修改
6. **问题 1**（kpMemory 结构化提取）— 最复杂，需新建 service + 修改存储逻辑 + fallback

---

## 10. Code Review 结果（实施后审查）

**审查日期**: 2026-03-31
**审查范围**: 上述 8 个问题的全部代码修改（8 个修改文件 + 1 个新建文件）
**结论**: 核心逻辑正确，发现 **3 个 HIGH + 4 个 MEDIUM + 3 个 LOW** 级别问题需修复后方可合并

### 10.0 审查结果总览

| 严重度 | 数量 | 说明 |
|--------|------|------|
| CRITICAL | 0 | 无安全或数据丢失风险 |
| HIGH | 3 | 竞态条件、重复执行、关键路径延迟 |
| MEDIUM | 4 | 一致性、健壮性、代码质量 |
| LOW | 3 | 类型约束、参数使用、文档 |

### 10.1 [HIGH-1] 竞态条件：高影响工具触发的 summarization 读取过时数据

**位置**: `gameStore.ts` — `processToolCalls()` 内部（第 393–398 行）

**问题描述**:

`runLongTermSummarization('high_impact_tool')` 在 `processToolCalls` 执行期间被调用。此时 KP 的当前叙事回复尚未写入 `messages.value`（回复仍在流式传输/组装中）。summarization 从 `messages.value.slice(-SUMMARIZE_RECENT_MESSAGES)` 读取数据时，拿到的是**不包含本轮回复**的旧数据。

这意味着：如果一个 `grant_clue` 工具调用发生了，summarization 的输入中不会包含"KP 告知玩家线索内容"的对话——而这恰恰是最应该被摘要捕捉的信息。

**影响**: 高影响工具触发的 summarization 目的是「立即捕捉关键事件」，但实际上**遗漏了触发事件本身**，降低了该功能的价值。

**修复方案**: 将 `high_impact_tool` 触发从 `processToolCalls` 移至 `sendPlayerMessage` 中 `fullContent` 写入 `messages.value` 之后。具体做法：

```typescript
// processToolCalls 中：记录是否有高影响工具，但不立即触发
// 返回一个 hasHighImpact flag

// sendPlayerMessage 中（fullContent 写入后、periodic check 之前）：
if (hasHighImpactFlag) {
  runLongTermSummarization('high_impact_tool')
} else if (playerTurnCount.value % LONG_TERM_SUMMARY_EVERY_N_TURNS === 0) {
  runLongTermSummarization('periodic')
}
```

---

### 10.2 [HIGH-2] 战斗回合可能触发双重 summarization

**位置**: `gameStore.ts` — `processToolCalls`（第 397 行）+ `sendPlayerMessage`（第 635 行）

**问题描述**:

假设一个战斗 turn 中：
1. `processToolCalls` 检测到 `melee_attack`（高影响工具）→ 触发 `runLongTermSummarization('high_impact_tool')`
2. 该 turn 恰好是第 5、10、15… 轮 → `sendPlayerMessage` 末尾的 `playerTurnCount % 5 === 0` 又触发 `runLongTermSummarization()`

两个 fire-and-forget 的 summarization Promise **并发执行**，各自读取 `messages.value`（几乎相同的输入），各自请求 LLM，最后两者的 `.then()` 回调都会写入 `longTermSummary.value`。**后完成的覆盖先完成的**，产生不确定性。

更严重的是：两次并发 LLM 调用浪费了一次 API quota + token 开销。

**影响**: API 资源浪费（双倍 LLM 调用）+ 摘要结果不确定（取决于网络延迟哪个先返回）。

**修复方案**: 添加 `isSummarizing` 信号量：

```typescript
let summarizationPending = false

function runLongTermSummarization(trigger?: SummarizationTrigger) {
  if (summarizationPending) return  // 防抖：已有进行中的 summarization
  summarizationPending = true
  // ...existing logic...
  Promise.all([...])
    .then(...)
    .catch(...)
    .finally(() => { summarizationPending = false })
}
```

结合 HIGH-1 的修复，在 `sendPlayerMessage` 中用 `if/else` 确保同一 turn 最多触发一次。

---

### 10.3 [HIGH-3] `extractMemoryPoints` 在关键路径上增加 1–3s 延迟

**位置**: `gameStore.ts` — `requestOpening`（第 562–565 行）+ `sendPlayerMessage`（第 625–628 行）

**问题描述**:

当前实现：

```typescript
const points = await extractMemoryPoints(aiConfig, sanitizeKpResponse(fullContent))
  .catch(() => [sanitizeKpResponse(fullContent).slice(0, 80) + '…'])
kpMemory.value = [...kpMemory.value.slice(-(MAX_MEMORY_ENTRIES - points.length)), ...points]
```

`extractMemoryPoints` 是一个 LLM 调用（即使 maxTokens=128，也需 1–3s 网络往返时间）。它位于 `await` 链上——意味着：

- KP 的流式输出已完成
- 但 `isSending.value = false` 要等到 `finally` 块才执行
- 用户在这 1–3s 内看到消息已经完成显示，但无法输入下一条（因为 `isSending` 仍为 true）

这造成「消息已出来了但输入框还是灰的」的微妙但可感知的 UX 卡顿。

**影响**: 每轮增加 1–3s 交互延迟，累积 10 轮 = 额外 10–30s 等待时间。

**修复方案**: 将 `extractMemoryPoints` 改为非阻塞的 fire-and-forget：

```typescript
// 同步先写入截断 fallback
const sanitized = sanitizeKpResponse(fullContent)
kpMemory.value = [...kpMemory.value.slice(-(MAX_MEMORY_ENTRIES - 1)), sanitized.slice(0, 80) + '…']

// 异步提取结构化要点，完成后更新
extractMemoryPoints(aiConfig, sanitized).then((points) => {
  // 替换最后一条 fallback 为结构化要点
  kpMemory.value = [
    ...kpMemory.value.slice(0, -(1)),  // 移除刚写入的 fallback
    ...points,
  ]
  traceBus.emit('state_update', 'memory_updated', {
    kpMemoryLength: kpMemory.value.length,
    newEntryPreview: points.join(' | ').slice(0, 150),
  })
}).catch(() => { /* fallback 已就位，无需额外处理 */ })
```

---

### 10.4 [MEDIUM-1] `MAX_MEMORY_ENTRIES` 分散定义，缺乏单一来源

**位置**: `gameStore.ts:33` + `kpPromptService.ts:5`

**问题描述**:

`MAX_MEMORY_ENTRIES = 30` 在两个文件中独立定义。它们服务于不同目的（gameStore 用于写入上限，kpPromptService 用于读取 slice），但值必须一致。未来修改者可能只改一处而忘记另一处，导致存储上限和 prompt 截取不一致（例如存了 30 条但 prompt 只读 12 条，或反过来存 12 条但 prompt 期望读 30 条）。

**修复方案**: 从 `kpPromptService.ts` 导出 `MAX_MEMORY_ENTRIES`，`gameStore.ts` import 使用：

```typescript
// kpPromptService.ts:
export const MAX_MEMORY_ENTRIES = 30

// gameStore.ts:
import { MAX_MEMORY_ENTRIES, buildOpeningPrompt, ... } from '../services/kpPromptService'
```

---

### 10.5 [MEDIUM-2] 并发 summarization 写入 `longTermSummary` 无序列化保护

**位置**: `gameStore.ts` — `runLongTermSummarization` 的 `.then()` 回调（第 261 行）

**问题描述**:

与 HIGH-2 相关但更广泛：即使修复了同一 turn 的双重触发，仍存在跨 turn 的竞态可能。例如 Turn 5 触发了 summarization（需 3s），玩家快速输入 Turn 6 后又触发了 summarization。Turn 6 的 summarization 可能先于 Turn 5 返回（因为 Turn 5 的输入更长），导致 Turn 6 的新摘要被 Turn 5 的旧摘要覆盖。

**修复方案**: 在 `runLongTermSummarization` 中加入版本计数器：

```typescript
let summarizationGeneration = 0

function runLongTermSummarization(trigger?: string) {
  const gen = ++summarizationGeneration
  // ...existing async logic...
  .then((next) => {
    if (next && gen === summarizationGeneration) {  // 只有最新一次写入
      longTermSummary.value = next
    }
  })
}
```

---

### 10.6 [MEDIUM-3] `userSummary!` 非空断言不必要

**位置**: `gameStore.ts` — `fetchRagContext`（第 453–454 行）

**问题描述**:

```typescript
const hasUserGraph = !!(userSummary?.trim())
if (hasUserGraph) {
  ctx += (ctx ? '\n\n' : '') + '## 调查员行动记录\n' + userSummary!.trim()
  traceBus.emit('rag_retrieval', 'user_graph_appended', {
    userGraphLength: userSummary!.trim().length,
  })
}
```

在 `if (hasUserGraph)` 分支内，TypeScript 的控制流分析已经可以推断 `userSummary` 非 null/undefined（因为 `userSummary?.trim()` 返回真值意味着 `userSummary` 本身存在且 `trim()` 非空）。使用 `!` 非空断言虽然不会产生 bug，但绕过了类型系统的安全保障——如果将来 `hasUserGraph` 的计算逻辑被修改但忘记同步更新下方代码，`!` 会隐藏潜在的运行时错误。

**修复方案**: 直接使用 `userSummary` 而非 `userSummary!`，或将 trim 后的值缓存到中间变量：

```typescript
const trimmedUserSummary = userSummary?.trim() ?? ''
if (trimmedUserSummary) {
  ctx += (ctx ? '\n\n' : '') + '## 调查员行动记录\n' + trimmedUserSummary
  traceBus.emit('rag_retrieval', 'user_graph_appended', {
    userGraphLength: trimmedUserSummary.length,
  })
}
```

---

### 10.7 [MEDIUM-4] `sanitizeKpResponse(fullContent)` 在 catch 中重复调用

**位置**: `gameStore.ts` — `requestOpening`（第 562–563 行）+ `sendPlayerMessage`（第 625–626 行）

**问题描述**:

```typescript
const points = await extractMemoryPoints(aiConfig, sanitizeKpResponse(fullContent))
  .catch(() => [sanitizeKpResponse(fullContent).slice(0, 80) + '…'])
```

`sanitizeKpResponse(fullContent)` 在 happy path 和 catch 各调用一次。虽然该函数是纯函数（无副作用），但重复调用一个对长字符串进行正则替换的函数存在不必要的 CPU 开销。且如果 `sanitizeKpResponse` 未来变为非纯函数，会产生 subtle bug。

**修复方案**: 缓存结果到局部变量：

```typescript
const sanitized = sanitizeKpResponse(fullContent)
const points = await extractMemoryPoints(aiConfig, sanitized)
  .catch(() => [sanitized.slice(0, 80) + '…'])
```

---

### 10.8 [LOW-1] `TOOL_EQUIVALENTS` 等价映射语义为单向，缺乏文档

**位置**: `kpGraph.mjs`（第 540–543 行）

**问题描述**:

```javascript
var TOOL_EQUIVALENTS = {
  'melee_attack': ['skill_check', 'roll_dice', 'adjust_hp'],
  'ranged_attack': ['skill_check', 'roll_dice', 'adjust_hp'],
}
```

等价映射是**单向**的：调用 `melee_attack` 视为满足 `skill_check`、`roll_dice`、`adjust_hp` 的需求，但反之不成立（分别调用这三个工具不会满足 `melee_attack` 需求）。

当前的 `TOOL_PLANS` 中没有将 `melee_attack` 或 `ranged_attack` 列为 `required`，所以反向映射暂时无影响。但如果未来有人在 `combat.required` 中添加 `'melee_attack'`，这种不对称性会造成困惑。

**修复方案**: 在 `TOOL_EQUIVALENTS` 定义上方添加注释说明其语义：

```javascript
// 单向等价映射：key 工具隐含了 value 中所有工具的功能。
// 例：melee_attack 内部执行 skill_check + roll_dice + adjust_hp，
// 因此调用 melee_attack 等同于满足对这三者的 required 约束。
// 注意：反向不成立——分别调用 skill_check + roll_dice + adjust_hp 不满足 melee_attack 约束。
var TOOL_EQUIVALENTS = { ... }
```

---

### 10.9 [LOW-2] `emitCharacterSnapshot` 的 `label` 参数被忽略

**位置**: `gameStore.ts` — `emitCharacterSnapshot` 函数定义（第 181–184 行）

**问题描述**:

```typescript
function emitCharacterSnapshot(label: string) {
  const snap = buildCharacterSnapshotForTrace()
  if (snap) traceBus.emit('state_update', 'character_snapshot', snap)
}
```

调用处传递了有意义的标签（`'before_opening'`、`'after_opening'`、`'before_turn'`、`'after_turn'`），但 trace event 中没有包含这个 label。这使得在分析 trace 时无法区分 snapshot 是在 turn 之前还是之后采集的。

**修复方案**: 将 label 纳入 trace 数据：

```typescript
function emitCharacterSnapshot(label: string) {
  const snap = buildCharacterSnapshotForTrace()
  if (snap) traceBus.emit('state_update', 'character_snapshot', { ...snap, label })
}
```

---

### 10.10 [LOW-3] `runLongTermSummarization` 的 `trigger` 参数无类型约束

**位置**: `gameStore.ts`（第 213 行）

**问题描述**:

```typescript
function runLongTermSummarization(trigger?: string) {
```

`trigger` 接受任意字符串。当前调用点传递的值包括 `'high_impact_tool'`（processToolCalls）、不传参时默认根据 scene 状态计算为 `'scene_change'` 或 `'periodic'`（第 238 行）。但类型系统不会阻止传入任意无效字符串（如拼写错误 `'high_imact_tool'`）。

**修复方案**: 定义 union 类型：

```typescript
type SummarizationTrigger = 'scene_change' | 'periodic' | 'high_impact_tool'
function runLongTermSummarization(trigger?: SummarizationTrigger) {
```

---

### 10.11 审查通过项（正面评价）

以下修改经审查确认逻辑正确，无需调整：

| 修改 | 说明 |
|------|------|
| `memoryExtractService.ts` 整体结构 | 输入截断（1500 字）、低温度（0.1）、5 条上限、JSON regex 提取、fallback 设计均合理 |
| `chunkCount` 全链路传递 | `graphRag.mjs` → IPC handler → `ragService.ts` → `env.d.ts` 一致且完整，含 early return 路径 |
| `narrative` 意图路由修复 | `createRouteByIntentNode` 和 `routeByIntentEdge` 对称更新，逻辑正确 |
| `TOOL_EQUIVALENTS` 验证逻辑 | 展开算法正确，遍历完整，`indexOf` 去重无遗漏 |
| `memoryService.ts` 摘要 prompt | 信息提取目标更具体（线索、场景、NPC、战斗、物品），500 字 + 768 token 配比合理 |
| `toPromptState` 移入 store 闭包 | 之前在模块作用域引用 reactive ref 导致 ReferenceError，修复正确 |
| `MAX_MEMORY_ENTRIES` 定义位置 | `gameStore.ts` 内新增独立定义（修复了此前的 ReferenceError），值与 `kpPromptService.ts` 一致 |

---

### 10.12 修复优先级建议

| 序号 | 问题 | 优先级 | 预估工作量 |
|------|------|--------|-----------|
| 1 | HIGH-1 + HIGH-2（summarization 触发时机 + 防抖） | 必须修复 | 中（需重构 processToolCalls 返回值 + sendPlayerMessage 逻辑） |
| 2 | HIGH-3（extractMemoryPoints 改为非阻塞） | 必须修复 | 小（改 await 为 fire-and-forget） |
| 3 | MEDIUM-2（summarization 版本计数器） | 建议修复 | 小（3 行代码） |
| 4 | MEDIUM-1（MAX_MEMORY_ENTRIES 单一来源） | 建议修复 | 小（移动 export + import） |
| 5 | MEDIUM-3（消除非空断言） | 建议修复 | 极小 |
| 6 | MEDIUM-4（缓存 sanitizeKpResponse） | 建议修复 | 极小 |
| 7 | LOW-1~3（文档 + 类型 + label） | 可选 | 极小 |

---

## 11. Code Review 修复实施记录

**修复日期**: 2026-03-31
**验证结果**: TypeScript 类型检查通过 ✅ | Vite 生产构建通过 ✅

### 11.1 重新评估结果

对 Code Review 发现的 10 个问题进行了独立验证，重新评估了严重程度：

| 编号 | 原严重度 | 重新评估 | 结论 |
|------|----------|----------|------|
| HIGH-1 | HIGH | **MEDIUM** | 丢失的只是当前轮回复，非历史数据。仍合并到 HIGH-2 一起修复 |
| HIGH-2 | HIGH | **HIGH** | 确认有效：双重触发浪费 API，结果不确定 |
| HIGH-3 | HIGH | **HIGH** | 确认有效：每轮 1-3s 阻塞 `isSending` 释放 |
| MEDIUM-1 | MEDIUM | **LOW** | 两处 `MAX_MEMORY_ENTRIES` 语义不同（写入 vs 读取上限），不强制合并 |
| MEDIUM-2 | MEDIUM | 合并到 HIGH-2 | 因 `isSending` 锁存在，跨 turn 竞态概率极低 |
| MEDIUM-3 | MEDIUM | **LOW** | `!` 断言在此处因 TS 控制流限制实际必要，但改中间变量更优 |
| MEDIUM-4 | MEDIUM | **LOW** | 已随 HIGH-3 修复自然解决（fire-and-forget 改写中引入了 `sanitized` 变量） |
| LOW-1~3 | LOW | LOW | 确认有效，全部修复 |

### 11.2 已实施的修复

#### 11.2.1 HIGH-1 + HIGH-2：summarization 防抖锁 + 触发位置调整

**修改文件**: `gameStore.ts`

**方案**:

1. 新增模块级 `SummarizationTrigger` 类型和 `HIGH_IMPACT_TOOLS` 常量
2. `runLongTermSummarization` 增加双重防护：
   - `_summarizationPending` 防抖锁：同一时间最多一个 summarization 在执行
   - `_summarizationGen` 版本计数器：只有最新一次 summarization 的结果才写入 `longTermSummary`
3. `processToolCalls` 不再直接触发 summarization，改为设置 `_turnHadHighImpactTool = true` flag
4. `sendPlayerMessage` 末尾用 `if/else` 互斥：
   - 若 `_turnHadHighImpactTool` → 触发 `'high_impact_tool'` summarization
   - 否则若到周期轮次 → 触发 `'periodic'` summarization
   - **同一 turn 最多触发一次**

```typescript
// 防抖锁 + 版本计数器
let _summarizationGen = 0
let _summarizationPending = false

function runLongTermSummarization(trigger?: SummarizationTrigger) {
  if (_summarizationPending) return
  _summarizationPending = true
  const gen = ++_summarizationGen
  // ...
  .then((next) => {
    if (next && gen === _summarizationGen) {  // 只有最新写入
      longTermSummary.value = next
    }
  })
  .finally(() => { _summarizationPending = false })
}

// sendPlayerMessage 末尾互斥
if (_turnHadHighImpactTool) {
  runLongTermSummarization('high_impact_tool')
} else if (playerTurnCount.value % LONG_TERM_SUMMARY_EVERY_N_TURNS === 0) {
  runLongTermSummarization('periodic')
}
```

**效果**: 消除了双重 summarization、解决了过时数据问题（现在在 fullContent 写入后触发）、保证跨 turn 写入顺序。

#### 11.2.2 HIGH-3：extractMemoryPoints 改为 fire-and-forget

**修改文件**: `gameStore.ts`

**方案**: 先同步写入截断 fallback，再异步更新为结构化要点：

```typescript
const sanitized = sanitizeKpResponse(fullContent)
// 同步写入 fallback（不阻塞 isSending 释放）
kpMemory.value = [...kpMemory.value.slice(-(MAX_MEMORY_ENTRIES - 1)), sanitized.slice(0, 80) + '…']
// 异步提取结构化要点
extractMemoryPoints(aiConfig, sanitized).then((points) => {
  kpMemory.value = [...kpMemory.value.slice(0, -1), ...points]
  traceBus.emit('state_update', 'memory_updated', { ... })
}).catch(() => { /* fallback already in place */ })
```

**效果**: 消除每轮 1-3s 的阻塞延迟。同时自然解决了 MEDIUM-4（sanitize 缓存）。

#### 11.2.3 MEDIUM-3：userSummary 非空断言改为中间变量

**修改文件**: `gameStore.ts` — `fetchRagContext`

```typescript
// 之前：
const hasUserGraph = !!(userSummary?.trim())
if (hasUserGraph) { ... userSummary!.trim() ... }

// 之后：
const trimmedUserGraph = userSummary?.trim() ?? ''
if (trimmedUserGraph) { ... trimmedUserGraph ... }
```

#### 11.2.4 LOW-1：TOOL_EQUIVALENTS 注释

**修改文件**: `kpGraph.mjs`

在 `TOOL_EQUIVALENTS` 上方添加了三行英文注释说明单向等价语义。

#### 11.2.5 LOW-2：emitCharacterSnapshot 传入 label

**修改文件**: `gameStore.ts`

```typescript
if (snap) traceBus.emit('state_update', 'character_snapshot', { ...snap, label })
```

#### 11.2.6 LOW-3：SummarizationTrigger 类型约束

**修改文件**: `gameStore.ts`

```typescript
type SummarizationTrigger = 'scene_change' | 'periodic' | 'high_impact_tool'
```

所有调用点均已更新为传递显式 trigger 值。

### 11.3 未修复项（评估后决定不修）

| 编号 | 问题 | 决定 | 理由 |
|------|------|------|------|
| MEDIUM-1 | `MAX_MEMORY_ENTRIES` 两处定义 | 保持现状 | 两处语义不同（写入上限 vs 读取 slice），合并反而降低灵活性 |

### 11.4 最终修改文件清单

| 文件 | 变更类型 | 对应问题 |
|------|----------|----------|
| `src/stores/gameStore.ts` | 修改 | HIGH-1, HIGH-2, HIGH-3, MEDIUM-3, LOW-2, LOW-3 |
| `electron/agent/kpGraph.mjs` | 修改 | LOW-1 |

---

## 12. 新 Trace（kptrace-1775048388760）复盘与增量问题清单（A–F）

**依据**: `ai-trpg-web/debug-trace/kptrace-1775048388760.json`（32 轮）

### 12.1 观察结论（与本 spec 的 1–11 节改动相关）

- **Prompt 膨胀趋势已被抑制**：`totalLength` 在 32 轮内维持在 ~14k–16k 区间，未出现无上限增长。
- **RAG 指标可用**：`rag_context_received.chunkCount` 有实际值（如 8），`user_graph_appended` 正常发射。
- **长期摘要触发频率改善**：出现 `periodic` 与 `high_impact_tool` 触发，说明触发机制生效。

### 12.2 新增问题（Trace A–F）与代码实施状态

| ID | 优先级 | 问题 | 现象/证据 | 影响 | **实施状态**（2026-04-01） |
|----|--------|------|-----------|------|---------------------------|
| A | P0 | **系统不能主动发起 SAN 检定** | 仅当玩家明确输入触发 `san_encounter` 时才走 sanity agent | 规则张力不足 | **部分**：`kpGraph.mjs` 叙事提示强制遇恐怖须 `san_check`；若 `storyContext.sanity.autoCheck` 为真则 narrative/generic 计划强制 `san_check`。**未接**：RAG 文本关键词 → `autoCheck`；`san_auto_detected` 等专用 trace |
| B | P0 | **游戏结束后缺少结局总结页** | 结束后仍可对聊 | 体验割裂 | **已实施**：`end_game` 工具、`gamePhase: 'ended'`、`GameEndView`、`/game-end`、硬结束（HP≤0 / SAN≤0）、KPTrace `game_ended` |
| C | P1 | **kpMemory 超过 MAX** | memoryEntries > 30 | prompt 超预期 | **已实施**：`extractMemoryPoints` 回填后 `slice(-MAX_MEMORY_ENTRIES)` |
| D | P1 | **longTermSummary 越更新越短** | 长度下降 | 信息丢失 | **部分**：写入前若 `next.length < current.length * 0.85` 则**不覆盖**旧摘要。**未改**：`memoryService.ts` 的 `SUMMARIZE_SYSTEM` 文案强化 |
| E | P2 | **Combat forceTools** | 首轮缺工具 | 额外 LLM | **部分**：叙事守则中强调工具与收束；**未改**：combat 专用 `requiredTools`/等价映射升级 |
| F | P2 | **场景推进不足** | 少 `scene_changed` | 叙事停滞 | **已实施**：`gameStore` `narrativeStall` + `storyContext.forceTransitionScene` → `kpGraph` narrative 计划强制 `transition_scene`（stall≥4） |

---

## 13. 方案 2（推荐）：工具化 + 状态机（覆盖 A–F）

本节是对 A–F 的**新增设计**。目标是：在不牺牲自由对话的前提下，让“SAN 检定”和“结局收束”变成**可强制、可观测、可复盘**的系统行为。

### 13.1 设计原则

- **可强制**：关键节点必须通过工具/状态机落地（SAN / End）。
- **可观测**：所有触发都要在 KPTrace 中留下事件（触发原因、输入输出长度、阈值等）。
- **最小侵入**：优先在现有 `kpGraph.mjs` / `toolCalling` / `gameStore.ts` 既有结构上扩展，不做大重构。
- **混合策略**：既利用剧本（RAG）中的明确指示，也允许 KP 在明显恐怖/收束时自主判断，但通过“必须调用工具”的约束兜底。

---

## 14. 模块 A：自动 SAN Check（混合触发）

### 14.1 目标行为

- 当出现**剧本预定义的恐怖/超自然事件**（RAG 命中明确 SAN 指示）时：KP 必须触发 `san_check`。
- 当出现**KP 自主叙事的明显恐怖情境**时：KP 也应触发 `san_check`（但需避免过度触发）。
- 触发后：KP 必须根据工具结果即时叙事，并在必要时调用 `trigger_insanity`。

### 14.2 触发信号来源（混合）

- **信号 1：RAG 证据**（优先级最高）
  - 在 `ragContextText` / `graphSummary` 中匹配 “SAN/理智检定/恐惧/目睹尸体/超自然/不可名状”等提示。
  - 若命中，判定为 `san_required=true`。
- **信号 2：KP 输出自检**（次优先）
  - 在 KP 将要输出的叙事中，如果出现强烈恐怖关键词（可配置词表）且本轮未触发 SAN，则判定为 `san_should=true`。
- **信号 3：玩家输入**（兜底）
  - 玩家明确描述恐怖/疯狂/目睹超自然时，继续沿用现有 intent classifier 的 `san_encounter` 路径。

### 14.3 实现策略（推荐）

- **在 `kpGraph.mjs` 的 narrative/generic agentHint 中加入硬性规则**：
  - “当你描述调查员首次目睹超自然/惨烈尸体/不可名状现象时，必须调用 `san_check`（由你设定 successLoss/failureLoss）”
- **在 `createPlanNode('narrative')` 增加轻量规则**：
  - 若检测到 `storyContext`/`ragContext` 中有 SAN 触发提示，则把 `san_check` 加入 `requiredTools`。
- **在 validate 阶段兜底**：
  - 若本轮被标记 `san_required=true` 但未调用 `san_check`，走 missing_tools→forceTools 机制补齐。

### 14.4 可观测性（KPTrace）

新增事件（span 建议：`sanity` 或 `kp_agent`）：

- `san_auto_detected`：{ source: 'rag'|'kp_text'|'player', matched: string[], severity: 'low'|'med'|'high' }
- `san_auto_required`：{ required: boolean, reason: string }

---

## 15. 模块 B：游戏结束收束（end_game + ended phase + 结局总结页 C）

### 15.1 目标行为

- 游戏达到结局条件后，必须进入 `gamePhase='ended'`，并**跳转到结局总结页面**。
- 结束后不再允许继续对话（除非玩家选择“继续开放式尾声/彩蛋”，作为显式按钮）。
- 结局页面提供：
  - 成败/结局类型
  - 结局摘要（KP 生成）
  - 关键事件时间线
  - 最终角色状态（HP/SAN/伤势/疯狂）
  - 线索与场景记录
  - **导出报告**（Markdown/JSON）
  - **回放关键回合**（在页面内折叠展示或跳转到回放视图）

### 15.2 结束条件（全自动 + KP 主动）

- **硬结束（系统自动）**：
  - HP ≤ 0（死亡）
  - SAN = 0（永久疯狂）
- **软结束（KP 主动）**：
  - 剧本明确结局达成、核心谜题解开、逃离成功/失败等
  - 通过新工具 `end_game` 显式提交结局数据

### 15.3 新工具：`end_game`

参数建议：

- `outcome`: `'victory'|'defeat'|'partial'|'survival'|'unknown'`
- `title`: string（结局标题）
- `summary`: string（结局摘要，500–900 字）
- `epilogueOptions`: string[]（可选：尾声/后续）
- `keyFacts`: string[]（可选：关键事实/真相）
- `keyTurnIds`: string[]（可选：关键回合 id，用于回放）

工具副作用：

- 写入 `gameStore`：`gamePhase='ended'`
- 写入 `endingState`（新字段）用于 UI 展示与导出
- 触发 trace：`game_ended`（含 outcome/title/summaryLength 等）

### 15.4 UI/路由

- 新增视图：`GameEndView.vue`（仅在 ended phase 可进入）
- 路由策略：
  - ended 时强制导航到 `/game-end`（或 GameRoom 内切换子视图）
  - GameRoom 输入框禁用（提示“已结束：查看结局总结 / 导出 / 开始新游戏”）

### 15.5 导出与回放

- **导出**：支持导出 `endingState + longTermSummary + clues + scenes + finalSnapshot + traceId` 为：
  - `ending-report.md`
  - `ending-report.json`
- **回放**：
  - 基于 `keyTurnIds` 展示对话片段（从 `messages` 截取），或跳转到只读回放页面

---

## 16. 小修复项（C–F）

### 16.1 C：kpMemory 上限裁剪（确定性）

无论是 fallback 还是 points 回填，最终写入 `kpMemory` 时必须裁剪为 `MAX_MEMORY_ENTRIES`：

```typescript
kpMemory.value = [...kpMemory.value.slice(-(MAX_MEMORY_ENTRIES - points.length)), ...points]
```

并在 trace 中记录实际长度（`kpMemoryLength`）。

### 16.2 D：longTermSummary 不得变短（约束）

在 `SUMMARIZE_SYSTEM` 中加入硬约束：

- “新摘要长度不得明显短于旧摘要；若必须压缩，请保留所有线索名称与场景列表完整”

并在写入前做一次保护（可配置阈值）：

- 若 `next.length < current.length * 0.85`，则保留旧摘要或进行一次重试。

### 16.3 E：combat forceTools 降低（提示增强）

- combat agentHint 增加强约束：优先使用 `melee_attack/ranged_attack`（若存在），否则必须按链路调用。
- 若仍常见遗漏，第二阶段再将 combat 的 `requiredTools` 升级为更强的约束（例如要求 `melee_attack`）。

### 16.4 F：场景推进与收束（叙事 Agent 约束）

- 当 `stallLevel` 连续增长（≥4）时，强制 `transition_scene` 或触发结局判定（KP 调用 `end_game`）。
- 系统在硬结束条件触发时自动执行结局流程（生成 `endingState` 并跳转结局页）。

---

## 17. 实施记录（2026-04-01）：Trace A–F 代码落地

本节与仓库当前实现一致，便于对照 spec 第 12–16 节。

### 17.1 已修改 / 新增文件清单

| 文件 | 说明 |
|------|------|
| `src/types/character.ts` | `GamePhase` 增加 `'ended'` |
| `src/types/ending.ts` | **新增** `EndingState`、`GameOutcome` |
| `src/types/storyContext.ts` | `sanity.autoCheck` / `autoReason`；`forceTransitionScene` |
| `electron/ipc/aiHandlers.cjs` | `COC_KP_TOOLS` 增加 `end_game` |
| `src/toolCalling/cocToolNames.json` | 增加 `end_game` |
| `src/toolCalling/types.ts` | `ToolHandlerContext.endGame` |
| `src/services/toolContextFactory.ts` | `ToolContextDeps.endGame` |
| `src/toolCalling/handlers/narrativeHandler.ts` | 处理 `end_game` |
| `src/stores/gameStore.ts` | `endingState`、`scenesVisited`、`narrativeStall`、`endGame()`、硬结束、`buildStoryContext` 注入 flags、记忆裁剪、摘要 0.85 保护、存档字段 |
| `src/services/saveService.ts` | `GameSaveSnapshot` 增加 `endingState`、`scenesVisited` |
| `src/router/index.ts` | 路由 `/game-end`，`requiresGame` 允许 `playing` \| `ended` |
| `src/views/GameEndView.vue` | **新增** 结局页：展示 + 导出 `.md`/`.json` |
| `src/views/GameRoomView.vue` | `ended` 跳转 `/game-end`、禁用输入 |
| `electron/agent/kpGraph.mjs` | `storyContext.sanity.autoCheck` → `requiredTools` 含 `san_check`；`forceTransitionScene` → `transition_scene`；叙事提示含 SAN / `end_game` |

### 17.2 行为摘要

- **结局**：KP 调用 `end_game` 或 HP/SAN 归零 → `gamePhase='ended'` → 路由至 `/game-end`；`state_update` 发射 `game_ended`。
- **存档**：`writeSaveSnapshot` 持久化 `endingState`、`scenesVisited`；读档恢复。
- **场景列表**：`transitionToScene` 时追加 `scenesVisited`（去重连续重复）。
- **记忆 C**：异步要点合并后 `kpMemory = next.slice(-MAX_MEMORY_ENTRIES)`。
- **摘要 D**：仅 gameStore 侧长度保护；未改 `memoryService` 系统提示词。
- **推进 F**：每轮若未出现 progress 类工具则 `narrativeStall++`，≥4 时 `forceTransitionScene`。
- **SAN A**：依赖 `autoCheck` 或 LLM 遵守叙事守则；**尚未**在 `fetchRagContext` 中根据 RAG 文本自动置 `autoCheck`。

### 17.3 与 spec 的差异 / 待办（可选后续）

1. **RAG → `sanity.autoCheck`**：在 `gameStore.fetchRagContext` 或 `buildStoryContext` 前对上下文做关键词/规则检测，并 `traceBus.emit('san_auto_detected', …)`。
2. **`memoryService.ts`**：在 `SUMMARIZE_SYSTEM` 中显式写「不得短于旧摘要」等（与 16.2 设计对齐）。
3. **Combat E**：强化 `combat` agent 的 `TOOL_PLANS` / `agentHint` 或 `requiredTools`（与 16.3 第二阶段一致）。
4. **结局页「回放」**：`keyTurnIds` 已可传入 `end_game`，UI 侧可按 id 从 `messages` 过滤展示（当前未做折叠回放组件）。
5. **导出内容**：当前导出以 `endingState` 为主；未自动附带 `longTermSummary` / 全量 `messages`（可按需扩展 JSON）。

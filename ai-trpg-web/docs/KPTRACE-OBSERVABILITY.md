# KPTrace 可观测性系统 — 设计与实现报告

> **日期**：2026-03-31  
> **状态**：Sprint 1 完成（事件总线 + 结构化追踪 + 全链路插桩） + RAG Inspector 完成 + Sprint 2 部分完成（Debug Panel UI 基础功能）

---

## 1. 背景与动机

AI-COC-KP 的 Agent 系统（LangGraph 多 Agent 工作流）和记忆管道（短期记忆 / 长期摘要 / RAG 检索 / 用户行动图谱）在实际运行中完全是黑箱——没有任何机制能观察中间状态是否正确。

**问题**：
- 意图分类结果不可见
- RAG 检索注入了什么内容不可见
- 长期摘要是否遗漏关键事件无法验证
- 工具规划/验证/补救过程不可见
- 角色数值变化前后无快照对比

**目标**：构建完整的可观测性基础设施，支撑三个层级：
1. 开发调试（逐步查看 Agent 内部状态）
2. 运行时 Debug Panel（边玩边看）
3. 自动化质量检测（数值硬校验 + LLM-as-judge 叙事评估）

---

## 2. 架构设计

### 2.1 核心概念：Trace → Span → Event

```
Trace (一轮玩家交互)
├── Span: "rag_retrieval"      — RAG 检索
├── Span: "prompt_assembly"    — Prompt 构建
├── Span: "kp_agent"           — Agent 工作流（含主进程 LangGraph 事件）
├── Span: "tool_execution"     — 工具执行
├── Span: "state_update"       — 状态变更（角色/记忆/场景/线索）
└── Span: "long_term_summary"  — 长期摘要
```

### 2.2 主进程 ↔ 渲染进程事件传递

```
[Electron Main Process]                    [Renderer Process]
kpGraph.mjs nodes                          kpSessionService.ts
  ├→ _traceEvents[] (state field)     →    onKpStream 'trace' type
  └→ kpAgentHandlers.cjs                   └→ traceBus.emitRaw()
       └→ kp:stream {type:'trace'}
```

LangGraph 各节点将事件附加到 state 的 `_traceEvents` 数组，通过 `kp:stream` 的 `type: 'trace'` 回传渲染进程，无需新增 IPC channel。

---

## 3. 已实现内容

### 3.1 新增文件

| 文件 | 职责 | LOC |
|------|------|-----|
| `src/services/tracing/types.ts` | 类型定义（TraceEvent, Span, Trace, CharacterSnapshot, TraceEventMap） | ~85 |
| `src/services/tracing/traceBus.ts` | 单例事件总线（emit/subscribe/startTrace/endTrace/export） | ~100 |
| `src/services/tracing/index.ts` | 公共导出 | ~3 |
| `src/stores/debugStore.ts` | Pinia store，持有 traces 列表 + live 事件流，供 Debug Panel 消费 | ~50 |

### 3.2 修改的文件

| 文件 | 变更 |
|------|------|
| `src/stores/settingsStore.ts` | 新增 `debugMode` 字段（AppSettings + load/save + computed） |
| `src/stores/gameStore.ts` | 插桩：trace 生命周期管理、角色快照、记忆更新、场景/线索变更、长期摘要、错误追踪 |
| `src/services/kpSessionService.ts` | 插桩：Agent 循环迭代、LLM 生成时长、直连模式标记、主进程 trace 事件接收 |
| `src/services/ragService.ts` | 插桩：RAG 查询发送/接收 |
| `src/toolCalling/orchestrator.ts` | 插桩：每个工具执行的名称/参数/结果/耗时 |
| `electron/agent/kpGraph.mjs` | 新增 `_traceEvents` state 字段；6 个节点各发射对应事件 |
| `electron/ipc/kpAgentHandlers.cjs` | 提取并转发 `_traceEvents`；流式模式发送 `type:'trace'` |

### 3.4 Debug Panel UI（Sprint 2 新增）

| 文件 | 职责 |
|------|------|
| `src/components/game/DebugPanel.vue` | 实时 Trace 查看器，含 Live / Traces / Export 三个 Tab |

### 3.5 Debug Panel 集成修改（Sprint 2）

| 文件 | 变更 |
|------|------|
| `src/views/GameRoomView.vue` | 集成 DebugPanel 为可折叠右侧面板（420px），添加 DBG 切换按钮及 `Ctrl+Shift+D` 快捷键 |
| `src/views/SettingsView.vue` | 新增"开发调试"区域（仅 dev 模式可见），包含 debugMode 开关 |
| `src/App.vue` | 启动时根据 `debugMode` 或 `import.meta.env.DEV` 自动启用 tracing |

### 3.6 事件类型清单（28 种）

| Span | 事件类型 | 来源 |
|------|----------|------|
| rag_retrieval | `rag_query_sent` | ragService |
| rag_retrieval | `rag_context_received` | ragService |
| prompt_assembly | `system_prompt_built` | gameStore |
| kp_agent | `intent_classified` | kpGraph (main) |
| kp_agent | `agent_routed` | kpGraph (main) |
| kp_agent | `tool_plan_created` | kpGraph (main) |
| kp_agent | `llm_generate_start` | kpGraph (main) |
| kp_agent | `llm_generate_end` | kpGraph (main) + kpSessionService |
| kp_agent | `validation_result` | kpGraph (main) |
| kp_agent | `force_tools_invoked` | kpGraph (main) |
| kp_agent | `kp_agent_loop_iteration` | kpSessionService |
| kp_agent | `direct_chat_used` | kpSessionService |
| kp_agent | `trace_error` | gameStore |
| tool_execution | `tool_executed` | orchestrator |
| state_update | `character_snapshot` | gameStore |
| state_update | `character_delta` | (reserved) |
| state_update | `memory_updated` | gameStore |
| state_update | `scene_changed` | gameStore |
| state_update | `clue_added` | gameStore |
| long_term_summary | `summary_triggered` | gameStore |
| long_term_summary | `summary_input` | gameStore |
| long_term_summary | `summary_output` | gameStore |

---

## 4. 使用方式

### 4.1 启用追踪

```typescript
// 方式 1：通过 settingsStore（持久化）
const settings = useSettingsStore()
settings.settings.debugMode = true
await settings.save()

// 方式 2：通过 debugStore（运行时）
const debug = useDebugStore()
debug.setEnabled(true)
```

### 4.2 查看 Trace 数据

```typescript
const debug = useDebugStore()

// 实时事件流
debug.liveEvents  // TraceEvent[]

// 最近一轮 Trace
debug.latestTrace  // Trace | null

// 所有历史 Trace（最多 50 条）
debug.traces  // readonly Trace[]

// 导出为 JSON
const json = debug.exportTraces()
```

### 4.3 订阅实时事件

```typescript
import { traceBus } from '@/services/tracing'

const unsub = traceBus.subscribe((event) => {
  console.log(`[${event.spanName}] ${event.eventType}`, event.data)
})
// 取消订阅
unsub()
```

### 4.4 使用 Debug Panel

在游戏房间中打开 Debug Panel：

- **按钮**：点击顶部工具栏的 **DBG** 按钮
- **快捷键**：`Ctrl+Shift+D` 切换显示/隐藏
- **自动打开**：开发模式（`import.meta.env.DEV`）下自动展开

面板包含三个 Tab：

| Tab | 功能 |
|-----|------|
| **Live** | 实时事件流，显示当前 Trace 的所有事件 |
| **Traces** | 已完成的 Trace 历史，按 Span 分组并显示耗时 |
| **Export** | 将所有 Trace 数据导出为 JSON 文件下载 |

在设置页面（Settings）→ "开发调试"区域（仅 dev 模式可见）可通过 checkbox 持久化开启/关闭 debugMode。

---

## 5. 测试验证

- **24 test files, 137 tests — 全部通过**
- **0 linter errors**
- 所有插桩代码通过 `traceBus.enabled` 开关守护，关闭时零开销

---

## 6. 后续 Sprint 规划

### Sprint 2：Debug Panel UI（进行中）

**已完成：**
- ✅ `DebugPanel.vue` 组件：Live（实时事件流）/ Traces（按 Span 分组 + 耗时）/ Export（JSON 下载）三 Tab
- ✅ 集成到 `GameRoomView.vue`，可折叠右侧面板（420px）
- ✅ 顶部工具栏 **DBG** 切换按钮 + `Ctrl+Shift+D` 快捷键
- ✅ 开发模式下自动展开
- ✅ 设置页"开发调试"区域（dev-only），debugMode checkbox
- ✅ `App.vue` 启动时自动启用 tracing（debugMode 或 DEV 模式）

**待完成：**
- ⬜ 实时高亮当前 Span
- ⬜ 角色快照前后对比（diff 视图）
- ⬜ 长期摘要全文展示

### Sprint 3：自动化质量检测 Harness

- **数值硬校验**：断言 character_snapshot 中的 HP/SAN/MP 与工具执行结果一致
- **LLM-as-judge 叙事评估**：
  - 输入：长期摘要 + 实际对话历史
  - 评估维度：事实一致性、关键事件覆盖、遗漏检测
  - 输出：评分 + 具体差异报告
- **测试场景库**：预定义对话序列（战斗→受伤→急救→SAN 检定→疯狂），自动回放并验证

### Sprint 4：Trace 持久化与回放

- Trace 序列化到文件（JSON lines）
- Trace 回放：加载历史 trace，逐事件回放 UI 状态
- Trace 对比：同一对话的两次运行结果对比

---

## 7. 文件清单

```
src/services/tracing/
├── types.ts         # 类型定义
├── traceBus.ts      # 事件总线
└── index.ts         # 公共导出

src/stores/
├── debugStore.ts    # Debug 状态管理
└── settingsStore.ts # (修改) debugMode 字段

src/components/game/
└── DebugPanel.vue   # 实时 Trace 查看器（Live/Traces/Export）
```

已修改文件：`gameStore.ts`, `kpSessionService.ts`, `ragService.ts`, `orchestrator.ts`, `kpGraph.mjs`, `kpAgentHandlers.cjs`, `GameRoomView.vue`, `SettingsView.vue`, `App.vue`

---

## 8. RAG Inspector（开发专用页面）

### 8.1 目的

在进入实际游戏对话**之前**，检查 RAG / GraphRAG 系统对故事内容的提取和索引是否准确。主要回答：

- LLM 从故事文本中提取了哪些实体和关系？
- TF-IDF 索引了哪些 chunks？哪些有向量？
- 对给定查询，检索出的 chunks 是否合理？

### 8.2 架构

```
路由: /rag-inspector  (仅 import.meta.env.DEV === true 时注册)

RagInspectorView.vue
├── 故事选择器 (listIndexedStories)
├── Tab: Chunk 浏览器 → ChunkBrowser.vue
├── Tab: Graph 浏览器 → GraphBrowser.vue
└── Tab: 搜索测试器 → SearchTester.vue
```

**编译时排除**：路由通过 `import.meta.env.DEV` 条件注册，Vite 在生产构建时 tree-shake 掉整个 `RagInspectorView` 及其子组件。生产包中不会包含此页面的任何代码。

### 8.2.1 故事管理页内联 GraphRAG（dev-only）

在 `src/views/ScriptListView.vue` 的“已索引故事”列表卡片中，为每个 story 提供一个 dev-only 的“查看 GraphRAG / 收起 GraphRAG”折叠面板。展开后会懒加载 `getStoryGraph(scriptId)`（IPC: `rag:getGraph`），并复用 `src/components/rag/GraphBrowser.vue` 显示：

- 节点（entities：人物/线索/场景等）
- 关系边（edges：located_in/contains/unlocks/...）
- 社区摘要（communitySummaries：由 LLM 对连通子图聚合后的报告）

该入口用于在“索引完成”后校验 GraphRAG 提取质量，不影响游戏游玩时的运行时关系展示。

在内联折叠面板中还提供了一个 dev-only 的快速校验按钮：`测试 GraphRAG 抽取（前6 chunks）`。
该按钮会从已落盘的 `rag_index` 里取少量 chunks，直接调用 GraphRAG 抽取（LLM + `parseExtractOutput`），并在 UI 中展示每个 batch 的原始输出截断、entities/relations 解析数量与错误信息（用于定位“模型没调用”还是“输出格式不可解析”）。

### 8.3 IPC 新增

| Channel | 参数 | 返回 | 用途 |
|---------|------|------|------|
| `rag:getIndex` | `{ scriptId }` | `{ scriptId, storyName, chunkCount, chunks[] }` | 获取完整 chunk 列表（含 content、type、metadata、向量状态） |
| `rag:getGraph` | `{ scriptId }` | `{ scriptId, storyName, nodes[], edges[], communitySummaries }` 或 `null` | 获取完整 GraphRAG 数据 |
| `rag:testGraphRagExtract` | `{ scriptId, maxChunks?, maxBatches? }` | `{ ok, results[] }` | 从 `rag_index` 抽取少量 chunks 测试 GraphRAG 抽取：返回每个 batch 的原始输出片段与解析 entities/relations 数量（用于定位“模型没调用” vs “解析失败”） |
| `rag:testEmbedding` | `无`（使用当前 settings） | `{ ok, vectorLength? }` | 测试当前 embedding 配置是否能成功返回向量（用于配置排错） |

### 8.4 新增文件

| 文件 | 职责 |
|------|------|
| `src/views/RagInspectorView.vue` | 主视图：故事选择 + Tab 切换 + 统计概览 |
| `src/views/ScriptListView.vue` | 故事管理页：索引完成后内联折叠面板（GraphBrowser） |
| `src/components/rag/ChunkBrowser.vue` | Chunk 浏览器：分页、按 type 过滤、全文搜索、展开详情 |
| `src/components/rag/GraphBrowser.vue` | Graph 浏览器：节点列表（按类型过滤）、关系边表格、社区摘要、节点详情 + 关联边 |
| `src/components/rag/SearchTester.vue` | 搜索测试器：输入查询 → 调用 ragQuery/ragContext → 展示结果 + 耗时 |

### 8.5 修改的文件

| 文件 | 变更 |
|------|------|
| `electron/ipc/ragHandlers.cjs` | 新增 `rag:getIndex` 和 `rag:getGraph` IPC handlers |
| `electron/preload.cjs` | 新增 `ragGetIndex` / `ragGetGraph` preload 绑定 |
| `src/env.d.ts` | 新增 `ragGetIndex` / `ragGetGraph` 类型声明 |
| `src/services/ragService.ts` | 新增 `getStoryIndex()` / `getStoryGraph()` 函数 |
| `src/router/index.ts` | 通过 `import.meta.env.DEV` 条件注册 `/rag-inspector` 路由 |
| `src/views/ScriptListView.vue` | 已索引故事：内联折叠面板懒加载并复用 GraphBrowser |

### 8.6 功能详情

#### Chunk 浏览器
- 分页展示（每页 30 条），支持全文搜索和按 type 过滤
- 显示 chunk ID、类型标签（颜色区分）、内容预览
- 向量化状态指示（⬡ = 有向量，○ = 仅 TF-IDF）
- 展开查看完整内容 + metadata

#### Graph 浏览器
- 三个子 Tab：节点、关系边、社区摘要
- 节点支持按 type 过滤和名称搜索
- 选中节点显示详情（content、community、关联 chunks、连接的边）
- 关系边以表格展示（source → type → target → label）
- 社区摘要完整展示 LLM 生成的社区报告

#### 搜索测试器
- 支持两种模式：Raw Chunks（直接检索）和 Formatted Context（完整上下文构建）
- 可调 TopK 参数
- 显示检索耗时、distance 分数、chunk metadata
- 用于验证检索质量：对关键问题（"谁是凶手？"）检索结果是否合理

### 8.7 验证

- **137 tests 全部通过**，无回归
- **0 linter errors**
- 生产构建不包含 RAG Inspector 代码（`import.meta.env.DEV` 编译时排除）

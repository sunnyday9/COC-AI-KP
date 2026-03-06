# AI KP COC 测试说明

本项目的功能测试计划基于《守秘人规则书 2002c》与《调查员手册 v1.21》的规则映射（见 [COC-KP-GAP-ANALYSIS.md](COC-KP-GAP-ANALYSIS.md)），验证已实现行为符合规则书对应章节。

## 测试分层与范围

| 层级 | 目录/文件 | 说明 |
|------|-----------|------|
| **单元测试** | `src/logic/__tests__/` | 规则公式（coc7Rules）、角色创建与衍生（coc7Character） |
| | `src/services/__tests__/diceService.spec.ts` | 骰子范围、cocResult 大成功/大失败 |
| | `src/services/__tests__/memoryService.spec.ts` | 长期记忆摘要：摘要 prompt 组装、storyContext 注入、失败兜底 |
| | `src/toolCalling/handlers/__tests__/` | 各 handler：check、combat、sanity、resource、narrative |
| **集成测试** | `src/toolCalling/__tests__/orchestrator.spec.ts` | 多工具调用、未知工具错误 |
| | `src/services/__tests__/kpSessionService.spec.ts` | KP 流式调用与工具循环（mock Electron IPC） |
| | `src/stores/__tests__/gameStoreMemory.spec.ts` | 记忆系统集成：场景切换触发摘要（含 storyContext）、存档/读档包含记忆字段 |
| **Electron 单元/集成（Node 环境）** | `electron/rag/__tests__/vectorStore.spec.ts` | RAG 索引/持久化/检索（TF-IDF & dense embedding 路径、scene/type 过滤、buildContext 格式） |
| | `electron/rag/__tests__/embedding.spec.ts` | 内置 embedding（Transformers.js pipeline）与用户 API embedding（fetch /v1/embeddings） |
| | `electron/agent/__tests__/kpGraph.spec.ts` | LangGraph KP 图：意图路由、缺失工具强制、文本模拟清理 |
| **E2E（Playwright Electron）** | `e2e/electron.e2e.mjs` | 真实 UI 主流程：注入 RAG 索引 → 选故事 → 选职业 → 自动补齐建角表单 → 进入游戏 → 发消息 → 存档/读档（AI 走 `E2E_MOCK_AI`） |

## 规则书章节 → 测试对应

| 规则书章节 | 测试文件 | 覆盖要点 |
|------------|----------|----------|
| **第五章 游戏系统** | coc7Rules.spec.ts, checkHandler.spec.ts, resourceHandler.spec.ts | 技能检定阈值（常规/困难/极难）、大成功/大失败、对抗检定与 tieBreaker、孤注一掷 isPush、幸运消耗 |
| **第六章 战斗** | coc7Character.spec.ts（getDamageBonusAndBuild）, combatHandler.spec.ts | 伤害加值/体格表、近战/远程一击、即死/重伤/濒死（apply_major_wound） |
| **第八章 理智** | sanityHandler.spec.ts | SAN 检定与当日累计、永久疯狂（SAN 归零）、新日重置（reset_day） |
| **调查员手册** | coc7Character.spec.ts | 职业技能、兴趣技能、合并、衍生（母语/闪避）、HP/MP/SAN 公式、伤害加值表 |

## 运行测试

```bash
npm run test        # 监听模式
npm run test:run    # 单次运行
```

Electron 真实进程冒烟（更贴合真实场景，覆盖 IPC + preload + BrowserWindow）：

```bash
npm run test:electron:smoke
```

Playwright Electron UI E2E（更贴近真实用户操作，自动走完整主流程）：

```bash
npm run test:e2e:electron
```

覆盖率（可选）：

```bash
npm run test:run -- --coverage
```

当前 coverage 包含（见 `vitest.config.ts`）：`src/logic/**/*.ts`、`src/toolCalling/**/*.ts`、`src/services/kpSessionService.ts`、`src/services/memoryService.ts`、`src/stores/gameStore.ts`。

并已扩展到 Electron 核心模块（Node 环境下运行）：`electron/agent/kpGraph.mjs`、`electron/rag/vectorStore.mjs`、`electron/rag/embedding.mjs`。

## 新增：记忆系统与 multi-agent/RAG 相关测试说明（今日完善）

### 1) 记忆系统（Short-term / Long-term）

#### 长期摘要（`longTermSummary`）为何要测

- 长期摘要是“跨回合/跨会话”的稳定上下文来源；如果摘要 prompt 缺字段或拼接错误，会导致摘要跑偏。
- 今天引入了 **方案 A**：摘要合并时引入 `storyContext`（当前场景、SAN、线索等）作为权威校正信息，因此需要测试：
  - `storyContextText` 是否被注入到摘要调用的 prompt；
  - LLM 调用失败时是否保持旧摘要（不破坏游戏状态）。

对应用例：`src/services/__tests__/memoryService.spec.ts`

#### 场景切换触发摘要（集成）

- `transition_scene` 工具会更新 `currentScene`，并触发“fire-and-forget”的摘要更新。
- 测试重点不是 LLM 本身，而是 **触发点** 与 **传参**（是否带上场景/SAN/线索）。

对应用例：`src/stores/__tests__/gameStoreMemory.spec.ts`

### 2) 存档/读档（Save/Load）

今天的存档需要覆盖：

- `messages`（对话）
- `kpMemory`（短期记忆块来源）
- `longTermSummary` / `longTermFacts`（长期记忆）
- `currentScene` / `cluesObtained` / `characterSheet` 等关键状态

对应用例：`src/stores/__tests__/gameStoreMemory.spec.ts`

### 3) RAG（剧本索引与检索）——自动化测试与人工验证

RAG 的核心检索逻辑在 Electron 侧（`electron/rag/vectorStore.mjs`），Vitest 当前默认只跑 `src/**`，因此本阶段主要做：

- **前端调用链不回归**：保证 gameStore 每回合仍能把“故事情报”注入 system prompt；sceneId 会在存在时传给 RAG（前端层面）。
- **PDF OCR 索引能力**：涉及 Electron + pdf-lib + tesseract.js，建议先以人工回归为主（见下）。

#### 建议的人工回归用例（PDF OCR + 索引）

1. 导入一个包含“结构图/插图文字”的 PDF（图里带明显中文文字）。
2. 在“脚本列表/故事列表”中执行索引。
3. 在游戏中用关键字提问（来自图中文字），确认“故事情报”中能检索到对应内容。

> 如果后续要做自动化，可考虑新增 Electron 集成测试（Node 环境）或独立脚本测试 `file:readStoryForRag` 的输出是否包含 OCR 段落。

**更新（已完成）**：当前已新增 `electron/rag/__tests__/vectorStore.spec.ts`，在 Node 环境模拟 `electron.app.getPath('userData')` 指向临时目录，从而可自动化验证：

- 索引写盘（`userData/rag_index/*.json`）
- queryTopK 结果排序正确
- `sceneId` / `type` 过滤与回退逻辑
- dense embedding 路径（doc.vector 存在时使用 cosineSimilarityArray）

### 4) PDF OCR（索引读取）与 Electron IPC glue —— 建议的回归清单

这部分逻辑涉及：

- Electron IPC handler：`electron/ipc/fileHandlers.cjs` 的 `file:readStoryForRag`
- PDF 解析与内嵌图 OCR：`pdf-parse` + `pdf-lib` + `tesseract.js`
- RAG index IPC：`electron/ipc/ragHandlers.cjs` 的 `rag:index`（可选 embedding）

由于它们强依赖 Electron 运行时（`ipcMain/app.getPath`）与 OCR 运行时资源（语言包、CPU/线程），**目前自动化用例以“Node 模拟 + 单元覆盖”为主，OCR 端到端以人工回归为主**。

#### 4.1 人工回归：PDF 内嵌图 OCR 是否进入索引

1. 准备 PDF：正文包含若干段文字，且至少一张“内嵌图片”带可识别的中文（比如场景结构图）。
2. 在应用中导入 PDF → 点击“索引”。
3. 开始游戏后，输入图片中的关键字/短语（例如结构图里的节点名称）。
4. 观察 KP 回合的 system prompt（或 RAG 输出）：确认“故事情报”中能检索到 OCR 段落（通常会带 `[插图 n]` 标识）。

通过标准：
- 关键字能命中，且命中内容来自 OCR 段落（不是正文重复）。

#### 4.2 人工回归：失败降级（OCR 失败不影响正文索引）

1. 使用一个 PDF，但人为制造 OCR 失败条件（例如禁用网络/缺失语言包/或用极端图片）。
2. 重新索引。
3. 用正文关键字检索，确认仍能命中正文 chunk（系统不崩溃、不报错阻断索引）。

#### 4.3 人工回归：Embedding provider 切换（builtin vs api）

1. 设置里开启 RAG embeddings，选择 builtin。
2. 索引故事，检索一条 query，确认能返回结果。
3. 切换为 api（OpenAI-compatible baseUrl + apiKey + model），重新索引同一故事。
4. 检索同样 query，确认仍能返回结果（且响应时间/相关性符合预期）。

#### 4.4 人工回归：sceneId 过滤的前向兼容性

当前前端会把 `currentScene` 作为 `sceneId` 传给 RAG。若索引 chunk 还没写入 `metadata.scene_id`，RAG 会回退到全局候选集。

回归要点：
- 有 sceneId 时不会导致“检索结果为空”（应回退全局）。
- 未来如果 chunk 带 scene_id，过滤应生效（可用结构化 Markdown 剧本验证）。

## Mock 指南（Vitest）

### Mock Electron IPC

- 前端通过 `window.electronAPI` 调用 Electron IPC。测试中可直接挂载：

```ts
(globalThis.window as any).electronAPI = {
  kpInvokeStream: vi.fn(),
  onKpStream: (handler) => { /* store handler */ return () => {} },
  writeSave: vi.fn(),
  readSave: vi.fn(),
  listSaves: vi.fn(),
}
```

### Mock LLM（chat）

- `memoryService` 依赖 `src/services/ai` 的 `chat()`；测试里用 `vi.mock('../ai', ...)` 注入可控返回值即可。

## 规则书有、当前未测（未实现或 P1/P2）

以下机制在 COC-KP-GAP-ANALYSIS 中列为缺失或后续优先级，**本阶段不写自动化用例**，便于日后实现时补测：

- **第五章**：幕间成长、技能标记与成长检定
- **第六章**：急救/医学、自然恢复、先攻、战技（Build 比较）、枪械详细规则、环境伤害表
- **第七章**：追逐系统整体
- **第八章**：Max SAN = 99 - 克苏鲁神话、SAN 恢复（剧本奖励、心理治疗、自救）、习惯恐惧
- **第九章**：魔法、典籍、施法检定
- **第十章**：信用评级经济、NPC 幸运池

## 可追溯性

- 每个 `*.spec.ts` 的 `describe` 尽量对应「规则书章节 + 功能点」（如「第五章 技能检定 – 困难/极难阈值」）。
- 规则公式与阈值以 [coc7Rules.ts](../src/logic/coc7Rules.ts) 为单一实现，gameStore 与 handler 通过 context 引用，便于与规则书对照维护。

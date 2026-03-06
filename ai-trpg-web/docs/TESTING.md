# AI KP COC 测试与 TDD 说明

本项目的测试体系和 TDD 流程围绕《守秘人规则书 2002c》与《调查员手册 v1.21》的规则映射展开（见 [COC-KP-GAP-ANALYSIS.md](COC-KP-GAP-ANALYSIS.md) 与 [COC7_KP_WORKFLOW.md](COC7_KP_WORKFLOW.md)）。本文件说明测试分层、规则书映射、TDD 流程以及具体场景覆盖。

---

## 1. 测试分层与范围

| 层级 | 目录/文件 | 说明 |
|------|-----------|------|
| **单元测试（规则/工具级）** | `src/logic/__tests__/` | 规则公式（`coc7Rules`）、角色创建与衍生（`coc7Character`） |
| | `src/services/__tests__/diceService.spec.ts` | 骰子范围、cocResult 大成功/大失败 |
| | `src/services/__tests__/memoryService.spec.ts` | 长期记忆摘要：摘要 prompt 组装、storyContext 注入、失败兜底 |
| | `src/toolCalling/handlers/__tests__/` | 各 handler：check、combat、sanity、resource、narrative（直接验证 tool 行为与角色状态变更） |
| **集成测试（前端服务/Store）** | `src/toolCalling/__tests__/orchestrator.spec.ts` | 多工具调用、未知工具错误、handler 路由与聚合 |
| | `src/services/__tests__/kpSessionService.spec.ts` | KP 流式调用与工具循环（mock Electron IPC：`kpInvoke`/`kpInvokeStream`） |
| | `src/stores/__tests__/gameStoreMemory.spec.ts` | 记忆系统集成：场景切换触发摘要（含 storyContext）、存档/读档包含记忆字段 |
| **Electron 单元/集成（Node 环境）** | `electron/rag/__tests__/vectorStore.spec.ts` | RAG 索引/持久化/检索（TF-IDF & dense embedding 路径、scene/type 过滤、`buildContext` 格式） |
| | `electron/rag/__tests__/embedding.spec.ts` | 内置 embedding（Transformers.js pipeline）与用户 API embedding（`/v1/embeddings`） |
| | `electron/agent/__tests__/kpGraph.spec.ts` | LangGraph KP 图：意图路由、缺失工具强制、文本模拟清理、storyContext 注入 |
| | `electron/ipc/__tests__/pathSafety.spec.ts` | IPC 路径安全：saveId 校验、目录白名单、符号链接逃逸防护 |
| | `electron/__tests__/logging.spec.ts` | 日志封装格式：`logInfo/logWarn/logError` 输出统一前缀与组件名 |
| **脚本/工具测试** | `scripts/__tests__/sync-tools.spec.ts` | 验证 `scripts/sync-tools.cjs` 输出的 `cocToolNames.json` 与 `COC_KP_TOOLS` 一致 |
| **E2E（Playwright Electron）** | `e2e/electron.e2e.mjs` | 真实 UI 主流程：注入 RAG 索引 → 选故事 → 选职业 → 自动补齐建角表单 → 进入游戏 → 发消息 → 存档/读档（AI 走 `E2E_MOCK_AI`） |

---

## 2. 规则书章节 → 测试对应

| 规则书章节 | 测试文件 | 覆盖要点 |
|------------|----------|----------|
| **第五章 游戏系统** | `coc7Rules.spec.ts`, `checkHandler.spec.ts`, `resourceHandler.spec.ts` | 技能检定阈值（常规/困难/极难）、大成功/大失败、对抗检定与 tieBreaker、孤注一掷 isPush、幸运消耗 |
| **第六章 战斗** | `coc7Character.spec.ts`（`getDamageBonusAndBuild`）, `combatHandler.spec.ts` | 伤害加值/体格表、近战/远程一击、即死/重伤/濒死（`apply_major_wound`）、角色战斗派生字段 |
| **第八章 理智** | `sanityHandler.spec.ts` | SAN 检定与当日累计、永久疯狂（SAN 归零）、新日重置（`reset_day`）、`trigger_insanity` 疯狂状态字段 |
| **调查员手册** | `coc7Character.spec.ts` | 职业技能、兴趣技能、技能合并、衍生（母语/闪避）、HP/MP/SAN 公式、伤害加值表 |

新增功能（如急救/医学、幕间成长、魔法、追逐等）实现时，需在本表中补充对应章节与测试文件映射。

---

## 3. Phase 1（Sprint 1：治疗与 Max SAN）TDD 用例规划

> 参考 `COC-KP-SPRINT-PLAN.md`：Sprint 1 主题为「急救/医学、自然恢复、Max SAN 限制」。

### 3.1 急救（First Aid）与医学（Medicine）

- **规则依据**：第六章 战斗（急救/医学）  
- **目标工具/模块**：
  - 新增工具：`first_aid`、`medicine`（推荐在 `combatHandler` 或新建 `healingHandler` 中实现）。
- **计划测试文件**：
  - `src/toolCalling/handlers/__tests__/healingHandler.spec.ts`（或扩展 `combatHandler.spec.ts`）  
- **核心用例（GIVEN/WHEN/THEN）**：
  - *用例 1：成功急救增加 HP 并稳定濒死*
    - GIVEN：角色 HP=2/10，`hasMajorWound=true`，`isDying=true`，最近一次攻击结束后 1 小时内。
    - WHEN：KP 工具调用 `first_aid` 返回成功。
    - THEN：
      - HP 增加 1（不超过 hpMax）。
      - `isDying=false`（从濒死状态稳定为重伤）。
      - 生成系统消息「急救成功」并记录新的 HP。
  - *用例 2：急救失败不改变状态*
    - GIVEN：同上。
    - WHEN：`first_aid` 返回失败。
    - THEN：HP、`isDying`、`hasMajorWound` 不变，仅生成失败提示消息。
  - *用例 3：医学治疗增加 1D3 HP*
    - GIVEN：角色 HP=3/10，已被标记为「已急救」，当前一天内、处于适当医疗环境。
    - WHEN：`medicine` 检定成功，骰出 3。
    - THEN：HP 增加 3（不超过 hpMax），生成「医学治疗成功」消息。
  - *用例 4：医学失败无恢复*
    - GIVEN：同上。
    - WHEN：`medicine` 检定失败。
    - THEN：HP 不变，仅生成失败提示。
  - *用例 5：满血时治疗无效*
    - GIVEN：角色 HP=hpMax。
    - WHEN：调用 `first_aid` 或 `medicine`。
    - THEN：HP 不变，提示「无需治疗」或不产生治疗类系统消息。

#### 3.1.1 当前实现与测试（2026-03-06）

- **工具实现**：
  - 已在 `electron/ipc/aiHandlers.cjs` 中新增 `first_aid`、`medicine` 工具定义。
  - 在 `src/toolCalling/handlers/combatHandler.ts` 中实现对应 handler 逻辑（治疗量限制为不超过 `hpMax`，`first_aid` 可稳定濒死状态）。
- **单元测试**：
  - 文件：`src/toolCalling/handlers/__tests__/healingHandler.spec.ts`（内部调用 `combatHandler`）。
  - 覆盖用例：
    - 濒死 + 重伤时成功急救：HP +1，`isDying` 从 `true` 变为 `false`。
    - 濒死 + 重伤时急救失败：HP 与 `isDying` 不变，仅生成失败提示。
    - 医学成功：在合适医疗环境下按 1D3（可控）增加 HP，不超过 `hpMax`。
    - 医学失败：HP 不变，仅生成失败提示。
    - 满血（HP=hpMax）时调用急救/医学：HP 不变，输出「无需急救/无需医学治疗」类提示。

### 3.2 自然恢复（Natural Healing）

- **规则依据**：第六章 战斗（自然恢复）  
- **目标工具/模块**：
  - 可选：新增 `natural_healing` 工具，或在服务层实现独立恢复函数（如 `healingRules`）。
- **计划测试文件**：
  - `src/logic/__tests__/healingRules.spec.ts`（建议）  
- **核心用例**：
  - *用例 1：轻伤自然恢复每天 +1 HP*
    - GIVEN：角色仅有轻伤（未达重伤条件），HP=6/10。
    - WHEN：调用 `natural_healing({ days: 1, isMajorWound: false })`。
    - THEN：HP 变为 7（不超过 hpMax）。
  - *用例 2：重伤自然恢复按周 CON 检定*
    - GIVEN：角色为重伤状态，HP=3/10，`CON=60`。
    - WHEN：一周恢复流程模拟 → 执行 CON 检定成功，恢复 1D3=2。
    - THEN：HP 变为 5。
  - *用例 3：重伤自然恢复失败无恢复*
    - GIVEN：同上。
    - WHEN：CON 检定失败。
    - THEN：HP 不变。

#### 3.2.1 当前实现与测试（2026-03-06）

- **规则实现**：
  - 已在 `src/logic/healingRules.ts` 中实现 `applyNaturalHealing(state, options)`：
    - 轻伤（无重伤标记）按 `days` 每天 +1 HP，最多至 `hpMax`。
    - 重伤（有重伤标记）按 `weeks` 进行 CON 检定，成功时每周 +1D3 HP，始终不超过 `hpMax`。
- **单元测试**：
  - 文件：`src/logic/__tests__/healingRules.spec.ts`。
  - 覆盖用例：
    - 轻伤角色单日与多日自然恢复（累积不超过 `hpMax`）。
    - 重伤角色多周恢复：检定成功时增加 1D3 HP，失败时不变。
    - 接近 `hpMax` 的边界场景，验证恢复后不会超出最大 HP。

### 3.3 Max SAN 限制（Max SAN = 99 - Cthulhu Mythos）

- **规则依据**：第八章 理智  
- **目标模块**：
  - `sanityHandler` 中的 `adjust_san` / `san_check` 逻辑。
- **计划测试文件**：
  - 扩展 `src/toolCalling/handlers/__tests__/sanityHandler.spec.ts`  
- **核心用例**：
  - *用例 1：SAN 提升不超过 Max SAN*
    - GIVEN：`cthulhuMythos=20` → Max SAN=79，当前 SAN=75。
    - WHEN：通过 `award_san` 或治疗效果尝试增加 10 点 SAN。
    - THEN：最终 SAN 为 79（被 clamp），不超过 Max SAN。
  - *用例 2：克苏鲁神话提升后 Max SAN 降低*
    - GIVEN：`cthulhuMythos=10` 时 SAN=80，之后神话提升至 30（Max SAN=69）。
    - WHEN：调用使 `cthulhuMythos` 增长的逻辑（例如 `read_tome`，未来 Sprint 3 实现）。
    - THEN：SAN 被重新 clamp 到 69。
  - *用例 3：负向 SAN 变化不受 Max SAN 限制*
    - GIVEN：`cthulhuMythos=20`，SAN=60。
    - WHEN：通过 `san_check` 或 `adjust_san` 扣除 10 SAN。
    - THEN：SAN=50，正常扣减，无额外限制。

#### 3.3.1 当前实现与测试（2026-03-06）

- **规则实现**：
  - 角色卡中已包含 `cthulhuMythos` 字段（见 `src/types/character.ts` 与相关实现）。
  - 在 `src/toolCalling/handlers/sanityHandler.ts` 的 `adjust_san` 中实现 Max SAN clamp：
    - 负向 SAN 变化（`delta < 0`）保持原行为，仅累加当日 SAN 损失。
    - 正向 SAN 变化（`delta > 0`）后，读取 `cthulhuMythos` 计算 `maxSan = 99 - cthulhuMythos`，当当前 SAN 超出上限时，再次调用 `updateCharacterSAN` 将其压回 `maxSan`。
- **单元测试**：
  - 文件：`src/toolCalling/handlers/__tests__/sanityHandler.spec.ts`。
  - 覆盖用例：
    - 有神话值时正向 SAN 提升被 clamp 在 `99 - cthulhuMythos`。
    - 神话值提升导致 Max SAN 降低时，对已有 SAN 的重新 clamp。
    - 负向 SAN 变化不受 Max SAN 限制，正常扣减并累加当日损失。

> 上述用例为 **TDD 规划**：在真正实现/扩展工具与规则前，先按这些用例在对应 `*.spec.ts` 文件中写出测试 skeleton，再补实现代码。

---

## 3. TDD 流程与约定

### 3.1 一般约定

- **先写测试再写实现**：对每个 GAP 条目/新工具，先在对应的 `*.spec.ts` 中写出「GIVEN/WHEN/THEN」用例，再补实现。
- **每个工具至少两级测试**：
  - 规则级：handler 单元测试（`src/toolCalling/handlers/__tests__` 或 `src/logic/__tests__`）。
  - 流程级：视需要在 `kpSessionService` 或 `gameStore` 层加集成测试，确保前端能消费该工具结果。
- **可追溯性**：
  - 每个 `describe` 标题尽量包含「规则书章节 + 功能点」（如「第五章 技能检定 – 困难/极难阈值」）。
  - 新增功能要同步更新本文件与 `COC-KP-GAP-ANALYSIS.md`/`COC7_KP_WORKFLOW.md`。

### 3.2 针对「工具」的 TDD 流程（示例）

以未来计划中的 `first_aid`/`medicine` 为例：

1. **在 GAP 文档中确认规则**（急救+1 HP、医学+1D3 HP、濒死稳定等），整理测试用例。
2. **编写 handler 单测 skeleton**（例如 `src/toolCalling/handlers/__tests__/healingHandler.spec.ts`）：
   - 用例示例：
     - 急救：受伤且未稳定的角色，成功急救后 HP 增加 1、濒死状态解除。
     - 医学：在接受过急救的前提下，成功医学检定使 HP 增加 1D3。
3. **实现 handler 逻辑**（modifying/adding handler 文件）。
4. 如涉及存档/读档或 KP 业务流程，再在 `gameStoreMemory.spec.ts` / `kpSessionService.spec.ts` 中加一条集成用例。

### 3.3 状态与存档字段扩展的 TDD 流程

当扩展 `COCCharacterSheet` 或存档结构（如增加 `cthulhuMythos`、`skillGrowthMarks`、治疗标记等）：

1. 在 `coc7Character.spec.ts` 中验证：
   - `buildCharacterSheet` 默认填充的新字段值。
2. 在 `gameStoreMemory.spec.ts` 中验证：
   - 将新字段写入 store 状态 → `saveGame` → `loadGame` → 字段保持一致。
3. 若新字段参与规则（例如 Max SAN），在对应 handler 的测试中覆盖 clamp 或派生逻辑。

### 3.4 KP 流程 / LangGraph 改动的 TDD 流程

- Graph 层（Node 环境）：
  - 在 `electron/agent/__tests__/kpGraph.spec.ts` 中针对新分支/新状态（如新增 requiredTools、利用 storyContext 字段）增加用例，直接调用 Graph。
- 前端服务层：
  - 在 `src/services/__tests__/kpSessionService.spec.ts` 中，对 `runKpAgentLoop` 的回调/参数结构修改进行回归（mock `window.electronAPI.kpInvoke` 返回含 toolCalls 的结果，断言 processToolCalls 被调用次数、messages 顺序等）。

### 3.5 RAG / OCR / Embedding 的 TDD 流程

- 索引/检索逻辑：
  - 已由 `vectorStore.spec.ts` 和 `embedding.spec.ts` 覆盖；新增字段（如 `indexedStoryCount`）或过滤策略时先补测试。
- OCR 与 PDF 大小限制：
  - 自动化测试以 Node 环境 stub 为主；端到端 OCR 通过人工回归（见下文「RAG 测试说明」）。

---

## 4. 运行测试

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

以下机制在 COC-KP-GAP-ANALYSIS 中列为缺失或后续优先级，**当前仍未实现或未进入自动化测试范围**，便于日后实现时补测：

- **第五章**：幕间成长、技能标记与成长检定
- **第六章**：先攻、战技（Build 比较）、枪械详细规则、环境伤害表
- **第七章**：追逐系统整体
- **第八章**：SAN 恢复（剧本奖励、心理治疗、自救）、习惯恐惧
- **第九章**：魔法、典籍、施法检定
- **第十章**：信用评级经济、NPC 幸运池

## 可追溯性

- 每个 `*.spec.ts` 的 `describe` 尽量对应「规则书章节 + 功能点」（如「第五章 技能检定 – 困难/极难阈值」）。
- 规则公式与阈值以 [coc7Rules.ts](../src/logic/coc7Rules.ts) 为单一实现，gameStore 与 handler 通过 context 引用，便于与规则书对照维护。

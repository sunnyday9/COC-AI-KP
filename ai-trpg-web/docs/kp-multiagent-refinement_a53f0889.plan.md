---
name: kp-multiagent-refinement
overview: Refine the existing KP LangGraph multi-subagent system with stronger narrative, sanity, resource, and generic subagent controls, including story context wiring and code-level guardrails.
todos:
  - id: wire-story-context
    content: 设计 storyContext 结构并从 Electron/前端串到 kpGraph 初始 state 或 system message
    status: completed
  - id: narrative-progress-analyzer
    content: 在 kpGraph 中实现 analyzeNarrativeProgress，并驱动 narrative/generic Plan 节点自动追加 grant_clue/transition_scene
    status: completed
  - id: narrative-storycontext-prompt
    content: 在 narrativeAgent generate 节点中注入结构化 storyContext 引导叙事与行动选项
    status: completed
  - id: sanity-agent-flow
    content: 为 sanityAgent 设计并实现基于当前 SAN/dailySanLoss 的 plan 规则（强制 san_check/trigger_insanity）
    status: completed
  - id: resource-agent-rules
    content: 为 resourceAgent 设计资源操作规则，并在 plan 中映射到 spend_luck/adjust_mp/adjust_san 等工具
    status: completed
  - id: generic-agent-guardrails
    content: 收紧 genericAgent 的行为，避免跑偏，必要时将话题引回当前故事场景
    status: completed
  - id: kpgraph-tests-docs
    content: 为 kpGraph 多子 Agent 与叙事进度规则补充单元测试和文档说明
    status: in_progress
isProject: false
---

## KP 多子 Agent 系统整体优化方案

### 1. 目标与范围

- **目标**：在现有 KP LangGraph 多子 Agent 架构上，系统性加强：
  - 叙事控制（场景感、调查节奏、回到主线的能力）；
  - 理智流（SAN）的流程安全与叙事质量；
  - 资源操作（幸运/MP/小幅 SAN 调整）的结构化处理；
  - generic 兜底 Agent 的“防跑偏”与规则回答行为；
  - 子 Agent 间协作与 storyContext 传递。
- **范围**：
  - 仅改动 Electron 侧 KP Agent 与相关文档/测试：
    - `[ai-trpg-web/electron/agent/kpGraph.mjs]`（LangGraph 装配与节点）；
    - 如有需要，补充/对接 `[ai-trpg-web/electron/ipc/*.cjs]` 用于 storyContext 注入；
    - 文档更新在 `[ai-trpg-web/docs/COC-KP-GAP-ANALYSIS.md]` 或新增设计说明。

### 2. 当前结构回顾（简述）

- 顶层图：`START → analyzeInput → routeByIntent → {generic/combat/sanity/narrative/resource Plan+Generate} → validate → (forceTools?) → END`。
- 子 Agent：
  - `combatAgent` / `sanityAgent` / `narrativeAgent` / `resourceAgent` / `genericAgent` 共享 `KPState`，通过 `agentType` 标记当前轮类型。
  - 所有子 Agent 的输出都经由统一的 `validate`（工具缺失 + 文本骰子检测）和 `forceTools`（仅工具重试）。
- 叙事相关：`narrativeAgent` 已通过 agentHint 要求“场景感 + 行动反馈 + 行动选项 + 工具驱动剧情”，但尚未引入 storyContext 与程序级的“叙事进度”控制。

### 3. 整体优化路线（分阶段）

#### Phase 1：巩固多子 Agent 架构与基础约束（已部分完成）

1. **梳理并记录现有多子 Agent 设计**：
  - 在 `COC-KP-GAP-ANALYSIS.md` 中增加专节，描述：
    - 顶层 Orchestration Agent 的节点与状态；
    - combat/sanity/narrative/resource/generic 的职责划分与约束；
    - `requiredTools + validate/forceTools + agentHint` 的三层安全机制。
2. **确保路由策略清晰稳定**：
  - 在 `[kpGraph.mjs]` 内保持 `routeByIntent` 仅基于 `playerIntent`，并为每个 intent 显式定义路由（避免隐式 fallthrough）。
  - 为 `agentType` 添加简单的日志/调试点（后续在测试中观察）。

#### Phase 2：叙事子 Agent（narrative/investigate）的结构化强化

1. **引入 storyContext 入口（外部传入）**：
  - 设计一个轻量 `storyContext` 结构（即使先只用少数字段）：
    - `sceneId` / `sceneName` / `sceneType`；
    - `act`（hook / investigation / confrontation / aftermath）；
    - `openClues[]`（待触达线索摘要）；
    - `activeNPCs[]`（包含名字+角色）；
  - 选择一种注入方式：
    - **首选**：在 Electron IPC 的 `invokeKPAgent` 调用路径中，增加可选 `storyContext` 参数，并在创建初始 state 时写入 `KPState`（例如 `storyContext` 字段）；
    - **次选**：在 system message 中以 `STORY_CTX:{...}` 形式嵌入 JSON，由 `kpGraph` 解析后写入 state。
  - **已实现**：
    - 在 `KPState` 中新增 `storyContext` 字段（默认 `null`），用于承载前端/剧本提供的结构化故事状态；
    - 在 `invokeKPAgent(messages, invokeLLM, storyContext)` 中，将第三参数（如存在）写入初始 state：`{ messages, storyContext }`；
    - 在 Electron 侧 `kpAgentHandlers.cjs` 的 `kp:invoke` / `kp:invokeStream` IPC handler 中，解构并透传可选 `storyContext` 到 KP 图：
      - 前端可按 `{ sceneId, sceneName, sceneType, act, openClues, activeNPCs, sanity?: { currentSan, dailySanLoss, potentialLoss }, ... }` 结构传入。
2. **设计叙事进度分析器（代码级）**：
  - 在 `[kpGraph.mjs]` 中新增纯函数 `analyzeNarrativeProgress(state)`：
    - 读取：`playerIntent`、当前回合 `toolCalls`、`narrativeStallLevel`；
    - 输出：
      - `nextStallLevel`（停滞等级，0–10 之间自动 clamp）；
      - `shouldForceClue`（多轮 narrative/investigate/explore/talk_npc/move 等意图但未使用推进剧情工具时为真）；
      - `shouldForceScene`（长时间停滞时为真，用于建议切场）；
    - 使用一个简单计数器而非完整历史回溯：当在叙事相关意图下且本轮未调用 `grant_clue` / `transition_scene` / `skill_check` 时，`stallLevel++`，否则在使用上述工具时重置为 0。
3. **在 narrative/generic Plan 节点中施加硬约束**：
  - 对 `agentKind === 'narrative' || 'generic'` 的 `createPlanNode`：
    - 在原有 `TOOL_PLANS` 基础上：
      - 调用 `analyzeNarrativeProgress(state)`，得到 `stallInfo`；
      - 仅在 `playerIntent` 属于 `investigate` / `explore` / `talk_npc` / `move` / `narrative` / `tool_continuation` 时应用该约束；
      - 当 `stallInfo.shouldForceScene` 为真且当前 agent 为 `narrative` 时，向 `requiredTools` 追加 `transition_scene`（如未包含）；
      - 否则当 `stallInfo.shouldForceClue` 为真时，向 `requiredTools` 追加 `grant_clue`（如未包含）；
      - 将 `stallInfo.nextStallLevel` 写回 state：在 Plan 节点返回对象中带上 `narrativeStallLevel` 字段。
  - 使得“长期原地聊天”会被系统自动转化为“必须给线索/必须切场景”的工具链需求，而不是只靠 prompt 告诫。
4. **利用 storyContext 丰富 narrativeAgent 的提示**：
  - 在 `createGenerateNode(..., 'narrative')` 中：
    - 把 `state.storyContext` 以结构化片段写入 system（仅供模型理解，不要求逐字段念出）：
      - 当前场景名字/ID 与类型（`sceneName`/`sceneId` + `sceneType`）；
      - 当前幕次/阶段 `act`（hook / investigation / confrontation / aftermath）；
      - 未解决线索列表 `openClues[]`；
      - 活跃 NPC 摘要 `activeNPCs[]`（name + role）；
    - 生成的 system 追加块示例：
      - `### 当前故事上下文（仅供你参考，不要直白念出字段名）`；
      - `- 场景: …` / `- 当前幕次/阶段: …`；
      - `- 未解决线索:` / `- 场景中重要 NPC:` 等；
      - 结尾强调「让叙事和行动选项尽量围绕上述线索和 NPC 展开，玩家跑题时简短回应后把话题拉回当前场景或主线」。
    - 该 block 会与原有的 “行动计划 + 工具约束 + 输出规则 + agentHint” 一并注入到 system message 中（若已有 system 则追加，否则新增一条）。

#### Phase 3：sanityAgent 与 resourceAgent 的流程化强化

1. **sanityAgent：理智流程编排**：
  - 在 plan 节点中结合角色当前 SAN / `dailySanLoss`（可从 storyContext 或角色上下文注入）：
    - 明确何时必须 `san_check`；
    - 对 `successLoss` / `failureLoss` 给出推荐范围（比如根据恐怖等级）；
    - 当单次损失潜在 ≥ 5、或当日 1/5 门槛已接近时，以 `requiredTools` 方式强制 `trigger_insanity`。
  - 在 plan 节点中（`agentKind === 'sanity'` 且 `playerIntent === 'san_encounter'`）：
    - 若 `storyContext.sanity` 提供以下字段：
      - `currentSan: number`（当前 SAN）；
      - `dailySanLoss: number`（当日已损失）；
      - `potentialLoss: number`（本次事件预计 SAN 损失上限，来自前端/剧本或工具调用约定）；
    - 则根据规则做最低限度的程序化保障：
      - 若 `potentialLoss >= 5`，认为有潜在单次大额损失，向 `requiredTools` 中追加 `trigger_insanity`；
      - 或者当 `dailySanLoss + potentialLoss >= floor(currentSan / 5)` 时，认为已接近/触发不定性疯狂门槛，同样追加 `trigger_insanity`；
      - 以上追加不会替代工具侧的完整疯狂判定逻辑，只是防止模型在高危场景忘记调用该工具。
  - 在 generate 节点中（提示语层面，已通过 `agentKind === 'sanity'` 的 `agentHint` 强调「所有 SAN 检定与疯狂状态变化必须通过 san_check / trigger_insanity / adjust_san 工具完成」），后续可按需要细化为「遭遇 → 检定 → 后果」模板。
2. **resourceAgent：资源操作收束**：
  - 在 plan 阶段为 `use_item` / 资源相关自然语言（“我要烧 10 点幸运”“我想休息恢复 MP”）设定：
    - 能“免费”做的（例如一次小幅恢复）；
    - 必须配合检定/代价的（例如医学治疗）；
  - 通过 `requiredTools` 引导（`agentKind === 'resource'` 且 `playerIntent === 'use_item'`）：
    - 在 Plan 节点中读取最近一条 user 消息文本；
    - 若包含「luck/幸运」等关键词，则向 `requiredTools` 追加 `spend_luck`；
    - 若包含「MP/魔法值/法力」等关键词，则向 `requiredTools` 追加 `adjust_mp`；
    - 若包含「SAN/理智」等关键词，则向 `requiredTools` 追加 `adjust_san`；
    - （如需更细粒度的“免费/需检定/需代价”等区分，可在后续迭代中结合 storyContext 中的资源子结构与工具层逻辑）。

#### Phase 4：genericAgent 护栏与跨 Agent 协作

1. **genericAgent 护栏**：
  - 在 plan/generate 中收紧：
    - 对规则问答类对话：
      - 仅简要回答核心；
      - 自动补一句“回到当前场景”的叙事过渡。
    - 禁止 genericAgent 自行调用 `transition_scene`/`grant_clue` 等高影响工具，由 narrativeAgent 负责：
      - 在 `createPlanNode('generic')` 中，额外对 `requiredTools` 做一次过滤，显式移除 `transition_scene` 与 `grant_clue`；
      - 在 `createGenerateNode(..., 'generic')` 的提示中追加一段「genericAgent 限制」说明：仅做规则问答/简短闲聊、回答后用一两句话自然过渡回当前场景，且不主动调用高影响剧情工具。
2. **跨 Agent 协作**：
  - 借助 `analyzeToolContinuation` 与 storyContext：
    - 当上一轮是 combat/sanity/resource 调用，本轮 route 到 narrative 时，plan 中自动添加说明：
      - 先交代上一规则事件的后果；
      - 再引导调查/叙事回到主线。

### 4. 测试与文档更新计划

- **测试**：
  - 为 `[kpGraph.mjs]` 添加若干专门的单元测试（可用假 `invokeLLM`）：
    - 不同 `playerIntent` 下，`routeByIntent` 的路由结果与 `agentType`；
    - 当 `analyzeNarrativeProgress` 判定长期停滞时，`requiredTools` 自动包含 `grant_clue` / `transition_scene`；
    - sanityAgent 在大额 SAN 损失时强制 `trigger_insanity`；
    - resourceAgent 对 burn luck / 简单恢复 等自然语言的工具选择。
- **文档**：
  - 更新 `COC-KP-GAP-ANALYSIS.md`：
    - 新增“KP LangGraph 多子 Agent 编排”小节（结构、子 Agent 职责、约束原则）；
    - 简述 storyContext 字段与它如何驱动叙事/理智/资源子 Agent。

### 5. 实施顺序建议

1. 将 storyContext 从 Electron/前端串到 `kpGraph`（最小字段版本即可）。
2. 在 narrativeAgent 上实现 **Phase 2**（叙事进度 + 强制线索/场景工具 + storyContext 注入）。
3. 增量实现 sanityAgent/resourceAgent 的 plan 规则（Phase 3）。
4. 收紧 genericAgent、增加跨 Agent 过渡逻辑（Phase 4）。
5. 补测试 + 文档，使多子 Agent 设计成为项目正式的一部分。


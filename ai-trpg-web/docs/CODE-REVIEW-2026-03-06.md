# Code Review Report – `ai-trpg-web`

Date: 2026-03-06  
Scope: Full project architecture & implementation (not limited to uncommitted changes)  
Project: `ai-trpg-web` (COC7 AI KP, Electron + Vue 3 + LangGraph + RAG)

---

## 1. Summary（概要）

- **整体评估**：项目在架构设计、规则映射、测试体系和安全意识上显著高于一般 Electron 桌面应用，尤其是 IPC 路径安全、工具 SSOT、一致性测试和 KP/LangGraph workflow 的工程化程度非常好。  
- **主要风险点**：集中在「复杂状态仍偏集中于 `gameStore`」「部分高复杂 handler 同时承担规则计算 + 状态变更 + 文本展示」「RAG/OCR 与 LLM 调用的资源/耗时控制」几个方向，而非明显的安全漏洞。  
- **建议方向**：短期聚焦于进一步收紧 Electron/main 与 renderer 边界（统一错误模型、更细的 IPC 封装）以及继续瘦身 `gameStore` / combat/sanity handler；中期则按 GAP/Sprint 计划推进 COC 规则覆盖（魔法、成长、追逐等）与 RAG 性能/UX 优化。  

---

## 2. Strengths（优势与值得保留的模式）

### 2.1 工程与架构

- **文档体系完整**：  
  - `COC7_KP_WORKFLOW.md`、`TESTING.md`、`COC-KP-SPRINT-PLAN.md` 把「能力地图、模块边界、规则章节 → 测试文件」串联起来，对新成员极其友好。  
  - GAP 分析、Sprint 计划与测试策略相互呼应，体现了长期演进设计，而非一次性拼装。
- **LangGraph 设计成熟**：  
  - `electron/agent/kpGraph.mjs` 的多 Agent 编排（`generic/combat/sanity/narrative/resource`）+ `analyzeInput → plan → generate → validate → forceTools` 的工作流，兼顾了：  
    - 明确意图路由和工具计划（requiredTools）；  
    - 文本模拟检测、叙事停滞检测与强制工具调用；  
    - `storyContext` 注入，保证 LangGraph 始终看到同一份结构化故事状态。
- **前后端职责分离清晰**：  
  - KP 会话：`src/services/kpSessionService.ts` 把 LangGraph 调用和工具循环封装成服务，`gameStore` 只负责 orchestrate。  
  - RAG：Electron 负责向量库和索引（`electron/rag/*.mjs`），renderer 通过 `ragService` 调用，避免前端直接触碰文件系统。  
  - AI provider：配置集中在 settings + `aiHandlers.cjs`，renderer 不持有 API Key。

### 2.2 安全与 Electron IPC

- **路径安全做得非常好**：  
  - `electron/ipc/pathSafety.cjs` 统一实现 `assertSafeId` / `assertPathInDir` / `assertRealPathInDir` / `assertParentRealPathInDir` / `isSubpath`，并在 `saveHandlers.cjs`/`fileHandlers.cjs` 全面复用。  
  - 存档和故事读写都严格限制在预期目录下，并考虑到 Windows 设备名、尾随点/空格和符号链接逃逸。
- **OCR/PDF 处理具备防御性**：  
  - 大 PDF 跳过 OCR，限制图片数量和单图大小，OCR 失败时优雅降级为纯文本，从根本上降低「恶意 PDF → 主进程 DoS」风险。
- **AI 调用侧隐私安全**：  
  - API Key 仅存在于主进程；`E2E_MOCK_AI` 有清晰的 guard 条件，避免日常使用误走 mock。

### 2.3 测试与 TDD

- **测试分层清晰、覆盖面广**：  
  - 规则级（`src/logic/__tests__`）、handler 级（`src/toolCalling/handlers/__tests__`）、服务/Store 集成级以及 Electron/RAG/脚本级测试都已经就绪。  
  - Phase 1（战斗、理智、First Aid/Medicine、自愈、Max SAN）全部通过 TDD 落地，并在 `TESTING.md` 中有详细规划与现状说明。
- **Tool SSOT + 一致性测试**：  
  - 以 `COC_KP_TOOLS` 为单一事实来源，通过 `scripts/sync-tools.cjs`、`cocToolNames.json` 和 `toolConsistency.spec.ts` 强制前后端工具名一致，防止「某一侧忘记改」的隐性 bug。

### 2.4 游戏状态与记忆体系

- **`gameStore` 被削薄为 orchestrator**：  
  - 通过 `kpPromptService`、`toolContextFactory`、`saveService` 把 prompt 构建、工具上下文和存档逻辑抽离为服务模块，降低了单文件复杂度。  
- **记忆/RAG 分工合理**：  
  - 短期记忆 (`kpMemory`)、长期摘要 (`longTermSummary`) 与 RAG 向量索引在职责上清晰分离，又在 `storyContext` 和 prompt 注入时保持一致视图。

---

## 3. Findings by Area（按领域的具体观察）

### 3.1 架构与分层

**优点**

- 层次清晰：Electron 主进程只做 IO / RAG / AI / Graph；renderer 主要是 UI + Pinia store + services。  
- `kpSessionService` 和 `processToolCallsOrchestrator` 有效隔离了「LangGraph + tool chain」与 UI/store。

**改进点**

1. `gameStore.ts` 仍具有「轻量 god-store」特征：  
   - 聚合了会话、场景、记忆、RAG 调用、角色状态、存档等多种职责，后续继续扩展 COC 规则（魔法、追逐、成长）时容易继续膨胀。  
2. `combatHandler.ts` / `sanityHandler.ts` 等 handler 同时承担规则运算 + 状态变更 + 文案拼接：  
   - 当前规模尚可，但长远看可读性和可测试性会逐渐下降，建议进一步把规则计算抽成纯函数模块。  
3. `kpGraph.mjs` 越来越像 Graph 级「大总管」：  
   - 集中了意图解析、叙事进度、模拟检测和多 Agent guardrail，后续可以考虑模块化拆分（`intentAnalysis`, `narrativeProgress`, `simulationGuard` 等）。

### 3.2 Electron IPC & Security

**优点**

- IPC 接口整体较窄，存档和 RAG 的入口函数都很谨慎；  
- 路径安全、Windows 特性和符号链接问题都已经被系统性处理。

**改进点**

1. **错误模型尚未统一**：  
   - 有些 IPC handler 返回 `{ ok, error }`，有些直接抛 `Error`；前端要做更精细的错误展示会比较困难。  
2. **OCR/PDF 仍在主进程同步执行**：  
   - 当前通过大小/数量限制控制风险，但缺少「取消/超时」机制；长时间 OCR 无法在用户取消操作后提前中断。  
3. **RAG 磁盘 IO 多为同步 API**：  
   - 对一般规模剧本问题不大，但可考虑在未来向 async 过渡，避免在慢盘上造成主进程短暂卡顿。

### 3.3 RAG / 向量检索 / 性能

**优点**

- 向量库实现简单可靠，支持 TF-IDF 与密集向量混合模式，sceneId/type 过滤策略合理。  
- 新增 `indexedStoryCount` 与 embedding 配置相关字段，让健康检查更易诊断。

**改进点**

1. **内存缓存未做上限控制**：  
   - `vectorStore` 的内存 cache 没有限制项目数量或大小，在「多剧本、多次索引」的极端情况下可能累积较大。  
2. **embedding provider 切换情况下的行为需要文档化**：  
   - 当索引时使用 builtin，后来切换为 API provider，旧向量维度可能不匹配，当前实现会退回 TF-IDF，这个行为可以在文档或 UI 中明确提示。

### 3.4 Game State & Stores

**优点**

- `updateCharacterHP/SAN/...` 等函数基本遵循「只负责数值边界 + clamp，不内嵌规则」的原则。  
- `buildStoryContext` 将 scene 信息与 SAN 状态打包对 Graph 暴露，设计很干净。

**改进点**

1. **部分函数仍直接 mutate 内部对象**：  
   - 例如技能更新使用原地赋值，风格上与其他使用解构的写法不完全统一，未来可以统一为不可变写法，利于调试和时间旅行。  
2. **长期摘要的触发节奏写死为常量**：  
   - 若想支持不同剧本/玩家对记忆密度的偏好，建议后续考虑将这些常量外露到设置层。

### 3.5 Tool Handling & COC 规则实现

**优点**

- Phase 1 的 COC 规则（战斗、理智、First Aid/Medicine、自愈、Max SAN）已基本覆盖，可以支撑完整跑团体验。  
- First Aid/Medicine 与自然恢复的 TDD 实现贴近规则书语义，边界条件和 clamp 处理到位。

**改进点**

1. **治疗相关工具与战斗工具混在 `combatHandler` 中**：  
   - 随着后续引入更多治疗/恢复机制（心理治疗、SAN 恢复），“combat” 命名会越来越不贴切，建议抽成独立 `healingHandler` 或重命名为更泛化的名称。  
2. **重伤/濒死逻辑在多个工具中重复**：  
   - `melee_attack`/`ranged_attack` 与 `apply_major_wound` 都实现了类似判断，可以抽成 `combatRules.applyMajorWound` 纯函数统一维护。  
3. **handler 返回 JSON 内容缺少中心化的 TS 类型**：  
   - 目前各 handler 的 `content` 字段 JSON 结构是隐式约定，建议在 `toolCalling/types.ts` 中为这些结果定义 interface，并在 handler 中引用。

### 3.6 Testing & Coverage Beyond Phase 1

**优点**

- Phase 1 的测试已经覆盖主要规则；RAG、pathSafety、logging、kpGraph 等基础设施也有针对性测试。  
- 测试运行脚本会先同步工具列表，保证配置/代码/测试三者一致。

**改进点**

1. **Phase 2+ 规则目前主要停留在文档规划**：  
   - GAP 与 Sprint 中列出的成长、环境伤害、追逐、魔法、SAN 恢复等机制还未落地到 `logic/**` + `handlers/**` + `__tests__`，但这属于预期中的「未来工作池」，建议在实现前继续严格遵守 TDD 流程。  
2. **Electron + OCR 的自动化验证深度有限**：  
   - 目前主要依赖 Node 环境单测与人工回归，若未来这块逻辑进一步复杂，建议补少量「mock pdf-lib/tesseract」的高层单测，让接口层行为在 CI 中得到覆盖。

---

## 4. Recommendations（改进建议）

### 4.1 短期（1–2 Sprint 内）

1. **进一步瘦身 `gameStore` 与 handler**
   - 在 `src/services` 新增 `characterStateService`，集中封装角色数值与状态操作，`gameStore` 仅调 service；  
   - 把治疗相关工具拆分到 `healingHandler` 或在现有文件内显式划分 `combat` 与 `healing` 区域，后续易于迁移。

2. **统一 IPC 错误模型**
   - 为 `fileHandlers`、`saveHandlers`、`ragHandlers` 设计一个轻量错误协议（`code` + `message`）；  
   - 前端按 `code` 决定提示文案，避免解析自由文本。

3. **为 handler 返回值补充类型定义**
   - 在 `src/toolCalling/types.ts` 中定义 `MeleeAttackResult`、`RangedAttackResult`、`SanityCheckResult`、`HealingResult` 等类型；  
   - handler 中 `JSON.stringify` 的对象使用这些类型，有助于测试和未来日志/回放功能。

4. **统一状态更新风格与不可变模式**
   - 将少数仍直接 mutate 的字段更新迁移为不可变写法（例如通过 `characterSheet = { ...characterSheet, skills: { ...skills, [id]: newValue } }`），提升可预测性。

5. **为未来规则模块预建 skeleton**
   - 在 `src/logic` 下为成长、环境伤害、魔法、追逐等建立空实现与 `it.todo` 测试，形成「规则入口」；  
   - 这样任何后续实现自然落到这些模块，而不会散落到临时 handler。

### 4.2 中期（2–4 Sprint）

1. **模块化 LangGraph 逻辑**
   - 将 `kpGraph.mjs` 拆分成若干纯函数模块（意图分析、叙事进度、模拟检测等），主文件只负责 wiring；  
   - 有利于单测更精细化，也便于日后复用部分逻辑做「轻量 KP」或「诊断工具」。

2. **RAG 性能与 UX 优化**
   - 为向量缓存增加简单 LRU 或「最大脚本数」限制，并在设置中提供「清理索引缓存」选项；  
   - 对结构化 Markdown 剧本默认启用 `sceneId`/`type` 语义分块，让场景内检索更聚焦；  
   - 文档中明确 embedding provider 切换时旧索引的退化策略（TF‑IDF fallback）。

3. **按照 Sprint 计划逐步落地 P1/P2 规则**
   - Sprint 2：幕间成长 + 环境伤害（`growthRules.ts`、`environmentRules.ts` + 相应 handler）；  
   - Sprint 3：魔法系统与 SAN 恢复（`magicHandler` + `magicRules.ts`）；  
   - Sprint 4：追逐与先攻（`chaseState` 类型与 helper）。  
   - 对每个子系统保持 Phase 1 的做法：**先写测试 skeleton → 再写实现 → 回填文档**。

---

## 5. Next Steps（下一步）

- **立即可执行的小任务**：  
  - 在 `toolCalling/types.ts` 中为现有 handler content 定义类型；  
  - 统一状态更新的 mutation 风格；  
  - 补充少量「未来规则 skeleton + it.todo」用例，让 GAP 列表中的每一条都有代码锚点。  
- **下一个 Sprint 的技术 Story**：  
  - 以「角色状态服务 + 治疗 handler 独立」为主线，配合一两个小型 RAG/perf 优化 Story，逐步把当前良好的工程基础进一步巩固。  

总体来看，`ai-trpg-web` 已经是一个工程质量和规则严谨度都很高的桌面应用，后续工作更多是在现有基准上**稳步扩展规则覆盖与优化开发体验/性能**，而非修补基础设施。  

---

## 6. Refactoring Implementation Log（2026-03-06）

> 本节记录基于本次 Code Review 建议已实际落地的部分重构，便于后续追踪。

### 6.1 Tool Handler 返回值类型显式化

- 在 `src/toolCalling/types.ts` 中新增了结构化结果类型：
  - `MeleeAttackResult`, `RangedAttackResult`, `MajorWoundResult`, `FirstAidResult`, `MedicineResult`, `SanCheckResult`, `InsanityResult`。  
- 在 `combatHandler.ts` 与 `sanityHandler.ts` 中：
  - 使用上述类型构造 handler 的 JSON `content`（先构造 typed 对象，再 `JSON.stringify`），消除隐式“字符串协议”，为后续日志/回放与 refactor 提供类型保护。  

### 6.2 统一角色状态更新的不可变风格

- 在 `src/stores/gameStore.ts` 中，将 `updateCharacterSkill` 从原先的原地修改：
  - `c.skills[skillId] = ...`  
  调整为创建新的 `skills` 对象并整体写回 `characterSheet`：  
  - `characterSheet.value = { ...c, skills: { ...c.skills, [skillId]: next } }`。  
- 这样与 HP/MP/SAN/Luck 等更新函数保持一致的不可变风格，更利于状态跟踪与未来调试工具（如时间旅行）接入。

### 6.3 为未来规则模块预建 skeleton（Phase 2+ 技术支点）

- 在 `src/logic` 下新增占位模块，作为 GAP/Sprint 规划中后续规则的集中入口：
  - `growthRules.ts`：幕间成长与技能发展规则的占位，定义了 `SkillGrowthMark`、`DevelopmentResult` 与空实现 `applyDevelopmentPhase`，待 Phase 2 实际按规则书实现成长检定与 90% 技能的 SAN 奖励。  
  - `environmentRules.ts`：环境伤害（坠落/火焰/溺水/毒素等）入口，定义了 `EnvironmentDamageKind`、`EnvironmentDamageInput/Result` 与空实现 `computeEnvironmentDamage`，后续根据 Table III 等细化。  
- 这些 skeleton 尚未改变现有行为，但为未来 TDD 与 handler 复用提供清晰锚点，降低后续实现时“随手写在 handler 里”的风险。

### 6.4 后续可考虑的延伸工作

- 在以上类型化与 skeleton 的基础上，下一步可以：
  - 为 `growthRules` 与 `environmentRules` 分别添加 `__tests__` skeleton（`it.todo` 形式），直接对应 GAP 文档中的具体用例；  
  - 在 `TESTING.md` 中把这两个模块挂到对应章节（幕间成长、环境伤害）的测试规划下，完成从「文档规划 → 代码入口 → 测试 skeleton」的闭环；  
  - 按本报告第 4 节建议，逐步抽离 `characterStateService` 与（可选）`healingHandler`，在已有重构基础上进一步瘦身 `gameStore` 与 combat handler。  

## 7. Post-refactor Assessment (2026-03-06)

本轮改动整体上是向更强类型约束和更清晰分层的小步演进：在 `src/toolCalling/types.ts` 中引入显式的 `MeleeAttackResult`、`RangedAttackResult`、`MajorWoundResult`、`FirstAidResult`、`MedicineResult`、`SanCheckResult`、`InsanityResult` 接口，有助于把“工具调用返回负载”的结构从各个 handler 中抽离出来，形成一个集中、可复用的契约层，架构上是与现有 orchestrator/handler 分层高度一致的做法，也为后续前后端对齐和测试提供了稳定锚点。

在战斗与理智 handler 侧，将结果先构造成这些接口的对象，再统一通过 `JSON.stringify` 作为 `ToolHandlerResult.content` 返回，是符合当前 orchestrator 协议（`content` 为字符串，通常为结构化 JSON）的设计方向；需要注意的是，应确保所有分支（包括 `melee_attack`、`ranged_attack`、`apply_major_wound` 等）都遵循这一约定，避免出现部分 handler 返回对象、部分返回字符串的“混合协议”，建议在后续小改中做一次统一梳理，并在 orchestrator 层加一条针对 `content` 类型的防御性断言或测试。

急救与医学逻辑中已经采用“构造 `FirstAidResult` / `MedicineResult` → `JSON.stringify`”的模式，这在类型安全和调试上都优于匿名字面量；建议继续在 `healingHandler.spec.ts` 及相关集成测试中增加一条“从 tool 调用链解析 JSON 并断言其满足 Result 接口”的端到端用例，以锁定这次类型化重构的行为。

`src/stores/gameStore.ts` 中将 `updateCharacterSkill` 从直接修改 `c.skills[skillId]` 改成通过浅拷贝 `skills` 并写回新的 `characterSheet`，与同文件中 `updateCharacterHP/MP/SAN/Luck` 一致地采用不可变更新风格，这在 Pinia/Vue 的响应式追踪上是更稳妥的实践，也减少了潜在的共享引用副作用；目前实现已经包含合理的 0–99 范围约束，如果未来有更多技能相关规则，可以考虑提取一个通用的“技能值规范化/钳制”小函数来避免散落重复逻辑。

两份新增占位逻辑模块 `src/logic/growthRules.ts` 与 `src/logic/environmentRules.ts` 通过导出轻量的类型与 no-op 函数（`applyDevelopmentPhase`、`computeEnvironmentDamage`），为后续 GAP 项的 TDD 和 handler 复用预留了清晰的入口，从架构上把“复杂规则表/环境伤害表”的实现从 handler 中分离出去是正确方向；当前实现返回空增长或 `'0'` 伤害表达式，语义上是安全的占位值，但在尚未真正接入调用方之前容易被工具/IDE 标记为“未使用导出”，短期可以接受，未来一旦开始引用建议尽早补上对应的规则单测，避免规则编码时引入静默逻辑错误。

从命名与导出风格来看，新增接口与类型基本遵循现有代码库惯例：Result 类型后缀清晰，`EnvironmentDamageKind` / `EnvironmentDamageInput` / `EnvironmentDamageResult` 也都语义自解释，且放在 `logic` 层而非直接塞进 handler，有利于保持 handler 专注于 IO 与状态更新；目前没有明显需要立即调整的命名问题，更多是建议在实现成长/环境规则时持续沿用这种“领域语言化”的命名，而不是回退到通用的 `data`、`info` 等模糊名字。

整体而言，这轮调整在架构和类型安全上是正向的：它把“工具结果契约”和“游戏状态更新”都向更易测试、更易演进的形态推进；主要需要注意的是尽快统一所有 handler 的返回协议（始终返回字符串化的结构化结果，或集中在 orchestrator 处完成序列化），并为新引入的 Result 接口补上针对 JSON 负载的回归测试，这样既能锁住本次重构的收益，也能为接下来填充成长与环境规则打下稳定基础。


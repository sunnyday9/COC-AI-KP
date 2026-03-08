# COC7 AI KP Sprint 计划（基于 GAP 分析）

> 基于 `COC-KP-GAP-ANALYSIS.md` 与当前实现/测试情况（见 `COC7_KP_WORKFLOW.md`、`TESTING.md`），规划后续若干 Sprint 的增量路线。假设每个 Sprint 为 2 周节奏，小团队 1–2 人持续投入。当前 RAG 已包含向量检索、本地 GraphRAG（图扩展 + 社区摘要）与用户行动图谱，新功能可在此基础上扩展。

## 总体目标与范围

- **短期（Sprint 1–2）**：补齐 P1 级「治愈/成长/Max SAN」机制，增强规则完整性。
- **中期（Sprint 3–4）**：实现魔法/追逐/环境伤害与 SAN 恢复等高级机制。
- **长期（Sprint 5+）**：信用评级经济、NPC 幸运池、恐惧习惯、完整恐惧症/躁狂症表等加深体验的系统。

---

## Sprint 1：治疗与 Max SAN（P1 高优先级）

**时间**：2 周  
**主题**：急救/医学、自然恢复、Max SAN 限制  
**目标**：让「受伤 → 稳定 → 恢复」与 Max SAN 规则闭环。

### 1.1 范围与任务

- **急救/医学机制**
  - 设计并实现 `first_aid` 与 `medicine` tool（或在 `adjust_hp` 中增加 `healType` 参数）：
    - 急救：受伤后 1 小时内一次机会，成功 +1 HP，可稳定濒死状态。
    - 医学：在急救后或住院环境中使用，成功 +1D3 HP，部分场景为困难难度。
  - 在 `COCCharacterSheet` 中补充用于恢复判定的辅助字段（如「是否稳定」「是否卧床疗养」等，初期可用 boolean/标记实现）。
  - 在 `combatHandler` 或单独的 `resourceHandler` 中实现治疗工具的 handler 逻辑，并产出系统消息（记录治疗类型与结果）。
- **自然恢复**
  - 在角色状态中引入「轻伤/重伤恢复节奏」的概念（可通过 flag + 外部叙事触发）。
  - 提供一个简单的 `natural_healing` tool 或由 KP prompt 指南规范「每日/每周自动恢复逻辑」。
- **Max SAN = 99 - Cthulhu Mythos**
  - 在 `COCCharacterSheet` 中确保存在 `cthulhuMythos` 字段（GAP 提案已有）。
  - 在 `adjust_san` 工具 handler 中增加 clamp 逻辑：`currentSan <= 99 - cthulhuMythos`。
  - 确保 `buildCharacterContext` 中显示 Max SAN 信息以便 KP 参考。

### 1.2 测试与验收

- 新增/扩展测试：
  - `sanityHandler.spec.ts`：验证 Max SAN clamp 行为。
  - 新增 `healingHandler.spec.ts`（或在 `combatHandler.spec.ts` 中扩展）：
    - 急救/医学在不同情形下的 HP 变更与稳定逻辑。
  - 视需要新增 `gameStore` 层的集成测试，确保存档/读档包含治疗相关状态。
- 手工回归：
  - 通过 UI 驱动受伤 → 急救/医学 → 自然恢复的典型路径，观察 KP 叙事与 HP/SAN 状态变化。

### 1.3 实现状态（2026-03-06）

- **急救/医学工具**
  - 已在 `electron/ipc/aiHandlers.cjs` 中新增 `first_aid` 与 `medicine` tool 定义，并通过 `scripts/sync-tools.cjs` 同步到前端工具名列表。
  - 在 `src/toolCalling/handlers/combatHandler.ts` 中实现对应 handler 逻辑：
    - `first_aid`：在濒死且受伤时成功急救，HP +1（不超过 `hpMax`）并将 `isDying` 置为 `false`；满血时仅提示「无需急救」。
    - `medicine`：在医疗环境下成功医学检定时，按 1D3（默认）治疗 HP，结果不超过 `hpMax`；失败或满血仅输出提示，不改变 HP。
  - 在 `src/toolCalling/handlers/__tests__/healingHandler.spec.ts` 中补全 TDD 测试覆盖上述场景（成功/失败、濒死稳定、满血无效）。

- **自然恢复规则**
  - 已新增 `src/logic/healingRules.ts`，导出 `applyNaturalHealing(state, options)`：
    - 轻伤（无重伤标记）按天数每日至多 +1 HP。
    - 重伤（有重伤标记）按周进行 CON 检定，通过时每周恢复 1D3 HP，均不超过 `hpMax`。
  - 在 `src/logic/__tests__/healingRules.spec.ts` 中增加单元测试，验证轻伤/重伤多种恢复节奏以及「永不超过 hpMax」约束。

- **Max SAN = 99 - Cthulhu Mythos 限制**
  - 角色卡已包含 `cthulhuMythos` 字段（见 `src/types/character.ts` 与角色扩展说明）。
  - 在 `src/toolCalling/handlers/sanityHandler.ts` 的 `adjust_san` 分支中实现 Max SAN clamp 逻辑：
    - 负向 SAN 变化（`delta < 0`）保持原行为，仅累加当日 SAN 损失。
    - 正向 SAN 变化（`delta > 0`）后，读取当前 `cthulhuMythos`，计算 `maxSan = 99 - cthulhuMythos`，若当前 SAN 超出该值，则再调用一次 `updateCharacterSAN` 将其压回上限。
  - 在 `src/toolCalling/handlers/__tests__/sanityHandler.spec.ts` 中新增「Max SAN clamp」测试用例，覆盖：
    - 有神话值时的上限约束。
    - 神话值提升导致 Max SAN 降低时，对现有 SAN 的重新 clamp。
    - 负向 SAN 变化不受 Max SAN 影响，仅按原规则扣减并累加当日损失。

---

## Sprint 2：幕间成长与环境伤害（P1 剩余项）

**时间**：2 周  
**主题**：技能成长、Max SAN 配套、环境伤害表  
**目标**：支持「一案结束后的成长」与常见环境危害。

### 2.1 范围与任务

- **幕间成长 / 技能提升（Development Phase）**
  - 在 `COCCharacterSheet` 中实现 `skillGrowthMarks: string[]`。
  - 在 `checkHandler` 中，在「成功检定」场景下，可选调用一个内部 helper 记录成长标记（由 KP 决定是否标记，可通过 prompt 引导）。
  - 实现工具：
    - `mark_skill_growth(skillId)`：显式标记成长（便于 KP 在关键成功后手动标记）。
    - `development_phase()`：遍历所有标记技能：
      - 掷 D100，若 > 当前技能值（或 ≥ 96）→ 技能 +1D10。
      - 若技能达到 90%：触发 +2D6 SAN（并通过 `adjust_san` 工具实现）。
  - 在 KP prompt 中补充「幕间成长如何触发」的指引（见 GAP 文档）。
- **环境伤害（坠落/火焰/溺水/毒素）**
  - 初期可不做单独 tool，而是：
    - 在 `combatHandler` 中增加一个 `environmental_damage` 辅助函数，用于根据枚举类型（fall/fire/drowning/poison）与参数（高度/暴露轮数/毒素强度）计算伤害。
    - 在 KP prompt 中提供一张紧凑版环境伤害表（基于 GAP 中 Table III），供 KP 在叙事中调用现有 `adjust_hp` + `apply_major_wound` 工具执行。
  - 如有需要，未来可将其提升为正式 tool（`environmental_damage`）。

### 2.2 测试与验收

- 新增测试：
  - `coc7Character.spec.ts`：针对 `skillGrowthMarks` 的序列化/读档兼容性。
  - 新增 `developmentPhase.spec.ts`（可放在 `src/logic/__tests__/` 或 `src/services`）：
    - 验证成长检定与 SAN 奖励规则。
- 手工回归：
  - 在一个短剧本结束时，模拟开发阶段：调用 `development_phase`，观察技能与 SAN 变化。
  - 在测试剧本中模拟坠落/火焰/溺水/毒素场景，确认伤害计算与重伤/濒死判定协同正常。

---

## Sprint 3：魔法系统与 SAN 恢复（P2 中高优先级）

**时间**：2 周  
**主题**：神话典籍、施法、SAN 恢复  
**目标**：打通「接触神话 → 典籍 → 法术 → 施法 → 代价/恢复」路径。

### 3.1 范围与任务

- **神话典籍 & Cthulhu Mythos**
  - 在 `COCCharacterSheet` 中确保存在字段：
    - `cthulhuMythos`, `knownSpells: string[]`, `readTomes: string[]`, `isMythosBeliever: boolean`。
  - 实现 `read_tome` tool：
    - 输入：典籍 ID/名称、阅读模式（泛读/精读）、当前语言技能。
    - 输出：CM 增长值、SAN 损失、已学习的法术列表占位信息。
  - 在 KP prompt 中增加「泛读/精读规则」简要说明（参考 GAP）。
- **施法检定**
  - 实现 `cast_spell` tool：
    - 输入：法术名、POW 值、MP/SAN 代价。
    - 首次施放：困难 POW 检定，成功后标记该法术为已掌握（以后不再检定）。
    - 失败可允许孤注一掷，失败后仍然生效但施加沉重代价（HP/SAN/附加效果）。
  - 与角色状态联动：
    - 更新 `knownSpells` 与 `cthulhuMythos`。
    - 通过现有 `adjust_mp`、`adjust_san`、`updateCharacterHP` 等实现施法代价。
- **SAN 恢复机制**
  - 工具层：
    - `award_san`：用于剧本结束奖励与技能达到 90% 时的恢复（结合 Sprint 2 的成长逻辑）。
    - `therapy_check`：心理治疗检定（D100 判定 +1D3 或 -1D6 SAN）。
  - Prompt：
    - 在 KP system prompt 中加入「何时可调用 award_san / therapy_check」的指南。

### 3.2 测试与验收

- 新增测试：
  - `sanityHandler` 或独立 `magicHandler` 的单元测试，覆盖 `read_tome` 与 `cast_spell` 的主要分支。
  - 简单的 `award_san`/`therapy_check` 行为测试，确保 SAN 变更及 Max SAN 限制生效。
- 手工回归：
  - 构造一个包含典籍与基础法术的短剧本，验证阅读→学习→施法→代价/恢复的典型路径。

---

## Sprint 4：追逐系统与基础战技/先攻（P1/P2 混合）

**时间**：2 周  
**主题**：追逐子系统 + 先攻/战技骨架  
**目标**：为高动作量剧本提供基本的追逐与战术结构。

### 4.1 范围与任务

- **追逐系统（Chase）—— 最小可行版本**
  - 设计一个简化版的追逐状态结构（可作为独立 TS 类型与前端状态）：
    - 参与者列表（PC/NPC）、各自 MOV/行动点。
    - 位置序列（Locations）与当前位置索引。
  - 先期不暴露为 tool，而是在 KP Prompt 中约定如何用现有工具和状态字段描述一轮追逐：
    - 使用 `skill_check` 处理速度/驾驶检定。
    - 通过 `transition_scene` 与叙事组合模拟位置推进。
  - 如有余力，再抽象出 `start_chase`/`advance_chase`/`end_chase` 工具，用于管理结构化追逐状态。
- **先攻与简单战技**
  - 在角色状态中确保存在 `mov` 字段，并在 `coc7Character` 中根据 STR/DEX/SIZ 计算默认 MOV。
  - 在 KP Prompt 中为战斗一章增加：
    - 如何根据 MOV/DEX 排序先攻。
    - 简化版战技：例如「缴械/绊倒/擒抱」作为 skill_check + opposed_check 的组合模板。

### 4.2 测试与验收

- 单元/集成测试：
  - 对 chase 状态结构与 helper 函数做有限单元测试（如计算行动点、检测是否逃脱等）。
  - 对 MOV/DEX/先攻排序逻辑做小规模测试。
- 人工回归：
  - 在样例剧本中加入一段追逐场景，通过 KP 操作与工具调用确保：
    - 追逐能在若干轮后合理结束。
    - 战斗与追逐之间的切换（在追逐中战斗）叙事连贯。

---

## Sprint 5+：经济、NPC 幸运池、习惯恐惧与表驱动增强（P2 深度体验）

**时间**：若干个 1–2 周 Sprint  
**主题**：加深长期战役与高重玩性体验。

### 5.1 经济与信用评级

- 在角色状态中完善 `creditRating/cashOnHand/assets` 字段。
- 在 KP Prompt 中引入「信用评级 → 生活水平/开销/可用资源」对照表。
- 可选：一个 `adjust_credit` 工具，用于幕间调整信用评级。

### 5.2 NPC 幸运池

- 设计 LangGraph 内部状态或辅助结构，用于为关键 NPC 维护 Luck 池。
- 在 KP Prompt 中说明：
  - 何时允许「花 NPC Luck 调整 NPC 骰点」。
  - 如何通过现有 `skill_check` + 叙事表达效果。

### 5.3 习惯恐惧与恐惧症/躁狂症表

- 在角色状态中启用 `horrorHabituation`、为不同神话实体/恐怖类型累积 SAN 损失。
- 当累积损失超过表中最大可能值时，允许 KP 在 `san_check` 叙事中「该类型不再造成 SAN 损失」。
- 引入 Table IX/X 的数据（可在 `data/` 目录下以 JSON 形式存储），为 `trigger_insanity` 的恐惧症/躁狂症结果提供真实随机表支持。

---

## 附录：执行建议

- **节奏控制**：每个 Sprint 结束时，确保：
  - 对应 GAP 中的条目在 `COC-KP-GAP-ANALYSIS.md` 与 `COC7_KP_WORKFLOW.md` 更新状态。
  - 新增/调整的工具在 `COC_KP_TOOLS`、`cocToolNames.json`、各 handler 中保持一致（由 `sync-tools` 脚本与 `toolConsistency.spec.ts` 把关）。
  - 测试文件名与 `TESTING.md` 的映射表同步更新。
- **优先顺序**：如人力紧张，可先完成 P1（Sprint 1–2）的全部内容，再视情况挑选 P2 中最符合当前剧本需求的子系统推进。


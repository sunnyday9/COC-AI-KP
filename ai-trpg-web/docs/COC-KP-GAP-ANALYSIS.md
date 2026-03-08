# COC 7th AI KP — 功能差距分析

> 基于《守秘人规则书 2002c》和《调查员手册 v1.21》的全面审查，
> 对比当前代码实现，列出所有已实现、部分实现和缺失的 COC 7th 守秘人（KP）机制。

---

## 一、当前已实现的功能

### 1.1 已有 Tool Calls（15 个）

| Tool | 功能 | 状态 |
|------|------|------|
| `skill_check` | 技能检定（常规/困难/极难、大成功/大失败；可选奖励骰/惩罚骰、孤注一掷 isPush） | ✅ 已实现 |
| `opposed_check` | 对抗检定（双方 d100 比成功等级，平局比技能值，tieBreaker 反击/闪避；可选 sideA/B 奖励骰/惩罚骰，如以多打少） | ✅ 已实现 |
| `melee_attack` | 近战一击（对抗检定 + 伤害加值 + 护甲减免 + 重伤/濒死/即死，调查员为败方时自动扣 HP 并判定） | ✅ 已实现 |
| `ranged_attack` | 远程一击（命中检定 + 伤害 + 护甲减免 + 重伤/濒死/即死，targetIsInvestigator 时自动扣 HP 并判定） | ✅ 已实现 |
| `san_check` | 理智检定（d100 vs SAN，成功/失败损失；自动累加当日 SAN 损失） | ✅ 已实现 |
| `trigger_insanity` | 疯狂判定（SAN 归零→永久；当日损失≥1/5 当前 SAN→不定性；单次≥5→INT 检定→临时/压抑；发作表 1D10，9/10 恐惧症/躁狂症） | ✅ 已实现 |
| `roll_dice` | 通用掷骰（伤害、随机事件） | ✅ 已实现 |
| `adjust_hp` | HP 增减（伤害/治疗） | ✅ 已实现 |
| `apply_major_wound` | 重伤/濒死/即死判定（单次伤害>HP 最大值→即死；≥HP 一半→重伤+CON 昏迷；HP≤0 且重伤/即死→濒死） | ✅ 已实现 |
| `adjust_san` | SAN 增减（负 delta 时累加当日 SAN 损失） | ✅ 已实现 |
| `adjust_mp` | MP 增减 | ✅ 已实现 |
| `spend_luck` | 消耗幸运点数（1:1 降低骰点，不可用于幸运/SAN/伤害骰） | ✅ 已实现 |
| `reset_day` | 新游戏日：重置当日 SAN 损失为 0（过夜/新一天时调用，保证不定性疯狂判定正确） | ✅ 已实现 |
| `transition_scene` | 场景转换记录 | ✅ 已实现 |
| `grant_clue` | 线索授予 | ✅ 已实现 |

### 1.2 已有系统功能

| 功能 | 状态 |
|------|------|
| 角色创建（属性骰、技能分配、职业选择） | ✅ 已实现 |
| 100+ 职业含信用评级、技能模板、时代标签 | ✅ 已实现 |
| 67 项标准技能含基础值 | ✅ 已实现 |
| KP Agent 工作流（意图分类 → 工具规划 → 生成 → 验证） | ✅ 已实现 |
| 文本模拟检测（防止 KP 在叙事中伪造骰点/HP/SAN） | ✅ 已实现 |
| RAG 向量检索（从剧本中检索上下文） | ✅ 已实现 |
| 本地 GraphRAG（图扩展、社区摘要、COC 实体/关系） | ✅ 已实现 |
| 用户行动图谱（线索/场景/检定记录，与 RAG 一并注入） | ✅ 已实现 |
| 流式输出（所有 LLM 提供商） | ✅ 已实现 |
| 多 LLM 提供商支持（OpenAI/Anthropic/Google/DeepSeek 等） | ✅ 已实现 |

---

## 二、缺失的功能（按优先级分类）

### 🔴 P0 — 核心游戏循环必需（严重影响游玩体验）

**状态**：本节所列 P0 项均已实现（工具、角色状态、战斗链见 §1.1 与 §6）。以下保留规则书引用与建议便于对照。

#### 2.1 对抗检定（Opposed Rolls）

**规则书引用**：第五章 游戏系统

当前 `skill_check` 只支持单方检定。COC 7th 的近战战斗、社交对抗等核心场景均需要**双方对抗检定**。

- 双方各选一个技能/属性掷骰
- 比较成功等级：大成功(01) > 极难成功 > 困难成功 > 常规成功 > 失败 > 大失败
- 同级则比较技能值高低；仍平则僵持
- 近战中：攻击者 vs 防御者（反击/闪避）
  - 反击（Fighting）：平局攻击者胜
  - 闪避（Dodge）：平局防御者胜
  - 反击成功者造成伤害；闪避成功者仅避免伤害

**建议实现**：新增 `opposed_check` tool，接收双方技能名/值，返回双方骰点、成功等级和胜负结果。

---

#### 2.2 孤注一掷（Pushing Rolls）

**规则书引用**：第五章 游戏系统

目前检定失败即为最终结果。规则中允许玩家在失败后进行一次「孤注一掷」——以更高风险重投。

- 仅限失败后使用，不可用于：幸运检定、SAN 检定、战斗检定、伤害骰
- 玩家必须描述如何以更大风险重试
- KP 可先「揭示预兆」——描述失败后果
- 孤注一掷失败：KP 可自由决定严重后果（受伤、SAN 损失、装备丢失、被俘等）

**建议实现**：在 `skill_check` tool 中增加 `isPush: boolean` 参数，或新增 `push_roll` tool。KP Agent 在玩家请求重试时调用，失败时附带叙事后果。

---

#### 2.3 疯狂系统（Insanity — 临时/不定/永久）

**规则书引用**：第八章 理智

当前 `san_check` 只处理 SAN 增减，**完全缺失**疯狂触发和效果系统。

**临时性疯狂**：
- 触发：单次检定损失 ≥ 5 SAN
- 门控：INT 检定——成功则陷入疯狂，失败则压抑记忆
- 持续时间：1D10 小时
- 效果：疯狂发作（Phase 1）→ 潜在疯狂（Phase 2）

**不定性疯狂**：
- 触发：单个「游戏日」内累计 SAN 损失 ≥ 当前 SAN 的 1/5
- 持续时间：直到治愈（可能跨整个剧本）

**永久性疯狂**：
- 触发：SAN 降至 0
- 效果：角色永久退出游戏

**疯狂发作（Bout of Madness）**：
- 实时（其他调查员在场）：1D10 回合，按 Table VII 投 1D10：
  1. 失忆  2. 心因性残疾  3. 暴力  4. 偏执  5. 重要之人  6. 晕厥  7. 逃跑  8. 歇斯底里  9. 恐惧症  10. 躁狂症
- 总结（独处时）：1D10 小时，按 Table VIII 投 1D10：
  1. 失忆  2. 被抢  3. 被殴  4. 暴力  5. 信念表现  6. 寻找重要之人  7. 被收容  8. 远逃  9. 恐惧症  10. 躁狂症

**恐惧症/躁狂症**：Table IX (100 种恐惧症) + Table X (100 种躁狂症)

**建议实现**：
- 新增 `trigger_insanity` tool（输入：SAN 损失量、当前 SAN、INT 值；输出：疯狂类型、发作效果）
- 在角色状态中增加 `insanityState` 字段（正常/临时/不定/永久）
- 在角色状态中增加 `phobias` 和 `manias` 数组
- 跟踪单日 SAN 累计损失以判断不定性疯狂

---

#### 2.4 幸运消耗（Luck Spending）

**规则书引用**：第五章 游戏系统（可选规则）

玩家可在技能/属性检定后花费 Luck 点数 1:1 降低骰点结果。

- 不可用于：Luck 检定、伤害骰、SAN 检定
- 不可改变大成功/大失败结果
- 消耗 Luck 后该技能不获得成长标记
- 选择孤注一掷后不可消耗 Luck，反之亦然

**Luck 恢复**（每次游戏结束）：
- 掷 1D100，若 > 当前 Luck → 恢复 1D10 Luck
- Luck 永不超过 99

**建议实现**：新增 `spend_luck` tool（输入：花费量；输出：新 Luck 值），并在 `skill_check` 结果中提示玩家可选消耗 Luck。

---

#### 2.5 战斗完整系统

**规则书引用**：第六章 战斗

当前战斗仅通过 `skill_check` → `roll_dice` → `adjust_hp` 链实现，缺失大量关键机制：

**缺失机制**：

| 机制 | 描述 |
|------|------|
| **先攻（Initiative）** | 按 DEX 高低排序行动顺序 |
| **伤害加值（Damage Bonus）** | STR+SIZ 表决定 -2/−1/0/+1D4/+1D6/+2D6 等 |
| **体格（Build）** | STR+SIZ 表决定，影响战技可行性 |
| **护甲（Armor）** | 每次攻击减免固定伤害值 |
| **重伤（Major Wound）** | 单次伤害 ≥ HP 最大值/2：倒地、CON 检定否则昏迷 |
| **濒死（Dying）** | HP=0 + 重伤：每轮 CON 检定，失败即死 |
| **即死（Instant Death）** | 单次伤害 > HP 最大值：立即死亡（已由 `apply_major_wound` 处理） |
| **以多打少（Outnumbered）** | 角色在一轮中第一次防御后，后续攻击者获得奖励骰 |
| **战技（Maneuvers）** | 缴械/绊倒/擒抱等非伤害行动，需比较 Build |
| **枪械详细规则** | 射程、快速射击、自动武器、故障、瞄准、掩体 |
| **近距离射击** | DEX/5 英尺内：奖励骰 |
| **翻滚躲避（Diving for Cover）** | 闪避检定成功 → 射手获惩罚骰 |

**建议实现**：
- 新增 `melee_attack` tool（处理对抗检定、伤害加值、护甲减免、重伤判定）→ ✅ 已实现
- 新增 `ranged_attack` tool（处理射程难度、枪械修正）→ ✅ 已实现（命中检定 + 伤害 + 护甲 + 重伤/即死）
- 新增 `apply_major_wound` tool（处理重伤后果）→ ✅ 已实现
- 在角色状态中增加 `damageBonus`、`build`、`armor`、`weapons` 字段 → ✅ 已实现

---

#### 2.6 奖励骰/惩罚骰（Bonus & Penalty Dice）

**规则书引用**：第五章 游戏系统

- 奖励骰：额外投一个十位骰，取较低（更好）结果
- 惩罚骰：额外投一个十位骰，取较高（更差）结果
- 一个奖励骰与一个惩罚骰互相抵消
- 通常最多 2 个奖励或惩罚骰

**状态**：✅ 已实现。`skill_check` 支持 `bonusDice`/`penaltyDice`；`opposed_check` 支持 `sideABonusDice`/`sideAPenaltyDice`、`sideBBonusDice`/`sideBPenaltyDice`（如以多打少时给防御方惩罚骰等）。

---

### 🟡 P1 — 重要功能（显著提升游戏完整性）

#### 2.7 最大 SAN 限制（核心规则 — 已实现）

**规则书引用**：第八章 理智

- 公式：`Max SAN = 99 - 克苏鲁神话技能`
- 当克苏鲁神话技能增加时，Max SAN 立即降低
- 当前 SAN 永不超过 Max SAN

**实现情况**：
- 角色状态中已包含 `cthulhuMythos` 字段（见 `COCCharacterSheet` 扩展）。
- 在 `sanityHandler.adjust_san` 中增加 Max SAN clamp：当 `delta > 0` 且当前 SAN 超过 `99 - cthulhuMythos` 时，自动向下修正到该上限；负向 SAN 变化保持原有行为，仅累加当日 SAN 损失。
- 在 `src/toolCalling/handlers/__tests__/sanityHandler.spec.ts` 中添加了 Max SAN 行为测试，覆盖「有神话值时的上限约束」「神话值提升导致 Max SAN 降低时的重新 clamp」以及「负向变化不受上限限制」。

---

#### 2.8 急救 & 医学（First Aid & Medicine，含自然恢复 — 已实现首版）

**规则书引用**：第六章 战斗

当前只有简单的 `adjust_hp`，缺失结构化治疗机制。

| 治疗方式 | 效果 | 条件 |
|----------|------|------|
| **急救（First Aid）** | +1 HP | 受伤后 1 小时内，一次机会 |
| **医学（Medicine）** | +1D3 HP | 可在急救后进行，非当日为困难难度 |
| **濒死急救** | 稳定状态（停止每轮 CON 检定） | 仅急救可稳定 |
| **自然恢复（轻伤）** | 每天 1 HP | 仅有轻伤时 |
| **自然恢复（重伤）** | 每周 CON 检定成功 +1D3 HP | 完全卧床+医疗 = +2D3 |

**实现情况**：
- **工具层**：
  - 在 `electron/ipc/aiHandlers.cjs` 中新增 `first_aid` 与 `medicine` tool 定义，并通过 `sync-tools`/`toolConsistency` 形成 SSOT。
  - 在 `combatHandler` 中实现对应 handler：
    - `first_aid`：受伤且濒死时成功急救，HP +1（不超过 `hpMax`）并将 `isDying` 置为 `false`；满血时仅提示无需急救；可通过参数 `success: false` 表示急救失败，仅输出失败提示。
    - `medicine`：在医学检定成功（`success: true`）时按 1D3（默认，可由 `healExpr` 覆盖）治疗 HP，结果不超过 `hpMax`；失败或满血时 HP 不变，仅输出提示。
  - 相关测试位于 `src/toolCalling/handlers/__tests__/healingHandler.spec.ts`，覆盖濒死稳定、失败不变、更高治疗量与满血无效等场景。
- **自然恢复**：
  - 在 `src/logic/healingRules.ts` 中新增 `applyNaturalHealing`，按「轻伤每日 +1 HP」「重伤每周 CON 检定成功 +1D3 HP」实现简化版自然恢复逻辑，始终不超过 `hpMax`。
  - 对应测试位于 `src/logic/__tests__/healingRules.spec.ts`，验证轻伤/重伤多周恢复与上限约束。
  - 更复杂的卧床疗养加成（如 +2D3）与住院环境修正目前留待后续 Phase 迭代补充。

---

#### 2.9 幕间成长 / 技能提升（Development Phase）

**规则书引用**：第五章 游戏系统

- 成功使用技能时标记成长
- 幕间成长：每个标记技能掷 D100，若 > 当前技能值（或 ≥ 96）→ 技能 +1D10
- 技能达到 90%：获得 2D6 SAN
- 训练：每 4 个月游戏内时间 → 一次成长检定

**建议实现**：
- 在角色状态中增加 `skillGrowthMarks: Set<string>` 跟踪成长标记
- 新增 `mark_skill_growth` tool（成功检定后自动标记）
- 新增 `development_phase` tool（批量处理所有标记技能的成长检定）

---

#### 2.10 追逐系统（Chase）

**规则书引用**：第七章 追逐

完整的追逐子系统，当前完全缺失。

- **速度检定**：步行 = CON 检定；车辆 = 驾驶检定
  - 成功 = MOV 不变；极难成功 = MOV+1；失败 = MOV-1
- **追逐建立**：比较调整后 MOV，决定是否能逃脱
- **位置（Locations）**：抽象路径点，每移动一格消耗 1 行动点
- **行动点**：每人 1 基础 + 超出最慢者 MOV 的部分
- **障碍（Hazards）**：需要技能检定通过，可花行动点换奖励骰
- **路障（Barriers）**：完全阻挡直到击破或绕过
- **追逐中战斗**：消耗 1 行动点，正常战斗规则
- **车辆**：Build 点 = 1D10 伤害，撞击后车辆承受一半伤害

**建议实现**：这是一个复杂子系统，建议作为独立模块实现。初期可由 KP AI 通过现有工具组合叙事处理，后期再实现专用工具。

---

#### 2.11 环境伤害

**规则书引用**：第六章 战斗 Table III

| 来源 | 伤害 |
|------|------|
| 坠落（软地面/10ft） | 1D3 |
| 坠落（草地/10ft） | 1D6 |
| 坠落（硬地面/10ft） | 1D10 |
| 火把 | 1D6/轮 |
| 火焰喷射器 | 1D10/轮 |
| 汽车撞击（30mph） | 2D10 |
| 火车撞击 | 8D10 |

**溺水/窒息**：
- 每轮 CON 检定（剧烈活动为困难难度）
- 失败：1D6 伤害/轮
- HP 降至 0 = 死亡（跳过重伤/濒死规则）

**毒素**：
- 四级：极弱(无伤害)/弱(1D10)/强(2D10)/致命(4D10)
- CON 极难成功 = 伤害减半；大成功 = 可能完全免疫
- 可孤注一掷（催吐、截肢等）

**建议实现**：新增 `environmental_damage` tool 或在 KP prompt 中提供环境伤害表供参考。

---

### 🟢 P2 — 进阶功能（深度游戏体验）

#### 2.12 魔法系统

**规则书引用**：第九章 魔法

- **神话典籍（Mythos Tomes）**：
  - 泛读：语言技能检定，成功获得 CMI（克苏鲁神话初始值），自动损失 SAN
  - 精读：数周到数月，完成后获得 CMF（完整值），再次损失 SAN
  - 包含可学习的法术列表

- **法术学习**：
  - 从典籍学习：2D6 周 + 困难 INT 检定
  - 从他人学习：1D8 天
  - 从神话实体学习：总是损失 SAN

- **施法检定**：
  - 首次施放：困难 POW 检定
  - 成功：法术生效，此后该法术永不需再检定
  - 失败：无事发生，可孤注一掷
  - 孤注一掷失败：**法术仍然生效**，但施法者承受严重后果（消耗 × 1D6 倍、HP 损失、副作用）

- **消耗**：MP（不足时从 HP 扣除）、SAN、部分法术永久消耗 POW

**建议实现**：
- 新增 `cast_spell` tool（处理 POW 检定、MP/SAN/HP 消耗）
- 新增 `read_tome` tool（处理泛读/精读、CM 技能增长、SAN 损失）
- 在角色状态中增加 `cthulhuMythos`、`knownSpells`、`readTomes` 字段

---

#### 2.13 信用评级在游戏中的使用

**规则书引用**：第十章 主持游戏

- 信用评级决定生活水平、日常开支、可用现金和其他资产
- 高信用评级在社交场景中提供优势
- 幕间成长时根据就业状况调整信用评级：
  - 升职 +1D6 / 无工作 -2D10 / 大额遗产 +1D10（反复掷直到匹配新资产等级）

**建议实现**：在 KP prompt 中提供信用评级使用指南，非关键路径无需专用 tool。

---

#### 2.14 理智恢复机制

**规则书引用**：第八章 理智

- **剧本奖励**：KP 在剧本完成后授予 SAN（如 1D6）
- **技能精通**：任何技能达到 90% → +2D6 SAN
- **心理治疗**：每月 D100 检定，成功 +1D3 SAN，大失败 -1D6 SAN
- **自救（Self-Help）**：使用背景故事元素作为心理锚点
  - SAN 检定（关键关系人可获奖励骰）
  - 成功：+1D6 SAN；失败：-1 SAN + 背景故事受损

**建议实现**：新增 `award_san` tool（剧本结束奖励），`therapy_check` tool（心理治疗检定）。

---

#### 2.15 习惯恐惧（Hardened to Horror）

**规则书引用**：第八章 理智

- 对特定生物类型的 SAN 累计损失达到该生物最大可能损失后，不再因该生物损失 SAN
- 幕间成长时习惯值减 1（恐惧逐渐恢复）

**建议实现**：在角色状态中增加 `horrorHabituation: Record<string, number>` 跟踪。

---

#### 2.16 成为信仰者（Becoming a Believer）

**规则书引用**：第九章 魔法

- 非信仰者可阅读神话典籍但无法施法，获得 CM 但不损失 SAN
- 触发条件：直接遭遇神话 + SAN 检定失败（损失 ≥ 1 SAN）
- 后果：立即损失等于当前 CM 技能值的 SAN

**建议实现**：在角色状态中增加 `isMythosBeliever: boolean`，在 `san_check` 中检查触发条件。

---

#### 2.17 NPC 幸运池

**规则书引用**：第十章 主持游戏

- 重要 NPC 可拥有 Luck 池（通常 15-75）
- KP 可消耗 NPC Luck 调整其骰点结果

**建议实现**：在 KP Agent 内部状态管理中实现，无需暴露为 tool。

---

## 三、角色状态缺失字段

当前 `COCCharacterSheet` 类型需要扩展以下字段：

```typescript
interface COCCharacterSheetExtensions {
  // 战斗相关
  damageBonus: string          // e.g., "+1D4", "-1", "0"
  build: number                // -2 to 4+
  mov: number                  // 移动速率
  armor: number                // 护甲值
  weapons: Weapon[]            // 武器列表（名称、伤害、射程、故障值等）

  // 疯狂相关
  insanityState: 'normal' | 'temporary' | 'indefinite' | 'permanent'
  phobias: string[]            // 当前恐惧症
  manias: string[]             // 当前躁狂症
  dailySanLoss: number         // 当日累计 SAN 损失（用于不定性疯狂判定）
  hasMajorWound: boolean       // 是否有重伤标记
  isDying: boolean             // 是否处于濒死状态

  // 技能成长
  skillGrowthMarks: string[]   // 标记了成长的技能 ID 列表

  // 神话相关
  cthulhuMythos: number        // 克苏鲁神话技能值
  isMythosBeliever: boolean    // 是否为信仰者
  knownSpells: string[]        // 已知法术
  readTomes: string[]          // 已阅读的典籍

  // 经济
  creditRating: number         // 信用评级
  cashOnHand: number           // 手头现金
  assets: number               // 其他资产

  // 恐惧习惯
  horrorHabituation: Record<string, number>  // 生物类型 → 累计 SAN 损失
}
```

---

## 四、KP Agent 行为增强建议

### 4.1 提示词（System Prompt）增强

当前 KP Agent 的 system prompt 应补充以下指引：

1. **何时要求掷骰 vs 自动成功**：
   - 仅在失败有趣或有意义后果时要求掷骰
   - 日常/例行行为自动成功
   - 每个任务只允许一次检定（可孤注一掷）

2. **线索分发策略**：
   - 关键线索应为「显明线索」（无需检定即可获得）
   - 隐藏线索需感知类检定
   - 检定失败不应阻断调查——通过其他途径或代价提供信息

3. **灵感检定（Insight Check）**：
   - 玩家卡住时，KP 可提示 INT 检定
   - 成功：以直觉形式提供遗漏线索
   - 失败：线索仍给出但附带代价

4. **社交技能难度设定**：
   - NPC 相关技能 < 50%：常规难度
   - NPC 相关技能 ≥ 50%：困难难度
   - NPC 相关技能 ≥ 90%：极难难度
   - NPC 对目标同情：自动成功
   - NPC 强烈反对：提高 1-2 级难度

5. **氛围营造**：
   - 聚焦五感描述（尤其是气味——神话存在常有独特恶臭）
   - 未知比已知更可怕——描述效果和印象而非清晰展示怪物
   - 从小处开始逐步升级——每次揭示比上次更糟

---

### 4.2 KP LangGraph 多子 Agent 编排（已接入 storyContext）

- **顶层编排结构**（见 `electron/agent/kpGraph.mjs`）：
  - `START → analyzeInput → routeByIntent → {generic/combat/sanity/narrative/resource Plan+Generate} → validate → (forceTools?) → END`
  - 路由规则（`routeByIntent` + `routeByIntentEdge`）：
    - `combat` → `combatPlan/combatGenerate`（战斗子 Agent）
    - `san_encounter` → `sanityPlan/sanityGenerate`（理智子 Agent）
    - `investigate` / `explore` / `talk_npc` / `move` / `tool_continuation` → `narrativePlan/narrativeGenerate`（叙事/调查子 Agent）
    - `use_item` → `resourcePlan/resourceGenerate`（资源子 Agent）
    - 其余 → `genericPlan/genericGenerate`（generic 兜底 Agent）

- **KPState 关键字段**（LangGraph Annotation Root）：
  - `messages`：对话消息数组；
  - `playerIntent`：当前意图（见 INTENT_TYPES）；
  - `agentType`：当前轮选中的子 Agent（generic/combat/sanity/narrative/resource）；
  - `requiredTools` / `toolPlan`：Plan 节点给本轮设定的必需工具及自然语言规划；
  - `toolCalls`：Generate/forceTools 节点输出的工具调用；
  - `validationResult` / `retryCount`：验证与重试状态；
  - **新增** `storyContext`：从 Electron/前端注入的结构化故事上下文；
  - **新增** `narrativeStallLevel`：简单的叙事停滞计数器，用于强制线索/切场景。

- **storyContext 结构（最小可用版本）**：
  - 顶层字段（供叙事子 Agent 使用）：
    - `sceneId?: string` / `sceneName?: string` / `sceneType?: string`；
    - `act?: 'hook' | 'investigation' | 'confrontation' | 'aftermath' | string`；
    - `openClues?: string[]`（待触达或未解决的线索摘要）；
    - `activeNPCs?: Array<{ name?: string; role?: string }>`（当前场景重要 NPC）。
  - 可选子结构 `sanity`（供 sanityAgent Plan 强化使用）：
    - `currentSan?: number`；
    - `dailySanLoss?: number`；
    - `potentialLoss?: number`（本次事件预计 SAN 损失上限）。
  - 前端通过 `kp:invoke` / `kp:invokeStream` IPC 调用时，以 `params.storyContext` 传入，Electron 层直接透传到 KP 图初始 state。

- **叙事进度控制（analyzeNarrativeProgress + narrativePlan/genericPlan）**：
  - 新增 `analyzeNarrativeProgress(state)`：
    - 输入：`playerIntent`、本轮 `toolCalls`、`narrativeStallLevel`；
    - 输出：`{ nextStallLevel, shouldForceClue, shouldForceScene }`；
    - 规则：在叙事相关意图下且本轮未调用 `grant_clue` / `transition_scene` / `skill_check` 时，`stallLevel++`，使用上述任一工具时重置为 0，并做 0–10 的 clamp。
  - 在 `narrativePlan` / `genericPlan` 中：
    - 当 `shouldForceScene` 为真且当前 agent 为 narrative 时，追加 `transition_scene` 到 `requiredTools`；
    - 否则当 `shouldForceClue` 为真时，追加 `grant_clue`；
    - 将 `nextStallLevel` 写回 state（由 Plan 节点返回 `narrativeStallLevel`），实现跨轮记忆。
  - 在 `createGenerateNode(..., 'narrative' | 'generic')` 中：
    - 读取 `state.storyContext` 并将其摘要以「当前故事上下文」小节追加到 system message；
    - 明确要求：叙事和行动选项尽量围绕 `openClues` 与 `activeNPCs` 展开，玩家跑题时用简短话语拉回当前场景或主线。

- **sanityAgent & resourceAgent 的 Plan 规则增强**：
  - sanityAgent（`sanityPlan` + `agentKind === 'sanity'`）：
    - 若 `playerIntent === 'san_encounter'` 且 `storyContext.sanity` 提供 `currentSan` / `dailySanLoss` / `potentialLoss`：
      - 当单次潜在损失 `potentialLoss >= 5` 时，将 `trigger_insanity` 加入 `requiredTools`；
      - 或当 `dailySanLoss + potentialLoss >= floor(currentSan / 5)` 时，同样加入 `trigger_insanity`；
      - 与工具层的 `san_check` / `trigger_insanity` 逻辑配合，形成「必检定 + 必判疯狂」的硬约束。
  - resourceAgent（`resourcePlan` + `agentKind === 'resource'`）：
    - 仅在 `playerIntent === 'use_item'` 时生效；
    - 从最近一条 user 消息文本中做关键词匹配：
      - 包含「luck/幸运」→ 追加 `spend_luck`；
      - 包含「MP/魔法值/法力」→ 追加 `adjust_mp`；
      - 包含「SAN/理智」→ 追加 `adjust_san`。

- **genericAgent 护栏**：
  - Plan 层：在 `createPlanNode('generic')` 中对 `requiredTools` 做一次过滤，剔除 `transition_scene` 与 `grant_clue`，避免 genericAgent 直接推动剧情。
  - Generate 层：在 `createGenerateNode(..., 'generic')` 中追加「genericAgent 限制」：
    - 只做规则问答/简单闲聊；
    - 回答后用一两句自然过渡，把话题拉回当前场景或主线；
    - 不主动调用高影响剧情工具（transition_scene/grant_clue 等）。

### 4.3 RAG 与 storyContext 数据源（已实现）

- **storyContext 来源**：由前端在每次 KP 调用前从游戏状态构建并传入，不再依赖 RAG 产出。
  - 实现位置：`gameStore.buildStoryContext()`（见 `src/stores/gameStore.ts`），类型定义见 `src/types/storyContext.ts`。
  - 字段来源：`sceneId`/`sceneName` 来自 `currentScene`（由 `transition_scene` 工具更新）；`sanity.currentSan`/`sanity.dailySanLoss` 来自 `characterSheet.derived.san` 与 `characterSheet.dailySanLoss`。
  - 传递路径：`runKpAgentLoop` 回调中的 `getStoryContext` 每轮调用 `buildStoryContext()`，`kpSessionService.kpInvokeOnce` 将得到的 `storyContext` 放入 IPC params，Electron `kp:invoke`/`kp:invokeStream` 透传至 LangGraph 初始 state。

- **RAG 检索与 sceneId**：RAG 仅负责「按玩家消息检索剧本片段」并注入 system prompt 的「故事情报」块。
  - 在 `gameStore.fetchRagContext(query)` 中调用 `getContext({ query, scriptId, sceneId: currentScene.value || undefined, topK: 8 })`。当存在当前场景时传入 `sceneId`，向量库会按 `metadata.scene_id` 过滤（若块带 scene_id，则只返回该场景相关块；否则退化为全剧本检索）。

- **结构化剧本分块（可选）**：Markdown 剧本若遵循约定标题，索引时可产出带 `type` 与 `sceneId` 的 RAG 块，便于按场景/类型过滤。
  - 约定：`## 场景：<name>` 或 `## 场景 <name>` 标记场景；`### 线索` / `### 线索：` 为线索块；`### NPC` / `### 人物` 为 NPC 块。实现见 `storyService.markdownToStructuredChunks`。
  - 索引：`fileToChunks(..., { useStructuredMarkdown: true })` 用于 .md 文件（`storyStore.indexStoryForRag` 对 .md 已启用），产出 `type: 'scene' | 'clue' | 'npc' | 'rule'` 且含 `metadata.sceneId` 的块；向量库 `normalizeMetadata` 将 `sceneId` 存为 `scene_id`，`queryChunks` 支持按 `sceneId`/`type` 过滤。

### 4.4 RAG 语义检索（嵌入向量，Part C）

- **默认内置模型**：当 `rag.useEmbeddings` 为 true 且 `rag.provider === 'builtin'` 时，使用应用内预置的本地中文嵌入模型（`@xenova/transformers` + `Xenova/text2vec-base-chinese-sentence`），无需 API Key，首次使用会自动下载模型。
- **可选用户 API**：当 `rag.provider === 'api'` 时，使用上方 AI 的 Base URL 与 API Key 调用 OpenAI 兼容的 `/v1/embeddings`，模型名由 `rag.model` 指定（默认 `text-embedding-3-small`）。
- **实现**：`electron/rag/embedding.mjs` 提供 `createBuiltinEmbedder()`（本地）与 `createEmbedder({ baseUrl, apiKey, model })`（API）；`vectorStore` 与 `ragHandlers` 根据 `settings.rag.provider` 选择其一并注入。
- **配置**：设置 → 服务配置 →「使用语义检索」→ 选择「内置模型」或「使用我的嵌入 API」；选 API 时需配置上方 AI 的 Base URL 与 API Key，并可填写嵌入模型名。
- **嵌入模型建议**（中英剧本兼顾、性价比与质量平衡）：
  - **OpenAI**：`text-embedding-3-small`（1536 维，便宜、中英均可）、`text-embedding-3-large`（更强、更贵）。
  - **Azure OpenAI**：同上模型名，Base URL 与 API Key 使用 Azure 端点与 key。
  - **本地/自托管**：任何兼容 OpenAI 嵌入 API 的服务（如 [Ollama](https://ollama.com) 搭配 `nomic-embed-text`、[LocalAI](https://localai.io)、[sentence-transformers 封装服务](https://www.sbert.net) 等），将 Base URL 指向该服务即可；若用中文为主，可选多语言模型如 `paraphrase-multilingual-MiniLM-L12-v2` 的 API 封装。
  - **不启用**：保持 `useEmbeddings` 关闭则仅用 TF-IDF，无需 API、离线可用。

---

## 五、建议实现路线图

### Phase 1 — 核心战斗与理智（最高优先级）

1. 实现 `opposed_check` tool
2. 扩展 `skill_check` 支持奖励骰/惩罚骰和孤注一掷
3. 实现完整疯狂系统（临时/不定/永久 + 疯狂发作效果）
4. 实现 Luck 消耗机制
5. 扩展战斗系统（伤害加值、护甲、重伤、濒死）
6. 在角色状态中增加 `damageBonus`、`build`、`hasMajorWound`、`isDying`

### Phase 2 — 治疗与成长

7. 实现 First Aid / Medicine 结构化治疗
8. 实现幕间成长系统（技能成长标记 + 检定）
9. 实现 Max SAN = 99 - Cthulhu Mythos 限制
10. 环境伤害参考表集成到 KP prompt

### Phase 3 — 魔法与追逐

11. 实现魔法系统（施法检定、消耗、典籍阅读）
12. 实现追逐系统（速度检定、行动点、障碍）
13. SAN 恢复机制（剧本奖励、心理治疗、自救）

### Phase 4 — 精细化

14. 枪械详细规则（射程、快射、自动武器、故障）
15. 战技系统（Build 比较、缴械/擒抱）
16. 信用评级在游戏中的经济影响
17. NPC Luck 池
18. 习惯恐惧跟踪
19. 恐惧症/躁狂症 100 项随机表

---

## 六、已实现功能详情（Implementation Details）

以下为按本差距分析文档逐步实现后的功能记录，便于后续维护与扩展时对照。

### 6.0 工具调用多层架构（已实现）

- **编排器 + 分域 Handler**：工具执行由 `src/toolCalling/orchestrator.ts` 统一入口，按工具名路由到 Check / Combat / Sanity / Resource / Narrative 五类 Handler（见 `src/toolCalling/handlers/`）。gameStore 的 `processToolCalls` 仅调用 `processToolCallsOrchestrator(toolCalls, buildToolContext())`。
- **文档**：分类与调用链见 [docs/TOOL-CALLING.md](TOOL-CALLING.md)。

### 6.1 Phase 1 — 核心检定与幸运（已实现）

#### 对抗检定（opposed_check）

- **位置**：`electron/ipc/aiHandlers.cjs`（工具定义）、`src/stores/gameStore.ts`（`processToolCalls` 内处理）。
- **参数**：`sideAName`, `sideAValue`, `sideBName`, `sideBValue`, `tieBreaker`（`'attacker'` | `'defender'`）。
- **逻辑**：双方各掷 d100，按常规难度得到成功等级；比较等级（大成功 > 极难 > 困难 > 常规 > 失败 > 大失败），等级相同则比较技能值，再相同则按 `tieBreaker` 判定（反击=attacker 胜，闪避=defender 胜）。
- **返回**：`rollA`, `rollB`, `resultA`, `resultB`, `winner`（`'A'` | `'B'`），供 KP 叙事与后续伤害链使用。

#### 技能检定扩展（skill_check）

- **新增可选参数**：`bonusDice`、`penaltyDice`（0–2）、`isPush`（孤注一掷）。
- **奖励骰/惩罚骰**：在 `gameStore` 中实现 `rollD100WithModifiers(bonusDice, penaltyDice)`：对十位数额外掷 d10，奖励骰取更低十位、惩罚骰取更高十位；一个奖励与一个惩罚互相抵消，最多各 2 个。
- **孤注一掷**：`isPush: true` 仅影响结果中的标记与 KP 叙事提示，规则上仍为一次独立检定（不可用于幸运/SAN/战斗检定）。
- **展示**：检定结果在对话中以系统消息展示，包含「奖励骰/惩罚骰」「孤注一掷」等标签。

#### 幸运消耗（spend_luck）

- **位置**：`aiHandlers.cjs` 中 `spend_luck` 工具、`gameStore.processToolCalls` 中处理逻辑及 `updateCharacterLuck`。
- **参数**：`amount`（消耗点数）。
- **逻辑**：从当前角色 `attributes.luck` 扣除（不超过当前值），写入角色卡；返回 `spent`, `previousLuck`, `newLuck`。
- **限制**：由 KP 在叙事与提示中约束「不可用于幸运检定、SAN 检定、伤害骰」；工具本身不区分场景。

#### 角色状态

- **Luck 更新**：新增 `updateCharacterLuck(delta)`，与 HP/MP/SAN 一样会触发 `derivedStatsVersion` 更新，供 UI 同步显示。

### 6.2 Phase 1 — 疯狂系统与战斗扩展（已实现）

#### 疯狂系统（trigger_insanity）

- **位置**：`electron/ipc/aiHandlers.cjs`（工具定义）、`src/stores/gameStore.ts`（`processToolCalls` 内处理）。
- **参数**：`sanLost`（本次 SAN 损失）、`intValue`（调查员 INT，用于单次损失≥5 时的临时疯狂门控检定）。
- **逻辑**：
  - SAN 扣减后 ≤ 0 → 设为**永久疯狂**（`insanityState: 'permanent'`）。
  - 当日累计 SAN 损失 ≥ 当前 SAN 的 1/5 → **不定性疯狂**，掷 1D10 发作表；9=添加恐惧症，10=添加躁狂症（当前为占位「随机恐惧症/躁狂症」，可后续接 Table IX/X）。
  - 单次损失 ≥ 5 → INT 检定：成功则**临时疯狂**并掷 1D10 发作；失败则**压抑**（不陷入临时疯狂）。
- **角色状态**：`insanityState`（normal | temporary | indefinite | permanent）、`phobias`、`manias`、`dailySanLoss`。`san_check` 与 `adjust_san`（负 delta）后自动累加 `dailySanLoss`。
- **Store**：`addCharacterDailySanLoss`、`resetCharacterDailySanLoss`、`updateCharacterInsanityState`；角色上下文（`buildCharacterContext`）中输出疯狂状态与恐惧症/躁狂症供 KP 叙事。

#### 战斗扩展（apply_major_wound）与角色卡扩展

- **apply_major_wound**：
  - **位置**：同上，工具定义在 `aiHandlers.cjs`，处理在 `gameStore.processToolCalls`。
  - **参数**：`hpMax`、`damageDealt`（本击伤害）、`hpAfter`（扣减后当前 HP）。
  - **逻辑**：若 `damageDealt > hpMax` 则**即死**（立即死亡），设 `hasMajorWound`、`isDying`，返回 `instantDeath: true`；否则若 `damageDealt >= hpMax/2` 则重伤并 CON 昏迷检定；若 `hpAfter <= 0` 且（重伤或即死）则 `isDying: true`。返回 `instantDeath`、`hasMajorWound`、`isDying`、`unconscious` 供 KP 叙事。
- **角色卡扩展**（`src/types/character.ts`）：新增可选字段 `damageBonus`、`build`、`mov`、`armor`、`insanityState`、`phobias`、`manias`、`dailySanLoss`、`hasMajorWound`、`isDying`、`weapons`，兼容旧存档。
- **角色创建**（`src/logic/coc7Character.ts`）：`getDamageBonusAndBuild(str, siz)` 按 STR+SIZ 表计算伤害加值与体格；`buildCharacterSheet` 中为新角色写入上述字段默认值（含 `weapons: []`）。

#### 近战/远程一击（melee_attack、ranged_attack）与武器字段（weapons）

- **melee_attack**：
  - **位置**：`aiHandlers.cjs` 工具定义、`gameStore.processToolCalls` 内处理。
  - **参数**：`sideAName`/`sideAValue`（攻击方 A）、`sideBName`/`sideBValue`（防御方 B）、`tieBreaker`（attacker/defender）、`damageExpr`（武器伤害如 "1d6"）、`attackerDamageBonus`/`defenderDamageBonus`（如 "0","+1D4"）、`attackerArmor`/`defenderArmor`、`investigatorSide`（'A'|'B'|'none'）；可选双方奖励/惩罚骰。
  - **逻辑**：执行对抗检定 → 胜方造成伤害 = 投武器骰 + 胜方伤害加值 - 败方护甲（min 0）；若 `investigatorSide` 为败方则自动 `updateCharacterHP(-damageDealt)` 并执行即死/重伤/濒死判定（与 apply_major_wound 一致）。
  - **用途**：一次调用完成近战链，替代 opposed_check + roll_dice + adjust_hp + apply_major_wound。

- **ranged_attack**：
  - **位置**：同上。
  - **参数**：`skillName`/`skillValue`、`difficulty`、`damageExpr`、`targetArmor`、`targetIsInvestigator`。
  - **逻辑**：技能检定（常规/困难/极难）→ 命中则投伤害减护甲；若 `targetIsInvestigator` 则自动扣 HP 并执行重伤/濒死/即死判定。
  - **用途**：一次调用完成远程链，替代 skill_check + roll_dice + adjust_hp + apply_major_wound。

- **weapons**（`COCWeapon[]`）：类型为 `{ name: string; damage?: string; range?: string }[]`；角色创建时默认 `weapons: []`；`buildCharacterContext` 中输出武器列表供 KP 参考。后续可由创建流程或剧本预填。

### 6.3 Phase 1 — 其他 P0 补充（已实现）

#### 对抗检定奖励骰/惩罚骰（opposed_check）

- **位置**：`aiHandlers.cjs` 中 `opposed_check` 增加可选参数；`gameStore.processToolCalls` 中双方分别使用 `rollD100WithModifiers`。
- **参数**：`sideABonusDice`、`sideAPenaltyDice`、`sideBBonusDice`、`sideBPenaltyDice`（0–2），与 `skill_check` 规则一致（奖励骰取低十位、惩罚骰取高十位，互抵）。
- **用途**：以多打少等场景下可为一方赋予惩罚骰或另一方奖励骰；展示消息中带「奖/惩」标签。

#### 新游戏日重置（reset_day）

- **位置**：`aiHandlers.cjs` 新增 `reset_day` 工具（无参数）；`gameStore.processToolCalls` 中调用 `resetCharacterDailySanLoss()`。
- **逻辑**：将角色 `dailySanLoss` 置 0，表示新一天开始。KP 在叙事「过夜」「新的一天」等时机调用，保证后续不定性疯狂判定（当日损失 ≥ 当前 SAN 的 1/5）基于新的当日累计。
- **展示**：系统消息「新的一天开始，当日 SAN 损失已重置」。

### 6.4 后续可实现的 Phase 1 项（见第五节路线图）

- 疯狂发作表 Table VII/VIII 完整效果文案与恐惧症/躁狂症 Table IX/X 集成。
- 先攻、战技（Build 比较）、枪械详细规则。

---

## 七、总结

| 分类 | 已实现 | 部分实现 | 完全缺失 |
|------|--------|----------|----------|
| 技能检定 | ✅ 基本检定、奖励/惩罚骰、孤注一掷、对抗检定 | | |
| 战斗 | ✅ 基本攻击链、近战一击（melee_attack）、远程一击（ranged_attack）、对抗检定（opposed_check 含奖励/惩罚骰）、即死/重伤/濒死（apply_major_wound）、伤害加值/体格/护甲/武器（角色卡） | | ❌ 先攻、战技、枪械详细规则 |
| 理智 | ✅ SAN 检定、疯狂系统（trigger_insanity）、恐惧症/躁狂症（简化）、新日重置（reset_day）、Max SAN clamp | 部分实现：Max SAN 限制已接入 `adjust_san`，仍缺 SAN 恢复与完整发作表文案 | ❌ SAN 恢复、发作表全文案 |
| 幸运 | ✅ 属性存在、消耗机制（spend_luck） | | ❌ 恢复机制（幕间掷 1D100） |
| 治疗 | ✅ 简单 HP 调整；已实现 `first_aid` / `medicine` tool 及自然恢复逻辑（applyNaturalHealing） | 部分实现：基础治疗与自然恢复可用，重伤长期恢复与住院/卧床修正仍可进一步细化 | ❌ 重伤长期恢复加成、住院/卧床等高级治疗细节 |
| 魔法 | ✅ MP 跟踪 | | ❌ 施法、典籍、法术学习 |
| 追逐 | | | ❌ 整个子系统 |
| 角色成长 | ✅ 角色创建 | | ❌ 幕间成长、技能标记 |
| 环境 | ✅ 场景转换 | | ❌ 环境伤害（坠落/火焰/溺水/毒素） |
| 调查 | ✅ 线索授予 | | ❌ 灵感检定 |

**当前实现覆盖了 COC 7th 约 60-65% 的 KP 所需机制**（含 Phase 1 全部 P0：对抗检定与奖励/惩罚骰、近战/远程一击工具、幸运消耗、疯狂系统与 reset_day、即死/重伤/濒死、伤害加值/体格/护甲/武器）。Phase 1+2 约 75-80%，全部四期约 90-95%。

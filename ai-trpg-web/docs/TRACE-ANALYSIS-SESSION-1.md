# KPTrace 会话分析报告

**Trace 文件**: `debug-trace/kptrace-1775039297947.json`
**故事**: 重返黑色校园
**日期**: 2026-03-31
**总回合数**: Opening + 12 turns（Turn 13 因 429 限流中断）
**总时长**: ~42 分钟（1775036726166 → 1775039225386）

---

## 1. 总体健康度评估

| 模块 | 状态 | 评分 |
|------|------|------|
| RAG 检索 | ⚠️ 功能正常但有结构缺陷 | 6/10 |
| 意图分类 | ✅ 准确率高 | 9/10 |
| Agent 路由 | ✅ 正确分流 | 9/10 |
| 工具调用与验证 | ✅ 验证循环生效 | 8/10 |
| Prompt 组装 | ⚠️ 存在增长风险 | 6/10 |
| KP 短期记忆 | ⚠️ 存在设计缺陷 | 5/10 |
| 长期摘要 | ⚠️ 更新不够及时 | 6/10 |
| 角色状态追踪 | ✅ 正常 | 9/10 |
| 错误处理 | ✅ 正确捕获 | 8/10 |

---

## 2. RAG 检索系统分析

### 2.1 检索统计

| 回合 | 玩家查询（截取） | topK | 返回 contextLength | chunkCount |
|------|------------------|------|---------------------|------------|
| Opening | "开场 故事背景 场景描述 第一幕" | 8 | 4677 | 0 |
| Turn 1 | "进入校园" | 8 | 4936 | 0 |
| Turn 2 | "在途中询问保卫处处长关于学生失踪的情况" | 8 | 5385 | 0 |
| Turn 3 | "借口系鞋带或整理衣物，趁机观察行政楼周围的环境" | 8 | 4753 | 0 |
| Turn 4 | "跟在保安身后并尝试偷袭" | 8 | 4616 | 0 |
| Turn 5 | "继续出手，试图彻底制服他，然后拿走钥匙串" | 8 | 5109 | 0 |
| Turn 6 | "迅速将处长拖到旁边的灌木丛…先搜查处长身上…" | 8 | 5251 | 0 |
| Turn 7 | "先翻阅巡逻记录本的其他页面…" | 8 | 5500 | 0 |
| Turn 8 | "带着警棍和钥匙前往地下通道入口" | 8 | 5086 | 0 |
| Turn 9 | "绕着楼体仔细搜索…地下通道入口" | 8 | 5744 | 0 |
| Turn 10 | "前往一楼最东边的 106 宿舍…" | 8 | 5601 | 0 |
| Turn 11 | "尝试用缴获的钥匙串逐一试开锁…" | 8 | 5425 | 0 |
| Turn 12 | "仔细搜查房间内的床铺、抽屉和衣柜…" | 8 | 5302 | 0 |

### 2.2 问题诊断

#### **[严重] chunkCount 全程为 0**

所有 `rag_context_received` 事件的 `chunkCount` 均为 0，但 `contextLength` 在 3000–5700 范围内。这意味着：

- RAG 系统确实返回了文本内容（`contextLength > 0`），故事信息在被使用
- 但 `chunkCount` 追踪逻辑可能有 bug：报告 chunk 数为 0 的同时返回了大量内容
- 可能原因：`getContext` 底层使用 TF-IDF 文本匹配而非向量检索，追踪代码只统计向量 chunk 数量

**建议**: 检查 `ragService.ts` 中 `rag_context_received` 事件的 `chunkCount` 计算逻辑，确保它统计的是实际返回的文档片段数而非仅向量匹配数。

#### **[中等] GraphRAG 和 UserGraph 全程未启用**

所有回合的 `hasGraphSummary: false`、`hasUserGraph: false`。尽管代码中有 `addUserGraphEvent` 和 `syncUserGraphFromState` 的调用，UserGraph 摘要未能体现在 RAG 上下文中。

**建议**: 确认 GraphRAG 索引是否已为"重返黑色校园"生成，并检查 `getUserGraphSummary` 是否在 IPC 层正确执行。

#### **[低] Scene-change 时的额外 RAG 查询使用了完整线索描述作为 query**

当 `transition_scene` 触发时，系统会发起第二次 RAG 查询。例如 Turn 8 使用了：
> "学生宿舍 校门口立着一张学校平面图，清晰标示了行政楼（校长与总务处）、教学楼与图书馆、学生宿舍及天台的相对位置与进出路线。"

这个 query 实际是场景名 + 线索描述的拼接，过长且不够精准。topK 也降为 5。

**建议**: 场景切换时的辅助 RAG 查询应使用精简的场景名或场景关键词，而非拼接线索全文。

---

## 3. Prompt 组装与上下文管理

### 3.1 Prompt 长度增长趋势

| 回合 | totalLength | memoryEntries | ragContextLen | convWindow | longTermSummaryLen |
|------|-------------|---------------|---------------|------------|-------------------|
| Opening | 6,638 | 0 | 4,677 | 0 | 0 |
| Turn 1 | 7,817 | 1 | 5,024 | 2 | 0 |
| Turn 2 | 9,310 | 2 | 5,480 | 4 | 216 |
| Turn 3 | 9,628 | 3 | 4,848 | 6 | 216 |
| Turn 4 | 10,043 | 4 | 4,725 | 8 | 216 |
| Turn 5 | 11,217 | 5 | 5,232 | 10 | 216 |
| Turn 6 | 12,051 | 6 | 5,374 | 12 | 216 |
| Turn 7 | 13,207 | 7 | 5,623 | 14 | 216 |
| Turn 8 | 13,323 | 8 | 5,209 | 16 | 216 |
| Turn 9 | 14,771 | 9 | 5,872 | 18 | 216 |
| Turn 10 | 15,114 | 10 | 5,729 | 18 | 231 |
| Turn 11 | 15,137 | 11 | 5,553 | 18 | 231 |
| Turn 12 | 15,454 | 12 | 5,441 | 18 | 275 |

### 3.2 关键发现

#### **[严重] Prompt 无限增长 — 记忆积累无上限滑动**

`totalLength` 从 Opening 的 6,638 字符增长到 Turn 12 的 15,454 字符（**+133% 增长**），且趋势完全线性。主要增长来源：

1. **memoryEntries 线性增长**: 0 → 12，每轮 +1。虽然 `MAX_MEMORY_ENTRIES = 12`，但这意味着到第 12 轮才刚好触达上限。在此之前，记忆只增不减。按每条记忆 ~150 字估算，12 条记忆约占 **~1,800 字**。
2. **conversationWindow 增长到 18 上限**: 到 Turn 9 时达到 `CONVERSATION_WINDOW = 18` 的硬上限并稳定。这是正确行为。
3. **RAG context 保持稳定**: 在 4,600–5,900 范围内波动，这是正常的。

**风险**: 如果游戏继续 50+ 回合，prompt 将持续因记忆累积而增长。当 `memoryEntries` 达到 12 上限后增长会减缓，但 `totalLength` 预估将稳定在 ~15,000–16,000 字符（约 5,000-6,000 tokens），对大多数模型在安全范围内。

**但更大的问题是**: kpMemory 存储的是**完整的 KP 回复**（~150 字的 preview 只是截断显示，实际内容更长），这意味着 12 条记忆的实际占用可能远超预估。

#### **[严重] longTermSummary 更新极其滞后**

| 时间点 | 触发事件 | 结果 |
|--------|----------|------|
| Opening (scene_change → 古城福音中学门口) | summary_triggered + summary_input | 生成摘要 (202 字) |
| Turn 1 (scene_change → 古城福音中学) | summary_triggered + summary_input | 输出未记录在此 trace |
| Turn 2–7 | **无触发** | longTermSummaryLength 保持 216 |
| Turn 8 (scene_change → 学生宿舍) | summary_triggered + summary_input | 生成新摘要 (231 字) |
| Turn 10 (scene_change) | summary_triggered（无 summary_input） | 触发但可能异步未完成 |
| Turn 11 | summary_output | 新摘要 (275 字) |

**问题**: 长期摘要仅在 `scene_change` 时触发，且 Turn 2 到 Turn 7 之间（6 轮）没有任何场景变化，摘要完全没有更新。然而这 6 轮中发生了大量重要事件（与 NPC 对话、战斗、搜查），这些信息全部丢失。

`LONG_TERM_SUMMARY_EVERY_N_TURNS = 10` 的定期触发未生效（Turn 10 时 playerTurnCount 才到 10，此时恰好有 scene_change 先触发了）。

**建议**:
1. 将 `LONG_TERM_SUMMARY_EVERY_N_TURNS` 从 10 降低到 **5**，确保即使无场景变化也能定期更新
2. 在工具调用产生重要结果时（如 combat、grant_clue）也触发摘要更新
3. 摘要长度仅 202–275 字，远低于有效压缩比。建议将目标摘要长度提升到 400–500 字

#### **[中等] kpMemory 设计问题 — 存储的是完整回复而非结构化摘要**

kpMemory 的设计目的是"避免 KP 重复自己"，因此它存储 KP 的完整回复文本。但这导致：

1. **占用大量 prompt 空间**: 12 条完整回复可能占 3,000–6,000 字
2. **信息冗余**: 完整回复中包含大量叙事修辞，而真正需要记住的是"哪些信息已经告诉了玩家"
3. **与 longTermSummary 功能重叠**: 两者都在尝试保留历史上下文

**建议**: 将 kpMemory 改为存储结构化要点（如"已告知失踪案细节"、"已描述行政楼外观"），每条限制在 30–50 字，或直接合并到 longTermSummary 机制中。

---

## 4. Multi-Agent 系统分析

### 4.1 意图分类准确性

| 回合 | 玩家行为 | 分类结果 | 评估 |
|------|----------|----------|------|
| Opening | (系统开场) | narrative | ✅ 正确 |
| Turn 1 | "进入校园" | move | ✅ 正确 |
| Turn 2 | "在途中询问保卫处处长…" | talk_npc | ✅ 正确 |
| Turn 3 | "借口系鞋带…趁机观察行政楼" | explore | ✅ 正确 |
| Turn 4 | "跟在保安身后并尝试偷袭" | combat | ✅ 正确 |
| Turn 5 | "继续出手，试图彻底制服他" | combat | ✅ 正确 |
| Turn 6 | "搜查处长身上是否还有其他物品" | investigate | ✅ 正确 |
| Turn 7 | "先翻阅巡逻记录本的其他页面" | investigate | ✅ 正确 |
| Turn 8 | "带着警棍和钥匙前往地下通道入口" | move | ✅ 正确 |
| Turn 9 | "绕着楼体仔细搜索…地下通道入口" | investigate | ✅ 正确 |
| Turn 10 | "前往一楼最东边的 106 宿舍" | move | ✅ 正确 |
| Turn 11 | "尝试用缴获的钥匙串逐一试开锁…机械维修" | use_item | ✅ 正确 |
| Turn 12 | "仔细搜查房间内的床铺、抽屉和衣柜" | — | (429 中断) |

**评估**: 意图分类准确率 **12/12 = 100%**。分类器能正确区分 combat、investigate、move、explore、talk_npc、use_item 等意图。

### 4.2 Agent 路由

| 意图 | 路由到 | 出现次数 |
|------|--------|----------|
| narrative | generic | 1 (Opening) |
| move | narrative | 3 |
| talk_npc | narrative | 1 |
| explore | narrative | 1 |
| combat | combat | 2 |
| investigate | narrative | 4 |
| use_item | resource | 1 |
| tool_continuation | narrative | 多次 |

**评估**: 路由逻辑正确。特别注意：
- `narrative` 意图在 Opening 时被路由到 `generic` 而非 `narrative`，这是因为 Opening 时没有用户消息（空 user text → 默认 narrative → generic）。这不是 bug 但可以优化。
- `combat` 意图正确路由到 combat agent
- tool_continuation 正确路由到 narrative agent 进行后续叙事

### 4.3 工具调用与验证循环

| 回合 | 工具调用 | 验证结果 |
|------|----------|----------|
| Opening | transition_scene, grant_clue | valid (iteration 0 → tool → iteration 1 → valid) |
| Turn 1 | transition_scene | valid → tool_continuation → valid |
| Turn 2 | (无工具) | valid |
| Turn 3 | skill_check (侦查 50, roll 90 → failure) | valid → tool_continuation → valid |
| Turn 4 | melee_attack (1st attempt) → **missing_tools** → forceTools → skill_check → melee_attack (2nd) → adjust_hp | 验证循环正常工作 |
| Turn 5 | melee_attack → **missing_tools** → forceTools → skill_check → valid | 验证循环再次工作 |
| Turn 6 | skill_check (侦查 50, roll 18 → hard_success) | valid → tool_continuation → valid |
| Turn 7 | skill_check (侦查 50, roll 56 → failure) | valid → tool_continuation → valid |
| Turn 8 | transition_scene (学生宿舍) | valid → tool_continuation → valid |
| Turn 9 | skill_check (侦查 50, roll 48 → regular_success) | valid → tool_continuation → valid |
| Turn 10 | (无工具，叙事回合) | valid |
| Turn 11 | skill_check (机械维修 40, roll 37 → regular_success) | valid → tool_continuation → valid |

**评估**:
- ✅ 验证循环在 Turn 4 和 Turn 5（combat 意图）中正确检测到 `missing_tools: ["skill_check"]` 并通过 forceTools 补救
- ✅ 所有 skill_check 调用使用了正确的角色技能值（侦查 50、格斗 25、机械维修 40）
- ✅ melee_attack 正确执行了完整工具链（对抗检定 → 伤害 → adjust_hp）
- ✅ 无 text-simulation 检测触发（`hasSimulation: false` 全程）

#### **[注意] Combat Agent 需要 forceTools 补救**

两次 combat 意图都触发了 `missing_tools` → `forceTools` 循环。这说明 LLM 在 combat 场景下倾向于自行叙述而非调用工具。虽然 forceTools 机制成功补救，但这增加了额外的 LLM 调用成本和延迟。

**建议**: 强化 combat agent 的 system prompt，使用更强硬的工具调用指令，或在 combat 意图时直接在 prompt 中预置 tool_choice 约束。

---

## 5. 角色状态追踪

### 5.1 HP 变化追踪

| 时间点 | HP | 事件 |
|--------|----|------|
| Opening | 9/9 | 初始状态 |
| Turn 4 (战斗) | 8/9 | adjust_hp(-1)，被处长反击 |
| Turn 5 (战斗) | 7/9 | melee_attack 中的伤害（从后续 snapshot 推断） |
| Turn 12 (终态) | 7/9 | 战后未恢复 |

**评估**: ✅ HP 追踪正确，adjust_hp 工具正常工作。SAN 全程保持 60/60（未触发恐怖事件），Luck 30 全程未变。

### 5.2 场景追踪

```
(空) → 古城福音中学门口 → 古城福音中学 → 学生宿舍
```

共 3 次场景转换，每次都正确调用了 `transition_scene` 工具。

---

## 6. 错误与异常

### 6.1 Turn 13 — 429 Rate Limit

```json
{
  "source": "sendPlayerMessage",
  "message": "429 Rate limit exceeded: free-models-per-day"
}
```

这是外部 API 限流，非系统 bug。系统正确捕获并通过 traceBus 记录。

### 6.2 隐含问题：Opening 的 LLM 延迟

Opening 的第一次 LLM 调用耗时 **~73 秒**（从 kp_agent_loop_iteration 0 到 intent_classified）。这包含了 LangGraph 的 analyzeInput → routeByIntent → plan → generate 完整流水线。后续 Turn 的延迟在 30–60 秒范围内。

---

## 7. 综合问题优先级

### P0 — 必须修复

1. **kpMemory 存储完整回复导致 prompt 膨胀**: 改为存储结构化要点，每条 ≤ 50 字
2. **longTermSummary 更新频率过低**: 6 轮无更新。应增加定期触发频率（建议 5 轮一次）

### P1 — 应当改进

3. **chunkCount 统计 bug**: 全程为 0 但有实际内容返回，说明追踪指标不准确
4. **GraphRAG/UserGraph 未生效**: hasGraphSummary 和 hasUserGraph 始终为 false
5. **Combat Agent forceTools 频率**: 考虑加强 combat prompt 以减少验证重试

### P2 — 建议优化

6. **Scene-change 辅助 RAG 查询的 query 过长**: 使用精简场景名替代线索全文拼接
7. **Opening 默认路由到 generic 而非 narrative**: 开场白应直接走 narrative agent
8. **longTermSummary 过短**: 202–275 字的摘要在 12 轮中丢失了大量细节

---

## 8. 推荐改进方案

### 8.1 记忆架构重设计

```
当前:
  kpMemory (12条完整回复) + longTermSummary (单一摘要) + conversationWindow (18条)

建议:
  structuredFacts (key facts, ~20条, 每条≤50字)
  + longTermSummary (滚动摘要, 每5轮更新, 目标400-500字)
  + conversationWindow (保持18条不变)
  移除 kpMemory 或将其合并到 structuredFacts
```

### 8.2 Prompt 预算管理

建议引入 token 预算机制：
- 固定部分（base instructions + character context）: ~2,000 字
- RAG 上下文: 上限 6,000 字
- 记忆/摘要: 上限 2,000 字
- 对话窗口: 动态伸缩（预算剩余空间）
- 总预算: 硬上限 16,000 字（~5,500 tokens）

### 8.3 RAG 追踪修复

1. 修正 `chunkCount` 统计逻辑
2. 添加 `retrievalMethod` 字段（tfidf / vector / graph）到 trace 中
3. 添加 `topChunkScores` 字段以追踪检索质量

---

## 附录：Trace 时间线（简化）

```
T+0s     Opening: character_snapshot → rag_query → rag_received → prompt_built → agent_loop
T+73s    Opening: intent=narrative → generic → tool(transition_scene, grant_clue) → valid → continuation → valid
T+85s    Opening: memory_updated(1) → character_snapshot (end)

T+113s   Turn 1: "进入校园" → move → narrative → tool(transition_scene) → continuation → valid
T+163s   Turn 1: memory_updated(2)

T+285s   Turn 2: "询问失踪情况" → talk_npc → narrative → valid (无工具)
T+323s   Turn 2: memory_updated(3)

T+417s   Turn 3: "系鞋带观察" → explore → narrative → skill_check(侦查,失败) → continuation → valid
T+478s   Turn 3: memory_updated(4)

T+628s   Turn 4: "偷袭保安" → combat → melee_attack → MISSING skill_check → forceTools → valid → continuation chain
T+850s   Turn 4: memory_updated(5)

T+940s   Turn 5: "继续制服" → combat → melee_attack → MISSING → forceTools → valid
T+1113s  Turn 5: memory_updated(6)

T+1276s  Turn 6: "搜查处长" → investigate → skill_check(侦查,hard_success) → valid
T+1353s  Turn 6: memory_updated(7)

T+1411s  Turn 7: "翻阅记录本" → investigate → skill_check(侦查,failure) → valid
T+1457s  Turn 7: memory_updated(8)

T+1505s  Turn 8: "前往地下通道" → move → transition_scene(学生宿舍) → valid
T+1578s  Turn 8: memory_updated(9), longTermSummary updated (231字)

T+1641s  Turn 9: "搜索地下通道入口" → investigate → skill_check(侦查,success) → valid
T+1693s  Turn 9: memory_updated(10)

T+2146s  Turn 10: "前往106宿舍" → move → narrative → valid (无工具)
T+2230s  Turn 10: memory_updated(11)

T+2285s  Turn 11: "用钥匙开锁/机械维修" → use_item → resource → skill_check(机械维修,success) → valid
T+2432s  Turn 11: memory_updated(12), longTermSummary updated (275字)

T+2474s  Turn 12: "搜查房间" → rag_received → prompt_built → **429 RATE LIMIT** → trace_error
```

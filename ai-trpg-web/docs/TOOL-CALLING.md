# KP 工具调用 — 多层管理架构

工具执行采用「编排器 + 分域处理器」结构：同一份工具列表发给 LLM，执行时按工具名路由到对应 Handler，由 Orchestrator 汇总结果。

## 架构

- **Orchestrator**（`src/toolCalling/orchestrator.ts`）：入口 `processToolCalls(toolCalls, context)`。按 `tc.name` 查表得到 Handler，调用 `handler.handle(tc.name, args, context)`，收集 `content` 与 `displayMessages`，返回 `{ toolResults, displayMessages }`。
- **Context**（`src/toolCalling/types.ts`）：由 gameStore 的 `buildToolContext()` 提供，包含角色只读、骰子/解析、角色更新、场景/线索、生成 ID 等，Handlers 仅通过 context 访问外部状态。
- **Handlers**（`src/toolCalling/handlers/*.ts`）：每个 Handler 实现 `ToolHandler`（`toolNames` + `handle(name, args, context)`），无状态，不直接依赖 store。

## 工具分类

| 分类 | Handler | 工具 |
|------|---------|------|
| **Check** | checkHandler | skill_check, opposed_check, roll_dice |
| **Combat** | combatHandler | melee_attack, ranged_attack, adjust_hp, apply_major_wound |
| **Sanity** | sanityHandler | san_check, trigger_insanity, adjust_san, reset_day |
| **Resource** | resourceHandler | adjust_mp, spend_luck |
| **Narrative** | narrativeHandler | transition_scene, grant_clue |

**用户行动图谱（userGraphStore）**：`transition_scene`、`grant_clue` 会触发用户图谱事件（`addUserGraphEvent`）；`processToolCalls` 在 `skill_check`、`san_check`、`melee_attack`、`ranged_attack` 等工具执行时也会记录事件，供 RAG 上下文与长期记忆使用。

分类与列表也可通过 `COC_TOOL_CATEGORIES`（`src/toolCalling/orchestrator.ts`）以代码形式获取。

## 调用链

1. 前端 `runKpAgentLoop` 收到 KP 返回的 `toolCalls`。
2. 调用 `processToolCalls(toolCalls)`（gameStore）。
3. gameStore 内 `processToolCalls` 调用 `processToolCallsOrchestrator(toolCalls, buildToolContext())`。
4. Orchestrator 逐条路由到 Handler，合并结果后返回。
5. gameStore 将 `toolResults` 与 `displayMessages` 插入对话并继续循环或结束。

工具定义（`COC_KP_TOOLS`）仍在 `electron/ipc/aiHandlers.cjs`，LLM 仍收到完整工具列表；仅执行层按上述结构拆分。

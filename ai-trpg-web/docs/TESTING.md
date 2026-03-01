# AI KP COC 测试说明

本项目的功能测试计划基于《守秘人规则书 2002c》与《调查员手册 v1.21》的规则映射（见 [COC-KP-GAP-ANALYSIS.md](COC-KP-GAP-ANALYSIS.md)），验证已实现行为符合规则书对应章节。

## 测试分层与范围

| 层级 | 目录/文件 | 说明 |
|------|-----------|------|
| **单元测试** | `src/logic/__tests__/` | 规则公式（coc7Rules）、角色创建与衍生（coc7Character） |
| | `src/services/__tests__/diceService.spec.ts` | 骰子范围、cocResult 大成功/大失败 |
| | `src/toolCalling/handlers/__tests__/` | 各 handler：check、combat、sanity、resource、narrative |
| **集成测试** | `src/toolCalling/__tests__/orchestrator.spec.ts` | 多工具调用、未知工具错误 |
| | `src/services/__tests__/kpSessionService.spec.ts` | KP 流式调用与工具循环（mock Electron IPC） |
| **E2E** | 未实现 | 计划：选故事→职业→角色→进房→发消息，可后续用 Playwright 或 Electron E2E |

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

覆盖率（可选）：

```bash
npm run test:run -- --coverage
```

当前 coverage 包含：`src/logic/**/*.ts`、`src/toolCalling/**/*.ts`、`src/services/kpSessionService.ts`（见 `vitest.config.ts`）。

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

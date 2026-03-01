# AI TRPG APP — 综合代码审查报告

> 本审查基于代码库静态分析，未参考项目内现有文档。审查范围：用户功能、架构、代码结构、质量与测试等。  
> **最近更新**：根据后续修改做了二次审查并更新本文档，已反映路由守卫、kpSessionService 拆分、env.d.ts 补全等改动。

---

## 1. 用户功能识别

### 1.1 核心用户流程

| 步骤 | 功能 | 入口/路由 | 说明 |
|------|------|-----------|------|
| 1 | 首页 | `/` (HomeView) | 入口，可进入故事管理或开始游戏 |
| 2 | 故事管理 | `/scripts` (ScriptListView) | 故事列表、导入、删除、RAG 索引 |
| 3 | 选择职业 | `/occupation` (OccupationSelectView) | COC7 职业选择，决定职业技能分配 |
| 4 | 创建角色 | `/character-create` (CharacterCreateView) | 属性投掷、职业技能/兴趣技能分配、角色卡生成 |
| 5 | 游戏房间 | `/game` (GameRoomView) | 与 AI 守密人对话、开场白、发送行动、骰子/检定展示、线索面板、角色状态栏 |
| 6 | 设置 | `/settings` (SettingsView) | AI 提供商/模型/Base URL/API Key、模型列表刷新 |

### 1.2 功能特性摘要

- **规则引擎**：克苏鲁的呼唤第七版（COC 7th），含技能检定、对抗检定、SAN 检定、疯狂判定、近战/远程战斗、重伤与濒死、幸运消耗、场景与线索。
- **AI 守密人**：支持两种模式 — (1) 直接对话（无工具调用）；(2) KP Agent（LangGraph + 工具调用），工具由前端 orchestrator + 5 类 handler 执行。
- **RAG**：故事文本分块索引到 Electron 内置向量存储，游戏时按玩家输入检索「故事情报」注入系统提示。
- **多 AI 提供商**：OpenAI 兼容、Anthropic、Google（Gemini），含 OpenRouter/DeepSeek/vLLM/Ollama 等预设；API Key 仅在主进程使用，不暴露给渲染进程。
- **桌面端**：Electron，contextIsolation + preload 暴露有限 API，无 nodeIntegration。

---

## 2. 项目架构分析

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer (Vue 3 + Pinia + Vue Router)                           │
│  Views → Components → Stores → Services → ToolCalling(handlers)  │
└───────────────────────────┬───────────────────────────────────────┘
                            │ IPC (preload → contextBridge)
┌───────────────────────────▼───────────────────────────────────────┐
│  Electron Main                                                     │
│  IPC: settings | file | save | ai | kp | rag                       │
│  AI: aiHandlers (OpenAI/Anthropic/Google), kpAgentHandlers (LangGraph) │
│  RAG: vectorStore (embedding + index/query)                        │
└───────────────────────────────────────────────────────────────────┘
```

- **前端**：SPA，History 模式路由，布局组件 `AppLayout` 包裹子路由；状态集中在 Pinia（settings / game / story）。
- **后端能力**：全部通过 Electron 主进程 IPC 提供；无独立 HTTP 服务，RAG 与 AI 均在主进程或本地完成。

### 2.2 数据流与职责

- **gameStore**：会话/故事/阶段/角色卡/消息/线索/场景/KP 记忆、开场与玩家消息发送。对话与 KP 工具循环已下沉到 **kpSessionService**（`runKpAgentLoop` / `runDirectChat`），store 通过回调注入 `processToolCalls`、`onStreamChunk`、`insertMessagesBeforeLast`。store 仍负责：状态、提示与 RAG 组装、buildToolContext、骰子/检定等 COC 规则辅助函数。职责已收窄为「游戏状态 + 提示/上下文构建 + 工具执行入口（通过 context/callbacks）」。
- **kpSessionService**：单次 KP 调用（`kpInvokeOnce`）、Agent 工具循环（`runKpAgentLoop`）、直连对话（`runDirectChat`）；与 Electron KP/AI IPC 交互，工具执行由调用方通过 `KpAgentCallbacks.processToolCalls` 注入，与主进程/UI 解耦，便于单测与复用。
- **storyStore**：故事文件列表、导入/删除、RAG 索引（单故事/全部），依赖 `storyService` 分块与 `ragService` IPC。
- **settingsStore**：设置持久化（通过 IPC settings:get/set），供 gameStore 读取 AI 配置。

### 2.3 架构优点

- 前后端边界清晰：敏感操作与 API Key 留在主进程。
- 工具调用与规则逻辑集中在 `toolCalling/`，handler 接口统一，便于扩展。
- RAG 与故事管理解耦，RAG 通过 scriptId 与故事关联。
- **路由守卫**：`router.beforeEach` 对 `meta.requiresGame`（当前仅 `/game`）校验 `gamePhase === 'playing'` 且 `characterSheet` 存在，不满足则 `replace('/')`，避免未完成角色即进房或直接打开 /game 导致的异常。`RouteMeta` 在 `env.d.ts` 中扩展 `requiresGame?: boolean`，类型与实现一致。
- **ElectronAPI 类型**：`env.d.ts` 已补全 RAG（ragHealth/ragIndex/ragDelete/ragQuery/ragContext/ragListStories/ragStoryOverview）及 KP 返回值（toolCalls），并与 preload 暴露命名一致；RAG 入参使用 RAGIndexParams、RAGContextParams、RAGQueryParams、IndexedStory 等接口，类型安全与 IDE 提示完善。

### 2.4 架构风险与建议

- **类型与实现双写**：工具定义在 `aiHandlers.cjs` 的 `COC_KP_TOOLS` 与前端 `toolCalling/handlers` 需保持一致；若后续增删工具，易遗漏一端，建议从单一来源生成或增加构建时校验。
- **GameRoomView 内 onMounted 重定向**：路由守卫已保证进入 `/game` 时 phase 与 characterSheet 合法；当前 onMounted 中仍有一遍相同校验并 `router.replace('/')`。可视为防御性兜底（如 store 未水合、直接访问 /game），建议加简短注释说明「路由守卫已校验，此处为兜底」，或若确认无此类场景可移除以去重。

---

## 3. 代码结构分析

### 3.1 目录结构（src）

- **views/**：按页面划分，与路由一一对应，结构清晰。
- **components/**：`layout/`、`game/`（ChatMessage、PlayerStatsBar）、`ui/`（Toast），可考虑增加 `game/` 下更多子组件（如线索列表、场景标签）以减轻 GameRoomView 体积。
- **stores/**：三个 store；gameStore 仍为单文件大体积，但对话/KP 循环已迁出，职责更清晰。
- **services/**：ai（含 types）、**kpSessionService**（KP 单次调用与 Agent/直连对话循环）、ragService、storyService、diceService；aiService 与 kpSessionService 仅做 IPC/回调编排，符合「渲染进程不持密钥」与「对话逻辑可单测」的设计。
- **toolCalling/**：orchestrator 路由 + 5 个 handler，类型与上下文定义清晰，扩展新工具只需新 handler 并注册。
- **types/**：character、game、script，与业务强绑定；**env.d.ts** 已完整声明 ElectronAPI（含 RAG 入参类型、KP 返回 toolCalls）并扩展 vue-router 的 RouteMeta（requiresGame），与 preload 保持一致，后续仅需在新增 IPC 时同步补充。
- **logic/**：coc7Character 纯函数（职业/兴趣技能、属性、衍生数值），易于单测。
- **data/**：coc7 静态数据（技能表等），与 logic 分离合理。

### 3.2 依赖关系

- 渲染进程不依赖 Node 内置模块，仅依赖 `window.electronAPI`。
- 主进程：CommonJS（.cjs/.mjs 混用），aiHandlers 使用 OpenAI SDK，kpAgent 使用 LangGraph；RAG 为独立模块（如 vectorStore.mjs）。
- 循环依赖：未发现明显循环；gameStore 引用 toolCalling，toolCalling 引用 types/game，为单向依赖。

### 3.3 建议

- **Electron 入口**：package.json 的 `main` 为 `electron/main.cjs`，且未在 vite 中为 electron 做多入口打包，当前结构依赖「先 build 再 electron」；若需在 dev 下直接跑 electron，需确认路径与 wait-on 行为一致。

---

## 4. 代码质量与一致性

### 4.1 TypeScript 使用

- 前端：全面 TS，类型定义完整（character、game、script、toolCalling）；env.d 已完整声明 `Window.electronAPI` 及 RAG/KP 相关类型，ragService、kpSessionService 等可直接使用 `window.electronAPI` 获得类型提示。
- 主进程：aiHandlers、preload 等为 .cjs，无类型标注；若后续要增强可维护性，可考虑用 JSDoc 或迁部分为 .ts 并编译。

### 4.2 错误处理

- **gameStore**：`requestOpening` / `sendPlayerMessage` 中 try/catch 将错误写入最后一条 KP 消息的 content，用户可见；未做错误分类或重试，适合后续按错误类型（网络/模型/限流）做差异化提示或重试。
- **orchestrator**：单次 tool 的 `JSON.parse(tc.arguments)` 或 handler 抛错时，仅返回 `content: 'error'`，未带原因；建议在开发环境或日志中保留错误信息，便于排查模型传参错误。
- **ragService**：getApi() 为 null 时多处以 throw 或 return 空结果处理，调用方（如 gameStore）已做「无 RAG 时继续」的处理，行为合理。

### 4.3 安全

- API Key：仅在主进程使用，渲染进程通过 IPC 调用，未暴露；aiHandlers 中占位符 `***` 与设置中不回传的逻辑一致。
- 文件与脚本：通过 Electron 的 dialog 与 file  API 导入，未发现未校验路径导致的任意文件读；RAG 索引与删除均以 scriptId/path 为边界，需确保主进程 file/rag 接口不做路径穿越（未在本次审查中深入主进程文件实现）。
- 前端：未发现明显的 XSS 注入点；若 KP 或玩家消息将来支持富文本，需做转义或白名单。

### 4.4 命名与风格

- 中英文混用：提示语与 UI 多为中文，变量/函数名为英文，一致。
- 常量：BASE_INSTRUCTIONS、MAX_MEMORY_ENTRIES、COC_KP_TOOLS 等集中定义，可读性好。
- 长函数：gameStore 内 `requestOpening`、`sendPlayerMessage` 已通过 kpSessionService 委托对话与工具循环，主体为组装 prompt 与回调，可读性有所提升；若进一步拆可考虑将「构建 systemPrompt」抽成独立函数。

---

## 5. 测试与可测性

### 5.1 现状

- **测试文件**：未发现 `*.spec.*` 或 `*.test.*` 文件；package.json 无 test/lint 脚本。
- **ESLint/Prettier**：依赖已安装（eslint、eslint-config-prettier、eslint-plugin-vue、@typescript-eslint/*），未在审查中确认是否有 eslint 配置或 npm script 调用。

### 5.2 可测性

- **logic/coc7Character.ts**：纯函数，最适合先补单元测试（buildOccupationSkills、mergeSkills、rollAttributes、getDerivedSkillValues 等）。
- **toolCalling/handlers**：输入为 `(toolName, args, context)`，context 可 mock，适合单元测试；orchestrator 的 `processToolCalls` 可做集成式测试（给定 toolCalls 数组，断言 toolResults 与 displayMessages）。
- **diceService**：`rollD` 等若为纯随机，可考虑注入随机源便于断言。
- **gameStore**：因依赖 electronAPI、settingsStore、toolCalling，更适合集成测试或 E2E。
- **kpSessionService**：仅依赖 `window.electronAPI` 与回调接口，可通过 mock electronAPI 与 callbacks 单独测试 `runKpAgentLoop` / `runDirectChat` 的流程与工具迭代逻辑。

### 5.3 建议

- 增加 `npm run test`（如 Vitest），先覆盖 `logic/` 与 `toolCalling/`。
- 增加 `npm run lint` 并确保 CI 或提交前执行。
- 关键流程（如「选择故事 → 职业 → 创建角色 → 进入游戏 → 发送一条消息」）可考虑 E2E（Playwright 等），在 Electron 或纯浏览器 mock IPC 下运行。

---

## 6. 其他重要方面

### 6.1 可访问性与 i18n

- 未发现系统性的 a11y（aria、焦点管理、键盘导航）或 i18n 方案；若目标用户包含视障或多语言，建议预留结构和文案抽取。

### 6.2 性能

- 消息列表：当前为 `v-for` 全量渲染，若单局消息量极大，可考虑虚拟滚动。
- RAG 检索：每次玩家发送消息都会 `fetchRagContext`，topK=8；若故事块很多，主进程向量检索的实现（索引结构与批量查询）会影响延迟，可后续做 profiling。

### 6.3 文档与注释

- 关键模块（toolCalling、coc7Character、gameStore 内 BASE_INSTRUCTIONS）有注释或自解释命名；COC 规则相关（如疯狂判定、伤害加值）在 aiHandlers 的 tool description 中有说明，与 handler 行为一致有助于后续维护。

### 6.4 构建与交付

- `npm run build` 为 `vue-tsc -b && vite build`，产出在 `dist/`；`electron:build` 再交给 electron-builder。需确认 electron-builder 配置（如 asar、extraResources、目标平台）是否满足分发需求。

---

## 7. 总结表

| 维度 | 评分（主观） | 简要说明 |
|------|----------------|----------|
| 功能完整性 | 高 | 故事→职业→角色→游戏→设置闭环完整，COC 规则与工具链覆盖广 |
| 架构清晰度 | 高 | 前后端分离、KP 会话下沉至 kpSessionService、路由守卫与类型声明已补全 |
| 代码结构 | 高 | 目录与模块划分合理，env.d 与 RouteMeta 扩展完善，类型与数据流清晰 |
| 代码质量 | 中高 | TS 使用到位，错误处理可加强，安全设计合理 |
| 可维护性 | 中高 | 工具定义仍为双写；gameStore 职责已收窄，可维护性提升 |
| 测试 | 低 | 无自动化测试，logic / toolCalling / kpSessionService 可测性良好 |
| 文档/规范 | 中 | 关键处有注释，缺 lint/test 脚本 |

**本次已落实的改进**：  
- 路由守卫：`/game` 使用 `meta.requiresGame`，`beforeEach` 校验 phase 与 characterSheet，不合法则重定向至 `/`。  
- gameStore 拆分：新增 **kpSessionService**，负责 KP 单次调用、Agent 工具循环、直连对话；store 仅保留状态与回调注入，职责更清晰。  
- env.d.ts：补全 **ElectronAPI**（RAG 全量方法及入参类型、KP 返回 toolCalls），并扩展 **vue-router RouteMeta**（`requiresGame`），与 preload 一致。

**后续优先建议**：  
1）为 logic、toolCalling、kpSessionService 增加单元测试并加入 `npm run test`；  
2）增加 `npm run lint` 并确保提交前或 CI 执行；  
3）统一工具定义来源或增加构建时校验，避免 aiHandlers.cjs 与前端 handlers 不一致；  
4）GameRoomView 内 onMounted 重定向可加注释说明为「路由守卫之外的兜底」或评估后移除重复逻辑。

# Call of Cthulhu 游戏流程与 App 映射

参考 [Call of Cthulhu 规则 Wiki](https://cthulhuwiki.chaosium.com/rules/#concepts-of-the-game)

## 一、COC 游戏核心流程

| 阶段 | Wiki 描述 | App 实现 |
|------|----------|----------|
| 1. 选择剧本 | Keeper 选择或创作 scenario | 首页从 RAG 索引剧本列表中选择 |
| 2. 开场 | Keeper 设舞台、描述场景 | AI KP 根据首场景做开场白 |
| 3. 调查与线索 | 调查员收集线索，每个线索带来新探索 | RAG 检索 + 当前场景，cluesObtained 追踪 |
| 4. 检定 | 骰子决定行动成败 | diceService COC d100，成功/失败/大成功/大失败 |
| 5. 场景转换 | 根据检定或剧情推进 | currentSceneId，successSceneId/failSceneId |
| 6. NPC 交互 | Keeper 扮演 NPC | AI 根据剧本 NPC 设定扮演 |
| 7. 终局 | 调查真相、最终对抗 | AI 根据剧情推进判断结局 |

## 二、数据流

```
剧本选择 (HomeView)
    → startGame(scriptPath)
    → 加载剧本、设置首场景
    → requestOpening() → AI 开场白
    ↓
对话循环 (GameRoomView)
    玩家输入 → RAG(scriptId, sceneId, query)
    → system prompt = 剧本情报 + 当前场景 + 已获线索
    → AI 回复
    → (可选) 触发检定 → rollD100 → 更新场景
    ↓
终局
    AI 判断或玩家选择结束
```

## 三、实现要点

1. **开场**：进入游戏后 AI 根据首场景做开场描述
2. **场景约束**：RAG 检索优先当前 sceneId，system prompt 包含当前场景
3. **线索追踪**：cluesObtained 存入 gameStore，供 system prompt 使用
4. **检定**：AI 或玩家触发技能检定时，调用 diceService，根据结果更新 currentSceneId
5. **剧本元数据**：gameStore 保存 script 引用，用于场景列表、检定 DC 等

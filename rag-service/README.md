# AI TRPG RAG Service

检索增强生成服务，用于剧本索引与检索。

## 安装

```bash
cd rag-service
pip install -r requirements.txt
```

## 运行

```bash
# 默认端口 8001
uvicorn main:app --host 0.0.0.0 --port 8001

# 或
python main.py
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查 |
| POST | /index | 提交剧本 chunks，建立索引 |
| DELETE | /index/{scriptId} | 删除某剧本索引 |
| POST | /query | 检索相关 chunks |
| POST | /context | 获取格式化的 LLM 上下文 |

### POST /index

```json
{
  "scriptId": "script_xxx",
  "chunks": [
    {
      "id": "scene-script_xxx-scene_001",
      "content": "场景: 酒吧\n昏暗的酒吧...",
      "type": "scene",
      "metadata": { "scriptId": "script_xxx", "sceneId": "scene_001" }
    }
  ]
}
```

### POST /query

```json
{
  "query": "酒吧里有什么人",
  "scriptId": "script_xxx",
  "sceneId": "scene_001",
  "topK": 5
}
```

## 环境变量

- `CHROMA_PERSIST_DIR`: ChromaDB 持久化路径，默认 `./chroma_data`
- `EMBEDDING_MODEL`: Embedding 模型，默认 `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- `EMBEDDING_MODEL_LOCAL_DIR`: 模型本地保存/加载目录，默认 `./models/embedding`。首次启动会从 HuggingFace 下载并写入该目录，之后从本地加载，加快启动且可离线使用。

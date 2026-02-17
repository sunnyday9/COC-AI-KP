"""RAG Service - FastAPI entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from indexer import index_chunks, delete_script_index
from retriever import query
from prompt_builder import build_context


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load embedding model on startup."""
    from embedding import get_embedding_model
    from config import EMBEDDING_MODEL
    get_embedding_model()
    yield


app = FastAPI(title="AI TRPG RAG Service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response models ---

class ChunkInput(BaseModel):
    id: str
    content: str
    type: str = "scene"
    metadata: dict | None = None


class IndexRequest(BaseModel):
    scriptId: str
    chunks: list[ChunkInput]


class QueryRequest(BaseModel):
    query: str
    scriptId: str | None = None
    sceneId: str | None = None
    type: str | None = None
    topK: int = 5


# --- Endpoints ---

@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok", "service": "rag"}


@app.post("/index")
async def index(request: IndexRequest):
    """Index script chunks for RAG."""
    try:
        chunk_dicts = [c.model_dump() for c in request.chunks]
        for c in chunk_dicts:
            if c.get("metadata") and "scriptId" not in c["metadata"]:
                c["metadata"] = {**c["metadata"], "scriptId": request.scriptId}
        count = index_chunks(request.scriptId, chunk_dicts)
        return {"ok": True, "indexed": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/index/{script_id}")
async def delete_index(script_id: str):
    """Delete index for a script."""
    try:
        count = delete_script_index(script_id)
        return {"ok": True, "deleted": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def query_endpoint(request: QueryRequest):
    """Retrieve relevant chunks for a query."""
    try:
        chunks = query(
            query_text=request.query,
            script_id=request.scriptId,
            scene_id=request.sceneId,
            type_filter=request.type,
            top_k=request.topK,
        )
        return {"chunks": chunks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/context")
async def context_endpoint(request: QueryRequest):
    """Get formatted context string for LLM prompt."""
    try:
        ctx = build_context(
            user_query=request.query,
            script_id=request.scriptId,
            scene_id=request.sceneId,
            top_k=request.topK,
        )
        return {"context": ctx}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

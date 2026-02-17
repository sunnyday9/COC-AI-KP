"""Index script chunks into ChromaDB."""

import chromadb
from chromadb.config import Settings as ChromaSettings

from config import CHROMA_PERSIST_DIR, COLLECTION_NAME
from embedding import embed


def get_client():
    """Get or create ChromaDB client with persistence."""
    return chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)


def index_chunks(script_id: str, chunks: list[dict]) -> int:
    """
    Index script chunks into ChromaDB.
    chunks: list of { id, content, type, metadata }
    Returns count of indexed chunks.
    """
    if not chunks:
        return 0

    client = get_client()
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"description": "TRPG script chunks for RAG"},
    )

    ids = [c["id"] for c in chunks]
    documents = [c["content"] for c in chunks]
    metadatas = []
    for c in chunks:
        m = {"type": str(c.get("type", "scene")), "script_id": str(script_id)}
        if c.get("metadata"):
            for k, v in (c["metadata"] or {}).items():
                if v is not None:
                    key = k.replace("scriptId", "script_id").replace("sceneId", "scene_id").replace("npcId", "npc_id").replace("clueId", "clue_id").replace("checkId", "check_id")
                    m[key] = str(v)
        metadatas.append(m)

    vectors = embed(documents)
    collection.add(ids=ids, documents=documents, metadatas=metadatas, embeddings=vectors)
    return len(chunks)


def delete_script_index(script_id: str) -> int:
    """
    Delete all chunks for a script from the index.
    Returns count of deleted chunks.
    """
    client = get_client()
    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        return 0

    results = collection.get(where={"script_id": script_id}, include=[])
    ids = results.get("ids", [])
    if ids:
        collection.delete(ids=ids)
    return len(ids)

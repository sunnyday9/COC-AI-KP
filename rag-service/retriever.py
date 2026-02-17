"""Retrieve relevant chunks from ChromaDB."""

from config import COLLECTION_NAME, DEFAULT_TOP_K
from embedding import embed
from indexer import get_client


def query(
    query_text: str,
    script_id: str | None = None,
    scene_id: str | None = None,
    type_filter: str | None = None,
    top_k: int = DEFAULT_TOP_K,
) -> list[dict]:
    """
    Retrieve relevant chunks for a query.
    Returns list of { content, metadata, distance }.
    """
    client = get_client()
    try:
        collection = client.get_collection(COLLECTION_NAME)
    except Exception:
        return []

    where = {}
    if script_id:
        where["script_id"] = script_id
    if scene_id:
        where["scene_id"] = scene_id
    if type_filter:
        where["type"] = type_filter

    query_vector = embed([query_text])[0]
    n_results = min(top_k, collection.count() or 1)

    if where:
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n_results,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    else:
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )

    out = []
    docs = results.get("documents", [[]])[0] or []
    metas = results.get("metadatas", [[]])[0] or []
    dists = results.get("distances", [[]])[0] or []
    for i, doc in enumerate(docs):
        out.append({
            "content": doc,
            "metadata": metas[i] if i < len(metas) else {},
            "distance": float(dists[i]) if i < len(dists) else 0,
        })
    return out

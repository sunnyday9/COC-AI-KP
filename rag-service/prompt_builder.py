"""Build prompts from retrieved chunks for KP/DM context."""

from retriever import query


def build_context(
    user_query: str,
    script_id: str | None = None,
    scene_id: str | None = None,
    top_k: int = 5,
) -> str:
    """
    Retrieve relevant chunks and format as context for the LLM system prompt.
    """
    chunks = query(
        query_text=user_query,
        script_id=script_id,
        scene_id=scene_id,
        top_k=top_k,
    )
    if not chunks:
        return ""

    parts = ["## 剧本相关情报\n"]
    for i, c in enumerate(chunks, 1):
        content = c.get("content", "").strip()
        if content:
            meta = c.get("metadata", {})
            chunk_type = meta.get("type", "unknown")
            parts.append(f"### [{i}] {chunk_type}\n{content}\n")
    return "\n".join(parts)

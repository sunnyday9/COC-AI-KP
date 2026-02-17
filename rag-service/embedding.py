"""Embedding service using sentence-transformers. Downloads model to local dir for reuse."""

import os
from typing import Optional

from sentence_transformers import SentenceTransformer

from config import EMBEDDING_MODEL, EMBEDDING_MODEL_LOCAL_DIR

_model: Optional[SentenceTransformer] = None


def _local_model_path() -> str:
    """Path where this model is saved/loaded (one subdir per model name)."""
    safe_name = EMBEDDING_MODEL.replace("/", "-").strip()
    return os.path.join(EMBEDDING_MODEL_LOCAL_DIR, safe_name)


def _is_saved_model(path: str) -> bool:
    """Check if path looks like a saved SentenceTransformer (has config.json)."""
    return os.path.isfile(os.path.join(path, "config.json"))


def get_embedding_model() -> SentenceTransformer:
    """Lazy-load the embedding model. Uses local copy if present, else downloads and saves locally."""
    global _model
    if _model is not None:
        return _model

    local_path = _local_model_path()
    if _is_saved_model(local_path):
        _model = SentenceTransformer(local_path)
        return _model

    os.makedirs(EMBEDDING_MODEL_LOCAL_DIR, exist_ok=True)
    _model = SentenceTransformer(EMBEDDING_MODEL)
    _model.save(local_path)
    return _model


def embed(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts into vectors."""
    model = get_embedding_model()
    return model.encode(texts, convert_to_numpy=True).tolist()

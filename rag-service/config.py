"""RAG service configuration."""

import os

# ChromaDB persistence path
CHROMA_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "./chroma_data")

# Embedding model - use multilingual for Chinese TRPG content
# Alternatives: BAAI/bge-small-zh-v1.5, sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_MODEL = os.environ.get(
    "EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)

# Local directory to save/load the embedding model (avoids re-download, faster startup)
EMBEDDING_MODEL_LOCAL_DIR = os.environ.get(
    "EMBEDDING_MODEL_LOCAL_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "embedding"),
)

# Default collection name
COLLECTION_NAME = "trpg_script_chunks"

# Default top-K for retrieval
DEFAULT_TOP_K = 5

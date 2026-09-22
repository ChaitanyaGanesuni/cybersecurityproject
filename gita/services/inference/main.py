"""
Gita inference service (FastAPI).

Purpose (spec §6, §7, §9): host the ML-native workloads that don't belong on the Node API —
multilingual EMBEDDINGS for RAG and open-model TTS (Indic-Parler-TTS / Kokoro / Sanskrit
recitation). The Node API calls this service; only the API is exposed to the app.

Design: every model is optional. If the heavy model isn't installed/available, the endpoint
degrades to a documented, deterministic fallback (embeddings) or a clear 501 (TTS) rather than
crashing — so the service always boots and the contract is testable.
"""
from __future__ import annotations

import hashlib
import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Gita Inference", version="0.0.0")

EMBED_DIM = 384


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------
class _Embedder:
    """Loads a real sentence-transformers model if available, else a deterministic fallback."""

    def __init__(self) -> None:
        self.model = None
        self.name = "deterministic-fallback"
        model_id = os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small")
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore

            self.model = SentenceTransformer(model_id)
            self.name = model_id
        except Exception:
            # No model available (offline/dev). Fall back to a stable hash embedding so the
            # RAG pipeline still runs and is testable; swap in the real model in production.
            self.model = None

    def embed(self, texts: List[str]) -> List[List[float]]:
        if self.model is not None:
            return [list(map(float, v)) for v in self.model.encode(texts, normalize_embeddings=True)]
        return [self._fallback(t) for t in texts]

    @staticmethod
    def _fallback(text: str) -> List[float]:
        vec = [0.0] * EMBED_DIM
        for i, ch in enumerate(text):
            vec[i % EMBED_DIM] += (ord(ch) % 31) - 15
        norm = sum(x * x for x in vec) ** 0.5 or 1.0
        return [x / norm for x in vec]


embedder = _Embedder()


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    model: str
    dim: int
    embeddings: List[List[float]]


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "embedder": embedder.name,
        "tts": _tts_status(),
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts must be non-empty")
    vectors = embedder.embed(req.texts)
    return EmbedResponse(model=embedder.name, dim=len(vectors[0]) if vectors else EMBED_DIM, embeddings=vectors)


# ---------------------------------------------------------------------------
# TTS (contract; open-model adapters wired when a GPU/model is available)
# ---------------------------------------------------------------------------
def _tts_status() -> str:
    return os.environ.get("TTS_PROVIDER", "unavailable")


class TtsRequest(BaseModel):
    text: str
    lang: str
    voice: Optional[str] = None
    speed: float = 1.0
    kind: str = "narration"  # or "recitation"


@app.post("/tts")
def tts(req: TtsRequest) -> dict:
    """
    Contract for open-model TTS. Recommended commercial-safe providers (verified Sept 2026):
      - English narration : Kokoro-82M (Apache-2.0)
      - Telugu / Sanskrit : AI4Bharat Indic-Parler-TTS (Apache-2.0)
    These require model weights + (ideally) a GPU, so this endpoint returns 501 until a provider
    is wired via TTS_PROVIDER. Audio is generated once and cached by the app's audioHash.
    """
    provider = _tts_status()
    if provider == "unavailable":
        raise HTTPException(
            status_code=501,
            detail={
                "error": "no TTS provider configured",
                "hint": "set TTS_PROVIDER and install the model (Kokoro / Indic-Parler-TTS)",
                "requested": {"lang": req.lang, "kind": req.kind},
            },
        )
    # A real provider adapter would synthesize here and return an audio URI + metadata.
    raise HTTPException(status_code=501, detail=f"TTS provider '{provider}' adapter not implemented in this build")


# capability matrix for the app/API to introspect (spec §7)
@app.get("/tts/providers")
def tts_providers() -> dict:
    return {
        "providers": [
            {"id": "kokoro-82m", "langs": ["en"], "sanskrit": False, "license": "Apache-2.0", "local": True},
            {"id": "indic-parler-tts", "langs": ["te", "sa", "hi", "en"], "sanskrit": True, "license": "Apache-2.0", "local": False},
        ]
    }

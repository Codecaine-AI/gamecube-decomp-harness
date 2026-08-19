# Vendored from https://github.com/MarkMcCaskey/decomp-search at commit 586800f.
# License: MIT OR Apache-2.0.
# Local modifications: kept only hashed embeddings; added sparse and query helpers.
"""Deterministic feature-hashed embeddings for normalized instruction text."""

from __future__ import annotations

import hashlib
import math
from typing import Callable


HASHED_DIM = 512
Progress = Callable[[int, int], None]


def _noop(done: int, total: int) -> None:
    del done, total


def _hash_idx(feature: str, dim: int) -> tuple[int, float]:
    digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
    index = int.from_bytes(digest[:4], "little") % dim
    sign = 1.0 if digest[4] & 1 else -1.0
    return index, sign


def _feature_counts(doc: str) -> dict[str, int]:
    lines = doc.splitlines()
    tokens = lines[-1].split() if lines else []
    counts: dict[str, int] = {}
    for size in (1, 2, 3):
        for start in range(len(tokens) - size + 1):
            gram = " ".join(tokens[start : start + size])
            counts[gram] = counts.get(gram, 0) + 1
    return counts


def embed_hashed(
    token_docs: list[str],
    progress: Progress = _noop,
    dim: int = HASHED_DIM,
) -> list[list[float]]:
    """Feature-hash 1/2/3-grams with sublinear TF and L2 normalization."""
    output: list[list[float]] = []
    for index, doc in enumerate(token_docs):
        vector = [0.0] * dim
        for gram, count in _feature_counts(doc).items():
            bucket, sign = _hash_idx(gram, dim)
            vector[bucket] += sign * (1.0 + math.log(count))
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        output.append([value / norm for value in vector])
        progress(index + 1, len(token_docs))
    if not token_docs:
        progress(0, 0)
    return output


def embed_hashed_sparse(doc: str, dim: int = HASHED_DIM) -> list[tuple[int, float]]:
    """Return the hashed vector as sorted nonzero ``(index, value)`` pairs."""
    buckets: dict[int, float] = {}
    for gram, count in _feature_counts(doc).items():
        index, sign = _hash_idx(gram, dim)
        buckets[index] = buckets.get(index, 0.0) + sign * (1.0 + math.log(count))
    norm = math.sqrt(sum(value * value for value in buckets.values())) or 1.0
    return sorted(
        (index, value / norm)
        for index, value in buckets.items()
        if value != 0.0
    )


def embed_query(text: str) -> list[float]:
    """Embed one query with the vendored hashed backend."""
    return embed_hashed([text])[0]

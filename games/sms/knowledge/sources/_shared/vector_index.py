#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shlex
import sqlite3
import struct
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from source_index import clip, load_index_rows, load_source_descriptor, source_indexes_root, source_root_from_api_file


DEFAULT_PROVIDER = "openai"
DEFAULT_MODEL = "text-embedding-3-small"
DEFAULT_TARGET_TOKENS = 700
DEFAULT_OVERLAP_TOKENS = 100
DEFAULT_BATCH_SIZE = 64
DEFAULT_VECTOR_WEIGHT = 0.85
DEFAULT_LEXICAL_WEIGHT = 0.15


def vector_db_path(source_root: Path) -> Path:
    return source_indexes_root(source_root) / "vector.sqlite"


def vector_manifest_path(source_root: Path) -> Path:
    return source_indexes_root(source_root) / "vector_manifest.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def source_fingerprint(rows: list[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        digest.update(json_dumps(row).encode("utf-8", errors="replace"))
        digest.update(b"\n")
    return digest.hexdigest()


def load_local_env() -> None:
    candidates: list[Path] = []
    for start in (Path.cwd(), Path(__file__).resolve()):
        for parent in [start, *start.parents]:
            candidates.append(parent / "local.env")
    for path in candidates:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            if not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key) or key in os.environ:
                continue
            try:
                parsed = shlex.split(value, posix=True)
                os.environ[key] = parsed[0] if parsed else ""
            except ValueError:
                os.environ[key] = value.strip().strip('"').strip("'")
        return


def token_ids(text: str) -> list[int]:
    try:
        import tiktoken

        return tiktoken.get_encoding("cl100k_base").encode(text)
    except Exception:
        # Fallback is deliberately simple; it preserves deterministic chunking
        # when tiktoken is unavailable, at the cost of less precise token counts.
        return [hash(part) & 0xFFFF for part in re.findall(r"\S+", text)]


def decode_tokens(ids: list[int], original_text: str, fallback_words: list[str] | None = None) -> str:
    try:
        import tiktoken

        return tiktoken.get_encoding("cl100k_base").decode(ids)
    except Exception:
        words = fallback_words if fallback_words is not None else re.findall(r"\S+", original_text)
        return " ".join(words[: len(ids)])


def chunk_text(text: str, *, target_tokens: int, overlap_tokens: int) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    ids = token_ids(normalized)
    if len(ids) <= target_tokens:
        return [normalized]
    overlap = max(0, min(overlap_tokens, target_tokens // 2))
    step = max(1, target_tokens - overlap)
    fallback_words = re.findall(r"\S+", normalized)
    chunks: list[str] = []
    for start in range(0, len(ids), step):
        part_ids = ids[start : start + target_tokens]
        if not part_ids:
            break
        chunk = re.sub(r"\s+", " ", decode_tokens(part_ids, normalized, fallback_words[start : start + target_tokens])).strip()
        if chunk:
            chunks.append(chunk)
        if start + target_tokens >= len(ids):
            break
    return chunks


def text_for_row(row: dict[str, Any]) -> str:
    parts = [
        str(row.get("title") or ""),
        str(row.get("text") or row.get("summary") or ""),
    ]
    payload = row.get("payload")
    if isinstance(payload, dict):
        for key in ("path", "document_id", "page", "heading", "title"):
            value = payload.get(key)
            if value:
                parts.append(str(value))
    return re.sub(r"\s+", " ", "\n".join(part for part in parts if part)).strip()


def vector_chunks(
    rows: list[dict[str, Any]],
    *,
    target_tokens: int = DEFAULT_TARGET_TOKENS,
    overlap_tokens: int = DEFAULT_OVERLAP_TOKENS,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for row in rows:
        row_id = str(row.get("id") or row.get("title") or row.get("index_line") or len(chunks))
        row_text = text_for_row(row)
        for index, chunk in enumerate(chunk_text(row_text, target_tokens=target_tokens, overlap_tokens=overlap_tokens), start=1):
            chunk_id = row_id if index == 1 else f"{row_id}:vchunk:{index}"
            payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
            chunks.append(
                {
                    "id": chunk_id,
                    "source_row_id": row_id,
                    "source_id": row.get("source_id") or payload.get("source_id"),
                    "title": row.get("title") or row_id,
                    "text": chunk,
                    "evidence_ref": row.get("evidence_ref") or row.get("index_path"),
                    "payload": {
                        **payload,
                        "vector_chunk": index,
                        "source_row_id": row_id,
                    },
                    "content_hash": sha256_text(chunk),
                }
            )
    return chunks


def normalize_vector(vector: Iterable[float]) -> list[float]:
    values = [float(value) for value in vector]
    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0:
        return values
    return [value / norm for value in values]


def pack_vector(vector: list[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *vector)


def unpack_vector(blob: bytes, dimensions: int) -> tuple[float, ...]:
    return struct.unpack(f"<{dimensions}f", blob)


def dot(left: Iterable[float], right: Iterable[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


class OpenAIEmbeddingProvider:
    def __init__(self, *, model: str, dimensions: int | None):
        load_local_env()
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "OPENAI_API_KEY is not set. Set it in the environment or local.env before building/searching OpenAI embeddings."
            )
        try:
            from openai import OpenAI
        except Exception as exc:
            raise RuntimeError("The Python openai package is required for OpenAI embeddings.") from exc
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.dimensions = dimensions

    def embed(self, texts: list[str]) -> list[list[float]]:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "input": texts,
            "encoding_format": "float",
        }
        if self.dimensions:
            kwargs["dimensions"] = self.dimensions
        response = self.client.embeddings.create(**kwargs)
        return [normalize_vector(item.embedding) for item in response.data]


class HashEmbeddingProvider:
    """Deterministic non-semantic provider for smoke tests only."""

    def __init__(self, *, dimensions: int = 256):
        self.dimensions = dimensions
        self.model = "hash-smoke"

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [normalize_vector(self._embed_one(text)) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self.dimensions
        terms = re.findall(r"[A-Za-z0-9_./:-]+", text.lower())
        for term in terms:
            digest = hashlib.blake2b(term.encode("utf-8"), digest_size=16).digest()
            index = int.from_bytes(digest[:4], "little") % self.dimensions
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[index] += sign
        return vector


def embedding_provider(provider: str, *, model: str, dimensions: int | None):
    provider = provider.lower()
    if provider == "openai":
        return OpenAIEmbeddingProvider(model=model, dimensions=dimensions)
    if provider == "hash":
        return HashEmbeddingProvider(dimensions=dimensions or 256)
    raise RuntimeError(f"Unsupported embedding provider: {provider}")


def open_vector_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vector_chunks (
          id TEXT PRIMARY KEY,
          source_row_id TEXT NOT NULL,
          title TEXT NOT NULL,
          text TEXT NOT NULL,
          evidence_ref TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          embedding BLOB NOT NULL
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS vector_chunks_source_row_idx ON vector_chunks(source_row_id)")
    return conn


def write_manifest(source_root: Path, manifest: dict[str, Any]) -> None:
    vector_manifest_path(source_root).write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_manifest(source_root: Path) -> dict[str, Any] | None:
    path = vector_manifest_path(source_root)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def build_vector_index(
    source_root: Path,
    *,
    provider_name: str = DEFAULT_PROVIDER,
    model: str = DEFAULT_MODEL,
    dimensions: int | None = None,
    target_tokens: int = DEFAULT_TARGET_TOKENS,
    overlap_tokens: int = DEFAULT_OVERLAP_TOKENS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    dry_run: bool = False,
) -> dict[str, Any]:
    rows = load_index_rows(source_root)
    chunks = vector_chunks(rows, target_tokens=target_tokens, overlap_tokens=overlap_tokens)
    fingerprint = source_fingerprint(rows)
    descriptor = load_source_descriptor(source_root)
    if dry_run:
        return {
            "source": descriptor.get("id", source_root.name),
            "status": "dry_run",
            "index_records": len(rows),
            "vector_chunks": len(chunks),
            "target_tokens": target_tokens,
            "overlap_tokens": overlap_tokens,
            "source_fingerprint": fingerprint,
        }
    if not chunks:
        raise RuntimeError("No source chunks are available to embed. Run kg:rebuild or check the source JSONL indexes first.")

    provider = embedding_provider(provider_name, model=model, dimensions=dimensions)
    db_path = vector_db_path(source_root)
    conn = open_vector_db(db_path)
    inserted = 0
    started = time.time()
    try:
        conn.execute("DELETE FROM vector_chunks")
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            embeddings = provider.embed([chunk["text"] for chunk in batch])
            for chunk, embedding in zip(batch, embeddings):
                if dimensions is None:
                    dimensions = len(embedding)
                conn.execute(
                    """
                    INSERT OR REPLACE INTO vector_chunks
                      (id, source_row_id, title, text, evidence_ref, payload_json, content_hash, embedding)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk["id"],
                        chunk["source_row_id"],
                        str(chunk["title"]),
                        chunk["text"],
                        str(chunk["evidence_ref"] or ""),
                        json_dumps(chunk["payload"]),
                        chunk["content_hash"],
                        pack_vector(embedding),
                    ),
                )
                inserted += 1
            conn.commit()
    finally:
        conn.close()

    manifest = {
        "schema_version": "vector_index_v1",
        "source": descriptor.get("id", source_root.name),
        "provider": provider_name,
        "model": model if provider_name == "openai" else getattr(provider, "model", model),
        "dimensions": dimensions,
        "metric": "cosine",
        "normalization": "l2",
        "chunking": {
            "tokenizer": "cl100k_base",
            "target_tokens": target_tokens,
            "overlap_tokens": overlap_tokens,
        },
        "index_records": len(rows),
        "vector_chunks": inserted,
        "source_fingerprint": fingerprint,
        "built_at": utc_now(),
        "build_seconds": round(time.time() - started, 3),
    }
    write_manifest(source_root, manifest)
    return {
        "source": manifest["source"],
        "status": "ready",
        "vector_db": str(db_path),
        "manifest": str(vector_manifest_path(source_root)),
        **manifest,
    }


def lexical_score(query: str, title: str, text: str) -> float:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9_./:-]+", query) if len(term) >= 2]
    if not terms:
        return 0.0
    hay_title = title.lower()
    hay_text = text.lower()
    score = 0.0
    phrase = query.lower().strip()
    if phrase and phrase in hay_title:
        score += 4.0
    if phrase and phrase in hay_text:
        score += 2.0
    for term in terms:
        if term in hay_title:
            score += 1.0
        if term in hay_text:
            score += 0.5
    return min(score / max(1.0, len(terms) * 1.5), 1.0)


def semantic_search(
    source_root: Path,
    *,
    query: str,
    limit: int,
    vector_weight: float = DEFAULT_VECTOR_WEIGHT,
    lexical_weight: float = DEFAULT_LEXICAL_WEIGHT,
) -> dict[str, Any]:
    manifest = read_manifest(source_root)
    descriptor = load_source_descriptor(source_root)
    db_path = vector_db_path(source_root)
    if not manifest or not db_path.exists():
        return {
            "source": descriptor.get("id", source_root.name),
            "query": query,
            "limit": limit,
            "available": False,
            "results": [],
            "vector_db": str(db_path),
            "manifest": str(vector_manifest_path(source_root)),
            "message": "No vector index was found. Run the source vectorize command first.",
        }
    dimensions = int(manifest.get("dimensions") or 0)
    if dimensions <= 0:
        raise RuntimeError("Vector manifest does not declare dimensions.")
    provider_name = str(manifest.get("provider") or DEFAULT_PROVIDER)
    model = str(manifest.get("model") or DEFAULT_MODEL)
    provider = embedding_provider(provider_name, model=model, dimensions=dimensions if provider_name == "openai" else dimensions)
    query_vector = provider.embed([query])[0]
    conn = sqlite3.connect(db_path)
    rows = conn.execute(
        "SELECT id, source_row_id, title, text, evidence_ref, payload_json, content_hash, embedding FROM vector_chunks"
    ).fetchall()
    conn.close()

    scored: list[dict[str, Any]] = []
    for row in rows:
        embedding = unpack_vector(row[7], dimensions)
        vector = dot(query_vector, embedding)
        lexical = lexical_score(query, row[2], row[3])
        combined = vector_weight * vector + lexical_weight * lexical
        try:
            payload = json.loads(row[5])
        except Exception:
            payload = {}
        scored.append(
            {
                "id": row[0],
                "source_row_id": row[1],
                "title": row[2],
                "score": round(combined, 6),
                "vector_score": round(vector, 6),
                "lexical_score": round(lexical, 6),
                "snippet": clip(row[3], 520),
                "evidence_ref": row[4],
                "payload": payload,
            }
        )
    scored.sort(key=lambda item: (-float(item["score"]), item["title"]))
    return {
        "source": descriptor.get("id", source_root.name),
        "query": query,
        "limit": limit,
        "available": True,
        "provider": provider_name,
        "model": model,
        "dimensions": dimensions,
        "metric": manifest.get("metric", "cosine"),
        "vector_weight": vector_weight,
        "lexical_weight": lexical_weight,
        "results": scored[:limit],
        "vector_db": str(db_path),
        "manifest": str(vector_manifest_path(source_root)),
        "message": "Vector index is ready for semantic lookup.",
    }


def vector_status_payload(source_root: Path) -> dict[str, Any]:
    db_path = vector_db_path(source_root)
    manifest_path = vector_manifest_path(source_root)
    manifest = read_manifest(source_root)
    row_count = 0
    if db_path.exists():
        try:
            conn = sqlite3.connect(db_path)
            row_count = int(conn.execute("SELECT COUNT(*) FROM vector_chunks").fetchone()[0])
            conn.close()
        except Exception:
            row_count = 0
    ready = bool(manifest and row_count)
    return {
        "available": ready,
        "status": "ready" if ready else "missing",
        "vector_db": str(db_path),
        "manifest": str(manifest_path),
        "vector_chunks": row_count,
        "provider": manifest.get("provider") if manifest else None,
        "model": manifest.get("model") if manifest else None,
        "dimensions": manifest.get("dimensions") if manifest else None,
        "built_at": manifest.get("built_at") if manifest else None,
        "message": "Vector index is ready for semantic lookup." if ready else "No vector index was found.",
    }


def print_payload(payload: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2))
        return
    if "results" in payload:
        for result in payload["results"]:
            print(f"{result.get('score', 0):>8} {result.get('title')}")
            print(f"    vector={result.get('vector_score')} lexical={result.get('lexical_score')}")
            print(f"    {result.get('evidence_ref')}")
            print(f"    {result.get('snippet')}")
        return
    print(json.dumps(payload, indent=2))


def run_vectorize(api_or_command_file: str, argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", default=os.environ.get("RAG_EMBEDDING_PROVIDER", DEFAULT_PROVIDER))
    parser.add_argument("--model", default=os.environ.get("OPENAI_EMBEDDING_MODEL", DEFAULT_MODEL))
    parser.add_argument("--dimensions", type=int, default=int(os.environ["OPENAI_EMBEDDING_DIMENSIONS"]) if os.environ.get("OPENAI_EMBEDDING_DIMENSIONS") else None)
    parser.add_argument("--target-tokens", type=int, default=DEFAULT_TARGET_TOKENS)
    parser.add_argument("--overlap-tokens", type=int, default=DEFAULT_OVERLAP_TOKENS)
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        payload = build_vector_index(
            source_root_from_api_file(api_or_command_file),
            provider_name=args.provider,
            model=args.model,
            dimensions=args.dimensions,
            target_tokens=args.target_tokens,
            overlap_tokens=args.overlap_tokens,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )
    except Exception as exc:
        payload = {"status": "error", "available": False, "message": str(exc)}
        print_payload(payload, args.json)
        raise SystemExit(1)
    print_payload(payload, args.json)


def run_semantic_search(api_file: str, argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--vector-weight", type=float, default=DEFAULT_VECTOR_WEIGHT)
    parser.add_argument("--lexical-weight", type=float, default=DEFAULT_LEXICAL_WEIGHT)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        payload = semantic_search(
            source_root_from_api_file(api_file),
            query=args.query,
            limit=args.limit,
            vector_weight=args.vector_weight,
            lexical_weight=args.lexical_weight,
        )
    except Exception as exc:
        payload = {"status": "error", "available": False, "query": args.query, "results": [], "message": str(exc)}
        print_payload(payload, args.json)
        raise SystemExit(1)
    print_payload(payload, args.json)


if __name__ == "__main__":
    print("Import vector_index from a source api or command script.", file=sys.stderr)
    raise SystemExit(2)

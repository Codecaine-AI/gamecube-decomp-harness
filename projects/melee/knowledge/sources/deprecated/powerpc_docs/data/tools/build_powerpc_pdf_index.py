#!/usr/bin/env python3
"""Build a page-level searchable CSV index for local PowerPC PDFs."""

from __future__ import annotations

import csv
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


SCRIPT = Path(__file__).resolve()
for parent in SCRIPT.parents:
    if (parent / "configure.py").exists() and (parent / "config" / "GALE01").exists():
        ROOT = parent
        break
else:
    raise RuntimeError("Could not find repo root from PDF indexer path")

for parent in SCRIPT.parents:
    if parent.name == "decomp_resources":
        RESOURCE_DIR = parent
        break
else:
    raise RuntimeError("Could not find decomp_resources root from PDF indexer path")

SLICE_DIR = RESOURCE_DIR / "documents" / "powerpc"
PDF_DIR = SLICE_DIR / "pdfs"
OUT_DIR = SLICE_DIR / "indexes"
OUT_PATH = OUT_DIR / "powerpc_pdf_pages.csv"

PDF_TITLES = {
    "PPCEABI.pdf": "PowerPC Embedded Application Binary Interface",
    "powerpc-cwg.pdf": "The PowerPC Compiler Writer's Guide",
    "ppc_isa.pdf": "PowerPC User Instruction Set Architecture Book I",
}


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def run_pdftotext(pdf_path: Path) -> list[str]:
    if shutil.which("pdftotext") is None:
        raise RuntimeError("pdftotext is required to build the PowerPC PDF index")
    with tempfile.TemporaryDirectory() as tmp:
        out_path = Path(tmp) / "pages.txt"
        subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), str(out_path)],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        raw = out_path.read_text(encoding="utf-8", errors="replace")
    pages = raw.split("\f")
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    return [clean_text(page) for page in pages]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, str]] = []
    for pdf_path in sorted(PDF_DIR.glob("*.pdf")):
        document_id = pdf_path.stem
        title = PDF_TITLES.get(pdf_path.name, pdf_path.stem)
        rel_pdf = pdf_path.relative_to(ROOT).as_posix()
        for page_num, page_text in enumerate(run_pdftotext(pdf_path), start=1):
            rows.append(
                {
                    "document_id": document_id,
                    "title": title,
                    "pdf_path": rel_pdf,
                    "page": str(page_num),
                    "word_count": str(len(page_text.split())),
                    "text": page_text,
                }
            )

    with OUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["document_id", "title", "pdf_path", "page", "word_count", "text"],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} PowerPC PDF page records")
    print(f"Output: {OUT_PATH.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()

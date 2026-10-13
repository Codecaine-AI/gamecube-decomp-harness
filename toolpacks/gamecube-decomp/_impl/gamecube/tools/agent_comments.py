"""Vocabulary for agent-written comments that SMS maintainers reject.

Shared by the review lint (`sms_agent_comment`) and `stack_check.py
strip-comments`, so the lint and the cleanup agree on what counts. Matching is
case-insensitive and only applies to comment text, never to code.
"""

from __future__ import annotations

import re

# Markers an agent leaves about matching state or tactics. Kept narrow: struct
# offset comments (`/* 0x10 */`), `_pad` member names and ordinary prose stay
# legal.
AGENT_COMMENT_TERMS = (
    r"\bTODO\b",
    r"\bFIXME\b",
    r"\bXXX\b",
    r"\bHACK\b",
    r"\bnon[- ]?matching\b",
    r"\bnot\s+matching\b",
    r"\bdo(?:es)?n'?t\s+match\b",
    r"\bdoes\s+not\s+match\b",
    r"\bfake[- ]?match",
    r"\bfabricated\b",
    r"\bframe[- ]only\b",
    r"\bframe\s+size\b",
    r"\bstack\s+frame\b",
    r"\bstack\s+(?:size|pad(?:ding)?|slot|offset|layout|alignment)\b",
    r"\bregalloc\b",
    r"\bregister\s+alloc",
    r"\bregswap\b",
    r"\bmatches\s+except\b",
    r"\bobjdiff\b",
    r"\binline[_ ]depth\b",
    r"\bdont_inline\b",
    r"\b\d{1,3}(?:\.\d+)?\s*%\s*match",
)

AGENT_COMMENT_RE = re.compile("|".join(AGENT_COMMENT_TERMS), re.IGNORECASE)

_LINE_COMMENT_RE = re.compile(r"//(.*)$")
_BLOCK_COMMENT_RE = re.compile(r"/\*(.*?)\*/")


def comment_texts(line: str) -> list[str]:
    """Comment bodies on one source line (`//` tail and `/* */` blocks).

    String literals are not parsed; callers only pass lines a diff added, where
    a `//` inside a string literal is rare enough to review by hand.
    """
    texts = [m.group(1) for m in _BLOCK_COMMENT_RE.finditer(line)]
    stripped = _BLOCK_COMMENT_RE.sub("", line)
    m = _LINE_COMMENT_RE.search(stripped)
    if m:
        texts.append(m.group(1))
    return texts


def is_agent_comment_text(text: str) -> bool:
    return bool(AGENT_COMMENT_RE.search(text))


def line_has_agent_comment(line: str) -> bool:
    return any(is_agent_comment_text(t) for t in comment_texts(line))

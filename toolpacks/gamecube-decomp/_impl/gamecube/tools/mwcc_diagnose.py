#!/usr/bin/env python3
"""Mode-oriented diagnostics for close mwcc/objdiff mismatches.

Usage:
  tools/mwcc_diagnose.py stack <function>
  tools/mwcc_diagnose.py regflow <function>
  tools/mwcc_diagnose.py inlines <function>
  tools/mwcc_diagnose.py raw <function>

The intended workflow is:

  1. Run checkdiff.py and look at the mismatch type summary.
  2. If stack/frame mismatches dominate, run this tool's stack mode.
     If register mismatches dominate, run this tool's regflow mode.

The stack mode combines objdiff's target-vs-current assembly with structured
mwcc_debug facts from the current C compilation. It cannot name target stack
slots because the target side is only assembly, but it can show which current
r1 offsets moved, whether they moved by a common delta, and which current-C
mwcc stack slots correspond to mismatched instructions.

The regflow mode focuses on small register-only windows. It groups target-to-
current register colorings, traces obvious pointer derivations such as item
gobj/user_data/JObj loads, and filters the mwcc_debug dump down to the current
C setup before coloring.

The inlines mode looks for objective boundaries where extracting a static
inline helper may be worth trying: narrow register-only mismatches at non-loop
basic-block starts, target-only setup before a current block starts, and target
calls that current code appears to have expanded into multiple instructions.

The raw mode prints the function-filtered mwcc_debug pcdump verbatim.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


def _arg_value(*names: str) -> Optional[str]:
    for idx, arg in enumerate(sys.argv[1:], start=1):
        for name in names:
            if arg == name and idx + 1 < len(sys.argv):
                return sys.argv[idx + 1]
            prefix = f"{name}="
            if arg.startswith(prefix):
                return arg[len(prefix):]
    return None


def _looks_like_project_root(path: Path) -> bool:
    return (path / "build/GALE01/report.json").is_file() and (path / "src").is_dir()


def _bootstrap_project_root() -> None:
    """Set ORCH_GAME_REPO_ROOT early enough that imported helper modules bind to it.

    Existing helper scripts assume they are run from a project checkout unless
    ORCH_GAME_REPO_ROOT is set. The public API binds that environment
    variable before this module runs.
    """
    cli_root = _arg_value("--root", "--project-root")
    if cli_root:
        os.environ["ORCH_GAME_REPO_ROOT"] = cli_root
        return
    if os.environ.get("ORCH_GAME_REPO_ROOT"):
        return

    script_root = Path(__file__).resolve().parents[1]
    candidates = [
        Path.cwd(),
        script_root,
    ]
    for candidate in candidates:
        if _looks_like_project_root(candidate):
            os.environ["ORCH_GAME_REPO_ROOT"] = str(candidate)
            return


_bootstrap_project_root()

# Sibling tools are intentionally imported after the root bootstrap above.
import checkdiff  # noqa: E402
import mwcc_dump  # noqa: E402
from ninja_compile import REPORT_PATH  # noqa: E402


ROOT = checkdiff.ROOT
TOOLS = Path(__file__).resolve().parent

MISMATCH_LABELS = {
    "register": "r",
    "addr": "a",
    "address": "a",
    "constant": "c",
    "stack": "s",
    "frame": "f",
    "data": "d",
    "instr": "i",
    "instruction": "i",
    "missing": "-",
    "extra": "+",
}


@dataclass
class DiffSummary:
    percent: Optional[float]
    counts: Counter[str]
    raw: str

    @property
    def total(self) -> int:
        return sum(self.counts.values())


@dataclass
class DiffLine:
    markers: str
    target_addr: Optional[int]
    current_addr: Optional[int]
    target_inst: str
    current_inst: str
    raw: str


@dataclass
class StackRef:
    offset: int
    form: str


@dataclass
class StackMismatch:
    markers: str
    target_addr: Optional[int]
    current_addr: Optional[int]
    target_offset: Optional[int]
    current_offset: Optional[int]
    target_inst: str
    current_inst: str

    @property
    def delta(self) -> Optional[int]:
        if self.target_offset is None or self.current_offset is None:
            return None
        return self.current_offset - self.target_offset


@dataclass
class SourceLocal:
    name: str
    type_text: str
    index: int
    line_no: int
    kind: str
    size: Optional[int] = None
    raw: str = ""
    scope_depth: int = 0


@dataclass
class SourceFunction:
    name: str
    signature: str
    body: str
    start_line: int

    @property
    def is_inline(self) -> bool:
        return re.search(r"\binline\b", self.signature) is not None


@dataclass
class LocalMovement:
    name: str
    delta: int
    count: int
    refs: list[tuple[StackMismatch, mwcc_dump.MwccStackRef]]
    source: SourceLocal


@dataclass
class SourceDecl:
    name: str
    type_text: str
    line_no: int
    raw: str


@dataclass
class RegFlowLine:
    line: DiffLine
    target_regs: list[str]
    current_regs: list[str]


@dataclass
class RegFlowMapping:
    target: str
    current: str
    count: int
    samples: list[RegFlowLine]


@dataclass
class ScheduledInst:
    block: str
    block_index: int
    inst_index: int
    block_inst_index: int
    op: str
    operands: list[str]
    text: str


@dataclass
class ScheduledBlock:
    name: str
    index: int
    preds: list[str]
    succs: list[str]
    insts: list[ScheduledInst]


@dataclass
class InlineCandidate:
    line: RegFlowLine
    block: ScheduledBlock
    inst: ScheduledInst
    target_regs_dead_later: list[str]
    current_regs_reused_later: list[str]


@dataclass
class TargetSetupCandidate:
    line: DiffLine
    block: ScheduledBlock
    inst: ScheduledInst
    setup_rows: list[DiffLine]


@dataclass
class CallExpansionCandidate:
    line: DiffLine
    target_symbol: str
    current_extra_rows: list[DiffLine]


def parse_int(value: str) -> int:
    value = value.strip().lower()
    return int(value, 0)


def parse_optional_int(value: str) -> Optional[int]:
    try:
        return parse_int(value)
    except ValueError:
        return None


def fmt_off(value: Optional[int]) -> str:
    if value is None:
        return "-"
    sign = "-" if value < 0 else ""
    return f"{sign}0x{abs(value):x}"


def fmt_delta(value: Optional[int]) -> str:
    if value is None:
        return "-"
    sign = "+" if value >= 0 else "-"
    return f"{sign}0x{abs(value):x}"


def shorten(text: str, width: int = 46) -> str:
    text = re.sub(r"\s+", " ", text.strip())
    if len(text) <= width:
        return text
    return text[: width - 1] + "..."


def bytes_text(value: int) -> str:
    unit = "byte" if abs(value) == 1 else "bytes"
    return f"{abs(value)} {unit}"


def parse_diff_summary(output: str) -> DiffSummary:
    first = next((line.strip() for line in output.splitlines() if line.strip()), "")
    match = re.match(r"^(\d+(?:\.\d+)?)%(?:\s+\((.*)\))?$", first)
    if match is None:
        return DiffSummary(percent=None, counts=Counter(), raw=first)

    counts: Counter[str] = Counter()
    body = match.group(2) or ""
    for part in body.split(","):
        item = part.strip()
        if not item:
            continue
        m = re.match(r"^(\d+)\s+(.+?)s?$", item)
        if m is None:
            continue
        counts[m.group(2).strip().lower()] += int(m.group(1))
    return DiffSummary(percent=float(match.group(1)), counts=counts, raw=first)


def format_counts(summary: DiffSummary) -> str:
    if not summary.counts:
        return "none"
    parts = []
    for name, count in summary.counts.most_common():
        marker = MISMATCH_LABELS.get(name)
        suffix = f" ({marker})" if marker else ""
        parts.append(f"{count} {name}{suffix}")
    return ", ".join(parts)


def _parse_side(side: str) -> tuple[str, Optional[int], str]:
    """Return (marker chars, address, instruction) for one objdiff column."""
    if ":" not in side:
        return "", None, side.strip()
    prefix, inst = side.split(":", 1)
    fields = prefix.strip().split()
    if not fields:
        return "", None, inst.strip()
    addr_token = fields[-1]
    try:
        addr = int(addr_token, 16)
    except ValueError:
        return "", None, inst.strip()
    markers = "".join(fields[:-1])
    return markers, addr, inst.strip()


def parse_diff_lines(output: str) -> list[DiffLine]:
    lines: list[DiffLine] = []
    for raw in output.splitlines():
        if "|" not in raw:
            continue
        left, right = raw.split("|", 1)
        markers, target_addr, target_inst = _parse_side(left)
        _right_markers, current_addr, current_inst = _parse_side(right)
        lines.append(
            DiffLine(
                markers=markers,
                target_addr=target_addr,
                current_addr=current_addr,
                target_inst=target_inst,
                current_inst=current_inst,
                raw=raw,
            )
        )
    return lines


IMM_RE = r"-?(?:0x[0-9a-fA-F]+|\d+)"
STACK_MEM_RE = re.compile(rf"(?P<imm>{IMM_RE})\(r1\)")
STACK_ADDI_RE = re.compile(rf"\baddi\s+r\d+,\s*r1,\s*(?P<imm>{IMM_RE})\b")
FRAME_RE = re.compile(rf"\bstwu\s+r1,\s*(?P<imm>{IMM_RE})\(r1\)")


def extract_stack_refs(inst: str) -> list[StackRef]:
    inst_l = inst.lower()
    refs: list[StackRef] = []

    for match in STACK_ADDI_RE.finditer(inst_l):
        refs.append(StackRef(parse_int(match.group("imm")), "addi"))
    for match in STACK_MEM_RE.finditer(inst_l):
        form = "frame" if FRAME_RE.search(inst_l) is not None else "mem"
        refs.append(StackRef(parse_int(match.group("imm")), form))
    return refs


def parse_frame_size(inst: str) -> Optional[int]:
    match = FRAME_RE.search(inst.lower())
    if match is None:
        return None
    return abs(parse_int(match.group("imm")))


def find_frame_sizes(diff_lines: list[DiffLine]) -> tuple[Optional[int], Optional[int]]:
    for line in diff_lines:
        target = parse_frame_size(line.target_inst)
        current = parse_frame_size(line.current_inst)
        if target is not None or current is not None:
            return target, current
    return None, None


def collect_stack_mismatches(diff_lines: list[DiffLine]) -> list[StackMismatch]:
    mismatches: list[StackMismatch] = []
    for line in diff_lines:
        if not (set(line.markers) & {"s", "f"}):
            continue

        target_refs = extract_stack_refs(line.target_inst)
        current_refs = extract_stack_refs(line.current_inst)
        if target_refs and current_refs:
            for target_ref, current_ref in zip(target_refs, current_refs):
                mismatches.append(
                    StackMismatch(
                        markers=line.markers,
                        target_addr=line.target_addr,
                        current_addr=line.current_addr,
                        target_offset=target_ref.offset,
                        current_offset=current_ref.offset,
                        target_inst=line.target_inst,
                        current_inst=line.current_inst,
                    )
                )
        else:
            mismatches.append(
                StackMismatch(
                    markers=line.markers,
                    target_addr=line.target_addr,
                    current_addr=line.current_addr,
                    target_offset=target_refs[0].offset if target_refs else None,
                    current_offset=current_refs[0].offset if current_refs else None,
                    target_inst=line.target_inst,
                    current_inst=line.current_inst,
                )
            )
    return mismatches


REG_TOKEN_RE = re.compile(r"\b[rf](?:[0-9]|[12][0-9]|3[01])\b")
GPR_TOKEN_RE = re.compile(r"\br(?:[0-9]|[12][0-9]|3[01])\b")
VREG_TOKEN_RE = re.compile(r"\br\d+\b")
OFFSET_OPERAND_RE = re.compile(rf"(?P<off>{IMM_RE})\((?P<base>r\d+)\)$")


def canonical_inst(inst: str) -> str:
    text = inst.split(";", 1)[0].strip().lower()
    text = re.sub(r"^(?:->\s*)+", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*,\s*", ",", text)
    text = re.sub(r"\b0x0\b", "0", text)
    return text


def canonicalize_registers(inst: str) -> str:
    return REG_TOKEN_RE.sub(lambda match: match.group(0)[0] + "?", canonical_inst(inst))


def inst_registers(inst: str) -> list[str]:
    return REG_TOKEN_RE.findall(canonical_inst(inst))


def parse_inst_text(inst: str) -> Optional[tuple[str, list[str], str]]:
    """Parse an instruction from objdiff or mwcc_debug text."""
    return mwcc_dump.parse_inst(f"    {canonical_inst(inst)}")


def parse_offset_operand(operand: str) -> Optional[tuple[int, str]]:
    match = OFFSET_OPERAND_RE.match(operand.strip().lower())
    if match is None:
        return None
    return parse_int(match.group("off")), match.group("base")


def only_registers_differ(target_inst: str, current_inst: str) -> bool:
    return (
        canonical_inst(target_inst) != canonical_inst(current_inst)
        and canonicalize_registers(target_inst) == canonicalize_registers(current_inst)
    )


def collect_regflow_lines(diff_lines: list[DiffLine]) -> list[RegFlowLine]:
    lines: list[RegFlowLine] = []
    for line in diff_lines:
        if not (set(line.markers) & {"r"} or only_registers_differ(line.target_inst, line.current_inst)):
            continue
        target_regs = inst_registers(line.target_inst)
        current_regs = inst_registers(line.current_inst)
        if len(target_regs) != len(current_regs):
            continue
        if not any(t != c for t, c in zip(target_regs, current_regs)):
            continue
        lines.append(RegFlowLine(line, target_regs, current_regs))
    return lines


def collect_regflow_mappings(lines: list[RegFlowLine]) -> list[RegFlowMapping]:
    counts: Counter[tuple[str, str]] = Counter()
    samples: dict[tuple[str, str], list[RegFlowLine]] = defaultdict(list)
    for item in lines:
        for target, current in zip(item.target_regs, item.current_regs):
            if target == current:
                continue
            if target[0] != current[0]:
                continue
            key = (target, current)
            counts[key] += 1
            if len(samples[key]) < 3:
                samples[key].append(item)

    mappings = [
        RegFlowMapping(target, current, count, samples[(target, current)])
        for (target, current), count in counts.items()
    ]
    mappings.sort(key=lambda item: (-item.count, item.target, item.current))
    return mappings


NUMERIC_TOKEN_RE = re.compile(r"(?<![A-Za-z_@.])-?(?:0x[0-9a-fA-F]+|\d+)(?![A-Za-z_@.])")
BLOCK_HEADER_RE = re.compile(
    r"^\s*(?P<name>B\d+):\s+Succ=\{(?P<succs>[^}]*)\}\s+Pred=\{(?P<preds>[^}]*)\}"
)


def comparable_inst(inst: str) -> str:
    """Canonicalize enough to match objdiff text against mwcc_debug text."""
    text = canonical_inst(inst)
    text = re.sub(r"(@[A-Za-z0-9_.$]+)@sda21\b", r"\1", text)
    text = re.sub(r"(@[A-Za-z0-9_.$]+)\(r0\)", r"\1", text)

    def repl(match: re.Match[str]) -> str:
        value = match.group(0).lower()
        if value.startswith("-0x") or value.startswith("0x"):
            return str(int(value, 16))
        return str(int(value, 10))

    return NUMERIC_TOKEN_RE.sub(repl, text)


def parse_block_refs(text: str) -> list[str]:
    return re.findall(r"\bB\d+\b", text)


def parse_scheduled_blocks(lines: list[str]) -> list[ScheduledBlock]:
    blocks: list[ScheduledBlock] = []
    current: Optional[ScheduledBlock] = None
    inst_index = 0
    for raw in lines:
        header = BLOCK_HEADER_RE.match(raw)
        if header is not None:
            current = ScheduledBlock(
                name=header.group("name"),
                index=len(blocks),
                preds=parse_block_refs(header.group("preds")),
                succs=parse_block_refs(header.group("succs")),
                insts=[],
            )
            blocks.append(current)
            continue
        if current is None:
            continue
        parsed = mwcc_dump.parse_inst(raw)
        if parsed is None:
            continue
        op, operands, text = parsed
        current.insts.append(
            ScheduledInst(
                block=current.name,
                block_index=current.index,
                inst_index=inst_index,
                block_inst_index=len(current.insts),
                op=op,
                operands=operands,
                text=text,
            )
        )
        inst_index += 1
    return blocks


def flatten_scheduled_insts(blocks: list[ScheduledBlock]) -> list[ScheduledInst]:
    return [inst for block in blocks for inst in block.insts]


def scheduled_regs(insts: list[ScheduledInst]) -> Counter[str]:
    regs: Counter[str] = Counter()
    for inst in insts:
        regs.update(inst_registers(inst.text))
    return regs


def block_graph(blocks: list[ScheduledBlock]) -> dict[str, list[str]]:
    names = {block.name for block in blocks}
    return {
        block.name: [succ for succ in block.succs if succ in names]
        for block in blocks
    }


def block_reaches(
    graph: dict[str, list[str]],
    start: str,
    target: str,
    visited: Optional[set[str]] = None,
) -> bool:
    visited = set() if visited is None else visited
    for succ in graph.get(start, []):
        if succ == target:
            return True
        if succ in visited:
            continue
        visited.add(succ)
        if block_reaches(graph, succ, target, visited):
            return True
    return False


def cyclic_blocks(blocks: list[ScheduledBlock]) -> set[str]:
    graph = block_graph(blocks)
    return {block.name for block in blocks if block_reaches(graph, block.name, block.name)}


def gpr_dest(inst: str) -> Optional[str]:
    parsed = parse_inst_text(inst)
    if parsed is None:
        return None
    _op, operands, _text = parsed
    if not operands:
        return None
    dest = operands[0]
    if GPR_TOKEN_RE.fullmatch(dest):
        return dest
    return None


def read_function_dump(dump_path: Path, func: str) -> str:
    section = dump_path.read_text(errors="replace")
    extracted = mwcc_dump.extract_function(section, func)
    if extracted is not None:
        return extracted
    return section


def first_scheduled_inst_maps(
    blocks: list[ScheduledBlock],
) -> tuple[dict[str, ScheduledInst], Counter[str], dict[str, ScheduledBlock]]:
    first_inst_by_key: dict[str, ScheduledInst] = {}
    first_inst_counts: Counter[str] = Counter()
    block_by_name = {block.name: block for block in blocks}
    for block in blocks:
        if not block.insts:
            continue
        key = comparable_inst(block.insts[0].text)
        first_inst_counts[key] += 1
        first_inst_by_key[key] = block.insts[0]
    return first_inst_by_key, first_inst_counts, block_by_name


def matching_non_loop_block_start(
    current_inst: str,
    first_inst_by_key: dict[str, ScheduledInst],
    first_inst_counts: Counter[str],
    block_by_name: dict[str, ScheduledBlock],
    loops: set[str],
) -> Optional[tuple[ScheduledBlock, ScheduledInst]]:
    key = comparable_inst(current_inst)
    if first_inst_counts[key] != 1:
        return None
    inst = first_inst_by_key[key]
    block = block_by_name[inst.block]
    if block.index == 0 or inst.block_inst_index != 0 or block.name in loops:
        return None
    return block, inst


def is_current_extra_line(line: DiffLine) -> bool:
    return line.target_addr is None and line.current_addr is not None


def is_target_only_line(line: DiffLine) -> bool:
    return line.target_addr is not None and line.current_addr is None


def is_setup_inst(inst: str) -> bool:
    parsed = parse_inst_text(inst)
    if parsed is None:
        return False
    op, _operands, _text = parsed
    return not op.startswith("b")


def call_target(inst: str) -> Optional[str]:
    parsed = parse_inst_text(inst)
    if parsed is None:
        return None
    op, operands, _text = parsed
    if op != "bl" or not operands:
        return None
    return operands[0]


def collect_inline_candidates(
    regflow_lines: list[RegFlowLine],
    blocks: list[ScheduledBlock],
) -> list[InlineCandidate]:
    all_insts = flatten_scheduled_insts(blocks)
    if not all_insts:
        return []

    loops = cyclic_blocks(blocks)
    first_inst_by_key, first_inst_counts, block_by_name = first_scheduled_inst_maps(blocks)

    candidates: list[InlineCandidate] = []
    seen: set[tuple[str, int]] = set()
    for line in regflow_lines:
        matched = matching_non_loop_block_start(
            line.line.current_inst,
            first_inst_by_key,
            first_inst_counts,
            block_by_name,
            loops,
        )
        if matched is None:
            continue
        block, inst = matched

        dest = gpr_dest(line.line.current_inst)
        if dest is None:
            continue

        target_dead: list[str] = []
        current_reused: list[str] = []
        current_tail_regs = scheduled_regs(all_insts[inst.inst_index:])
        later_regs = scheduled_regs(all_insts[inst.inst_index + 1:])
        for target, current in zip(line.target_regs, line.current_regs):
            if target == current or target[0] != "r" or current[0] != "r":
                continue
            if current != dest:
                continue
            if target in current_tail_regs:
                continue
            if later_regs[current] == 0:
                continue
            target_dead.append(target)
            current_reused.append(current)

        if not target_dead:
            continue
        dedup_key = (block.name, line.line.target_addr or -1)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        candidates.append(
            InlineCandidate(
                line=line,
                block=block,
                inst=inst,
                target_regs_dead_later=sorted(set(target_dead), key=lambda reg: (reg[0], reg_num(reg) or 0)),
                current_regs_reused_later=sorted(set(current_reused), key=lambda reg: (reg[0], reg_num(reg) or 0)),
            )
        )
    return candidates


def collect_target_setup_candidates(
    diff_lines: list[DiffLine],
    blocks: list[ScheduledBlock],
    window: int = 8,
) -> list[TargetSetupCandidate]:
    loops = cyclic_blocks(blocks)
    first_inst_by_key, first_inst_counts, block_by_name = first_scheduled_inst_maps(blocks)
    candidates: list[TargetSetupCandidate] = []
    seen: set[tuple[str, int]] = set()

    for idx, line in enumerate(diff_lines):
        if line.current_addr is None or not line.current_inst:
            continue
        matched = matching_non_loop_block_start(
            line.current_inst,
            first_inst_by_key,
            first_inst_counts,
            block_by_name,
            loops,
        )
        if matched is None:
            continue
        block, inst = matched

        current_key = comparable_inst(line.current_inst)
        if comparable_inst(line.target_inst) == current_key:
            continue

        following = diff_lines[idx + 1: idx + 1 + window]
        has_later_target_copy = any(
            is_target_only_line(row) and comparable_inst(row.target_inst) == current_key
            for row in following
        )
        if not has_later_target_copy:
            continue

        setup_rows: list[DiffLine] = []
        for row_idx, row in enumerate(diff_lines[idx: idx + 1 + window]):
            if row.target_addr is None or not is_setup_inst(row.target_inst):
                continue
            if row_idx == 0 and comparable_inst(row.target_inst) != comparable_inst(row.current_inst):
                setup_rows.append(row)
            elif row_idx > 0 and is_target_only_line(row):
                setup_rows.append(row)

        if len(setup_rows) < 2:
            continue

        dedup_key = (block.name, line.target_addr or -1)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        candidates.append(TargetSetupCandidate(line=line, block=block, inst=inst, setup_rows=setup_rows))
    return candidates


def collect_call_expansion_candidates(
    diff_lines: list[DiffLine],
    before: int = 8,
    after: int = 16,
    min_current_extra: int = 3,
) -> list[CallExpansionCandidate]:
    candidates: list[CallExpansionCandidate] = []
    seen: set[int] = set()
    for idx, line in enumerate(diff_lines):
        target_symbol = call_target(line.target_inst)
        if target_symbol is None:
            continue
        if call_target(line.current_inst) == target_symbol:
            continue

        lo = max(0, idx - before)
        hi = min(len(diff_lines), idx + after + 1)
        current_extra_rows = [
            row for row in diff_lines[lo:hi]
            if is_current_extra_line(row)
        ]
        if len(current_extra_rows) < min_current_extra:
            continue

        key = line.target_addr if line.target_addr is not None else idx
        if key in seen:
            continue
        seen.add(key)
        candidates.append(
            CallExpansionCandidate(
                line=line,
                target_symbol=target_symbol,
                current_extra_rows=current_extra_rows,
            )
        )
    return candidates


def print_inline_candidates(candidates: list[InlineCandidate]) -> None:
    print("Register-boundary candidates:")
    if not candidates:
        print("  none")
        print(
            "  filters: register-only mismatch; first instruction of a non-entry final scheduled block "
            "outside a loop; target GPR unused later in current code; current destination GPR reused later"
        )
        return

    for candidate in candidates:
        addr = fmt_off(candidate.line.line.target_addr)
        preds = ", ".join(candidate.block.preds) if candidate.block.preds else "-"
        succs = ", ".join(candidate.block.succs) if candidate.block.succs else "-"
        dead = ", ".join(candidate.target_regs_dead_later)
        reused = ", ".join(candidate.current_regs_reused_later)
        print(f"  {addr}: {candidate.block.name} (preds: {preds}; succs: {succs})")
        print(f"    target:  {candidate.line.line.target_inst}")
        print(f"    current: {candidate.line.line.current_inst}")
        print(f"    signals: non-loop block starts at this mismatch; target GPR(s) unused later: {dead}; current destination reused later: {reused}")
        print("    try: extract the source block/phase beginning here into a static inline helper")


def print_target_setup_candidates(candidates: list[TargetSetupCandidate]) -> None:
    print("Target-setup candidates:")
    if not candidates:
        print("  none")
        print(
            "  filters: current instruction is a unique non-loop scheduled-block start; "
            "the target has the same instruction later as target-only code; "
            "at least two nearby target-side setup instructions"
        )
        return

    for candidate in candidates:
        addr = fmt_off(candidate.line.target_addr)
        setup = "; ".join(shorten(row.target_inst, 36) for row in candidate.setup_rows[:5])
        extra = "" if len(candidate.setup_rows) <= 5 else f"; ... {len(candidate.setup_rows) - 5} more"
        preds = ", ".join(candidate.block.preds) if candidate.block.preds else "-"
        succs = ", ".join(candidate.block.succs) if candidate.block.succs else "-"
        print(f"  {addr}: {candidate.block.name} (preds: {preds}; succs: {succs})")
        print(f"    target:  {candidate.line.target_inst}")
        print(f"    current: {candidate.line.current_inst}")
        print(f"    target-side setup nearby: {setup}{extra}")
        print(
            "    signals: current block starts before target-side setup is complete; "
            "target reaches the current start instruction later as target-only code"
        )
        print("    try: extract the source phase beginning here into a static inline helper")


def print_call_expansion_candidates(candidates: list[CallExpansionCandidate]) -> None:
    print("Call-expansion candidates:")
    if not candidates:
        print("  none")
        print(
            "  filters: target instruction is a direct call; current side is not the same call; "
            "at least three current-only instructions nearby"
        )
        return

    for candidate in candidates:
        addr = fmt_off(candidate.line.target_addr)
        samples = "; ".join(shorten(row.current_inst, 36) for row in candidate.current_extra_rows[:5])
        extra = "" if len(candidate.current_extra_rows) <= 5 else f"; ... {len(candidate.current_extra_rows) - 5} more"
        print(f"  {addr}: target call `{candidate.target_symbol}`")
        print(f"    target:  {candidate.line.target_inst}")
        print(f"    current: {candidate.line.current_inst}")
        print(f"    current-only nearby: {samples}{extra}")
        print(
            f"    signals: target has a call, while current has {len(candidate.current_extra_rows)} "
            "current-only instruction(s) around that boundary"
        )
        print("    try: extract or wrap the source region around this call so the call remains at the boundary")


def cluster_regflow_lines(lines: list[RegFlowLine], gap: int = 0x10) -> list[list[RegFlowLine]]:
    with_addr = [item for item in lines if item.line.target_addr is not None]
    without_addr = [item for item in lines if item.line.target_addr is None]
    with_addr.sort(key=lambda item: item.line.target_addr or 0)
    clusters: list[list[RegFlowLine]] = []
    for item in with_addr:
        if not clusters:
            clusters.append([item])
            continue
        prev_addr = clusters[-1][-1].line.target_addr
        addr = item.line.target_addr
        if prev_addr is not None and addr is not None and addr - prev_addr <= gap:
            clusters[-1].append(item)
        else:
            clusters.append([item])
    if without_addr:
        clusters.append(without_addr)
    return clusters


def primary_regflow_cluster(lines: list[RegFlowLine]) -> list[RegFlowLine]:
    clusters = cluster_regflow_lines(lines)
    if not clusters:
        return []
    for cluster in clusters:
        if any("r" in item.line.markers for item in cluster):
            return cluster
    return clusters[0]


def reg_num(reg: str) -> Optional[int]:
    if not re.fullmatch(r"[rf]\d+", reg):
        return None
    return int(reg[1:])


def is_shifted_mapping(mappings: list[RegFlowMapping]) -> Optional[int]:
    """Return target-current register number delta when mappings share one."""
    deltas = set()
    for mapping in mappings:
        if mapping.target[0] != "r" or mapping.current[0] != "r":
            continue
        target = reg_num(mapping.target)
        current = reg_num(mapping.current)
        if target is None or current is None:
            continue
        deltas.add(target - current)
    if len(deltas) == 1:
        return next(iter(deltas))
    return None


def strip_c_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//.*", "", text)


def find_matching_brace(text: str, open_idx: int) -> Optional[int]:
    depth = 0
    in_string: Optional[str] = None
    escaped = False
    for idx in range(open_idx, len(text)):
        ch = text[idx]
        if in_string is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == in_string:
                in_string = None
            continue
        if ch in {'"', "'"}:
            in_string = ch
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return idx
    return None


def extract_source_function(source: Path, func: str) -> Optional[tuple[str, int]]:
    text = source.read_text(errors="replace")
    pattern = re.compile(rf"\b{re.escape(func)}\s*\(")
    for match in pattern.finditer(text):
        brace = text.find("{", match.end())
        semicolon = text.find(";", match.end())
        if brace == -1 or (semicolon != -1 and semicolon < brace):
            continue
        end = find_matching_brace(text, brace)
        if end is None:
            continue
        start_line = text.count("\n", 0, brace) + 1
        return text[brace + 1:end], start_line
    return None


def extract_source_functions(source: Path) -> list[SourceFunction]:
    """Return top-level C function bodies from a source file.

    This is intentionally small and C-ish rather than a full parser. It is used
    only for local helper-shape hints, so false negatives are preferable to
    sweeping up nested control-flow blocks.
    """
    text = source.read_text(errors="replace")
    funcs: list[SourceFunction] = []
    pattern = re.compile(
        r"(?m)^(?P<signature>[A-Za-z_][A-Za-z0-9_\s\*]*?\b"
        r"(?P<name>[A-Za-z_]\w*)\s*\([^;{}#]*?\))\s*\{",
        re.S,
    )
    for match in pattern.finditer(text):
        name = match.group("name")
        if name in {"if", "for", "while", "switch"}:
            continue
        open_idx = match.end() - 1
        end = find_matching_brace(text, open_idx)
        if end is None:
            continue
        start_line = text.count("\n", 0, open_idx) + 1
        funcs.append(
            SourceFunction(
                name=name,
                signature=re.sub(r"\s+", " ", match.group("signature")).strip(),
                body=text[open_idx + 1:end],
                start_line=start_line,
            )
        )
    return funcs


def decl_name_from_statement(stmt: str) -> Optional[tuple[str, str, Optional[int]]]:
    left = stmt.split("=", 1)[0].strip()
    if not left or any(token in left for token in ("->", ".", "(", ")", "+", "-")):
        return None
    match = re.search(r"([A-Za-z_]\w*)\s*((?:\[[^\]]+\]\s*)*)$", left)
    if match is None:
        return None
    name = match.group(1)
    type_text = left[:match.start(1)].strip()
    if not type_text or not re.search(r"[A-Za-z_]\w*", type_text):
        return None
    if type_text in {"return", "if", "for", "while", "switch", "case", "goto"}:
        return None
    array_text = match.group(2) or ""
    size = None
    size_match = re.search(r"\[\s*(-?(?:0x[0-9a-fA-F]+|\d+))\s*\]", array_text)
    if size_match is not None:
        size = parse_optional_int(size_match.group(1))
    return name, type_text, size


def parse_source_locals(source: Path, func: str) -> list[SourceLocal]:
    extracted = extract_source_function(source, func)
    if extracted is None:
        return []
    body, start_line = extracted
    return parse_source_locals_from_body(body, start_line)


def source_decl_statements(source: Path, func: str) -> list[SourceDecl]:
    """Collect declaration statements, including multi-line initializers."""
    extracted = extract_source_function(source, func)
    if extracted is None:
        return []
    body, start_line = extracted
    body = strip_c_comments(body)
    decls: list[SourceDecl] = []
    stmt = []
    stmt_line: Optional[int] = None
    paren_depth = 0
    brace_depth = 0
    in_string: Optional[str] = None
    escaped = False

    for idx, ch in enumerate(body):
        if stmt_line is None and not ch.isspace():
            stmt_line = start_line + body.count("\n", 0, idx)
        if stmt_line is not None:
            stmt.append(ch)

        if in_string is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == in_string:
                in_string = None
            continue
        if ch in {'"', "'"}:
            in_string = ch
            continue
        if ch == "(":
            paren_depth += 1
        elif ch == ")":
            paren_depth = max(0, paren_depth - 1)
        elif ch == "{":
            brace_depth += 1
        elif ch == "}":
            brace_depth = max(0, brace_depth - 1)
        elif ch == ";" and stmt_line is not None and brace_depth == 0:
            raw = "".join(stmt).strip()
            flat = re.sub(r"\s+", " ", raw)
            parsed = decl_name_from_statement(flat[:-1])
            if parsed is not None:
                name, type_text, _size = parsed
                decls.append(SourceDecl(name, type_text, stmt_line, flat))
            stmt = []
            stmt_line = None
            paren_depth = 0

        if stmt_line is None:
            paren_depth = 0

    return decls


def update_scope_depth(scope_depth: int, line: str) -> int:
    return max(0, scope_depth + line.count("{") - line.count("}"))


def parse_source_locals_from_body(body: str, start_line: int) -> list[SourceLocal]:
    body = strip_c_comments(body)
    locals_: list[SourceLocal] = []
    index = 0
    scope_depth = 0
    for rel_line, line in enumerate(body.splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue

        local_scope_depth = scope_depth
        leading_close = len(re.match(r"^\s*(\}*)", line).group(1))
        if leading_close:
            local_scope_depth = max(0, local_scope_depth - leading_close)

        pad_match = re.search(r"\b(?:FORCE_)?PAD_STACK\s*\(\s*(-?(?:0x[0-9a-fA-F]+|\d+))\s*\)", stripped)
        if pad_match is not None:
            size = parse_optional_int(pad_match.group(1))
            locals_.append(
                SourceLocal(
                    name="PAD_STACK",
                    type_text="PAD_STACK",
                    index=index,
                    line_no=start_line + rel_line - 1,
                    kind="pad_stack",
                    size=size,
                    raw=stripped,
                    scope_depth=local_scope_depth,
                )
            )
            index += 1
            scope_depth = update_scope_depth(scope_depth, stripped)
            continue
        if not stripped.endswith(";"):
            scope_depth = update_scope_depth(scope_depth, stripped)
            continue
        parsed = decl_name_from_statement(stripped[:-1])
        if parsed is None:
            scope_depth = update_scope_depth(scope_depth, stripped)
            continue
        name, type_text, size = parsed
        kind = "pad" if name.startswith("_pad") or name.startswith("pad") else "var"
        locals_.append(
            SourceLocal(
                name=name,
                type_text=type_text,
                index=index,
                line_no=start_line + rel_line - 1,
                kind=kind,
                size=size,
                raw=stripped,
                scope_depth=local_scope_depth,
            )
        )
        index += 1
        scope_depth = update_scope_depth(scope_depth, stripped)
    return locals_


def source_path_for_obj(obj_path: str) -> Path:
    return ROOT / "src" / f"{obj_path}.c"


def pass_lines(section: str, wanted: str) -> list[str]:
    for name, lines in mwcc_dump.split_passes(section):
        if name == wanted:
            return lines
    return []


def field_expr(base_expr: str, offset: int) -> str:
    if base_expr == "gobj":
        if offset == 0x2C:
            return "gobj->user_data / GET_ITEM(gobj)"
        if offset == 0x28:
            return "gobj->hsd_obj / GET_JOBJ(gobj)"
    if "user_data" in base_expr or base_expr == "ip":
        if offset == 0xC4:
            return "ip->xC4_article_data"
    if "xC4_article_data" in base_expr or base_expr == "article":
        if offset == 0x4:
            return "article->x4_specialAttributes / attr"
    if "hsd_obj" in base_expr or "JOBJ" in base_expr or base_expr in {"jobj", "child"}:
        if offset == 0x10:
            if "child" in base_expr:
                return "child->child"
            return "jobj->child"
    if offset == 0:
        return f"*({base_expr})"
    return f"0x{offset:x}({base_expr})"


def trace_register_exprs(
    insts: list[str],
    initial: Optional[dict[str, str]] = None,
) -> tuple[dict[str, list[str]], list[str]]:
    """Best-effort straight-line expression trace for short setup windows."""
    env = dict(initial or {})
    seen: dict[str, list[str]] = defaultdict(list)
    notes: list[str] = []

    def remember(reg: str, expr: str) -> None:
        if expr not in seen[reg]:
            seen[reg].append(expr)

    for reg, expr in env.items():
        remember(reg, expr)

    for inst in insts:
        parsed = parse_inst_text(inst)
        if parsed is None:
            continue
        op, operands, text = parsed
        if op in {"mr", "addi"} and len(operands) >= 2:
            if op == "addi" and (len(operands) != 3 or parse_optional_int(operands[2]) != 0):
                continue
            dest, src = operands[0], operands[1]
            if not GPR_TOKEN_RE.fullmatch(dest) or not GPR_TOKEN_RE.fullmatch(src):
                continue
            expr = env.get(src, src)
            env[dest] = expr
            remember(dest, expr)
            notes.append(f"{dest} = {src} ({expr})")
            continue

        if op == "li" and len(operands) == 2 and GPR_TOKEN_RE.fullmatch(operands[0]):
            dest = operands[0]
            value = parse_optional_int(operands[1])
            expr = "NULL/0" if value == 0 else operands[1]
            env[dest] = expr
            remember(dest, expr)
            continue

        if op == "lwz" and len(operands) >= 2 and GPR_TOKEN_RE.fullmatch(operands[0]):
            dest = operands[0]
            parsed_off = parse_offset_operand(operands[1])
            if parsed_off is None:
                continue
            offset, base = parsed_off
            base_expr = env.get(base, base)
            expr = field_expr(base_expr, offset)
            env[dest] = expr
            remember(dest, expr)
            notes.append(f"{dest} = {fmt_off(offset)}({base}) ({expr})")
            continue

        if op in {"cmpli", "cmplwi", "cmpi", "cmpwi"}:
            regs = [operand for operand in operands if GPR_TOKEN_RE.fullmatch(operand)]
            if regs:
                reg = regs[-1]
                expr = env.get(reg)
                if expr:
                    notes.append(f"{text} checks {reg} ({expr})")

    return dict(seen), notes


def describe_reg_exprs(exprs: list[str]) -> str:
    meaningful = [expr for expr in exprs if expr not in {"gobj", "NULL/0"}]
    if not meaningful:
        meaningful = exprs
    if not meaningful:
        return "-"
    return "; then ".join(meaningful[:3])


def setup_trace(lines: list[str], max_items: int = 12) -> list[str]:
    env = {"r3": "gobj"}
    out: list[str] = []
    for line in lines:
        parsed = mwcc_dump.parse_inst(line)
        if parsed is None:
            continue
        op, operands, text = parsed
        if op in {"b", "bf", "bt", "bl"}:
            if out:
                break
            continue
        if op in {"mr", "addi"} and len(operands) >= 2:
            if op == "addi" and (len(operands) != 3 or parse_optional_int(operands[2]) != 0):
                continue
            dest, src = operands[0], operands[1]
            if VREG_TOKEN_RE.fullmatch(dest) and VREG_TOKEN_RE.fullmatch(src):
                expr = env.get(src, src)
                env[dest] = expr
                out.append(f"`{dest} = {src}` ({expr})")
        elif op == "lwz" and len(operands) >= 2 and VREG_TOKEN_RE.fullmatch(operands[0]):
            parsed_off = parse_offset_operand(operands[1])
            if parsed_off is None:
                # mwcc_dump's helper accepts decimal-only operands.
                parsed_mwcc = mwcc_dump.reg_from_offset_operand(operands[1])
                parsed_off = parsed_mwcc
            if parsed_off is None:
                continue
            offset, base = parsed_off
            base_expr = env.get(base, base)
            expr = field_expr(base_expr, offset)
            env[operands[0]] = expr
            out.append(f"`{operands[0]} = {fmt_off(offset)}({base})` ({expr})")
        elif op in {"cmpli", "cmpi", "cmplwi", "cmpwi"}:
            regs = [operand for operand in operands if VREG_TOKEN_RE.fullmatch(operand)]
            if regs:
                reg = regs[-1]
                out.append(f"`{text}` checks {reg} ({env.get(reg, reg)})")
        if len(out) >= max_items:
            break
    return out


def print_regflow_mappings(lines: list[RegFlowLine], mappings: list[RegFlowMapping]) -> None:
    if not lines:
        print("No compact register-only window found.")
        return

    addrs = [item.line.target_addr for item in lines if item.line.target_addr is not None]
    if addrs:
        print(f"Primary register-only window: {fmt_off(min(addrs))}..{fmt_off(max(addrs))} ({len(lines)} lines)")
    else:
        print(f"Primary register-only window: {len(lines)} lines")

    shift = is_shifted_mapping(mappings)
    if shift is not None and shift != 0:
        direction = "higher" if shift > 0 else "lower"
        amount = "one" if abs(shift) == 1 else str(abs(shift))
        print(
            f"Pattern: target uses register numbers {amount} {direction} "
            "than current for this setup window."
        )

    if not mappings:
        return
    print("Register mappings:")
    for mapping in mappings:
        samples = ", ".join(
            fmt_off(sample.line.target_addr) for sample in mapping.samples
            if sample.line.target_addr is not None
        )
        suffix = f"; samples {samples}" if samples else ""
        print(f"  target `{mapping.target}` -> current `{mapping.current}`: {mapping.count} refs{suffix}")


def print_regflow_roles(lines: list[RegFlowLine], mappings: list[RegFlowMapping]) -> None:
    target_exprs, _target_notes = trace_register_exprs([item.line.target_inst for item in lines], {"r3": "gobj"})
    current_exprs, _current_notes = trace_register_exprs([item.line.current_inst for item in lines], {"r3": "gobj"})
    if not mappings:
        return
    print("Likely roles:")
    for mapping in mappings:
        target_role = describe_reg_exprs(target_exprs.get(mapping.target, []))
        current_role = describe_reg_exprs(current_exprs.get(mapping.current, []))
        if target_role == current_role:
            print(f"  `{mapping.target}`/`{mapping.current}`: {target_role}")
        else:
            print(f"  target `{mapping.target}`: {target_role}")
            print(f"  current `{mapping.current}`: {current_role}")


def print_source_regflow_leads(source: Path, func: str, mappings: list[RegFlowMapping]) -> None:
    if not source.exists():
        return
    decls = source_decl_statements(source, func)
    if decls:
        shown = ", ".join(f"`{decl.name}`" for decl in decls[:6])
        print(f"Source declarations: {shown}")

    nested_child = next(
        (
            decl for decl in decls
            if "HSD_JObjGetChild(HSD_JObjGetChild" in decl.raw and "GET_JOBJ" in decl.raw
        ),
        None,
    )
    attr_decl = next((decl for decl in decls if "x4_specialAttributes" in decl.raw), None)
    item_decl = next((decl for decl in decls if "GET_ITEM" in decl.raw or "user_data" in decl.raw), None)

    leads: list[str] = []
    shift = is_shifted_mapping(mappings)
    if shift is not None and shift > 0:
        leads.append(
            "target keeps the incoming `r3` out of this early pointer chain; "
            "look for a source change that prevents the article/JObj temporary "
            "from being colored into `r3`"
        )
    if item_decl is not None and attr_decl is not None and nested_child is not None:
        leads.append(
            f"the setup is `{item_decl.name}` -> `{attr_decl.name}` -> "
            f"`{nested_child.name}`; try changing the boundaries/order of the "
            "`xC4_article_data` load and the nested `HSD_JObjGetChild(GET_JOBJ(...))` "
            "expression"
        )
    if nested_child is not None:
        leads.append(
            f"`{nested_child.name}` is initialized by a nested inline JObj chain "
            f"at line {nested_child.line_no}; try splitting it into explicit "
            "`jobj`/`child`/`grandchild` locals, or moving the child derivation "
            "relative to the attribute derivation"
        )

    if not leads:
        return
    print("Actionable leads:")
    for lead in leads:
        print(f"  {lead}")


def pcdump_path_from_output(output: str) -> Optional[Path]:
    for line in output.splitlines():
        if "full function dump available at:" not in line:
            continue
        return Path(line.split("full function dump available at:", 1)[1].strip())
    return None


def run_mwcc_dump(
    func: str,
    runner: str,
) -> tuple[int, str, str, Optional[mwcc_dump.MwccStackAnalysis], Optional[Path]]:
    env = os.environ.copy()
    env["ORCH_GAME_REPO_ROOT"] = str(ROOT)
    env.setdefault("WINEDEBUG", "-all")

    proc = subprocess.run(
        [sys.executable, str(TOOLS / "mwcc_dump.py"), "--runner", runner, func],
        cwd=ROOT,
        capture_output=True,
        text=True,
        env=env,
    )

    pcdump = pcdump_path_from_output(proc.stdout) or pcdump_path_from_output(proc.stderr)
    if proc.returncode != 0 or pcdump is None or not pcdump.exists():
        return proc.returncode, proc.stdout, proc.stderr, None, pcdump

    section = pcdump.read_text(errors="replace")
    if "Starting function " not in section:
        extracted = mwcc_dump.extract_function(section, func)
        if extracted is not None:
            section = extracted

    passes = mwcc_dump.split_passes(section)
    pass_name, pass_lines = mwcc_dump.choose_analysis_pass(passes)
    analysis = mwcc_dump.analyze_stack_pass(pass_lines, pass_name)
    return proc.returncode, proc.stdout, proc.stderr, analysis, pcdump


def print_stack_table(mismatches: list[StackMismatch]) -> None:
    if not mismatches:
        print("Stack/frame mismatch lines: none")
        return

    print(f"Stack/frame mismatch lines: {len(mismatches)}")
    print("  addr   kind  target  current  delta   target inst -> current inst")
    for item in mismatches:
        addr = f"{item.target_addr:x}" if item.target_addr is not None else "-"
        kind = "".join(ch for ch in item.markers if ch in "sf") or item.markers or "-"
        print(
            "  "
            f"{addr:<5} {kind:<5} "
            f"{fmt_off(item.target_offset):<7} "
            f"{fmt_off(item.current_offset):<8} "
            f"{fmt_delta(item.delta):<7} "
            f"{shorten(item.target_inst)} -> {shorten(item.current_inst)}"
        )


def stack_inst_signature(inst: str) -> str:
    """Normalize a stack instruction enough to compare objdiff and pcdump text.

    objdiff sees resolved numeric offsets while mwcc_debug often keeps symbolic
    stack names like sp18 or @805. Keep the opcode/register shape, but replace
    the r1 stack operand with a placeholder.
    """
    text = inst.split(";", 1)[0].strip().lower()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*,\s*", ",", text)
    text = re.sub(r"\b(addi,r\d+,r1,)[^,\s]+", r"\1<stack>", text)
    text = re.sub(r"\b(addi\s+r\d+,r1,)[^,\s]+", r"\1<stack>", text)
    text = re.sub(r"[^,\s()]+\(r1\)", "<stack>(r1)", text)
    return text


def is_literal_stack_slot(slot: str) -> bool:
    return re.fullmatch(r"-?(?:0x[0-9a-fA-F]+|\d+)", slot) is not None


def collect_current_slot_matches(
    mismatches: list[StackMismatch],
    analysis: mwcc_dump.MwccStackAnalysis,
) -> dict[str, list[tuple[StackMismatch, mwcc_dump.MwccStackRef]]]:
    refs_by_sig: dict[str, list[mwcc_dump.MwccStackRef]] = defaultdict(list)
    for slot in analysis.slots.values():
        for ref in slot.refs:
            if ref.kind not in {"mem", "ptr", "indexed"}:
                continue
            refs_by_sig[stack_inst_signature(ref.instruction)].append(ref)

    matched: dict[str, list[tuple[StackMismatch, mwcc_dump.MwccStackRef]]] = defaultdict(list)
    used: set[tuple[str, int]] = set()
    for item in mismatches:
        sig = stack_inst_signature(item.current_inst)
        for ref in refs_by_sig.get(sig, []):
            if (
                is_literal_stack_slot(ref.slot)
                and ref.numeric_offset is not None
                and item.current_offset != ref.numeric_offset
            ):
                continue
            key = (ref.slot, ref.line_no)
            if key in used:
                continue
            matched[ref.slot].append((item, ref))
            used.add(key)
            break
    return dict(matched)


def source_var_map(source_locals: list[SourceLocal]) -> dict[str, SourceLocal]:
    return {
        local.name: local
        for local in source_locals
        if local.kind == "var" and not local.name.startswith("_")
    }


def named_local_movements(
    matched: dict[str, list[tuple[StackMismatch, mwcc_dump.MwccStackRef]]],
    source_locals: list[SourceLocal],
) -> list[LocalMovement]:
    vars_by_name = source_var_map(source_locals)
    movements: list[LocalMovement] = []
    for name, refs in matched.items():
        source = vars_by_name.get(name)
        if source is None:
            continue
        deltas = Counter(
            mismatch.delta
            for mismatch, _ref in refs
            if mismatch.delta is not None
        )
        if not deltas:
            continue
        delta, count = deltas.most_common(1)[0]
        movements.append(
            LocalMovement(
                name=name,
                delta=delta,
                count=count,
                refs=[
                    pair
                    for pair in refs
                    if pair[0].delta == delta
                ],
                source=source,
            )
        )
    movements.sort(key=lambda item: (item.source.index, item.name))
    strong = [item for item in movements if item.count >= 2]
    return strong or movements


def named_source_order(source_locals: list[SourceLocal]) -> list[SourceLocal]:
    return [
        local
        for local in source_locals
        if local.kind == "var" and not local.name.startswith("_")
    ]


CALL_RE_TEMPLATE = r"\b{func}\s*\("
CALL_SKIP_NAMES = {
    "if",
    "for",
    "while",
    "switch",
    "return",
    "sizeof",
}


def called_function_names(body: str) -> set[str]:
    names = set(re.findall(r"\b([A-Za-z_]\w*)\s*\(", strip_c_comments(body)))
    return names - CALL_SKIP_NAMES


def count_function_calls(body: str, func: str) -> int:
    return len(re.findall(CALL_RE_TEMPLATE.format(func=re.escape(func)), strip_c_comments(body)))


def source_has_address_taken(body: str, name: str) -> bool:
    return re.search(rf"&\s*{re.escape(name)}\b", strip_c_comments(body)) is not None


def inline_helper_hoist_suggestions(
    source: Path,
    func: str,
    movements: list[LocalMovement],
) -> list[str]:
    """Suggest hoisting address-taken inline-helper locals to the caller.

    Inlined helper locals often appear as normal current-C stack slots, but
    objdiff only tells us their final r1 offsets. A strong source-level clue is
    a moved local name that is declared inside a reachable `inline` helper and
    passed by address, especially when that helper is called more than once. In
    that case the target may want separate caller-owned buffers passed into the
    helper, as in:

        Vec3 a, b;
        helper(gobj, 0, &a);
        helper(gobj, 1, &b);
    """
    moved_names = {movement.name for movement in movements}
    if not moved_names or not source.exists():
        return []

    funcs = extract_source_functions(source)
    by_name = {item.name: item for item in funcs}
    target = by_name.get(func)
    if target is None:
        return []

    inline_helpers = {item.name: item for item in funcs if item.is_inline}
    reachable: dict[str, SourceFunction] = {}
    queue = [
        name
        for name in called_function_names(target.body)
        if name in inline_helpers
    ]
    while queue:
        name = queue.pop(0)
        if name in reachable:
            continue
        helper = inline_helpers[name]
        reachable[name] = helper
        for callee in called_function_names(helper.body):
            if callee in inline_helpers and callee not in reachable:
                queue.append(callee)

    if not reachable:
        return []

    reachable_bodies = [target.body] + [helper.body for helper in reachable.values()]
    suggestions: list[str] = []
    seen: set[tuple[str, str]] = set()
    for helper in reachable.values():
        helper_locals = parse_source_locals_from_body(helper.body, helper.start_line)
        helper_call_count = sum(count_function_calls(body, helper.name) for body in reachable_bodies)
        if helper_call_count < 2:
            continue
        for local in helper_locals:
            if local.kind != "var" or local.name not in moved_names:
                continue
            if not source_has_address_taken(helper.body, local.name):
                continue
            key = (helper.name, local.name)
            if key in seen:
                continue
            seen.add(key)
            suggestions.append(
                f"try hoisting `{local.type_text} {local.name}` out of inline helper "
                f"`{helper.name}` into `{func}` (or another caller): it is "
                f"address-taken and the helper is reached {helper_call_count}x; "
                f"declare separate locals such as `{local.name}1`/`{local.name}2` "
                "and pass them by pointer/reference through the helper chain"
            )
    return suggestions


def inner_scope_hoist_suggestions(movements: list[LocalMovement]) -> list[str]:
    """Suggest hoisting moved locals that are declared inside a nested block."""
    suggestions: list[str] = []
    for movement in movements:
        local = movement.source
        if local.kind != "var" or local.scope_depth <= 0:
            continue
        amount = abs(movement.delta)
        direction = "higher" if movement.delta > 0 else "lower"
        suggestions.append(
            f"try hoisting `{local.type_text} {local.name}` out of its inner block "
            f"to the parent function scope: it is declared inside a nested scope "
            f"and current stack refs are {amount} bytes {direction} than target; "
            "if related locals move with it, hoist them together and adjust padding "
            "around the hoisted declarations"
        )
    return suggestions


def source_names_between(
    first: SourceLocal,
    second: SourceLocal,
    source_locals: list[SourceLocal],
) -> list[SourceLocal]:
    lo, hi = sorted((first.index, second.index))
    return [
        local
        for local in source_locals
        if lo < local.index < hi and local.kind == "var" and not local.name.startswith("_")
    ]


def reorder_suggestion(
    movements: list[LocalMovement],
    source_locals: list[SourceLocal],
) -> Optional[str]:
    movement_by_name = {item.name: item for item in movements}
    ordered = [local for local in named_source_order(source_locals) if local.name in movement_by_name]
    best_pair: Optional[tuple[LocalMovement, LocalMovement]] = None
    for left, right in zip(ordered, ordered[1:]):
        a = movement_by_name[left.name]
        b = movement_by_name[right.name]
        if a.delta == -b.delta and a.delta != 0:
            best_pair = (a, b)
            break
    if best_pair is None:
        for i, a in enumerate(movements):
            for b in movements[i + 1:]:
                if a.delta == -b.delta and a.delta != 0 and not source_names_between(a.source, b.source, source_locals):
                    best_pair = (a, b)
                    break
            if best_pair is not None:
                break
    if best_pair is None:
        return None
    a, b = sorted(best_pair, key=lambda item: item.source.index)
    amount = abs(a.delta)
    return (
        f"try swapping the declaration order of `{a.name}` and `{b.name}` "
        f"(opposite {amount}-byte movements)"
    )


def padding_suggestion(
    frame_target: Optional[int],
    frame_current: Optional[int],
    source_locals: list[SourceLocal],
) -> Optional[str]:
    if frame_target is None or frame_current is None:
        return None
    delta = frame_current - frame_target
    if delta == 0:
        return None
    pad = next((local for local in source_locals if local.kind == "pad_stack" and local.size is not None), None)
    if pad is not None and pad.size is not None:
        current = pad.raw.rstrip(";")
        if delta > 0:
            new_size = max(0, pad.size - delta)
            return (
                f"reduce stack padding by {bytes_text(delta)} "
                f"(try `PAD_STACK({new_size})` instead of `{current}`)"
            )
        new_size = pad.size + abs(delta)
        return (
            f"increase stack padding by {bytes_text(delta)} "
            f"(try `PAD_STACK({new_size})` instead of `{current}`)"
        )
    pad_array = next((local for local in source_locals if local.kind == "pad" and local.size is not None), None)
    if pad_array is not None and pad_array.size is not None:
        if delta > 0:
            new_size = max(0, pad_array.size - delta)
            return (
                f"reduce `{pad_array.name}` padding by {bytes_text(delta)} "
                f"(try `{pad_array.name}[{new_size}]`)"
            )
        new_size = pad_array.size + abs(delta)
        return (
            f"increase `{pad_array.name}` padding by {bytes_text(delta)} "
            f"(try `{pad_array.name}[{new_size}]`)"
        )
    return None


def movement_text(movement: LocalMovement) -> str:
    direction = "higher" if movement.delta > 0 else "lower"
    return (
        f"`{movement.name}`: current stack refs are {bytes_text(movement.delta)} "
        f"{direction} than target ({fmt_delta(movement.delta)}, {movement.count} refs)"
    )


def print_compact_stack_diagnosis(
    movements: list[LocalMovement],
    suggestions: list[str],
    source_locals: list[SourceLocal],
) -> None:
    if suggestions:
        print("Suggested stack fixes:")
        for suggestion in suggestions:
            print(f"  {suggestion}")
    elif not movements:
        named = [local.name for local in named_source_order(source_locals)]
        if named:
            print("No actionable named local movement found.")
        else:
            print("No explicit named stack locals found in the C source.")

    if movements:
        if suggestions:
            print()
        print("Named local movement:")
        for movement in movements:
            print(f"  {movement_text(movement)}")


def print_mwcc_stack_facts(
    analysis: mwcc_dump.MwccStackAnalysis,
    dump_path: Optional[Path],
    mismatches: list[StackMismatch],
) -> list[str]:
    print(f"mwcc_debug current-C stack facts ({analysis.pass_name}):")
    if dump_path is not None:
        print(f"  dump: {dump_path}")

    for line in mwcc_dump.format_frame_summary(analysis):
        print(line)

    summaries = mwcc_dump.format_stack_slot_summaries(analysis, max_slots=None)
    if summaries:
        for line in summaries:
            print(line)
    else:
        print("  stack slots: none recognized")

    matched = collect_current_slot_matches(mismatches, analysis)
    if matched:
        print("  mismatched current instructions mapped to mwcc slots:")
        for slot_name in sorted(matched):
            pairs = matched[slot_name]
            print(f"    {slot_name}: {len(pairs)} matched refs")
            for mismatch, ref in pairs[:4]:
                delta = fmt_delta(mismatch.delta)
                target = fmt_off(mismatch.target_offset)
                current = fmt_off(mismatch.current_offset)
                print(
                    "      "
                    f"{ref.block or '?'}:{ref.line_no} {ref.instruction}; "
                    f"objdiff {target}->{current} ({delta})"
                )
            if len(pairs) > 4:
                print(f"      ... {len(pairs) - 4} more refs")

    return mwcc_stack_tags(analysis)


def mwcc_stack_tags(analysis: mwcc_dump.MwccStackAnalysis) -> list[str]:
    tags: list[str] = []
    for slot in analysis.slots.values():
        if slot.has_conversion:
            tags.append("conversion")
        if slot.indexed_ops:
            tags.append("indexed")
        if mwcc_dump.has_vec3_deltas(slot.deltas) and slot.store_ops.get("stfs", 0) >= 3:
            tags.append("vec3")
    return tags


def print_delta_summary(mismatches: list[StackMismatch]) -> Counter[int]:
    deltas = Counter(item.delta for item in mismatches if item.delta is not None)
    if not deltas:
        print("Offset delta groups (current - target): none")
        return Counter()

    print("Offset delta groups (current - target):")
    for delta, count in deltas.most_common():
        print(f"  {fmt_delta(delta)}: {count} refs")
    return deltas


def print_frame_comparison(frame_target: Optional[int], frame_current: Optional[int]) -> None:
    if frame_target is None and frame_current is None:
        return
    print("Frame:")
    print(f"  target: {frame_text(frame_target)}")
    print(f"  current: {frame_text(frame_current)}")
    if frame_target is not None and frame_current is not None and frame_target != frame_current:
        print(f"  delta: {fmt_delta(frame_current - frame_target)} bytes")
    print()


def frame_text(frame: Optional[int]) -> str:
    if frame is None:
        return "unknown"
    return f"0x{frame:x} ({frame} bytes)"


def print_guidance(
    summary: DiffSummary,
    frame_target: Optional[int],
    frame_current: Optional[int],
    mismatches: list[StackMismatch],
    deltas: Counter[int],
    mwcc_tags: list[str],
) -> None:
    print("Guidance:")
    stack_count = summary.counts.get("stack", 0)
    frame_count = summary.counts.get("frame", 0)

    if not mismatches and not stack_count and not frame_count:
        print("  checkdiff did not report stack/frame mismatches; stack mode is probably not the next useful mode.")
        return

    if deltas:
        common_delta, common_count = deltas.most_common(1)[0]
        coverage = common_count / max(1, sum(deltas.values()))
        if coverage >= 0.75 and len(deltas) == 1:
            print(
                f"  all paired r1 references moved by {fmt_delta(common_delta)}; "
                "look for one extra/missing local, aggregate, or PAD_STACK-sized gap affecting the whole frame."
            )
        elif coverage >= 0.60:
            print(
                f"  the dominant r1 movement is {fmt_delta(common_delta)} "
                f"({common_count}/{sum(deltas.values())} refs), but there are secondary deltas; "
                "start with the dominant local/aggregate, then re-run checkdiff."
            )
        else:
            print(
                "  stack offsets split across several deltas; this looks more like local ordering, "
                "aggregate shape, or hidden-temp placement than a single frame-size issue."
            )

    if "conversion" in mwcc_tags:
        print("  mwcc_debug found an int/float conversion stack temp; check nearby casts and field types.")
    if "indexed" in mwcc_tags:
        print("  mwcc_debug found an indexed stack array; compare array declaration order and element type/size.")
    if "vec3" in mwcc_tags:
        print("  mwcc_debug found Vec3-like stack stores; try grouping or ungrouping scalar stores around that local.")

    print(
        "  target slot names are not recoverable from asm alone; use the offset table to anchor the target "
        "and mwcc_debug's current-slot facts to decide which C local to move or reshape."
    )


def diagnose_stack(args: argparse.Namespace) -> int:
    if not REPORT_PATH.exists():
        print(
            f"error: missing {REPORT_PATH}; pass --root/ORCH_GAME_REPO_ROOT for the Melee checkout",
            file=sys.stderr,
        )
        return 1

    func = args.function
    obj_path = checkdiff.find_unit_for_function(func)
    if obj_path is None:
        print(f"error: could not find function {func!r} in {REPORT_PATH}", file=sys.stderr)
        return 1

    source = source_path_for_obj(obj_path)
    source_locals = parse_source_locals(source, func) if source.exists() else []

    compiled = checkdiff.build_unit(obj_path)
    if compiled is None:
        return 1

    try:
        diff = checkdiff.run_diff(obj_path, compiled.obj, func, capture=True, strict=False)
    finally:
        compiled.tmpdir.cleanup()

    if diff.stderr:
        print(diff.stderr, file=sys.stderr, end="")
    if not diff.stdout:
        print("error: objdiff produced no output", file=sys.stderr)
        return 1

    summary = parse_diff_summary(diff.stdout)
    diff_lines = parse_diff_lines(diff.stdout)
    frame_target, frame_current = find_frame_sizes(diff_lines)
    mismatches = collect_stack_mismatches(diff_lines)

    dump_rc, dump_stdout, dump_stderr, stack_analysis, dump_path = run_mwcc_dump(
        func, args.runner
    )

    deltas = Counter(item.delta for item in mismatches if item.delta is not None)
    matched: dict[str, list[tuple[StackMismatch, mwcc_dump.MwccStackRef]]] = {}
    mwcc_tags: list[str] = []
    if dump_rc == 0:
        if stack_analysis is None:
            pass
        else:
            matched = collect_current_slot_matches(mismatches, stack_analysis)
            mwcc_tags = mwcc_stack_tags(stack_analysis)
    movements = named_local_movements(matched, source_locals)
    suggestions = []
    pad_suggestion = padding_suggestion(frame_target, frame_current, source_locals)
    reorder = reorder_suggestion(movements, source_locals)
    if pad_suggestion is not None:
        suggestions.append(pad_suggestion)
    if reorder is not None:
        suggestions.append(reorder)
    for suggestion in inner_scope_hoist_suggestions(movements):
        if suggestion not in suggestions:
            suggestions.append(suggestion)
    for suggestion in inline_helper_hoist_suggestions(source, func, movements):
        if suggestion not in suggestions:
            suggestions.append(suggestion)

    print_compact_stack_diagnosis(movements, suggestions, source_locals)

    if args.show_lines or args.show_mwcc:
        print()
        print_frame_comparison(frame_target, frame_current)
        print_delta_summary(mismatches)
        if args.show_lines:
            print()
            print_stack_table(mismatches)
        print()

    if dump_rc == 0 and args.show_mwcc:
        if stack_analysis is None:
            print("mwcc_debug current-C stack facts: unavailable")
        else:
            print_mwcc_stack_facts(stack_analysis, dump_path, mismatches)
        print()
    else:
        if dump_rc != 0 and args.show_mwcc:
            print("mwcc_debug current-C stack facts: unavailable")
            if dump_stdout.strip():
                print("  stdout:")
                for line in dump_stdout.strip().splitlines()[:8]:
                    print(f"    {line}")
            if dump_stderr.strip():
                print("  stderr:")
                for line in dump_stderr.strip().splitlines()[:8]:
                    print(f"    {line}")
            print()

    if args.show_mwcc:
        print_guidance(summary, frame_target, frame_current, mismatches, deltas, mwcc_tags)
    return 0


def print_regflow_lines(lines: list[RegFlowLine]) -> None:
    if not lines:
        return
    print("Register-only instructions:")
    for item in lines:
        addr = fmt_off(item.line.target_addr)
        print(f"  {addr}: {item.line.target_inst}  |  {item.line.current_inst}")


def diagnose_regflow(args: argparse.Namespace) -> int:
    if not REPORT_PATH.exists():
        print(
            f"error: missing {REPORT_PATH}; pass --root/ORCH_GAME_REPO_ROOT for the Melee checkout",
            file=sys.stderr,
        )
        return 1

    func = args.function
    obj_path = checkdiff.find_unit_for_function(func)
    if obj_path is None:
        print(f"error: could not find function {func!r} in {REPORT_PATH}", file=sys.stderr)
        return 1

    source = source_path_for_obj(obj_path)
    compiled = checkdiff.build_unit(obj_path)
    if compiled is None:
        return 1

    try:
        diff = checkdiff.run_diff(obj_path, compiled.obj, func, capture=True, strict=False)
    finally:
        compiled.tmpdir.cleanup()

    if diff.stderr:
        print(diff.stderr, file=sys.stderr, end="")
    if not diff.stdout:
        print("error: objdiff produced no output", file=sys.stderr)
        return 1

    diff_lines = parse_diff_lines(diff.stdout)
    all_regflow_lines = collect_regflow_lines(diff_lines)
    regflow_lines = primary_regflow_cluster(all_regflow_lines)
    mappings = collect_regflow_mappings(regflow_lines)

    dump_rc, dump_stdout, dump_stderr, _stack_analysis, dump_path = run_mwcc_dump(
        func, args.runner
    )

    print_regflow_mappings(regflow_lines, mappings)
    if regflow_lines:
        print()
        print_regflow_roles(regflow_lines, mappings)

    if dump_rc == 0 and dump_path is not None and dump_path.exists():
        section = dump_path.read_text(errors="replace")
        before_lines = pass_lines(section, "BEFORE GLOBAL OPTIMIZATION")
        setup = setup_trace(before_lines)
        if setup:
            print()
            print("mwcc_debug current-C setup before coloring:")
            for line in setup:
                print(f"  {line}")
    else:
        print()
        print("mwcc_debug setup trace unavailable.")
        if dump_stdout.strip():
            for line in dump_stdout.strip().splitlines()[:4]:
                print(f"  stdout: {line}")
        if dump_stderr.strip():
            for line in dump_stderr.strip().splitlines()[:4]:
                print(f"  stderr: {line}")

    if source.exists():
        print()
        print_source_regflow_leads(source, func, mappings)

    if args.show_lines:
        print()
        print_regflow_lines(regflow_lines)

    return 0


def diagnose_inlines(args: argparse.Namespace) -> int:
    if not REPORT_PATH.exists():
        print(
            f"error: missing {REPORT_PATH}; pass --root/ORCH_GAME_REPO_ROOT for the Melee checkout",
            file=sys.stderr,
        )
        return 1

    func = args.function
    obj_path = checkdiff.find_unit_for_function(func)
    if obj_path is None:
        print(f"error: could not find function {func!r} in {REPORT_PATH}", file=sys.stderr)
        return 1

    compiled = checkdiff.build_unit(obj_path)
    if compiled is None:
        return 1

    try:
        diff = checkdiff.run_diff(obj_path, compiled.obj, func, capture=True, strict=False)
    finally:
        compiled.tmpdir.cleanup()

    if diff.stderr:
        print(diff.stderr, file=sys.stderr, end="")
    if not diff.stdout:
        print("error: objdiff produced no output", file=sys.stderr)
        return 1

    summary = parse_diff_summary(diff.stdout)
    diff_lines = parse_diff_lines(diff.stdout)
    regflow_lines = collect_regflow_lines(diff_lines)

    dump_rc, dump_stdout, dump_stderr, _stack_analysis, dump_path = run_mwcc_dump(
        func, args.runner
    )
    if dump_rc != 0 or dump_path is None or not dump_path.exists():
        print("error: mwcc_debug dump unavailable", file=sys.stderr)
        if dump_stdout.strip():
            print(dump_stdout, file=sys.stderr, end="" if dump_stdout.endswith("\n") else "\n")
        if dump_stderr.strip():
            print(dump_stderr, file=sys.stderr, end="" if dump_stderr.endswith("\n") else "\n")
        return 1

    section = read_function_dump(dump_path, func)
    final_lines = pass_lines(section, "FINAL CODE AFTER INSTRUCTION SCHEDULING")
    if not final_lines:
        print("error: final scheduled mwcc_debug pass not found", file=sys.stderr)
        return 1

    blocks = parse_scheduled_blocks(final_lines)
    register_candidates = collect_inline_candidates(regflow_lines, blocks)
    target_setup_candidates = collect_target_setup_candidates(diff_lines, blocks)
    call_expansion_candidates = collect_call_expansion_candidates(diff_lines)

    print(f"Diff: {summary.raw or 'unknown'}")
    print(f"Mismatches: {format_counts(summary)}")
    print()
    print_inline_candidates(register_candidates)
    print()
    print_target_setup_candidates(target_setup_candidates)
    print()
    print_call_expansion_candidates(call_expansion_candidates)
    return 0


def diagnose_raw(args: argparse.Namespace) -> int:
    if not REPORT_PATH.exists():
        print(
            f"error: missing {REPORT_PATH}; pass --root/ORCH_GAME_REPO_ROOT for the Melee checkout",
            file=sys.stderr,
        )
        return 1

    func = args.function
    obj_path = checkdiff.find_unit_for_function(func)
    if obj_path is None:
        print(f"error: could not find function {func!r} in {REPORT_PATH}", file=sys.stderr)
        return 1

    dump_rc, dump_stdout, dump_stderr, _stack_analysis, dump_path = run_mwcc_dump(
        func, args.runner
    )
    if dump_rc != 0 or dump_path is None or not dump_path.exists():
        print("error: mwcc_debug dump unavailable", file=sys.stderr)
        if dump_stdout.strip():
            print(dump_stdout, file=sys.stderr, end="" if dump_stdout.endswith("\n") else "\n")
        if dump_stderr.strip():
            print(dump_stderr, file=sys.stderr, end="" if dump_stderr.endswith("\n") else "\n")
        return 1

    section = dump_path.read_text(errors="replace")
    if "Starting function " not in section:
        extracted = mwcc_dump.extract_function(section, func)
        if extracted is not None:
            section = extracted

    print(section, end="" if section.endswith("\n") else "\n")
    return 0


def build_parser() -> argparse.ArgumentParser:
    root_parent = argparse.ArgumentParser(add_help=False)
    root_parent.add_argument(
        "--root",
        "--project-root",
        dest="root",
        type=Path,
        default=ROOT,
        help="Project checkout root (default: ORCH_GAME_REPO_ROOT or cwd markers)",
    )

    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[root_parent],
    )
    subparsers = parser.add_subparsers(dest="mode", required=True)

    stack = subparsers.add_parser(
        "stack",
        help="diagnose stack/frame mismatches for one function",
        parents=[root_parent],
    )
    stack.add_argument("function", help="function name")
    stack.add_argument(
        "--runner",
        choices=("auto", "wibo", "wine"),
        default="auto",
        help="mwcc_dump runner (default: auto)",
    )
    stack.add_argument(
        "--show-lines",
        action="store_true",
        help="also print the per-instruction stack/frame mismatch table",
    )
    stack.add_argument(
        "--show-mwcc",
        action="store_true",
        help="also print raw mwcc_debug stack-slot facts and guidance",
    )
    stack.set_defaults(func=diagnose_stack)

    regflow = subparsers.add_parser(
        "regflow",
        help="diagnose compact register-flow/register-coloring mismatches",
        parents=[root_parent],
    )
    regflow.add_argument("function", help="function name")
    regflow.add_argument(
        "--runner",
        choices=("auto", "wibo", "wine"),
        default="auto",
        help="mwcc_dump runner (default: auto)",
    )
    regflow.add_argument(
        "--show-lines",
        action="store_true",
        help="also print the register-only target/current instruction window",
    )
    regflow.set_defaults(func=diagnose_regflow)

    inlines = subparsers.add_parser(
        "inlines",
        help="find objective boundaries where inline extraction may help",
        parents=[root_parent],
    )
    inlines.add_argument("function", help="function name")
    inlines.add_argument(
        "--runner",
        choices=("auto", "wibo", "wine"),
        default="auto",
        help="mwcc_dump runner (default: auto)",
    )
    inlines.set_defaults(func=diagnose_inlines)

    raw = subparsers.add_parser(
        "raw",
        help="print the function-filtered raw mwcc_debug dump",
        parents=[root_parent],
    )
    raw.add_argument("function", help="function name")
    raw.add_argument(
        "--runner",
        choices=("auto", "wibo", "wine"),
        default="auto",
        help="mwcc_dump runner (default: auto)",
    )
    raw.set_defaults(func=diagnose_raw)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if Path(args.root) != ROOT:
        print(
            "error: --root must be supplied before imports take effect; rerun as "
            f"`ORCH_GAME_REPO_ROOT={args.root} {sys.argv[0]} ...` or put --root before the mode",
            file=sys.stderr,
        )
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

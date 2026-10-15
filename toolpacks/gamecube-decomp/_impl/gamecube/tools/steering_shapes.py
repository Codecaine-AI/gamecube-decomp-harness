#!/usr/bin/env python3
"""Shape classifier for source edit groups: steering, directive or real.

A steering edit changes the source form but not the program's behaviour (a
single-use temp, an accessor swap, an if/ternary rewrite, swapped operands,
...). It is a probe: it shows what codegen the original needs, it is not the
fix. A real edit changes what the program does (a literal, a callee, a
condition, a canonical type, control flow, ...). See
objectives/sms-real-codegen/plan.md sections 0 and 2.2.

``classify_group(removed, added)`` parses both sides into flat statement
items, folds the steering forms away one family at a time (temps inlined,
ternaries expanded, operands sorted, typedefs resolved, ...) and classifies
whatever is left with the real shapes. Shapes are text evidence only: the IR
oracle decides whether an edit is behaviour-identical, and a real shape is
positive evidence the gate still has to confirm.

Shared by the review lints (sms_fidelity/rules.py, loaded by path like
agent_comments.py) and the steering gate tools. Stdlib only.
"""

from __future__ import annotations

import difflib
import math
import os
import re
import struct
from pathlib import Path

STEERING_SHAPES = ("temp_alias", "accessor_swap", "ternary_if", "operand_order", "statement_permutation",
                   "decl_reorder", "type_spelling", "float_form", "compound_assign_split", "bool_form")
DIRECTIVE_SHAPES = ("codegen_directive",)
REAL_SHAPES = ("literal_change", "member_change", "callee_change", "call_added", "call_removed",
               "condition_change", "type_change", "control_flow_change", "definition_added_removed",
               "initializer_change")
# Same-behaviour rewrites the sms_form_rewrite lint reports (operand order is sms_operand_flip's).
FORM_SHAPES = ("ternary_if", "statement_permutation", "decl_reorder", "type_spelling", "float_form",
               "compound_assign_split", "bool_form")

# Item-local normalization passes (each one is a steering shape).
ITEM_PASSES = ("type_spelling", "float_form", "operand_order", "bool_form", "compound_assign_split")
ALL_PASSES = frozenset(ITEM_PASSES)
NO_PASSES = frozenset()

# Dolphin SDK basic types (libs/dolphin/include/dolphin/types.h) plus the
# stdint names MSL defines; used when a repo has no headers to scan.
DOLPHIN_TYPEDEFS = {
    "s8": "signed char", "u8": "unsigned char", "s16": "short", "u16": "unsigned short",
    "s32": "int", "u32": "unsigned int", "s64": "long long", "u64": "unsigned long long",
    "f32": "float", "f64": "double", "BOOL": "int", "Ptr": "char *",
    "int8_t": "signed char", "uint8_t": "unsigned char", "int16_t": "short", "uint16_t": "unsigned short",
    "int32_t": "int", "uint32_t": "unsigned int", "int64_t": "long long", "uint64_t": "unsigned long long",
    "size_t": "unsigned int", "Mtx": "float [3][4]", "MtxPtr": "float (*)[4]",
}

# --------------------------------------------------------------------------
# Accessor / inline-hop swap (moved from sms_fidelity/rules.py; same return
# shape: (kind, before, after) or None, on token lists from TOKEN).
# --------------------------------------------------------------------------
TOKEN = re.compile(r'[A-Za-z_]\w*|\d[\w.]*|->|::|<<=|>>=|<=|>=|==|!=|&&|\|\||\+\+|--|[-+*/%&|^]=|\S')
MEMBER_CHAIN = re.compile(r'(?:this->)?[A-Za-z_]\w*(?:\[[^\[\]]*\])?')
ACCESSOR_CALL = re.compile(r'(?:this->)?(?P<name>[A-Za-z_]\w*)\([^()]*\)')
MERGE_GAP = 3  # equal tokens allowed between two edits that form one swap (`m[i]` -> `get(i)`)
INLINE_HOP = re.compile(r'(?P<lead>->|\.)?(?P<name>[A-Za-z_]\w*)\([^()]*\)(?P<trail>->|\.)?')
CALL_NAME = re.compile(r'[A-Za-z_]\w*')
HOP_CHAIN = re.compile(r'(?:[A-Za-z_]\w*\(\)(?:->|\.))+[A-Za-z_]\w*')  # `getChildren().push_back`


def member_like(name, tokens, index, call_name):
    stem = name[1:] if re.match(r'm[A-Z_]', name) else name.lstrip('_')
    return (index > 0 and tokens[index - 1] in ('->', '.')) or bool(re.match(r'(?:m[A-Z_]|unk|_)', name)) or call_name.lower() == 'get' + stem.lower()


def field_name(text):
    return re.match(r'(?:this->)?([A-Za-z_]\w*)', text).group(1)


def accessor_swap(old, new):
    """(kind, before, after) when new differs from old only by an accessor or inline hop.

    ``old``/``new`` are TOKEN lists (strings are tokenized with TOKEN)."""
    if isinstance(old, str):
        old = TOKEN.findall(strip_comments(old))
    if isinstance(new, str):
        new = TOKEN.findall(strip_comments(new))
    opcodes = difflib.SequenceMatcher(a=old, b=new, autojunk=False).get_opcodes()
    edits = [index for index, op in enumerate(opcodes) if op[0] != 'equal']
    if not edits:
        return None
    first, last = edits[0], edits[-1]
    if any(opcodes[index][0] == 'equal' and opcodes[index][2] - opcodes[index][1] > MERGE_GAP for index in range(first, last)):
        return None
    tag, i1, j1 = opcodes[first][0], opcodes[first][1], opcodes[first][3]
    i2, j2 = opcodes[last][2], opcodes[last][4]
    if first != last:
        tag = 'replace'
        while i2 > i1 and j2 > j1 and old[i2 - 1] == new[j2 - 1]:
            i2, j2 = i2 - 1, j2 - 1
        while i1 < i2 and j1 < j2 and old[i1] == new[j1]:
            i1, j1 = i1 + 1, j1 + 1
    before, after = ''.join(old[i1:i2]), ''.join(new[j1:j2])
    if tag == 'replace':
        call = ACCESSOR_CALL.fullmatch(after)
        field = MEMBER_CHAIN.fullmatch(before)
        if call and field and member_like(field_name(before), old, i1, call['name']):
            return 'field_to_accessor', before, after
        call = ACCESSOR_CALL.fullmatch(before)
        field = MEMBER_CHAIN.fullmatch(after)
        if call and field and member_like(field_name(after), new, j1, call['name']):
            return 'accessor_to_field', before, after
        # an inline's body written out, same arguments: `->add(x)` <-> `->getChildren().push_back(x)`
        if old[i2:i2 + 1] == ['('] and new[j2:j2 + 1] == ['(']:
            if CALL_NAME.fullmatch(before) and HOP_CHAIN.fullmatch(after):
                return 'inline_hop_added', before, after
            if HOP_CHAIN.fullmatch(before) and CALL_NAME.fullmatch(after):
                return 'inline_hop_removed', before, after
        return None
    hop = INLINE_HOP.fullmatch(after if tag == 'insert' else before)
    if hop and bool(hop['lead']) != bool(hop['trail']):
        return ('inline_hop_added' if tag == 'insert' else 'inline_hop_removed'), before, after
    return None


# --------------------------------------------------------------------------
# Lexing
# --------------------------------------------------------------------------
_COMMENT_STRING = re.compile(r'//[^\n]*|/\*.*?(?:\*/|\Z)|"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'', re.S)
_LEX = re.compile(r'''
 (?P<ws>\s+)
|(?P<str>[LuU]?"(?:\\.|[^"\\\n])*"?)
|(?P<chr>'(?:\\.|[^'\\\n])*'?)
|(?P<num>0[xX][0-9a-fA-F]+[uUlL]*|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fFlLuU]*)
|(?P<id>[A-Za-z_]\w*)
|(?P<op>>>=|<<=|->\*|\.\.\.|->|::|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||[-+*/%&|^]=|.)
''', re.S | re.X)
TYPE_WORDS = {"void", "bool", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "wchar_t"}
CV_WORDS = {"const", "volatile"}
STORAGE_WORDS = {"static", "extern", "inline", "register", "mutable", "constexpr", "virtual", "explicit", "friend"}
TAG_WORDS = {"struct", "class", "union", "enum", "typename"}
DECL_LEAD = TYPE_WORDS | CV_WORDS | STORAGE_WORDS | TAG_WORDS
KEYWORDS = DECL_LEAD | {"if", "else", "for", "while", "do", "switch", "case", "default", "return", "break",
                        "continue", "goto", "sizeof", "new", "delete", "this", "true", "false", "operator",
                        "static_cast", "reinterpret_cast", "const_cast", "dynamic_cast", "typedef", "template",
                        "asm", "__asm", "__asm__", "public", "private", "protected", "namespace", "using"}
CXX_CASTS = {"static_cast", "reinterpret_cast", "const_cast", "dynamic_cast"}


def strip_comments(text):
    """Comments replaced by a space (newlines kept), strings and chars untouched."""
    def repl(match):
        body = match.group()
        if body.startswith('//') or body.startswith('/*'):
            return '\n' * body.count('\n') or ' '
        return body
    return _COMMENT_STRING.sub(repl, text)


def tokenize(text):
    """Code tokens of C/C++ text (comments dropped, strings one token)."""
    return [tok for tok, _ in _lex_lines(strip_comments(text).split('\n'))]


def _lex_lines(lines):
    """[(token, line_index)] over comment-free lines; a preprocessor line is one '#...' token."""
    result, index = [], 0
    while index < len(lines):
        line = lines[index]
        if line.lstrip().startswith('#'):
            start, text = index, line.strip()
            while text.endswith('\\') and index + 1 < len(lines):
                index += 1
                text = text[:-1] + ' ' + lines[index].strip()
            result.append(('#' + ' '.join(text[1:].split()), start))
            index += 1
            continue
        for match in _LEX.finditer(line):
            if match.lastgroup != 'ws':
                result.append((match.group(), index))
        index += 1
    return result


def code_line(text):
    return strip_comments(text).strip()


def ends_statement(text):
    code = code_line(text)
    if re.search(r'(?:=|,|\()\s*\{$', code):
        return False  # an initializer list continues on the next line
    return not code or code.startswith('#') or (code[-1] in ';{}' or (code.endswith(':') and not code.endswith('::')))


# --------------------------------------------------------------------------
# Typedefs and canonical types
# --------------------------------------------------------------------------
_TYPEDEF = re.compile(r'^\s*typedef\s+(?P<type>[^;(){}\[\]]+?)\s*\b(?P<name>[A-Za-z_]\w*)\s*;', re.M)


def load_typedefs(repo, roots=("include", "libs")):
    """name -> canonical spelling for every simple typedef under the roots (s32 -> 'int').

    Scans include/ and libs/*/include (any root given). Names spelled two
    different ways are dropped. Falls back to DOLPHIN_TYPEDEFS for missing names."""
    raw, clashes = {}, set()
    repo = Path(repo)
    for root in roots:
        base = repo / root
        if not base.is_dir():
            continue
        for dirpath, _dirs, files in os.walk(base):
            for name in files:
                if not name.endswith(('.h', '.hpp', '.hxx', '.inc')):
                    continue
                try:
                    text = strip_comments((Path(dirpath) / name).read_text(errors='replace'))
                except OSError:
                    continue
                for match in _TYPEDEF.finditer(text):
                    spelling = ' '.join(tokenize(match['type']))
                    alias = match['name']
                    if alias in raw and raw[alias] != spelling:
                        clashes.add(alias)
                    raw[alias] = spelling
    for alias in clashes:
        raw.pop(alias, None)
    table = dict(DOLPHIN_TYPEDEFS)
    table.update(raw)
    resolved = {}
    for alias, spelling in table.items():
        resolved[alias] = canonical_type(tokenize(spelling), table, _seen=frozenset([alias]))
    return resolved


def canonical_builtin(words):
    unsigned = 'unsigned' in words
    signed = 'signed' in words
    if 'char' in words:
        return 'unsigned char' if unsigned else ('signed char' if signed else 'char')
    if 'short' in words:
        return 'unsigned short' if unsigned else 'short'
    if words.count('long') >= 2:
        return 'unsigned long long' if unsigned else 'long long'
    for word in ('double', 'float', 'bool', 'void', 'wchar_t'):
        if word in words:
            return word
    # int, long, signed, unsigned: 32-bit on PowerPC EABI, so long == int.
    return 'unsigned int' if unsigned else 'int'


def canonical_type(tokens, typedefs=None, _seen=frozenset()):
    """Canonical spelling of a type token list: typedefs resolved, builtins
    normalized for PowerPC EABI (long == int), tag keywords, storage, register
    and volatile dropped (volatile/register are codegen directives)."""
    typedefs = DOLPHIN_TYPEDEFS if typedefs is None else typedefs
    tokens = [t for t in tokens if t not in TAG_WORDS and t not in STORAGE_WORDS and t != 'volatile']
    split = next((i for i, t in enumerate(tokens) if t in ('*', '&', '&&', '(', '[')), len(tokens))
    head, tail = tokens[:split], tokens[split:]
    const = 'const' in head
    head = [t for t in head if t != 'const']
    if head and all(t in TYPE_WORDS for t in head):
        base = canonical_builtin(head)
    elif len(head) == 1 and head[0] in typedefs and head[0] not in _seen:
        spelled = tokenize(typedefs[head[0]])
        base = canonical_type(spelled, typedefs, _seen | {head[0]}) if spelled else typedefs[head[0]]
        if base.startswith('const '):
            const, base = True, base[6:]
    else:
        base = ' '.join(_canonical_template_tokens(head, typedefs, _seen))
    out = ('const ' if const else '') + base
    if tail:
        out += ' ' + ' '.join(t for t in tail if t != 'volatile')
    return out.strip()


def _canonical_template_tokens(tokens, typedefs, seen):
    """Resolve typedef names inside template argument lists (TVec3<f32> -> TVec3<float>)."""
    out, depth, arg = [], 0, []
    for tok in tokens:
        if tok == '<':
            depth += 1
            if depth == 1:
                out.append('<')
                arg = []
                continue
        elif tok in ('>', '>>'):
            closes = 2 if tok == '>>' else 1
            if depth >= 1:
                if depth == 1:
                    out.append(canonical_type(arg, typedefs, seen) if arg else '')
                    out.append('>')
                    depth -= 1
                    if closes == 2:
                        out.append('>')
                    continue
                depth -= closes
        elif tok == ',' and depth == 1:
            out.append(canonical_type(arg, typedefs, seen))
            out.append(',')
            arg = []
            continue
        if depth >= 1:
            arg.append(tok)
        else:
            out.append(tok)
    return out


# --------------------------------------------------------------------------
# Expression parser (Pratt) -> tuple AST
# --------------------------------------------------------------------------
BINARY = {
    ',': 1, '=': 2, '+=': 2, '-=': 2, '*=': 2, '/=': 2, '%=': 2, '&=': 2, '|=': 2, '^=': 2, '<<=': 2, '>>=': 2,
    '?': 3, '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8, '==': 9, '!=': 9, '<': 10, '>': 10, '<=': 10, '>=': 10,
    '<<': 11, '>>': 11, '+': 12, '-': 12, '*': 13, '/': 13, '%': 13,
}
ASSIGN_OPS = {op for op, prec in BINARY.items() if prec == 2}
UNARY = {'-', '+', '!', '~', '*', '&'}
COMPARE = {'==', '!=', '<', '>', '<=', '>='}
LOGICAL = {'&&', '||', '!'}


class ParseError(Exception):
    pass


class _Parser:
    def __init__(self, toks, typedefs):
        self.toks = toks
        self.pos = 0
        self.typedefs = typedefs

    def peek(self, offset=0):
        index = self.pos + offset
        return self.toks[index] if index < len(self.toks) else None

    def take(self, expect=None):
        tok = self.peek()
        if tok is None or (expect is not None and tok != expect):
            raise ParseError(f'expected {expect!r}, got {tok!r}')
        self.pos += 1
        return tok

    def expr(self, min_prec=1):
        left = self.unary()
        while True:
            op = self.peek()
            prec = BINARY.get(op)
            if prec is None or prec < min_prec:
                return left
            self.take()
            if op == '?':
                middle = self.expr(2)
                self.take(':')
                right = self.expr(3)
                left = ('tern', left, middle, right)
            elif op in ASSIGN_OPS:
                left = ('assign', op, left, self.expr(prec))
            elif op == ',':
                left = ('bin', ',', left, self.expr(prec + 1))
            else:
                left = ('bin', op, left, self.expr(prec + 1))

    def unary(self):
        tok = self.peek()
        if tok in UNARY:
            self.take()
            return ('un', tok, self.unary())
        if tok in ('++', '--'):
            self.take()
            return ('pre', tok, self.unary())
        if tok == 'sizeof':
            self.take()
            if self.peek() == '(':
                end = _match(self.toks, self.pos)
                body = self.toks[self.pos + 1:end]
                self.pos = end + 1
                return ('sizeof', ' '.join(body))
            return ('sizeof', _render(self.unary()))
        if tok == 'delete':
            self.take()
            if self.peek() == '[':
                self.take('[')
                self.take(']')
            return ('un', 'delete', self.unary())
        if tok == 'new':
            self.take()
            type_parts = list(self.name()) if self.peek() not in ('(',) else []
            while self.peek() in ('*', '&'):
                type_parts.append(self.take())
            args = None
            if self.peek() == '(':
                end = _match(self.toks, self.pos)
                args = _parse_args(self.toks[self.pos + 1:end], self.typedefs)
                self.pos = end + 1
            elif self.peek() == '[':
                end = _match(self.toks, self.pos, '[', ']')
                args = (('raw', '[' + ' '.join(self.toks[self.pos + 1:end]) + ']'),)
                self.pos = end + 1
            return ('new', ''.join(type_parts), args)
        if tok == '(' and self._cast_ahead():
            end = _match(self.toks, self.pos)
            type_toks = tuple(self.toks[self.pos + 1:end])
            self.pos = end + 1
            return ('cast', 'c', type_toks, self.unary())
        return self.postfix(self.primary())

    def _cast_ahead(self):
        try:
            end = _match(self.toks, self.pos)
        except ParseError:
            return False
        inner = self.toks[self.pos + 1:end]
        after = self.toks[end + 1] if end + 1 < len(self.toks) else None
        if not inner or after is None:
            return False
        if not all(re.match(r'[A-Za-z_]\w*$', t) or t in ('::', '<', '>', '>>', ',', '*', '&') or re.match(r'\d', t) for t in inner):
            return False
        idents = [t for t in inner if re.match(r'[A-Za-z_]\w*$', t)]
        if not idents or any(t in KEYWORDS - DECL_LEAD for t in idents):
            return False
        typish = (inner[-1] in ('*', '&') or any(t in TYPE_WORDS or t in CV_WORDS or t in TAG_WORDS for t in idents)
                  or idents[0] in self.typedefs or idents[0] in DOLPHIN_TYPEDEFS or '::' in inner or '<' in inner
                  or bool(re.match(r'[A-Z][a-z]', idents[0])))
        if not typish:
            return False
        if after in ('*', '&', '-', '+') and inner[-1] not in ('*', '&') and not any(t in TYPE_WORDS for t in idents) \
                and idents[0] not in self.typedefs and idents[0] not in DOLPHIN_TYPEDEFS:
            return False
        return bool(re.match(r'[A-Za-z_\d."\'(!~]', after)) or after in ('*', '&', '-', '+', '::', '++', '--')

    def name(self):
        parts = []
        if self.peek() == '::':
            parts.append(self.take())
        parts.append(self.take())
        while True:
            if self.peek() == '<':
                end = _template_end(self.toks, self.pos)
                if end is None:
                    break
                parts.extend(self.toks[self.pos:end + 1])
                self.pos = end + 1
                continue
            if self.peek() == '::' and self.peek(1) is not None and (re.match(r'[A-Za-z_~]', self.peek(1)) or self.peek(1) == 'operator'):
                parts.append(self.take())
                parts.append(self.take())
                continue
            break
        return tuple(parts)

    def primary(self):
        tok = self.peek()
        if tok is None:
            raise ParseError('unexpected end')
        if tok == '(':
            self.take()
            inner = self.expr(1)
            self.take(')')
            return inner
        if tok == '{':
            end = _match(self.toks, self.pos, '{', '}')
            args = _parse_args(self.toks[self.pos + 1:end], self.typedefs)
            self.pos = end + 1
            return ('init', args)
        if tok in CXX_CASTS and self.peek(1) == '<':
            self.take()
            end = _template_end(self.toks, self.pos)
            if end is None:
                raise ParseError('cast without type')
            type_toks = tuple(self.toks[self.pos + 1:end])
            self.pos = end + 1
            self.take('(')
            inner = self.expr(1)
            self.take(')')
            return ('cast', tok, type_toks, inner)
        if re.match(r'[LuU]?"', tok):
            text = self.take()
            while self.peek() is not None and re.match(r'[LuU]?"', self.peek()):
                text = text[:-1] + self.take()[1:]
            return ('str', text)
        if tok.startswith("'"):
            return ('chr', self.take())
        if re.match(r'\.?\d', tok):
            return ('num', self.take())
        if re.match(r'[A-Za-z_~]', tok) or tok == '::':
            if tok in KEYWORDS - {'this', 'true', 'false', 'operator'} - TYPE_WORDS:
                raise ParseError(f'keyword {tok}')
            if tok in TYPE_WORDS:
                words = []
                while self.peek() in TYPE_WORDS:
                    words.append(self.take())
                return ('id', canonical_builtin(words) if len(words) > 1 else words[0])
            return ('id', ''.join(self.name()))
        raise ParseError(f'unexpected {tok!r}')

    def postfix(self, node):
        while True:
            tok = self.peek()
            if tok == '(':
                end = _match(self.toks, self.pos)
                args = _parse_args(self.toks[self.pos + 1:end], self.typedefs)
                self.pos = end + 1
                node = ('call', node, args)
            elif tok == '[':
                end = _match(self.toks, self.pos, '[', ']')
                index = _Parser(self.toks[self.pos + 1:end], self.typedefs).full()
                self.pos = end + 1
                node = ('index', node, index)
            elif tok in ('.', '->'):
                self.take()
                member = ''.join(self.name())
                node = ('mem', tok, node, member)
            elif tok in ('++', '--'):
                self.take()
                node = ('post', tok, node)
            else:
                return node

    def full(self):
        node = self.expr(1)
        if self.pos != len(self.toks):
            raise ParseError(f'trailing {self.toks[self.pos:]}')
        return node


def _match(toks, pos, open_='(', close=')'):
    depth = 0
    for index in range(pos, len(toks)):
        if toks[index] == open_:
            depth += 1
        elif toks[index] == close:
            depth -= 1
            if depth == 0:
                return index
    raise ParseError('unbalanced ' + open_)


def _template_end(toks, pos):
    """Index of the '>' closing a template argument list at toks[pos] == '<', or None."""
    depth = 0
    for index in range(pos, min(len(toks), pos + 24)):
        tok = toks[index]
        if tok == '<':
            depth += 1
        elif tok in ('>', '>>'):
            depth -= 2 if tok == '>>' else 1
            if depth <= 0:
                if depth < 0:
                    return None
                after = toks[index + 1] if index + 1 < len(toks) else None
                if after is None or after in ('(', '::', ')', ',', ';', '{', '*', '&', '>', ']', '=') or re.match(r'[A-Za-z_]', after):
                    return index
                return None
        elif not (re.match(r'[A-Za-z_]\w*$', tok) or tok in ('::', ',', '*', '&') or re.match(r'\d', tok)):
            return None
    return None


def _split_top(toks, sep=','):
    parts, depth, current = [], 0, []
    for tok in toks:
        if tok in ('(', '[', '{'):
            depth += 1
        elif tok in (')', ']', '}'):
            depth -= 1
        if tok == sep and depth == 0:
            parts.append(current)
            current = []
        else:
            current.append(tok)
    parts.append(current)
    return parts


def _parse_args(toks, typedefs):
    if not toks:
        return ()
    return tuple(parse_expr(part, typedefs) for part in _split_top(toks))


def parse_expr(toks, typedefs=None):
    """AST for a token list; ('raw', text) when it does not parse."""
    if not toks:
        return ('raw', '')
    try:
        return _Parser(list(toks), typedefs or DOLPHIN_TYPEDEFS).full()
    except (ParseError, RecursionError, IndexError):
        return ('raw', ' '.join(toks))


# --------------------------------------------------------------------------
# Statements: flat items (robust to diff fragments with unbalanced braces)
# --------------------------------------------------------------------------
CONTROL = {'ctl', 'for', 'else', 'do', '{', '}', 'return', 'break', 'continue', 'goto', 'case', 'label'}


def split_items(toks, typedefs):
    """[(item, line)] from [(token, line)]."""
    items, pending, index, depth = [], [], 0, 0
    pending_line = None

    def flush(kind='stmt'):
        nonlocal pending, pending_line
        if pending:
            for item in _parse_statement([t for t, _ in pending], typedefs, kind):
                items.append((item, pending_line))
        pending, pending_line = [], None

    while index < len(toks):
        tok, line = toks[index]
        if tok.startswith('#') and len(tok) > 1:
            flush()
            items.append((('pp', tok), line))
            index += 1
            continue
        if not pending:
            nxt = toks[index + 1][0] if index + 1 < len(toks) else None
            if tok in ('if', 'while', 'switch', 'for') and nxt == '(':
                try:
                    end = _match([t for t, _ in toks], index + 1)
                except ParseError:
                    end = None
                if end is not None:
                    inner = [t for t, _ in toks[index + 2:end]]
                    if tok == 'for':
                        parts = _split_top(inner, ';')
                        parts = (parts + [[], [], []])[:3]
                        items.append((('for',) + tuple(_for_part(p, typedefs) for p in parts), line))
                    else:
                        items.append((('ctl', tok, parse_expr(inner, typedefs)), line))
                    index = end + 1
                    continue
            if tok in ('else', 'do'):
                items.append(((tok,), line))
                index += 1
                continue
            if tok in ('case', 'default'):
                end = index + 1
                while end < len(toks) and toks[end][0] != ':':
                    end += 1
                label = [t for t, _ in toks[index + 1:end]]
                items.append((('case', parse_expr(label, typedefs) if label else ('id', 'default')), line))
                index = end + 1
                continue
            if re.match(r'[A-Za-z_]\w*$', tok) and nxt == ':' and tok not in KEYWORDS - {'public', 'private', 'protected'}:
                items.append((('label', tok), line))
                index += 2
                continue
        if tok == '{':
            prev = pending[-1][0] if pending else None
            if pending and depth == 0 and prev in ('=', ',', '(', 'return') or depth > 0:
                try:
                    end = _match([t for t, _ in toks], index, '{', '}')
                except ParseError:
                    end = None
                if end is not None:
                    pending.extend(toks[index:end + 1])
                    index = end + 1
                    continue
            flush('head')
            items.append((('{',), line))
            index += 1
            continue
        if tok == '}':
            flush()
            items.append((('}',), line))
            index += 1
            continue
        if tok == ';' and depth == 0:
            if pending:
                flush()
            index += 1
            continue
        if tok in ('(', '['):
            depth += 1
        elif tok in (')', ']'):
            depth = max(0, depth - 1)
        if not pending:
            pending_line = line
        pending.append((tok, line))
        index += 1
    flush()
    return items


def _for_part(toks, typedefs):
    if not toks:
        return None
    decls = _parse_decl(toks, typedefs)
    if decls:
        return decls[0] if len(decls) == 1 else ('raw', ' '.join(toks))
    return parse_expr(toks, typedefs)


def _parse_statement(toks, typedefs, kind):
    if kind == 'head':
        return [('head', ' '.join(toks))]
    first = toks[0]
    if first == 'return':
        return [('return', parse_expr(toks[1:], typedefs) if len(toks) > 1 else None)]
    if first in ('break', 'continue') and len(toks) == 1:
        return [(first,)]
    if first == 'goto':
        return [('goto', ' '.join(toks[1:]))]
    if first == 'typedef' or first in ('class', 'struct', 'union', 'enum', 'namespace', 'template', 'using') and '(' not in toks:
        return [('raw', ' '.join(toks))]
    decls = _parse_decl(toks, typedefs)
    if decls:
        return decls
    return [('expr', parse_expr(toks, typedefs))]


def _parse_decl(toks, typedefs):
    """[('decl', type_tokens, name, init_kind, init, dims)] or None."""
    i, n = 0, len(toks)
    spec = []
    while i < n and toks[i] in STORAGE_WORDS | CV_WORDS | TAG_WORDS:
        spec.append(toks[i])
        i += 1
    if i < n and toks[i] in TYPE_WORDS:
        while i < n and toks[i] in TYPE_WORDS | CV_WORDS:
            spec.append(toks[i])
            i += 1
    elif i < n and (re.match(r'[A-Za-z_]\w*$', toks[i]) or toks[i] == '::') and toks[i] not in KEYWORDS:
        try:
            parser = _Parser(toks, typedefs)
            parser.pos = i
            spec.extend(parser.name())
            i = parser.pos
        except (ParseError, IndexError):
            return None
        while i < n and toks[i] in CV_WORDS:
            spec.append(toks[i])
            i += 1
    else:
        return None
    if not spec or all(t in STORAGE_WORDS | CV_WORDS | TAG_WORDS for t in spec):
        return None
    result = []
    for part in _split_top(toks[i:]):
        ptr = []
        j = 0
        while j < len(part) and part[j] in ('*', '&', '&&', 'const', 'volatile'):
            ptr.append(part[j])
            j += 1
        if j >= len(part) or not re.match(r'[A-Za-z_]\w*$', part[j]) or part[j] in KEYWORDS:
            return None
        name = part[j]
        j += 1
        while j + 1 < len(part) and part[j] == '::' and (re.match(r'[A-Za-z_]\w*$', part[j + 1]) or part[j + 1] == '~'):
            if part[j + 1] == '~' and j + 2 < len(part):
                name += '::~' + part[j + 2]
                j += 3
            else:
                name += '::' + part[j + 1]
                j += 2
        dims = []
        while j < len(part) and part[j] == '[':
            try:
                end = _match(part, j, '[', ']')
            except ParseError:
                return None
            dims.append(' '.join(part[j + 1:end]))
            j = end + 1
        if j == len(part):
            kind, init = None, None
        elif part[j] == '=':
            kind, init = '=', parse_expr(part[j + 1:], typedefs)
        elif part[j] == '(':
            try:
                end = _match(part, j)
            except ParseError:
                return None
            if end != len(part) - 1 and part[end + 1:] not in (['const'],):
                return None
            params = _signature_params(part[j + 1:end], spec + ptr, typedefs)
            if params is not None:
                # A function declaration: parameter types, and `const` after them in dims.
                kind, init, dims = 'fn', params, part[end + 1:]
            else:
                kind, init = '()', _parse_args(part[j + 1:end], typedefs)
        elif part[j] == '{':
            kind, init = '{}', _parse_args(part[j + 1:-1], typedefs)
        elif part[j] == ':':
            kind, init = ':', parse_expr(part[j + 1:], typedefs)
        else:
            return None
        if not result and len(spec) == 1 and not ptr and spec[0] not in TYPE_WORDS and spec[0] not in typedefs \
                and kind is None and not dims and spec[0][:1].islower() and '<' not in spec:
            pass  # `foo bar;` is still a declaration of an unknown type
        result.append(('decl', tuple(spec + ptr), name, kind, init, tuple(dims)))
    return result or None


def _type_like(toks, typedefs):
    """True when a token list names a type: a builtin or cv word, a typedef, or a
    class-style name (`J3DCallBackPacket`, `JGeometry::TVec3<f32>`, not `TColor::WHITE`)."""
    if any(t in TYPE_WORDS or t in CV_WORDS or t in TAG_WORDS for t in toks):
        return True
    core, depth = [], 0
    for tok in toks:
        if tok == '<':
            depth += 1
        elif tok in ('>', '>>'):
            depth -= 2 if tok == '>>' else 1
        elif depth == 0 and re.match(r'[A-Za-z_]\w*$', tok):
            core.append(tok)
    if not core:
        return False
    last = core[-1]
    return last in typedefs or last in DOLPHIN_TYPEDEFS or bool(re.match(r'[A-Z]\w*[a-z]', last))


def _signature_params(toks, spec, typedefs):
    """Parameter types (names and defaults dropped) when `(toks)` after a declarator is a
    parameter list, not constructor arguments; None when it is arguments."""
    void_return = [t for t in spec if t not in STORAGE_WORDS and t not in CV_WORDS] == ['void']
    if not toks or toks == ['void']:
        return ()  # `T x();` declares a function in C++
    params, typed = [], True
    for part in _split_top(toks):
        if '=' in part:
            part = part[:part.index('=')]  # default argument
        if part == ['...']:
            params.append('...')
            continue
        if '(' in part:  # only a function pointer `T (*name)(args)`; anything else is a call argument
            open_ = part.index('(')
            if open_ == 0 or open_ + 1 >= len(part) or part[open_ + 1] not in ('*', '&'):
                return None
            params.append(' '.join(part))
            continue
        if not part or not all(re.match(r'[A-Za-z_]\w*$', t) or t in ('::', '<', '>', '>>', ',', '*', '&', '&&', '[', ']')
                               or re.match(r'\d', t) for t in part):
            return None
        array = '[' in part  # `f32 m[3]` is a pointer parameter
        if array:
            part = part[:part.index('[')]
        named = len(part) >= 2 and re.match(r'[A-Za-z_]\w*$', part[-1]) and part[-1] not in DECL_LEAD \
            and part[-2] != '::' and (part[-2] in ('*', '&', '&&', '>', '>>') or re.match(r'[A-Za-z_]\w*$', part[-2]))
        kind = part[:-1] if named else part
        if not kind or (any(re.match(r'\d', t) for t in kind) and '<' not in kind):
            return None
        if not (named and re.match(r'[A-Za-z_]\w*$', part[-2])) and not _type_like(kind, typedefs):
            typed = False  # `Type name` is declaration syntax; `T*`/`T` alone needs T to look like a type
        params.append(' '.join(kind + ['*'] if array else kind))
    return tuple(params) if typed or void_return else None


# --------------------------------------------------------------------------
# AST helpers
# --------------------------------------------------------------------------
def _is_node(value):
    return isinstance(value, tuple) and value and isinstance(value[0], str) and value[0] in NODE_KINDS


NODE_KINDS = {'id', 'num', 'str', 'chr', 'un', 'pre', 'post', 'bin', 'nary', 'assign', 'tern', 'call', 'index',
              'mem', 'cast', 'init', 'sizeof', 'new', 'raw'}


def ser(node):
    if node is None:
        return '_'
    if isinstance(node, tuple):
        return '(' + ' '.join(ser(part) for part in node) + ')'
    return str(node)


def walk(node):
    if isinstance(node, tuple):
        yield node
        for part in node:
            yield from walk(part)


def count_calls(node):
    return sum(1 for sub in walk(node) if _is_node(sub) and sub[0] == 'call')


def node_names(node):
    return {sub[1] for sub in walk(node) if _is_node(sub) and sub[0] == 'id'}


def _render(node):
    if node is None:
        return ''
    if not _is_node(node):
        if isinstance(node, tuple):
            return ', '.join(_render(part) for part in node)
        return str(node)
    kind = node[0]
    if kind in ('id', 'num', 'str', 'chr'):
        return node[1]
    if kind == 'raw':
        return node[1]
    if kind == 'un':
        return node[1] + _render_operand(node[2])
    if kind == 'pre':
        return node[1] + _render_operand(node[2])
    if kind == 'post':
        return _render_operand(node[2]) + node[1]
    if kind in ('bin', 'assign'):
        return f'{_render_operand(node[2])} {node[1]} {_render_operand(node[3])}'
    if kind == 'nary':
        return f' {node[1]} '.join(_render_operand(part) for part in node[2])
    if kind == 'tern':
        return f'{_render_operand(node[1])} ? {_render_operand(node[2])} : {_render_operand(node[3])}'
    if kind == 'call':
        return f'{_render_operand(node[1])}({", ".join(_render(a) for a in node[2])})'
    if kind == 'index':
        return f'{_render_operand(node[1])}[{_render(node[2])}]'
    if kind == 'mem':
        return f'{_render_operand(node[2])}{node[1]}{node[3]}'
    if kind == 'cast':
        type_text = node[2] if isinstance(node[2], str) else ' '.join(node[2])
        if node[1] in CXX_CASTS:
            return f'{node[1]}<{type_text}>({_render(node[3])})'
        return f'({type_text}){_render_operand(node[3])}'
    if kind == 'init':
        return '{' + ', '.join(_render(a) for a in node[1]) + '}'
    if kind == 'sizeof':
        return f'sizeof({node[1]})'
    if kind == 'new':
        return f'new {node[1]}' + ('' if node[2] is None else '(' + ', '.join(_render(a) for a in node[2]) + ')')
    return ser(node)


def _render_operand(node):
    text = _render(node)
    if _is_node(node) and node[0] in ('bin', 'nary', 'assign', 'tern'):
        return '(' + text + ')'
    return text


def render_item(item):
    kind = item[0]
    if kind == 'expr':
        return _render(item[1]) + ';'
    if kind == 'return':
        return 'return' + (' ' + _render(item[1]) if item[1] is not None else '') + ';'
    if kind == 'decl':
        type_text = item[1] if isinstance(item[1], str) else ' '.join(item[1])
        if item[3] == 'fn':
            return f'{type_text} {item[2]}(' + ', '.join(item[4]) + ')' + ''.join(' ' + q for q in item[5]) + ';'
        text = f'{type_text} {item[2]}' + ''.join(f'[{d}]' for d in item[5])
        if item[3] == '=':
            text += ' = ' + _render(item[4])
        elif item[3] == '()':
            text += '(' + ', '.join(_render(a) for a in item[4]) + ')'
        elif item[3] == '{}':
            text += '{' + ', '.join(_render(a) for a in item[4]) + '}'
        return text + ';'
    if kind == 'ctl':
        return f'{item[1]} ({_render(item[2])})'
    if kind == 'for':
        return 'for (' + '; '.join(render_item(p).rstrip(';') if p and p[0] == 'decl' else _render(p) for p in item[1:]) + ')'
    if kind in ('pp', 'head', 'raw', 'goto', 'label'):
        return str(item[1])
    if kind == 'case':
        return f'case {_render(item[1])}:'
    return kind


def substitute(node, name, value):
    if not isinstance(node, tuple):
        return node
    if _is_node(node) and node[0] == 'id' and node[1] == name:
        return value
    if _is_node(node) and node[0] == 'mem':
        return ('mem', node[1], substitute(node[2], name, value), node[3])
    return tuple(substitute(part, name, value) for part in node)


def uses_name(node, name):
    return any(_is_node(sub) and sub[0] == 'id' and sub[1] == name for sub in walk(node))


# --------------------------------------------------------------------------
# Number canonicalization
# --------------------------------------------------------------------------
def num_key(text):
    """'f:0.5' / 'd:2.0' / 'i:16' / 'u:16' for a literal; None when unparsable."""
    t = text.lower()
    try:
        if t.startswith('0x'):
            digits = t.rstrip('ul')
            return ('u' if 'u' in t[len(digits):] else 'i') + ':' + str(int(digits, 16))
        if '.' in t or 'e' in t or t.endswith('f'):
            single = t.endswith('f')
            value = float(t.rstrip('fl'))
            if single:
                value = struct.unpack('f', struct.pack('f', value))[0]
            return ('f:' if single else 'd:') + repr(value)
        digits = t.rstrip('ul')
        value = int(digits, 8) if len(digits) > 1 and digits.startswith('0') else int(digits)
        return ('u' if 'u' in t[len(digits):] else 'i') + ':' + str(value)
    except (ValueError, OverflowError, struct.error):
        return None


def num_value(node):
    if not _is_node(node) or node[0] != 'num':
        return None
    key = node[1] if re.match(r'[fdiu]:', node[1]) else num_key(node[1])
    if key is None:
        return None
    kind, value = key.split(':', 1)
    return kind, (float(value) if kind in 'fd' else int(value))


def is_zero(node):
    if _is_node(node) and node[0] == 'id' and node[1] in ('NULL', 'nullptr', 'false', 'FALSE'):
        return True
    value = num_value(node)
    return value is not None and value[1] == 0


def is_true(node):
    if _is_node(node) and node[0] == 'id' and node[1] in ('true', 'TRUE'):
        return True
    return False


def is_false(node):
    return _is_node(node) and node[0] == 'id' and node[1] in ('false', 'FALSE')


# --------------------------------------------------------------------------
# Normalization (item-local passes)
# --------------------------------------------------------------------------
COMMUTATIVE = {'+', '*', '&', '|', '^', '==', '!='}
ASSOCIATIVE = {'+', '*', '&', '|', '^'}


def norm_expr(node, passes, typedefs, cond=False):
    if not _is_node(node):
        return node
    kind = node[0]
    if kind == 'mem':
        # Always on, not shapes: this->x is x, (*p).x is p->x, (&o)->x is o.x.
        base = norm_expr(node[2], passes, typedefs)
        if node[1] == '->' and base == ('id', 'this'):
            return ('id', node[3])
        if node[1] == '.' and _is_node(base) and base[0] == 'un' and base[1] == '*':
            return ('mem', '->', base[2], node[3])
        if node[1] == '->' and _is_node(base) and base[0] == 'un' and base[1] == '&':
            return ('mem', '.', base[2], node[3])
        return ('mem', node[1], base, node[3])
    if kind == 'num':
        if 'float_form' in passes:
            return ('num', num_key(node[1]) or node[1])
        return node
    if kind == 'id':
        if 'type_spelling' in passes and node[1] in ('NULL', 'nullptr'):
            return ('num', 'i:0' if 'float_form' in passes else '0')
        if 'type_spelling' in passes and '<' in node[1]:
            return ('id', ''.join(_canonical_template_tokens(tokenize(node[1]), typedefs, frozenset())))
        return node
    if kind in ('un', 'pre', 'post'):
        inner = norm_expr(node[2], passes, typedefs, cond=node[1] == '!')
        if kind == 'un' and _is_node(inner) and inner[0] == 'un' and {node[1], inner[1]} == {'*', '&'}:
            return inner[2]  # *&x and &*x are x
        node = (kind, node[1], inner)
        if 'bool_form' in passes and kind == 'un' and node[1] == '!' and _is_node(inner) and inner[0] == 'un' and inner[1] == '!' and cond:
            return inner[2]
        return node
    if kind == 'bin':
        op = node[1]
        child_cond = op in ('&&', '||')
        left = norm_expr(node[2], passes, typedefs, child_cond)
        right = norm_expr(node[3], passes, typedefs, child_cond)
        return _norm_bin(op, left, right, passes, typedefs, cond)
    if kind == 'assign':
        left = norm_expr(node[2], passes, typedefs)
        right = norm_expr(node[3], passes, typedefs)
        if 'compound_assign_split' in passes and node[1] != '=':
            return ('assign', '=', left, _norm_bin(node[1][:-1], left, right, passes, typedefs, False))
        return ('assign', node[1], left, right)
    if kind == 'tern':
        c = norm_expr(node[1], passes, typedefs, True)
        a = norm_expr(node[2], passes, typedefs, cond)
        b = norm_expr(node[3], passes, typedefs, cond)
        if 'bool_form' in passes:
            if is_true(a) and is_false(b):
                return c
            if is_false(a) and is_true(b):
                return ('un', '!', c)
        return ('tern', c, a, b)
    if kind == 'call':
        return ('call', norm_expr(node[1], passes, typedefs), tuple(norm_expr(a, passes, typedefs) for a in node[2]))
    if kind == 'index':
        return ('index', norm_expr(node[1], passes, typedefs), norm_expr(node[2], passes, typedefs))
    if kind == 'cast':
        inner = norm_expr(node[3], passes, typedefs, cond)
        if 'type_spelling' in passes:
            type_text = canonical_type(list(node[2]), typedefs)
            if inner[0] == 'str' and type_text in ('const char *', 'char *'):
                return inner
            return ('cast', 'c', type_text, inner)
        return ('cast', node[1], ' '.join(node[2]), inner)
    if kind == 'init':
        return ('init', tuple(norm_expr(a, passes, typedefs) for a in node[1]))
    if kind == 'new':
        return ('new', node[1], None if node[2] is None else tuple(norm_expr(a, passes, typedefs) for a in node[2]))
    return node


def _norm_bin(op, left, right, passes, typedefs, cond):
    if 'float_form' in passes:
        value = num_value(right)
        if op == '/' and value and value[0] in 'fd' and value[1] != 0:
            mantissa, _ = math.frexp(abs(value[1]))
            if mantissa == 0.5:
                inverse = 1.0 / value[1]
                if value[0] == 'f':
                    inverse = struct.unpack('f', struct.pack('f', inverse))[0]
                return _norm_bin('*', left, ('num', f'{value[0]}:{inverse!r}'), passes, typedefs, cond)
        # a - (a / b) * b  ->  a % b
        if op == '-' and _is_node(right) and right[0] in ('bin', 'nary') and right[1] == '*':
            factors = list(right[2:4]) if right[0] == 'bin' else list(right[2])
            if len(factors) == 2:
                for quotient, divisor in (factors, factors[::-1]):
                    if _is_node(quotient) and quotient[0] == 'bin' and quotient[1] == '/' \
                            and ser(quotient[2]) == ser(left) and ser(quotient[3]) == ser(divisor):
                        return ('bin', '%', left, divisor)
        # (x & M) >> n  ->  (x >> n) & (M >> n) when M has no bits below n
        shift = num_value(right)
        if op == '>>' and shift and shift[0] in 'iu' and _is_node(left) and left[0] in ('bin', 'nary') and left[1] == '&':
            operands = list(left[2:4]) if left[0] == 'bin' else list(left[2])
            if len(operands) == 2:
                for value_node, mask_node in (operands, operands[::-1]):
                    mask = num_value(mask_node)
                    if mask and mask[0] in 'iu' and mask[1] & ((1 << shift[1]) - 1) == 0:
                        shifted = _norm_bin('>>', value_node, right, passes, typedefs, False)
                        return _norm_bin('&', shifted, ('num', f'{mask[0]}:{mask[1] >> shift[1]}'), passes, typedefs, cond)
    if 'bool_form' in passes and op in ('==', '!=') and cond is not None:
        for a, b in ((left, right), (right, left)):
            if cond and (is_zero(b) or is_false(b)):
                return a if op == '!=' else ('un', '!', a)
            if cond and is_true(b):
                return a if op == '==' else ('un', '!', a)
    if 'operand_order' in passes:
        if op in ('>', '>='):
            op, left, right = {'>': '<', '>=': '<='}[op], right, left
        if op in COMMUTATIVE:
            operands = []
            for part in (left, right):
                if op in ASSOCIATIVE and _is_node(part) and part[0] == 'nary' and part[1] == op:
                    operands.extend(part[2])
                else:
                    operands.append(part)
            return ('nary', op, tuple(sorted(operands, key=ser)))
    return ('bin', op, left, right)


def norm_item(item, passes, typedefs):
    kind = item[0]
    if kind == 'expr':
        expr = item[1]
        if 'compound_assign_split' in passes and _is_node(expr) and expr[0] in ('pre', 'post'):
            target = expr[2]
            expr = ('assign', expr[1][0] + '=', target, ('num', '1'))
        return ('expr', norm_expr(expr, passes, typedefs))
    if kind == 'return':
        return ('return', norm_expr(item[1], passes, typedefs) if item[1] is not None else None)
    if kind == 'head':
        # `static T table[] = {` / `void f(T* p)` with the body on later lines: compare the declaration.
        toks = tokenize(item[1])
        decls = _parse_decl(toks[:-1] if toks and toks[-1] == '=' else toks, typedefs)
        return norm_item(decls[0], passes, typedefs) if decls and len(decls) == 1 else item
    if kind == 'decl':
        type_text = canonical_type(list(item[1]), typedefs) if 'type_spelling' in passes else ' '.join(t for t in item[1] if t not in ('register', 'volatile'))
        if item[3] == 'fn':
            init = tuple(canonical_type(tokenize(p), typedefs) if 'type_spelling' in passes else p for p in item[4])
        elif item[3] in ('()', '{}'):
            init = tuple(norm_expr(a, passes, typedefs) for a in item[4])
        else:
            init = norm_expr(item[4], passes, typedefs)
        # Storage class is part of what the declaration defines (register is a codegen directive).
        storage = ''.join(word + ' ' for word in ('static', 'extern') if word in item[1])
        return ('decl', storage + type_text, item[2], item[3], init, item[5])
    if kind == 'ctl':
        return ('ctl', item[1], norm_expr(item[2], passes, typedefs, cond=item[1] != 'switch'))
    if kind == 'for':
        parts = []
        for index, part in enumerate(item[1:]):
            if part is None:
                parts.append(None)
            elif part[0] == 'decl':
                parts.append(norm_item(part, passes, typedefs))
            else:
                if index == 2 and 'compound_assign_split' in passes and _is_node(part) and part[0] in ('pre', 'post'):
                    part = ('assign', part[1][0] + '=', part[2], ('num', '1'))
                parts.append(norm_expr(part, passes, typedefs, cond=index == 1))
        return ('for',) + tuple(parts)
    if kind == 'case':
        return ('case', norm_expr(item[1], passes, typedefs))
    return item


def item_key(item, passes, typedefs):
    return ser(norm_item(item, passes, typedefs))


# --------------------------------------------------------------------------
# Cross-item passes (per side)
# --------------------------------------------------------------------------
def plain_names(tokens):
    """Identifiers that are not member names (`z` in `a.z` is not a variable)."""
    return {t for i, t in enumerate(tokens) if re.match(r'[A-Za-z_]\w*$', t) and (i == 0 or tokens[i - 1] not in ('.', '->'))}


def assigns(node, name):
    """True when node stores to the plain variable `name`."""
    for sub in walk(node):
        if _is_node(sub) and ((sub[0] == 'assign' and sub[2] == ('id', name)) or (sub[0] in ('pre', 'post') and sub[2] == ('id', name))):
            return True
    return False


class Side:
    def __init__(self, name, lines, typedefs):
        self.name = name
        self.typedefs = typedefs
        toks = _lex_lines(strip_comments('\n'.join(lines)).split('\n'))
        self.lexed = toks
        self.tokens = [t for t, _ in toks]
        self.items = split_items(toks, typedefs)  # [(item, line index)]
        self.names = plain_names(self.tokens)

    def key(self, item):
        return item_key(item, ALL_PASSES, self.typedefs)


def _is_assign_to(item, name_key, typedefs):
    """(rhs) when item is `<lhs> = rhs;` with lhs matching name_key."""
    if item[0] == 'expr' and _is_node(item[1]) and item[1][0] == 'assign' and item[1][1] == '=':
        if ser(norm_expr(item[1][2], ALL_PASSES, typedefs)) == name_key:
            return item[1][3]
    return None


def _strip_single_braces(items):
    """`if (c) { s; }` -> `if (c) s;` (no codegen difference)."""
    out = list(items)
    changed = True
    while changed:
        changed = False
        for index in range(len(out) - 3):
            head, open_, body, close = out[index:index + 4]
            if head[0][0] in ('ctl', 'for', 'else', 'do') and open_[0] == ('{',) and close[0] == ('}',) \
                    and body[0][0] in ('expr', 'return', 'break', 'continue', 'goto'):
                del out[index + 3]
                del out[index + 1]
                changed = True
                break
    return out


class TaggedLine(int):
    """A line index that remembers the fold finding that produced its item."""

    def __new__(cls, value, tag):
        obj = super().__new__(cls, value)
        obj.tag = tag
        return obj


def _early_return(side, other, findings):
    """`} else { B }` -> `return; } B` when the other side spells it that way (ternary_if family)."""
    kinds = [it[0] for it, _ in side.items]
    other_kinds = [it[0] for it, _ in other.items]
    if 'else' not in kinds or 'else' in other_kinds:
        return
    if not any(a == 'return' and b == '}' for a, b in zip(other_kinds, other_kinds[1:])):
        return
    items = list(side.items)
    for index in range(len(items) - 2):
        if [it[0] for it, _ in items[index:index + 3]] == ['}', 'else', '{'] and (index == 0 or items[index - 1][0][0] != 'return'):
            line = items[index][1]
            depth, close = 0, None
            for later in range(index + 2, len(items)):
                kind = items[later][0][0]
                depth += 1 if kind == '{' else -1 if kind == '}' else 0
                if depth == 0:
                    close = later
                    break
            found = {'shape': 'ternary_if', 'side': side.name, 'line': line, 'raw': ('early-return',),
                     'before': '} else {', 'after': 'return; }', 'detail': 'if/else rewritten as an early return'}
            findings.append(found)
            rest = items[index + 3:]
            if close is not None:
                del rest[close - index - 3]
            side.items = items[:index] + [(('return', None), TaggedLine(line, found)), (('}',), line)] + rest
            return


def _fold_patterns(side, findings):
    """ternary_if and bool_form statement patterns, folded into one item."""
    items, typedefs = side.items, side.typedefs
    out, index = [], 0
    while index < len(items):
        window = [it for it, _ in items[index:index + 5]]
        line = items[index][1]
        folded = None
        if window and window[0][0] == 'ctl' and window[0][1] == 'if':
            cond = window[0][2]
            # if (c) X = a; else X = b;   /   if (c) return a; else return b;
            if len(window) >= 4 and window[2] == ('else',):
                first, second = window[1], window[3]
                if first[0] == 'expr' and second[0] == 'expr':
                    a_rhs = first[1][3] if _is_node(first[1]) and first[1][0] == 'assign' and first[1][1] == '=' else None
                    if a_rhs is not None:
                        target = ser(norm_expr(first[1][2], ALL_PASSES, typedefs))
                        b_rhs = _is_assign_to(second, target, typedefs)
                        if b_rhs is not None:
                            folded = ([('expr', ('assign', '=', first[1][2], ('tern', cond, a_rhs, b_rhs)))], 4, 'ternary_if')
                elif first[0] == 'return' and second[0] == 'return' and first[1] is not None and second[1] is not None:
                    folded = ([('return', ('tern', cond, first[1], second[1]))], 4, 'ternary_if')
            # if (c) X = a;   ->   X = c ? a : X;
            if folded is None and len(window) >= 2 and window[1][0] == 'expr' and _is_node(window[1][1]) \
                    and window[1][1][0] == 'assign' and window[1][1][1] == '=' \
                    and not (len(window) >= 3 and window[2] == ('else',)):
                target = window[1][1][2]
                folded = ([('expr', ('assign', '=', target, ('tern', cond, window[1][1][3], target)))], 2, 'ternary_if')
            # if (c) return a; return b;
            if folded is None and len(window) >= 3 and window[1][0] == 'return' and window[2][0] == 'return' \
                    and window[1][1] is not None and window[2][1] is not None:
                folded = ([('return', ('tern', cond, window[1][1], window[2][1]))], 3, 'ternary_if')
        if folded is None and len(window) >= 3 and window[1][0] == 'ctl' and window[1][1] == 'if' and window[2][0] == 'expr':
            # X = b; if (c) X = a;   /   T X = b; if (c) X = a;   (bool form when a/b are true/false)
            cond, then = window[1][2], window[2]
            if window[0][0] == 'decl' and window[0][3] == '=':
                target = ser(('id', window[0][2]))
                a_rhs = _is_assign_to(then, target, typedefs)
                if a_rhs is not None and not (index + 3 < len(items) and items[index + 3][0] == ('else',)):
                    decl = window[0]
                    value, shape = ('tern', cond, a_rhs, decl[4]), 'ternary_if'
                    if is_false(decl[4]) or (num_value(decl[4]) or (0, 1))[1] == 0 and is_true(a_rhs):
                        shape = 'bool_form'
                    folded = ([('decl', decl[1], decl[2], '=', value, decl[5])], 3, shape)
            elif window[0][0] == 'expr' and _is_node(window[0][1]) and window[0][1][0] == 'assign' and window[0][1][1] == '=':
                target = ser(norm_expr(window[0][1][2], ALL_PASSES, typedefs))
                a_rhs = _is_assign_to(then, target, typedefs)
                if a_rhs is not None and not (index + 3 < len(items) and items[index + 3][0] == ('else',)) \
                        and not uses_name(cond, window[0][1][2][1] if window[0][1][2][0] == 'id' else '\0'):
                    shape = 'bool_form' if is_false(window[0][1][3]) and is_true(a_rhs) else 'ternary_if'
                    folded = ([('expr', ('assign', '=', window[0][1][2], ('tern', cond, a_rhs, window[0][1][3])))], 3, shape)
        if folded:
            new_items, consumed, shape = folded
            cond = window[0][2] if window[0][0] == 'ctl' else window[1][2]
            raw = tuple(item_key(it, NO_PASSES, typedefs) for it, _ in items[index:index + consumed])
            first = new_items[0]
            target = first[1][2] if first[0] == 'expr' else ('id', first[2]) if first[0] == 'decl' else ('id', 'return')
            sig = (shape, ser(norm_expr(cond, ALL_PASSES, typedefs)), ser(norm_expr(target, ALL_PASSES, typedefs)))
            found = {'shape': shape, 'side': side.name, 'line': line, 'raw': raw, 'sig': sig,
                     'before': ' '.join(render_item(it) for it, _ in items[index:index + consumed]),
                     'after': render_item(new_items[0]), 'detail': 'if/else folded into one expression'}
            findings.append(found)
            out.extend((it, TaggedLine(line, found)) for it in new_items)
            index += consumed
            continue
        out.append(items[index])
        index += 1
    side.items = out


def _code_rows(lexed):
    """Token rows of the code lines of [(token, line)], in line order."""
    rows = {}
    for tok, line in lexed:
        rows.setdefault(line, []).append(tok)
    return [rows[line] for line in sorted(rows)]


def _scope_uses(toks, start, name):
    """Plain uses of `name` in toks[start:] before the block open at toks[start] closes."""
    uses, depth = 0, 0
    for index in range(start, len(toks)):
        tok = toks[index]
        if tok == '{':
            depth += 1
        elif tok == '}':
            depth -= 1
            if depth < 0:
                break
        elif tok == name and (index == 0 or toks[index - 1] not in ('.', '->', '::')):
            uses += 1
    return uses


def _decl_scope_uses(rows, name):
    """In-scope uses of the local `name` declared on rows[0] (its first plain mention there)."""
    toks = [tok for row in rows for tok in row]
    for index, tok in enumerate(rows[0] if rows else ()):
        if tok == name and (index == 0 or rows[0][index - 1] not in ('.', '->', '::')):
            return _scope_uses(toks, index + 1, name)
    return None


def _in_order(rows, within):
    position = 0
    for row in rows:
        while position < len(within) and within[position] != row:
            position += 1
        if position == len(within):
            return False
        position += 1
    return True


def _used_past_group(side, line, name, context_rows):
    """True when the candidate uses the local `name`, declared on side line `line`, outside the group.

    ``context_rows`` are the code rows of the candidate text after the group
    (the steering gate's post-context, which can start with the group's last
    lines) or of a span holding the group (a whole function). Only uses in the
    declaration's own scope count: the next function's local of the same name
    is another variable."""
    tail = _code_rows([(t, l) for t, l in side.lexed if l >= line])
    if not tail:
        return False
    own = _decl_scope_uses(tail, name)
    if own is None:
        return True
    view = None
    for anchor, row in enumerate(context_rows):
        if row == tail[0] and _in_order(tail[1:], context_rows[anchor + 1:]):
            view = context_rows[anchor:]  # the context holds the group
            break
    if view is None:
        overlap = 0
        for size in range(min(len(tail), len(context_rows)), 0, -1):
            if tail[-size:] == context_rows[:size] and any(set(row) - {'{', '}', ';'} for row in tail[-size:]):
                overlap = size
                break
        view = tail + context_rows[overlap:]
    total = _decl_scope_uses(view, name)
    return total is None or total > own


def _inline_temps(side, other, findings, context=None):
    """Inline locals this side declares and the other side never names (temp_alias).

    ``context`` (candidate text around the group) vetoes a local the candidate
    keeps using past the group."""
    typedefs = side.typedefs
    context_rows = None
    if context is not None and side.name == 'added':
        context_rows = _code_rows(_lex_lines(strip_comments(context).split('\n')))
    changed = True
    while changed:
        changed = False
        items = side.items
        for index, (item, line) in enumerate(items):
            if item[0] != 'decl' or item[5] or item[3] not in ('=', None, '()', '{}'):
                continue
            name = item[2]
            if name in other.names:
                continue
            if context_rows is not None and _used_past_group(side, line, name, context_rows):
                continue
            value, result = item[4], None
            # `T t(a, b, c)` / `T t{a, b, c}` is only a temp when it is read field by field.
            whole = item[3] in ('=', None) or (item[3] == '()' and len(item[4]) == 1)
            if item[3] == '()' and whole:
                value = item[4][0]
            spelled = canonical_type(list(item[1]), typedefs)
            reference = '&' in item[1] or spelled.endswith('&')
            through = reference or '*' in item[1] or spelled.endswith('*')
            if whole:
                result = _try_inline(items, index, name, value, typedefs, through, reference)
            if result is None and (item[3] is None or 'Vec' in ''.join(item[1])):
                result = _try_inline_fields(items, index, name, item)
            if result is None:
                continue
            new_items, uses, final = result
            findings.append({'shape': 'temp_alias', 'side': side.name, 'line': line, 'name': name, 'uses': uses,
                             'raw': (item_key(item, NO_PASSES, typedefs),),
                             'before': _render(final), 'after': render_item(item),
                             'detail': ('local `%s` introduced for `%s` (%d use%s)' if side.name == 'added'
                                        else 'local `%s` for `%s` inlined (%d use%s)') % (name, _render(final), uses, '' if uses == 1 else 's')})
            side.items = new_items
            changed = True
            break


def _try_inline(items, index, name, value, typedefs, through=False, reference=False):
    if value is None and reference:
        return None
    out = list(items[:index])
    depth, conditional, uses, pending = 0, False, 0, value
    for item, line in items[index + 1:]:
        kind = item[0]
        if kind == '{':
            depth += 1
        elif kind == '}':
            depth -= 1
        if not uses_name(item, name):
            out.append((item, line))
            conditional = kind in ('ctl', 'for', 'else', 'do')
            continue
        for sub in walk(item):
            if _is_node(sub) and sub[0] in ('un',) and sub[1] == '&' and sub[2] == ('id', name):
                return None
            if _is_node(sub) and sub[0] in ('pre', 'post') and sub[2] == ('id', name) and not reference:
                return None
            if _is_node(sub) and sub[0] == 'assign' and sub[2] != ('id', name) and uses_name(sub[2], name) \
                    and not through and sub[2][0] != 'index':
                return None  # field-by-field fill of a value: see _try_inline_fields
        if kind == 'expr' and _is_node(item[1]) and item[1][0] == 'assign' and item[1][2] == ('id', name) and not reference:
            # A store to the temp starts its next value; only at the declaration's
            # own block level, never inside a branch.
            if depth != 0 or conditional:
                return None
            op, rhs = item[1][1], item[1][3]
            if pending is None and op != '=':
                return None
            if op == '=':
                pending = substitute(rhs, name, pending) if pending is not None else rhs
            else:
                pending = ('bin', op[:-1], pending, substitute(rhs, name, pending))
            conditional = False
            continue
        if kind == 'decl' and item[2] == name:
            return None
        if pending is None:
            return None
        out.append((substitute(item, name, pending), line))
        uses += 1
        conditional = kind in ('ctl', 'for', 'else', 'do')
    if uses == 0 or pending is None:
        return None
    return out, uses, pending


def _field_of(node, name):
    if _is_node(node) and node[0] == 'mem' and node[1] == '.' and node[2] == ('id', name):
        return node[3]
    return None


def _substitute_fields(node, name, fields):
    if not isinstance(node, tuple):
        return node
    field = _field_of(node, name)
    if field is not None:
        return fields[field]
    return tuple(_substitute_fields(part, name, fields) for part in node)


def _try_inline_fields(items, index, name, decl=None):
    """`Vec p; p.x = a; p.y = b; f(p.x, p.y)` -> `f(a, b)` (a value filled field by field;
    a vector built from two to four values counts as filled x, y, z, w)."""
    out = list(items[:index])
    fields, uses, used = {}, 0, False
    if decl is not None and decl[3] is not None:
        args = decl[4]
        if decl[3] == '=' and _is_node(args) and args[0] == 'init':
            args = args[1]
        if not isinstance(args, tuple) or _is_node(args) or not 2 <= len(args) <= 4:
            return None
        fields = dict(zip('xyzw', args))
    for item, line in items[index + 1:]:
        if not uses_name(item, name):
            out.append((item, line))
            continue
        if item[0] == 'expr' and _is_node(item[1]) and item[1][0] == 'assign' and item[1][1] == '=' \
                and _field_of(item[1][2], name) is not None and not uses_name(item[1][3], name):
            if used:
                return None
            fields[_field_of(item[1][2], name)] = item[1][3]
            continue
        refs = [sub for sub in walk(item) if _is_node(sub) and sub[0] == 'id' and sub[1] == name]
        member_refs = [sub for sub in walk(item) if _field_of(sub, name) in fields]
        if not fields or len(refs) != len(member_refs):
            return None
        used = True
        out.append((_substitute_fields(item, name, fields), line))
        uses += 1
    if not uses:
        return None
    return out, uses, ('init', tuple(fields.values()))


def _merge_split_decls(side, other, findings):
    """`T x; ... x = e;` -> `T x = e;` at the assignment (decl_reorder when the other side does not split it)."""
    other_raw = {item_key(it, NO_PASSES, side.typedefs) for it, _ in other.items}
    items = list(side.items)
    index = 0
    while index < len(items):
        item, line = items[index]
        if item[0] == 'decl' and item[3] is None and not item[5]:
            name = item[2]
            for later in range(index + 1, len(items)):
                candidate = items[later][0]
                if not uses_name(candidate, name):
                    continue
                if candidate[0] == 'expr' and _is_node(candidate[1]) and candidate[1][0] == 'assign' \
                        and candidate[1][1] == '=' and candidate[1][2] == ('id', name) and not uses_name(candidate[1][3], name):
                    merged = ('decl', item[1], name, '=', candidate[1][3], ())
                    if item_key(item, NO_PASSES, side.typedefs) not in other_raw:
                        findings.append({'shape': 'decl_reorder', 'side': side.name, 'line': line, 'raw': ('split-decl', name),
                                         'before': render_item(item), 'after': render_item(merged),
                                         'detail': f'declaration of `{name}` split from its first assignment'})
                    items[later] = (merged, items[later][1])
                    del items[index]
                    index -= 1
                break
        index += 1
    side.items = items


def _fold_assignments(side, other, findings):
    """A store to an existing variable the other side never stores to, folded into its uses."""
    changed = True
    while changed:
        changed = False
        items = side.items
        for index, (item, line) in enumerate(items):
            if not (item[0] == 'expr' and _is_node(item[1]) and item[1][0] == 'assign' and _is_node(item[1][2]) and item[1][2][0] == 'id'):
                continue
            name = item[1][2][1]
            declared_here = any(it[0] == 'decl' and it[2] == name for it, _ in items)
            declared_there = any(it[0] == 'decl' and it[2] == name for it, _ in other.items)
            if any(assigns(it, name) for it, _ in other.items) or (declared_here and not declared_there):
                continue
            op, rhs = item[1][1], item[1][3]
            value = rhs if op == '=' else ('bin', op[:-1], ('id', name), rhs)
            out, uses = list(items[:index]), 0
            rest = items[index + 1:]
            for position, (later, later_line) in enumerate(rest):
                if assigns(later, name):
                    out.extend(rest[position:])
                    break
                if uses_name(later, name):
                    later = substitute(later, name, value)
                    uses += 1
                out.append((later, later_line))
            if not uses:
                continue
            findings.append({'shape': 'temp_alias', 'side': side.name, 'line': line, 'name': name, 'uses': uses,
                             'raw': (item_key(item, NO_PASSES, side.typedefs),), 'before': _render(value), 'after': render_item(item),
                             'detail': f'store to `{name}` used as a temp ({uses} use{"" if uses == 1 else "s"})'})
            side.items = out
            changed = True
            break


# --------------------------------------------------------------------------
# Accessor unification and real-shape diffing
# --------------------------------------------------------------------------
def _field_like(name, getter=None):
    stem = name[1:] if re.match(r'm[A-Z_]', name) else name.lstrip('_')
    return bool(re.match(r'(?:m[A-Z_]|unk|_)', name)) or (getter is not None and getter.lower() in ('get' + stem.lower(), stem.lower()))


def _accessor_pair(old, new):
    """(kind, before, after) when old/new differ by one accessor or inline hop at this node."""
    def field_access(node):
        if node[0] == 'mem':
            return node[2], node[3], True
        if node[0] == 'id' and re.match(r'[A-Za-z_]\w*$', node[1]):
            return None, node[1], False
        return None

    def getter_call(node):
        if node[0] == 'call' and not node[2]:
            func = node[1]
            if func[0] == 'mem':
                return func[2], func[3]
            if func[0] == 'id':
                return None, func[1]
        return None

    for a, b, forward in ((old, new, True), (new, old, False)):
        # getX() <-> mX.get() (a parameter object read through its own getter)
        param, call = getter_call(a), getter_call(b)
        if param and call and call[1] == 'get' and call[0] is not None and call[0][0] in ('mem', 'id'):
            inner = field_access(call[0])
            stem = inner and (inner[1][1:] if re.match(r'm[A-Z_]', inner[1]) else inner[1])
            if inner and ser(inner[0]) == ser(param[0]) and param[1].lower() == 'get' + stem.lower():
                return ('accessor_to_field' if forward else 'field_to_accessor'), _render(old), _render(new)
    for a, b, forward in ((old, new, True), (new, old, False)):
        field, call = field_access(a), getter_call(b)
        if field and call and ser(field[0]) == ser(call[0]) and (field[2] or _field_like(field[1], call[1])):
            kind = 'field_to_accessor' if forward else 'accessor_to_field'
            return kind, _render(old), _render(new)
        # m[i] <-> get(i)
        if a[0] == 'index' and b[0] == 'call' and len(b[2]) == 1 and ser(a[2]) == ser(b[2][0]):
            inner = field_access(a[1])
            func = b[1]
            base = func[2] if func[0] == 'mem' else None
            if inner and ser(inner[0]) == ser(base) and func[0] in ('mem', 'id'):
                return ('field_to_accessor' if forward else 'accessor_to_field'), _render(old), _render(new)
    # inline hop: g(args) <-> h()->g(args), B->g(args) <-> B->h()->g(args), same for member reads;
    # inline expansion: B->f(args) <-> B->h().g(args), the body of the inline f written out
    # (`->add(x)` as `->getChildren().push_back(x)`): same receiver, same arguments, and
    # only argument-less calls in between.
    for a, b, forward in ((old, new, True), (new, old, False)):
        head_a, head_b, call = a, b, False
        if a[0] == 'call' and b[0] == 'call':
            if ser(a[2]) != ser(b[2]):
                continue
            head_a, head_b, call = a[1], b[1], True
        if head_b[0] != 'mem':
            continue
        if head_a[0] == 'mem':
            op_a, base_a, name_a = head_a[1], head_a[2], head_a[3]
        elif head_a[0] == 'id' and re.match(r'[A-Za-z_]\w*$', head_a[1]):
            op_a, base_a, name_a = None, None, head_a[1]
        else:
            continue
        if name_a != head_b[3] and not call:
            continue
        hops = _hop_chain(head_b[2], base_a)
        if hops is None or (op_a is not None and hops[0][0] != op_a):
            continue
        if name_a == head_b[3]:
            return ('inline_hop_added' if forward else 'inline_hop_removed'), _render(old), _render(new)
        return ('inline_expanded' if forward else 'inline_collapsed'), _render(old), _render(new)
    # inline expansion through a temporary: f(args) <-> T(args).h(), the same arguments
    # building a T whose argument-less calls give the value (`MsRandF(a, b)` as
    # `TMsRange<f32>(a, b).rand()`).
    for a, b, forward in ((old, new, True), (new, old, False)):
        if not (a[0] == 'call' and a[2] and a[1][0] == 'id' and re.match(r'[A-Za-z_]\w*$', a[1][1])):
            continue
        if not (b[0] == 'call' and not b[2] and b[1][0] == 'mem'):
            continue
        made = b[1][2]
        while _is_node(made) and made[0] == 'call' and not made[2] and made[1][0] == 'mem':
            made = made[1][2]
        if _is_node(made) and made[0] == 'call' and made[1][0] == 'id' and ser(made[2]) == ser(a[2]) \
                and _type_like(tokenize(made[1][1]), {}):
            return ('inline_expanded' if forward else 'inline_collapsed'), _render(old), _render(new)
    return None


def _hop_chain(node, base):
    """[(op, name)] of the argument-less calls that lead from `base` to `node`
    (`base->h()`, `base->h().k()`; `h()` or `h().k()` when base is None), or None."""
    hops = []
    while _is_node(node) and node[0] == 'call' and not node[2]:
        func = node[1]
        if func[0] == 'id' and base is None:
            return [(None, func[1])] + hops
        if func[0] != 'mem':
            return None
        hops.insert(0, (func[1], func[3]))
        node = func[2]
        if base is not None and ser(node) == ser(base):
            return hops
    return None


def _unify(old, new, swaps, residual, store=False):
    """Pair old/new subtrees: steering swaps go to `swaps`, unexplained pairs to `residual`.

    `store` marks a value the store itself converts (an assignment's right side,
    an `=` initializer, a return value): an explicit cast added or dropped there
    is a spelling, the same conversion the store makes to the target's type."""
    if ser(old) == ser(new):
        return
    if _is_node(old) and _is_node(new):
        pair = _accessor_pair(old, new)
        if pair:
            swaps.append(pair)
            return
        if store and (old[0] == 'cast') != (new[0] == 'cast'):
            swaps.append(('explicit_cast', _render(old), _render(new)))
            if old[0] == 'cast':
                _unify(old[3], new, swaps, residual, store)
            else:
                _unify(old, new[3], swaps, residual, store)
            return
        if old[0] == new[0] == 'assign' and old[1] == new[1]:
            _unify(old[2], new[2], swaps, residual)
            _unify(old[3], new[3], swaps, residual, store=True)
            return
        if old[0] == new[0] == 'call' and len(old[2]) == len(new[2]):
            head = []
            _unify(old[1], new[1], swaps, head)
            if head:
                residual.append((old, new))  # a different callee: classify the whole call
                return
            for a, b in zip(old[2], new[2]):
                _unify(a, b, swaps, residual)
            return
        if old[0] == new[0] and len(old) == len(new):
            if old[0] == 'nary' and old[1] == new[1] and len(old[2]) == len(new[2]):
                rest_old = [o for o in old[2] if ser(o) not in {ser(n) for n in new[2]}]
                rest_new = [n for n in new[2] if ser(n) not in {ser(o) for o in old[2]}]
                if len(rest_old) == len(rest_new):
                    for o, n in zip(rest_old, rest_new):
                        _unify(o, n, swaps, residual)
                    return
            fixed_equal = all(ser(o) == ser(n) for o, n in zip(old, new) if not _is_node(o) and not (isinstance(o, tuple)))
            if fixed_equal:
                for o, n in zip(old, new):
                    if _is_node(o) and _is_node(n):
                        _unify(o, n, swaps, residual)
                    elif isinstance(o, tuple) and isinstance(n, tuple):
                        if len(o) != len(n):
                            residual.append((old, new))
                            return
                        for oo, nn in zip(o, n):
                            _unify(oo, nn, swaps, residual)
                    elif ser(o) != ser(n):
                        residual.append((old, new))
                        return
                return
    residual.append((old, new))


def _diff_ast(old, new, out, ctx=None):
    """Add the real shapes that explain old -> new (or 'other')."""
    if ser(old) == ser(new):
        return
    if old is None or new is None or not _is_node(old) or not _is_node(new):
        out.add('other')
        return
    lit = ('num', 'str', 'chr')
    if old[0] in lit and new[0] in lit:
        out.add('literal_change')
        return
    if (old[0] in lit) != (new[0] in lit) and {old[0], new[0]} & {'id'} and (is_true(old) or is_false(old) or is_true(new) or is_false(new) or old[1] in ('NULL',) or new[1] in ('NULL',)):
        out.add('literal_change')
        return
    if old[0] == new[0] == 'id':
        out.add('callee_change' if ctx == 'callee' else 'member_change')
        return
    if old[0] == new[0] == 'mem':
        if old[3] != new[3]:
            out.add('callee_change' if ctx == 'callee' else 'member_change')
        if ser(old[2]) != ser(new[2]):
            _diff_ast(old[2], new[2], out)
        if old[1] != new[1] and old[3] == new[3] and ser(old[2]) == ser(new[2]):
            out.add('other')
        return
    if old[0] == new[0] == 'call':
        if ser(old[1]) != ser(new[1]):
            _diff_ast(old[1], new[1], out, 'callee')
        if len(old[2]) != len(new[2]):
            out.add('callee_change')
        else:
            for a, b in zip(old[2], new[2]):
                _diff_ast(a, b, out)
        return
    if old[0] == new[0] == 'cast':
        if ser(old[2]) != ser(new[2]):
            out.add('type_change')
        _diff_ast(old[3], new[3], out, ctx)
        return
    if old[0] == 'cast' or new[0] == 'cast':
        out.add('type_change')
        inner_old = old[3] if old[0] == 'cast' else old
        inner_new = new[3] if new[0] == 'cast' else new
        _diff_ast(inner_old, inner_new, out, ctx)
        return
    if old[0] == new[0] and len(old) == len(new):
        if old[0] in ('bin', 'un', 'assign', 'pre', 'post', 'nary') and old[1] != new[1]:
            if old[1] in COMPARE | LOGICAL or new[1] in COMPARE | LOGICAL:
                out.add('condition_change')
            else:
                out.add('other')
            return
        if old[0] == 'nary':
            if len(old[2]) != len(new[2]):
                _structural(old, new, out, ctx)
                return
            swaps, residual = [], []
            _unify(old, new, swaps, residual)
            if swaps:
                out.add('accessor_swap')
            for a, b in residual:
                if (a, b) == (old, new):
                    for x, y in zip(old[2], new[2]):
                        _diff_ast(x, y, out, ctx)
                else:
                    _diff_ast(a, b, out, ctx)
            return
        if old[0] == 'tern':
            if ser(old[1]) != ser(new[1]):
                out.add('condition_change')
                _diff_ast(old[1], new[1], out, 'cond')
            _diff_ast(old[2], new[2], out, ctx)
            _diff_ast(old[3], new[3], out, ctx)
            return
        for a, b in zip(old[1:], new[1:]):
            if _is_node(a) or _is_node(b):
                _diff_ast(a, b, out, ctx)
            elif isinstance(a, tuple) and isinstance(b, tuple) and len(a) == len(b):
                for x, y in zip(a, b):
                    _diff_ast(x, y, out, ctx)
            elif ser(a) != ser(b):
                out.add('other')
        return
    _structural(old, new, out, ctx)


def _structural(old, new, out, ctx):
    calls_old, calls_new = count_calls(old), count_calls(new)
    if calls_new > calls_old:
        out.add('call_added')
    elif calls_new < calls_old:
        out.add('call_removed')
    elif ctx == 'cond' or any(_is_node(n) and n[0] in ('tern',) or (_is_node(n) and n[0] in ('bin', 'nary', 'un') and n[1] in LOGICAL | COMPARE) for n in (old, new)):
        out.add('condition_change')
    else:
        out.add('other')


def _diff_items(old, new, out, swaps):
    if old[0] != new[0]:
        if old[0] in CONTROL or new[0] in CONTROL:
            out.add('control_flow_change')
        else:
            out.add('other')
        return
    kind = old[0]

    def compare(a, b, ctx=None, store=False):
        residual = []
        _unify(a, b, swaps, residual, store)
        for x, y in residual:
            _diff_ast(x, y, out, ctx)
        return bool(residual)

    if kind == 'ctl':
        if old[1] != new[1]:
            out.add('control_flow_change')
        if compare(old[2], new[2], 'cond'):
            out.add('condition_change')
    elif kind == 'for':
        if compare(old[2], new[2], 'cond'):
            out.add('condition_change')
        for a, b in ((old[1], new[1]), (old[3], new[3])):
            if ser(a) != ser(b):
                out.add('control_flow_change')
    elif kind in ('expr', 'return', 'case'):
        if (old[1] is None) != (new[1] is None):
            out.add('control_flow_change')
        else:
            compare(old[1], new[1], store=kind == 'return')
    elif kind == 'decl':
        if old[1] != new[1] or old[5] != new[5]:
            out.add('type_change')  # canonical type, const, static/extern, array bounds or method const
        if old[2] != new[2]:
            out.add('other')
        if 'fn' in (old[3], new[3]):
            if old[3] != new[3]:
                out.add('definition_added_removed')
            elif ser(old[4]) != ser(new[4]):
                out.add('type_change')  # parameter types
        elif ser(old[4]) != ser(new[4]) or old[3] != new[3]:
            if old[3] == new[3] and old[4] is not None and new[4] is not None:
                residual = []
                _unify(old[4], new[4], swaps, residual, store=old[3] == '=')
                if residual:
                    out.add('initializer_change')
                    for x, y in residual:
                        _diff_ast(x, y, out)
            else:
                out.add('initializer_change')
    else:
        out.add('other')


def _lone_item(item, side, out):
    kind = item[0]
    if kind == 'pp' and re.match(r'#\s*pragma\b', item[1]):
        return  # reported as codegen_directive
    if kind in CONTROL:
        out.add('control_flow_change')
    elif kind == 'head':
        out.add('definition_added_removed')
    elif kind == 'decl':
        if 'static' in item[1] or item[3] == 'fn' or (item[3] == '()' and any(_is_node(a) and a[0] == 'raw' for a in item[4] or ())):
            out.add('definition_added_removed')
        elif count_calls(item[4]):
            out.add('call_added' if side == 'added' else 'call_removed')
        else:
            out.add('other')
    elif kind == 'expr':
        out.add(('call_added' if side == 'added' else 'call_removed') if count_calls(item[1]) else 'other')
    else:
        out.add('other')


# --------------------------------------------------------------------------
# Directives
# --------------------------------------------------------------------------
DIRECTIVE_WORDS = ('volatile', 'register', 'asm', '__asm', '__asm__')


def _directive_counts(lines):
    counts = {}
    for line in lines:
        for tok in tokenize(line):
            if tok.startswith('#') and re.match(r'#\s*pragma\b', tok):
                key = 'pragma:' + ' '.join(tok.split()[1:])
                counts[key] = counts.get(key, 0) + 1
            elif tok in DIRECTIVE_WORDS:
                key = 'asm' if tok.startswith('__asm') else tok
                counts[key] = counts.get(key, 0) + 1
    return counts


def codegen_directives(added, removed=None):
    """Directives (volatile, register, #pragma, asm) the added lines introduce."""
    budget = _directive_counts(removed or [])
    findings = []
    for index, line in enumerate(added, 1):
        for key, count in _directive_counts([line]).items():
            for _ in range(count):
                if budget.get(key, 0) > 0:
                    budget[key] -= 1
                    continue
                word = key.split(':', 1)[0]
                findings.append({'shape': 'codegen_directive', 'line': index, 'before': None, 'after': line.strip(),
                                 'detail': '#pragma ' + key.split(':', 1)[1] if word == 'pragma' else word})
    return findings


# --------------------------------------------------------------------------
# classify_group
# --------------------------------------------------------------------------
def _analyze(removed, added, context=None, typedefs=None):
    typedefs = DOLPHIN_TYPEDEFS if typedefs is None else typedefs
    removed, added = list(removed or []), list(added or [])
    findings = codegen_directives(added, removed)
    shapes, real = [], set()
    if tokenize('\n'.join(removed)) == tokenize('\n'.join(added)):
        return {'findings': findings, 'shapes': ['cosmetic'] if not findings else [], 'real': real, 'explained': True}
    old, new = Side('removed', removed, typedefs), Side('added', added, typedefs)
    cross = []
    for side in (old, new):
        side.items = _strip_single_braces(side.items)
    _merge_split_decls(old, new, cross)
    _merge_split_decls(new, old, cross)
    for side in (old, new):
        _fold_patterns(side, cross)
    _early_return(old, new, cross)
    _early_return(new, old, cross)
    _inline_temps(new, old, cross, context)
    _inline_temps(old, new, cross)
    _fold_assignments(new, old, cross)
    _fold_assignments(old, new, cross)
    for side in (old, new):
        side.items = _strip_single_braces(side.items)
        _fold_patterns(side, cross)
    # A pattern both sides folded the same way is unchanged code, not an edit.
    final = {}
    for side in (old, new):
        for item, line in side.items:
            tag = getattr(line, 'tag', None)
            if tag is not None:
                final[id(tag)] = side.key(item)
    folded = {'removed': set(), 'added': set()}
    for found in cross:
        if found['shape'] != 'temp_alias' and id(found) in final:
            folded[found['side']].add(final[id(found)])
        if found.get('sig'):
            folded[found['side']].add(found['sig'])
    for found in cross:
        theirs = folded['added' if found['side'] == 'removed' else 'removed']
        if found['shape'] != 'temp_alias' and (final.get(id(found)) in theirs or found.get('sig') in theirs):
            continue
        findings.append(_public(found, len(removed)))

    keys_old = [old.key(it) for it, _ in old.items]
    keys_new = [new.key(it) for it, _ in new.items]
    matcher = difflib.SequenceMatcher(None, keys_old, keys_new, autojunk=False)
    deleted, inserted = [], []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for (o, _), (n, line) in zip(old.items[i1:i2], new.items[j1:j2]):
                if item_key(o, NO_PASSES, typedefs) == item_key(n, NO_PASSES, typedefs):
                    continue
                for shape in _needed_passes(o, n, typedefs):
                    findings.append({'shape': shape, 'line': line + 1, 'before': render_item(o), 'after': render_item(n), 'detail': f'same statement after {shape} normalization'})
        else:
            deleted.extend(old.items[i1:i2])
            inserted.extend(new.items[j1:j2])
    # Moves: the same normalized item on both sides at different positions.
    pool = {}
    for entry in inserted:
        pool.setdefault(new.key(entry[0]), []).append(entry)
    remaining_deleted = []
    for entry in deleted:
        key = old.key(entry[0])
        if pool.get(key) and entry[0][0] not in ('{', '}', 'else'):
            moved = pool[key].pop(0)
            inserted.remove(moved)
            shape = 'decl_reorder' if entry[0][0] == 'decl' else 'statement_permutation'
            findings.append({'shape': shape, 'line': moved[1] + 1, 'before': render_item(entry[0]), 'after': render_item(moved[0]), 'detail': 'statement moved'})
        else:
            remaining_deleted.append(entry)
    pairs, lone_old, lone_new = _pair_items(remaining_deleted, inserted, old, new)
    for (o, _), (n, line) in pairs:
        swaps = []
        out = set()
        no = norm_item(o, ALL_PASSES, typedefs)
        nn = norm_item(n, ALL_PASSES, typedefs)
        _diff_items(no, nn, out, swaps)
        for kind, before, after in swaps:
            shape = 'type_spelling' if kind == 'explicit_cast' else 'accessor_swap'
            findings.append({'shape': shape, 'line': line + 1, 'before': before, 'after': after, 'detail': kind})
        out.discard('accessor_swap')
        respelled = _cast_respelling(o, n, typedefs)
        if respelled:
            findings.append({'shape': 'type_spelling', 'line': line + 1, 'before': respelled[0], 'after': respelled[1],
                             'detail': 'cast spelled another way, same target type'})
        real |= {s for s in out if s in REAL_SHAPES}
        if 'other' in out:
            shapes.append('other')
    braces_old = [e for e in lone_old if e[0][0] in ('{', '}')]
    braces_new = [e for e in lone_new if e[0][0] in ('{', '}')]
    if not (braces_old and braces_new):
        # A brace on one side only is where the line diff cut the block, not an edit.
        lone_old = [e for e in lone_old if e[0][0] not in ('{', '}')]
        lone_new = [e for e in lone_new if e[0][0] not in ('{', '}')]
    for entry in lone_old:
        out = set()
        _lone_item(entry[0], 'removed', out)
        real |= {s for s in out if s in REAL_SHAPES}
        if 'other' in out:
            shapes.append('other')
    for entry in lone_new:
        out = set()
        _lone_item(entry[0], 'added', out)
        real |= {s for s in out if s in REAL_SHAPES}
        if 'other' in out:
            shapes.append('other')
    explained = not real and 'other' not in shapes
    return {'findings': findings, 'shapes': shapes, 'real': real, 'explained': explained}


def _public(found, removed_count):
    return {'shape': found['shape'], 'line': found['line'] + 1 if found['side'] == 'added' else None,
            'before': found['before'], 'after': found['after'], 'detail': found['detail'],
            **({'name': found['name'], 'uses': found['uses'], 'direction': 'introduced' if found['side'] == 'added' else 'inlined'}
               if found['shape'] == 'temp_alias' else {})}


def _cast_respelling(old, new, typedefs):
    """(before, after) when the two items' casts target the same canonical types but are
    spelled differently (`(T*)e` vs `static_cast<T*>(e)`, `(s32)x` vs `(int)x`), else None."""
    def casts(item):
        found = [sub for sub in walk(item) if _is_node(sub) and sub[0] == 'cast' and not isinstance(sub[2], str)]
        return sorted(found, key=lambda c: canonical_type(list(c[2]), typedefs))

    old_casts, new_casts = casts(old), casts(new)
    if not old_casts or len(old_casts) != len(new_casts):
        return None
    for a, b in zip(old_casts, new_casts):
        if canonical_type(list(a[2]), typedefs) != canonical_type(list(b[2]), typedefs):
            return None
    for a, b in zip(old_casts, new_casts):
        if (a[1], a[2]) != (b[1], b[2]):
            return _render(a), _render(b)
    return None


def _needed_passes(old, new, typedefs):
    needed = []
    for name in ITEM_PASSES:
        without = ALL_PASSES - {name}
        if item_key(old, without, typedefs) != item_key(new, without, typedefs):
            needed.append(name)
    if needed:
        return needed
    raw_old, raw_new = item_key(old, NO_PASSES, typedefs), item_key(new, NO_PASSES, typedefs)
    return [name for name in ITEM_PASSES
            if item_key(old, frozenset([name]), typedefs) != raw_old or item_key(new, frozenset([name]), typedefs) != raw_new]


def _pair_items(deleted, inserted, old, new):
    """Pair replaced items by kind and similarity, keeping order."""
    pairs, used = [], set()
    lone_old = []
    for entry in deleted:
        key = old.key(entry[0])
        best, best_ratio = None, 0.0
        for index, candidate in enumerate(inserted):
            if index in used or not _pairable(entry[0], candidate[0]):
                continue
            ratio = difflib.SequenceMatcher(None, key, new.key(candidate[0]), autojunk=False).ratio()
            if ratio > best_ratio:
                best, best_ratio = index, ratio
        if best is not None and best_ratio >= 0.35:
            used.add(best)
            pairs.append((entry, inserted[best]))
        else:
            lone_old.append(entry)
    lone_new = [entry for index, entry in enumerate(inserted) if index not in used]
    return pairs, lone_old, lone_new


def _pairable(a, b):
    if a[0] == b[0]:
        return a[0] not in ('{', '}', 'else', 'do', 'break', 'continue')
    return {a[0], b[0]} <= {'expr', 'return', 'decl'}


def classify_group(removed, added, *, context=None, typedefs=None):
    """Shapes of one edit group (removed lines -> added lines).

    {'shapes': [...steering/directive/'cosmetic'/'other'...], 'real_shapes': [...],
     'details': {'findings': [...], 'explained': bool}}; ``explained`` means the
    shapes found account for every difference (no 'other' residue)."""
    result = _analyze(removed, added, context, typedefs)
    order = STEERING_SHAPES + DIRECTIVE_SHAPES + ('cosmetic', 'other')
    found = {f['shape'] for f in result['findings']} | set(result['shapes'])
    shapes = [s for s in order if s in found]
    real = [s for s in REAL_SHAPES if s in result['real']]
    if not shapes and not real:
        shapes = ['cosmetic']
    return {'shapes': shapes, 'real_shapes': real,
            'details': {'findings': result['findings'], 'explained': result['explained']}}


def temp_alias(removed, added, context=None, typedefs=None):
    return [f for f in _analyze(removed, added, context, typedefs)['findings'] if f['shape'] == 'temp_alias']


def form_rewrites(removed, added, typedefs=None, context=None):
    return [f for f in _analyze(removed, added, context, typedefs)['findings'] if f['shape'] in FORM_SHAPES]


# --------------------------------------------------------------------------
# Statement-complete edit groups from two file texts
# --------------------------------------------------------------------------
def statement_groups(base_text, cand_text, max_extend=40):
    """Line-diff hunks of base -> candidate, widened to whole statements.

    [{'base_start', 'base_end', 'cand_start', 'cand_end' (1-based, inclusive;
    end < start when that side is empty), 'removed', 'added'}]."""
    a = base_text.split('\n')
    b = cand_text.split('\n')
    matcher = difflib.SequenceMatcher(None, a, b, autojunk=False)
    spans = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue
        steps = 0
        while i1 > 0 and j1 > 0 and a[i1 - 1] == b[j1 - 1] and not ends_statement(b[j1 - 1]) and steps < max_extend:
            i1, j1, steps = i1 - 1, j1 - 1, steps + 1
        steps = 0
        while steps < max_extend and i2 < len(a) and j2 < len(b) and a[i2] == b[j2] and (
                (i2 > i1 and not ends_statement(a[i2 - 1])) or (j2 > j1 and not ends_statement(b[j2 - 1]))):
            i2, j2, steps = i2 + 1, j2 + 1, steps + 1
        if spans and (i1 <= spans[-1][1] or j1 <= spans[-1][3]):
            p = spans[-1]
            spans[-1] = (min(p[0], i1), max(p[1], i2), min(p[2], j1), max(p[3], j2))
        else:
            spans.append((i1, i2, j1, j2))
    return [{'base_start': i1 + 1, 'base_end': i2, 'cand_start': j1 + 1, 'cand_end': j2,
             'removed': a[i1:i2], 'added': b[j1:j2]} for i1, i2, j1, j2 in spans]


def main(argv=None):
    import argparse
    import json
    import subprocess
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--repo', default='.')
    parser.add_argument('--base-ref', required=True)
    parser.add_argument('files', nargs='+')
    args = parser.parse_args(argv)
    typedefs = load_typedefs(Path(args.repo))
    report = []
    for path in args.files:
        base = subprocess.run(['git', '-C', args.repo, 'show', f'{args.base_ref}:{path}'], capture_output=True, text=True).stdout
        cand = (Path(args.repo) / path).read_text(errors='replace')
        for group in statement_groups(base, cand):
            result = classify_group(group['removed'], group['added'], typedefs=typedefs)
            report.append({'file': path, 'cand_start': group['cand_start'], 'cand_end': group['cand_end'], **result})
    print(json.dumps(report, indent=1))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

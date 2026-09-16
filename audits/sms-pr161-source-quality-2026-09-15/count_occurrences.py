"""Count retained occurrences at the pinned audit head, with explicit units."""
import collections
import json
import pathlib
import re


def build_counts(findings, root, snapshot, checkpoints, source_url):
    by_id = {f['id']: f for f in findings}
    counts = {}

    def source(fid):
        return (snapshot / by_id[fid]['file']).read_text().splitlines()

    def matches(fid, pattern):
        return [(i, line) for i, line in enumerate(source(fid), 1)
                if re.search(pattern, line)]

    def location(fid, line, description, **extra):
        file = by_id[fid]['file']
        return dict(file=file, line=line, description=description,
                    source_url=f'{source_url}{file}#L{line}', **extra)

    def record(fid, unit, occurrences, detail, **extra):
        counts[fid] = dict(count=len(occurrences), unit=unit,
                          file_count=len({o['file'] for o in occurrences}),
                          detail=detail, locations=occurrences, **extra)

    one = {
        'F01': ('helper definition', 27, 'scaleVector', 'One invalid helper definition, called once at line 106. Definition and use are not counted as two independent defects.'),
        'F03': ('out-of-bounds expression', 481, 'unk[2]', 'One out-of-bounds member access in MarioWaistCtrl. The pointer declaration is supporting code, not a second occurrence.'),
        'F04': ('class substitution', 1, 'TTakeActor header suppression and replacement', 'One replacement class. The guard override, copied body, and out-of-line destructor are parts of the same substitution.'),
        'F05': ('class substitution', 8, 'TOrthoProj macro rename and replacement', 'One replacement class. The macro rename and local class body are parts of the same substitution.'),
        'F06': ('class substitution', 20, 'TPollutionTest local replacement', 'One local replacement class conflicting with its owning header.'),
        'F08': ('uncalled helper', 82, 'dummy', 'One uncalled helper containing two vector stores and three explicit destructor calls. Those five statements are not five independent helper defects.'),
        'F10': ('discarded literal expression', 32, 'getTalkMsgID discarded literal', 'One discarded string-literal expression in one empty function.'),
        'F12': ('volatile cast expression', 136, 'volatile TTakeActor view', 'One volatile cast in one holder-test condition.'),
        'F13': ('unused matrix declaration', 181, 'Mtx mtx', 'One unused matrix in TMarioEffect::perform.'),
        'F14': ('unused vector declaration', 123, 'Vec pos', 'One unused vector in TLightCommon::perform. Neighboring used Vec declarations are excluded.'),
        'F15': ('widened matrix declaration', 134, 'Mtx44 mtx', 'One matrix widened from 3x4 to 4x4 in NozzleCtrl.'),
        'F16': ('synthetic helper definition', 134, 'matanNegate', 'One helper definition, called once at line 156. The call is not counted as a second helper.'),
        'F19': ('subtraction-of-negation expression', 17, '(m[0][0] + m[1][1]) - -m[2][2]', 'One arithmetic expression in MtxToQuat.'),
    }
    for fid, (unit, line, name, detail) in one.items():
        record(fid, unit, [location(fid, line, name)], detail)

    discarded = matches('F07', r'^\s*strcmp\(name,.*\);\s*$')
    assert len(discarded) == 15
    f07_source = source('F07')
    sites = []
    for line, text in discarded:
        branch = re.search(r'if \(strcmp\(name, "([^"]+)"', f07_source[line-2])
        assert branch and f07_source[line].strip() == 'return nullptr;'
        sites.append(location('F07', line, branch.group(1), expression=text.strip()))
    record('F07', 'discarded strcmp call', sites,
           '15 discarded comparison calls in 15 distinct placeholder factory branches, all in one function.')

    array_lines = source('F09')
    array_start = next(i for i, line in enumerate(array_lines) if 'bossEnemyNames[]' in line)
    array_end = next(i for i in range(array_start, len(array_lines)) if '};' in array_lines[i])
    string_entries = []
    for i in range(array_start+1, array_end):
        for match in re.finditer(r'"(?:\\.|[^"\\])*"', array_lines[i]):
            string_entries.append(location('F09', i+1, match.group()))
    assert len(string_entries) == 72
    record('F09', 'unused string array', [location('F09', array_start+1, 'bossEnemyNames')],
           'One unused array containing 72 string entries. Entries measure its extent; they are not 72 separate array defects.',
           string_entry_count=len(string_entries), string_entries=string_entries)

    casts = matches('F11', r'volatile u16')
    assert len(casts) == 14
    pairs = []
    for guard, update in zip(casts[::2], casts[1::2]):
        assert guard[1].strip().startswith('if ') and '|=' in update[1]
        pairs.append(location('F11', guard[0], 'flag-check/update pair',
                              update_line=update[0], cast_expression_count=2))
    record('F11', 'flag-check/update pair', pairs,
           'Seven pairs in fireStreamingMovie, containing 14 volatile cast expressions. Compound assignment can perform both a read and a write; this is a source-expression count, not a machine-access count.',
           cast_expression_count=len(casts))

    pointers = matches('F17', r'f32 \(\*sqrt\)\(f32\)')
    assert len(pointers) == 2
    record('F17', 'fixed function-pointer call site',
           [location('F17', line, name) for (line, _), name in zip(pointers, ['evIsNearSameActors', 'evIsNearActors'])],
           'Two fixed function-pointer declarations, each immediately used by its distance test, in two functions.')

    gotos = matches('F18', r'\bgoto\s+\w+;')
    assert len(gotos) == 6
    record('F18', 'control-flow rewrite',
           [location('F18', 129, 'rsetup movie fallback', goto_lines=[line for line, _ in gotos[:3]]),
            location('F18', 277, 'direct movie/stage dispatch', goto_lines=[line for line, _ in gotos[3:]])],
           'Two rewritten control-flow regions in two functions, containing six goto statements in total.',
           goto_statement_count=len(gotos))

    # The saved objdiff has aligned target/candidate instruction rows. Match
    # each operator-new call by aligned row, then map source new expressions
    # in the same straight-line factory branch order. Keep nonlocal layouts
    # outside F02, whose claim concerns newly introduced local class layouts.
    fid = 'F02'
    lines = source(fid)
    text = '\n'.join(lines)
    local_types = set(re.findall(r'^class (\w+)', text, re.M)
                      + re.findall(r'^DECL_(?:ENEMY|MANAGER)\((\w+)\)', text, re.M))
    allocations = [(i, re.search(r'\bnew (\w+)', line).group(1))
                   for i, line in enumerate(lines, 1) if re.search(r'\bnew (\w+)', line)]
    checkpoint = next(c for c in checkpoints if c['commit'].startswith('a0a91afb'))
    diff = json.loads(pathlib.Path(checkpoint['diffPath']).read_text())
    extracted = {}
    for side in ['left', 'right']:
        symbol = next(s for s in diff[side]['symbols'] if s['name'].startswith('getNameRef_Enemy'))
        instructions = symbol['instructions']
        rows = []
        for i, row in enumerate(instructions):
            if '__nw__' not in row.get('instruction', {}).get('formatted', ''):
                continue
            prior = next(x['instruction'] for x in reversed(instructions[:i]) if 'instruction' in x)
            operand = re.fullmatch(r'li r3, (0x[0-9a-f]+)', prior['formatted'])
            assert operand, prior
            following = [x['instruction'].get('formatted', '') for x in instructions[i+1:i+18] if 'instruction' in x]
            rows.append(dict(aligned_row=i, size=int(operand.group(1), 16),
                             instruction=prior['formatted'], address=prior.get('address'),
                             constructor=next((x for x in following if '__ct__' in x), None)))
        extracted[side] = rows
    assert len(allocations) == len(extracted['left']) == len(extracted['right']) == 140
    all_rows = []
    sites = []
    for (line, cls), target, candidate in zip(allocations, extracted['left'], extracted['right']):
        assert target['aligned_row'] == candidate['aligned_row']
        record_row = location(fid, line, cls, class_name=cls, local_class=cls in local_types,
                              target=target, candidate=candidate,
                              size_mismatch=target['size'] != candidate['size'])
        all_rows.append(record_row)
        if record_row['size_mismatch'] and record_row['local_class']:
            sites.append(record_row)
    classes = sorted({o['class_name'] for o in sites})
    undersized = sum(o['candidate']['size'] < o['target']['size'] for o in sites)
    oversized = sum(o['candidate']['size'] > o['target']['size'] for o in sites)
    assert (len(sites), len(classes), undersized, oversized) == (54, 45, 53, 1)
    record(fid, 'wrong-size allocation site', sites,
           '54 allocation sites across 45 newly declared local classes: 53 undersized and one oversized. The file contains 51 new local classes used at 60 allocation sites; six classes have no size mismatch in this saved comparison and are not counted as confirmed wrong-size layouts. Three other mismatched allocations use header-owned types and are outside this finding.',
           affected_class_count=len(classes), affected_classes=classes,
           undersized_count=undersized, oversized_count=oversized,
           local_class_count=len(local_types), local_allocation_site_count=sum(t in local_types for _, t in allocations),
           saved_checkpoint=checkpoint['commit'], score_source='historical saved target/candidate objdiff; no fresh compilation')
    (root/'evidence'/'allocation-count-evidence.json').write_text(json.dumps(
        dict(checkpoint=checkpoint['commit'], diff_path=checkpoint['diffPath'],
             total_allocations=140, local_class_count=len(local_types),
             affected_classes=classes, wrong_local_allocations=len(sites), allocations=all_rows),
        indent=2, ensure_ascii=False)+'\n')

    assert set(counts) == set(by_id)
    for finding in findings:
        finding['occurrences'] = counts[finding['id']]
    metadata = dict(head=by_id['F01']['source_url'].split('/blob/')[1].split('/')[0],
                    scope='retained source occurrences covered by the 19 audited findings at the pinned PR head',
                    methodology='Static source sites, not runtime executions, worker attempts, or independent score gains. Counting units differ; do not sum the rows. Pre-existing issues and excluded review candidates are outside these counts.',
                    findings=counts)
    (root/'counts.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False)+'\n')
    out = ['# Occurrence Counts for SMS PR #161', '',
           f"Audited head: `{metadata['head']}`", '', metadata['methodology'], '',
           'All 19 findings have a count below. Counts cover the retained instances established by this audit, not a claim that a general-purpose lint has found every possible similar construct in the repository.', '',
           '| ID | Finding | Count | Unit and Extent |', '| --- | --- | ---: | --- |']
    for f in findings:
        c = counts[f['id']]
        out.append(f"| [{f['id']}](REPORT.md#{f['id'].lower()}) | {f['title']} | {c['count']} | {c['unit']}; {c['file_count']} file |")
    out += ['', 'The largest repeated groups are F02 with 54 wrong-size allocations across 45 local classes, F07 with 15 discarded comparisons, and F11 with seven flag-check/update pairs containing 14 volatile casts. F04-F06 together are three class substitutions; F13-F14 together are two unused aggregate declarations.', '']
    for f in findings:
        fid = f['id']
        c = counts[fid]
        out += [f'<a id="{fid.lower()}"></a>', f"## {fid}: {f['title']}", '',
                f"**{c['count']} {c['unit']}.** {c['detail']}", '']
        if fid == 'F02':
            out += ['Sizes below come from the saved checkpoint. The factory source differs from that checkpoint only in declaration-macro formatting, which preserves expanded definitions. The comparison includes all 140 operator-new sites; only wrong-sized allocations of newly introduced local classes enter this count.', '',
                    '| Class | Sites | Candidate Bytes | Target Bytes | Source Lines |', '| --- | ---: | --- | --- | --- |']
            grouped = collections.defaultdict(list)
            for loc in c['locations']:
                grouped[loc['class_name']].append(loc)
            for cls, locs in sorted(grouped.items()):
                candidate_sizes = sorted({hex(o['candidate']['size']) for o in locs})
                target_sizes = sorted({hex(o['target']['size']) for o in locs})
                links = ', '.join(f"[{o['line']}]({o['source_url']})" for o in locs)
                out.append(f"| {cls} | {len(locs)} | {', '.join(candidate_sizes)} | {', '.join(target_sizes)} | {links} |")
            out += ['', '[All 140 allocation comparisons](evidence/allocation-count-evidence.json).', '']
        else:
            out += ['| Occurrence | Location |', '| --- | --- |']
            for loc in c['locations']:
                out.append(f"| {loc['description']} | [{loc['file']}:{loc['line']}]({loc['source_url']}) |")
            out += ['']
    out += ['Full machine-readable locations and secondary counts are in [counts.json](counts.json).', '']
    (root/'COUNTS.md').write_text('\n'.join(out))
    return counts

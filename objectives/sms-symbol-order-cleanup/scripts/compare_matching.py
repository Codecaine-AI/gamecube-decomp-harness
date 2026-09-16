#!/usr/bin/env python3
"""Compare every reported target function/section, retaining gains and losses."""
def compare_matching(before, after):
    gains, losses = [], []
    old_units = {u['name']: u for u in before['units']}
    new_units = {u['name']: u for u in after['units']}
    if old_units.keys() != new_units.keys():
        raise ValueError('Report unit coverage changed')
    for name, old in old_units.items():
        new = new_units[name]
        for group in ('functions', 'sections'):
            old_items = {x['name']: x for x in old.get(group, [])}
            new_items = {x['name']: x for x in new.get(group, [])}
            if old_items.keys() != new_items.keys():
                raise ValueError(f'Target {group} coverage changed: {name}')
            for symbol, item in old_items.items():
                a = item.get('fuzzy_match_percent', 0)
                b = new_items[symbol].get('fuzzy_match_percent', 0)
                if a != b:
                    row = dict(unit=name, group=group, symbol=symbol, before=a, after=b)
                    (gains if b > a else losses).append(row)
        for key in ('matched_code', 'matched_data', 'matched_functions', 'fuzzy_match_percent'):
            a = float(old.get('measures', {}).get(key, 0))
            b = float(new.get('measures', {}).get(key, 0))
            if b < a:
                losses.append(dict(unit=name, group='measures', symbol=key, before=a, after=b))
    return dict(gains=gains, regressions=losses)

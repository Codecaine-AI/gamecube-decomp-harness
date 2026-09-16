# Naming Review

Retain canonical HashSearchEntry and HSD_HashSearch. Both are declared in the owned header; HashSearchEntry is not static even though it is the lower-level helper. No inferred-name facts exist and no new names are proposed.

| Subject | Canonical Parameter Meaning |
|---|---|
| HSD_HashSearch#r3 | hash, callback-bearing table descriptor |
| HSD_HashSearch#r4 | key, opaque search key sent to keycheck |
| HSD_HashSearch#r5 | success, optional 0/1 entry-existence output |
| HashSearchEntry#r3 | hash, table descriptor |
| HashSearchEntry#r4 | idx, caller-selected bucket index |
| HashSearchEntry#r5 | key, opaque comparison key |
| HashSearchEntry#r6 | ptr, optional cast incoming-link-slot address output |

All seven parameter subjects had no inherited facts. Retain the owned HSD_HashEntry, HSD_HashClass, HSD_HashClassInfo and HSD_Hash record names. No new facts are proposed for foreign HSD_ClassInfo or GObj families.

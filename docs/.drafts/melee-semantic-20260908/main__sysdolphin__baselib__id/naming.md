# Naming Review

Retain all seven canonical export names. No inherited inferred-name facts or new name proposals exist. Keep hsd_iddata, default_table, IDEntry and HSD_IDTable as attested names; section targets are not renamed.

| Subject | Canonical Meaning |
|---|---|
| HSD_IDGetDataFromTable#r3 | table; NULL selects default table |
| HSD_IDGetDataFromTable#r4 | id; unsigned numeric key |
| HSD_IDGetDataFromTable#r5 | success; optional entry-existence output |
| HSD_IDInsertToTable#r3 | table; NULL selects default table |
| HSD_IDInsertToTable#r4 | id; unsigned numeric key |
| HSD_IDInsertToTable#r5 | data; opaque stored payload, may be NULL |
| HSD_IDRemoveByIDFromTable#r3 | table; NULL selects default table |
| HSD_IDRemoveByIDFromTable#r4 | id; key to remove |
| _HSD_IDForgetMemory#r3 | low; ignored |
| _HSD_IDForgetMemory#r4 | high; ignored |

All ten parameter subjects had no inherited facts. Private hash computes modulo 101, IDEntryAlloc obtains and clears a node, IDEntryFree releases a node to the pool, and HSD_IDGetData selects the default table. These helpers are covered without introducing new target names.

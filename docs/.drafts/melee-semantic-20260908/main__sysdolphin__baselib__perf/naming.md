# Naming Decisions

Retain all six canonical function names and the inherited .sbss identification `start_time`. The canonical scalar at perf.c:8 and inspected object symbol table support that section mapping. No new aliases or clears.

The owned inline `HSD_PerfCountMtxLoad` remains canonical and has no independent frozen KB target; its behavior is covered through the TU and statistics layout. `naming.json` lists all target dispositions and evidence.

# Findings

The main correction limits HSD_Free to allocations belonging to the currently selected heap; it does not accept arbitrary pointers or implement a local NULL no-op. The previously undocumented .sdata target stores adr assertion text. Functionality and canonical citations are in functionality.md; coverage.json accounts for all subjects and fact versions.

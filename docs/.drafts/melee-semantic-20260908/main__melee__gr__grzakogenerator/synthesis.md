# Synthesis

Two independent facilities share this TU: segment callback placement and a global81-slot item registry. Segment persistent mode shares one generator across all segments, so later segments can reposition or remove earlier placements; placement count is not creation success. Registry callbacks assume initialized singleton/index/descriptor state. Constructor publication is fallible, failure leaves allocator enable/cursor mutations, and repeated success replaces globals. Cleanup disables updates and conditionally visits the global item list but is not complete manager/table teardown.

#!/usr/bin/env python3
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from source_index import mnemonic_query, run_search

run_search(__file__, query_builder=mnemonic_query)

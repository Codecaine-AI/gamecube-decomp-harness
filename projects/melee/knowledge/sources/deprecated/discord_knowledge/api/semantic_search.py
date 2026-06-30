#!/usr/bin/env python3
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from vector_index import run_semantic_search

run_semantic_search(__file__)

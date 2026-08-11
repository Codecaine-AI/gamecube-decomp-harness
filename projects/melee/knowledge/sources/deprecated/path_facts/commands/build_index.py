#!/usr/bin/env python3
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from _path_facts import write_index


if __name__ == "__main__":
    print(write_index())


#!/usr/bin/env python3
"""Convenience runner forwarding to tests/test_browser_flows.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tests.test_browser_flows import run

if __name__ == "__main__":
    run()

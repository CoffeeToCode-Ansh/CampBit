#!/usr/bin/env python3
"""Convenience runner forwarding to tests/run_live_security_audit.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import tests.run_live_security_audit

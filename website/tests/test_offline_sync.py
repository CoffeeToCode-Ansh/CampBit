#!/usr/bin/env python3
"""Offline Synchronization & Idempotency Test Suite.

Simulates offline attendance queueing and verifies that when connectivity is restored,
batches are synced to /api/attendance/sync safely, idempotently, and without duplications.
"""
import sys
import uuid
import datetime as dt
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import database

BASE_URL = "http://localhost:8000"
try:
    _res = httpx.get(f"{BASE_URL}/", timeout=1.0)
    client = httpx.Client(base_url=BASE_URL, timeout=15.0)
except Exception:
    from starlette.testclient import TestClient
    from main import app
    client = TestClient(app)

passed = 0
failed = 0

def check(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"  ✅ [PASS] {name}")
    except AssertionError as e:
        failed += 1
        print(f"  ❌ [FAIL] {name}: {e}")
    except Exception as e:
        failed += 1
        print(f"  💥 [ERROR] {name}: {e}")

print("\n=======================================================")
print("✈️ REAL OFFLINE SYNCHRONIZATION & IDEMPOTENCY TEST SUITE")
print("=======================================================\n")

# 1. Login as Faculty (CSE)
res = client.post("/api/login", json={"user": "SC-FACA", "password": "Pass123!", "role": "staff"})
assert res.status_code == 200
token = res.json().get("token")
headers = {"Authorization": f"Bearer {token}"}

# Generate unique offline batch parameters
client_uuid = f"offline-queue-{uuid.uuid4()}"
session_id = f"SES-OFFLINE-{uuid.uuid4().hex[:8]}"
today = dt.date.today().isoformat()

offline_batch = {
    "client_uuid": client_uuid,
    "session_id": session_id,
    "dept": "CSE",
    "year": "3",
    "subject": "Microprocessors & Embedded Systems",
    "section": "A",
    "date": today,
    "period": "2",
    "records": [
        {"student_id": "SC-STU", "status": "present", "student_name": "Test Student"},
    ]
}

def t_offline_1():
    # Simulate connectivity restore: Flush offline queue to API
    r = client.post("/api/attendance/sync", headers=headers, json=offline_batch)
    assert r.status_code == 200, f"Sync failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("ok") is True
check("Offline batch synchronizes successfully upon network restoration", t_offline_1)

def t_offline_2():
    # Verify in database that session and record exist
    conn = database.get_connection()
    rec = conn.execute("SELECT * FROM attendance WHERE session_id = ? AND student_id = ?", (session_id, "SC-STU")).fetchone()
    assert rec is not None, "Attendance record not found in database"
    assert rec["status"] == "present"
    assert rec["client_uuid"] == client_uuid
check("Database integrity verified: record committed with client_uuid", t_offline_2)

def t_offline_3():
    # Network retry simulation: re-send identical batch
    r2 = client.post("/api/attendance/sync", headers=headers, json=offline_batch)
    assert r2.status_code == 200, f"Retry failed: {r2.status_code} {r2.text}"
    # Verify no duplicate records were inserted in the database
    conn = database.get_connection()
    count = conn.execute("SELECT COUNT(*) FROM attendance WHERE session_id = ? AND student_id = ?", (session_id, "SC-STU")).fetchone()[0]
    assert count == 1, f"Expected exactly 1 attendance record, found {count} (duplicate created!)"
check("Idempotency guarantee: duplicated sync does not produce duplicate records", t_offline_3)

def t_offline_4():
    # Multi-batch offline sync: queue multiple lectures and flush
    multi_batches = []
    for i in range(3):
        b_uuid = f"multi-offline-{uuid.uuid4()}"
        b_ses = f"SES-MULTI-{i}-{uuid.uuid4().hex[:6]}"
        b = {
            "client_uuid": b_uuid,
            "session_id": b_ses,
            "dept": "CSE",
            "year": "3",
            "subject": f"Lab Module {i+1}",
            "section": "B",
            "date": today,
            "period": str(i+3),
            "records": [{"student_id": "SC-STU", "status": "present"}]
        }
        r = client.post("/api/attendance/sync", headers=headers, json=b)
        assert r.status_code == 200
        multi_batches.append(b_ses)

    conn = database.get_connection()
    for s in multi_batches:
        c = conn.execute("SELECT COUNT(*) FROM attendance WHERE session_id = ?", (s,)).fetchone()[0]
        assert c == 1
check("Multi-session queue flush succeeds across multiple class periods", t_offline_4)

print("\n=======================================================")
print(f"OFFLINE SYNC SUMMARY: {passed} PASSED, {failed} FAILED")
print("=======================================================\n")

if failed > 0:
    sys.exit(1)

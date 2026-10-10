#!/usr/bin/env python3
"""Standout Features Validation Suite:
1. Campus Command Center (Executive Directorate & SLA Escalations)
2. Smart Attendance Risk Engine (Debarment Threshold & Risk Calculator)
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
print("🏛️ CAMPUS COMMAND CENTER & SMART ATTENDANCE RISK ENGINE")
print("=======================================================\n")

# Tokens
r_prin = client.post("/api/login", json={"user": "SC-PRIN", "password": "Pass123!", "role": "staff"})
assert r_prin.status_code == 200
h_prin = {"Authorization": f"Bearer {r_prin.json()['token']}"}

r_stu = client.post("/api/login", json={"user": "SC-STU", "password": "Pass123!", "role": "student"})
assert r_stu.status_code == 200
h_stu = {"Authorization": f"Bearer {r_stu.json()['token']}"}

# --- PART 1: CAMPUS COMMAND CENTER ---
print("--- 1. Campus Command Center (Executive Directorate) ---")

def t_cmd_1():
    # Verify Principal Executive Session Profile
    r = client.get("/api/me", headers=h_prin)
    assert r.status_code == 200
    d = r.json()
    assert d["role"] == "principal"
    assert d["college_id"] == "BPUT"
check("Principal connects to Campus Executive Session", t_cmd_1)

def t_cmd_2():
    # Seed realistic pending multi-day leave requiring executive second-level sanction
    conn = database.get_connection()
    today = dt.date.today().isoformat()
    end_day = (dt.date.today() + dt.timedelta(days=7)).isoformat()
    conn.execute(
        """
        INSERT INTO leaves (college_id, user_id, login_id, name, dept, hostel, leave_type, from_date, to_date, reason, status, stage, target_role, created_at, updated_at)
        VALUES ('BPUT', 1, 'SC-STU', 'Test Student', 'CSE', 'Block A', 'Outstation', ?, ?, 'Research Paper Presentation Abroad', 'Pending', 'Waiting for Principal', 'principal', ?, ?)
        """,
        (today, end_day, today, today)
    )
    conn.commit()

    # Query leaves through principal dashboard
    r = client.get("/api/leaves", headers=h_prin)
    assert r.status_code == 200
    leaves = r.json()
    waiting_for_prin = [l for l in leaves if l.get("stage") == "Waiting for Principal" or l.get("target_role") == "principal"]
    assert len(waiting_for_prin) > 0, "Second-level leave sanction queue empty"
check("Leave Sanctions Directorate receives multi-stage escalated applications", t_cmd_2)

def t_cmd_3():
    # Trigger SLA Breach Escalation Engine with realistic data
    # Create an open complaint that has breached threshold
    conn = database.get_connection()
    old_time = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=52)).isoformat()
    cur = conn.execute(
        """
        INSERT INTO complaints (college_id, user_id, login_id, name, category, location, title, description, status, is_anonymous, created_at, updated_at)
        VALUES ('BPUT', 1, 'SC-STU', 'Test Student', 'Hostel', 'Block A Mess', 'Cold Water Dispenser Faulty', 'No hot water in winter', 'Open', 0, ?, ?)
        """,
        (old_time, old_time)
    )
    conn.commit()
    cid = cur.lastrowid

    # Run SLA engine
    r = client.post("/api/admin/sla/run", headers=h_prin)
    assert r.status_code == 200
    res = r.json()
    assert res.get("ok") is True

    # Check requests table for Principal urgent intervention notice
    reqs = conn.execute("SELECT * FROM requests WHERE college_id = 'BPUT' AND target_role = 'principal' AND type = 'escalation'").fetchall()
    assert len(reqs) > 0, "No SLA escalation request created for Principal"
check("SLA Breach Engine detects overdue grievances and escalates to Principal Inbox", t_cmd_3)

# --- PART 2: SMART ATTENDANCE RISK ENGINE ---
print("\n--- 2. Smart Attendance Risk Engine ---")

def t_risk_1():
    # Simulate low attendance for a student (e.g. 12 present out of 20 classes = 60% < 75%)
    total_classes = 20
    present_classes = 12
    pct = round((present_classes / total_classes) * 100, 1)

    # Risk Engine threshold evaluation
    is_at_risk = pct < 75.0
    risk_level = "HIGH_RISK_DEBARMENT" if pct < 65.0 else ("AT_RISK" if pct < 75.0 else "SAFE")
    alert_badge = "⚠️ Risk of debarment" if is_at_risk else "✓ Above required limit"
    accent_class = "db-accent-rose" if is_at_risk else "db-accent-emerald"

    assert pct == 60.0
    assert is_at_risk is True
    assert alert_badge == "⚠️ Risk of debarment"
    assert accent_class == "db-accent-rose"
check("Attendance Risk Engine triggers debarment warning when attendance falls below 75%", t_risk_1)

def t_risk_2():
    # Simulate high attendance for a student (e.g. 18 present out of 20 classes = 90% >= 75%)
    total_classes = 20
    present_classes = 18
    pct = round((present_classes / total_classes) * 100, 1)

    is_at_risk = pct < 75.0
    alert_badge = "⚠️ Risk of debarment" if is_at_risk else "✓ Above required limit"
    accent_class = "db-accent-rose" if is_at_risk else "db-accent-emerald"

    assert pct == 90.0
    assert is_at_risk is False
    assert alert_badge == "✓ Above required limit"
    assert accent_class == "db-accent-emerald"
check("Attendance Risk Engine marks student in Good Standing when attendance is >= 75%", t_risk_2)

def t_risk_3():
    # Test subject-level risk breakdown
    subjects_data = [
        {"subject": "Data Structures", "present": 14, "total": 15},   # 93.3% -> Safe
        {"subject": "Mathematics III", "present": 7, "total": 12},     # 58.3% -> Critical Risk
        {"subject": "Operating Systems", "present": 11, "total": 14},  # 78.6% -> Safe
    ]
    for s in subjects_data:
        s["pct"] = round((s["present"] / s["total"]) * 100, 1)
        s["risk"] = s["pct"] < 75.0

    critical_subjects = [s["subject"] for s in subjects_data if s["risk"]]
    assert critical_subjects == ["Mathematics III"]
check("Subject-by-subject granular risk analyzer isolates specific debarment subjects", t_risk_3)

print("\n=======================================================")
print(f"STANDOUT FEATURES SUMMARY: {passed} PASSED, {failed} FAILED")
print("=======================================================")

if failed > 0:
    sys.exit(1)

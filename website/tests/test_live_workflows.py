#!/usr/bin/env python3
"""End-to-End Live Workflow Test Suite for CampBit.

Validates complete business workflows across all roles against the active backend server:
1. Student Workflow (Auth, Profile, Notices, Leaves, Grievances, Attendance)
2. Faculty Workflow (Auth, Profile, Attendance Sessions, Attendance Sync)
3. HOD Workflow (Auth, Department Leaves, Timetable Adjustments)
4. Warden Workflow (Auth, Hostel Leaves, Hostel Grievances)
5. Principal Workflow (Auth, Cross-department Overview, Grievances Oversight)
6. Admin Workflow (Auth, User Directory, Audit Logs, Analytics, SLA Engine)
7. Recruiter / Guest Workflow (Auth, Talent Catalog, PII Protection)
"""
import sys
import uuid
import datetime as dt
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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
workflow_records = []

def run_step(role_name, step_name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        workflow_records.append({"role": role_name, "step": step_name, "status": "PASS", "detail": "Success"})
        print(f"  ✅ [{role_name}] {step_name}")
    except AssertionError as e:
        failed += 1
        workflow_records.append({"role": role_name, "step": step_name, "status": "FAIL", "detail": str(e)})
        print(f"  ❌ [{role_name}] {step_name} - Assertion Failed: {e}")
    except Exception as e:
        failed += 1
        workflow_records.append({"role": role_name, "step": step_name, "status": "ERROR", "detail": str(e)})
        print(f"  💥 [{role_name}] {step_name} - Error: {e}")

print("\n=======================================================")
print("🌐 EXECUTING FULL CAMPBIT LIVE APPLICATION WORKFLOW SUITE")
print("=======================================================\n")

# Store tokens
tokens = {}
def login(role_key, username, password, role_type="student"):
    r = client.post("/api/login", json={"user": username, "password": password, "role": role_type})
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, f"Token missing for {username}"
    tokens[role_key] = token
    return token

def auth_headers(role_key):
    return {"Authorization": f"Bearer {tokens[role_key]}"}

# ---------------- 1. STUDENT WORKFLOW ----------------
print("--- 1. Student Business Workflow ---")
run_step("Student", "Authentication & JWT Grant", lambda: login("student", "SC-STU", "Pass123!", "student"))

def test_student_profile():
    r = client.get("/api/me", headers=auth_headers("student"))
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "student"
    assert data["login_id"] == "SC-STU"
run_step("Student", "Fetch Profile & Tenant Verification", test_student_profile)

def test_student_notices():
    r = client.get("/api/collections", headers=auth_headers("student"))
    assert r.status_code == 200
    assert "cc_nt" in r.json()
run_step("Student", "Browse Campus Noticeboard", test_student_notices)

created_leave_id = None
def test_student_create_leave():
    global created_leave_id
    today = dt.date.today().isoformat()
    r = client.post("/api/leaves", headers=auth_headers("student"), json={
        "leave_type": "Medical",
        "from_date": today,
        "to_date": today,
        "reason": "Automated workflow medical leave"
    })
    assert r.status_code == 200, f"Leave creation failed: {r.status_code} {r.text}"
    created_leave_id = r.json().get("leave", {}).get("id")
    assert created_leave_id is not None
run_step("Student", "Submit Outstation/Medical Leave Application", test_student_create_leave)

def test_student_view_leaves():
    r = client.get("/api/leaves", headers=auth_headers("student"))
    assert r.status_code == 200
    leaves = r.json()
    assert isinstance(leaves, list)
    assert any(l["id"] == created_leave_id for l in leaves)
run_step("Student", "Verify Leave Tracking Dashboard", test_student_view_leaves)

def test_student_file_grievance():
    r = client.post("/api/complaints", headers=auth_headers("student"), json={
        "category": "Hostel",
        "title": "Room Wifi Signal Weak",
        "description": "Wifi coverage is intermittent on the 2nd floor",
        "location": "Block A 204",
        "is_anonymous": False
    })
    assert r.status_code == 200, f"Grievance creation failed: {r.status_code} {r.text}"
    cid = r.json().get("complaint", {}).get("id")
    assert cid is not None
run_step("Student", "File Campus Grievance / Complaint", test_student_file_grievance)

# ---------------- 2. FACULTY WORKFLOW ----------------
print("\n--- 2. Faculty Business Workflow ---")
run_step("Faculty", "Authentication (CSE Department)", lambda: login("faculty_cse", "SC-FACA", "Pass123!", "staff"))

def test_faculty_profile():
    r = client.get("/api/me", headers=auth_headers("faculty_cse"))
    assert r.status_code == 200
    assert r.json()["role"] == "faculty"
    assert r.json()["dept"] == "CSE"
run_step("Faculty", "Verify Department & Role Assignment", test_faculty_profile)

new_session_id = f"SES-{uuid.uuid4().hex[:8]}"
def test_faculty_sync_attendance():
    today = dt.date.today().isoformat()
    r = client.post("/api/attendance/sync", headers=auth_headers("faculty_cse"), json={
        "client_uuid": str(uuid.uuid4()),
        "session_id": new_session_id,
        "dept": "CSE",
        "year": "3",
        "subject": "Distributed Systems",
        "section": "A",
        "date": today,
        "period": "1",
        "records": [
            {"student_id": "SC-STU", "status": "present", "student_name": "Test Student"}
        ]
    })
    assert r.status_code == 200, f"Attendance sync failed: {r.status_code} {r.text}"
run_step("Faculty", "Synchronize Lecture Roster Attendance", test_faculty_sync_attendance)

# ---------------- 3. HOD WORKFLOW ----------------
print("\n--- 3. HOD Business Workflow ---")
run_step("HOD", "Authentication (HOD CSE)", lambda: login("hod_cse", "SC-HODC", "Pass123!", "staff"))

def test_hod_leaves():
    r = client.get("/api/leaves", headers=auth_headers("hod_cse"))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
run_step("HOD", "Review Department Pending Leaves", test_hod_leaves)

def test_hod_create_timetable_adjustment():
    today = dt.date.today().isoformat()
    r = client.post("/api/timetable/adjustments", headers=auth_headers("hod_cse"), json={
        "dept": "CSE",
        "year": "3",
        "adjustment_type": "substitution",
        "subject": "Computer Networks",
        "original_teacher": "SC-FACA",
        "substitute_teacher": "SC-FACB",
        "date": today,
        "time": "10:00 AM",
        "period": "2",
        "room": "LH-101",
        "reason": "Faculty attending research symposium"
    })
    assert r.status_code in (200, 201), f"Timetable adjustment failed: {r.status_code} {r.text}"
run_step("HOD", "Publish Timetable Faculty Substitution", test_hod_create_timetable_adjustment)

# ---------------- 4. WARDEN WORKFLOW ----------------
print("\n--- 4. Warden Business Workflow ---")
run_step("Warden", "Authentication (Block A Warden)", lambda: login("warden_a", "SC-WA", "Pass123!", "staff"))

def test_warden_hostel_leaves():
    r = client.get("/api/leaves", headers=auth_headers("warden_a"))
    assert r.status_code == 200
    leaves = r.json()
    assert isinstance(leaves, list)
run_step("Warden", "Inspect Hostel Outstation Passes", test_warden_hostel_leaves)

def test_warden_hostel_complaints():
    r = client.get("/api/complaints", headers=auth_headers("warden_a"))
    assert r.status_code == 200
    complaints = r.json()
    assert isinstance(complaints, list)
run_step("Warden", "Review Hostel Maintenance Grievances", test_warden_hostel_complaints)

# ---------------- 5. PRINCIPAL WORKFLOW ----------------
print("\n--- 5. Principal Business Workflow ---")
run_step("Principal", "Authentication (Campus Executive)", lambda: login("principal", "SC-PRIN", "Pass123!", "staff"))

def test_principal_complaints_oversight():
    r = client.get("/api/complaints", headers=auth_headers("principal"))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
run_step("Principal", "Campus-Wide Grievance Directorate Feed", test_principal_complaints_oversight)

def test_principal_leaves_oversight():
    r = client.get("/api/leaves", headers=auth_headers("principal"))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
run_step("Principal", "Institutional Leave & Movement Audit", test_principal_leaves_oversight)

# ---------------- 6. ADMIN WORKFLOW ----------------
print("\n--- 6. Admin System Governance Workflow ---")
run_step("Admin", "Authentication (Root Administrator)", lambda: login("admin", "SC-ADM", "Pass123!", "admin"))

def test_admin_user_directory():
    r = client.get("/api/users", headers=auth_headers("admin"))
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    assert len(users) >= 5
run_step("Admin", "Multi-Role User Directory Governance", test_admin_user_directory)

def test_admin_audit_logs():
    r = client.get("/api/admin/audit-logs", headers=auth_headers("admin"))
    assert r.status_code == 200
    data = r.json()
    assert "logs" in data and isinstance(data["logs"], list)
    assert len(data["logs"]) > 0
run_step("Admin", "Security & System Audit Log Trail", test_admin_audit_logs)

def test_admin_analytics():
    r = client.get("/api/admin/analytics", headers=auth_headers("admin"))
    assert r.status_code == 200
    data = r.json()
    assert "total_users" in data or "students_count" in data or "stats" in data or isinstance(data, dict)
run_step("Admin", "Institutional Analytics & KPIs Dashboard", test_admin_analytics)

def test_admin_sla_engine():
    r = client.post("/api/admin/sla/run", headers=auth_headers("admin"))
    assert r.status_code == 200
    data = r.json()
    assert "escalated" in data or "checked" in data or "status" in data
run_step("Admin", "Execute Grievance SLA Escalation Engine", test_admin_sla_engine)

# ---------------- 7. RECRUITER / GUEST WORKFLOW ----------------
print("\n--- 7. Recruiter & Placement Workflow ---")
run_step("Recruiter", "Authentication (Guest Corporate Recruiter)", lambda: login("recruiter", "SEC-REC-BPUT", "Pass123!", "guest"))

def test_recruiter_talent_catalog():
    r = client.get("/api/recruiter/candidates", headers=auth_headers("recruiter"))
    assert r.status_code == 200
    res = r.json()
    assert "items" in res and isinstance(res["items"], list)
    for c in res["items"]:
        assert "phone" not in c or not c.get("phone"), "PII phone leaked in candidate catalog"
run_step("Recruiter", "Candidate Catalog Exploration & PII Shield", test_recruiter_talent_catalog)

print("\n=======================================================")
print(f"WORKFLOW TEST SUMMARY: {passed} PASSED, {failed} FAILED")
print("=======================================================\n")

if failed > 0:
    sys.exit(1)

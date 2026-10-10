#!/usr/bin/env python3
"""Live Multi-Role Permission & Workflow Test Suite.

Verifies role-based access control and live operations across all 8 roles:
1. Student (SC-STU)
2. Faculty (SC-FACA)
3. HOD (SC-HODC)
4. Principal (SC-PRIN)
5. Warden (SC-WA)
6. Placement Officer (SEC-PLACE-BPUT)
7. Admin (SC-ADM)
8. Guest / Recruiter (SEC-REC-BPUT)
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
print("🛡️ 8-ROLE PERMISSIONS & LIVE WORKFLOW VERIFICATION SUITE")
print("=======================================================\n")

tokens = {}
for role_key, u, p, r in [
    ("student", "SC-STU", "Pass123!", "student"),
    ("faculty", "SC-FACA", "Pass123!", "staff"),
    ("hod", "SC-HODC", "Pass123!", "staff"),
    ("principal", "SC-PRIN", "Pass123!", "staff"),
    ("warden", "SC-WA", "Pass123!", "staff"),
    ("placement", "SEC-PLACE-BPUT", "Pass123!", "staff"),
    ("admin", "SC-ADM", "Pass123!", "admin"),
    ("guest", "SEC-REC-BPUT", "Pass123!", "guest"),
]:
    res = client.post("/api/login", json={"user": u, "password": p, "role": r})
    assert res.status_code == 200, f"Login failed for {u}: {res.status_code} {res.text}"
    tokens[role_key] = res.json().get("token")

def h(role_key):
    return {"Authorization": f"Bearer {tokens[role_key]}"}

# 1. STUDENT PERMISSIONS
print("--- 1. Student Permissions (SC-STU) ---")
def t_stu_1():
    r = client.get("/api/me", headers=h("student"))
    assert r.status_code == 200 and r.json()["role"] == "student"
check("Student can fetch own profile (/api/me)", t_stu_1)

def t_stu_2():
    r1 = client.get("/api/collections", headers=h("student"))
    assert r1.status_code == 200 and "cc_nt" in r1.json()
    r2 = client.get("/api/leaves", headers=h("student"))
    assert r2.status_code == 200 and isinstance(r2.json(), list)
check("Student can browse notices and own leaves", t_stu_2)

def t_stu_3():
    r = client.get("/api/users", headers=h("student"))
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
check("Student FORBIDDEN from user administration (/api/users)", t_stu_3)

def t_stu_4():
    r = client.get("/api/admin/audit-logs", headers=h("student"))
    assert r.status_code == 403
check("Student FORBIDDEN from audit logs (/api/admin/audit-logs)", t_stu_4)

def t_stu_5():
    r = client.get("/api/placement/requests", headers=h("student"))
    assert r.status_code == 403
check("Student FORBIDDEN from placement officer queue (/api/placement/requests)", t_stu_5)

# 2. FACULTY PERMISSIONS
print("\n--- 2. Faculty Permissions (SC-FACA) ---")
def t_fac_1():
    r = client.get("/api/timetable/adjustments", headers=h("faculty"))
    assert r.status_code == 200
check("Faculty can view department timetable", t_fac_1)

def t_fac_2():
    r = client.post("/api/attendance/sync", headers=h("faculty"), json={
        "client_uuid": str(uuid.uuid4()), "session_id": f"SES-{uuid.uuid4().hex[:6]}",
        "dept": "CSE", "year": "3", "subject": "Algorithms", "date": dt.date.today().isoformat(),
        "period": "1", "records": [{"student_id": "SC-STU", "status": "present"}]
    })
    assert r.status_code == 200
check("Faculty can sync lecture attendance", t_fac_2)

def t_fac_3():
    r = client.post("/api/users", headers=h("faculty"), json={"login_id": "X", "name": "X", "role": "student", "password": "Pass123!"})
    assert r.status_code == 403
check("Faculty FORBIDDEN from creating system users (/api/users)", t_fac_3)

def t_fac_4():
    r = client.get("/api/placement/requests", headers=h("faculty"))
    assert r.status_code == 403
check("Faculty FORBIDDEN from placement officer queue", t_fac_4)

# 3. HOD PERMISSIONS
print("\n--- 3. HOD Permissions (SC-HODC) ---")
def t_hod_1():
    r = client.get("/api/leaves", headers=h("hod"))
    assert r.status_code == 200 and isinstance(r.json(), list)
check("HOD can review department leave applications", t_hod_1)

def t_hod_2():
    r = client.post("/api/timetable/adjustments", headers=h("hod"), json={
        "dept": "CSE", "year": "3", "adjustment_type": "extra_class", "subject": "Compiler Design",
        "date": dt.date.today().isoformat(), "period": "4", "reason": "Syllabus completion"
    })
    assert r.status_code in (200, 201)
check("HOD can publish timetable adjustment for own dept", t_hod_2)

def t_hod_3():
    r = client.post("/api/timetable/adjustments", headers=h("hod"), json={
        "dept": "ECE", "year": "3", "adjustment_type": "extra_class", "subject": "VLSI",
        "date": dt.date.today().isoformat(), "period": "4", "reason": "Cross dept breach"
    })
    assert r.status_code == 403
check("HOD FORBIDDEN from publishing timetable for OTHER dept (ECE)", t_hod_3)

# 4. WARDEN PERMISSIONS
print("\n--- 4. Warden Permissions (SC-WA) ---")
def t_war_1():
    r = client.get("/api/leaves", headers=h("warden"))
    assert r.status_code == 200 and isinstance(r.json(), list)
check("Warden can review hostel leave passes", t_war_1)

def t_war_2():
    r = client.get("/api/complaints", headers=h("warden"))
    assert r.status_code == 200 and isinstance(r.json(), list)
check("Warden can review hostel grievances", t_war_2)

def t_war_3():
    r = client.post("/api/timetable/adjustments", headers=h("warden"), json={
        "dept": "CSE", "year": "3", "adjustment_type": "substitution", "subject": "Math",
        "date": dt.date.today().isoformat(), "period": "1"
    })
    assert r.status_code == 403
check("Warden FORBIDDEN from academic timetable management", t_war_3)

# 5. PRINCIPAL PERMISSIONS
print("\n--- 5. Principal Permissions (SC-PRIN) ---")
def t_prin_1():
    r = client.get("/api/complaints", headers=h("principal"))
    assert r.status_code == 200 and isinstance(r.json(), list)
check("Principal has executive oversight over all grievances", t_prin_1)

def t_prin_2():
    r = client.get("/api/admin/audit-logs", headers=h("principal"))
    assert r.status_code == 200 and "logs" in r.json()
check("Principal can access system audit logs", t_prin_2)

def t_prin_3():
    r = client.post("/api/admin/sla/run", headers=h("principal"))
    assert r.status_code == 200
check("Principal can run SLA check on demand", t_prin_3)

# 6. PLACEMENT OFFICER PERMISSIONS
print("\n--- 6. Placement Officer Permissions (SEC-PLACE-BPUT) ---")
def t_place_1():
    r = client.get("/api/placement/requests", headers=h("placement"))
    assert r.status_code == 200 and isinstance(r.json(), list)
check("Placement Officer can access corporate contact requests (/api/placement/requests)", t_place_1)

def t_place_2():
    r = client.post("/api/timetable/adjustments", headers=h("placement"), json={
        "dept": "CSE", "year": "3", "adjustment_type": "substitution", "subject": "Math",
        "date": dt.date.today().isoformat(), "period": "1"
    })
    assert r.status_code == 403
check("Placement Officer FORBIDDEN from academic timetable adjustments", t_place_2)

def t_place_3():
    r = client.post("/api/users", headers=h("placement"), json={"login_id": "X", "name": "X", "role": "student", "password": "Pass123!"})
    assert r.status_code == 403
check("Placement Officer FORBIDDEN from system user creation (/api/users)", t_place_3)

# 7. ADMIN PERMISSIONS
print("\n--- 7. Admin Permissions (SC-ADM) ---")
def t_adm_1():
    r = client.get("/api/users", headers=h("admin"))
    assert r.status_code == 200 and len(r.json()) >= 5
check("Admin can query full user directory (/api/users)", t_adm_1)

def t_adm_2():
    r = client.get("/api/admin/analytics", headers=h("admin"))
    assert r.status_code == 200
check("Admin can pull institutional analytics (/api/admin/analytics)", t_adm_2)

def t_adm_3():
    r = client.post("/api/admin/sla/run", headers=h("admin"))
    assert r.status_code == 200
check("Admin can execute SLA engine", t_adm_3)

# 8. GUEST / RECRUITER PERMISSIONS
print("\n--- 8. Guest / Recruiter Permissions (SEC-REC-BPUT) ---")
def t_gst_1():
    r = client.get("/api/recruiter/candidates", headers=h("guest"))
    assert r.status_code == 200 and "items" in r.json()
check("Guest can query anonymized talent catalog (/api/recruiter/candidates)", t_gst_1)

def t_gst_2():
    r = client.get("/api/leaves", headers=h("guest"))
    assert r.status_code == 403
check("Guest FORBIDDEN from internal leaves (/api/leaves)", t_gst_2)

def t_gst_3():
    r = client.get("/api/complaints", headers=h("guest"))
    assert r.status_code == 403
check("Guest FORBIDDEN from internal grievances (/api/complaints)", t_gst_3)

def t_gst_4():
    r = client.get("/api/users", headers=h("guest"))
    assert r.status_code == 403
check("Guest FORBIDDEN from user administration (/api/users)", t_gst_4)

print("\n=======================================================")
print(f"8-ROLE PERMISSIONS SUMMARY: {passed} PASSED, {failed} FAILED")
print("=======================================================\n")

if failed > 0:
    sys.exit(1)

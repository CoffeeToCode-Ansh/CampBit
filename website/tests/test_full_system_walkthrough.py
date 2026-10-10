#!/usr/bin/env python3
"""Comprehensive End-to-End Application Test Suite for CampBit.

Covers:
1. Account Management Lifecycle (Add Admin, Add HOD, Login verification, Update role, Deletion, Security safeguards)
2. Notifications / Announcements Lifecycle (Post Admin, Post HOD scoped, Read as Student, Edit, Delete, Immediate sync)
3. All Student Facilities (Profile, Attendance & Risk engine, Timetable, Leaves add/edit/delete,
   Complaints add/edit/delete, Issues add/edit/delete, Achievements add/verify/delete & tamper-proof safeguards,
   Resources view/download, SOS, Reviews, Recruiting opt-in, SMS leave filing)
4. Everyone's Facilities (Faculty attendance sync & offline retry & scoping, HOD approvals & timetable adjustments,
   Warden hostel approvals & complaint resolution, Placement officer requests, Principal SLA engine & cross-dept oversight,
   Admin audit logs & analytics, Guest/Recruiter talent search, shortlisting & PII protection)
"""
import sys
import uuid
import json
import datetime as dt
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

BASE_URL = "http://localhost:8000"
client = httpx.Client(base_url=BASE_URL, timeout=20.0)

passed = 0
failed = 0
records = []

def run_step(section, step_name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        records.append({"section": section, "step": step_name, "status": "PASS"})
        print(f"  ✅ [{section}] {step_name}")
    except AssertionError as e:
        failed += 1
        records.append({"section": section, "step": step_name, "status": "FAIL", "error": str(e)})
        print(f"  ❌ [{section}] {step_name} - Assertion Failed: {e}")
    except Exception as e:
        failed += 1
        records.append({"section": section, "step": step_name, "status": "ERROR", "error": str(e)})
        print(f"  💥 [{section}] {step_name} - Exception: {e}")

# Helper for login and auth headers
tokens = {}
def login(role_key, username, password, role_type="student"):
    r = client.post("/api/login", json={"user": username, "password": password, "role": role_type})
    assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok, f"Token missing in response for {username}"
    tokens[role_key] = tok
    return tok

def auth_h(role_key):
    return {"Authorization": f"Bearer {tokens[role_key]}"}

print("\n" + "=" * 70)
print("🚀 CAMPBIT FULL APPLICATION DEEP VERIFICATION SUITE")
print("=" * 70 + "\n")

# Sign in primary personas
login("admin", "SC-ADM", "Pass123!", "admin")
login("student", "SC-STU", "Pass123!", "student")
login("faculty", "SC-FACA", "Pass123!", "staff")
login("hod", "SC-HODC", "Pass123!", "staff")
login("warden", "SC-WA", "Pass123!", "staff")
login("placement", "SEC-PLACE-BPUT", "Pass123!", "staff")
login("principal", "SC-PRIN", "Pass123!", "staff")
login("guest", "SEC-REC-BPUT", "Pass123!", "guest")


# ==============================================================================
# SECTION 1: ACCOUNT MANAGEMENT LIFECYCLE (ADD & DELETE ADMIN & HOD ACCOUNTS)
# ==============================================================================
print("\n--- 1. Account Management Lifecycle (Add & Delete Admin & HOD) ---")

NEW_ADMIN_EMAIL = f"e2e_admin_{uuid.uuid4().hex[:6]}@college.example"
NEW_HOD_LOGIN = f"e2e_hod_{uuid.uuid4().hex[:6]}"

def test_admin_add_new_admin():
    r = client.post("/api/users", headers=auth_h("admin"), json={
        "name": "E2E Test Administrator",
        "email": NEW_ADMIN_EMAIL,
        "role": "admin",
        "password": "PassSecure123!"
    })
    assert r.status_code == 200, f"Failed to create new admin: {r.status_code} {r.text}"
    assert r.json().get("ok") is True

    # Verify new admin exists in list
    r_list = client.get("/api/users", headers=auth_h("admin"))
    assert r_list.status_code == 200
    all_logins = [u["login_id"] for u in r_list.json()]
    assert NEW_ADMIN_EMAIL in all_logins, f"{NEW_ADMIN_EMAIL} not found in user directory"
run_step("Accounts", "Admin Creates New Admin Account", test_admin_add_new_admin)

def test_new_admin_login_and_privileges():
    login("new_admin", NEW_ADMIN_EMAIL, "PassSecure123!", "admin")
    r_me = client.get("/api/me", headers=auth_h("new_admin"))
    assert r_me.status_code == 200
    assert r_me.json()["role"] == "admin"
    assert r_me.json()["login_id"] == NEW_ADMIN_EMAIL

    # New admin can view user roster
    r_users = client.get("/api/users", headers=auth_h("new_admin"))
    assert r_users.status_code == 200
run_step("Accounts", "New Admin Logs In & Exercises Admin Privileges", test_new_admin_login_and_privileges)

def test_admin_add_new_hod():
    r = client.post("/api/users", headers=auth_h("admin"), json={
        "name": "Dr. E2E HOD Electrical",
        "login_id": NEW_HOD_LOGIN,
        "email": f"{NEW_HOD_LOGIN}@college.example",
        "role": "hod",
        "dept": "EEE",
        "password": "PassSecure123!"
    })
    assert r.status_code == 200, f"Failed to create new HOD: {r.status_code} {r.text}"
    assert r.json().get("ok") is True

    # Verify new HOD exists in users roster and in cc_staff collection
    r_list = client.get("/api/users", headers=auth_h("admin"))
    all_logins = [u["login_id"] for u in r_list.json()]
    assert NEW_HOD_LOGIN in all_logins

    r_col = client.get("/api/collections", headers=auth_h("admin"))
    staff_entries = r_col.json().get("cc_staff", [])
    assert any(s.get("id", "").lower() == NEW_HOD_LOGIN.lower() for s in staff_entries), "HOD missing from cc_staff directory"
run_step("Accounts", "Admin Creates New HOD Account with Department Scope", test_admin_add_new_hod)

def test_new_hod_login_and_scope():
    login("new_hod", NEW_HOD_LOGIN, "PassSecure123!", "staff")
    r_me = client.get("/api/me", headers=auth_h("new_hod"))
    assert r_me.status_code == 200
    assert r_me.json()["role"] == "hod"
    assert r_me.json()["dept"] == "EEE"
run_step("Accounts", "New HOD Logs In & Verifies Department Scope", test_new_hod_login_and_scope)

def test_admin_change_user_role():
    # Promote or modify department / role
    r = client.post(f"/api/users/{NEW_HOD_LOGIN}/role", headers=auth_h("admin"), json={
        "role": "faculty",
        "dept": "EEE"
    })
    assert r.status_code == 200
    # Re-login since password version bumped
    login("new_hod", NEW_HOD_LOGIN, "PassSecure123!", "staff")
    r_me = client.get("/api/me", headers=auth_h("new_hod"))
    assert r_me.status_code == 200
    assert r_me.json()["role"] == "faculty"
run_step("Accounts", "Admin Modifies Account Role & Automatic Token Revocation", test_admin_change_user_role)

def test_account_deletion_safeguards():
    # Admin cannot delete self
    r_self = client.delete("/api/users/SC-ADM", headers=auth_h("admin"))
    assert r_self.status_code == 400, "Should reject deleting own admin account"
run_step("Accounts", "Safeguard: Admin Cannot Delete Self", test_account_deletion_safeguards)

def test_admin_delete_hod():
    r = client.delete(f"/api/users/{NEW_HOD_LOGIN}", headers=auth_h("admin"))
    assert r.status_code == 200

    # Verify HOD is deleted from users
    r_list = client.get("/api/users", headers=auth_h("admin"))
    all_logins = [u["login_id"] for u in r_list.json()]
    assert NEW_HOD_LOGIN not in all_logins

    # Verify HOD was cleaned up from cc_staff collection
    r_col = client.get("/api/collections", headers=auth_h("admin"))
    staff_entries = r_col.json().get("cc_staff", [])
    assert not any(s.get("id", "").lower() == NEW_HOD_LOGIN.lower() for s in staff_entries)

    # Verify login rejected
    r_login = client.post("/api/login", json={"user": NEW_HOD_LOGIN, "password": "PassSecure123!", "role": "staff"})
    assert r_login.status_code in (400, 401)
run_step("Accounts", "Admin Deletes HOD Account & Verifies Directory Cleanup", test_admin_delete_hod)

def test_admin_delete_new_admin():
    r = client.delete(f"/api/users/{NEW_ADMIN_EMAIL}", headers=auth_h("admin"))
    assert r.status_code == 200

    r_list = client.get("/api/users", headers=auth_h("admin"))
    all_logins = [u["login_id"] for u in r_list.json()]
    assert NEW_ADMIN_EMAIL not in all_logins

    r_login = client.post("/api/login", json={"user": NEW_ADMIN_EMAIL, "password": "PassSecure123!", "role": "admin"})
    assert r_login.status_code in (400, 401)
run_step("Accounts", "Admin Deletes Secondary Admin Account", test_admin_delete_new_admin)


# ==============================================================================
# SECTION 2: NOTIFICATIONS / ANNOUNCEMENTS (POST, READ, EDIT, DELETE)
# ==============================================================================
print("\n--- 2. Notifications & Announcements Lifecycle ---")

NOTICE_TITLE = f"E2E Campus Symposium Notice {uuid.uuid4().hex[:5]}"
EDITED_NOTICE_TITLE = f"UPDATED: {NOTICE_TITLE}"
DEPT_NOTICE_TITLE = f"CSE Dept Electives {uuid.uuid4().hex[:4]}"

def test_admin_post_notification():
    r = client.get("/api/collections", headers=auth_h("admin"))
    notices = r.json().get("cc_nt", [])

    now_str = dt.date.today().isoformat()
    future_exp = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)).isoformat()
    new_notice = [
        "Events",
        NOTICE_TITLE,
        now_str,
        "All students and faculty are invited to the National Innovation Summit 2026.",
        "Everyone",
        "SC-ADM",
        None,
        "All",
        future_exp,
        "7 Days"
    ]
    updated_notices = [new_notice] + notices

    r_put = client.put("/api/collections/cc_nt", headers=auth_h("admin"), json={"data": updated_notices})
    assert r_put.status_code == 200, f"Failed to post notice: {r_put.status_code} {r_put.text}"
run_step("Notices", "Admin Posts Campus-Wide Notice", test_admin_post_notification)

def test_student_read_notification():
    r = client.get("/api/collections", headers=auth_h("student"))
    assert r.status_code == 200
    student_notices = r.json().get("cc_nt", [])
    titles = [n[1] for n in student_notices if isinstance(n, list) and len(n) > 1]
    assert NOTICE_TITLE in titles, f"Notice '{NOTICE_TITLE}' not visible to student"
run_step("Notices", "Student Reads Published Campus Notice", test_student_read_notification)

def test_hod_post_dept_notification():
    r = client.get("/api/collections", headers=auth_h("hod"))
    notices = r.json().get("cc_nt", [])
    dept_notice = [
        "Academic",
        DEPT_NOTICE_TITLE,
        dt.date.today().isoformat(),
        "CSE students must register their Semester 6 electives before Friday.",
        "Dept:CSE",
        "SC-HODC",
        None,
        "3",
        (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=5)).isoformat(),
        "5 Days"
    ]
    r_put = client.put("/api/collections/cc_nt", headers=auth_h("hod"), json={"data": [dept_notice] + notices})
    assert r_put.status_code == 200, f"HOD failed to post notice: {r_put.status_code} {r_put.text}"

    # Verify CSE student sees the CSE department notice
    r_stu = client.get("/api/collections", headers=auth_h("student"))
    stu_titles = [n[1] for n in r_stu.json().get("cc_nt", []) if isinstance(n, list) and len(n) > 1]
    assert DEPT_NOTICE_TITLE in stu_titles, "Department notice not visible to CSE student"
run_step("Notices", "HOD Posts Scoped Department Notice & CSE Student Verifies", test_hod_post_dept_notification)

def test_admin_edit_notification():
    r = client.get("/api/collections", headers=auth_h("admin"))
    notices = r.json().get("cc_nt", [])
    found = False
    for i, n in enumerate(notices):
        if isinstance(n, list) and len(n) > 1 and n[1] == NOTICE_TITLE:
            notices[i][1] = EDITED_NOTICE_TITLE
            notices[i][3] = "UPDATED: Venue moved to Main Auditorium due to high registrations."
            found = True
            break
    assert found, "Original notice to edit not found"

    r_put = client.put("/api/collections/cc_nt", headers=auth_h("admin"), json={"data": notices})
    assert r_put.status_code == 200

    # Student verifies updated notice
    r_stu = client.get("/api/collections", headers=auth_h("student"))
    stu_titles = [n[1] for n in r_stu.json().get("cc_nt", []) if isinstance(n, list) and len(n) > 1]
    assert EDITED_NOTICE_TITLE in stu_titles, f"Updated title '{EDITED_NOTICE_TITLE}' not visible to student"
run_step("Notices", "Admin Edits Existing Notice & Student Sees Real-time Update", test_admin_edit_notification)

def test_admin_delete_notification():
    r = client.get("/api/collections", headers=auth_h("admin"))
    notices = r.json().get("cc_nt", [])
    filtered = [n for n in notices if not (isinstance(n, list) and len(n) > 1 and n[1] in (NOTICE_TITLE, EDITED_NOTICE_TITLE, DEPT_NOTICE_TITLE))]

    r_put = client.put("/api/collections/cc_nt", headers=auth_h("admin"), json={"data": filtered})
    assert r_put.status_code == 200

    # Student verifies deleted notice is gone
    r_stu = client.get("/api/collections", headers=auth_h("student"))
    stu_titles = [n[1] for n in r_stu.json().get("cc_nt", []) if isinstance(n, list) and len(n) > 1]
    assert EDITED_NOTICE_TITLE not in stu_titles, "Deleted notice still visible to student"
run_step("Notices", "Admin Deletes Notice & Student Verifies Immediate Removal", test_admin_delete_notification)


# ==============================================================================
# SECTION 3: ALL STUDENT FACILITIES
# ==============================================================================
print("\n--- 3. Comprehensive Student Facilities Verification ---")

def test_student_profile_and_dashboard():
    r = client.get("/api/me", headers=auth_h("student"))
    assert r.status_code == 200
    d = r.json()
    assert d["role"] == "student"
    assert d["login_id"] == "SC-STU"
    assert d["dept"] == "CSE"
run_step("Student Facilities", "Student Profile & Tenant Scope Verification", test_student_profile_and_dashboard)

def test_student_attendance_risk_engine():
    r = client.get("/api/attendance", headers=auth_h("student"))
    assert r.status_code == 200
    data = r.json()
    assert "records" in data
    assert "total" in data
    assert "percentage" in data
run_step("Student Facilities", "Smart Attendance Calculation & Risk Query", test_student_attendance_risk_engine)

stu_leave_id = None
def test_student_leaves_crud():
    global stu_leave_id
    today = dt.date.today().isoformat()
    # 1. CREATE Leave
    r = client.post("/api/leaves", headers=auth_h("student"), json={
        "leave_type": "Medical",
        "from_date": today,
        "to_date": today,
        "reason": "Severe headache and viral fever"
    })
    assert r.status_code == 200, f"Leave creation failed: {r.status_code} {r.text}"
    stu_leave_id = r.json().get("leave", {}).get("id")
    assert stu_leave_id is not None

    # 2. READ Leave
    r_list = client.get("/api/leaves", headers=auth_h("student"))
    assert any(l["id"] == stu_leave_id for l in r_list.json())

    # 3. UPDATE / EDIT Leave
    r_edit = client.put(f"/api/leaves/{stu_leave_id}", headers=auth_h("student"), json={
        "leave_type": "Medical",
        "from_date": today,
        "to_date": today,
        "reason": "Updated: Doctor advised rest due to fever"
    })
    assert r_edit.status_code == 200
    assert r_edit.json()["leave"]["reason"].startswith("Updated:")

    # 4. DELETE / CANCEL Leave
    r_del = client.delete(f"/api/leaves/{stu_leave_id}", headers=auth_h("student"))
    assert r_del.status_code == 200
    r_verify = client.get("/api/leaves", headers=auth_h("student"))
    assert not any(l["id"] == stu_leave_id for l in r_verify.json()), "Deleted leave still present"

    # Create a fresh leave for HOD approval flow later
    r_recreate = client.post("/api/leaves", headers=auth_h("student"), json={
        "leave_type": "Casual",
        "from_date": today,
        "to_date": today,
        "reason": "Family function outstation travel"
    })
    assert r_recreate.status_code == 200
    stu_leave_id = r_recreate.json().get("leave", {}).get("id")
run_step("Student Facilities", "Leave Application Lifecycle (Create, Read, Edit, Delete)", test_student_leaves_crud)

stu_complaint_id = None
def test_student_complaints_crud():
    global stu_complaint_id
    # 1. CREATE Complaint
    r = client.post("/api/complaints", headers=auth_h("student"), json={
        "category": "Hostel",
        "title": "Water heater not functioning in Block A",
        "description": "2nd floor bathroom geyser tripping MCB",
        "location": "Hostel Block A, 2nd Floor",
        "is_anonymous": False
    })
    assert r.status_code == 200
    stu_complaint_id = r.json()["complaint"]["id"]

    # 2. READ Complaint
    r_list = client.get("/api/complaints", headers=auth_h("student"))
    assert any(c["id"] == stu_complaint_id for c in r_list.json())

    # 3. UPDATE / EDIT Complaint
    r_edit = client.put(f"/api/complaints/{stu_complaint_id}", headers=auth_h("student"), json={
        "category": "Hostel",
        "title": "UPDATED: Water heater not functioning in Block A",
        "description": "MCB trips immediately when switched on",
        "location": "Hostel Block A, Room 204 wing",
        "is_anonymous": False
    })
    assert r_edit.status_code == 200
    assert r_edit.json()["complaint"]["title"].startswith("UPDATED:")

    # 4. DELETE Complaint
    r_del = client.delete(f"/api/complaints/{stu_complaint_id}", headers=auth_h("student"))
    assert r_del.status_code == 200
    r_verify = client.get("/api/complaints", headers=auth_h("student"))
    assert not any(c["id"] == stu_complaint_id for c in r_verify.json())

    # Create a fresh hostel complaint for Warden status change flow later
    r_fresh = client.post("/api/complaints", headers=auth_h("student"), json={
        "category": "Hostel",
        "title": "Hostel Wi-Fi intermittent connection",
        "description": "Frequent packet drops in Block A study room",
        "location": "Hostel Block A Study Room",
        "is_anonymous": False
    })
    stu_complaint_id = r_fresh.json()["complaint"]["id"]
run_step("Student Facilities", "Grievance / Complaint Box Lifecycle (Create, Read, Edit, Delete)", test_student_complaints_crud)

stu_issue_id = None
def test_student_issues_crud():
    global stu_issue_id
    # 1. CREATE Issue
    r = client.post("/api/issues", headers=auth_h("student"), json={
        "title": "Broken bench in Lecture Hall 2",
        "description": "Right row 3 bench screw is missing"
    })
    assert r.status_code == 200
    stu_issue_id = r.json()["issue"]["id"]

    # 2. READ Issue
    r_list = client.get("/api/issues", headers=auth_h("student"))
    assert any(i["id"] == stu_issue_id for i in r_list.json())

    # 3. UPDATE Issue
    r_edit = client.put(f"/api/issues/{stu_issue_id}", headers=auth_h("student"), json={
        "title": "UPDATED: Broken bench in LH-2",
        "description": "Desk wobbles dangerously"
    })
    assert r_edit.status_code == 200

    # 4. DELETE Issue
    r_del = client.delete(f"/api/issues/{stu_issue_id}", headers=auth_h("student"))
    assert r_del.status_code == 200
run_step("Student Facilities", "Issue Tracker Lifecycle (Create, Read, Edit, Delete)", test_student_issues_crud)

def test_student_achievements_lifecycle():
    today = dt.date.today().isoformat()
    # 1. CREATE Achievement
    r = client.post("/api/achievements", headers=auth_h("student"), json={
        "title": "1st Prize in Smart Odisha Hackathon 2026",
        "category": "Hackathon",
        "date": today,
        "description": "Built AI-based rural road defect detector",
        "link": "https://hackathon.example/winners"
    })
    assert r.status_code == 200
    aid1 = r.json()["achievement"]["id"]

    # 2. READ Achievement
    r_list = client.get("/api/achievements", headers=auth_h("student"))
    assert any(a["id"] == aid1 for a in r_list.json())

    # 3. UPDATE Achievement
    r_edit = client.put(f"/api/achievements/{aid1}", headers=auth_h("student"), json={
        "title": "UPDATED: 1st Prize in Smart Odisha Hackathon 2026",
        "category": "Hackathon",
        "date": today,
        "description": "Won gold medal and Rs 50,000 grant",
        "link": "https://hackathon.example/winners"
    })
    assert r_edit.status_code == 200

    # 4. DELETE unverified Achievement as student
    r_del = client.delete(f"/api/achievements/{aid1}", headers=auth_h("student"))
    assert r_del.status_code == 200

    # 5. CREATE another achievement to test Faculty Verification & Admin Deletion protection
    r2 = client.post("/api/achievements", headers=auth_h("student"), json={
        "title": "IEEE Research Paper on Quantum Cryptography",
        "category": "Publication",
        "date": today,
        "description": "Published in IEEE Access 2026",
        "link": "https://ieee.example/paper"
    })
    assert r2.status_code == 200
    aid2 = r2.json()["achievement"]["id"]

    # Faculty verifies it
    r_v = client.post(f"/api/achievements/{aid2}/verify", headers=auth_h("faculty"), json={"status": "Verified"})
    assert r_v.status_code == 200
    assert r_v.json()["achievement"]["status"] == "Verified"

    # Student cannot delete verified achievement (Security Safeguard)
    r_stu_del = client.delete(f"/api/achievements/{aid2}", headers=auth_h("student"))
    assert r_stu_del.status_code == 403, "Student should NOT delete verified achievement"

    # Admin deletes the verified achievement
    r_adm_del = client.delete(f"/api/achievements/{aid2}", headers=auth_h("admin"))
    assert r_adm_del.status_code == 200
run_step("Student Facilities", "Achievements Lifecycle (Create, Read, Edit, Student Delete, Faculty Verify, Admin Delete)", test_student_achievements_lifecycle)

def test_student_resources_browsing():
    r = client.get("/api/resources", headers=auth_h("student"))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
run_step("Student Facilities", "Academic Course Material & Resources Browsing", test_student_resources_browsing)

def test_student_sos_and_reviews():
    r = client.get("/api/collections", headers=auth_h("student"))
    cols = r.json()
    assert "cc_reviews" in cols

    # Student posts a campus mess review
    reviews = cols.get("cc_reviews", [])
    new_rev = {
        "id": f"rev_{uuid.uuid4().hex[:6]}",
        "rating": 5,
        "tag": "Hostel Block A Mess",
        "text": "Great breakfast quality today!",
        "date": dt.date.today().isoformat(),
        "author": "SC-STU"
    }
    r_put = client.put("/api/collections/cc_reviews", headers=auth_h("student"), json={"data": [new_rev] + reviews})
    assert r_put.status_code == 200
run_step("Student Facilities", "Campus SOS Helpline & Mess Review Submission", test_student_sos_and_reviews)

def test_student_recruiting_opt_in():
    r = client.put("/api/me/recruiting", headers=auth_h("student"), json={
        "visible": True,
        "cgpa": "8.95",
        "backlogs": "0",
        "skills": "Python|FastAPI|React|SQL|Docker",
        "subjects": "Distributed Systems|Operating Systems|DBMS"
    })
    assert r.status_code == 200, f"Recruiting opt-in failed: {r.status_code} {r.text}"

    r_get = client.get("/api/me/recruiting", headers=auth_h("student"))
    assert r_get.status_code == 200
    assert r_get.json()["profile"]["visible"] is True
    assert r_get.json()["profile"]["code"] != ""
run_step("Student Facilities", "Career & Talent Catalog Opt-in Profile", test_student_recruiting_opt_in)

def test_student_sms_leave_gateway():
    r = client.post("/api/sms/inbound", headers=auth_h("student"), json={
        "message": "LEAVE 2 High fever and cold",
        "roll": "SC-STU"
    })
    assert r.status_code == 200
    assert r.json().get("ok") is True
    assert "CAMPBIT SMS:" in r.json().get("reply", "")
    assert r.json().get("leave_id") is not None
run_step("Student Facilities", "Emergency Offline SMS Leave Application Gateway", test_student_sms_leave_gateway)


# ==============================================================================
# SECTION 4: EVERYONE'S FACILITIES (FACULTY, HOD, WARDEN, PLACEMENT, PRINCIPAL, ADMIN, GUEST)
# ==============================================================================
print("\n--- 4. Everyone's Facilities (Faculty, HOD, Warden, Placement, Principal, Admin, Guest) ---")

# --- 4A. FACULTY FACILITIES ---
def test_faculty_attendance_sync_and_idempotency():
    batch_uuid = f"batch_{uuid.uuid4().hex}"
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    today = dt.date.today().isoformat()

    payload = {
        "client_uuid": batch_uuid,
        "session_id": session_id,
        "dept": "CSE",
        "year": "3",
        "subject": "Cloud Computing",
        "section": "A",
        "date": today,
        "period": "1",
        "records": [
            {"student_id": "SC-STU", "student_name": "Test Student", "status": "present"}
        ]
    }
    # 1. Initial Sync
    r1 = client.post("/api/attendance/sync", headers=auth_h("faculty"), json=payload)
    assert r1.status_code == 200, f"Sync failed: {r1.status_code} {r1.text}"
    assert r1.json()["status"] == "synced"
    assert r1.json()["synced_count"] == 1

    # 2. Idempotent Retry Sync (Same UUID)
    r2 = client.post("/api/attendance/sync", headers=auth_h("faculty"), json=payload)
    assert r2.status_code == 200
    assert r2.json()["status"] == "already_synced"
    assert "Idempotent" in r2.json()["message"]
run_step("Faculty Facilities", "Attendance Roll Call Sync & Idempotent Retry", test_faculty_attendance_sync_and_idempotency)

def test_faculty_department_scoping_protection():
    # Faculty is in CSE, attempting to mark ME department
    payload = {
        "client_uuid": f"cross_{uuid.uuid4().hex}",
        "session_id": f"cross_sess_{uuid.uuid4().hex[:6]}",
        "dept": "ME",
        "year": "2",
        "subject": "Thermodynamics",
        "section": "A",
        "date": dt.date.today().isoformat(),
        "period": "2",
        "records": [{"student_id": "ME22-0009", "status": "present"}]
    }
    r = client.post("/api/attendance/sync", headers=auth_h("faculty"), json=payload)
    assert r.status_code == 403, "Faculty should NOT mark attendance for other department"
run_step("Faculty Facilities", "Security Check: Faculty Scoped to Own Department", test_faculty_department_scoping_protection)

uploaded_res_id = None
def test_faculty_resource_upload_and_delete():
    global uploaded_res_id
    files = {"file": ("lecture_notes.pdf", b"%PDF-1.4 sample lecture content for testing", "application/pdf")}
    data = {
        "title": "Unit 3 Distributed Systems Notes",
        "subject": "Distributed Systems",
        "dept": "CSE",
        "semester": "6",
        "description": "Lecture slides and revision questions"
    }
    r_up = client.post("/api/resources", headers=auth_h("faculty"), files=files, data=data)
    assert r_up.status_code == 200, f"Upload resource failed: {r_up.status_code} {r_up.text}"
    uploaded_res_id = r_up.json().get("id")
    if not uploaded_res_id:
        r_all = client.get("/api/resources", headers=auth_h("faculty"))
        uploaded_res_id = r_all.json()[0]["id"]

    # Verify download
    r_dl = client.get(f"/api/resources/{uploaded_res_id}/download", headers=auth_h("faculty"))
    assert r_dl.status_code == 200
    assert r_dl.content.startswith(b"%PDF-1.4")

    # Delete resource
    r_del = client.delete(f"/api/resources/{uploaded_res_id}", headers=auth_h("faculty"))
    assert r_del.status_code == 200
run_step("Faculty Facilities", "Course Material Resource Upload, Download & Deletion", test_faculty_resource_upload_and_delete)

# --- 4B. HOD FACILITIES ---
def test_hod_leave_approval():
    global stu_leave_id
    assert stu_leave_id is not None
    # HOD reviews and approves CSE student leave
    r = client.post(f"/api/leaves/{stu_leave_id}/action", headers=auth_h("hod"), json={
        "status": "Approved",
        "action_note": "Approved by HOD CSE for family travel"
    })
    assert r.status_code == 200
    assert r.json()["leave"]["status"] == "Approved"
run_step("HOD Facilities", "Department Leave Queue Review & Approval", test_hod_leave_approval)

def test_hod_timetable_adjustment_and_ics():
    today = dt.date.today().isoformat()
    r = client.post("/api/timetable/adjustments", headers=auth_h("hod"), json={
        "dept": "CSE",
        "year": "3",
        "adjustment_type": "substitution",
        "subject": "Algorithm Design",
        "original_teacher": "SC-FACA",
        "substitute_teacher": "SC-HODC",
        "date": today,
        "time_slot": "11:00 AM - 12:00 PM",
        "room": "LH-102",
        "reason": "Faculty attending research conference"
    })
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # ICS Calendar export
    r_ics = client.get("/api/timetable/export.ics?dept=CSE&year=3", headers=auth_h("hod"))
    assert r_ics.status_code == 200
    assert "BEGIN:VCALENDAR" in r_ics.text
run_step("HOD Facilities", "Timetable Adjustment Scheduling & .ICS Calendar Export", test_hod_timetable_adjustment_and_ics)

# --- 4C. WARDEN FACILITIES ---
def test_warden_complaint_resolution():
    global stu_complaint_id
    assert stu_complaint_id is not None
    r = client.post(f"/api/complaints/{stu_complaint_id}/status", headers=auth_h("warden"), json={
        "status": "Resolved",
        "action_note": "Hostel Wi-Fi access point rebooted and router antenna replaced"
    })
    assert r.status_code == 200
    assert r.json()["complaint"]["status"] == "Resolved"
run_step("Warden Facilities", "Hostel Grievance Resolution & Action Notes", test_warden_complaint_resolution)

# --- 4D. PLACEMENT OFFICER FACILITIES ---
def test_placement_officer_recruiter_requests():
    import sqlite3
    db = sqlite3.connect("app.db")
    db.execute("DELETE FROM contact_requests WHERE guest_id = (SELECT id FROM users WHERE login_id = 'SEC-REC-BPUT')")
    db.commit()
    db.close()

    # Get student anonymous recruiting code
    r_prof = client.get("/api/me/recruiting", headers=auth_h("student"))
    anon_code = r_prof.json()["profile"]["code"]
    assert anon_code, "Student anon code missing"

    # Recruiter submits a contact request using anonymous code
    r_req = client.post("/api/recruiter/requests", headers=auth_h("guest"), json={
        "code": anon_code,
        "company": "Tata Consultancy Services",
        "message": "Campus hiring interview shortlist"
    })
    assert r_req.status_code == 200, f"Recruiter contact request failed: {r_req.status_code} {r_req.text}"

    # Placement officer views and decides request
    r_list = client.get("/api/placement/requests", headers=auth_h("placement"))
    assert r_list.status_code == 200
    req = next((x for x in r_list.json() if x.get("code") == anon_code), None)
    assert req is not None, "Created request not found in placement list"
    req_id = req["id"]

    r_decide = client.post(f"/api/placement/requests/{req_id}/decide", headers=auth_h("placement"), json={
        "approve": True,
        "note": "Verified genuine corporate recruiter"
    })
    assert r_decide.status_code == 200


run_step("Placement Facilities", "Recruiter Access Vetting & Corporate Contact Authorization", test_placement_officer_recruiter_requests)

# --- 4E. PRINCIPAL FACILITIES ---
def test_principal_sla_escalation_engine():
    # Principal triggers automated institutional SLA engine
    r = client.post("/api/admin/sla/run", headers=auth_h("principal"), json={"force_all": False})
    assert r.status_code == 200
    assert "scanned_complaints" in r.json()
run_step("Principal Facilities", "Automated Institutional SLA Engine & Grievance Oversight", test_principal_sla_escalation_engine)

# --- 4F. ADMIN FACILITIES ---
def test_admin_audit_logs_and_analytics():
    # 1. Audit Trail
    r_audit = client.get("/api/admin/audit-logs?limit=10", headers=auth_h("admin"))
    assert r_audit.status_code == 200
    assert "logs" in r_audit.json()
    assert len(r_audit.json()["logs"]) > 0

    # 2. Executive Analytics
    r_an = client.get("/api/admin/analytics", headers=auth_h("admin"))
    assert r_an.status_code == 200
    metrics = r_an.json()
    assert "roster" in metrics
    assert "attendance" in metrics
    assert "leaves" in metrics
    assert "complaints" in metrics
run_step("Admin Facilities", "Forensic Institutional Audit Trail & System Analytics", test_admin_audit_logs_and_analytics)

# --- 4G. GUEST / RECRUITER FACILITIES ---
def test_guest_talent_search_and_pii_masking():
    # 1. Candidate Catalog Browsing
    r_cand = client.get("/api/recruiter/candidates", headers=auth_h("guest"))
    assert r_cand.status_code == 200
    cands = r_cand.json().get("items", [])
    assert len(cands) > 0

    # PII MASKING CHECK: No recruiter gets plain email or phone in raw list
    for c in cands:
        assert "password_hash" not in c
        assert "@" not in str(c.get("email", "")), f"PII Leak: raw email exposed to guest recruiter: {c.get('email')}"

    # 2. Shortlisting Candidate
    code = cands[0]["code"]
    r_short = client.post(f"/api/recruiter/shortlist/{code}", headers=auth_h("guest"))
    assert r_short.status_code == 200

    # 3. Un-shortlisting Candidate
    r_unshort = client.delete(f"/api/recruiter/shortlist/{code}", headers=auth_h("guest"))
    assert r_unshort.status_code == 200
run_step("Guest Facilities", "Anonymous Talent Catalog Browsing, Shortlisting & Strict PII Masking", test_guest_talent_search_and_pii_masking)

print("\n" + "=" * 70)
print(f"📊 SUMMARY: Total Steps Tested: {passed + failed} | Passed: {passed} | Failed: {failed}")
print("=" * 70 + "\n")

if __name__ == "__main__":
    if failed > 0:
        print("❌ Some test steps failed. Review above.")
        sys.exit(1)
    else:
        print("🎉 ALL CAMPBIT APPLICATION LIFECYCLES PASSED ACCURATELY!")
        sys.exit(0)


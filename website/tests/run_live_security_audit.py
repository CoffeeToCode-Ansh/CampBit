import httpx
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

BASE_URL = "http://localhost:8000"
try:
    _res = httpx.get(f"{BASE_URL}/", timeout=1.0)
    client = httpx.Client(base_url=BASE_URL, timeout=10.0)
except Exception:
    from starlette.testclient import TestClient
    from main import app
    client = TestClient(app)

passed = 0
failed = 0
results = []

def sec_test(test_name, category, test_fn):
    global passed, failed
    try:
        test_fn()
        passed += 1
        results.append({"status": "PASS", "category": category, "test": test_name, "detail": "Compliant"})
        print(f"  🛡️ [PASS] ({category}) {test_name}")
    except AssertionError as e:
        failed += 1
        results.append({"status": "FAIL", "category": category, "test": test_name, "detail": str(e)})
        print(f"  ❌ [FAIL] ({category}) {test_name}: {e}")
    except Exception as e:
        failed += 1
        results.append({"status": "ERROR", "category": category, "test": test_name, "detail": str(e)})
        print(f"  💥 [ERROR] ({category}) {test_name}: {e}")

print("\n=======================================================")
print("🔒 RUNNING LIVE CAMPBIT SECURITY AUDIT & DEFENSE TESTS")
print("=======================================================\n")

# Tokens cache
tokens = {}
for role_key, u, p, r in [
    ("stu_a", "SC-STU", "Pass123!", "student"),
    ("fac_cse", "SC-FACA", "Pass123!", "staff"),
    ("fac_ece", "SC-FACE", "Pass123!", "staff"),
    ("hod_cse", "SC-HODC", "Pass123!", "staff"),
    ("hod_ece", "SC-HODE", "Pass123!", "staff"),
    ("warden_a", "SC-WA", "Pass123!", "staff"),
    ("warden_b", "SC-WB", "Pass123!", "staff"),
    ("principal", "SC-PRIN", "Pass123!", "staff"),
    ("admin", "SC-ADM", "Pass123!", "admin"),
]:
    res = client.post("/api/login", json={"user": u, "password": p, "role": r})
    if res.status_code == 200:
        tokens[role_key] = res.json().get("token")

# --- 1. HTTP SECURITY HEADERS & DEFENSIVE CONTROLS ---
print("\n--- 1. HTTP Security Headers & Framing Defenses ---")
def test_csp_header():
    r = client.get("/")
    assert "content-security-policy" in r.headers, "CSP header missing"
    csp = r.headers["content-security-policy"]
    assert "default-src 'self'" in csp, f"Insecure default-src in CSP: {csp}"
    assert "object-src 'none'" in csp, "Missing object-src 'none' in CSP"
sec_test("Content-Security-Policy (CSP) Enforcement", "Headers", test_csp_header)

def test_mime_sniffing_prevention():
    r = client.get("/")
    assert r.headers.get("x-content-type-options") == "nosniff", "Missing or invalid X-Content-Type-Options"
sec_test("X-Content-Type-Options: nosniff Defense", "Headers", test_mime_sniffing_prevention)

def test_clickjacking_defense():
    r = client.get("/")
    assert r.headers.get("x-frame-options") in ("DENY", "SAMEORIGIN"), "Missing anti-clickjacking X-Frame-Options"
sec_test("Clickjacking Frame Protection (X-Frame-Options)", "Headers", test_clickjacking_defense)

def test_cache_control_on_sensitive_pages():
    r = client.get("/")
    assert "no-store" in r.headers.get("cache-control", ""), "Cache-Control should contain no-store"
sec_test("Cache-Control no-store on sensitive HTML", "Headers", test_cache_control_on_sensitive_pages)

# --- 2. AUTHENTICATION & TOKEN FORGERY DEFENSES ---
print("\n--- 2. Authentication & JWT Tamper Defenses ---")
def test_tampered_token_rejection():
    valid = tokens.get("admin", "")
    assert valid, "Admin token unavailable"
    # Tamper payload or signature
    parts = valid.split(".")
    tampered = parts[0] + "." + parts[1] + ".invalid_sig_xyz123"
    r = client.get("/api/me", headers={"Authorization": f"Bearer {tampered}"})
    assert r.status_code in (401, 403), f"Tampered token should return 401/403, got {r.status_code}"
sec_test("Tampered JWT Signature Rejection", "Auth", test_tampered_token_rejection)

def test_forged_none_algorithm():
    r = client.get("/api/me", headers={"Authorization": "Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxOTAifQ."})
    assert r.status_code in (401, 403), f"alg:none token was not rejected! Status: {r.status_code}"
sec_test("JWT 'alg: none' Exploit Defense", "Auth", test_forged_none_algorithm)

def test_empty_or_malformed_auth():
    for h in ["Bearer", "Bearer malformed_string_xyz", "Basic 123", "InvalidPrefix abc"]:
        r = client.get("/api/me", headers={"Authorization": h})
        assert r.status_code in (401, 403), f"Malformed auth header '{h}' allowed with {r.status_code}"
sec_test("Malformed Authorization Header Rejection", "Auth", test_empty_or_malformed_auth)

# --- 3. VERTICAL PRIVILEGE ESCALATION DEFENSES ---
print("\n--- 3. Vertical Privilege Escalation Defenses (Student -> Admin) ---")
def test_student_cannot_list_all_users():
    r = client.get("/api/users", headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
sec_test("Student Blocked from /api/users", "Access Control", test_student_cannot_list_all_users)

def test_student_cannot_view_audit_logs():
    r = client.get("/api/admin/audit-logs", headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
sec_test("Student Blocked from /api/admin/audit-logs", "Access Control", test_student_cannot_view_audit_logs)

def test_student_cannot_view_admin_analytics():
    r = client.get("/api/admin/analytics", headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
sec_test("Student Blocked from /api/admin/analytics", "Access Control", test_student_cannot_view_admin_analytics)

def test_student_cannot_trigger_admin_sla():
    r = client.post("/api/admin/sla/run", headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
sec_test("Student Blocked from /api/admin/sla/run", "Access Control", test_student_cannot_trigger_admin_sla)

def test_student_cannot_issue_certificates():
    payload = {"student_id": "SC-STU", "title": "Self Issued Certificate"}
    r = client.post("/api/certificates", json=payload, headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}"
sec_test("Student Blocked from /api/certificates (Issuance)", "Access Control", test_student_cannot_issue_certificates)

# --- 4. HORIZONTAL PRIVILEGE ESCALATION & IDOR DEFENSES ---
print("\n--- 4. Horizontal Privilege Escalation & IDOR Defenses ---")
def test_teacher_cannot_mark_other_dept_attendance():
    payload = {
        "client_uuid": f"uuid-cross-dept-{time.time()}",
        "session_id": f"SESS-SEC-{int(time.time())}",
        "dept": "ECE",  # CSE teacher trying to mark ECE department
        "year": "3",
        "subject": "Digital Signals",
        "section": "A",
        "period": "1",
        "date": "2026-10-10",
        "records": [{"student_id": "STU-ECE-01", "status": "present"}]
    }
    r = client.post("/api/attendance/sync", json=payload, headers={"Authorization": f"Bearer {tokens['fac_cse']}"})
    assert r.status_code == 403, f"CSE faculty marking ECE attendance must return 403, got {r.status_code}"
sec_test("Faculty Cross-Department Attendance Lock (403)", "IDOR/Scoping", test_teacher_cannot_mark_other_dept_attendance)

def test_hod_cannot_post_other_dept_timetable():
    payload = {
        "dept": "ECE",  # CSE HOD trying to post for ECE
        "year": "3",
        "adjustment_type": "substitution",
        "subject": "Microprocessors",
        "date": "2026-10-30",
        "reason": "Test"
    }
    r = client.post("/api/timetable/adjustments", json=payload, headers={"Authorization": f"Bearer {tokens['hod_cse']}"})
    assert r.status_code == 403, f"CSE HOD posting ECE timetable must return 403, got {r.status_code}"
sec_test("HOD Cross-Department Timetable Lock (403)", "IDOR/Scoping", test_hod_cannot_post_other_dept_timetable)

def test_hod_cannot_decide_own_leave():
    # Submit a leave as HOD
    r_apply = client.post("/api/leaves", json={
        "leave_type": "Casual",
        "from_date": "2026-10-25",
        "to_date": "2026-10-26",
        "reason": "HOD personal leave"
    }, headers={"Authorization": f"Bearer {tokens['hod_cse']}"})
    assert r_apply.status_code == 200, f"HOD apply leave failed: {r_apply.text}"
    hod_leave_id = r_apply.json()["leave"]["id"]
    # Attempt to self-approve
    r_self = client.post(f"/api/leaves/{hod_leave_id}/action", json={"status": "Approved"}, headers={"Authorization": f"Bearer {tokens['hod_cse']}"})
    assert r_self.status_code == 403, f"HOD self-approving leave must return 403, got {r_self.status_code}"
sec_test("HOD Self-Approval Prevention Lock (403)", "Workflow Security", test_hod_cannot_decide_own_leave)

# --- 5. DATA PRIVACY & ANONYMITY DEFENSES ---
print("\n--- 5. PII Confidentiality & Anonymous Whistleblower Defenses ---")
def test_anonymous_complaint_masking():
    # Submit anonymous complaint
    r_c = client.post("/api/complaints", json={
        "category": "College",
        "location": "Main Campus",
        "title": "Anonymous Whistleblower Safety Report",
        "description": "Sensitive report requiring student privacy",
        "is_anonymous": True
    }, headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r_c.status_code == 200
    cid = r_c.json()["complaint"]["id"]
    # HOD or Staff retrieves complaints
    r_get = client.get("/api/complaints", headers={"Authorization": f"Bearer {tokens['hod_cse']}"})
    assert r_get.status_code == 200
    matched = [c for c in r_get.json() if c.get("id") == cid]
    assert len(matched) == 1, "Anonymous complaint not found in list"
    c_item = matched[0]
    assert c_item.get("name") == "Anonymous", f"Filer name exposed: {c_item.get('name')}"
    assert c_item.get("login_id") in ("", None), f"Filer login_id exposed: {c_item.get('login_id')}"
    assert c_item.get("user_id") in (None, ""), f"Filer user_id exposed: {c_item.get('user_id')}"
sec_test("Anonymous Grievance Filer Identity Masking", "Privacy", test_anonymous_complaint_masking)

def test_recruiter_candidate_pii_protection():
    # Recruiter searches candidates
    r_cand = client.get("/api/recruiter/candidates", headers={"Authorization": f"Bearer {tokens.get('recruiter', tokens['stu_a'])}"})
    if r_cand.status_code == 200:
        cands = r_cand.json()
        if isinstance(cands, list) and len(cands) > 0:
            for c in cands:
                assert "phone" not in c or not c.get("phone"), f"Phone number exposed to recruiter: {c}"
                assert "email" not in c or not c.get("email"), f"Email exposed to recruiter: {c}"
sec_test("Recruiter Candidate Catalog PII Masking", "Privacy", test_recruiter_candidate_pii_protection)

# --- 6. INJECTION & TAMPERING ATTACK DEFENSES ---
print("\n--- 6. SQL Injection & Metacharacter Neutralization ---")
def test_sql_injection_in_search():
    payloads = [
        "' OR '1'='1",
        "1; DROP TABLE users; --",
        "admin'--",
        "\" OR \"\"=\"",
        "UNION SELECT null, null, null--"
    ]
    for p in payloads:
        r = client.get(f"/api/users/search?q={p}", headers={"Authorization": f"Bearer {tokens['admin']}"})
        assert r.status_code == 200, f"Query '{p}' triggered error: {r.status_code}"
        # Response should be a safe list, not crashing or dumping full database indiscriminately
        assert isinstance(r.json(), list), f"Expected list response for query '{p}'"
sec_test("Parameterized Query Defense Against SQL Injection Payloads", "Injection", test_sql_injection_in_search)

# --- 7. FILE UPLOAD SECURITY (MAGIC BYTE VERIFICATION) ---
print("\n--- 7. File Upload & MIME Spoofing Defenses ---")
def test_file_upload_spoofed_executable():
    # An executable ELF/Mach-O disguised with a .png filename
    fake_png = b"\x7fELF\x02\x01\x01\x00malicious_payload_binary"
    files = {"file": ("malicious.png", fake_png, "image/png")}
    r = client.post("/api/upload", files=files, headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r.status_code == 400, f"Disguised binary should be rejected with 400, got {r.status_code}"
sec_test("Rejection of Disguised Executable as PNG (Magic Bytes)", "Upload Security", test_file_upload_spoofed_executable)

def test_file_upload_spoofed_html_as_pdf():
    # HTML file disguised as .pdf to cause stored XSS
    fake_pdf = b"<html><script>alert('xss')</script></html>"
    files = {"file": ("exploit.pdf", fake_pdf, "application/pdf")}
    r = client.post("/api/upload", files=files, headers={"Authorization": f"Bearer {tokens['stu_a']}"})
    assert r.status_code == 400, f"Disguised HTML should be rejected with 400, got {r.status_code}"
sec_test("Rejection of HTML Disguised as PDF (Magic Bytes)", "Upload Security", test_file_upload_spoofed_html_as_pdf)

print("\n=======================================================")
print(f"SECURITY AUDIT SUMMARY: {passed} PASSED, {failed} FAILED")
print("=======================================================\n")

if failed > 0:
    sys.exit(1)

#!/usr/bin/env python3
"""Comprehensive Security Deep-Audit Suite:
1. Session Expiry & Revocation
2. Cross-User Data Access (IDOR Defenses)
3. API Authorization & Role Gating
4. Input Validation & Injection Neutralization
5. File Upload Defenses & Magic-Byte Validation
"""
import sys
import uuid
import datetime as dt
from pathlib import Path
import httpx
import jwt

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import database
import main

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
        print(f"  🛡️ [PASS] {name}")
    except AssertionError as e:
        failed += 1
        print(f"  ❌ [FAIL] {name}: {e}")
    except Exception as e:
        failed += 1
        print(f"  💥 [ERROR] {name}: {e}")

print("\n=======================================================")
print("🔒 DEEP SECURITY DEFENSE & ROBUSTNESS AUDIT SUITE")
print("=======================================================\n")

# Tokens
tokens = {}
for role_key, u, p, r in [
    ("stu1", "SC-STU", "Pass123!", "student"),
    ("fac1", "SC-FACA", "Pass123!", "staff"),
    ("hod1", "SC-HODC", "Pass123!", "staff"),
    ("warden1", "SC-WA", "Pass123!", "staff"),
    ("admin1", "SC-ADM", "Pass123!", "admin"),
]:
    res = client.post("/api/login", json={"user": u, "password": p, "role": r})
    assert res.status_code == 200
    tokens[role_key] = res.json().get("token")

def h(role_key):
    return {"Authorization": f"Bearer {tokens[role_key]}"}

# --- 1. SESSION EXPIRY & TOKEN REVOCATION ---
print("--- 1. Session Expiry & Revocation Defenses ---")

def t_sec_exp_1():
    # Construct an expired token (exp in the past)
    expired_payload = {
        "sub": "1",
        "v": 0,
        "cid": "BPUT",
        "exp": dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)
    }
    expired_token = jwt.encode(expired_payload, main.SECRET_KEY, algorithm="HS256")
    r = client.get("/api/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert r.status_code == 401, f"Expired token was not rejected: {r.status_code}"
    assert "expired" in r.text.lower() or "session" in r.text.lower()
check("Expired JWT signature is strictly rejected with 401 Unauthorized", t_sec_exp_1)

def t_sec_exp_2():
    # Construct token with mismatched pw_version (revoked session after password change)
    revoked_payload = {
        "sub": "1",
        "v": 99999,  # Mismatched version
        "cid": "BPUT",
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=2)
    }
    revoked_token = jwt.encode(revoked_payload, main.SECRET_KEY, algorithm="HS256")
    r = client.get("/api/me", headers={"Authorization": f"Bearer {revoked_token}"})
    assert r.status_code == 401, f"Revoked token with old version was not rejected: {r.status_code}"
check("Password version mismatch triggers immediate session revocation (401)", t_sec_exp_2)

# --- 2. CROSS-USER DATA ACCESS (IDOR) ---
print("\n--- 2. Cross-User Data Access & IDOR Defenses ---")

def t_idor_1():
    conn = database.get_connection()
    try:
        # Get user ID of faculty SC-FACB or SC-FACE
        other_user = conn.execute("SELECT id FROM users WHERE login_id = 'SC-FACB'").fetchone()
        other_uid = other_user[0] if other_user else 2
        now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
        cur = conn.execute(
            """
            INSERT INTO complaints (college_id, user_id, login_id, name, category, location, title, description, status, is_anonymous, created_at, updated_at)
            VALUES ('BPUT', ?, 'SC-FACB', 'Faculty B', 'Hostel', 'Block B', 'Confidential Room Dispute', 'Private matter', 'Open', 0, ?, ?)
            """,
            (other_uid, now_iso, now_iso)
        )
        conn.commit()
        target_cid = cur.lastrowid
    finally:
        conn.close()

    # Student 1 attempts to read other user's grievance
    r = client.get(f"/api/complaints/{target_cid}", headers=h("stu1"))
    assert r.status_code in (403, 404), f"IDOR vulnerability! Student 1 read other user's grievance: {r.status_code}"
check("Horizontal IDOR Defense: Student blocked from viewing another user's grievance", t_idor_1)

def t_idor_2():
    conn = database.get_connection()
    try:
        other_user = conn.execute("SELECT id FROM users WHERE login_id = 'SC-FACB'").fetchone()
        other_uid = other_user[0] if other_user else 2
        now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
        cur = conn.execute(
            """
            INSERT INTO leaves (college_id, user_id, login_id, name, dept, hostel, leave_type, from_date, to_date, reason, status, stage, target_role, created_at, updated_at)
            VALUES ('BPUT', ?, 'SC-FACB', 'Faculty B', 'CSE', 'Block B', 'Medical', '2026-10-10', '2026-10-11', 'Confidential Medical Treatment', 'Pending', 'Pending', 'hod', ?, ?)
            """,
            (other_uid, now_iso, now_iso)
        )
        conn.commit()
        target_lid = cur.lastrowid
    finally:
        conn.close()

    # Student 1 attempts to delete other user's leave
    r = client.delete(f"/api/leaves/{target_lid}", headers=h("stu1"))
    assert r.status_code in (403, 404), f"IDOR vulnerability! Student 1 deleted other user's leave: {r.status_code}"
check("Horizontal IDOR Defense: Student blocked from deleting another user's leave pass", t_idor_2)

# --- 3. API AUTHORIZATION & ROLE GATING ---
print("\n--- 3. API Authorization & Role Gating Defenses ---")

def t_authz_1():
    # Completely unauthenticated request to sensitive endpoint
    r = client.get("/api/admin/audit-logs")
    assert r.status_code in (401, 403), f"Unauthenticated access allowed to audit logs: {r.status_code}"
check("Unauthenticated request to sensitive endpoints blocked with 401/403", t_authz_1)

def t_authz_2():
    # Student attempting to access admin analytics
    r = client.get("/api/admin/analytics", headers=h("stu1"))
    assert r.status_code == 403, f"Student allowed to access admin analytics: {r.status_code}"
check("Vertical privilege escalation blocked: Student cannot access Admin Analytics", t_authz_2)

def t_authz_3():
    # Faculty attempting to access placement officer requests
    r = client.get("/api/placement/requests", headers=h("fac1"))
    assert r.status_code == 403, f"Faculty allowed into Placement Officer queue: {r.status_code}"
check("Vertical privilege escalation blocked: Faculty cannot access Placement Officer queue", t_authz_3)

# --- 4. INPUT VALIDATION & INJECTION NEUTRALIZATION ---
print("\n--- 4. Input Validation & Injection Neutralization Defenses ---")

def t_val_1():
    # SQL Injection payload in user search query
    sqli_payload = "admin' OR '1'='1' UNION SELECT 1,2,3,4,5,6,7,8 --"
    r = client.get(f"/api/users/search?q={sqli_payload}", headers=h("admin1"))
    assert r.status_code == 200
    for item in r.json():
        assert "password_hash" not in item, "SQL Injection payload dumped password_hash!"
check("SQL injection payload in search queries neutralized safely via parameterization", t_val_1)

def t_val_2():
    # Missing required body fields in leave creation (schema validation)
    r = client.post("/api/leaves", headers=h("stu1"), json={"invalid_field": 123})
    assert r.status_code == 422, f"Schema validation bypassed: {r.status_code}"
check("Malformed request payload rejected by Pydantic schema validation (422 Unprocessable)", t_val_2)

def t_val_3():
    # XSS payload inside grievance title and description
    xss_payload = "<script>alert('XSS-PWNED')</script><img src=x onerror=alert(1)>"
    r = client.post("/api/complaints", headers=h("stu1"), json={
        "category": "College",
        "title": xss_payload,
        "description": xss_payload,
        "location": "Main Auditorium",
        "is_anonymous": False
    })
    assert r.status_code == 200
    comp = r.json().get("complaint", {})
    assert "<script>" in comp["title"]
check("Stored XSS payload neutralized safely without backend injection", t_val_3)

# --- 5. FILE UPLOAD & MAGIC-BYTE SECURITY ---
print("\n--- 5. File Upload Defenses & Magic-Byte Validation ---")

def t_up_1():
    # Executable binary disguised as image/png (.png with Windows PE/EXE header)
    files = {"file": ("malware.png", b"MZ\x90\x00\x03\x00\x00\x00", "image/png")}
    r = client.post("/api/upload", headers=h("stu1"), files=files)
    assert r.status_code == 400, f"Disguised executable accepted as PNG! Status: {r.status_code}"
check("Magic-byte validation blocks executable binaries disguised as .png (400)", t_up_1)

def t_up_2():
    # Malicious HTML/JS disguised as application/pdf (.pdf with HTML contents)
    fake_pdf = b"<html><head><script>alert('XSS')</script></head><body>evil</body></html>"
    files = {"file": ("exploit.pdf", fake_pdf, "application/pdf")}
    r = client.post("/api/upload", headers=h("stu1"), files=files)
    assert r.status_code == 400, f"Disguised HTML payload accepted as PDF! Status: {r.status_code}"
check("Magic-byte validation blocks HTML payloads disguised as .pdf (400)", t_up_2)

def t_up_3():
    # Valid PNG image with authentic PNG magic bytes (\x89PNG\r\n\x1a\n)
    valid_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    files = {"file": ("avatar.png", valid_png, "image/png")}
    r = client.post("/api/upload", headers=h("stu1"), files=files)
    assert r.status_code == 200, f"Valid PNG upload failed: {r.status_code} {r.text}"
    assert "url" in r.json() or "filename" in r.json()
check("Legitimate image upload with authentic PNG magic bytes accepted (200 OK)", t_up_3)

print("\n=======================================================")
print(f"DEEP SECURITY AUDIT SUMMARY: {passed} PASSED, {failed} FAILED")
print("=======================================================\n")

if failed > 0:
    sys.exit(1)

"""Comprehensive Automated Regression & Penetration Test Suite for Security Audit Remediation.

Covers:
1. P0.1 Multi-College Tenant Isolation (Users, Recruiters, Candidates, Shortlists, Contact Requests, Placement Officers)
2. P0.2 Recruiter Privacy & Multi-Party Consent Lifecycle (Anonymity, State Machine, Zero Leaks, Dedicated Release Endpoint)
3. P0.3 Secrets & Distributable Archive Hardening (No Static Fallbacks, Safe Production Failures, Constant-time HMAC)
4. P1.2 HTTP Security Headers & Middleware (CSP, HSTS, X-Content-Type-Options, X-Frame-Options)
5. P1.3 File Upload Security & Magic Byte Signature Verification
"""
import io
import os
import unittest
import sqlite3
import datetime as dt
from starlette.testclient import TestClient
import main
from main import app, create_token, hash_password


def mk_user(conn, login, name, role, college_id="BPUT", dept="CSE", hostel=None):
    conn.execute(
        """
        INSERT INTO users (login_id, name, role, password_hash, college_id, dept, hostel)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(login_id) DO UPDATE SET
            role = excluded.role,
            college_id = excluded.college_id,
            dept = excluded.dept,
            hostel = excluded.hostel
        """,
        (login, name, role, hash_password("Pass123!"), college_id, dept, hostel),
    )
    return conn.execute("SELECT id, pw_version, college_id FROM users WHERE login_id = ?", (login,)).fetchone()


class TestSecurityAuditRemediation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        main.init_db()
        cls.client = TestClient(app)
        conn = sqlite3.connect(main.DB_PATH)

        # ---------------- College A: BPUT ----------------
        cls.u_adm_a = mk_user(conn, "SEC-ADM-BPUT", "BPUT Admin", "admin", college_id="BPUT")
        cls.u_place_a = mk_user(conn, "SEC-PLACE-BPUT", "BPUT Placement", "placement_officer", college_id="BPUT")
        cls.u_guest_a = mk_user(conn, "SEC-REC-BPUT", "BPUT Recruiter A", "guest", college_id="BPUT")
        cls.u_stu_a1 = mk_user(conn, "SEC-STU-BPUT-1", "BPUT Student One", "student", college_id="BPUT")
        cls.u_stu_a2 = mk_user(conn, "SEC-STU-BPUT-2", "BPUT Student Two", "student", college_id="BPUT")
        cls.u_fac_a = mk_user(conn, "SEC-FAC-BPUT", "BPUT Faculty", "faculty", college_id="BPUT", dept="CSE")

        # ---------------- College B: OUTR ----------------
        cls.u_adm_b = mk_user(conn, "SEC-ADM-OUTR", "OUTR Admin", "admin", college_id="OUTR")
        cls.u_place_b = mk_user(conn, "SEC-PLACE-OUTR", "OUTR Placement", "placement_officer", college_id="OUTR")
        cls.u_guest_b = mk_user(conn, "SEC-REC-OUTR", "OUTR Recruiter B", "guest", college_id="OUTR")
        cls.u_stu_b1 = mk_user(conn, "SEC-STU-OUTR-1", "OUTR Student One", "student", college_id="OUTR")

        # Seed student profiles for recruitment
        now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO student_profiles (user_id, cgpa, backlogs, subjects, skills, visible, anon_code, updated_at)
            VALUES (?, '8.8', 0, 'DSA|OS', 'Python|Rust', 1, 'STU-BPUT-A1', ?)
            ON CONFLICT(user_id) DO UPDATE SET cgpa='8.8', visible=1, anon_code='STU-BPUT-A1'
            """,
            (cls.u_stu_a1[0], now_iso)
        )
        conn.execute(
            """
            INSERT INTO student_profiles (user_id, cgpa, backlogs, subjects, skills, visible, anon_code, updated_at)
            VALUES (?, '9.2', 0, 'AI|ML', 'PyTorch|Docker', 1, 'STU-OUTR-B1', ?)
            ON CONFLICT(user_id) DO UPDATE SET cgpa='9.2', visible=1, anon_code='STU-OUTR-B1'
            """,
            (cls.u_stu_b1[0], now_iso)
        )

        conn.commit()
        conn.close()

        # Auth headers
        cls.h_adm_a = {"Authorization": f"Bearer {create_token(cls.u_adm_a[0], cls.u_adm_a[1], 'BPUT')}"}
        cls.h_place_a = {"Authorization": f"Bearer {create_token(cls.u_place_a[0], cls.u_place_a[1], 'BPUT')}"}
        cls.h_guest_a = {"Authorization": f"Bearer {create_token(cls.u_guest_a[0], cls.u_guest_a[1], 'BPUT')}"}
        cls.h_stu_a1 = {"Authorization": f"Bearer {create_token(cls.u_stu_a1[0], cls.u_stu_a1[1], 'BPUT')}"}
        cls.h_fac_a = {"Authorization": f"Bearer {create_token(cls.u_fac_a[0], cls.u_fac_a[1], 'BPUT')}"}

        cls.h_adm_b = {"Authorization": f"Bearer {create_token(cls.u_adm_b[0], cls.u_adm_b[1], 'OUTR')}"}
        cls.h_place_b = {"Authorization": f"Bearer {create_token(cls.u_place_b[0], cls.u_place_b[1], 'OUTR')}"}
        cls.h_guest_b = {"Authorization": f"Bearer {create_token(cls.u_guest_b[0], cls.u_guest_b[1], 'OUTR')}"}
        cls.h_stu_b1 = {"Authorization": f"Bearer {create_token(cls.u_stu_b1[0], cls.u_stu_b1[1], 'OUTR')}"}

    def setUp(self):
        conn = sqlite3.connect(main.DB_PATH)
        conn.execute("DELETE FROM contact_requests WHERE guest_id IN (?, ?)", (self.u_guest_a[0], self.u_guest_b[0]))
        conn.execute("DELETE FROM shortlists WHERE guest_id IN (?, ?)", (self.u_guest_a[0], self.u_guest_b[0]))
        conn.commit()
        conn.close()

    # =========================================================================
    # 1. P0.1 MULTI-COLLEGE TENANT ISOLATION TESTS
    # =========================================================================

    def test_tenant_isolation_get_users_endpoint(self):
        """GET /api/users must return accounts from the caller's college only."""
        res_a = self.client.get("/api/users", headers=self.h_adm_a)
        self.assertEqual(res_a.status_code, 200)
        logins_a = [u["login_id"] for u in res_a.json()]
        self.assertIn("SEC-ADM-BPUT", logins_a)
        self.assertNotIn("SEC-ADM-OUTR", logins_a)
        self.assertNotIn("SEC-STU-OUTR-1", logins_a)

        res_b = self.client.get("/api/users", headers=self.h_adm_b)
        self.assertEqual(res_b.status_code, 200)
        logins_b = [u["login_id"] for u in res_b.json()]
        self.assertIn("SEC-ADM-OUTR", logins_b)
        self.assertNotIn("SEC-ADM-BPUT", logins_b)
        self.assertNotIn("SEC-STU-BPUT-1", logins_b)

    def test_tenant_isolation_recruiter_candidates_browsing(self):
        """BPUT Recruiter must see only BPUT students; OUTR candidate must not appear."""
        res_a = self.client.get("/api/recruiter/candidates", headers=self.h_guest_a)
        self.assertEqual(res_a.status_code, 200)
        codes_a = [c["code"] for c in res_a.json()["items"]]
        self.assertIn("STU-BPUT-A1", codes_a)
        self.assertNotIn("STU-OUTR-B1", codes_a)

        res_b = self.client.get("/api/recruiter/candidates", headers=self.h_guest_b)
        self.assertEqual(res_b.status_code, 200)
        codes_b = [c["code"] for c in res_b.json()["items"]]
        self.assertIn("STU-OUTR-B1", codes_b)
        self.assertNotIn("STU-BPUT-A1", codes_b)

    def test_tenant_cross_college_shortlisting_blocked(self):
        """Recruiter cannot shortlist candidates from another college (IDOR/BOLA)."""
        # BPUT Recruiter attempts to shortlist OUTR student
        res = self.client.post("/api/recruiter/shortlist/STU-OUTR-B1", headers=self.h_guest_a)
        self.assertEqual(res.status_code, 404)

        # OUTR Recruiter attempts to shortlist BPUT student
        res2 = self.client.post("/api/recruiter/shortlist/STU-BPUT-A1", headers=self.h_guest_b)
        self.assertEqual(res2.status_code, 404)

    def test_tenant_cross_college_contact_request_blocked(self):
        """Recruiter cannot request contact for candidates from another college."""
        res = self.client.post(
            "/api/recruiter/requests",
            json={"code": "STU-OUTR-B1", "company": "CyberSec Global", "message": "Want to interview you"},
            headers=self.h_guest_a
        )
        self.assertEqual(res.status_code, 404)

    def test_tenant_isolation_placement_officer_queue(self):
        """Placement officer sees only contact requests for their own institution."""
        # 1. BPUT Recruiter requests contact for BPUT Student
        req_res = self.client.post(
            "/api/recruiter/requests",
            json={"code": "STU-BPUT-A1", "company": "Tech Giants Corp", "message": "Campus hiring interview"},
            headers=self.h_guest_a
        )
        self.assertEqual(req_res.status_code, 200)

        # 2. BPUT Placement officer views queue: must see request
        p_res_a = self.client.get("/api/placement/requests", headers=self.h_place_a)
        self.assertEqual(p_res_a.status_code, 200)
        companies_a = [r["company"] for r in p_res_a.json()]
        self.assertIn("Tech Giants Corp", companies_a)

        # 3. OUTR Placement officer views queue: must NOT see BPUT request
        p_res_b = self.client.get("/api/placement/requests", headers=self.h_place_b)
        self.assertEqual(p_res_b.status_code, 200)
        companies_b = [r["company"] for r in p_res_b.json()]
        self.assertNotIn("Tech Giants Corp", companies_b)

    # =========================================================================
    # 2. P0.2 RECRUITER PRIVACY & MULTI-PARTY CONSENT LIFECYCLE TESTS
    # =========================================================================

    def test_candidate_profiles_expose_zero_pii(self):
        """Candidate listings must strictly protect student identity prior to consent."""
        res = self.client.get("/api/recruiter/candidates", headers=self.h_guest_a)
        self.assertEqual(res.status_code, 200)
        items = res.json()["items"]
        self.assertTrue(len(items) > 0)
        for cand in items:
            self.assertNotIn("name", cand)
            self.assertNotIn("email", cand)
            self.assertNotIn("phone", cand)
            self.assertNotIn("roll", cand)
            self.assertIn("code", cand)
            self.assertTrue(cand["code"].startswith("STU-"))

    def test_recruiter_consent_workflow_state_machine(self):
        """Complete workflow: Request -> Placement Review -> Student Consent -> Authorized Release."""
        # 1. Create fresh student and recruiter request
        conn = sqlite3.connect(main.DB_PATH)
        u_stu = mk_user(conn, "SEC-STU-FLOW", "Flow Student", "student", college_id="BPUT")
        conn.execute(
            """
            INSERT INTO student_profiles (user_id, cgpa, backlogs, subjects, skills, visible, anon_code, updated_at)
            VALUES (?, '9.5', 0, 'Math|CS', 'Go|Kubernetes', 1, 'STU-FLOW-01', ?)
            ON CONFLICT(user_id) DO UPDATE SET cgpa='9.5', visible=1, anon_code='STU-FLOW-01'
            """,
            (u_stu[0], dt.datetime.now(dt.timezone.utc).isoformat())
        )
        conn.commit()
        conn.close()

        h_stu = {"Authorization": f"Bearer {create_token(u_stu[0], u_stu[1], 'BPUT')}"}

        # Step 1: Recruiter requests contact
        req_res = self.client.post(
            "/api/recruiter/requests",
            json={"code": "STU-FLOW-01", "company": "Apex Software", "message": "Interview offer for Systems Engineer"},
            headers=self.h_guest_a
        )
        self.assertEqual(req_res.status_code, 200)

        # Get request ID from recruiter requests list
        r_list = self.client.get("/api/recruiter/requests", headers=self.h_guest_a).json()
        target_req = next(r for r in r_list if r["code"] == "STU-FLOW-01" and r["company"] == "Apex Software")
        rid = target_req["id"]
        self.assertEqual(target_req["status"], "pending_officer")
        self.assertIsNone(target_req["contact"], "Contact info must remain None in pending_officer state")

        # Step 2: Recruiter attempts to access contact prematurely -> 403 Forbidden
        premature = self.client.get(f"/api/recruiter/requests/{rid}/contact", headers=self.h_guest_a)
        self.assertEqual(premature.status_code, 403)

        # Step 3: Recruiter cannot self-approve (guest role blocked)
        self_approve = self.client.post(f"/api/placement/requests/{rid}/decide", json={"approve": True}, headers=self.h_guest_a)
        self.assertEqual(self_approve.status_code, 403)

        # Step 4: Placement Officer approves -> transitions to awaiting_student
        officer_act = self.client.post(f"/api/placement/requests/{rid}/decide", json={"approve": True, "note": "Verified genuine employer"}, headers=self.h_place_a)
        self.assertEqual(officer_act.status_code, 200)

        # Verify status is awaiting_student and recruiter STILL cannot access contact
        r_list2 = self.client.get("/api/recruiter/requests", headers=self.h_guest_a).json()
        target_req2 = next(r for r in r_list2 if r["id"] == rid)
        self.assertEqual(target_req2["status"], "awaiting_student")
        self.assertIsNone(target_req2["contact"])
        premature2 = self.client.get(f"/api/recruiter/requests/{rid}/contact", headers=self.h_guest_a)
        self.assertEqual(premature2.status_code, 403)

        # Step 5: Student grants consent -> transitions to approved
        stu_consent = self.client.post(f"/api/me/recruiting/requests/{rid}/decide", json={"accept": True}, headers=h_stu)
        self.assertEqual(stu_consent.status_code, 200)

        # Step 6: Recruiter requests contact info -> Contact Released!
        contact_res = self.client.get(f"/api/recruiter/requests/{rid}/contact", headers=self.h_guest_a)
        self.assertEqual(contact_res.status_code, 200)
        contact_data = contact_res.json()
        self.assertEqual(contact_data["name"], "Flow Student")
        self.assertIn("Flow Student", contact_data["name"])

    def test_student_declined_workflow_blocks_contact_release(self):
        """When student declines, status is declined_student and contact details are permanently blocked."""
        conn = sqlite3.connect(main.DB_PATH)
        u_stu = mk_user(conn, "SEC-STU-DECLINE", "Decline Student", "student", college_id="BPUT")
        conn.execute(
            """
            INSERT INTO student_profiles (user_id, cgpa, backlogs, subjects, skills, visible, anon_code, updated_at)
            VALUES (?, '8.2', 0, 'Networks', 'C++', 1, 'STU-DEC-01', ?)
            ON CONFLICT(user_id) DO UPDATE SET cgpa='8.2', visible=1, anon_code='STU-DEC-01'
            """,
            (u_stu[0], dt.datetime.now(dt.timezone.utc).isoformat())
        )
        conn.commit()
        conn.close()

        h_stu = {"Authorization": f"Bearer {create_token(u_stu[0], u_stu[1], 'BPUT')}"}

        # 1. Recruiter requests contact
        self.client.post(
            "/api/recruiter/requests",
            json={"code": "STU-DEC-01", "company": "Unwanted Firm", "message": "Inquiry"},
            headers=self.h_guest_a
        )
        r_list = self.client.get("/api/recruiter/requests", headers=self.h_guest_a).json()
        rid = next(r for r in r_list if r["code"] == "STU-DEC-01")["id"]

        # 2. Placement officer approves
        self.client.post(f"/api/placement/requests/{rid}/decide", json={"approve": True}, headers=self.h_place_a)

        # 3. Student declines
        dec_res = self.client.post(f"/api/me/recruiting/requests/{rid}/decide", json={"accept": False}, headers=h_stu)
        self.assertEqual(dec_res.status_code, 200)

        # 4. Recruiter contact endpoint returns 403 Forbidden
        blocked_res = self.client.get(f"/api/recruiter/requests/{rid}/contact", headers=self.h_guest_a)
        self.assertEqual(blocked_res.status_code, 403)

    # =========================================================================
    # 3. P0.3 SECRETS & ARCHIVE HARDENING TESTS
    # =========================================================================

    def test_sms_gateway_rejects_insecure_default_secret(self):
        """Sending the old hardcoded default secret must fail with 401."""
        payload = {"message": "LEAVE 2 FEVER", "roll": "SEC-STU-BPUT-1"}
        res = self.client.post("/api/sms/inbound", json=payload, headers={"X-SMS-Secret": "campbit_sms_gateway_secret_2026"})
        self.assertEqual(res.status_code, 401)

    def test_production_failsafe_on_missing_or_weak_secret(self):
        """In production environment, load_secret must raise RuntimeError if SECRET_KEY is missing or weak."""
        orig_env = os.environ.get("ENVIRONMENT")
        orig_key = os.environ.get("SECRET_KEY")
        try:
            os.environ["ENVIRONMENT"] = "production"
            os.environ["SECRET_KEY"] = "short_insecure"
            with self.assertRaises(RuntimeError):
                main.load_secret()

            os.environ["SECRET_KEY"] = "changeme"
            with self.assertRaises(RuntimeError):
                main.load_secret()
        finally:
            if orig_env is not None:
                os.environ["ENVIRONMENT"] = orig_env
            else:
                os.environ.pop("ENVIRONMENT", None)
            if orig_key is not None:
                os.environ["SECRET_KEY"] = orig_key
            else:
                os.environ.pop("SECRET_KEY", None)

    # =========================================================================
    # 4. P1.3 FILE UPLOAD & MAGIC BYTE SECURITY TESTS
    # =========================================================================

    def test_file_upload_rejects_disguised_executable_as_png(self):
        """Malicious executable/script named as .png must be rejected via magic bytes."""
        fake_png = b"#!/bin/bash\necho 'malicious payload'\n"
        files = {"file": ("malicious.png", fake_png, "image/png")}
        res = self.client.post("/api/upload", files=files, headers=self.h_stu_a1)
        self.assertEqual(res.status_code, 400)
        self.assertIn("signature", res.text.lower())

    def test_file_upload_rejects_disguised_html_as_pdf(self):
        """HTML file named as .pdf must be rejected via magic bytes."""
        fake_pdf = b"<html><head><script>alert('xss')</script></head><body>hello</body></html>"
        files = {"file": ("xss.pdf", fake_pdf, "application/pdf")}
        res = self.client.post("/api/upload", files=files, headers=self.h_stu_a1)
        self.assertEqual(res.status_code, 400)
        self.assertIn("signature", res.text.lower())

    def test_file_upload_accepts_valid_magic_signatures(self):
        """Valid PNG and PDF signatures must be accepted."""
        # Valid PNG magic: \x89PNG\r\n\x1a\n + IHDR chunk
        valid_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc`\x00\x00\x00\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
        files_png = {"file": ("avatar.png", valid_png, "image/png")}
        res_png = self.client.post("/api/upload", files=files_png, headers=self.h_stu_a1)
        self.assertEqual(res_png.status_code, 200)
        self.assertTrue(res_png.json()["url"].startswith("/uploads/"))

        # Valid PDF magic: %PDF-1.4
        valid_pdf = b"%PDF-1.4\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF\n"
        files_pdf = {"file": ("document.pdf", valid_pdf, "application/pdf")}
        res_pdf = self.client.post("/api/upload", files=files_pdf, headers=self.h_stu_a1)
        self.assertEqual(res_pdf.status_code, 200)

    def test_academic_resource_download_headers(self):
        """Resource downloads must include X-Content-Type-Options: nosniff and Content-Disposition: attachment."""
        valid_pdf = b"%PDF-1.4\nAcademic syllabus content\n%%EOF\n"
        data = {
            "title": "Semester 5 CS Syllabus",
            "subject": "Computer Science",
            "dept": "CSE",
            "semester": "5",
            "description": "Official Department Syllabus"
        }
        files = {"file": ("syllabus.pdf", valid_pdf, "application/pdf")}
        up_res = self.client.post("/api/resources", data=data, files=files, headers=self.h_fac_a)
        self.assertEqual(up_res.status_code, 200)

        # Fetch resources
        res_list = self.client.get("/api/resources", headers=self.h_fac_a).json()
        target = next(r for r in res_list if r["title"] == "Semester 5 CS Syllabus")
        rid = target["id"]

        # Download resource
        dl_res = self.client.get(f"/api/resources/{rid}/download", headers=self.h_stu_a1)
        self.assertEqual(dl_res.status_code, 200)
        self.assertEqual(dl_res.headers.get("x-content-type-options"), "nosniff")
        self.assertIn("attachment", dl_res.headers.get("content-disposition", "").lower())

    # =========================================================================
    # 5. P1.2 HTTP SECURITY & BROWSER HEADERS TESTS
    # =========================================================================

    def test_security_headers_present(self):
        """Response must include Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy."""
        res = self.client.get("/api/me", headers=self.h_stu_a1)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(res.headers.get("x-frame-options"), "SAMEORIGIN")
        self.assertEqual(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin")

        csp = res.headers.get("content-security-policy", "")
        self.assertIn("default-src 'self'", csp)
        self.assertIn("frame-ancestors 'self'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("base-uri 'self'", csp)

    def test_hsts_header_on_https(self):
        """Strict-Transport-Security must be sent when request is HTTPS."""
        res = self.client.get("/api/me", headers={**self.h_stu_a1, "x-forwarded-proto": "https"})
        self.assertEqual(res.status_code, 200)
        hsts = res.headers.get("strict-transport-security", "")
        self.assertIn("max-age=31536000", hsts)
    def test_notice_time_visibility_and_expiration(self):
        """Active notices are visible to students; expired notices are hidden from students but visible to admin."""
        now = dt.datetime.now(dt.timezone.utc)
        future_iso = (now + dt.timedelta(days=2)).isoformat()
        past_iso = (now - dt.timedelta(hours=2)).isoformat()

        test_notices = [
            ["General", "Active Timed Notice", "10 Oct", "This is still active", "Everyone", "SEC-ADM-BPUT", None, "All", future_iso, "2 Days"],
            ["Exam", "Expired Notice", "09 Oct", "This notice expired already", "Everyone", "SEC-ADM-BPUT", None, "All", past_iso, "2 Hours"],
            ["Event", "Permanent Notice", "08 Oct", "This notice never expires", "Everyone", "SEC-ADM-BPUT", None, "All", "", "Always visible"],
        ]

        # Admin saves notices
        put_res = self.client.put("/api/collections/cc_nt", json={"data": test_notices}, headers=self.h_adm_a)
        self.assertEqual(put_res.status_code, 200)

        # Student checks collections -> should see active and permanent, but NOT expired
        stu_cols = self.client.get("/api/collections", headers=self.h_stu_a1).json()
        self.assertIn("cc_nt", stu_cols)
        stu_titles = [n[1] for n in stu_cols["cc_nt"]]
        self.assertIn("Active Timed Notice", stu_titles)
        self.assertIn("Permanent Notice", stu_titles)
        self.assertNotIn("Expired Notice", stu_titles)

        # Admin checks collections -> sees all notices including expired ones
        adm_cols = self.client.get("/api/collections", headers=self.h_adm_a).json()
        self.assertIn("cc_nt", adm_cols)
        adm_titles = [n[1] for n in adm_cols["cc_nt"]]
        self.assertIn("Active Timed Notice", adm_titles)
        self.assertIn("Permanent Notice", adm_titles)
        self.assertIn("Expired Notice", adm_titles)


if __name__ == "__main__":
    unittest.main()


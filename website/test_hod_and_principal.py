"""Comprehensive test suite for:
PART 1: HOD (Head of Department) workflows and department scoping.
PART 2: PRINCIPAL (College-wide) workflows and second-level controls.
"""
import unittest
import sqlite3
import datetime as dt
from starlette.testclient import TestClient

import main
from main import app, create_token, hash_password


def mk_user(conn, login, name, role, college_id="BPUT", dept=None, hostel=None):
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


class TestHODAndPrincipal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        main.init_db()
        cls.client = TestClient(app)
        conn = sqlite3.connect(main.DB_PATH)

        # Users for BPUT
        cls.u_prin = mk_user(conn, "PRIN-TEST-01", "Dr. Principal", "principal", college_id="BPUT")
        cls.u_hod_cse = mk_user(conn, "HOD-CSE-01", "Dr. HOD CSE", "hod", college_id="BPUT", dept="CSE")
        cls.u_hod_ece = mk_user(conn, "HOD-ECE-01", "Dr. HOD ECE", "hod", college_id="BPUT", dept="ECE")
        cls.u_fac_cse = mk_user(conn, "FAC-CSE-01", "Prof. CSE Teacher", "faculty", college_id="BPUT", dept="CSE")
        cls.u_stu_cse = mk_user(conn, "STU-CSE-01", "Rahul Sharma", "student", college_id="BPUT", dept="CSE", hostel="Hostel Block A")
        cls.u_stu_ece = mk_user(conn, "STU-ECE-01", "Priya Das", "student", college_id="BPUT", dept="ECE", hostel="Hostel Block B")

        conn.commit()
        conn.close()

        cls.h_prin = {"Authorization": "Bearer " + create_token(cls.u_prin[0], cls.u_prin[1], "BPUT")}
        cls.h_hod_cse = {"Authorization": "Bearer " + create_token(cls.u_hod_cse[0], cls.u_hod_cse[1], "BPUT")}
        cls.h_hod_ece = {"Authorization": "Bearer " + create_token(cls.u_hod_ece[0], cls.u_hod_ece[1], "BPUT")}
        cls.h_fac_cse = {"Authorization": "Bearer " + create_token(cls.u_fac_cse[0], cls.u_fac_cse[1], "BPUT")}
        cls.h_stu_cse = {"Authorization": "Bearer " + create_token(cls.u_stu_cse[0], cls.u_stu_cse[1], "BPUT")}
        cls.h_stu_ece = {"Authorization": "Bearer " + create_token(cls.u_stu_ece[0], cls.u_stu_ece[1], "BPUT")}

    # --- 1. LEAVE APPROVALS & MULTI-STAGE ESCALATION ---
    def test_leave_short_vs_long_flow_and_hod_restrictions(self):
        # A. Short leave (<= 3 days) by CSE student: 2026-10-20 to 2026-10-22 (3 days)
        r_short = self.client.post("/api/leaves", json={
            "leave_type": "Medical", "from_date": "2026-10-20", "to_date": "2026-10-22", "reason": "Dental appointment"
        }, headers=self.h_stu_cse)
        self.assertEqual(r_short.status_code, 200)
        short_id = r_short.json()["leave"]["id"]
        self.assertEqual(r_short.json()["leave"]["days"], 3)

        # ECE HOD cannot act on CSE leave
        r_ece_act = self.client.post(f"/api/leaves/{short_id}/action", json={
            "status": "Approved", "action_note": "ECE HOD not allowed"
        }, headers=self.h_hod_ece)
        self.assertEqual(r_ece_act.status_code, 403)

        # CSE HOD approves short leave -> status is Approved (final)
        r_cse_act = self.client.post(f"/api/leaves/{short_id}/action", json={
            "status": "Approved", "action_note": "HOD final approval"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_cse_act.status_code, 200)
        self.assertEqual(r_cse_act.json()["leave"]["status"], "Approved")
        self.assertEqual(r_cse_act.json()["leave"]["stage"], "Approved")

        # B. Long leave (> 3 days) by CSE student: 2026-10-20 to 2026-10-25 (6 days)
        r_long = self.client.post("/api/leaves", json={
            "leave_type": "Casual", "from_date": "2026-10-20", "to_date": "2026-10-25", "reason": "Family wedding"
        }, headers=self.h_stu_cse)
        self.assertEqual(r_long.status_code, 200)
        long_id = r_long.json()["leave"]["id"]
        self.assertEqual(r_long.json()["leave"]["days"], 6)

        # CSE HOD approves long leave -> stays Pending, stage 'Waiting for Principal'
        r_long_hod = self.client.post(f"/api/leaves/{long_id}/action", json={
            "status": "Approved", "action_note": "Recommended by HOD, forwarded to Principal"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_long_hod.status_code, 200)
        self.assertEqual(r_long_hod.json()["leave"]["status"], "Pending")
        self.assertEqual(r_long_hod.json()["leave"]["stage"], "Waiting for Principal")

        # HOD cannot decide a leave already waiting for the Principal
        r_hod_again = self.client.post(f"/api/leaves/{long_id}/action", json={
            "status": "Approved", "action_note": "Trying again"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_hod_again.status_code, 403)

        # Principal approves the leave waiting for them -> Approved
        r_prin_act = self.client.post(f"/api/leaves/{long_id}/action", json={
            "status": "Approved", "action_note": "Principal final authorization"
        }, headers=self.h_prin)
        self.assertEqual(r_prin_act.status_code, 200)
        self.assertEqual(r_prin_act.json()["leave"]["status"], "Approved")
        self.assertEqual(r_prin_act.json()["leave"]["stage"], "Approved")

        # C. HOD cannot decide their own leave
        r_hod_own = self.client.post("/api/leaves", json={
            "leave_type": "Duty", "from_date": "2026-10-28", "to_date": "2026-10-29", "reason": "Conference"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_hod_own.status_code, 200)
        hod_lid = r_hod_own.json()["leave"]["id"]

        r_hod_self_act = self.client.post(f"/api/leaves/{hod_lid}/action", json={
            "status": "Approved", "action_note": "Self approval"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_hod_self_act.status_code, 403)

    # --- 2. TIMETABLE ADJUSTMENTS & .ICS CALENDAR ---
    def test_timetable_adjustments_and_notices(self):
        # ECE HOD cannot post adjustment for CSE
        r_bad = self.client.post("/api/timetable/adjustments", json={
            "dept": "CSE", "adjustment_type": "substitution", "subject": "OS",
            "substitute_teacher": "Dr. X", "date": "2026-10-14"
        }, headers=self.h_hod_ece)
        self.assertEqual(r_bad.status_code, 403)

        # CSE HOD posts substitution for CSE
        r_ok = self.client.post("/api/timetable/adjustments", json={
            "dept": "CSE", "adjustment_type": "substitution", "subject": "Operating Systems",
            "original_teacher": "Dr. P. Kar", "substitute_teacher": "Prof. CSE Teacher",
            "date": "2026-10-14", "time": "13:15 - 14:15", "room": "LH-102", "reason": "Medical leave of regular teacher"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_ok.status_code, 200)
        self.assertTrue(r_ok.json()["notice_posted"])

        # Check notice in collections for CSE
        cols = self.client.get("/api/collections", headers=self.h_stu_cse).json()
        self.assertIn("cc_nt", cols)
        nt_titles = [n[1] for n in cols["cc_nt"]]
        self.assertTrue(any("Substitution: Operating Systems" in t for t in nt_titles))

        # Check .ics export includes the substitution event
        r_ics = self.client.get("/api/timetable/export.ics?dept=CSE&year=3")
        self.assertEqual(r_ics.status_code, 200)
        self.assertIn("SUBSTITUTION: Operating Systems", r_ics.text)
        self.assertIn("Substitute Faculty: Prof. CSE Teacher", r_ics.text)

    # --- 3. ATTENDANCE OVERSIGHT & AUDITING ---
    def test_attendance_oversight_and_audit(self):
        # 1. Faculty syncs attendance with 1 present and 1 absent
        sync_payload = {
            "client_uuid": "sync-test-uuid-99",
            "session_id": "SESS-CSE-101",
            "dept": "CSE",
            "year": "3",
            "subject": "DBMS",
            "date": "2026-10-09",
            "records": [{"student_id": "STU-CSE-01", "status": "absent"}]
        }
        r_sync = self.client.post("/api/attendance/sync", json=sync_payload, headers=self.h_fac_cse)
        self.assertEqual(r_sync.status_code, 200)

        # 2. HOD checks attendance alerts -> student is at 0% (< 75%)
        r_alerts = self.client.get("/api/attendance/alerts", headers=self.h_hod_cse)
        self.assertEqual(r_alerts.status_code, 200)
        data = r_alerts.json()
        self.assertGreater(data["below_threshold_count"], 0)
        stu_alert = next((a for a in data["alerts"] if a["roll"] == "STU-CSE-01"), None)
        self.assertIsNotNone(stu_alert)
        self.assertEqual(stu_alert["percentage"], 0.0)
        self.assertGreaterEqual(stu_alert["classes_needed"], 1)

        # 3. Check that every read was audited (ATTENDANCE_READ in /api/audit)
        r_audit = self.client.get("/api/audit?action=ATTENDANCE_READ", headers=self.h_prin)
        self.assertEqual(r_audit.status_code, 200)
        self.assertGreater(r_audit.json()["total"], 0)

    # --- 4. COMPLAINTS & ANONYMITY MASKING ---
    def test_complaints_department_scope_and_anonymity(self):
        # CSE student submits anonymous academic complaint
        r_cmp = self.client.post("/api/complaints", json={
            "category": "Academic",
            "title": "Lab equipment calibration delay",
            "description": "Multimeters in Hardware Lab are giving erratic readings.",
            "is_anonymous": True
        }, headers=self.h_stu_cse)
        self.assertEqual(r_cmp.status_code, 200)
        cid = r_cmp.json()["complaint"]["id"]

        # CSE HOD views complaint -> sees it, but student name is 'Anonymous' and login_id is empty
        r_hod_view = self.client.get(f"/api/complaints/{cid}", headers=self.h_hod_cse)
        self.assertEqual(r_hod_view.status_code, 200)
        self.assertEqual(r_hod_view.json()["name"], "Anonymous")
        self.assertEqual(r_hod_view.json()["login_id"], "")
        self.assertIsNone(r_hod_view.json()["user_id"])

        # ECE HOD cannot view CSE academic complaint
        self.assertEqual(self.client.get(f"/api/complaints/{cid}", headers=self.h_hod_ece).status_code, 403)

    # --- 5. CERTIFICATES: SHA-256 ISSUANCE & REVOCATION ---
    def test_certificates_issuance_and_revocation(self):
        # 1. ECE HOD cannot issue certificate for CSE student
        r_bad = self.client.post("/api/certificates", json={
            "student_id": "STU-CSE-01",
            "title": "Hackathon Champion",
            "category": "Technical Excellence"
        }, headers=self.h_hod_ece)
        self.assertEqual(r_bad.status_code, 403)

        # 2. CSE HOD issues certificate for CSE student
        r_issue = self.client.post("/api/certificates", json={
            "student_id": "STU-CSE-01",
            "title": "Annual Coding Contest Winner",
            "category": "Algorithm Challenge",
            "description": "Secured 1st position in Dept Hackathon"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_issue.status_code, 200)
        cert = r_issue.json()["certificate"]
        self.assertEqual(cert["status"], "Active")
        self.assertTrue(len(cert["sha256_hash"]) == 64)
        cert_id = cert["cert_id"]
        cid = cert["id"]

        # 3. Public verification works
        r_ver = self.client.get(f"/api/certificates/verify/{cert_id}")
        self.assertEqual(r_ver.status_code, 200)
        self.assertTrue(r_ver.json()["valid"])
        self.assertEqual(r_ver.json()["student_roll"], "STU-CSE-01")

        # 4. HOD cannot revoke certificate
        r_hod_rev = self.client.post(f"/api/certificates/{cid}/revoke", json={
            "reason": "HOD trying to revoke"
        }, headers=self.h_hod_cse)
        self.assertEqual(r_hod_rev.status_code, 403)

        # 5. Principal revokes certificate
        r_prin_rev = self.client.post(f"/api/certificates/{cid}/revoke", json={
            "reason": "Found submission discrepancy"
        }, headers=self.h_prin)
        self.assertEqual(r_prin_rev.status_code, 200)
        self.assertEqual(r_prin_rev.json()["certificate"]["status"], "Revoked")

        # Public verification reflects revocation
        r_ver2 = self.client.get(f"/api/certificates/verify/{cert_id}")
        self.assertEqual(r_ver2.status_code, 200)
        self.assertFalse(r_ver2.json()["valid"])
        self.assertEqual(r_ver2.json()["status"], "Revoked")

    # --- 6. SLA RUN ON DEMAND ---
    def test_sla_run_on_demand_and_escalations(self):
        # Trigger SLA check on demand
        r_sla = self.client.post("/api/admin/sla/run?force_all=true", headers=self.h_prin)
        self.assertEqual(r_sla.status_code, 200)
        self.assertTrue(r_sla.json()["ok"])
        self.assertGreaterEqual(r_sla.json()["escalated_count"], 1)

        # Check that escalation requests are in /api/requests for Principal
        r_reqs = self.client.get("/api/requests?type=escalation", headers=self.h_prin)
        self.assertEqual(r_reqs.status_code, 200)
        self.assertGreater(len(r_reqs.json()), 0)

    # --- 7. ANALYTICS & INSIGHTS ---
    def test_principal_analytics_and_audit(self):
        # 1. Recurring complaint insights
        r_rec = self.client.get("/api/complaint-insights/recurring", headers=self.h_prin)
        self.assertEqual(r_rec.status_code, 200)
        self.assertIn("clusters", r_rec.json())

        # 2. Mess summary per hostel
        r_mess = self.client.get("/api/mess/summary", headers=self.h_prin)
        self.assertEqual(r_mess.status_code, 200)
        self.assertIn("hostels", r_mess.json())

        # 3. Placement opportunities
        r_opp = self.client.get("/api/opportunities", headers=self.h_prin)
        self.assertEqual(r_opp.status_code, 200)
        self.assertIn("opportunities", r_opp.json())

        # 4. Searchable audit log (/api/audit)
        r_aud = self.client.get("/api/audit?limit=10", headers=self.h_prin)
        self.assertEqual(r_aud.status_code, 200)
        self.assertIn("logs", r_aud.json())


if __name__ == "__main__":
    unittest.main()

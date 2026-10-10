"""Tests verifying that Student A's records cannot be read or edited by Student B.

Ensures that every write and private read extracts identity from the JWT token
and strictly enforces ownership (returning 403 Forbidden or 404 Not Found).
"""
import unittest
import sqlite3
from starlette.testclient import TestClient

import main
from main import app, create_token, hash_password, get_db


class TestOwnershipSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        main.init_db()
        cls.client = TestClient(app)

        conn = sqlite3.connect(main.DB_PATH)
        conn.row_factory = sqlite3.Row

        # Ensure Student A exists with registered phone
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-STU-A', 'Student A', 'student', ?, 'CSE', '+919876543210')
            ON CONFLICT(login_id) DO UPDATE SET name = 'Student A', role = 'student', phone = '+919876543210'
            """,
            (hash_password("Pass123!"),)
        )
        # Ensure Student B exists
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-STU-B', 'Student B', 'student', ?, 'CSE', '+919876543211')
            ON CONFLICT(login_id) DO UPDATE SET name = 'Student B', role = 'student', phone = '+919876543211'
            """,
            (hash_password("Pass123!"),)
        )
        conn.commit()

        user_a = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-STU-A'").fetchone()
        user_b = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-STU-B'").fetchone()
        conn.close()

        cls.user_a_id = user_a["id"]
        cls.user_b_id = user_b["id"]

        cls.token_a = create_token(user_a["id"], user_a["pw_version"])
        cls.token_b = create_token(user_b["id"], user_b["pw_version"])

        cls.headers_a = {"Authorization": f"Bearer {cls.token_a}"}
        cls.headers_b = {"Authorization": f"Bearer {cls.token_b}"}

    def setUp(self):
        # Student A creates records for testing
        res_leave = self.client.post(
            "/api/leaves",
            json={
                "leave_type": "Medical",
                "from_date": "2026-10-15",
                "to_date": "2026-10-16",
                "reason": "Dental surgery"
            },
            headers=self.headers_a
        )
        self.assertEqual(res_leave.status_code, 200, res_leave.text)
        self.leave_a_id = res_leave.json()["leave"]["id"]

        res_ach = self.client.post(
            "/api/achievements",
            json={
                "title": "AWS Certified Cloud Practitioner",
                "category": "Certification",
                "date": "2026-09-01",
                "description": "Passed with 850/1000",
                "link": ""
            },
            headers=self.headers_a
        )
        self.assertEqual(res_ach.status_code, 200, res_ach.text)
        self.ach_a_id = res_ach.json()["achievement"]["id"]

        res_comp = self.client.post(
            "/api/complaints",
            json={
                "category": "Hostel",
                "title": "Room 204 Fan not working",
                "description": "Ceiling fan making squeaking noise",
                "location": "Hostel Block A",
                "is_anonymous": False
            },
            headers=self.headers_a
        )
        self.assertEqual(res_comp.status_code, 200, res_comp.text)
        self.comp_a_id = res_comp.json()["complaint"]["id"]

        res_iss = self.client.post(
            "/api/issues",
            json={
                "title": "Mobile screen cutoff on iPhone SE",
                "description": "Drawer menu overlaps with top navbar"
            },
            headers=self.headers_a
        )
        self.assertEqual(res_iss.status_code, 200, res_iss.text)
        self.iss_a_id = res_iss.json()["issue"]["id"]

    def tearDown(self):
        try:
            self.client.delete(f"/api/leaves/{self.leave_a_id}", headers=self.headers_a)
        except Exception:
            pass
        try:
            self.client.delete(f"/api/achievements/{self.ach_a_id}", headers=self.headers_a)
        except Exception:
            pass
        try:
            self.client.delete(f"/api/complaints/{self.comp_a_id}", headers=self.headers_a)
        except Exception:
            pass
        try:
            self.client.delete(f"/api/issues/{self.iss_a_id}", headers=self.headers_a)
        except Exception:
            pass

    # --- LEAVE OWNERSHIP TESTS ---
    def test_student_b_cannot_read_student_a_leave(self):
        res = self.client.get(f"/api/leaves/{self.leave_a_id}", headers=self.headers_b)
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_student_b_cannot_edit_student_a_leave(self):
        res = self.client.put(
            f"/api/leaves/{self.leave_a_id}",
            json={
                "leave_type": "Casual",
                "from_date": "2026-10-15",
                "to_date": "2026-10-16",
                "reason": "Malicious modification by Student B"
            },
            headers=self.headers_b
        )
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_student_b_cannot_delete_student_a_leave(self):
        res = self.client.delete(f"/api/leaves/{self.leave_a_id}", headers=self.headers_b)
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    # --- ACHIEVEMENT OWNERSHIP TESTS ---
    def test_student_b_cannot_edit_student_a_achievement(self):
        res = self.client.put(
            f"/api/achievements/{self.ach_a_id}",
            json={
                "title": "Hacked Title",
                "category": "Other",
                "date": "2026-09-01",
                "description": "Student B changed description",
                "link": ""
            },
            headers=self.headers_b
        )
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_student_b_cannot_delete_student_a_achievement(self):
        res = self.client.delete(f"/api/achievements/{self.ach_a_id}", headers=self.headers_b)
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    # --- COMPLAINT OWNERSHIP TESTS ---
    def test_student_b_cannot_read_student_a_complaint(self):
        res = self.client.get(f"/api/complaints/{self.comp_a_id}", headers=self.headers_b)
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_student_b_cannot_edit_student_a_complaint(self):
        res = self.client.put(
            f"/api/complaints/{self.comp_a_id}",
            json={
                "category": "Hostel",
                "title": "Tampered Title",
                "description": "Altered description",
                "location": "Hostel Block A",
                "is_anonymous": False
            },
            headers=self.headers_b
        )
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_student_b_cannot_delete_student_a_complaint(self):
        res = self.client.delete(f"/api/complaints/{self.comp_a_id}", headers=self.headers_b)
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    # --- ISSUE OWNERSHIP TESTS ---
    def test_student_b_cannot_read_student_a_issue(self):
        res = self.client.get(f"/api/issues/{self.iss_a_id}", headers=self.headers_b)
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_student_b_cannot_edit_student_a_issue(self):
        res = self.client.put(
            f"/api/issues/{self.iss_a_id}",
            json={
                "title": "Tampered Issue",
                "description": "Student B tampering with issue"
            },
            headers=self.headers_b
        )
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_student_b_cannot_delete_student_a_issue(self):
        res = self.client.delete(f"/api/issues/{self.iss_a_id}", headers=self.headers_b)
        self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    # --- 404 NOT FOUND TESTS ---
    def test_nonexistent_record_returns_404(self):
        res = self.client.get("/api/leaves/999999", headers=self.headers_a)
        self.assertEqual(res.status_code, 404)

        res = self.client.get("/api/achievements/999999", headers=self.headers_a)
        self.assertEqual(res.status_code, 404)

        res = self.client.get("/api/complaints/999999", headers=self.headers_a)
        self.assertEqual(res.status_code, 404)

        res = self.client.get("/api/issues/999999", headers=self.headers_a)
        self.assertEqual(res.status_code, 404)

    # --- STUDENT A CAN ACCESS AND EDIT OWN RECORDS ---
    def test_student_a_can_read_and_edit_own_records(self):
        # Read own leave
        res = self.client.get(f"/api/leaves/{self.leave_a_id}", headers=self.headers_a)
        self.assertEqual(res.status_code, 200)

        # Edit own leave
        res = self.client.put(
            f"/api/leaves/{self.leave_a_id}",
            json={
                "leave_type": "Medical",
                "from_date": "2026-10-15",
                "to_date": "2026-10-17",
                "reason": "Updated dental surgery recovery"
            },
            headers=self.headers_a
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["leave"]["reason"], "Updated dental surgery recovery")

        # Edit own achievement
        res = self.client.put(
            f"/api/achievements/{self.ach_a_id}",
            json={
                "title": "AWS Certified Solutions Architect",
                "category": "Certification",
                "date": "2026-09-01",
                "description": "Updated certification",
                "link": ""
            },
            headers=self.headers_a
        )
        self.assertEqual(res.status_code, 200)

        # Edit own complaint
        res = self.client.put(
            f"/api/complaints/{self.comp_a_id}",
            json={
                "category": "Hostel",
                "title": "Room 204 Fan repaired",
                "description": "Still slightly slow",
                "location": "Hostel Block A",
                "is_anonymous": False
            },
            headers=self.headers_a
        )
        self.assertEqual(res.status_code, 200)

    # --- ATTENDANCE IDEMPOTENT SYNC TEST ---
    def test_attendance_sync_idempotency(self):
        # Create a faculty token for teacher attendance sync
        conn = sqlite3.connect(main.DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept)
            VALUES ('TEST-FACULTY-1', 'Prof. Sharma', 'faculty', ?, 'CSE')
            ON CONFLICT(login_id) DO UPDATE SET role = 'faculty'
            """,
            (hash_password("Pass123!"),)
        )
        conn.commit()
        faculty_user = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-FACULTY-1'").fetchone()
        conn.close()

        faculty_token = create_token(faculty_user["id"], faculty_user["pw_version"])
        faculty_headers = {"Authorization": f"Bearer {faculty_token}"}

        import uuid
        test_uuid = f"sync-batch-uuid-{uuid.uuid4()}"
        payload = {
            "client_uuid": test_uuid,
            "session_id": f"SES-TEST-{uuid.uuid4().hex[:6]}",
            "dept": "CSE",
            "year": "3",
            "subject": "Database Management Systems",
            "section": "A",
            "date": "2026-10-09",
            "period": "1",
            "records": [
                {"student_id": "TEST-STU-A", "student_name": "Student A", "status": "present"},
                {"student_id": "TEST-STU-B", "student_name": "Student B", "status": "absent"}
            ]
        }

        # First sync: should succeed with status 'synced'
        res1 = self.client.post("/api/attendance/sync", json=payload, headers=faculty_headers)
        self.assertEqual(res1.status_code, 200, res1.text)
        data1 = res1.json()
        self.assertTrue(data1["ok"])
        self.assertEqual(data1["status"], "synced")
        self.assertEqual(data1["synced_count"], 2)
        self.assertEqual(data1["present_count"], 1)

        # Second sync with EXACT SAME client_uuid: must be IDEMPOTENT (already_synced)
        res2 = self.client.post("/api/attendance/sync", json=payload, headers=faculty_headers)
        self.assertEqual(res2.status_code, 200, res2.text)
        data2 = res2.json()
        self.assertTrue(data2["ok"])
        self.assertEqual(data2["status"], "already_synced")
        self.assertIn("already received and processed", data2["message"])

    # --- SMS SIMULATOR LEAVE 2 FEVER SECURITY TESTS ---
    def test_leave_2_fever_sms_simulator(self):
        sms_payload = {
            "sender": "+919876543210",
            "message": "LEAVE 2 FEVER",
            "roll": "TEST-STU-A"
        }
        # 1. Unauthenticated request without secret must be rejected (401)
        unauth_res = self.client.post("/api/sms/inbound", json=sms_payload)
        self.assertEqual(unauth_res.status_code, 401, "Unauthenticated SMS should return 401")

        # 2. Student B attempting to submit for Student A must be rejected (403)
        impersonate_res = self.client.post("/api/sms/inbound", json=sms_payload, headers=self.headers_b)
        self.assertEqual(impersonate_res.status_code, 403, "Student B impersonating Student A must be forbidden")

        # 3. Legitimate authenticated student submitting for themselves must succeed (200)
        res = self.client.post("/api/sms/inbound", json=sms_payload, headers=self.headers_a)
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data["ok"])
        self.assertIn("CAMPBIT SMS", data["reply"])
        self.assertIn("FEVER", data["reply"])
        self.assertEqual(data["details"]["days"], 2)
        self.assertEqual(data["details"]["leave_type"], "Medical")

        # Verify the leave was created in the database for Student A
        leave_res = self.client.get(f"/api/leaves/{data['leave_id']}", headers=self.headers_a)
        self.assertEqual(leave_res.status_code, 200)
        self.assertEqual(leave_res.json()["status"], "Pending")
        self.assertIn("fever", leave_res.json()["reason"].lower())

        # 4. Inbound via verified SMS Gateway Secret header (e.g. carrier webhook)
        webhook_headers = {"X-SMS-Secret": main.SMS_WEBHOOK_SECRET}
        gw_res = self.client.post("/api/sms/inbound", json=sms_payload, headers=webhook_headers)
        self.assertEqual(gw_res.status_code, 200, gw_res.text)

        # 5. Unknown student phone / roll via gateway must NOT fallback to first student: returns 404
        unknown_payload = {
            "sender": "+910000000000",
            "message": "LEAVE 3 FEVER",
            "roll": "NON-EXISTENT-ROLL-999"
        }
        gw_unknown_res = self.client.post("/api/sms/inbound", json=unknown_payload, headers=webhook_headers)
        self.assertEqual(gw_unknown_res.status_code, 404, "Unknown phone/roll should return 404 and NEVER fallback to another student")

    # --- TIMETABLE .ICS EXPORT TEST ---
    def test_timetable_ics_export(self):
        res = self.client.get("/api/timetable/export.ics?dept=CSE&year=3")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("content-type"), "text/calendar; charset=utf-8")
        self.assertIn("attachment; filename=campbit_timetable_CSE_3.ics", res.headers.get("content-disposition", ""))
        self.assertIn("BEGIN:VCALENDAR", res.text)
        self.assertIn("BEGIN:VEVENT", res.text)
        self.assertIn("END:VCALENDAR", res.text)


if __name__ == "__main__":
    unittest.main()

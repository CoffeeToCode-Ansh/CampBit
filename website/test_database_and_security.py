"""Comprehensive Unit Tests for Database Abstraction Layer and Security Hardening.
"""
import unittest
import sqlite3
from pathlib import Path
from starlette.testclient import TestClient

import database
import main
from main import app, create_token, hash_password, verify_password


class TestDatabaseAndSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db(hash_password)
        cls.client = TestClient(app)

        # Set up a test student and test admin
        conn = database.get_connection()
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-DB-STU', 'DB Student', 'student', ?, 'CSE', '+919999988888')
            ON CONFLICT(login_id) DO UPDATE SET name = 'DB Student', phone = '+919999988888'
            """,
            (hash_password("SecPass123!"),)
        )
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-DB-VICTIM', 'Victim Student', 'student', ?, 'CSE', '+919999977777')
            ON CONFLICT(login_id) DO UPDATE SET name = 'Victim Student', phone = '+919999977777'
            """,
            (hash_password("SecPass123!"),)
        )
        conn.commit()

        u_stu = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-DB-STU'").fetchone()
        u_victim = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-DB-VICTIM'").fetchone()
        conn.close()

        cls.token_stu = create_token(u_stu["id"], u_stu["pw_version"])
        cls.token_victim = create_token(u_victim["id"], u_victim["pw_version"])
        cls.headers_stu = {"Authorization": f"Bearer {cls.token_stu}"}
        cls.headers_victim = {"Authorization": f"Bearer {cls.token_victim}"}

    def test_database_tables_exist(self):
        """Verify all 13 core tables exist in the local database."""
        conn = database.get_connection()
        tables = [
            "users", "collections", "resources", "student_profiles",
            "shortlists", "contact_requests", "requests", "leaves",
            "achievements", "complaints", "issues",
            "attendance_sessions", "attendance"
        ]
        for t in tables:
            res = conn.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", (t,)
            ).fetchone()[0]
            self.assertEqual(res, 1, f"Table {t} must exist in the database")
        conn.close()

    def test_query_translator_and_lastrowid_support(self):
        """Test the PostgreSQL query translator handles ? placeholders, lastrowid, and conflict clauses."""
        sql = "SELECT * FROM users WHERE login_id = ? AND role = ?"
        translated, wants_last = database.translate_query_for_postgres(sql)
        self.assertEqual(translated, "SELECT * FROM users WHERE login_id = %s AND role = %s")
        self.assertFalse(wants_last)

        insert_sql = "INSERT INTO leaves (user_id, login_id) VALUES (?, ?)"
        translated_ins, wants_last_ins = database.translate_query_for_postgres(insert_sql)
        self.assertIn("RETURNING id", translated_ins)
        self.assertTrue(wants_last_ins)

    def test_security_headers_present(self):
        """Verify essential security headers are attached to all API responses."""
        res = self.client.get("/api/me", headers=self.headers_stu)
        self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(res.headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertEqual(res.headers.get("X-XSS-Protection"), "1; mode=block")
        self.assertEqual(res.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")

    def test_sms_inbound_unauthenticated_blocked(self):
        """Unauthenticated caller cannot submit leave via SMS inbound."""
        payload = {"message": "LEAVE 2 FEVER", "roll": "TEST-DB-STU"}
        res = self.client.post("/api/sms/inbound", json=payload)
        self.assertEqual(res.status_code, 401)
        self.assertIn("Authentication required", res.json()["detail"])

    def test_sms_inbound_student_cannot_impersonate(self):
        """Student cannot file leave in another student's name."""
        payload = {"message": "LEAVE 2 FEVER", "roll": "TEST-DB-VICTIM"}
        res = self.client.post("/api/sms/inbound", json=payload, headers=self.headers_stu)
        self.assertEqual(res.status_code, 403)
        self.assertIn("cannot submit a leave request on behalf of another student", res.json()["detail"])

    def test_sms_inbound_does_not_fallback_to_first_student(self):
        """Non-existent student phone/roll returns 404 and does NOT fallback to first student."""
        payload = {"message": "LEAVE 2 FEVER", "roll": "NON-EXISTENT-ROLL-999"}
        headers = {"X-SMS-Secret": main.SMS_WEBHOOK_SECRET}
        res = self.client.post("/api/sms/inbound", json=payload, headers=headers)
        self.assertEqual(res.status_code, 404)
        self.assertIn("Student profile not found", res.json()["detail"])

    def test_sms_inbound_success_for_authorized_student(self):
        """Authorized student submitting leave for own roll succeeds."""
        payload = {"message": "LEAVE 3 FEVER", "roll": "TEST-DB-STU"}
        res = self.client.post("/api/sms/inbound", json=payload, headers=self.headers_stu)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["details"]["student_roll"], "TEST-DB-STU")
        self.assertEqual(data["details"]["days"], 3)
        self.assertEqual(data["details"]["leave_type"], "Medical")


if __name__ == "__main__":
    unittest.main()

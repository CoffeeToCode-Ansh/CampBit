"""Comprehensive test suite for:
1. Multi-Tenant Isolation (BPUT vs OUTR) across Users, Leaves, Achievements, Complaints, Attendance, and Resources.
2. Audit Logging & Compliance trail (/api/admin/audit-logs).
3. Data-Backed Administrator Analytics (/api/admin/analytics).
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


class TestTenantAuditAndAnalytics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        main.init_db()
        cls.client = TestClient(app)
        conn = sqlite3.connect(main.DB_PATH)

        # Tenant A: BPUT
        cls.u_adm_bput = mk_user(conn, "ADM-BPUT-01", "Admin BPUT", "admin", college_id="BPUT")
        cls.u_prin_bput = mk_user(conn, "PRIN-BPUT-01", "Principal BPUT", "principal", college_id="BPUT")
        cls.u_fac_bput = mk_user(conn, "FAC-BPUT-01", "Faculty BPUT", "faculty", college_id="BPUT", dept="CSE")
        cls.u_stu_bput = mk_user(conn, "STU-BPUT-01", "Student BPUT", "student", college_id="BPUT", dept="CSE")

        # Tenant B: OUTR
        cls.u_adm_outr = mk_user(conn, "ADM-OUTR-01", "Admin OUTR", "admin", college_id="OUTR")
        cls.u_fac_outr = mk_user(conn, "FAC-OUTR-01", "Faculty OUTR", "faculty", college_id="OUTR", dept="ECE")
        cls.u_stu_outr = mk_user(conn, "STU-OUTR-01", "Student OUTR", "student", college_id="OUTR", dept="ECE")

        conn.commit()
        conn.close()

        # Auth headers
        cls.h_adm_bput = {"Authorization": "Bearer " + create_token(cls.u_adm_bput[0], cls.u_adm_bput[1], "BPUT")}
        cls.h_prin_bput = {"Authorization": "Bearer " + create_token(cls.u_prin_bput[0], cls.u_prin_bput[1], "BPUT")}
        cls.h_fac_bput = {"Authorization": "Bearer " + create_token(cls.u_fac_bput[0], cls.u_fac_bput[1], "BPUT")}
        cls.h_stu_bput = {"Authorization": "Bearer " + create_token(cls.u_stu_bput[0], cls.u_stu_bput[1], "BPUT")}

        cls.h_adm_outr = {"Authorization": "Bearer " + create_token(cls.u_adm_outr[0], cls.u_adm_outr[1], "OUTR")}
        cls.h_fac_outr = {"Authorization": "Bearer " + create_token(cls.u_fac_outr[0], cls.u_fac_outr[1], "OUTR")}
        cls.h_stu_outr = {"Authorization": "Bearer " + create_token(cls.u_stu_outr[0], cls.u_stu_outr[1], "OUTR")}

    # =========================================================================
    # 1. TENANT ISOLATION TESTS
    # =========================================================================

    def test_tenant_user_directory_isolation(self):
        """Admin of BPUT cannot see or search OUTR users, and vice-versa."""
        res_bput = self.client.get("/api/users/search?q=OUTR", headers=self.h_adm_bput)
        self.assertEqual(res_bput.status_code, 200)
        users_bput = res_bput.json()
        self.assertFalse(any(u["login_id"] == "STU-OUTR-01" for u in users_bput))

        res_outr = self.client.get("/api/users/search?q=STU-OUTR-01", headers=self.h_adm_outr)
        self.assertEqual(res_outr.status_code, 200)
        users_outr = res_outr.json()
        self.assertTrue(any(u["login_id"] == "STU-OUTR-01" for u in users_outr))

    def test_tenant_cross_user_modification_blocked(self):
        """Admin of BPUT cannot reset password or change role of user from OUTR, and delete does not touch OUTR."""
        # 1. Reset password
        r_pw = self.client.post("/api/users/reset-password", json={"login_id": "STU-OUTR-01", "password": "NewPass123!"}, headers=self.h_adm_bput)
        self.assertEqual(r_pw.status_code, 404)

        # 2. Change role
        r_role = self.client.post("/api/users/STU-OUTR-01/role", json={"role": "faculty"}, headers=self.h_adm_bput)
        self.assertEqual(r_role.status_code, 404)

        # 3. Delete user: BPUT admin delete does not delete OUTR user from DB
        self.client.delete("/api/users/STU-OUTR-01", headers=self.h_adm_bput)
        conn = sqlite3.connect(main.DB_PATH)
        outr_user = conn.execute("SELECT id FROM users WHERE login_id = 'STU-OUTR-01' AND college_id = 'OUTR'").fetchone()
        conn.close()
        self.assertIsNotNone(outr_user)

    def test_tenant_leaves_isolation(self):
        """Leaves submitted in OUTR cannot be seen or acted upon by BPUT admin."""
        # OUTR student applies for leave
        l_res = self.client.post("/api/leaves", json={
            "leave_type": "Sick",
            "from_date": "2026-10-10",
            "to_date": "2026-10-12",
            "reason": "Severe fever in OUTR campus"
        }, headers=self.h_stu_outr)
        self.assertEqual(l_res.status_code, 200)
        outr_leave_id = l_res.json()["leave"]["id"]

        # BPUT Admin lists leaves
        bput_leaves = self.client.get("/api/leaves", headers=self.h_adm_bput).json()
        self.assertFalse(any(l["id"] == outr_leave_id for l in bput_leaves))

        # BPUT Admin attempts to approve OUTR leave
        act_res = self.client.post(f"/api/leaves/{outr_leave_id}/action", json={"status": "Approved"}, headers=self.h_adm_bput)
        self.assertEqual(act_res.status_code, 404)

        # OUTR Admin can see and approve it
        outr_leaves = self.client.get("/api/leaves", headers=self.h_adm_outr).json()
        self.assertTrue(any(l["id"] == outr_leave_id for l in outr_leaves))
        act_ok = self.client.post(f"/api/leaves/{outr_leave_id}/action", json={"status": "Approved"}, headers=self.h_adm_outr)
        self.assertEqual(act_ok.status_code, 200)

    def test_tenant_achievements_isolation(self):
        """Achievements submitted in OUTR cannot be seen or verified by BPUT admin."""
        # OUTR student creates achievement
        ach_res = self.client.post("/api/achievements", json={
            "title": "National Hackathon 1st Prize OUTR",
            "category": "Technical",
            "date": "2026-10-08",
            "description": "Won gold trophy"
        }, headers=self.h_stu_outr)
        self.assertEqual(ach_res.status_code, 200)
        outr_ach_id = ach_res.json()["achievement"]["id"]

        # BPUT Admin lists achievements
        bput_achs = self.client.get("/api/achievements", headers=self.h_adm_bput).json()
        self.assertFalse(any(a["id"] == outr_ach_id for a in bput_achs))

        # BPUT Admin tries to verify OUTR achievement
        ver_res = self.client.post(f"/api/achievements/{outr_ach_id}/verify", json={"status": "Verified"}, headers=self.h_adm_bput)
        self.assertEqual(ver_res.status_code, 404)

        # OUTR Admin verifies it successfully
        ver_ok = self.client.post(f"/api/achievements/{outr_ach_id}/verify", json={"status": "Verified"}, headers=self.h_adm_outr)
        self.assertEqual(ver_ok.status_code, 200)

    def test_tenant_complaints_isolation(self):
        """Complaints submitted in OUTR cannot be seen or modified by BPUT staff/admin."""
        # OUTR student files complaint
        c_res = self.client.post("/api/complaints", json={
            "category": "College",
            "title": "Broken Lab Equipment OUTR",
            "description": "Oscilloscope not working",
            "is_anonymous": False
        }, headers=self.h_stu_outr)
        self.assertEqual(c_res.status_code, 200)
        outr_cid = c_res.json()["complaint"]["id"]

        # BPUT Admin listing
        bput_comps = self.client.get("/api/complaints", headers=self.h_adm_bput).json()
        self.assertFalse(any(c["id"] == outr_cid for c in bput_comps))

        # BPUT Admin get single
        self.assertEqual(self.client.get(f"/api/complaints/{outr_cid}", headers=self.h_adm_bput).status_code, 404)

        # BPUT Admin update status
        up_res = self.client.post(f"/api/complaints/{outr_cid}/status", json={"status": "Resolved", "action_note": "No"}, headers=self.h_adm_bput)
        self.assertEqual(up_res.status_code, 404)

        # OUTR Admin can access
        self.assertEqual(self.client.get(f"/api/complaints/{outr_cid}", headers=self.h_adm_outr).status_code, 200)

    # =========================================================================
    # 2. AUDIT LOGS TESTS
    # =========================================================================

    def test_audit_logs_role_restrictions(self):
        """Only admin and principal can access /api/admin/audit-logs. Students and faculty are blocked."""
        # Student -> 403
        r_stu = self.client.get("/api/admin/audit-logs", headers=self.h_stu_bput)
        self.assertEqual(r_stu.status_code, 403)

        # Faculty -> 403
        r_fac = self.client.get("/api/admin/audit-logs", headers=self.h_fac_bput)
        self.assertEqual(r_fac.status_code, 403)

        # Admin -> 200
        r_adm = self.client.get("/api/admin/audit-logs", headers=self.h_adm_bput)
        self.assertEqual(r_adm.status_code, 200)
        self.assertIn("logs", r_adm.json())
        self.assertIn("total", r_adm.json())

        # Principal -> 200
        r_prin = self.client.get("/api/admin/audit-logs", headers=self.h_prin_bput)
        self.assertEqual(r_prin.status_code, 200)

    def test_audit_logs_record_actions_and_filter(self):
        """Critical actions generate audit entries and are filterable by action and login_id."""
        # 1. Successful Login generates AUTH_LOGIN_SUCCESS
        login_res = self.client.post("/api/login", json={"user": "ADM-BPUT-01", "password": "Pass123!", "role": "admin"})
        self.assertEqual(login_res.status_code, 200)

        # 2. Failed Login generates AUTH_LOGIN_FAILURE
        bad_login = self.client.post("/api/login", json={"user": "ADM-BPUT-01", "password": "WrongPassword", "role": "admin"})
        self.assertEqual(bad_login.status_code, 401)

        # 3. Create a user generates USER_CREATE
        stamp = dt.datetime.now().strftime("%f")
        new_login = f"NEW-STU-{stamp}"
        create_res = self.client.post("/api/users", json={
            "login_id": new_login,
            "name": f"New Student {stamp}",
            "role": "student",
            "password": "Pass123!",
            "email": f"stu{stamp}@bput.ac.in"
        }, headers=self.h_adm_bput)
        self.assertEqual(create_res.status_code, 200)

        # Query audit logs with action=USER_CREATE
        audit_res = self.client.get("/api/admin/audit-logs?action=USER_CREATE", headers=self.h_adm_bput)
        self.assertEqual(audit_res.status_code, 200)
        logs = audit_res.json()["logs"]
        self.assertTrue(any(l["action"] == "USER_CREATE" and new_login.lower() in (l["details"] or "") for l in logs))

        # Query audit logs with action=AUTH_LOGIN_FAILURE
        audit_fail = self.client.get("/api/admin/audit-logs?action=AUTH_LOGIN_FAILURE", headers=self.h_adm_bput)
        self.assertEqual(audit_fail.status_code, 200)
        fail_logs = audit_fail.json()["logs"]
        self.assertTrue(any(l["action"] == "AUTH_LOGIN_FAILURE" and "adm-bput-01" in (l["login_id"] or "").lower() for l in fail_logs))

    def test_audit_logs_tenant_isolation(self):
        """BPUT Admin only sees BPUT audit logs, not OUTR audit logs."""
        # Trigger an action in OUTR
        stamp = dt.datetime.now().strftime("%f")
        outr_new_user = f"outr-user-{stamp}"
        self.client.post("/api/users", json={
            "login_id": outr_new_user,
            "name": "OUTR Test User",
            "role": "student",
            "password": "Pass123!"
        }, headers=self.h_adm_outr)

        # BPUT Admin audit logs should not contain outr_new_user
        bput_audit = self.client.get("/api/admin/audit-logs", headers=self.h_adm_bput).json()["logs"]
        self.assertFalse(any(outr_new_user in (l["details"] or "") for l in bput_audit))

        # OUTR Admin audit logs should contain outr_new_user
        outr_audit = self.client.get("/api/admin/audit-logs", headers=self.h_adm_outr).json()["logs"]
        self.assertTrue(any(outr_new_user in (l["details"] or "") for l in outr_audit))

    # =========================================================================
    # 3. DATA-BACKED ADMINISTRATOR ANALYTICS TESTS
    # =========================================================================

    def test_admin_analytics_role_restrictions(self):
        """Only admin and principal can access /api/admin/analytics. Students and faculty are blocked."""
        self.assertEqual(self.client.get("/api/admin/analytics", headers=self.h_stu_bput).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/analytics", headers=self.h_fac_bput).status_code, 403)
        self.assertEqual(self.client.get("/api/admin/analytics", headers=self.h_adm_bput).status_code, 200)
        self.assertEqual(self.client.get("/api/admin/analytics", headers=self.h_prin_bput).status_code, 200)

    def test_admin_analytics_data_integrity_and_tenant_scoping(self):
        """Analytics calculates real database metrics and scopes strictly to the tenant."""
        res_bput = self.client.get("/api/admin/analytics", headers=self.h_adm_bput)
        self.assertEqual(res_bput.status_code, 200)
        data = res_bput.json()

        # Check tenant ID
        self.assertEqual(data["college_id"], "BPUT")

        # Check roster telemetry
        self.assertIn("roster", data)
        self.assertGreaterEqual(data["roster"]["total_users"], 4)
        self.assertGreaterEqual(data["roster"]["students"], 1)
        self.assertGreaterEqual(data["roster"]["faculty"], 1)
        self.assertGreaterEqual(data["roster"]["admins"], 1)
        self.assertIsInstance(data["roster"]["departments"], list)

        # Check attendance telemetry
        self.assertIn("attendance", data)
        self.assertIn("total_sessions", data["attendance"])
        self.assertIn("departments", data["attendance"])

        # Check complaints telemetry
        self.assertIn("complaints", data)
        self.assertIn("total", data["complaints"])
        self.assertIn("sla_resolution_rate", data["complaints"])

        # Check reviews telemetry
        self.assertIn("leaves", data)
        self.assertIn("achievements", data)

        # Check audit summary
        self.assertIn("audit", data)
        self.assertGreaterEqual(data["audit"]["total_events"], 1)
        self.assertIsInstance(data["audit"]["recent_events"], list)

        # Verify OUTR analytics scopes to OUTR
        res_outr = self.client.get("/api/admin/analytics", headers=self.h_adm_outr)
        self.assertEqual(res_outr.status_code, 200)
        data_outr = res_outr.json()
        self.assertEqual(data_outr["college_id"], "OUTR")


if __name__ == "__main__":
    unittest.main()

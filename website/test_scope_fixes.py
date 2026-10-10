"""Cross-role access tests for complaints + attendance. Same setup style as test_ownership.py."""
import unittest, sqlite3, datetime as dt
from starlette.testclient import TestClient
import main
from main import app, create_token, hash_password


def mk(conn, login, role, dept=None, hostel=None):
    conn.execute("INSERT INTO users (login_id, name, role, password_hash, dept, hostel) VALUES (?,?,?,?,?,?) "
                 "ON CONFLICT(login_id) DO UPDATE SET role=excluded.role, dept=excluded.dept, hostel=excluded.hostel",
                 (login, login, role, hash_password("Pass123!"), dept, hostel))
    return conn.execute("SELECT id, pw_version FROM users WHERE login_id = ?", (login,)).fetchone()


class TestScope(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        main.init_db()
        cls.c = TestClient(app)
        conn = sqlite3.connect(main.DB_PATH)
        U = {}
        for k, a in {"stu": ("SC-STU", "student", "CSE", "Block A"), "facA": ("SC-FACA", "faculty", "CSE", None),
                     "facB": ("SC-FACB", "faculty", "CSE", None), "facE": ("SC-FACE", "faculty", "ECE", None),
                     "wA": ("SC-WA", "warden", None, "Block A"), "wB": ("SC-WB", "warden", None, "Block B"),
                     "hodC": ("SC-HODC", "hod", "CSE", None), "hodE": ("SC-HODE", "hod", "ECE", None),
                     "prin": ("SC-PRIN", "principal", None, None),
                     "adm": ("SC-ADM", "admin", None, None)}.items():
            U[k] = mk(conn, *a)
        conn.commit()
        cls.h = {k: {"Authorization": "Bearer " + create_token(v[0], v[1])} for k, v in U.items()}
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        cur = conn.execute("INSERT INTO complaints (user_id, login_id, name, category, title, status, is_anonymous, created_at, updated_at) "
                           "VALUES (?, 'SC-STU', 'Anonymous', 'Hostel', 'leaky tap', 'Open', 1, ?, ?)", (U["stu"][0], now, now))
        cls.hostel_cid = cur.lastrowid
        cur = conn.execute("INSERT INTO complaints (user_id, login_id, name, category, title, status, is_anonymous, created_at, updated_at) "
                           "VALUES (?, 'SC-STU', 'SC-STU', 'College', 'projector', 'Open', 0, ?, ?)", (U["stu"][0], now, now))
        cls.college_cid = cur.lastrowid
        conn.commit(); conn.close()

    def get(self, who, url): return self.c.get(url, headers=self.h[who])

    # --- complaints
    def test_wrong_warden_cannot_read(self):
        self.assertEqual(self.get("wB", f"/api/complaints/{self.hostel_cid}").status_code, 403)
    def test_right_warden_reads_but_identity_hidden(self):
        r = self.get("wA", f"/api/complaints/{self.hostel_cid}")
        self.assertEqual(r.status_code, 200); self.assertEqual(r.json()["login_id"], "")
    def test_faculty_cannot_read_any_complaint(self):
        self.assertEqual(self.get("facA", f"/api/complaints/{self.hostel_cid}").status_code, 403)
    def test_hod_scope_is_department_and_category(self):
        self.assertEqual(self.get("hodC", f"/api/complaints/{self.college_cid}").status_code, 200)
        self.assertEqual(self.get("hodE", f"/api/complaints/{self.college_cid}").status_code, 403)
        self.assertEqual(self.get("hodC", f"/api/complaints/{self.hostel_cid}").status_code, 403)
    def test_list_is_filtered(self):
        ids = {x["id"] for x in self.get("wB", "/api/complaints").json()}
        self.assertNotIn(self.hostel_cid, ids)
    def test_wrong_warden_cannot_change_status(self):
        r = self.c.post(f"/api/complaints/{self.hostel_cid}/status", json={"status": "Resolved", "action_note": ""}, headers=self.h["wB"])
        self.assertEqual(r.status_code, 403)
    def test_principal_sees_all(self):
        self.assertEqual(self.get("prin", f"/api/complaints/{self.hostel_cid}").status_code, 200)

    # --- attendance
    def body(self, uuid, sid, dept="CSE", status="present", student_id="SC-STU"):
        return {"client_uuid": uuid, "session_id": sid, "dept": dept, "year": "3", "subject": "DBMS", "date": "2026-10-09",
                "records": [{"student_id": student_id, "status": status}]}
    def test_faculty_cannot_mark_other_department(self):
        r = self.c.post("/api/attendance/sync", json=self.body("u1", "sc-s1", "ECE"), headers=self.h["facA"])
        self.assertEqual(r.status_code, 403)
    def test_ece_teacher_cannot_mark_attendance_for_cse_student(self):
        # ECE faculty provides dept="ECE" but student SC-STU belongs to CSE
        r = self.c.post("/api/attendance/sync", json=self.body("u-cross-1", "sc-cross-1", dept="ECE", student_id="SC-STU"), headers=self.h["facE"])
        self.assertEqual(r.status_code, 403)
    def test_resync_never_overwrites_and_other_teacher_blocked(self):
        sid = "sc-s2-" + dt.datetime.now().strftime("%H%M%S%f")
        self.assertEqual(self.c.post("/api/attendance/sync", json=self.body("a-" + sid, sid), headers=self.h["facA"]).status_code, 200)
        r = self.c.post("/api/attendance/sync", json=self.body("b-" + sid, sid, status="absent"), headers=self.h["facA"])
        self.assertEqual(r.status_code, 200); self.assertEqual(r.json()["skipped_existing"], 1)
        rec = self.get("facA", f"/api/attendance?session_id={sid}").json()["records"]
        self.assertEqual(rec[0]["status"], "present")
        self.assertEqual(self.c.post("/api/attendance/sync", json=self.body("c-" + sid, sid), headers=self.h["facB"]).status_code, 409)
    def test_read_scope(self):
        sid = "sc-s3-" + dt.datetime.now().strftime("%H%M%S%f")
        self.c.post("/api/attendance/sync", json=self.body("d-" + sid, sid), headers=self.h["facA"])
        self.assertEqual(len(self.get("facB", f"/api/attendance?session_id={sid}").json()["records"]), 0)
        self.assertEqual(len(self.get("hodE", f"/api/attendance?session_id={sid}").json()["records"]), 0)
        self.assertEqual(len(self.get("hodC", f"/api/attendance?session_id={sid}").json()["records"]), 1)
        self.assertEqual(self.get("wA", "/api/attendance").status_code, 403)
    def test_student_without_records_gets_null_not_85(self):
        conn = sqlite3.connect(main.DB_PATH); r = mk(conn, "SC-NEW", "student", "CSE"); conn.commit(); conn.close()
        h = {"Authorization": "Bearer " + create_token(r[0], r[1])}
        self.assertIsNone(self.c.get("/api/attendance", headers=h).json()["percentage"])

    # --- leaves: department scoping & flip-flop prevention
    def test_leaves_department_scoping_and_freeze(self):
        # 1. CSE student files short leave (<= 3 days: HOD approval is final)
        r = self.c.post("/api/leaves", json={"leave_type": "Medical", "from_date": "2026-10-15", "to_date": "2026-10-17", "reason": "Fever"}, headers=self.h["stu"])
        self.assertEqual(r.status_code, 200)
        lid = r.json()["leave"]["id"]

        # 2. ECE HOD cannot view or approve CSE student's leave
        self.assertEqual(self.get("hodE", f"/api/leaves/{lid}").status_code, 403)
        act_ece = self.c.post(f"/api/leaves/{lid}/action", json={"status": "Approved", "action_note": "ECE HOD trying to approve"}, headers=self.h["hodE"])
        self.assertEqual(act_ece.status_code, 403)

        # 3. CSE HOD can view and approve
        self.assertEqual(self.get("hodC", f"/api/leaves/{lid}").status_code, 200)
        act_cse = self.c.post(f"/api/leaves/{lid}/action", json={"status": "Approved", "action_note": "Approved by CSE HOD"}, headers=self.h["hodC"])
        self.assertEqual(act_cse.status_code, 200)
        self.assertEqual(act_cse.json()["leave"]["status"], "Approved")

        # 4. Once Approved, HOD cannot flip it back and forth
        flip = self.c.post(f"/api/leaves/{lid}/action", json={"status": "Rejected", "action_note": "Flipping to rejected"}, headers=self.h["hodC"])
        self.assertEqual(flip.status_code, 400)

        # 5. Admin CAN override / change finalized leave
        adm_act = self.c.post(f"/api/leaves/{lid}/action", json={"status": "Rejected", "action_note": "Admin override"}, headers=self.h["adm"])
        self.assertEqual(adm_act.status_code, 200)
        self.assertEqual(adm_act.json()["leave"]["status"], "Rejected")

    # --- achievements: department scoping & forgery protection
    def test_achievements_department_scoping_and_forgery_lock(self):
        # 1. CSE student posts achievement (starts as Pending)
        r = self.c.post("/api/achievements", json={"title": "Smart Odisha Hackathon 1st Place", "category": "Hackathon", "date": "2026-10-01", "description": "Built IoT monitor", "link": ""}, headers=self.h["stu"])
        self.assertEqual(r.status_code, 200)
        aid = r.json()["achievement"]["id"]

        # 2. ECE teacher cannot verify CSE student's achievement
        ver_ece = self.c.post(f"/api/achievements/{aid}/verify", json={"status": "Verified"}, headers=self.h["facE"])
        self.assertEqual(ver_ece.status_code, 403)

        # 3. Pending achievements are scoped in teacher's review list:
        # facE should NOT see this pending achievement
        facE_list = [x["id"] for x in self.get("facE", "/api/achievements").json() if x["status"] == "Pending"]
        self.assertNotIn(aid, facE_list)
        # facA SHOULD see it
        facA_list = [x["id"] for x in self.get("facA", "/api/achievements").json() if x["status"] == "Pending"]
        self.assertIn(aid, facA_list)

        # 4. CSE teacher verifies achievement
        ver_cse = self.c.post(f"/api/achievements/{aid}/verify", json={"status": "Verified"}, headers=self.h["facA"])
        self.assertEqual(ver_cse.status_code, 200)
        self.assertEqual(ver_cse.json()["achievement"]["status"], "Verified")

        # 5. Student attempts to forge / edit title of already-verified achievement -> 403 FORBIDDEN!
        forge = self.c.put(f"/api/achievements/{aid}", json={"title": "Forged Fake Hackathon Winner", "category": "Hackathon", "date": "2026-10-01", "description": "Tampered description", "link": ""}, headers=self.h["stu"])
        self.assertEqual(forge.status_code, 403)

        # 6. Student cannot delete verified achievement
        del_stu = self.c.delete(f"/api/achievements/{aid}", headers=self.h["stu"])
        self.assertEqual(del_stu.status_code, 403)

        # 7. Admin CAN edit verified achievement
        adm_edit = self.c.put(f"/api/achievements/{aid}", json={"title": "Smart Odisha Hackathon Grand Winner (Admin Corrected)", "category": "Hackathon", "date": "2026-10-01", "description": "Verified official record", "link": ""}, headers=self.h["adm"])
        self.assertEqual(adm_edit.status_code, 200)
        self.assertEqual(adm_edit.json()["achievement"]["title"], "Smart Odisha Hackathon Grand Winner (Admin Corrected)")


if __name__ == "__main__":
    unittest.main()
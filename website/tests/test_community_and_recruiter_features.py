"""Tests for Community Complaints, Me-Too opinions, and Recruiter Message Notifications.
"""
import unittest
from starlette.testclient import TestClient

import database
from main import app, create_token, hash_password


class TestCommunityAndRecruiterFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db(hash_password)
        cls.client = TestClient(app)

        conn = database.get_connection()
        # Seed test student 1
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-COMM-STU1', 'Community Student One', 'student', ?, 'CSE', '+919876543211')
            ON CONFLICT(login_id) DO UPDATE SET name = 'Community Student One'
            """,
            (hash_password("Pass123!"),)
        )
        # Seed test student 2
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-COMM-STU2', 'Community Student Two', 'student', ?, 'CSE', '+919876543212')
            ON CONFLICT(login_id) DO UPDATE SET name = 'Community Student Two'
            """,
            (hash_password("Pass123!"),)
        )
        # Seed test recruiter (guest)
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-COMM-REC', 'Tech Corp Recruiter', 'guest', ?, 'HR', '+919876543213')
            ON CONFLICT(login_id) DO UPDATE SET name = 'Tech Corp Recruiter'
            """,
            (hash_password("Pass123!"),)
        )
        # Seed test placement officer
        conn.execute(
            """
            INSERT INTO users (login_id, name, role, password_hash, dept, phone)
            VALUES ('TEST-COMM-TPO', 'Placement Head', 'placement_officer', ?, 'TPO', '+919876543214')
            ON CONFLICT(login_id) DO UPDATE SET name = 'Placement Head'
            """,
            (hash_password("Pass123!"),)
        )
        conn.commit()

        u1 = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-COMM-STU1'").fetchone()
        u2 = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-COMM-STU2'").fetchone()
        rec = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-COMM-REC'").fetchone()
        tpo = conn.execute("SELECT * FROM users WHERE login_id = 'TEST-COMM-TPO'").fetchone()

        # Clean prior test state for isolation
        conn.execute("DELETE FROM contact_requests WHERE guest_id = ? OR student_id IN (?, ?)", (rec["id"], u1["id"], u2["id"]))
        conn.execute("DELETE FROM complaint_opinions WHERE user_id IN (?, ?)", (u1["id"], u2["id"]))
        conn.execute("DELETE FROM complaints WHERE user_id IN (?, ?)", (u1["id"], u2["id"]))
        conn.execute("DELETE FROM student_profiles WHERE user_id IN (?, ?)", (u1["id"], u2["id"]))
        conn.commit()
        conn.close()

        cls.u1 = u1
        cls.u2 = u2
        cls.rec = rec
        cls.tpo = tpo

        cls.token1 = create_token(u1["id"], u1["pw_version"])
        cls.token2 = create_token(u2["id"], u2["pw_version"])
        cls.token_rec = create_token(rec["id"], rec["pw_version"])
        cls.token_tpo = create_token(tpo["id"], tpo["pw_version"])

        cls.h1 = {"Authorization": f"Bearer {cls.token1}"}
        cls.h2 = {"Authorization": f"Bearer {cls.token2}"}
        cls.h_rec = {"Authorization": f"Bearer {cls.token_rec}"}
        cls.h_tpo = {"Authorization": f"Bearer {cls.token_tpo}"}

    def test_community_complaints_and_me_too_flow(self):
        # 1. Student 1 submits a public complaint
        resp = self.client.post(
            "/api/complaints",
            headers=self.h1,
            json={
                "category": "Hostel",
                "location": "Block A 3rd Floor",
                "title": "Water heater broken in Block A",
                "description": "Geyser is not turning on since yesterday morning.",
                "is_anonymous": False,
            },
        )
        self.assertEqual(resp.status_code, 200)
        c_data = resp.json()["complaint"]
        cid = c_data["id"]

        # 2. Student 2 views community complaints
        resp_comm = self.client.get("/api/complaints/community", headers=self.h2)
        self.assertEqual(resp_comm.status_code, 200)
        items = resp_comm.json()
        matched = [c for c in items if c["id"] == cid]
        self.assertTrue(len(matched) > 0, "Student 1's complaint should appear in community feed")
        cmp_item = matched[0]
        # Since viewed by another student and not anonymous, label shows Student (Hostel)
        self.assertIn("Student (Hostel)", cmp_item["name"])
        self.assertEqual(cmp_item["me_too_count"], 0)
        self.assertIsNone(cmp_item["my_opinion"])

        # 3. Student 2 endorses with 'me_too'
        resp_op = self.client.post(
            f"/api/complaints/{cid}/opinion",
            headers=self.h2,
            json={"opinion": "me_too"},
        )
        self.assertEqual(resp_op.status_code, 200)
        op_data = resp_op.json()
        self.assertEqual(op_data["me_too_count"], 1)

        # Re-check community feed as Student 2
        resp_comm2 = self.client.get("/api/complaints/community", headers=self.h2)
        matched2 = [c for c in resp_comm2.json() if c["id"] == cid][0]
        self.assertEqual(matched2["me_too_count"], 1)
        self.assertEqual(matched2["my_opinion"], "me_too")

        # 4. Student 2 posts a descriptive opinion
        resp_op2 = self.client.post(
            f"/api/complaints/{cid}/opinion",
            headers=self.h2,
            json={"opinion": "Facing this exact same problem in Room 304 as well!"},
        )
        self.assertEqual(resp_op2.status_code, 200)

        resp_comm3 = self.client.get("/api/complaints/community", headers=self.h2)
        matched3 = [c for c in resp_comm3.json() if c["id"] == cid][0]
        self.assertTrue(len(matched3["opinions"]) >= 1)
        self.assertIn("Room 304", matched3["opinions"][0]["opinion"])

        # 5. Student 2 removes their opinion
        resp_del = self.client.delete(f"/api/complaints/{cid}/opinion", headers=self.h2)
        self.assertEqual(resp_del.status_code, 200)

        resp_comm4 = self.client.get("/api/complaints/community", headers=self.h2)
        matched4 = [c for c in resp_comm4.json() if c["id"] == cid][0]
        self.assertEqual(matched4["me_too_count"], 0)
        self.assertIsNone(matched4["my_opinion"])

    def test_anonymous_complaint_masks_identity_in_community(self):
        # Student 1 files an anonymous complaint
        resp = self.client.post(
            "/api/complaints",
            headers=self.h1,
            json={
                "category": "Academic",
                "location": "Classroom 204",
                "title": "Projector HDMI cable damaged",
                "description": "HDMI port flickering during presentation.",
                "is_anonymous": True,
            },
        )
        self.assertEqual(resp.status_code, 200)
        cid = resp.json()["complaint"]["id"]

        # Student 2 views community feed
        resp_comm = self.client.get("/api/complaints/community", headers=self.h2)
        self.assertEqual(resp_comm.status_code, 200)
        matched = [c for c in resp_comm.json() if c["id"] == cid]
        self.assertTrue(len(matched) > 0)
        self.assertEqual(matched[0]["name"], "Anonymous Student")
        self.assertEqual(matched[0]["login_id"], "")
        self.assertIsNone(matched[0]["user_id"])

    def test_recruiter_message_and_student_reply_notification(self):
        # 1. Student 1 saves recruiting profile
        resp_opt = self.client.put(
            "/api/me/recruiting",
            headers=self.h1,
            json={
                "visible": True,
                "cgpa": "8.75",
                "backlogs": "0",
                "skills": "Python, FastAPI, React, PostgreSQL",
                "subjects": "DSA, DBMS, Operating Systems",
            },
        )
        self.assertEqual(resp_opt.status_code, 200)

        # Get anon code
        resp_me = self.client.get("/api/me/recruiting", headers=self.h1)
        self.assertEqual(resp_me.status_code, 200)
        code = resp_me.json()["profile"]["code"]
        self.assertTrue(bool(code), "Profile should have an anonymous recruiter code")

        # 2. Recruiter sends contact request with message
        req_msg = "Hello! We would like to schedule an interview for our upcoming engineering batch."
        resp_req = self.client.post(
            "/api/recruiter/requests",
            headers=self.h_rec,
            json={
                "code": code,
                "company": "Nexus Dynamics Inc",
                "message": req_msg,
            },
        )
        self.assertEqual(resp_req.status_code, 200)

        # Placement officer fetches requests to find this request id
        resp_tpo = self.client.get("/api/placement/requests", headers=self.h_tpo)
        self.assertEqual(resp_tpo.status_code, 200)
        pending_reqs = [r for r in resp_tpo.json() if r.get("code") == code]
        self.assertTrue(len(pending_reqs) > 0)
        rid = pending_reqs[0]["id"]

        # Placement officer approves request, forwarding it to student
        resp_approve = self.client.post(
            f"/api/placement/requests/{rid}/decide",
            headers=self.h_tpo,
            json={"approve": True, "note": "Verified genuine company"},
        )
        self.assertEqual(resp_approve.status_code, 200)

        # 3. Student 1 fetches their recruiting dashboard & sees recruiter message
        resp_stu = self.client.get("/api/me/recruiting", headers=self.h1)
        self.assertEqual(resp_stu.status_code, 200)
        reqs = resp_stu.json().get("requests", [])
        matched = [r for r in reqs if r["id"] == rid]
        self.assertTrue(len(matched) > 0, "Contact request must be visible to student")
        self.assertEqual(matched[0]["message"], req_msg)
        self.assertEqual(matched[0]["status"], "awaiting_student")

        # 4. Student 1 replies and decides (accepts with availability note)
        student_reply = "Thank you! I am available on Tuesday between 2 PM and 5 PM."
        resp_decide = self.client.post(
            f"/api/me/recruiting/requests/{rid}/decide",
            headers=self.h1,
            json={
                "accept": True,
                "message": student_reply,
            },
        )
        self.assertEqual(resp_decide.status_code, 200)

        # 5. Check student's profile again: status is approved and student_note is preserved
        resp_stu2 = self.client.get("/api/me/recruiting", headers=self.h1)
        matched2 = [r for r in resp_stu2.json().get("requests", []) if r["id"] == rid][0]
        self.assertEqual(matched2["status"], "approved")
        self.assertEqual(matched2["student_note"], student_reply)

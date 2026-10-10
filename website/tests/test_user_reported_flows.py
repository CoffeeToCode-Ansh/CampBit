#!/usr/bin/env python3
"""Comprehensive Verification Suite for User-Reported Issues:
1. Student Leave Approval Status Synchronization (Student -> HOD -> Approved).
2. Student Achievement Server Verification (No 404, status 'Verified').
3. Cross-Student Complaint Visibility (Student A submits -> Student B views & endorses 'Me Too').
4. Anonymous Grievance Submitter Protection ('Anonymous Student').
5. Clean DB Verification.
"""
import sys
from pathlib import Path
import pytest
from starlette.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database import get_connection
from main import app, create_token

client = TestClient(app)

class TestUserReportedFlows:
    @classmethod
    def setup_class(cls):
        conn = get_connection()
        u1 = conn.execute("SELECT * FROM users WHERE login_id = '1358'").fetchone()
        u2 = conn.execute("SELECT * FROM users WHERE login_id = 'CS23-0201'").fetchone()
        uhod = conn.execute("SELECT * FROM users WHERE login_id = 'SC-HODC'").fetchone()
        utch = conn.execute("SELECT * FROM users WHERE login_id = 'SC-FACA'").fetchone()
        conn.close()

        cls.h_stu1 = {"Authorization": f"Bearer {create_token(u1['id'], u1['pw_version'])}"}
        cls.h_stu2 = {"Authorization": f"Bearer {create_token(u2['id'], u2['pw_version'])}"}
        cls.h_hod = {"Authorization": f"Bearer {create_token(uhod['id'], uhod['pw_version'])}"}
        cls.h_tch = {"Authorization": f"Bearer {create_token(utch['id'], utch['pw_version'])}"}

    # =========================================================================
    # 1. LEAVE APPROVAL & STATUS SYNCHRONIZATION
    # =========================================================================
    def test_leave_approval_updates_student_status_to_approved(self):
        """Student submits leave -> HOD approves -> student checks -> shows Approved (not Pending)."""
        # 1. Student 1 submits a leave request
        create_res = client.post("/api/leaves", headers=self.h_stu1, json={
            "leave_type": "Medical",
            "from_date": "2026-10-20",
            "to_date": "2026-10-21",
            "reason": "Test viral fever recovery"
        })
        assert create_res.status_code == 200, f"Leave creation failed: {create_res.text}"
        leave_id = create_res.json()["leave"]["id"]
        assert create_res.json()["leave"]["status"] == "Pending"

        try:
            # 2. HOD approves the leave using action endpoint (both action & status payloads)
            action_res = client.post(f"/api/leaves/{leave_id}/action", headers=self.h_hod, json={
                "status": "Approved",
                "action": "approve",
                "action_note": "Approved by CSE HOD. Get well soon."
            })
            assert action_res.status_code == 200, f"HOD approve failed: {action_res.status_code} {action_res.text}"
            assert action_res.json()["leave"]["status"] == "Approved"

            # 3. Student 1 checks leave status via GET /api/leaves
            stu_leaves_res = client.get("/api/leaves", headers=self.h_stu1)
            assert stu_leaves_res.status_code == 200
            leaves_list = stu_leaves_res.json()
            matched = [l for l in leaves_list if l["id"] == leave_id]
            assert len(matched) == 1, "Leave record not found in student list"
            assert matched[0]["status"] == "Approved", f"Expected Approved but got {matched[0]['status']}"
            assert matched[0]["action_note"] == "Approved by CSE HOD. Get well soon."

            # 4. Student 1 checks single leave item GET /api/leaves/{id}
            single_res = client.get(f"/api/leaves/{leave_id}", headers=self.h_stu1)
            assert single_res.status_code == 200
            leave_obj = single_res.json().get("leave") if "leave" in single_res.json() else single_res.json()
            assert leave_obj["status"] == "Approved"

        finally:
            # Clean up test leave record
            client.delete(f"/api/leaves/{leave_id}", headers=self.h_stu1)

    # =========================================================================
    # 2. ACHIEVEMENT SERVER VERIFICATION (NO 404)
    # =========================================================================
    def test_achievement_creation_and_teacher_verification(self):
        """Student submits achievement -> real server ID -> Teacher verifies -> 200 OK & Verified."""
        # 1. Student 1 submits achievement to server
        create_res = client.post("/api/achievements", headers=self.h_stu1, json={
            "title": "Smart India Hackathon Finalist 2026",
            "category": "Hackathon",
            "date": "2026-10-01",
            "description": "Selected among top 5 teams nationally",
            "link": "https://sih.gov.in"
        })
        assert create_res.status_code == 200, f"Achievement creation failed: {create_res.text}"
        ach_data = create_res.json()["achievement"]
        ach_id = ach_data["id"]
        assert isinstance(ach_id, int), f"Expected int server ID, got: {ach_id}"
        assert ach_data["status"] == "Pending"

        try:
            # 2. Teacher views list of achievements via GET /api/achievements
            list_res = client.get("/api/achievements", headers=self.h_tch)
            assert list_res.status_code == 200
            server_items = list_res.json()
            assert any(a["id"] == ach_id for a in server_items), "Created achievement missing from server list"

            # 3. Teacher verifies achievement via PUT /api/achievements/{id}/verify
            verify_res = client.put(f"/api/achievements/{ach_id}/verify", headers=self.h_tch, json={
                "status": "Verified"
            })
            assert verify_res.status_code == 200, f"Verification failed with {verify_res.status_code}: {verify_res.text}"
            verified_ach = verify_res.json()["achievement"]
            assert verified_ach["status"] == "Verified"
            assert verified_ach["verified_by"] is not None

            # 4. Student checks achievements to see 'Verified' status
            stu_ach_res = client.get("/api/achievements", headers=self.h_stu1)
            assert stu_ach_res.status_code == 200
            stu_item = next(a for a in stu_ach_res.json() if a["id"] == ach_id)
            assert stu_item["status"] == "Verified"

        finally:
            # Clean up test achievement
            client.delete(f"/api/achievements/{ach_id}", headers=self.h_stu1)

    # =========================================================================
    # 3. CROSS-STUDENT COMPLAINT VISIBILITY & ENDORSEMENT
    # =========================================================================
    def test_complaint_visible_to_all_students_and_endorsable(self):
        """Student A posts public complaint -> Student B can view it and endorse with Me Too."""
        # 1. Student 1 files a public campus complaint
        create_res = client.post("/api/complaints", headers=self.h_stu1, json={
            "category": "Canteen",
            "title": "Drinking water cooler filter replacement required",
            "description": "The cooler on the ground floor cafeteria tastes metallic and needs fresh filter.",
            "location": "Ground Floor Cafeteria",
            "is_anonymous": False
        })
        assert create_res.status_code == 200, f"Complaint creation failed: {create_res.text}"
        comp_id = create_res.json()["complaint"]["id"]

        try:
            # 2. Student 2 fetches the community complaints feed
            feed_res = client.get("/api/complaints/community", headers=self.h_stu2)
            assert feed_res.status_code == 200
            feed = feed_res.json()
            matched = [c for c in feed if c["id"] == comp_id]
            assert len(matched) == 1, f"Complaint {comp_id} not visible to Student 2 in community feed!"
            c_entry = matched[0]
            # Verify submitter name is displayed because is_anonymous is False
            assert "Anshika" in c_entry["submitter"] or "Student" in c_entry["submitter"]
            initial_count = c_entry.get("opinion_count", 0)

            # 3. Student 2 endorses Student 1's complaint with "Me Too" / opinion
            op_res = client.post(f"/api/complaints/{comp_id}/opinion", headers=self.h_stu2, json={
                "opinion": "Me too! Experiencing the same issue."
            })
            assert op_res.status_code == 200, f"Opinion submission failed: {op_res.text}"
            assert op_res.json()["opinion_count"] == initial_count + 1

            # 4. Student 1 also sees the updated count and endorsement in the feed
            feed_after = client.get("/api/complaints/community", headers=self.h_stu1).json()
            updated_c = next(c for c in feed_after if c["id"] == comp_id)
            assert updated_c["opinion_count"] == initial_count + 1
            assert any(op.get("opinion") == "Me too! Experiencing the same issue." for op in updated_c.get("opinions", []))

        finally:
            # Clean up test complaint
            client.delete(f"/api/complaints/{comp_id}", headers=self.h_stu1)

    # =========================================================================
    # 4. ANONYMOUS COMPLAINTS MASKING PROTECTION
    # =========================================================================
    def test_anonymous_complaint_submitter_is_masked_for_peers(self):
        """Anonymous complaints must display 'Anonymous Student' to peers and never expose identity."""
        create_res = client.post("/api/complaints", headers=self.h_stu1, json={
            "category": "Hostel",
            "title": "Confidential concern regarding hostel timings",
            "description": "Please review the strict weekend gate closing hours.",
            "location": "Hostel Gate 2",
            "is_anonymous": True
        })
        assert create_res.status_code == 200
        comp_id = create_res.json()["complaint"]["id"]

        try:
            # Student 2 views the community feed
            feed_res = client.get("/api/complaints/community", headers=self.h_stu2)
            assert feed_res.status_code == 200
            c_entry = next(c for c in feed_res.json() if c["id"] == comp_id)
            assert c_entry["submitter"] == "Anonymous Student", f"Expected 'Anonymous Student', got: {c_entry['submitter']}"
            assert "Anshika" not in c_entry["submitter"]
            assert "1358" not in c_entry["submitter"]

        finally:
            client.delete(f"/api/complaints/{comp_id}", headers=self.h_stu1)

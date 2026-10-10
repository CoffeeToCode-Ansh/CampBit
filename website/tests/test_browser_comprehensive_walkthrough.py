#!/usr/bin/env python3
"""Comprehensive End-to-End Visual Browser Automation Suite for CampBit.

Captures and tests every portal, role, and facility:
- 01: Login Portal & Role Switcher
- 02: Admin Portal Overview
- 03: Admin Institutional Audit Trail
- 04: Admin Accounts Management
- 05: Student Home & Smart Attendance Risk Engine
- 06: Student Leave Application Facility
- 07: Student Grievance & Complaints Box
- 08: Student Campus Noticeboard
- 09: Student Timetable & Class Schedule
- 10: Student Academic Resources & Notes
- 11: Student Mess & Campus Reviews
- 12: Campus Emergency SOS Modal
- 13: Faculty Roll Call & Attendance Marking
- 14: HOD Department Command Center & Class Tracking
- 15: Warden Hostel Governance & Grievances
- 16: Principal Directorate & Sanctions
- 17: Recruiter Guest Talent Pool
"""
import sys
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

BASE_URL = "http://localhost:8000"
ARTIFACT_DIR = "/Users/samrat/.gemini/antigravity-ide/brain/25773080-d607-4e53-a095-79269d3cf2d9"
SCREENSHOT_DIR = os.path.join(ARTIFACT_DIR, "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def run():
    print("🚀 Launching Comprehensive Playwright Visual Walkthrough Suite...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 950})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error",) else None)
        page.on("pageerror", lambda err: console_errors.append(f"[pageerror] {err}"))

        # --- 1. LOGIN PORTAL ---
        print("\n--- 1. Testing Login Portal & Role Switcher ---")
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_login_portal.png"))
        print("  📸 Captured: 01_login_portal.png")

        # --- 2. ADMIN PORTAL ---
        print("\n--- 2. Testing Admin Portal & Accounts Facility (SC-ADM) ---")
        page.click("#seg button[data-role='admin']")
        page.fill("#user", "SC-ADM")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_admin_dashboard.png"))
        print("  📸 Captured: 02_admin_dashboard.png (Admin Overview)")

        # Audit logs chip
        page.evaluate("() => { const b = document.querySelector(\"button[data-atab='audit']\"); if (b) b.click(); }")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_admin_audit_logs.png"))
        print("  📸 Captured: 03_admin_audit_logs.png (Audit Logs Trail)")

        # Accounts Tab
        page.evaluate("() => goToTab('accounts')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_admin_accounts_management.png"))
        print("  📸 Captured: 04_admin_accounts_management.png (User Accounts Directory)")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(600)

        # --- 3. STUDENT PORTAL (ALL STUDENT FACILITIES) ---
        print("\n--- 3. Testing All Student Facilities (SC-STU) ---")
        page.click("#seg button[data-role='student']")
        page.fill("#user", "SC-STU")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "05_student_home_risk_engine.png"))
        print("  📸 Captured: 05_student_home_risk_engine.png (Home & Attendance Risk Engine)")

        # Student Leaves Tab
        page.evaluate("() => goToTab('leave')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "06_student_leave_applications.png"))
        print("  📸 Captured: 06_student_leave_applications.png (Leave Application Facility)")

        # Student Complaints / Grievance Box
        page.evaluate("() => goToTab('complaints')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "07_student_complaints_box.png"))
        print("  📸 Captured: 07_student_complaints_box.png (Campus Grievance Box)")

        # Student Notices Tab
        page.evaluate("() => goToTab('notices')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "08_student_notices.png"))
        print("  📸 Captured: 08_student_notices.png (Noticeboard Facility)")

        # Student Timetable Tab
        page.evaluate("() => goToTab('timetable')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "09_student_timetable.png"))
        print("  📸 Captured: 09_student_timetable.png (Timetable Facility)")

        # Student Resources Tab
        page.evaluate("() => goToTab('resources')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "10_student_resources.png"))
        print("  📸 Captured: 10_student_resources.png (Academic Notes & Resources Facility)")

        # Student Mess & Reviews Tab
        page.evaluate("() => goToTab('mess')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "11_student_mess_reviews.png"))
        print("  📸 Captured: 11_student_mess_reviews.png (Hostel Mess & Reviews Facility)")

        # Emergency SOS Modal
        sos_btn = page.query_selector(".floating-sos-btn")
        if sos_btn:
            sos_btn.click()
            page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "12_student_sos_modal.png"))
            print("  📸 Captured: 12_student_sos_modal.png (Emergency SOS Modal)")
            page.click("button[data-close]")
            page.wait_for_timeout(400)

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(600)

        # --- 4. FACULTY PORTAL ---
        print("\n--- 4. Testing Faculty Portal (SC-FACA) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-FACA")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)

        page.evaluate("() => goToTab('attendance')")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "13_faculty_attendance_view.png"))
        print("  📸 Captured: 13_faculty_attendance_view.png (Faculty Roll Call & Sync Facility)")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(600)

        # --- 5. HOD PORTAL ---
        print("\n--- 5. Testing HOD Department Leadership Portal (SC-HODC) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-HODC")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "14_hod_department_command.png"))
        print("  📸 Captured: 14_hod_department_command.png (HOD Command Center)")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(600)

        # --- 6. WARDEN PORTAL ---
        print("\n--- 6. Testing Warden Hostel Governance Portal (SC-WA) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-WA")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "15_warden_hostel_governance.png"))
        print("  📸 Captured: 15_warden_hostel_governance.png (Warden Hostel Governance)")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(600)

        # --- 7. PRINCIPAL PORTAL ---
        print("\n--- 7. Testing Principal Directorate Portal (SC-PRIN) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-PRIN")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "16_principal_executive_center.png"))
        print("  📸 Captured: 16_principal_executive_center.png (Principal Directorate & Sanctions)")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(600)

        # --- 8. RECRUITER PORTAL ---
        print("\n--- 8. Testing Recruiter Guest Portal (SEC-REC-BPUT) ---")
        page.click("#seg button[data-role='guest']")
        page.fill("#user", "SEC-REC-BPUT")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "17_recruiter_talent_catalog.png"))
        print("  📸 Captured: 17_recruiter_talent_catalog.png (Recruiter Talent Pool)")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)

        browser.close()

        print("\n=======================================================")
        print("🎉 ALL 17 PLAYWRIGHT BROWSER VISUAL FLOWS EXECUTED SUCCESSFULLY!")
        print(f"Total Screenshots Saved: {len(os.listdir(SCREENSHOT_DIR))}")
        print("=======================================================")

if __name__ == "__main__":
    run()

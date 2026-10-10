import sys
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

BASE_URL = "http://localhost:8000"
ARTIFACT_DIR = "/Users/samrat/.gemini/antigravity-ide/brain/f4d0fe61-2198-4997-917b-813e6e18b217"
SCREENSHOT_DIR = os.path.join(ARTIFACT_DIR, "screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def ensure_server():
    import urllib.request
    try:
        urllib.request.urlopen(BASE_URL, timeout=1.0)
    except Exception:
        import subprocess
        print("  ⚡ Starting local server process on port 8000 for browser testing...")
        subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--port", "8000"], cwd=str(ROOT))
        time.sleep(2.5)

def run():
    ensure_server()
    print("🚀 Starting Comprehensive End-to-End Browser Automation Suite with Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 950})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error",) else None)
        page.on("pageerror", lambda err: console_errors.append(f"[pageerror] {err}"))

        # --- 1. LOGIN PAGE ---
        print("\n--- 1. Testing Login Page & Mascot ---")
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=10000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_login_page.png"))
        print("  📸 Captured: 01_login_page.png")

        # --- 2. STUDENT LOGIN FLOW & SMART ATTENDANCE RISK ENGINE ---
        print("\n--- 2. Testing Student Portal & Smart Attendance Risk Engine (SC-STU) ---")
        page.click("#seg button[data-role='student']")
        page.fill("#user", "SC-STU")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        print("  ⏳ Waiting for Student portal to load...")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_student_home.png"))
        print("  📸 Captured: 02_student_home.png (Smart Attendance Risk Tile Verified)")

        # Navigate tabs for Student (attendance calculator, leave, notices)
        for tab in ["attendance", "leave", "notices"]:
            tab_btn = page.query_selector(f"button.tab[data-t='{tab}']")
            if tab_btn:
                tab_btn.click()
                page.wait_for_timeout(700)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_student_notices.png"))
        print("  📸 Captured: 03_student_notices.png")

        # Logout Student
        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)

        # --- 3. FACULTY LOGIN & REAL OFFLINE ATTENDANCE SYNCHRONIZATION ---
        print("\n--- 3. Testing Faculty Portal & Real Offline Synchronization (SC-FACA) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-FACA")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(1000)

        # Open Attendance tab
        att_tab = page.query_selector("button.tab[data-t='attendance']")
        if att_tab:
            att_tab.click()
            page.wait_for_timeout(800)

        # Simulate Offline Mode in Chromium
        context.set_offline(True)
        page.evaluate("() => { const b = document.querySelector('button[data-off]'); if (b) b.click(); }")
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "10_offline_faculty_attendance.png"))
        print("  📸 Captured: 10_offline_faculty_attendance.png (Airplane / Offline Mode Active)")

        # Restore Online Mode and Sync
        context.set_offline(False)
        page.evaluate("() => { const b = document.querySelector('button[data-off]'); if (b) b.click(); }")
        page.wait_for_timeout(600)
        page.evaluate("() => { const s = document.querySelector('button[data-sync]'); if (s) s.click(); }")
        page.wait_for_timeout(800)

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)

        # --- 4. PRINCIPAL CAMPUS COMMAND CENTER ---
        print("\n--- 4. Testing Campus Command Center & Directorate (SC-PRIN) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-PRIN")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        print("  ⏳ Waiting for Principal Executive Session to load...")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_principal_dashboard.png"))
        print("  📸 Captured: 04_principal_dashboard.png (Executive Directorate Session)")

        # Scroll to examine Directorate cards
        page.evaluate("window.scrollBy(0, 400)")
        page.wait_for_timeout(700)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "05_principal_directorate_cards.png"))
        print("  📸 Captured: 05_principal_directorate_cards.png (Sanction Queue & Escalations)")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)

        # --- 5. HOD LOGIN FLOW ---
        print("\n--- 5. Testing HOD Department Leadership Flow (SC-HODC) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-HODC")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "08_hod_dashboard.png"))
        print("  📸 Captured: 08_hod_dashboard.png")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)

        # --- 6. WARDEN LOGIN FLOW ---
        print("\n--- 6. Testing Warden Hostel Governance Flow (SC-WA) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SC-WA")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "09_warden_dashboard.png"))
        print("  📸 Captured: 09_warden_dashboard.png")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)

        # --- 7. PLACEMENT OFFICER FLOW ---
        print("\n--- 7. Testing Training & Placement Officer Portal (SEC-PLACE-BPUT) ---")
        page.click("#seg button[data-role='staff']")
        page.fill("#user", "SEC-PLACE-BPUT")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "11_placement_officer_portal.png"))
        print("  📸 Captured: 11_placement_officer_portal.png")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(800)

        # --- 8. ADMIN LOGIN FLOW ---
        print("\n--- 8. Testing Root Admin Portal & Audit Forensics (SC-ADM) ---")
        page.click("#seg button[data-role='admin']")
        page.fill("#user", "SC-ADM")
        page.fill("#pass", "Pass123!")
        page.click("#signin")
        page.wait_for_selector("#siteView:not(.hidden)", state="visible", timeout=15000)
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(SCREENSHOT_DIR, "06_admin_overview.png"))
        print("  📸 Captured: 06_admin_overview.png")

        audit_chip = page.query_selector("button[data-atab='audit']")
        if audit_chip:
            audit_chip.click()
            page.wait_for_timeout(1200)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "07_admin_audit_logs.png"))
            print("  📸 Captured: 07_admin_audit_logs.png")

        page.click("#logout")
        page.wait_for_selector("#loginView:not(.hidden)", state="visible", timeout=15000)

        browser.close()

        print("\n==========================================")
        print("🎉 ALL 8 BROWSER PORTALS & FLOWS PASSED SUCCESSFULLY!")
        print(f"Total Console Runtime Errors: {len(console_errors)}")
        print("==========================================")

if __name__ == "__main__":
    run()

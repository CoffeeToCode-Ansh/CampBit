# PRD — BPUT Campus Super-App

Status: Hackathon prototype scope, frozen for the build. Anything not listed under **In Scope** is explicitly deferred — do not build it early, do not design the schema around it either.

## 1. Problem

Student and campus administration workflows at BPUT-affiliated colleges (attendance, leave, timetable, hostel/college complaints, notices, and placement) are scattered across paper, WhatsApp groups, and notice boards. Students and staff need one app; but connectivity on campus and in hostels is unreliable, so it has to work offline-first, and it has to work in the languages people actually use.

## 2. Users and roles

| Role | Type | Primary need |
|---|---|---|
| Student | Core user | Attendance, leave, timetable, complaints, notices, opportunities |
| Faculty (teaching) | Admin | Mark attendance, approve leave (as mentor), verify achievements |
| HOD | Admin | Department oversight, substitutions, department notices |
| Principal | Admin | College-wide approvals, analytics, escalations |
| Warden / maintenance (non-teaching) | Admin | Hostel/category complaint queue |
| Placement officer (non-teaching) | Admin | Opportunities, applicants, recruiter invites, contact-request gate |
| Recruiter | Guest (external) | View masked applicant profiles for one opportunity, request contact |

All roles are scoped to one `college_id`. A user never sees data belonging to another college.

## 3. Feature scope

| # | Feature | Status |
|---|---|---|
| 1 | Student profile, opportunities, applications, **recruiter guest view** | **In scope** |
| 2 | Smart attendance — offline marking, leave, "classes you can miss" calculator | **In scope** |
| 3 | Live timetable | **Basic only** — view, substitution/extra-class entry, `.ics` export |
| 4 | Personalized AI mentor | Future |
| 5 | Hostel/college complaints, mess module | **In scope** |
| 6 | Targeted notices | **In scope** |
| 7 | Fee queries and payments | Future |
| 8 | 3D real-time learning | Future |
| — | Badging system (achievements) on student profile | **Future**, but schema (`achievements` table) is prepared now |

Cross-cutting, in scope for the prototype:
- Single login page, server-decided role, role-specific dashboards.
- Three languages at launch: English, Hindi, Odia. Architecture must support adding more without a rewrite.
- Security posture that specifically prevents any student or admin from reaching another user's data (IDOR/BOLA is the named threat).

## 4. Feature detail

### F1 — Student profile & opportunities (with recruiter guest view)
- Student profile: academic info, skills, projects, verified achievements, applications.
- Placement officer posts an opportunity; student applies in one click.
- **Recruiter guest access**: invite-only (registered by placement officer), email-OTP login, scoped to applicants of their one opportunity, access expires when the opportunity closes (+ grace period).
- Recruiter sees a **masked, blind-by-default** profile (anonymous ID, branch, CGPA, skills, verified achievements) — never name, photo, contact details, or resume directly.
- Recruiter cannot contact or download anything. "Request contact" creates a request in the shared request engine, routed to the placement officer, who requires student consent before releasing contact details or scheduling an interview.
- Certificates: SHA-256 hash + QR verify page (public, no login needed to verify).
- Every profile view by a recruiter is logged and visible to the student ("who viewed my profile").

### F2 — Smart attendance
- Faculty mark attendance offline per class session (from the timetable); syncs when back online, idempotent (no duplicate/overwritten records from concurrent syncs).
- Leave application/approval on the shared **request engine**: approver depends on leave duration (HOD for short, + Principal for long). Approved leave is marked "excused," not "present."
- "Classes you can still miss" calculator: `N = floor(attended / 0.75 − held)` (confirm 75% against the actual college rule) — deterministic arithmetic, not ML, for the prototype.

### F3 — Timetable (basic)
- View by student/faculty/section. HOD can post a substitution or extra class, which auto-generates a notice and updates the `.ics` feed.
- Calendar subscription link uses a secret, revocable per-user token (not a login).

### F5 — Complaints & mess
- Student submits a complaint (hostel/college/mess) with photo evidence (compressed client-side).
- Visible only to submitter + assignee + escalation chain.
- "Me too" on an existing open complaint (same location/category) instead of duplicate filing; feeds a simple recurring-issue detector (30-day threshold, not ML).
- SLA timer per complaint category; breach triggers escalation notification.
- Minimal mess module: menu + one-tap meal rating/skip (needed to support any "reduced food waste" claim).

### F6 — Targeted notices
- Sender scope enforced server-side (HOD → own department only, warden → own hostel only, etc.).
- Delivery: in-app + email are real; SMS/WhatsApp are behind an adapter with a **mock provider** for the demo (see ARCHITECTURE.md — real gateways need DLT template pre-approval in India and are out of scope for the hackathon).
- Configurable digest time (default 6 PM) + "run now" for demoing.
- SMS-simulator page proves the channel-agnostic request engine: typing `LEAVE 2 FEVER` hits the same API as the app, tagged `channel=sms`.

## 5. Non-functional requirements

- **Offline-first**: attendance marking and viewing cached data must work with no network; sync resumes automatically.
- **Multi-college ready**: every table carries `college_id`, even though the demo seeds one college.
- **i18n-ready**: all UI strings are translation keys from day one (en/hi/or now); backend never sends user-facing language-specific strings, only error codes.
- **Security**: see RULES.md — IDOR prevention, RBAC+scope, encrypted secrets, audited access, no client-side-only field hiding for recruiters.
- **Performance target**: usable on a low-end Android phone on 2G/3G-equivalent conditions.

## 6. Success metrics (targets, not measured facts — validate before quoting in the pitch)

| Metric | Target | Baseline needed |
|---|---|---|
| Time to raise/resolve a complaint | 3 days → 6 hours | Talk to 3–5 students/wardens |
| Admin time on leave/attendance paperwork | −40% | Talk to 3–5 faculty/HOD |
| Food waste (mess) | −15% | Needs the mess module actually deployed |
| Recruiter screening time per opportunity | Reduced vs. manual resume review | Not yet measured |

## 7. Out of scope for hackathon (explicitly deferred)

Features 4, 7, 8; badging system; ML-based risk prediction; blockchain certificate anchoring; WebAuthn; real SMS/WhatsApp gateways; Kubernetes/Grafana; languages beyond en/hi/or.

## 8. Related documents

ARCHITECTURE.md (system design) · RULES.md (security & coding rules) · PHASES.md (build order) · DESIGN.md (UI/UX) · MEMORY.md (decisions log) · README.md (setup)

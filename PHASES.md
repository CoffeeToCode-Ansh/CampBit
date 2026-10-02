# PHASES — Build Order

Four phases. Do not start a phase's "nice to have" items before the previous phase's core items are done and tested. Fill in dates/owners once team size and hackathon duration are known (see open question in README.md).

## Phase 0 — Foundation

**Goal:** an empty but real, secure, multi-language skeleton every later feature plugs into.

- [ ] PostgreSQL schema: `colleges`, `users` (with `college_id`, `role`), `departments`, `hostels` — everything tenant-scoped from the start.
- [ ] Auth: JWT access+refresh, argon2id, TOTP for staff, email-OTP for recruiter/reset. Login page → server-decided redirect by role.
- [ ] RBAC/scope guards (CASL) wired but minimal (deny-by-default).
- [ ] i18n skeleton: `react-i18next` wired, `en.json` populated, `hi.json`/`or.json` stubbed with English fallback, Noto fonts self-hosted.
- [ ] Empty role dashboards (student, faculty, HOD, principal, warden, placement officer) — just the shell + nav, no feature content yet.
- [ ] Seed script: 1 college, 2 departments, ~30 students, 5 faculty, 1 warden, 1 placement officer.
- [ ] Docker Compose running api + web + postgres + redis + minio locally.

**Exit criteria:** every role can log in and land on their own (empty) dashboard; a student cannot open a URL meant for another role and get data back.

## Phase 1 — Core

**Goal:** the request engine and the two features that prove the architecture (offline attendance, unified requests).

- [ ] Request engine: generic `requests` table + state machine (draft → pending → approved/rejected), config-driven approver chains.
- [ ] Leave request on the request engine, duration-based approver routing.
- [ ] Timetable (basic): view, HOD substitution/extra-class entry → auto-notice, `.ics` export with revocable token.
- [ ] Attendance: session generation from timetable, offline marking (Dexie), idempotent sync, "classes you can still miss" calculator.
- [ ] SMS-simulator page hitting `/requests` with `channel=sms` — the architecture's headline demo.

**Exit criteria:** faculty can mark attendance offline, go online, and it syncs correctly with no duplicates; a leave request submitted via the SMS simulator and via the app both appear identically in the approver's queue.

## Phase 2 — Feature build-out

**Goal:** complaints, notices, opportunities + recruiter view.

- [ ] Complaints: submit with photo (compressed client-side), scoped visibility, "me too," SLA timer (BullMQ), escalation email.
- [ ] Mess module (minimal): menu + one-tap rating/skip.
- [ ] Notices: scoped sending, in-app + email real; SMS/WhatsApp mock adapter with simulated-phone UI; configurable digest + "run now."
- [ ] Opportunities: placement officer posts, student applies, officer views applicants.
- [ ] Certificate hash + QR verify page.
- [ ] **Recruiter guest view**: invite flow, email-OTP login, masked applicant list scoped to one opportunity, contact-request → request engine → officer approval → student consent → time-limited release.
- [ ] `achievements` table created (evidence + status fields) even though badging UI is not built — prep for future.

**Exit criteria:** a full "student applies → recruiter shortlists (masked) → recruiter requests contact → student consents → officer releases" flow works end-to-end in a demo.

## Phase 3 — Security hardening, polish, demo prep

**Goal:** prove the security claims, not just make them.

- [ ] Negative-path tests: cross-student data access, cross-opportunity recruiter access, consent-bypass attempt — all must fail as designed (see RULES.md §10).
- [ ] OWASP ZAP baseline scan; triage findings.
- [ ] Lighthouse PWA audit; fix anything blocking installability/offline.
- [ ] Realistic demo data refresh; test on an actual low-end Android device.
- [ ] Record a backup video of the offline (airplane-mode) attendance flow, in case the live demo's network fails.
- [ ] Finalize pitch: KPIs labeled as targets (not measured facts) unless validated against real baseline conversations; roadmap slide for Features 4/7/8, badging, blockchain, ML, more languages.

**Exit criteria:** demo script rehearsed end-to-end at least twice, backup video in hand.

## Explicitly not a phase — future roadmap (do not build during the hackathon)

Features 4 (AI mentor), 7 (fees/payments), 8 (3D learning); badging UI + issuance flow; ML-based attendance risk prediction; blockchain certificate anchoring; WebAuthn; real SMS/WhatsApp gateway integration (DLT template approval takes time in India — plan for it post-hackathon); Kubernetes/Grafana; additional languages beyond en/hi/or.

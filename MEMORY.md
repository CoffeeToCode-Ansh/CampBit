# MEMORY — Decisions Log & Project Context

Purpose: a single place recording *why* things are the way they are, so anyone (teammate or AI coding assistant) picking this up mid-hackathon doesn't relitigate settled decisions or lose context. Append new entries at the top with a date; never delete old entries — strike through if reversed and say why.

## How to use this file

- Before proposing an architectural change, check here first — it may have already been decided and rejected for a reason.
- When you make a non-obvious decision, add an entry: what was decided, what the alternative was, why this one won.
- Keep entries short. This is a decisions log, not a diary.

---

## Decisions log

**Recruiter access model** — Guest login (invite + email-OTP), masked profile, contact only via placement-officer-gated request-with-consent. *Rejected alternative:* a public shareable student profile link. *Why:* the request/consent flow reuses the existing request engine (no new subsystem), gives students visible control ("who viewed my profile"), and is a stronger privacy story for the pitch.

**Badging system** — Deferred to post-hackathon, but the `achievements` table (with `evidence`, `status` fields) is built in Phase 2 anyway. *Why:* building the data model now costs almost nothing and means badging is a UI layer later, not a schema migration under time pressure. *Hard rule carried forward:* no badge without verified evidence — enforced at the DB level, not just app logic (see RULES.md §4).

**Offline sync mechanism** — Dexie/IndexedDB + idempotent queue, not Yjs/CRDT. *Why:* attendance is one record per (session, student) — there's no concurrent free-text merge problem CRDTs solve. CRDTs were in the original idea doc but add complexity with no matching need.

**Backend services** — NestJS only for the prototype; FastAPI deferred until real ML work starts. *Why:* original idea doc had both from day one; running two backend frameworks for a hackathon team is unnecessary overhead before any ML feature is actually being built.

**SMS/WhatsApp notifications** — Mock provider (simulated phone screen in-app) for the demo; real gateway integration deferred. *Why:* real SMS in India requires DLT-registered templates (regulatory approval, not just an API key) and WhatsApp Business requires template verification — neither fits a hackathon timeline. The mock still proves the channel-agnostic request-engine architecture via the SMS-simulator page.

**Attendance risk calculation** — Deterministic formula `N = floor(attended / 0.75 − held)`, not ML. *Why:* it's the actual thing being asked ("how many can I miss"), ML would be unverifiable in a demo and adds no value here. ML-based prediction is future work. *Open item:* confirm the 75% attendance requirement against the real college rule before the demo — do not assume.

**Certificate verification** — SHA-256 hash + public QR verify page, not blockchain. *Why:* blockchain (Polygon) was in the original idea doc; a hash+QR gives the same tamper-evidence property for a hackathon demo with none of the infra. Blockchain anchoring is future work if the hash approach needs stronger guarantees later.

**Multi-college design (`college_id` everywhere)** — Decided even though only one college is seeded for the demo. *Why:* BPUT has many affiliated colleges; retrofitting tenancy later is expensive, adding the column/filter now is cheap.

**Auth for staff vs. students vs. recruiters** — TOTP mandatory for staff/admin; email-OTP for recruiters and password resets; WebAuthn deferred. *Why:* WebAuthn was in the original idea doc as a stretch; it adds real implementation complexity for a prototype and isn't the security risk being demonstrated (IDOR is).

**Names hidden by default in recruiter view ("blind mode")** — Default on, configurable. *Why:* supports the bias-reduction/fairness narrative; easy to flip to "names visible" as a setting if the team decides otherwise before the demo — **flag this as an open decision for the team**, not fully final.

---

## Open questions (not yet decided — resolve and move to the log above)

- Hackathon duration and team size (blocks finalizing PHASES.md timeline/owners).
- Should recruiter "blind mode" (no name/photo) be the fixed behavior or an admin-configurable toggle?
- Exact SLA durations per complaint category (hostel vs. academic vs. mess) — placeholder values are in the code, need real numbers from the college.
- Confirm the 75% minimum-attendance rule (or whatever the actual BPUT rule is) before the "classes you can miss" calculator ships.
- Does the pitch need real baseline numbers before quoting KPI targets (3 days→6 hours, −40% admin time, −15% food waste)? Currently unvalidated — see PRD.md §6.

## Glossary

- **IDOR/BOLA** — Insecure Direct Object Reference / Broken Object-Level Authorization: the vulnerability class this project's security model is specifically designed against (one user reaching another user's data by guessing/changing an ID).
- **Request engine** — the single generic subsystem (state machine + config-driven approver chains) powering leave, complaints, gate-pass (future), and recruiter contact-requests.
- **Channel-agnostic** — the architectural property that the request engine doesn't care whether a request arrived via the app or via the SMS-simulator; same API, same validation, same approval flow.
- **Blind mode** — the recruiter guest view's default state where name/photo/gender are hidden and only role-relevant fields (branch, CGPA, skills, verified achievements) are shown.

## Related documents

PRD.md (what & why) · ARCHITECTURE.md (how it's built) · RULES.md (constraints that must hold) · PHASES.md (build order) · DESIGN.md (how it should look) · README.md (how to run it)

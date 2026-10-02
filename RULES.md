# RULES — BPUT Campus Super-App

These are hard rules for this codebase, not suggestions. If a PR violates one, fix it before merging — don't merge with a "TODO: fix security later."

## 1. The one rule that matters most

**No endpoint may trust an ID from the client to decide whose data to return.** The primary threat this project defends against is IDOR/BOLA (a student reading another student's data, or reaching admin data). Every rule below exists to serve this one.

- Use `/me/attendance`, `/me/requests`, not `/students/:id/attendance`.
- Where an ID-in-path is unavoidable (e.g., a HOD viewing a specific student), the server must independently verify the caller's role AND scope (same department/hostel/college) before returning anything — never just check "is logged in."
- Every new endpoint's PR description must state: *who is allowed to call this, and what scope check enforces it.*

## 2. AuthN / AuthZ

- Passwords: argon2id only. Never MD5/SHA1/plain.
- Tokens: short-lived access token (10–15 min) + rotating refresh token in an HttpOnly, Secure, SameSite cookie. Never store tokens in `localStorage`.
- TOTP mandatory for all staff/admin roles. Email-OTP mandatory for recruiter guest login and for password reset.
- Login errors are generic ("invalid credentials"), never "user not found" vs "wrong password." Rate-limit and lock out after repeated failures; CAPTCHA after N attempts.
- Admin routes (`/admin/*`) sit behind a separate, stricter guard — a compromised student token must not reach them even hypothetically.
- Role + scope checks use a policy layer (CASL) — do not hand-roll `if (user.role === 'hod')` checks scattered through controllers.

## 3. Recruiter access — specific rules

- Recruiter-facing API responses are built from a **dedicated serializer**, never the same object used for admin/student views with fields "hidden in the frontend." If it's not supposed to be visible, it must not leave the server.
- No bulk export/download endpoints exist for the recruiter role, at all.
- Rate-limit profile views per recruiter session (anti-scraping).
- Every recruiter profile view and contact-request is logged (`who, what, when`) and is visible to the student in their own "who viewed my profile" list.
- Contact details / resume are only ever returned via a **time-limited signed link**, only after: placement officer approval AND recorded student consent. No code path skips consent, including admin "quick approve" shortcuts.
- Recruiter access to an opportunity auto-expires (closing date + configurable grace period) — write this as a scheduled job, not a manual admin task.

## 4. Badging — specific rules (build when this feature is picked up)

- **No proof, no badge**, enforced at the database level: a badge-award row requires a foreign key to an `achievements` row with `status = 'verified'` and a non-null evidence reference. The insert must fail without it — this cannot be an app-layer-only check.
- Maker-checker: the person who verifies an achievement's evidence may not be the same person who issues the badge for it, and a person may not verify/issue their own achievement.
- Badge types come from a fixed, published catalogue. No ad-hoc badge creation without a catalogue change (which itself needs Principal-level approval).

## 5. Data handling

- Files: validate MIME type + size server-side (never trust the client's declared type); strip EXIF (GPS) from uploaded photos.
- All file access via short-lived presigned URLs with a per-request permission check — never a public bucket.
- Input validation on every endpoint via `class-validator`/Zod DTOs — nothing raw from `req.body` reaches a query.
- All DB access via the ORM's parameterized queries — string-built SQL is banned, no exceptions.
- Rich text (notices, complaints) is sanitized before storage and before render (XSS).
- Audit log (append-only) for: profile views by non-owners, data exports (if any), badge issuance, consent decisions, admin role changes.

## 6. Offline / device hygiene

- Server accepts attendance sync only from the teacher assigned to that session, and only within a defined edit window (e.g., same day + N hours) — prevents replay/backdating abuse.
- All local (Dexie/IndexedDB) data is cleared on logout — required because devices may be shared.

## 7. Web hygiene (baseline, non-negotiable)

Helmet, CSP, CORS allowlist (no `*`), `@nestjs/throttler` on all public endpoints, HTTPS only in any deployed environment, secrets only via environment variables (`.env` is git-ignored, never committed — check `git log` before every push if unsure).

## 8. i18n rules

- No hardcoded UI strings in components — every string is a translation key from day one, even before Hindi/Odia copy exists (use the English string as a placeholder value under the key).
- Backend returns error **codes**, never sentences, so the frontend can translate.
- Don't auto-translate user-generated content; offer explicit optional-language fields instead.

## 9. Coding conventions

- Backend: NestJS module-per-domain (`auth`, `attendance`, `requests`, `complaints`, `notices`, `opportunities`). Guards and DTOs live with their module.
- Frontend: routes are role-guarded and code-split by role dashboard. This is a UX/perf aid — it is **not** a security boundary; the API must independently enforce everything.
- Commits: Conventional Commits (`feat:`, `fix:`, `sec:`, `docs:`, `chore:`). Use `sec:` for anything security-relevant so it's easy to find in history.
- Every PR touching auth, an admin endpoint, or the recruiter/badging flow needs at least one test proving the negative case (wrong user gets 403/404), not just the happy path.

## 10. Testing bar for the demo

Before the hackathon demo, these must pass, minimum:
- Student A cannot read Student B's attendance, leave, requests, or files (403/404).
- A recruiter for Opportunity A cannot open an applicant of Opportunity B, or any non-applicant.
- An expired recruiter invite cannot log in.
- A contact-info release without recorded student consent is impossible (test should try to force it and fail).
- One OWASP ZAP baseline scan run, findings triaged (not necessarily all fixed, but documented).

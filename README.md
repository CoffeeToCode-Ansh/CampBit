# BPUT Campus Super-App

An offline-first campus PWA for BPUT-affiliated colleges: one login, role-specific dashboards (student, faculty, HOD, principal, warden, placement officer), attendance, leave, timetable, hostel/campus complaints, targeted notices, and a placement module with a privacy-first recruiter guest view — in English, Hindi, and Odia.

Built for a hackathon prototype. Scope is intentionally narrow — see [`PRD.md`](./PRD.md) for exactly what's in and out.

## Start here

| Read this... | ...to understand |
|---|---|
| [`PRD.md`](./PRD.md) | What we're building, for whom, and what's explicitly out of scope |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, system design, the request-engine pattern, offline sync, multi-tenancy |
| [`RULES.md`](./RULES.md) | Non-negotiable security and coding rules — read before your first PR |
| [`PHASES.md`](./PHASES.md) | Build order — what to build first, second, third |
| [`DESIGN.md`](./DESIGN.md) | Visual language, layout patterns, role-specific screens |
| [`MEMORY.md`](./MEMORY.md) | Decisions log — why things are the way they are; open questions |

## The one-sentence architecture pitch

Leave, complaints, and recruiter contact-requests all run through **one generic, channel-agnostic request engine** — an SMS-style request and an in-app request hit the same API, get the same validation, and follow the same config-driven approval chain.

## Core design commitments (don't relitigate these mid-build — see MEMORY.md)

- **Security-first**: the specific threat this app defends against is a student or admin reaching another user's data (IDOR/BOLA). Every endpoint decides identity from the auth token, never from a client-supplied ID.
- **Offline-first**: attendance and core views work with no network; sync is idempotent.
- **i18n-first**: all strings are translation keys from day one, even before Hindi/Odia copy exists.
- **Multi-college ready**: every table carries `college_id`, even though the demo seeds one college.
- **Recruiter privacy**: recruiters get a masked, invite-only, scoped view; contact only happens through the placement officer with recorded student consent.

## Tech stack

**Frontend** — React + Vite, Tailwind, Workbox (PWA), react-i18next, TanStack Query, Dexie
**Backend** — NestJS
**Database** — PostgreSQL
**Cache/Queue** — Redis + BullMQ
**Object storage** — MinIO
**Auth** — JWT + argon2id + TOTP (staff) + email-OTP (recruiters/reset)
**Hosting** — Docker Compose → Render/Railway

Full rationale for every choice (and what was deferred, and why) is in `ARCHITECTURE.md` and `MEMORY.md`.

## Getting started (prototype)

```bash
# clone and configure
git clone <repo-url>
cd bput-campus-superapp
cp .env.example .env        # fill in secrets — never commit .env

# run everything
docker compose up --build

# seed demo data (1 college, 2 depts, ~30 students, 5 faculty, 1 warden, 1 placement officer)
docker compose exec api npm run seed
```

- Web app: `http://localhost:5173`
- API: `http://localhost:3000`
- MinIO console: `http://localhost:9001`

> Exact scripts/commands will firm up as Phase 0 (see `PHASES.md`) is built — update this section as the real `package.json` scripts land.

## Contributing

1. Read `RULES.md` before writing any auth, admin, recruiter, or file-handling code.
2. Follow the build order in `PHASES.md` — don't start Phase 2 features before Phase 1's core (request engine + offline attendance) is working and tested.
3. Commit style: Conventional Commits (`feat:`, `fix:`, `sec:`, `docs:`, `chore:`).
4. Any PR touching auth, an admin endpoint, or the recruiter/badging flow needs a test proving the *negative* case (wrong user → 403/404), not just the happy path.
5. Made a non-obvious decision? Add it to `MEMORY.md`.

## Feature status (see PRD.md for full detail)

| Feature | Status |
|---|---|
| Login + role dashboards | In scope |
| Attendance (offline) + leave | In scope |
| Timetable | In scope (basic) |
| Complaints + mess | In scope |
| Notices | In scope |
| Opportunities + recruiter guest view | In scope |
| Badging system | Future (schema prepped now) |
| AI mentor, fee payments, 3D learning | Future |

## Open questions

Hackathon duration and team size aren't fixed yet, which blocks finalizing owners/dates in `PHASES.md`. See `MEMORY.md` → Open questions for the full list.

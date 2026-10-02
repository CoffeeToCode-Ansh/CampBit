# DESIGN — UI/UX Guidelines

## 1. Design principles

1. **Works on a cracked-screen Android phone on bad network.** Design for the low-end case, not the demo laptop.
2. **Role clarity over cleverness.** A HOD dashboard should look obviously different from a student dashboard at a glance, not just have different menu items.
3. **Trust is visual.** Recruiters, students, and admins all need to *see* the privacy/security guarantees (masked badges, "verified" marks, "who viewed your profile"), not just be told about them in a privacy policy nobody reads.
4. **Three languages, one layout.** No layout should assume English text lengths — Hindi and Odia strings run longer.

## 2. Visual language

| Token | Value | Use |
|---|---|---|
| Primary (Navy) | `#1F3864` | Headers, primary nav, key actions |
| Accent (Blue) | `#2E75B6` | Links, secondary actions, active states |
| Success | `#2E7D32` | Approved, verified, present |
| Warning | `#B26A00` | Pending, SLA nearing breach |
| Danger | `#C62828` | Rejected, absent, overdue |
| Neutral bg | `#F2F6FB` | Card backgrounds, table stripes |
| Font | Inter / system-ui (Latin), **Noto Sans Devanagari** (Hindi), **Noto Sans Oriya** (Odia) | Self-hosted, all three preloaded |

Keep the palette this small. Role dashboards differentiate through **layout and content**, not different color schemes per role (that gets confusing fast with 6+ roles).

## 3. Layout patterns

- **App shell**: left nav (role-specific items only — a student never even sees a grayed-out "Approve Leave" link), top bar with language switcher + notification bell + profile.
- **Dashboards**: card-grid summary at top (e.g., attendance %, open complaints, pending requests) + a primary list/table below. Every dashboard should answer "what needs my attention right now" in the first screen, no scrolling.
- **Forms**: single column, large touch targets (44px min), inline validation, autosave to Dexie for anything that might be filled offline (e.g., a complaint drafted with no signal).
- **Tables** (attendance, applicant lists): must scroll horizontally within their own container on mobile, never force the page to scroll sideways.

## 4. Language switching

- Switcher always visible in the top bar (flag-free — use text: "EN · हिं · ଓଡ଼ି").
- Switching language must not require a page reload or a login; state updates in place.
- Never mix languages within one sentence — a string is either fully translated or falls back fully to English, never a code-switched half-string.

## 5. Role-specific screens

### Student dashboard
Attendance ring/%, "classes you can still miss" number front and center, upcoming classes, open requests, latest 3 notices, quick-apply for open opportunities.

### Faculty dashboard
Today's sessions to mark, pending leave approvals (if mentor), quick complaint-raise.

### HOD / Principal dashboard
Department/college attendance shortage list, pending approvals queue, notice composer scoped to their level, analytics summary (simple bar/number cards, not a full BI tool for the prototype).

### Warden / Placement officer (non-teaching)
Warden: complaint queue with SLA countdown chips (green/amber/red).
Placement officer: opportunities list, applicant counts, **recruiter contact-request queue** (needs a clearly distinct visual treatment — this queue has a person's consent riding on it, so give it its own section, not buried in a generic "requests" list).

### Recruiter guest view
Deliberately restrained: a table of masked applicants (anonymous ID, key fields, "verified" badges shown as small check-mark chips), a shortlist toggle, and one clear CTA per applicant: **"Request contact."** No resume preview, no download button anywhere on this screen — their absence is itself a design statement worth calling out in the demo.

### Student "who viewed my profile" panel
A simple reverse-chronological list: company name, opportunity, date viewed. This single screen does a lot of work for your privacy pitch — don't skip it for time.

## 6. States every screen needs

- **Offline banner**: a persistent, non-intrusive strip when the app detects no connectivity ("You're offline — changes will sync automatically"), not a blocking modal.
- **Sync status**: small indicator on attendance/complaint screens showing "2 items pending sync."
- **Empty states**: every list (notices, complaints, requests) needs a real empty-state illustration/message, not a blank white box — this is what judges see first on a freshly seeded demo account if you're not careful.
- **Verified badge chip**: small, consistent visual (checkmark + "Verified by college") reused across achievements, certificates, and future badges — one component, many places.

## 7. Accessibility baseline

Minimum contrast AA, all interactive elements reachable by keyboard/tab order, form errors announced (not color-only), touch targets ≥44px, no information conveyed by color alone (pair SLA colors with icons/text too).

## 8. What to skip for the hackathon

Dark mode, animation/motion polish beyond basic transitions, a full design system/component library — reuse 2–3 layouts across all dashboards rather than building bespoke screens per role.

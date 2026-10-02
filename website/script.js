/* =============================================================================
   COLLEGE CONNECT  -  app script (readable rewrite)
   -----------------------------------------------------------------------------
   One app for Students, Staff and Admin. Everything runs in the browser with
   demo data. Same behaviour as the original minified file, only reorganised.

   TABLE OF CONTENTS
    1. Admin configuration (social links)
    2. Small helpers (DOM, escaping, dates, storage)
    3. Theme (light / dark)
    4. Core demo data (attendance, fees, notices, scholarships)
    5. Timetable data + rendering (student & staff)
    6. Holidays
    7. Leave (student & staff)
    8. Staff + Admin dashboards / profile
    9. Login screen + role switcher + tabs + page switching
   10. Results
   11. About / Anonymous complaint box / bottom sheet
   12. Attendance (student calculator + faculty marking with offline queue)
   13. Opportunities
   14. Complaints (student)
   15. Mess
   16. Languages (English / Hindi / Odia)
   17. Students, Staff members, Achievements (admin / teacher tools)
   18. Complaints (admin) + Admin home
   19. Notices + Holidays (teacher / admin) + Issue reports
   20. Inline editing (notices, students, staff, achievements, holidays)
   21. Timetable views (week / day)
   22. Main render function (draws every page)
   23. Navigation (tabs, swipe, keyboard)
   24. Global click handler
   24b. Notifications, new-notice dot, live clock, login-box effects
   25. Start-up + sign in / sign out
   ============================================================================= */


/* =============================================================================
   1. ADMIN CONFIGURATION
   ============================================================================= */

/* ADMIN: paste your social media links between the quotes (keep the https://).
   Empty ones show as "Link not added yet". */
const SOCIAL = {
  website: "",
  instagram: "",
  facebook: "",
  youtube: "",
  x: "",
  linkedin: ""
};


/* =============================================================================
   2. SMALL HELPERS
   ============================================================================= */

// Shortcut for document.getElementById
const $ = id => document.getElementById(id);

// Current login role: 'student' | 'staff' | 'admin' (kept in sessionStorage)
const getRole = () => {
  try { return sessionStorage.getItem('cc_role') || 'student'; }
  catch (e) { return 'student'; }
};

// Escape text before putting it inside HTML (prevents broken markup / injection)
const escapeHtml = value =>
  String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Name of the signed-in user (escaped, safe for HTML)
const displayName = () => {
  let name = 'Student';
  try {
    name = sessionStorage.getItem('cc_user') ||
      (getRole() === 'staff' ? 'Staff' : getRole() === 'admin' ? 'Admin' : 'Student');
  } catch (e) {}
  return escapeHtml(name);
};

// Same name but NOT escaped (used when storing who did something)
const userName = () => {
  try { return sessionStorage.getItem('cc_user') || 'Student'; }
  catch (e) { return 'Student'; }
};

// True for teachers and admins (people who can post notices/holidays etc.)
const isStaffOrAdmin = () => getRole() === 'staff' || getRole() === 'admin';

// localStorage JSON helpers (never throw)
const loadJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
};
const saveJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
};

// Numbers & money
const percent = (part, total) => Math.round(part / total * 100);
const formatRupees = n => '₹' + n.toLocaleString('en-IN');

// Dates
const todayIso = () => new Date().toLocaleDateString('en-CA');                       // 2026-10-02
const formatDate = iso => new Date(iso + 'T00:00:00')
  .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });                   // 2 Oct
const countDays = (from, to) => Math.round((new Date(to) - new Date(from)) / 864e5) + 1;

// Minutes since midnight -> "9:30 AM"
const formatMinutes = m => {
  const h = Math.floor(m / 60), ampm = h >= 12 ? 'PM' : 'AM';
  return (h % 12 || 12) + ':' + String(m % 60).padStart(2, '0') + ' ' + ampm;
};

// A valid link must start with http:// or https://
const isValidUrl = u => /^https?:\/\/\S+$/i.test(u || '');

// Small green message box shown after an action succeeds
const successBox = msg =>
  msg ? `<div class="item" style="margin-bottom:14px;border-color:#15803d">${msg}</div>` : '';


/* =============================================================================
   3. THEME (light / dark)
   ============================================================================= */

// Dark if user chose dark, or if nothing chosen and the device prefers dark
const isDark = () => {
  const root = document.documentElement;
  return root.dataset.theme === 'dark' ||
    (!root.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
};

// Update the sun / moon icon on every theme button
function updateThemeIcons() {
  const dark = isDark();
  document.querySelectorAll('[data-tt]').forEach(btn => {
    btn.textContent = dark ? '☀️' : '🌙';
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  });
}

// Flip the theme and remember the choice.
// The new theme sweeps over the screen with a soft edge: downwards when going
// dark (night falls), upwards when going light (sunrise). The motion itself
// is CSS (section 18 of style.css). Browsers without View Transitions, and
// people who prefer reduced motion, just get an instant switch.
function toggleTheme() {
  const root = document.documentElement;
  const next = isDark() ? 'light' : 'dark';
  const apply = () => {
    root.dataset.theme = next;
    try { localStorage.setItem('cc_theme', next); } catch (e) {}
    updateThemeIcons();
  };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || calm || root.classList.contains('theme-anim')) { apply(); return; }

  root.dataset.swap = next;                            // tells the CSS which way to sweep
  root.classList.add('theme-anim');                    // pauses colour fades so the snapshot is exact
  const transition = document.startViewTransition(apply);
  transition.finished.finally(() => { root.classList.remove('theme-anim'); delete root.dataset.swap; });
}

// Apply saved theme on load
try {
  const saved = localStorage.getItem('cc_theme');
  if (saved) document.documentElement.dataset.theme = saved;
} catch (e) {}
updateThemeIcons();


/* =============================================================================
   4. CORE DEMO DATA
   ============================================================================= */

const appData = {
  // [subject, total classes held, classes attended]
  attendance: [
    ["Data Structures", 42, 36],
    ["Mathematics III", 40, 34],
    ["Digital Electronics", 38, 27],
    ["English Communication", 30, 28],
    ["DBMS Lab", 24, 23]
  ],
  // [name, amount, paid? (1/0), date text]
  fees: [
    ["Tuition – Semester 3", 25000, 1, "10 Aug 2026"],
    ["Hostel & Mess", 12500, 0, "15 Oct 2026"],
    ["Exam Fee", 3500, 0, "30 Oct 2026"],
    ["Library & Lab", 2000, 1, "10 Aug 2026"]
  ],
  // [category, title, date, message, audience?, postedBy?, editedBy?]
  notices: [
    ["Exam", "Mid-semester timetable released", "28 Sep", "Exams begin 12 Oct. Full timetable is at the Exam Cell."],
    ["Fee", "Hostel fee last date extended", "27 Sep", "Pay by 15 Oct to avoid a late fine."],
    ["Event", "Annual Tech Fest registrations open", "25 Sep", "Register teams at the Student Council desk."],
    ["Exam", "Practical exam slots for DBMS Lab", "24 Sep", "Slots are allotted by roll number."],
    ["Event", "Blood donation camp on Friday", "22 Sep", "Main auditorium, 10 AM to 4 PM."]
  ],
  // [name, amount, eligibility, last date]
  scholarships: [
    ["Merit Scholarship", "₹20,000 / year", "Minimum 8.0 CGPA", "31 Oct 2026"],
    ["Need-Based Aid", "₹15,000 / year", "Family income below ₹3 LPA", "15 Nov 2026"],
    ["Girl Child Support", "₹10,000 / year", "Female students", "20 Nov 2026"],
    ["Sports Excellence", "₹12,000 / year", "State-level players", "05 Dec 2026"]
  ],
  appliedScholarships: {},   // { index: true }
  tab: "home"                // currently open tab
};

// Tabs shown in the top menu for each role: [page id, label]
const STUDENT_TABS = [
  ["home", "Home"], ["timetable", "Timetable"], ["attendance", "Attendance"], ["results", "Results"],
  ["fees", "Fees"], ["notices", "Notices"], ["holidays", "Holidays"], ["scholarships", "Scholarships"],
  ["opps", "Opportunities"], ["achievements", "Achievements"], ["leave", "Leave"],
  ["complaints", "Complaints"], ["mess", "Mess"], ["profile", "Profile"]
];
const STAFF_TABS = [
  ["home", "Home"], ["timetable", "Timetable"], ["attendance", "Attendance"], ["students", "Students"],
  ["achievements", "Achievements"], ["notices", "Notices"], ["holidays", "Holidays"],
  ["complaints", "Complaints"], ["leave", "Leave"], ["profile", "Profile"]
];
const ADMIN_TABS = [
  ["home", "Home"], ["students", "Students"], ["staff", "Staff"], ["achievements", "Achievements"],
  ["complaints", "Complaints"], ["notices", "Notices"],["leave", "Leave"], ["holidays", "Holidays"], ["profile", "Profile"]
];
const currentTabs = () =>
  getRole() === 'staff' ? STAFF_TABS : getRole() === 'admin' ? ADMIN_TABS : STUDENT_TABS;

// Attendance helpers
const overallAttendance = () => {
  let present = 0, total = 0;
  appData.attendance.forEach(row => { present += row[2]; total += row[1]; });
  return percent(present, total);
};

// Fees helpers
const totalFeesDue = () =>
  appData.fees.filter(f => !f[2]).reduce((sum, f) => sum + f[1], 0);


/* =============================================================================
   5. TIMETABLE DATA + RENDERING
   ============================================================================= */

// Class periods as [start minute, end minute]
const PERIOD_SLOTS = [[540, 600], [600, 660], [690, 750], [840, 900], [900, 960]];

// Subjects: [name, room, teacher]
const SUBJ_DS = ["Data Structures", "Room 204", "Dr. A. Mishra"];
const SUBJ_MATHS = ["Mathematics III", "Room 108", "Prof. S. Das"];
const SUBJ_DE = ["Digital Electronics", "Room 210", "Dr. R. Patra"];
const SUBJ_ENG = ["English Communication", "Room 105", "Ms. L. Roy"];
const SUBJ_OS = ["Operating Systems", "Room 204", "Dr. K. Sahu"];
const SUBJ_ACTIVITY = ["Sports / Club Hour", "Ground", "Activity"];

// A timetable row is: [start, end, title, place, extra info, type]
// Lecture in a given period (0-4)
const lecture = (period, subject, type) =>
  [PERIOD_SLOTS[period][0], PERIOD_SLOTS[period][1], subject[0], subject[1], subject[2], type || 'Lecture'];
// Two-hour lab from 2 PM to 4 PM
const lab = (name, room, teacher) => [840, 960, name, room, teacher, 'Lab'];

// Student weekly timetable
const STUDENT_WEEK = {
  Mon: [lecture(0, SUBJ_DS), lecture(1, SUBJ_MATHS), lecture(2, SUBJ_DE), lab("DBMS Lab", "Lab 3", "Ms. P. Nayak")],
  Tue: [lecture(0, SUBJ_OS), lecture(1, SUBJ_DS), lecture(2, SUBJ_ENG), lecture(3, SUBJ_MATHS)],
  Wed: [lecture(0, SUBJ_MATHS), lecture(1, SUBJ_DE), lecture(2, SUBJ_OS), lab("Electronics Lab", "Lab 2", "Mr. B. Sahoo")],
  Thu: [lecture(0, SUBJ_DS), lecture(1, SUBJ_ENG), lecture(2, SUBJ_MATHS), lecture(3, SUBJ_OS)],
  Fri: [lecture(0, SUBJ_DE), lecture(1, SUBJ_OS), lecture(2, SUBJ_DS), lab("DBMS Lab", "Lab 3", "Ms. P. Nayak")],
  Sat: [lecture(0, SUBJ_ENG), lecture(1, SUBJ_MATHS), lecture(2, SUBJ_ACTIVITY, 'Activity')]
};

// Staff row builder (same layout as above)
const staffSlot = (start, end, title, place, extra, type) =>
  [start, end, title, place, extra, type || 'Lecture'];

// Staff weekly timetable
const STAFF_WEEK = {
  Mon: [staffSlot(540, 600, "Data Structures", "Room 204", "CSE Sem 3 · A"),
        staffSlot(690, 750, "Data Structures", "Room 301", "CSE Sem 5 · B"),
        staffSlot(840, 960, "Programming Lab", "Lab 1", "CSE Sem 1 · C", "Lab")],
  Tue: [staffSlot(600, 660, "Data Structures", "Room 204", "CSE Sem 3 · A"),
        staffSlot(690, 750, "Algorithms", "Room 305", "CSE Sem 5 · B")],
  Wed: [staffSlot(540, 600, "Algorithms", "Room 305", "CSE Sem 5 · B"),
        staffSlot(600, 660, "Data Structures", "Room 204", "CSE Sem 3 · A"),
        staffSlot(840, 900, "Mentor meeting", "Staff room", "Sem 3 mentees", "Meeting")],
  Thu: [staffSlot(540, 600, "Data Structures", "Room 204", "CSE Sem 3 · A"),
        staffSlot(690, 750, "Algorithms", "Room 305", "CSE Sem 5 · B"),
        staffSlot(840, 960, "Programming Lab", "Lab 1", "CSE Sem 1 · C", "Lab")],
  Fri: [staffSlot(540, 600, "Algorithms", "Room 305", "CSE Sem 5 · B"),
        staffSlot(690, 750, "Data Structures", "Room 204", "CSE Sem 3 · A")],
  Sat: [staffSlot(540, 600, "Department meeting", "Seminar hall", "All faculty", "Meeting")]
};

// Which timetable to use for the signed-in role
const currentWeek = () => getRole() === 'staff' ? STAFF_WEEK : STUDENT_WEEK;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Today's day name (or the demo day when the staff "simulate class" demo is on)
const currentDayName = () => simDay || DAY_NAMES[new Date().getDay()];

// Full list for a day: classes + automatic short break and lunch break, sorted by time
function getFullDay(day) {
  const rows = (currentWeek()[day] || []).slice();
  if (rows.length) {
    rows.push([660, 690, "Short break", "Canteen", "", "Break"]);
    if (rows.some(r => r[0] >= 840)) rows.push([750, 840, "Lunch break", "Canteen", "", "Break"]);
  }
  return rows.sort((a, b) => a[0] - b[0]);
}

// One row of the vertical timeline. status = 'done' | 'now' | 'up' | undefined
function slotHtml(row, status) {
  const isBreak = row[5] === 'Break';
  const label = status ? { done: 'Done', now: 'Live', up: 'Upcoming' }[status] : row[5];

  // Staff can tap a running lecture/lab to jump to attendance marking
  const canTakeAttendance = status === 'now' && getRole() === 'staff' &&
    (row[5] === 'Lecture' || row[5] === 'Lab');
  const takeAttrs = canTakeAttendance
    ? ` data-take="${escapeHtml(row[2] + ' · ' + row[4])}" role="button" tabindex="0" style="cursor:pointer"`
    : '';

  return `<div class="slot ${status || ''} ${isBreak ? 'brk' : ''}">` +
    `<div class="tm">${formatMinutes(row[0])}<small>${formatMinutes(row[1])}</small></div>` +
    `<div class="dot"></div>` +
    `<div class="info"${takeAttrs}>` +
      `<div class="top"><b>${row[2]}</b><span class="badge ${status === 'now' ? 'ok' : ''}">${isBreak ? 'Break' : label}</span></div>` +
      `<p>${row[3]}${row[4] ? ' · ' + row[4] : ''}</p>` +
      (canTakeAttendance ? '<p style="color:var(--blue);font-weight:600">👆 Tap to take attendance</p>' : '') +
    `</div></div>`;
}

// "Today's timetable" card (used on Home pages)
function renderTodayTimetable() {
  const now = new Date();
  const nowMin = nowMinutes();
  const rows = getFullDay(currentDayName());
  const classes = rows.filter(r => r[5] !== 'Break');
  const current = classes.find(r => nowMin >= r[0] && nowMin < r[1]);
  const next = classes.find(r => r[0] > nowMin);

  // One-line summary at the top of the card
  const summary = !classes.length ? 'No classes today. Enjoy your day 😊'
    : current ? `Now: <b>${current[2]}</b> · ${current[3]}`
    : next ? `Next: <b>${next[2]}</b> at ${formatMinutes(next[0])} · ${next[3]}`
    : 'All classes done for today 🎉';

  const demoButton = getRole() === 'staff'
    ? `<button class="btn ghost sm" data-sim type="button">${simTime === null ? 'Demo: simulate class' : 'Stop demo'}</button>`
    : '';

  return `<div class="ttcard">` +
    `<div class="top"><div>` +
      `<b style="font-size:18px">Today's timetable</b>` +
      `<div class="sub" style="margin:2px 0 0">${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} · ${classes.length} classes</div>` +
    `</div>` +
    `<div class="btns" style="gap:6px"><button class="btn ghost sm" data-go="timetable">Full week</button>${demoButton}</div></div>` +
    `<div class="next">${summary}</div>` +
    `<div class="tl">` +
      rows.map(r => slotHtml(r, nowMin >= r[1] ? 'done' : nowMin >= r[0] ? 'now' : 'up')).join('') +
    `</div></div>`;
}


/* =============================================================================
   6. HOLIDAYS
   ============================================================================= */

const HOLIDAY_YEAR = 2026;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                     'August', 'September', 'October', 'November', 'December'];

// [month index (0 = Jan), day, name, type]
const HOLIDAYS = [
  [0, 14, "Makar Sankranti", "Festival"], [0, 23, "Vasant Panchami (Saraswati Puja)", "Odisha"],
  [0, 26, "Republic Day", "National"], [1, 15, "Maha Shivaratri", "Festival"],
  [2, 4, "Holi (Dola Purnima)", "Festival"], [2, 21, "Eid-ul-Fitr", "Festival"],
  [2, 26, "Ram Navami", "Festival"], [3, 1, "Utkal Dibas (Odisha Day)", "Odisha"],
  [3, 3, "Good Friday", "Festival"], [3, 14, "Ambedkar Jayanti", "National"],
  [3, 14, "Maha Vishuba Sankranti (Odia New Year)", "Odisha"], [4, 1, "May Day / Buddha Purnima", "National"],
  [4, 27, "Eid-ul-Adha", "Festival"], [5, 26, "Muharram", "Festival"],
  [6, 16, "Rath Yatra", "Odisha"], [7, 15, "Independence Day", "National"],
  [7, 26, "Milad-un-Nabi", "Festival"], [8, 4, "Janmashtami", "Festival"],
  [8, 14, "Ganesh Chaturthi", "Festival"], [9, 2, "Gandhi Jayanti", "National"],
  [9, 20, "Dussehra (Durga Puja)", "Odisha"], [10, 8, "Diwali (Kali Puja)", "Odisha"],
  [10, 24, "Kartika Purnima / Guru Nanak Jayanti", "Odisha"], [11, 25, "Christmas", "National"]
];

let holidayFilter = 'All';   // All | National | Odisha | Festival | College

// Holiday list grouped by month, with a "next holiday" card on top
function renderHolidays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Days from today until a holiday (negative = already passed)
  const daysUntil = h => Math.round((new Date(HOLIDAY_YEAR, h[0], h[1]) - today) / 864e5);
  const nextHoliday = HOLIDAYS.find(h => daysUntil(h) >= 0);
  const list = HOLIDAYS.filter(h => holidayFilter === 'All' || h[3] === holidayFilter);

  let out = `<h2>Holidays ${HOLIDAY_YEAR}</h2><p class="sub">${HOLIDAYS.length} holidays this year</p>` +
    `<div class="ttcard" style="margin-bottom:14px">` +
      `<span class="sub" style="margin:0">Next holiday</span>` +
      `<div style="font-size:18px;font-weight:700;margin-top:4px">${nextHoliday ? nextHoliday[2] : 'None left this year'}</div>` +
      (nextHoliday
        ? `<div class="sub" style="margin:2px 0 0">${nextHoliday[1]} ${MONTH_NAMES[nextHoliday[0]]} · ` +
          `${daysUntil(nextHoliday) === 0 ? 'Today' : 'in ' + daysUntil(nextHoliday) + ' day' + (daysUntil(nextHoliday) > 1 ? 's' : '')}</div>`
        : '') +
    `</div>` +
    // Filter chips
    `<div class="chips">` +
      ['All', 'National', 'Odisha', 'Festival', 'College']
        .map(c => `<button class="chip ${c === holidayFilter ? 'on' : ''}" data-hf="${c}">${c}</button>`).join('') +
    `</div>`;

  // One block per month
  for (let m = 0; m < 12; m++) {
    const inMonth = list.filter(h => h[0] === m);
    if (!inMonth.length) continue;
    out += `<h3 style="margin:18px 0 8px">${MONTH_NAMES[m]}</h3><div class="list">` +
      inMonth.map(h => {
        const d = daysUntil(h);
        const weekday = new Date(HOLIDAY_YEAR, h[0], h[1]).toLocaleDateString('en-IN', { weekday: 'short' });
        return `<div class="item hd" style="${d < 0 ? 'opacity:.55' : ''}">` +
          `<div class="dt"><b>${h[1]}</b><small>${weekday}</small></div>` +
          `<div><div class="top"><b>${h[2]}</b><span class="badge">${h[3]}</span></div>` +
          `<p>${d < 0 ? 'Passed' : d === 0 ? 'Today' : 'In ' + d + ' day' + (d > 1 ? 's' : '')}${weekday === 'Sun' ? ' · falls on Sunday' : ''}</p></div></div>`;
      }).join('') + '</div>';
  }

  return out + `<p class="demo">Sample dates. Lunar festival dates can shift, so confirm with your college's official calendar.</p>`;
}


/* =============================================================================
   7. LEAVE (student + staff)
   ============================================================================= */

// Saved in localStorage so a request made by a staff member is visible to the admin
const LEAVE_STORAGE_KEY = 'cc_lv2';
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Starting leave history per role: { id, n (who), t type, f from, to, r reason, s status }
const defaultLeaves = {
  student: [{ t: "Medical", f: "2026-09-10", to: "2026-09-11", r: "Viral fever, doctor's note attached", s: "Approved" }],
  staff: [
    { t: "Casual", f: "2026-08-20", to: "2026-08-20", r: "Family function", s: "Approved" },
    { id: "sl-1", n: "Prof. S. Das", t: "Medical", f: "2026-10-07", to: "2026-10-08", r: "Medical check-up", s: "Pending" },
    { id: "sl-2", n: "Ms. L. Roy", t: "Casual", f: "2026-10-14", to: "2026-10-14", r: "Family function", s: "Pending" }
  ]
};
// Student requests waiting for a teacher's decision
const defaultApprovals = [
  { id: "sa-1", n: "Ananya Das · CS23-0107", t: "Medical", f: "2026-10-05", to: "2026-10-06", r: "Dental surgery", s: "Pending" },
  { id: "sa-2", n: "Rohit Behera · CS23-0119", t: "Event / On-duty", f: "2026-10-08", to: "2026-10-09", r: "Inter-college hackathon", s: "Pending" },
  { id: "sa-3", n: "Sneha Nayak · CS23-0131", t: "Family function", f: "2026-10-12", to: "2026-10-12", r: "Sister's wedding", s: "Pending" }
];

let leaveRequests;       // { student: [...], staff: [...] }
let studentApprovals;    // requests staff must approve / reject
let leaveMessage = '';   // success message after submitting
let adminLeaveMessage = '';
let loginRole = 'student';

// Load saved leave data (falls back to the defaults above)
function loadLeave() {
  const saved = loadJson(LEAVE_STORAGE_KEY, null);
  leaveRequests = (saved && saved.LV) || JSON.parse(JSON.stringify(defaultLeaves));
  studentApprovals = (saved && saved.AP) || JSON.parse(JSON.stringify(defaultApprovals));
}
loadLeave();

const saveLeave = () => saveJson(LEAVE_STORAGE_KEY, { LV: leaveRequests, AP: studentApprovals });

// A staff request belongs to the signed-in staff member if it has no name (old demo row) or their name
const isMyLeave = r => !r.n || r.n === userName();

// Leave types per role and yearly staff quota
const LEAVE_TYPES = {
  student: ["Medical", "Personal", "Event / On-duty", "Family function"],
  staff: ["Casual", "Medical", "Earned", "Duty leave"]
};
const LEAVE_QUOTA = { Casual: 12, Medical: 10, Earned: 15 };

// Coloured status badge
const statusBadge = status =>
  `<span class="badge ${status === 'Approved' ? 'ok' : status === 'Rejected' ? 'bad' : ''}">${status}</span>`;
// "5 Oct – 6 Oct · 2 days"
const rangeText = req =>
  `${formatDate(req.f)}${req.f === req.to ? '' : ' – ' + formatDate(req.to)} · ` +
  `${countDays(req.f, req.to)} day${countDays(req.f, req.to) > 1 ? 's' : ''}`;
// Days of a leave type still available for staff
const leaveLeft = type =>
  LEAVE_QUOTA[type] - leaveRequests.staff
    .filter(r => isMyLeave(r) && r.t === type && r.s !== 'Rejected')
    .reduce((sum, r) => sum + countDays(r.f, r.to), 0);

// Leave page (apply form + my requests + (staff only) requests to review)
function renderLeave() {
  const isStaff = getRole() === 'staff';
  const role = getRole();
  const mine = isStaff ? leaveRequests.staff.filter(isMyLeave) : leaveRequests.student;

  let out = `<h2>Leave</h2><p class="sub">${isStaff ? 'Apply for leave (the admin approves it) and review student requests' : 'Apply for leave and track your requests'}</p>`;

  // Staff see how many leave days they have left
  if (isStaff) {
    out += '<div class="grid">' + ['Casual', 'Medical', 'Earned'].map(k =>
      `<div class="stat" style="cursor:default"><span>${k} leave left</span><b>${leaveLeft(k)}</b><span>of ${LEAVE_QUOTA[k]} days</span></div>`
    ).join('') + '</div>';
  }

  if (leaveMessage) out += `<div class="item" style="margin-bottom:14px;border-color:#15803d">${leaveMessage}</div>`;

  // Apply form
  out += `<div class="ttcard frm"><b style="font-size:18px">Apply for leave</b>` +
    `<label for="lt">Leave type</label>` +
    `<select id="lt">${LEAVE_TYPES[role].map(t => `<option>${t}</option>`).join('')}</select>` +
    `<div class="two">` +
      `<div><label for="lf">From</label><input type="date" id="lf" min="${todayIso()}" value="${todayIso()}"></div>` +
      `<div><label for="lto">To</label><input type="date" id="lto" min="${todayIso()}" value="${todayIso()}"></div>` +
    `</div>` +
    `<label for="lr">Reason</label><textarea id="lr" placeholder="Briefly explain the reason"></textarea>` +
    `<div class="err" id="lerr" role="alert"></div>` +
    `<button class="btn" id="lsub" type="button" style="width:100%">Submit request</button></div>`;

  // My requests
  out += `<h3 style="margin:20px 0 8px">My requests</h3><div class="list">` +
    (mine.length
      ? mine.map(r => `<div class="item"><div class="top"><b>${r.t} leave</b>${statusBadge(r.s)}</div><p>${rangeText(r)}</p><p>${escapeHtml(r.r)}</p>${r.by ? `<p>${r.s === 'Approved' ? '✔' : '✖'} ${r.s} by <b>${escapeHtml(r.by)}</b></p>` : ''}</div>`).join('')
      : '<p class="sub">No requests yet.</p>') + `</div>`;

  // Staff only: approve / reject student requests
  if (isStaff) {
    out += '<h3 style="margin:20px 0 8px">Student requests to review</h3><div class="list">' +
      studentApprovals.map(r =>
        `<div class="item"><div class="top"><b>${escapeHtml(r.n)}</b>${statusBadge(r.s)}</div>` +
        `<p>${r.t} · ${rangeText(r)}</p><p>${escapeHtml(r.r)}</p>` +
        (r.s === 'Pending'
          ? `<div class="btns" style="margin-top:10px"><button class="btn sm" data-ap2="${r.id}:Approved">Approve</button><button class="btn ghost sm" data-ap2="${r.id}:Rejected">Reject</button></div>`
          : '') + `</div>`
      ).join('') + '</div>';
  }
  return out;
}

// Validate and save a new leave request
function submitLeave() {
  const role = getRole();
  const from = $('lf').value, to = $('lto').value, reason = $('lr').value.trim(), errBox = $('lerr');

  if (!from || !to) { errBox.textContent = 'Choose both dates.'; return; }
  if (to < from) { errBox.textContent = 'End date cannot be before the start date.'; return; }
  if (reason.length < 5) { errBox.textContent = 'Please add a short reason.'; return; }

  const entry = { id: newId(), t: $('lt').value, f: from, to, r: reason, s: 'Pending' };
  if (role === 'staff') entry.n = userName();
  leaveRequests[role].unshift(entry);
  // A student's request also goes to the teachers' review list
  if (role === 'student') studentApprovals.unshift({ id: entry.id, n: userName() + ' · CS23-0142', t: entry.t, f: from, to, r: reason, s: 'Pending' });
  saveLeave();
  leaveMessage = role === 'staff'
    ? '✅ Leave request sent to the admin. Status: Pending.'
    : '✅ Leave request submitted. Status: Pending.';
  render();
  window.scrollTo(0, 0);
}


// Staff decides a student's request (also updates the student's own copy)
function decideStudentLeave(id, status) {
  const req = studentApprovals.find(r => r.id === id);
  if (!req || req.s !== 'Pending') return;
  req.s = status; req.by = userName(); req.at = Date.now();
  const own = leaveRequests.student.find(r => r.id === id);
  if (own) { own.s = status; own.by = userName(); own.at = Date.now(); }
  saveLeave();
  render();
}

// Admin decides a staff member's request (admin only)
function decideStaffLeave(id, status) {
  if (getRole() !== 'admin') return;
  const req = leaveRequests.staff.find(r => r.id === id);
  if (!req || req.s !== 'Pending') return;
  req.s = status; req.by = userName(); req.at = Date.now();
  adminLeaveMessage = (status === 'Approved' ? '✅ Approved' : '✖ Rejected') + ' leave for ' + escapeHtml(req.n || 'staff member') + '.';
  saveLeave();
  render();
}

// Leave page for the admin: approve / reject staff requests
function renderAdminLeave() {
  const message = adminLeaveMessage; adminLeaveMessage = '';
  const all = leaveRequests.staff.filter(r => r.id);
  const pending = all.filter(r => r.s === 'Pending').reverse();   // oldest first
  const reviewed = all.filter(r => r.s !== 'Pending');
  const count = st => all.filter(r => r.s === st).length;

  const card = r =>
    `<div class="item"><div class="top"><b>${escapeHtml(r.n || 'Staff member')}</b>${statusBadge(r.s)}</div>` +
    `<p>${escapeHtml(r.t)} leave · ${rangeText(r)}</p><p>${escapeHtml(r.r)}</p>` +
    (r.s === 'Pending'
      ? `<div class="btns" style="margin-top:10px"><button class="btn sm" data-sl="${r.id}:Approved" type="button">Approve</button><button class="btn ghost sm" data-sl="${r.id}:Rejected" type="button">Reject</button></div>`
      : (r.by ? `<p>${r.s === 'Approved' ? '✔' : '✖'} ${r.s} by <b>${escapeHtml(r.by)}</b></p>` : '')) +
    `</div>`;

  return `<h2>Leave</h2><p class="sub">Review and approve leave requests from staff members</p>` + successBox(message) +
    `<div class="grid">` +
      `<div class="stat" style="cursor:default"><span>Waiting</span><b>${count('Pending')}</b><span>Need your decision</span></div>` +
      `<div class="stat" style="cursor:default"><span>Approved</span><b>${count('Approved')}</b><span>Staff leave</span></div>` +
      `<div class="stat" style="cursor:default"><span>Rejected</span><b>${count('Rejected')}</b><span>Staff leave</span></div>` +
    `</div>` +
    `<h3 style="margin:20px 0 8px">Waiting for approval</h3><div class="list">` +
    (pending.length ? pending.map(card).join('') : '<p class="sub">No pending requests. 🎉</p>') + `</div>` +
    (reviewed.length ? `<h3 style="margin:20px 0 8px">Reviewed</h3><div class="list">${reviewed.map(card).join('')}</div>` : '');
}


/* =============================================================================
   8. STAFF DASHBOARD + STAFF PROFILE
   ============================================================================= */

// Staff home page
function renderStaffHome() {
  const classesToday = getFullDay(currentDayName()).filter(r => r[5] !== 'Break').length;
  const pendingRequests = studentApprovals.filter(r => r.s === 'Pending').length;

  return `<h2>${greetingHtml()}, ${displayName()} 👋</h2>` +
    `<p class="sub">Staff dashboard · Department of Computer Science</p>` +
    `<div class="grid">` +
      `<button class="stat" data-go="timetable"><span>Classes today</span><b>${classesToday}</b><span>${classesToday ? 'Open timetable' : 'No classes today'}</span></button>` +
      `<button class="stat" data-go="leave"><span>Requests to review</span><b>${pendingRequests}</b><span>Student leave</span></button>` +
      `<button class="stat" data-go="leave"><span>Casual leave left</span><b>${leaveLeft('Casual')}</b><span>of 12 days</span></button>` +
      `<button class="stat" data-go="holidays"><span>Holidays</span><b>${HOLIDAYS.length}</b><span>this year</span></button>` +
    `</div>` + renderNotifications() + renderTodayTimetable();
}

// Staff profile page
function renderStaffProfile() {
  return `<h2>Profile</h2><p class="sub">&nbsp;</p>` +
    `<div class="item" style="display:flex;gap:16px;align-items:center;margin-bottom:14px">` +
      `<div class="avatar">${displayName()[0].toUpperCase()}</div>` +
      `<div><b style="font-size:20px">${displayName()}</b><p>Assistant Professor · Computer Science</p></div></div>` +
    `<div class="kv">` +
      `<div><small>Employee ID</small>EMP-1024</div>` +
      `<div><small>Email</small>staff@college.example</div>` +
      `<div><small>Phone</small>+91 91234 56780</div>` +
      `<div><small>Department</small>Computer Science &amp; Engineering</div>` +
      `<div><small>Joined</small>July 2019</div>` +
      `<div><small>Cabin</small>Block A, Room 12</div>` +
      `<div><small>Subjects</small>Data Structures, Algorithms</div>` +
      `<div><small>Mentor group</small>Semester 3, Section A</div>` +
    `</div>` +
    `<div class="btns" style="margin-top:16px"><button class="btn ghost sm" id="theme" type="button">Toggle light / dark</button></div>` +
    `<p class="demo">All details shown are demo data.</p>` +
    `<p class="swipe-hint">Tip: swipe left or right anywhere on a page to switch menus.</p>`;
}


/* =============================================================================
   9. LOGIN SCREEN, ROLE SWITCHER, TABS, PAGE SWITCHING
   ============================================================================= */

// Placeholder + hint text for each login role
const PLACEHOLDERS = { student: 'Roll number or email', staff: 'Employee ID or email', admin: 'Admin ID or email' };
const ROLE_HINTS = { student: 'Sign in as a student', staff: 'Sign in as staff', admin: 'Sign in as admin' };
const ROLE_ICONS = { student: '🎓', staff: '🧑‍🏫', admin: '🛡️' };
let prevRole = 'student';   // remembers the last role so we can slide left/right

// Show the login screen again (after sign out)
function showLogin() {
  $('siteView').classList.add('hidden');
  $('loginView').classList.remove('hidden', 'slide-back');
  void $('loginView').offsetWidth;                // restart the CSS animation
  $('loginView').classList.add('slide-back');
  $('formPane').classList.remove('hidden');
  $('donePane').classList.add('hidden');
  $('pass').value = '';
}

// Role switcher on the login form (Student / Staff / Admin)
$('seg').addEventListener('click', e => {
  const btn = e.target.closest('[data-role]');
  if (!btn) return;

  loginRole = btn.dataset.role;
  [...$('seg').children].forEach(b => b.classList.toggle('on', b === btn));
  $('user').placeholder = PLACEHOLDERS[loginRole];
  $('user').setAttribute('aria-label', $('user').placeholder);

  // Icon + ring colour follow the role
  $('roleLogo').textContent = ROLE_ICONS[loginRole];
  $('roleLogo').classList.remove('pop'); void $('roleLogo').offsetWidth; $('roleLogo').classList.add('pop');
  $('phoneBox').dataset.role = loginRole;

  // Slide direction depends on whether the new role is to the right or left
  const order = ['student', 'staff', 'admin'];
  const direction = order.indexOf(loginRole) > order.indexOf(prevRole) ? 'sl-r' : 'sl-l';
  prevRole = loginRole;

  const animate = (el, delay) => {
    el.classList.remove('sl-r', 'sl-l');
    void el.offsetWidth;
    el.classList.add(direction);
    el.style.animationDelay = delay + 's';
  };

  $('seg').setAttribute('data-r', loginRole);
  $('roleHint').textContent = ROLE_HINTS[loginRole];
  animate($('roleHint'), 0);
  document.querySelectorAll('#formPane .field').forEach((field, i) => animate(field, .06 * (i + 1)));
  translatePage(document.body);
});

// ----- Tabs bar -----
let tabsBuiltFor = '';   // role the tab buttons were last built for

// Slide the highlighted "pill" under the active tab
function movePill() {
  const active = $('tabs').querySelector('.tab.on'), pill = $('pill');
  if (active && pill) {
    pill.style.width = active.offsetWidth + 'px';
    pill.style.transform = 'translateX(' + active.offsetLeft + 'px)';
  }
  if (pill) pill.style.opacity = active ? 1 : 0;
}

// Build tab buttons (only when the role changed) and mark the active one
function renderTabs() {
  const bar = $('tabs');
  if (tabsBuiltFor !== getRole()) {
    tabsBuiltFor = getRole();
    bar.innerHTML = '<span class="pill" id="pill"></span>' +
      currentTabs().map(t => `<button class="tab" data-go="${t[0]}" role="tab">${t[1]}${t[0] === 'notices' || t[0] === 'complaints' ? '<i class="ndot" aria-hidden="true"></i>' : ''}</button>`).join('');
  }
  bar.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.go === appData.tab));
  // Red dot on "Notices" / "Complaints" while there is something the person has not opened yet
  [['notices', hasNewNotices, 'New notice'], ['complaints', hasNewClosures, 'A complaint was closed']].forEach(([id, has, label]) => {
    const el = bar.querySelector('[data-go="' + id + '"]');
    if (!el) return;
    const fresh = appData.tab !== id && has();
    el.classList.toggle('has-dot', fresh);
    el.title = fresh ? label : '';
  });
  movePill();
}
if (window.addEventListener) window.addEventListener('resize', movePill);

// Show the main app after sign in. animate = true plays the slide transition.
function showSite(animate) {
  const login = $('loginView'), site = $('siteView');
  const finish = () => {
    login.classList.add('hidden');
    login.classList.remove('slide-out');
    site.classList.remove('hidden', 'enter', 'slide-in');
    void site.offsetWidth;
    site.classList.add('enter');
    if (animate) site.classList.add('slide-in');
    initSite();
  };
  if (animate) { login.classList.add('slide-out'); setTimeout(finish, 380); }
  else finish();
}


/* =============================================================================
   10. RESULTS (student)
   ============================================================================= */

// Marks per semester: [code, subject, credits, internal /30, external /70]
const RESULTS = {
  1: [["MA101", "Engineering Mathematics I", 4, 28, 62], ["PH101", "Engineering Physics", 3, 24, 55],
      ["CS101", "Programming in C", 4, 27, 66], ["EE101", "Basic Electrical Engineering", 3, 22, 48],
      ["EN101", "Communication Skills", 2, 26, 60], ["CS102", "C Programming Lab", 2, 29, 63]],
  2: [["MA102", "Engineering Mathematics II", 4, 26, 58], ["CH101", "Engineering Chemistry", 3, 23, 50],
      ["CS103", "Object Oriented Programming", 4, 27, 61], ["ME101", "Engineering Graphics", 3, 25, 54],
      ["CS104", "Digital Logic", 3, 24, 52], ["CS105", "OOP Lab", 2, 30, 66]]
};
let selectedSemester = '2';

// Total marks (out of 100) -> [letter grade, grade points]
const gradeFor = total =>
  total >= 90 ? ['O', 10] : total >= 80 ? ['E', 9] : total >= 70 ? ['A', 8] :
  total >= 60 ? ['B', 7] : total >= 50 ? ['C', 6] : total >= 40 ? ['D', 5] : ['F', 0];

// [total credits, total credit x grade-points] for a semester
const semesterPoints = sem =>
  RESULTS[sem].reduce((acc, r) => [acc[0] + r[2], acc[1] + r[2] * gradeFor(r[3] + r[4])[1]], [0, 0]);

function renderResults() {
  const semesters = ['1', '2', '3'];
  let out = '<h2>Results</h2><p class="sub">B.Tech · Computer Science · Roll CS23-0142</p><div class="chips">' +
    semesters.map(k => `<button class="chip ${k === selectedSemester ? 'on' : ''}" data-rs="${k}">Semester ${k}</button>`).join('') + '</div>';

  // Semester 3 has no results yet
  if (!RESULTS[selectedSemester]) {
    return out + '<div class="item"><div class="top"><b>Semester 3</b><span class="badge">In progress</span></div>' +
      '<p>Results will be published after the end-semester exams. Mid-semester exams begin on 12 Oct.</p></div>';
  }

  const [credits, points] = semesterPoints(selectedSemester);
  const sem1 = semesterPoints('1'), sem2 = semesterPoints('2');
  const cgpa = ((sem1[1] + sem2[1]) / (sem1[0] + sem2[0])).toFixed(2);
  const passed = RESULTS[selectedSemester].every(r => gradeFor(r[3] + r[4])[0] !== 'F');

  // Summary cards
  out += `<div class="grid">` +
    `<div class="stat" style="cursor:default"><span>SGPA</span><b>${(points / credits).toFixed(2)}</b><span>Semester ${selectedSemester}</span></div>` +
    `<div class="stat" style="cursor:default"><span>CGPA</span><b>${cgpa}</b><span>After Sem 2</span></div>` +
    `<div class="stat" style="cursor:default"><span>Credits earned</span><b>${credits}</b><span>This semester</span></div>` +
    `<div class="stat" style="cursor:default"><span>Result</span><b>${passed ? 'Pass' : 'Fail'}</b><span>${passed ? 'All subjects cleared' : 'Backlog present'}</span></div>` +
    `</div><div class="list">`;

  // One card per subject
  out += RESULTS[selectedSemester].map(r => {
    const total = r[3] + r[4], grade = gradeFor(total);
    return `<div class="item"><div class="top"><b>${r[1]}</b><span class="badge ${grade[0] === 'F' ? 'bad' : 'ok'}">Grade ${grade[0]}</span></div>` +
      `<p>${r[0]} · ${r[2]} credits · Internal ${r[3]}/30 · External ${r[4]}/70 · Total <b>${total}/100</b></p>` +
      `<div class="meter" style="margin-top:8px"><i class="${total < 50 ? 'low' : ''}" style="width:${total}%"></i></div></div>`;
  }).join('') + '</div>';

  return out + '<div class="btns" style="margin-top:16px"><button class="btn ghost sm" data-print type="button">Print / save marksheet</button></div>' +
    '<p class="demo">Demo marks and grades. Grade scale: O 90+, E 80+, A 70+, B 60+, C 50+, D 40+, F below 40.</p>';
}


/* =============================================================================
   11. ABOUT US, ANONYMOUS COMPLAINT BOX, BOTTOM SHEET
   ============================================================================= */

// [key in SOCIAL, icon, label]
const SOCIAL_LINKS = [
  ["website", "🌐", "Website"], ["instagram", "📸", "Instagram"], ["facebook", "👍", "Facebook"],
  ["youtube", "▶️", "YouTube"], ["x", "✖️", "X (Twitter)"], ["linkedin", "💼", "LinkedIn"]
];

// "About us" sheet
function renderAbout() {
  const anyLinkAdded = SOCIAL_LINKS.some(s => isValidUrl(SOCIAL[s[0]]));
  return `<h2 style="margin:0 0 6px">About us</h2><p class="sub">College Connect · Your campus, in your pocket</p>` +
    `<p>College Connect brings timetables, attendance, fees, notices, results, scholarships and leave requests into one simple app for students and staff.</p>` +
    `<div class="kv" style="margin:14px 0">` +
      `<div><small>Our aim</small>One app, one sign-in, nothing to figure out</div>` +
      `<div><small>Built for</small>Students and staff of your college</div>` +
      `<div><small>Contact</small><a href="mailto:admin@collegeconnect.example">Admin Office</a></div>` +
    `</div>` +
    `<h3 style="margin:18px 0 10px">Follow us</h3><div class="socs">` +
    SOCIAL_LINKS.map(s => {
      const url = SOCIAL[s[0]];
      return isValidUrl(url)
        ? `<a class="soc" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${s[1]} ${s[2]}</a>`
        : `<span class="soc off">${s[1]} ${s[2]}<small>Link not added yet</small></span>`;
    }).join('') + `</div>` +
    (anyLinkAdded ? '' : '<p class="demo">Social media links will appear here once the admin adds them.</p>');
}

// Anonymous complaint box sheet
function renderComplaintBox() {
  return `<h2 style="margin:0 0 10px">Complaint box</h2>` +
    `<div class="note">🔒 <b>Complaints are anonymous.</b> No one can know who has raised a complaint.</div>` +
    `<div class="note" style="margin-top:8px">⏱ Action will be taken within <b>7 days at most</b>.</div>` +
    `<div class="frm">` +
      `<label for="ccat">Category</label>` +
      `<select id="ccat"><option>Academics</option><option>Hostel</option><option>Fees</option><option>Safety / Harassment</option><option>Facilities</option><option>Other</option></select>` +
      `<label for="ctext">Describe your complaint</label>` +
      `<textarea id="ctext" placeholder="Write what happened, where and when. Do not include your name."></textarea>` +
      `<div class="err" id="cerr" role="alert"></div>` +
      `<button class="btn" id="csub" type="button" style="width:100%">Submit anonymously</button>` +
    `</div><p class="demo">Demo mode: complaints are not sent anywhere yet.</p>`;
}

// Submit the anonymous complaint and show a confirmation
function submitAnonymousComplaint() {
  const text = $('ctext').value.trim(), errBox = $('cerr');
  if (text.length < 10) { errBox.textContent = 'Please describe the issue in at least 10 characters.'; return; }

  const reference = 'CMP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  $('sbody').innerHTML = `<div class="tick" style="margin-top:10px">✓</div>` +
    `<h2 style="text-align:center;margin:0 0 6px">Complaint submitted</h2>` +
    `<p class="sub" style="text-align:center">Your complaint was submitted anonymously. Action will be taken within 7 days at most.<br>Reference: <b>${reference}</b></p>` +
    `<div class="btns" style="justify-content:center"><button class="btn ghost sm" data-again type="button">Raise another</button><button class="btn sm" data-close type="button">Done</button></div>`;
  translatePage($('sheet'));
}

// Open the bottom sheet: 'about' | 'issue' | anything else = complaint box
function openSheet(kind) {
  $('sbody').innerHTML = kind === 'about' ? renderAbout() : kind === 'issue' ? renderIssueForm() : renderComplaintBox();
  $('sheet').classList.remove('hidden');
  translatePage($('sheet'));
}
function closeSheet() { $('sheet').classList.add('hidden'); }

// Escape key closes the sheet and any open ⋮ menu
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSheet();
    document.querySelectorAll('.kb.open').forEach(k => k.classList.remove('open'));
  }
});


/* =============================================================================
   12. ATTENDANCE
   ----- 12a. Student: "how many classes can I miss?" calculator
   ============================================================================= */

const RULE = 75;   // minimum attendance % required

// How many more classes can be missed and still stay >= RULE%
// (h = classes held so far, a = classes attended)
const canMiss = (h, a) => Math.floor((100 * a - RULE * h) / RULE);
// How many classes in a row must be attended to reach RULE%
const needAttend = (h, a) => Math.max(0, Math.ceil((RULE * h - 100 * a) / (100 - RULE)));

// Friendly sentence for a subject / overall total
function attendanceMessage(held, attended) {
  if (attended / held * 100 >= RULE) {
    const n = canMiss(held, attended);
    return n > 0
      ? `You can miss <b>${n}</b> more class${n > 1 ? 'es' : ''} and stay above ${RULE}%`
      : `Right at the ${RULE}% limit. Do not miss the next class`;
  }
  return `Attend the next <b>${needAttend(held, attended)}</b> classes in a row to reach ${RULE}%`;
}

// Result text after missing n classes of subject number i
function missResult(i, n) {
  const row = appData.attendance[i];
  const newPercent = row[2] / (row[1] + n) * 100;
  return `After missing ${n} class${n === 1 ? '' : 'es'}: <b>${newPercent.toFixed(1)}%</b> · ` +
    `${newPercent >= RULE ? '✅ Safe' : '⚠️ Below ' + RULE + '%'}`;
}

// Re-run the calculator when the subject or number changes
function updateMissCalculator() {
  const subject = +$('ccs').value;
  const count = Math.max(0, Math.floor(+$('ccn').value || 0));
  $('cres').innerHTML = missResult(subject, count);
}

// Student attendance page
function renderStudentAttendance() {
  let heldAll = 0, attendedAll = 0;
  appData.attendance.forEach(r => { heldAll += r[1]; attendedAll += r[2]; });

  return `<h2>Attendance</h2><p class="sub">Overall ${overallAttendance()}% · minimum required ${RULE}%</p>` +
    // Calculator card
    `<div class="ttcard frm" style="margin-bottom:14px">` +
      `<b style="font-size:18px">Classes you can miss</b>` +
      `<p class="sub" style="margin:4px 0 0">Overall: ${attendanceMessage(heldAll, attendedAll)}</p>` +
      `<label for="ccs">Subject</label>` +
      `<select id="ccs">${appData.attendance.map((r, i) => `<option value="${i}">${r[0]}</option>`).join('')}</select>` +
      `<label for="ccn">How many classes do you plan to miss?</label>` +
      `<input type="number" id="ccn" min="0" max="30" value="1">` +
      `<div class="next" id="cres" style="margin-top:12px">${missResult(0, 1)}</div>` +
    `</div>` +
    // Subject cards
    `<div class="list">` +
    appData.attendance.map(r => {
      const p = percent(r[2], r[1]);
      return `<div class="item"><div class="top"><b>${r[0]}</b><span class="badge ${p < RULE ? 'bad' : 'ok'}">${p}%</span></div>` +
        `<p>${r[2]} of ${r[1]} classes attended</p><p>${attendanceMessage(r[1], r[2])}</p>` +
        `<div class="meter" style="margin-top:8px"><i class="${p < RULE ? 'low' : ''}" style="width:${p}%"></i></div></div>`;
    }).join('') +
    `</div><p class="demo">Calculated with a ${RULE}% rule. Confirm the rule with your college.</p>`;
}


/* ----- 12b. Faculty: mark attendance, works offline ----------------------- */

// Class sessions a teacher can take attendance for
const CLASS_SESSIONS = ["Data Structures · CSE Sem 3 · A", "Algorithms · CSE Sem 5 · B", "Programming Lab · CSE Sem 1 · C"];

let selectedClass = 0;     // index in CLASS_SESSIONS
let marks = {};            // { rollNo: false } only absent students are stored
let offlineDemo = false;   // "Simulate offline" button
let markMessage = '';      // message after saving
let attendanceQueue = [];  // saved sessions (some may still be waiting to sync)
try { attendanceQueue = JSON.parse(localStorage.getItem('cc_atq')) || []; } catch (e) {}

const saveQueue = () => { try { localStorage.setItem('cc_atq', JSON.stringify(attendanceQueue)); } catch (e) {} };
const isOffline = () => offlineDemo || (typeof navigator !== 'undefined' && navigator.onLine === false);

// When online, mark every queued session as synced (demo: no real server)
function syncQueue() {
  if (!isOffline()) attendanceQueue.forEach(item => { item.s = true; });
  saveQueue();
}

// Save today's session. Same class + same day replaces the old record (no duplicates).
function saveSession() {
  const date = todayIso();
  const id = date + '|' + selectedClass;
  const record = {
    id,
    cls: CLASS_SESSIONS[selectedClass],
    date,
    m: JSON.parse(JSON.stringify(marks)),
    n: studentPairs().length,
    p: studentPairs().filter(s => marks[s[0]] !== false).length,
    s: false
  };
  const existing = attendanceQueue.findIndex(item => item.id === id);
  if (existing >= 0) attendanceQueue[existing] = record; else attendanceQueue.unshift(record);

  syncQueue();
  markMessage = isOffline()
    ? '💾 Saved on this device. It will sync when you are back online.'
    : '✅ Saved and synced.';
  marks = {};
  render();
  window.scrollTo(0, 0);
}

// Mark-attendance page for teachers
function renderMarkAttendance() {
  const message = markMessage; markMessage = '';
  const pending = attendanceQueue.filter(item => !item.s).length;
  const presentCount = studentPairs().filter(s => marks[s[0]] !== false).length;

  return `<h2>Mark attendance</h2><p class="sub">Works offline. Saved sessions sync automatically when you are back online.</p>` +
    // Online / offline status
    `<div class="item"><div class="top"><span class="badge ${isOffline() ? 'bad' : 'ok'}">${isOffline() ? 'Offline' : 'Online'}</span><span class="badge">Pending sync: ${pending}</span></div>` +
      `<div class="btns" style="margin-top:10px"><button class="btn ghost sm" data-off type="button">${offlineDemo ? 'Go online (demo)' : 'Simulate offline'}</button>` +
      (pending && !isOffline() ? '<button class="btn sm" data-sync type="button">Sync now</button>' : '') + `</div></div>` +
    (message ? `<div class="item" style="margin:14px 0;border-color:#15803d">${message}</div>` : '') +
    // Class picker
    `<div class="ttcard frm" style="margin:14px 0"><label for="mcls">Class session</label>` +
      `<select id="mcls">${CLASS_SESSIONS.map((c, i) => `<option value="${i}" ${i === selectedClass ? 'selected' : ''}>${c}</option>`).join('')}</select>` +
      `<p class="sub" style="margin:8px 0 0">${formatDate(todayIso())} · ${presentCount} of ${studentPairs().length} present</p></div>` +
    // One row per student (tap to toggle Present / Absent)
    `<div class="list">` +
    studentPairs().map(s => {
      const present = marks[s[0]] !== false;
      return `<div class="item" style="display:flex;justify-content:space-between;align-items:center;gap:10px">` +
        `<div><b>${s[1]}</b><p style="margin:2px 0 0">${s[0]}</p></div>` +
        `<button class="chip ${present ? 'on' : ''}" data-mk="${s[0]}" type="button">${present ? 'Present' : 'Absent'}</button></div>`;
    }).join('') + `</div>` +
    `<div class="btns" style="margin-top:14px"><button class="btn ghost sm" data-allp type="button">Mark all present</button><button class="btn sm" data-msave type="button">Save session</button></div>` +
    // Recent sessions
    `<h3 style="margin:20px 0 8px">Recent sessions</h3><div class="list">` +
    (attendanceQueue.length
      ? attendanceQueue.slice(0, 5).map(item =>
          `<div class="item"><div class="top"><b>${escapeHtml(item.cls)}</b><span class="badge ${item.s ? 'ok' : 'bad'}">${item.s ? 'Synced' : 'Pending'}</span></div>` +
          `<p>${formatDate(item.date)} · ${item.p}/${item.n} present</p></div>`).join('')
      : '<p class="sub">No sessions saved yet.</p>') +
    `</div><p class="demo">Saving the same class on the same day updates that record, so syncing never creates duplicates.</p>`;
}

// Sync automatically when the browser comes back online
if (window.addEventListener) {
  window.addEventListener('online', () => {
    syncQueue();
    if (getRole() === 'staff' && appData.tab === 'attendance') render();
  });
}


/* =============================================================================
   13. OPPORTUNITIES (student)
   ============================================================================= */

const OPPORTUNITIES = [
  { id: 1, title: "Software Engineer Intern", co: "TechNova Pvt Ltd", type: "Internship", pay: "₹25,000 / month", loc: "Bhubaneswar", min: 7, close: "2026-10-20", sk: ["JavaScript", "DSA"] },
  { id: 2, title: "Data Analyst Trainee", co: "DataBridge Analytics", type: "Full-time", pay: "₹4.2 LPA", loc: "Remote", min: 6.5, close: "2026-10-25", sk: ["SQL", "Python"] },
  { id: 3, title: "Embedded Engineer", co: "ElectraWorks", type: "Full-time", pay: "₹5 LPA", loc: "Pune", min: 6, close: "2026-11-05", sk: ["C", "Microcontrollers"] },
  { id: 4, title: "Research Fellow", co: "InfraCore Labs", type: "Fellowship", pay: "₹40,000 / month", loc: "Hyderabad", min: 9.5, close: "2026-11-12", sk: ["Research", "Python"] }
];
// Recruiters who viewed the student's masked profile: [company, role, when]
const PROFILE_VIEWS = [
  ["TechNova Pvt Ltd", "Software Engineer Intern", "2 days ago"],
  ["DataBridge Analytics", "Data Analyst Trainee", "5 days ago"]
];

// Student's overall CGPA (Semester 1 + 2)
const currentCgpa = () => {
  const a = semesterPoints('1'), b = semesterPoints('2');
  return (a[1] + b[1]) / (a[0] + b[0]);
};

let appliedOpps = {};   // { opportunityId: true }

// Apply / withdraw (only if CGPA is high enough)
function toggleApply(id) {
  const opp = OPPORTUNITIES.find(o => o.id === +id);
  if (!opp || currentCgpa() < opp.min) return;
  appliedOpps[opp.id] = !appliedOpps[opp.id];
  render();
}

function renderOpportunities() {
  const cgpa = currentCgpa();
  return `<h2>Opportunities</h2><p class="sub">Your CGPA ${cgpa.toFixed(2)} · apply in one click</p><div class="list">` +
    OPPORTUNITIES.map(o => {
      const eligible = cgpa >= o.min, applied = appliedOpps[o.id];
      return `<div class="item"><div class="top"><b>${o.title}</b><span class="badge">${o.type}</span></div>` +
        `<p>${o.co} · ${o.loc} · ${o.pay}</p><p>Minimum CGPA ${o.min} · Closes ${formatDate(o.close)}</p>` +
        `<div>${o.sk.map(s => `<span class="tag">${s}</span>`).join('')}</div>` +
        (eligible
          ? `<button class="btn sm ${applied ? 'ghost' : ''}" style="margin-top:10px" data-oapply="${o.id}" type="button">${applied ? 'Applied ✓' : 'Apply'}</button>`
          : `<button class="btn sm" style="margin-top:10px" disabled type="button">Not eligible (CGPA ${o.min}+)</button>`) +
        `</div>`;
    }).join('') +
    `</div><h3 style="margin:20px 0 8px">Who viewed my profile</h3><div class="list">` +
    PROFILE_VIEWS.map(v => `<div class="item"><div class="top"><b>${v[0]}</b><span class="badge">${v[2]}</span></div><p>Viewed your masked profile for ${v[1]}</p></div>`).join('') +
    `</div><p class="demo">Recruiters see only an anonymous ID, branch, CGPA, skills and verified achievements.</p>`;
}


/* =============================================================================
   14. COMPLAINTS (student)
   ============================================================================= */

const COMPLAINT_CATEGORIES = ['Hostel', 'College', 'Mess'];
const COMPLAINT_LOCATIONS = ['Block A', 'Block B', 'Mess Hall', 'Library', 'Classroom block', 'Canteen'];
const SLA_HOURS = { Hostel: 48, College: 72, Mess: 24 };           // target response time per category
const STAGES = ['Submitted', 'Assigned', 'In progress', 'Resolved'];

// Demo complaints. st = stage index, mt = "me too" count, age = hours old, mine = raised by this student
const COMPLAINTS = [
  { id: 'C-101', cat: 'Hostel', loc: 'Block B', t: 'Water leakage in bathroom', st: 2, mine: false, mt: 4, age: 30 },
  { id: 'C-102', cat: 'Mess', loc: 'Mess Hall', t: 'Food served cold at dinner', st: 1, mine: false, mt: 9, age: 20 },
  { id: 'C-103', cat: 'College', loc: 'Library', t: 'AC not working', st: 1, mine: false, mt: 2, age: 80 },
  { id: 'C-099', cat: 'Hostel', loc: 'Block B', t: 'Wi-Fi very slow on 2nd floor', st: 3, mine: true, mt: 1, age: 100 },
  { id: 'C-104', cat: 'Hostel', loc: 'Block B', t: 'Fan not working in room 214', st: 1, mine: true, mt: 0, age: 20 }
].map(c => ({ ...c, ts: Date.now() - c.age * 36e5 }));   // ts = time created

// Complaints are saved so every role (and every open tab) sees the same state,
// e.g. when the admin closes one, students and staff see it straight away.
const COMPLAINTS_KEY = 'cc_cmp';
function loadComplaints() {
  const saved = loadJson(COMPLAINTS_KEY, null);
  if (Array.isArray(saved) && saved.length) COMPLAINTS.splice(0, COMPLAINTS.length, ...saved);
}
function saveComplaints() {
  try { localStorage.setItem(COMPLAINTS_KEY, JSON.stringify(COMPLAINTS)); }
  catch (e) {   // storage full (big photos): keep everything except the photos
    try { localStorage.setItem(COMPLAINTS_KEY, JSON.stringify(COMPLAINTS.map(c => ({ ...c, photo: '' })))); } catch (e2) {}
  }
}
loadComplaints();

// A complaint is "mine" if I filed it (or it is the demo student's own sample)
const isMine = c => c.by ? c.by === userName() : !!c.mine;
const closeKey = c => 'cl:' + c.id + ':' + c.closed.at;
const closedWhen = at => new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
let closedNewSet = new Set();   // closures to label NEW while the Complaints page is open

// The "Closed by admin" box: reason, who closed it and when
const closedNote = c => {
  if (!c.closed) return '';
  const fresh = closedNewSet.has(closeKey(c));
  return `<div class="clnote${fresh ? ' fresh' : ''}"><b><span aria-hidden="true">🔒</span> Closed by admin</b>` +
    `<p>${escapeHtml(c.closed.reason)}</p>` +
    `<p class="clmeta">${escapeHtml(c.closed.by)} · ${closedWhen(c.closed.at)}${fresh ? ' <span class="badge bad">NEW</span>' : ''}</p></div>`;
};

let complaintDraft = { cat: 'Hostel', loc: 'Block B', txt: '' };   // form values kept between re-renders
let duplicateIndex = -1;    // index of a similar open complaint (shows the "Me too?" prompt)
let complaintMessage = '';
let photoData = '';         // compressed evidence photo (data URL)

// Hours left before the SLA is breached (negative = breached)
const slaHoursLeft = c => Math.ceil(SLA_HOURS[c.cat] - (Date.now() - c.ts) / 36e5);
// 3+ complaints in the same place and category within 30 days = recurring issue
const isRecurring = c =>
  COMPLAINTS.filter(x => x.cat === c.cat && x.loc === c.loc && Date.now() - x.ts < 30 * 864e5).length >= 3;

// Badge showing resolved / closed / SLA state
const slaBadge = c =>
  c.st === 3 ? (c.closed ? '<span class="badge">Closed</span>' : '<span class="badge ok">Resolved</span>')
  : slaHoursLeft(c) < 0 ? '<span class="badge bad">SLA breached · escalated</span>'
  : `<span class="badge">SLA: ${slaHoursLeft(c)}h left</span>`;

// Card for one of "my complaints"
const complaintCard = c =>
  `<div class="item"><div class="top"><b>${escapeHtml(c.t)}</b><span class="badge">${c.cat} · ${c.loc}</span></div>` +
  `<p>${c.id} · ${c.mt} other${c.mt === 1 ? '' : 's'} said me too</p>` +
  (c.st < 3 ? `<p>⏱ Action within 7 days at most · due ${dueDateText(c)} (${dueLeftText(c)})</p>` : '') +
  closedNote(c) +
  `<div class="top" style="margin-top:8px;justify-content:flex-start;gap:8px">${slaBadge(c)}${isRecurring(c) ? '<span class="badge bad">Recurring issue</span>' : ''}</div>` +
  `<div class="steps">${STAGES.map((s, i) => `<div class="stp ${i <= c.st ? 'done' : ''}"><i></i><span>${s}</span></div>`).join('')}</div>` +
  (c.photo ? `<img src="${c.photo}" alt="Evidence photo" style="max-width:120px;border-radius:10px;margin-top:10px">` : '') +
  `</div>`;

function renderComplaints() {
  const message = complaintMessage; complaintMessage = '';

  // Prompt shown when a similar open complaint already exists
  const duplicatePrompt = duplicateIndex >= 0 && COMPLAINTS[duplicateIndex]
    ? `<div class="note" style="margin-top:12px">A similar open complaint already exists: <b>${escapeHtml(COMPLAINTS[duplicateIndex].t)}</b> (${COMPLAINTS[duplicateIndex].mt} others). Add "Me too" instead of filing a duplicate?` +
      `<div class="btns" style="margin-top:10px"><button class="btn sm" data-metoo="${duplicateIndex}" type="button">Me too</button><button class="btn ghost sm" data-force type="button">File anyway</button></div></div>`
    : '';

  const nearby = COMPLAINTS.map((c, i) => [c, i]).filter(q => !isMine(q[0]) && q[0].st < 3);
  const mine = COMPLAINTS.filter(isMine);
  // Complaints the admin closed (other students' ones; mine show above with the reason)
  const closedOthers = COMPLAINTS.filter(c => c.closed && !isMine(c)).sort((a, b) => b.closed.at - a.closed.at);
  const closedSection = closedOthers.length
    ? `<h3 style="margin:20px 0 4px">Closed by admin</h3><p class="sub" style="margin:0 0 10px">Issues the admin has closed, with the reason.</p><div class="list">` +
      closedOthers.map(c => `<div class="item"><div class="top"><b>${escapeHtml(c.t)}</b><span class="badge">${c.cat} · ${c.loc}</span></div><p>${c.id}</p>${closedNote(c)}</div>`).join('') + `</div>`
    : '';

  return `<h2>Complaints</h2><p class="sub">Hostel, college and mess issues. Only you and the officer handling it can see yours.</p>` +
    (message ? `<div class="item" style="margin-bottom:14px;border-color:#15803d">${message}</div>` : '') +
    // --- Form ---
    `<div class="ttcard frm"><b style="font-size:18px">Raise a complaint</b>` +
      `<div class="two">` +
        `<div><label for="cfcat">Category</label><select id="cfcat">${COMPLAINT_CATEGORIES.map(c => `<option ${c === complaintDraft.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
        `<div><label for="cfloc">Location</label><select id="cfloc">${COMPLAINT_LOCATIONS.map(c => `<option ${c === complaintDraft.loc ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
      `</div>` +
      `<label for="cftxt">Describe the problem</label>` +
      `<textarea id="cftxt" placeholder="What is wrong, and since when?">${escapeHtml(complaintDraft.txt)}</textarea>` +
      `<label for="cphoto">Photo evidence (optional)</label>` +
      `<input type="file" id="cphoto" accept="image/*">` +
      `<div id="cpv">${photoData ? `<img src="${photoData}" alt="Evidence preview" style="max-width:100%;border-radius:10px;margin-top:8px">` : ''}</div>` +
      `<div class="note" style="margin-top:12px">⏱ Every complaint gets action within <b>7 days at most</b>.</div>` +
      `<div class="err" id="cferr" role="alert"></div>` +
      `<button class="btn" id="cfsub" type="button" style="width:100%">Submit complaint</button>${duplicatePrompt}` +
    `</div>` +
    // --- My complaints ---
    `<h3 style="margin:20px 0 8px">My complaints</h3><div class="list">${mine.length ? mine.map(complaintCard).join('') : '<p class="sub">No complaints yet.</p>'}</div>` +
    // --- Open issues from others ---
    closedSection +
    `<h3 style="margin:20px 0 4px">Open issues near you</h3>` +
    `<p class="sub" style="margin:0 0 10px">Same problem? Tap Me too instead of filing a duplicate.</p><div class="list">` +
    nearby.map(q => {
      const c = q[0];
      return `<div class="item"><div class="top"><b>${escapeHtml(c.t)}</b><span class="badge">${c.cat} · ${c.loc}</span></div>` +
        `<p>${c.mt} student${c.mt === 1 ? '' : 's'} affected · ${STAGES[c.st]}</p>` +
        (isRecurring(c) ? '<span class="badge bad" style="display:inline-block;margin-top:6px">Recurring issue</span>' : '') +
        `<div>${c.me2
          ? '<button class="btn ghost sm" style="margin-top:10px" disabled type="button">You said me too ✓</button>'
          : `<button class="btn ghost sm" style="margin-top:10px" data-metoo="${q[1]}" type="button">Me too</button>`}</div></div>`;
    }).join('') +
    `</div><p class="demo">Photos are compressed on your device before upload. Demo data. The anonymous complaint box is in the ⋮ menu.</p>`;
}

// File a complaint. force = true skips the duplicate check ("File anyway").
function fileComplaint(force) {
  const cat = $('cfcat').value, loc = $('cfloc').value, txt = $('cftxt').value.trim();
  complaintDraft = { cat, loc, txt };

  if (txt.length < 10) { $('cferr').textContent = 'Please describe the problem in at least 10 characters.'; return; }

  // Look for a similar open complaint from someone else
  if (!force) {
    const dup = COMPLAINTS.findIndex(c => !isMine(c) && c.st < 3 && c.cat === cat && c.loc === loc);
    if (dup >= 0) { duplicateIndex = dup; render(); return; }
  }

  COMPLAINTS.unshift({ id: 'C-' + (200 + COMPLAINTS.length), cat, loc, t: txt.slice(0, 80), st: 0, mine: true, by: userName(), mt: 0, ts: Date.now(), photo: photoData });
  saveComplaints();
  complaintDraft = { cat: 'Hostel', loc: 'Block B', txt: '' };
  duplicateIndex = -1;
  photoData = '';
  complaintMessage = '✅ Complaint submitted. Action will be taken within 7 days at most.';
  render();
  window.scrollTo(0, 0);
}

// "Me too" instead of a duplicate complaint
function meToo(i) {
  const c = COMPLAINTS[i];
  if (c && !c.me2) { c.me2 = true; c.mt++; saveComplaints(); }
  duplicateIndex = -1;
  complaintDraft = { cat: 'Hostel', loc: 'Block B', txt: '' };
  photoData = '';
  complaintMessage = '✅ Your "Me too" was added. No duplicate complaint was filed.';
  render();
}

// Shrink the chosen photo (max 800px, JPEG 60%) and show a preview
function handlePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      photoData = canvas.toDataURL('image/jpeg', .6);
      $('cpv').innerHTML = `<img src="${photoData}" alt="Evidence preview" style="max-width:100%;border-radius:10px;margin-top:8px">` +
        `<p class="demo">Compressed to about ${Math.round(photoData.length * .75 / 1024)} KB (original ${Math.round(file.size / 1024)} KB)</p>`;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}


/* =============================================================================
   15. MESS (student)
   ============================================================================= */

// [meal, time, items]
const MESS_MENU = [
  ["Breakfast", "7:30 – 9:00 AM", ["Idli", "Sambar", "Coconut chutney", "Tea"]],
  ["Lunch", "12:30 – 2:00 PM", ["Rice", "Dalma", "Mixed veg curry", "Papad", "Curd"]],
  ["Snacks", "5:00 – 5:30 PM", ["Samosa", "Tea"]],
  ["Dinner", "8:00 – 9:30 PM", ["Chapati", "Paneer curry", "Jeera rice", "Dal fry", "Rasgulla"]]
];
let mealRatings = {};   // { meal: 'up' | 'down' | null }
let mealSkips = {};     // { meal: true }

function renderMess() {
  const skipped = Object.values(mealSkips).filter(Boolean).length;
  const rated = Object.values(mealRatings).filter(Boolean).length;

  return `<h2>Mess</h2><p class="sub">Today's menu · rate in one tap · skip a meal to cut food waste</p>` +
    `<div class="grid">` +
      `<div class="stat" style="cursor:default"><span>Meals skipped today</span><b>${skipped}</b><span>of ${MESS_MENU.length}</span></div>` +
      `<div class="stat" style="cursor:default"><span>Meals rated</span><b>${rated}</b><span>Thanks for the feedback</span></div>` +
    `</div><div class="list">` +
    MESS_MENU.map(m =>
      `<div class="item"><div class="top"><b>${m[0]}</b><span class="badge">${m[1]}</span></div><p>${m[2].join(' · ')}</p>` +
      `<div class="chips" style="margin:10px 0 0">` +
        `<button class="chip ${mealRatings[m[0]] === 'up' ? 'on' : ''}" data-mrate="${m[0]}:up" type="button" aria-label="Good">👍</button>` +
        `<button class="chip ${mealRatings[m[0]] === 'down' ? 'on' : ''}" data-mrate="${m[0]}:down" type="button" aria-label="Poor">👎</button>` +
        `<button class="chip ${mealSkips[m[0]] ? 'on' : ''}" data-mskip="${m[0]}" type="button">${mealSkips[m[0]] ? 'Skipping ✓' : 'Skip this meal'}</button>` +
      `</div></div>`
    ).join('') +
    `</div><p class="demo">Skip before the cut-off (2 hours before the meal) so the kitchen can plan. Demo data.</p>`;
}


/* =============================================================================
   16. LANGUAGES: English / Hindi / Odia
   -----------------------------------------------------------------------------
   How it works: the page is always written in English. After each render,
   translatePage() walks all text on screen and swaps any text found in the
   table below. The English text is the "key".
   TO ADD A LANGUAGE: add a column to each row, add it to TRANSLATION_MAP below,
   and add an <option> to the language selector in the HTML.
   ============================================================================= */

// Each row: [English, Hindi, Odia]
const TRANSLATIONS = [
  // --- Menus and common buttons ---
  ["Home", "होम", "ହୋମ"],
  ["Timetable", "समय सारणी", "ସମୟସୂଚୀ"],
  ["Attendance", "उपस्थिति", "ଉପସ୍ଥିତି"],
  ["Results", "परिणाम", "ଫଳାଫଳ"],
  ["Fees", "शुल्क", "ଶୁଳ୍କ"],
  ["Notices", "सूचनाएँ", "ବିଜ୍ଞପ୍ତି"],
  ["Holidays", "छुट्टियाँ", "ଛୁଟି"],
  ["Scholarships", "छात्रवृत्ति", "ଛାତ୍ରବୃତ୍ତି"],
  ["Opportunities", "अवसर", "ସୁଯୋଗ"],
  ["Leave", "अवकाश", "ଛୁଟି ଆବେଦନ"],
  ["Complaints", "शिकायतें", "ଅଭିଯୋଗ"],
  ["Mess", "मेस", "ମେସ୍"],
  ["Profile", "प्रोफ़ाइल", "ପ୍ରୋଫାଇଲ୍"],
  ["Students", "विद्यार्थी", "ଛାତ୍ରଛାତ୍ରୀ"],
  ["Edit", "संपादित करें", "ସଂପାଦନା କରନ୍ତୁ"],
  ["Save", "सहेजें", "ସେଭ୍ କରନ୍ତୁ"],
  ["Cancel", "रद्द करें", "ବାତିଲ୍ କରନ୍ତୁ"],
  ["Close with reason", "कारण देकर बंद करें", "କାରଣ ଦେଇ ବନ୍ଦ କରନ୍ତୁ"],
  ["Confirm close", "बंद करने की पुष्टि करें", "ବନ୍ଦ ନିଶ୍ଚିତ କରନ୍ତୁ"],
  ["Report an issue", "समस्या रिपोर्ट करें", "ସମସ୍ୟା ରିପୋର୍ଟ କରନ୍ତୁ"],
  ["Post notice", "सूचना पोस्ट करें", "ବିଜ୍ଞପ୍ତି ପୋଷ୍ଟ କରନ୍ତୁ"],
  ["Add holiday", "छुट्टी जोड़ें", "ଛୁଟି ଯୋଗ କରନ୍ତୁ"],
  ["Send report", "रिपोर्ट भेजें", "ରିପୋର୍ଟ ପଠାନ୍ତୁ"],
  ["Delete", "हटाएँ", "ଡିଲିଟ୍ କରନ୍ତୁ"],
  ["Achievements", "उपलब्धियाँ", "ସଫଳତା"],
  ["Staff members", "स्टाफ सदस्य", "କର୍ମଚାରୀ ସଦସ୍ୟ"],
  ["Add student", "छात्र जोड़ें", "ଛାତ୍ର ଯୋଗ କରନ୍ତୁ"],
  ["Remove", "हटाएँ", "ହଟାନ୍ତୁ"],
  ["Make CR", "सीआर बनाएँ", "ସିଆର୍ କରନ୍ତୁ"],
  ["Remove CR", "सीआर हटाएँ", "ସିଆର୍ ହଟାନ୍ତୁ"],
  ["Post achievement", "उपलब्धि पोस्ट करें", "ସଫଳତା ପୋଷ୍ଟ କରନ୍ତୁ"],
  ["My achievements", "मेरी उपलब्धियाँ", "ମୋ ସଫଳତା"],
  ["Verify", "सत्यापित करें", "ଯାଞ୍ଚ କରନ୍ତୁ"],
  ["Verified", "सत्यापित", "ଯାଞ୍ଚ ହୋଇଛି"],

  // --- Login screen ---
  ["Student", "छात्र", "ଛାତ୍ର"],
  ["Staff", "स्टाफ", "କର୍ମଚାରୀ"],
  ["Admin", "एडमिन", "ଆଡମିନ୍"],
  ["Welcome back", "वापसी पर स्वागत है", "ପୁନଃ ସ୍ୱାଗତ"],
  ["Sign in as a student", "छात्र के रूप में साइन इन करें", "ଛାତ୍ର ଭାବେ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ"],
  ["Sign in as staff", "स्टाफ के रूप में साइन इन करें", "କର୍ମଚାରୀ ଭାବେ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ"],
  ["Sign in as admin", "एडमिन के रूप में साइन इन करें", "ଆଡମିନ୍ ଭାବେ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ"],
  ["Sign in to see everything College Connect has for you.", "कॉलेज कनेक्ट में आपके लिए जो कुछ है, देखने के लिए साइन इन करें।", "କଲେଜ୍ କନେକ୍ଟରେ ଆପଣଙ୍କ ପାଇଁ ଯାହା ଅଛି ଦେଖିବାକୁ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ।"],
  ["Remember me", "मुझे याद रखें", "ମୋତେ ମନେ ରଖନ୍ତୁ"],
  ["Forgot password?", "पासवर्ड भूल गए?", "ପାସୱାର୍ଡ ଭୁଲିଗଲେ?"],
  ["Sign in", "साइन इन", "ସାଇନ୍ ଇନ୍"],
  ["Sign out", "साइन आउट", "ସାଇନ୍ ଆଉଟ୍"],
  ["About us", "हमारे बारे में", "ଆମ ବିଷୟରେ"],
  ["Complaint box", "शिकायत पेटी", "ଅଭିଯୋଗ ବାକ୍ସ"],
  ["Roll number or email", "रोल नंबर या ईमेल", "ରୋଲ୍ ନମ୍ବର କିମ୍ବା ଇମେଲ୍"],
  ["Employee ID or email", "कर्मचारी आईडी या ईमेल", "କର୍ମଚାରୀ ଆଇଡି କିମ୍ବା ଇମେଲ୍"],
  ["Admin ID or email", "एडमिन आईडी या ईमेल", "ଆଡମିନ୍ ଆଇଡି କିମ୍ବା ଇମେଲ୍"],
  ["Password", "पासवर्ड", "ପାସୱାର୍ଡ"],

  // --- Timetable, leave, fees, attendance, other pages ---
  ["Today's timetable", "आज की समय सारणी", "ଆଜିର ସମୟସୂଚୀ"],
  ["Full week", "पूरा सप्ताह", "ପୂରା ସପ୍ତାହ"],
  ["Week", "सप्ताह", "ସପ୍ତାହ"],
  ["Day", "दिन", "ଦିନ"],
  ["Apply for leave", "अवकाश के लिए आवेदन करें", "ଛୁଟି ପାଇଁ ଆବେଦନ କରନ୍ତୁ"],
  ["Leave type", "अवकाश का प्रकार", "ଛୁଟିର ପ୍ରକାର"],
  ["From", "से", "ଠାରୁ"],
  ["To", "तक", "ପର୍ଯ୍ୟନ୍ତ"],
  ["Reason", "कारण", "କାରଣ"],
  ["Submit request", "अनुरोध भेजें", "ଅନୁରୋଧ ଦାଖଲ କରନ୍ତୁ"],
  ["My requests", "मेरे अनुरोध", "ମୋ ଅନୁରୋଧ"],
  ["Approve", "स्वीकृत करें", "ଅନୁମୋଦନ କରନ୍ତୁ"],
  ["Reject", "अस्वीकार करें", "ପ୍ରତ୍ୟାଖ୍ୟାନ କରନ୍ତୁ"],
  ["Pending", "लंबित", "ବିଚାରାଧୀନ"],
  ["Approved", "स्वीकृत", "ଅନୁମୋଦିତ"],
  ["Rejected", "अस्वीकृत", "ପ୍ରତ୍ୟାଖ୍ୟାତ"],
  ["Paid", "भुगतान हुआ", "ପରିଶୋଧିତ"],
  ["Due", "बकाया", "ବାକି"],
  ["Pay now (demo)", "अभी भुगतान करें (डेमो)", "ବର୍ତ୍ତମାନ ଦେୟ ଦିଅନ୍ତୁ (ଡେମୋ)"],
  ["All", "सभी", "ସମସ୍ତ"],
  ["Present", "उपस्थित", "ଉପସ୍ଥିତ"],
  ["Absent", "अनुपस्थित", "ଅନୁପସ୍ଥିତ"],
  ["Mark attendance", "उपस्थिति दर्ज करें", "ଉପସ୍ଥିତି ଲେଖନ୍ତୁ"],
  ["Save session", "सत्र सहेजें", "ସେସନ୍ ସେଭ୍ କରନ୍ତୁ"],
  ["Mark all present", "सभी को उपस्थित करें", "ସମସ୍ତଙ୍କୁ ଉପସ୍ଥିତ କରନ୍ତୁ"],
  ["Classes you can miss", "जो कक्षाएँ आप छोड़ सकते हैं", "ଯେଉଁ କ୍ଲାସ୍ ଆପଣ ଛାଡ଼ିପାରିବେ"],
  ["Apply", "आवेदन करें", "ଆବେଦନ କରନ୍ତୁ"],
  ["Applied ✓", "आवेदन किया ✓", "ଆବେଦନ ହୋଇଛି ✓"],
  ["Who viewed my profile", "मेरी प्रोफ़ाइल किसने देखी", "ମୋ ପ୍ରୋଫାଇଲ୍ କିଏ ଦେଖିଲା"],
  ["Raise a complaint", "शिकायत दर्ज करें", "ଅଭିଯୋଗ କରନ୍ତୁ"],
  ["Submit complaint", "शिकायत भेजें", "ଅଭିଯୋଗ ଦାଖଲ କରନ୍ତୁ"],
  ["Me too", "मेरी भी यही समस्या है", "ମୋର ମଧ୍ୟ ସମାନ ସମସ୍ୟା"],
  ["My complaints", "मेरी शिकायतें", "ମୋ ଅଭିଯୋଗ"],
  ["Open issues near you", "आपके पास की खुली समस्याएँ", "ଆପଣଙ୍କ ପାଖରେ ଖୋଲା ସମସ୍ୟା"],
  ["Breakfast", "नाश्ता", "ଜଳଖିଆ"],
  ["Lunch", "दोपहर का भोजन", "ମଧ୍ୟାହ୍ନ ଭୋଜନ"],
  ["Snacks", "स्नैक्स", "ସ୍ନାକ୍ସ"],
  ["Dinner", "रात का खाना", "ରାତ୍ରି ଭୋଜନ"],
  ["Skip this meal", "यह भोजन छोड़ें", "ଏହି ଭୋଜନ ଛାଡ଼ନ୍ତୁ"],
  ["Category", "श्रेणी", "ବର୍ଗ"],
  ["Location", "स्थान", "ସ୍ଥାନ"],
  ["Submit anonymously", "गुमनाम रूप से भेजें", "ଅଜ୍ଞାତ ଭାବେ ଦାଖଲ କରନ୍ତୁ"],
  ["Toggle light / dark", "लाइट / डार्क बदलें", "ଲାଇଟ୍ / ଡାର୍କ ବଦଳାନ୍ତୁ"],
  ["Print / save marksheet", "मार्कशीट प्रिंट / सहेजें", "ମାର୍କସିଟ୍ ପ୍ରିଣ୍ଟ / ସେଭ୍ କରନ୍ତୁ"],
  ["Follow us", "हमें फ़ॉलो करें", "ଆମକୁ ଅନୁସରଣ କରନ୍ତୁ"],
  ["Next holiday", "अगली छुट्टी", "ପରବର୍ତ୍ତୀ ଛୁଟି"],
  ["Recent sessions", "हाल के सत्र", "ସାମ୍ପ୍ରତିକ ସେସନ୍"],
  ["Synced", "सिंक हो गया", "ସିଙ୍କ୍ ହୋଇଛି"],
  ["Online", "ऑनलाइन", "ଅନଲାଇନ୍"],
  ["Offline", "ऑफ़लाइन", "ଅଫଲାଇନ୍"],

  // --- Greetings, notifications, sign-in ---
  ["Good morning", "शुभ प्रभात", "ଶୁଭ ସକାଳ"],
  ["Good afternoon", "शुभ अपराह्न", "ଶୁଭ ଅପରାହ୍ନ"],
  ["Good evening", "शुभ संध्या", "ଶୁଭ ସନ୍ଧ୍ୟା"],
  ["Good night", "शुभ रात्रि", "ଶୁଭ ରାତ୍ରି"],
  ["Notifications", "अधिसूचनाएँ", "ଅଧିସୂଚନା"],
  ["Clear all", "सभी हटाएँ", "ସବୁ ହଟାନ୍ତୁ"],
  ["View", "देखें", "ଦେଖନ୍ତୁ"],
  ["NEW", "नया", "ନୂଆ"],
  ["Signing in…", "साइन इन हो रहा है…", "ସାଇନ୍ ଇନ୍ ହେଉଛି…"],
  ["Closed by admin", "एडमिन द्वारा बंद", "ଆଡମିନ୍ ଦ୍ୱାରା ବନ୍ଦ"],
  ["Closed", "बंद", "ବନ୍ଦ"],
  ["Open", "खुली", "ଖୋଲା"],
  ["Resolved", "हल हुई", "ସମାଧାନ ହୋଇଛି"]
];

// Build lookup tables: TRANSLATION_MAP.hi["Home"] -> "होम"
const TRANSLATION_MAP = { hi: {}, or: {} };
TRANSLATIONS.forEach(row => {
  TRANSLATION_MAP.hi[row[0]] = row[1];
  TRANSLATION_MAP.or[row[0]] = row[2];
});

let lang = 'en';
try { lang = localStorage.getItem('cc_lang') || 'en'; } catch (e) {}

// Remember the original English text of each text node, so we can switch back
const originalText = new WeakMap();   // node -> English text
const lastWritten = new WeakMap();    // node -> text we last wrote into it

// Login-page headline in each language (the red word is wrapped in a span)
const HEADLINE = {
  en: 'Your campus, in your <span class="red">pocket</span>.',
  hi: 'आपका कैंपस, आपकी <span class="red">जेब</span> में।',
  or: 'ଆପଣଙ୍କ କ୍ୟାମ୍ପସ୍, ଆପଣଙ୍କ <span class="red">ପକେଟ୍</span>ରେ।'
};

// Translate every text node and placeholder inside `root`
function translatePage(root) {
  if (!document.createTreeWalker || !root) return;

  document.querySelectorAll('[data-ih]').forEach(el => { el.innerHTML = HEADLINE[lang] || HEADLINE.en; });

  const table = lang === 'en' ? null : TRANSLATION_MAP[lang];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);

  nodes.forEach(n => {
    const parentName = n.parentNode && n.parentNode.nodeName;
    if (parentName === 'SCRIPT' || parentName === 'STYLE' || parentName === 'TEXTAREA' || !n.nodeValue.trim()) return;

    const current = n.nodeValue;
    // If the app wrote new text into this node, treat it as the new English original
    if (!originalText.has(n) || current !== lastWritten.get(n)) originalText.set(n, current);

    const original = originalText.get(n);
    const key = original.trim();
    const translated = table && table[key];
    const value = translated ? original.replace(key, translated) : original;

    if (value !== current) n.nodeValue = value;
    lastWritten.set(n, value);
  });

  // Placeholders (input hints) are translated the same way
  document.querySelectorAll('[placeholder]').forEach(el => {
    const current = el.placeholder;
    if (current !== el._lastPlaceholder) el._englishPlaceholder = current;
    const translated = table && table[el._englishPlaceholder];
    el.placeholder = translated || el._englishPlaceholder;
    el._lastPlaceholder = el.placeholder;
  });
}

// Change language (from the language dropdown)
function setLang(value) {
  lang = value;
  try { localStorage.setItem('cc_lang', value); } catch (e) {}
  document.documentElement.lang = value;
  document.querySelectorAll('.langsel').forEach(sel => { sel.value = value; });
  translatePage(document.body);
  movePill();
}

// Global change listener: language dropdown + form controls that react to changes
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'mcls') { selectedClass = +t.value; marks = {}; render(); }          // teacher picks a class
  else if (t.id === 'cphoto') handlePhoto(t);                                        // complaint photo
  else if (t.id === 'ccs') updateMissCalculator();                                   // attendance calculator
  else if (t.dataset && t.dataset.pos !== undefined) setPosition(+t.dataset.pos, t.value);  // admin: staff position
  else if (t.classList && t.classList.contains('langsel')) setLang(t.value);         // language dropdown
});
document.addEventListener('input', e => {
  if (e.target.id === 'ccn' || e.target.id === 'ccs') updateMissCalculator();
});

// Apply saved language on load
document.querySelectorAll('.langsel').forEach(sel => { sel.value = lang; });
if (lang !== 'en') {
  document.documentElement.lang = lang;
  translatePage(document.body);
}


/* =============================================================================
   17. STUDENTS, STAFF MEMBERS, ACHIEVEMENTS
   -----------------------------------------------------------------------------
   Admin can do everything. Teachers can add / edit student names / remove
   students, assign a CR, and verify achievements.
   ============================================================================= */

const COURSES = ['B.Tech CSE', 'B.Tech IT', 'B.Tech ECE', 'B.Tech EEE', 'B.Tech Mechanical', 'B.Tech Civil', 'MCA', 'MBA'];
const BATCHES = ['2022–2026', '2023–2027', '2024–2028', '2025–2029'];
const POSITIONS = ['Faculty', 'Mentor', 'Class Coordinator', 'HOD', 'Exam Cell Incharge', 'Warden', 'Placement Officer'];

// Students are saved in localStorage ("cc_stud"). cr = class representative.
const STUDENTS = loadJson('cc_stud',
  [["CS23-0101", "Aarav Mohanty"], ["CS23-0107", "Ananya Das"], ["CS23-0119", "Rohit Behera"], ["CS23-0125", "Priya Sahu"],
   ["CS23-0131", "Sneha Nayak"], ["CS23-0138", "Kunal Panda"], ["CS23-0142", "Ishita Rout"], ["CS23-0150", "Debashish Jena"]]
    .map(r => ({ roll: r[0], name: r[1], course: 'B.Tech CSE', year: 3, batch: '2023–2027', cr: r[0] === 'CS23-0107' }))
    .concat([
      { roll: 'IT24-0011', name: 'Manas Pradhan', course: 'B.Tech IT', year: 2, batch: '2024–2028', cr: false },
      { roll: 'EC22-0034', name: 'Smita Barik', course: 'B.Tech ECE', year: 4, batch: '2022–2026', cr: false }
    ]));

// Staff members saved in "cc_staff"
const STAFF_LIST = loadJson('cc_staff', [
  { id: 'EMP-1024', name: 'Dr. A. Mishra', dept: 'CSE', pos: 'Mentor' },
  { id: 'EMP-1031', name: 'Prof. S. Das', dept: 'Mathematics', pos: 'Faculty' },
  { id: 'EMP-1040', name: 'Dr. R. Patra', dept: 'ECE', pos: 'HOD' },
  { id: 'EMP-1052', name: 'Ms. L. Roy', dept: 'English', pos: 'Faculty' },
  { id: 'EMP-1063', name: 'Dr. K. Sahu', dept: 'CSE', pos: 'Class Coordinator' },
  { id: 'EMP-1077', name: 'Ms. P. Nayak', dept: 'CSE', pos: 'Faculty' },
  { id: 'EMP-1085', name: 'Mr. B. Sahoo', dept: 'ECE', pos: 'Warden' }
]);

// Achievements saved in "cc_ach". st = Pending | Verified | Rejected.
// vb = verified-by {n name, r role, at time}, eb = edited-by.
const ACHIEVEMENTS = loadJson('cc_ach', [
  { id: 1, who: 'You', roll: 'CS23-0142', title: 'NPTEL Gold: Data Structures', cat: 'Certification', date: '2026-08-12',
    desc: 'Scored 91% in the proctored exam.', link: '', st: 'Verified', vb: { n: 'Dr. A. Mishra', r: 'Teacher', at: 1786600000000 }, mine: true },
  { id: 2, who: 'Ananya Das', roll: 'CS23-0107', title: 'Smart India Hackathon finalist', cat: 'Hackathon', date: '2026-09-15',
    desc: 'Team of six, finalist at the nodal round.', link: '', st: 'Pending', mine: false },
  { id: 3, who: 'Rohit Behera', roll: 'CS23-0119', title: 'State level chess runner-up', cat: 'Sports', date: '2026-09-02',
    desc: 'Inter-college state championship.', link: '', st: 'Pending', mine: false }
]);
const ACHIEVEMENT_CATEGORIES = ['Hackathon', 'Certification', 'Sports', 'Paper / Research', 'Competition', 'Other'];

// [roll, name] pairs (used by attendance marking)
const studentPairs = () => STUDENTS.map(s => [s.roll, s.name]);

// Screen state for these pages
let studentFilter = 'All';   // All | 1 | 2 | 3 | 4 (year)
let removeConfirm = '';      // roll number waiting for a second tap to remove
let studentMessage = '';
let simTime = null;          // demo: pretend the time is this (minutes), null = real time
let simDay = '';             // demo: pretend the day is this
let staffMessage = '';
let achievementMessage = '';

// Current time in minutes (or the demo time)
const nowMinutes = () => simTime !== null ? simTime : new Date().getHours() * 60 + new Date().getMinutes();


/* ----- Students page (teachers + admin) ----------------------------------- */
function renderStudents() {
  const message = studentMessage; studentMessage = '';
  const isAdmin = getRole() === 'admin';
  const rows = STUDENTS.map((s, i) => [s, i]).filter(q => studentFilter === 'All' || String(q[0].year) === studentFilter);

  return `<h2>Students</h2><p class="sub">${STUDENTS.length} students · teachers and admin can add, edit or remove students and assign a CR</p>` +
    successBox(message) +
    // --- Add student form ---
    `<div class="ttcard frm"><b style="font-size:18px">Add a student</b>` +
      `<label for="snm">Full name</label><input id="snm" placeholder="Student name">` +
      `<label for="srl">Roll number</label><input id="srl" placeholder="e.g. CS24-0123">` +
      `<div class="two">` +
        `<div><label for="scr">Course</label><select id="scr">${COURSES.map(c => `<option>${c}</option>`).join('')}</select></div>` +
        `<div><label for="syr">Year</label><select id="syr">${[1, 2, 3, 4].map(y => `<option value="${y}">Year ${y}</option>`).join('')}</select></div>` +
      `</div>` +
      `<label for="sbt">Batch</label><select id="sbt">${BATCHES.map(b => `<option>${b}</option>`).join('')}</select>` +
      `<div class="err" id="serr" role="alert"></div>` +
      `<button class="btn" id="sadd" type="button" style="width:100%">Add student</button></div>` +
    // --- Year filter ---
    `<div class="chips">` +
      ['All', '1', '2', '3', '4'].map(y => `<button class="chip ${y === studentFilter ? 'on' : ''}" data-sf="${y}" type="button">${y === 'All' ? 'All' : 'Year ' + y}</button>`).join('') +
    `</div><div class="list">` +
    (rows.length ? rows.map(q => {
      const s = q[0], i = q[1];

      // Edit mode for this student
      if (editingStudent === i) {
        return `<div class="item frm"><b>Edit student</b>` +
          `<label for="esn">Full name</label><input id="esn" value="${escapeHtml(s.name)}">` +
          (isAdmin
            ? `<label for="esr">Roll number</label><input id="esr" value="${escapeHtml(s.roll)}">` +
              `<div class="two">` +
                `<div><label for="esco">Course</label><select id="esco">${COURSES.map(c => `<option ${c === s.course ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
                `<div><label for="esy">Year</label><select id="esy">${[1, 2, 3, 4].map(y => `<option value="${y}" ${y === s.year ? 'selected' : ''}>Year ${y}</option>`).join('')}</select></div>` +
              `</div>` +
              `<label for="esb">Batch</label><select id="esb">${BATCHES.map(b => `<option ${b === s.batch ? 'selected' : ''}>${b}</option>`).join('')}</select>`
            : '<p class="sub" style="margin:8px 0 0">Teachers can edit the name. Admin can edit all details.</p>') +
          `<div class="err" id="eserr" role="alert"></div>` +
          `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="ssave:${i}" type="button">Save</button><button class="btn ghost sm" data-act="scancel" type="button">Cancel</button></div></div>`;
      }

      // Normal view
      return `<div class="item"><div class="top"><b>${escapeHtml(s.name)}</b>${s.cr ? '<span class="badge ok">CR</span>' : ''}</div>` +
        `<p>${escapeHtml(s.roll)} · ${s.course} · Year ${s.year} · Batch ${s.batch}</p>` +
        `<div class="btns" style="margin-top:10px">` +
          `<button class="btn ghost sm" data-act="sed:${i}" type="button">Edit</button>` +
          `<button class="btn ghost sm" data-cr="${i}" type="button">${s.cr ? 'Remove CR' : 'Make CR'}</button>` +
          `<button class="btn ghost sm" data-rm="${i}" type="button">${removeConfirm === s.roll ? 'Tap again to confirm' : 'Remove'}</button>` +
        `</div></div>`;
    }).join('') : '<p class="sub">No students in this year.</p>') + '</div>';
}

// Add a new student (with validation)
function addStudent() {
  const name = $('snm').value.trim();
  const roll = $('srl').value.trim().toUpperCase();
  const errBox = $('serr');

  if (name.length < 2) { errBox.textContent = 'Enter the student name.'; return; }
  if (!/^[A-Z0-9-]{4,16}$/.test(roll)) { errBox.textContent = 'Roll number must be 4 to 16 letters, numbers or dashes.'; return; }
  if (STUDENTS.some(s => s.roll === roll)) { errBox.textContent = 'This roll number already exists.'; return; }

  STUDENTS.push({ roll, name, course: $('scr').value, year: +$('syr').value, batch: $('sbt').value, cr: false });
  saveJson('cc_stud', STUDENTS);
  studentMessage = '✅ ' + escapeHtml(name) + ' (' + roll + ') added.';
  render();
}

// Make / remove CR. Only one CR per course + year + batch.
function setCR(i) {
  const s = STUDENTS[i];
  if (!s) return;
  if (s.cr) {
    s.cr = false;
    studentMessage = escapeHtml(s.name) + ' is no longer CR.';
  } else {
    STUDENTS.forEach(x => { if (x.course === s.course && x.year === s.year && x.batch === s.batch) x.cr = false; });
    s.cr = true;
    studentMessage = '✅ ' + escapeHtml(s.name) + ' is now CR of ' + s.course + ' · Year ' + s.year + ' · ' + s.batch + '.';
  }
  saveJson('cc_stud', STUDENTS);
  render();
}

// Remove a student (first tap asks to confirm, second tap removes)
function removeStudent(i) {
  const s = STUDENTS[i];
  if (!s) return;
  if (removeConfirm === s.roll) {
    STUDENTS.splice(i, 1);
    saveJson('cc_stud', STUDENTS);
    removeConfirm = '';
    studentMessage = escapeHtml(s.name) + ' was removed.';
  } else {
    removeConfirm = s.roll;
  }
  render();
}


/* ----- Staff members page (admin only) ------------------------------------
   Admin can: add a new teacher with full details, edit, change position,
   and remove a teacher.
   ----------------------------------------------------------------------- */
let removeStaffConfirm = '';   // employee ID waiting for a second tap to remove

function renderStaff() {
  const message = staffMessage; staffMessage = '';
  return `<h2>Staff members</h2><p class="sub">${STAFF_LIST.length} staff · only admin can see this page, add or remove teachers, edit staff and assign positions</p>` +
    successBox(message) +
    // --- Add teacher form (all details) ---
    `<div class="ttcard frm"><b style="font-size:18px">Add a new teacher</b>` +
      `<label for="tnm">Full name</label><input id="tnm" placeholder="e.g. Dr. S. Mohapatra">` +
      `<div class="two">` +
        `<div><label for="tid">Employee ID</label><input id="tid" placeholder="e.g. EMP-1099"></div>` +
        `<div><label for="tdp">Department</label><input id="tdp" placeholder="e.g. CSE"></div>` +
      `</div>` +
      `<label for="tps">Position</label><select id="tps">${POSITIONS.map(p => `<option>${p}</option>`).join('')}</select>` +
      `<label for="tem">Email</label><input id="tem" type="email" placeholder="name@college.example">` +
      `<div class="two">` +
        `<div><label for="tph">Phone</label><input id="tph" type="tel" placeholder="10-digit mobile number"></div>` +
        `<div><label for="tjn">Joining date</label><input id="tjn" type="date" max="${todayIso()}" value="${todayIso()}"></div>` +
      `</div>` +
      `<label for="tsb">Subjects (optional)</label><input id="tsb" placeholder="e.g. Data Structures, Algorithms">` +
      `<div class="err" id="terr" role="alert"></div>` +
      `<button class="btn" id="tadd" type="button" style="width:100%">Add teacher</button></div>` +
    `<h3 style="margin:20px 0 8px">All staff</h3><div class="list">` +
    STAFF_LIST.map((x, i) => editingStaff === i
      // Edit mode
      ? `<div class="item frm"><b>Edit staff member</b>` +
          `<label for="esfn">Name</label><input id="esfn" value="${escapeHtml(x.name)}">` +
          `<label for="esfd">Department</label><input id="esfd" value="${escapeHtml(x.dept)}">` +
          `<div class="err" id="esferr" role="alert"></div>` +
          `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="stsave:${i}" type="button">Save</button><button class="btn ghost sm" data-act="stcancel" type="button">Cancel</button></div></div>`
      // Normal view
      : `<div class="item"><div class="top"><b>${escapeHtml(x.name)}</b><span class="badge ok">${x.pos}</span></div>` +
          `<p>${escapeHtml(x.id)} · ${escapeHtml(x.dept)}</p>` +
          (x.email ? `<p>${escapeHtml(x.email)}${x.phone ? ' · ' + escapeHtml(x.phone) : ''}</p>` : '') +
          (x.joined ? `<p>Joined ${new Date(x.joined + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}${x.subjects ? ' · ' + escapeHtml(x.subjects) : ''}</p>` : '') +
          `<label for="pos${i}" style="display:block;margin:10px 0 4px;font-size:13px;color:var(--muted)">Position</label>` +
          `<select id="pos${i}" data-pos="${i}">${POSITIONS.map(p => `<option ${p === x.pos ? 'selected' : ''}>${p}</option>`).join('')}</select>` +
          `<div class="btns" style="margin-top:10px">` +
            `<button class="btn ghost sm" data-act="sted:${i}" type="button">Edit</button>` +
            `<button class="btn ghost sm" data-trm="${i}" type="button">${removeStaffConfirm === x.id ? 'Tap again to confirm' : 'Remove'}</button>` +
          `</div></div>`
    ).join('') + '</div>';
}

// Add a new teacher (admin only) with validation of every detail
function addTeacher() {
  if (getRole() !== 'admin') return;   // safety: only admin can add teachers
  const name = $('tnm').value.trim();
  const id = $('tid').value.trim().toUpperCase();
  const dept = $('tdp').value.trim();
  const email = $('tem').value.trim();
  const phone = $('tph').value.trim();
  const joined = $('tjn').value;
  const errBox = $('terr');

  if (name.length < 2) { errBox.textContent = 'Enter the teacher name.'; return; }
  if (!/^[A-Z0-9-]{4,16}$/.test(id)) { errBox.textContent = 'Employee ID must be 4 to 16 letters, numbers or dashes.'; return; }
  if (STAFF_LIST.some(x => x.id === id)) { errBox.textContent = 'This employee ID already exists.'; return; }
  if (dept.length < 2) { errBox.textContent = 'Enter the department.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errBox.textContent = 'Enter a valid email address.'; return; }
  if (STAFF_LIST.some(x => x.email && x.email.toLowerCase() === email.toLowerCase())) { errBox.textContent = 'This email is already used by another staff member.'; return; }
  if (!/^(\+91)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ''))) { errBox.textContent = 'Enter a valid 10-digit mobile number.'; return; }
  if (!joined || joined > todayIso()) { errBox.textContent = 'Choose a joining date that is not in the future.'; return; }

  STAFF_LIST.push({ id, name, dept, pos: $('tps').value, email, phone, joined, subjects: $('tsb').value.trim() });
  saveJson('cc_staff', STAFF_LIST);
  staffMessage = '✅ ' + escapeHtml(name) + ' (' + id + ') added as ' + $('tps').value + '.';
  render();
}

// Remove a teacher (admin only). First tap asks to confirm, second tap removes.
function removeTeacher(i) {
  if (getRole() !== 'admin') return;
  const x = STAFF_LIST[i];
  if (!x) return;
  if (removeStaffConfirm === x.id) {
    STAFF_LIST.splice(i, 1);
    saveJson('cc_staff', STAFF_LIST);
    removeStaffConfirm = '';
    editingStaff = -1;
    staffMessage = escapeHtml(x.name) + ' was removed.';
  } else {
    removeStaffConfirm = x.id;
  }
  render();
}


// Change a staff member's position
function setPosition(i, value) {
  const x = STAFF_LIST[i];
  if (!x || !POSITIONS.includes(value)) return;
  x.pos = value;
  saveJson('cc_staff', STAFF_LIST);
  staffMessage = '✅ ' + escapeHtml(x.name) + ' is now ' + value + '.';
  render();
}


/* ----- Achievements -------------------------------------------------------- */

// One achievement card. reviewer = true when shown to teachers/admin.
const achievementCard = (a, reviewer) => achievementEditForm(a, reviewer) ||
  `<div class="item"><div class="top"><b>${escapeHtml(a.title)}</b>` +
    `<span class="badge ${a.st === 'Verified' ? 'ok' : a.st === 'Rejected' ? 'bad' : ''}">${a.st}</span></div>` +
  `<p>${reviewer ? escapeHtml(a.who) + ' · ' + escapeHtml(a.roll) + ' · ' : ''}${a.cat} · ${formatDate(a.date)}</p>` +
  (a.desc ? `<p>${escapeHtml(a.desc)}</p>` : '') +
  (isValidUrl(a.link) ? `<p><a href="${escapeHtml(a.link)}" target="_blank" rel="noopener noreferrer">Proof link</a></p>` : '') +
  // Who verified / rejected it and when (audit trail)
  (reviewer && a.st !== 'Pending'
    ? (a.vb
        ? `<p>${a.st === 'Verified' ? '✔ Verified' : '✖ Rejected'} by <b>${escapeHtml(a.vb.n)}</b> (${a.vb.r}) · ${new Date(a.vb.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>`
        : '<p>Reviewer not recorded</p>')
    : '') +
  (reviewer && a.eb ? `<p>✎ Edited by ${escapeHtml(a.eb.n)}</p>` : '') +
  (reviewer && getRole() === 'admin' ? `<button class="btn ghost sm" style="margin:8px 8px 0 0" data-act="aed:${a.id}" type="button">Edit</button>` : '') +
  (reviewer && a.st === 'Pending'
    ? `<div class="btns" style="margin-top:10px"><button class="btn sm" data-av="${a.id}:Verified" type="button">Verify</button><button class="btn ghost sm" data-av="${a.id}:Rejected" type="button">Reject</button></div>`
    : '') + `</div>`;

// Student view: post form + my achievements
function renderStudentAchievements() {
  const message = achievementMessage; achievementMessage = '';
  const mine = ACHIEVEMENTS.filter(a => a.mine);

  return `<h2>Achievements</h2><p class="sub">Post what you have achieved. A teacher verifies it before it shows as verified.</p>` +
    successBox(message) +
    `<div class="ttcard frm"><b style="font-size:18px">Post an achievement</b>` +
      `<label for="atl">Title</label><input id="atl" placeholder="e.g. Won inter-college hackathon">` +
      `<div class="two">` +
        `<div><label for="acat">Category</label><select id="acat">${ACHIEVEMENT_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>` +
        `<div><label for="adt">Date</label><input type="date" id="adt" max="${todayIso()}" value="${todayIso()}"></div>` +
      `</div>` +
      `<label for="ads">Details</label><textarea id="ads" placeholder="What did you do or win?"></textarea>` +
      `<label for="alk">Proof link (optional)</label><input id="alk" placeholder="https://">` +
      `<div class="err" id="aerr" role="alert"></div>` +
      `<button class="btn" id="achsub" type="button" style="width:100%">Post achievement</button></div>` +
    `<h3 style="margin:20px 0 8px">My achievements</h3><div class="list">` +
    (mine.length ? mine.map(a => achievementCard(a, false)).join('') : '<p class="sub">No achievements posted yet.</p>') + `</div>`;
}

// Student posts a new achievement (starts as Pending)
function submitAchievement() {
  const title = $('atl').value.trim(), link = $('alk').value.trim(), errBox = $('aerr');
  if (title.length < 3) { errBox.textContent = 'Add a title for your achievement.'; return; }
  if (link && !isValidUrl(link)) { errBox.textContent = 'The proof link must start with http:// or https://'; return; }

  ACHIEVEMENTS.unshift({
    id: Date.now(), who: userName(), roll: 'CS23-0142', title,
    cat: $('acat').value, date: $('adt').value || todayIso(),
    desc: $('ads').value.trim(), link, st: 'Pending', mine: true
  });
  saveJson('cc_ach', ACHIEVEMENTS);
  achievementMessage = '✅ Posted. A teacher will verify it soon.';
  render();
  window.scrollTo(0, 0);
}

// Teacher / admin view: waiting for verification + reviewed
function renderAchievementReview() {
  const waiting = ACHIEVEMENTS.filter(a => a.st === 'Pending');
  const reviewed = ACHIEVEMENTS.filter(a => a.st !== 'Pending');
  return `<h2>Achievements</h2><p class="sub">${waiting.length} waiting for verification</p>` +
    `<div class="list">${waiting.length ? waiting.map(a => achievementCard(a, true)).join('') : '<p class="sub">Nothing to verify right now.</p>'}</div>` +
    (reviewed.length ? `<h3 style="margin:20px 0 8px">Reviewed</h3><div class="list">${reviewed.map(a => achievementCard(a, true)).join('')}</div>` : '');
}


/* ----- Tap the running class to take attendance (staff) -------------------- */

// Jump to the Attendance tab with that class selected
function takeAttendance(className) {
  if (!CLASS_SESSIONS.includes(className)) CLASS_SESSIONS.push(className);
  selectedClass = CLASS_SESSIONS.indexOf(className);
  marks = {};
  goToTab('attendance');
}

// Demo: pretend a class is running so staff can try tap-to-mark
function toggleSimulation() {
  if (simTime !== null) { simTime = null; simDay = ''; render(); return; }

  // First lecture/lab of a given day
  const firstClass = day => (STAFF_WEEK[day] || [])
    .filter(r => r[5] === 'Lecture' || r[5] === 'Lab')
    .sort((a, b) => a[0] - b[0])[0];

  let row = firstClass(currentDayName());
  if (!row) { simDay = 'Mon'; row = firstClass('Mon'); }   // no classes today -> use Monday
  simTime = row[0] + 10;                                    // 10 minutes after it starts
  render();
}

// Extra demo button shown at the bottom of the staff timetable page
const simulationButton = () =>
  `<div class="btns" style="margin-top:16px"><button class="btn ghost sm" data-sim type="button">${simTime === null ? 'Demo: simulate class' : 'Stop demo'}</button></div>` +
  `<p class="demo">Demo: pretends a class is running so you can try tap-to-mark attendance.</p>`;


/* =============================================================================
   18. COMPLAINTS (admin) + ADMIN HOME + ADMIN PROFILE
   ============================================================================= */

// Every complaint must be dealt with within 7 days of being raised
const dueTime = c => c.ts + 7 * 864e5;
const dueDateText = c => new Date(dueTime(c)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const dueLeftText = c => {
  const days = Math.ceil((dueTime(c) - Date.now()) / 864e5);
  return days < 0 ? 'overdue · escalated' : days === 0 ? 'due today' : days + ' day' + (days === 1 ? '' : 's') + ' left';
};

let adminComplaintMessage = '';
let justChanged = '';   // complaint id that just changed (plays a short highlight)

// Move a complaint one stage forward (Submitted > Assigned > In progress > Resolved)
function advanceComplaint(i) {
  const c = COMPLAINTS[i];
  if (c && c.st < 3) {
    c.st++;
    adminComplaintMessage = '▶ ' + escapeHtml(c.id) + ' moved to ' + STAGES[c.st] + '.';
    justChanged = c.id; saveComplaints();
    render();
  }
}

// Admin complaints page
function renderAdminComplaints() {
  const message = adminComplaintMessage; adminComplaintMessage = '';
  const flashId = justChanged; justChanged = '';

  return `<h2>Complaints</h2><p class="sub">${COMPLAINTS.filter(c => c.st < 3).length} open · every complaint must be resolved within 7 days</p>` +
    successBox(message) + `<div class="list">` +
    COMPLAINTS.map((c, i) =>
      `<div class="item${flashId === c.id ? ' flash' : ''}"><div class="top"><b>${escapeHtml(c.t)}</b><span class="badge">${c.cat} · ${c.loc}</span></div>` +
      `<p>${c.id} · ${c.mt} said me too · ${slaBadge(c)}</p>` +
      (c.st < 3 ? `<p>⏱ Due ${dueDateText(c)} (${dueLeftText(c)})</p>` : '') +
      closedNote(c) +
      // Progress steps
      `<div class="steps">${STAGES.map((s, k) => `<div class="stp ${k <= c.st ? 'done' : ''}"><i></i><span>${s}</span></div>`).join('')}</div>` +
      // Action buttons
      `<div class="btns" style="margin-top:12px">` +
        ((c.st > 0 || c.closed)
          ? `<button class="btn ghost sm" data-act="back:${i}" type="button">◀ ${c.closed ? 'Reopen' : 'Back to ' + STAGES[c.st - 1]}</button>` : '') +
        (c.st < 3
          ? `<button class="btn sm" data-adv="${i}" type="button">Mark as ${STAGES[c.st + 1]} ▶</button>` +
            `<button class="btn ghost sm" data-act="clo:${i}" type="button">Close with reason</button>` : '') +
      `</div>` +
      // "Close with reason" form (only for the complaint being closed)
      (closingComplaint === i
        ? `<div class="frm" style="margin-top:10px"><label for="crs">Reason for closing</label>` +
          `<textarea id="crs" placeholder="Why is this complaint being closed?"></textarea>` +
          `<div class="err" id="crerr" role="alert"></div>` +
          `<div class="btns"><button class="btn sm" data-act="clook:${i}" type="button">Confirm close</button><button class="btn ghost sm" data-act="cloc" type="button">Cancel</button></div></div>`
        : '') +
      `</div>`
    ).join('') + '</div>';
}

// Staff view of complaints (read-only): progress and closing reasons
let staffComplaintFilter = 'All';
function renderStaffComplaints() {
  const state = c => c.closed ? 'Closed' : c.st === 3 ? 'Resolved' : 'Open';
  const count = k => COMPLAINTS.filter(c => state(c) === k).length;
  const rows = COMPLAINTS.filter(c => staffComplaintFilter === 'All' || state(c) === staffComplaintFilter)
    .sort((a, b) => ((b.closed && b.closed.at) || 0) - ((a.closed && a.closed.at) || 0));
  return `<h2>Complaints</h2><p class="sub">Progress of hostel, college and mess complaints. Only the admin can update or close them.</p>` +
    `<div class="grid">` +
      ['Open', 'Resolved', 'Closed'].map(k => `<div class="stat" style="cursor:default"><span>${k}</span><b>${count(k)}</b><span>complaints</span></div>`).join('') +
    `</div><div class="chips">` +
      ['All', 'Open', 'Resolved', 'Closed'].map(k => `<button class="chip ${k === staffComplaintFilter ? 'on' : ''}" data-cf="${k}" type="button">${k}</button>`).join('') +
    `</div><div class="list">` +
    (rows.length ? rows.map(c =>
      `<div class="item"><div class="top"><b>${escapeHtml(c.t)}</b><span class="badge">${c.cat} · ${c.loc}</span></div>` +
      `<p>${c.id} · ${c.mt} affected · ${slaBadge(c)}</p>` + closedNote(c) +
      `<div class="steps">${STAGES.map((st, k) => `<div class="stp ${k <= c.st ? 'done' : ''}"><i></i><span>${st}</span></div>`).join('')}</div></div>`
    ).join('') : '<p class="sub">Nothing here.</p>') + `</div>`;
}

// Admin home dashboard
function renderAdminHome() {
  const openComplaints = COMPLAINTS.filter(c => c.st < 3).length;
  const pendingAchievements = ACHIEVEMENTS.filter(a => a.st === 'Pending').length;
  const pendingStaffLeave = leaveRequests.staff.filter(r => r.id && r.s === 'Pending').length;

  return `<h2>${greetingHtml()}, ${displayName()} 👋</h2><p class="sub">Admin dashboard</p>` +
    `<div class="grid">` +
      `<button class="stat" data-go="students"><span>Students</span><b>${STUDENTS.length}</b><span>Add, remove, assign CR</span></button>` +
      `<button class="stat" data-go="staff"><span>Staff members</span><b>${STAFF_LIST.length}</b><span>Assign positions</span></button>` +
      `<button class="stat" data-go="complaints"><span>Open complaints</span><b>${openComplaints}</b><span>Resolve within 7 days</span></button>` +
      `<button class="stat" data-go="achievements"><span>Achievements to verify</span><b>${pendingAchievements}</b><span>Posted by students</span></button>` +
      `<button class="stat" data-go="leave"><span>Staff leave to review</span><b>${pendingStaffLeave}</b><span>Approve or reject</span></button>` +
    `</div>` +
    renderNotifications() +
    `<div class="note">⏱ Rule: every complaint must be resolved within <b>7 days at most</b>. Overdue ones are escalated.</div>` +
    renderIssueList();
}

// Admin profile page
function renderAdminProfile() {
  return `<h2>Profile</h2><p class="sub">&nbsp;</p>` +
    `<div class="item" style="display:flex;gap:16px;align-items:center;margin-bottom:14px">` +
      `<div class="avatar">${displayName()[0].toUpperCase()}</div>` +
      `<div><b style="font-size:20px">${displayName()}</b><p>Administrator</p></div></div>` +
    `<div class="kv">` +
      `<div><small>Admin ID</small>ADM-001</div>` +
      `<div><small>Email</small>admin@college.example</div>` +
      `<div><small>Can do</small>Manage students, assign staff positions, handle complaints, verify achievements</div>` +
    `</div>` +
    `<div class="btns" style="margin-top:16px"><button class="btn ghost sm" id="theme" type="button">Toggle light / dark</button></div>` +
    `<p class="demo">All details shown are demo data.</p>`;
}


/* =============================================================================
   19. NOTICES + HOLIDAYS (teacher / admin) + ISSUE REPORTS
   ============================================================================= */

// Notices posted by staff/admin are saved in "cc_nt" and shown above the demo ones
const customNotices = loadJson('cc_nt', []);
const DEMO_NOTICES = appData.notices.slice();
appData.notices = customNotices.concat(DEMO_NOTICES);

// Holidays added by staff/admin are saved in "cc_hol" and merged into the list
const customHolidays = loadJson('cc_hol', []);
customHolidays.forEach(h => HOLIDAYS.push(h));
HOLIDAYS.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

// Reported software issues saved in "cc_iss"
const ISSUES = loadJson('cc_iss', []);
const ISSUE_TYPES = ['Something is not working', 'Login problem', 'Wrong data shown', 'Display or layout', 'Feature request', 'Other'];

let noticeFilter = 'All';
let noticeMessage = '';
let holidayMessage = '';


/* ----- Notices page ------------------------------------------------------- */
// Notice layout: [category, title, date, message, audience, postedBy, editedBy]
function renderNotices() {
  const message = noticeMessage; noticeMessage = '';
  const isAdmin = getRole() === 'admin';

  // Students never see notices meant for Staff only
  const visible = appData.notices.map((n, i) => [n, i])
    .filter(q => isStaffOrAdmin() || (q[0][4] || 'Everyone') !== 'Staff')
    .filter(q => noticeFilter === 'All' || q[0][0] === noticeFilter);

  let out = '<h2>Notices</h2>' + successBox(message);

  // Compose form (teachers and admin only)
  if (isStaffOrAdmin()) {
    out += `<div class="ttcard frm" style="margin-bottom:14px"><b style="font-size:18px">Compose a notice</b>` +
      `<label for="ntt">Title</label><input id="ntt" placeholder="Notice title">` +
      `<div class="two">` +
        `<div><label for="ntc">Category</label><select id="ntc"><option>General</option><option>Exam</option><option>Fee</option><option>Event</option></select></div>` +
        `<div><label for="nta">Send to</label><select id="nta"><option>Everyone</option><option>Students</option><option>Staff</option></select></div>` +
      `</div>` +
      `<label for="ntm">Message</label><textarea id="ntm" placeholder="Write the notice"></textarea>` +
      `<div class="err" id="nterr" role="alert"></div>` +
      `<button class="btn" id="npost" type="button" style="width:100%">Post notice</button></div>`;
  }

  // Category filter chips
  out += '<div class="chips">' +
    ['All', 'Exam', 'Fee', 'Event', 'General'].map(c => `<button class="chip ${c === noticeFilter ? 'on' : ''}" data-nf="${c}" type="button">${c}</button>`).join('') +
    '</div><div class="list">';

  // The notice list (first one starts expanded)
  out += visible.map((q, k) => {
    const n = q[0], i = q[1];
    // Admin can edit all notices; teachers only the ones they posted
    const canEdit = isAdmin || (n[5] && n[5] === userName());

    // Edit mode
    if (editingNotice === i && canEdit) {
      return `<div class="item frm"><b>Edit notice</b>` +
        `<label for="ent">Title</label><input id="ent" value="${escapeHtml(n[1])}">` +
        `<div class="two">` +
          `<div><label for="enc">Category</label><select id="enc">${['General', 'Exam', 'Fee', 'Event'].map(c => `<option ${c === n[0] ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
          `<div><label for="ena">Send to</label><select id="ena">${['Everyone', 'Students', 'Staff'].map(c => `<option ${c === (n[4] || 'Everyone') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
        `</div>` +
        `<label for="enm">Message</label><textarea id="enm">${escapeHtml(n[3])}</textarea>` +
        `<div class="err" id="enerr" role="alert"></div>` +
        `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="nsave:${i}" type="button">Save</button><button class="btn ghost sm" data-act="ncancel" type="button">Cancel</button></div></div>`;
    }

    // Normal accordion item
    return `<div class="item nt ${k === 0 ? 'open' : ''}">` +
      `<button class="ntb" data-dd type="button"><b>${escapeHtml(n[1])}</b><span>${noticeNewSet.has(noticeKey(n)) ? '<span class="badge bad" style="margin-right:6px">NEW</span>' : ''}<span class="badge">${n[0]} · ${n[2]}</span><i class="chev">▾</i></span></button>` +
      `<div class="dd"><div><p>${escapeHtml(n[3])}</p>` +
        (n[5] ? `<p>Posted by ${escapeHtml(n[5])}${n[4] && n[4] !== 'Everyone' ? ' · for ' + n[4] : ''}</p>` : '') +
        (n[6] ? `<p>✎ Edited by ${escapeHtml(n[6].n)}</p>` : '') +
        (canEdit
          ? `<div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-act="ned:${i}" type="button">Edit</button><button class="btn ghost sm" data-ndel="${i}" type="button">Delete</button></div>`
          : '') +
      `</div></div></div>`;
  }).join('') + '</div>';

  return out;
}

// Post a new notice
function postNotice() {
  const title = $('ntt').value.trim(), body = $('ntm').value.trim(), errBox = $('nterr');
  if (title.length < 3) { errBox.textContent = 'Add a title.'; return; }
  if (body.length < 5) { errBox.textContent = 'Write the notice message.'; return; }

  const notice = [
    $('ntc').value, title,
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    body, $('nta').value, userName()
  ];
  appData.notices.unshift(notice);
  customNotices.unshift(notice);
  saveJson('cc_nt', customNotices);

  noticeFilter = 'All';
  noticeMessage = '✅ Notice posted for ' + escapeHtml(notice[4]) + '.';
  render();
  window.scrollTo(0, 0);
}

// Delete a notice (admin: any; teacher: only their own)
function deleteNotice(i) {
  const n = appData.notices[i];
  if (!n || (!n[5] && getRole() !== 'admin') || (getRole() !== 'admin' && n[5] !== userName())) return;

  appData.notices.splice(i, 1);
  const j = customNotices.indexOf(n);
  if (j >= 0) customNotices.splice(j, 1);
  saveJson('cc_nt', customNotices);
  noticeMessage = 'Notice deleted.';
  render();
}


/* ----- Holidays page (staff/admin get an "add holiday" form) --------------- */
function renderHolidaysPage() {
  let out = renderHolidays();
  if (!isStaffOrAdmin()) return out;   // students only see the list

  const message = holidayMessage; holidayMessage = '';
  const addForm = `${successBox(message)}` +
    `<div class="ttcard frm" style="margin:0 0 14px"><b style="font-size:18px">Add a holiday</b>` +
      `<label for="hnm">Holiday name</label><input id="hnm" placeholder="e.g. College Foundation Day">` +
      `<div class="two">` +
        `<div><label for="hdt">Date</label><input type="date" id="hdt" min="${HOLIDAY_YEAR}-01-01" max="${HOLIDAY_YEAR}-12-31"></div>` +
        `<div><label for="hty">Type</label><select id="hty"><option>College</option><option>National</option><option>Odisha</option><option>Festival</option></select></div>` +
      `</div>` +
      `<div class="err" id="herr" role="alert"></div>` +
      `<button class="btn" id="hadd" type="button" style="width:100%">Add holiday</button></div>`;

  // Put the form right after the first </p> (the "x holidays this year" line)
  out = out.replace('</p>', '</p>' + addForm);

  // List of holidays added by staff, with edit / delete
  if (customHolidays.length) {
    out += '<h3 style="margin:20px 0 8px">Added by staff</h3><div class="list">' +
      customHolidays.map((h, i) => editingHoliday === i
        ? holidayEditForm(h, i)
        : `<div class="item"><div class="top"><b>${escapeHtml(h[2])}</b><span class="badge">${h[3]}</span></div>` +
          `<p>${h[1]} ${MONTH_NAMES[h[0]]}</p>` +
          `<div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-act="hed:${i}" type="button">Edit</button><button class="btn ghost sm" data-hdel="${i}" type="button">Delete</button></div></div>`
      ).join('') + '</div>';
  }
  return out;
}

// Add a holiday
function addHoliday() {
  const name = $('hnm').value.trim(), date = $('hdt').value, errBox = $('herr');
  if (name.length < 3) { errBox.textContent = 'Enter the holiday name.'; return; }
  if (!date || date.slice(0, 4) !== String(HOLIDAY_YEAR)) { errBox.textContent = 'Pick a date in ' + HOLIDAY_YEAR + '.'; return; }

  const month = +date.slice(5, 7) - 1, day = +date.slice(8, 10);
  if (HOLIDAYS.some(h => h[0] === month && h[1] === day && h[2].toLowerCase() === name.toLowerCase())) {
    errBox.textContent = 'This holiday is already in the list.'; return;
  }

  const holiday = [month, day, name, $('hty').value];
  HOLIDAYS.push(holiday);
  customHolidays.push(holiday);
  HOLIDAYS.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  saveJson('cc_hol', customHolidays);
  holidayMessage = '✅ ' + escapeHtml(name) + ' added on ' + day + ' ' + MONTH_NAMES[month] + '.';
  render();
}

// Delete a holiday added by staff
function deleteHoliday(i) {
  const h = customHolidays[i];
  if (!h) return;
  const j = HOLIDAYS.indexOf(h);
  if (j >= 0) HOLIDAYS.splice(j, 1);
  customHolidays.splice(i, 1);
  saveJson('cc_hol', customHolidays);
  holidayMessage = 'Holiday removed.';
  render();
}


/* ----- Report an issue (bottom sheet) + admin list ------------------------- */
function renderIssueForm() {
  return `<h2 style="margin:0 0 6px">Report an issue</h2>` +
    `<p class="sub">Found a problem with the app? Tell us and the admin team will look at it.</p>` +
    `<div class="frm">` +
      `<label for="ity">What kind of problem?</label>` +
      `<select id="ity">${ISSUE_TYPES.map(t => `<option>${t}</option>`).join('')}</select>` +
      `<label for="itx">Describe what happened</label>` +
      `<textarea id="itx" placeholder="What did you do, and what went wrong?"></textarea>` +
      `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="itd" checked style="width:auto"> Include technical details (page, language, browser)</label>` +
      `<div class="err" id="ierr" role="alert"></div>` +
      `<button class="btn" id="isub" type="button" style="width:100%">Send report</button>` +
    `</div><p class="demo">Demo mode: reports stay in this browser and show up on the admin dashboard.</p>`;
}

// Save the issue report
function submitIssue() {
  const text = $('itx').value.trim(), errBox = $('ierr');
  if (text.length < 10) { errBox.textContent = 'Please describe the problem in at least 10 characters.'; return; }

  const id = 'BUG-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const includeDetails = $('itd').checked;

  ISSUES.unshift({
    id, type: $('ity').value, txt: text, role: getRole(), tab: appData.tab, lang,
    ua: includeDetails && typeof navigator !== 'undefined' ? navigator.userAgent : '',
    at: Date.now(), st: 'Open'
  });
  saveJson('cc_iss', ISSUES);

  $('sbody').innerHTML = `<div class="tick" style="margin-top:10px">✓</div>` +
    `<h2 style="text-align:center;margin:0 0 6px">Report sent</h2>` +
    `<p class="sub" style="text-align:center">Thank you. Reference: <b>${id}</b></p>` +
    `<div class="btns" style="justify-content:center"><button class="btn sm" data-close type="button">Done</button></div>`;
  translatePage($('sheet'));
}

// Admin dashboard: list of open issue reports
function renderIssueList() {
  const open = ISSUES.filter(x => x.st === 'Open');
  return `<h3 style="margin:20px 0 8px">Reported software issues</h3><div class="list">` +
    (open.length
      ? open.slice(0, 6).map(x =>
          `<div class="item"><div class="top"><b>${escapeHtml(x.type)}</b><span class="badge bad">${x.id}</span></div>` +
          `<p>${escapeHtml(x.txt)}</p>` +
          `<p style="font-size:12px">${x.role} · page: ${x.tab} · ${new Date(x.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${x.ua ? ' · ' + escapeHtml(x.ua.slice(0, 60)) : ''}</p>` +
          `<button class="btn ghost sm" style="margin-top:8px" data-iss="${x.id}" type="button">Mark resolved</button></div>`).join('')
      : '<p class="sub">No open issues. 🎉</p>') + `</div>`;
}


/* =============================================================================
   20. INLINE EDITING
   -----------------------------------------------------------------------------
   Admin edits everything. Teachers edit student names and their own notices.
   The "editing…" variables hold which item is currently open in edit mode
   (-1 / null = none).
   ============================================================================= */

let editingNotice = -1;
let editingAchievement = null;
let editingStudent = -1;
let editingStaff = -1;
let editingHoliday = -1;
let closingComplaint = -1;

// Buttons with data-act="name:value" call one of these (see click handler)
const ACTIONS = {
  ned: i => { editingNotice = +i; render(); },
  ncancel: () => { editingNotice = -1; render(); },
  nsave: i => saveNotice(+i),

  aed: id => { editingAchievement = id; render(); },
  acancel: () => { editingAchievement = null; render(); },
  asave: id => saveAchievement(id),

  sed: i => { editingStudent = +i; render(); },
  scancel: () => { editingStudent = -1; render(); },
  ssave: i => saveStudent(+i),

  sted: i => { editingStaff = +i; render(); },
  stcancel: () => { editingStaff = -1; render(); },
  stsave: i => saveStaff(+i),

  hed: i => { editingHoliday = +i; render(); },
  hcancel: () => { editingHoliday = -1; render(); },
  hsave: i => saveHoliday(+i),

  back: i => stepComplaintBack(+i),
  clo: i => { closingComplaint = +i; render(); },
  cloc: () => { closingComplaint = -1; render(); },
  clook: i => closeComplaint(+i)
};

// Save an edited notice
function saveNotice(i) {
  const n = appData.notices[i];
  if (!n) return;
  const title = $('ent').value.trim(), body = $('enm').value.trim(), errBox = $('enerr');
  if (title.length < 3) { errBox.textContent = 'Add a title.'; return; }
  if (body.length < 5) { errBox.textContent = 'Write the notice message.'; return; }

  n[0] = $('enc').value;
  n[1] = title;
  n[3] = body;
  n[4] = $('ena').value;
  n[6] = { n: userName(), at: Date.now() };       // "edited by" record
  if (customNotices.includes(n)) saveJson('cc_nt', customNotices);
  editingNotice = -1;
  noticeMessage = '✅ Notice updated.';
  render();
}

// Save an edited student (teachers: name only; admin: all fields)
function saveStudent(i) {
  const s = STUDENTS[i];
  if (!s) return;
  const isAdmin = getRole() === 'admin';
  const name = $('esn').value.trim(), errBox = $('eserr');
  if (name.length < 2) { errBox.textContent = 'Enter the student name.'; return; }

  let roll = s.roll, course = s.course, year = s.year, batch = s.batch;
  if (isAdmin) {
    roll = $('esr').value.trim().toUpperCase();
    course = $('esco').value;
    year = +$('esy').value;
    batch = $('esb').value;
    if (!/^[A-Z0-9-]{4,16}$/.test(roll)) { errBox.textContent = 'Roll number must be 4 to 16 letters, numbers or dashes.'; return; }
    if (STUDENTS.some((x, k) => k !== i && x.roll === roll)) { errBox.textContent = 'This roll number already exists.'; return; }
  }

  // Keep achievements linked to this student when the roll number / name changes
  const oldRoll = s.roll, oldName = s.name;
  ACHIEVEMENTS.forEach(a => {
    if (a.roll === oldRoll) { a.roll = roll; if (a.who === oldName) a.who = name; }
  });
  saveJson('cc_ach', ACHIEVEMENTS);

  // Moving to another course / year / batch removes the CR badge
  if (course !== s.course || year !== s.year || batch !== s.batch) s.cr = false;

  Object.assign(s, { name, roll, course, year, batch });
  saveJson('cc_stud', STUDENTS);
  editingStudent = -1;
  studentMessage = '✅ ' + escapeHtml(name) + ' updated.';
  render();
}

// Save an edited staff member
function saveStaff(i) {
  const x = STAFF_LIST[i];
  if (!x) return;
  const name = $('esfn').value.trim(), dept = $('esfd').value.trim(), errBox = $('esferr');
  if (name.length < 2) { errBox.textContent = 'Enter the staff name.'; return; }
  if (dept.length < 2) { errBox.textContent = 'Enter the department.'; return; }

  x.name = name;
  x.dept = dept;
  saveJson('cc_staff', STAFF_LIST);
  editingStaff = -1;
  staffMessage = '✅ ' + escapeHtml(name) + ' updated.';
  render();
}

// Edit form for an achievement (admin only)
function achievementEditForm(a, reviewer) {
  if (!(reviewer && getRole() === 'admin' && editingAchievement !== null && String(editingAchievement) === String(a.id))) return '';

  return `<div class="item frm"><b>Edit achievement</b>` +
    `<label for="eat">Title</label><input id="eat" value="${escapeHtml(a.title)}">` +
    `<div class="two">` +
      `<div><label for="eac">Category</label><select id="eac">${ACHIEVEMENT_CATEGORIES.map(c => `<option ${c === a.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
      `<div><label for="ead">Date</label><input type="date" id="ead" value="${a.date}" max="${todayIso()}"></div>` +
    `</div>` +
    `<label for="eas">Details</label><textarea id="eas">${escapeHtml(a.desc || '')}</textarea>` +
    `<label for="eal">Proof link</label><input id="eal" value="${escapeHtml(a.link || '')}">` +
    `<label for="eaz">Status</label><select id="eaz">${['Pending', 'Verified', 'Rejected'].map(s => `<option ${s === a.st ? 'selected' : ''}>${s}</option>`).join('')}</select>` +
    `<div class="err" id="eaerr" role="alert"></div>` +
    `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="asave:${a.id}" type="button">Save</button><button class="btn ghost sm" data-act="acancel" type="button">Cancel</button></div></div>`;
}

// Save an edited achievement
function saveAchievement(id) {
  const a = ACHIEVEMENTS.find(x => String(x.id) === String(id));
  if (!a) return;
  const title = $('eat').value.trim(), link = $('eal').value.trim(), errBox = $('eaerr');
  if (title.length < 3) { errBox.textContent = 'Add a title.'; return; }
  if (link && !isValidUrl(link)) { errBox.textContent = 'The proof link must start with http:// or https://'; return; }

  const newStatus = $('eaz').value;
  a.title = title;
  a.cat = $('eac').value;
  a.date = $('ead').value || a.date;
  a.desc = $('eas').value.trim();
  a.link = link;
  a.eb = { n: userName(), at: Date.now() };      // "edited by" record

  // If the status changed, update the verifier record too
  if (newStatus !== a.st) {
    a.st = newStatus;
    if (newStatus === 'Pending') delete a.vb;
    else a.vb = { n: userName(), r: 'Admin', at: Date.now() };
  }
  saveJson('cc_ach', ACHIEVEMENTS);
  editingAchievement = null;
  render();
}

// Edit form for a staff-added holiday
function holidayEditForm(h, i) {
  const dateValue = `${HOLIDAY_YEAR}-${String(h[0] + 1).padStart(2, '0')}-${String(h[1]).padStart(2, '0')}`;
  return `<div class="item frm"><b>Edit holiday</b>` +
    `<label for="ehn">Holiday name</label><input id="ehn" value="${escapeHtml(h[2])}">` +
    `<div class="two">` +
      `<div><label for="ehd">Date</label><input type="date" id="ehd" min="${HOLIDAY_YEAR}-01-01" max="${HOLIDAY_YEAR}-12-31" value="${dateValue}"></div>` +
      `<div><label for="eht">Type</label><select id="eht">${['College', 'National', 'Odisha', 'Festival'].map(t => `<option ${t === h[3] ? 'selected' : ''}>${t}</option>`).join('')}</select></div>` +
    `</div>` +
    `<div class="err" id="eherr" role="alert"></div>` +
    `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="hsave:${i}" type="button">Save</button><button class="btn ghost sm" data-act="hcancel" type="button">Cancel</button></div></div>`;
}

// Save an edited holiday
function saveHoliday(i) {
  const h = customHolidays[i];
  if (!h) return;
  const name = $('ehn').value.trim(), date = $('ehd').value, errBox = $('eherr');
  if (name.length < 3) { errBox.textContent = 'Enter the holiday name.'; return; }
  if (!date || date.slice(0, 4) !== String(HOLIDAY_YEAR)) { errBox.textContent = 'Pick a date in ' + HOLIDAY_YEAR + '.'; return; }

  const month = +date.slice(5, 7) - 1, day = +date.slice(8, 10);
  if (HOLIDAYS.some(other => other !== h && other[0] === month && other[1] === day && other[2].toLowerCase() === name.toLowerCase())) {
    errBox.textContent = 'This holiday is already in the list.'; return;
  }

  h[0] = month; h[1] = day; h[2] = name; h[3] = $('eht').value;
  HOLIDAYS.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  saveJson('cc_hol', customHolidays);
  editingHoliday = -1;
  holidayMessage = '✅ Holiday updated.';
  render();
}

// Admin: go one stage back (or reopen a closed complaint)
function stepComplaintBack(i) {
  const c = COMPLAINTS[i];
  if (!c) return;
  if (c.closed) {
    delete c.closed;
    c.st = 2;
    adminComplaintMessage = '↩ ' + escapeHtml(c.id) + ' reopened at In progress.';
  } else if (c.st > 0) {
    c.st--;
    adminComplaintMessage = '◀ ' + escapeHtml(c.id) + ' moved back to ' + STAGES[c.st] + '.';
  }
  justChanged = c.id; saveComplaints();
  render();
}

// Admin: close a complaint with a written reason
function closeComplaint(i) {
  const c = COMPLAINTS[i], reason = $('crs').value.trim(), errBox = $('crerr');
  if (!c) return;
  if (reason.length < 5) { errBox.textContent = 'Please give a reason (at least 5 characters).'; return; }

  c.closed = { reason, by: userName(), at: Date.now() };
  c.st = 3;
  closingComplaint = -1;
  adminComplaintMessage = '🔒 ' + escapeHtml(c.id) + ' closed. Students and staff can now see it with your reason.';
  justChanged = c.id; saveComplaints();
  render();
}


/* =============================================================================
   21. TIMETABLE VIEWS (week table / single day)
   ============================================================================= */

let timetableView = 'week';   // 'week' | 'day'
let timetableDay = null;      // day chosen in the Day view
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Day shown in the Day view: chosen day, else today, else Monday
const selectedDay = () => timetableDay || (currentWeek()[currentDayName()] ? currentDayName() : 'Mon');

// Week table: one row per period, one column per day. Labs span two rows.
function renderWeekTable() {
  const today = currentDayName();
  const periodStarts = PERIOD_SLOTS.map(p => p[0]);
  const skipCell = {};   // cells already covered by a 2-hour lab (rowspan)

  const rows = periodStarts.map((start, i) =>
    `<tr><th class="tm">${formatMinutes(start)}<small>${formatMinutes(PERIOD_SLOTS[i][1])}</small></th>` +
    DAYS.map(day => {
      if (skipCell[day + i]) return '';
      const row = (currentWeek()[day] || []).find(e => e[0] === start);
      const todayClass = day === today ? 'tdy' : '';

      if (!row) return `<td class="${todayClass}"><span class="emp">—</span></td>`;

      const rowspan = row[1] - row[0] > 60 ? 2 : 1;
      if (rowspan > 1) skipCell[day + (i + 1)] = 1;
      return `<td rowspan="${rowspan}" class="c ${row[5] === 'Lab' ? 'lab' : ''} ${todayClass}"><b>${row[2]}</b><small>${row[3]}</small></td>`;
    }).join('') + '</tr>'
  ).join('');

  return `<div class="wk"><table><thead><tr><th></th>${DAYS.map(d => `<th class="${d === today ? 'tdy' : ''}">${d}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` +
    `<p class="demo">Highlighted column is today. Shaded blocks are 2-hour labs. Scroll sideways to see all days.</p>`;
}

// Day view: day chips + timeline
function renderDayView() {
  const day = selectedDay(), rows = getFullDay(day), nowMin = nowMinutes(), isToday = day === currentDayName();
  return '<div class="chips">' +
    DAYS.map(d => `<button class="chip ${d === day ? 'on' : ''}" data-td="${d}">${d}${d === currentDayName() ? ' •' : ''}</button>`).join('') +
    '</div><div class="tl">' +
    rows.map(r => slotHtml(r, isToday ? (nowMin >= r[1] ? 'done' : nowMin >= r[0] ? 'now' : 'up') : null)).join('') +
    '</div>';
}


/* =============================================================================
   22. MAIN RENDER FUNCTION
   -----------------------------------------------------------------------------
   render() redraws every page. It is called after any data change.
   Page containers in the HTML are named pg-<tab id> (pg-home, pg-fees, ...).
   ============================================================================= */

// Pages that are the same for the basic (student-style) layout
function renderBasePages() {
  renderTabs();

  // --- Student home ---
  $('pg-home').innerHTML =
    `<h2>${greetingHtml()}, ${displayName()} 👋</h2><p class="sub">Here is your campus at a glance.</p><div class="grid">` +
    `<button class="stat" data-go="attendance"><span>Attendance</span><b>${overallAttendance()}%</b><span>${overallAttendance() < 75 ? 'Below 75% limit' : 'Above 75% limit'}</span></button>` +
    `<button class="stat" data-go="fees"><span>Fees due</span><b>${formatRupees(totalFeesDue())}</b><span>Next: 15 Oct 2026</span></button>` +
    `<button class="stat" data-go="notices"><span>New notices</span><b>${appData.notices.length}</b><span>Latest: ${appData.notices[0][1]}</span></button>` +
    `<button class="stat" data-go="scholarships"><span>Scholarships open</span><b>${appData.scholarships.length}</b><span>${Object.keys(appData.appliedScholarships).length} applied</span></button></div>` +
    renderNotifications() +
    renderTodayTimetable();

  // --- Timetable (Week / Day switch) ---
  $('pg-timetable').innerHTML =
    `<h2>Timetable</h2><p class="sub">${getRole() === 'staff' ? 'Your teaching schedule' : 'Semester 3 · Computer Science'}</p>` +
    `<div class="chips"><button class="chip ${timetableView === 'week' ? 'on' : ''}" data-tv="week">Week</button>` +
    `<button class="chip ${timetableView === 'day' ? 'on' : ''}" data-tv="day">Day</button></div>` +
    (timetableView === 'week' ? renderWeekTable() : renderDayView());

  // --- Fees ---
  $('pg-fees').innerHTML =
    `<h2>Fees</h2><p class="sub">Total due: <b>${formatRupees(totalFeesDue())}</b></p><div class="list">` +
    appData.fees.map((f, i) =>
      `<div class="item"><div class="top"><b>${f[0]}</b><span class="badge ${f[2] ? 'ok' : 'bad'}">${f[2] ? 'Paid' : 'Due'}</span></div>` +
      `<p>${formatRupees(f[1])} · ${f[2] ? 'Paid on' : 'Last date'} ${f[3]}</p>` +
      (f[2] ? '' : `<button class="btn sm" style="margin-top:10px" data-pay="${i}">Pay now (demo)</button>`) + `</div>`
    ).join('') + '</div>';

  // --- Scholarships ---
  $('pg-scholarships').innerHTML =
    `<h2>Scholarships</h2><p class="sub">Updates for this academic year</p>` +
    `<div class="item" style="margin-bottom:14px"><b>📢 Update</b><p>Merit and Need-Based applications close in October. Keep income and marks documents ready.</p></div><div class="list">` +
    appData.scholarships.map((s, i) =>
      `<div class="item"><div class="top"><b>${s[0]}</b><span class="badge">${s[1]}</span></div>` +
      `<p>Eligibility: ${s[2]} · Last date: ${s[3]}</p>` +
      `<button class="btn sm ${appData.appliedScholarships[i] ? 'ghost' : ''}" style="margin-top:10px" data-ap="${i}">${appData.appliedScholarships[i] ? 'Applied ✓' : 'Apply (demo)'}</button></div>`
    ).join('') + '</div>';

  // --- Student profile ---
  $('pg-profile').innerHTML =
    `<h2>Profile</h2><p class="sub">&nbsp;</p>` +
    `<div class="item" style="display:flex;gap:16px;align-items:center;margin-bottom:14px">` +
      `<div class="avatar">${displayName()[0].toUpperCase()}</div>` +
      `<div><b style="font-size:20px">${displayName()}</b><p>B.Tech · Computer Science · Semester 3</p></div></div>` +
    `<div class="kv">` +
      `<div><small>Roll number</small>CS23-0142</div>` +
      `<div><small>Email</small>student@college.example</div>` +
      `<div><small>Phone</small>+91 98765 43210</div>` +
      `<div><small>Batch</small>2023 – 2027</div>` +
      `<div><small>Mentor</small>Dr. A. Mishra</div>` +
      `<div><small>Hostel</small>Block B, Room 214</div>` +
    `</div>` +
    `<div class="btns" style="margin-top:16px"><button class="btn ghost sm" id="theme" type="button">Toggle light / dark</button></div>` +
    `<p class="demo">All details shown are demo data.</p>` +
    `<p class="swipe-hint">Tip: swipe left or right anywhere on a page to switch menus.</p>`;
}

// Draw everything for the current role
function render() {
  // Opening the Notices page means the new notices have been seen (clears the menu dot)
  if (appData.tab === 'notices') {
    unseenNotices().forEach(n => noticeNewSet.add(noticeKey(n)));
    markNoticesSeen();
  }
  // Same for closed complaints: opening Complaints means they have been seen
  if (appData.tab === 'complaints') {
    unseenClosures().forEach(c => closedNewSet.add(closeKey(c)));
    markClosuresSeen();
  }
  renderBasePages();
  const role = getRole();

  if (role === 'admin') {
    $('pg-home').innerHTML = renderAdminHome();
    $('pg-students').innerHTML = renderStudents();
    $('pg-staff').innerHTML = renderStaff();
    $('pg-achievements').innerHTML = renderAchievementReview();
    $('pg-complaints').innerHTML = renderAdminComplaints();
    $('pg-leave').innerHTML = renderAdminLeave();
    $('pg-profile').innerHTML = renderAdminProfile();
  } else {
    if (role === 'staff') {
      $('pg-home').innerHTML = renderStaffHome();
      $('pg-profile').innerHTML = renderStaffProfile();
      $('pg-attendance').innerHTML = renderMarkAttendance();
      $('pg-students').innerHTML = renderStudents();
      $('pg-achievements').innerHTML = renderAchievementReview();
      $('pg-timetable').innerHTML += simulationButton();
      $('pg-complaints').innerHTML = renderStaffComplaints();
    } else {
      // student
      $('pg-results').innerHTML = renderResults();
      $('pg-attendance').innerHTML = renderStudentAttendance();
      $('pg-opps').innerHTML = renderOpportunities();
      $('pg-achievements').innerHTML = renderStudentAchievements();
      $('pg-complaints').innerHTML = renderComplaints();
      $('pg-mess').innerHTML = renderMess();
    }
    $('pg-leave').innerHTML = renderLeave();   // student + staff
  }

  // Shared by all roles
  $('pg-notices').innerHTML = renderNotices();
  $('pg-holidays').innerHTML = renderHolidaysPage();

  translatePage(document.body);
  movePill();
}


/* =============================================================================
   23. NAVIGATION (tabs, swipe, keyboard)
   ============================================================================= */

// Open a tab. dir = 1 (came from the right) or -1 (from the left) for the slide animation.
function goToTab(name, dir) {
  if (name !== appData.tab) { noticeNewSet.clear(); closedNewSet.clear(); }   // forget "NEW" labels when leaving Notices
  // Reset temporary UI state when leaving a page
  leaveMessage = '';
  removeConfirm = '';
  removeStaffConfirm = '';
  editingNotice = -1;
  editingAchievement = null;
  editingStudent = -1;
  editingStaff = -1;
  editingHoliday = -1;
  closingComplaint = -1;

  // Work out slide direction from tab order
  const oldIndex = currentTabs().findIndex(t => t[0] === appData.tab);
  const newIndex = currentTabs().findIndex(t => t[0] === name);
  if (dir === undefined && oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) dir = newIndex > oldIndex ? 1 : -1;

  appData.tab = name;
  document.querySelectorAll('.pg').forEach(p => p.classList.add('hidden'));
  const page = $('pg-' + name);
  page.classList.remove('hidden', 'from-l', 'from-r', 'cas');

  render();

  // Page animations
  void page.offsetWidth;
  page.classList.add('cas');
  clearTimeout(window._cascadeTimer);
  window._cascadeTimer = setTimeout(() => page.classList.remove('cas'), 1100);
  if (dir) {
    void page.offsetWidth;
    page.classList.add(dir > 0 ? 'from-r' : 'from-l');
  }

  // Scroll the active tab into the middle of the tab bar
  const active = document.querySelector('.tab.on'), bar = $('tabs');
  if (active) bar.scrollTo({ left: active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
  window.scrollTo(0, 0);
}

// Go to the next (+1) or previous (-1) tab
function stepTab(direction) {
  const i = currentTabs().findIndex(t => t[0] === appData.tab);
  const j = i + direction;
  if (i < 0) return;
  if (j >= 0 && j < currentTabs().length) goToTab(currentTabs()[j][0], direction);
}

// Swipe left / right to change tabs (ignored on inputs, the tab bar and the week table)
let swipeStartX = 0, swipeStartY = 0, swipeStartTime = 0, swipeAllowed = false;
const mainEl = document.querySelector('#siteView main');

mainEl.addEventListener('touchstart', e => {
  const touch = e.touches[0];
  swipeStartX = touch.clientX;
  swipeStartY = touch.clientY;
  swipeStartTime = Date.now();
  swipeAllowed = !e.target.closest('input,textarea,select,.tabs,.wk,.ncard');
}, { passive: true });

mainEl.addEventListener('touchend', e => {
  if (!swipeAllowed) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - swipeStartX, dy = touch.clientY - swipeStartY;
  // Must be mostly horizontal, long enough and quick
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - swipeStartTime < 800) stepTab(dx < 0 ? 1 : -1);
}, { passive: true });

// Arrow keys also switch tabs (not while typing)
document.addEventListener('keydown', e => {
  if ($('siteView').classList.contains('hidden') || e.target.closest('input,textarea,select')) return;
  if (e.key === 'ArrowRight') stepTab(1);
  if (e.key === 'ArrowLeft') stepTab(-1);
});

// Called once after sign in
function initSite() {
  simTime = null;
  simDay = '';
  goToTab('home');
}


/* =============================================================================
   24. GLOBAL CLICK HANDLER
   -----------------------------------------------------------------------------
   One listener handles every button in the app. Each button carries a
   data-… attribute (or an id) that says what it does.
   ============================================================================= */

// Everything clickable that this handler cares about
const CLICKABLE = '[data-go],[data-pay],[data-ap],[data-nf],[data-tv],[data-td],[data-hf],[data-ap2],[data-dd],[data-rs],[data-print],[data-tt],[data-kb],[data-mk],[data-allp],[data-msave],[data-off],[data-sync],[data-oapply],[data-act],[data-take],[data-sim],[data-iss],[data-ndel],[data-hdel],#npost,#hadd,#isub,[data-cr],[data-rm],[data-trm],#tadd,[data-av],[data-adv],[data-sf],#sadd,#achsub,[data-metoo],[data-force],[data-mrate],[data-mskip],#cfsub,[data-sheet],[data-close],[data-again],#csub,#lsub,#theme,[data-sl],[data-ndis],[data-nclear],[data-cf]';

document.addEventListener('click', e => {
  // Clicking anywhere outside the ⋮ menu closes it
  if (!e.target.closest('.kb')) document.querySelectorAll('.kb.open').forEach(k => k.classList.remove('open'));

  const t = e.target.closest(CLICKABLE);
  if (!t) return;

  // ----- Navigation -----
  if (t.dataset.go) { e.preventDefault(); goToTab(t.dataset.go); }

  // ----- Fees + scholarships -----
  else if (t.dataset.pay) {                                  // pay a fee (demo)
    appData.fees[t.dataset.pay][2] = 1;
    appData.fees[t.dataset.pay][3] = '30 Sep 2026';
    render();
  }
  else if (t.dataset.ap) {                                   // apply / withdraw scholarship
    const applied = appData.appliedScholarships;
    applied[t.dataset.ap] = !applied[t.dataset.ap];
    if (!applied[t.dataset.ap]) delete applied[t.dataset.ap];
    render();
  }

  // ----- Filters + view switches -----
  else if (t.dataset.nf) { noticeFilter = t.dataset.nf; render(); }
  else if (t.dataset.hf) { holidayFilter = t.dataset.hf; render(); }
  else if (t.dataset.tv) { timetableView = t.dataset.tv; render(); }
  else if (t.dataset.td) { timetableDay = t.dataset.td; render(); }
  else if (t.dataset.sf) { studentFilter = t.dataset.sf; render(); }
  else if (t.dataset.cf) { staffComplaintFilter = t.dataset.cf; render(); }
  else if (t.dataset.rs) { selectedSemester = t.dataset.rs; render(); }

  // ----- Leave -----
  else if (t.dataset.ap2) {                                  // staff approves / rejects a student leave
    const [id, status] = t.dataset.ap2.split(':');
    decideStudentLeave(id, status);
  }
  else if (t.dataset.sl) {                                   // admin approves / rejects a staff leave
    const [id, status] = t.dataset.sl.split(':');
    decideStaffLeave(id, status);
  }
  else if (t.hasAttribute('data-nclear')) clearAllNotifs();  // dashboard: remove all notifications
  else if (t.dataset.ndis !== undefined) {                   // dashboard: remove one notification (✕ button)
    const card = t.closest('.ncard');
    if (card && !card.classList.contains('out')) { flyOut(card, 1); setTimeout(() => { dismissNotifs([card.dataset.nid]); refreshNotifs(); }, 420); }
  }
  else if (t.id === 'lsub') submitLeave();

  // ----- Notices: open / close a notice -----
  else if (t.hasAttribute('data-dd')) t.closest('.item').classList.toggle('open');

  // ----- Theme -----
  else if (t.id === 'theme' || t.hasAttribute('data-tt')) toggleTheme();

  // ----- ⋮ menu + bottom sheet -----
  else if (t.hasAttribute('data-kb')) {
    const menu = t.closest('.kb'), willOpen = !menu.classList.contains('open');
    document.querySelectorAll('.kb.open').forEach(x => x.classList.remove('open'));
    menu.classList.toggle('open', willOpen);
    t.setAttribute('aria-expanded', String(willOpen));
  }
  else if (t.dataset.sheet) {
    document.querySelectorAll('.kb.open').forEach(x => x.classList.remove('open'));
    openSheet(t.dataset.sheet);
  }
  else if (t.hasAttribute('data-close')) closeSheet();
  else if (t.id === 'csub') submitAnonymousComplaint();
  else if (t.hasAttribute('data-again')) openSheet('complaint');

  // ----- Issue reports -----
  else if (t.dataset.iss) {
    const issue = ISSUES.find(i => i.id === t.dataset.iss);
    if (issue) { issue.st = 'Resolved'; saveJson('cc_iss', ISSUES); render(); }
  }
  else if (t.id === 'isub') submitIssue();

  // ----- Notices + holidays (staff/admin) -----
  else if (t.dataset.ndel) deleteNotice(+t.dataset.ndel);
  else if (t.dataset.hdel) deleteHoliday(+t.dataset.hdel);
  else if (t.id === 'npost') postNotice();
  else if (t.id === 'hadd') addHoliday();

  // ----- Edit buttons (data-act="name:value") -----
  else if (t.dataset.act) {
    const parts = t.dataset.act.split(':');
    if (ACTIONS[parts[0]]) ACTIONS[parts[0]](parts.slice(1).join(':'));
  }

  // ----- Staff: attendance + demo class -----
  else if (t.dataset.take) takeAttendance(t.dataset.take);
  else if (t.hasAttribute('data-sim')) toggleSimulation();
  else if (t.dataset.mk) { marks[t.dataset.mk] = marks[t.dataset.mk] === false; render(); }   // toggle present / absent
  else if (t.hasAttribute('data-allp')) { marks = {}; render(); }
  else if (t.hasAttribute('data-msave')) saveSession();
  else if (t.hasAttribute('data-off')) { offlineDemo = !offlineDemo; if (!offlineDemo) syncQueue(); render(); }
  else if (t.hasAttribute('data-sync')) { syncQueue(); render(); }

  // ----- Students (staff/admin) -----
  else if (t.dataset.cr) setCR(+t.dataset.cr);
  else if (t.dataset.rm) removeStudent(+t.dataset.rm);
  else if (t.dataset.trm) removeTeacher(+t.dataset.trm);   // admin: remove teacher
  else if (t.id === 'tadd') addTeacher();                    // admin: add teacher
  else if (t.id === 'sadd') addStudent();

  // ----- Achievements -----
  else if (t.dataset.av) {                                   // teacher / admin verifies or rejects
    const [id, status] = t.dataset.av.split(':');
    const a = ACHIEVEMENTS.find(x => String(x.id) === id);
    if (a) {
      a.st = status;
      a.vb = { n: userName(), r: getRole() === 'admin' ? 'Admin' : 'Teacher', at: Date.now() };
      saveJson('cc_ach', ACHIEVEMENTS);
      render();
    }
  }
  else if (t.id === 'achsub') submitAchievement();

  // ----- Complaints -----
  else if (t.dataset.adv) advanceComplaint(+t.dataset.adv);
  else if (t.dataset.metoo) meToo(+t.dataset.metoo);
  else if (t.hasAttribute('data-force')) fileComplaint(true);
  else if (t.id === 'cfsub') fileComplaint(false);

  // ----- Opportunities + mess + results -----
  else if (t.dataset.oapply) toggleApply(t.dataset.oapply);
  else if (t.dataset.mrate) {
    const [meal, rating] = t.dataset.mrate.split(':');
    mealRatings[meal] = mealRatings[meal] === rating ? null : rating;   // tap again to un-rate
    render();
  }
  else if (t.dataset.mskip) { mealSkips[t.dataset.mskip] = !mealSkips[t.dataset.mskip]; render(); }
  else if (t.hasAttribute('data-print')) window.print();
});


/* =============================================================================
   24b. NOTIFICATIONS, NEW-NOTICE DOT, LIVE DETAILS, LOGIN-BOX EFFECTS
   -----------------------------------------------------------------------------
   Works for every role. "Seen" notices and dismissed notifications are saved
   per person (role + name) in localStorage ("cc_seen", "cc_dis").
   ============================================================================= */

let noticeNewSet = new Set();   // notices to label NEW while the Notices page is open

const personKey = () => getRole() + '|' + userName();
const noticeKey = n => 'nt:' + n[1] + '|' + n[2] + '|' + (n[5] || '');
const postedByMe = n => !!n[5] && n[5] === userName();
// Same visibility rule as the Notices page: students never see Staff-only notices
const visibleNotices = () => appData.notices.filter(n => isStaffOrAdmin() || (n[4] || 'Everyone') !== 'Staff');

const seenNotices = () => new Set(loadJson('cc_seen', {})[personKey()] || []);
const unseenNotices = () => {
  const seen = seenNotices();
  return visibleNotices().filter(n => !postedByMe(n) && !seen.has(noticeKey(n)));
};
const hasNewNotices = () => unseenNotices().length > 0;

function markNoticesSeen() {
  const all = loadJson('cc_seen', {}), key = personKey();
  const set = new Set(all[key] || []);
  visibleNotices().forEach(n => set.add(noticeKey(n)));
  all[key] = [...set].slice(-300);
  saveJson('cc_seen', all);
}

const dismissedNotifs = () => new Set(loadJson('cc_dis', {})[personKey()] || []);
function dismissNotifs(ids) {
  const all = loadJson('cc_dis', {}), key = personKey();
  const set = new Set(all[key] || []);
  ids.forEach(id => set.add(id));
  all[key] = [...set].slice(-400);
  saveJson('cc_dis', all);
}

// Closed complaints this person cares about: students their own, staff all of them
const relevantClosures = () => getRole() === 'admin' ? [] :
  COMPLAINTS.filter(c => c.closed && (getRole() === 'staff' || isMine(c)));
const unseenClosures = () => {
  const seen = new Set(loadJson('cc_cseen', {})[personKey()] || []);
  return relevantClosures().filter(c => !seen.has(closeKey(c)));
};
const hasNewClosures = () => unseenClosures().length > 0;
function markClosuresSeen() {
  const all = loadJson('cc_cseen', {}), key = personKey(), set = new Set(all[key] || []);
  relevantClosures().forEach(c => set.add(closeKey(c)));
  all[key] = [...set].slice(-300);
  saveJson('cc_cseen', all);
}

// Everything this person should be told about right now (minus dismissed ones)
function buildNotifications() {
  const role = getRole(), dis = dismissedNotifs(), out = [];
  const decided = r => ({
    id: 'lv:' + r.id + ':' + r.s, icon: r.s === 'Approved' ? '✅' : '❌', title: 'Leave ' + r.s.toLowerCase(),
    text: r.t + ' · ' + rangeText(r) + (r.by ? ' · by ' + r.by : ''), go: 'leave'
  });
  const waiting = (r, prefix, title) => ({
    id: prefix + r.id, icon: '🕒', title, text: r.n + ' · ' + r.t + ' · ' + rangeText(r), go: 'leave'
  });

  if (role === 'admin') {
    leaveRequests.staff.filter(r => r.id && r.s === 'Pending').forEach(r => out.push(waiting(r, 'ar:', 'Staff leave request')));
  } else if (role === 'staff') {
    studentApprovals.filter(r => r.id && r.s === 'Pending').forEach(r => out.push(waiting(r, 'sr:', 'Leave request to review')));
    leaveRequests.staff.filter(r => r.id && isMyLeave(r) && r.s !== 'Pending').forEach(r => out.push(decided(r)));
  } else {
    leaveRequests.student.filter(r => r.id && r.s !== 'Pending').forEach(r => out.push(decided(r)));
  }

  const unseenClosed = new Set(unseenClosures().map(closeKey));
  relevantClosures().sort((a, b) => b.closed.at - a.closed.at).slice(0, 3).forEach(c => out.push({
    id: closeKey(c), icon: '🔒', go: 'complaints', isNew: unseenClosed.has(closeKey(c)),
    title: role === 'student' ? 'Your complaint was closed' : 'Complaint closed',
    text: c.id + ' · ' + c.t + ' · ' + c.closed.reason.slice(0, 60)
  }));

  const icons = { Exam: '📝', Fee: '💳', Event: '🎉', General: '📢' };
  const unseen = new Set(unseenNotices().map(noticeKey));
  visibleNotices().filter(n => !postedByMe(n) && !dis.has(noticeKey(n))).slice(0, 5).forEach(n =>
    out.push({ id: noticeKey(n), icon: icons[n[0]] || '📢', title: n[1], text: 'New notice · ' + n[0] + ' · ' + n[2], go: 'notices', isNew: unseen.has(noticeKey(n)) }));

  return out.filter(x => !dis.has(x.id));
}

// The Notifications card shown on every dashboard
function renderNotifications() {
  const items = buildNotifications();
  return `<div class="nbox" id="nfbox"><div class="nhead"><h3><span aria-hidden="true">🔔</span> Notifications` +
    (items.length ? `<span class="ncount">${items.length}</span>` : '') + `</h3>` +
    (items.length ? `<button class="btn ghost sm" data-nclear type="button">Clear all</button>` : '') + `</div>` +
    (items.length
      ? `<div class="nlist">` + items.map(x =>
          `<div class="ncard ${x.isNew ? 'new' : ''}" data-nid="${escapeHtml(x.id)}"><span class="ni" aria-hidden="true">${x.icon}</span>` +
          `<div class="nb"><b>${escapeHtml(x.title)}</b><p>${escapeHtml(x.text)}</p><button class="nl" data-go="${x.go}" type="button">View</button></div>` +
          `<button class="nx" data-ndis="1" type="button" aria-label="Remove notification">✕</button></div>`).join('') +
        `</div><p class="swipe-hint">Swipe a notification left or right to remove it.</p>`
      : `<p class="sub nempty">You're all caught up. 🎉</p>`) +
    `</div>`;
}

// Redraw only the notifications card (keeps forms on other pages untouched)
function refreshNotifs() {
  const box = $('nfbox');
  if (box) { box.outerHTML = renderNotifications(); translatePage($('pg-home')); }
  renderTabs();
}

// Slide a card away, then fold its height to zero
function flyOut(card, dir, delay) {
  delay = delay || 0;
  card.classList.remove('drag');
  card.style.transitionDelay = delay + 'ms';
  card.style.height = card.offsetHeight + 'px';
  card.style.transform = 'translateX(' + dir * (card.offsetWidth + 40) + 'px)';
  card.style.opacity = '';
  card.classList.add('out');
  setTimeout(() => card.classList.add('collapse'), 180 + delay);
}

// Remove every notification (also the notices not currently listed)
function clearAllNotifs() {
  const cards = [...document.querySelectorAll('#nfbox .ncard')].filter(c => !c.classList.contains('out'));
  const ids = buildNotifications().map(x => x.id).concat(visibleNotices().filter(n => !postedByMe(n)).map(noticeKey));
  cards.forEach((c, i) => flyOut(c, i % 2 ? 1 : -1, i * 40));
  setTimeout(() => { dismissNotifs(ids); refreshNotifs(); }, 450 + cards.length * 40);
}

// ----- Swipe a notification left or right to remove it (touch, pen and mouse) -----
let nDrag = null, nSuppress = false;

document.addEventListener('pointerdown', e => {
  const card = e.target.closest && e.target.closest('.ncard');
  if (!card || card.classList.contains('out') || (e.pointerType === 'mouse' && e.button !== 0)) return;
  nDrag = { card, pid: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false };
});

document.addEventListener('pointermove', e => {
  if (!nDrag || e.pointerId !== nDrag.pid) return;
  const dx = e.clientX - nDrag.x, dy = e.clientY - nDrag.y;
  if (!nDrag.on) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { nDrag = null; return; }   // it is a scroll
    if (Math.abs(dx) < 8) return;
    nDrag.on = true;
    nDrag.card.classList.add('drag');
    try { nDrag.card.setPointerCapture(e.pointerId); } catch (err) {}
  }
  nDrag.dx = dx;
  nDrag.card.style.transform = 'translateX(' + dx + 'px)';
  nDrag.card.style.opacity = String(Math.max(.25, 1 - Math.abs(dx) / (nDrag.card.offsetWidth * 1.1)));
});

function endDrag(e) {
  if (!nDrag || e.pointerId !== nDrag.pid) return;
  const d = nDrag; nDrag = null;
  if (!d.on) return;
  nSuppress = true; setTimeout(() => { nSuppress = false; }, 80);   // ignore the click that follows a drag
  d.card.classList.remove('drag');
  if (e.type === 'pointerup' && Math.abs(d.dx) > Math.min(110, d.card.offsetWidth * .3)) {
    flyOut(d.card, d.dx > 0 ? 1 : -1);
    setTimeout(() => { dismissNotifs([d.card.dataset.nid]); refreshNotifs(); }, 420);
  } else {
    d.card.style.transform = '';
    d.card.style.opacity = '';
  }
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('click', e => { if (nSuppress) { e.stopPropagation(); e.preventDefault(); nSuppress = false; } }, true);

// ----- Other browser tabs: pick up changes made by another signed-in role -----
function reloadNotices() {
  customNotices.length = 0;
  loadJson('cc_nt', []).forEach(n => customNotices.push(n));
  appData.notices = customNotices.concat(DEMO_NOTICES);
}
window.addEventListener('storage', e => {
  if (e.key === LEAVE_STORAGE_KEY) loadLeave();
  else if (e.key === COMPLAINTS_KEY) loadComplaints();
  else if (e.key === 'cc_nt') reloadNotices();
  else if (e.key !== 'cc_seen' && e.key !== 'cc_dis') return;
  if ($('siteView').classList.contains('hidden')) return;
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) refreshNotifs();   // do not wipe what is being typed
  else render();
});

// ----- Live details: greeting by time of day + real status-bar clock -----
const greetingWord = (d = new Date()) => {
  const h = d.getHours();
  return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 17 ? 'Good afternoon' : h >= 17 && h < 22 ? 'Good evening' : 'Good night';
};
const greetingHtml = () => { const w = greetingWord(); return `<span class="gw" data-w="${w}">${w}</span>`; };

let lastClock = '';
function tickLive() {
  const now = new Date();
  const text = (now.getHours() % 12 || 12) + ':' + String(now.getMinutes()).padStart(2, '0');
  if ($('clock') && text !== lastClock) { lastClock = text; $('clock').textContent = text; }
  const word = greetingWord(now);
  document.querySelectorAll('#greet, .gw').forEach(el => {
    if (el.dataset.w === word) return;
    el.dataset.w = word;
    el.textContent = word;
    translatePage(el);
  });
}
tickLive();
setInterval(tickLive, 1000);

// ----- Login box: height eases when the content changes -----
(() => {
  const scr = $('scr'), inner = $('scrIn');
  if (!scr || !inner || !window.ResizeObserver) return;
  const fit = () => {
    const cs = getComputedStyle(scr);
    scr.style.height = (inner.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) + 'px';
  };
  scr.style.transition = 'none'; fit(); void scr.offsetHeight; scr.style.transition = '';
  new ResizeObserver(fit).observe(inner);
})();

// ----- Login box: tilts toward the mouse + soft highlight (desktop only, off for reduced motion) -----
(() => {
  const box = $('phoneBox');
  if (!box) return;
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  let rect = null;
  const measure = () => { rect = box.getBoundingClientRect(); };

  box.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') measure(); });
  window.addEventListener('scroll', () => { rect = null; }, { passive: true });
  window.addEventListener('resize', () => { rect = null; });

  box.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || calm() || !canHover()) return;
    if (!rect) measure();
    const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    box.style.setProperty('--ry', ((px - .5) * 12).toFixed(2) + 'deg');
    box.style.setProperty('--rx', ((.5 - py) * 12).toFixed(2) + 'deg');
    box.style.setProperty('--mx', (px * rect.width).toFixed(0) + 'px');
    box.style.setProperty('--my', (py * rect.height).toFixed(0) + 'px');
    box.classList.add('tilting');
  });
  box.addEventListener('pointerleave', () => {
    box.classList.remove('tilting');
    ['--rx', '--ry', '--mx', '--my'].forEach(v => box.style.removeProperty(v));
    rect = null;
  });
})();


/* =============================================================================
   25. START-UP + SIGN IN / SIGN OUT
   ============================================================================= */

// If already signed in this session, go straight to the app
try { if (sessionStorage.getItem('cc_in') === '1') showSite(); } catch (e) {}

// Show / hide password
$('toggle').onclick = () => {
  const field = $('pass'), hidden = field.type === 'password';
  field.type = hidden ? 'text' : 'password';
  $('toggle').textContent = hidden ? 'HIDE' : 'SHOW';
};

// "Forgot password?" just points to the admin office
$('forgot').onclick = e => {
  e.preventDefault();
  $('err').textContent = 'Please contact the Admin Office to reset your password.';
};

// Demo check. Replace with a real call to your college's server.
// "Wrong" here means: an ID shorter than 3 characters / not an email, or a password under 4 characters.
const checkCredentials = (user, pass) => {
  const idOk = user.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user) : /^[A-Za-z0-9._-]{3,}$/.test(user);
  return idOk && pass.length >= 4;
};

let signingIn = false;

// Spinner + disabled button while "signing in"
function setLoading(on) {
  const btn = $('signin');
  signingIn = on;
  btn.classList.toggle('loading', on);
  btn.disabled = on;
  btn.setAttribute('aria-busy', String(on));
  btn.querySelector('.lbl').textContent = on ? 'Signing in…' : 'Sign in';
  translatePage(btn);
}

// Show an error and shake the whole box
function failSignIn(message) {
  const err = $('err');
  err.textContent = '';
  void err.offsetWidth;
  err.textContent = message;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && $('phoneBox').animate) {
    $('phoneBox').animate(
      [{ translate: '0 0' }, { translate: '-10px 0' }, { translate: '9px 0' }, { translate: '-6px 0' }, { translate: '4px 0' }, { translate: '0 0' }],
      { duration: 420, easing: 'ease-in-out' });
  }
}

// Sign in
function signIn() {
  if (signingIn) return;
  const user = $('user').value.trim(), pass = $('pass').value;
  if (!user || !pass) { failSignIn('Enter your roll number or email and password.'); return; }
  $('err').textContent = '';
  setLoading(true);

  // Short pause so the spinner is visible (a real server call would take this time)
  setTimeout(() => {
    if (!checkCredentials(user, pass)) {
      setLoading(false);
      failSignIn('Incorrect ID or password. Please check and try again.');
      return;
    }
    $('formPane').classList.add('hidden');
    $('donePane').classList.remove('hidden');
    setLoading(false);
    try {
      sessionStorage.setItem('cc_in', '1');
      sessionStorage.setItem('cc_role', loginRole);
      sessionStorage.setItem('cc_user', user.includes('@') ? user.split('@')[0] : user);
    } catch (e) {}
    setTimeout(() => showSite(1), 1100);
  }, 850);
}
$('signin').onclick = signIn;
['user', 'pass'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); }));

// Sign out
$('logout').onclick = () => {
  try {
    sessionStorage.removeItem('cc_in');
    sessionStorage.removeItem('cc_role');
  } catch (e) {}
  showLogin();
};
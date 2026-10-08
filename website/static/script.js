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
  try {
    const r = sessionStorage.getItem('cc_role') || 'student';
    return r === 'staff' ? 'faculty' : r;      // sessions opened before the role split
  } catch (e) { return 'student'; }
};
const STAFF_ROLES = ['faculty', 'hod', 'principal', 'warden', 'placement_officer'];
const isStaffRole = () => STAFF_ROLES.includes(getRole());
const leaveBucket = () => isStaffRole() ? 'staff' : getRole();   // leave data keeps one "staff" bucket
const ssGet = k => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } };

// Escape text before putting it inside HTML (prevents broken markup / injection)
const escapeHtml = value =>
  String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Full name from the signed-in account (set at login from the server)
const accountName = () => {
  try { return sessionStorage.getItem('cc_name') || ''; }
  catch (e) { return ''; }
};

// Name of the signed-in user (escaped, safe for HTML)
const displayName = () => {
  let name = 'Student';
  try {
    name = accountName() || sessionStorage.getItem('cc_user') ||
      (isStaffRole() ? 'Staff' : getRole() === 'admin' ? 'Admin' : getRole() === 'guest' ? 'Guest' : 'Student');
  } catch (e) {}
  if (getRole() === 'admin' && adminProfile().name) name = adminProfile().name;   // name edited on the profile page
  return escapeHtml(name);
};

// Same name but NOT escaped (used when storing who did something)
const userName = () => {
  if (getRole() === 'admin' && adminProfile().name) return adminProfile().name;
  try { return sessionStorage.getItem('cc_user') || 'Student'; }
  catch (e) { return 'Student'; }
};

// True for teachers and admins (people who can post notices/holidays etc.)
const isStaffOrAdmin = () => isStaffRole() || getRole() === 'admin';

// localStorage JSON helpers (never throw)
const loadJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
};
const saveJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
};

// Admin profile (name, photo, contact details) is saved in "cc_admin_prof".
// Anything the admin has not edited falls back to these defaults.
const ADMIN_PROFILE_DEFAULTS = {
  name: '', photo: '', title: 'Administrator', adminId: 'ADM-001',
  email: 'admin@college.example', phone: '+91 90000 00000',
  department: 'Administration', office: 'Admin Block, Room 1',
  joined: 'January 2018', emergency: '', about: ''
};
const adminProfile = () => Object.assign({}, ADMIN_PROFILE_DEFAULTS, loadJson('cc_admin_prof', {}));

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
  ["opps", "Opportunities"], ["achievements", "Achievements"], ["resume", "AI Resume"], ["resources", "Resources"], ["leave", "Leave"],
  ["complaints", "Complaints"], ["mess", "Mess"], ["profile", "Profile"]
];
const T = {                                       // [page id, label]
  home: ["home", "Home"], timetable: ["timetable", "Timetable"], attendance: ["attendance", "Attendance"],
  students: ["students", "Students"], achievements: ["achievements", "Achievements"], notices: ["notices", "Notices"],
  holidays: ["holidays", "Holidays"], complaints: ["complaints", "Complaints"], leave: ["leave", "Leave"],
  profile: ["profile", "Profile"], resources: ["resources", "Resources"], recruit: ["recruit", "Recruiter requests"]
};
const TABS_BY_ROLE = {
  student: STUDENT_TABS,
  faculty:           [T.home, T.timetable, T.attendance, T.students, T.achievements, T.resources, T.notices, T.holidays, T.leave, T.profile],
  hod:               [T.home, T.timetable, T.attendance, T.students, T.achievements, T.resources, T.notices, T.holidays, T.complaints, T.leave, T.profile],
  principal:         [T.home, T.students, T.achievements, T.resources, T.complaints, T.notices, T.holidays, T.leave, T.profile],
  warden:            [T.home, T.students, T.complaints, T.notices, T.holidays, T.leave, T.profile],
  placement_officer: [T.home, T.students, T.recruit, T.notices, T.holidays, T.leave, T.profile],
  guest: [["home", "Dashboard"], ["students", "Candidates"], ["recruit", "Requests"]],   // recruiter view: anonymous profiles only
  admin: [
    ["home", "Home"], ["students", "Students"], ["staff", "Staff"], ["achievements", "Achievements"],
    ["resources", "Resources"], ["recruit", "Recruiter requests"], ["complaints", "Complaints"], ["notices", "Notices"], ["leave", "Leave"], ["holidays", "Holidays"],
    ["accounts", "Accounts"], ["profile", "Profile"]
  ]
};
const currentTabs = () => TABS_BY_ROLE[getRole()] || STUDENT_TABS;
const hasTab = name => currentTabs().some(t => t[0] === name);
const canPostNotice = () => ['hod', 'principal', 'warden', 'placement_officer', 'admin'].includes(getRole());
const canEditHolidays = () => ['principal', 'admin'].includes(getRole());
function noticeAudiences() {                      // what this role may send to (the server checks it again)
  switch (getRole()) {
    case 'hod': return ['Dept:' + ssGet('cc_dept')];
    case 'warden': return ['Hostel:' + ssGet('cc_hostel')];
    case 'placement_officer': return ['Placement'];
    default: return ['Everyone', 'Students', 'Staff'];
  }
}

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
const currentWeek = () => isStaffRole() ? STAFF_WEEK : STUDENT_WEEK;

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
  const canTakeAttendance = status === 'now' && isStaffRole() &&
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

  const demoButton = isStaffRole()
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
  const isStaff = isStaffRole();
  const role = leaveBucket();
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
  const role = leaveBucket();
  const from = $('lf').value, to = $('lto').value, reason = $('lr').value.trim(), errBox = $('lerr');

  if (!from || !to) { errBox.textContent = 'Choose both dates.'; return; }
  if (to < from) { errBox.textContent = 'End date cannot be before the start date.'; return; }
  if (reason.length < 5) { errBox.textContent = 'Please add a short reason.'; return; }

  const entry = { id: newId(), t: $('lt').value, f: from, to, r: reason, s: 'Pending' };
  if (role === 'staff') entry.n = userName();
  leaveRequests[role].unshift(entry);
  // A student's request also goes to the teachers' review list
  if (role === 'student') studentApprovals.unshift({ id: entry.id, n: (accountName() || userName()) + ' · ' + userName().toUpperCase(), t: entry.t, f: from, to, r: reason, s: 'Pending' });
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
  if (!['admin', 'principal'].includes(getRole())) return;
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
    searchBox('s', 'sq-home', 'Search students…', '') +
    `<div class="grid">` +
      `<button class="stat" data-go="timetable"><span>Classes today</span><b>${classesToday}</b><span>${classesToday ? 'Open timetable' : 'No classes today'}</span></button>` +
      `<button class="stat" data-go="leave"><span>Requests to review</span><b>${pendingRequests}</b><span>Student leave</span></button>` +
      `<button class="stat" data-go="leave"><span>Casual leave left</span><b>${leaveLeft('Casual')}</b><span>of 12 days</span></button>` +
      `<button class="stat" data-go="holidays"><span>Holidays</span><b>${HOLIDAYS.length}</b><span>this year</span></button>` +
    `</div>` + renderNotifications() + renderTodayTimetable();
}

// Staff profile page (shows the admin-edited record when the signed-in ID matches one)
function renderStaffProfile() {
  const r = myStaff();
  const photo = myPhotoValue(r);
  const v = (key, demo) => escapeHtml(r ? (r[key] || '—') : demo);
  return `<h2>Profile</h2><p class="sub">&nbsp;</p>` +
    `<div class="item pcard"><div class="avatar big">${r ? avatarInner(photo, r.name) : avatarInner(photo)}</div>` +
      `<div class="pinfo"><b class="pname">${r ? escapeHtml(r.name) : displayName()}</b>` +
      `<p>${r ? escapeHtml(r.pos + ' · ' + r.dept) : 'Assistant Professor · Computer Science'}</p></div></div>` +
    `<div class="kv">` +
      `<div><small>Employee ID</small>${r ? escapeHtml(r.id) : escapeHtml(userName().toUpperCase())}</div>` +
      `<div><small>Email</small>${v('email', 'staff@college.example')}</div>` +
      `<div><small>Phone</small>${v('phone', '+91 91234 56780')}</div>` +
      `<div><small>Department</small>${r ? escapeHtml(r.dept) : 'Computer Science &amp; Engineering'}</div>` +
      `<div><small>Joined</small>${r ? (r.joined ? longDate(r.joined) : '—') : 'July 2019'}</div>` +
      `<div><small>Cabin</small>${v('cabin', 'Block A, Room 12')}</div>` +
      `<div><small>Subjects</small>${v('subjects', 'Data Structures, Algorithms')}</div>` +
      (r ? `<div><small>Qualification</small>${v('qualification', '')}</div>` : `<div><small>Mentor group</small>Semester 3, Section A</div>`) +
    `</div>` + renderAccountSettings() +
    `<div class="btns" style="margin-top:16px"><button class="btn ghost sm" id="theme" type="button">Toggle light / dark</button></div>` +
    `<p class="demo">${r ? 'Your details are kept up to date by the admin office.' : 'All details shown are demo data.'}</p>` +
    `<p class="swipe-hint">Tip: swipe left or right anywhere on a page to switch menus.</p>`;
}


/* =============================================================================
   9. LOGIN SCREEN, ROLE SWITCHER, TABS, PAGE SWITCHING
   ============================================================================= */

// Placeholder + hint text for each login role
const PLACEHOLDERS = { student: 'Roll number or email', staff: 'Employee ID or email', admin: 'Admin ID or email', guest: 'Guest ID' };
const ROLE_HINTS = { student: 'Sign in as a student', staff: 'Sign in as staff', admin: 'Sign in as admin', guest: 'Sign in as a recruiter / guest' };
const ROLE_ICONS = { student: '🎓', staff: '🧑‍🏫', admin: '🛡️', guest: '👤' };
let prevRole = 'student';   // remembers the last role so we can slide left/right

// Show the login screen again (after sign out)
function showLogin() {
  navStack.length = 0;
  updateBack();
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
  const order = ['student', 'staff', 'admin', 'guest'];
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
  syncDrawer();
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
    if (isStaffRole() && appData.tab === 'attendance') render();
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
  ["Edit profile", "प्रोफ़ाइल संपादित करें", "ପ୍ରୋଫାଇଲ୍ ସମ୍ପାଦନ କରନ୍ତୁ"],
  ["Back", "वापस", "ପଛକୁ"],
  ["All departments", "सभी विभाग", "ସମସ୍ତ ବିଭାଗ"],
  ["All years", "सभी वर्ष", "ସମସ୍ତ ବର୍ଷ"],
  ["Back to students", "छात्रों पर वापस", "ଛାତ୍ରମାନଙ୍କ ପାଖକୁ ଫେରନ୍ତୁ"],
  ["Back to staff", "स्टाफ़ पर वापस", "କର୍ମଚାରୀଙ୍କ ପାଖକୁ ଫେରନ୍ତୁ"],
  ["Search students…", "छात्र खोजें…", "ଛାତ୍ର ଖୋଜନ୍ତୁ…"],
  ["Search teachers…", "शिक्षक खोजें…", "ଶିକ୍ଷକ ଖୋଜନ୍ତୁ…"],
  ["Search students or teachers…", "छात्र या शिक्षक खोजें…", "ଛାତ୍ର କିମ୍ବା ଶିକ୍ଷକ ଖୋଜନ୍ତୁ…"],
  ["Try searching", "इन्हें खोजकर देखें", "ଏସବୁ ଖୋଜି ଦେଖନ୍ତୁ"],
  ["No one matches your search.", "आपकी खोज से कोई मेल नहीं खाता।", "ଆପଣଙ୍କ ସନ୍ଧାନ ସହ କେହି ମେଳ ଖାଉନାହାଁନ୍ତି।"],
  ["No matches. Try a name, roll number, ID or department.", "कोई परिणाम नहीं। नाम, रोल नंबर, आईडी या विभाग आज़माएँ।", "କିଛି ମିଳିଲା ନାହିଁ। ନାମ, ରୋଲ୍ ନମ୍ବର, ଆଇଡି କିମ୍ବା ବିଭାଗ ଚେଷ୍ଟା କରନ୍ତୁ।"],
  ["Save changes", "बदलाव सहेजें", "ପରିବର୍ତ୍ତନ ସେଭ୍ କରନ୍ତୁ"],
  ["Choose photo", "फ़ोटो चुनें", "ଫଟୋ ବାଛନ୍ତୁ"],
  ["Remove photo", "फ़ोटो हटाएँ", "ଫଟୋ ହଟାନ୍ତୁ"],
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
  ["Guest", "अतिथि", "ଅତିଥି"],
  ["Sign in as a guest", "अतिथि के रूप में साइन इन करें", "ଅତିଥି ଭାବେ ସାଇନ୍ ଇନ୍ କରନ୍ତୁ"],
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
  else if (t.id === 'pphoto') handleProfilePhoto(t);                                 // admin profile photo
  else if (t.id === 'pzphoto') handlePersonPhoto(t);                                 // student / staff photo (admin)
  else if (t.id === 'myphoto') handleMyPhoto(t);                                     // my own photo (student / staff)
  else if (t.id === 'ccs') updateMissCalculator();                                   // attendance calculator
  else if (t.dataset && t.dataset.sdept !== undefined) setSearchFilter(t.dataset.sdept, 'dept', t.value);   // search: Department
  else if (t.dataset && t.dataset.pos !== undefined) setPosition(+t.dataset.pos, t.value);  // admin: staff position
  else if (t.classList && t.classList.contains('langsel')) setLang(t.value);         // language dropdown
});
document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('sinp')) onSearchInput(e.target);
  if (e.target.id === 'ccn' || e.target.id === 'ccs') updateMissCalculator();
  if (e.target.dataset && e.target.dataset.rzf) rz.form[e.target.dataset.rzf] = e.target.value;   // keep AI-resume form text across redraws
  if (e.target.id === 'resq') filterResources(e.target.value);
  const d = e.target.dataset || {};
  if (d.rcf) { rc.f[d.rcf] = e.target.value; if (e.target.tagName === 'SELECT') { rc.items = null; rcFetch('items'); render(); } }
  if (d.rcq) rc.reqForm[d.rcq] = e.target.value;
  if (d.rcd) { recDraft = recDraft || { visible: recState.profile ? recState.profile.visible : false, cgpa: recState.profile ? recState.profile.cgpa : '', backlogs: recState.profile ? String(recState.profile.backlogs) : '0',
    subjects: recState.profile ? recState.profile.subjects.join(', ') : '', skills: recState.profile ? recState.profile.skills.join(', ') : '' };
    recDraft[d.rcd] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; }
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
const POSITIONS = ['Faculty', 'Mentor', 'Class Coordinator', 'HOD', 'Exam Cell Incharge', 'Principal', 'Warden', 'Placement Officer'];
// The position label is cosmetic; THIS is what the server enforces
const POSITION_ROLE = { 'Faculty': 'faculty', 'Mentor': 'faculty', 'Class Coordinator': 'faculty', 'Exam Cell Incharge': 'faculty',
  'HOD': 'hod', 'Principal': 'principal', 'Warden': 'warden', 'Placement Officer': 'placement_officer' };

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

// ----- Departments -----
// Students get their department from the course ("B.Tech CSE" -> "CSE"); teachers have it saved.
const DEPT_ALIASES = {
  'computer science': 'CSE', 'computer science & engineering': 'CSE', 'computer science and engineering': 'CSE',
  'information technology': 'IT', 'electronics': 'ECE', 'electrical': 'EEE',
  'mechanical engineering': 'Mechanical', 'civil engineering': 'Civil', 'maths': 'Mathematics'
};
const deptName = d => { const k = String(d || '').trim(); return DEPT_ALIASES[k.toLowerCase()] || k; };
const courseDept = c => String(c || '').replace(/^B\.?Tech\s+/i, '').trim();
const studentDept = s => s.dept ? deptName(s.dept) : courseDept(s.course);
const staffDept = x => deptName(x.dept);

// ----- Extra demo people: 20 students and 10 teachers -----
// They are added once to whatever is already saved (nothing is overwritten or duplicated).
const YEAR_BATCH = { 1: '2025–2029', 2: '2024–2028', 3: '2023–2027', 4: '2022–2026' };
const DEPT_MENTOR = { CSE: 'Dr. A. Mishra', IT: 'Dr. S. Mohapatra', ECE: 'Dr. R. Patra', EEE: 'Prof. N. Pattnaik',
  Mechanical: 'Dr. M. Rath', Civil: 'Ms. A. Biswal', MCA: 'Mr. T. Sethi', MBA: 'Dr. P. Kar' };
const SEED_BLOOD = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'];
const SEED_CITIES = ['Bhubaneswar', 'Cuttack', 'Puri', 'Berhampur', 'Sambalpur', 'Rourkela'];
const SEED_PHONE = (n, a) => ['9437', '9861', '7008', '6371'][n % 4] + String(a + n * 7919).slice(0, 6);

const SEED_STUDENTS = [
  ['CS25-0012', 'Anjali Mishra', 'B.Tech CSE', 1], ['CS24-0045', 'Biswajit Patnaik', 'B.Tech CSE', 2, true],
  ['CS22-0078', 'Chandini Mohapatra', 'B.Tech CSE', 4], ['IT25-0008', 'Debjani Swain', 'B.Tech IT', 1],
  ['IT23-0027', 'Gaurav Tripathy', 'B.Tech IT', 3], ['IT22-0016', 'Harsha Choudhury', 'B.Tech IT', 4],
  ['EC24-0031', 'Itishree Parida', 'B.Tech ECE', 2], ['EC23-0052', 'Jagannath Dash', 'B.Tech ECE', 3, true],
  ['EC25-0019', 'Lipsa Sethy', 'B.Tech ECE', 1], ['EE23-0014', 'Manoj Sahoo', 'B.Tech EEE', 3],
  ['EE24-0023', 'Namita Behera', 'B.Tech EEE', 2], ['EE22-0036', 'Omkar Mallick', 'B.Tech EEE', 4],
  ['ME23-0041', 'Pratyush Satpathy', 'B.Tech Mechanical', 3], ['ME25-0027', 'Rashmi Nanda', 'B.Tech Mechanical', 1],
  ['CE24-0018', 'Subham Acharya', 'B.Tech Civil', 2], ['CE22-0029', 'Tanushree Mahapatra', 'B.Tech Civil', 4],
  ['MC24-0009', 'Uttam Jena', 'MCA', 2], ['MC25-0013', 'Vandana Rout', 'MCA', 1],
  ['MB24-0006', 'Yashwant Singh', 'MBA', 2], ['MB25-0021', 'Zeenat Parveen', 'MBA', 1]
].map(([roll, name, course, year, cr], n) => {
  const parts = name.split(' ');
  return {
    roll, name, course, year, batch: YEAR_BATCH[year], cr: !!cr,
    email: parts[0].toLowerCase() + '.' + parts[parts.length - 1].toLowerCase() + '@college.example',
    phone: SEED_PHONE(n, 120000),
    mentor: DEPT_MENTOR[courseDept(course)] || '',
    hostel: 'Block ' + 'ABCD'[n % 4] + ', Room ' + (101 + (n * 37) % 200),
    guardian: 'Mr. ' + parts[parts.length - 1] + ' · ' + SEED_PHONE(n + 3, 450000),
    blood: SEED_BLOOD[n % 8],
    address: SEED_CITIES[n % 6] + ', Odisha'
  };
});

const SEED_STAFF = [
  ['EMP-1092', 'Dr. S. Mohapatra', 'IT', 'HOD', '2015-06-15', 'Operating Systems, Networks', 'Block B, Room 2', 'Ph.D. (IT)'],
  ['EMP-1098', 'Prof. N. Pattnaik', 'EEE', 'HOD', '2012-07-02', 'Power Systems, Machines', 'Block C, Room 1', 'Ph.D. (Electrical)'],
  ['EMP-1104', 'Dr. M. Rath', 'Mechanical', 'Faculty', '2017-01-10', 'Thermodynamics, Fluid Mechanics', 'Workshop Block, Room 4', 'Ph.D. (Mechanical)'],
  ['EMP-1109', 'Ms. A. Biswal', 'Civil', 'Class Coordinator', '2019-08-05', 'Structural Analysis, Surveying', 'Block D, Room 6', 'M.Tech (Structures)'],
  ['EMP-1115', 'Mr. T. Sethi', 'MCA', 'Mentor', '2018-11-19', 'Python, Databases', 'Block B, Room 9', 'M.Tech (CSE)'],
  ['EMP-1121', 'Dr. P. Kar', 'MBA', 'Placement Officer', '2014-03-24', 'Marketing, Business Ethics', 'Admin Block, Room 5', 'Ph.D. (Management)'],
  ['EMP-1126', 'Ms. D. Mallick', 'ECE', 'Faculty', '2020-02-17', 'Digital Electronics, Signals', 'Block A, Room 8', 'M.Tech (VLSI)'],
  ['EMP-1133', 'Dr. G. Tripathy', 'Mathematics', 'Exam Cell Incharge', '2013-09-09', 'Linear Algebra, Probability', 'Block A, Room 2', 'Ph.D. (Mathematics)'],
  ['EMP-1140', 'Mr. R. Nanda', 'CSE', 'Faculty', '2021-07-26', 'Web Technologies, Java', 'Block A, Room 14', 'M.Tech (CSE)'],
  ['EMP-1147', 'Ms. S. Jena', 'IT', 'Faculty', '2022-01-31', 'Data Mining, Cloud Computing', 'Block B, Room 5', 'M.Tech (IT)']
].map(([id, name, dept, pos, joined, subjects, cabin, qualification], n) => ({
  id, name, dept, pos, joined, subjects, cabin, qualification,
  email: name.replace(/^(Dr|Prof|Ms|Mr)\.\s*/, '').toLowerCase().replace(/\.?\s+/g, '.') + '@college.example',
  phone: SEED_PHONE(n + 1, 260000)
}));

// Add the extras once (a flag in storage remembers it, so anything an admin removes later stays removed)
function mergeSeed(list, extras, key, flag, storeKey) {
  try { if (localStorage.getItem(flag)) return; } catch (e) {}
  extras.forEach(x => { if (!list.some(o => o[key] === x[key])) list.push(x); });
  saveJson(storeKey, list);
  try { localStorage.setItem(flag, '1'); } catch (e) {}
}
mergeSeed(STUDENTS, SEED_STUDENTS, 'roll', 'cc_seed_s1', 'cc_stud');
mergeSeed(STAFF_LIST, SEED_STAFF, 'id', 'cc_seed_t1', 'cc_staff');

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
  // Profile of one student (opened from a search result or by tapping a name)
  if (viewPerson && viewPerson.kind === 's') {
    const v = STUDENTS.findIndex(x => x.roll === viewPerson.key);
    if (v >= 0) return renderPersonView('s', v, message);
    viewPerson = null;
  }
  const rows = STUDENTS.map((s, i) => [s, i]);
  const f = searchFilters['sq-stud'];
  const rowOk = s => personMatches('s', s, studentQuery, f);
  const shownCount = rows.filter(q => rowOk(q[0])).length;
  const rowAttrs = s => `data-q="${escapeHtml(norm(studentHay(s)))}" data-dept="${escapeHtml(studentDept(s))}" data-year="${s.year}"`;
  const rowClass = s => rowOk(s) ? '' : ' shide';
  const active = searchActive('sq-stud', studentQuery);

  return `<h2>Students</h2><p class="sub">${STUDENTS.length} students · teachers and admin can add, edit or remove students and assign a CR</p>` +
    successBox(message) +
    // --- Search ---
    searchBox('s', 'sq-stud', 'Search students…', studentQuery) + searchNote(active, shownCount, rows.length) +
    // --- Add student form ---
    `<div class="ttcard frm"><b style="font-size:18px">Add a student</b>` +
      `<label for="snm">Full name</label><input id="snm" placeholder="Student name">` +
      `<label for="srl">Roll number</label><input id="srl" placeholder="e.g. CS24-0123">` +
      (isAdmin
        ? `<label for="sem">Email (optional, can also be used to sign in)</label><input id="sem" type="email" placeholder="name@gmail.com">` +
          `<label for="spw">Login password</label><input id="spw" autocomplete="off" placeholder="At least 6 characters. You give this to the student">`
        : `<p class="sub" style="margin:8px 0 0">Only the admin can create the student's login and password.</p>`) +
      `<div class="two">` +
        `<div><label for="scrs">Course</label><select id="scrs">${COURSES.map(c => `<option>${c}</option>`).join('')}</select></div>` +
        `<div><label for="syr">Year</label><select id="syr">${[1, 2, 3, 4].map(y => `<option value="${y}">Year ${y}</option>`).join('')}</select></div>` +
      `</div>` +
      `<label for="sbt">Batch</label><select id="sbt">${BATCHES.map(b => `<option>${b}</option>`).join('')}</select>` +
      `<div class="err" id="serr" role="alert"></div>` +
      `<button class="btn" id="sadd" type="button" style="width:100%">Add student</button></div>` +
    `<div class="list">` +
    (rows.length ? rows.map(q => {
      const s = q[0], i = q[1];

      // Edit mode for this student
      if (editingStudent === i) return studentEditForm(s, i, isAdmin, rowClass(s), rowAttrs(s));

      // Normal view
      return `<div class="item${rowClass(s)}" ${rowAttrs(s)}><div class="top"><button class="pwho" data-vp="s:${escapeHtml(s.roll)}" type="button" title="Open profile"><span class="avatar sm">${avatarInner(s.photo, s.name)}</span><b>${escapeHtml(s.name)}</b></button>${s.cr ? '<span class="badge ok">CR</span>' : ''}</div>` +
        `<p>${escapeHtml(s.roll)} · ${s.course} · Year ${s.year} · Batch ${s.batch}</p>` +
        `<div class="btns" style="margin-top:10px">` +
          (canEditProfile('s') ? `<button class="btn ghost sm" data-act="sprof:${i}" type="button">Edit profile</button>` : '') +
          `<button class="btn ghost sm" data-act="sed:${i}" type="button">Edit</button>` +
          `<button class="btn ghost sm" data-cr="${i}" type="button">${s.cr ? 'Remove CR' : 'Make CR'}</button>` +
          `<button class="btn ghost sm" data-rm="${i}" type="button">${removeConfirm === s.roll ? 'Tap again to confirm' : 'Remove'}</button>` +
        `</div></div>`;
    }).join('') : '<p class="sub">No students yet.</p>') + searchNone(active, shownCount, rows.length) + '</div>';
}

// Add a new student (with validation)
// Edit forms. The same form is used inside the Students / Staff lists and on a person's profile page,
// so Edit always opens right where you are.
function studentEditForm(s, i, isAdmin, cls, attrs) {
  return `<div class="item frm${cls}" ${attrs}><b>Edit student</b>` +
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

function staffEditForm(x, i, cls, attrs) {
  return `<div class="item frm${cls}" ${attrs}><b>Edit staff member</b>` +
    `<label for="esfn">Name</label><input id="esfn" value="${escapeHtml(x.name)}">` +
    `<label for="esfd">Department</label><input id="esfd" value="${escapeHtml(x.dept)}">` +
    `<div class="err" id="esferr" role="alert"></div>` +
    `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="stsave:${i}" type="button">Save</button><button class="btn ghost sm" data-act="stcancel" type="button">Cancel</button></div></div>`;
}

async function addStudent() {
  const name = $('snm').value.trim();
  const roll = $('srl').value.trim().toUpperCase();
  const errBox = $('serr');

  if (name.length < 2) { errBox.textContent = 'Enter the student name.'; return; }
  if (!/^[A-Z0-9-]{4,16}$/.test(roll)) { errBox.textContent = 'Roll number must be 4 to 16 letters, numbers or dashes.'; return; }
  if (STUDENTS.some(s => s.roll === roll)) { errBox.textContent = 'This roll number already exists.'; return; }

  const isAdmin = getRole() === 'admin';
  const email = isAdmin ? $('sem').value.trim() : '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errBox.textContent = 'Enter a valid email or leave it empty.'; return; }
  if (isAdmin) {   // admin: create the login account on the server first
    const password = $('spw').value;
    if (password.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }
    try {
      $('sadd').disabled = true;
      await API.request('/api/users', { method: 'POST', body: JSON.stringify({ login_id: roll, name, role: 'student', password, email }) });
    } catch (e) { $('sadd').disabled = false; errBox.textContent = e.message; return; }
  }

  STUDENTS.push({ roll, name, course: $('scrs').value, year: +$('syr').value, batch: $('sbt').value, cr: false, ...(email ? { email } : {}) });
  saveJson('cc_stud', STUDENTS);
  studentMessage = '✅ ' + escapeHtml(name) + ' (' + roll + ') added.' + (isAdmin ? ' Login created.' : ' Ask the admin to create their login.');
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
    API.request('/api/users/' + encodeURIComponent(s.roll), { method: 'DELETE' }).catch(() => {});
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
  // Profile of one staff member (opened from a search result or by tapping a name)
  if (viewPerson && viewPerson.kind === 't') {
    const v = STAFF_LIST.findIndex(x => x.id === viewPerson.key);
    if (v >= 0) return renderPersonView('t', v, message);
    viewPerson = null;
  }
  const f = searchFilters['sq-staff'];
  const rowOk = x => personMatches('t', x, staffQuery, f);
  const shownCount = STAFF_LIST.filter(rowOk).length;
  const rowAttrs = x => `data-q="${escapeHtml(norm(staffHay(x)))}" data-dept="${escapeHtml(staffDept(x))}"`;
  const rowClass = x => rowOk(x) ? '' : ' shide';
  const active = searchActive('sq-staff', staffQuery);
  return `<h2>Staff members</h2><p class="sub">${STAFF_LIST.length} staff · only admin can see this page, add or remove teachers, edit staff and assign positions</p>` +
    successBox(message) +
    // --- Search ---
    searchBox('t', 'sq-staff', 'Search teachers…', staffQuery) + searchNote(active, shownCount, STAFF_LIST.length) +
    // --- Add teacher form (all details) ---
    `<div class="ttcard frm"><b style="font-size:18px">Add a new teacher</b>` +
      `<label for="tnm">Full name</label><input id="tnm" placeholder="e.g. Dr. S. Mohapatra">` +
      `<div class="two">` +
        `<div><label for="tid">Employee ID</label><input id="tid" placeholder="e.g. EMP-1099"></div>` +
        `<div><label for="tdp">Department</label><input id="tdp" placeholder="e.g. CSE"></div>` +
      `</div>` +
      `<label for="tps">Position</label><select id="tps">${POSITIONS.map(p => `<option>${p}</option>`).join('')}</select>` +
      `<label for="thl">Hostel (wardens only)</label><input id="thl" placeholder="e.g. Block A">` +
      `<label for="tem">Email</label><input id="tem" type="email" placeholder="name@college.example">` +
      `<div class="two">` +
        `<div><label for="tph">Phone</label><input id="tph" type="tel" placeholder="10-digit mobile number"></div>` +
        `<div><label for="tjn">Joining date</label><input id="tjn" type="date" max="${todayIso()}" value="${todayIso()}"></div>` +
      `</div>` +
      `<label for="tsb">Subjects (optional)</label><input id="tsb" placeholder="e.g. Data Structures, Algorithms">` +
      `<label for="tpw">Login password</label><input id="tpw" autocomplete="off" placeholder="At least 6 characters. Teacher signs in with Employee ID or email + this">` +
      `<div class="err" id="terr" role="alert"></div>` +
      `<button class="btn" id="tadd" type="button" style="width:100%">Add teacher</button></div>` +
    `<h3 style="margin:20px 0 8px">All staff</h3><div class="list">` +
    STAFF_LIST.map((x, i) => editingStaff === i
      // Edit mode
      ? staffEditForm(x, i, rowClass(x), rowAttrs(x))
      // Normal view
      : `<div class="item${rowClass(x)}" ${rowAttrs(x)}><div class="top"><button class="pwho" data-vp="t:${escapeHtml(x.id)}" type="button" title="Open profile"><span class="avatar sm">${avatarInner(x.photo, x.name)}</span><b>${escapeHtml(x.name)}</b></button><span class="badge ok">${x.pos}</span></div>` +
          `<p>${escapeHtml(x.id)} · ${escapeHtml(x.dept)}</p>` +
          (x.email ? `<p>${escapeHtml(x.email)}${x.phone ? ' · ' + escapeHtml(x.phone) : ''}</p>` : '') +
          (x.joined ? `<p>Joined ${longDate(x.joined)}${x.subjects ? ' · ' + escapeHtml(x.subjects) : ''}</p>` : '') +
          `<label for="pos${i}" style="display:block;margin:10px 0 4px;font-size:13px;color:var(--muted)">Position</label>` +
          `<select id="pos${i}" data-pos="${i}">${POSITIONS.map(p => `<option ${p === x.pos ? 'selected' : ''}>${p}</option>`).join('')}</select>` +
          `<div class="btns" style="margin-top:10px">` +
            `<button class="btn ghost sm" data-act="tprof:${i}" type="button">Edit profile</button>` +
            `<button class="btn ghost sm" data-act="sted:${i}" type="button">Edit</button>` +
            `<button class="btn ghost sm" data-trm="${i}" type="button">${removeStaffConfirm === x.id ? 'Tap again to confirm' : 'Remove'}</button>` +
          `</div></div>`
    ).join('') + searchNone(active, shownCount, STAFF_LIST.length) + '</div>';
}

// Add a new teacher (admin only) with validation of every detail
async function addTeacher() {
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

  const password = $('tpw').value;
  if (password.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }
  const role = POSITION_ROLE[$('tps').value], hostel = $('thl').value.trim();
  if (role === 'warden' && !hostel) { errBox.textContent = 'Enter the hostel this warden looks after.'; return; }
  try {   // create the login account on the server first
    $('tadd').disabled = true;
    await API.request('/api/users', { method: 'POST', body: JSON.stringify({ login_id: id, name, role, password, email, dept, hostel }) });
  } catch (e) { $('tadd').disabled = false; errBox.textContent = e.message; return; }

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
    API.request('/api/users/' + encodeURIComponent(x.id), { method: 'DELETE' }).catch(() => {});
    removeStaffConfirm = '';
    editingStaff = -1;
    staffMessage = escapeHtml(x.name) + ' was removed.';
  } else {
    removeStaffConfirm = x.id;
  }
  render();
}


// Change a staff member's position
async function setPosition(i, value) {
  const x = STAFF_LIST[i];
  if (!x || !POSITIONS.includes(value)) return;
  const role = POSITION_ROLE[value];
  let hostel = '';
  if (role === 'warden') {
    hostel = (prompt('Which hostel does this warden look after? (e.g. Block A)') || '').trim();
    if (!hostel) { render(); return; }
  }
  try {
    await API.request('/api/users/' + encodeURIComponent(x.id) + '/role',
      { method: 'POST', body: JSON.stringify({ role, dept: x.dept, hostel }) });
  } catch (e) {
    if (e.status !== 404) { staffMessage = '⚠️ ' + escapeHtml(e.message); render(); return; }   // 404 = demo row with no login yet
  }
  x.pos = value;
  saveJson('cc_staff', STAFF_LIST);
  staffMessage = '✅ ' + escapeHtml(x.name) + ' is now ' + value + '.';
  render();
}



/* ----- Accounts page (admin only) ------------------------------------------
   Admin creates logins for admins, teachers and students, sets / changes
   passwords and removes accounts. Everything is stored on the server.
   People sign in with their roll number / employee ID OR their email.
   ----------------------------------------------------------------------- */
let accountsList = null, accountsLoading = false, accountsMessage = '', accountsError = '';
let pwEditing = '', accRemoveConfirm = '';
let accCreds = null;   // login details to hand over, shown once right after creating an account / setting a password
const ACCOUNT_ROLE_LABEL = { student: 'Student', faculty: 'Faculty', hod: 'HOD', principal: 'Principal', warden: 'Warden',
  placement_officer: 'Placement officer', admin: 'Admin', guest: 'Guest / Recruiter' };
// Random password without look-alike characters (no 0/O, 1/l/I)
const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, n => chars[n % chars.length]).join('');
};
const looksLikeEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function loadAccounts() {
  if (accountsLoading) return;
  accountsLoading = true;
  try { accountsList = await API.request('/api/users'); }
  catch (e) { accountsList = []; accountsError = e.message; }
  accountsLoading = false;
  render();
}

function renderAccounts() {
  if (getRole() !== 'admin' || appData.tab !== 'accounts') { accCreds = null; return ''; }   // leaving the page hides the shown password
  if (accountsList === null) {
    loadAccounts();
    return '<h2>Login accounts</h2><p class="sub">Loading…</p>';
  }
  const message = accountsMessage, error = accountsError;
  accountsMessage = ''; accountsError = '';
  const who = u => escapeHtml(u.login_id);

  return `<h2>Login accounts</h2><p class="sub">${accountsList.length} accounts · only the admin can create accounts and set or change passwords</p>` +
    `<div class="note" style="margin-bottom:12px">🔒 Passwords are stored scrambled, so nobody (not even the admin) can read an existing one. ` +
      `To help someone who forgot theirs, tap <b>Set password</b> and give them the new one.</div>` +
    successBox(message) + (error ? `<div class="err" role="alert">${escapeHtml(error)}</div>` : '') +
    (accCreds ? `<div class="ttcard cred"><b style="font-size:17px">Share these login details</b>` +
      `<p>Name: <b>${escapeHtml(accCreds.name)}</b></p><p>Login ID: <code>${escapeHtml(accCreds.loginId)}</code></p><p>Password: <code>${escapeHtml(accCreds.password)}</code></p>` +
      `<div class="btns" style="margin-top:10px"><button class="btn sm" data-acc="copy" data-text="${escapeHtml('Login ID: ' + accCreds.loginId + '\nPassword: ' + accCreds.password)}" type="button">Copy</button>` +
      `<button class="btn ghost sm" data-acc="credhide" type="button">Hide</button></div>` +
      `<p class="demo">This is the only time the password is shown. Ask the person to change it after signing in.</p></div>` : '') +
    `<div class="ttcard frm"><b style="font-size:18px">Add a login account</b>` +
      `<label for="acrole">Account type</label><select id="acrole">${Object.entries(ACCOUNT_ROLE_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>` +
      `<label for="acdept">Department (faculty / HOD)</label><input id="acdept" placeholder="e.g. CSE">` +
      `<label for="achostel">Hostel (warden)</label><input id="achostel" placeholder="e.g. Block A">` +
      `<label for="acname">Full name</label><input id="acname" placeholder="Full name">` +
      `<label for="acid">Roll number / Employee ID</label><input id="acid" placeholder="Student roll no. or teacher employee ID (not needed for admin)">` +
      `<label for="acem">Email</label><input id="acem" type="email" placeholder="name@gmail.com (required for admin, optional for others)">` +
      `<label for="acpw">Password</label><input id="acpw" autocomplete="off" placeholder="At least 6 characters. You give this to the person">` +
      `<div class="btns" style="margin-top:6px"><button class="btn ghost sm" data-acc="gen" data-target="acpw" type="button">Generate a password</button></div>` +
      `<div class="err" id="acerr" role="alert"></div>` +
      `<button class="btn" id="accadd" type="button" style="width:100%">Create account</button></div>` +
    `<h3 style="margin:20px 0 8px">All accounts</h3><div class="list">` +
    accountsList.map(u =>
      `<div class="item"><div class="top"><b>${escapeHtml(u.name)}${u.me ? ' (you)' : ''}</b><span class="badge ${u.role === 'admin' ? 'ok' : ''}">${ACCOUNT_ROLE_LABEL[u.role] || u.role}</span></div>` +
      `<p>Login ID: ${who(u)}${u.email && u.email !== u.login_id ? ' · ' + escapeHtml(u.email) : ''}</p>` +
      (pwEditing === u.login_id
        ? `<div class="frm"><label for="acnewpw">New password</label><input id="acnewpw" autocomplete="off" placeholder="At least 6 characters">` +
          `<div class="btns" style="margin-top:6px"><button class="btn ghost sm" data-acc="gen" data-target="acnewpw" type="button">Generate a password</button></div>` +
          `<div class="err" id="acpwerr" role="alert"></div>` +
          `<div class="btns" style="margin-top:10px"><button class="btn sm" data-acc="pwsave" data-who="${who(u)}" type="button">Save password</button>` +
          `<button class="btn ghost sm" data-acc="pwcancel" type="button">Cancel</button></div></div>`
        : `<div class="btns" style="margin-top:10px"><button class="btn ghost sm" data-acc="pw" data-who="${who(u)}" type="button">Set password</button>` +
          (u.me ? '' : `<button class="btn ghost sm" data-acc="rm" data-who="${who(u)}" type="button">${accRemoveConfirm === u.login_id ? 'Tap again to confirm' : 'Remove'}</button>`) +
          `</div>`) +
      `</div>`
    ).join('') + '</div>';
}

async function addAccount() {
  const role = $('acrole').value, name = $('acname').value.trim();
  let loginId = $('acid').value.trim();
  const email = $('acem').value.trim(), password = $('acpw').value, errBox = $('acerr');

  if (name.length < 2) { errBox.textContent = 'Enter the full name.'; return; }
  if (role === 'admin') {
    if (!looksLikeEmail(email)) { errBox.textContent = 'An admin needs a valid email. It becomes the login ID.'; return; }
    loginId = email;
  } else {
    if (!/^[A-Za-z0-9._-]{3,}$/.test(loginId)) { errBox.textContent = 'Enter the roll number / employee ID (letters, numbers, dashes).'; return; }
    if (email && !looksLikeEmail(email)) { errBox.textContent = 'Enter a valid email or leave it empty.'; return; }
  }
  if (password.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }

  $('accadd').disabled = true;
  try {
    await API.request('/api/users', { method: 'POST', body: JSON.stringify({ login_id: loginId, name, role, password, email, dept: $('acdept').value.trim(), hostel: $('achostel').value.trim() }) });
  } catch (e) { $('accadd').disabled = false; errBox.textContent = e.message; return; }
  accCreds = { name, loginId: loginId.toLowerCase(), password };
  accountsMessage = '✅ ' + escapeHtml(ACCOUNT_ROLE_LABEL[role]) + ' account created for ' + escapeHtml(name) + '. Login ID: ' + escapeHtml(loginId.toLowerCase());
  accountsList = null;
  render();
}

async function accountAction(btn) {
  const act = btn.dataset.acc, who = btn.dataset.who;
  if (act === 'gen') { const f = $(btn.dataset.target); if (f) { f.value = genPassword(); f.focus(); } }
  else if (act === 'copy') {
    const done = () => { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(btn.dataset.text).then(done, () => {});
  }
  else if (act === 'credhide') { accCreds = null; render(); }
  else if (act === 'pw') { pwEditing = who; accRemoveConfirm = ''; render(); const f = $('acnewpw'); if (f) f.focus(); }
  else if (act === 'pwcancel') { pwEditing = ''; render(); }
  else if (act === 'pwsave') {
    const pw = $('acnewpw').value, errBox = $('acpwerr');
    if (pw.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }
    let res;
    try { res = await API.request('/api/users/reset-password', { method: 'POST', body: JSON.stringify({ login_id: who, password: pw }) }); }
    catch (e) { errBox.textContent = e.message; return; }
    if (res && res.token) { try { sessionStorage.setItem('cc_token', res.token); } catch (e) {} }   // admin changed their own password: stay signed in
    const person = (accountsList || []).find(u => u.login_id === who);
    accCreds = { name: person ? person.name : who, loginId: who, password: pw };
    pwEditing = '';
    accountsMessage = '✅ Password changed for ' + escapeHtml(who) + '.';
    render();
  }
  else if (act === 'rm') {
    if (accRemoveConfirm !== who) { accRemoveConfirm = who; pwEditing = ''; render(); return; }
    accRemoveConfirm = '';
    try { await API.request('/api/users/' + encodeURIComponent(who), { method: 'DELETE' }); }
    catch (e) { accountsError = e.message; render(); return; }
    accountsMessage = 'Account ' + escapeHtml(who) + ' was removed.';
    accountsList = null;
    render();
  }
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
    id: Date.now(), who: accountName() || userName(), roll: userName().toUpperCase(), title,
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
    searchBox('a', 'sq-home', 'Search students or teachers…', '') +
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

// ----- Admin profile: photo, details and editing -----
let editingProfile = false;        // true while the edit form is open
let profilePhotoDraft = null;      // null = photo unchanged, '' = photo removed, 'data:image…' = new photo
let adminProfileMessage = '';      // "Profile updated" note shown once

// Photo (only accept images we created ourselves) or the first letter of the name
function avatarInner(photo, who) {
  return photo && photo.startsWith('data:image/')
    ? `<img src="${escapeHtml(photo)}" alt="Profile photo">`
    : (who ? escapeHtml(String(who).trim()[0] || '?').toUpperCase() : displayName()[0].toUpperCase());
}
const currentProfilePhoto = () => profilePhotoDraft !== null ? profilePhotoDraft : adminProfile().photo;

// Admin profile page
function renderAdminProfile() {
  const p = adminProfile();
  const message = adminProfileMessage; adminProfileMessage = '';
  const head = `<h2>Profile</h2><p class="sub">&nbsp;</p>` + (message ? `<div class="note" style="margin-bottom:12px">${message}</div>` : '');
  const themeButton = `<div class="btns" style="margin-top:16px"><button class="btn ghost sm" id="theme" type="button">Toggle light / dark</button></div>`;

  // ----- Edit form -----
  if (editingProfile) {
    const field = (id, label, value, extra) =>
      `<div><label for="${id}">${label}</label><input id="${id}" value="${escapeHtml(value)}" ${extra || ''}></div>`;
    return head +
      `<div class="ttcard frm pedit">` +
        `<div class="pphoto"><div class="avatar big" id="pavprev">${avatarInner(currentProfilePhoto())}</div>` +
        `<div class="pphoto-side"><div class="btns">` +
          `<label class="btn ghost sm filebtn"><span>Choose photo</span><input id="pphoto" type="file" accept="image/*"></label>` +
          `<button class="btn ghost sm" data-act="prrm" type="button">Remove photo</button></div>` +
        `<p class="demo" style="margin-top:8px">JPG or PNG. The photo is cropped to a square and saved on this device.</p></div></div>` +
        `<label for="pfn">Full name</label><input id="pfn" maxlength="40" value="${escapeHtml(p.name || accountName() || userName())}">` +
        `<label for="pft">Designation</label><input id="pft" maxlength="40" value="${escapeHtml(p.title)}">` +
        `<div class="two">` +
          field('pfe', 'Email', p.email, 'type="email" maxlength="60"') +
          field('pfp', 'Phone', p.phone, 'type="tel" maxlength="20"') +
        `</div><div class="two">` +
          field('pfd', 'Department', p.department, 'maxlength="50"') +
          field('pfo', 'Office', p.office, 'maxlength="50"') +
        `</div><div class="two">` +
          field('pfj', 'Joined', p.joined, 'maxlength="30"') +
          field('pfm', 'Emergency contact', p.emergency, 'maxlength="60" placeholder="Name · phone"') +
        `</div>` +
        `<label for="pfa">About</label><textarea id="pfa" maxlength="200" placeholder="A short line about your role">${escapeHtml(p.about)}</textarea>` +
        `<p class="demo">Admin ID (${escapeHtml(p.adminId)}) cannot be changed.</p>` +
        `<div class="err" id="pferr" role="alert"></div>` +
        `<div class="btns"><button class="btn sm" data-act="psave" type="button">Save changes</button>` +
        `<button class="btn ghost sm" data-act="pcancel" type="button">Cancel</button></div>` +
      `</div>`;
  }

  // ----- Normal view -----
  const show = v => v ? escapeHtml(v) : '—';
  return head +
    `<div class="item pcard">` +
      `<div class="avatar big">${avatarInner(p.photo)}</div>` +
      `<div class="pinfo"><b class="pname">${displayName()}</b><p>${escapeHtml(p.title)} · ${escapeHtml(p.department)}</p>` +
      (p.about ? `<p class="pabout">${escapeHtml(p.about)}</p>` : '') + `</div>` +
      `<button class="btn ghost sm" data-act="pedit" type="button">Edit profile</button>` +
    `</div>` +
    `<div class="kv">` +
      `<div><small>Admin ID</small>${show(p.adminId)}</div>` +
      `<div><small>Email</small>${show(p.email)}</div>` +
      `<div><small>Phone</small>${show(p.phone)}</div>` +
      `<div><small>Department</small>${show(p.department)}</div>` +
      `<div><small>Office</small>${show(p.office)}</div>` +
      `<div><small>Joined</small>${show(p.joined)}</div>` +
      `<div><small>Emergency contact</small>${show(p.emergency)}</div>` +
      `<div><small>Can do</small>Manage students, assign staff positions, handle complaints, verify achievements</div>` +
    `</div>` + themeButton +
    `<p class="demo">Your profile is saved on this device only.</p>`;
}

// Redraw the photo circle in the edit form without re-rendering the page (keeps typed text)
function showProfilePreview() {
  const box = $('pavprev');
  if (box) box.innerHTML = avatarInner(currentProfilePhoto());
}

// Crop a chosen image to a centred 256 px square JPEG (data URL) so it fits in storage.
// Calls done(dataUrl) on success or fail(message) on a bad file.
function cropPhoto(file, done, fail) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { fail('Please choose an image file (JPG or PNG).'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const size = 256, side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      done(canvas.toDataURL('image/jpeg', .85));
    };
    img.onerror = () => fail('That image could not be read. Please try another file.');
    img.src = reader.result;
  };
  reader.onerror = () => fail('That file could not be read. Please try again.');
  reader.readAsDataURL(file);
}

// Admin's own photo picker
function handleProfilePhoto(input) {
  const errBox = $('pferr');
  cropPhoto(input.files && input.files[0],
    url => { profilePhotoDraft = url; errBox.textContent = ''; showProfilePreview(); },
    msg => { errBox.textContent = msg; input.value = ''; });
}

// Validate and save the edited admin profile
function saveAdminProfile() {
  const val = id => $(id).value.trim(), errBox = $('pferr');
  const name = val('pfn'), email = val('pfe'), phone = val('pfp');
  if (name.length < 2) { errBox.textContent = 'Enter your full name (at least 2 letters).'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errBox.textContent = 'Enter a valid email address.'; return; }
  if (phone && !/^\+?[\d\s-]{7,18}$/.test(phone)) { errBox.textContent = 'Enter a valid phone number (digits, spaces and dashes only).'; return; }

  const next = Object.assign(adminProfile(), {
    name, email, phone,
    title: val('pft') || 'Administrator',
    department: val('pfd'), office: val('pfo'), joined: val('pfj'),
    emergency: val('pfm'), about: val('pfa')
  });
  if (profilePhotoDraft !== null) next.photo = profilePhotoDraft;

  try { localStorage.setItem('cc_admin_prof', JSON.stringify(next)); }
  catch (e) { errBox.textContent = 'Could not save: browser storage is full or blocked. Try a different photo.'; return; }

  editingProfile = false;
  profilePhotoDraft = null;
  adminProfileMessage = '✅ Profile updated.';
  render();
  window.scrollTo(0, 0);
}


// ----- Admin: edit the profile (photo + details) of a student or a staff member -----
// Name, roll number and class are still changed with the existing "Edit" button.
let personEdit = null;   // { kind: 's' | 't', i: list index, photo: null (unchanged) | '' (removed) | data URL }
const personList = kind => kind === 's' ? STUDENTS : STAFF_LIST;
const longDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// The record of the person who is signed in (matched by roll number / employee ID or email name)
function myStudent() {
  if (getRole() !== 'student') return null;
  const u = userName().toUpperCase();
  return STUDENTS.find(x => x.roll === u) || null;
}
function myStaff() {
  if (!isStaffRole()) return null;
  const u = userName().toLowerCase();
  return STAFF_LIST.find(x => x.id.toLowerCase() === u || (x.email && x.email.split('@')[0].toLowerCase() === u)) || null;
}

// Admin may edit anyone's profile; staff may edit students' profiles (same rule as the Edit button in the lists)
const canEditProfile = kind => getRole() === 'admin' || (kind === 's' && isStaffRole());

function openPersonProfile(kind, i) {
  if (!canEditProfile(kind)) return;
  const x = personList(kind)[i];
  if (!x) return;
  personEdit = { kind, i, photo: null };
  const isS = kind === 's';
  const input = (id, label, value, extra) =>
    `<div><label for="${id}">${label}</label><input id="${id}" value="${escapeHtml(value || '')}" ${extra || ''}></div>`;

  $('sbody').innerHTML =
    `<h2>${isS ? 'Student' : 'Staff'} profile</h2>` +
    `<p class="sub" style="margin:0 0 8px">${escapeHtml(x.name)} · ${escapeHtml(isS ? x.roll : x.id)}</p>` +
    `<div class="frm pedit">` +
      `<div class="pphoto"><div class="avatar big" id="pzprev">${avatarInner(x.photo, x.name)}</div>` +
      `<div class="pphoto-side"><div class="btns">` +
        `<label class="btn ghost sm filebtn"><span>Choose photo</span><input id="pzphoto" type="file" accept="image/*"></label>` +
        `<button class="btn ghost sm" data-act="pzrm" type="button">Remove photo</button></div></div></div>` +
      `<div class="two">${input('pzem', 'Email', x.email, 'type="email" maxlength="60"')}${input('pzph', 'Phone', x.phone, 'type="tel" maxlength="20"')}</div>` +
      (isS
        ? `<div class="two">${input('pzmn', 'Mentor', x.mentor, 'maxlength="50"')}${input('pzho', 'Hostel / room', x.hostel, 'maxlength="50"')}</div>` +
          `<div class="two">${input('pzgd', 'Guardian (name · phone)', x.guardian, 'maxlength="70"')}${input('pzbl', 'Blood group', x.blood, 'maxlength="5"')}</div>` +
          `<label for="pzad">Address</label><textarea id="pzad" maxlength="160">${escapeHtml(x.address || '')}</textarea>`
        : `<div class="two">${input('pzjn', 'Joining date', x.joined, `type="date" max="${todayIso()}"`)}${input('pzcb', 'Cabin', x.cabin, 'maxlength="50"')}</div>` +
          `<label for="pzql">Qualification</label><input id="pzql" maxlength="60" value="${escapeHtml(x.qualification || '')}">` +
          `<label for="pzsb">Subjects</label><input id="pzsb" maxlength="80" value="${escapeHtml(x.subjects || '')}">`) +
      `<div class="err" id="pzerr" role="alert"></div>` +
      `<div class="btns"><button class="btn sm" data-act="pesave" type="button">Save changes</button>` +
      `<button class="btn ghost sm" data-close type="button">Cancel</button></div>` +
    `</div>`;
  $('sheet').classList.remove('hidden');
  translatePage($('sheet'));
}

function handlePersonPhoto(input) {
  if (!personEdit) return;
  cropPhoto(input.files && input.files[0],
    url => { personEdit.photo = url; $('pzerr').textContent = ''; showPersonPreview(); },
    msg => { $('pzerr').textContent = msg; input.value = ''; });
}

function showPersonPreview() {
  if (!personEdit) return;
  const x = personList(personEdit.kind)[personEdit.i];
  const photo = personEdit.photo !== null ? personEdit.photo : x.photo;
  $('pzprev').innerHTML = avatarInner(photo, x.name);
}

function savePersonProfile() {
  if (!personEdit || !canEditProfile(personEdit.kind)) return;
  const { kind, i } = personEdit, list = personList(kind), x = list[i], errBox = $('pzerr');
  if (!x) return;
  const val = id => $(id).value.trim();
  const email = val('pzem'), phone = val('pzph');

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errBox.textContent = 'Enter a valid email address.'; return; }
  if (email && kind === 't' && STAFF_LIST.some((o, k) => k !== i && o.email && o.email.toLowerCase() === email.toLowerCase())) {
    errBox.textContent = 'This email is already used by another staff member.'; return;
  }
  if (phone && !/^(\+91)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ''))) { errBox.textContent = 'Enter a valid 10-digit mobile number.'; return; }

  const fields = kind === 's'
    ? { email, phone, mentor: val('pzmn'), hostel: val('pzho'), guardian: val('pzgd'), blood: val('pzbl'), address: val('pzad') }
    : { email, phone, joined: val('pzjn'), cabin: val('pzcb'), qualification: val('pzql'), subjects: val('pzsb') };
  if (kind === 't' && fields.joined && fields.joined > todayIso()) { errBox.textContent = 'The joining date cannot be in the future.'; return; }

  const before = Object.assign({}, x);
  Object.assign(x, fields);
  if (personEdit.photo !== null) { if (personEdit.photo) x.photo = personEdit.photo; else delete x.photo; }

  try { localStorage.setItem(kind === 's' ? 'cc_stud' : 'cc_staff', JSON.stringify(list)); }
  catch (e) {
    Object.keys(x).forEach(k => delete x[k]); Object.assign(x, before);   // undo: nothing was saved
    errBox.textContent = 'Could not save: browser storage is full or blocked. Try a smaller photo.';
    return;
  }

  const message = '✅ Profile of ' + escapeHtml(x.name) + ' updated.';
  if (kind === 's') studentMessage = message; else staffMessage = message;
  personEdit = null;
  closeSheet();
  render();
}


/* =============================================================================
   18b. SEARCH WITH SUGGESTIONS (students + teachers)
   -----------------------------------------------------------------------------
   * Every search box has a Department list and (for students) Year tabs above it.
   * Dashboards: admin finds students AND teachers, teachers find students.
   * Students page (admin + teachers) and Staff page (admin): the box filters the
     list while typing.
   * Tapping a suggestion (or a name in a list) opens that person's profile.
   Typing never re-renders the page, so the cursor and keyboard stay put.
   ============================================================================= */

let studentQuery = '';      // text in the Students page search box
let staffQuery = '';        // text in the Staff page search box
let viewPerson = null;      // { kind: 's' | 't', key: roll / employee ID } = profile being viewed
let pendingView = null;     // profile to open right after the next page change
const sgItems = {};         // suggestion lists currently shown, by search box id

// Department / Year choices for each search box
const searchFilters = {
  'sq-home': { dept: 'All', year: 'All' },
  'sq-stud': { dept: 'All', year: 'All' },
  'sq-staff': { dept: 'All', year: 'All' }
};
const filtersOn = id => searchFilters[id].dept !== 'All' || searchFilters[id].year !== 'All';
const searchActive = (id, q) => !!q.trim() || filtersOn(id);

const norm = v => String(v == null ? '' : v).toLowerCase();
const queryTokens = q => norm(q).trim().split(/\s+/).filter(Boolean);

// Every word typed must appear somewhere in the person's details.
// "year 3" is treated as one word so it only matches Year 3 (not the digit 3 in a roll number).
const matchTokens = q => queryTokens(norm(q).replace(/\byear\s*(\d)/g, 'year$1'));
const matchesQuery = (q, hay) => { const h = norm(hay); return matchTokens(q).every(t => h.includes(t)); };

// Searchable text of one student / one staff member
const studentHay = x => [x.name, x.roll, x.course, studentDept(x), 'year' + x.year, 'year ' + x.year, x.batch, x.cr ? 'cr class representative' : '', x.email, x.phone].join(' ');
const staffHay = x => [x.name, x.id, staffDept(x), x.pos, x.email, x.phone, x.subjects, x.cabin].join(' ');

// Does this person fit the typed text AND the Department / Year choices?
function personMatches(kind, p, q, f) {
  if (!matchesQuery(q, kind === 's' ? studentHay(p) : staffHay(p))) return false;
  if (f.dept !== 'All' && (kind === 's' ? studentDept(p) : staffDept(p)) !== f.dept) return false;
  if (kind === 's' && f.year !== 'All' && String(p.year) !== f.year) return false;
  return true;
}

// Departments that exist in the data (for the Department list)
function deptOptions(kind) {
  const set = new Set();
  if (kind !== 't') STUDENTS.forEach(x => set.add(studentDept(x)));
  if (kind !== 's') STAFF_LIST.forEach(x => set.add(staffDept(x)));
  set.delete('');
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Wrap the typed words in <mark> (the text itself is escaped first)
function highlight(text, q) {
  const toks = queryTokens(q).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!toks.length) return escapeHtml(text);
  return String(text).split(new RegExp('(' + toks.join('|') + ')', 'ig'))
    .map((part, i) => i % 2 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part)).join('');
}

// People matching the query, best matches first (name starts with it, then ID, then any word)
function rankPeople(list, q, hayFn, nameFn, idFn) {
  const first = queryTokens(q)[0] || '', whole = norm(q).trim();
  return list.map((p, i) => {
    if (!matchesQuery(q, hayFn(p))) return null;
    const name = norm(nameFn(p)), id = norm(idFn(p));
    const score = name.startsWith(whole) ? 0 : id.startsWith(whole) ? 1 : name.split(/\s+/).some(w => w.startsWith(first)) ? 2 : 3;
    return { p, i, score };
  }).filter(Boolean).sort((a, b) => a.score - b.score || a.i - b.i).map(r => r.p);
}

// Ready-made ideas shown when the box is empty
function trySuggestions(kind) {
  const uniq = arr => [...new Set(arr.filter(Boolean))];
  const stud = () => ['CR', 'Year 3'].concat(uniq(STUDENTS.map(x => studentDept(x))).slice(0, 3));
  const staff = () => ['HOD', 'Warden', 'Placement Officer'];
  const terms = kind === 's' ? stud() : kind === 't' ? staff() : stud().slice(0, 3).concat(['HOD', 'Warden']);
  return uniq(terms).slice(0, 6).map(t => ({ type: 'term', title: t, value: t }));
}

// Suggestions for a box: kind 's' students, 't' teachers, 'a' both.
// With nothing typed they are the "try" ideas, or (if a Department / Year is chosen) the people in it.
function searchSuggestions(kind, q, id) {
  const f = searchFilters[id];
  if (!q.trim() && !filtersOn(id)) return trySuggestions(kind);
  const limit = kind === 'a' ? 5 : 8, out = [];
  if (kind !== 't') {
    const list = STUDENTS.filter(x => personMatches('s', x, '', f));
    rankPeople(list, q, studentHay, x => x.name, x => x.roll).slice(0, limit)
      .forEach(x => out.push({ type: 's', title: x.name, sub: x.roll + ' · ' + x.course + ' · Year ' + x.year, key: x.roll, photo: x.photo }));
  }
  if (kind !== 's') {
    const list = STAFF_LIST.filter(x => personMatches('t', x, '', f));
    rankPeople(list, q, staffHay, x => x.name, x => x.id).slice(0, limit)
      .forEach(x => out.push({ type: 't', title: x.name, sub: x.id + ' · ' + staffDept(x) + ' · ' + x.pos, key: x.id, photo: x.photo }));
  }
  return out;
}

// The people search (search bar + Department / Year filters) for staff and admin.
// Choosing a result opens that person's profile with the editor ready. Set to false to hide the search box.
const PEOPLE_SEARCH_BAR = true;
// The search bar sits on: admin > Students, admin > Staff, teacher > Students.
// The Home dashboards of staff and admin do not have one; set this to true to add it there as well.
const HOME_SEARCH_BAR = false;

// The search box: Department list + Year tabs, then the input with its suggestion dropdown
function searchBox(kind, id, placeholder, value) {
  if (!PEOPLE_SEARCH_BAR) return '';   // no search box at all
  if (id === 'sq-home' && !HOME_SEARCH_BAR) return '';   // the Home dashboards (staff + admin) have no search
  const f = searchFilters[id];
  const filters =
    `<div class="sfilt"><select class="sdept" data-sdept="${id}" aria-label="Department">` +
      `<option value="All">All departments</option>` +
      deptOptions(kind).map(d => `<option ${d === f.dept ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('') +
    `</select>` +
    (kind !== 't'
      ? `<div class="syears" role="group" aria-label="Year"${kind === 'a' ? ' title="Year applies to students"' : ''}>` +
          ['All', '1', '2', '3', '4'].map(y => `<button class="chip ${f.year === y ? 'on' : ''}" data-syr="${id}:${y}" type="button">${y === 'All' ? 'All years' : 'Year ' + y}</button>`).join('') +
        `</div>`
      : '') +
    `</div>`;
  return `<div class="sbox${PEOPLE_SEARCH_BAR ? '' : ' nobar'}" data-sk="${kind}" data-sid="${id}">${filters}<div class="swrap"><div class="sfield">` +
    `<span class="sicon" aria-hidden="true">🔍</span>` +
    `<input id="${id}" class="sinp" type="text" role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list" ` +
      `autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="${placeholder}" placeholder="${placeholder}" value="${escapeHtml(value || '')}">` +
    `<button class="sclr ${value ? '' : 'hidden'}" data-sclr="${id}" type="button" aria-label="Clear search">✕</button></div>` +
    `<div class="sugg hidden" id="${id}-list" role="listbox"></div></div></div>`;
}

// "Showing 2 of 10" line and the "nothing found" message under a search box
const searchNote = (active, shown, total) => `<p class="snote" aria-live="polite">${active ? 'Showing ' + shown + ' of ' + total : ''}</p>`;
const searchNone = (active, shown, total) => `<p class="sub snone ${active && total && !shown ? '' : 'hidden'}">No one matches your search.</p>`;

// Fill and open the dropdown
function showSuggestions(box, q) {
  const list = box.querySelector('.sugg'), inp = box.querySelector('.sinp'), id = box.dataset.sid;
  const items = searchSuggestions(box.dataset.sk, q, id);
  sgItems[id] = items;
  let html = '', lastType = '';
  items.forEach((it, n) => {
    if (it.type !== lastType) {
      lastType = it.type;
      html += `<div class="sgh">${it.type === 's' ? 'Students' : it.type === 't' ? 'Teachers' : 'Try searching'}</div>`;
    }
    html += it.type === 'term'
      ? `<button class="sgi term" role="option" id="${id}-o${n}" data-sg="${n}" type="button"><span aria-hidden="true">🔎</span><span class="sgt">${escapeHtml(it.title)}</span></button>`
      : `<button class="sgi" role="option" id="${id}-o${n}" data-sg="${n}" type="button"><span class="avatar sm">${avatarInner(it.photo, it.title)}</span>` +
        `<span><span class="sgt">${highlight(it.title, q)}</span><span class="sgs">${highlight(it.sub, q)}</span></span></button>`;
  });
  if (!items.length) html = `<div class="snomatch">No matches. Try a name, roll number, ID or department.</div>`;
  list.innerHTML = html;
  list.classList.remove('hidden');
  inp.setAttribute('aria-expanded', 'true');
  translatePage(list);
}

function hideSuggestions(box) {
  if (!box) return;
  const list = box.querySelector('.sugg'), inp = box.querySelector('.sinp');
  list.classList.add('hidden');
  inp.setAttribute('aria-expanded', 'false');
  inp.removeAttribute('aria-activedescendant');
}
const closeAllSuggestions = except => document.querySelectorAll('.sbox').forEach(b => { if (b !== except) hideSuggestions(b); });

// Hide / show the rows of the Students or Staff page to match the text + Department / Year
function filterRows(which) {
  const root = $(which === 'stud' ? 'pg-students' : 'pg-staff');
  const id = which === 'stud' ? 'sq-stud' : 'sq-staff';
  const q = which === 'stud' ? studentQuery : staffQuery, f = searchFilters[id];
  if (!root) return;
  let shown = 0, total = 0;
  root.querySelectorAll('.list .item[data-q]').forEach(el => {
    total++;
    const ok = matchesQuery(q, el.dataset.q) &&
      (f.dept === 'All' || el.dataset.dept === f.dept) &&
      (f.year === 'All' || which !== 'stud' || el.dataset.year === f.year);
    el.classList.toggle('shide', !ok);
    if (ok) shown++;
  });
  const active = searchActive(id, q);
  const note = root.querySelector('.snote'), none = root.querySelector('.snone');
  if (note) note.textContent = active ? 'Showing ' + shown + ' of ' + total : '';
  if (none) none.classList.toggle('hidden', !(active && total && !shown));
}

// Typing in any search box
function onSearchInput(inp) {
  const box = inp.closest('.sbox'), q = inp.value;
  box.querySelector('.sclr').classList.toggle('hidden', !q);
  if (inp.id === 'sq-stud') { studentQuery = q; filterRows('stud'); }
  else if (inp.id === 'sq-staff') { staffQuery = q; filterRows('staff'); }
  closeAllSuggestions(box);
  showSuggestions(box, q);
}

// Set the text of a page search box (used by "try" ideas and the ✕ button)
function setSearchText(box, text) {
  const inp = box.querySelector('.sinp');
  inp.value = text;
  box.querySelector('.sclr').classList.toggle('hidden', !text);
  if (inp.id === 'sq-stud') { studentQuery = text; filterRows('stud'); }
  else if (inp.id === 'sq-staff') { staffQuery = text; filterRows('staff'); }
}

// A Department or Year choice changed
function setSearchFilter(id, key, val) {
  searchFilters[id][key] = val;
  const box = document.querySelector('.sbox[data-sid="' + id + '"]');
  if (!box) return;
  box.querySelectorAll('[data-syr]').forEach(b => b.classList.toggle('on', b.dataset.syr === id + ':' + searchFilters[id].year));
  if (id === 'sq-stud') filterRows('stud'); else if (id === 'sq-staff') filterRows('staff');
  const open = !box.querySelector('.sugg').classList.contains('hidden');
  if (open || id === 'sq-home') showSuggestions(box, box.querySelector('.sinp').value);
}

// Open a person's profile page
function openPersonView(kind, key) {
  closeAllSuggestions();
  pushNav(navState());           // so Back returns to the list / page we were on
  viewPerson = { kind, key };
  render();
  updateBack();
  window.scrollTo(0, 0);
}

// Open the profile editor (photo + details) for the person with this roll number / employee ID
function openEditFor(kind, key) {
  const i = personList(kind).findIndex(x => (kind === 's' ? x.roll : x.id) === key);
  if (i >= 0) openPersonProfile(kind, i);   // does nothing if this person may not edit that profile
}

// A suggestion was chosen
function pickSuggestion(box, it) {
  if (!it) return;
  if (it.type === 'term') {                        // an idea like "CR" or "Year 3": use it as the search text
    const inp = box.querySelector('.sinp');
    setSearchText(box, it.value);
    showSuggestions(box, it.value);
    inp.focus();
    return;
  }
  if (box.dataset.sid === 'sq-home') {             // dashboard: go to that person's profile
    hideSuggestions(box);
    pendingView = { kind: it.type, key: it.key };
    goToTab(it.type === 's' ? 'students' : 'staff');
    window.scrollTo(0, 0);
    openEditFor(it.type, it.key);                  // ... with the editor ready
    return;
  }
  openPersonView(it.type, it.key);                 // list page: open the profile right here
  openEditFor(it.type, it.key);                    // ... with the editor ready
}

// Keyboard: ↑ ↓ move through the suggestions, Enter picks, Esc closes
document.addEventListener('keydown', e => {
  const inp = e.target;
  if (!inp.classList || !inp.classList.contains('sinp')) return;
  const box = inp.closest('.sbox'), list = box.querySelector('.sugg'), id = box.dataset.sid;
  const opts = [...list.querySelectorAll('.sgi')];
  const cur = opts.findIndex(o => o.classList.contains('act'));
  const mark = n => {
    opts.forEach((o, k) => o.classList.toggle('act', k === n));
    if (opts[n]) { inp.setAttribute('aria-activedescendant', opts[n].id); opts[n].scrollIntoView({ block: 'nearest' }); }
  };
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (list.classList.contains('hidden')) { showSuggestions(box, inp.value); return; }
    if (!opts.length) return;
    mark(e.key === 'ArrowDown' ? (cur + 1) % opts.length : (cur - 1 + opts.length) % opts.length);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const people = (sgItems[id] || []).findIndex(x => x.type !== 'term');
    const n = cur >= 0 ? cur : (searchActive(id, inp.value) ? people : -1);   // Enter with no highlight = best match
    if (n >= 0) pickSuggestion(box, sgItems[id][n]);
  } else if (e.key === 'Escape') {
    hideSuggestions(box);
  }
});

// Opening the box (tap / focus) shows suggestions
document.addEventListener('focusin', e => {
  if (e.target.classList && e.target.classList.contains('sinp')) {
    const box = e.target.closest('.sbox');
    closeAllSuggestions(box);
    showSuggestions(box, e.target.value);
  }
});

// ----- A student's / teacher's profile page (opened from search or by tapping a name) -----
// Edit opens the edit form right here on the profile page.
function renderPersonView(kind, i, message) {
  const isS = kind === 's', x = personList(kind)[i], role = getRole(), admin = role === 'admin';
  const canEdit = admin || (isS && isStaffRole());                  // same rule as the lists
  const editing = isS ? editingStudent === i : editingStaff === i;
  const show = v => v ? escapeHtml(v) : '—';
  const details = isS
    ? [['Roll number', x.roll], ['Department', studentDept(x)], ['Course', x.course], ['Year', 'Year ' + x.year], ['Batch', x.batch],
       ['Email', x.email], ['Phone', x.phone], ['Mentor', x.mentor], ['Hostel', x.hostel], ['Guardian', x.guardian],
       ['Blood group', x.blood], ['Address', x.address]]
    : [['Employee ID', x.id], ['Department', staffDept(x)], ['Position', x.pos], ['Email', x.email], ['Phone', x.phone],
       ['Joined', x.joined ? longDate(x.joined) : ''], ['Cabin', x.cabin], ['Subjects', x.subjects], ['Qualification', x.qualification]];
  const subtitle = isS ? escapeHtml(x.course) + ' · Year ' + x.year + ' · Batch ' + escapeHtml(x.batch) : escapeHtml(staffDept(x)) + ' · ' + escapeHtml(x.pos);
  const buttons = editing ? '' :
    `<div class="btns">` +
      (canEditProfile(kind) ? `<button class="btn ghost sm" data-act="${isS ? 'sprof' : 'tprof'}:${i}" type="button">Edit profile</button>` : '') +
      (canEdit ? `<button class="btn ghost sm" data-act="${isS ? 'sed' : 'sted'}:${i}" type="button">Edit</button>` : '') +
    `</div>`;
  return successBox(message) +
    `<div class="item pcard"><div class="avatar big">${avatarInner(x.photo, x.name)}</div>` +
      `<div class="pinfo"><b class="pname">${escapeHtml(x.name)}</b><p>${subtitle}</p>` +
      (isS && x.cr ? `<span class="badge ok">CR</span>` : '') + (!isS ? `<span class="badge ok">${escapeHtml(x.pos)}</span>` : '') + `</div>` +
      buttons +
    `</div>` +
    (editing
      ? (isS ? studentEditForm(x, i, admin, ' pvform', '') : staffEditForm(x, i, ' pvform', ''))
      : `<div class="kv">${details.map(d => `<div><small>${d[0]}</small>${show(d[1])}</div>`).join('')}</div>`);
}

// A roll number changed: keep the open profile page and the Back history pointing at the same student
function renameViewKey(kind, oldKey, newKey) {
  if (oldKey === newKey) return;
  const fix = v => { if (v && v.kind === kind && v.key === oldKey) v.key = newKey; };
  fix(viewPerson);
  navStack.forEach(e => fix(e.view));
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

  // Compose form (hod / principal / warden / placement officer / admin)
  if (canPostNotice()) {
    out += `<div class="ttcard frm" style="margin-bottom:14px"><b style="font-size:18px">Compose a notice</b>` +
      `<label for="ntt">Title</label><input id="ntt" placeholder="Notice title">` +
      `<div class="two">` +
        `<div><label for="ntc">Category</label><select id="ntc"><option>General</option><option>Exam</option><option>Fee</option><option>Event</option></select></div>` +
        `<div><label for="nta">Send to</label><select id="nta">${noticeAudiences().map(a => `<option>${escapeHtml(a)}</option>`).join('')}</select></div>` +
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
          `<div><label for="ena">Send to</label><select id="ena">${[...new Set([n[4] || 'Everyone', ...noticeAudiences()])].map(c => `<option ${c === (n[4] || 'Everyone') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
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
  if (!canEditHolidays()) return out;   // only principal / admin can add holidays

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

  pedit: () => { editingProfile = true; profilePhotoDraft = null; render(); },        // admin profile
  pcancel: () => { editingProfile = false; profilePhotoDraft = null; render(); },
  psave: () => saveAdminProfile(),
  prrm: () => { profilePhotoDraft = ''; showProfilePreview(); },                       // remove photo

  sprof: i => openPersonProfile('s', +i),                                              // admin: student profile
  tprof: i => openPersonProfile('t', +i),                                              // admin: staff profile
  pesave: () => savePersonProfile(),
  pzrm: () => { if (personEdit) { personEdit.photo = ''; showPersonPreview(); } },

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
  renameViewKey('s', oldRoll, roll);        // keep an open profile page / Back history pointing at this student
  saveJson('cc_stud', STUDENTS);
  editingStudent = -1;
  studentMessage = '✅ ' + escapeHtml(name) + ' updated.';
  render();
}

// Save an edited staff member
async function saveStaff(i) {
  const x = STAFF_LIST[i];
  if (!x) return;
  const name = $('esfn').value.trim(), dept = $('esfd').value.trim(), errBox = $('esferr');
  if (name.length < 2) { errBox.textContent = 'Enter the staff name.'; return; }
  if (dept.length < 2) { errBox.textContent = 'Enter the department.'; return; }

  try {   // keep the server-side department (used for access scope) in step with what is shown
    await API.request('/api/users/' + encodeURIComponent(x.id) + '/role',
      { method: 'POST', body: JSON.stringify({ role: POSITION_ROLE[x.pos] || 'faculty', dept }) });
  } catch (e) { if (e.status !== 404) { errBox.textContent = e.message; return; } }

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
    recBanner() + renderNotifications() +
    renderTodayTimetable();

  // --- Timetable (Week / Day switch) ---
  $('pg-timetable').innerHTML =
    `<h2>Timetable</h2><p class="sub">${isStaffRole() ? 'Your teaching schedule' : 'Semester 3 · Computer Science'}</p>` +
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
  $('pg-profile').innerHTML = renderStudentProfile();
}

// Student profile page (shows the admin-edited record when the signed-in roll number matches one)
function renderStudentProfile() {
  const r = myStudent();
  const photo = myPhotoValue(r);
  const v = (key, demo) => escapeHtml(r ? (r[key] || '—') : demo);
  return `<h2>Profile</h2><p class="sub">&nbsp;</p>` +
    `<div class="item pcard"><div class="avatar big">${r ? avatarInner(photo, r.name) : avatarInner(photo)}</div>` +
      `<div class="pinfo"><b class="pname">${r ? escapeHtml(r.name) : displayName()}</b>` +
      `<p>${r ? escapeHtml(r.course + ' · Year ' + r.year) : 'B.Tech · Computer Science · Semester 3'}</p></div></div>` +
    `<div class="kv">` +
      `<div><small>Roll number</small>${r ? escapeHtml(r.roll) : escapeHtml(userName().toUpperCase())}</div>` +
      `<div><small>Email</small>${v('email', 'student@college.example')}</div>` +
      `<div><small>Phone</small>${v('phone', '+91 98765 43210')}</div>` +
      `<div><small>Batch</small>${r ? escapeHtml(r.batch) : '2023 – 2027'}</div>` +
      `<div><small>Mentor</small>${v('mentor', 'Dr. A. Mishra')}</div>` +
      `<div><small>Hostel</small>${v('hostel', 'Block B, Room 214')}</div>` +
      (r ? `<div><small>Guardian</small>${v('guardian', '')}</div><div><small>Blood group</small>${v('blood', '')}</div><div><small>Address</small>${v('address', '')}</div>` : '') +
    `</div>` + renderRecruitingCard() + renderAccountSettings() +
    `<div class="btns" style="margin-top:16px"><button class="btn ghost sm" id="theme" type="button">Toggle light / dark</button></div>` +
    `<p class="demo">${r ? 'Your details are kept up to date by the admin office.' : 'All details shown are demo data.'}</p>` +
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
    $('pg-accounts').innerHTML = renderAccounts();
    $('pg-achievements').innerHTML = renderAchievementReview();
    $('pg-complaints').innerHTML = renderAdminComplaints();
    $('pg-leave').innerHTML = renderAdminLeave();
    $('pg-profile').innerHTML = renderAdminProfile();
    $('pg-resources').innerHTML = renderResources();
    $('pg-recruit').innerHTML = renderRecruitAdmin();
  } else if (role === 'guest') {
    $('pg-home').innerHTML = renderGuestHome();
    $('pg-students').innerHTML = renderGuestCandidates();
    $('pg-recruit').innerHTML = renderGuestRequests();
  } else {
    if (isStaffRole()) {
      $('pg-home').innerHTML = renderStaffHome();
      $('pg-profile').innerHTML = renderStaffProfile();
      if (hasTab('attendance'))   $('pg-attendance').innerHTML = renderMarkAttendance();
      if (hasTab('students'))     $('pg-students').innerHTML = renderStudents();
      if (hasTab('achievements')) $('pg-achievements').innerHTML = renderAchievementReview();
      if (hasTab('timetable'))    $('pg-timetable').innerHTML += simulationButton();
      if (hasTab('complaints'))   $('pg-complaints').innerHTML = renderStaffComplaints();
      if (hasTab('resources'))    $('pg-resources').innerHTML = renderResources();
      if (hasTab('recruit'))      $('pg-recruit').innerHTML = renderRecruitAdmin();
    } else {
      // student
      $('pg-results').innerHTML = renderResults();
      $('pg-attendance').innerHTML = renderStudentAttendance();
      $('pg-opps').innerHTML = renderOpportunities();
      $('pg-achievements').innerHTML = renderStudentAchievements();
      $('pg-complaints').innerHTML = renderComplaints();
      $('pg-mess').innerHTML = renderMess();
      if (recState === null || recStale) loadRecruiting();       // contact requests + recruiter visibility
      $('pg-resume').innerHTML = renderResume();
      $('pg-resources').innerHTML = renderResources();
    }
    $('pg-leave').innerHTML = role === 'principal' ? renderAdminLeave() : renderLeave();   // principal approves staff leave
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
function goToTab(name, dir, mode) {   // mode: 'back' (from the Back button) | 'reset' (fresh start after sign in)
  if (name !== 'home' && !hasTab(name)) return;   // this role has no such page
  const prev = navState();
  if (name !== appData.tab) { noticeNewSet.clear(); closedNewSet.clear(); }   // forget "NEW" labels when leaving Notices
  // Reset temporary UI state when leaving a page
  leaveMessage = '';
  removeConfirm = '';
  removeStaffConfirm = '';
  accountsList = null; pwEditing = ''; accRemoveConfirm = '';   // Accounts page reloads from the server each visit
  resList = null; resDel = ''; resMsg = ''; resErr = ''; acctMsg = { photo: '', pw: '' };
  rc.sum = null; rc.items = null; rc.reqs = null; rc.reqOpen = ''; po.list = null; po.declining = ''; recStale = true;   // Resources page reloads each visit
  editingNotice = -1;
  editingAchievement = null;
  editingStudent = -1;
  editingStaff = -1;
  editingHoliday = -1;
  closingComplaint = -1;
  editingProfile = false;
  profilePhotoDraft = null;
  personEdit = null;
  viewPerson = pendingView;   // a search result opens its profile page; otherwise the normal list
  pendingView = null;
  if (mode === 'reset') navStack.length = 0;
  else if (mode !== 'back' && prev.tab && (prev.tab !== name || !sameView(prev.view, viewPerson))) pushNav(prev);

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
  updateBack();
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
  swipeAllowed = !e.target.closest('input,textarea,select,.tabs,.wk,.ncard,.sugg,.drawer');
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

// Keep the sticky tab bar directly under the header, whatever height the header has (it wraps on narrow phones)
const siteBar = document.querySelector('#siteView .bar');
function syncBarHeight() {
  if (siteBar && siteBar.offsetHeight) document.documentElement.style.setProperty('--barh', siteBar.offsetHeight + 'px');
}
if (window.ResizeObserver && siteBar) new ResizeObserver(syncBarHeight).observe(siteBar);
window.addEventListener('resize', syncBarHeight);

// Edit buttons that open a form inside the page. The form is scrolled into view (and focused on computers).
const EDIT_OPEN = new Set(['sed', 'sted', 'aed', 'ned', 'hed', 'pedit']);
function focusEditForm() {
  requestAnimationFrame(() => {
    const form = document.querySelector('.pg:not(.hidden) .item.frm:not(.shide), .pg:not(.hidden) .frm.pedit');
    if (!form) return;
    const tall = form.getBoundingClientRect().height > window.innerHeight * 0.7;
    form.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' });   // tall forms line up under the sticky header
    const first = form.querySelector('input,select,textarea');
    if (first && matchMedia('(hover: hover)').matches) first.focus({ preventScroll: true });
  });
}

// ----- Back button: returns to the page you were on just before -----
const navStack = [];            // earlier pages, newest last: { tab, view }
let suppressPop = false;        // true while our own Back button moves the browser history

const navState = () => ({ tab: appData.tab, view: viewPerson ? { kind: viewPerson.kind, key: viewPerson.key } : null });
const sameView = (a, b) => (!a && !b) || !!(a && b && a.kind === b.kind && a.key === b.key);

function updateBack() {
  const row = $('backrow');
  if (row) row.classList.toggle('hidden', !navStack.length);
}

// Remember the page we are leaving (also adds a browser-history entry so the phone's back button works)
function pushNav(prev) {
  if (!prev || !prev.tab) return;
  navStack.push(prev);
  if (navStack.length > 40) navStack.shift();
  try { history.pushState({ cc: 1 }, ''); } catch (e) {}
  updateBack();
}

// Go to the previous page
function goBack() {
  const prev = navStack.pop();
  if (!prev) return;
  pendingView = prev.view;
  goToTab(prev.tab, -1, 'back');
}

// The on-screen Back button
function backClick() {
  if (!navStack.length) return;
  goBack();
  if (history.state && history.state.cc) {          // keep the browser history in step
    suppressPop = true;
    setTimeout(() => { suppressPop = false; }, 400);
    try { history.back(); } catch (e) { suppressPop = false; }
  }
}

// The phone's / browser's own back button does the same thing (or closes an open popup first)
window.addEventListener('popstate', () => {
  if (suppressPop) { suppressPop = false; return; }
  if (!$('sheet').classList.contains('hidden')) {
    closeSheet();
    try { history.pushState({ cc: 1 }, ''); } catch (e) {}
    return;
  }
  if (!$('siteView').classList.contains('hidden') && navStack.length) goBack();
});

// Called once after sign in
function initSite() {
  simTime = null;
  simDay = '';
  goToTab('home', undefined, 'reset');
}


/* =============================================================================
   23b. STUDENT NAVIGATION: hamburger menu + search bar
   -----------------------------------------------------------------------------
   Students get a ☰ button (slide-in menu with every page) and a search bar in the
   middle of the header instead of the long row of tabs. Staff and admin keep the tabs.
   ============================================================================= */

const TAB_ICONS = { home: '🏠', timetable: '🗓️', attendance: '✅', results: '📊', fees: '💳', notices: '📢', holidays: '🏖️',
  scholarships: '🎓', opps: '💼', achievements: '🏆', leave: '📝', complaints: '📣', mess: '🍽️', profile: '👤', resume: '📄', resources: '📚', recruit: '🤝' };
// Extra words that should find a page ("marks" finds Results, "food" finds Mess ...)
const TAB_KEYWORDS = { home: 'dashboard overview', timetable: 'schedule class timing periods week', attendance: 'present absent percentage',
  results: 'marks grades cgpa sgpa semester exam score', fees: 'payment dues tuition hostel pay receipt', notices: 'announcements circular news',
  holidays: 'calendar festival vacation off', scholarships: 'aid stipend merit funding', opps: 'opportunities jobs internship placement career',
  achievements: 'awards certificates hackathon prizes', leave: 'apply absence casual medical', complaints: 'grievance issue problem hostel',
  mess: 'food menu breakfast lunch dinner snacks', profile: 'account photo password details me',
  recruit: 'recruiter contact request placement candidates shortlist', resume: 'cv ai rate skills improve career job', resources: 'notes study material download pdf slides papers syllabus' };

// ----- Hamburger drawer -----
let drawerReturnFocus = null;

function syncDrawer() {
  const on = getRole() === 'student';
  $('siteView').classList.toggle('nav-drawer', on);
  if (!on) { closeDrawer(true); return; }
  const dots = { notices: hasNewNotices(), complaints: hasNewClosures() };
  const me = myStudent();
  $('dwho').innerHTML = `<span class="dava">${avatarInner(myPhotoValue(me), accountName() || userName())}</span><div><b>${displayName()}</b><small>Student</small></div>`;
  $('dlinks').innerHTML = STUDENT_TABS.map((t, i) =>
    `<button class="dlink${t[0] === appData.tab ? ' on' : ''}${dots[t[0]] && appData.tab !== t[0] ? ' has-dot' : ''}" data-go="${t[0]}" style="--i:${i}" type="button">` +
    `<span class="dico" aria-hidden="true">${TAB_ICONS[t[0]] || '•'}</span><span>${t[1]}</span><i class="ndot" aria-hidden="true"></i></button>`).join('');
  translatePage($('drawer'));
  // the ☰ button also shows a dot when something is new
  $('hamb').classList.toggle('has-dot', (dots.notices && appData.tab !== 'notices') || (dots.complaints && appData.tab !== 'complaints'));
}

function openDrawer() {
  const d = $('drawer');
  if (d.classList.contains('open')) return;
  drawerReturnFocus = document.activeElement;
  gHide();
  d.inert = false; d.setAttribute('aria-hidden', 'false');
  d.classList.add('open');
  $('hamb').setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('no-scroll');
  setTimeout(() => { const on = d.querySelector('.dlink.on') || d.querySelector('.dlink'); if (on) on.focus({ preventScroll: true }); }, 60);
}

function closeDrawer(quick) {
  const d = $('drawer');
  if (!d.classList.contains('open') && !quick) return;
  d.classList.remove('open');
  d.inert = true; d.setAttribute('aria-hidden', 'true');
  $('hamb').setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('no-scroll');
  if (!quick && drawerReturnFocus && drawerReturnFocus.focus) drawerReturnFocus.focus({ preventScroll: true });
  drawerReturnFocus = null;
}

// ----- Search -----
let gItems = [], gActive = -1;

// Everything a student can search for: pages first, then the content inside them
function gBuildIndex() {
  const out = [];
  STUDENT_TABS.forEach(t => out.push({ icon: TAB_ICONS[t[0]] || '📄', title: t[1], sub: 'Page', tab: t[0], kw: TAB_KEYWORDS[t[0]] || '', page: true }));
  (appData.notices || []).forEach(n => out.push({ icon: '📢', title: n[1], sub: 'Notice · ' + n[2], tab: 'notices', kw: n[0] + ' ' + (n[3] || '') }));
  HOLIDAYS.forEach(h => out.push({ icon: '🏖️', title: h[2], sub: 'Holiday · ' + h[1] + ' ' + MONTH_NAMES[h[0]], tab: 'holidays', kw: h[3] }));
  (appData.scholarships || []).forEach(x => out.push({ icon: '🎓', title: x[0], sub: 'Scholarship · ' + x[1], tab: 'scholarships', kw: x[2] }));
  OPPORTUNITIES.forEach(o => out.push({ icon: '💼', title: o.title, sub: o.type + ' · ' + o.co, tab: 'opps', kw: o.loc + ' ' + (o.sk || []).join(' ') }));
  [SUBJ_DS, SUBJ_MATHS, SUBJ_DE, SUBJ_ENG, SUBJ_OS].forEach(x => out.push({ icon: '🗓️', title: x[0], sub: 'Timetable · ' + x[2], tab: 'timetable', kw: x[1] }));
  Object.keys(RESULTS).forEach(sem => RESULTS[sem].forEach(r => out.push({ icon: '📊', title: r[1], sub: 'Results · Semester ' + sem, tab: 'results', kw: r[0] })));
  MESS_MENU.forEach(m => m[2].forEach(dish => out.push({ icon: '🍽️', title: dish, sub: 'Mess · ' + m[0], tab: 'mess', kw: '' })));
  COMPLAINTS.filter(isMine).forEach(c => out.push({ icon: '📣', title: c.t, sub: 'My complaint · ' + c.id, tab: 'complaints', kw: c.cat }));
  return out;
}

// -1 = no match. Every word typed must match; matches at the start of the title score highest.
function gScore(item, tokens) {
  const title = item.title.toLowerCase(), hay = (title + ' ' + item.sub + ' ' + item.kw).toLowerCase();
  let score = item.page ? 1 : 0;
  for (const t of tokens) {
    if (!hay.includes(t)) return -1;
    score += title.startsWith(t) ? 4 : title.split(/[^a-z0-9]+/).some(w => w.startsWith(t)) ? 3 : title.includes(t) ? 2 : 1;
  }
  return score;
}

// Escape the text and wrap the matched words in <mark>
function gHighlight(text, tokens) {
  if (!tokens.length) return escapeHtml(text);
  const re = new RegExp('(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return String(text).split(re).map((part, i) => i % 2 ? '<mark>' + escapeHtml(part) + '</mark>' : escapeHtml(part)).join('');
}

const gRecent = () => { try { return JSON.parse(sessionStorage.getItem('cc_recent_q')) || []; } catch (e) { return []; } };

function gRender() {
  const q = $('gq').value.trim().toLowerCase(), tokens = q.split(/\s+/).filter(Boolean), box = $('gres');
  let head = '';
  if (!tokens.length) {
    const recent = gRecent();
    gItems = recent.length ? recent : gBuildIndex().filter(i => i.page).slice(0, 6);
    head = recent.length ? 'Recent' : 'Jump to';
  } else {
    gItems = gBuildIndex().map(i => [i, gScore(i, tokens)]).filter(x => x[1] >= 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
  }
  gActive = gItems.length ? 0 : -1;
  box.innerHTML = gItems.length
    ? (head ? `<div class="ghead">${head}</div>` : '') + gItems.map((it, i) =>
        `<button class="gitem${i === 0 ? ' on' : ''}" role="option" id="gi-${i}" data-gi="${i}" aria-selected="${i === 0}" type="button">` +
        `<span class="gico" aria-hidden="true">${it.icon}</span><span class="gtxt"><b>${gHighlight(it.title, tokens)}</b><small>${escapeHtml(it.sub)}</small></span></button>`).join('')
    : `<div class="gnone">No matches for “${escapeHtml($('gq').value.trim())}”.<br><small>Try “fees”, “notice” or a subject name.</small></div>`;
  box.hidden = false;
  $('gq').setAttribute('aria-expanded', 'true');
  translatePage(box);
}

function gHide() {
  const box = $('gres');
  if (box) box.hidden = true;
  if ($('gq')) $('gq').setAttribute('aria-expanded', 'false');
}

function gMove(step) {
  if (!gItems.length) return;
  gActive = (gActive + step + gItems.length) % gItems.length;
  $('gres').querySelectorAll('.gitem').forEach((el, i) => {
    el.classList.toggle('on', i === gActive);
    el.setAttribute('aria-selected', String(i === gActive));
    if (i === gActive) { el.scrollIntoView({ block: 'nearest' }); $('gq').setAttribute('aria-activedescendant', el.id); }
  });
}

function gPick(i) {
  const it = gItems[i];
  if (!it) return;
  try {   // remember it for this session ("Recent")
    const next = [it].concat(gRecent().filter(r => r.title !== it.title || r.tab !== it.tab)).slice(0, 5);
    sessionStorage.setItem('cc_recent_q', JSON.stringify(next));
  } catch (e) {}
  $('gq').value = '';
  $('gq').blur();
  gHide();
  goToTab(it.tab);
}

$('hamb').addEventListener('click', () => $('drawer').classList.contains('open') ? closeDrawer() : openDrawer());
$('gq').addEventListener('input', gRender);
$('gq').addEventListener('focus', gRender);
$('gq').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); gMove(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); gMove(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); gPick(gActive); }
  else if (e.key === 'Escape') { $('gq').value = ''; gHide(); $('gq').blur(); }
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-dclose]')) closeDrawer();
  else if (e.target.closest('#drawer .dlink')) closeDrawer();   // the page / sheet itself opens in the main handler
  const item = e.target.closest('.gitem');
  if (item) gPick(+item.dataset.gi);
  else if (!e.target.closest('#gsearch')) gHide();
});
document.addEventListener('keydown', e => {
  if ($('siteView').classList.contains('hidden') || getRole() !== 'student') return;
  if (e.key === 'Escape') closeDrawer();
  else if (e.key === '/' && !e.target.closest('input,textarea,select')) { e.preventDefault(); $('gq').focus(); }
  else if (e.key === 'Tab' && $('drawer').classList.contains('open')) {   // keep Tab inside the open menu
    const items = [...$('drawer').querySelectorAll('button')], first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
// Swipe the menu to the left to close it (also: tap outside it, or press Esc)
(() => {
  let x0 = null, y0 = 0;
  const panel = $('drawer').querySelector('.dpanel');
  panel.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (x0 === null) return;
    const dx = e.touches[0].clientX - x0, dy = Math.abs(e.touches[0].clientY - y0);
    if (dx < -60 && dy < 40) { x0 = null; closeDrawer(); }
  }, { passive: true });
  panel.addEventListener('touchend', () => { x0 = null; }, { passive: true });
})();

// Wide screens show the whole header again, so close the menu if the window is resized
window.addEventListener('resize', () => { if (getRole() !== 'student') closeDrawer(true); });

/* =============================================================================
   24a. NEW: MY ACCOUNT (photo + password), RESOURCES, AI RESUME, GUEST VIEWS
   ============================================================================= */

// ----- Recruiter / Guest dashboard (anonymous profiles) -----
// The browser only ever receives anonymous cards from the server: no name, photo, phone, e-mail,
// address or registration number. Contact details come back only after officer approval + student consent.
const RC_STATUS = {
  pending_officer:  ['⏳', 'Waiting for the placement officer', ''],
  awaiting_student: ['🕐', 'Approved by the college · waiting for the student\'s consent', ''],
  approved:         ['✅', 'Contact released', 'ok'],
  declined_officer: ['✖', 'Declined by the placement office', 'bad'],
  declined_student: ['✖', 'The student chose not to share contact details', 'bad']
};
const YEAR_TXT = ['', '1st', '2nd', '3rd', '4th', '5th'];
const fmtMonth = m => m ? new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
const fmtDay = iso => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

let rc = { sum: null, items: null, total: 0, branches: [], reqs: null, busy: {}, err: '', msg: '', open: {}, reqOpen: '',
           reqForm: { company: '', message: '' }, f: { branch: '', cgpa: '', skills: '', ach: '', short: false } };

async function rcFetch(what) {
  if (rc.busy[what]) return;
  rc.busy[what] = true;
  try {
    if (what === 'sum') rc.sum = await API.request('/api/recruiter/summary');
    else if (what === 'reqs') rc.reqs = await API.request('/api/recruiter/requests');
    else {
      const q = new URLSearchParams({ branch: rc.f.branch, min_cgpa: rc.f.cgpa, skills: rc.f.skills, ach: rc.f.ach, shortlisted: rc.f.short ? '1' : '' });
      const d = await API.request('/api/recruiter/candidates?' + q.toString());
      rc.items = d.items; rc.total = d.total; rc.branches = d.branches;
    }
  } catch (e) {
    rc.err = e.message;
    if (what === 'sum') rc.sum = { eligible: 0, shortlisted: 0, pending: 0, awaiting: 0, released: 0 };
    else if (what === 'reqs') rc.reqs = []; else rc.items = [];
  }
  rc.busy[what] = false;
  render();
}

function rcEnsure() {
  const t = appData.tab;
  if (rc.sum === null) rcFetch('sum');
  if (t === 'students' && rc.items === null) rcFetch('items');
  if (t === 'recruit' && rc.reqs === null) rcFetch('reqs');
}

const rcPrivacyStrip = () =>
  `<div class="rc-privacy"><span>🔒 <b>Anonymous Profiles</b></span><span>🛡 <b>Contact Protected</b></span>` +
  `<span class="rc-privacy-note">Names, photos, phone numbers, e-mails, addresses and registration numbers are never shown.</span></div>`;

function renderGuestHome() {
  rcEnsure();
  const s = rc.sum || { eligible: '–', shortlisted: '–', pending: '–', awaiting: '–', released: '–' };
  return `<div class="rc-hero"><small>RECRUITER DASHBOARD</small><h2>${greetingHtml()}, ${displayName()}</h2>` +
    `<p>Find eligible students by skills, CGPA and verified achievements. Profiles stay anonymous until the student agrees to be contacted.</p></div>` +
    rcPrivacyStrip() +
    `<div class="grid">` +
      `<button class="stat" data-go="students"><span>Eligible candidates</span><b>${s.eligible}</b><span>Browse profiles</span></button>` +
      `<button class="stat" data-rc="shortonly"><span>Shortlisted</span><b>${s.shortlisted}</b><span>Your picks</span></button>` +
      `<button class="stat" data-go="recruit"><span>Requests in progress</span><b>${(s.pending === '–') ? '–' : s.pending + s.awaiting}</b><span>${s.pending} with officer · ${s.awaiting} with students</span></button>` +
      `<button class="stat" data-go="recruit"><span>Contacts released</span><b>${s.released}</b><span>Approved by both</span></button>` +
    `</div>` +
    `<div class="ttcard rc-how"><b style="font-size:18px">How contact works</b><ol>` +
      `<li><b>Browse</b> anonymous profiles and shortlist the ones you like.</li>` +
      `<li><b>Request contact</b>: it goes to the college placement officer.</li>` +
      `<li><b>Placement officer</b> reviews and approves your request.</li>` +
      `<li><b>Student consent</b>: the student chooses whether to share their details with you.</li>` +
      `<li><b>Contact released</b> only after steps 3 and 4.</li></ol></div>`;
}

function rcCard(i) {
  const e = escapeHtml, st = i.request ? RC_STATUS[i.request.status] : null;
  const open = !!rc.open[i.code], nA = i.achievements.length, nC = i.certificates.length;
  const form = rc.reqOpen === i.code
    ? `<div class="rc-reqform"><label for="rcq-co">Company / organisation</label><input id="rcq-co" data-rcq="company" maxlength="80" value="${e(rc.reqForm.company)}" placeholder="e.g. Acme Technologies">` +
      `<label for="rcq-msg">Message to the placement officer (optional)</label><textarea id="rcq-msg" data-rcq="message" maxlength="400" placeholder="Role, location, why this profile fits…">${e(rc.reqForm.message)}</textarea>` +
      `<p class="sub" style="margin:6px 0">Goes to the placement officer first. The student's details are shared only if the officer approves <b>and</b> the student agrees.</p>` +
      `<div class="err" id="rcq-err" role="alert"></div>` +
      `<div class="btns"><button class="btn sm" data-rc="send:${i.code}" type="button">Send request</button><button class="btn ghost sm" data-rc="cancel" type="button">Cancel</button></div></div>` : '';
  return `<article class="rc-card">` +
    `<div class="rc-top"><div class="rc-mask" aria-hidden="true">🕶️</div><div class="rc-idbox"><b class="rc-id">${e(i.code)}</b>` +
      `<div class="rc-pills"><span class="rc-pill priv">🔒 Anonymous Profile</span><span class="rc-pill prot">🛡 Contact Protected</span></div></div>` +
      `<button class="rc-star${i.short ? ' on' : ''}" data-rc="star:${e(i.code)}" type="button" aria-pressed="${i.short}" aria-label="${i.short ? 'Remove from shortlist' : 'Shortlist'}">${i.short ? '★' : '☆'}</button></div>` +
    `<div class="rc-meta"><div><small>Branch</small><b>${e(i.branch)}</b></div><div><small>Year</small><b>${YEAR_TXT[i.year] || e(String(i.year || '–'))}</b></div>` +
      `<div class="rc-cg"><small>CGPA</small><b>${e(i.cgpa)}</b></div><div><small>Backlogs</small><b>${i.backlogs}</b></div></div>` +
    (i.subjects.length ? `<p class="rc-acad"><small>Relevant academics</small>Strong in ${i.subjects.map(e).join(', ')}</p>` : '') +
    (i.skills.length ? `<div class="rc-chips">${i.skills.map(x => `<span class="rc-chip">${e(x)}</span>`).join('')}</div>` : '<p class="sub">No skills listed.</p>') +
    `<button class="rc-link" data-rc="open:${e(i.code)}" type="button" aria-expanded="${open}">✔ ${nA} verified achievement${nA === 1 ? '' : 's'} · 📜 ${nC} certificate${nC === 1 ? '' : 's'} <span>${open ? '▴' : '▾'}</span></button>` +
    (open ? `<div class="rc-ach">` +
      (nA ? `<h5>Verified achievements</h5><ul>${i.achievements.map(a => `<li><b>${e(a.title)}</b><span>${e(a.cat)}${a.month ? ' · ' + fmtMonth(a.month) : ''}</span></li>`).join('')}</ul>` : '') +
      (nC ? `<h5>Certificates</h5><ul>${i.certificates.map(a => `<li><b>${e(a.title)}</b><span>${a.month ? fmtMonth(a.month) : ''}</span></li>`).join('')}</ul>` : '') +
      (!nA && !nC ? '<p class="sub">Nothing verified by the college yet.</p>' : '') + `</div>` : '') +
    (st ? `<div class="rc-status ${st[2]}">${st[0]} ${e(st[1])}</div>` : '') +
    (form || (!st || st[2] === 'bad' ? `<div class="btns" style="margin-top:12px"><button class="btn sm" data-rc="req:${e(i.code)}" type="button">Request contact</button></div>` : '')) +
  `</article>`;
}

function renderGuestCandidates() {
  rcEnsure();
  const f = rc.f, e = escapeHtml;
  const filters = `<div class="rc-filters">` +
    `<div><label for="rcf-b">Branch</label><select id="rcf-b" data-rcf="branch"><option value="">All branches</option>${rc.branches.map(b => `<option${b === f.branch ? ' selected' : ''}>${e(b)}</option>`).join('')}</select></div>` +
    `<div><label for="rcf-c">Min CGPA</label><input id="rcf-c" data-rcf="cgpa" type="number" min="0" max="10" step="0.1" placeholder="e.g. 7.5" value="${e(f.cgpa)}"></div>` +
    `<div><label for="rcf-s">Skills</label><input id="rcf-s" data-rcf="skills" placeholder="Python, SQL" value="${e(f.skills)}"></div>` +
    `<div><label for="rcf-a">Achievements</label><input id="rcf-a" data-rcf="ach" placeholder="hackathon, AWS" value="${e(f.ach)}"></div>` +
    `<div class="rc-fbtns"><button class="chip${f.short ? ' on' : ''}" data-rc="short" type="button" aria-pressed="${f.short}">★ Shortlisted</button>` +
    `<button class="btn sm" data-rc="apply" type="button">Search</button><button class="btn ghost sm" data-rc="clear" type="button">Clear</button></div></div>`;
  const err = rc.err ? `<div class="err" role="alert">${e(rc.err)}</div>` : '';
  rc.err = '';
  const msg = rc.msg ? `<div class="okmsg">${e(rc.msg)}</div>` : ''; rc.msg = '';
  let list;
  if (rc.items === null) list = '<p class="sub">Loading candidates…</p>';
  else if (!rc.items.length) list = `<div class="note">${rc.total ? 'No candidate matches these filters.' : 'No students have shared an anonymous profile yet.'}</div>`;
  else list = `<div class="rc-grid">${rc.items.map(rcCard).join('')}</div>`;
  return `<h2>Candidates</h2>` + rcPrivacyStrip() + filters + err + msg +
    `<p class="sub">${rc.items ? rc.items.length + ' of ' + rc.total + ' eligible students' : ''}</p>` + list;
}

function renderGuestRequests() {
  rcEnsure();
  const e = escapeHtml;
  const err = rc.err ? `<div class="err" role="alert">${e(rc.err)}</div>` : ''; rc.err = '';
  if (rc.reqs === null) return '<h2>Contact requests</h2><p class="sub">Loading…</p>';
  const step = (n, on) => `<i class="${on ? 'on' : ''}"></i>`;
  const rank = { pending_officer: 1, awaiting_student: 2, approved: 3 };
  return `<h2>Contact requests</h2>${rcPrivacyStrip()}${err}` +
    `<p class="sub">${rc.reqs.length} request${rc.reqs.length === 1 ? '' : 's'}</p><div class="list">` +
    (rc.reqs.length ? rc.reqs.map(r => {
      const st = RC_STATUS[r.status], k = rank[r.status] || 0;
      return `<div class="item"><div class="top"><b>${e(r.code)}</b><span class="badge ${st[2]}">${st[0]} ${r.status === 'approved' ? 'Released' : r.status.startsWith('declined') ? 'Declined' : 'In progress'}</span></div>` +
        `<p>${e(r.company)} · sent ${fmtDay(r.at)}</p>` + (r.message ? `<p class="sub">${e(r.message)}</p>` : '') +
        (k ? `<div class="rc-steps" aria-hidden="true">${step(1, k >= 1)}${step(2, k >= 2)}${step(3, k >= 3)}<span>Officer</span><span>Student</span><span>Released</span></div>` : '') +
        `<p class="rc-status ${st[2]}">${st[0]} ${e(st[1])}</p>` +
        (r.contact ? `<div class="rc-contact"><b>Contact details released</b><div class="kv"><div><small>Name</small>${e(r.contact.name)}</div>` +
          `<div><small>Email</small>${r.contact.email ? `<a href="mailto:${e(r.contact.email)}">${e(r.contact.email)}</a>` : '—'}</div>` +
          `<div><small>Phone</small>${e(r.contact.phone) || '—'}</div></div></div>` : '') + `</div>`;
    }).join('') : '<div class="note">No requests yet. Open a candidate and choose “Request contact”.</div>') + `</div>`;
}

async function rcAction(btn) {
  const [act, code] = btn.dataset.rc.split(':');
  if (act === 'apply') { rc.items = null; rcFetch('items'); render(); }
  else if (act === 'clear') { rc.f = { branch: '', cgpa: '', skills: '', ach: '', short: false }; rc.items = null; rcFetch('items'); render(); }
  else if (act === 'short') { rc.f.short = !rc.f.short; rc.items = null; rcFetch('items'); render(); }
  else if (act === 'shortonly') { rc.f.short = true; goToTab('students'); }                  // dashboard tile: open Candidates with the shortlist filter on
  else if (act === 'open') { rc.open[code] = !rc.open[code]; render(); }
  else if (act === 'req') { rc.reqOpen = code; rc.reqForm = { company: rc.reqForm.company, message: '' }; render(); }
  else if (act === 'cancel') { rc.reqOpen = ''; render(); }
  else if (act === 'star') {
    const it = (rc.items || []).find(x => x.code === code); if (!it) return;
    try { await API.request('/api/recruiter/shortlist/' + code, { method: it.short ? 'DELETE' : 'POST' }); }
    catch (e) { rc.err = e.message; render(); return; }
    it.short = !it.short;
    if (rc.sum) rc.sum.shortlisted += it.short ? 1 : -1;
    if (rc.f.short && !it.short) rc.items = rc.items.filter(x => x !== it);
    render();
  } else if (act === 'send') {
    const err = $('rcq-err'), co = rc.reqForm.company.trim();
    if (co.length < 2) { err.textContent = 'Enter your company or organisation name.'; return; }
    btn.disabled = true;
    try { await API.request('/api/recruiter/requests', { method: 'POST', body: JSON.stringify({ code, company: co, message: rc.reqForm.message }) }); }
    catch (e) { btn.disabled = false; err.textContent = e.message; return; }
    const it = (rc.items || []).find(x => x.code === code);
    if (it) it.request = { status: 'pending_officer' };
    rc.reqOpen = ''; rc.sum = null; rc.reqs = null;
    rc.msg = 'Request sent to the placement officer for ' + code + '.';
    render();
  }
}

// ----- Placement officer (and admin): approve or decline contact requests -----
let po = { list: null, busy: false, err: '', msg: '', declining: '' };
async function poLoad() {
  if (po.busy) return; po.busy = true;
  try { po.list = await API.request('/api/placement/requests'); } catch (e) { po.list = []; po.err = e.message; }
  po.busy = false; render();
}
function renderRecruitAdmin() {
  if (!hasTab('recruit') || appData.tab !== 'recruit') return '';
  if (po.list === null) { poLoad(); return '<h2>Recruiter requests</h2><p class="sub">Loading…</p>'; }
  const e = escapeHtml, pending = po.list.filter(r => r.status === 'pending_officer'), rest = po.list.filter(r => r.status !== 'pending_officer');
  const msg = po.msg, err = po.err; po.msg = ''; po.err = '';
  const card = r => {
    const st = RC_STATUS[r.status];
    return `<div class="item"><div class="top"><b>${e(r.code)} · ${e(r.branch)}${r.year ? ' · Year ' + r.year : ''}</b><span class="badge ${st[2]}">${st[0]}</span></div>` +
      `<p><b>${e(r.company)}</b> · ${e(r.recruiter)}</p>` + (r.message ? `<p class="sub">“${e(r.message)}”</p>` : '') +
      `<p class="sub">Student: ${e(r.student)} · requested ${fmtDay(r.at)}</p><p class="rc-status ${st[2]}">${st[0]} ${e(st[1])}</p>` +
      (r.status === 'pending_officer' ? `<div class="btns" style="margin-top:10px"><button class="btn sm" data-po="ok:${r.id}" type="button">Approve</button>` +
        `<button class="btn ghost sm" data-po="no:${r.id}" type="button">${po.declining === String(r.id) ? 'Tap again to decline' : 'Decline'}</button></div>` : '') + `</div>`;
  };
  return `<h2>Recruiter requests</h2><p class="sub">Approving only passes the request to the student. Their contact details are shared when they agree.</p>` +
    successBox(msg) + (err ? `<div class="err" role="alert">${e(err)}</div>` : '') +
    `<h3 style="margin:14px 0 8px">Waiting for your decision (${pending.length})</h3><div class="list">${pending.map(card).join('') || '<p class="sub">Nothing waiting.</p>'}</div>` +
    (rest.length ? `<h3 style="margin:18px 0 8px">Earlier requests</h3><div class="list">${rest.map(card).join('')}</div>` : '');
}
async function poAction(btn) {
  const [act, id] = btn.dataset.po.split(':');
  if (act === 'no' && po.declining !== id) { po.declining = id; render(); return; }
  po.declining = '';
  try { await API.request('/api/placement/requests/' + id + '/decide', { method: 'POST', body: JSON.stringify({ approve: act === 'ok' }) }); }
  catch (e) { po.err = e.message; po.list = null; render(); return; }
  po.msg = act === 'ok' ? 'Approved. The student has been asked for consent.' : 'Request declined.';
  po.list = null; render();
}

// ----- Student: choose what recruiters see, answer contact requests -----
let recState = null, recStale = true, recBusy = false, recDraft = null, recMsg = '', recErr = '';
async function loadRecruiting() {
  if (recBusy) return; recBusy = true; recStale = false;
  try { recState = await API.request('/api/me/recruiting'); } catch (e) { if (!recState) recState = { profile: null, requests: [] }; }
  recBusy = false; render();
}
const recPending = () => recState ? recState.requests.filter(r => r.status === 'awaiting_student').length : 0;
function recBanner() {
  const n = recPending();
  return n ? `<div class="note" style="margin-top:14px">🔔 ${n} recruiter${n === 1 ? ' wants' : 's want'} your contact details. <button class="btn sm" data-go="profile" type="button">Review</button></div>` : '';
}
function renderRecruitingCard() {
  if (getRole() !== 'student') return '';
  if (!recState) return `<div class="ttcard frm acct"><h3>🕶️ Recruiter visibility</h3><p class="sub">Loading…</p></div>`;
  const e = escapeHtml, p = recState.profile || { visible: false, cgpa: '', backlogs: 0, subjects: [], skills: [], code: '' };
  const d = recDraft || { visible: p.visible, cgpa: p.cgpa, backlogs: String(p.backlogs), subjects: p.subjects.join(', '), skills: p.skills.join(', ') };
  const msg = recMsg, err = recErr; recMsg = ''; recErr = '';
  const field = (k, label, ph, type) => `<label for="rcd-${k}">${label}</label><input id="rcd-${k}" data-rcd="${k}" ${type ? `type="${type}"` : ''} placeholder="${ph}" value="${e(d[k])}">`;
  return `<div class="ttcard frm acct"><h3>🕶️ Recruiter visibility</h3>` +
    `<p class="sub">Recruiters can see an <b>anonymous</b> profile: an ID, branch, year, CGPA, skills and verified achievements. Your name, photo, phone, e-mail and address are never shown. ` +
    `Your contact details are shared only if the placement officer approves a request <b>and</b> you agree.</p>` +
    `<label class="rc-switch"><input type="checkbox" id="rcd-visible" data-rcd="visible" ${d.visible ? 'checked' : ''}> Show my anonymous profile to recruiters</label>` +
    (p.code ? `<p style="margin:8px 0 0">Your anonymous ID: <b>${e(p.code)}</b></p>` : '') +
    field('cgpa', 'CGPA', 'e.g. 8.2', 'number').replace('<input', '<input min="0" max="10" step="0.01"') +
    field('backlogs', 'Active backlogs', '0', 'number').replace('<input', '<input min="0" max="50"') +
    field('subjects', 'Strong subjects (comma separated)', 'e.g. Data Structures, DBMS') +
    field('skills', 'Skills (comma separated)', 'e.g. Python, SQL, React') +
    `<p class="sub" style="margin:6px 0 0">Do not put your name or contact details here. They are removed automatically. CGPA is self-reported.</p>` +
    (err ? `<div class="err" role="alert">${e(err)}</div>` : '') + (msg ? `<div class="okmsg">${e(msg)}</div>` : '') +
    `<button class="btn sm" data-rec="save" type="button" style="margin-top:8px">Save</button>` +
    (recState.requests.length ? `<h3 style="margin-top:18px">Contact requests</h3><div class="list">` + recState.requests.map(r => {
      const st = RC_STATUS[r.status];
      return `<div class="item"><div class="top"><b>${e(r.company)}</b><span class="badge ${st[2]}">${st[0]}</span></div>` +
        (r.message ? `<p class="sub">“${e(r.message)}”</p>` : '') + `<p class="sub">Approved by the placement office · ${fmtDay(r.at)}</p>` +
        (r.status === 'awaiting_student'
          ? `<div class="btns" style="margin-top:8px"><button class="btn sm" data-rec="acc:${r.id}" type="button">Share my contact details</button><button class="btn ghost sm" data-rec="dec:${r.id}" type="button">No thanks</button></div>`
          : `<p class="rc-status ${st[2]}">${r.status === 'approved' ? '✅ You agreed to share your contact details' : '✖ You declined'}</p>`) + `</div>`;
    }).join('') + `</div>` : '') + `</div>`;
}
async function recAction(btn) {
  const [act, id] = btn.dataset.rec.split(':');
  if (act === 'save') {
    const g = k => $('rcd-' + k).value;
    try {
      await API.request('/api/me/recruiting', { method: 'PUT', body: JSON.stringify({ visible: $('rcd-visible').checked, cgpa: g('cgpa'), backlogs: g('backlogs'), subjects: g('subjects'), skills: g('skills') }) });
    } catch (e) { recErr = e.message; render(); return; }
    recDraft = null; recMsg = 'Saved ✓'; recStale = true; render();
  } else if (act === 'acc' || act === 'dec') {
    try { await API.request('/api/me/recruiting/requests/' + id + '/decide', { method: 'POST', body: JSON.stringify({ accept: act === 'acc' }) }); }
    catch (e) { recErr = e.message; }
    recStale = true; render();
  }
}

// ----- My account: profile photo + password (student and staff) -----
let acctMsg = { photo: '', pw: '' };

// The photo the person chose themselves (kept for this session) wins over the one in the list
function myPhotoValue(r) {
  let v = null;
  try { v = sessionStorage.getItem('cc_photo'); } catch (e) {}
  return v !== null ? v : ((r && r.photo) || '');
}

function renderAccountSettings() {
  if (getRole() !== 'student' && !isStaffRole()) return '';
  const r = getRole() === 'student' ? myStudent() : myStaff();
  return `<div class="ttcard frm acct"><h3>Profile photo</h3>` +
    `<div class="pphoto"><div class="avatar big">${avatarInner(myPhotoValue(r), r ? r.name : (accountName() || userName()))}</div>` +
    `<div class="pphoto-side"><div class="btns">` +
      `<label class="btn ghost sm filebtn"><span>Choose photo</span><input id="myphoto" type="file" accept="image/*"></label>` +
      `<button class="btn ghost sm" data-me="photorm" type="button">Remove photo</button></div></div></div>` +
    `<div class="err" id="myphotoerr" role="alert"></div><div class="okmsg">${acctMsg.photo}</div>` +
    `<h3 style="margin-top:16px">Change password</h3>` +
    `<label for="pwcur">Current password</label><input id="pwcur" type="password" autocomplete="current-password">` +
    `<label for="pwnew">New password</label><input id="pwnew" type="password" autocomplete="new-password" placeholder="At least 6 characters">` +
    `<label for="pwnew2">Repeat new password</label><input id="pwnew2" type="password" autocomplete="new-password">` +
    `<div class="err" id="pwerr" role="alert"></div><div class="okmsg">${acctMsg.pw}</div>` +
    `<button class="btn sm" id="pwbtn" data-me="pwsave" type="button" style="margin-top:8px">Change password</button></div>`;
}

function handleMyPhoto(input) {
  const err = $('myphotoerr');
  cropPhoto(input.files && input.files[0], url => saveMyPhoto(url),
    msg => { if (err) err.textContent = msg; input.value = ''; });
}

async function saveMyPhoto(url) {
  try { await API.request('/api/me/photo', { method: 'PUT', body: JSON.stringify({ photo: url }) }); }
  catch (e) { const b = $('myphotoerr'); if (b) b.textContent = e.message; return; }
  try { sessionStorage.setItem('cc_photo', url); } catch (e) {}
  acctMsg.photo = url ? 'Photo updated ✓' : 'Photo removed ✓';
  render();
}

async function changeMyPassword() {
  const cur = $('pwcur').value, n1 = $('pwnew').value, n2 = $('pwnew2').value, err = $('pwerr'), btn = $('pwbtn');
  err.textContent = '';
  if (!cur) { err.textContent = 'Enter your current password.'; return; }
  if (n1.length < 6) { err.textContent = 'The new password must be at least 6 characters.'; return; }
  if (n1 !== n2) { err.textContent = 'The two new passwords do not match.'; return; }
  if (n1 === cur) { err.textContent = 'Choose a password different from the current one.'; return; }
  btn.disabled = true;
  let res;
  try { res = await API.request('/api/me/password', { method: 'POST', body: JSON.stringify({ current_password: cur, new_password: n1 }) }); }
  catch (e) { btn.disabled = false; err.textContent = e.message; return; }
  if (res && res.token) { try { sessionStorage.setItem('cc_token', res.token); } catch (e) {} }   // stay signed in on this device
  acctMsg.pw = 'Password changed ✓ Use the new password next time you sign in.';
  render();
}

// ----- Academic resources (teachers upload, students download) -----
let resList = null, resLoading = false, resMsg = '', resErr = '', resDel = '';
const canUploadRes = () => ['faculty', 'hod', 'principal', 'admin'].includes(getRole());
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

async function loadResources() {
  if (resLoading) return;
  resLoading = true;
  try { resList = await API.request('/api/resources'); }
  catch (e) { resList = []; resErr = e.message; }
  resLoading = false;
  render();
}

function renderResources() {
  if (!hasTab('resources') || appData.tab !== 'resources') return '';
  if (resList === null) { loadResources(); return '<h2>Resources</h2><p class="sub">Loading…</p>'; }
  const msg = resMsg, error = resErr; resMsg = ''; resErr = '';
  const role = getRole(), own = role === 'faculty' || role === 'hod';
  const form = !canUploadRes() ? '' :
    `<div class="ttcard frm"><b style="font-size:18px">Upload a resource</b>` +
      `<label for="restl">Title</label><input id="restl" maxlength="120" placeholder="e.g. Unit 3 notes: Trees and Graphs">` +
      `<div class="two"><div><label for="ressb">Subject</label><input id="ressb" maxlength="80" placeholder="e.g. Data Structures"></div>` +
      `<div><label for="resse">Semester</label><input id="resse" maxlength="20" placeholder="e.g. Sem 3"></div></div>` +
      (own ? `<p class="sub" style="margin:8px 0 0">Shared with students of your department.</p>`
           : `<label for="resdp">Department (leave empty for all departments)</label><input id="resdp" maxlength="40" placeholder="e.g. CSE">`) +
      `<label for="resds">Description (optional)</label><textarea id="resds" maxlength="400"></textarea>` +
      `<label for="resfile">File (PDF, Word, PowerPoint, Excel, text, ZIP or image · max 15 MB)</label>` +
      `<input id="resfile" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.png,.jpg,.jpeg">` +
      `<div class="err" id="reserr" role="alert"></div>` +
      `<button class="btn" id="resup" data-res="up" type="button" style="width:100%">Upload</button></div>`;
  return `<h2>Resources</h2><p class="sub">${canUploadRes() ? 'Share notes, slides and papers with students' : 'Notes, slides and papers shared by your teachers'} · ${resList.length} file${resList.length === 1 ? '' : 's'}</p>` +
    successBox(msg) + (error ? `<div class="err" role="alert">${escapeHtml(error)}</div>` : '') + form +
    `<div class="field" style="margin:12px 0"><input id="resq" type="search" placeholder="Search title, subject, teacher…" aria-label="Search resources"></div>` +
    `<div class="list" id="reslist">` +
    (resList.length ? resList.map(r =>
      `<div class="item resrow" data-q="${escapeHtml((r.title + ' ' + r.subject + ' ' + r.by + ' ' + r.dept + ' ' + r.semester + ' ' + r.file).toLowerCase())}">` +
        `<div class="top"><b>${escapeHtml(r.title)}</b></div>` +
        `<div class="tags">${r.subject ? `<span class="badge">${escapeHtml(r.subject)}</span>` : ''}${r.semester ? `<span class="badge">${escapeHtml(r.semester)}</span>` : ''}` +
          `<span class="badge">${r.dept ? escapeHtml(r.dept) : 'All departments'}</span></div>` +
        (r.description ? `<p>${escapeHtml(r.description)}</p>` : '') +
        `<p class="meta">${escapeHtml(r.file)} · ${fmtSize(r.size)} · ${escapeHtml(r.by)} · ${new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>` +
        `<div class="btns" style="margin-top:10px"><button class="btn sm" data-res="dl:${r.id}" type="button">⬇ Download</button>` +
          (r.can_delete ? `<button class="btn ghost sm" data-res="rm:${r.id}" type="button">${resDel === String(r.id) ? 'Tap again to confirm' : 'Remove'}</button>` : '') +
        `</div></div>`).join('') : '<p class="sub">Nothing has been shared yet.</p>') +
    `</div><p class="sub snone hidden" id="resnone">No resource matches your search.</p>`;
}

function filterResources(q) {
  q = q.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll('#reslist .resrow').forEach(row => {
    const ok = !q || q.split(/\s+/).every(t => row.dataset.q.includes(t));
    row.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  const none = $('resnone');
  if (none) none.classList.toggle('hidden', !q || shown > 0);
}

async function resourceAction(btn) {
  const [act, id] = btn.dataset.res.split(':');
  if (act === 'up') {
    const file = $('resfile').files[0], title = $('restl').value.trim(), err = $('reserr');
    err.textContent = '';
    if (title.length < 3) { err.textContent = 'Give the resource a title.'; return; }
    if (!file) { err.textContent = 'Choose a file to upload.'; return; }
    if (file.size > 15 * 1024 * 1024) { err.textContent = 'That file is larger than 15 MB.'; return; }
    const fd = new FormData();
    fd.append('file', file); fd.append('title', title);
    fd.append('subject', $('ressb').value.trim()); fd.append('semester', $('resse').value.trim());
    fd.append('description', $('resds').value.trim());
    fd.append('dept', $('resdp') ? $('resdp').value.trim() : '');
    btn.disabled = true; btn.textContent = 'Uploading…';
    try { await API.request('/api/resources', { method: 'POST', body: fd }); }
    catch (e) { btn.disabled = false; btn.textContent = 'Upload'; err.textContent = e.message; return; }
    resMsg = '✅ Uploaded. Students can download it now.';
    resList = null; render();
  } else if (act === 'dl') {
    const r = (resList || []).find(x => String(x.id) === id), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Downloading…';
    try { await API.download('/api/resources/' + id + '/download', r ? r.file : 'resource'); }
    catch (e) { resErr = e.message; render(); return; }
    btn.disabled = false; btn.textContent = label;
  } else if (act === 'rm') {
    if (resDel !== id) { resDel = id; render(); return; }          // first tap asks, second tap removes
    resDel = '';
    try { await API.request('/api/resources/' + id, { method: 'DELETE' }); }
    catch (e) { resErr = e.message; render(); return; }
    resMsg = 'Resource removed.';
    resList = null; render();
  }
}

// ----- AI resume: generate, rate, suggest skills -----
let rz = { form: { target: '', skills: '', projects: '', experience: '', cgpa: '', objective: '' }, busy: false, result: null, err: '' };

const rzColor = n => n >= 70 ? '#2f7d6b' : n >= 40 ? '#c58a12' : '#b3261e';

function resumeDocHtml(res, facts) {
  const e = escapeHtml, r = res;
  const contact = [facts.email, facts.phone].filter(Boolean).map(e).join(' · ');
  const sec = (title, body) => body ? `<h4>${title}</h4>${body}` : '';
  return `<h1>${e(facts.name || '')}</h1>` +
    (r.headline ? `<div class="hd">${e(r.headline)}</div>` : '') + (contact ? `<div class="hd">${contact}</div>` : '') +
    sec('Summary', r.summary ? `<p>${e(r.summary)}</p>` : '') +
    sec('Education', r.education.map(x => `<p><b>${e(x.degree)}</b>${x.institution ? ', ' + e(x.institution) : ''}${x.period ? ' · ' + e(x.period) : ''}${x.details ? ' · ' + e(x.details) : ''}</p>`).join('')) +
    sec('Skills', r.skills.length ? `<p>${r.skills.map(e).join(' · ')}</p>` : '') +
    sec('Projects', r.projects.map(x => `<p><b>${e(x.name)}</b>${x.description ? ': ' + e(x.description) : ''}</p>`).join('')) +
    sec('Experience', r.experience.map(x => `<p><b>${e([x.role, x.org].filter(Boolean).join(', '))}</b>${x.description ? (x.role || x.org ? ': ' : '') + e(x.description) : ''}</p>`).join('')) +
    sec('Achievements', r.achievements.length ? `<ul>${r.achievements.map(a => `<li>${e(a)}</li>`).join('')}</ul>` : '');
}

function resumeText(res, facts) {
  const r = res, L = [facts.name || '', r.headline, [facts.email, facts.phone].filter(Boolean).join(' · '), ''];
  const add = (t, lines) => { if (lines.length) L.push(t.toUpperCase(), ...lines, ''); };
  add('Summary', r.summary ? [r.summary] : []);
  add('Education', r.education.map(x => [x.degree, x.institution, x.period, x.details].filter(Boolean).join(' · ')));
  add('Skills', r.skills.length ? [r.skills.join(', ')] : []);
  add('Projects', r.projects.map(x => x.name + (x.description ? ': ' + x.description : '')));
  add('Experience', r.experience.map(x => [x.role, x.org].filter(Boolean).join(', ') + (x.description ? ': ' + x.description : '')));
  add('Achievements', r.achievements.map(a => '- ' + a));
  return L.join('\n').trim();
}

function renderResume() {
  if (getRole() !== 'student') return '';
  const f = rz.form;
  const input = (key, label, ph, tag) => tag === 'ta'
    ? `<label for="rz-${key}">${label}</label><textarea id="rz-${key}" data-rzf="${key}" maxlength="1500" placeholder="${ph}">${escapeHtml(f[key])}</textarea>`
    : `<label for="rz-${key}">${label}</label><input id="rz-${key}" data-rzf="${key}" maxlength="100" placeholder="${ph}" value="${escapeHtml(f[key])}">`;
  let out = `<h2>AI Resume</h2><p class="sub">Builds a resume from your profile and verified achievements, rates it and suggests skills to learn.</p>` +
    `<div class="ttcard frm"><b style="font-size:18px">Tell us a little more</b>` +
      `<p class="sub" style="margin:6px 0 0">Your name, course, batch and achievements are added automatically. Only real details are used, nothing is invented.</p>` +
      input('target', 'Target role (optional)', 'e.g. Web developer, Data analyst') +
      input('skills', 'Skills (separate with commas)', 'e.g. Python, HTML, CSS, SQL') +
      input('cgpa', 'CGPA (optional)', 'e.g. 8.2') +
      input('objective', 'Career objective (optional, one line)', 'What are you looking for?') +
      input('projects', 'Projects (one per line, “Name: what you built and used”)', 'Attendance app: built with Java and SQLite for 60 students', 'ta') +
      input('experience', 'Internships / training / club roles (one per line)', 'e.g. Web intern at ABC, 2 months', 'ta') +
      (rz.err ? `<div class="err" role="alert">${escapeHtml(rz.err)}</div>` : '') +
      `<button class="btn" data-rz="gen" type="button" style="width:100%" ${rz.busy ? 'disabled aria-busy="true"' : ''}>${rz.busy ? 'Generating… this can take up to a minute' : rz.result ? '✨ Generate again' : '✨ Generate my resume'}</button></div>`;
  const d = rz.result;
  if (!d) return out;
  const g = d.rating, color = rzColor(g.score);
  out += (d.note ? `<div class="note" style="margin:14px 0">${escapeHtml(d.note)}</div>` : '') +
    `<div class="ttcard" style="margin-top:14px"><b style="font-size:18px">Resume score</b>` +
      `<div class="rzscore" style="--rzc:${color}"><div class="ring" style="--p:${g.score}"><b>${g.score}</b></div>` +
      `<div><b>Grade ${escapeHtml(g.grade)}</b><p class="sub" style="margin:4px 0 0">${escapeHtml(g.summary)}</p></div></div>` +
      g.breakdown.map(b => `<div class="rzbar" style="--rzc:${rzColor(b.score * 10)}"><span>${escapeHtml(b.area)}</span><i><span style="width:${b.score * 10}%"></span></i><b>${b.score}/10</b></div>` +
        (b.comment ? `<p class="sub" style="margin:0 0 4px;font-size:12.5px">${escapeHtml(b.comment)}</p>` : '')).join('') +
      (g.strengths.length ? `<h4 style="margin:12px 0 2px">Strengths</h4><ul class="rzlist">${g.strengths.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '') +
      (g.improvements.length ? `<h4 style="margin:12px 0 2px">How to improve</h4><ul class="rzlist">${g.improvements.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '') +
    `</div>` +
    (d.skills_to_learn.length ? `<h3 style="margin:18px 0 8px">Skills to learn next</h3><div class="list">` +
      d.skills_to_learn.map((x, i) => `<div class="item"><div class="top"><b>${i + 1}. ${escapeHtml(x.skill)}</b></div>` +
        (x.why ? `<p>${escapeHtml(x.why)}</p>` : '') + (x.how ? `<p><b>Start:</b> ${escapeHtml(x.how)}</p>` : '') + `</div>`).join('') + `</div>` : '') +
    `<h3 style="margin:18px 0 8px">Your resume</h3><div class="rzdoc" id="rzdoc">${resumeDocHtml(d.resume, d.facts)}</div>` +
    `<div class="btns" style="margin-top:12px"><button class="btn sm" data-rz="print" type="button">Print / Save as PDF</button>` +
    `<button class="btn ghost sm" data-rz="copy" type="button">Copy text</button></div>`;
  return out;
}

async function resumeAction(btn) {
  const act = btn.dataset.rz;
  if (act === 'gen') {
    if (rz.busy) return;
    const f = rz.form;
    rz.busy = true; rz.err = ''; render();
    try {
      rz.result = await API.request('/api/resume', { method: 'POST', body: JSON.stringify({
        target_role: f.target, skills: f.skills, projects: f.projects, experience: f.experience, cgpa: f.cgpa, objective: f.objective }) });
    } catch (e) { rz.err = e.message; }
    rz.busy = false; render();
    const doc = $('rzdoc');
    if (doc && rz.result) doc.closest('.pg').querySelector('.rzscore').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (act === 'print' && rz.result) {
    const w = window.open('', '_blank');
    if (!w) { rz.err = 'Allow pop-ups for this site to print or save the resume.'; render(); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Resume</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:760px;margin:24px auto;padding:0 20px;line-height:1.45;font-size:14px}' +
      'h1{font-size:26px;margin:0}.hd{color:#555;margin:2px 0 6px}h4{margin:16px 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #bbb;padding-bottom:2px}' +
      'p{margin:3px 0}ul{margin:3px 0;padding-left:18px}</style></head><body>' + resumeDocHtml(rz.result.resume, rz.result.facts) + '</body></html>');
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  } else if (act === 'copy' && rz.result && navigator.clipboard) {
    navigator.clipboard.writeText(resumeText(rz.result.resume, rz.result.facts)).then(() => {
      btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy text'; }, 1500); }, () => {});
  }
}

// Build stamp shown in the page footer. If you do not see it there, the browser is still using an old script.js.
const BUILD = 'build 08-Oct-g';
document.querySelectorAll('footer').forEach(f => { if (!f.textContent.includes('build')) f.append(' · ' + BUILD); });

/* =============================================================================
   24. GLOBAL CLICK HANDLER
   -----------------------------------------------------------------------------
   One listener handles every button in the app. Each button carries a
   data-… attribute (or an id) that says what it does.
   ============================================================================= */

// Everything clickable that this handler cares about
const CLICKABLE = '[data-go],[data-pay],[data-ap],[data-nf],[data-tv],[data-td],[data-hf],[data-ap2],[data-dd],[data-rs],[data-print],[data-tt],[data-kb],[data-mk],[data-allp],[data-msave],[data-off],[data-sync],[data-oapply],[data-act],[data-take],[data-sim],[data-iss],[data-ndel],[data-hdel],#npost,#hadd,#isub,[data-cr],[data-rm],[data-trm],#tadd,[data-av],[data-adv],#sadd,#achsub,[data-metoo],[data-force],[data-mrate],[data-mskip],#cfsub,[data-sheet],[data-close],[data-again],#csub,#lsub,#theme,[data-sl],[data-ndis],[data-nclear],[data-cf],[data-sg],[data-sclr],[data-syr],[data-vp],[data-back],[data-acc],#accadd,[data-me],[data-res],[data-rz],[data-rc],[data-po],[data-rec]';   // [data-acc] and #accadd = Accounts page buttons

document.addEventListener('click', e => {
  // Clicking anywhere outside the ⋮ menu closes it
  if (!e.target.closest('.kb')) document.querySelectorAll('.kb.open').forEach(k => k.classList.remove('open'));
  // ...and outside a search box closes its suggestions
  if (!e.target.closest('.sbox')) closeAllSuggestions();

  const t = e.target.closest(CLICKABLE);
  if (!t) return;

  // ----- Back button -----
  if (t.hasAttribute('data-back')) backClick();

  // ----- Search boxes -----
  else if (t.dataset.sg !== undefined) {                          // pick a suggestion
    const box = t.closest('.sbox');
    pickSuggestion(box, (sgItems[box.dataset.sid] || [])[+t.dataset.sg]);
  }
  else if (t.dataset.syr) {                                  // Year tab
    const at = t.dataset.syr.lastIndexOf(':');
    setSearchFilter(t.dataset.syr.slice(0, at), 'year', t.dataset.syr.slice(at + 1));
  }
  else if (t.dataset.vp) {                                   // tapped a name in a list: open the profile
    const at = t.dataset.vp.indexOf(':');
    openPersonView(t.dataset.vp.slice(0, at), t.dataset.vp.slice(at + 1));
  }
  else if (t.dataset.sclr) {                                 // ✕ clear the search text
    const box = t.closest('.sbox');
    setSearchText(box, '');
    showSuggestions(box, '');
    box.querySelector('.sinp').focus();
  }

  // ----- Navigation -----
  else if (t.dataset.go) { e.preventDefault(); goToTab(t.dataset.go); }

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
    if (ACTIONS[parts[0]]) {
      ACTIONS[parts[0]](parts.slice(1).join(':'));
      if (EDIT_OPEN.has(parts[0])) focusEditForm();          // Edit opens in place and is brought into view
    }
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
  else if (t.id === 'accadd') addAccount();                  // admin: Accounts page
  else if (t.dataset.acc) accountAction(t);

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

  // ----- My account (photo / password), Resources, AI resume -----
  else if (t.dataset.me) { if (t.dataset.me === 'photorm') saveMyPhoto(''); else if (t.dataset.me === 'pwsave') changeMyPassword(); }
  else if (t.dataset.res) resourceAction(t);
  else if (t.dataset.rz) resumeAction(t);
  else if (t.dataset.rc) rcAction(t);
  else if (t.dataset.po) poAction(t);
  else if (t.dataset.rec) recAction(t);
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
  COMPLAINTS.filter(c => c.closed && (isStaffRole() || isMine(c)));
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
  } else if (isStaffRole()) {
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

// The guard greets the person after a successful sign-in: he hops, waves with a smile and
// a bubble says "Welcome, <first name>!". The wave uses two pictures that sit exactly over
// guard.webp: guard-wave.webp (body, raised hand removed) and guard-hand.webp (hand + forearm,
// which swings at the wrist). If they are missing, an emoji hand waves instead.
// Returns how many milliseconds to wait before the page reloads (0 = no greeting).
function greetGuard(name) {
  const mascot = document.querySelector('.mascot');
  if (!mascot) return 0;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;   // many Windows PCs have animations switched off
  const first = String(name || '').trim().split(/\s+/)[0];
  mascot.querySelector('.hello').textContent = first ? 'Welcome, ' + first + '!' : 'Welcome!';
  const ready = [...mascot.querySelectorAll('.pose img')].every(img => img.complete && img.naturalWidth > 0);
  mascot.classList.toggle('has-pose', ready);
  mascot.classList.toggle('still', calm);      // reduce motion: show the waving pose without moving
  mascot.classList.add('greet');
  return calm ? 1800 : ready ? 3000 : 2600;
}

// Sign in
function signIn() {
  if (signingIn) return;
  const user = $('user').value.trim(), pass = $('pass').value;
  if (!user || !pass) { failSignIn('Enter your roll number or email and password.'); return; }
  $('err').textContent = '';
  setLoading(true);

  // Real sign-in: the server checks ID, password and role
  API.login(user, pass, loginRole).then(async data => {
    try { await API.hydrate(); sessionStorage.setItem('cc_hyd', '1'); } catch (e) {}   // load shared data
    $('formPane').classList.add('hidden');
    $('donePane').classList.remove('hidden');
    setLoading(false);
    const greetMs = greetGuard(data.name);
    try {
      sessionStorage.setItem('cc_in', '1');
      sessionStorage.setItem('cc_role', data.role);
      sessionStorage.setItem('cc_dept', data.dept || '');
      sessionStorage.setItem('cc_hostel', data.hostel || '');
      const who = data.login_id || user;
      if (data.name) sessionStorage.setItem('cc_name', data.name);
      sessionStorage.removeItem('cc_photo');
      if (data.photo) sessionStorage.setItem('cc_photo', data.photo);
      sessionStorage.setItem('cc_user', who.includes('@') ? who.split('@')[0] : who);
    } catch (e) {}
    // reload so the app starts with the server data (a little later when the guard is greeting)
    setTimeout(() => location.reload(), greetMs || 1000);
  }).catch(e => { setLoading(false); failSignIn(e.message); });
}
$('signin').onclick = signIn;
['user', 'pass'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); }));

// Sign out
$('logout').onclick = async () => {
  await API.logout();
  try {
    sessionStorage.removeItem('cc_in');
    sessionStorage.removeItem('cc_role');
  } catch (e) {}
  showLogin();
};
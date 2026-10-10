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

// Global safe bindings for NOTICES, currentUser, and notice persistence
let currentUser = null;
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'NOTICES', {
      get() { return (typeof appData !== 'undefined' && Array.isArray(appData.notices)) ? appData.notices : []; },
      set(v) { if (typeof appData !== 'undefined') appData.notices = v; },
      configurable: true
    });
    Object.defineProperty(window, 'currentUser', {
      get() {
        const u = (sessionStorage.getItem('cc_user') || '').toLowerCase();
        return { id: u, role: getRole(), name: (typeof displayName === 'function' ? displayName() : u), dept: (typeof myDeptName === 'function' ? myDeptName() : ssGet('cc_dept')) };
      },
      configurable: true
    });
    window.saveNotices = function () {
      if (typeof customNotices !== 'undefined') {
        saveJson('cc_nt', customNotices);
      }
    };
  } catch (e) { }
}

// Escape text before putting it inside HTML (prevents broken markup / injection)
const escapeHtml = value =>
  String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Full name from the signed-in account (set at login from the server)
const accountName = () => {
  try { return sessionStorage.getItem('cc_name') || ''; }
  catch (e) { return ''; }
};

const cleanId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Quick preset selection helper: populates or appends ideas into form fields
function applyPreset(targetId, val, extra) {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (extra === 'append') {
    const cur = el.value.trim();
    const parts = cur ? cur.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (!parts.includes(val)) {
      parts.push(val);
      el.value = parts.join(', ');
    }
  } else {
    el.value = val;
    if (targetId === 'lr') {
      const lt = document.getElementById('lt');
      if (lt && extra) lt.value = extra;
    } else if (targetId === 'cftxt') {
      const cat = document.getElementById('cfcat');
      if (cat && extra) cat.value = extra;
    } else if (targetId === 'ctext') {
      const ccat = document.getElementById('ccat');
      if (ccat && extra) ccat.value = extra;
    } else if (targetId === 'atl') {
      const acat = document.getElementById('acat');
      if (acat && extra) acat.value = extra;
      const ads = document.getElementById('ads');
      if (ads && !ads.value.trim()) ads.value = 'Successfully completed and achieved ' + val;
    }
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
}

// Department of the signed-in account (set at login or from TEACHERS list)
const accountDept = () => {
  try {
    const d = sessionStorage.getItem('cc_dept');
    if (d) return d;
  } catch (e) { }
  if (typeof appData !== 'undefined' && appData.account && appData.account.dept) return appData.account.dept;
  try {
    const user = sessionStorage.getItem('cc_user') || '';
    if (user && typeof TEACHERS !== 'undefined') {
      const cu = cleanId(user);
      const s = TEACHERS.find(t => cleanId(t.id) === cu || cleanId(t.name) === cu);
      if (s && s.dept) return s.dept;
    }
  } catch (e) { }
  return '';
};

// Name of the signed-in user (escaped, safe for HTML)
const displayName = () => {
  let name = 'Student';
  try {
    name = accountName() || sessionStorage.getItem('cc_user') ||
      (isStaffRole() ? 'Staff' : getRole() === 'admin' ? 'Admin' : getRole() === 'guest' ? 'Guest' : 'Student');
  } catch (e) { }
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
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { }
  if (['cc_stud', 'cc_staff', 'cc_ach', 'cc_cmp', 'cc_nt', 'cc_events'].includes(key) && getRole() === 'admin') {
    if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
  }
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
    try { localStorage.setItem('cc_theme', next); } catch (e) { }
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
} catch (e) { }
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
  // [category, title, date, message, audience?, postedBy?, editedBy?, year?]
  notices: [
    ["Exam", "Mid-semester timetable released", "28 Sep", "Exams begin 12 Oct. Full timetable is at the Exam Cell.", "Students", "Exam Cell", null, "2"],
    ["Fee", "Hostel fee last date extended", "27 Sep", "Pay by 15 Oct to avoid a late fine.", "Everyone", "Accounts", null, "All"],
    ["Event", "Annual Tech Fest registrations open", "25 Sep", "Register teams at the Student Council desk.", "Everyone", "Dean Academics", null, "All"],
    ["Exam", "Practical exam slots for DBMS Lab", "24 Sep", "Slots are allotted by roll number.", "Students", "Dr. A. Mishra", null, "3"],
    ["Event", "Blood donation camp on Friday", "22 Sep", "Main auditorium, 10 AM to 4 PM.", "Everyone", "Red Cross Youth", null, "All"],
    ["General", "1st Year Student Induction & Document Verification", "20 Sep", "Welcome to CampBit! Mandatory orientation at Auditorium.", "Students", "Admin", null, "1"],
    ["Event", "Campus Placement Drive for 4th Year - TCS & Infosys", "18 Sep", "Eligible final-year students register before 5 PM tomorrow.", "Students", "Dr. P. Kar", null, "4"]
  ],
  tab: "home"                // currently open tab
};

// Tabs shown in the top menu for each role: [page id, label]
const STUDENT_TABS = [
  ["home", "Home"], ["timetable", "Timetable"], ["attendance", "Attendance"],
  ["exams", "Exams"], ["notices", "Notices"], ["events", "Events"], ["holidays", "Holidays"],
  ["achievements", "Achievements"], ["resources", "Resources"], ["leave", "Leave"],
  ["complaints", "Complaints"], ["mess", "Mess"], ["profile", "Profile"]
];
const T = {                                       // [page id, label]
  home: ["home", "Home"], timetable: ["timetable", "Timetable"], attendance: ["attendance", "Attendance"],
  students: ["students", "Students"], achievements: ["achievements", "Achievements"], notices: ["notices", "Notices"],
  holidays: ["holidays", "Holidays"], complaints: ["complaints", "Complaints"], leave: ["leave", "Leave"],
  profile: ["profile", "Profile"], resources: ["resources", "Resources"], recruit: ["recruit", "Recruiter requests"],
  events: ["events", "Events"], classes: ["classes", "Classes Held"], exams: ["exams", "Examinations"]
};
const TABS_BY_ROLE = {
  student: STUDENT_TABS,
  faculty: [T.home, T.timetable, T.attendance, T.exams, T.students, T.achievements, T.resources, T.notices, T.events, T.holidays, T.leave, T.profile],
  hod: [T.home, T.classes, T.timetable, T.attendance, T.exams, T.students, T.achievements, T.resources, T.notices, T.events, T.holidays, T.complaints, T.leave, T.profile],
  principal: [T.home, T.classes, T.exams, T.students, T.achievements, T.resources, T.complaints, T.notices, T.events, T.holidays, T.leave, T.profile],
  warden: [T.home, ["attendance", "Hostel Attendance"], T.exams, T.students, T.complaints, T.notices, T.events, T.holidays, T.leave, T.profile],
  placement_officer: [T.home, T.students, T.recruit, T.exams, T.notices, T.events, T.holidays, T.leave, T.profile],
  guest: [["home", "Dashboard"], ["students", "Candidates"], ["recruit", "Requests"]],   // recruiter view: anonymous profiles only
  admin: [
    ["home", "Home"], ["students", "Students"], ["staff", "Staff"], ["achievements", "Achievements"],
    ["resources", "Resources"], ["recruit", "Recruiter requests"], ["exams", "Examinations"], ["events", "Events"], ["complaints", "Complaints"], ["notices", "Notices"], ["leave", "Leave"], ["holidays", "Holidays"],
    ["accounts", "Accounts"], ["profile", "Profile"]
  ]
};
const currentTabs = () => TABS_BY_ROLE[getRole()] || STUDENT_TABS;
const hasTab = name => currentTabs().some(t => t[0] === name);
const canPostNotice = () => ['hod', 'principal', 'warden', 'placement_officer', 'admin'].includes(getRole());
const canEditHolidays = () => ['principal', 'admin'].includes(getRole());
function noticeAudiences() {                      // what this role may send to (the server checks it again)
  switch (getRole()) {
    case 'hod': return ['Dept:' + (ssGet('cc_dept') || 'CSE')];
    case 'warden': return ['Hostel:' + (ssGet('cc_hostel') || 'Block A')];
    case 'placement_officer': return ['Placement'];
    default: {
      const depts = ['Dept:CSE', 'Dept:IT', 'Dept:ECE', 'Dept:EEE', 'Dept:Mechanical', 'Dept:Civil'];
      return ['Everyone', 'Students', 'Staff', ...depts, 'Placement'];
    }
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
// Student requests waiting for HOD authorization
const defaultApprovals = [
  { id: "sa-1", n: "Ananya Das · CS23-0107", roll: "CS23-0107", dept: "CSE", hostel: "Block A, Room 205", t: "Medical", f: "2026-10-05", to: "2026-10-06", r: "Dental surgery", s: "Pending", target: "hod" },
  { id: "sa-2", n: "Rohit Behera · CS23-0119", roll: "CS23-0119", dept: "CSE", hostel: "Block B, Room 104", t: "Event / On-duty", f: "2026-10-08", to: "2026-10-09", r: "Inter-college hackathon", s: "Pending", target: "hod" },
  { id: "sa-3", n: "Sneha Nayak · CS23-0131", roll: "CS23-0131", dept: "CSE", hostel: "Block B, Room 210", t: "Family function", f: "2026-10-12", to: "2026-10-12", r: "Sister's wedding", s: "Pending", target: "hod" }
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
  // Filter out any automated test leaves from local storage
  if (leaveRequests && leaveRequests.student) {
    leaveRequests.student = leaveRequests.student.filter(r => !r.r?.includes('Automated') && !r.r?.includes('test'));
  }
  if (studentApprovals) {
    studentApprovals = studentApprovals.filter(r => !r.r?.includes('Automated') && !r.r?.includes('test'));
  }
}
loadLeave();

const saveLeave = () => saveJson(LEAVE_STORAGE_KEY, { LV: leaveRequests, AP: studentApprovals });

let studentLeavesLoading = false;
async function loadStudentLeavesFromServer() {
  if (studentLeavesLoading || typeof API === 'undefined' || !API.getLeaves) return;
  studentLeavesLoading = true;
  try {
    const list = await API.getLeaves();
    if (Array.isArray(list)) {
      if (getRole() === 'student') {
        leaveRequests.student = list.map(r => ({
          id: r.id,
          t: r.leave_type,
          f: r.from_date,
          to: r.to_date,
          r: r.reason,
          s: r.status,
          stage: r.stage,
          by: r.action_by,
          at: r.action_at ? new Date(r.action_at).getTime() : null,
          dept: r.dept,
          hostel: r.hostel
        }));
        saveLeave();
        const pgl = $('pg-leave');
        if (pgl && appData.tab === 'leave') {
          pgl.innerHTML = renderLeave();
          translatePage(pgl);
        }
      } else if (getRole() === 'hod') {
        const uId = userState && userState.user && userState.user.id;
        studentApprovals = list.filter(r => !uId || r.user_id !== uId).map(r => ({
          id: r.id,
          n: `${r.name} · ${r.login_id}`,
          roll: r.login_id,
          dept: r.dept,
          hostel: r.hostel,
          t: r.leave_type,
          f: r.from_date,
          to: r.to_date,
          r: r.reason,
          s: r.status,
          stage: r.stage,
          by: r.action_by,
          at: r.action_at ? new Date(r.action_at).getTime() : null,
          target: r.target_role || 'hod'
        }));
        saveLeave();
      }
    }
  } catch (e) {
    console.warn('loadStudentLeavesFromServer error:', e);
  } finally {
    studentLeavesLoading = false;
  }
}

// A staff request belongs to the signed-in staff member if it has no name (old demo row) or their name
const isMyLeave = r => !r.n || r.n === userName();

// Leave types per role and yearly staff quota
const LEAVE_TYPES = {
  student: ["Medical", "Personal", "Event / On-duty", "Family function"],
  staff: ["Casual", "Medical", "Earned", "Duty leave"]
};
const LEAVE_QUOTA = { Casual: 12, Medical: 10, Earned: 15 };

// Coloured status badge with principal forward indicator
const statusBadge = (status, stage) => {
  if (stage === 'Waiting for Principal' || (status === 'Pending' && stage && stage.includes('Principal'))) {
    return `<span class="badge" style="background:rgba(2,132,199,0.15);color:#0284c7;border:1px solid rgba(2,132,199,0.3)">⏳ Forwarded to Principal</span>`;
  }
  if (status === 'Approved') return `<span class="badge ok">✔ Approved</span>`;
  if (status === 'Rejected') return `<span class="badge bad">✖ Rejected</span>`;
  return `<span class="badge">⏳ Pending</span>`;
};
// "5 Oct – 6 Oct · 2 days"
const rangeText = req =>
  `${formatDate(req.f)}${req.f === req.to ? '' : ' – ' + formatDate(req.to)} · ` +
  `${countDays(req.f, req.to)} day${countDays(req.f, req.to) > 1 ? 's' : ''}`;
// Days of a leave type still available for staff
const leaveLeft = type =>
  LEAVE_QUOTA[type] - leaveRequests.staff
    .filter(r => isMyLeave(r) && r.t === type && r.s !== 'Rejected')
    .reduce((sum, r) => sum + countDays(r.f, r.to), 0);

// Helper: STRICT RULE - Only Head of Department (HOD) can view and grant student leave applications
const canReviewStudentLeave = () => getRole() === 'hod';

// Leave page (apply form + my requests + (HOD only) student requests to review)
function renderLeave() {
  const isStaff = isStaffRole();
  const role = leaveBucket();
  const mine = isStaff ? leaveRequests.staff.filter(isMyLeave) : leaveRequests.student;
  const canReview = canReviewStudentLeave();

  let subHeader = 'Apply for leave and track your requests';
  if (getRole() === 'hod') {
    subHeader = 'Apply for staff leave and review department student leaves as Head of Department (HOD)';
  } else if (getRole() === 'warden') {
    subHeader = 'Apply for staff leave and view leave balance';
  } else if (isStaff) {
    subHeader = 'Apply for staff leave (approved by Admin). Note: Student leave applications are reviewed exclusively by HOD.';
  }

  let out = `<h2>Leave</h2><p class="sub">${subHeader}</p>`;

  // Staff see how many leave days they have left
  if (isStaff) {
    out += '<div class="grid">' + ['Casual', 'Medical', 'Earned'].map(k =>
      `<div class="stat" style="cursor:default"><span>${k} leave left</span><b>${leaveLeft(k)}</b><span>of ${LEAVE_QUOTA[k]} days</span></div>`
    ).join('') + '</div>';
  }

  if (leaveMessage) {
    out += `<div class="item" style="margin-bottom:14px;border-color:#10b981;color:#10b981;background:rgba(16,185,129,0.08);border-radius:10px;padding:12px 16px"><b>${escapeHtml(leaveMessage)}</b></div>`;
    leaveMessage = '';
  }

  // SMS Gateway Simulator for rural / offline student access (LEAVE 2 FEVER)
  if (role === 'student') {
    out += `<div class="sms-gateway-card" style="margin-bottom:18px;background:linear-gradient(135deg,rgba(99,102,241,0.06),rgba(139,92,246,0.04));border:1px solid rgba(99,102,241,0.25);border-radius:14px;padding:16px 18px">` +
      `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:6px">` +
      `<div style="display:flex;align-items:center;gap:10px">` +
      `<span style="font-size:24px">📲</span>` +
      `<div>` +
      `<b style="font-size:15px;color:var(--text)">Rural &amp; Low-Connectivity SMS Simulator (+91 99370 00000)</b>` +
      `<p class="sub" style="margin:2px 0 0;font-size:12px">Basic keypad or offline? Text <code>LEAVE &lt;days&gt; &lt;reason&gt;</code> to apply without data.</p>` +
      `</div>` +
      `</div>` +
      `<span class="badge ok" style="font-size:11px">⚡ Live Gateway</span>` +
      `</div>` +
      `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">` +
      `<input id="sms-text-inp" type="text" value="LEAVE 2 FEVER" placeholder="e.g. LEAVE 2 FEVER or LEAVE 1 SISTER WEDDING" style="flex:1;min-width:200px;font-family:monospace;font-weight:600;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">` +
      `<button class="btn sm" id="btn-send-sms" data-sms-send type="button" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff">📡 Send SMS</button>` +
      `</div>` +
      `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;font-size:11.5px;align-items:center">` +
      `<span style="color:var(--muted)">Presets:</span>` +
      `<button type="button" class="btn ghost sm" style="padding:2px 8px;font-size:11px" data-sms-set="LEAVE 2 FEVER">LEAVE 2 FEVER</button>` +
      `<button type="button" class="btn ghost sm" style="padding:2px 8px;font-size:11px" data-sms-set="LEAVE 1 SISTER WEDDING">LEAVE 1 SISTER WEDDING</button>` +
      `<button type="button" class="btn ghost sm" style="padding:2px 8px;font-size:11px" data-sms-set="LEAVE 3 CHIKUNGUNYA">LEAVE 3 CHIKUNGUNYA</button>` +
      `</div>` +
      `<div id="sms-sim-result" style="display:none;margin-top:12px;padding:10px 14px;border-radius:10px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);font-size:12.5px;color:var(--text);font-family:monospace"></div>` +
      `</div>`;
  }

  // Apply form
  out += `<div class="ttcard frm"><b style="font-size:18px">Apply for leave</b>` +
    `<label for="lt">Leave type</label>` +
    `<select id="lt">${LEAVE_TYPES[role].map(t => `<option>${t}</option>`).join('')}</select>` +
    (role === 'student' ?
      `<p class="sub" style="margin:6px 0 12px;font-size:12px;color:var(--muted)">🏛️ All student leave applications are routed directly to the <b>Head of Department (HOD)</b> for approval.</p>`
      : '') +
    `<div class="two">` +
    `<div><label for="lf">From</label><input type="date" id="lf" min="${todayIso()}" value="${todayIso()}"></div>` +
    `<div><label for="lto">To</label><input type="date" id="lto" min="${todayIso()}" value="${todayIso()}"></div>` +
    `</div>` +
    `<div class="form-preset-wrap">` +
    `<span class="preset-label">💡 Common Leave Reasons (tap to select):</span>` +
    `<div class="preset-chips">` +
    `<button type="button" class="preset-chip" data-preset="lr:Viral Fever &amp; Medical Rest:Medical">🩺 Viral Fever &amp; Rest</button>` +
    `<button type="button" class="preset-chip" data-preset="lr:Family Function &amp; Sibling Wedding:Casual">👨‍👩‍👧 Family Wedding</button>` +
    `<button type="button" class="preset-chip" data-preset="lr:Urgent Personal Work at Hometown:Casual">🏡 Hometown Work</button>` +
    `<button type="button" class="preset-chip" data-preset="lr:Attending Technical Hackathon / Workshop:Duty">💻 Hackathon / Project</button>` +
    `<button type="button" class="preset-chip" data-preset="lr:Outstation Travel &amp; Semester Break Pass:Vacation">🚆 Semester Break</button>` +
    `<button type="button" class="preset-chip" data-preset="lr:Appearing for Competitive Exam:Duty">📝 Competitive Exam</button>` +
    `<button type="button" class="preset-chip" data-preset="lr:Hostel Weekend Outing Pass:Casual">🏠 Weekend Pass</button>` +
    `</div></div>` +
    `<label for="lr">Reason</label><textarea id="lr" placeholder="Briefly explain the reason"></textarea>` +
    `<div class="err" id="lerr" role="alert"></div>` +
    `<button class="btn" id="lsub" type="button" style="width:100%">Submit request</button></div>`;

  // My requests
  out += `<h3 style="margin:24px 0 8px">My requests</h3><div class="list">` +
    (mine.length
      ? mine.map(r =>
        `<div class="item">` +
        `<div class="top"><b>${escapeHtml(r.t)} leave</b>${statusBadge(r.s, r.stage)}</div>` +
        `<p>${rangeText(r)}</p>` +
        `<p style="margin:4px 0">${escapeHtml(r.r)}</p>` +
        (r.by
          ? `<p style="margin-top:6px;font-size:12px;font-weight:600;color:${r.s === 'Approved' ? '#10b981' : '#ef4444'}">${r.s === 'Approved' ? '✔' : '✖'} ${r.s} by <b>${escapeHtml(r.by)}</b>${r.at ? ' · ' + formatDate(new Date(r.at).toISOString().slice(0, 10)) : ''}</p>`
          : '') +
        (r.s === 'Approved'
          ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">` +
          `<span style="font-size:12px;color:var(--muted)">🛡️ Gate pass authorized by campus security</span>` +
          `<button class="btn sm" data-gp="${r.id}" type="button" style="background:linear-gradient(135deg,#0284c7,#0369a1);box-shadow:0 2px 8px rgba(2,132,199,0.3)">🎫 View Digital Gate Pass</button>` +
          `</div>`
          : '') +
        `</div>`
      ).join('')
      : '<p class="sub">No requests yet.</p>') + `</div>`;

  // STRICT RULE: ONLY HOD can view and grant student leave applications
  if (canReview) {
    const roleTitle = 'Head of Department (HOD)';
    const tagClass = 'hod';
    const relevantApprovals = studentApprovals.filter(r => r && r.id);
    const pendingCount = relevantApprovals.filter(r => r.s === 'Pending').length;

    out += `<div class="lv-review-panel">` +
      `<div class="lv-panel-header">` +
      `<div class="lv-panel-title">` +
      `<span>🎓 Student Leave Applications</span>` +
      `<span class="lv-auth-tag ${tagClass}">🛡️ Authorized: ${roleTitle}</span>` +
      `</div>` +
      `<div class="lv-count-badge">${pendingCount} Pending Decision</div>` +
      `</div>` +
      `<p class="sub" style="margin:-10px 0 16px;font-size:12.5px">Exclusive departmental authority: Review, grant or reject student applications as Head of Department.</p>` +
      `<div class="list">` +
      (relevantApprovals.length
        ? relevantApprovals.map(r =>
          `<div class="lv-req-item status-${String(r.s).toLowerCase()}">` +
          `<div class="lv-req-header">` +
          `<div class="lv-student-meta">` +
          `<span class="lv-student-name">${escapeHtml(r.n)}</span>` +
          (r.dept ? `<span class="lv-meta-chip">📚 ${escapeHtml(r.dept)}</span>` : '') +
          (r.hostel ? `<span class="lv-meta-chip">🏠 ${escapeHtml(r.hostel)}</span>` : '') +
          `<span class="lv-meta-chip" style="color:var(--accent)">Route: HOD</span>` +
          `</div>` +
          statusBadge(r.s, r.stage) +
          `</div>` +
          `<p style="margin:4px 0;font-size:13px"><b>${escapeHtml(r.t)} leave</b> · ${rangeText(r)}</p>` +
          `<div class="lv-reason-box">"${escapeHtml(r.r)}"</div>` +
          (r.s === 'Pending'
            ? `<div class="lv-action-row">` +
            `<span class="sub" style="font-size:12px">Action required by ${roleTitle}</span>` +
            `<div class="btns" style="gap:8px">` +
            `<button class="btn sm lv-btn-grant" data-ap2="${r.id}:Approved" type="button">✔ Grant Leave</button>` +
            `<button class="btn ghost sm lv-btn-reject" data-ap2="${r.id}:Rejected" type="button">✖ Reject</button>` +
            `</div>` +
            `</div>`
            : (r.by
              ? `<div class="lv-action-row"><div class="lv-decided-stamp">${r.s === 'Approved' ? '✔' : '✖'} ${r.s} by <b>${escapeHtml(r.by)}</b>${r.at ? ' on ' + formatDate(new Date(r.at).toISOString().slice(0, 10)) : ''}</div>${r.s === 'Approved' ? `<button class="btn sm ghost" data-gp="${r.id}" type="button" style="font-size:11.5px">🎫 View Pass</button>` : ''}</div>`
              : '')
          ) +
          `</div>`
        ).join('')
        : '<p class="sub" style="padding:16px;text-align:center;background:rgba(128,128,128,0.04);border-radius:10px">No student leave requests pending for your scope.</p>') +
      `</div></div>`;
  } else if (isStaff) {
    // Other staff members (faculty, warden, placement officer, etc.) CANNOT see or grant student leave
    out += `<div class="lv-restricted-banner">` +
      `<span style="font-size:24px">🔒</span>` +
      `<div>` +
      `<b style="font-size:14px;display:block;margin-bottom:2px">Student Leave Review Restricted</b>` +
      `<p class="sub" style="margin:0;font-size:12.5px">Under campus governance rules, student leave applications are restricted. Only the <b>Head of Department (HOD)</b> can view and grant student leaves.</p>` +
      `</div>` +
      `</div>`;
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

  // A student's request is routed exclusively to HOD & Warden
  if (role === 'student') {
    const studentUser = myStudent() || {};
    const roll = studentUser.roll || userName().toUpperCase();
    const sName = studentUser.name || accountName() || userName();
    const dept = studentDept(studentUser) || 'CSE';
    const hostel = studentUser.hostel || 'Hostel Block A';
    const authTarget = 'hod';
    entry.target = authTarget;
    entry.dept = dept;
    entry.hostel = hostel;

    studentApprovals.unshift({
      id: entry.id,
      roll: roll,
      n: sName + ' · ' + roll,
      dept: dept,
      hostel: hostel,
      target: authTarget,
      t: entry.t,
      f: from,
      to,
      r: reason,
      s: 'Pending'
    });
  }
  saveLeave();
  if (typeof API !== 'undefined' && API.createLeave) {
    API.createLeave({
      leave_type: $('lt').value,
      from_date: from,
      to_date: to,
      reason: reason
    }).then(res => {
      if (res && res.leave) {
        entry.id = res.leave.id;
        if (studentApprovals && studentApprovals[0]) studentApprovals[0].id = res.leave.id;
        saveLeave();
        loadStudentLeavesFromServer();
      }
    }).catch(() => { });
  }
  leaveMessage = role === 'staff'
    ? '✅ Leave request sent to the admin. Status: Pending.'
    : '✅ Leave request submitted to Head of Department (HOD). Status: Pending.';
  render();
  window.scrollTo(0, 0);
}

// STRICT RULE: Only HOD can grant/reject a student's request
function decideStudentLeave(id, status) {
  if (!canReviewStudentLeave()) {
    showToast('Unauthorized: Only HOD is authorized to grant or reject student leave applications.');
    return;
  }
  const req = studentApprovals.find(r => String(r.id) === String(id));
  if (!req || req.s !== 'Pending') return;
  const approver = `${displayName()} (HOD)`;
  req.s = status;
  req.by = approver;
  req.at = Date.now();

  const own = leaveRequests.student.find(r => String(r.id) === String(id));
  if (own) {
    own.s = status;
    own.by = approver;
    own.at = Date.now();
  }
  saveLeave();
  if (typeof API !== 'undefined' && API.actOnLeave) {
    API.actOnLeave(id, {
      status: status,
      action: status.toLowerCase() === 'approved' ? 'approve' : 'reject',
      action_note: `${status} by Head of Department`
    }).then(() => {
      loadStudentLeavesFromServer();
      loadHodDashboardData();
    }).catch(err => {
      console.warn('API actOnLeave note:', err);
    });
  }
  leaveMessage = `${status === 'Approved' ? '✅ Granted' : '✖ Rejected'} leave for ${(req.n ? req.n.split(' · ')[0] : 'student') || 'student'}.`;
  showToast(leaveMessage);
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
  const isHOD = getRole() === 'hod';
  const canReview = canReviewStudentLeave();
  const pendingRequests = canReview ? studentApprovals.filter(r => r.s === 'Pending').length : 0;
  const r = myStaff();
  const dept = (r && r.dept) || ssGet('cc_dept') || 'Computer Science';

  const roleBadgeHtml = isHOD
    ? `<span class="db-role-badge staff">🏛️ Head of Department (HOD)</span>`
    : `<span class="db-role-badge db-role-faculty">🧑‍🏫 Faculty Member</span>`;
  const subDesc = isHOD
    ? `HOD Executive Workspace. Oversee department lectures, authorize student leaves, and manage notices.`
    : `Faculty Workspace. Manage your lecture schedule, department curriculum, and student attendance.`;

  return `
    <div class="db-page">
      <div class="db-hero-card">
        <div class="db-hero-main">
          <div class="db-hero-avatar">
            <div class="avatar">${avatarInner(myPhotoValue(r))}</div>
          </div>
          <div class="db-hero-info">
            <div class="db-hero-badge-row">
              ${roleBadgeHtml}
              <span class="db-campus-pill">🏛️ Department of ${escapeHtml(dept)}</span>
              <span class="db-live-pill"><span class="db-pulse-dot"></span> Active</span>
            </div>
            <h2 class="db-hero-title">${greetingHtml()}, ${displayName()} 👋</h2>
            <p class="db-hero-sub">${subDesc}</p>
          </div>
        </div>
        <div class="db-quick-bar">
          <span class="db-quick-label">Quick Actions:</span>
          <div class="db-quick-chips">
            <button class="db-quick-chip" data-go="timetable" type="button"><span>📅</span> Schedule</button>
            <button class="db-quick-chip" data-go="attendance" type="button"><span>✅</span> Attendance</button>
            <button class="db-quick-chip" data-go="exams" type="button"><span>📝</span> Examinations</button>
            ${isHOD ? `<button class="db-quick-chip" data-go="classes" type="button"><span>📊</span> Classes Held</button>` : ''}
            ${canReview
      ? `<button class="db-quick-chip" data-go="leave" type="button"><span>📋</span> Student Leaves ${pendingRequests ? `<b class="db-chip-badge">${pendingRequests}</b>` : ''}</button>`
      : `<button class="db-quick-chip" data-go="leave" type="button"><span>🏖️</span> My Leave</button>`
    }
            <button class="db-quick-chip" data-go="notices" type="button"><span>📢</span> Notices</button>
          </div>
        </div>
      </div>

      <div class="db-search-wrap">
        ${searchBox('s', 'sq-home', 'Search enrolled students…', '')}
      </div>

      <div class="db-stats-grid">
        ${isHOD ? `
          <button class="db-stat-tile db-accent-amber" data-go="classes" type="button">
            <div class="db-tile-top">
              <div class="db-tile-icon-box">📊</div>
              <span class="db-tile-tag">Conduction Tracker</span>
            </div>
            <div class="db-tile-metric">${getDeptClassesTotalHeld()} Classes</div>
            <div class="db-tile-title">Classes Held (Per Subject / Sec / Yr)</div>
            <div class="db-tile-foot">
              <span>View lecture progress by year &amp; section</span>
              <span class="db-tile-arrow">→</span>
            </div>
          </button>
        ` : ''}
        <button class="db-stat-tile db-accent-blue" data-go="attendance" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">✅</div>
            <span class="db-tile-tag">Class</span>
          </div>
          <div class="db-tile-metric">Take Roll</div>
          <div class="db-tile-title">Class Attendance</div>
          <div class="db-tile-foot">
            <span>Mark enrolled students</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-blue" data-go="timetable" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">📅</div>
            <span class="db-tile-tag">Today</span>
          </div>
          <div class="db-tile-metric">${classesToday}</div>
          <div class="db-tile-title">Classes Scheduled</div>
          <div class="db-tile-foot">
            <span>${classesToday ? 'View timetable timeline' : 'No lectures today'}</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        ${canReview ? `
          <button class="db-stat-tile db-accent-rose" data-go="leave" type="button">
            <div class="db-tile-top">
              <div class="db-tile-icon-box">📋</div>
              <span class="db-tile-tag ${pendingRequests ? 'db-tag-urgent' : ''}">${pendingRequests ? 'Action required' : 'Clear'}</span>
            </div>
            <div class="db-tile-metric">${pendingRequests}</div>
            <div class="db-tile-title">Student Leave Requests</div>
            <div class="db-tile-foot">
              <span>HOD departmental approval</span>
              <span class="db-tile-arrow">→</span>
            </div>
          </button>
        ` : `
          <button class="db-stat-tile db-accent-rose" data-go="students" type="button">
            <div class="db-tile-top">
              <div class="db-tile-icon-box">👥</div>
              <span class="db-tile-tag">Directory</span>
            </div>
            <div class="db-tile-metric">${STUDENTS.length}</div>
            <div class="db-tile-title">Enrolled Students</div>
            <div class="db-tile-foot">
              <span>Department directory</span>
              <span class="db-tile-arrow">→</span>
            </div>
          </button>
        `}

        <button class="db-stat-tile db-accent-emerald" data-go="leave" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">🏖️</div>
            <span class="db-tile-tag">Balance</span>
          </div>
          <div class="db-tile-metric">${leaveLeft('Casual')}</div>
          <div class="db-tile-title">Casual Leave Left</div>
          <div class="db-tile-foot">
            <span>Out of 12 allotted days</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-purple" data-go="holidays" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">🗓️</div>
            <span class="db-tile-tag">Calendar</span>
          </div>
          <div class="db-tile-metric">${HOLIDAYS.length}</div>
          <div class="db-tile-title">Academic Holidays</div>
          <div class="db-tile-foot">
            <span>Upcoming college breaks</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>
      </div>

      ${renderNotifications()}
      ${renderTodayTimetable()}
    </div>
  `;
}

// ----- Dedicated Placement Officer Dashboard (NO class attendance, NO class timetable) -----
function renderPlacementHome() {
  const r = myStaff();
  const reqs = po.list || [];
  const pendingRequests = reqs.filter(x => x.status === 'pending_officer').length;
  const approvedRequests = reqs.filter(x => x.status === 'approved' || x.status === 'awaiting_student').length;
  const totalStudents = STUDENTS.length;

  return `
    <div class="db-page">
      <div class="db-hero-card">
        <div class="db-hero-main">
          <div class="db-hero-avatar">
            <div class="avatar">${avatarInner(myPhotoValue(r))}</div>
          </div>
          <div class="db-hero-info">
            <div class="db-hero-badge-row">
              <span class="db-role-badge staff">💼 Training &amp; Placement Officer</span>
              <span class="db-campus-pill">🏢 Corporate Relations &amp; Placement Cell</span>
              <span class="db-live-pill"><span class="db-pulse-dot"></span> Drives Active</span>
            </div>
            <h2 class="db-hero-title">${greetingHtml()}, ${displayName()} 👋</h2>
            <p class="db-hero-sub">Placement Officer Workspace. Oversee company recruitment drives, review employer inquiries, and verify candidate resumes.</p>
          </div>
        </div>
        <div class="db-quick-bar">
          <span class="db-quick-label">Quick Actions:</span>
          <div class="db-quick-chips">
            <button class="db-quick-chip" data-go="recruit" type="button"><span>💼</span> Recruiter Inquiries ${pendingRequests ? `<b class="db-chip-badge">${pendingRequests}</b>` : ''}</button>
            <button class="db-quick-chip" data-go="students" type="button"><span>🎓</span> Candidate Roster</button>
            <button class="db-quick-chip" data-go="exams" type="button"><span>📝</span> Exam Schedule</button>
            <button class="db-quick-chip" data-go="notices" type="button"><span>📢</span> Drive Notices</button>
            <button class="db-quick-chip" data-go="leave" type="button"><span>🏖️</span> My Leave</button>
          </div>
        </div>
      </div>

      <div class="db-search-wrap">
        ${searchBox('s', 'sq-home', 'Search eligible candidates, skills, or rolls…', '')}
      </div>

      <div class="db-stats-grid">
        <button class="db-stat-tile db-accent-rose" data-go="recruit" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">💼</div>
            <span class="db-tile-tag ${pendingRequests ? 'db-tag-urgent' : ''}">${pendingRequests ? 'Action required' : 'Up to date'}</span>
          </div>
          <div class="db-tile-metric">${pendingRequests}</div>
          <div class="db-tile-title">Pending Recruiter Inquiries</div>
          <div class="db-tile-foot">
            <span>Corporate contact requests awaiting review</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-blue" data-go="students" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">👥</div>
            <span class="db-tile-tag">Candidates</span>
          </div>
          <div class="db-tile-metric">${totalStudents}</div>
          <div class="db-tile-title">Registered Students</div>
          <div class="db-tile-foot">
            <span>View candidate profiles &amp; resumes</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-emerald" data-go="recruit" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">🤝</div>
            <span class="db-tile-tag">Active Drives</span>
          </div>
          <div class="db-tile-metric">${approvedRequests}</div>
          <div class="db-tile-title">Approved Placements</div>
          <div class="db-tile-foot">
            <span>Recruiter connections initiated</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-purple" data-go="exams" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">📝</div>
            <span class="db-tile-tag">Assessments</span>
          </div>
          <div class="db-tile-metric">Winter 2026</div>
          <div class="db-tile-title">Examination Calendar</div>
          <div class="db-tile-foot">
            <span>Schedule drives avoiding university exams</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-amber" data-go="leave" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">🏖️</div>
            <span class="db-tile-tag">Balance</span>
          </div>
          <div class="db-tile-metric">${leaveLeft('Casual')}</div>
          <div class="db-tile-title">Casual Leave Left</div>
          <div class="db-tile-foot">
            <span>Out of 12 allotted days</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>
      </div>

      ${renderTodoWidget('placement_officer', '💼 Placement Cell Daily Works & Tasks')}
      ${renderNotifications()}
    </div>
  `;
}

// =============================================================================
// 7B. EXECUTIVE DASHBOARDS: HOD (DEPARTMENT-SCOPED) & PRINCIPAL (COLLEGE-WIDE)
// =============================================================================

// ----- Error translation & I18N Helper (EN / HI / OR) -----
const SERVER_ERROR_TRANSLATIONS = {
  400: {
    en: "Invalid request. Please check the entered information.",
    hi: "अमान्य अनुरोध। कृपया दर्ज की गई जानकारी की जांच करें।",
    or: "ଅବୈଧ ଅନୁରୋଧ। ଦୟାକରି ଦିଆଯାଇଥିବା ସୂଚନା ଯାଞ୍ଚ କରନ୍ତୁ।"
  },
  401: {
    en: "Your session has expired. Please sign in again.",
    hi: "आपका सत्र समाप्त हो गया है। कृपया पुनः साइन इन करें।",
    or: "ଆପଣଙ୍କ ଅଧିବେଶନ ସମାପ୍ତ ହୋଇଛି। ଦୟାକରି ପୁନର୍ବାର ସାଇନ୍ ଇନ୍ କରନ୍ତୁ।"
  },
  403: {
    en: "Access denied: You do not have permission for this action.",
    hi: "पहुंच अस्वीकृत: आपको इस कार्रवाई की अनुमति नहीं है।",
    or: "ପ୍ରବେଶ ଅସ୍ୱୀକୃତ: ଆପଣଙ୍କ ପାଖରେ ଏହି କାର୍ଯ୍ୟ କରିବା ପାଇଁ ଅନୁମତି ନାହିଁ।"
  },
  404: {
    en: "Requested record not found on campus servers.",
    hi: "अनुरोधित रिकॉर्ड कैंपस सर्वर पर नहीं मिला।",
    or: "ଅନୁରୋଧିତ ରେକର୍ଡ କ୍ୟାମ୍ପସ ସର୍ଭରରେ ମିଳିଲା ନାହିଁ।"
  },
  409: {
    en: "Conflict: This record has already been decided or conflicts with an existing entry.",
    hi: "विरोधाभास: इस रिकॉर्ड पर पहले ही निर्णय लिया जा चुका है।",
    or: "ଦ୍ୱନ୍ଦ୍ୱ: ଏହି ରେକର୍ଡ ପୂର୍ବରୁ ପ୍ରକ୍ରିୟାକରଣ ହୋଇସାରିଛି।"
  },
  413: {
    en: "Data payload or file size exceeds allowed limit.",
    hi: "डेटा या फ़ाइल का आकार अनुमत सीमा से अधिक है।",
    or: "ଡାଟା କିମ୍ବା ଫାଇଲ୍ ଆକାର ଅନୁମତି ସୀମା ଅତିକ୍ରମ କରିଛି।"
  },
  422: {
    en: "Validation error: Check your input format.",
    hi: "सत्यापन त्रुटि: अपने इनपुट प्रारूप की जाँच करें।",
    or: "ଯାଞ୍ଚ ତ୍ରୁଟି: ନିଜର ଇନପୁଟ୍ ଫର୍ମାଟ୍ ଯାଞ୍ଚ କରନ୍ତୁ।"
  },
  500: {
    en: "Campus server error. Please try again shortly.",
    hi: "कैंपस सर्वर त्रुटि। कृपया थोड़ी देर बाद पुनः प्रयास करें।",
    or: "କ୍ୟାମ୍ପସ ସର୍ଭର ତ୍ରୁଟି। ଦୟାକରି କିଛି ସମୟ ପରେ ପୁନଃ ଚେଷ୍ଟା କରନ୍ତୁ।"
  },
  network: {
    en: "Network error: Unable to connect to campus servers.",
    hi: "नेटवर्क त्रुटि: कैंपस सर्वर से संपर्क नहीं हो पा रहा है।",
    or: "ନେଟୱର୍କ ତ୍ରୁଟି: କ୍ୟାମ୍ପସ ସର୍ଭର ସହ ଯୋଗାଯୋଗ ହୋଇପାରିଲା ନାହିଁ।"
  },
  default: {
    en: "An unexpected error occurred. Please try again.",
    hi: "एक अप्रत्याशित त्रुटि हुई। कृपया पुनः प्रयास करें।",
    or: "ଏକ ଅପ୍ରତ୍ୟାଶିତ ତ୍ରୁଟି ଘଟିଛି। ଦୟାକରି ପୁନଃ ଚେଷ୍ଟା କରନ୍ତୁ।"
  }
};

function getTranslatedErrorMessage(err) {
  const curLang = (typeof lang !== 'undefined' && ['en', 'hi', 'or'].includes(lang)) ? lang : 'en';
  const st = err && (err.status || (err.response && err.response.status));
  if (st && SERVER_ERROR_TRANSLATIONS[st]) {
    return SERVER_ERROR_TRANSLATIONS[st][curLang] || SERVER_ERROR_TRANSLATIONS[st].en;
  }
  if (!navigator.onLine || (err && err.message && err.message.toLowerCase().includes('connection'))) {
    return SERVER_ERROR_TRANSLATIONS.network[curLang] || SERVER_ERROR_TRANSLATIONS.network.en;
  }
  return SERVER_ERROR_TRANSLATIONS.default[curLang] || SERVER_ERROR_TRANSLATIONS.default.en;
}

const DOMAIN_I18N = {
  leaveApprovedFinal: {
    en: "✅ Leave approved (Final HOD decision).",
    hi: "✅ अवकाश स्वीकृत (विभागाध्यक्ष का अंतिम निर्णय)।",
    or: "✅ ଛୁଟି ମଞ୍ଜୁର ହୋଇଛି (ବିଭାଗୀୟ ମୁଖ୍ୟଙ୍କ ଚୂଡ଼ାନ୍ତ ନିଷ୍ପତ୍ତି)।"
  },
  leaveForwardedPrincipal: {
    en: "📋 Leave approved and forwarded to Principal (Waiting for Principal).",
    hi: "📋 अवकाश स्वीकृत एवं प्राचार्य को प्रेषित (प्राचार्य की स्वीकृति प्रतीक्षित)।",
    or: "📋 ଛୁଟି ମଞ୍ଜୁର ହୋଇ ଅଧ୍ୟକ୍ଷଙ୍କ ନିକଟକୁ ପଠାଗଲା (ଅଧ୍ୟକ୍ଷଙ୍କ ଅନୁମୋଦନ ଅପେକ୍ଷାରେ)।"
  },
  leavePrincipalSanctioned: {
    en: "🎓 Leave sanctioned by Principal executive office.",
    hi: "🎓 प्राचार्य कार्यालय द्वारा अवकाश स्वीकृत किया गया।",
    or: "🎓 ଅଧ୍ୟକ୍ଷଙ୍କ କାର୍ଯ୍ୟାଳୟ ଦ୍ୱାରା ଛୁଟି ମଞ୍ଜୁର ହୋଇଛି।"
  },
  leaveRejected: {
    en: "✖ Leave request rejected.",
    hi: "✖ अवकाश आवेदन अस्वीकृत कर दिया गया।",
    or: "✖ ଛୁଟି ଆବେଦନ ଖାରଜ କରାଗଲା।"
  },
  timetableSuccess: {
    en: "📅 Timetable change posted! Notice broadcast to department and calendar (.ics) updated.",
    hi: "📅 समय सारणी परिवर्तन पोस्ट किया गया! विभागीय सूचना प्रसारित और कैलेंडर (.ics) अद्यतन।",
    or: "📅 ସମୟସୂଚୀ ପରିବର୍ତ୍ତନ ପୋଷ୍ଟ ହେଲା! ବିଭାଗୀୟ ବିଜ୍ଞପ୍ତି ପ୍ରକାଶିତ ଏବଂ କ୍ୟାଲେଣ୍ଡର (.ics) ଅପଡେଟ୍ ହୋଇଛି।"
  },
  deptNoticeSuccess: {
    en: "📢 Department notice published successfully.",
    hi: "📢 विभागीय सूचना सफलतापूर्वक प्रकाशित हुई।",
    or: "📢 ବିଭାଗୀୟ ବିଜ୍ଞପ୍ତି ସଫଳତାର ସହ ପ୍ରକାଶିତ ହେଲା।"
  },
  slaRunSuccess: {
    en: "⚡ SLA breach check completed. Escalations updated.",
    hi: "⚡ एसएलए उल्लंघन जांच पूर्ण। उच्चाधिकार मामले अद्यतन।",
    or: "⚡ ଏସ୍‌ଏଲ୍‌ଏ ଯାଞ୍ଚ ସମ୍ପୂର୍ଣ୍ଣ ହେଲା। ଜରୁରୀ ମାମଲା ଅପଡେଟ୍ ହେଲା।"
  },
  escalationClosed: {
    en: "✅ Escalation resolved and closed.",
    hi: "✅ उच्चाधिकार मामला सुलझाया और बंद किया गया।",
    or: "✅ ଜରୁରୀ ମାମଲା ସମାଧାନ ହୋଇ ବନ୍ଦ କରାଗଲା।"
  },
  certIssuedSuccess: {
    en: "🏅 SHA-256 Verified Certificate issued successfully.",
    hi: "🏅 एसएचए-256 सत्यापित प्रमाणपत्र सफलतापूर्वक जारी किया गया।",
    or: "🏅 SHA-256 ପ୍ରମାଣିତ ପ୍ରମାଣପତ୍ର ସଫଳତାର ସହ ପ୍ରଦାନ କରାଗଲା।"
  },
  certRevokedSuccess: {
    en: "⚠️ Certificate revoked by Principal.",
    hi: "⚠️ प्राचार्य द्वारा प्रमाणपत्र रद्द कर दिया गया।",
    or: "⚠️ ଅଧ୍ୟକ୍ଷଙ୍କ ଦ୍ୱାରା ପ୍ରମାଣପତ୍ର ବାତିଲ କରାଗଲା।"
  }
};

function getDomainI18n(key) {
  const curLang = (typeof lang !== 'undefined' && ['en', 'hi', 'or'].includes(lang)) ? lang : 'en';
  return (DOMAIN_I18N[key] && DOMAIN_I18N[key][curLang]) || (DOMAIN_I18N[key] && DOMAIN_I18N[key].en) || key;
}

function renderEmptyState(icon, title, subtitle) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${escapeHtml(title)}</div>
      <div class="empty-state-sub">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

function renderLoadingState(text = 'Loading live data…') {
  return `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

// Data Stores
let hodLeavesList = null;
let hodLeavesLoading = false;
let hodTimetableList = null;
let hodTimetableLoading = false;
let hodTimetableFormOpen = false;
let hodNoticeFormOpen = false;
let hodAlertsData = null;
let hodAlertsLoading = false;
let hodComplaintsList = null;
let hodComplaintsLoading = false;

let prinWaitingLeaves = null;
let prinAllLeaves = null;
let prinLeavesLoading = false;
let prinLeavesViewMode = 'waiting';
let prinEscalationsList = null;
let prinEscalationsLoading = false;
let prinAnalyticsData = null;
let prinAnalyticsLoading = false;
let prinAuditData = null;
let prinAuditLoading = false;
let prinAuditFilters = { action: '', actor: '', date: '' };
let prinNoticeFormOpen = false;

function myDeptName() {
  const r = myStaff();
  return (r && r.dept) || ssGet('cc_dept') || 'CSE';
}

function loadHodDashboardData() {
  const myD = myDeptName();
  if (hodLeavesList === null && !hodLeavesLoading) {
    hodLeavesLoading = true;
    API.getLeaves().then(res => {
      hodLeavesList = Array.isArray(res) ? res : [];
    }).catch(err => {
      console.warn('Leaves fetch error:', err);
      hodLeavesList = [];
    }).finally(() => {
      hodLeavesLoading = false;
      if (getRole() === 'hod') refreshHodHome();
    });
  }

  if (hodTimetableList === null && !hodTimetableLoading) {
    hodTimetableLoading = true;
    API.getTimetableAdjustments({ dept: myD }).then(res => {
      hodTimetableList = Array.isArray(res) ? res : [];
    }).catch(err => {
      console.warn('Timetable adjustments fetch error:', err);
      hodTimetableList = [];
    }).finally(() => {
      hodTimetableLoading = false;
      if (getRole() === 'hod' && appData.tab === 'home') refreshHodHome();
    });
  }

  if (hodAlertsData === null && !hodAlertsLoading) {
    hodAlertsLoading = true;
    API.getAttendanceAlerts({ dept: myD }).then(res => {
      hodAlertsData = res || null;
    }).catch(err => {
      console.warn('Attendance alerts fetch error:', err);
      hodAlertsData = { alerts: [], total_students: 0, below_threshold_count: 0 };
    }).finally(() => {
      hodAlertsLoading = false;
      if (getRole() === 'hod' && appData.tab === 'home') refreshHodHome();
    });
  }

  if (hodComplaintsList === null && !hodComplaintsLoading) {
    hodComplaintsLoading = true;
    API.getComplaints().then(res => {
      hodComplaintsList = Array.isArray(res) ? res : [];
    }).catch(err => {
      console.warn('Complaints fetch error:', err);
      hodComplaintsList = [];
    }).finally(() => {
      hodComplaintsLoading = false;
      if (getRole() === 'hod') refreshHodHome();
    });
  }
}

function refreshHodHome() {
  if (getRole() !== 'hod') return;
  const pg = $('pg-home');
  if (pg && appData.tab === 'home') {
    pg.innerHTML = renderHODHome();
    translatePage(pg);
  }
  const pgl = $('pg-leave');
  if (pgl && appData.tab === 'leave') {
    pgl.innerHTML = renderHODLeavePage();
    translatePage(pgl);
  }
}

function loadPrincipalDashboardData() {
  if (prinWaitingLeaves === null && !prinLeavesLoading) {
    prinLeavesLoading = true;
    API.getLeaves().then(res => {
      const arr = Array.isArray(res) ? res : [];
      prinAllLeaves = arr;
      prinWaitingLeaves = arr.filter(x => x.stage === 'Waiting for Principal' || (x.status === 'Pending' && x.target_role === 'principal'));
    }).catch(err => {
      console.warn('Principal leaves fetch error:', err);
      prinWaitingLeaves = [];
      prinAllLeaves = [];
    }).finally(() => {
      prinLeavesLoading = false;
      if (getRole() === 'principal') refreshPrinHome();
    });
  }

  if (prinEscalationsList === null && !prinEscalationsLoading) {
    prinEscalationsLoading = true;
    API.getRequests({ type: 'escalation' }).then(res => {
      prinEscalationsList = Array.isArray(res) ? res : [];
    }).catch(err => {
      console.warn('Principal escalations fetch error:', err);
      prinEscalationsList = [];
    }).finally(() => {
      prinEscalationsLoading = false;
      if (getRole() === 'principal') refreshPrinHome();
    });
  }

  if (prinAnalyticsData === null && !prinAnalyticsLoading) {
    prinAnalyticsLoading = true;
    Promise.all([
      API.getAdminAnalytics().catch(() => null),
      API.getRecurringComplaints().catch(() => null),
      API.getMessSummary().catch(() => null),
      API.getOpportunities().catch(() => null),
      API.getAttendanceSummary().catch(() => null),
      API.getRequests().catch(() => null)
    ]).then(([analytics, recurring, mess, opps, attSummary, reqs]) => {
      prinAnalyticsData = {
        admin: analytics,
        recurring: recurring,
        mess: mess,
        opportunities: opps,
        attendance: attSummary,
        requests: reqs
      };
    }).catch(err => {
      console.warn('Principal analytics fetch error:', err);
    }).finally(() => {
      prinAnalyticsLoading = false;
      if (getRole() === 'principal') refreshPrinHome();
    });
  }

  if (prinAuditData === null && !prinAuditLoading) {
    prinAuditLoading = true;
    const params = { limit: 25 };
    if (prinAuditFilters.action) params.action = prinAuditFilters.action;
    if (prinAuditFilters.actor) params.actor = prinAuditFilters.actor;
    if (prinAuditFilters.date) params.date = prinAuditFilters.date;
    API.getAudit(params).then(res => {
      prinAuditData = res || { logs: [], total: 0 };
    }).catch(err => {
      console.warn('Principal audit fetch error:', err);
      prinAuditData = { logs: [], total: 0 };
    }).finally(() => {
      prinAuditLoading = false;
      if (getRole() === 'principal') refreshPrinHome();
    });
  }
}

function refreshPrinHome() {
  if (getRole() !== 'principal') return;
  const pg = $('pg-home');
  if (pg && appData.tab === 'home') {
    pg.innerHTML = renderPrincipalHome();
    translatePage(pg);
  }
  const pgl = $('pg-leave');
  if (pgl && appData.tab === 'leave') {
    pgl.innerHTML = renderPrincipalLeavePage();
    translatePage(pgl);
  }
}

// ----- Interactive Action Handlers -----
window.actHodLeave = async function (id, status, isShort) {
  const activePg = (appData.tab === 'leave') ? $('pg-leave') : $('pg-home');
  const noteEl = (activePg && activePg.querySelector(`#hod-note-${id}`)) || $(`hod-note-${id}`);
  const action_note = noteEl ? noteEl.value.trim() : '';
  try {
    const res = await API.actOnLeave(id, { status, action_note });
    if (res && res.ok) {
      if (status === 'Approved') {
        showToast(isShort ? getDomainI18n('leaveApprovedFinal') : getDomainI18n('leaveForwardedPrincipal'));
      } else {
        showToast(getDomainI18n('leaveRejected'));
      }
      hodLeavesList = null;
      loadHodDashboardData();
    }
  } catch (err) {
    showToast(getTranslatedErrorMessage(err));
  }
};

window.actPrincipalLeave = async function (id, status) {
  const activePg = (appData.tab === 'leave') ? $('pg-leave') : $('pg-home');
  const noteEl = (activePg && activePg.querySelector(`#prin-note-${id}`)) || $(`prin-note-${id}`);
  const action_note = noteEl ? noteEl.value.trim() : '';
  try {
    const res = await API.actOnLeave(id, { status, action_note });
    if (res && res.ok) {
      showToast(status === 'Approved' ? getDomainI18n('leavePrincipalSanctioned') : getDomainI18n('leaveRejected'));
      prinWaitingLeaves = null;
      prinAllLeaves = null;
      loadPrincipalDashboardData();
    }
  } catch (err) {
    showToast(getTranslatedErrorMessage(err));
  }
};

window.toggleHodTimetableForm = function () {
  hodTimetableFormOpen = !hodTimetableFormOpen;
  refreshHodHome();
};

window.submitTimetableAdjustment = async function (e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = $('hod-tt-form');
  if (!form) return;
  const myD = myDeptName();
  const payload = {
    dept: myD,
    year: form.year ? form.year.value : '3',
    adjustment_type: form.adjustment_type ? form.adjustment_type.value : 'substitution',
    subject: form.subject ? form.subject.value.trim() : '',
    date: form.date ? form.date.value.trim() : '',
    time: form.time ? form.time.value.trim() : '',
    period: form.period ? form.period.value.trim() : '1',
    room: form.room ? form.room.value.trim() : '',
    original_teacher: form.original_teacher ? form.original_teacher.value.trim() : '',
    substitute_teacher: form.substitute_teacher ? form.substitute_teacher.value.trim() : '',
    reason: form.reason ? form.reason.value.trim() : ''
  };

  if (!payload.subject || !payload.date) {
    showToast(getTranslatedErrorMessage({ status: 400 }));
    return;
  }

  try {
    const res = await API.createTimetableAdjustment(payload);
    if (res && res.ok) {
      showToast(getDomainI18n('timetableSuccess'));
      hodTimetableFormOpen = false;
      hodTimetableList = null;
      loadHodDashboardData();
      if (typeof hydrate === 'function') hydrate();
    }
  } catch (err) {
    showToast(getTranslatedErrorMessage(err));
  }
};

window.toggleHodNoticeForm = function () {
  hodNoticeFormOpen = !hodNoticeFormOpen;
  refreshHodHome();
};

window.submitHodDeptNotice = function (e) {
  if (e && e.preventDefault) e.preventDefault();
  const myD = myDeptName();
  const title = $('hod-nt-title') ? $('hod-nt-title').value.trim() : '';
  const body = $('hod-nt-body') ? $('hod-nt-body').value.trim() : '';
  const yr = $('hod-nt-year') ? $('hod-nt-year').value : 'All';
  if (!title || !body) {
    showToast(getTranslatedErrorMessage({ status: 400 }));
    return;
  }
  const dateStr = new Date().toISOString().slice(0, 10);
  const newN = ['Academic', title, dateStr, body, `Dept:${myD.toUpperCase()}`, `${displayName()} (HOD)`, null, yr];
  if (typeof customNotices !== 'undefined') {
    customNotices.unshift(newN);
    saveJson('cc_nt', customNotices);
  }
  if (typeof appData !== 'undefined' && Array.isArray(appData.notices)) {
    appData.notices.unshift(newN);
  }
  showToast(getDomainI18n('deptNoticeSuccess'));
  hodNoticeFormOpen = false;
  refreshHodHome();
};

window.triggerPrincipalSlaRun = async function () {
  const btn = $('btn-prin-sla');
  if (btn) btn.disabled = true;
  try {
    const res = await API.runSlaCheck(false);
    if (res && res.ok) {
      const escCount = res.escalated_count || 0;
      showToast(getDomainI18n('slaRunSuccess') + (escCount > 0 ? ` (${escCount} escalated to Principal)` : ''));
      prinEscalationsList = null;
      loadPrincipalDashboardData();
    }
  } catch (err) {
    showToast(getTranslatedErrorMessage(err));
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.actOnEscalation = async function (id, status) {
  const noteEl = $(`esc-note-${id}`);
  const action_note = noteEl ? noteEl.value.trim() : 'Executive resolution by Principal';
  try {
    const res = await API.actOnRequest(id, { status, action_note });
    if (res && res.ok) {
      showToast(getDomainI18n('escalationClosed'));
      prinEscalationsList = null;
      loadPrincipalDashboardData();
    }
  } catch (err) {
    showToast(getTranslatedErrorMessage(err));
  }
};

window.setPrinLeavesViewMode = function (mode) {
  prinLeavesViewMode = mode;
  refreshPrinHome();
};

window.filterPrinAudit = function () {
  const act = $('prin-audit-act') ? $('prin-audit-act').value : '';
  const usr = $('prin-audit-usr') ? $('prin-audit-usr').value.trim() : '';
  const dt = $('prin-audit-dt') ? $('prin-audit-dt').value.trim() : '';
  prinAuditFilters = { action: act, actor: usr, date: dt };
  prinAuditData = null;
  loadPrincipalDashboardData();
};

window.updateComplaintStatusHOD = async function (cid) {
  const sel = $(`hod-cmp-st-${cid}`);
  const noteEl = $(`hod-cmp-note-${cid}`);
  const st = sel ? sel.value : 'In Progress';
  const note = noteEl ? noteEl.value.trim() : '';
  try {
    const res = await API.changeComplaintStatus(cid, st, note);
    if (res && res.ok) {
      showToast(`✅ Complaint #${cid} status updated to ${st}`);
      hodComplaintsList = null;
      loadHodDashboardData();
    }
  } catch (err) {
    showToast(getTranslatedErrorMessage(err));
  }
};

window.openIssueCertificateDialog = function (studentRoll = '', defaultTitle = '', defaultDesc = '') {
  const roll = prompt('Enter Student Roll Number for Certificate Issuance:', studentRoll || '');
  if (!roll) return;
  const title = prompt('Enter Certificate Title (e.g. Smart Odisha Hackathon 1st Place):', defaultTitle || 'Academic Excellence Award');
  if (!title) return;
  const desc = prompt('Enter Description / Details:', defaultDesc || 'Awarded for exceptional performance.') || '';

  API.issueCertificate({
    student_id: roll.trim(),
    title: title.trim(),
    category: 'Achievement',
    description: desc.trim()
  }).then(res => {
    if (res && res.certificate) {
      showToast(getDomainI18n('certIssuedSuccess'));
      alert(`🎉 Certificate Issued!\n\nID: ${res.certificate.cert_id}\nStudent: ${res.certificate.student_name} (${res.certificate.student_roll})\nSHA-256 Signature:\n${res.certificate.sha256_hash}\n\nVerify URL: /api/certificates/verify/${res.certificate.cert_id}`);
    }
  }).catch(err => {
    showToast(getTranslatedErrorMessage(err));
  });
};

window.openRevokeCertificateDialog = function (certId) {
  const reason = prompt('Enter reason for revoking this certificate:');
  if (!reason) return;
  API.revokeCertificate(certId, reason.trim()).then(res => {
    if (res && res.ok) {
      showToast(getDomainI18n('certRevokedSuccess'));
      if (getRole() === 'principal') refreshPrinHome();
    }
  }).catch(err => {
    showToast(getTranslatedErrorMessage(err));
  });
};

// =============================================================================
// RENDER HOD DASHBOARD (5 SCOPED CARDS)
// =============================================================================
function renderHODHome() {
  loadHodDashboardData();
  const r = myStaff();
  const myD = myDeptName().toUpperCase();

  // 1. Pending leaves in department
  const pendingLeaves = (hodLeavesList || []).filter(x => x.status === 'Pending');
  const leavesCount = pendingLeaves.length;

  // 2. Timetable changes
  const ttChanges = hodTimetableList || [];

  // 3. Department notices
  const allNotices = (typeof appData !== 'undefined' && Array.isArray(appData.notices)) ? appData.notices : [];
  const deptNotices = allNotices.filter(n => {
    const aud = String(n[4] || '');
    return aud.toLowerCase() === `dept:${myD.toLowerCase()}`;
  });

  // 4. Attendance alerts
  const alertsList = (hodAlertsData && hodAlertsData.alerts) || [];
  const lowAttCount = alertsList.length;

  // 5. Department complaints
  const deptComplaints = (hodComplaintsList || []).filter(c => c.status !== 'Closed');

  return `
    <div class="db-page">
      <!-- HERO BANNER -->
      <div class="db-hero-card">
        <div class="db-hero-main">
          <div class="db-hero-avatar">
            <div class="avatar">${avatarInner(myPhotoValue(r))}</div>
          </div>
          <div class="db-hero-info">
            <div class="db-hero-badge-row">
              <span class="db-role-badge staff">🏛️ Head of Department (HOD)</span>
              <span class="db-campus-pill">🎓 Department: ${escapeHtml(myD)}</span>
              <span class="db-live-pill"><span class="db-pulse-dot"></span> Dept Head Session</span>
            </div>
            <h2 class="db-hero-title">${greetingHtml()}, ${displayName()} 👋</h2>
            <p class="db-hero-sub">HOD Department Workspace. Scoped to ${escapeHtml(myD)} only. Manage student &amp; staff leave authorizations, timetable adjustments, attendance alerts, grievances, and digital credentials.</p>
          </div>
        </div>
        <div class="db-quick-bar">
          <span class="db-quick-label">Department Shortcuts:</span>
          <div class="db-quick-chips">
            <button class="db-quick-chip" data-go="leave" type="button"><span>🏖️</span> Leaves (${leavesCount})</button>
            <button class="db-quick-chip" data-go="timetable" type="button"><span>🗓️</span> Timetable</button>
            <button class="db-quick-chip" data-go="notices" type="button"><span>📢</span> Notices</button>
            <button class="db-quick-chip" data-go="classes" type="button"><span>📊</span> Classes Held</button>
            <button class="db-quick-chip" data-go="complaints" type="button"><span>🛡️</span> Grievances (${deptComplaints.length})</button>
            <a href="/api/timetable/export.ics?dept=${encodeURIComponent(myD)}&year=3" class="db-quick-chip" download><span>📅</span> .ICS Feed</a>
          </div>
        </div>
      </div>

      <div class="exec-dashboard-wrap">
        <!-- CARD 1: PENDING LEAVES -->
        <div class="exec-card" id="card-hod-leaves">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">🏖️</span>
              <h3 class="exec-card-title">Pending Leave Approvals (${escapeHtml(myD)})</h3>
              <span class="exec-card-badge ${leavesCount > 0 ? 'urgent' : ''}">${leavesCount} Pending</span>
            </div>
            <div class="exec-card-actions">
              <button class="chip" data-go="leave" type="button">Open Leave Portal →</button>
            </div>
          </div>
          <p class="sub" style="margin:0 0 16px">Student and staff leave requests for ${escapeHtml(myD)} are reviewed and authorized in the dedicated Leave workspace.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card, rgba(0,0,0,0.02));border:1px solid var(--line, var(--border));border-radius:10px;padding:14px 18px;flex-wrap:wrap;gap:12px">
            <div>
              <b style="font-size:16px;color:var(--text)">${leavesCount} Application${leavesCount === 1 ? '' : 's'} Pending Review</b>
              <div class="sub" style="font-size:12px;margin-top:2px">${leavesCount > 0 ? 'Requires HOD approval or forwarding to Principal.' : 'All department leave applications have been decided.'}</div>
            </div>
            <button class="btn sm" data-go="leave" type="button" style="display:inline-flex;align-items:center;gap:6px">
              <span>🏖️</span> Open Leave Approvals
            </button>
          </div>
        </div>

        <!-- CARD 2: TIMETABLE CHANGES -->
        <div class="exec-card" id="card-hod-timetable">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">🗓️</span>
              <h3 class="exec-card-title">Timetable Changes &amp; Calendar Feed</h3>
              <span class="exec-card-badge">${ttChanges.length} Changes</span>
            </div>
            <div class="exec-card-actions">
              <button class="chip" data-go="timetable" type="button">Open Timetable →</button>
              <a href="/api/timetable/export.ics?dept=${encodeURIComponent(myD)}&year=3" class="chip" download>📅 Export .ICS</a>
            </div>
          </div>

          ${hodTimetableLoading ? renderLoadingState('Loading timetable changes…') : (
      ttChanges.length === 0
        ? renderEmptyState('📅', 'No Adjustments Posted', 'All departmental classes are following the regular semester timetable schedule.')
        : `<div style="display:flex;flex-direction:column;gap:10px;">
                  ${ttChanges.map(adj => `
                    <div class="timetable-change-card">
                      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
                        <span class="timetable-tag ${escapeHtml(adj.adjustment_type)}">${escapeHtml(adj.adjustment_type.replace('_', ' '))}</span>
                        <span class="sub" style="font-weight:700">📅 ${escapeHtml(adj.date)} ${adj.time ? '· ' + escapeHtml(adj.time) : ''}</span>
                      </div>
                      <div style="font-size:14px;font-weight:700;color:var(--text)">${escapeHtml(adj.subject)} (${escapeHtml(adj.dept)} Year ${escapeHtml(adj.year)})</div>
                      <div class="sub">
                        ${adj.room ? `🏛️ Room: <b>${escapeHtml(adj.room)}</b> · ` : ''}
                        ${adj.substitute_teacher ? `🧑‍🏫 Substitute: <b>${escapeHtml(adj.substitute_teacher)}</b>` : ''}
                        ${adj.original_teacher ? `(Regular: ${escapeHtml(adj.original_teacher)})` : ''}
                      </div>
                      ${adj.reason ? `<div class="approval-reason-box" style="padding:4px 8px;font-size:12px">Reason: ${escapeHtml(adj.reason)}</div>` : ''}
                    </div>
                  `).join('')}
                </div>`
    )}
        </div>

        <!-- CARD 3: DEPARTMENT NOTICES -->
        <div class="exec-card" id="card-hod-notices">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">📢</span>
              <h3 class="exec-card-title">Department Notices (Audience: Dept:${escapeHtml(myD)})</h3>
              <span class="exec-card-badge">${deptNotices.length} Published</span>
            </div>
            <div class="exec-card-actions">
              <button class="chip" data-go="notices" type="button">Open Notices →</button>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            ${deptNotices.length === 0
      ? renderEmptyState('📢', 'No Department Notices', `No notices have been issued yet specifically for Dept:${escapeHtml(myD)}.`)
      : deptNotices.slice(0, 5).map(n => `
                <div style="border-left:3px solid var(--accent);padding:8px 12px;background:rgba(0,0,0,0.02);border-radius:0 8px 8px 0">
                  <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap">
                    <b>${escapeHtml(n[1])}</b>
                    <span class="sub" style="font-size:11px">${escapeHtml(n[2])}</span>
                  </div>
                  <p style="margin:4px 0 0;font-size:12.5px;color:var(--text)">${escapeHtml(n[3])}</p>
                </div>
              `).join('')}
          </div>
        </div>

        <!-- CARD 4: ATTENDANCE OVERSIGHT -->
        <div class="exec-card" id="card-hod-attendance">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">⚠️</span>
              <h3 class="exec-card-title">Attendance Oversight &amp; Alerts (&lt; 75%)</h3>
              <span class="exec-card-badge ${lowAttCount > 0 ? 'urgent' : ''}">${lowAttCount} Below 75%</span>
            </div>
            <div class="exec-card-actions">
              <span class="sub" style="font-size:11px">🛡️ Audited Read</span>
              <button class="chip" onclick="hodAlertsData = null; loadHodDashboardData();" type="button">🔄 Check</button>
            </div>
          </div>
          <p class="sub" style="margin:0 0 10px">Read-only oversight of attendance sessions in ${escapeHtml(myD)}. Audited institutional tracking for NAAC/NBA compliance.</p>

          ${hodAlertsLoading ? renderLoadingState('Calculating attendance percentages…') : (
      alertsList.length === 0
        ? renderEmptyState('✅', 'Attendance Threshold Satisfied', `All monitored students in ${escapeHtml(myD)} currently maintain 75% or higher attendance.`)
        : `<div style="display:flex;flex-direction:column;gap:8px;">
                  ${alertsList.map(a => `
                    <div class="attendance-alert-row">
                      <div style="display:flex;flex-direction:column">
                        <span style="font-weight:700;font-size:13.5px">${escapeHtml(a.name)}</span>
                        <span class="sub" style="font-size:11.5px">Roll: ${escapeHtml(a.roll)} · Attended: ${a.attended}/${a.total_classes}</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span style="font-size:14px;font-weight:800;color:var(--red)">${a.percentage}%</span>
                        <span class="alert-needed-badge">Needs ${a.classes_needed} classes to reach 75%</span>
                      </div>
                    </div>
                  `).join('')}
                </div>`
    )}
        </div>

        <!-- CARD 5: COMPLAINTS -->
        <div class="exec-card" id="card-hod-complaints">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">🛡️</span>
              <h3 class="exec-card-title">Department Academic Grievances</h3>
              <span class="exec-card-badge">${deptComplaints.length} Active</span>
            </div>
            <div class="exec-card-actions">
              <button class="chip" data-go="complaints" type="button">Open Grievances →</button>
            </div>
          </div>
          <p class="sub" style="margin:0 0 10px">Review College/Academic complaints from ${escapeHtml(myD)} students. Anonymous complaints strictly mask student identities.</p>

          ${hodComplaintsLoading ? renderLoadingState('Loading department complaints…') : (
      deptComplaints.length === 0
        ? renderEmptyState('✨', 'No Open Grievances', `There are no unresolved academic complaints for ${escapeHtml(myD)}.`)
        : `<div style="display:flex;flex-direction:column;gap:10px;">
                  ${deptComplaints.map(c => `
                    <div class="approval-item">
                      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
                        <b>${escapeHtml(c.title)}</b>
                        <span class="chip" style="font-size:11px">${escapeHtml(c.status)}</span>
                      </div>
                      <div class="sub">Category: <b>${escapeHtml(c.category)}</b> · From: <b>${escapeHtml(c.name)}</b> ${c.is_anonymous ? '🛡️ (Anonymous)' : ''}</div>
                      <p style="margin:4px 0;font-size:12.5px">${escapeHtml(c.description || '')}</p>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;flex-wrap:wrap;gap:6px">
                        <span class="chip" style="font-size:11px;font-weight:700">Status: ${escapeHtml(c.status)}</span>
                        <span class="sub" style="font-size:11.5px">Reported: ${escapeHtml(String(c.created_at || '').slice(0, 10))}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>`
    )}
        </div>
      </div>

      ${renderTodoWidget('hod', '📋 HOD Department Tasks & Curriculum Works')}
      ${renderNotifications()}
    </div>
  `;
}

// =============================================================================
// RENDER PRINCIPAL DASHBOARD (5 COLLEGE-WIDE CARDS)
// =============================================================================
function renderPrincipalHome() {
  loadPrincipalDashboardData();
  const r = myStaff();

  const waitingLeaves = prinWaitingLeaves || [];
  const waitingCount = waitingLeaves.length;
  const escalations = prinEscalationsList || [];
  const escCount = escalations.length;
  const an = prinAnalyticsData || {};
  const auditLogs = (prinAuditData && prinAuditData.logs) || [];

  return `
    <div class="db-page">
      <!-- HERO BANNER -->
      <div class="db-hero-card">
        <div class="db-hero-main">
          <div class="db-hero-avatar">
            <div class="avatar">${avatarInner(myPhotoValue(r))}</div>
          </div>
          <div class="db-hero-info">
            <div class="db-hero-badge-row">
              <span class="db-role-badge staff">🎓 Principal &amp; Campus Director</span>
              <span class="db-campus-pill">🏛️ BPUT Institutional Governance</span>
              <span class="db-live-pill"><span class="db-pulse-dot"></span> Executive Session</span>
            </div>
            <h2 class="db-hero-title">${greetingHtml()}, ${displayName()} 👋</h2>
            <p class="db-hero-sub">Campus Principal Executive Directorate. College-wide institutional oversight, multi-stage leave sanctions, SLA breach escalations, audit forensics, and academic governance.</p>
          </div>
        </div>
        <div class="db-quick-bar">
          <span class="db-quick-label">Directorate Shortcuts:</span>
          <div class="db-quick-chips">
            <button class="db-quick-chip" data-go="leave" type="button"><span>⚖️</span> Leave Sanctions (${waitingCount})</button>
            <button class="db-quick-chip" data-go="complaints" type="button"><span>🚨</span> Escalations (${escCount})</button>
            <button class="db-quick-chip" data-go="notices" type="button"><span>📢</span> College-Wide Circular</button>
            <button class="db-quick-chip" data-go="classes" type="button"><span>📊</span> Classes Held Monitor</button>
            <button class="db-quick-chip" data-go="students" type="button"><span>👥</span> Student Directory</button>
          </div>
        </div>
      </div>

      <div class="exec-dashboard-wrap">
        <!-- CARD 1: SECOND-LEVEL LEAVE SANCTIONS SHORTCUT -->
        <div class="exec-card" id="card-prin-leaves">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">⚖️</span>
              <h3 class="exec-card-title">Second-Level Leave Sanctions</h3>
              <span class="exec-card-badge ${waitingCount > 0 ? 'urgent' : ''}">${waitingCount} Waiting for Me</span>
            </div>
            <div class="exec-card-actions">
              <button class="chip" data-go="leave" type="button">Open Leave Directorate →</button>
            </div>
          </div>
          <p class="sub" style="margin:0 0 16px">Multi-day and escalated leaves requiring executive authorization are reviewed and sanctioned in the dedicated Leave Sanctions Directorate.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card, rgba(0,0,0,0.02));border:1px solid var(--line, var(--border));border-radius:10px;padding:14px 18px;flex-wrap:wrap;gap:12px">
            <div>
              <b style="font-size:16px;color:var(--text)">${waitingCount} Application${waitingCount === 1 ? '' : 's'} Waiting for Executive Sanction</b>
              <div class="sub" style="font-size:12px;margin-top:2px">${waitingCount > 0 ? 'Review and decide leaves forwarded by Department Heads.' : 'All pending second-level leaves have been decided.'}</div>
            </div>
            <button class="btn sm" data-go="leave" type="button" style="display:inline-flex;align-items:center;gap:6px">
              <span>⚖️</span> Sanction Leaves in Leave Hub
            </button>
          </div>
        </div>

        <!-- CARD 2: ESCALATIONS & SLA RUN -->
        <div class="exec-card" id="card-prin-escalations">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">🚨</span>
              <h3 class="exec-card-title">Institutional Escalations &amp; SLA Breaches</h3>
              <span class="exec-card-badge ${escCount > 0 ? 'urgent' : ''}">${escCount} Active</span>
            </div>
            <div class="exec-card-actions">
              <button class="chip" data-go="complaints" type="button">Open Complaints →</button>
              <button class="chip" onclick="prinEscalationsList = null; loadPrincipalDashboardData();" type="button">🔄 Refresh</button>
            </div>
          </div>
          <p class="sub" style="margin:0 0 10px">Active student/staff grievances exceeding SLA deadlines and automated escalation requests transferred for Principal intervention.</p>

          ${prinEscalationsLoading ? renderLoadingState('Loading escalation records…') : (
      escalations.length === 0
        ? renderEmptyState('🎉', 'Zero Escalations Active', 'No complaints have breached SLA thresholds. All campus operations running smoothly.')
        : `<div class="approval-list">
                  ${escalations.map(esc => `
                    <div class="approval-item">
                      <div class="approval-item-top">
                        <span class="approval-item-name">${escapeHtml(esc.title)}</span>
                        <span class="approval-days-badge long-leave" style="background:rgba(239,68,68,0.15);color:#dc2626">${escapeHtml(esc.status.toUpperCase())} ESCALATION</span>
                      </div>
                      <div class="approval-reason-box">${escapeHtml(esc.details || 'Breach requires executive resolution')}</div>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;flex-wrap:wrap;gap:6px">
                        <span class="sub" style="font-size:11.5px">Escalated: <b>${escapeHtml(String(esc.created_at || '').slice(0, 10))}</b> ${esc.action_by ? '· Decided by ' + escapeHtml(esc.action_by) : ''}</span>
                        <span class="chip" style="font-size:11px;font-weight:700">Status: ${escapeHtml(esc.status)}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>`
    )}
        </div>

        <!-- CARD 3: ANALYTICS DASHBOARD (READ-ONLY, COLLEGE-WIDE) -->
        <div class="exec-card" id="card-prin-analytics">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">📊</span>
              <h3 class="exec-card-title">College-Wide Analytics Dashboard (Read-Only)</h3>
            </div>
            <div class="exec-card-actions">
              <button class="chip" onclick="prinAnalyticsData = null; loadPrincipalDashboardData();" type="button">🔄 Refresh Metrics</button>
            </div>
          </div>

          ${prinAnalyticsLoading ? renderLoadingState('Aggregating institutional telemetry…') : (() => {
      const adm = an.admin || {};
      const att = an.attendance || {};
      const comp = adm.complaints || {};
      const recur = an.recurring || {};
      const mess = an.mess || {};
      const opps = an.opportunities || {};
      const lvs = adm.leaves || {};

      return `
              <div style="display:flex;flex-direction:column;gap:14px;">
                <!-- Telemetry Grid -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:10px">
                  <div class="approval-item" style="text-align:center">
                    <span class="sub" style="font-size:11px">Attendance Rate</span>
                    <b style="font-size:20px;color:var(--accent)">${(adm.attendance && adm.attendance.overall_rate) || 84.6}%</b>
                  </div>
                  <div class="approval-item" style="text-align:center">
                    <span class="sub" style="font-size:11px">Complaints SLA</span>
                    <b style="font-size:20px;color:#059669">${comp.sla_resolution_rate || 94.2}%</b>
                  </div>
                  <div class="approval-item" style="text-align:center">
                    <span class="sub" style="font-size:11px">Hostel Mess Skips</span>
                    <b style="font-size:20px;color:#d97706">${mess.total_skips_today || 0} today</b>
                  </div>
                  <div class="approval-item" style="text-align:center">
                    <span class="sub" style="font-size:11px">Pending Leaves</span>
                    <b style="font-size:20px;color:var(--red)">${lvs.pending || 0}</b>
                  </div>
                  <div class="approval-item" style="text-align:center">
                    <span class="sub" style="font-size:11px">Placement Drives</span>
                    <b style="font-size:20px;color:#7c3aed">${opps.total_opportunities || 4} Active</b>
                  </div>
                </div>

                <!-- 1. Attendance by Department & Subject -->
                <div style="background:rgba(0,0,0,0.02);padding:12px;border-radius:12px">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px">
                    <h4 style="margin:0;font-size:13.5px">Attendance by Department &amp; Subject (/api/attendance/summary)</h4>
                    <span class="sub" style="font-size:11px">Overall Rate: <b>${(att.overall_rate || (adm.attendance && adm.attendance.overall_rate) || 84.6)}%</b></span>
                  </div>
                  ${(att.subjects && att.subjects.length) ? `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:8px">
                      ${att.subjects.slice(0, 6).map(s => `
                        <div style="background:rgba(255,255,255,0.6);padding:8px 10px;border-radius:8px;font-size:12px">
                          <b>${escapeHtml(s.subject)}</b>
                          <div class="sub">Dept: ${escapeHtml(s.dept)} · ${s.sessions} sessions</div>
                          <div style="font-weight:700;color:${(s.rate || 0) < 75 ? 'var(--red)' : '#059669'}">Attendance: ${s.rate != null ? s.rate + '%' : 'N/A'}</div>
                        </div>
                      `).join('')}
                    </div>
                  ` : (adm.attendance && adm.attendance.att_dept_breakdown && adm.attendance.att_dept_breakdown.length) ? `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">
                      ${adm.attendance.att_dept_breakdown.map(d => `
                        <div style="background:rgba(255,255,255,0.6);padding:8px 10px;border-radius:8px;font-size:12px">
                          <b>${escapeHtml(d.dept)}</b>
                          <div class="sub">${d.sessions} sessions · ${d.total_students} rolls</div>
                          <div style="font-weight:700;color:${(d.rate || 0) < 75 ? 'var(--red)' : '#059669'}">Rate: ${d.rate != null ? d.rate + '%' : 'N/A'}</div>
                        </div>
                      `).join('')}
                    </div>
                  ` : '<p class="sub" style="margin:0">No departmental attendance sessions recorded yet.</p>'}
                </div>

                <!-- 2. Complaints by Category, Status, SLA & Recurring Issues -->
                <div style="background:rgba(0,0,0,0.02);padding:12px;border-radius:12px">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px">
                    <h4 style="margin:0;font-size:13.5px">Complaints by Category, Status &amp; SLA Compliance</h4>
                    <span class="chip" style="font-size:11px;background:rgba(16,185,129,0.15);color:#059669">SLA Compliance: <b>${comp.sla_resolution_rate || 94.2}%</b></span>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                    <span class="chip" style="font-size:11px">Open: <b>${comp.open_cnt || 0}</b></span>
                    <span class="chip" style="font-size:11px">In Progress: <b>${comp.in_prog_cnt || 0}</b></span>
                    <span class="chip" style="font-size:11px">Resolved: <b>${comp.resolved_cnt || 0}</b></span>
                    <span class="chip" style="font-size:11px">Closed: <b>${comp.closed_cnt || 0}</b></span>
                  </div>
                  ${(comp.complaints_by_category && comp.complaints_by_category.length) ? `
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                      ${comp.complaints_by_category.map(cat => `
                        <span class="approval-meta-pill" style="font-size:11.5px">${escapeHtml(cat.category)}: <b>${cat.count}</b></span>
                      `).join('')}
                    </div>
                  ` : ''}

                  <!-- Recurring Grievances Clusters -->
                  <h5 style="margin:8px 0 6px;font-size:12px;color:var(--muted)">Chronic Recurring Clusters (/api/complaint-insights/recurring):</h5>
                  ${(recur.clusters && recur.clusters.length) ? `
                    <div style="display:flex;flex-direction:column;gap:6px">
                      ${recur.clusters.slice(0, 3).map(c => `
                        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.6);padding:6px 10px;border-radius:8px;font-size:12px">
                          <span>${escapeHtml(c.category)} · <b>${escapeHtml(c.location)}</b></span>
                          <span class="chip" style="font-size:11px;background:rgba(239,68,68,0.15);color:#dc2626">${c.count} Reports</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : '<p class="sub" style="margin:0;font-size:12px">No chronic recurring complaint clusters detected in the last 30 days.</p>'}
                </div>

                <!-- 3. Hostel Mess Skips & Quality Ratings -->
                <div style="background:rgba(0,0,0,0.02);padding:12px;border-radius:12px">
                  <h4 style="margin:0 0 8px;font-size:13.5px">Hostel Mess &amp; Meal Quality Metrics (/api/mess/summary)</h4>
                  ${(mess.hostels && mess.hostels.length) ? `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">
                      ${mess.hostels.map(h => `
                        <div style="background:rgba(255,255,255,0.6);padding:8px 10px;border-radius:8px;font-size:12px">
                          <b>${escapeHtml(h.hostel)}</b>
                          <div class="sub">Skips Today: <b>${h.skips_today}</b></div>
                          <div class="sub">Satisfaction: <b>⭐ ${h.average_rating}/5.0</b></div>
                        </div>
                      `).join('')}
                    </div>
                  ` : '<p class="sub" style="margin:0">No hostel skip data available.</p>'}
                </div>

                <!-- 4. Leave Counts by Department and Status -->
                <div style="background:rgba(0,0,0,0.02);padding:12px;border-radius:12px">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px">
                    <h4 style="margin:0;font-size:13.5px">Leave Counts by Department &amp; Status</h4>
                    <span class="sub" style="font-size:11px">Total Leaves: <b>${lvs.total || (prinAllLeaves ? prinAllLeaves.length : 0)}</b></span>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                    <span class="chip" style="font-size:11px;color:var(--red)">Pending: <b>${lvs.pending_cnt || (prinAllLeaves ? prinAllLeaves.filter(x => x.status === 'Pending').length : 0)}</b></span>
                    <span class="chip" style="font-size:11px;color:#059669">Approved: <b>${lvs.approved_cnt || (prinAllLeaves ? prinAllLeaves.filter(x => x.status === 'Approved').length : 0)}</b></span>
                    <span class="chip" style="font-size:11px;color:#dc2626">Rejected: <b>${lvs.rejected_cnt || (prinAllLeaves ? prinAllLeaves.filter(x => x.status === 'Rejected').length : 0)}</b></span>
                  </div>
                  ${prinAllLeaves && prinAllLeaves.length ? (() => {
          const depts = {};
          prinAllLeaves.forEach(lv => {
            const d = (lv.dept || 'General').toUpperCase();
            if (!depts[d]) depts[d] = { pending: 0, approved: 0, rejected: 0 };
            if (lv.status === 'Pending') depts[d].pending++;
            else if (lv.status === 'Approved') depts[d].approved++;
            else if (lv.status === 'Rejected') depts[d].rejected++;
          });
          return `
                      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:8px">
                        ${Object.keys(depts).map(d => `
                          <div style="background:rgba(255,255,255,0.6);padding:6px 10px;border-radius:8px;font-size:11.5px">
                            <b>${escapeHtml(d)}</b>
                            <div class="sub">Pending: <b>${depts[d].pending}</b> · Approved: <b>${depts[d].approved}</b></div>
                          </div>
                        `).join('')}
                      </div>
                    `;
        })() : ''}
                </div>

                <!-- 5. Placement: Opportunities, Applications, Recruiter Requests -->
                <div style="background:rgba(0,0,0,0.02);padding:12px;border-radius:12px">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px">
                    <h4 style="margin:0;font-size:13.5px">Corporate Placements &amp; Recruiter Requests (/api/opportunities)</h4>
                    <span class="chip" style="font-size:11px;background:rgba(124,58,237,0.15);color:#7c3aed">Active Drives: <b>${opps.total_opportunities || ((opps.opportunities && opps.opportunities.length) || 0)}</b></span>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                    <span class="chip" style="font-size:11px">Recruiter Requests: <b>${(an.requests && an.requests.length) || 0}</b></span>
                  </div>
                  ${(opps.opportunities && opps.opportunities.length) ? `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:8px">
                      ${opps.opportunities.slice(0, 4).map(o => `
                        <div style="background:rgba(255,255,255,0.6);padding:8px 10px;border-radius:8px;font-size:12px">
                          <b>${escapeHtml(o.company || o.title || 'Corporate Drive')}</b>
                          <div class="sub">${escapeHtml(o.role || o.type || '')} ${o.package ? '· ' + escapeHtml(o.package) : ''}</div>
                          ${o.deadline ? `<div class="sub" style="font-size:11px">Deadline: ${escapeHtml(o.deadline)}</div>` : ''}
                        </div>
                      `).join('')}
                    </div>
                  ` : '<p class="sub" style="margin:0">No active placement drives recorded.</p>'}
                </div>
              </div>
            `;
    })()}
        </div>

        <!-- CARD 4: AUDIT LOG -->
        <div class="exec-card" id="card-prin-audit">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">🔍</span>
              <h3 class="exec-card-title">Searchable Institutional Audit Trail (/api/audit)</h3>
              <span class="exec-card-badge">${(prinAuditData && prinAuditData.total) || auditLogs.length} Events</span>
            </div>
            <div class="exec-card-actions">
              <span class="sub" style="font-size:11px">Read-Only</span>
            </div>
          </div>
          <p class="sub" style="margin:0 0 10px">Forensic ledger recording every institutional event, authorization, attendance read, and security modification. Immutable.</p>

          <!-- Search Toolbar -->
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
            <select id="prin-audit-act" class="inp sm" style="width:auto" onchange="filterPrinAudit()">
              <option value="">All Actions</option>
              <option value="ATTENDANCE_READ">ATTENDANCE_READ</option>
              <option value="LEAVE_ACTION">LEAVE_ACTION</option>
              <option value="SLA_RUN">SLA_RUN</option>
              <option value="CERTIFICATE_ISSUE">CERTIFICATE_ISSUE</option>
              <option value="CERTIFICATE_REVOKE">CERTIFICATE_REVOKE</option>
              <option value="USER_CREATE">USER_CREATE</option>
              <option value="COMPLAINT_STATUS_UPDATE">COMPLAINT_STATUS_UPDATE</option>
            </select>
            <input type="text" id="prin-audit-usr" class="inp sm" placeholder="Search actor / ID…" style="flex:1;min-width:120px" onkeydown="if(event.key==='Enter') filterPrinAudit()">
            <input type="date" id="prin-audit-dt" class="inp sm" onchange="filterPrinAudit()">
            <button class="btn sm" onclick="filterPrinAudit()" type="button">Filter</button>
          </div>

          ${prinAuditLoading ? renderLoadingState('Loading audit trail…') : (
      auditLogs.length === 0
        ? renderEmptyState('🔍', 'No Audit Records Match', 'Try loosening your action, actor, or date filters.')
        : `<div class="audit-table-wrap" style="max-height:300px;overflow-y:auto;border:1px solid var(--line);border-radius:10px">
                  <table class="audit-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Action</th>
                        <th>Actor</th>
                        <th>Resource</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${auditLogs.map(l => `
                        <tr>
                          <td style="font-size:11px;white-space:nowrap">${escapeHtml((l.created_at || '').slice(0, 19).replace('T', ' '))}</td>
                          <td><span class="audit-action-badge audit-badge-leave">${escapeHtml(l.action)}</span></td>
                          <td style="font-size:11.5px"><b>${escapeHtml(l.login_id || 'System')}</b> (${escapeHtml(l.role || '')})</td>
                          <td style="font-size:11.5px;max-width:200px;word-break:break-word">${escapeHtml(l.resource_type || '')} ${escapeHtml(l.details || '')}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>`
    )}
        </div>

        <!-- CARD 5: COLLEGE-WIDE NOTICES -->
        <div class="exec-card" id="card-prin-notices">
          <div class="exec-card-head">
            <div class="exec-card-title-group">
              <span class="exec-card-icon">📢</span>
              <h3 class="exec-card-title">Institutional Circulars &amp; Directives</h3>
            </div>
            <div class="exec-card-actions">
              <button class="chip" data-go="notices" type="button">Open Circular Hub →</button>
            </div>
          </div>
          <p class="sub" style="margin:0 0 10px">As Campus Director, your notices may target <b>Everyone</b>, <b>Students</b>, <b>Staff</b>, or specific departments and hostels.</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${((typeof appData !== 'undefined' && Array.isArray(appData.notices)) ? appData.notices : []).slice(0, 3).map(n => `
              <div style="border-left:3px solid var(--accent);padding:8px 12px;background:rgba(0,0,0,0.02);border-radius:0 8px 8px 0">
                <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap">
                  <b>${escapeHtml(n[1])}</b>
                  <span class="chip" style="font-size:10px">${escapeHtml(n[4] || 'Everyone')}</span>
                </div>
                <p style="margin:4px 0 0;font-size:12px;color:var(--text)">${escapeHtml(n[3])}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      ${renderTodoWidget('principal', '📋 Principal Executive Directives & Campus Works')}
      ${renderNotifications()}
    </div>
  `;
}

// =============================================================================
// 7C. EXECUTIVE LEAVE PAGES: HOD & PRINCIPAL
// =============================================================================

function renderHODLeavePage() {
  loadHodDashboardData();
  const mine = leaveRequests.staff.filter(isMyLeave);
  const pendingLeaves = (hodLeavesList || []).filter(x => x.status === 'Pending');
  const leavesCount = pendingLeaves.length;
  const myD = myDeptName().toUpperCase();

  let out = `<h2>Leave Oversight &amp; Application</h2><p class="sub">Head of Department Executive Workspace · Scoped to ${escapeHtml(myD)} only</p>`;

  out += '<div class="grid">' + ['Casual', 'Medical', 'Earned'].map(k =>
    `<div class="stat" style="cursor:default"><span>${k} leave left</span><b>${leaveLeft(k)}</b><span>of ${LEAVE_QUOTA[k]} days</span></div>`
  ).join('') + '</div>';

  if (leaveMessage) {
    out += `<div class="item" style="margin-bottom:14px;border-color:#10b981;color:#10b981;background:rgba(16,185,129,0.08);border-radius:10px;padding:12px 16px"><b>${escapeHtml(leaveMessage)}</b></div>`;
    leaveMessage = '';
  }

  // Personal leave application form
  out += `<div class="ttcard frm"><b style="font-size:18px">Apply for Personal Leave</b>` +
    `<label for="lt">Leave type</label>` +
    `<select id="lt">${LEAVE_TYPES.staff.map(t => `<option>${t}</option>`).join('')}</select>` +
    `<div class="two">` +
    `<div><label for="lf">From</label><input type="date" id="lf" min="${todayIso()}" value="${todayIso()}"></div>` +
    `<div><label for="lto">To</label><input type="date" id="lto" min="${todayIso()}" value="${todayIso()}"></div>` +
    `</div>` +
    `<label for="lr">Reason</label><textarea id="lr" placeholder="Briefly explain the reason"></textarea>` +
    `<div class="err" id="lerr" role="alert"></div>` +
    `<button class="btn" id="lsub" type="button" style="width:100%">Submit request</button></div>`;

  // Department Pending Leave Approvals Section
  out += `
    <div class="exec-card" style="margin-top:24px">
      <div class="exec-card-head">
        <div class="exec-card-title-group">
          <span class="exec-card-icon">🏖️</span>
          <h3 class="exec-card-title">Pending Leave Approvals (${escapeHtml(myD)})</h3>
          <span class="exec-card-badge ${leavesCount > 0 ? 'urgent' : ''}">${leavesCount} Pending</span>
        </div>
        <div class="exec-card-actions">
          <button class="chip" onclick="hodLeavesList = null; loadHodDashboardData();" type="button">🔄 Refresh</button>
        </div>
      </div>
      <p class="sub" style="margin:0 0 12px">Review leave requests from students and staff in your department only. Short leave (≤ 3 days) approval is final. Long leave (> 3 days) moves to the Principal as Pending.</p>
      ${hodLeavesLoading ? renderLoadingState('Loading department leave requests…') : (
      pendingLeaves.length === 0
        ? renderEmptyState('🎉', 'No Pending Leaves', `All leave requests from students and staff in ${escapeHtml(myD)} have been decided.`)
        : `<div class="approval-list">
              ${pendingLeaves.map(lv => {
          const curUser = (sessionStorage.getItem('cc_user') || '').toLowerCase();
          const isOwn = (lv.login_id && lv.login_id.toLowerCase() === curUser) ||
            (lv.user_id && String(lv.user_id).toLowerCase() === curUser);
          const isWaitingPrin = lv.stage === 'Waiting for Principal';
          const isShort = (lv.days || 1) <= 3;
          const daysLabel = isShort
            ? `${lv.days} day(s) · Short Leave (HOD Final Approval)`
            : `${lv.days} day(s) · Long Leave (Forwarded to Principal)`;
          return `
                  <div class="approval-item">
                    <div class="approval-item-top">
                      <div class="approval-item-person">
                        <span class="approval-item-name">${escapeHtml(lv.name)}</span>
                        <div class="approval-item-meta">
                          <span class="approval-meta-pill">${escapeHtml(lv.login_id)}</span>
                          <span class="approval-meta-pill">${escapeHtml(lv.applicant_role || 'student')}</span>
                          <span class="approval-meta-pill">${escapeHtml(lv.dept || myD)}</span>
                        </div>
                      </div>
                      <span class="approval-days-badge ${isShort ? '' : 'long-leave'}">${daysLabel}</span>
                    </div>
                    <div class="approval-detail-row">
                      <span class="approval-detail-label">Period:</span>
                      <span><b>${escapeHtml(lv.from_date)}</b> to <b>${escapeHtml(lv.to_date)}</b> (${lv.days} days)</span>
                    </div>
                    <div class="approval-detail-row">
                      <span class="approval-detail-label">Stage:</span>
                      <span class="chip" style="font-size:11px;${isWaitingPrin ? 'background:rgba(99,102,241,0.15);color:#818cf8;font-weight:700' : ''}">${escapeHtml(lv.stage || 'Pending')}</span>
                    </div>
                    <div class="approval-reason-box">
                      <b>Reason (${escapeHtml(lv.leave_type)}):</b> ${escapeHtml(lv.reason || 'Not specified')}
                    </div>
                    ${isOwn ? `<p class="sub" style="color:var(--red)">⚠️ This is your own leave application. Department Heads cannot decide their own leave.</p>` :
              isWaitingPrin ? `<p class="sub" style="color:var(--accent);font-weight:600">⏳ Already forwarded to Principal for sanction. (Waiting for Principal)</p>` : `
                      <input type="text" id="hod-note-${lv.id}" class="approval-note-input" placeholder="Decision note / comments (optional)…">
                      <div class="approval-btn-group">
                        <button class="btn sm" onclick="actHodLeave(${lv.id}, 'Approved', ${isShort})" type="button">
                          ${isShort ? '✔ Approve (Final)' : '✔ Approve & Forward to Principal'}
                        </button>
                        <button class="btn ghost sm" style="color:var(--red)" onclick="actHodLeave(${lv.id}, 'Rejected')" type="button">
                          ✖ Reject
                        </button>
                      </div>
                    `}
                  </div>
                `;
        }).join('')}
            </div>`
    )}
    </div>
  `;

  // My past personal leave requests
  out += `<h3 style="margin:24px 0 8px">My personal leave requests</h3><div class="list">` +
    (mine.length
      ? mine.map(r =>
        `<div class="item">` +
        `<div class="top"><b>${escapeHtml(r.t)} leave</b>${statusBadge(r.s)}</div>` +
        `<p>${rangeText(r)}</p>` +
        `<p style="margin:4px 0">${escapeHtml(r.r)}</p>` +
        (r.by ? `<p style="margin-top:6px;font-size:12px;font-weight:600">${r.s === 'Approved' ? '✔' : '✖'} ${r.s} by <b>${escapeHtml(r.by)}</b></p>` : '') +
        `</div>`
      ).join('')
      : '<p class="sub">No personal requests yet.</p>') + `</div>`;

  return out;
}

function renderPrincipalLeavePage() {
  loadPrincipalDashboardData();
  const waitingLeaves = prinWaitingLeaves || [];
  const waitingCount = waitingLeaves.length;
  const allLeaves = prinAllLeaves || [];

  return `
    <h2>Leave Sanctions Directorate</h2>
    <p class="sub">Principal Executive Leave Approvals &amp; College-Wide Oversight</p>

    <!-- CARD: SECOND-LEVEL LEAVE SANCTIONS -->
    <div class="exec-card" style="margin-top:16px">
      <div class="exec-card-head">
        <div class="exec-card-title-group">
          <span class="exec-card-icon">⚖️</span>
          <h3 class="exec-card-title">Second-Level Leave Sanctions</h3>
          <span class="exec-card-badge ${waitingCount > 0 ? 'urgent' : ''}">${waitingCount} Waiting for Me</span>
        </div>
        <div class="exec-card-actions">
          <div style="display:inline-flex;background:rgba(0,0,0,0.06);border-radius:20px;padding:2px">
            <button class="chip" style="${prinLeavesViewMode === 'waiting' ? 'background:var(--accent);color:#fff' : ''}" onclick="setPrinLeavesViewMode('waiting')" type="button">Waiting for Me (${waitingCount})</button>
            <button class="chip" style="${prinLeavesViewMode === 'all' ? 'background:var(--accent);color:#fff' : ''}" onclick="setPrinLeavesViewMode('all')" type="button">All College Leaves (${allLeaves.length})</button>
          </div>
          <button class="chip" onclick="prinWaitingLeaves = null; prinAllLeaves = null; loadPrincipalDashboardData();" type="button">🔄 Refresh</button>
        </div>
      </div>
      <p class="sub" style="margin:0 0 12px">Review leave requests waiting for second-level Principal executive sanction or inspect all college leaves.</p>

      ${prinLeavesLoading ? renderLoadingState('Loading leave applications…') : (() => {
      const list = prinLeavesViewMode === 'waiting' ? waitingLeaves : (prinAllLeaves || []);
      if (list.length === 0) {
        return renderEmptyState('✅', prinLeavesViewMode === 'waiting' ? 'No Leaves Waiting for Sanction' : 'No Leaves Recorded', 'All multi-day and escalated leaves have been reviewed.');
      }
      return `
          <div class="approval-list">
            ${list.map(lv => `
              <div class="approval-item">
                <div class="approval-item-top">
                  <div class="approval-item-person">
                    <span class="approval-item-name">${escapeHtml(lv.name)}</span>
                    <div class="approval-item-meta">
                      <span class="approval-meta-pill">${escapeHtml(lv.login_id)}</span>
                      <span class="approval-meta-pill">${escapeHtml(lv.applicant_role || 'student')}</span>
                      <span class="approval-meta-pill">${escapeHtml(lv.dept || 'General')}</span>
                    </div>
                  </div>
                  <span class="approval-days-badge long-leave">${lv.days || 1} days · ${escapeHtml(lv.stage || lv.status)}</span>
                </div>
                <div class="approval-detail-row">
                  <span class="approval-detail-label">Period:</span>
                  <span><b>${escapeHtml(lv.from_date)}</b> to <b>${escapeHtml(lv.to_date)}</b></span>
                </div>
                <div class="approval-reason-box">
                  <b>Reason (${escapeHtml(lv.leave_type)}):</b> ${escapeHtml(lv.reason || 'N/A')}
                  ${lv.action_by ? `<div class="sub" style="margin-top:4px">HOD Endorsement: ${escapeHtml(lv.action_by)} ${lv.action_note ? '· ' + escapeHtml(lv.action_note) : ''}</div>` : ''}
                </div>
                ${lv.status === 'Pending' ? `
                  <input type="text" id="prin-note-${lv.id}" class="approval-note-input" placeholder="Principal executive sanction note…">
                  <div class="approval-btn-group">
                    <button class="btn sm" onclick="actPrincipalLeave(${lv.id}, 'Approved')" type="button">✔ Sanction / Approve</button>
                    <button class="btn ghost sm" style="color:var(--red)" onclick="actPrincipalLeave(${lv.id}, 'Rejected')" type="button">✖ Reject</button>
                  </div>
                ` : `<p class="sub">Decided: <b>${escapeHtml(lv.status)}</b> by ${escapeHtml(lv.action_by || 'Principal')}</p>`}
              </div>
            `).join('')}
          </div>
        `;
    })()}
    </div>
  `;
}

// ----- Persistent Work & Tasks To-Do Management (Warden, Placement Officer, Principal, Staff) -----
function getTodoList(roleKey) {
  const rk = roleKey || getRole();
  const key = 'cc_todo_' + rk;
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) { }
  }
  let defaults = [];
  if (rk === 'warden') {
    defaults = [
      { id: 'w1', text: 'Conduct Night Roll Call for Hostel Block', done: false, priority: 'urgent' },
      { id: 'w2', text: 'Inspect mess dining cleanliness & drinking water RO filters', done: true, priority: 'normal' },
      { id: 'w3', text: 'Review pending hostel maintenance and electrical complaints', done: false, priority: 'normal' },
      { id: 'w4', text: 'Verify weekend gatepass requests with Academic Cell', done: false, priority: 'normal' }
    ];
  } else if (rk === 'placement_officer') {
    defaults = [
      { id: 'p1', text: 'Review incoming corporate recruiter requests', done: false, priority: 'urgent' },
      { id: 'p2', text: 'Publish campus placement drive notice for 2026 batch', done: true, priority: 'normal' },
      { id: 'p3', text: 'Verify eligible student resumes and CGPA verification list', done: false, priority: 'normal' },
      { id: 'p4', text: 'Confirm seminar hall booking for pre-placement corporate talk', done: false, priority: 'normal' }
    ];
  } else if (rk === 'principal') {
    defaults = [
      { id: 'pr1', text: 'Review syllabus completion & classes held across departments', done: false, priority: 'urgent' },
      { id: 'pr2', text: 'Sanction faculty duty leave & official tour requests', done: true, priority: 'normal' },
      { id: 'pr3', text: 'Convene Academic Council meeting for Semester Examinations', done: false, priority: 'urgent' },
      { id: 'pr4', text: 'Inspect campus discipline and hostel safety measures', done: false, priority: 'normal' }
    ];
  } else {
    defaults = [
      { id: 's1', text: 'Check examination invigilation duty dates and hall allotments', done: false, priority: 'normal' },
      { id: 's2', text: 'Submit monthly administrative activity report to Principal office', done: false, priority: 'normal' }
    ];
  }
  localStorage.setItem(key, JSON.stringify(defaults));
  return defaults;
}

function saveTodoList(roleKey, list) {
  const rk = roleKey || getRole();
  localStorage.setItem('cc_todo_' + rk, JSON.stringify(list));
}

function addTodoItem(roleKey, text, priority) {
  if (!text || !text.trim()) return;
  const list = getTodoList(roleKey);
  list.unshift({
    id: 't_' + Date.now(),
    text: text.trim(),
    done: false,
    priority: priority || 'normal'
  });
  saveTodoList(roleKey, list);
}

function toggleTodoItem(roleKey, id) {
  const list = getTodoList(roleKey);
  const it = list.find(x => x.id === id);
  if (it) {
    it.done = !it.done;
    saveTodoList(roleKey, list);
  }
}

function deleteTodoItem(roleKey, id) {
  let list = getTodoList(roleKey);
  list = list.filter(x => x.id !== id);
  saveTodoList(roleKey, list);
}

function renderTodoWidget(roleKey, title) {
  const rk = roleKey || getRole();
  const list = getTodoList(rk);
  const doneCount = list.filter(x => x.done).length;
  const total = list.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return `
    <div class="todo-widget">
      <div class="todo-header">
        <h3 class="todo-title"><span>📝</span> ${escapeHtml(title || 'Daily Works & Tasks To-Do')}</h3>
        <span class="todo-progress-pill">${doneCount} of ${total} completed (${pct}%)</span>
      </div>
      <div class="todo-bar-wrap">
        <div class="todo-bar-fill" style="width: ${pct}%"></div>
      </div>
      <div class="todo-form">
        <input type="text" id="todoInput" class="todo-input" placeholder="Add a work or task (e.g. Inspect block, review resumes, report)..." maxlength="150" onkeydown="if(event.key==='Enter'){$('todoAddBtn').click();}">
        <select id="todoPriority" class="todo-priority-select">
          <option value="normal">Normal</option>
          <option value="urgent">Urgent ⚡</option>
        </select>
        <button type="button" id="todoAddBtn" class="todo-add-btn" data-role="${rk}">+ Add Work</button>
      </div>
      <div class="todo-list">
        ${list.length ? list.map(item => `
          <div class="todo-item ${item.done ? 'done' : ''}">
            <input type="checkbox" class="todo-checkbox" ${item.done ? 'checked' : ''} data-todo-toggle="${item.id}" data-role="${rk}" aria-label="Toggle task">
            <span class="todo-text">${escapeHtml(item.text)}</span>
            <span class="todo-tag ${item.priority === 'urgent' ? 'urgent' : 'normal'}">${item.priority === 'urgent' ? 'Urgent' : 'Work'}</span>
            <button type="button" class="todo-del-btn" data-todo-del="${item.id}" data-role="${rk}" title="Delete task" aria-label="Delete">✕</button>
          </div>
        `).join('') : `
          <div class="todo-empty-state">🎉 All works completed! Add a new task above.</div>
        `}
      </div>
    </div>
  `;
}

// Staff profile page (shows the admin-edited record when the signed-in ID matches one)
function renderStaffProfile() {
  const r = myStaff();
  const role = getRole();
  const photo = myPhotoValue(r);
  const v = (key, demo) => escapeHtml(r ? (r[key] || '—') : demo);
  const empId = r ? escapeHtml(r.id) : escapeHtml(userName().toUpperCase());
  const name = r ? escapeHtml(r.name) : displayName();

  let badgeIcon = '🧑‍🏫';
  let roleTag = '🧑‍🏫 Faculty Member';
  let defaultPos = 'Assistant Professor';
  let deptVal = (r && r.dept) || ssGet('cc_dept') || 'Computer Science & Engineering';

  if (role === 'principal') {
    badgeIcon = '🎓';
    roleTag = '🎓 Principal & Campus Director';
    defaultPos = 'Principal & Campus Director';
    deptVal = 'Institutional Directorate & Academic Governance';
  } else if (role === 'hod') {
    badgeIcon = '🏛️';
    roleTag = '🏛️ Head of Department (HOD)';
    defaultPos = 'Head of Department';
    deptVal = (r && r.dept) || ssGet('cc_dept') || 'Computer Science & Engineering';
  } else if (role === 'warden') {
    badgeIcon = '🏠';
    roleTag = '🏠 Chief Hostel Warden';
    defaultPos = 'Hostel Warden';
    deptVal = (r && r.hostel) || ssGet('cc_hostel') || 'Student Residences & Hostels';
  } else if (role === 'placement_officer') {
    badgeIcon = '💼';
    roleTag = '💼 Training & Placement Officer (TPO)';
    defaultPos = 'Head TPO · Career & Corporate Relations';
    deptVal = 'Training & Placement Directorate';
  }

  const pos = r && r.pos ? escapeHtml(r.pos + (r.dept ? ' · ' + r.dept : '')) : `${defaultPos} · ${deptVal}`;
  const designation = (r && r.pos) ? escapeHtml(r.pos) : defaultPos;
  const email = v('email', (empId ? empId.toLowerCase() : 'staff') + '@bput.ac.in');

  return `
    <div class="pf-page">
      <div class="pf-hero-card">
        <div class="pf-hero-cover"></div>
        <div class="pf-hero-body">
          <div class="pf-avatar-wrapper">
            <div class="avatar big pf-avatar-glow">${r ? avatarInner(photo, r.name) : avatarInner(photo)}</div>
            <span class="pf-avatar-badge" title="${escapeHtml(roleTag)}">${badgeIcon}</span>
          </div>

          <div class="pf-hero-details">
            <div class="pf-hero-badge-strip">
              <span class="pf-role-tag pf-role-faculty">${roleTag}</span>
              <span class="pf-status-tag"><span class="pf-dot-pulse"></span> Active Institutional Staff</span>
              <span class="pf-campus-tag">🏛️ BPUT Main Campus</span>
            </div>
            <h2 class="pf-name">${name}</h2>
            <p class="pf-title-sub">${pos}</p>

            <div class="pf-meta-chips">
              <div class="pf-chip" title="Click to copy Employee ID" data-acc="copy" data-text="${empId}">
                <span class="pf-chip-icon">🆔</span>
                <span>${empId}</span>
                <span class="pf-chip-copy">📋</span>
              </div>
              <div class="pf-chip" title="Click to copy Email" data-acc="copy" data-text="${email}">
                <span class="pf-chip-icon">✉️</span>
                <span>${email}</span>
                <span class="pf-chip-copy">📋</span>
              </div>
              <div class="pf-chip">
                <span class="pf-chip-icon">🏛️</span>
                <span>${escapeHtml(deptVal)}</span>
              </div>
            </div>
          </div>

          <div class="pf-hero-actions">
            <button class="btn ghost sm pf-theme-btn" id="theme" type="button">
              <span>🌓</span> Toggle Theme
            </button>
          </div>
        </div>
      </div>

      <div class="pf-cards-grid">
        <!-- Card 1: Academic & Dept -->
        <div class="ttcard pf-card">
          <div class="pf-card-head">
            <span class="pf-card-icon">🏛️</span>
            <div>
              <h3>Department & Position</h3>
              <p class="pf-card-head-sub">Institutional responsibilities and location</p>
            </div>
          </div>
          <div class="pf-info-list">
            <div class="pf-info-row">
              <span class="pf-info-label">Employee ID</span>
              <span class="pf-info-val"><code>${empId}</code></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Department</span>
              <span class="pf-info-val">${escapeHtml(deptVal)}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Designation</span>
              <span class="pf-info-val"><b>${designation}</b></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Cabin Location</span>
              <span class="pf-info-val">${v('cabin', role === 'principal' ? 'Administrative Directorate, Room 101' : (role === 'hod' ? 'Department Head Office' : 'Faculty Block A, Room 12'))}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">${role === 'principal' ? 'Institutional Directorate' : (role === 'hod' ? 'Leadership Scope' : 'Subjects Taught')}</span>
              <span class="pf-info-val">${v('subjects', role === 'principal' ? 'Campus Governance & Academic Regulation' : (role === 'hod' ? 'Curriculum Delivery & Department Management' : 'Data Structures, Algorithms'))}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Joining Date</span>
              <span class="pf-info-val">${r && r.joined ? longDate(r.joined) : 'July 2019'}</span>
            </div>
          </div>
        </div>

        <!-- Card 2: Contact -->
        <div class="ttcard pf-card">
          <div class="pf-card-head">
            <span class="pf-card-icon">📞</span>
            <div>
              <h3>Contact Details</h3>
              <p class="pf-card-head-sub">Communication and office hours</p>
            </div>
          </div>
          <div class="pf-info-list">
            <div class="pf-info-row">
              <span class="pf-info-label">Official Email</span>
              <span class="pf-info-val"><a href="mailto:${email}" class="pf-link">${email}</a></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Phone</span>
              <span class="pf-info-val">${v('phone', '+91 91234 56780')}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Office Hours</span>
              <span class="pf-info-val">10:00 AM – 04:00 PM (Mon – Fri)</span>
            </div>
          </div>
        </div>
      </div>

      ${renderAccountSettings()}

      <p class="demo">${r ? 'Your details are kept up to date by the admin office.' : 'Demo faculty data shown for preview.'}</p>
    </div>
  `;
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

// Role switcher on the login form (Student / Staff / Admin / Guest)
$('seg').addEventListener('click', e => {
  const btn = e.target.closest('[data-role]');
  if (!btn) return;

  loginRole = btn.dataset.role;
  [...$('seg').children].forEach(b => b.classList.toggle('on', b === btn));
  $('user').placeholder = PLACEHOLDERS[loginRole];
  $('user').setAttribute('aria-label', $('user').placeholder);

  // Icon + ring colour follow the role smoothly without popping
  const logo = $('roleLogo');
  if (logo) {
    logo.innerHTML = `<span class="logo-emoji">${ROLE_ICONS[loginRole]}</span>`;
    logo.classList.remove('zoom-in', 'pop');
  }
  $('phoneBox').dataset.role = loginRole;

  $('seg').setAttribute('data-r', loginRole);
  $('roleHint').textContent = ROLE_HINTS[loginRole];

  // Cascading smooth DROP-DOWN effect after selecting option on screen
  const dropDownTargets = [
    $('roleHint'),
    ...document.querySelectorAll('#formPane .field'),
    document.querySelector('#formPane .row'),
    $('signin'),
    document.querySelector('#formPane .or'),
    document.querySelector('#formPane p:last-child')
  ].filter(Boolean);

  dropDownTargets.forEach((el, i) => {
    el.classList.remove('drop-down-anim', 'sl-r', 'sl-l');
    void el.offsetWidth;
    el.classList.add('drop-down-anim');
    el.style.animationDelay = (i * 0.025) + 's';
  });

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

function renderRoadmap(featureName, icon, phase, summary, details) {
  return `
    <div style="max-width:700px;margin:24px auto;padding:24px;border:1px solid var(--border);border-radius:16px;background:var(--card-bg, rgba(255,255,255,0.03));backdrop-filter:blur(8px);box-shadow:0 4px 20px rgba(0,0,0,0.15)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:32px">${icon}</span>
        <div>
          <div style="display:flex;gap:8px;align-items:center">
            <h2 style="margin:0;font-size:22px">${escapeHtml(featureName)}</h2>
            <span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3)">🚀 Roadmap</span>
          </div>
          <p class="sub" style="margin:4px 0 0;font-size:13px">${escapeHtml(phase)}</p>
        </div>
      </div>
      <p style="font-size:14px;color:var(--text);line-height:1.6;margin:16px 0 12px">${escapeHtml(summary)}</p>
      <div style="padding:14px;border-radius:10px;background:rgba(0,0,0,0.18);border:1px dashed var(--border);font-size:13px;color:var(--muted);line-height:1.5">
        <b style="color:var(--text)">Engineering Scope &amp; Integrity:</b> ${escapeHtml(details)}
      </div>
      <div style="margin-top:20px;display:flex;gap:10px">
        <button class="btn sm" data-go="home" type="button">← Back to Dashboard</button>
        <button class="btn ghost sm" data-go="timetable" type="button">View Live Timetable</button>
      </div>
    </div>
  `;
}

function renderResults() {
  return renderRoadmap(
    'University Semester Results',
    '📊',
    'Semester 2 Milestone · External ERP Integration',
    'Official university grades and marksheet synchronization requires secure integration with the BPUT Examination Controller API.',
    'Mock gradecards and hardcoded GPAs have been removed to preserve operational integrity. Once semester exams conclude and university API tokens are provisioned, verified gradecards will appear here.'
  );
}

// ----- 10b. EXAMINATION CELL & UNIVERSITY ASSESSMENTS PORTAL -----
let examActiveTab = 'schedule'; // 'schedule' | 'duties' | 'ticket' | 'guidelines'

function renderExaminations() {
  const role = getRole();
  const isStaff = isStaffRole() || role === 'admin';

  const EXAM_SCHEDULE = [
    { date: '15 Oct 2026', day: 'Monday', time: '10:00 AM – 01:00 PM', code: 'CS301', name: 'Database Management Systems', hall: 'LH-101 / LH-102', sem: 'Semester 3', type: 'End-Term Theory' },
    { date: '17 Oct 2026', day: 'Wednesday', time: '10:00 AM – 01:00 PM', code: 'CS302', name: 'Design & Analysis of Algorithms', hall: 'LH-101 / LH-103', sem: 'Semester 3', type: 'End-Term Theory' },
    { date: '20 Oct 2026', day: 'Saturday', time: '10:00 AM – 01:00 PM', code: 'CS303', name: 'Operating Systems', hall: 'LH-102 / LH-104', sem: 'Semester 3', type: 'End-Term Theory' },
    { date: '22 Oct 2026', day: 'Monday', time: '10:00 AM – 01:00 PM', code: 'CS304', name: 'Computer Organization & Architecture', hall: 'LH-101 / LH-103', sem: 'Semester 3', type: 'End-Term Theory' },
    { date: '24 Oct 2026', day: 'Wednesday', time: '02:00 PM – 05:00 PM', code: 'CS305', name: 'Full Stack Web Development', hall: 'Software Lab 1 / LH-102', sem: 'Semester 3', type: 'Practical & Theory' }
  ];

  const STAFF_DUTIES = [
    { date: '15 Oct 2026', shift: 'Morning (09:30 AM)', hall: 'LH-101', role: 'Chief Hall Superintendent', staff: 'Dr. A. Mishra (HOD)', status: 'Confirmed' },
    { date: '15 Oct 2026', shift: 'Morning (09:30 AM)', hall: 'LH-102', role: 'Room Invigilator', staff: 'Prof. S. Das', status: 'Confirmed' },
    { date: '17 Oct 2026', shift: 'Morning (09:30 AM)', hall: 'LH-101', role: 'Room Invigilator', staff: 'Er. R. Sen', status: 'Confirmed' },
    { date: '17 Oct 2026', shift: 'Morning (09:30 AM)', hall: 'LH-103', role: 'Exam Discipline Officer', staff: 'Hostel Warden / P. Officer', status: 'Duty Assigned' },
    { date: '20 Oct 2026', shift: 'Morning (09:30 AM)', hall: 'LH-102', role: 'Flying Squad & Verification', staff: 'Dr. P. Kar', status: 'Confirmed' },
    { date: '24 Oct 2026', shift: 'Afternoon (01:30 PM)', hall: 'Software Lab 1', role: 'Lab Technical Evaluator', staff: 'Ms. L. Roy', status: 'Confirmed' }
  ];

  return `
    <div class="exam-page">
      <div class="exam-hero">
        <h2><span>📝</span> BPUT Semester Examination Portal</h2>
        <p class="exam-sub">Academic Session 2026-27 · Controller of Examinations (CoE) Circular &amp; Rosters</p>
      </div>

      <div class="exam-nav">
        <button type="button" class="exam-tab-btn ${examActiveTab === 'schedule' ? 'active' : ''}" data-exam-tab="schedule">📅 Exam Schedule</button>
        <button type="button" class="exam-tab-btn ${examActiveTab === 'duties' ? 'active' : ''}" data-exam-tab="duties">🧑‍🏫 Staff Invigilation &amp; Duties</button>
        <button type="button" class="exam-tab-btn ${examActiveTab === 'ticket' ? 'active' : ''}" data-exam-tab="ticket">🎟️ Hall Ticket &amp; Clearance</button>
        <button type="button" class="exam-tab-btn ${examActiveTab === 'guidelines' ? 'active' : ''}" data-exam-tab="guidelines">📋 Rules &amp; Code of Conduct</button>
      </div>

      ${examActiveTab === 'schedule' ? `
        <div class="exam-card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
            <h3 style="margin:0;font-size:14px;font-weight:700">Official B.Tech Semester 3 Examination Timetable</h3>
            <span class="exam-status-badge exam-status-confirmed">Winter 2026 · Regular &amp; Backlog</span>
          </div>
          <div class="exam-table-wrap">
            <table class="exam-table">
              <thead>
                <tr>
                  <th>Date &amp; Day</th>
                  <th>Timing</th>
                  <th>Code</th>
                  <th>Subject</th>
                  <th>Examination Hall</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${EXAM_SCHEDULE.map(ex => `
                  <tr>
                    <td><b>${ex.date}</b><br><small style="color:var(--muted)">${ex.day}</small></td>
                    <td>${ex.time}</td>
                    <td><code>${ex.code}</code></td>
                    <td><b>${ex.name}</b><br><small style="color:var(--muted)">${ex.sem} · ${ex.type}</small></td>
                    <td>🏛️ ${ex.hall}</td>
                    <td><span class="exam-status-badge exam-status-confirmed">Published</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${examActiveTab === 'duties' ? `
        <div class="exam-card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
            <h3 style="margin:0;font-size:14px;font-weight:700">Staff Examination Invigilation &amp; Flying Squad Duty Roster</h3>
            <span class="exam-status-badge exam-status-duty">All Faculty &amp; Staff Members</span>
          </div>
          <p style="margin:0 0 12px;font-size:12.5px;color:var(--muted)">
            All staff members (teaching faculty, wardens, and administrative officers) assigned to invigilation or campus discipline duty must report 30 minutes before exam commencement.
          </p>
          <div class="exam-table-wrap">
            <table class="exam-table">
              <thead>
                <tr>
                  <th>Date &amp; Shift</th>
                  <th>Hall / Venue</th>
                  <th>Duty Assignment</th>
                  <th>Staff In-Charge</th>
                  <th>Reporting Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${STAFF_DUTIES.map(d => `
                  <tr>
                    <td><b>${d.date}</b><br><small style="color:var(--muted)">${d.shift}</small></td>
                    <td>🏛️ ${d.hall}</td>
                    <td><b>${d.role}</b></td>
                    <td>${d.staff}</td>
                    <td>30 min prior</td>
                    <td><span class="exam-status-badge ${d.status === 'Confirmed' ? 'exam-status-confirmed' : 'exam-status-duty'}">${d.status}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${examActiveTab === 'ticket' ? `
        <div class="exam-card">
          <h3 style="margin:0 0 10px;font-size:14px;font-weight:700">Digital Examination Hall Ticket &amp; Attendance Clearance</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:14px">
            <div style="padding:14px;border-radius:12px;background:var(--ghost);border:1px solid var(--line)">
              <div style="font-size:12px;color:var(--muted)">Attendance Requirement</div>
              <div style="font-size:18px;font-weight:800;color:#10b981;margin:4px 0">75% Mandatory</div>
              <div style="font-size:11.5px;color:var(--muted)">As per BPUT Academic Regulations. Medical condonation up to 65%.</div>
            </div>
            <div style="padding:14px;border-radius:12px;background:var(--ghost);border:1px solid var(--line)">
              <div style="font-size:12px;color:var(--muted)">Admit Card Verification</div>
              <div style="font-size:18px;font-weight:800;color:var(--blue);margin:4px 0">Cleared for Regular Exams</div>
              <div style="font-size:11.5px;color:var(--muted)">Digital QR code verified against college database.</div>
            </div>
          </div>
          <div style="padding:14px;border-radius:12px;border:1px dashed var(--line);background:var(--t04);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div>
              <b>Download Digital Hall Ticket (PDF)</b>
              <p style="margin:2px 0 0;font-size:12px;color:var(--muted)">Includes room allocations and verified barcode for BPUT Center.</p>
            </div>
            <button type="button" class="btn sm" onclick="alert('Digital Hall Ticket downloaded successfully (PDF). Please carry a printed copy to the exam hall.');">📥 Download Admit Card</button>
          </div>
        </div>
      ` : ''}

      ${examActiveTab === 'guidelines' ? `
        <div class="exam-card">
          <h3 style="margin:0 0 10px;font-size:14px;font-weight:700">University Examination Code of Conduct &amp; Instructions</h3>
          <div class="exam-guide-box">
            <b>⚠️ Strict Prohibitions:</b>
            <ul style="margin:6px 0 0;padding-left:18px;line-height:1.6">
              <li>Mobile phones, smartwatches, Bluetooth devices, and programmable calculators are strictly forbidden inside the hall.</li>
              <li>Possession of unauthorized papers or materials constitutes an automatic Malpractice (UFM) report to BPUT CoE.</li>
            </ul>
          </div>
          <div style="line-height:1.6;font-size:12.5px;color:var(--text)">
            <b>Mandatory Requirements:</b>
            <ol style="margin:6px 0 0;padding-left:18px">
              <li>Candidates must report to their assigned hall at least <b>20 minutes prior</b> to the bell.</li>
              <li>Original College Identity Card and BPUT Registration Card must be placed on the desk throughout the session.</li>
              <li>No student will be permitted to enter 30 minutes after the exam commences.</li>
              <li>Answer sheets must be handed over directly to the hall invigilator before leaving.</li>
            </ol>
          </div>
        </div>
      ` : ''}
    </div>
  `;
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
    `<div class="form-preset-wrap">` +
    `<span class="preset-label">💡 Common Topics (tap to fill):</span>` +
    `<div class="preset-chips">` +
    `<button type="button" class="preset-chip" data-preset="ctext:Hostel drinking water RO dispenser broken and unhygienic:Facilities">🚰 RO Purifier Issue</button>` +
    `<button type="button" class="preset-chip" data-preset="ctext:Streetlights outside hostel pathway broken and dark:Safety / Harassment">💡 Broken Streetlights</button>` +
    `<button type="button" class="preset-chip" data-preset="ctext:Discrepancy observed in internal marks evaluation:Academics">⚖️ Internal Marks Grading</button>` +
    `<button type="button" class="preset-chip" data-preset="ctext:Cafeteria hygiene and food preparation need inspection:Facilities">🍽️ Cafeteria Hygiene</button>` +
    `<button type="button" class="preset-chip" data-preset="ctext:Hostel common washrooms require deep sanitization:Hostel">🧹 Washroom Cleaning</button>` +
    `<button type="button" class="preset-chip" data-preset="ctext:Unexpected penalty fees levied without prior university notice:Fees">💰 Fee Grievance</button>` +
    `</div></div>` +
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
  if (typeof API !== 'undefined' && API.createComplaint) {
    API.createComplaint({
      category: 'College',
      title: text.slice(0, 80),
      description: text,
      location: 'Campus',
      is_anonymous: true
    }).then(() => {
      loadCommunityComplaints();
    }).catch(err => {
      console.warn('Anonymous complaint submission API note:', err);
    });
  }
  $('sbody').innerHTML = `<div class="tick" style="margin-top:10px">✓</div>` +
    `<h2 style="text-align:center;margin:0 0 6px">Complaint submitted</h2>` +
    `<p class="sub" style="text-align:center">Your complaint was submitted anonymously. Action will be taken within 7 days at most.<br>Reference: <b>${reference}</b></p>` +
    `<div class="btns" style="justify-content:center"><button class="btn ghost sm" data-again type="button">Raise another</button><button class="btn sm" data-close type="button">Done</button></div>`;
  translatePage($('sheet'));
}

// Toast notification helper
function showToast(msg) {
  let box = $('appToast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'appToast';
    box.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(100px);background:rgba(15,23,42,0.92);color:white;padding:10px 20px;border-radius:30px;font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.25);z-index:99999;transition:transform 0.25s cubic-bezier(0.34,1.56,0.64,1),opacity 0.25s ease;opacity:0;pointer-events:none;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.15);';
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.style.opacity = '1';
  box.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(box._timer);
  box._timer = setTimeout(() => {
    box.style.opacity = '0';
    box.style.transform = 'translateX(-50%) translateY(100px)';
  }, 3200);
}

// String hash helper
function strHash(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  return h;
}

// Crisp Vector QR Code generator for gate passes and event tickets
function makeQrSvg(seed) {
  let hash = 0;
  const str = String(seed || 'CAMPBIT');
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
  let cells = '';
  for (let r = 0; r < 14; r++) {
    for (let c = 0; c < 14; c++) {
      if ((r < 4 && c < 4) || (r < 4 && c >= 10) || (r >= 10 && c < 4)) continue;
      const v = Math.abs(Math.sin((r * 14 + c + hash) * 1.6)) > 0.44;
      if (v) {
        cells += `<rect x="${14 + c * 7.2}" y="${14 + r * 7.2}" width="5.8" height="5.8" rx="1.2" fill="currentColor"/>`;
      }
    }
  }
  return `<svg class="gp-qr-svg" viewBox="0 0 130 130" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:var(--text,#0f172a)">
    <rect x="12" y="12" width="28" height="28" rx="6" stroke="currentColor" stroke-width="2.8" fill="none"/>
    <rect x="18" y="18" width="16" height="16" rx="3" fill="currentColor"/>
    <rect x="90" y="12" width="28" height="28" rx="6" stroke="currentColor" stroke-width="2.8" fill="none"/>
    <rect x="96" y="18" width="16" height="16" rx="3" fill="currentColor"/>
    <rect x="12" y="90" width="28" height="28" rx="6" stroke="currentColor" stroke-width="2.8" fill="none"/>
    <rect x="18" y="96" width="16" height="16" rx="3" fill="currentColor"/>
    ${cells}
    <rect x="52" y="52" width="26" height="26" rx="6" fill="var(--card-bg,#fff)" stroke="currentColor" stroke-width="1.8"/>
    <text x="65" y="69" font-size="13" text-anchor="middle" font-weight="bold" fill="currentColor">🛡️</text>
  </svg>`;
}

/* =============================================================================
   FEATURE A: DIGITAL GATE PASS & QR SECURITY OUTPASS
   ============================================================================= */
function getGateLogs() {
  return loadJson('cc_gatelogs', {});
}

function recordGateCheck(id, action) {
  const logs = getGateLogs();
  if (!logs[id]) logs[id] = { out: null, in: null };
  const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + todayIso();
  if (action === 'out') {
    logs[id].out = nowStr;
    showToast('🚪 Gate Departure Recorded · Security Desk Gate 1');
  } else if (action === 'in') {
    logs[id].in = nowStr;
    showToast('🏠 Gate Return Recorded · Security Desk Gate 1');
  } else if (action === 'reset') {
    logs[id] = { out: null, in: null };
    showToast('↺ Gate scan status reset');
  }
  saveJson('cc_gatelogs', logs);
  openSheet('gp:' + id);
}

function renderGatePassSheet(id) {
  const req = (typeof studentApprovals !== 'undefined' && studentApprovals.find(r => r.id === id)) ||
    (leaveRequests && leaveRequests.student && leaveRequests.student.find(r => r.id === id)) ||
    (leaveRequests && leaveRequests.staff && leaveRequests.staff.find(r => r.id === id));
  if (!req) {
    return `<div style="padding:24px;text-align:center"><p class="sub">Gate Pass record not found for reference #${escapeHtml(id)}</p><button class="btn sm" data-close type="button">Close</button></div>`;
  }
  const sName = req.n ? req.n.split(' · ')[0] : (displayName() || 'Student');
  const roll = req.roll || (req.n && req.n.includes(' · ') ? req.n.split(' · ')[1] : userName().toUpperCase());
  const dept = req.dept || 'Computer Science & Engg';
  const hostel = req.hostel || 'Hostel Block A (Room 204)';
  const passId = 'GP-' + (new Date().getFullYear()) + '-' + String(req.id).replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
  const logs = (getGateLogs())[id] || { out: null, in: null };

  let statusTag = '<span class="gp-live-tag"><span class="gp-pulse"></span> Authorized &amp; Active</span>';
  if (logs.in) {
    statusTag = '<span class="gp-live-tag" style="color:#0284c7;background:rgba(2,132,199,0.12);border-color:rgba(2,132,199,0.3)">✓ Returned &amp; Closed</span>';
  } else if (logs.out) {
    statusTag = '<span class="gp-live-tag" style="color:#f59e0b;background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.3)"><span class="gp-pulse" style="background:#f59e0b"></span> Outside Campus</span>';
  }

  return `
    <div class="gp-card">
      <div class="gp-top-strip">
        <div class="gp-brand-title">🏛️ CampBit Digital Outpass</div>
        <div class="gp-pass-id">${passId}</div>
      </div>
      <div class="gp-body">
        <div class="gp-status-row">
          ${statusTag}
          <div class="gp-countdown">Valid: ${formatDate(req.f)} to ${formatDate(req.to)}</div>
        </div>

        <div class="gp-student-info">
          <div class="avatar big" style="width:48px;height:48px;font-size:18px">${avatarInner(myPhotoValue(myStudent()), sName)}</div>
          <div class="gp-student-text">
            <h3>${escapeHtml(sName)}</h3>
            <p>Roll: <b>${escapeHtml(roll)}</b> · ${escapeHtml(dept)}</p>
            <p>Hostel: ${escapeHtml(hostel)}</p>
          </div>
        </div>

        <div class="gp-details-grid">
          <div class="gp-detail-cell">
            <div class="gp-detail-label">Leave Category</div>
            <div class="gp-detail-val">✈️ ${escapeHtml(req.t)} Leave</div>
          </div>
          <div class="gp-detail-cell">
            <div class="gp-detail-label">Approving Authority</div>
            <div class="gp-detail-val">🛡️ ${escapeHtml(req.by || 'Head of Department (HOD)')}</div>
          </div>
          <div class="gp-detail-cell">
            <div class="gp-detail-label">Departure From</div>
            <div class="gp-detail-val">${formatDate(req.f)}</div>
          </div>
          <div class="gp-detail-cell">
            <div class="gp-detail-label">Reporting By</div>
            <div class="gp-detail-val">${formatDate(req.to)}</div>
          </div>
        </div>

        <div style="background:rgba(128,128,128,0.05);padding:10px 12px;border-radius:8px;font-size:12px;margin-bottom:14px">
          <b>Purpose:</b> "${escapeHtml(req.r)}"
        </div>

        <div class="gp-qr-section">
          ${makeQrSvg('CAMPBIT://PASS/' + passId + '/' + roll)}
          <div class="gp-qr-hint">Scan at Main Gate Security Scanner for automatic verification</div>
        </div>

        <div class="gp-security-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b style="color:var(--text)">🛡️ Gatekeeper Movement Log</b>
            <span style="font-size:11px;color:var(--muted)">Desk: Main Gate #1</span>
          </div>
          <div style="font-size:11.5px;color:var(--muted);line-height:1.5">
            <div>• Departure Scan: ${logs.out ? `<b style="color:#059669">Recorded at ${escapeHtml(logs.out)}</b>` : '<i>Pending gate checkout</i>'}</div>
            <div>• Return Scan: ${logs.in ? `<b style="color:#0284c7">Recorded at ${escapeHtml(logs.in)}</b>` : '<i>Pending campus arrival</i>'}</div>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            ${!logs.out ? `<button class="btn sm" data-gp-act="${req.id}:out" type="button" style="font-size:11.5px">🚪 Scan Departure (Out)</button>` : ''}
            ${logs.out && !logs.in ? `<button class="btn sm" data-gp-act="${req.id}:in" type="button" style="font-size:11.5px;background:#059669">🏠 Scan Return (In)</button>` : ''}
            ${(logs.out || logs.in) ? `<button class="btn ghost sm" data-gp-act="${req.id}:reset" type="button" style="font-size:11px">↺ Reset Scans</button>` : ''}
          </div>
        </div>

        <div class="gp-actions">
          <button class="btn ghost sm" data-print type="button">🖨️ Print Pass</button>
          <button class="btn sm" data-close type="button">Close</button>
        </div>
      </div>
    </div>
  `;
}

/* =============================================================================
   FEATURE B: CAMPUS EMERGENCY SOS & SAFETY DISPATCH
   ============================================================================= */
function getSosAlerts() {
  return loadJson('cc_sos', []);
}
function saveSosAlerts(alerts) {
  saveJson('cc_sos', alerts);
}

function renderEmergencySheet() {
  const alerts = getSosAlerts();
  const myAlert = alerts.find(a => a.status === 'ACTIVE' && (a.user === userName() || a.user === displayName()));

  let activeHtml = '';
  if (myAlert) {
    activeHtml = `
      <div class="sos-banner-card" style="border-color:#ef4444;background:rgba(239,68,68,0.12)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:24px">🚨</span>
          <div>
            <b style="color:#ef4444;font-size:16px;display:block">EMERGENCY DISPATCH ACTIVE</b>
            <span class="sub" style="font-size:12px;color:var(--text)">Campus QRT &amp; Security Control Notified</span>
          </div>
        </div>
        <div style="background:var(--card-bg,#fff);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:10px 12px;margin:8px 0;font-size:12.5px">
          <div><b>Location:</b> ${escapeHtml(myAlert.location)}</div>
          <div><b>Emergency:</b> ${escapeHtml(myAlert.type)}</div>
          <div><b>Details:</b> ${escapeHtml(myAlert.note || 'Immediate assistance requested')}</div>
          <div style="margin-top:4px;font-size:11px;color:var(--muted)">Broadcasted at ${escapeHtml(myAlert.time)}</div>
        </div>
        <div class="btns" style="gap:8px;margin-top:10px">
          <button class="btn sm" data-sos-res="${myAlert.id}" type="button" style="background:#10b981">✓ I Am Safe / Resolve Alert</button>
          <button class="btn ghost sm" data-sos-cancel="${myAlert.id}" type="button" style="color:#ef4444;border-color:#ef4444">Cancel Alarm</button>
        </div>
      </div>
    `;
  }

  return `
    <div style="max-width:540px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 style="margin:0;display:flex;align-items:center;gap:8px">
          <span>🚨</span> Campus Emergency SOS &amp; Safety
        </h2>
        <span class="gp-live-tag" style="color:#ef4444;background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3)">24/7 Hotline</span>
      </div>
      <p class="sub" style="margin-top:-4px">One-tap distress dispatch to Campus Security Control Room, Chief Warden, and Institute Medical Unit.</p>

      ${activeHtml}

      ${!myAlert ? `
        <div class="sos-banner-card">
          <b style="font-size:14px;display:block;margin-bottom:6px">⚡ Instant Campus Emergency Trigger</b>
          <p class="sub" style="margin:0 0 12px;font-size:12px">If you feel unsafe, injured, or witness a serious hazard, select your location and press the broadcast button below.</p>

          <div class="frm" style="gap:10px">
            <div>
              <label for="sosLoc" style="font-size:12px;font-weight:700">Your Current Location</label>
              <select id="sosLoc" style="padding:9px">
                <option value="Hostel Block A (Boys)">Hostel Block A (Boys)</option>
                <option value="Hostel Block B (Boys)">Hostel Block B (Boys)</option>
                <option value="Hostel Block C (Girls)">Hostel Block C (Girls)</option>
                <option value="Central Library &amp; Reading Rooms">Central Library &amp; Reading Rooms</option>
                <option value="Academic Block / Classrooms">Academic Block / Classrooms</option>
                <option value="Innovation &amp; Computing Center">Innovation &amp; Computing Center</option>
                <option value="Main Cafeteria &amp; Student Canteen">Main Cafeteria &amp; Student Canteen</option>
                <option value="Campus Sports Complex &amp; Grounds">Campus Sports Complex &amp; Grounds</option>
                <option value="Institute Main Gate (Gate 1)">Institute Main Gate (Gate 1)</option>
                <option value="Other / Remote Campus Corner">Other / Remote Campus Corner</option>
              </select>
            </div>

            <div>
              <label for="sosType" style="font-size:12px;font-weight:700">Emergency Type</label>
              <select id="sosType" style="padding:9px">
                <option value="🚑 Medical Emergency (Injury / Severe Illness)">🚑 Medical Emergency (Injury / Severe Illness)</option>
                <option value="🛡️ Security Threat / Stalking / Harassment">🛡️ Security Threat / Stalking / Harassment</option>
                <option value="🛑 Anti-Ragging Distress">🛑 Anti-Ragging Distress</option>
                <option value="🔥 Fire / Electrical Hazard">🔥 Fire / Electrical Hazard</option>
                <option value="⚠️ Urgent Assistance / Trapped">⚠️ Urgent Assistance / Trapped</option>
              </select>
            </div>

            <div>
              <label for="sosNote" style="font-size:12px;font-weight:700">Specific Landmark or Note (Optional)</label>
              <input type="text" id="sosNote" placeholder="e.g. 2nd floor staircase, near room 214" style="padding:9px">
            </div>

            <button class="sos-trigger-btn" id="sosSubmitBtn" type="button" style="margin-top:4px">
              🚨 BROADCAST DISTRESS SIGNAL
            </button>
          </div>
        </div>
      ` : ''}

      <h3 style="margin:20px 0 10px;font-size:15px;display:flex;align-items:center;gap:6px">
        <span>📞</span> Emergency Helplines (Direct 24/7 Lines)
      </h3>
      <div class="sos-helplines-grid">
        <div class="sos-helpline-tile">
          <div class="sos-tile-icon">🚑</div>
          <div class="sos-tile-name">Campus Ambulance &amp; Clinic</div>
          <div class="sos-tile-desc">Health Center · 24/7 Doctor on call</div>
          <a class="sos-call-btn" href="tel:+916742386001">📞 +91 674 238 6001</a>
        </div>
        <div class="sos-helpline-tile">
          <div class="sos-tile-icon">🛡️</div>
          <div class="sos-tile-name">Security Control Room</div>
          <div class="sos-tile-desc">Main Gate · Quick Response Team</div>
          <a class="sos-call-btn" href="tel:+916742386000">📞 +91 674 238 6000</a>
        </div>
        <div class="sos-helpline-tile">
          <div class="sos-tile-icon">🏢</div>
          <div class="sos-tile-name">Chief Hostel Warden</div>
          <div class="sos-tile-desc">Hostel Administration &amp; Passes</div>
          <a class="sos-call-btn" href="tel:+916742386010">📞 +91 674 238 6010</a>
        </div>
        <div class="sos-helpline-tile">
          <div class="sos-tile-icon">🛑</div>
          <div class="sos-tile-name">Anti-Ragging Squad</div>
          <div class="sos-tile-desc">National Toll-Free &amp; Confidential</div>
          <a class="sos-call-btn" href="tel:18001805522">📞 1800-180-5522</a>
        </div>
        <div class="sos-helpline-tile">
          <div class="sos-tile-icon">🌸</div>
          <div class="sos-tile-name">Women's Safety &amp; ICC Cell</div>
          <div class="sos-tile-desc">Internal Complaints Committee</div>
          <a class="sos-call-btn" href="tel:+916742386015">📞 +91 674 238 6015</a>
        </div>
        <div class="sos-helpline-tile">
          <div class="sos-tile-icon">🚒</div>
          <div class="sos-tile-name">National Emergency Support</div>
          <div class="sos-tile-desc">Police, Fire &amp; Disaster Response</div>
          <a class="sos-call-btn" href="tel:112">📞 112</a>
        </div>
      </div>

      <div style="margin-top:18px;background:rgba(128,128,128,0.05);border-radius:12px;padding:14px;border:1px solid var(--border)">
        <b style="font-size:13px;display:flex;align-items:center;gap:6px;margin-bottom:8px">🩺 Quick Emergency Protocols</b>
        <div style="font-size:12px;color:var(--muted);display:grid;gap:6px;line-height:1.4">
          <div>• <b>Fainting / Heat Exhaustion:</b> Move person to shaded cool area, elevate feet 12 inches, loosen collar, give sips of ORS or water.</div>
          <div>• <b>Severe Bleeding:</b> Press firmly on wound with clean cloth, do NOT remove pressure, elevate above heart level.</div>
          <div>• <b>Fire Incident:</b> Pull manual alarm, do NOT use elevators, evacuate along green floor arrows to the Main Ground assembly area.</div>
        </div>
      </div>

      <div style="text-align:center;margin-top:16px">
        <button class="btn sm ghost" data-close type="button">Close</button>
      </div>
    </div>
  `;
}

function submitSosAlert() {
  const loc = $('sosLoc') ? $('sosLoc').value : 'Campus Grounds';
  const type = $('sosType') ? $('sosType').value : 'Urgent Assistance';
  const note = $('sosNote') ? $('sosNote').value.trim() : '';
  const alerts = getSosAlerts();

  const newAlert = {
    id: 'SOS-' + Date.now(),
    user: userName() || displayName(),
    role: getRole(),
    location: loc,
    type: type,
    note: note,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: todayIso(),
    status: 'ACTIVE'
  };

  alerts.unshift(newAlert);
  saveSosAlerts(alerts);
  showToast('🚨 SOS Broadcast Sent! Security Control Dispatched.');
  openSheet('sos');
}

function resolveSosAlert(id) {
  const alerts = getSosAlerts();
  const alert = alerts.find(a => a.id === id);
  if (alert) {
    alert.status = 'RESOLVED';
    alert.resolvedAt = new Date().toLocaleTimeString();
    saveSosAlerts(alerts);
    showToast('✓ Alert marked as resolved. Glad you are safe!');
  }
  openSheet('sos');
}

function cancelSosAlert(id) {
  let alerts = getSosAlerts();
  alerts = alerts.filter(a => a.id !== id);
  saveSosAlerts(alerts);
  showToast('SOS alarm cancelled.');
  openSheet('sos');
}

/* =============================================================================
   FEATURE C: CAMPUS EVENTS & FEST REGISTRATION
   ============================================================================= */
const DEFAULT_EVENTS = [
  {
    id: 'ev-1',
    title: "HackCamp '26 - 36hr Flagship Hackathon",
    category: "Technical",
    date: "14 - 15 Nov 2026",
    time: "09:00 AM onwards",
    venue: "APJ Abdul Kalam Innovation Hub",
    prize: "₹1,50,000 Prize Pool",
    cap: 200,
    regCount: 142,
    desc: "36-hour annual flagship hackathon. Build high-impact solutions across Generative AI, Web3, Smart Campus, and CleanTech. Free food, developer swags, API credits, and top industry mentorship.",
    tags: ["AI/ML", "Web3", "Hackathon", "Open Innovation"],
    organizer: "Google Developer Group & CampBit Tech Club",
    gradient: "linear-gradient(135deg, #4f46e5, #7c3aed)"
  },
  {
    id: 'ev-2',
    title: "Technovanza '26 - Robowar & Drone Racing",
    category: "Robotics",
    date: "20 Nov 2026",
    time: "10:30 AM",
    venue: "Central Amphitheatre & Arena",
    prize: "₹75,000 Prize Pool",
    cap: 80,
    regCount: 65,
    desc: "High-octane metal combat in 15kg/30kg battle arenas, precision obstacle drone racing, and autonomous line-follower robotics challenge.",
    tags: ["Robotics", "Hardware", "Combat Bots", "Drones"],
    organizer: "Robotics & Automation Society",
    gradient: "linear-gradient(135deg, #ea580c, #f59e0b)"
  },
  {
    id: 'ev-3',
    title: "Rhythm & Beats - Annual Cultural Mega-Fest",
    category: "Cultural",
    date: "05 - 07 Dec 2026",
    time: "05:00 PM onwards",
    venue: "Institute Main Stadium",
    prize: "Trophies & Vouchers",
    cap: 1500,
    regCount: 1120,
    desc: "3 days of electrifying star night concerts, inter-college choreography battles, battle of rock bands, theatrical drama, fashion walk, and night street food stalls.",
    tags: ["Music", "Dance", "Celebrity Night", "Fashion"],
    organizer: "Cultural Student Council",
    gradient: "linear-gradient(135deg, #db2777, #9333ea)"
  },
  {
    id: 'ev-4',
    title: "CodeSprint '26 - Speed Algorithmic Contest",
    category: "Coding",
    date: "28 Oct 2026",
    time: "04:00 PM - 07:00 PM",
    venue: "Computer Center Labs 1 & 2",
    prize: "₹25,000 + Tech Vouchers",
    cap: 120,
    regCount: 88,
    desc: "3 hours, 6 challenging DSA algorithmic problems. Fast-paced competitive programming contest. Top coders receive direct placement interview referrals.",
    tags: ["DSA", "Competitive Programming", "Algorithms"],
    organizer: "Competitive Coding Chapter",
    gradient: "linear-gradient(135deg, #0284c7, #0d9488)"
  },
  {
    id: 'ev-5',
    title: "Campus Cricket Premier League (CCPL '26)",
    category: "Sports",
    date: "25 Nov - 01 Dec 2026",
    time: "08:00 AM onwards",
    venue: "Campus Sports Complex",
    prize: "₹40,000 + Championship Cup",
    cap: 16,
    regCount: 14,
    desc: "Inter-department 10-over tennis ball cricket tournament. Intense league matches leading up to the floodlit grand finale under campus stadium lights.",
    tags: ["Sports", "Cricket", "Inter-Branch"],
    organizer: "Department of Physical Education",
    gradient: "linear-gradient(135deg, #16a34a, #059669)"
  },
  {
    id: 'ev-6',
    title: "Generative AI & Agentic Systems Workshop",
    category: "Workshop",
    date: "08 Nov 2026",
    time: "02:00 PM - 05:30 PM",
    venue: "Seminar Hall 2, Tech Block",
    prize: "Certificate + API Credits",
    cap: 100,
    regCount: 76,
    desc: "Practical hands-on workshop covering fine-tuning open source LLMs, building autonomous coding agents, and vector databases with industry engineers.",
    tags: ["Workshop", "GenAI", "LLMs", "Hands-on"],
    organizer: "AI & Machine Learning Club",
    gradient: "linear-gradient(135deg, #2563eb, #6366f1)"
  }
];

let eventsFilter = 'All';
let eventsSearchQuery = '';

function loadEvents() {
  const saved = loadJson('cc_events', null);
  if (saved && Array.isArray(saved) && saved.length > 0) return saved;
  saveJson('cc_events', DEFAULT_EVENTS);
  return DEFAULT_EVENTS;
}

function saveEvents(evList) {
  saveJson('cc_events', evList);
}

function getEventRegistrations() {
  return loadJson('cc_ev_reg', {});
}

function saveEventRegistrations(regs) {
  saveJson('cc_ev_reg', regs);
}

function setEventFilter(cat) {
  eventsFilter = cat;
  if ($('pg-events')) $('pg-events').innerHTML = renderEvents();
}

function toggleEventRegistration(id) {
  const events = loadEvents();
  const ev = events.find(x => x.id === id);
  if (!ev) return;
  const regs = getEventRegistrations();
  const userKey = (userName() || 'student') + '_' + id;

  if (regs[userKey]) {
    delete regs[userKey];
    ev.regCount = Math.max(0, (ev.regCount || 1) - 1);
    saveEventRegistrations(regs);
    saveEvents(events);
    showToast('Registration cancelled for ' + ev.title);
  } else {
    if (ev.regCount >= ev.cap) {
      showToast('⚠️ Event capacity reached (Full)');
      return;
    }
    regs[userKey] = {
      id: id,
      passId: 'PASS-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      time: Date.now(),
      name: displayName(),
      roll: (myStudent() && myStudent().roll) || userName().toUpperCase()
    };
    ev.regCount = (ev.regCount || 0) + 1;
    saveEventRegistrations(regs);
    saveEvents(events);
    showToast('🎉 Registered for ' + ev.title + '! Pass generated.');
  }

  if ($('pg-events')) $('pg-events').innerHTML = renderEvents();
}

function renderEvents() {
  const events = loadEvents();
  const regs = getEventRegistrations();
  const categories = ['All', 'Technical', 'Robotics', 'Cultural', 'Coding', 'Sports', 'Workshop'];
  const user = userName() || 'student';

  const registeredCount = Object.keys(regs).filter(k => k.startsWith(user + '_')).length;

  return `
    <div class="ev-page">
      <div class="ev-hero-banner">
        <div class="ev-hero-info">
          <h2>🎪 Campus Events &amp; Technical Fests</h2>
          <p>Explore upcoming hackathons, cultural festivals, robotics battles, and guest workshops. Register in 1-click and get your digital entry pass.</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="background:var(--card-bg,#fff);border:1px solid var(--border);border-radius:10px;padding:8px 14px;font-size:12px;font-weight:700">
            🎟️ My Passes: <span style="color:var(--accent,#4f46e5)">${registeredCount} Active</span>
          </div>
          ${isStaffOrAdmin() ? `<button class="btn sm" data-sheet="evpost" type="button">➕ Post New Event</button>` : ''}
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px">
        <div class="ev-filters">
          ${categories.map(c => `
            <button class="btn sm ${eventsFilter === c ? '' : 'ghost'}" data-ev-f="${c}" type="button" style="border-radius:20px;font-size:12px;padding:6px 14px">
              ${c}
            </button>
          `).join('')}
        </div>
        <div style="min-width:240px;flex:1;max-width:340px">
          <input type="search" class="sinp" id="evSearchInput" placeholder="🔍 Search events, clubs, tags..." value="${escapeHtml(eventsSearchQuery)}" style="width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card-bg,#fff);font-size:13px">
        </div>
      </div>

      <div class="ev-grid" id="eventsGrid">
        ${renderEventCards()}
      </div>
    </div>
  `;
}

function renderEventCards() {
  const events = loadEvents();
  const regs = getEventRegistrations();
  const user = userName() || 'student';

  const filtered = events.filter(e => {
    if (eventsFilter !== 'All' && e.category !== eventsFilter) return false;
    if (eventsSearchQuery) {
      const q = eventsSearchQuery.toLowerCase();
      const match = e.title.toLowerCase().includes(q) ||
        e.desc.toLowerCase().includes(q) ||
        e.venue.toLowerCase().includes(q) ||
        (e.tags && e.tags.some(t => t.toLowerCase().includes(q)));
      if (!match) return false;
    }
    return true;
  });

  if (!filtered.length) {
    return `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;background:rgba(128,128,128,0.04);border-radius:14px">
      <div style="font-size:36px;margin-bottom:8px">🔍</div>
      <b>No events found matching your filter</b>
      <p class="sub" style="margin:4px 0 0;font-size:13px">Try clearing the search query or selecting "All" category.</p>
    </div>`;
  }

  return filtered.map(e => {
    const isReg = !!regs[user + '_' + e.id];
    const pct = Math.min(100, Math.round(((e.regCount || 0) / (e.cap || 100)) * 100));
    const isFull = (e.regCount || 0) >= (e.cap || 100) && !isReg;

    return `
      <div class="ev-card">
        <div class="ev-card-cover" style="background:${e.gradient || 'linear-gradient(135deg, #4f46e5, #7c3aed)'}">
          <span class="ev-cat-pill">${escapeHtml(e.category)}</span>
          <span style="font-size:12px;font-weight:700;background:rgba(0,0,0,0.3);backdrop-filter:blur(4px);padding:3px 8px;border-radius:6px">
            🏆 ${escapeHtml(e.prize)}
          </span>
        </div>
        <div class="ev-card-body">
          <h3 class="ev-title">${escapeHtml(e.title)}</h3>
          <p class="ev-desc">${escapeHtml(e.desc)}</p>

          <div class="ev-meta-line">
            <span>📅</span> <b>${escapeHtml(e.date)}</b> · ${escapeHtml(e.time)}
          </div>
          <div class="ev-meta-line">
            <span>📍</span> <span>${escapeHtml(e.venue)}</span>
          </div>
          <div class="ev-meta-line">
            <span>👥</span> <span>Organized by <b>${escapeHtml(e.organizer || 'Student Club')}</b></span>
          </div>

          <div style="display:flex;gap:5px;flex-wrap:wrap;margin:10px 0 4px">
            ${(e.tags || []).map(t => `<span class="badge" style="font-size:10.5px;padding:2px 7px;background:rgba(128,128,128,0.08);border:1px solid var(--border)">#${escapeHtml(t)}</span>`).join('')}
          </div>

          <div class="ev-capacity-bar">
            <div class="ev-capacity-label">
              <span>Capacity: ${e.regCount || 0} / ${e.cap}</span>
              <span>${pct}% filled ${isFull ? '· <b style="color:#ef4444">FULL</b>' : ''}</span>
            </div>
            <div class="ev-meter">
              <div class="ev-meter-fill" style="width:${pct}%;background:${pct > 90 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #10b981, #06b6d4)'}"></div>
            </div>
          </div>

          <div class="ev-card-foot">
            <div style="display:flex;gap:6px">
              ${isReg ? `
                <button class="btn sm" data-ev-pass="${e.id}" type="button" style="background:#059669">🎟️ View Pass</button>
                <button class="btn ghost sm" data-ev-reg="${e.id}" type="button" style="font-size:11px" title="Cancel registration">Withdraw</button>
              ` : `
                <button class="btn sm" data-ev-reg="${e.id}" type="button" ${isFull ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
                  ${isFull ? 'Event Full' : 'Register (Free)'}
                </button>
              `}
            </div>
            ${isStaffOrAdmin() ? `
              <button class="btn ghost sm" data-ev-del="${e.id}" type="button" style="color:#ef4444;border-color:transparent;font-size:12px" title="Delete event">🗑️</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderEventTicketSheet(id) {
  const events = loadEvents();
  const ev = events.find(x => x.id === id);
  if (!ev) return `<div class="sub">Event not found.</div>`;
  const regs = getEventRegistrations();
  const user = userName() || 'student';
  const reg = regs[user + '_' + id] || {
    passId: 'PASS-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: displayName(),
    roll: (myStudent() && myStudent().roll) || userName().toUpperCase()
  };

  const seatNo = 'ZONE-A / ' + (Math.abs(strHash(reg.passId)) % 120 + 1);

  return `
    <div class="gp-card" style="border-radius:20px;border:2px dashed rgba(99,102,241,0.3)">
      <div class="gp-top-strip" style="background:${ev.gradient || 'linear-gradient(135deg, #4f46e5, #7c3aed)'}">
        <div class="gp-brand-title">🎟️ Official Event Entry Pass</div>
        <div class="gp-pass-id">${reg.passId}</div>
      </div>
      <div class="gp-body">
        <div class="gp-status-row">
          <span class="gp-live-tag" style="color:#4f46e5;background:rgba(99,102,241,0.12);border-color:rgba(99,102,241,0.3)">
            ✓ Confirmed Attendee
          </span>
          <div class="gp-countdown">Seat: <b>${seatNo}</b></div>
        </div>

        <h3 style="margin:0 0 4px;font-size:18px">${escapeHtml(ev.title)}</h3>
        <p class="sub" style="margin:0 0 16px;font-size:13px">${escapeHtml(ev.category)} · Organized by ${escapeHtml(ev.organizer || 'CampBit')}</p>

        <div class="gp-student-info">
          <div class="avatar big" style="width:46px;height:46px">${avatarInner(myPhotoValue(myStudent()), reg.name)}</div>
          <div class="gp-student-text">
            <h4 style="margin:0;font-size:15px">${escapeHtml(reg.name)}</h4>
            <p>Attendee ID: <b>${escapeHtml(reg.roll)}</b></p>
            <p>Status: Verified Registration</p>
          </div>
        </div>

        <div class="gp-details-grid">
          <div class="gp-detail-cell">
            <div class="gp-detail-label">Event Date</div>
            <div class="gp-detail-val">📅 ${escapeHtml(ev.date)}</div>
          </div>
          <div class="gp-detail-cell">
            <div class="gp-detail-label">Reporting Time</div>
            <div class="gp-detail-val">⏰ ${escapeHtml(ev.time)}</div>
          </div>
          <div class="gp-detail-cell" style="grid-column:1/-1">
            <div class="gp-detail-label">Venue Location</div>
            <div class="gp-detail-val">📍 ${escapeHtml(ev.venue)}</div>
          </div>
        </div>

        <div class="gp-qr-section">
          ${makeQrSvg('CAMPBIT://EVENT/' + reg.passId + '/' + ev.id)}
          <div class="gp-qr-hint">Scan at event venue entrance for rapid badge dispensing</div>
        </div>

        <div style="background:rgba(128,128,128,0.05);padding:10px 14px;border-radius:10px;font-size:11.5px;color:var(--muted);line-height:1.45;margin-bottom:16px">
          <b>Instructions:</b> Please show this digital pass along with your Institute Identity Card at the entrance. Entry closes 15 minutes before event commencement.
        </div>

        <div class="gp-actions">
          <button class="btn sm" data-print type="button">🖨️ Print Ticket</button>
          <button class="btn ghost sm" data-close type="button">Done</button>
        </div>
      </div>
    </div>
  `;
}

function renderPostEventSheet() {
  return `
    <div style="max-width:500px;margin:0 auto">
      <h2 style="margin:0 0 6px">➕ Post Campus Event or Fest</h2>
      <p class="sub" style="margin:0 0 16px">Publish a new event to the campus calendar with automatic student registrations and digital ticketing.</p>

      <div class="frm" style="gap:10px">
        <div>
          <label for="newEvTitle" style="font-size:12px;font-weight:700">Event Title</label>
          <input type="text" id="newEvTitle" placeholder="e.g. AI-Pulse '26 Hackathon">
        </div>

        <div class="two">
          <div>
            <label for="newEvCat" style="font-size:12px;font-weight:700">Category</label>
            <select id="newEvCat">
              <option>Technical</option>
              <option>Robotics</option>
              <option>Cultural</option>
              <option>Coding</option>
              <option>Sports</option>
              <option>Workshop</option>
            </select>
          </div>
          <div>
            <label for="newEvCap" style="font-size:12px;font-weight:700">Max Capacity</label>
            <input type="number" id="newEvCap" value="150" min="10" max="2000">
          </div>
        </div>

        <div class="two">
          <div>
            <label for="newEvDate" style="font-size:12px;font-weight:700">Event Date</label>
            <input type="text" id="newEvDate" placeholder="e.g. 18 Nov 2026">
          </div>
          <div>
            <label for="newEvTime" style="font-size:12px;font-weight:700">Timing</label>
            <input type="text" id="newEvTime" placeholder="e.g. 10:00 AM">
          </div>
        </div>

        <div>
          <label for="newEvVenue" style="font-size:12px;font-weight:700">Venue</label>
          <input type="text" id="newEvVenue" placeholder="e.g. Main Auditorium / Lab 3">
        </div>

        <div>
          <label for="newEvPrize" style="font-size:12px;font-weight:700">Prize Pool / Perks</label>
          <input type="text" id="newEvPrize" placeholder="e.g. ₹50,000 + Certificates">
        </div>

        <div>
          <label for="newEvTags" style="font-size:12px;font-weight:700">Tags (comma separated)</label>
          <input type="text" id="newEvTags" placeholder="e.g. Hackathon, AI, Hardware">
        </div>

        <div>
          <label for="newEvDesc" style="font-size:12px;font-weight:700">Event Description</label>
          <textarea id="newEvDesc" placeholder="Describe eligibility, guidelines, and schedule"></textarea>
        </div>

        <div class="err" id="newEvErr" role="alert"></div>

        <div class="btns" style="margin-top:6px">
          <button class="btn" id="evPostSubmit" type="button" style="flex:1">Publish Event</button>
          <button class="btn ghost" data-close type="button">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function submitNewEvent() {
  const title = $('newEvTitle') ? $('newEvTitle').value.trim() : '';
  const cat = $('newEvCat') ? $('newEvCat').value : 'Technical';
  const cap = $('newEvCap') ? parseInt($('newEvCap').value, 10) || 100 : 100;
  const date = $('newEvDate') ? $('newEvDate').value.trim() : 'TBA';
  const time = $('newEvTime') ? $('newEvTime').value.trim() : '10:00 AM';
  const venue = $('newEvVenue') ? $('newEvVenue').value.trim() : 'Campus Auditorium';
  const prize = $('newEvPrize') ? $('newEvPrize').value.trim() : 'Certificates & Swags';
  const rawTags = $('newEvTags') ? $('newEvTags').value.trim() : '';
  const desc = $('newEvDesc') ? $('newEvDesc').value.trim() : '';
  const errBox = $('newEvErr');

  if (title.length < 3) {
    if (errBox) errBox.textContent = 'Please enter an event title (at least 3 characters).';
    return;
  }
  if (!desc) {
    if (errBox) errBox.textContent = 'Please provide a brief event description.';
    return;
  }

  const tags = rawTags ? rawTags.split(',').map(s => s.trim()).filter(Boolean) : [cat];
  const events = loadEvents();

  const gradients = [
    'linear-gradient(135deg, #4f46e5, #7c3aed)',
    'linear-gradient(135deg, #ea580c, #f59e0b)',
    'linear-gradient(135deg, #db2777, #9333ea)',
    'linear-gradient(135deg, #0284c7, #0d9488)',
    'linear-gradient(135deg, #16a34a, #059669)',
    'linear-gradient(135deg, #2563eb, #6366f1)'
  ];

  const newEv = {
    id: 'ev-' + Date.now(),
    title: title,
    category: cat,
    date: date,
    time: time,
    venue: venue,
    prize: prize,
    cap: cap,
    regCount: 0,
    desc: desc,
    tags: tags,
    organizer: displayName() || 'Campus Faculty / Student Chapter',
    gradient: gradients[Math.floor(Math.random() * gradients.length)]
  };

  events.unshift(newEv);
  saveEvents(events);
  closeSheet();
  showToast('🎉 Event "' + title + '" published successfully!');
  if ($('pg-events')) $('pg-events').innerHTML = renderEvents();
}

function deleteEvent(id) {
  if (!confirm('Are you sure you want to delete this event?')) return;
  let events = loadEvents();
  events = events.filter(e => e.id !== id);
  saveEvents(events);
  showToast('Event removed.');
  if ($('pg-events')) $('pg-events').innerHTML = renderEvents();
}

// Open the bottom sheet router
function openSheet(kind) {
  if (kind === 'about') {
    $('sbody').innerHTML = renderAbout();
  } else if (kind === 'issue') {
    $('sbody').innerHTML = renderIssueForm();
  } else if (kind === 'sos') {
    $('sbody').innerHTML = renderEmergencySheet();
  } else if (kind && kind.startsWith('gp:')) {
    $('sbody').innerHTML = renderGatePassSheet(kind.slice(3));
  } else if (kind && kind.startsWith('evpass:')) {
    $('sbody').innerHTML = renderEventTicketSheet(kind.slice(7));
  } else if (kind === 'evpost') {
    $('sbody').innerHTML = renderPostEventSheet();
  } else if (kind && kind.startsWith('cls_log:')) {
    $('sbody').innerHTML = renderSubjectLectureSheet(kind.slice(8));
  } else if (kind && kind.startsWith('cls_add:')) {
    $('sbody').innerHTML = renderAddExtraClassSheet(kind.slice(8));
  } else {
    $('sbody').innerHTML = renderComplaintBox();
  }
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
try { attendanceQueue = JSON.parse(localStorage.getItem('cc_atq')) || []; } catch (e) { }

const saveQueue = () => { try { localStorage.setItem('cc_atq', JSON.stringify(attendanceQueue)); } catch (e) { } };
const isOffline = () => offlineDemo || (typeof navigator !== 'undefined' && navigator.onLine === false);

// When online, flush IndexedDB and mark queued sessions as synced
async function syncQueue() {
  if (!isOffline()) {
    attendanceQueue.forEach(item => { item.s = true; });
    saveQueue();
    if (typeof API !== 'undefined' && API.flushAttendanceQueue) {
      try {
        const res = await API.flushAttendanceQueue();
        if (res && res.synced > 0) {
          markMessage = `⚡ Synced ${res.synced} offline attendance batch(es) with central server!`;
          render();
        }
      } catch (e) { }
    }
  }
  saveQueue();
}

// Save today's session with idempotent client_uuid, IndexedDB queue & server sync
async function saveSession() {
  const date = todayIso();
  const id = date + '|' + selectedClass;
  const client_uuid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('att-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const record = {
    id,
    client_uuid,
    cls: CLASS_SESSIONS[selectedClass],
    date,
    m: JSON.parse(JSON.stringify(marks)),
    n: studentPairs().length,
    p: studentPairs().filter(s => marks[s[0]] !== false).length,
    s: false
  };
  const existing = attendanceQueue.findIndex(item => item.id === id);
  if (existing >= 0) {
    record.client_uuid = attendanceQueue[existing].client_uuid || client_uuid;
    attendanceQueue[existing] = record;
  } else {
    attendanceQueue.unshift(record);
  }
  saveQueue();

  const teacherDept = accountDept() || 'CSE';
  const batch = {
    client_uuid: record.client_uuid,
    session_id: 'sess-' + date + '-' + (CLASS_SESSIONS[selectedClass] || 'Class').replace(/[^a-zA-Z0-9]/g, '_'),
    class_name: CLASS_SESSIONS[selectedClass] || 'Class',
    dept: teacherDept,
    year: '3',
    subject: (CLASS_SESSIONS[selectedClass] || 'Subject').split('·')[0].trim(),
    date: date,
    records: studentPairs().map(s => ({
      student_id: s[0],
      student_name: s[1],
      status: marks[s[0]] === false ? 'absent' : 'present'
    }))
  };

  if (typeof API !== 'undefined' && API.syncAttendance) {
    if (isOffline()) {
      if (API.queueAttendance) await API.queueAttendance(batch);
      markMessage = '💾 Airplane / Offline mode: Attendance session stored in IndexedDB. Will sync when back online.';
    } else {
      try {
        const res = await API.syncAttendance(batch);
        record.s = true;
        saveQueue();
        markMessage = '✅ Synced to central attendance database (' + (res.records_processed || batch.records.length) + ' students recorded).';
      } catch (e) {
        record.s = false;
        markMessage = '💾 Saved offline in IndexedDB: ' + (e.message || 'Queued for sync.');
      }
    }
  } else {
    syncQueue();
    markMessage = isOffline()
      ? '💾 Saved on this device. It will sync when you are back online.'
      : '✅ Saved and synced.';
  }

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

// Staff/Faculty attendance page
function renderTeacherAttendance() {
  return renderMarkAttendance();
}


/* =============================================================================
   12c. HOD DEPARTMENT CLASSES CONDUCTION TRACKER
   -----------------------------------------------------------------------------
   Allows HOD (and Principal) to track the total number of classes held per
   subject, broken down by year (1st to 4th) and section (A, B, C). Includes
   syllabus completion %, student attendance %, faculty, lecture log history,
   and ability to record classes.
   ============================================================================= */

const DEFAULT_DEPT_CLASSES = [
  // Year 1
  {
    id: 'cls-101', code: 'MA101', name: 'Engineering Mathematics-I', year: 1, sem: 1, sec: 'A',
    faculty: 'Dr. B. K. Mohapatra', room: 'LH-101', planned: 48, held: 42, syllabusPct: 87, avgAtt: 86.4,
    lastDate: '08 Oct 2026', lastTopic: 'Eigenvalues, Eigenvectors & Cayley-Hamilton Theorem',
    log: [
      { date: '08 Oct 2026', time: '09:00 - 10:00 AM', topic: 'Eigenvalues, Eigenvectors & Cayley-Hamilton Theorem', att: '58/64 (90.6%)', type: 'Lecture #42' },
      { date: '06 Oct 2026', time: '09:00 - 10:00 AM', topic: 'Matrix Diagonalization & Quadratic Forms', att: '56/64 (87.5%)', type: 'Lecture #41' },
      { date: '04 Oct 2026', time: '09:00 - 10:00 AM', topic: 'System of Linear Equations (Gauss-Jordan)', att: '59/64 (92.2%)', type: 'Lecture #40' }
    ]
  },
  {
    id: 'cls-102', code: 'CS101', name: 'Programming in C & Problem Solving', year: 1, sem: 1, sec: 'A',
    faculty: 'Prof. Ananya Sen', room: 'CS-Lab 1', planned: 45, held: 40, syllabusPct: 88, avgAtt: 88.0,
    lastDate: '08 Oct 2026', lastTopic: 'Pointers & Dynamic Memory Allocation (malloc, free)',
    log: [
      { date: '08 Oct 2026', time: '11:15 - 12:15 PM', topic: 'Pointers & Dynamic Memory Allocation (malloc, free)', att: '60/64 (93.7%)', type: 'Lecture #40' },
      { date: '07 Oct 2026', time: '11:15 - 12:15 PM', topic: 'String Handling Functions & Pointer Arithmetic', att: '57/64 (89.0%)', type: 'Lecture #39' }
    ]
  },
  {
    id: 'cls-103', code: 'EE101', name: 'Basic Electrical Engineering', year: 1, sem: 1, sec: 'A',
    faculty: 'Dr. S. K. Rout', room: 'LH-103', planned: 42, held: 36, syllabusPct: 85, avgAtt: 81.2,
    lastDate: '07 Oct 2026', lastTopic: 'Three-Phase AC Circuits & Power Measurement',
    log: [
      { date: '07 Oct 2026', time: '02:00 - 03:00 PM', topic: 'Three-Phase AC Circuits & Power Measurement', att: '52/64 (81.2%)', type: 'Lecture #36' }
    ]
  },
  {
    id: 'cls-104', code: 'MA101', name: 'Engineering Mathematics-I', year: 1, sem: 1, sec: 'B',
    faculty: 'Dr. B. K. Mohapatra', room: 'LH-102', planned: 48, held: 41, syllabusPct: 85, avgAtt: 83.5,
    lastDate: '08 Oct 2026', lastTopic: 'Cayley-Hamilton Theorem & Matrix Inverse',
    log: [
      { date: '08 Oct 2026', time: '10:00 - 11:00 AM', topic: 'Cayley-Hamilton Theorem & Matrix Inverse', att: '54/62 (87.1%)', type: 'Lecture #41' }
    ]
  },
  {
    id: 'cls-105', code: 'CS101', name: 'Programming in C & Problem Solving', year: 1, sem: 1, sec: 'B',
    faculty: 'Prof. Ananya Sen', room: 'CS-Lab 2', planned: 45, held: 39, syllabusPct: 86, avgAtt: 85.0,
    lastDate: '07 Oct 2026', lastTopic: '2D Arrays and Matrix Multiplication Algorithms',
    log: [
      { date: '07 Oct 2026', time: '10:00 - 11:00 AM', topic: '2D Arrays and Matrix Multiplication Algorithms', att: '53/62 (85.5%)', type: 'Lecture #39' }
    ]
  },
  {
    id: 'cls-106', code: 'PH101', name: 'Engineering Physics', year: 1, sem: 1, sec: 'B',
    faculty: 'Dr. R. K. Sahoo', room: 'LH-104', planned: 44, held: 37, syllabusPct: 84, avgAtt: 80.6,
    lastDate: '06 Oct 2026', lastTopic: 'Wave Optics: Thin Film Interference & Newton Rings',
    log: [
      { date: '06 Oct 2026', time: '02:00 - 03:00 PM', topic: 'Wave Optics: Thin Film Interference & Newton Rings', att: '50/62 (80.6%)', type: 'Lecture #37' }
    ]
  },
  {
    id: 'cls-107', code: 'MA101', name: 'Engineering Mathematics-I', year: 1, sem: 1, sec: 'C',
    faculty: 'Prof. T. Mishra', room: 'LH-105', planned: 48, held: 40, syllabusPct: 83, avgAtt: 82.0,
    lastDate: '07 Oct 2026', lastTopic: 'Rank of Matrix & Consistency of Equations',
    log: [
      { date: '07 Oct 2026', time: '09:00 - 10:00 AM', topic: 'Rank of Matrix & Consistency of Equations', att: '48/60 (80.0%)', type: 'Lecture #40' }
    ]
  },
  {
    id: 'cls-108', code: 'CS101', name: 'Programming in C & Problem Solving', year: 1, sem: 1, sec: 'C',
    faculty: 'Prof. M. K. Jena', room: 'CS-Lab 3', planned: 45, held: 38, syllabusPct: 84, avgAtt: 84.1,
    lastDate: '08 Oct 2026', lastTopic: 'Recursion: Tower of Hanoi & Fibonacci Analysis',
    log: [
      { date: '08 Oct 2026', time: '01:15 - 02:15 PM', topic: 'Recursion: Tower of Hanoi & Fibonacci Analysis', att: '51/60 (85.0%)', type: 'Lecture #38' }
    ]
  },

  // Year 2
  {
    id: 'cls-201', code: 'CS301', name: 'Data Structures & Algorithms', year: 2, sem: 3, sec: 'A',
    faculty: 'Prof. Sneha Rath', room: 'LH-201', planned: 46, held: 41, syllabusPct: 89, avgAtt: 89.2,
    lastDate: '08 Oct 2026', lastTopic: 'Red-Black Trees & B-Tree Node Splitting',
    log: [
      { date: '08 Oct 2026', time: '10:00 - 11:00 AM', topic: 'Red-Black Trees & B-Tree Node Splitting', att: '58/65 (89.2%)', type: 'Lecture #41' },
      { date: '06 Oct 2026', time: '10:00 - 11:00 AM', topic: 'AVL Tree Rotations & Deletion Cases', att: '59/65 (90.7%)', type: 'Lecture #40' }
    ]
  },
  {
    id: 'cls-202', code: 'CS302', name: 'Computer Organization & Architecture', year: 2, sem: 3, sec: 'A',
    faculty: 'Dr. A. K. Nayak', room: 'LH-202', planned: 44, held: 37, syllabusPct: 84, avgAtt: 83.1,
    lastDate: '07 Oct 2026', lastTopic: 'Pipelining Hazards: Data & Branch Prediction',
    log: [
      { date: '07 Oct 2026', time: '11:15 - 12:15 PM', topic: 'Pipelining Hazards: Data & Branch Prediction', att: '54/65 (83.1%)', type: 'Lecture #37' }
    ]
  },
  {
    id: 'cls-203', code: 'MA301', name: 'Discrete Mathematics', year: 2, sem: 3, sec: 'A',
    faculty: 'Dr. B. K. Mohapatra', room: 'LH-203', planned: 42, held: 36, syllabusPct: 85, avgAtt: 85.0,
    lastDate: '08 Oct 2026', lastTopic: 'Graph Theory: Euler Paths & Hamiltonian Cycles',
    log: [
      { date: '08 Oct 2026', time: '02:00 - 03:00 PM', topic: 'Graph Theory: Euler Paths & Hamiltonian Cycles', att: '55/65 (84.6%)', type: 'Lecture #36' }
    ]
  },
  {
    id: 'cls-204', code: 'CS301', name: 'Data Structures & Algorithms', year: 2, sem: 3, sec: 'B',
    faculty: 'Prof. Sneha Rath', room: 'LH-204', planned: 46, held: 39, syllabusPct: 84, avgAtt: 86.8,
    lastDate: '08 Oct 2026', lastTopic: 'Graph Representation: Adjacency List & BFS',
    log: [
      { date: '08 Oct 2026', time: '11:15 - 12:15 PM', topic: 'Graph Representation: Adjacency List & BFS', att: '53/61 (86.8%)', type: 'Lecture #39' }
    ]
  },
  {
    id: 'cls-205', code: 'CS303', name: 'Object Oriented Programming with Java', year: 2, sem: 3, sec: 'B',
    faculty: 'Prof. Priya Das', room: 'CS-Lab 4', planned: 45, held: 40, syllabusPct: 88, avgAtt: 90.1,
    lastDate: '07 Oct 2026', lastTopic: 'Multithreading: Synchronization & Locks',
    log: [
      { date: '07 Oct 2026', time: '02:00 - 04:00 PM', topic: 'Multithreading: Synchronization & Locks', att: '56/61 (91.8%)', type: 'Lecture #40' }
    ]
  },
  {
    id: 'cls-206', code: 'EC301', name: 'Digital Logic & Circuit Design', year: 2, sem: 3, sec: 'B',
    faculty: 'Dr. K. N. Parida', room: 'LH-205', planned: 42, held: 35, syllabusPct: 83, avgAtt: 79.5,
    lastDate: '06 Oct 2026', lastTopic: 'Synchronous Counters & State Machine Synthesis',
    log: [
      { date: '06 Oct 2026', time: '09:00 - 10:00 AM', topic: 'Synchronous Counters & State Machine Synthesis', att: '48/61 (78.6%)', type: 'Lecture #35' }
    ]
  },
  {
    id: 'cls-207', code: 'CS301', name: 'Data Structures & Algorithms', year: 2, sem: 3, sec: 'C',
    faculty: 'Prof. M. K. Jena', room: 'LH-206', planned: 46, held: 38, syllabusPct: 82, avgAtt: 81.3,
    lastDate: '08 Oct 2026', lastTopic: 'Binary Search Tree Deletion & Inorder Successor',
    log: [
      { date: '08 Oct 2026', time: '09:00 - 10:00 AM', topic: 'Binary Search Tree Deletion & Inorder Successor', att: '47/58 (81.0%)', type: 'Lecture #38' }
    ]
  },
  {
    id: 'cls-208', code: 'CS303', name: 'Object Oriented Programming with Java', year: 2, sem: 3, sec: 'C',
    faculty: 'Prof. Priya Das', room: 'CS-Lab 5', planned: 45, held: 38, syllabusPct: 84, avgAtt: 87.9,
    lastDate: '07 Oct 2026', lastTopic: 'Exception Handling: Custom Exceptions & try-with-resources',
    log: [
      { date: '07 Oct 2026', time: '01:15 - 02:15 PM', topic: 'Exception Handling: Custom Exceptions & try-with-resources', att: '51/58 (87.9%)', type: 'Lecture #38' }
    ]
  },

  // Year 3
  {
    id: 'cls-301', code: 'CS501', name: 'Operating Systems', year: 3, sem: 5, sec: 'A',
    faculty: 'Dr. S. K. Mishra', room: 'LH-301', planned: 45, held: 42, syllabusPct: 93, avgAtt: 91.5,
    lastDate: '08 Oct 2026', lastTopic: 'Virtual Memory: Page Replacement Algorithms (LRU, Optimal)',
    log: [
      { date: '08 Oct 2026', time: '09:00 - 10:00 AM', topic: 'Virtual Memory: Page Replacement Algorithms (LRU, Optimal)', att: '60/66 (90.9%)', type: 'Lecture #42' },
      { date: '06 Oct 2026', time: '09:00 - 10:00 AM', topic: 'Demand Paging & Page Fault Handling Routine', att: '61/66 (92.4%)', type: 'Lecture #41' }
    ]
  },
  {
    id: 'cls-302', code: 'CS502', name: 'Database Management Systems', year: 3, sem: 5, sec: 'A',
    faculty: 'Prof. R. N. Behera', room: 'LH-302', planned: 45, held: 40, syllabusPct: 88, avgAtt: 86.4,
    lastDate: '07 Oct 2026', lastTopic: 'Transaction Management: ACID Properties & 2PL Protocol',
    log: [
      { date: '07 Oct 2026', time: '11:15 - 12:15 PM', topic: 'Transaction Management: ACID Properties & 2PL Protocol', att: '57/66 (86.3%)', type: 'Lecture #40' }
    ]
  },
  {
    id: 'cls-303', code: 'CS503', name: 'Computer Networks', year: 3, sem: 5, sec: 'A',
    faculty: 'Dr. A. K. Nayak', room: 'LH-303', planned: 44, held: 39, syllabusPct: 88, avgAtt: 88.0,
    lastDate: '08 Oct 2026', lastTopic: 'TCP Congestion Control: AIMD, Slow Start, Fast Recovery',
    log: [
      { date: '08 Oct 2026', time: '01:15 - 02:15 PM', topic: 'TCP Congestion Control: AIMD, Slow Start, Fast Recovery', att: '58/66 (87.8%)', type: 'Lecture #39' }
    ]
  },
  {
    id: 'cls-304', code: 'CS501', name: 'Operating Systems', year: 3, sem: 5, sec: 'B',
    faculty: 'Dr. S. K. Mishra', room: 'LH-304', planned: 45, held: 41, syllabusPct: 91, avgAtt: 87.5,
    lastDate: '08 Oct 2026', lastTopic: 'Deadlock Detection & Bankers Algorithm Implementation',
    log: [
      { date: '08 Oct 2026', time: '10:00 - 11:00 AM', topic: 'Deadlock Detection & Bankers Algorithm Implementation', att: '55/63 (87.3%)', type: 'Lecture #41' }
    ]
  },
  {
    id: 'cls-305', code: 'CS502', name: 'Database Management Systems', year: 3, sem: 5, sec: 'B',
    faculty: 'Prof. R. N. Behera', room: 'LH-305', planned: 45, held: 39, syllabusPct: 86, avgAtt: 84.1,
    lastDate: '07 Oct 2026', lastTopic: 'Database Normalization: BCNF and 4NF Decompositions',
    log: [
      { date: '07 Oct 2026', time: '02:00 - 03:00 PM', topic: 'Database Normalization: BCNF and 4NF Decompositions', att: '53/63 (84.1%)', type: 'Lecture #39' }
    ]
  },
  {
    id: 'cls-306', code: 'CS504', name: 'Design & Analysis of Algorithms', year: 3, sem: 5, sec: 'B',
    faculty: 'Prof. Sneha Rath', room: 'LH-306', planned: 44, held: 38, syllabusPct: 86, avgAtt: 85.7,
    lastDate: '06 Oct 2026', lastTopic: 'Dynamic Programming: 0/1 Knapsack & Bellman-Ford',
    log: [
      { date: '06 Oct 2026', time: '11:15 - 12:15 PM', topic: 'Dynamic Programming: 0/1 Knapsack & Bellman-Ford', att: '54/63 (85.7%)', type: 'Lecture #38' }
    ]
  },
  {
    id: 'cls-307', code: 'CS502', name: 'Database Management Systems', year: 3, sem: 5, sec: 'C',
    faculty: 'Prof. R. N. Behera', room: 'LH-307', planned: 45, held: 37, syllabusPct: 82, avgAtt: 82.5,
    lastDate: '08 Oct 2026', lastTopic: 'Indexing: B+ Tree Insertion and Range Queries',
    log: [
      { date: '08 Oct 2026', time: '02:00 - 03:00 PM', topic: 'Indexing: B+ Tree Insertion and Range Queries', att: '47/57 (82.5%)', type: 'Lecture #37' }
    ]
  },
  {
    id: 'cls-308', code: 'CS505', name: 'Web Technologies & Cloud Fundamentals', year: 3, sem: 5, sec: 'C',
    faculty: 'Prof. Ananya Sen', room: 'CS-Lab 6', planned: 42, held: 36, syllabusPct: 85, avgAtt: 86.0,
    lastDate: '07 Oct 2026', lastTopic: 'RESTful API Architecture & JWT Authentication',
    log: [
      { date: '07 Oct 2026', time: '10:00 - 11:00 AM', topic: 'RESTful API Architecture & JWT Authentication', att: '49/57 (86.0%)', type: 'Lecture #36' }
    ]
  },

  // Year 4
  {
    id: 'cls-401', code: 'CS701', name: 'Machine Learning & Artificial Intelligence', year: 4, sem: 7, sec: 'A',
    faculty: 'Dr. S. K. Mishra', room: 'LH-401', planned: 45, held: 43, syllabusPct: 95, avgAtt: 92.3,
    lastDate: '08 Oct 2026', lastTopic: 'Deep Neural Networks: Backpropagation & Optimization (Adam)',
    log: [
      { date: '08 Oct 2026', time: '10:00 - 11:00 AM', topic: 'Deep Neural Networks: Backpropagation & Optimization (Adam)', att: '61/65 (93.8%)', type: 'Lecture #43' },
      { date: '05 Oct 2026', time: '10:00 - 11:00 AM', topic: 'Support Vector Machines: Kernel Trick & Soft Margin', att: '59/65 (90.7%)', type: 'Lecture #42' }
    ]
  },
  {
    id: 'cls-402', code: 'CS702', name: 'Cryptography & Network Security', year: 4, sem: 7, sec: 'A',
    faculty: 'Dr. A. K. Nayak', room: 'LH-402', planned: 42, held: 38, syllabusPct: 90, avgAtt: 87.7,
    lastDate: '07 Oct 2026', lastTopic: 'RSA Algorithm & Elliptic Curve Cryptography (ECC)',
    log: [
      { date: '07 Oct 2026', time: '09:00 - 10:00 AM', topic: 'RSA Algorithm & Elliptic Curve Cryptography (ECC)', att: '57/65 (87.7%)', type: 'Lecture #38' }
    ]
  },
  {
    id: 'cls-403', code: 'CS703', name: 'Distributed Systems & Microservices', year: 4, sem: 7, sec: 'A',
    faculty: 'Prof. Priya Das', room: 'LH-403', planned: 40, held: 36, syllabusPct: 90, avgAtt: 86.2,
    lastDate: '06 Oct 2026', lastTopic: 'Raft Consensus Algorithm & Leader Election',
    log: [
      { date: '06 Oct 2026', time: '02:00 - 03:00 PM', topic: 'Raft Consensus Algorithm & Leader Election', att: '56/65 (86.2%)', type: 'Lecture #36' }
    ]
  },
  {
    id: 'cls-404', code: 'CS701', name: 'Machine Learning & Artificial Intelligence', year: 4, sem: 7, sec: 'B',
    faculty: 'Dr. S. K. Mishra', room: 'LH-404', planned: 45, held: 42, syllabusPct: 93, avgAtt: 89.8,
    lastDate: '08 Oct 2026', lastTopic: 'Convolutional Neural Networks: Feature Maps & Pooling',
    log: [
      { date: '08 Oct 2026', time: '11:15 - 12:15 PM', topic: 'Convolutional Neural Networks: Feature Maps & Pooling', att: '53/59 (89.8%)', type: 'Lecture #42' }
    ]
  },
  {
    id: 'cls-405', code: 'CS704', name: 'Cloud Computing & DevOps Architecture', year: 4, sem: 7, sec: 'B',
    faculty: 'Prof. Ananya Sen', room: 'CS-Lab 7', planned: 42, held: 37, syllabusPct: 88, avgAtt: 88.1,
    lastDate: '07 Oct 2026', lastTopic: 'Kubernetes Pod Scheduling & Service Mesh (Istio)',
    log: [
      { date: '07 Oct 2026', time: '01:15 - 02:15 PM', topic: 'Kubernetes Pod Scheduling & Service Mesh (Istio)', att: '52/59 (88.1%)', type: 'Lecture #37' }
    ]
  },
  {
    id: 'cls-406', code: 'CS705', name: 'Compiler Design & Optimization', year: 4, sem: 7, sec: 'B',
    faculty: 'Prof. R. N. Behera', room: 'LH-405', planned: 40, held: 35, syllabusPct: 87, avgAtt: 83.0,
    lastDate: '06 Oct 2026', lastTopic: 'LR(1) and LALR(1) Parsing Table Construction',
    log: [
      { date: '06 Oct 2026', time: '09:00 - 10:00 AM', topic: 'LR(1) and LALR(1) Parsing Table Construction', att: '49/59 (83.0%)', type: 'Lecture #35' }
    ]
  },
  {
    id: 'cls-407', code: 'CS701', name: 'Machine Learning & Artificial Intelligence', year: 4, sem: 7, sec: 'C',
    faculty: 'Prof. Priya Das', room: 'LH-406', planned: 45, held: 40, syllabusPct: 88, avgAtt: 87.5,
    lastDate: '08 Oct 2026', lastTopic: 'Random Forests, Bagging & Gradient Boosting (XGBoost)',
    log: [
      { date: '08 Oct 2026', time: '02:00 - 03:00 PM', topic: 'Random Forests, Bagging & Gradient Boosting (XGBoost)', att: '49/56 (87.5%)', type: 'Lecture #40' }
    ]
  },
  {
    id: 'cls-408', code: 'CS706', name: 'Software Engineering & Automated Testing', year: 4, sem: 7, sec: 'C',
    faculty: 'Prof. M. K. Jena', room: 'CS-Lab 8', planned: 40, held: 36, syllabusPct: 90, avgAtt: 85.7,
    lastDate: '07 Oct 2026', lastTopic: 'CI/CD Pipelines & Automated Integration Testing',
    log: [
      { date: '07 Oct 2026', time: '11:15 - 12:15 PM', topic: 'CI/CD Pipelines & Automated Integration Testing', att: '48/56 (85.7%)', type: 'Lecture #36' }
    ]
  }
];

let hodClassYearFilter = 'All';
let hodClassSecFilter = 'All';
let hodClassSearchQuery = '';

function loadDeptClasses() {
  const custom = loadJson('cc_dept_classes', null);
  if (custom && Array.isArray(custom) && custom.length) return custom;
  return DEFAULT_DEPT_CLASSES;
}

function saveDeptClasses(list) {
  saveJson('cc_dept_classes', list);
}

function getDeptClassesTotalHeld() {
  const list = loadDeptClasses();
  return list.reduce((acc, c) => acc + (c.held || 0), 0);
}

function filterDeptClasses(list) {
  return list.filter(c => {
    if (hodClassYearFilter !== 'All' && String(c.year) !== String(hodClassYearFilter)) return false;
    if (hodClassSecFilter !== 'All' && c.sec !== hodClassSecFilter) return false;
    if (hodClassSearchQuery) {
      const q = hodClassSearchQuery.toLowerCase();
      const match = c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.faculty.toLowerCase().includes(q) ||
        (c.room && c.room.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });
}

function renderHodClassTracking() {
  const allList = loadDeptClasses();
  const filtered = filterDeptClasses(allList);

  const totalHeld = allList.reduce((acc, c) => acc + (c.held || 0), 0);
  const totalPlanned = allList.reduce((acc, c) => acc + (c.planned || 0), 0);
  const conductionPct = totalPlanned ? Math.round((totalHeld / totalPlanned) * 100) : 0;
  const avgSyl = allList.length ? Math.round(allList.reduce((acc, c) => acc + (c.syllabusPct || 0), 0) / allList.length) : 0;
  const avgAtt = allList.length ? (allList.reduce((acc, c) => acc + (c.avgAtt || 0), 0) / allList.length).toFixed(1) : 0;

  const yrYears = [
    { id: 'All', label: 'All Years' },
    { id: '1', label: '1st Year' },
    { id: '2', label: '2nd Year' },
    { id: '3', label: '3rd Year' },
    { id: '4', label: '4th Year' }
  ];

  const secSections = [
    { id: 'All', label: 'All Sections' },
    { id: 'A', label: 'Section A' },
    { id: 'B', label: 'Section B' },
    { id: 'C', label: 'Section C' }
  ];

  return `
    <div class="cls-page">
      <div class="cls-hero-banner">
        <div class="cls-hero-info">
          <h2>📊 Department Academic Conduction Tracker</h2>
          <p>Real-time executive oversight of total classes held per subject across all sections and academic years. Monitor syllabus velocity and attendance health.</p>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn ghost sm" data-cls-export type="button" style="display:inline-flex;align-items:center;gap:6px">
            🖨️ Export Conduction Report
          </button>
        </div>
      </div>

      <div class="cls-stat-grid">
        <div class="cls-stat-tile">
          <div class="cls-stat-label">TOTAL CLASSES HELD</div>
          <div class="cls-stat-metric" style="color:#4f46e5">${totalHeld}</div>
          <div style="font-size:11px;color:var(--muted)">out of ${totalPlanned} planned</div>
        </div>
        <div class="cls-stat-tile">
          <div class="cls-stat-label">CONDUCTION RATE</div>
          <div class="cls-stat-metric" style="color:#0284c7">${conductionPct}%</div>
          <div style="font-size:11px;color:var(--muted)">department pacing</div>
        </div>
        <div class="cls-stat-tile">
          <div class="cls-stat-label">AVG SYLLABUS COVERED</div>
          <div class="cls-stat-metric" style="color:#10b981">${avgSyl}%</div>
          <div style="font-size:11px;color:var(--muted)">curriculum progress</div>
        </div>
        <div class="cls-stat-tile">
          <div class="cls-stat-label">STUDENT ATTENDANCE</div>
          <div class="cls-stat-metric" style="color:#8b5cf6">${avgAtt}%</div>
          <div style="font-size:11px;color:var(--muted)">aggregate departmental</div>
        </div>
        <div class="cls-stat-tile">
          <div class="cls-stat-label">COURSE OFFERINGS</div>
          <div class="cls-stat-metric" style="color:#f59e0b">${allList.length}</div>
          <div style="font-size:11px;color:var(--muted)">subjects &amp; sections</div>
        </div>
      </div>

      <div class="cls-filter-panel">
        <div class="cls-filter-row">
          <span class="cls-filter-lbl">Year:</span>
          <div class="cls-pill-group">
            ${yrYears.map(y => `<button class="cls-pill${hodClassYearFilter === y.id ? ' on' : ''}" data-cls-yf="${y.id}" type="button">${y.label}</button>`).join('')}
          </div>
        </div>
        <div class="cls-filter-row">
          <span class="cls-filter-lbl">Section:</span>
          <div class="cls-pill-group">
            ${secSections.map(s => `<button class="cls-pill${hodClassSecFilter === s.id ? ' on' : ''}" data-cls-sf="${s.id}" type="button">${s.label}</button>`).join('')}
          </div>
        </div>
        <div class="cls-filter-row" style="margin-top:14px">
          <span class="cls-filter-lbl">Search:</span>
          <div style="flex:1;max-width:420px;position:relative">
            <input type="text" id="clsSearchInput" value="${escapeHtml(hodClassSearchQuery)}" placeholder="Filter by subject code, title, faculty, or room..."
              style="width:100%;padding:8px 14px;border:1px solid var(--border,rgba(0,0,0,0.1));border-radius:20px;background:var(--input-bg,#f8fafc);color:var(--text);font-size:13px;outline:none" />
          </div>
          ${(hodClassYearFilter !== 'All' || hodClassSecFilter !== 'All' || hodClassSearchQuery) ? `
            <button class="btn sm ghost" data-cls-yf="All" data-cls-sf="All" style="font-size:11px;padding:4px 10px;margin-left:auto" type="button" onclick="hodClassSearchQuery='';render();">
              ✕ Clear Filters
            </button>
          ` : ''}
        </div>
      </div>

      <div class="cls-card-grid" id="deptClassesGrid">
        ${renderDeptClassCards(filtered)}
      </div>
    </div>
  `;
}

function renderDeptClassCards(list) {
  if (!list) list = filterDeptClasses(loadDeptClasses());
  if (!list.length) {
    return `
      <div style="grid-column:1/-1;text-align:center;padding:50px 20px;background:var(--card-bg,#fff);border:1px dashed var(--border,rgba(0,0,0,0.1));border-radius:16px">
        <div style="font-size:42px;margin-bottom:10px">🔍</div>
        <h3 style="margin:0 0 6px">No Subjects Found</h3>
        <p style="color:var(--muted);font-size:13px;margin:0">No classes match the selected year, section, or search criteria.</p>
      </div>
    `;
  }

  return list.map(c => {
    const yrLabel = c.year === 1 ? '1st' : c.year === 2 ? '2nd' : c.year === 3 ? '3rd' : '4th';
    const pct = c.planned ? Math.round((c.held / c.planned) * 100) : 0;
    const remaining = Math.max(0, c.planned - c.held);
    return `
      <div class="cls-card" id="card-${c.id}">
        <div class="cls-card-head">
          <div style="flex:1;min-width:0">
            <h3 class="cls-card-title" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</h3>
            <div class="cls-tags-row">
              <span class="cls-badge-year">${yrLabel} Year · Sem ${c.sem}</span>
              <span class="cls-badge-sec">Section ${c.sec}</span>
              <span class="badge" style="font-size:10.5px;padding:2px 7px">${escapeHtml(c.code)}</span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <span class="cls-conduction-num" style="color:var(--accent,#4f46e5)">${c.held}</span>
            <span style="font-size:11px;color:var(--muted);display:block">/ ${c.planned} Planned</span>
          </div>
        </div>

        <div class="cls-card-body">
          <div class="cls-conduction-stat">
            <div>
              <span class="cls-conduction-sub">Total Classes Had</span>
              <div style="font-size:13px;font-weight:700;color:var(--text)">${c.held} Conducted</div>
            </div>
            <div style="text-align:right">
              <span class="cls-conduction-sub">Remaining Lectures</span>
              <div style="font-size:13px;font-weight:700;color:${remaining <= 5 ? '#10b981' : 'var(--text)'}">${remaining} to go</div>
            </div>
          </div>

          <div class="cls-bar-wrap">
            <div class="cls-bar-label">
              <span>Conduction Velocity</span>
              <span><b>${pct}%</b></span>
            </div>
            <div class="cls-bar">
              <div class="cls-bar-fill" style="width:${Math.min(100, pct)}%"></div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;background:rgba(128,128,128,0.05);padding:10px;border-radius:10px">
            <div>
              <div style="font-size:10.5px;color:var(--muted);font-weight:600">SYLLABUS COVERED</div>
              <div style="font-size:13.5px;font-weight:800;color:#10b981">${c.syllabusPct}%</div>
            </div>
            <div>
              <div style="font-size:10.5px;color:var(--muted);font-weight:600">STUDENT ATTENDANCE</div>
              <div style="font-size:13.5px;font-weight:800;color:#0284c7">${c.avgAtt}%</div>
            </div>
          </div>

          <div class="cls-faculty-line">
            <span>🧑‍🏫 <b>Faculty:</b> ${escapeHtml(c.faculty)}</span>
            <span style="margin-left:auto">🏛️ ${escapeHtml(c.room || 'LH')}</span>
          </div>

          ${c.lastTopic ? `
            <div style="font-size:11.5px;color:var(--muted);background:rgba(79,70,229,0.05);border-left:3px solid #4f46e5;padding:7px 10px;border-radius:0 8px 8px 0">
              <span style="font-weight:700;color:var(--text)">Last Class (${escapeHtml(c.lastDate)}):</span>
              <div style="margin-top:2px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.lastTopic)}</div>
            </div>
          ` : ''}
        </div>

        <div class="cls-card-foot">
          <button class="btn sm ghost" data-cls-log="${c.id}" type="button" style="font-size:11.5px;padding:6px 12px">
            📋 Lecture Log (${(c.log || []).length})
          </button>
          <button class="btn sm" data-cls-add="${c.id}" type="button" style="font-size:11.5px;padding:6px 12px">
            ➕ Log Extra Class
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSubjectLectureSheet(id) {
  const list = loadDeptClasses();
  const c = list.find(x => x.id === id);
  if (!c) return `<div style="padding:20px;text-align:center">Class not found</div>`;

  const yrLabel = c.year === 1 ? '1st' : c.year === 2 ? '2nd' : c.year === 3 ? '3rd' : '4th';
  const logs = c.log || [];

  return `
    <div style="padding:4px 0 16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">
        <div>
          <span class="cls-badge-year">${yrLabel} Year · Sem ${c.sem}</span>
          <span class="cls-badge-sec">Section ${c.sec}</span>
          <span class="badge" style="font-size:11px">${escapeHtml(c.code)}</span>
          <h2 style="margin:8px 0 4px;font-size:18px">${escapeHtml(c.name)}</h2>
          <p style="margin:0;font-size:12.5px;color:var(--muted)">Faculty: <b>${escapeHtml(c.faculty)}</b> · Room: <b>${escapeHtml(c.room || 'LH')}</b></p>
        </div>
        <div style="text-align:right">
          <div style="font-size:24px;font-weight:900;color:var(--accent,#4f46e5)">${c.held} / ${c.planned}</div>
          <div style="font-size:11px;color:var(--muted)">Classes Held</div>
        </div>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:18px;background:rgba(128,128,128,0.05);padding:12px;border-radius:12px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--muted)">Syllabus Completion</div>
          <div style="font-size:15px;font-weight:800;color:#10b981">${c.syllabusPct}%</div>
        </div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--muted)">Avg Student Attendance</div>
          <div style="font-size:15px;font-weight:800;color:#0284c7">${c.avgAtt}%</div>
        </div>
        <div style="flex:1">
          <div style="font-size:11px;color:var(--muted)">Remaining Lectures</div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">${Math.max(0, c.planned - c.held)}</div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0;font-size:14.5px;font-weight:800">Conducted Lectures History (${logs.length})</h3>
        <button class="btn sm" data-cls-add="${c.id}" type="button" style="font-size:11.5px;padding:4px 10px">
          ➕ Record Class
        </button>
      </div>

      <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px">
        ${logs.length ? logs.map((l, i) => `
          <div style="padding:10px 12px;border:1px solid var(--border,rgba(0,0,0,0.08));border-radius:10px;background:var(--card-bg,#fff)">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:3px">
              <span>📅 ${escapeHtml(l.date)} ${l.time ? `· <span style="font-weight:500;color:var(--muted)">${escapeHtml(l.time)}</span>` : ''}</span>
              <span class="badge" style="font-size:10px;padding:2px 6px">${escapeHtml(l.type || 'Lecture')}</span>
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">
              ${escapeHtml(l.topic)}
            </div>
            <div style="font-size:11.5px;color:var(--muted);display:flex;gap:12px">
              <span>👥 Attendance: <b>${escapeHtml(l.att || 'Recorded')}</b></span>
            </div>
          </div>
        `).join('') : `
          <div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">
            No lecture logs recorded yet for this semester.
          </div>
        `}
      </div>

      <div class="btns" style="margin-top:18px">
        <button class="btn ghost" data-close type="button">Close</button>
      </div>
    </div>
  `;
}

function renderAddExtraClassSheet(id) {
  const list = loadDeptClasses();
  const c = list.find(x => x.id === id);
  if (!c) return `<div style="padding:20px;text-align:center">Class not found</div>`;

  const yrLabel = c.year === 1 ? '1st' : c.year === 2 ? '2nd' : c.year === 3 ? '3rd' : '4th';
  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return `
    <div style="padding:4px 0 16px">
      <div style="margin-bottom:14px">
        <span class="cls-badge-year">${yrLabel} Year · Sem ${c.sem}</span>
        <span class="cls-badge-sec">Section ${c.sec}</span>
        <span class="badge" style="font-size:11px">${escapeHtml(c.code)}</span>
        <h2 style="margin:8px 0 4px;font-size:18px">Record Class Conduction</h2>
        <p style="margin:0;font-size:12.5px;color:var(--muted)">
          ${escapeHtml(c.name)} · Current total classes held: <b>${c.held}</b>
        </p>
      </div>

      <form id="clsExtraForm" onsubmit="return false;" style="display:flex;flex-direction:column;gap:12px">
        <input type="hidden" id="clsFormId" value="${c.id}" />

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:4px">DATE</label>
            <input type="text" id="clsFormDate" value="${todayStr}" style="width:100%;padding:8px 10px;border:1px solid var(--border,rgba(0,0,0,0.1));border-radius:8px;font-size:13px;background:var(--input-bg,#fff);color:var(--text)" />
          </div>
          <div>
            <label style="display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:4px">TIME SLOT</label>
            <input type="text" id="clsFormTime" value="10:00 - 11:00 AM" style="width:100%;padding:8px 10px;border:1px solid var(--border,rgba(0,0,0,0.1));border-radius:8px;font-size:13px;background:var(--input-bg,#fff);color:var(--text)" />
          </div>
        </div>

        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:4px">LECTURE TYPE</label>
          <select id="clsFormType" style="width:100%;padding:8px 10px;border:1px solid var(--border,rgba(0,0,0,0.1));border-radius:8px;font-size:13px;background:var(--input-bg,#fff);color:var(--text)">
            <option value="Regular Lecture">Regular Lecture</option>
            <option value="Extra Class">Extra Class (Remedial)</option>
            <option value="Revision Lecture">Revision Lecture</option>
            <option value="Practical / Lab Conduction">Practical / Lab Conduction</option>
            <option value="Doubt Clearing Session">Doubt Clearing Session</option>
          </select>
        </div>

        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:4px">TOPIC / SYLLABUS UNIT COVERED *</label>
          <input type="text" id="clsFormTopic" placeholder="e.g., Dynamic Programming: Longest Common Subsequence..." required style="width:100%;padding:8px 10px;border:1px solid var(--border,rgba(0,0,0,0.1));border-radius:8px;font-size:13px;background:var(--input-bg,#fff);color:var(--text)" />
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:4px">STUDENT ATTENDANCE</label>
            <input type="text" id="clsFormAtt" value="56/62 (90.3%)" style="width:100%;padding:8px 10px;border:1px solid var(--border,rgba(0,0,0,0.1));border-radius:8px;font-size:13px;background:var(--input-bg,#fff);color:var(--text)" />
          </div>
          <div>
            <label style="display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:4px">SYLLABUS PROGRESS (%)</label>
            <input type="number" id="clsFormSyl" min="1" max="100" value="${Math.min(100, (c.syllabusPct || 80) + 1)}" style="width:100%;padding:8px 10px;border:1px solid var(--border,rgba(0,0,0,0.1));border-radius:8px;font-size:13px;background:var(--input-bg,#fff);color:var(--text)" />
          </div>
        </div>

        <div class="btns" style="margin-top:12px;gap:10px">
          <button class="btn" id="clsExtraSubmit" type="button" style="flex:1">
            ✓ Record Class Conduction (+1)
          </button>
          <button class="btn ghost" data-close type="button">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

function submitExtraClassConduction() {
  const formId = $('clsFormId') ? $('clsFormId').value : null;
  const topic = $('clsFormTopic') ? $('clsFormTopic').value.trim() : '';
  const date = $('clsFormDate') ? $('clsFormDate').value.trim() : 'Today';
  const time = $('clsFormTime') ? $('clsFormTime').value.trim() : '';
  const type = $('clsFormType') ? $('clsFormType').value : 'Regular Lecture';
  const att = $('clsFormAtt') ? $('clsFormAtt').value.trim() : 'Recorded';
  const syl = $('clsFormSyl') ? parseInt($('clsFormSyl').value, 10) : null;

  if (!formId || !topic) {
    showToast('⚠️ Please enter the topic covered.');
    return;
  }

  const list = loadDeptClasses();
  const c = list.find(x => x.id === formId);
  if (!c) {
    showToast('⚠️ Subject not found.');
    return;
  }

  c.held = (c.held || 0) + 1;
  c.lastDate = date;
  c.lastTopic = topic;
  if (syl && !isNaN(syl)) c.syllabusPct = Math.min(100, Math.max(0, syl));

  if (!c.log) c.log = [];
  c.log.unshift({
    date,
    time,
    topic,
    att,
    type: `${type} #${c.held}`
  });

  saveDeptClasses(list);
  closeSheet();
  showToast(`✅ Class recorded for ${c.code} (${c.sec})! Total classes held is now ${c.held}.`);
  render();
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
  return renderRoadmap(
    'Campus Placements & Opportunity Board',
    '💼',
    'Phase 2 Milestone · T&P Industry Integration',
    'The campus placement and internship portal will connect directly with visiting corporate partners and college Training & Placement cell APIs.',
    'Placeholder job listings have been removed to avoid unverified recruitment data. Students can currently post and verify their technical achievements in the Achievements tab for upcoming placement drives.'
  );
}


/* =============================================================================
   14. COMPLAINTS (student)
   ============================================================================= */

const COMPLAINT_CATEGORIES = ['Hostel', 'Food & Mess', 'Cleanliness', 'College'];
const HOSTEL_ONLY_CATS = ['Hostel', 'Food & Mess', 'Cleanliness', 'Mess', 'Food'];
const COMPLAINT_LOCATIONS = ['Block A', 'Block B', 'Block C', 'Block D', 'Mess Hall', 'Library', 'Classroom block', 'Canteen'];
const SLA_HOURS = { Hostel: 48, 'Food & Mess': 24, Cleanliness: 24, College: 72, Mess: 24, Food: 24 };           // target response time per category
const STAGES = ['Submitted', 'Assigned', 'In progress', 'Resolved'];

// Demo complaints. st = stage index, mt = "me too" count, age = hours old, mine = raised by this student
const COMPLAINTS = [
  { id: 'C-101', cat: 'Hostel', loc: 'Block A', t: 'Water leakage in bathroom on 1st floor', st: 2, mine: false, mt: 4, age: 30, by: 'CS23-0101' },
  { id: 'C-102', cat: 'Food & Mess', loc: 'Mess Hall', t: 'Food served cold at dinner', st: 1, mine: false, mt: 9, age: 20, by: 'CS23-0107' },
  { id: 'C-105', cat: 'Cleanliness', loc: 'Block A', t: 'Corridors and common washrooms need urgent cleaning', st: 1, mine: false, mt: 5, age: 14, by: 'CS23-0125' },
  { id: 'C-103', cat: 'College', loc: 'Library', t: 'AC not working in reading hall', st: 1, mine: false, mt: 2, age: 80, by: 'CS23-0138' },
  { id: 'C-099', cat: 'Hostel', loc: 'Block A', t: 'Wi-Fi very slow on 2nd floor wing', st: 3, mine: true, mt: 1, age: 100, by: 'CS23-0101' },
  { id: 'C-104', cat: 'Hostel', loc: 'Block A', t: 'Fan regulator broken in room 102', st: 1, mine: true, mt: 0, age: 20, by: 'CS23-0101' }
].map(c => ({ ...c, ts: Date.now() - c.age * 36e5 }));   // ts = time created

// Complaints are saved so every role (and every open tab) sees the same state,
// e.g. when the admin closes one, students and staff see it straight away.
const COMPLAINTS_KEY = 'cc_cmp';
function loadComplaints() {
  const saved = loadJson(COMPLAINTS_KEY, null);
  if (Array.isArray(saved) && saved.length) {
    const clean = saved.filter(c => c && !String(c.t || '').includes('alert') && !String(c.by || '').startsWith('TEST-') && !String(c.t || '').includes('XSS'));
    COMPLAINTS.splice(0, COMPLAINTS.length, ...(clean.length ? clean : COMPLAINTS));
  }
}
function saveComplaints() {
  try { localStorage.setItem(COMPLAINTS_KEY, JSON.stringify(COMPLAINTS)); }
  catch (e) {   // storage full (big photos): keep everything except the photos
    try { localStorage.setItem(COMPLAINTS_KEY, JSON.stringify(COMPLAINTS.map(c => ({ ...c, photo: '' })))); } catch (e2) { }
  }
  if (getRole() === 'admin' && typeof loadAdminAnalytics === 'function') {
    loadAdminAnalytics(true);
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

// Time ago helper for complaints, notices, roll calls and reviews
const timeAgo = ts => {
  if (!ts) return 'recently';
  const diffSec = Math.floor((Date.now() - Number(ts)) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + 'm ago';
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + 'h ago';
  const diffDays = Math.floor(diffHr / 24);
  return diffDays + 'd ago';
};

// Check if a student record is a hostel resident (not a Day Scholar)
const isHosteller = s => {
  if (!s || !s.hostel) return false;
  const h = String(s.hostel).trim().toLowerCase();
  return h !== '' && h !== 'day scholar' && h !== 'none' && !h.startsWith('day');
};

// Returns student hostel record if signed in user is a hostel resident, null otherwise
function myHostelRecord() {
  const me = myStudent();
  if (me) return isHosteller(me) ? me : null;
  const u = userName().toUpperCase();
  const found = STUDENTS.find(x => x.roll === u);
  if (found) return isHosteller(found) ? found : null;
  const sh = ssGet('cc_hostel');
  if (sh && isHosteller({ hostel: sh })) return { hostel: sh };
  if (getRole() === 'student' && (!sessionStorage.getItem('cc_user') || sessionStorage.getItem('cc_user').toLowerCase() === 'student')) {
    const demo = STUDENTS.find(x => x.roll === 'CS23-0101');
    return demo && isHosteller(demo) ? demo : null;
  }
  return null;
}

// Assigned hostel for the logged-in warden
function wardenHostel() {
  const fromSession = ssGet('cc_hostel');
  if (fromSession) return fromSession;
  const staff = myStaff();
  if (staff && staff.hostel) return staff.hostel;
  const wardenInList = STAFF_LIST.find(x => x.pos === 'Warden' && x.hostel);
  if (wardenInList) return wardenInList.hostel;
  return 'Block A';
}

// Get all students residing in a specific hostel
function hostelResidents(hostelName) {
  const target = (hostelName || wardenHostel() || 'Block A').toLowerCase();
  return STUDENTS.filter(s => {
    if (!isHosteller(s)) return false;
    const h = String(s.hostel).toLowerCase();
    return h.startsWith(target) || h.includes(target);
  });
}

// ----- Hostel Attendance & Reviews Persistence -----
const HOSTEL_ATTENDANCE = loadJson('cc_hostel_att', [
  {
    id: 'HA-20261007-N',
    date: '2026-10-07',
    session: 'Night Roll Call (9:00 PM)',
    hostel: 'Block A',
    by: 'EMP-1085',
    warden: 'Mr. B. Sahoo',
    ts: Date.now() - 864e5,
    total: 5,
    present: 4,
    records: {
      'CS23-0101': 'P',
      'CS23-0107': 'P',
      'CS23-0125': 'P',
      'CS23-0142': 'L',
      'IT24-0011': 'P'
    }
  }
]);

function saveHostelAttendance() {
  saveJson('cc_hostel_att', HOSTEL_ATTENDANCE);
}

const HOSTEL_REVIEWS = loadJson('cc_reviews', [
  {
    id: 'REV-101',
    roll: 'CS23-0101',
    name: 'Aarav Mohanty',
    loc: 'Block A',
    room: 'Room 102',
    date: '2026-10-07',
    ts: Date.now() - 864e5 * 1.5,
    foodRating: 4,
    cleanlinessRating: 4,
    hostelRating: 4,
    comment: 'Mess dinner was tasty today. Regular washroom cleaning in 1st floor corridor is appreciated.',
    reply: 'Thank you Aarav. Cleaning team has been given weekly checklist. — Warden'
  },
  {
    id: 'REV-102',
    roll: 'CS23-0107',
    name: 'Ananya Das',
    loc: 'Block A',
    room: 'Room 205',
    date: '2026-10-06',
    ts: Date.now() - 864e5 * 2.5,
    foodRating: 3,
    cleanlinessRating: 5,
    hostelRating: 4,
    comment: 'Hostel cleanliness is top notch this week! Food in mess could use a bit less spice in dal.',
    reply: ''
  },
  {
    id: 'REV-103',
    roll: 'CS23-0125',
    name: 'Priya Sahu',
    loc: 'Block A',
    room: 'Room 108',
    date: '2026-10-05',
    ts: Date.now() - 864e5 * 3.5,
    foodRating: 4,
    cleanlinessRating: 4,
    hostelRating: 5,
    comment: 'Night security and lighting around Block A entrance have improved significantly.',
    reply: 'Noted Priya. Main gate night rounds are conducted hourly. — Warden'
  }
]);

function saveHostelReviews() {
  saveJson('cc_reviews', HOSTEL_REVIEWS);
}

// Warden attendance and complaint/review UI state
let wardenAttMarks = {};
let wardenAttDate = todayIso();
let wardenAttSession = 'Night Roll Call (9:00 PM)';
let wardenAttMsg = '';
let wardenComplaintTab = 'complaints';
let wardenComplaintFilter = 'All';
let wardenReviewFilter = 'All';
let wardenActionMsg = '';
let studentReviewMsg = '';

let communityComplaints = [];
let communityLoading = false;
async function loadCommunityComplaints() {
  if (communityLoading) return;
  communityLoading = true;
  try {
    if (typeof API !== 'undefined' && API.getCommunityComplaints) {
      const res = await API.getCommunityComplaints();
      if (Array.isArray(res)) communityComplaints = res;
    }
  } catch (e) {
    console.warn('Community complaints error:', e);
  } finally {
    communityLoading = false;
    refreshComplaintsView();
  }
}

function refreshComplaintsView() {
  const pgc = $('pg-complaints');
  if (!pgc) return;
  const role = getRole();
  if (role === 'admin') {
    pgc.innerHTML = renderAdminComplaints();
  } else if (role === 'warden') {
    pgc.innerHTML = renderWardenComplaints();
  } else if (isStaffRole()) {
    pgc.innerHTML = renderStaffComplaints();
  } else {
    pgc.innerHTML = renderComplaints();
  }
  translatePage(pgc);
}

async function toggleComplaintOpinion(cid, defaultOpinion = 'Me Too') {
  try {
    const item = (communityComplaints || []).find(c => String(c.id) === String(cid));
    if (item && item.my_opinion) {
      if (typeof API !== 'undefined' && API.deleteComplaintOpinion) await API.deleteComplaintOpinion(cid);
      item.my_opinion = null;
      item.me_too_count = Math.max(0, (item.me_too_count || 1) - 1);
    } else {
      if (typeof API !== 'undefined' && API.addComplaintOpinion) {
        const res = await API.addComplaintOpinion(cid, defaultOpinion);
        if (item) {
          item.my_opinion = defaultOpinion;
          item.me_too_count = res.me_too_count || ((item.me_too_count || 0) + 1);
        }
      }
    }
    const demoMatch = COMPLAINTS.find(c => String(c.id) === String(cid));
    if (demoMatch) {
      demoMatch.me2 = !demoMatch.me2;
      demoMatch.mt = (demoMatch.mt || 0) + (demoMatch.me2 ? 1 : -1);
      saveComplaints();
    }
    showToast('Opinion updated ✓');
  } catch (e) {
    showToast('Updated opinion');
  }
  refreshComplaintsView();
}

async function submitCustomComplaintOpinion(cid) {
  const inp = document.getElementById('cmp-op-inp-' + cid);
  if (!inp) return;
  const txt = inp.value.trim();
  if (!txt) { showToast('Please enter an opinion'); return; }
  try {
    if (typeof API !== 'undefined' && API.addComplaintOpinion) {
      const res = await API.addComplaintOpinion(cid, txt);
      const item = (communityComplaints || []).find(c => String(c.id) === String(cid));
      if (item) {
        item.my_opinion = txt;
        item.me_too_count = res.me_too_count || ((item.me_too_count || 0) + 1);
        if (!item.opinions) item.opinions = [];
        item.opinions.unshift({ user_name: 'You', opinion: txt, created_at: new Date().toISOString() });
      }
    }
    inp.value = '';
    showToast('Opinion posted ✓');
  } catch (e) {
    showToast('Posted opinion');
  }
  refreshComplaintsView();
}

function renderComplaints() {
  if (!communityComplaints.length && !communityLoading && typeof API !== 'undefined' && API.getCommunityComplaints && getRole() === 'student') {
    loadCommunityComplaints();
  }
  const message = complaintMessage; complaintMessage = '';
  const isHostelStudent = Boolean(myHostelRecord());
  if (!isHostelStudent && HOSTEL_ONLY_CATS.includes(complaintDraft.cat)) {
    complaintDraft.cat = 'College';
    complaintDraft.loc = 'Library';
  }

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

  // Determine list of community complaints to show (live backend list preferred, fallback to local nearby)
  const communityList = communityComplaints.length ? communityComplaints : nearby.map(q => ({
    id: q[0].id,
    title: q[0].t,
    description: q[0].t,
    category: q[0].cat,
    location: q[0].loc,
    status: STAGES[q[0].st],
    name: 'Student (' + q[0].cat + ')',
    me_too_count: q[0].mt || 0,
    my_opinion: q[0].me2 ? 'Me Too' : null,
    opinions: []
  }));

  let communityComplaintFilter = window._cmpFilter || 'All';
  const filteredList = communityList.filter(c => {
    if (communityComplaintFilter === 'All') return true;
    if (communityComplaintFilter === 'Mine') return isMine(c) || (c.login_id && c.login_id === userName());
    const cat = (c.category || c.cat || '').toLowerCase();
    const filterCat = communityComplaintFilter.toLowerCase();
    return cat.includes(filterCat) || filterCat.includes(cat);
  });

  // Complaint Filing Box: EXCLUSIVELY for students. Admin & Staff NEVER see this filing box.
  const isStudent = getRole() === 'student';
  const filingBoxHtml = isStudent ? (
    (!isHostelStudent
      ? `<div class="note" style="margin-bottom:14px;background:rgba(234,179,8,0.12);border-color:#ca8a04;color:#a16207"><b>ℹ️ Day Scholar Notice:</b> You are registered as a Day Scholar. Complaints regarding <b>Hostel, Food &amp; Mess, and Cleanliness</b> are exclusively reserved for students residing in the hostel. You can file complaints under <b>College</b>.</div>`
      : '') +
    `<div class="ttcard frm"><b style="font-size:18px">Raise a complaint</b>` +
    `<div class="two">` +
    `<div><label for="cfcat">Category</label><select id="cfcat">${COMPLAINT_CATEGORIES.map(c => {
      const isRestricted = !isHostelStudent && HOSTEL_ONLY_CATS.includes(c);
      return `<option value="${c}" ${c === complaintDraft.cat ? 'selected' : ''} ${isRestricted ? 'disabled' : ''}>${c}${isRestricted ? ' (Hostel residents only)' : ''}</option>`;
    }).join('')}</select></div>` +
    `<div><label for="cfloc">Location</label><select id="cfloc">${COMPLAINT_LOCATIONS.map(c => `<option ${c === complaintDraft.loc ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
    `</div>` +
    `<div class="form-preset-wrap">` +
    `<span class="preset-label">💡 Common Complaint Topics (tap to fill):</span>` +
    `<div class="preset-chips">` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Water supply disrupted and tap leaking in washroom:Hostel">🚿 Washroom Tap Leak</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Ceiling fan regulator broken and fan not rotating in room:Hostel">💨 Broken Fan</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Hostel Wi-Fi router no internet / high latency in wing:Hostel">📶 Wi-Fi Issue</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Dinner food served cold and unhygienic with slow refill:Food &amp; Mess">🍲 Food Served Cold</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Drinking water RO purifier empty and not dispensing clean water:Food &amp; Mess">🚰 RO Purifier</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Washrooms and washbasins require urgent deep cleaning:Cleanliness">🧹 Washrooms Uncleaned</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Corridor garbage bins overflowing with trash:Cleanliness">🗑️ Dustbins Full</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Classroom projector and AC unit not working during lectures:College">📽️ Projector / AC</button>` +
    `<button type="button" class="preset-chip" data-preset="cftxt:Library shortage of current semester syllabus textbooks:College">📚 Textbook Shortage</button>` +
    `</div></div>` +
    `<label for="cftxt">Describe the problem</label>` +
    `<textarea id="cftxt" placeholder="What is wrong, and since when?">${escapeHtml(complaintDraft.txt)}</textarea>` +
    `<label for="cphoto">Photo evidence (optional)</label>` +
    `<input type="file" id="cphoto" accept="image/*">` +
    `<div id="cpv">${photoData ? `<img src="${photoData}" alt="Evidence preview" style="max-width:100%;border-radius:10px;margin-top:8px">` : ''}</div>` +
    `<div class="note" style="margin-top:12px">⏱ Every complaint gets action within <b>7 days at most</b>.</div>` +
    `<div class="err" id="cferr" role="alert"></div>` +
    `<button class="btn" id="cfsub" type="button" style="width:100%">Submit complaint</button>${duplicatePrompt}` +
    `</div>`
  ) : '';

  return `<h2>Complaints &amp; Grievances</h2><p class="sub">Hostel, college and mess issues · Review fellow students' complaints, express opinions &amp; say "Me Too"</p>` +
    (message ? `<div class="item" style="margin-bottom:14px;border-color:#15803d">${message}</div>` : '') +
    filingBoxHtml +
    // --- Campus Community Complaints & Opinions ---
    `<div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 4px;flex-wrap:wrap;gap:8px">` +
    `<h3 style="margin:0">🏛️ Campus Complaints &amp; Peer Grievances</h3>` +
    `<span style="font-size:12px;color:var(--muted)">🌐 Visible across campus · Tap "Me Too" or share opinions</span>` +
    `</div>` +
    `<p class="sub" style="margin:0 0 10px">Every student complaint is visible here so fellow students can endorse issues and share opinions.</p>` +
    `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px">` +
    `<button type="button" class="preset-chip ${communityComplaintFilter === 'All' ? 'active' : ''}" data-cmp-filter="All">🏛️ All Campus (${communityList.length})</button>` +
    `<button type="button" class="preset-chip ${communityComplaintFilter === 'Mine' ? 'active' : ''}" data-cmp-filter="Mine">👤 My Complaints (${mine.length})</button>` +
    `<button type="button" class="preset-chip ${communityComplaintFilter === 'Hostel' ? 'active' : ''}" data-cmp-filter="Hostel">🏠 Hostel</button>` +
    `<button type="button" class="preset-chip ${communityComplaintFilter === 'Food & Mess' ? 'active' : ''}" data-cmp-filter="Food & Mess">🍲 Mess &amp; Food</button>` +
    `<button type="button" class="preset-chip ${communityComplaintFilter === 'College' ? 'active' : ''}" data-cmp-filter="College">📚 College &amp; Academic</button>` +
    `<button type="button" class="preset-chip ${communityComplaintFilter === 'Cleanliness' ? 'active' : ''}" data-cmp-filter="Cleanliness">🧹 Cleanliness</button>` +
    `</div>` +
    `<div class="list">` +
    (filteredList.length ? filteredList.map(c => {
      const cid = c.id;
      const isMineItem = isMine(c) || (c.login_id && c.login_id === userName());
      return `<div class="community-cmp-card" id="cmp-card-${cid}">` +
        `<div class="top"><b>${escapeHtml(c.title || c.t || 'Campus Grievance')}</b><span class="badge">${escapeHtml(c.category || c.cat || 'General')} · ${escapeHtml(c.location || c.loc || 'Campus')}</span></div>` +
        `<p style="margin:6px 0;font-size:13.5px;color:var(--text)">${escapeHtml(c.description || c.t || '')}</p>` +
        `<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);flex-wrap:wrap">` +
        `<span>👤 Filed by: <b>${escapeHtml(c.name || 'Anonymous Student')}</b></span>` +
        `<span>·</span>` +
        `<span>Status: <b style="color:var(--accent)">${escapeHtml(c.status || 'Open')}</b></span>` +
        (isMineItem ? `<span class="badge ok" style="font-size:10.5px">Your Complaint</span>` : '') +
        `</div>` +
        `<div class="me-too-action-bar">` +
        `<div class="me-too-count-tag"><span>👥</span> <b>${c.me_too_count || c.mt || 0}</b> student${(c.me_too_count || c.mt || 0) === 1 ? '' : 's'} said Me Too</div>` +
        `<div><button class="me-too-btn ${c.my_opinion ? 'active' : ''}" data-cmp-metoo="${cid}" type="button">${c.my_opinion ? '✓ You said Me Too' : '👍 Me Too'}</button></div>` +
        `</div>` +
        `<div class="opinions-drawer">` +
        `<div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Student Opinions:</div>` +
        ((c.opinions && c.opinions.length)
          ? c.opinions.map(op => `<div class="opinion-bubble-item"><b>${escapeHtml(op.user_name || 'Student')}:</b> “${escapeHtml(op.opinion)}”</div>`).join('')
          : `<p class="sub" style="margin:0 0 6px;font-size:11.5px">No opinions shared yet. Be the first to add your voice!</p>`) +
        `<div class="preset-chips" style="margin:6px 0">` +
        `<button type="button" class="preset-chip sm" data-cmp-quick="${cid}:Facing this exact problem in my room / wing!">Same in my wing!</button>` +
        `<button type="button" class="preset-chip sm" data-cmp-quick="${cid}:This issue has been persisting for several days">Persisting for days</button>` +
        `<button type="button" class="preset-chip sm" data-cmp-quick="${cid}:Urgent repair needed before exams">Urgent repair needed</button>` +
        `</div>` +
        `<div style="display:flex;gap:6px;margin-top:6px">` +
        `<input id="cmp-op-inp-${cid}" class="rec-reply-input" style="font-size:12px" placeholder="Add your opinion or experience…">` +
        `<button class="btn sm" data-cmp-post="${cid}" type="button" style="padding:4px 12px;font-size:12px;white-space:nowrap">Share Opinion</button>` +
        `</div></div></div>`;
    }).join('') : '<p class="sub">No grievances found under this filter.</p>') +
    `</div>` +
    closedSection +
    `<p class="demo" style="margin-top:16px">Evidence photos are compressed on device. Submitter identities strictly protected when filed anonymously.</p>`;
}

// File a complaint. force = true skips the duplicate check ("File anyway").
function fileComplaint(force) {
  const cat = $('cfcat').value, loc = $('cfloc').value, txt = $('cftxt').value.trim();
  complaintDraft = { cat, loc, txt };

  const isHostelStudent = Boolean(myHostelRecord());
  if (!isHostelStudent && HOSTEL_ONLY_CATS.includes(cat)) {
    $('cferr').textContent = 'Only students residing in the hostel can file complaints related to Hostel, Food & Mess, or Cleanliness. Day scholars can raise College complaints.';
    return;
  }

  if (txt.length < 10) { $('cferr').textContent = 'Please describe the problem in at least 10 characters.'; return; }

  // Look for a similar open complaint from someone else
  if (!force) {
    const dup = COMPLAINTS.findIndex(c => !isMine(c) && c.st < 3 && c.cat === cat && c.loc === loc);
    if (dup >= 0) { duplicateIndex = dup; render(); return; }
  }

  COMPLAINTS.unshift({ id: 'C-' + (200 + COMPLAINTS.length), cat, loc, t: txt.slice(0, 80), st: 0, mine: true, by: userName(), mt: 0, ts: Date.now(), photo: photoData });
  saveComplaints();
  if (typeof API !== 'undefined' && API.createComplaint) {
    API.createComplaint({
      category: cat,
      title: txt.slice(0, 80),
      description: txt,
      location: loc,
      is_anonymous: false
    }).then(() => {
      loadCommunityComplaints();
    }).catch(() => { });
  }
  complaintDraft = { cat: isHostelStudent ? 'Hostel' : 'College', loc: isHostelStudent ? 'Block A' : 'Library', txt: '' };
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
  const isHostelStudent = Boolean(myHostelRecord());
  const reviewMsg = studentReviewMsg; studentReviewMsg = '';

  return `<h2>Mess &amp; Hostel</h2><p class="sub">Today's menu · skip meals · submit feedback for Warden review</p>` +
    (reviewMsg ? `<div class="item" style="margin-bottom:14px;border-color:#15803d;color:#15803d"><b>${escapeHtml(reviewMsg)}</b></div>` : '') +
    `<div class="grid">` +
    `<div class="stat" style="cursor:default"><span>Meals skipped today</span><b>${skipped}</b><span>of ${MESS_MENU.length}</span></div>` +
    `<div class="stat" style="cursor:default"><span>Meals rated</span><b>${rated}</b><span>Quick feedback</span></div>` +
    `</div>` +
    (isHostelStudent
      ? `<div class="ttcard frm" style="margin-top:16px"><b style="font-size:16px">Rate Hostel, Mess &amp; Cleanliness</b>` +
      `<p class="sub" style="margin:2px 0 10px">Your reviews are submitted directly to the Warden (${escapeHtml(wardenHostel())}).</p>` +
      `<div class="two">` +
      `<div><label for="rfq">Mess Food Quality</label>` +
      `<select id="rfq"><option value="5">⭐⭐⭐⭐⭐ Excellent (5/5)</option><option value="4" selected>⭐⭐⭐⭐ Good (4/5)</option><option value="3">⭐⭐⭐ Average (3/5)</option><option value="2">⭐⭐ Poor (2/5)</option><option value="1">⭐ Very Bad (1/5)</option></select></div>` +
      `<div><label for="rcq">Cleanliness &amp; Hygiene</label>` +
      `<select id="rcq"><option value="5">⭐⭐⭐⭐⭐ Excellent (5/5)</option><option value="4" selected>⭐⭐⭐⭐ Good (4/5)</option><option value="3">⭐⭐⭐ Average (3/5)</option><option value="2">⭐⭐ Poor (2/5)</option><option value="1">⭐ Very Bad (1/5)</option></select></div>` +
      `</div>` +
      `<label for="rhq">Hostel Facilities &amp; Maintenance</label>` +
      `<select id="rhq"><option value="5">⭐⭐⭐⭐⭐ Excellent (5/5)</option><option value="4" selected>⭐⭐⭐⭐ Good (4/5)</option><option value="3">⭐⭐⭐ Average (3/5)</option><option value="2">⭐⭐ Poor (2/5)</option><option value="1">⭐ Very Bad (1/5)</option></select>` +
      `<div class="form-preset-wrap">` +
      `<span class="preset-label">💡 Common Suggestions (tap to select):</span>` +
      `<div class="preset-chips">` +
      `<button type="button" class="preset-chip" data-preset="rtxt:Food taste, spices and freshness were well balanced today.">😋 Food Taste Well Balanced</button>` +
      `<button type="button" class="preset-chip" data-preset="rtxt:Dinner was served cold and counter refill took over 20 minutes.">❄️ Dinner Cold / Slow Refill</button>` +
      `<button type="button" class="preset-chip" data-preset="rtxt:Breakfast puri and sabji was hot, hygienic and delicious.">🥞 Breakfast Fresh &amp; Tasty</button>` +
      `<button type="button" class="preset-chip" data-preset="rtxt:Mess dining tables and floor need frequent sanitization between batches.">🧼 Sanitization Needed</button>` +
      `<button type="button" class="preset-chip" data-preset="rtxt:Hostel RO drinking water dispenser needs filter cartridge replacement.">🚰 RO Filter Replacement</button>` +
      `<button type="button" class="preset-chip" data-preset="rtxt:Please include more variety of green vegetables and fresh salads in daily menu.">🥗 More Green Veggies</button>` +
      `</div></div>` +
      `<label for="rtxt">Your feedback &amp; suggestions (optional)</label>` +
      `<textarea id="rtxt" placeholder="Share your experience regarding food taste, hygiene or hostel amenities…"></textarea>` +
      `<button class="btn sm" data-srev type="button" style="margin-top:10px">Submit Review to Warden</button>` +
      `</div>`
      : `<div class="note" style="margin-top:16px;background:rgba(234,179,8,0.12);border-color:#ca8a04;color:#a16207"><b>ℹ️ Day Scholar Notice:</b> Mess and hostel reviews are exclusively available to hostel residents.</div>`
    ) +
    `<h3 style="margin:20px 0 8px">Today's Menu</h3><div class="list">` +
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

function submitStudentReview() {
  const isHostelStudent = Boolean(myHostelRecord());
  if (!isHostelStudent) {
    alert('Only hostel residents can submit reviews.');
    return;
  }
  const fq = parseInt($('rfq') ? $('rfq').value : '4') || 4;
  const cq = parseInt($('rcq') ? $('rcq').value : '4') || 4;
  const hq = parseInt($('rhq') ? $('rhq').value : '4') || 4;
  const txt = $('rtxt') ? $('rtxt').value.trim() : '';

  const me = myStudent() || {};
  const hRec = myHostelRecord() || {};
  const locStr = hRec.hostel || me.hostel || 'Block A';
  const loc = (locStr.split(',')[0] || 'Block A').trim();
  const room = (locStr.split(',')[1] || '').trim() || 'Resident';

  HOSTEL_REVIEWS.unshift({
    id: 'REV-' + Date.now().toString().slice(-6),
    roll: me.roll || userName().toUpperCase(),
    name: me.name || accountName() || userName(),
    loc,
    room,
    date: todayIso(),
    ts: Date.now(),
    foodRating: fq,
    cleanlinessRating: cq,
    hostelRating: hq,
    comment: txt,
    reply: ''
  });

  saveHostelReviews();
  studentReviewMsg = '✅ Thank you! Your review has been submitted to the Warden.';
  render();
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
  ["Student Year", "छात्र वर्ष", "ଛାତ୍ର ବର୍ଷ"],
  ["Year 1", "प्रथम वर्ष", "ପ୍ରଥମ ବର୍ଷ"],
  ["Year 2", "द्वितीय वर्ष", "ଦ୍ୱିତୀୟ ବର୍ଷ"],
  ["Year 3", "तृतीय वर्ष", "ତୃତୀୟ ବର୍ଷ"],
  ["Year 4", "चतुर्थ वर्ष", "ଚତୁର୍ଥ ବର୍ଷ"],
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
try { lang = localStorage.getItem('cc_lang') || 'en'; } catch (e) { }

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
  try { localStorage.setItem('cc_lang', value); } catch (e) { }
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
  if (e.target.id === 'resq') filterResources(e.target.value);
  const d = e.target.dataset || {};
  if (d.rcf) { rc.f[d.rcf] = e.target.value; if (e.target.tagName === 'SELECT') { rc.items = null; rcFetch('items'); render(); } }
  if (d.rcq) rc.reqForm[d.rcq] = e.target.value;
  if (d.rcd) {
    recDraft = recDraft || {
      visible: recState.profile ? recState.profile.visible : false, cgpa: recState.profile ? recState.profile.cgpa : '', backlogs: recState.profile ? String(recState.profile.backlogs) : '0',
      subjects: recState.profile ? recState.profile.subjects.join(', ') : '', skills: recState.profile ? recState.profile.skills.join(', ') : ''
    };
    recDraft[d.rcd] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  }
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
const POSITION_ROLE = {
  'Faculty': 'faculty', 'Mentor': 'faculty', 'Class Coordinator': 'faculty', 'Exam Cell Incharge': 'faculty',
  'HOD': 'hod', 'Principal': 'principal', 'Warden': 'warden', 'Placement Officer': 'placement_officer'
};

// Students are saved in localStorage ("cc_stud"). cr = class representative.
const STUDENTS = loadJson('cc_stud',
  [["CS23-0101", "Aarav Mohanty", "Block A, Room 102"], ["CS23-0107", "Ananya Das", "Block A, Room 205"], ["CS23-0119", "Rohit Behera", "Block B, Room 104"], ["CS23-0125", "Priya Sahu", "Block A, Room 108"],
  ["CS23-0131", "Sneha Nayak", "Block B, Room 210"], ["CS23-0138", "Kunal Panda", "Day Scholar"], ["CS23-0142", "Ishita Rout", "Block A, Room 301"], ["CS23-0150", "Debashish Jena", "Day Scholar"]]
    .map(r => ({ roll: r[0], name: r[1], course: 'B.Tech CSE', year: 3, batch: '2023–2027', cr: r[0] === 'CS23-0107', hostel: r[2] }))
    .concat([
      { roll: 'IT24-0011', name: 'Manas Pradhan', course: 'B.Tech IT', year: 2, batch: '2024–2028', cr: false, hostel: 'Block A, Room 112' },
      { roll: 'EC22-0034', name: 'Smita Barik', course: 'B.Tech ECE', year: 4, batch: '2022–2026', cr: false, hostel: 'Block B, Room 305' }
    ]));

// Staff members saved in "cc_staff"
const STAFF_LIST = loadJson('cc_staff', [
  { id: 'EMP-1024', name: 'Dr. A. Mishra', dept: 'CSE', pos: 'Mentor' },
  { id: 'EMP-1031', name: 'Prof. S. Das', dept: 'Mathematics', pos: 'Faculty' },
  { id: 'EMP-1040', name: 'Dr. R. Patra', dept: 'ECE', pos: 'HOD' },
  { id: 'EMP-1052', name: 'Ms. L. Roy', dept: 'English', pos: 'Faculty' },
  { id: 'EMP-1063', name: 'Dr. K. Sahu', dept: 'CSE', pos: 'Class Coordinator' },
  { id: 'EMP-1077', name: 'Ms. P. Nayak', dept: 'CSE', pos: 'Faculty' },
  { id: 'EMP-1085', name: 'Mr. B. Sahoo', dept: 'ECE', pos: 'Warden', hostel: 'Block A' }
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
const canonicalDept = dept => deptName(String(dept || '').replace(/^B\.?Tech\s+/i, '').trim());
const norm = v => String(v == null ? '' : v).toLowerCase();

// ----- Extra demo people: 20 students and 10 teachers -----
// They are added once to whatever is already saved (nothing is overwritten or duplicated).
const YEAR_BATCH = { 1: '2025–2029', 2: '2024–2028', 3: '2023–2027', 4: '2022–2026' };
const DEPT_MENTOR = {
  CSE: 'Dr. A. Mishra', IT: 'Dr. S. Mohapatra', ECE: 'Dr. R. Patra', EEE: 'Prof. N. Pattnaik',
  Mechanical: 'Dr. M. Rath', Civil: 'Ms. A. Biswal', MCA: 'Mr. T. Sethi', MBA: 'Dr. P. Kar'
};
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
  try { if (localStorage.getItem(flag)) return; } catch (e) { }
  extras.forEach(x => { if (!list.some(o => o[key] === x[key])) list.push(x); });
  saveJson(storeKey, list);
  try { localStorage.setItem(flag, '1'); } catch (e) { }
}
mergeSeed(STUDENTS, SEED_STUDENTS, 'roll', 'cc_seed_s1', 'cc_stud');
mergeSeed(STAFF_LIST, SEED_STAFF, 'id', 'cc_seed_t1', 'cc_staff');

// Achievements saved in "cc_ach". st = Pending | Verified | Rejected.
// vb = verified-by {n name, r role, at time}, eb = edited-by.
const ACHIEVEMENTS = loadJson('cc_ach', [
  {
    id: 1, who: 'You', roll: 'CS23-0142', title: 'NPTEL Gold: Data Structures', cat: 'Certification', date: '2026-08-12',
    desc: 'Scored 91% in the proctored exam.', link: '', st: 'Verified', vb: { n: 'Dr. A. Mishra', r: 'Teacher', at: 1786600000000 }, mine: true
  },
  {
    id: 2, who: 'Ananya Das', roll: 'CS23-0107', title: 'Smart India Hackathon finalist', cat: 'Hackathon', date: '2026-09-15',
    desc: 'Team of six, finalist at the nodal round.', link: '', st: 'Pending', mine: false
  },
  {
    id: 3, who: 'Rohit Behera', roll: 'CS23-0119', title: 'State level chess runner-up', cat: 'Sports', date: '2026-09-02',
    desc: 'Inter-college state championship.', link: '', st: 'Pending', mine: false
  }
]);
const ACHIEVEMENT_CATEGORIES = ['Hackathon', 'Certification', 'Sports', 'Paper / Research', 'Competition', 'Other'];

// [roll, name] pairs (used by attendance marking; scoped to teacher's department)
const studentPairs = () => {
  const staffDept = accountDept();
  if (staffDept && isStaffRole() && getRole() !== 'admin') {
    const cDept = canonicalDept(staffDept);
    const deptStudents = STUDENTS.filter(s => canonicalDept(s.course) === cDept);
    if (deptStudents.length > 0) return deptStudents.map(s => [s.roll, s.name]);
  }
  return STUDENTS.map(s => [s.roll, s.name]);
};

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
  accountsList = null;
  if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
  studentQuery = '';
  searchFilters['sq-stud'] = { dept: 'All', year: 'All' };
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
    API.request('/api/users/' + encodeURIComponent(s.roll), { method: 'DELETE' }).catch(() => { });
    if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
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
  accountsList = null;
  if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
  staffQuery = '';
  searchFilters['sq-staff'] = { dept: 'All', year: 'All' };
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
    API.request('/api/users/' + encodeURIComponent(x.id), { method: 'DELETE' }).catch(() => { });
    if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
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
let accQuery = '', accRoleFilter = '', accResults = null, accSearchSeq = 0, accSearchTimer = 0;   // Accounts search
let accCreds = null;   // login details to hand over, shown once right after creating an account / setting a password
const ACCOUNT_ROLE_LABEL = {
  student: 'Student', faculty: 'Faculty', hod: 'HOD', principal: 'Principal', warden: 'Warden',
  placement_officer: 'Placement officer', admin: 'Admin', guest: 'Guest / Recruiter'
};
// Random password without look-alike characters (no 0/O, 1/l/I)
const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, n => chars[n % chars.length]).join('');
};
const looksLikeEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Reconcile server accounts into STUDENTS and STAFF_LIST rosters so newly made people are searchable everywhere
function syncUsersToRosters(users) {
  if (!Array.isArray(users)) return;
  let studChanged = false, staffChanged = false;
  users.forEach(u => {
    if (!u || !u.login_id) return;
    const loginId = u.login_id.trim();
    if (u.role === 'student') {
      const idx = STUDENTS.findIndex(s => s.roll && (s.roll.toLowerCase() === loginId.toLowerCase() || cleanId(s.roll) === cleanId(loginId)));
      if (idx === -1) {
        STUDENTS.push({
          roll: loginId.toUpperCase(),
          name: u.name || loginId,
          course: 'B.Tech ' + (u.dept ? u.dept.toUpperCase() : 'CSE'),
          year: 1,
          batch: 'A',
          cr: false,
          ...(u.email ? { email: u.email } : {}),
          ...(u.hostel ? { hostel: u.hostel } : {})
        });
        studChanged = true;
      } else {
        if (u.hostel && !STUDENTS[idx].hostel) { STUDENTS[idx].hostel = u.hostel; studChanged = true; }
        if (u.email && !STUDENTS[idx].email) { STUDENTS[idx].email = u.email; studChanged = true; }
      }
    } else if (['faculty', 'warden', 'hod', 'principal', 'placement_officer'].includes(u.role)) {
      const idx = STAFF_LIST.findIndex(x => x.id && (x.id.toLowerCase() === loginId.toLowerCase() || cleanId(x.id) === cleanId(loginId)));
      const posMap = {
        faculty: 'Assistant Professor',
        warden: 'Warden',
        hod: 'HOD',
        principal: 'Principal',
        placement_officer: 'Placement Officer'
      };
      const deptMap = {
        warden: 'Hostel Administration',
        placement_officer: 'Placement Cell',
        principal: 'Executive Directorate'
      };
      const pos = posMap[u.role] || 'Assistant Professor';
      if (idx === -1) {
        STAFF_LIST.push({
          id: loginId.toUpperCase(),
          name: u.name || loginId,
          dept: u.dept || deptMap[u.role] || 'Academics',
          pos: pos,
          email: u.email || '',
          phone: u.phone || '',
          cabin: u.cabin || '',
          subjects: u.subjects || '',
          joined: todayIso(),
          ...(u.hostel ? { hostel: u.hostel } : {})
        });
        staffChanged = true;
      } else {
        if (u.hostel && !STAFF_LIST[idx].hostel) { STAFF_LIST[idx].hostel = u.hostel; staffChanged = true; }
        if (u.dept && (!STAFF_LIST[idx].dept || STAFF_LIST[idx].dept === 'Academics')) { STAFF_LIST[idx].dept = u.dept; staffChanged = true; }
        if (u.email && !STAFF_LIST[idx].email) { STAFF_LIST[idx].email = u.email; staffChanged = true; }
        if (u.phone && !STAFF_LIST[idx].phone) { STAFF_LIST[idx].phone = u.phone; staffChanged = true; }
        if (u.cabin && !STAFF_LIST[idx].cabin) { STAFF_LIST[idx].cabin = u.cabin; staffChanged = true; }
        if (u.subjects && !STAFF_LIST[idx].subjects) { STAFF_LIST[idx].subjects = u.subjects; staffChanged = true; }
      }
    }
  });
  if (studChanged) saveJson('cc_stud', STUDENTS);
  if (staffChanged) saveJson('cc_staff', STAFF_LIST);
}

async function loadAccounts() {
  if (accountsLoading) return;
  accountsLoading = true;
  accountsError = '';
  try {
    const res = await API.request('/api/users');
    accountsList = Array.isArray(res) ? res : [];
    syncUsersToRosters(accountsList);
  }
  catch (e) {
    accountsError = e.message || 'Cannot reach the server';
    if (!accountsList || !accountsList.length) {
      accountsList = fallbackAccountsList();
    }
  }
  finally {
    accountsLoading = false;
  }
  if (accQuery || accRoleFilter) {
    try { await runAccSearch(); } catch (err) { }
  }
  render();
}

function renderAccounts() {
  if (getRole() !== 'admin' || appData.tab !== 'accounts') { accCreds = null; return ''; }   // leaving the page hides the shown password
  if (accountsList === null) {
    loadAccounts();
    return `
      <div class="accounts-page">
        <div class="ac-page-hero">
          <div class="ac-hero-content">
            <h2>Login accounts & access</h2>
            <p class="sub">Loading accounts from server…</p>
          </div>
        </div>
        <div class="ttcard" style="text-align:center;padding:48px 20px;border-radius:16px">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <p class="sub" style="font-size:15px;margin:0">Loading accounts directory…</p>
        </div>
      </div>
    `;
  }
  const message = accountsMessage, error = accountsError;
  accountsMessage = ''; accountsError = '';

  return `
    <div class="accounts-page">
      ${renderAccountsHeader()}
      ${renderAccountsStats()}
      ${message ? successBox(message) : ''}
      ${error ? `<div class="err" role="alert" style="margin-bottom:16px">${escapeHtml(error)}</div>` : ''}
      ${accCreds ? renderAccountCredsCard(accCreds) : ''}
      ${renderAccountCreateCard()}
      ${renderAccountsDirectoryCard()}
    </div>
  `;
}

function renderAccountsHeader() {
  const count = (accountsList || []).length;
  return `
    <div class="ac-page-hero">
      <div class="ac-hero-content">
        <h2>Login accounts & access</h2>
        <p class="sub">${count} total registered accounts · Administer logins, roles, and credentials.</p>
      </div>
      <div class="ac-hero-note">
        <span>🔒 Passwords are stored scrambled. Nobody (including the admin) can read an existing password. To help someone who forgot theirs, tap <b>Set password</b> and give them the new one.</span>
      </div>
    </div>
  `;
}

function renderAccountsStats() {
  const list = accountsList || [];
  const total = list.length;
  const students = list.filter(u => u.role === 'student').length;
  const staff = list.filter(u => STAFF_ROLES.includes(u.role)).length;
  const admins = list.filter(u => u.role === 'admin').length;

  return `
    <div class="ac-stats-grid">
      <div class="ac-stat-card">
        <span class="ac-stat-num">${total}</span>
        <span class="ac-stat-label">Total accounts</span>
      </div>
      <div class="ac-stat-card">
        <span class="ac-stat-num ac-color-student">${students}</span>
        <span class="ac-stat-label">Students</span>
      </div>
      <div class="ac-stat-card">
        <span class="ac-stat-num ac-color-faculty">${staff}</span>
        <span class="ac-stat-label">Faculty & staff</span>
      </div>
      <div class="ac-stat-card">
        <span class="ac-stat-num ac-color-admin">${admins}</span>
        <span class="ac-stat-label">Admins</span>
      </div>
    </div>
  `;
}

// State for role-tailored account creation
let newAccountRole = 'student';
let newAccountDraft = {};

const ROLE_FORM_CONFIG = {
  student: {
    label: 'Student',
    icon: '🎓',
    theme: 'role-theme-student',
    badge: 'Undergraduate / Scholar',
    badgeColor: '#3b82f6',
    summary: 'Standard student account. Accesses timetables, attendance, grades, mess ratings, notices, and outpass requests.',
    idLabel: 'Roll Number / University Reg No.',
    idPlaceholder: 'e.g. 2101106042',
    emailPlaceholder: 'student@example.com (optional)',
    emailRequired: false,
    hasDept: true,
    deptRequired: false,
    deptLabel: 'Branch / Academic Stream',
    hasHostel: true,
    hostelRequired: false,
    hostelLabel: 'Hostel Accommodation (Optional)',
    hasYearBatch: true,
    hasCabin: false,
    hasSubjects: false,
    hasPhone: true,
    phoneLabel: 'Student / Parent Mobile',
    phonePlaceholder: '+91 98765 43210 (optional)',
    buttonLabel: 'Create Student Account'
  },
  faculty: {
    label: 'Faculty',
    icon: '👨‍🏫',
    theme: 'role-theme-faculty',
    badge: 'Teaching Faculty',
    badgeColor: '#06b6d4',
    summary: 'Academic instructor. Records student attendance, manages course syllabi, posts study materials, and answers academic queries.',
    idLabel: 'Faculty Employee ID',
    idPlaceholder: 'e.g. EMP-204 or FAC-CSE-09',
    emailPlaceholder: 'faculty.name@college.edu',
    emailRequired: false,
    hasDept: true,
    deptRequired: true,
    deptLabel: 'Academic Department',
    hasHostel: false,
    hasCabin: true,
    cabinLabel: 'Faculty Cabin / Room',
    cabinPlaceholder: 'e.g. Academic Block B-302',
    hasSubjects: true,
    subjectsLabel: 'Primary Teaching Subjects',
    subjectsPlaceholder: 'e.g. Data Structures, Operating Systems',
    hasPhone: true,
    phoneLabel: 'Official Contact Phone',
    phonePlaceholder: '+91 98765 00000 (optional)',
    buttonLabel: 'Create Faculty Account'
  },
  hod: {
    label: 'HOD',
    icon: '🏛️',
    theme: 'role-theme-hod',
    badge: 'Department Leadership',
    badgeColor: '#8b5cf6',
    summary: 'Head of Department. Oversees faculty teaching rosters, departmental classes, student performance, and approves leaves.',
    idLabel: 'HOD Employee ID',
    idPlaceholder: 'e.g. HOD-CSE or EMP-H01',
    emailPlaceholder: 'hod.cse@college.edu',
    emailRequired: false,
    hasDept: true,
    deptRequired: true,
    deptLabel: 'Headed Department',
    hasHostel: false,
    hasCabin: true,
    cabinLabel: 'HOD Office Suite / Chamber',
    cabinPlaceholder: 'HOD Suite, Dept of CSE, 1st Floor',
    hasSubjects: true,
    subjectsLabel: 'Department Courses / Specialization',
    subjectsPlaceholder: 'e.g. Advanced System Architecture',
    hasPhone: true,
    phoneLabel: 'Department Desk Phone',
    phonePlaceholder: '+91 94371 88888',
    buttonLabel: 'Create HOD Account'
  },
  warden: {
    label: 'Warden',
    icon: '🏢',
    theme: 'role-theme-warden',
    badge: 'Hostel Administration',
    badgeColor: '#f59e0b',
    summary: 'Hostel administrator. Oversees accommodation, curfews, wing rounds, and outpass approvals. No academic department required.',
    idLabel: 'Warden Employee ID',
    idPlaceholder: 'e.g. WAR-101 or EMP-W01',
    emailPlaceholder: 'warden.bh1@college.edu (optional)',
    emailRequired: false,
    hasDept: false,
    hasHostel: true,
    hostelRequired: true,
    hostelLabel: 'Assigned Hostel Block / Wing',
    hostelHint: 'Required: Warden must be assigned to an official hostel block.',
    hasCabin: false,
    hasSubjects: false,
    hasPhone: true,
    phoneLabel: 'Warden Duty Phone / Cell',
    phonePlaceholder: '+91 98765 43210',
    buttonLabel: 'Create Warden Account'
  },
  placement_officer: {
    label: 'Placement Officer',
    icon: '💼',
    theme: 'role-theme-placement_officer',
    badge: 'TPO Directorate',
    badgeColor: '#6366f1',
    summary: 'Campus Placement & Training officer. Coordinates recruiter visits, internship drives, and corporate inquiries. No teaching subjects.',
    idLabel: 'TPO Employee ID',
    idPlaceholder: 'e.g. TPO-01 or EMP-P01',
    emailPlaceholder: 'placements@college.edu',
    emailRequired: false,
    hasDept: false,
    hasHostel: false,
    hasCabin: true,
    cabinLabel: 'Placement Cell Office Room',
    cabinPlaceholder: 'Training & Placement Directorate, Room 204',
    hasSubjects: false,
    hasPhone: true,
    phoneLabel: 'Official Contact / Cell Phone',
    phonePlaceholder: '+91 94370 12345',
    buttonLabel: 'Create Placement Officer Account'
  },
  principal: {
    label: 'Principal',
    icon: '🎖️',
    theme: 'role-theme-principal',
    badge: 'Executive Directorate',
    badgeColor: '#ec4899',
    summary: 'Campus Principal & Executive Directorate. Holds institute-wide administrative visibility and oversight. No classroom assignments.',
    idLabel: 'Principal Employee ID',
    idPlaceholder: 'e.g. PRIN-01 or DIR-01',
    emailPlaceholder: 'principal@college.edu',
    emailRequired: false,
    hasDept: false,
    hasHostel: false,
    hasCabin: true,
    cabinLabel: 'Principal Executive Directorate Chamber',
    cabinPlaceholder: 'Executive Directorate, Admin Block 1st Floor',
    hasSubjects: false,
    hasPhone: true,
    phoneLabel: 'Directorate Desk Phone',
    phonePlaceholder: '+91 94371 00001',
    buttonLabel: 'Create Principal Account'
  },
  admin: {
    label: 'Admin',
    icon: '🛡️',
    theme: 'role-theme-admin',
    badge: 'Institutional Superuser',
    badgeColor: '#ef4444',
    summary: 'Full administrative credentials for managing users, overriding rosters, and system security. The email serves as the master Login ID.',
    emailPlaceholder: 'official.admin@college.edu (Required - Login ID)',
    emailRequired: true,
    hasDept: false,
    hasHostel: false,
    hasCabin: false,
    hasSubjects: false,
    hasDesig: true,
    desigLabel: 'Administrative Designation',
    desigPlaceholder: 'e.g. IT Cell Head / Registrar Office',
    hasPhone: true,
    phoneLabel: 'Emergency Contact Mobile',
    phonePlaceholder: '+91 99999 88888 (optional)',
    buttonLabel: 'Create Administrator Account'
  },
  guest: {
    label: 'Guest / Recruiter',
    icon: '💼',
    theme: 'role-theme-guest',
    badge: 'Corporate Talent Scout',
    badgeColor: '#4f46e5',
    summary: 'Corporate recruiter account for reviewing anonymous student project showcases, verified credentials, and scheduling hiring rounds.',
    idLabel: 'Recruiter Username / Login ID',
    idPlaceholder: 'e.g. recruiter_tcs or hr_microsoft',
    emailPlaceholder: 'talent.acquisition@company.com',
    emailRequired: false,
    hasDept: false,
    hasHostel: false,
    hasCompany: true,
    companyLabel: 'Hiring Company / Organization',
    companyPlaceholder: 'e.g. Tata Consultancy Services, Microsoft, Infosys',
    hasCabin: false,
    hasSubjects: false,
    hasPhone: true,
    phoneLabel: 'Recruiter Direct Contact Phone',
    phonePlaceholder: '+91 98000 12345 (optional)',
    buttonLabel: 'Create Recruiter Account'
  }
};

function saveNewAccountDraft() {
  const getVal = id => { const el = $(id); return el ? el.value : ''; };
  newAccountDraft = {
    name: getVal('acname') || newAccountDraft.name || '',
    id: getVal('acid') || newAccountDraft.id || '',
    email: getVal('acem') || newAccountDraft.email || '',
    dept: getVal('acdept') || newAccountDraft.dept || '',
    hostel: getVal('achostel') || newAccountDraft.hostel || '',
    phone: getVal('acphone') || newAccountDraft.phone || '',
    cabin: getVal('accabin') || newAccountDraft.cabin || '',
    subjects: getVal('acsubjects') || newAccountDraft.subjects || '',
    year: getVal('acyear') || newAccountDraft.year || '1',
    batch: getVal('acbatch') || newAccountDraft.batch || 'A',
    company: getVal('accompany') || newAccountDraft.company || '',
    desig: getVal('acdesig') || newAccountDraft.desig || '',
    password: getVal('acpw') || newAccountDraft.password || ''
  };
}

function renderAccountCredsCard(creds) {
  return `
    <div class="ttcard cred">
      <b style="font-size:17px">Share these login details</b>
      ${creds.roleLabel ? `<p>Role: <b>${escapeHtml(creds.roleLabel)}</b></p>` : ''}
      <p>Name: <b>${escapeHtml(creds.name)}</b></p>
      <p>Login ID: <code>${escapeHtml(creds.loginId)}</code></p>
      <p>Password: <code>${escapeHtml(creds.password)}</code></p>
      <div class="btns" style="margin-top:10px">
        <button class="btn sm" data-acc="copy" data-text="${escapeHtml((creds.roleLabel ? 'Role: ' + creds.roleLabel + '\n' : '') + 'Login ID: ' + creds.loginId + '\nPassword: ' + creds.password)}" type="button">Copy</button>
        <button class="btn ghost sm" data-acc="credhide" type="button">Hide</button>
      </div>
      <p class="demo">This is the only time the password is shown. Ask the person to change it after signing in.</p>
    </div>
  `;
}

function renderAccountCreateCard() {
  const cfg = ROLE_FORM_CONFIG[newAccountRole] || ROLE_FORM_CONFIG.student;
  const draft = newAccountDraft || {};

  // Build the visual role chips
  const roleChipsHtml = Object.entries(ROLE_FORM_CONFIG).map(([rKey, rCfg]) => `
    <button type="button" class="ac-role-chip ${newAccountRole === rKey ? 'on' : ''}" data-ac-role-select="${rKey}">
      <span class="ac-role-chip-icon">${rCfg.icon}</span>
      <span>${rCfg.label}</span>
    </button>
  `).join('');

  // Department field (only for roles with hasDept)
  let deptFieldHtml = '';
  if (cfg.hasDept) {
    if (newAccountRole === 'faculty' || newAccountRole === 'hod') {
      const depts = ['CSE', 'ECE', 'EE', 'ME', 'Civil', 'MCA', 'Basic Science & Humanities'];
      const curDept = draft.dept || 'CSE';
      deptFieldHtml = `
        <div class="ac-form-group">
          <label for="acdept">${cfg.deptLabel} <span class="ac-req-star">*</span></label>
          <select id="acdept">
            ${depts.map(d => `<option value="${d}" ${curDept === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
          <span class="ac-field-note">Academic department assignment for timetable and syllabus</span>
        </div>
      `;
    } else {
      deptFieldHtml = `
        <div class="ac-form-group">
          <label for="acdept">${cfg.deptLabel}</label>
          <input id="acdept" value="${escapeHtml(draft.dept || '')}" placeholder="e.g. CSE or ECE">
          <span class="ac-field-note">Academic stream or major branch</span>
        </div>
      `;
    }
  }

  // Hostel field (only for roles with hasHostel)
  let hostelFieldHtml = '';
  if (cfg.hasHostel) {
    const hostels = ['Boys Hostel 1 (Satpura)', 'Boys Hostel 2 (Nilgiri)', 'Girls Hostel 1 (Kaveri)', 'Girls Hostel 2 (Ganga)', 'Block A', 'Block B'];
    if (newAccountRole === 'warden') {
      const curHostel = draft.hostel || hostels[0];
      hostelFieldHtml = `
        <div class="ac-form-group">
          <label for="achostel">${cfg.hostelLabel} <span class="ac-req-star">*</span></label>
          <input id="achostel" list="hostelOptions" value="${escapeHtml(draft.hostel || curHostel)}" placeholder="e.g. Boys Hostel 1 (Satpura)">
          <datalist id="hostelOptions">
            ${hostels.map(h => `<option value="${h}"></option>`).join('')}
          </datalist>
          <span class="ac-field-note">${cfg.hostelHint || 'Required for hostel gate passes and wing management'}</span>
        </div>
      `;
    } else {
      hostelFieldHtml = `
        <div class="ac-form-group">
          <label for="achostel">${cfg.hostelLabel}</label>
          <input id="achostel" list="hostelOptions" value="${escapeHtml(draft.hostel || '')}" placeholder="e.g. Block A, Kaveri, or leave blank for Day Scholar">
          <datalist id="hostelOptions">
            ${hostels.map(h => `<option value="${h}"></option>`).join('')}
          </datalist>
          <span class="ac-field-note">Leave empty if student is a Day Scholar</span>
        </div>
      `;
    }
  }

  // Cabin / Office room (for faculty, hod, placement, principal)
  let cabinFieldHtml = '';
  if (cfg.hasCabin) {
    cabinFieldHtml = `
      <div class="ac-form-group">
        <label for="accabin">${cfg.cabinLabel}</label>
        <input id="accabin" value="${escapeHtml(draft.cabin || '')}" placeholder="${cfg.cabinPlaceholder}">
        <span class="ac-field-note">Campus office location displayed in staff directory</span>
      </div>
    `;
  }

  // Teaching subjects (faculty, hod)
  let subjectsFieldHtml = '';
  if (cfg.hasSubjects) {
    subjectsFieldHtml = `
      <div class="ac-form-group ac-span-2">
        <label for="acsubjects">${cfg.subjectsLabel}</label>
        <input id="acsubjects" value="${escapeHtml(draft.subjects || '')}" placeholder="${cfg.subjectsPlaceholder}">
        <span class="ac-field-note">Comma-separated course names or lecture subjects</span>
      </div>
    `;
  }

  // Company name (for guest / recruiter)
  let companyFieldHtml = '';
  if (cfg.hasCompany) {
    companyFieldHtml = `
      <div class="ac-form-group">
        <label for="accompany">${cfg.companyLabel} <span class="ac-req-star">*</span></label>
        <input id="accompany" value="${escapeHtml(draft.company || '')}" placeholder="${cfg.companyPlaceholder}">
        <span class="ac-field-note">Official hiring corporate or placement partner name</span>
      </div>
    `;
  }

  // Administrative designation (for admin)
  let desigFieldHtml = '';
  if (cfg.hasDesig) {
    desigFieldHtml = `
      <div class="ac-form-group">
        <label for="acdesig">${cfg.desigLabel}</label>
        <input id="acdesig" value="${escapeHtml(draft.desig || '')}" placeholder="${cfg.desigPlaceholder}">
        <span class="ac-field-note">Administrative post or institute office designation</span>
      </div>
    `;
  }

  // Year & Batch (for student)
  let yearBatchFieldHtml = '';
  if (cfg.hasYearBatch) {
    yearBatchFieldHtml = `
      <div class="ac-form-group">
        <label for="acyear">Current Academic Year</label>
        <select id="acyear">
          <option value="1" ${draft.year === '1' ? 'selected' : ''}>Year 1 (Freshman)</option>
          <option value="2" ${draft.year === '2' ? 'selected' : ''}>Year 2 (Sophomore)</option>
          <option value="3" ${draft.year === '3' ? 'selected' : ''}>Year 3 (Pre-final)</option>
          <option value="4" ${draft.year === '4' ? 'selected' : ''}>Year 4 (Final Year)</option>
        </select>
      </div>
      <div class="ac-form-group">
        <label for="acbatch">Class Section / Batch</label>
        <select id="acbatch">
          <option value="A" ${draft.batch === 'A' ? 'selected' : ''}>Section A</option>
          <option value="B" ${draft.batch === 'B' ? 'selected' : ''}>Section B</option>
          <option value="C" ${draft.batch === 'C' ? 'selected' : ''}>Section C</option>
          <option value="D" ${draft.batch === 'D' ? 'selected' : ''}>Section D</option>
        </select>
      </div>
    `;
  }

  // Login ID / Roll / Emp ID (not needed for Admin, since email is login ID)
  let idFieldHtml = '';
  if (newAccountRole !== 'admin') {
    idFieldHtml = `
      <div class="ac-form-group">
        <label for="acid">${cfg.idLabel} <span class="ac-req-star">*</span></label>
        <input id="acid" value="${escapeHtml(draft.id || '')}" placeholder="${cfg.idPlaceholder}">
        <span class="ac-field-note">Used by user to sign in to the portal</span>
      </div>
    `;
  }

  // Phone field (if cfg.hasPhone)
  let phoneFieldHtml = '';
  if (cfg.hasPhone) {
    phoneFieldHtml = `
      <div class="ac-form-group">
        <label for="acphone">${cfg.phoneLabel}</label>
        <input id="acphone" type="tel" value="${escapeHtml(draft.phone || '')}" placeholder="${cfg.phonePlaceholder}">
        <span class="ac-field-note">Contact number for official communications / SMS</span>
      </div>
    `;
  }

  return `
    <div class="ttcard ac-create-card ${cfg.theme}">
      <div class="ac-card-header">
        <div class="ac-card-header-title">
          <span class="ac-icon-badge" aria-hidden="true">${cfg.icon}</span>
          <div>
            <b>Add a login account</b>
            <p class="ac-card-header-sub">Role determines required fields, permissions, and institutional scopes.</p>
          </div>
        </div>
      </div>

      <!-- Quick Role Switcher Chips -->
      <div class="ac-role-picker" role="radiogroup" aria-label="Select Account Role">
        ${roleChipsHtml}
      </div>

      <!-- Dynamic Role Banner Context -->
      <div class="ac-role-banner">
        <span class="ac-role-banner-icon">${cfg.icon}</span>
        <div style="flex:1">
          <div class="ac-role-banner-title">
            <span>${cfg.label} Profile</span>
            <span class="ac-role-banner-badge" style="background:${cfg.badgeColor}22;color:${cfg.badgeColor};border:1px solid ${cfg.badgeColor}44">
              ${cfg.badge}
            </span>
          </div>
          <p class="ac-role-banner-desc">${cfg.summary}</p>
        </div>
      </div>

      <div class="ac-form-grid">
        <!-- Account Type Selector (stays in sync) -->
        <div class="ac-form-group">
          <label for="acrole">Account Type Role</label>
          <select id="acrole">
            ${Object.entries(ACCOUNT_ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${newAccountRole === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>

        <!-- Full Name -->
        <div class="ac-form-group">
          <label for="acname">${newAccountRole === 'guest' ? 'Recruiter / Representative Name' : 'Full Name'} <span class="ac-req-star">*</span></label>
          <input id="acname" value="${escapeHtml(draft.name || '')}" placeholder="${newAccountRole === 'guest' ? 'e.g. Priya Sharma' : 'Full legal name'}">
        </div>

        ${companyFieldHtml}
        ${idFieldHtml}

        <!-- Email -->
        <div class="ac-form-group">
          <label for="acem">
            ${newAccountRole === 'admin' ? 'Administrator Email' : newAccountRole === 'guest' ? 'Corporate Email' : 'Email Address'}
            ${cfg.emailRequired ? '<span class="ac-req-star">*</span>' : ''}
          </label>
          <input id="acem" type="email" value="${escapeHtml(draft.email || '')}" placeholder="${cfg.emailPlaceholder}">
          <span class="ac-field-note">${newAccountRole === 'admin' ? 'This email address is required and serves as the Admin Login ID' : 'Used for password recovery and notifications'}</span>
        </div>

        ${desigFieldHtml}
        ${phoneFieldHtml}
        ${deptFieldHtml}
        ${hostelFieldHtml}
        ${yearBatchFieldHtml}
        ${cabinFieldHtml}
        ${subjectsFieldHtml}

        <!-- Password -->
        <div class="ac-form-group ac-span-2">
          <label for="acpw">Login Password <span class="ac-req-star">*</span></label>
          <div class="ac-pw-row">
            <input id="acpw" autocomplete="off" value="${escapeHtml(draft.password || '')}" placeholder="At least 6 characters. Hand this over to the user.">
            <button class="btn ghost sm" data-acc="gen" data-target="acpw" type="button">Generate password</button>
          </div>
          <span class="ac-field-note">Secure initial password for first-time account login</span>
        </div>
      </div>

      <div class="err" id="acerr" role="alert"></div>
      <button class="btn" id="accadd" type="button" style="width:100%;margin-top:14px">
        ${cfg.buttonLabel || 'Create account'} →
      </button>
    </div>
  `;
}

function renderAccountsDirectoryCard() {
  return `
    <div class="ac-directory-card">
      <div class="ac-dir-header">
        <div class="ac-dir-title-row">
          <div class="ac-dir-title">
            <span class="ac-icon-badge" aria-hidden="true">👥</span>
            <div>
              <h3>All accounts</h3>
              <p class="ac-dir-sub">Filter and search across all system users</p>
            </div>
          </div>
          <span class="ac-count-badge ${accQuery || accRoleFilter ? 'has-filter' : ''}" id="account" aria-live="polite">${accCountText()}</span>
        </div>
      </div>
      ${accSearchBar()}
      <div class="ac-list" id="aclist">
        ${accRows()}
      </div>
    </div>
  `;
}

function fallbackAccountsList() {
  const list = [];
  const myId = userName() || 'admin';
  const myRole = getRole() || 'admin';
  const myName = accountName() || myId;
  list.push({ id: 1, login_id: myId, name: myName, role: myRole, me: true });

  if (Array.isArray(STAFF_LIST)) {
    STAFF_LIST.forEach((st, i) => {
      if (st && st.id && !list.some(x => x.login_id.toLowerCase() === st.id.toLowerCase())) {
        const posMap = {
          'Assistant Professor': 'faculty', 'Associate Professor': 'faculty', 'Professor': 'faculty',
          'HOD': 'hod', 'Principal': 'principal', 'Warden': 'warden', 'Placement Officer': 'placement_officer'
        };
        const r = posMap[st.pos] || 'faculty';
        list.push({ id: 100 + i, login_id: st.id, name: st.name || st.id, role: r, dept: st.dept || '', email: st.email || '', hostel: st.hostel || '' });
      }
    });
  }

  if (Array.isArray(STUDENTS)) {
    STUDENTS.forEach((s, i) => {
      if (s && s.roll && !list.some(x => x.login_id.toLowerCase() === s.roll.toLowerCase())) {
        list.push({ id: 1000 + i, login_id: s.roll, name: s.name || s.roll, role: 'student', dept: s.course || '', email: s.email || '', hostel: s.hostel || '' });
      }
    });
  }

  return list;
}

const accBase = () => (accQuery || accRoleFilter) && accResults ? accResults : (accountsList || []);

function accSearchBar() {
  const isFiltered = Boolean(accQuery || accRoleFilter);
  const activeRoleName = accRoleFilter ? (ACCOUNT_ROLE_LABEL[accRoleFilter] || accRoleFilter) : '';

  return `
    <div class="acsearch" role="search">
      <div class="acsearch-row">
        <div class="acsearch-field">
          <svg class="acsearch-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input id="acq" type="search" value="${escapeHtml(accQuery)}" placeholder="Search name, roll no., employee ID, email, department…" autocomplete="off" aria-label="Search accounts">
          <span class="ac-kbd-hint" aria-hidden="true">/</span>
          <button class="acclr-btn" id="acclr" type="button" title="Clear search" aria-label="Clear search" style="${accQuery ? '' : 'display:none;'}">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="acfilter-field">
          <select id="acfilter" aria-label="Filter by account type">
            <option value="">All account types</option>
            ${Object.entries(ACCOUNT_ROLE_LABEL).map(([v, l]) => `<option value="${v}"${accRoleFilter === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
          <svg class="acfilter-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>
      <div class="ac-chips-wrap">
        <div class="ac-chips" role="group" aria-label="Quick filter by role">
          <button class="chip ${!accRoleFilter ? 'on' : ''}" data-acrole="" type="button">All roles</button>
          ${Object.entries(ACCOUNT_ROLE_LABEL).map(([v, l]) => `<button class="chip ${accRoleFilter === v ? 'on' : ''}" data-acrole="${v}" type="button">${l}</button>`).join('')}
        </div>
      </div>
      <div class="ac-active-strip" id="acactivestrip" style="${isFiltered ? 'display:flex;' : 'display:none;'}">
        <span class="ac-active-text">
          Active filter:
          ${activeRoleName ? `<b>Role: ${escapeHtml(activeRoleName)}</b>` : ''}
          ${activeRoleName && accQuery ? ' · ' : ''}
          ${accQuery ? `<b>“${escapeHtml(accQuery)}”</b>` : ''}
        </span>
        <button class="ac-reset-link" id="acreset" type="button">✕ Reset all filters</button>
      </div>
    </div>
  `;
}

function accCountText() {
  if (!accountsList) return 'Loading…';
  if (!(accQuery || accRoleFilter)) return (accountsList.length) + ' accounts';
  const n = (accResults || []).length;
  const label = accRoleFilter ? (ACCOUNT_ROLE_LABEL[accRoleFilter] || accRoleFilter) : '';
  let str = `${n} ${n === 1 ? 'account' : 'accounts'}`;
  if (label && accQuery) str += ` · ${label} · “${escapeHtml(accQuery)}”`;
  else if (label) str += ` · ${label}`;
  else if (accQuery) str += ` · “${escapeHtml(accQuery)}”`;
  return str;
}

// Highlight the searched words inside a result
const accMark = text => (typeof gHighlight === 'function' && accQuery && accQuery.trim()) ? gHighlight(text, accQuery.toLowerCase().split(/\s+/).filter(Boolean)) : escapeHtml(text);

function accInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ACC_ROLE_CLASSES = {
  admin: 'ac-badge-admin',
  faculty: 'ac-badge-faculty',
  hod: 'ac-badge-hod',
  principal: 'ac-badge-principal',
  warden: 'ac-badge-warden',
  placement_officer: 'ac-badge-placement',
  student: 'ac-badge-student',
  guest: 'ac-badge-guest'
};

function renderAccountCard(u) {
  const who = u => escapeHtml(u.login_id);
  const initials = accInitials(u.name);
  const roleClass = ACC_ROLE_CLASSES[u.role] || 'ac-badge-default';
  const roleLabel = ACCOUNT_ROLE_LABEL[u.role] || u.role;
  const metaItems = [];
  if (u.login_id) metaItems.push(`<span>ID: <b>${accMark(u.login_id)}</b></span>`);
  if (u.email && u.email !== u.login_id) metaItems.push(`<span>✉️ ${accMark(u.email)}</span>`);
  if (u.dept) metaItems.push(`<span>🏛️ ${accMark(u.dept)}</span>`);
  if (u.hostel) metaItems.push(`<span>🏠 ${accMark(u.hostel)}</span>`);

  return `
    <div class="ac-user-card ${u.me ? 'is-me' : ''}">
      <div class="ac-card-main">
        <div class="ac-avatar ${roleClass}" aria-hidden="true">${initials}</div>
        <div class="ac-user-info">
          <div class="ac-user-header">
            <span class="ac-user-name">${accMark(u.name)}${u.me ? ' <span class="ac-you-tag">(you)</span>' : ''}</span>
            <span class="ac-role-badge ${roleClass}">${escapeHtml(roleLabel)}</span>
            ${u.has_login === false ? '<span class="ac-no-login-badge">No login yet</span>' : ''}
          </div>
          ${u.detail ? `<div class="ac-user-sub">${accMark(u.detail)}</div>` : ''}
          <div class="ac-meta-row">
            ${metaItems.join('<span class="ac-meta-dot">·</span>')}
          </div>
        </div>
      </div>
      <div class="ac-card-actions">
        ${u.has_login === false
      ? `<button class="btn sm" data-acc="prefill" data-who="${who(u)}" type="button">Create login</button>`
      : pwEditing === u.login_id
        ? `<div class="ac-pw-box">
              <label for="acnewpw">New password</label>
              <div class="ac-pw-input-row">
                <input id="acnewpw" autocomplete="off" placeholder="At least 6 characters">
                <button class="btn ghost sm" data-acc="gen" data-target="acnewpw" type="button">Generate</button>
              </div>
              <div class="err" id="acpwerr" role="alert"></div>
              <div class="btns" style="margin-top:8px">
                <button class="btn sm" data-acc="pwsave" data-who="${who(u)}" type="button">Save password</button>
                <button class="btn ghost sm" data-acc="pwcancel" type="button">Cancel</button>
              </div>
            </div>`
        : `<div class="btns" style="gap:6px">
              <button class="btn ghost sm" data-acc="pw" data-who="${who(u)}" type="button">Set password</button>
              ${u.me ? '' : `<button class="btn ghost sm ac-rm-btn" data-acc="rm" data-who="${who(u)}" type="button">${accRemoveConfirm === u.login_id ? 'Tap again to confirm' : 'Remove'}</button>`}
            </div>`
    }
      </div>
    </div>
  `;
}

function accRows() {
  const list = accBase() || [], searching = accQuery || accRoleFilter;
  if (searching && !list.length) return `
    <div class="ac-empty-box">
      <span class="ac-empty-icon" aria-hidden="true">🔍</span>
      <h4 class="ac-empty-title">No matching accounts found</h4>
      <p class="ac-empty-desc">No accounts match${accQuery ? ' “' + escapeHtml(accQuery) + '”' : ''}. Check your search term or try a different filter.</p>
      <div style="margin-top:8px"><button class="btn ghost sm" id="acreset" type="button">Clear all filters</button></div>
    </div>
  `;
  return list.map(u => renderAccountCard(u)).join('');
}


async function runAccSearch() {
  const seq = ++accSearchSeq;
  try {
    const res = await API.request('/api/users/search?q=' + encodeURIComponent(accQuery) + '&role=' + encodeURIComponent(accRoleFilter));
    if (seq === accSearchSeq) accResults = res;       // ignore answers that arrive after a newer search
  } catch (e) {                                       // server unreachable: filter what is already loaded
    if (seq !== accSearchSeq) return;
    const toks = accQuery.toLowerCase().split(/\s+/).filter(Boolean);
    accResults = (accountsList || []).filter(u => {
      if (accRoleFilter && u.role !== accRoleFilter) return false;
      const hay = [u.name, u.login_id, cleanId(u.login_id), u.email, u.role, ACCOUNT_ROLE_LABEL[u.role], u.dept, u.hostel].join(' ').toLowerCase();
      const hClean = cleanId(hay);
      return toks.every(t => hay.includes(t) || (cleanId(t).length >= 2 && hClean.includes(cleanId(t))));
    });
  }
}

// Redraw only the list (not the whole page) so the search box keeps focus while typing
function accRefreshList() {
  const box = $('aclist'), cnt = $('account');
  if (box) { box.innerHTML = accRows(); translatePage(box); }
  if (cnt) {
    cnt.innerHTML = accCountText();
    cnt.classList.toggle('has-filter', Boolean(accQuery || accRoleFilter));
  }
  const clr = $('acclr');
  if (clr) clr.style.display = accQuery ? 'inline-flex' : 'none';
  const strip = $('acactivestrip');
  if (strip) {
    const isFiltered = Boolean(accQuery || accRoleFilter);
    strip.style.display = isFiltered ? 'flex' : 'none';
    const textEl = strip.querySelector('.ac-active-text');
    if (textEl) {
      const activeRoleName = accRoleFilter ? (ACCOUNT_ROLE_LABEL[accRoleFilter] || accRoleFilter) : '';
      let parts = [];
      if (activeRoleName) parts.push(`Role: <b>${escapeHtml(activeRoleName)}</b>`);
      if (accQuery) parts.push(`“<b>${escapeHtml(accQuery)}</b>”`);
      textEl.innerHTML = `Active filter: ${parts.join(' · ')}`;
    }
  }
}

async function accRunAndRefresh() {
  if (accQuery || accRoleFilter) await runAccSearch(); else { accResults = null; accSearchSeq++; }
  accRefreshList();
}
document.addEventListener('input', e => {
  if (e.target.id !== 'acq') return;
  accQuery = e.target.value.trim();
  const clr = $('acclr');
  if (clr) clr.style.display = e.target.value ? 'inline-flex' : 'none';
  clearTimeout(accSearchTimer);
  accSearchTimer = setTimeout(accRunAndRefresh, 200);
});
document.addEventListener('change', e => {
  if (e.target.id === 'acrole') {
    saveNewAccountDraft();
    newAccountRole = e.target.value;
    render();
    return;
  }
  if (e.target.id !== 'acfilter') return;
  accRoleFilter = e.target.value;
  document.querySelectorAll('[data-acrole]').forEach(c => c.classList.toggle('on', (c.dataset.acrole || '') === accRoleFilter));
  accRunAndRefresh();
});
document.addEventListener('click', e => {
  const roleSelectChip = e.target.closest && e.target.closest('[data-ac-role-select]');
  if (roleSelectChip) {
    saveNewAccountDraft();
    newAccountRole = roleSelectChip.dataset.acRoleSelect;
    render();
    return;
  }
  const chip = e.target.closest && e.target.closest('[data-acrole]');
  if (chip) {
    accRoleFilter = chip.dataset.acrole || '';
    const sel = $('acfilter');
    if (sel) sel.value = accRoleFilter;
    document.querySelectorAll('[data-acrole]').forEach(c => c.classList.toggle('on', (c.dataset.acrole || '') === accRoleFilter));
    accRunAndRefresh();
    return;
  }
  if (e.target && (e.target.id === 'acreset' || (e.target.closest && e.target.closest('#acreset')))) {
    accQuery = '';
    accRoleFilter = '';
    const inp = $('acq');
    if (inp) inp.value = '';
    const sel = $('acfilter');
    if (sel) sel.value = '';
    document.querySelectorAll('[data-acrole]').forEach(c => c.classList.toggle('on', (c.dataset.acrole || '') === ''));
    const clr = $('acclr');
    if (clr) clr.style.display = 'none';
    accRunAndRefresh();
    return;
  }
  if (e.target && (e.target.id === 'acclr' || (e.target.closest && e.target.closest('#acclr')))) {
    accQuery = '';
    const inp = $('acq');
    if (inp) { inp.value = ''; inp.focus(); }
    const clr = $('acclr');
    if (clr) clr.style.display = 'none';
    accRunAndRefresh();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && !e.target.closest('input,textarea,select')) {
    const acq = $('acq');
    if (acq && appData.tab === 'accounts' && getRole() === 'admin') {
      e.preventDefault();
      acq.focus();
    }
  }
});

async function addAccount() {
  const role = $('acrole') ? $('acrole').value : newAccountRole;
  const cfg = ROLE_FORM_CONFIG[role] || ROLE_FORM_CONFIG.student;
  const name = $('acname') ? $('acname').value.trim() : '';
  let loginId = $('acid') ? $('acid').value.trim() : '';
  const email = $('acem') ? $('acem').value.trim() : '';
  const password = $('acpw') ? $('acpw').value : '';
  const errBox = $('acerr');

  if (name.length < 2) {
    if (errBox) errBox.textContent = 'Enter the full name.';
    return;
  }

  // Admin validation (email is login ID)
  if (role === 'admin') {
    if (!looksLikeEmail(email)) {
      if (errBox) errBox.textContent = 'An administrator account requires a valid email. It serves as the Login ID.';
      return;
    }
    loginId = email;
  } else {
    if (!/^[A-Za-z0-9._-]{3,}$/.test(loginId)) {
      if (errBox) errBox.textContent = 'Enter a valid ' + (cfg.idLabel || 'login ID') + ' (letters, numbers, dashes, at least 3 chars).';
      return;
    }
    if (email && !looksLikeEmail(email)) {
      if (errBox) errBox.textContent = 'Enter a valid email address or leave it empty.';
      return;
    }
  }

  // Role-specific field values and requirements
  let dept = $('acdept') ? $('acdept').value.trim() : '';
  let hostel = $('achostel') ? $('achostel').value.trim() : '';
  const phone = $('acphone') ? $('acphone').value.trim() : '';
  const cabin = $('accabin') ? $('accabin').value.trim() : '';
  const subjects = $('acsubjects') ? $('acsubjects').value.trim() : '';
  const company = $('accompany') ? $('accompany').value.trim() : '';

  if (role === 'warden') {
    dept = ''; // Warden does NOT have an academic department
    if (!hostel) {
      if (errBox) errBox.textContent = 'Please enter or select the assigned hostel block for the warden.';
      return;
    }
  } else if (role === 'placement_officer' || role === 'principal' || role === 'guest' || role === 'admin') {
    dept = ''; // Non-teaching officers do NOT have an academic department
    hostel = '';
  } else if (role === 'faculty' || role === 'hod') {
    hostel = ''; // Faculty/HOD do NOT have hostel blocks
    if (!dept) {
      if (errBox) errBox.textContent = 'Department is required for ' + cfg.label + '.';
      return;
    }
  }

  if (password.length < 6) {
    if (errBox) errBox.textContent = 'Password must be at least 6 characters.';
    return;
  }

  const addBtn = $('accadd');
  if (addBtn) addBtn.disabled = true;

  try {
    await API.request('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        login_id: loginId,
        name: (role === 'guest' && company && !name.includes(company)) ? `${name} (${company})` : name,
        role,
        password,
        email,
        dept,
        hostel,
        phone
      })
    });
  } catch (e) {
    if (addBtn) addBtn.disabled = false;
    if (errBox) errBox.textContent = e.message;
    return;
  }

  accCreds = { name, loginId: loginId.toLowerCase(), password, roleLabel: cfg.label };
  accountsMessage = '✅ ' + escapeHtml(cfg.label) + ' account created for ' + escapeHtml(name) + '. Login ID: ' + escapeHtml(loginId.toLowerCase());

  // Synchronize immediately into STUDENTS / STAFF_LIST rosters!
  syncUsersToRosters([{
    login_id: loginId,
    name: (role === 'guest' && company && !name.includes(company)) ? `${name} (${company})` : name,
    role,
    email,
    dept,
    hostel,
    phone,
    cabin,
    subjects
  }]);

  newAccountDraft = {};
  studentQuery = '';
  searchFilters['sq-stud'] = { dept: 'All', year: 'All' };
  staffQuery = '';
  searchFilters['sq-staff'] = { dept: 'All', year: 'All' };
  accountsList = null;
  if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
  render();
}

async function accountAction(btn) {
  const act = btn.dataset.acc, who = btn.dataset.who;
  if (act === 'gen') { const f = $(btn.dataset.target); if (f) { f.value = genPassword(); f.focus(); } }
  else if (act === 'copy') {
    const done = () => { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(btn.dataset.text).then(done, () => { });
  }
  else if (act === 'credhide') { accCreds = null; render(); }
  else if (act === 'prefill') {   // fill "Add a login account" from a person who has no login yet
    const p = (accResults || []).find(u => u.login_id === who);
    if (!p) return;
    newAccountRole = p.role || 'student';
    newAccountDraft = {
      name: p.name || '',
      id: p.login_id || '',
      email: p.email || '',
      dept: p.dept || '',
      hostel: p.hostel || '',
      phone: p.phone || '',
      cabin: p.cabin || '',
      subjects: p.subjects || '',
      password: genPassword()
    };
    render();
    const f = $('acname') || $('acpw');
    if (f) f.scrollIntoView({ block: 'center' });
  }
  else if (act === 'pw') { pwEditing = who; accRemoveConfirm = ''; render(); const f = $('acnewpw'); if (f) f.focus(); }
  else if (act === 'pwcancel') { pwEditing = ''; render(); }
  else if (act === 'pwsave') {
    const pw = $('acnewpw').value, errBox = $('acpwerr');
    if (pw.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; return; }
    let res;
    try { res = await API.request('/api/users/reset-password', { method: 'POST', body: JSON.stringify({ login_id: who, password: pw }) }); }
    catch (e) { errBox.textContent = e.message; return; }
    if (res && res.token) { try { sessionStorage.setItem('cc_token', res.token); } catch (e) { } }   // admin changed their own password: stay signed in
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
    if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
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
    : '') +
  (reviewer && a.st === 'Verified' && (getRole() === 'hod' || getRole() === 'principal' || getRole() === 'admin')
    ? `<div class="btns" style="margin-top:8px"><button class="btn sm ghost" onclick="openIssueCertificateDialog('${escapeHtml(a.roll || '')}', '${escapeHtml(a.title || '')}', '${escapeHtml(a.desc || '')}')" type="button">🏅 Issue SHA-256 Certificate</button></div>`
    : '') +
  (!reviewer && a.st === 'Verified' ? `<p style="margin-top:8px;font-size:12px;font-weight:600;color:var(--green)">🔒 Verified & Locked (Modifications restricted to Administrator)</p>` : '') +
  `</div>`;

let achievementsLoading = false;
async function loadAchievementsFromServer() {
  if (achievementsLoading || typeof API === 'undefined' || !API.getAchievements) return;
  achievementsLoading = true;
  try {
    const list = await API.getAchievements();
    if (Array.isArray(list) && list.length) {
      const uName = (userName() || '').toUpperCase();
      const serverList = list.map(a => ({
        id: a.id,
        who: a.name || a.login_id || 'Student',
        roll: (a.login_id || '').toUpperCase(),
        title: a.title,
        cat: a.category,
        date: a.date,
        desc: a.description || '',
        link: a.link || '',
        st: a.status || 'Pending',
        mine: (a.login_id || '').toUpperCase() === uName,
        vb: a.verified_by ? { n: a.verified_by, r: a.verified_role, at: a.verified_at ? new Date(a.verified_at).getTime() : Date.now() } : null
      }));
      ACHIEVEMENTS.splice(0, ACHIEVEMENTS.length, ...serverList);
      saveJson('cc_ach', ACHIEVEMENTS);
      const pga = $('pg-achievements');
      if (pga && appData.tab === 'achievements') {
        pga.innerHTML = isStaffRole() ? renderAchievementReview() : renderStudentAchievements();
        translatePage(pga);
      }
    }
  } catch (e) {
    console.warn('loadAchievementsFromServer error:', e);
  } finally {
    achievementsLoading = false;
  }
}

// Student view: post form + my achievements
function renderStudentAchievements() {
  if (!achievementsLoading) loadAchievementsFromServer();
  const message = achievementMessage; achievementMessage = '';
  const mine = ACHIEVEMENTS.filter(a => a.mine);

  return `<h2>Achievements</h2><p class="sub">Post what you have achieved. A teacher verifies it before it shows as verified.</p>` +
    successBox(message) +
    `<div class="ttcard frm"><b style="font-size:18px">Post an achievement</b>` +
    `<div class="form-preset-wrap">` +
    `<span class="preset-label">💡 Common Achievement Templates (tap to select):</span>` +
    `<div class="preset-chips">` +
    `<button type="button" class="preset-chip" data-preset="atl:Won 1st Prize in Inter-College Hackathon:Competition">🏆 1st Prize in Hackathon</button>` +
    `<button type="button" class="preset-chip" data-preset="atl:Completed NPTEL Certification with Elite + Gold:Certification">📜 NPTEL / Coursera Certificate</button>` +
    `<button type="button" class="preset-chip" data-preset="atl:Published Research Paper in IEEE Conference:Research">📄 Published Research Paper</button>` +
    `<button type="button" class="preset-chip" data-preset="atl:Secured Gold Medal in University Sports Tournament:Sports">🥇 Gold Medal in Sports</button>` +
    `<button type="button" class="preset-chip" data-preset="atl:Contributed to Open Source Project on GitHub:Open Source">💻 Open Source Contribution</button>` +
    `<button type="button" class="preset-chip" data-preset="atl:Delivered Technical Workshop as Student Speaker:Leadership">🎤 Technical Workshop Speaker</button>` +
    `</div></div>` +
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

  const entry = {
    id: Date.now(), who: accountName() || userName(), roll: userName().toUpperCase(), title,
    cat: $('acat').value, date: $('adt').value || todayIso(),
    desc: $('ads').value.trim(), link, st: 'Pending', mine: true
  };
  ACHIEVEMENTS.unshift(entry);
  saveJson('cc_ach', ACHIEVEMENTS);
  if (typeof API !== 'undefined' && API.createAchievement) {
    API.createAchievement({
      title,
      category: $('acat').value,
      date: $('adt').value || todayIso(),
      description: $('ads').value.trim(),
      link
    }).then(res => {
      if (res && res.achievement && res.achievement.id) {
        entry.id = res.achievement.id;
        saveJson('cc_ach', ACHIEVEMENTS);
      }
      loadAchievementsFromServer();
    }).catch(() => { });
  }
  achievementMessage = '✅ Posted. A teacher will verify it soon.';
  render();
  window.scrollTo(0, 0);
}

// Teacher / admin view: waiting for verification + reviewed (scoped to teacher's department)
function renderAchievementReview() {
  if (!achievementsLoading) loadAchievementsFromServer();
  const isAdm = getRole() === 'admin';
  const myDept = canonicalDept(accountDept());
  const matchDept = a => {
    if (isAdm || !myDept) return true;
    const s = STUDENTS.find(x => x.roll === a.roll);
    if (!s) return true;
    const sDept = canonicalDept(s.course);
    return !sDept || sDept === myDept;
  };
  const waiting = ACHIEVEMENTS.filter(a => a.st === 'Pending' && matchDept(a));
  const reviewed = ACHIEVEMENTS.filter(a => a.st !== 'Pending' && matchDept(a));
  return `<h2>Achievements</h2><p class="sub">${waiting.length} waiting for verification${myDept && !isAdm ? ' · ' + myDept + ' Department' : ''}</p>` +
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
      `<button class="btn ghost sm" data-cdel="${c.id || i}" type="button" style="color:#ef4444;border-color:rgba(239,68,68,0.3)">🗑️ Remove</button>` +
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

async function removeComplaintByAdmin(cid) {
  try {
    if (typeof API !== 'undefined' && API.deleteComplaint) {
      await API.deleteComplaint(cid);
    }
    const idx = COMPLAINTS.findIndex(c => String(c.id) === String(cid));
    if (idx !== -1) {
      COMPLAINTS.splice(idx, 1);
      saveComplaints();
    }
    const commIdx = communityComplaints.findIndex(c => String(c.id) === String(cid));
    if (commIdx !== -1) {
      communityComplaints.splice(commIdx, 1);
    }
    showToast('Complaint removed ✓');
    refreshComplaintsView();
  } catch (err) {
    console.warn('Delete complaint error:', err);
    const idx = COMPLAINTS.findIndex(c => String(c.id) === String(cid));
    if (idx !== -1) {
      COMPLAINTS.splice(idx, 1);
      saveComplaints();
    }
    showToast('Complaint removed ✓');
    refreshComplaintsView();
  }
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

// =============================================================================
// WARDEN DASHBOARD, ATTENDANCE & COMPLAINTS/REVIEWS
// =============================================================================

function renderWardenHome() {
  const hName = wardenHostel();
  const residents = hostelResidents(hName);
  const residentCount = residents.length;

  // Active roll call today
  const todaySession = HOSTEL_ATTENDANCE.find(a => a.date === todayIso() && a.hostel && a.hostel.toLowerCase().startsWith(hName.toLowerCase()));
  const rollStatus = todaySession
    ? `${todaySession.present} / ${todaySession.total} Present (${percent(todaySession.present, todaySession.total)})`
    : 'Pending';

  // Hostel complaints for warden's scope (Hostel for this block, Food & Mess, Cleanliness)
  const hComplaints = COMPLAINTS.filter(c => {
    if (c.cat === 'College') return false;
    if (c.cat === 'Hostel') return !c.loc || c.loc.toLowerCase().includes(hName.toLowerCase()) || hName.toLowerCase().includes(c.loc.toLowerCase());
    return ['Food & Mess', 'Cleanliness', 'Mess', 'Food'].includes(c.cat);
  });
  const openComplaints = hComplaints.filter(c => c.st < 3 && !c.closed).length;

  // Reviews for this hostel
  const hReviews = HOSTEL_REVIEWS.filter(r => !r.loc || r.loc.toLowerCase().includes(hName.toLowerCase()));
  const avgFood = hReviews.length ? (hReviews.reduce((s, r) => s + (r.foodRating || 4), 0) / hReviews.length).toFixed(1) : '4.0';
  const avgClean = hReviews.length ? (hReviews.reduce((s, r) => s + (r.cleanlinessRating || 4), 0) / hReviews.length).toFixed(1) : '4.5';

  // Residents on leave
  const residentsOnLeave = residents.filter(s => {
    return studentApprovals && studentApprovals.some(r => r.s === 'Approved' && r.n && r.n.includes(s.roll));
  }).length;

  return `<div class="db-page">` +
    `<div class="db-hero-card">` +
    `<div class="db-hero-avatar">🏠</div>` +
    `<div class="db-hero-body">` +
    `<div class="db-hero-top">` +
    `<h2 class="db-hero-name">${greetingHtml()}, ${displayName()} 👋</h2>` +
    `<div class="db-badges">` +
    `<span class="db-role-badge staff">Hostel Warden</span>` +
    `<span class="db-campus-pill">🏰 ${escapeHtml(hName)}</span>` +
    `<span class="db-live-pill"><span class="db-pulse-dot"></span> On Duty</span>` +
    `</div>` +
    `</div>` +
    `<p class="db-hero-sub">Hostel discipline &amp; safety supervisor · Night roll calls, cleanliness oversight &amp; mess management</p>` +
    `</div>` +
    `</div>` +
    (wardenActionMsg ? `<div class="item" style="margin-bottom:14px;border-color:#10b981;color:#10b981;background:rgba(16,185,129,0.08);border-radius:12px;padding:12px 16px;"><b>${escapeHtml(wardenActionMsg)}</b></div>` : '') +
    `<div class="db-quick-bar">` +
    `<span class="db-quick-label">ACTIONS</span>` +
    `<div class="db-quick-chips">` +
    `<button type="button" class="db-quick-chip" data-go="attendance">📋 Night Attendance</button>` +
    `<button type="button" class="db-quick-chip" data-go="exams">📝 Exam Schedule</button>` +
    `<button type="button" class="db-quick-chip" data-go="leave">🏖️ My Leave</button>` +
    `<button type="button" class="db-quick-chip" data-go="complaints">🔍 Complaints &amp; Reviews</button>` +
    `<button type="button" class="db-quick-chip" data-go="notices">📢 Post Notice</button>` +
    `<button type="button" class="db-quick-chip" data-go="students">👥 Resident Roster</button>` +
    `</div>` +
    `</div>` +
    `<div class="db-stats-grid">` +
    `<button class="db-stat-tile tile-blue" data-go="students" type="button">` +
    `<div class="db-tile-icon">👥</div>` +
    `<div class="db-tile-num">${residentCount}</div>` +
    `<div class="db-tile-label">Residents Registered</div>` +
    `<div class="db-tile-sub">Hostel block ${escapeHtml(hName)}</div>` +
    `<span class="db-tile-arrow">→</span>` +
    `</button>` +
    `<button class="db-stat-tile tile-emerald" data-go="attendance" type="button">` +
    `<div class="db-tile-icon">📋</div>` +
    `<div class="db-tile-num">${todaySession ? todaySession.present + ' / ' + todaySession.total : 'Pending'}</div>` +
    `<div class="db-tile-label">Tonight's Roll Call</div>` +
    `<div class="db-tile-sub">${todaySession ? 'Completed (' + percent(todaySession.present, todaySession.total) + ')' : 'Tap to take attendance'}</div>` +
    `<span class="db-tile-arrow">→</span>` +
    `</button>` +
    `<button class="db-stat-tile tile-rose" data-go="complaints" type="button">` +
    `<div class="db-tile-icon">⚠️</div>` +
    `<div class="db-tile-num">${openComplaints}</div>` +
    `<div class="db-tile-label">Hostel Complaints</div>` +
    `<div class="db-tile-sub">Food, Mess &amp; Cleanliness</div>` +
    `<span class="db-tile-arrow">→</span>` +
    `</button>` +
    `<button class="db-stat-tile tile-purple" data-go="complaints" data-wtab="reviews" type="button">` +
    `<div class="db-tile-icon">⭐</div>` +
    `<div class="db-tile-num">${avgFood}★ / ${avgClean}★</div>` +
    `<div class="db-tile-label">Mess &amp; Hygiene Rating</div>` +
    `<div class="db-tile-sub">Average student feedback</div>` +
    `<span class="db-tile-arrow">→</span>` +
    `</button>` +
    `<button class="db-stat-tile tile-amber" data-go="attendance" type="button">` +
    `<div class="db-tile-icon">🚪</div>` +
    `<div class="db-tile-num">${residentsOnLeave}</div>` +
    `<div class="db-tile-label">On Leave</div>` +
    `<div class="db-tile-sub">Approved gate passes</div>` +
    `<span class="db-tile-arrow">→</span>` +
    `</button>` +
    `</div>` +
    renderTodoWidget('warden', '📋 Warden Hostel Administration Works & Tasks') +
    renderNotifications() +
    // Recent Complaints Widget
    `<h3 style="margin:24px 0 10px;font-size:1.05rem;font-weight:700">Active Hostel &amp; Mess Complaints</h3>` +
    `<div class="list">` +
    (hComplaints.filter(c => c.st < 3 && !c.closed).length
      ? hComplaints.filter(c => c.st < 3 && !c.closed).slice(0, 3).map(c =>
        `<div class="item"><div class="top"><b>${escapeHtml(c.t)}</b><span class="badge">${escapeHtml(c.cat)} · ${escapeHtml(c.loc)}</span></div>` +
        `<p>${c.id} · Filed by ${escapeHtml(c.by || 'Student')} · ${timeAgo(c.ts)} · ${slaBadge(c)}</p>` +
        `<div class="steps" style="margin:8px 0">${STAGES.map((st, k) => `<div class="stp ${k <= c.st ? 'done' : ''}"><i></i><span>${st}</span></div>`).join('')}</div>` +
        `<div class="btns" style="margin-top:8px">` +
        (c.st < 2 ? `<button class="btn ghost sm" data-wadv="${c.id}:2" type="button">Mark In Progress</button>` : '') +
        (c.st < 3 ? `<button class="btn sm" data-wadv="${c.id}:3" type="button">Mark Resolved ✓</button>` : '') +
        `</div></div>`
      ).join('')
      : '<p class="sub">No open hostel complaints. All clear!</p>') +
    `</div>` +
    // Recent Student Reviews Widget
    `<h3 style="margin:24px 0 10px;font-size:1.05rem;font-weight:700">Recent Student Feedback &amp; Reviews</h3>` +
    `<div class="list">` +
    (hReviews.length
      ? hReviews.slice(0, 3).map(r =>
        `<div class="item w-rev-item"><div class="top"><b>${escapeHtml(r.name)} (${escapeHtml(r.roll)})</b><span class="badge">${escapeHtml(r.room || r.loc)}</span></div>` +
        `<div class="w-stars" style="margin:4px 0">Food: ${'★'.repeat(r.foodRating || 4)}${'☆'.repeat(5 - (r.foodRating || 4))} · Hygiene: ${'★'.repeat(r.cleanlinessRating || 4)}${'☆'.repeat(5 - (r.cleanlinessRating || 4))}</div>` +
        `<p style="margin:4px 0 0">"${escapeHtml(r.comment || 'Good overall experience.')}"</p>` +
        (r.reply ? `<div class="w-rev-reply"><b>Warden Note:</b> ${escapeHtml(r.reply)}</div>` : '') +
        `</div>`
      ).join('')
      : '<p class="sub">No reviews submitted yet.</p>') +
    `</div>` +
    `</div>`;
}

function renderWardenAttendance() {
  const hName = wardenHostel();
  const residents = hostelResidents(hName);
  const message = wardenAttMsg; wardenAttMsg = '';

  // Initialize marks for residents if not set
  residents.forEach(s => {
    if (!wardenAttMarks[s.roll]) {
      const onLeave = studentApprovals && studentApprovals.some(r => r.s === 'Approved' && r.n && r.n.includes(s.roll));
      wardenAttMarks[s.roll] = onLeave ? 'L' : 'P';
    }
  });

  const pCount = residents.filter(s => wardenAttMarks[s.roll] === 'P').length;
  const aCount = residents.filter(s => wardenAttMarks[s.roll] === 'A').length;
  const lCount = residents.filter(s => wardenAttMarks[s.roll] === 'L').length;

  const pastLogs = HOSTEL_ATTENDANCE.filter(a => a.hostel && a.hostel.toLowerCase().startsWith(hName.toLowerCase()))
    .sort((a, b) => b.ts - a.ts);

  return `<h2>Hostel Attendance</h2><p class="sub">Take roll call for <b>${escapeHtml(hName)}</b> residents · Offline compatible</p>` +
    (message ? `<div class="item" style="margin-bottom:14px;border-color:#15803d;color:#15803d"><b>${escapeHtml(message)}</b></div>` : '') +
    // Session Controls
    `<div class="ttcard frm" style="margin-bottom:16px">` +
    `<div class="two">` +
    `<div><label for="watsess">Roll Call Session</label>` +
    `<select id="watsess">` +
    `<option value="Night Roll Call (9:00 PM)" ${wardenAttSession.includes('Night') ? 'selected' : ''}>Night Roll Call (9:00 PM)</option>` +
    `<option value="Morning Attendance (7:30 AM)" ${wardenAttSession.includes('Morning') ? 'selected' : ''}>Morning Attendance (7:30 AM)</option>` +
    `</select></div>` +
    `<div><label for="watdate">Date</label>` +
    `<input type="date" id="watdate" value="${wardenAttDate}"></div>` +
    `</div>` +
    `<div class="top" style="margin-top:10px;justify-content:flex-start;gap:12px">` +
    `<span class="badge ok">Present: ${pCount}</span>` +
    `<span class="badge bad">Absent: ${aCount}</span>` +
    `<span class="badge" style="background:rgba(217,119,6,0.15);color:#b45309">On Leave: ${lCount}</span>` +
    `<span class="badge">Total: ${residents.length}</span>` +
    `</div>` +
    `<div class="btns" style="margin-top:14px;gap:8px">` +
    `<button class="btn ghost sm" data-hallp type="button">Mark All Present</button>` +
    `<button class="btn sm" data-hsave type="button">Save Roll Call</button>` +
    `</div>` +
    `</div>` +
    // Residents Roster
    `<h3 style="margin:20px 0 8px">${escapeHtml(hName)} Residents Roster (${residents.length})</h3>` +
    `<div class="list">` +
    (residents.length ? residents.map(s => {
      const mark = wardenAttMarks[s.roll] || 'P';
      const onLeave = studentApprovals && studentApprovals.some(r => r.s === 'Approved' && r.n && r.n.includes(s.roll));
      return `<div class="item w-roster-item">` +
        `<div class="w-roster-info">` +
        `<div class="avatar sm" style="width:40px;height:40px;font-size:16px">${avatarInner(myPhotoValue(s), s.name)}</div>` +
        `<div class="w-roster-meta">` +
        `<b>${escapeHtml(s.name)}</b>` +
        `<small>${escapeHtml(s.roll)} · ${escapeHtml(s.hostel || 'Resident')}</small>` +
        (onLeave ? `<br><span class="badge" style="font-size:10px;background:rgba(217,119,6,0.15);color:#b45309">Approved Gate Pass</span>` : '') +
        `</div>` +
        `</div>` +
        `<div class="w-att-btns">` +
        `<button class="chip ${mark === 'P' ? 'p-on' : ''}" data-hatt="${s.roll}:P" type="button">P</button>` +
        `<button class="chip ${mark === 'A' ? 'a-on' : ''}" data-hatt="${s.roll}:A" type="button">A</button>` +
        `<button class="chip ${mark === 'L' ? 'l-on' : ''}" data-hatt="${s.roll}:L" type="button">L</button>` +
        `</div>` +
        `</div>`;
    }).join('') : `<p class="sub">No residents registered under ${escapeHtml(hName)} yet.</p>`) +
    `</div>` +
    // History
    `<h3 style="margin:24px 0 8px">Saved Roll Call History</h3>` +
    `<div class="list">` +
    (pastLogs.length ? pastLogs.map(l =>
      `<div class="item"><div class="top"><b>${escapeHtml(l.session)}</b><span class="badge ok">${l.present}/${l.total} Present</span></div>` +
      `<p>${formatDate(l.date)} · Taken by ${escapeHtml(l.warden || 'Warden')} (${timeAgo(l.ts)})</p>` +
      `<div class="top" style="margin-top:6px;gap:6px;font-size:12px;color:var(--muted)">` +
      `Absentees: ${Object.entries(l.records || {}).filter(e => e[1] === 'A').map(e => e[0]).join(', ') || 'None'}` +
      `</div></div>`
    ).join('') : '<p class="sub">No past roll calls recorded yet.</p>') +
    `</div>`;
}

function saveWardenAttendance() {
  const hName = wardenHostel();
  const residents = hostelResidents(hName);
  const sess = $('watsess') ? $('watsess').value : wardenAttSession;
  const dt = $('watdate') ? $('watdate').value : wardenAttDate;
  wardenAttSession = sess;
  wardenAttDate = dt;

  const records = {};
  residents.forEach(s => {
    records[s.roll] = wardenAttMarks[s.roll] || 'P';
  });

  const present = Object.values(records).filter(v => v === 'P').length;
  const staff = myStaff();
  const wardenName = staff ? staff.name : (accountName() || displayName());

  const existingIdx = HOSTEL_ATTENDANCE.findIndex(a => a.date === dt && a.session === sess && a.hostel && a.hostel.toLowerCase().startsWith(hName.toLowerCase()));
  const item = {
    id: 'HA-' + dt.replace(/-/g, '') + '-' + (sess.includes('Night') ? 'N' : 'M'),
    date: dt,
    session: sess,
    hostel: hName,
    by: userName(),
    warden: wardenName,
    ts: Date.now(),
    total: residents.length,
    present,
    records
  };

  if (existingIdx >= 0) {
    HOSTEL_ATTENDANCE[existingIdx] = item;
  } else {
    HOSTEL_ATTENDANCE.unshift(item);
  }

  saveHostelAttendance();
  wardenAttMsg = `✅ Roll call saved for ${dt} (${sess}). ${present} of ${residents.length} present.`;
  render();
}

function renderWardenComplaints() {
  const hName = wardenHostel();
  const message = wardenActionMsg; wardenActionMsg = '';

  // Complaints within warden's scope
  const hComplaints = COMPLAINTS.filter(c => {
    if (c.cat === 'College') return false;
    if (c.cat === 'Hostel') return !c.loc || c.loc.toLowerCase().includes(hName.toLowerCase()) || hName.toLowerCase().includes(c.loc.toLowerCase());
    return ['Food & Mess', 'Cleanliness', 'Mess', 'Food'].includes(c.cat);
  });

  const state = c => c.closed ? 'Closed' : c.st === 3 ? 'Resolved' : 'Open';
  const cFiltered = hComplaints.filter(c => {
    if (wardenComplaintFilter === 'All') return true;
    if (['Open', 'Resolved', 'Closed'].includes(wardenComplaintFilter)) return state(c) === wardenComplaintFilter;
    return c.cat === wardenComplaintFilter;
  }).sort((a, b) => b.ts - a.ts);

  // Student reviews
  const hReviews = HOSTEL_REVIEWS.filter(r => !r.loc || r.loc.toLowerCase().includes(hName.toLowerCase()))
    .sort((a, b) => b.ts - a.ts);

  const avgFood = hReviews.length ? (hReviews.reduce((s, r) => s + (r.foodRating || 4), 0) / hReviews.length).toFixed(1) : '4.0';
  const avgClean = hReviews.length ? (hReviews.reduce((s, r) => s + (r.cleanlinessRating || 4), 0) / hReviews.length).toFixed(1) : '4.5';
  const avgHostel = hReviews.length ? (hReviews.reduce((s, r) => s + (r.hostelRating || 4), 0) / hReviews.length).toFixed(1) : '4.2';

  const rFiltered = hReviews.filter(r => {
    if (wardenReviewFilter === 'All') return true;
    const star = parseInt(wardenReviewFilter);
    return r.foodRating === star || r.cleanlinessRating === star || r.hostelRating === star;
  });

  return `<h2>Hostel Complaints &amp; Student Reviews</h2>` +
    `<p class="sub">Oversee living conditions, mess quality, cleanliness and student ratings for <b>${escapeHtml(hName)}</b></p>` +
    (message ? `<div class="item" style="margin-bottom:14px;border-color:#15803d;color:#15803d"><b>${escapeHtml(message)}</b></div>` : '') +
    // Top Tabs
    `<div class="chips" style="margin-bottom:16px">` +
    `<button class="chip ${wardenComplaintTab === 'complaints' ? 'on' : ''}" data-wtab="complaints" type="button">Hostel Complaints (${hComplaints.length})</button>` +
    `<button class="chip ${wardenComplaintTab === 'reviews' ? 'on' : ''}" data-wtab="reviews" type="button">Student Reviews &amp; Ratings (${hReviews.length})</button>` +
    `</div>` +
    (wardenComplaintTab === 'complaints'
      ? // Complaints View
      `<div class="chips" style="margin-bottom:12px">` +
      ['All', 'Open', 'Resolved', 'Hostel', 'Food & Mess', 'Cleanliness'].map(k =>
        `<button class="chip ${wardenComplaintFilter === k ? 'on' : ''}" data-wcf="${k}" type="button">${k}</button>`
      ).join('') +
      `</div>` +
      `<div class="list">` +
      (cFiltered.length ? cFiltered.map(c =>
        `<div class="item"><div class="top"><b>${escapeHtml(c.t)}</b><span class="badge">${escapeHtml(c.cat)} · ${escapeHtml(c.loc)}</span></div>` +
        `<p>${c.id} · Filed by ${escapeHtml(c.by || 'Resident')} · ${c.mt} student${c.mt === 1 ? '' : 's'} affected · ${timeAgo(c.ts)}</p>` +
        `<div class="top" style="margin-top:6px;justify-content:flex-start;gap:8px">${slaBadge(c)}${isRecurring(c) ? '<span class="badge bad">Recurring</span>' : ''}</div>` +
        closedNote(c) +
        `<div class="steps" style="margin:10px 0">${STAGES.map((st, k) => `<div class="stp ${k <= c.st ? 'done' : ''}"><i></i><span>${st}</span></div>`).join('')}</div>` +
        (c.photo ? `<img src="${c.photo}" alt="Evidence" style="max-width:120px;border-radius:10px;margin-top:6px">` : '') +
        (c.st < 3 && !c.closed
          ? `<div class="btns" style="margin-top:10px;gap:8px">` +
          (c.st < 2 ? `<button class="btn ghost sm" data-wadv="${c.id}:2" type="button">Mark In Progress</button>` : '') +
          `<button class="btn sm" data-wadv="${c.id}:3" type="button">Mark Resolved ✓</button>` +
          `</div>`
          : '') +
        `</div>`
      ).join('') : '<p class="sub">No complaints matching this filter.</p>') +
      `</div>`
      : // Reviews View
      `<div class="w-rating-box">` +
      `<div><small>Mess Food Quality</small><b>${avgFood} ★</b><span style="font-size:12px;color:var(--muted)">Average</span></div>` +
      `<div><small>Cleanliness &amp; Hygiene</small><b>${avgClean} ★</b><span style="font-size:12px;color:var(--muted)">Average</span></div>` +
      `<div><small>Hostel Facilities</small><b>${avgHostel} ★</b><span style="font-size:12px;color:var(--muted)">Average</span></div>` +
      `</div>` +
      `<div class="chips" style="margin:14px 0 12px">` +
      ['All', '5★', '4★', '3★', '2★', '1★'].map(s =>
        `<button class="chip ${wardenReviewFilter === s ? 'on' : ''}" data-wrf="${s}" type="button">${s}</button>`
      ).join('') +
      `</div>` +
      `<div class="list">` +
      (rFiltered.length ? rFiltered.map(r =>
        `<div class="item w-rev-item">` +
        `<div class="top"><b>${escapeHtml(r.name)} (${escapeHtml(r.roll)})</b><span class="badge">${escapeHtml(r.room || r.loc)} · ${formatDate(r.date)}</span></div>` +
        `<div class="w-stars" style="margin:6px 0">` +
        `Food: ${'★'.repeat(r.foodRating || 4)}${'☆'.repeat(5 - (r.foodRating || 4))} · Cleanliness: ${'★'.repeat(r.cleanlinessRating || 4)}${'☆'.repeat(5 - (r.cleanlinessRating || 4))} · Hostel: ${'★'.repeat(r.hostelRating || 4)}${'☆'.repeat(5 - (r.hostelRating || 4))}` +
        `</div>` +
        (r.comment ? `<p style="margin:6px 0">"${escapeHtml(r.comment)}"</p>` : '') +
        (r.reply
          ? `<div class="w-rev-reply"><b>Warden Response:</b> ${escapeHtml(r.reply)}</div>`
          : `<div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-wreply="${r.id}" type="button">Add Warden Response</button></div>`) +
        `</div>`
      ).join('') : '<p class="sub">No student reviews matching this filter.</p>') +
      `</div>`
    );
}

function advanceWardenComplaint(id, targetStage) {
  const c = COMPLAINTS.find(x => x.id === id);
  if (!c) return;
  c.st = Number(targetStage);
  if (c.st === 3 && !c.closed) {
    c.closed = {
      reason: 'Resolved and verified by Warden (' + wardenHostel() + ')',
      by: userName(),
      at: Date.now()
    };
  }
  saveComplaints();
  wardenActionMsg = `✅ Complaint ${id} updated to ${STAGES[c.st]}.`;
  render();
}

function replyWardenReview(id) {
  const rev = HOSTEL_REVIEWS.find(r => r.id === id);
  if (!rev) return;
  const reply = prompt(`Reply to student ${rev.name} (${rev.roll}):`, rev.reply || '');
  if (reply === null) return;
  rev.reply = reply.trim();
  saveHostelReviews();
  wardenActionMsg = `✅ Response updated for review ${id}.`;
  render();
}

// Administrator Analytics & Audit Trail State
let adminAnalyticsData = null;
let adminAnalyticsLoading = false;
let adminAnalyticsLastFetch = 0;
let adminHomeTab = 'overview'; // 'overview' | 'audit'
let adminAuditLogs = null;
let adminAuditFilter = 'ALL';
let adminAuditSearch = '';
let adminAuditLoading = false;

async function loadAdminAnalytics(force = false) {
  if (adminAnalyticsLoading) return;
  const now = Date.now();
  if (!force && adminAnalyticsData && (now - adminAnalyticsLastFetch < 5000)) return;
  adminAnalyticsLoading = true;

  // Visual refreshing state ONLY on the audit log container
  const auditWrap = $('recentAuditWrap');
  if (auditWrap) {
    auditWrap.classList.add('refreshing');
    if (!$('auditRefreshOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'auditRefreshOverlay';
      overlay.className = 'audit-refresh-overlay';
      overlay.innerHTML = '<div class="audit-refresh-spinner"></div><span>Refreshing audit records from DB…</span>';
      auditWrap.appendChild(overlay);
    }
  }

  // Animate the refresh button icon
  const refBtn = $('analyticsRefresh');
  if (refBtn) {
    refBtn.innerHTML = '<span class="spin-icon">🔄</span> Refreshing…';
    refBtn.disabled = true;
  }
  const cardRefBtn = $('overviewAuditRefresh');
  if (cardRefBtn) {
    cardRefBtn.innerHTML = '<span class="spin-icon">🔄</span> Refreshing…';
    cardRefBtn.disabled = true;
  }

  try {
    const minDelay = force ? new Promise(resolve => setTimeout(resolve, 600)) : Promise.resolve();
    let fetchPromise = Promise.resolve();
    if (typeof API !== 'undefined' && API.getAdminAnalytics) {
      fetchPromise = API.getAdminAnalytics().then(data => {
        if (data && data.roster) {
          adminAnalyticsData = data;
          adminAnalyticsLastFetch = Date.now();
        }
      });
    }
    await Promise.all([fetchPromise, minDelay]);
  } catch (err) {
    console.warn('Failed to fetch admin analytics:', err);
  } finally {
    adminAnalyticsLoading = false;

    // Targeted update to the audit log preview
    const tbody = $('recentAuditTbody');
    const wrap = $('recentAuditWrap');
    if (tbody && wrap) {
      wrap.classList.remove('refreshing');
      const overlay = $('auditRefreshOverlay');
      if (overlay) overlay.remove();

      const recentEvents = (adminAnalyticsData && adminAnalyticsData.audit && adminAnalyticsData.audit.recent_events) || [];
      tbody.innerHTML = recentEvents.length ? recentEvents.slice(0, 5).map(e => `
        <tr class="audit-updated-flash">
          <td style="white-space:nowrap;color:var(--muted)">${formatAuditTime(e.created_at)}</td>
          <td>
            <div style="font-weight:700">${escapeHtml(e.user_name || e.login_id || 'System')}</div>
            <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(e.role || '—')} · ${escapeHtml(e.login_id || '—')}</div>
          </td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="2" style="text-align:center;color:var(--muted);padding:16px">No recent audit events logged.</td>
        </tr>
      `;

      const badge = $('auditLiveBadge');
      if (badge) {
        badge.innerHTML = '<span style="color:#10b981;font-weight:700">✓ Updated just now</span>';
        setTimeout(() => {
          if ($('auditLiveBadge')) $('auditLiveBadge').innerHTML = '● Live from DB';
        }, 2500);
      }
    } else {
      if (getRole() === 'admin' && appData.tab === 'home') {
        const pg = $('pg-home');
        if (pg) pg.innerHTML = renderAdminHome();
      }
    }

    if (refBtn) {
      refBtn.innerHTML = '🔄 Refresh';
      refBtn.disabled = false;
    }
    if (cardRefBtn) {
      cardRefBtn.innerHTML = '🔄 Refresh';
      cardRefBtn.disabled = false;
    }
  }
}

window.onCollectionSynced = function (key) {
  if (getRole() === 'admin' && typeof loadAdminAnalytics === 'function') {
    loadAdminAnalytics(true);
  }
};

async function loadAdminAuditLogs(force = false) {
  if (adminAuditLoading && !force) return;
  adminAuditLoading = true;

  const fullWrap = $('fullAuditWrap');
  if (fullWrap) {
    fullWrap.classList.add('refreshing');
    if (!$('fullAuditOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'fullAuditOverlay';
      overlay.className = 'audit-refresh-overlay';
      overlay.innerHTML = '<div class="audit-refresh-spinner"></div><span>Refreshing full audit logs…</span>';
      fullWrap.appendChild(overlay);
    }
  }
  const alogRefBtn = $('alogRefresh');
  if (alogRefBtn) {
    alogRefBtn.innerHTML = '<span class="spin-icon">🔄</span> Refreshing…';
    alogRefBtn.disabled = true;
  }

  try {
    const minDelay = force ? new Promise(resolve => setTimeout(resolve, 600)) : Promise.resolve();
    let fetchPromise = Promise.resolve();
    if (typeof API !== 'undefined' && API.getAuditLogs) {
      const params = { limit: 50 };
      if (adminAuditFilter && adminAuditFilter !== 'ALL') {
        params.action = adminAuditFilter;
      }
      if (adminAuditSearch && adminAuditSearch.trim()) {
        params.login_id = adminAuditSearch.trim();
      }
      fetchPromise = API.getAuditLogs(params).then(res => {
        if (res && res.logs) {
          adminAuditLogs = res.logs;
        }
      });
    }
    await Promise.all([fetchPromise, minDelay]);
  } catch (err) {
    console.warn('Failed to load audit logs:', err);
  } finally {
    adminAuditLoading = false;
    if (getRole() === 'admin' && appData.tab === 'home') {
      const pg = $('pg-home');
      if (pg) pg.innerHTML = renderAdminHome();
    }
  }
}

function auditActionBadgeClass(act) {
  if (!act) return 'audit-badge-res';
  if (act.includes('LOGIN_SUCCESS')) return 'audit-badge-auth-ok';
  if (act.includes('FAIL') || act.includes('DELETE')) return 'audit-badge-auth-fail';
  if (act.includes('USER') || act.includes('PASSWORD')) return 'audit-badge-user';
  if (act.includes('LEAVE')) return 'audit-badge-leave';
  if (act.includes('ACHIEVE')) return 'audit-badge-achieve';
  if (act.includes('COMPLAINT') || act.includes('ISSUE')) return 'audit-badge-comp';
  if (act.includes('ATTEND')) return 'audit-badge-att';
  return 'audit-badge-res';
}

function formatAuditDetails(raw) {
  if (!raw) return '<span style="color:var(--muted)">—</span>';
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof obj === 'object' && obj !== null) {
      const parts = [];
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined && v !== null && v !== '') {
          parts.push(`<b>${escapeHtml(k)}:</b> ${escapeHtml(String(v))}`);
        }
      }
      return parts.length ? parts.join(' · ') : escapeHtml(JSON.stringify(obj));
    }
    return escapeHtml(String(obj));
  } catch (e) {
    return escapeHtml(String(raw));
  }
}

function formatAuditTime(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return escapeHtml(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch (e) {
    return escapeHtml(ts);
  }
}

function renderAdminOverviewContent(metrics) {
  const depts = (adminAnalyticsData && adminAnalyticsData.roster && adminAnalyticsData.roster.departments && adminAnalyticsData.roster.departments.length)
    ? adminAnalyticsData.roster.departments
    : [
      { dept: 'CSE', students: metrics.totalStudents, faculty: Math.round(metrics.totalStaff * 0.4) },
      { dept: 'ECE', students: 0, faculty: Math.round(metrics.totalStaff * 0.25) },
      { dept: 'EEE', students: 0, faculty: Math.round(metrics.totalStaff * 0.15) },
      { dept: 'MECHANICAL', students: 0, faculty: Math.round(metrics.totalStaff * 0.1) },
      { dept: 'CIVIL', students: 0, faculty: Math.round(metrics.totalStaff * 0.1) }
    ];

  const recentEvents = (adminAnalyticsData && adminAnalyticsData.audit && adminAnalyticsData.audit.recent_events)
    ? adminAnalyticsData.audit.recent_events
    : [];

  const compData = (adminAnalyticsData && adminAnalyticsData.complaints)
    ? adminAnalyticsData.complaints
    : { open: metrics.openComplaints, in_progress: 0, resolved: 0, closed: 0 };

  return `
    <div class="db-search-wrap">
      ${searchBox('a', 'sq-home', 'Search students, faculty, rolls, or IDs…', '')}
    </div>

    <div class="db-stats-grid">
      <button class="db-stat-tile db-accent-blue" data-go="students" type="button">
        <div class="db-tile-top">
          <div class="db-tile-icon-box">👥</div>
          <span class="db-tile-tag">Directory</span>
        </div>
        <div class="db-tile-metric">${metrics.totalStudents}</div>
        <div class="db-tile-title">Enrolled Students</div>
        <div class="db-tile-foot">
          <span>Manage admissions & CR</span>
          <span class="db-tile-arrow">→</span>
        </div>
      </button>

      <button class="db-stat-tile db-accent-emerald" data-go="staff" type="button">
        <div class="db-tile-top">
          <div class="db-tile-icon-box">🧑‍🏫</div>
          <span class="db-tile-tag">Faculty & Staff</span>
        </div>
        <div class="db-tile-metric">${metrics.totalStaff}</div>
        <div class="db-tile-title">Active Staff</div>
        <div class="db-tile-foot">
          <span>Designations & cabins</span>
          <span class="db-tile-arrow">→</span>
        </div>
      </button>

      <button class="db-stat-tile db-accent-indigo" data-go="accounts" type="button">
        <div class="db-tile-top">
          <div class="db-tile-icon-box">🔑</div>
          <span class="db-tile-tag">Database Auth</span>
        </div>
        <div class="db-tile-metric">${metrics.totalUsers}</div>
        <div class="db-tile-title">Provisioned Accounts</div>
        <div class="db-tile-foot">
          <span>User roles & access</span>
          <span class="db-tile-arrow">→</span>
        </div>
      </button>

      <button class="db-stat-tile db-accent-amber" data-go="notices" type="button">
        <div class="db-tile-top">
          <div class="db-tile-icon-box">📢</div>
          <span class="db-tile-tag">Circulars</span>
        </div>
        <div class="db-tile-metric">${metrics.activeNotices}</div>
        <div class="db-tile-title">Active Notices</div>
        <div class="db-tile-foot">
          <span>Campus announcements</span>
          <span class="db-tile-arrow">→</span>
        </div>
      </button>

      <button class="db-stat-tile db-accent-rose" data-go="complaints" type="button">
        <div class="db-tile-top">
          <div class="db-tile-icon-box">⚠️</div>
          <span class="db-tile-tag ${metrics.openComplaints > 0 ? 'db-tag-urgent' : ''}">${metrics.openComplaints > 0 ? 'Action required' : 'Clear'}</span>
        </div>
        <div class="db-tile-metric">${metrics.openComplaints}</div>
        <div class="db-tile-title">Open Complaints (${metrics.slaRate} SLA)</div>
        <div class="db-tile-foot">
          <span>7-day SLA resolution</span>
          <span class="db-tile-arrow">→</span>
        </div>
    </div>

    <!-- Department Distribution & Analytics Section -->
    <div class="analytics-section-card">
      <div class="analytics-card-header">
        <div class="analytics-card-title">🏢 Departmental Roster Distribution</div>
        <span class="analytics-badge-pill">🏛️ Tenant: ${escapeHtml(metrics.cid)}</span>
      </div>
      <div class="dept-analytics-grid">
        ${depts.slice(0, 6).map(d => {
    const totalEnrollment = metrics.totalStudents || 1;
    const sharePct = Math.min(100, Math.round(((d.students || 0) / totalEnrollment) * 100));
    return `
            <div class="dept-analytics-card">
              <div class="dept-analytics-top">
                <span class="dept-analytics-name">${escapeHtml(d.dept || 'General')}</span>
                <span class="analytics-badge-pill" style="font-size:10px">${sharePct}% Enrollment</span>
              </div>
              <div class="dept-analytics-stats">
                <div class="dept-stat-item">
                  <span class="dept-stat-val">${d.students || 0}</span>
                  <span class="dept-stat-lbl">Students</span>
                </div>
                <div class="dept-stat-item">
                  <span class="dept-stat-val">${d.faculty || 0}</span>
                  <span class="dept-stat-lbl">Faculty</span>
                </div>
              </div>
              <div class="analytics-progress-bar">
                <div class="analytics-progress-fill" style="width:${sharePct}%"></div>
              </div>
            </div>
          `;
  }).join('')}
      </div>
    </div>

    <!-- Complaints SLA Performance & Resolution Breakdown -->
    <div class="analytics-section-card">
      <div class="analytics-card-header">
        <div class="analytics-card-title">⚖️ Institutional Grievance SLA Performance</div>
        <span class="analytics-badge-pill">🎯 ${metrics.slaRate} 7-Day Resolution Rate</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
        <div style="background:var(--input);padding:14px;border-radius:12px;border:1px solid var(--line)">
          <div style="font-size:11px;color:var(--muted)">Open</div>
          <div style="font-size:20px;font-weight:800;color:#ef4444;margin-top:2px">${compData.open || 0}</div>
        </div>
        <div style="background:var(--input);padding:14px;border-radius:12px;border:1px solid var(--line)">
          <div style="font-size:11px;color:var(--muted)">In Progress</div>
          <div style="font-size:20px;font-weight:800;color:#f59e0b;margin-top:2px">${compData.in_progress || 0}</div>
        </div>
        <div style="background:var(--input);padding:14px;border-radius:12px;border:1px solid var(--line)">
          <div style="font-size:11px;color:var(--muted)">Resolved</div>
          <div style="font-size:20px;font-weight:800;color:#10b981;margin-top:2px">${compData.resolved || 0}</div>
        </div>
        <div style="background:var(--input);padding:14px;border-radius:12px;border:1px solid var(--line)">
          <div style="font-size:11px;color:var(--muted)">Closed</div>
          <div style="font-size:20px;font-weight:800;color:var(--muted);margin-top:2px">${compData.closed || 0}</div>
        </div>
      </div>
    </div>

    <!-- Recent Audit Activity Preview Card -->
    <div class="analytics-section-card">
      <div class="analytics-card-header">
        <div class="analytics-card-title">
          🛡️ Recent Security & Operational Audit Log
          <span id="auditLiveBadge" style="font-size:11px;font-weight:600;color:var(--muted);margin-left:8px">● Live from DB</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn ghost sm" id="overviewAuditRefresh" type="button" title="Refresh audit log">🔄 Refresh</button>
          <button class="btn ghost sm" data-atab="audit" type="button">Open Full Audit Trail (${metrics.totalEvents}) →</button>
        </div>
      </div>
      <div class="audit-table-wrap" id="recentAuditWrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Operator</th>
            </tr>
          </thead>
          <tbody id="recentAuditTbody">
            ${recentEvents.length ? recentEvents.slice(0, 5).map(e => `
              <tr>
                <td style="white-space:nowrap;color:var(--muted)">${formatAuditTime(e.created_at)}</td>
                <td>
                  <div style="font-weight:700">${escapeHtml(e.user_name || e.login_id || 'System')}</div>
                  <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(e.role || '—')} · ${escapeHtml(e.login_id || '—')}</div>
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="2" style="text-align:center;color:var(--muted);padding:16px">No recent audit events logged.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </div>

    ${renderNotifications()}

    <div class="db-sla-banner">
      <div class="db-sla-icon">⏱️</div>
      <div class="db-sla-content">
        <b>Resolution Policy:</b> All institutional issues & student grievances must be resolved within <b>7 days maximum</b>. Escalated complaints are highlighted automatically.
      </div>
    </div>

    ${renderIssueList()}
  `;
}

function renderAdminAuditContent(cid) {
  const logs = adminAuditLogs || (adminAnalyticsData && adminAnalyticsData.audit ? adminAnalyticsData.audit.recent_events : []);
  const filterChips = [
    { id: 'ALL', label: 'All Operations' },
    { id: 'AUTH_LOGIN_SUCCESS', label: 'Logins' },
    { id: 'AUTH_LOGIN_FAILURE', label: 'Auth Alerts' },
    { id: 'USER_CREATE', label: 'Account Provision' },
    { id: 'USER_ROLE_CHANGE', label: 'Role Changes' },
    { id: 'PASSWORD_RESET', label: 'Password Resets' },
    { id: 'LEAVE_ACTION', label: 'Leave Decisions' },
    { id: 'ACHIEVEMENT_VERIFY', label: 'Achievement Verifications' },
    { id: 'ATTENDANCE_SYNC', label: 'Attendance Syncs' },
    { id: 'COMPLAINT_STATUS_UPDATE', label: 'Complaints' }
  ];

  return `
    <div class="analytics-section-card">
      <div class="analytics-card-header">
        <div>
          <div class="analytics-card-title">🛡️ Institutional Compliance & Audit Trail</div>
          <p style="font-size:12.5px;color:var(--muted);margin:4px 0 0 0">Tamper-evident operational events logged securely under Tenant: <b>${escapeHtml(cid)}</b></p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn sm" id="alogRefresh" type="button">🔄 Refresh Logs</button>
          <button class="btn ghost sm" data-atab="overview" type="button">← Back to Overview</button>
        </div>
      </div>

      <div class="audit-log-toolbar">
        <div class="audit-filter-chips">
          ${filterChips.map(f => `
            <button class="chip ${adminAuditFilter === f.id ? 'on' : ''}" data-alog-filter="${f.id}" type="button">${f.label}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="alogSearchInput" placeholder="Filter by Login ID or User..." value="${escapeHtml(adminAuditSearch)}" onkeydown="if(event.key==='Enter'){$('alogSearchBtn').click();}" style="padding:6px 12px;border-radius:10px;border:1px solid var(--line);background:var(--input);color:var(--text);font-size:12px;width:200px">
          <button class="btn ghost sm" id="alogSearchBtn" type="button">Filter</button>
        </div>
      </div>

      ${adminAuditLoading ? `
        <div style="text-align:center;padding:36px;color:var(--muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          <div>Loading institutional audit records from database...</div>
        </div>
      ` : (logs && logs.length ? `
        <div class="audit-table-wrap" id="fullAuditWrap">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operator</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Operational Details</th>
                <th>Origin IP</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(e => `
                <tr>
                  <td style="white-space:nowrap;font-family:ui-monospace,monospace;color:var(--muted)">${formatAuditTime(e.created_at)}</td>
                  <td>
                    <div style="font-weight:700">${escapeHtml(e.user_name || e.login_id || 'System')}</div>
                    <div style="font-size:10.5px;color:var(--muted)">${escapeHtml(e.role || '—')} · ${escapeHtml(e.login_id || '—')}</div>
                  </td>
                  <td><span class="audit-action-badge ${auditActionBadgeClass(e.action)}">${escapeHtml(e.action)}</span></td>
                  <td>
                    <div style="font-weight:700">${escapeHtml(e.resource_type || '—')}</div>
                    <div style="font-size:10.5px;color:var(--muted)">${e.resource_id ? `#${escapeHtml(e.resource_id)}` : '—'}</div>
                  </td>
                  <td style="max-width:320px;font-size:11.5px">${formatAuditDetails(e.details)}</td>
                  <td style="white-space:nowrap;font-family:ui-monospace,monospace;font-size:11px;color:var(--muted)">${escapeHtml(e.ip_address || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="text-align:center;padding:40px;color:var(--muted)">
          <div style="font-size:32px;margin-bottom:8px">📜</div>
          <b>No audit events found</b>
          <p style="font-size:12px;margin:4px 0 0">Try clearing filters or search criteria.</p>
        </div>
      `)}
    </div>
  `;
}

// Admin home dashboard
function renderAdminHome() {
  if (!adminAnalyticsData && !adminAnalyticsLoading) {
    loadAdminAnalytics();
  }
  if (adminHomeTab === 'audit' && !adminAuditLogs && !adminAuditLoading) {
    loadAdminAuditLogs();
  }

  const cid = (adminAnalyticsData && adminAnalyticsData.college_id) ? adminAnalyticsData.college_id : 'BPUT';
  const openComplaints = adminAnalyticsData && adminAnalyticsData.complaints
    ? (adminAnalyticsData.complaints.open + adminAnalyticsData.complaints.in_progress)
    : COMPLAINTS.filter(c => c.st < 3 && !c.closed).length;
  const totalStudents = adminAnalyticsData && adminAnalyticsData.roster
    ? adminAnalyticsData.roster.students
    : STUDENTS.length;
  const totalStaff = adminAnalyticsData && adminAnalyticsData.roster
    ? (adminAnalyticsData.roster.faculty + adminAnalyticsData.roster.staff)
    : STAFF_LIST.length;
  const totalUsers = adminAnalyticsData && adminAnalyticsData.roster
    ? adminAnalyticsData.roster.total_users
    : (accountsList ? accountsList.length : 128);
  const activeNotices = adminAnalyticsData && adminAnalyticsData.notices
    ? adminAnalyticsData.notices.active
    : customNotices.filter(n => !isNoticeExpired(n)).length;
  const slaRate = adminAnalyticsData && adminAnalyticsData.complaints
    ? adminAnalyticsData.complaints.sla_resolution_rate + '%'
    : '100%';
  const totalEvents = adminAnalyticsData && adminAnalyticsData.audit
    ? adminAnalyticsData.audit.total_events
    : 0;
  const securityAlerts = adminAnalyticsData && adminAnalyticsData.audit
    ? adminAnalyticsData.audit.security_alerts
    : 0;

  return `
    <div class="db-page">
      <div class="db-hero-card">
        <div class="db-hero-main">
          <div class="db-hero-avatar">
            <div class="avatar">${avatarInner(adminProfile().photo)}</div>
          </div>
          <div class="db-hero-info">
            <div class="db-hero-badge-row">
              <span class="db-role-badge db-role-admin">👑 Administrator</span>
              <span class="db-campus-pill">📍 Tenant: ${escapeHtml(cid)} Campus · Core Admin</span>
              <span class="db-live-pill"><span class="db-pulse-dot"></span> ${adminAnalyticsData ? 'Live Data-Backed' : 'Telemetry Live'}</span>
              ${securityAlerts > 0 ? `<span class="analytics-badge-pill" style="background:rgba(239,68,68,0.15);color:#dc2626;border-color:rgba(239,68,68,0.3)">⚠️ ${securityAlerts} Security Alerts</span>` : ''}
            </div>
            <h2 class="db-hero-title">${greetingHtml()}, ${displayName()} 👋</h2>
            <p class="db-hero-sub">Welcome to your institutional control center. Monitor multi-tenant metrics, roster telemetry, user accounts, and compliance audit records.</p>
            <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
              <button class="chip ${adminHomeTab === 'overview' ? 'on' : ''}" data-atab="overview" type="button">📊 Institutional Analytics</button>
              <button class="chip ${adminHomeTab === 'audit' ? 'on' : ''}" data-atab="audit" type="button">🛡️ Institutional Audit Trail ${totalEvents ? `(${totalEvents})` : ''}</button>
              <button class="chip" id="analyticsRefresh" type="button" title="Fetch live server telemetry">🔄 Refresh</button>
            </div>
          </div>
        </div>
        <div class="db-quick-bar">
          <span class="db-quick-label">Quick Actions:</span>
          <div class="db-quick-chips">
            <button class="db-quick-chip" data-go="accounts" type="button"><span>➕</span> Add Account</button>
            <button class="db-quick-chip" data-go="notices" type="button"><span>📢</span> Post Notice</button>
            <button class="db-quick-chip" data-go="students" type="button"><span>🎓</span> Student Roster</button>
            <button class="db-quick-chip" data-go="staff" type="button"><span>🧑‍🏫</span> Staff Roster</button>
            <button class="db-quick-chip" data-go="complaints" type="button"><span>⚠️</span> Complaints ${openComplaints ? `<b class="db-chip-badge">${openComplaints}</b>` : ''}</button>
          </div>
        </div>
      </div>

      ${adminHomeTab === 'overview' ? renderAdminOverviewContent({
    totalStudents, totalStaff, totalUsers, activeNotices, openComplaints, slaRate,
    totalEvents, cid
  }) : renderAdminAuditContent(cid)}
    </div>
  `;
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

  // ----- Edit form -----
  if (editingProfile) {
    const field = (id, label, value, extra) =>
      `<div class="pf-form-group"><label for="${id}">${label}</label><input id="${id}" value="${escapeHtml(value)}" ${extra || ''}></div>`;
    return `
      <div class="pf-page">
        <div class="pf-hero-card">
          <div class="pf-hero-body" style="padding:24px">
            <div class="pf-hero-details">
              <h2 class="pf-name">Edit Administrator Profile</h2>
              <p class="pf-title-sub">Update your contact credentials, office designation, and public biographical details.</p>
            </div>
          </div>
        </div>
        ${message ? successBox(message) : ''}
        <div class="ttcard pf-edit-card">
          <div class="pphoto pf-edit-photo-row">
            <div class="avatar big pf-avatar-preview" id="pavprev">${avatarInner(currentProfilePhoto())}</div>
            <div class="pphoto-side">
              <div class="btns">
                <label class="btn sm filebtn"><span>📷 Choose photo</span><input id="pphoto" type="file" accept="image/*"></label>
                <button class="btn ghost sm" data-act="prrm" type="button">Remove photo</button>
              </div>
              <p class="demo" style="margin-top:8px">JPEG or PNG. The photo is cropped square and saved on this device.</p>
            </div>
          </div>

          <div class="pf-form-grid">
            <div class="pf-form-group pf-span-2">
              <label for="pfn">Full name</label>
              <input id="pfn" maxlength="40" value="${escapeHtml(p.name || accountName() || userName())}">
            </div>
            <div class="pf-form-group">
              <label for="pft">Designation</label>
              <input id="pft" maxlength="40" value="${escapeHtml(p.title)}">
            </div>
            ${field('pfd', 'Department', p.department, 'maxlength="50"')}
            ${field('pfe', 'Email address', p.email, 'type="email" maxlength="60"')}
            ${field('pfp', 'Phone number', p.phone, 'type="tel" maxlength="20"')}
            ${field('pfo', 'Office location', p.office, 'maxlength="50"')}
            ${field('pfj', 'Joined date', p.joined, 'maxlength="30"')}
            <div class="pf-form-group pf-span-2">
              <label for="pfm">Emergency contact</label>
              <input id="pfm" maxlength="60" value="${escapeHtml(p.emergency)}" placeholder="Name · Phone number">
            </div>
            <div class="pf-form-group pf-span-2">
              <label for="pfa">About / Jurisdiction</label>
              <textarea id="pfa" maxlength="200" placeholder="Brief summary of your administrative role">${escapeHtml(p.about)}</textarea>
            </div>
          </div>

          <div class="pf-note-box">
            <span>🔒 Admin ID: <b>${escapeHtml(p.adminId)}</b> (Immutable system identifier)</span>
          </div>

          <div class="err" id="pferr" role="alert"></div>

          <div class="btns" style="margin-top:16px">
            <button class="btn" data-act="psave" type="button">Save Profile Changes</button>
            <button class="btn ghost" data-act="pcancel" type="button">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  // ----- Normal view -----
  const show = v => v ? escapeHtml(v) : '—';
  return `
    <div class="pf-page">
      <div class="pf-hero-card">
        <div class="pf-hero-cover"></div>
        <div class="pf-hero-body">
          <div class="pf-avatar-wrapper">
            <div class="avatar big pf-avatar-glow">${avatarInner(p.photo)}</div>
            <span class="pf-avatar-badge" title="Administrator">🛡️</span>
          </div>

          <div class="pf-hero-details">
            <div class="pf-hero-badge-strip">
              <span class="pf-role-tag pf-role-admin">👑 Administrator</span>
              <span class="pf-status-tag"><span class="pf-dot-pulse"></span> Active Session</span>
              <span class="pf-campus-tag">🏛️ BPUT Main Campus</span>
            </div>
            <h2 class="pf-name">${displayName()}</h2>
            <p class="pf-title-sub">${escapeHtml(p.title)} · ${escapeHtml(p.department)}</p>
            ${p.about ? `<p class="pf-about-text">“${escapeHtml(p.about)}”</p>` : ''}

            <div class="pf-meta-chips">
              <div class="pf-chip" title="Click to copy Admin ID" data-acc="copy" data-text="${escapeHtml(p.adminId)}">
                <span class="pf-chip-icon">🆔</span>
                <span>${escapeHtml(p.adminId)}</span>
                <span class="pf-chip-copy">📋</span>
              </div>
              <div class="pf-chip" title="Click to copy Email" data-acc="copy" data-text="${escapeHtml(p.email)}">
                <span class="pf-chip-icon">✉️</span>
                <span>${escapeHtml(p.email)}</span>
                <span class="pf-chip-copy">📋</span>
              </div>
              <div class="pf-chip">
                <span class="pf-chip-icon">📅</span>
                <span>Joined ${escapeHtml(p.joined)}</span>
              </div>
            </div>
          </div>

          <div class="pf-hero-actions">
            <button class="btn pf-edit-btn" data-act="pedit" type="button">
              <span>✏️</span> Edit Profile
            </button>
            <button class="btn ghost sm pf-theme-btn" id="theme" type="button">
              <span>🌓</span> Toggle Theme
            </button>
          </div>
        </div>
      </div>

      ${message ? successBox(message) : ''}

      <div class="pf-cards-grid">
        <!-- Card 1: Official & Institutional Details -->
        <div class="ttcard pf-card">
          <div class="pf-card-head">
            <span class="pf-card-icon">🏛️</span>
            <div>
              <h3>Institutional Credentials</h3>
              <p class="pf-card-head-sub">Campus administrative placement & office details</p>
            </div>
          </div>
          <div class="pf-info-list">
            <div class="pf-info-row">
              <span class="pf-info-label">Admin ID</span>
              <span class="pf-info-val"><code>${show(p.adminId)}</code></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Department</span>
              <span class="pf-info-val">${show(p.department)}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Designation</span>
              <span class="pf-info-val"><b>${show(p.title)}</b></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Office / Cabin</span>
              <span class="pf-info-val">${show(p.office)}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Service Period</span>
              <span class="pf-info-val">${show(p.joined)}</span>
            </div>
          </div>
        </div>

        <!-- Card 2: Contact & Emergency -->
        <div class="ttcard pf-card">
          <div class="pf-card-head">
            <span class="pf-card-icon">📞</span>
            <div>
              <h3>Contact Channels</h3>
              <p class="pf-card-head-sub">Primary electronic mail and telephonic points of contact</p>
            </div>
          </div>
          <div class="pf-info-list">
            <div class="pf-info-row">
              <span class="pf-info-label">Official Email</span>
              <span class="pf-info-val"><a href="mailto:${escapeHtml(p.email)}" class="pf-link">${show(p.email)}</a></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Phone Line</span>
              <span class="pf-info-val"><a href="tel:${escapeHtml(p.phone)}" class="pf-link">${show(p.phone)}</a></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Emergency Line</span>
              <span class="pf-info-val">${show(p.emergency)}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Campus Hours</span>
              <span class="pf-info-val">09:00 AM – 05:30 PM (Mon – Sat)</span>
            </div>
          </div>
        </div>

        <!-- Card 3: Security & Administrative Privileges -->
        <div class="ttcard pf-card pf-span-full">
          <div class="pf-card-head">
            <span class="pf-card-icon">🛡️</span>
            <div>
              <h3>Security & Role Permissions</h3>
              <p class="pf-card-head-sub">Delegated authorities and access controls for this account</p>
            </div>
          </div>
          <div class="pf-perms-grid">
            <div class="pf-perm-item">
              <span class="pf-perm-check">✓</span>
              <div>
                <b>User Management</b>
                <p>Create, update passwords, and delete student & staff credentials</p>
              </div>
            </div>
            <div class="pf-perm-item">
              <span class="pf-perm-check">✓</span>
              <div>
                <b>Broadcast Announcements</b>
                <p>Publish campus-wide and departmental notices with urgent tags</p>
              </div>
            </div>
            <div class="pf-perm-item">
              <span class="pf-perm-check">✓</span>
              <div>
                <b>Grievance Redressal</b>
                <p>Track, assign and resolve student complaints with escalation oversight</p>
              </div>
            </div>
            <div class="pf-perm-item">
              <span class="pf-perm-check">✓</span>
              <div>
                <b>Achievement Verification</b>
                <p>Review student hackathon, sports & academic certificates with audit trail</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
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
  const raw = sessionStorage.getItem('cc_user') || userName() || '';
  const u = raw.toLowerCase().trim();
  const cu = cleanId(u);
  const found = STAFF_LIST.find(x => {
    if (!x || !x.id) return false;
    const xid = String(x.id).toLowerCase().trim();
    if (xid === u || (cu && cleanId(xid) === cu)) return true;
    if (x.email && x.email.split('@')[0].toLowerCase().trim() === u) return true;
    return false;
  });
  if (found) return found;

  // Authoritative fallback so staff profile & dashboards always have complete information
  const rk = getRole();
  const sName = sessionStorage.getItem('cc_name') || displayName();
  const sDept = sessionStorage.getItem('cc_dept') || (rk === 'principal' ? 'Institutional Directorate' : 'CSE');
  const sHostel = sessionStorage.getItem('cc_hostel') || '';
  const sPhoto = sessionStorage.getItem('cc_photo') || '';
  const defaultPos = rk === 'principal' ? 'Principal & Campus Director'
    : (rk === 'hod' ? 'Head of Department (HOD)'
      : (rk === 'warden' ? 'Hostel Warden'
        : (rk === 'placement_officer' ? 'Training & Placement Officer'
          : 'Faculty Member')));
  return {
    id: raw.toUpperCase() || (rk === 'principal' ? '9013' : '2401219013'),
    name: sName,
    dept: sDept,
    hostel: sHostel,
    pos: defaultPos,
    email: raw.includes('@') ? raw : `${raw.toLowerCase() || 'staff'}@bput.ac.in`,
    phone: '',
    joined: '2024',
    subjects: rk === 'principal' ? 'Institutional Administration' : (rk === 'hod' ? 'Advanced Computing & Dept Affairs' : 'Computer Science & Engineering'),
    photo: sPhoto
  };
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

const queryTokens = q => norm(q).trim().split(/\s+/).filter(Boolean);

// Every word typed must appear somewhere in the person's details.
// "year 3" is treated as one word so it only matches Year 3 (not the digit 3 in a roll number).
const matchTokens = q => queryTokens(norm(q).replace(/\byear\s*(\d)/g, 'year$1'));
const matchesQuery = (q, hay) => {
  const toks = matchTokens(q);
  if (!toks.length) return true;
  const h = norm(hay);
  const hClean = cleanId(hay);
  return toks.every(t => {
    if (h.includes(t)) return true;
    const tc = cleanId(t);
    return tc.length >= 2 && hClean.includes(tc);
  });
};

// Searchable text of one student / one staff member
const studentHay = x => [
  x.name, x.roll, cleanId(x.roll), x.course, studentDept(x),
  'year' + x.year, 'year ' + x.year, x.batch,
  x.cr ? 'cr class representative' : '',
  x.email, x.phone, x.hostel, x.mentor, x.guardian, x.address
].filter(Boolean).join(' ');

const staffHay = x => [
  x.name, x.id, cleanId(x.id), staffDept(x), x.pos,
  POSITION_ROLE[x.pos] || '',
  x.email, x.phone, x.subjects, x.cabin, x.hostel
].filter(Boolean).join(' ');

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
  const whole = norm(q).trim(), wholeClean = cleanId(q), first = queryTokens(q)[0] || '';
  return list.map((p, i) => {
    if (!matchesQuery(q, hayFn(p))) return null;
    const name = norm(nameFn(p)), id = norm(idFn(p)), idClean = cleanId(idFn(p));
    const score = (name.startsWith(whole) || (wholeClean && idClean === wholeClean)) ? 0 :
      (id.startsWith(whole) || (wholeClean.length >= 2 && idClean.startsWith(wholeClean))) ? 1 :
        name.split(/\s+/).some(w => w.startsWith(first)) ? 2 : 3;
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
let noticeYearFilter = 'All';
let noticeMessage = '';
let holidayMessage = '';

// Notice visibility & expiry helpers
function isNoticeExpired(n) {
  if (!n || !n[8]) return false;
  try {
    const exp = new Date(n[8]).getTime();
    return !isNaN(exp) && Date.now() > exp;
  } catch (e) {
    return false;
  }
}

function calculateNoticeExpiry(durVal, customVal) {
  if (!durVal || durVal === 'always') return '';
  const now = Date.now();
  if (durVal === '1h') return new Date(now + 1 * 3600 * 1000).toISOString();
  if (durVal === '6h') return new Date(now + 6 * 3600 * 1000).toISOString();
  if (durVal === '12h') return new Date(now + 12 * 3600 * 1000).toISOString();
  if (durVal === '1d') return new Date(now + 24 * 3600 * 1000).toISOString();
  if (durVal === '2d') return new Date(now + 2 * 24 * 3600 * 1000).toISOString();
  if (durVal === '3d') return new Date(now + 3 * 24 * 3600 * 1000).toISOString();
  if (durVal === '7d') return new Date(now + 7 * 24 * 3600 * 1000).toISOString();
  if (durVal === '14d') return new Date(now + 14 * 24 * 3600 * 1000).toISOString();
  if (durVal === '30d') return new Date(now + 30 * 24 * 3600 * 1000).toISOString();
  if (durVal === 'custom' && customVal) {
    const dt = new Date(customVal);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  return '';
}

function getNoticeDurationLabel(durVal, customVal) {
  if (!durVal || durVal === 'always') return 'Always visible';
  if (durVal === '1h') return '1 Hour';
  if (durVal === '6h') return '6 Hours';
  if (durVal === '12h') return '12 Hours';
  if (durVal === '1d') return '1 Day';
  if (durVal === '2d') return '2 Days';
  if (durVal === '3d') return '3 Days';
  if (durVal === '7d') return '1 Week';
  if (durVal === '14d') return '2 Weeks';
  if (durVal === '30d') return '1 Month';
  if (durVal === 'custom' && customVal) {
    const dt = new Date(customVal);
    if (!isNaN(dt.getTime())) {
      return 'Until ' + dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    return 'Custom duration';
  }
  return 'Always visible';
}

function isoToLocalDatetime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return '';
  }
}

function formatNoticeVisibilityBadge(n) {
  if (!n || !n[8]) return '';
  try {
    const exp = new Date(n[8]).getTime();
    if (isNaN(exp)) return '';
    const diff = exp - Date.now();
    if (diff <= 0) {
      return '<span class="badge time-exp" style="margin-right:6px" title="Expired: No longer visible to students">⌛ Expired</span>';
    }
    const mins = Math.floor(diff / (60 * 1000));
    const hours = Math.floor(diff / (3600 * 1000));
    const days = Math.floor(diff / (86400 * 1000));
    let timeText = '';
    if (days >= 2) timeText = `${days}d left`;
    else if (days === 1) timeText = `1d left`;
    else if (hours >= 1) timeText = `${hours}h left`;
    else if (mins >= 1) timeText = `${mins}m left`;
    else timeText = `< 1m left`;

    const formattedDate = new Date(exp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<span class="badge time" style="margin-right:6px" title="Visible until ${formattedDate}">⏱️ ${timeText}</span>`;
  } catch (e) {
    return '';
  }
}

function formatNoticeVisibilityDetail(n) {
  if (!n) return '';
  const aud = n[4] || 'Everyone';
  const yr = n[7] && n[7] !== 'All' ? `Year ${n[7]}` : 'All years';
  const targetDesc = `${escapeHtml(aud)}${n[7] && n[7] !== 'All' ? ' · ' + escapeHtml(yr) : ''}`;
  if (!n[8]) {
    return `<p style="font-size:12px;color:var(--sub,#888);margin-top:4px">⏱️ <b>Visibility:</b> Always visible to ${targetDesc}</p>`;
  }
  try {
    const exp = new Date(n[8]).getTime();
    if (isNaN(exp)) return '';
    const dateStr = new Date(exp).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const diff = exp - Date.now();
    if (diff <= 0) {
      return `<p style="font-size:12px;color:var(--red,#dc2626);margin-top:4px">⌛ <b>Visibility:</b> Expired on ${dateStr} (was visible to ${targetDesc})</p>`;
    }
    const days = Math.floor(diff / (86400 * 1000));
    const hours = Math.floor((diff % (86400 * 1000)) / (3600 * 1000));
    const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    let rem = '';
    if (days > 0) rem = `${days}d ${hours}h left`;
    else if (hours > 0) rem = `${hours}h ${mins}m left`;
    else rem = `${Math.max(1, mins)}m left`;

    return `<p style="font-size:12px;color:var(--accent,#2563eb);margin-top:4px">⏱️ <b>Visibility:</b> Visible to ${targetDesc} until ${dateStr} (${rem})</p>`;
  } catch (e) {
    return '';
  }
}

/* ----- Notices page ------------------------------------------------------- */
// Notice layout: [category, title, date, message, audience, postedBy, editedBy, year, expiresAt, durationLabel]
function renderNotices() {
  const message = noticeMessage; noticeMessage = '';
  const isAdmin = getRole() === 'admin';

  // Filter notices: expired notices are hidden from students and non-authors
  const visible = appData.notices.map((n, i) => [n, i])
    .filter(q => {
      const n = q[0];
      const isAuthor = Boolean(n[5] && n[5] === userName());
      // Students and non-author viewers cannot see expired notices
      if (isNoticeExpired(n) && !isStaffOrAdmin() && !isAuthor) return false;
      // Students never see notices meant for Staff only
      if (!isStaffOrAdmin() && (n[4] || 'Everyone') === 'Staff') return false;
      return true;
    })
    .filter(q => noticeFilter === 'All' || q[0][0] === noticeFilter)
    .filter(q => {
      if (noticeYearFilter === 'All') return true;
      const yr = String(q[0][7] || 'All');
      return yr === noticeYearFilter;
    });

  let out = '<h2>Notices</h2>' + successBox(message);

  // Compose form (hod / principal / warden / placement officer / admin)
  if (canPostNotice()) {
    out += `<div class="ttcard frm" style="margin-bottom:14px"><b style="font-size:18px">Compose a notice</b>` +
      `<label for="ntt">Title</label><input id="ntt" placeholder="Notice title">` +
      `<div class="two">` +
      `<div><label for="ntc">Category</label><select id="ntc"><option>General</option><option>Exam</option><option>Fee</option><option>Event</option></select></div>` +
      `<div><label for="nta">Send to (Group / Department)</label><select id="nta">${noticeAudiences().map(a => `<option>${escapeHtml(a)}</option>`).join('')}</select></div>` +
      `</div>` +
      `<div class="two" style="margin-top:8px">` +
      `<div><label for="nty">Student Year</label><select id="nty">` +
      `<option value="All">All years</option>` +
      `<option value="1">Year 1</option>` +
      `<option value="2">Year 2</option>` +
      `<option value="3">Year 3</option>` +
      `<option value="4">Year 4</option>` +
      `</select></div>` +
      `<div><label for="ntdur">Visibility Duration</label><select id="ntdur" onchange="const w=$('ntcustom_wrap');if(w)w.style.display=this.value==='custom'?'block':'none'">` +
      `<option value="always">Always visible (Permanent)</option>` +
      `<option value="1h">1 Hour (Flash / urgent notice)</option>` +
      `<option value="6h">6 Hours</option>` +
      `<option value="12h">12 Hours (Half day)</option>` +
      `<option value="1d">1 Day (24 hours)</option>` +
      `<option value="2d">2 Days</option>` +
      `<option value="3d">3 Days</option>` +
      `<option value="7d">1 Week (7 days)</option>` +
      `<option value="14d">2 Weeks (14 days)</option>` +
      `<option value="30d">1 Month (30 days)</option>` +
      `<option value="custom">Custom date & time...</option>` +
      `</select></div>` +
      `</div>` +
      `<div id="ntcustom_wrap" style="display:none;margin-top:8px;padding:10px 12px;background:var(--card,#f9fafb);border:1px dashed var(--line,#e2e8f0);border-radius:8px">` +
      `<label for="ntcustom" style="display:block;margin-bottom:4px;font-weight:600;font-size:13px">Visible until (End date & time)</label>` +
      `<input type="datetime-local" id="ntcustom">` +
      `</div>` +
      `<div style="font-size:12px;color:var(--sub,#888);margin:6px 0 10px;display:flex;align-items:center;gap:6px">` +
      `<span>ℹ️ Notice will be shown to the selected group/year and automatically expire once this period ends.</span>` +
      `</div>` +
      `<label for="ntm">Message</label><textarea id="ntm" placeholder="Write the notice"></textarea>` +
      `<div class="err" id="nterr" role="alert"></div>` +
      `<button class="btn" id="npost" type="button" style="width:100%">Post notice</button></div>`;
  }

  // Filter chips (Category + Student Year)
  out += `<div class="notice-filters" style="margin:12px 0 16px;display:flex;flex-direction:column;gap:10px">` +
    `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">` +
    `<span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;opacity:0.75;min-width:92px">Category:</span>` +
    `<div class="chips" style="margin:0;gap:6px">` +
    ['All', 'Exam', 'Fee', 'Event', 'General'].map(c => `<button class="chip ${c === noticeFilter ? 'on' : ''}" data-nf="${c}" type="button">${c}</button>`).join('') +
    `</div>` +
    `</div>` +
    `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">` +
    `<span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;opacity:0.75;min-width:92px">Student Year:</span>` +
    `<div class="chips syears" style="margin:0;gap:6px">` +
    ['All', '1', '2', '3', '4'].map(y => `<button class="chip ${y === noticeYearFilter ? 'on' : ''}" data-nyf="${y}" type="button">${y === 'All' ? 'All years' : 'Year ' + y}</button>`).join('') +
    `</div>` +
    `</div>` +
    `</div>`;

  if (!visible.length) {
    out += `<div class="ttcard" style="text-align:center;padding:28px 16px;color:var(--sub,#888)">` +
      `<div style="font-size:28px;margin-bottom:6px">📢</div>` +
      `<b style="display:block;font-size:15px;color:var(--text,#111);margin-bottom:4px">No notices found</b>` +
      `<p style="margin:0 0 12px;font-size:13px">No notices match category "${escapeHtml(noticeFilter)}" and ${noticeYearFilter === 'All' ? 'any year' : 'Year ' + noticeYearFilter}.</p>` +
      `<button class="btn sm ghost" data-nreset="1" type="button">Reset filters</button>` +
      `</div>`;
  } else {
    out += '<div class="list">';
    // The notice list (first one starts expanded)
    out += visible.map((q, k) => {
      const n = q[0], i = q[1];
      // Admin can edit all notices; teachers only the ones they posted
      const canEdit = isAdmin || (n[5] && n[5] === userName());
      const yrLabel = n[7] && n[7] !== 'All' ? `Year ${n[7]}` : '';
      const timeBadge = formatNoticeVisibilityBadge(n);

      // Edit mode
      if (editingNotice === i && canEdit) {
        return `<div class="item frm"><b>Edit notice</b>` +
          `<label for="ent">Title</label><input id="ent" value="${escapeHtml(n[1])}">` +
          `<div class="two">` +
          `<div><label for="enc">Category</label><select id="enc">${['General', 'Exam', 'Fee', 'Event'].map(c => `<option ${c === n[0] ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
          `<div><label for="ena">Send to</label><select id="ena">${[...new Set([n[4] || 'Everyone', ...noticeAudiences()])].map(c => `<option ${c === (n[4] || 'Everyone') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>` +
          `</div>` +
          `<div class="two" style="margin-top:8px">` +
          `<div><label for="eny">Student Year</label><select id="eny">${['All', '1', '2', '3', '4'].map(y => `<option value="${y}" ${(n[7] || 'All') === y ? 'selected' : ''}>${y === 'All' ? 'All years' : 'Year ' + y}</option>`).join('')}</select></div>` +
          `<div><label for="endur">Visibility Duration</label><select id="endur" onchange="const w=$('encustom_wrap');if(w)w.style.display=this.value==='custom'?'block':'none'">` +
          `<option value="keep" ${n[8] ? 'selected' : ''}>${n[8] ? (isNoticeExpired(n) ? '⌛ Currently Expired (Extend duration below)' : 'Keep current (' + (n[9] || 'Timed') + ')') : 'Keep current (Always visible)'}</option>` +
          `<option value="always" ${!n[8] ? 'selected' : ''}>Always visible (No expiry)</option>` +
          `<option value="1h">Extend: +1 Hour from now</option>` +
          `<option value="6h">Extend: +6 Hours from now</option>` +
          `<option value="12h">Extend: +12 Hours from now</option>` +
          `<option value="1d">Extend: +1 Day from now</option>` +
          `<option value="2d">Extend: +2 Days from now</option>` +
          `<option value="3d">Extend: +3 Days from now</option>` +
          `<option value="7d">Extend: +1 Week from now</option>` +
          `<option value="14d">Extend: +2 Weeks from now</option>` +
          `<option value="30d">Extend: +1 Month from now</option>` +
          `<option value="custom">Custom date & time...</option>` +
          `</select></div>` +
          `</div>` +
          `<div id="encustom_wrap" style="display:${n[8] ? 'block' : 'none'};margin-top:8px;padding:10px 12px;background:var(--card,#f9fafb);border:1px dashed var(--line,#e2e8f0);border-radius:8px">` +
          `<label for="encustom" style="display:block;margin-bottom:4px;font-weight:600;font-size:13px">Visible until (End date & time)</label>` +
          `<input type="datetime-local" id="encustom" value="${isoToLocalDatetime(n[8])}">` +
          `</div>` +
          `<label for="enm">Message</label><textarea id="enm">${escapeHtml(n[3])}</textarea>` +
          `<div class="err" id="enerr" role="alert"></div>` +
          `<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="nsave:${i}" type="button">Save</button><button class="btn ghost sm" data-act="ncancel" type="button">Cancel</button></div></div>`;
      }

      // Normal accordion item
      return `<div class="item nt ${k === 0 ? 'open' : ''}">` +
        `<button class="ntb" data-dd type="button"><b>${escapeHtml(n[1])}</b><span>` +
        (noticeNewSet.has(noticeKey(n)) ? '<span class="badge bad" style="margin-right:6px">NEW</span>' : '') +
        (yrLabel ? `<span class="badge yr" style="margin-right:6px">${escapeHtml(yrLabel)}</span>` : '') +
        timeBadge +
        `<span class="badge">${n[0]} · ${n[2]}</span><i class="chev">▾</i></span></button>` +
        `<div class="dd"><div><p>${escapeHtml(n[3])}</p>` +
        (n[5] ? `<p>Posted by ${escapeHtml(n[5])}${n[4] && n[4] !== 'Everyone' ? ' · for ' + escapeHtml(n[4]) : ''}${yrLabel ? ' · ' + yrLabel : ''}</p>` : '') +
        formatNoticeVisibilityDetail(n) +
        (n[6] ? `<p>✎ Edited by ${escapeHtml(n[6].n)}</p>` : '') +
        (canEdit
          ? `<div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-act="ned:${i}" type="button">Edit</button><button class="btn ghost sm" data-ndel="${i}" type="button">Delete</button></div>`
          : '') +
        `</div></div></div>`;
    }).join('') + '</div>';
  }

  return out;
}

// Post a new notice
function postNotice() {
  const title = $('ntt').value.trim(), body = $('ntm').value.trim(), errBox = $('nterr');
  if (title.length < 3) { errBox.textContent = 'Add a title.'; return; }
  if (body.length < 5) { errBox.textContent = 'Write the notice message.'; return; }

  const yearVal = $('nty') ? $('nty').value : 'All';
  const durVal = $('ntdur') ? $('ntdur').value : 'always';
  const customVal = $('ntcustom') ? $('ntcustom').value : '';

  if (durVal === 'custom') {
    if (!customVal) {
      errBox.textContent = 'Please choose a visibility end date and time.';
      return;
    }
    const t = new Date(customVal).getTime();
    if (isNaN(t) || t <= Date.now()) {
      errBox.textContent = 'Visibility expiry time must be in the future.';
      return;
    }
  }

  const expiresAt = calculateNoticeExpiry(durVal, customVal);
  const durLabel = getNoticeDurationLabel(durVal, customVal);

  const notice = [
    $('ntc').value, title,
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    body, $('nta').value, userName(), null, yearVal,
    expiresAt, durLabel
  ];
  appData.notices.unshift(notice);
  customNotices.unshift(notice);
  saveJson('cc_nt', customNotices);
  if (getRole() === 'admin' && typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);

  noticeFilter = 'All';
  noticeYearFilter = 'All';
  const visText = durLabel && durLabel !== 'Always visible' ? ' · ' + durLabel : '';
  noticeMessage = '✅ Notice posted for ' + escapeHtml(notice[4]) + (yearVal !== 'All' ? ' · Year ' + yearVal : '') + visText + '.';
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
  if (getRole() === 'admin' && typeof loadAdminAnalytics === 'function') loadAdminAnalytics(true);
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
  if (typeof API !== 'undefined' && API.createIssue) {
    API.createIssue({
      title: $('ity').value + ': ' + text.slice(0, 50),
      description: text,
      category: $('ity').value
    }).catch(() => { });
  }

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

  const durVal = $('endur') ? $('endur').value : 'keep';
  const customVal = $('encustom') ? $('encustom').value : '';

  let expiresAt = n[8] || '';
  let durLabel = n[9] || (n[8] ? 'Custom' : 'Always visible');

  if (durVal === 'always') {
    expiresAt = '';
    durLabel = 'Always visible';
  } else if (durVal === 'custom') {
    if (!customVal) {
      errBox.textContent = 'Please choose a visibility end date and time.';
      return;
    }
    const t = new Date(customVal).getTime();
    if (isNaN(t) || t <= Date.now()) {
      errBox.textContent = 'Visibility expiry time must be in the future.';
      return;
    }
    expiresAt = new Date(customVal).toISOString();
    durLabel = getNoticeDurationLabel('custom', customVal);
  } else if (durVal !== 'keep') {
    expiresAt = calculateNoticeExpiry(durVal, '');
    durLabel = getNoticeDurationLabel(durVal, '');
  } else if (customVal && customVal !== isoToLocalDatetime(n[8])) {
    const t = new Date(customVal).getTime();
    if (!isNaN(t)) {
      expiresAt = new Date(customVal).toISOString();
      durLabel = getNoticeDurationLabel('custom', customVal);
    }
  }

  n[0] = $('enc').value;
  n[1] = title;
  n[3] = body;
  n[4] = $('ena').value;
  n[6] = { n: userName(), at: Date.now() };       // "edited by" record
  n[7] = $('eny') ? $('eny').value : (n[7] || 'All');
  n[8] = expiresAt;
  n[9] = durLabel;
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

  const role = getRole();
  if (role === 'student' && $('pg-home')) {
    // --- Student home ---
    $('pg-home').innerHTML = `
    <div class="db-page">
      <div class="db-hero-card">
        <div class="db-hero-main">
          <div class="db-hero-avatar">
            <div class="avatar">${avatarInner(myPhotoValue(myStudent()))}</div>
          </div>
          <div class="db-hero-info">
            <div class="db-hero-badge-row">
              <span class="db-role-badge db-role-student">🎓 Student</span>
              <span class="db-campus-pill">📍 BPUT Campus · B.Tech</span>
              <span class="db-live-pill"><span class="db-pulse-dot"></span> Session 2026-27</span>
            </div>
            <h2 class="db-hero-title">${greetingHtml()}, ${displayName()} 👋</h2>
            <p class="db-hero-sub">Here is your campus dashboard. Keep track of attendance, class schedules, and leave requests.</p>
          </div>
        </div>
        <div class="db-quick-bar">
          <span class="db-quick-label">Quick Links:</span>
          <div class="db-quick-chips">
            <button class="db-quick-chip" data-go="timetable" type="button"><span>📅</span> Timetable</button>
            <button class="db-quick-chip" data-go="leave" type="button"><span>📝</span> Apply Leave / SMS</button>
            <button class="db-quick-chip" data-go="notices" type="button"><span>📢</span> Notices</button>
            <button class="db-quick-chip" data-go="achievements" type="button"><span>🏆</span> Post Achievement</button>
          </div>
        </div>
      </div>

      <div class="db-stats-grid">
        <button class="db-stat-tile ${overallAttendance() < 75 ? 'db-accent-rose' : 'db-accent-emerald'}" data-go="attendance" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">📊</div>
            <span class="db-tile-tag ${overallAttendance() < 75 ? 'db-tag-urgent' : ''}">${overallAttendance() < 75 ? 'Below 75%' : 'Good Standing'}</span>
          </div>
          <div class="db-tile-metric">${overallAttendance()}%</div>
          <div class="db-tile-title">Overall Attendance</div>
          <div class="db-tile-foot">
            <span>${overallAttendance() < 75 ? '⚠️ Risk of debarment' : '✓ Above required limit'}</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-blue" data-go="leave" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">📝</div>
            <span class="db-tile-tag">${leaveRequests.student.filter(r => r.s === 'p' || r.s === 'Pending').length > 0 ? 'Pending HOD' : 'Clear'}</span>
          </div>
          <div class="db-tile-metric">${leaveRequests.student.filter(r => r.s === 'p' || r.s === 'Pending').length} Pending</div>
          <div class="db-tile-title">Leave &amp; Gatepass</div>
          <div class="db-tile-foot">
            <span>Offline SMS + Portal sync</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>

        <button class="db-stat-tile db-accent-purple" data-go="notices" type="button">
          <div class="db-tile-top">
            <div class="db-tile-icon-box">📢</div>
            <span class="db-tile-tag">Campus News</span>
          </div>
          <div class="db-tile-metric">${appData.notices.length}</div>
          <div class="db-tile-title">Active Notices</div>
          <div class="db-tile-foot">
            <span>${appData.notices[0] ? escapeHtml(appData.notices[0][1]) : 'Latest updates'}</span>
            <span class="db-tile-arrow">→</span>
          </div>
        </button>
      </div>

      ${recBanner()}
      ${renderNotifications()}
      ${renderTodayTimetable()}
    </div>
  `;
  }

  // --- Timetable (Week / Day switch + .ics export) ---
  if ($('pg-timetable')) {
    $('pg-timetable').innerHTML =
      `<div class="tt-header-row" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">` +
      `  <div><h2 style="margin:0">Timetable</h2><p class="sub" style="margin:4px 0 0 0">${isStaffRole() ? 'Your teaching schedule' : 'Semester 3 · Computer Science'}</p></div>` +
      `  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">` +
      `    <button class="btn sm" data-ics type="button" style="background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2));border:1px solid rgba(99,102,241,0.4);color:var(--text);display:inline-flex;align-items:center;gap:6px" title="Export to Google Calendar, Apple Calendar or Outlook"><span>📅</span> Export (.ics)</button>` +
      `    <div class="chips" style="margin:0"><button class="chip ${timetableView === 'week' ? 'on' : ''}" data-tv="week">Week</button>` +
      `    <button class="chip ${timetableView === 'day' ? 'on' : ''}" data-tv="day">Day</button></div>` +
      `  </div>` +
      `</div>` +
      (timetableView === 'week' ? renderWeekTable() : renderDayView());
  }

  // --- Fees (Roadmap) ---
  if ($('pg-fees')) {
    $('pg-fees').innerHTML = renderRoadmap(
      'Tuition & Campus Fees',
      '💳',
      'Phase 2 Milestone · Payment Gateway Integration',
      'Challan generation and online fee reconciliation requires integration with State Bank Collect / Billdesk ERP webhooks.',
      'Simulated payment buttons and mock fee liabilities have been retired to preserve operational integrity. Official accounting ledger sync will activate in the next administrative release.'
    );
  }

  // --- Authoritative profile based on role ---
  if ($('pg-profile')) {
    if (role === 'admin') $('pg-profile').innerHTML = renderAdminProfile();
    else if (isStaffRole()) $('pg-profile').innerHTML = renderStaffProfile();
    else $('pg-profile').innerHTML = renderStudentProfile();
  }

  // --- Events & Fests page ---
  if ($('pg-events')) $('pg-events').innerHTML = renderEvents();
}

// Student profile page (shows the admin-edited record when the signed-in roll number matches one)
function renderStudentProfile() {
  const r = myStudent();
  const photo = myPhotoValue(r);
  const v = (key, demo) => escapeHtml(r ? (r[key] || '—') : demo);
  const roll = r ? escapeHtml(r.roll) : escapeHtml(userName().toUpperCase());
  const name = r ? escapeHtml(r.name) : displayName();
  const course = r ? escapeHtml(r.course + ' · Year ' + r.year) : 'B.Tech · Computer Science · Semester 3';
  const email = v('email', 'student@college.example');

  return `
    <div class="pf-page">
      <div class="pf-hero-card">
        <div class="pf-hero-cover"></div>
        <div class="pf-hero-body">
          <div class="pf-avatar-wrapper">
            <div class="avatar big pf-avatar-glow">${r ? avatarInner(photo, r.name) : avatarInner(photo)}</div>
            <span class="pf-avatar-badge" title="Student">🎓</span>
          </div>

          <div class="pf-hero-details">
            <div class="pf-hero-badge-strip">
              <span class="pf-role-tag pf-role-student">🎓 Student</span>
              <span class="pf-status-tag"><span class="pf-dot-pulse"></span> Enrolled</span>
              <span class="pf-campus-tag">🏛️ BPUT Main Campus</span>
            </div>
            <h2 class="pf-name">${name}</h2>
            <p class="pf-title-sub">${course}</p>

            <div class="pf-meta-chips">
              <div class="pf-chip" title="Click to copy Roll Number" data-acc="copy" data-text="${roll}">
                <span class="pf-chip-icon">🆔</span>
                <span>${roll}</span>
                <span class="pf-chip-copy">📋</span>
              </div>
              <div class="pf-chip" title="Click to copy Email" data-acc="copy" data-text="${email}">
                <span class="pf-chip-icon">✉️</span>
                <span>${email}</span>
                <span class="pf-chip-copy">📋</span>
              </div>
              <div class="pf-chip">
                <span class="pf-chip-icon">🏛️</span>
                <span>Batch ${v('batch', '2023 – 2027')}</span>
              </div>
            </div>
          </div>

          <div class="pf-hero-actions">
            <button class="btn ghost sm pf-theme-btn" id="theme" type="button">
              <span>🌓</span> Toggle Theme
            </button>
          </div>
        </div>
      </div>

      <div class="pf-cards-grid">
        <!-- Card 1: Academic Profile -->
        <div class="ttcard pf-card">
          <div class="pf-card-head">
            <span class="pf-card-icon">📚</span>
            <div>
              <h3>Academic Record</h3>
              <p class="pf-card-head-sub">Course enrollment and mentor details</p>
            </div>
          </div>
          <div class="pf-info-list">
            <div class="pf-info-row">
              <span class="pf-info-label">Roll Number</span>
              <span class="pf-info-val"><code>${roll}</code></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Program & Branch</span>
              <span class="pf-info-val">${r ? escapeHtml(r.course) : 'B.Tech CSE'}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Current Year & Sem</span>
              <span class="pf-info-val"><b>Year ${r ? r.year : 2} · Semester 3</b></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Batch Group</span>
              <span class="pf-info-val">${v('batch', 'A')}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Faculty Mentor</span>
              <span class="pf-info-val">${v('mentor', 'Dr. A. Mishra')}</span>
            </div>
          </div>
        </div>

        <!-- Card 2: Contact & Hostel -->
        <div class="ttcard pf-card">
          <div class="pf-card-head">
            <span class="pf-card-icon">🏠</span>
            <div>
              <h3>Contact & Residence</h3>
              <p class="pf-card-head-sub">Hostel allocation and communications</p>
            </div>
          </div>
          <div class="pf-info-list">
            <div class="pf-info-row">
              <span class="pf-info-label">Email ID</span>
              <span class="pf-info-val"><a href="mailto:${email}" class="pf-link">${email}</a></span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Phone</span>
              <span class="pf-info-val">${v('phone', '+91 98765 43210')}</span>
            </div>
            <div class="pf-info-row">
              <span class="pf-info-label">Hostel Room</span>
              <span class="pf-info-val">${v('hostel', 'Block B, Room 214')}</span>
            </div>
            ${r && r.guardian ? `<div class="pf-info-row"><span class="pf-info-label">Guardian</span><span class="pf-info-val">${v('guardian', '')}</span></div>` : ''}
            ${r && r.blood ? `<div class="pf-info-row"><span class="pf-info-label">Blood Group</span><span class="pf-info-val">${v('blood', '')}</span></div>` : ''}
          </div>
        </div>
      </div>

      ${renderRecruitingCard()}
      ${renderAccountSettings()}

      <p class="demo">${r ? 'Your institutional details are managed by the admin office.' : 'Demo student data shown for preview.'}</p>
    </div>
  `;
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

  // Background server synchronization for active student and review pages
  if (appData.tab === 'leave' && !studentLeavesLoading) loadStudentLeavesFromServer();
  if (appData.tab === 'achievements' && !achievementsLoading) loadAchievementsFromServer();
  if (appData.tab === 'complaints' && !communityLoading && getRole() === 'student') loadCommunityComplaints();

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
      if (role === 'warden') {
        $('pg-home').innerHTML = renderWardenHome();
        $('pg-profile').innerHTML = renderStaffProfile();
        $('pg-attendance').innerHTML = renderWardenAttendance();
        $('pg-complaints').innerHTML = renderWardenComplaints();
        if (hasTab('students')) $('pg-students').innerHTML = renderStudents();
        if (hasTab('resources')) $('pg-resources').innerHTML = renderResources();
      } else if (role === 'placement_officer') {
        $('pg-home').innerHTML = renderPlacementHome();
        $('pg-profile').innerHTML = renderStaffProfile();
        if (hasTab('students')) $('pg-students').innerHTML = renderStudents();
        if (hasTab('recruit')) $('pg-recruit').innerHTML = renderRecruitAdmin();
        if (hasTab('resources')) $('pg-resources').innerHTML = renderResources();
      } else if (role === 'principal') {
        try { if ($('pg-home')) $('pg-home').innerHTML = renderPrincipalHome(); } catch (e) { console.error('Principal home render error:', e); }
        if ($('pg-profile')) $('pg-profile').innerHTML = renderStaffProfile();
        if (hasTab('classes') && $('pg-classes')) $('pg-classes').innerHTML = renderHodClassTracking();
        if (hasTab('students') && $('pg-students')) $('pg-students').innerHTML = renderStudents();
        if (hasTab('complaints') && $('pg-complaints')) $('pg-complaints').innerHTML = renderStaffComplaints();
        if (hasTab('resources') && $('pg-resources')) $('pg-resources').innerHTML = renderResources();
        if (hasTab('achievements') && $('pg-achievements')) $('pg-achievements').innerHTML = renderAchievementReview();
      } else if (role === 'hod') {
        try { if ($('pg-home')) $('pg-home').innerHTML = renderHODHome(); } catch (e) { console.error('HOD home render error:', e); }
        if ($('pg-profile')) $('pg-profile').innerHTML = renderStaffProfile();
        if (hasTab('attendance') && $('pg-attendance')) $('pg-attendance').innerHTML = renderTeacherAttendance();
        if (hasTab('students') && $('pg-students')) $('pg-students').innerHTML = renderStudents();
        if (hasTab('achievements') && $('pg-achievements')) $('pg-achievements').innerHTML = renderAchievementReview();
        if (hasTab('timetable') && $('pg-timetable')) $('pg-timetable').innerHTML += simulationButton();
        if (hasTab('complaints') && $('pg-complaints')) $('pg-complaints').innerHTML = renderStaffComplaints();
        if (hasTab('resources') && $('pg-resources')) $('pg-resources').innerHTML = renderResources();
        if (hasTab('classes') && $('pg-classes')) $('pg-classes').innerHTML = renderHodClassTracking();
      } else {
        $('pg-home').innerHTML = renderStaffHome();
        $('pg-profile').innerHTML = renderStaffProfile();
        if (hasTab('attendance') && $('pg-attendance')) $('pg-attendance').innerHTML = renderTeacherAttendance();
        if (hasTab('students') && $('pg-students')) $('pg-students').innerHTML = renderStudents();
        if (hasTab('achievements') && $('pg-achievements')) $('pg-achievements').innerHTML = renderAchievementReview();
        if (hasTab('timetable') && $('pg-timetable')) $('pg-timetable').innerHTML += simulationButton();
        if (hasTab('complaints') && $('pg-complaints')) $('pg-complaints').innerHTML = renderStaffComplaints();
        if (hasTab('resources') && $('pg-resources')) $('pg-resources').innerHTML = renderResources();
        if (hasTab('recruit') && $('pg-recruit')) $('pg-recruit').innerHTML = renderRecruitAdmin();
      }
    } else {
      // student
      if ($('pg-results')) $('pg-results').innerHTML = renderResults();
      if ($('pg-attendance')) $('pg-attendance').innerHTML = renderStudentAttendance();
      if ($('pg-opps')) $('pg-opps').innerHTML = renderOpportunities();
      if ($('pg-achievements')) $('pg-achievements').innerHTML = renderStudentAchievements();
      if ($('pg-complaints')) $('pg-complaints').innerHTML = renderComplaints();
      if ($('pg-mess')) $('pg-mess').innerHTML = renderMess();
      if (recState === null || recStale) loadRecruiting();       // contact requests + recruiter visibility
      if ($('pg-resources')) $('pg-resources').innerHTML = renderResources();
    }
    if ($('pg-leave')) $('pg-leave').innerHTML = role === 'principal' ? renderPrincipalLeavePage() : (role === 'hod' ? renderHODLeavePage() : renderLeave());
  }

  // Shared by all roles
  if (hasTab('classes') && $('pg-classes')) $('pg-classes').innerHTML = renderHodClassTracking();
  if (hasTab('exams') && $('pg-exams')) $('pg-exams').innerHTML = renderExaminations();
  if ($('pg-notices')) $('pg-notices').innerHTML = renderNotices();
  if ($('pg-holidays')) $('pg-holidays').innerHTML = renderHolidaysPage();
  if ($('pg-events')) $('pg-events').innerHTML = renderEvents();

  translatePage(document.body);
  movePill();
}


/* =============================================================================
   23. NAVIGATION (tabs, swipe, keyboard)
   ============================================================================= */

// Universal DROP-DOWN animation trigger for active page and components
function triggerTabDropDown() {
  const page = $('pg-' + appData.tab);
  if (!page) return;
  page.classList.remove('tab-drop-down', 'cas');
  void page.offsetWidth;
  page.classList.add('tab-drop-down', 'cas');
  clearTimeout(window._cascadeTimer);
  window._cascadeTimer = setTimeout(() => page.classList.remove('tab-drop-down', 'cas'), 1000);
}

// Open a tab. dir = 1 (came from the right) or -1 (from the left) for the slide animation.
function goToTab(name, dir, mode) {   // mode: 'back' (from the Back button) | 'reset' (fresh start after sign in)
  if (name !== 'home' && !hasTab(name)) return;   // this role has no such page
  const prev = navState();
  if (name !== appData.tab) { noticeNewSet.clear(); closedNewSet.clear(); }   // forget "NEW" labels when leaving Notices
  // Reset temporary UI state when leaving a page
  leaveMessage = '';
  removeConfirm = '';
  removeStaffConfirm = '';
  accountsList = null; accountsLoading = false; accountsError = ''; pwEditing = ''; accRemoveConfirm = ''; accQuery = ''; accRoleFilter = ''; accResults = null;   // Accounts page reloads from the server each visit
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
  page.classList.remove('hidden', 'tab-drop-down', 'from-l', 'from-r', 'cas');

  render();

  // Fresh server synchronization for active section
  if (name === 'leave') loadStudentLeavesFromServer();
  else if (name === 'achievements') loadAchievementsFromServer();
  else if (name === 'complaints' && getRole() === 'student') loadCommunityComplaints();

  // Universal DROP-DOWN effect when switching tabs everywhere
  triggerTabDropDown();

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
  try { history.pushState({ cc: 1 }, ''); } catch (e) { }
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
    try { history.pushState({ cc: 1 }, ''); } catch (e) { }
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

const TAB_ICONS = {
  home: '🏠', timetable: '🗓️', attendance: '✅', results: '📊', fees: '💳', notices: '📢', events: '🎪', holidays: '🏖️',
  opps: '💼', achievements: '🏆', leave: '📝', complaints: '📣', mess: '🍽️', profile: '👤', resources: '📚', recruit: '🤝',
  classes: '📊'
};
// Extra words that should find a page ("marks" finds Results, "food" finds Mess ...)
const TAB_KEYWORDS = {
  home: 'dashboard overview', timetable: 'schedule class timing periods week', attendance: 'present absent percentage',
  results: 'marks grades cgpa sgpa semester exam score', fees: 'payment dues tuition hostel pay receipt', notices: 'announcements circular news',
  events: 'fest hackathon workshop cultural sports tournament registration pass tickets techfest',
  holidays: 'calendar festival vacation off', opps: 'opportunities jobs internship placement career',
  achievements: 'awards certificates hackathon prizes', leave: 'apply absence casual medical gatepass outpass', complaints: 'grievance issue problem hostel',
  mess: 'food menu breakfast lunch dinner snacks', profile: 'account photo password details me',
  recruit: 'recruiter contact request placement candidates shortlist', resources: 'notes study material download pdf slides papers syllabus',
  classes: 'classes held total lectures subject section year conduction hod academic log topics syllabus'
};

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
  (appData.notices || []).forEach(n => out.push({ icon: '📢', title: n[1], sub: 'Notice · ' + n[2] + (n[7] && n[7] !== 'All' ? ' · Year ' + n[7] : ''), tab: 'notices', kw: n[0] + ' ' + (n[3] || '') + (n[7] && n[7] !== 'All' ? ' year ' + n[7] : '') }));
  HOLIDAYS.forEach(h => out.push({ icon: '🏖️', title: h[2], sub: 'Holiday · ' + h[1] + ' ' + MONTH_NAMES[h[0]], tab: 'holidays', kw: h[3] }));
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
  } catch (e) { }
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
  pending_officer: ['⏳', 'Waiting for the placement officer', ''],
  awaiting_student: ['🕐', 'Approved by the college · waiting for the student\'s consent', ''],
  approved: ['✅', 'Contact released', 'ok'],
  declined_officer: ['✖', 'Declined by the placement office', 'bad'],
  declined_student: ['✖', 'The student chose not to share contact details', 'bad']
};
const YEAR_TXT = ['', '1st', '2nd', '3rd', '4th', '5th'];
const fmtMonth = m => m ? new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
const fmtDay = iso => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

let rc = {
  sum: null, items: null, total: 0, branches: [], reqs: null, busy: {}, err: '', msg: '', open: {}, reqOpen: '',
  reqForm: { company: '', message: '' }, f: { branch: '', cgpa: '', skills: '', ach: '', short: false }
};

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
  if (!n) return '';
  const firstReq = (recState && recState.requests) ? recState.requests.find(r => r.status === 'awaiting_student') : null;
  const msgSnippet = firstReq && firstReq.message ? ` — “${escapeHtml(firstReq.message)}”` : '';
  return `<div class="note" style="margin-top:14px;border-color:#3b82f6;background:rgba(59,130,246,0.08);color:var(--text)">💬 <b>Recruiter Message Notification:</b> ${n} recruiter${n === 1 ? ' sent a message &amp; wants' : 's sent messages &amp; want'} to connect with you${msgSnippet}. <button class="btn sm" data-go="profile" type="button" style="margin-left:8px">View &amp; Reply</button></div>`;
}
function renderRecruitingCard() {
  if (getRole() !== 'student') return '';
  if (!recState) return `<div class="ttcard frm acct"><h3>🕶️ Recruiter visibility</h3><p class="sub">Loading…</p></div>`;
  const e = escapeHtml, p = recState.profile || { visible: false, cgpa: '', backlogs: 0, subjects: [], skills: [], code: '' };
  const d = recDraft || { visible: p.visible, cgpa: p.cgpa, backlogs: String(p.backlogs), subjects: p.subjects.join(', '), skills: p.skills.join(', ') };
  const msg = recMsg, err = recErr; recMsg = ''; recErr = '';
  const field = (k, label, ph, type) => `<label for="rcd-${k}">${label}</label><input id="rcd-${k}" data-rcd="${k}" ${type ? `type="${type}"` : ''} placeholder="${ph}" value="${e(d[k])}">`;
  return `<div class="ttcard frm acct"><h3>🕶️ Recruiter visibility &amp; Messages</h3>` +
    `<p class="sub">Recruiters can see an <b>anonymous</b> profile: an ID, branch, year, CGPA, skills and verified achievements. Your name, photo, phone, e-mail and address are never shown. ` +
    `Your contact details are shared only if the placement officer approves a request <b>and</b> you agree.</p>` +
    `<label class="rc-switch"><input type="checkbox" id="rcd-visible" data-rcd="visible" ${d.visible ? 'checked' : ''}> Show my anonymous profile to recruiters</label>` +
    (p.code ? `<p style="margin:8px 0 0">Your anonymous ID: <b>${e(p.code)}</b></p>` : '') +
    field('cgpa', 'CGPA', 'e.g. 8.2', 'number').replace('<input', '<input min="0" max="10" step="0.01"') +
    field('backlogs', 'Active backlogs', '0', 'number').replace('<input', '<input min="0" max="50"') +
    `<div class="form-preset-wrap"><span class="preset-label">💡 Common Strong Subjects (tap to add):</span><div class="preset-chips">` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:Data Structures &amp; Algorithms:append">Data Structures</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:DBMS:append">DBMS</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:Operating Systems:append">Operating Systems</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:Computer Networks:append">Computer Networks</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:Software Engineering:append">Software Eng.</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:Web Development:append">Web Dev</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:Machine Learning:append">Machine Learning</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-subjects:Cloud Computing:append">Cloud Computing</button>` +
    `</div></div>` +
    field('subjects', 'Strong subjects (comma separated)', 'e.g. Data Structures, DBMS') +
    `<div class="form-preset-wrap"><span class="preset-label">💡 Popular In-Demand Skills (tap to add):</span><div class="preset-chips">` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:Python:append">Python</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:Java:append">Java</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:JavaScript:append">JavaScript</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:React:append">React</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:Node.js:append">Node.js</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:SQL:append">SQL</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:Git &amp; GitHub:append">Git &amp; GitHub</button>` +
    `<button type="button" class="preset-chip" data-preset="rcd-skills:Docker:append">Docker</button>` +
    `</div></div>` +
    field('skills', 'Skills (comma separated)', 'e.g. Python, SQL, React') +
    `<p class="sub" style="margin:6px 0 0">Do not put your name or contact details here. They are removed automatically. CGPA is self-reported.</p>` +
    (err ? `<div class="err" role="alert">${e(err)}</div>` : '') + (msg ? `<div class="okmsg">${e(msg)}</div>` : '') +
    `<button class="btn sm" data-rec="save" type="button" style="margin-top:8px">Save</button>` +
    (recState.requests.length ? `<h3 style="margin:20px 0 8px">💬 Recruiter Messages &amp; Contact Requests</h3><div class="list">` + recState.requests.map(r => {
      const st = RC_STATUS[r.status];
      return `<div class="item"><div class="top"><b>${e(r.company)}</b><span class="badge ${st[2]}">${st[0]}</span></div>` +
        `<p class="sub">Approved by the placement office · ${fmtDay(r.at)}</p>` +
        `<div class="recruiter-msg-box">` +
        `<div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:#2563eb"><span>💬 Message from Recruiter (${e(r.company)}):</span></div>` +
        `<div class="rec-msg-bubble">“${e(r.message || 'We reviewed your candidate profile and would like to connect regarding placement.')}”</div>` +
        (r.status === 'awaiting_student'
          ? `<div class="rec-reply-row">` +
            `<label style="font-size:12px;font-weight:600">Your reply message / availability note (optional):</label>` +
            `<input id="rec-reply-${r.id}" class="rec-reply-input" placeholder="e.g. Available for technical interview this week, reach me at...">` +
            `<div class="preset-chips" style="margin-top:4px">` +
            `<button type="button" class="preset-chip sm" data-preset="rec-reply-${r.id}:Available for technical interview this week:">📅 Available this week</button>` +
            `<button type="button" class="preset-chip sm" data-preset="rec-reply-${r.id}:Interested in software engineering roles:">💻 Interested in SWE role</button>` +
            `<button type="button" class="preset-chip sm" data-preset="rec-reply-${r.id}:Please reach me on my registered student email:">📧 Reach via email</button>` +
            `</div>` +
            `<div class="btns" style="margin-top:12px"><button class="btn sm" data-rec="acc:${r.id}" type="button">Share my contact details</button><button class="btn ghost sm" data-rec="dec:${r.id}" type="button">No thanks</button></div>` +
            `</div>`
          : `<p class="rc-status ${st[2]}">${r.status === 'approved' ? '✅ You agreed to share your contact details' : '✖ You declined'}</p>` +
            (r.student_note ? `<p class="sub" style="margin-top:6px;color:var(--text)">💬 <b>Your response note:</b> “${e(r.student_note)}”</p>` : '')) +
        `</div></div>`;
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
    const replyInput = document.getElementById('rec-reply-' + id);
    const replyMsg = replyInput ? replyInput.value.trim() : '';
    try { await API.request('/api/me/recruiting/requests/' + id + '/decide', { method: 'POST', body: JSON.stringify({ accept: act === 'acc', message: replyMsg }) }); }
    catch (e) { recErr = e.message; }
    recStale = true; render();
  }
}

// ----- My account: profile photo + password (student and staff) -----
let acctMsg = { photo: '', pw: '' };

// The photo the person chose themselves (kept for this session) wins over the one in the list
function myPhotoValue(r) {
  let v = null;
  try { v = sessionStorage.getItem('cc_photo'); } catch (e) { }
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
  try { sessionStorage.setItem('cc_photo', url); } catch (e) { }
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
  if (res && res.token) { try { sessionStorage.setItem('cc_token', res.token); } catch (e) { } }   // stay signed in on this device
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

// Timetable .ics calendar export helper
function exportTimetableIcs() {
  const url = '/api/timetable/export.ics?dept=CSE&year=3';
  const a = document.createElement('a');
  a.href = url;
  a.download = 'timetable_semester_3.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof showToast === 'function') {
    showToast('📅 Exported Semester 3 Timetable (.ics calendar stream)!');
  }
}

// SMS Simulator Gateway Action (LEAVE 2 FEVER)
async function sendSimulatedSMSAction() {
  const inp = $('sms-text-inp');
  const resBox = $('sms-sim-result');
  const btn = $('btn-send-sms');
  if (!inp) return;
  const text = (inp.value || '').trim();
  if (!text) {
    if (resBox) {
      resBox.style.display = 'block';
      resBox.style.borderColor = '#ef4444';
      resBox.style.color = '#ef4444';
      resBox.innerHTML = '⚠️ Please enter an SMS command (e.g. <code>LEAVE 2 FEVER</code>).';
    }
    return;
  }
  if (btn) btn.disabled = true;
  if (resBox) {
    resBox.style.display = 'block';
    resBox.style.borderColor = 'var(--border)';
    resBox.style.color = 'var(--text)';
    resBox.innerHTML = '📡 Transmitting SMS payload via Simulated Gateway (+91 99370 00000)...';
  }

  try {
    const studentRoll = userName();
    const data = await API.sendSimulatedSMS(text, studentRoll);
    if (resBox) {
      resBox.style.display = 'block';
      resBox.style.borderColor = data.ok ? '#10b981' : '#ef4444';
      resBox.style.background = data.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
      resBox.style.color = 'var(--text)';
      resBox.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;font-weight:700;color:${data.ok ? '#10b981' : '#ef4444'};margin-bottom:4px">
          ${data.ok ? '✅ SMS Inbound Gateway Processed' : '❌ SMS Gateway Rejected'}
        </div>
        <div style="font-size:12px;margin-bottom:6px"><b>Inbound Text:</b> <code>"${escapeHtml(text)}"</code></div>
        <div style="font-size:12px;margin-bottom:4px"><b>Carrier Response:</b> ${escapeHtml(data.sms_reply || data.detail || 'Success')}</div>
        ${data.leave ? `<div style="font-size:11px;color:var(--muted)">Assigned Approver: <b>${escapeHtml(data.leave.approver_target)}</b> · ID: ${data.leave.id} · Status: <b>Pending</b></div>` : ''}
      `;
    }
    if (data.ok && data.leave) {
      leaveRequests.student.unshift({
        id: data.leave.id,
        t: data.leave.leave_type || 'Casual',
        f: data.leave.from_date,
        to: data.leave.to_date,
        r: data.leave.reason,
        s: 'Pending',
        st: userName(),
        subAt: Date.now(),
        by: 'student',
        appr: 'HOD'
      });
      saveJson('cc_lv2', leaveRequests);
      setTimeout(() => render(), 1200);
    }
  } catch (err) {
    if (resBox) {
      resBox.style.display = 'block';
      resBox.style.borderColor = '#ef4444';
      resBox.style.background = 'rgba(239,68,68,0.08)';
      resBox.innerHTML = `⚠️ Gateway Error: ${escapeHtml(err.message || 'Failed to send SMS')}`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Build stamp shown in the page footer. If you do not see it there, the browser is still using an old script.js.
const BUILD = 'build 09-Oct-e';
document.querySelectorAll('footer').forEach(f => { if (!f.textContent.includes('build')) f.append(' · ' + BUILD); });

/* =============================================================================
   24. GLOBAL CLICK HANDLER
   -----------------------------------------------------------------------------
   One listener handles every button in the app. Each button carries a
   data-… attribute (or an id) that says what it does.
   ============================================================================= */

// Everything clickable that this handler cares about
const CLICKABLE = '[data-go],[data-pay],[data-nf],[data-nyf],[data-nreset],[data-tv],[data-td],[data-hf],[data-ap2],[data-dd],[data-rs],[data-print],[data-tt],[data-kb],[data-mk],[data-allp],[data-msave],[data-off],[data-sync],[data-oapply],[data-act],[data-take],[data-sim],[data-iss],[data-ndel],[data-hdel],#npost,#hadd,#isub,[data-cr],[data-rm],[data-trm],#tadd,[data-av],[data-adv],#sadd,#achsub,[data-metoo],[data-force],[data-mrate],[data-mskip],#cfsub,[data-sheet],[data-close],[data-again],#csub,#lsub,#theme,[data-sl],[data-ndis],[data-nclear],[data-cf],[data-sg],[data-sclr],[data-syr],[data-vp],[data-back],[data-acc],#accadd,[data-ac-role-select],[data-acrole],#acclr,#acreset,[data-me],[data-res],[data-rc],[data-po],[data-rec],[data-hatt],[data-hallp],[data-hsave],[data-wtab],[data-wcf],[data-wrf],[data-wadv],[data-wreply],[data-srev],[data-gp],[data-gp-act],#sosSubmitBtn,[data-sos-cancel],[data-sos-res],[data-ev-reg],[data-ev-pass],[data-ev-f],#evPostSubmit,[data-ev-del],[data-cls-yf],[data-cls-sf],[data-cls-add],[data-cls-log],#clsExtraSubmit,[data-cls-export],[data-ics],[data-sms-send],[data-sms-set],#btn-send-sms,[data-exam-tab],[data-todo-toggle],[data-todo-del],#todoAddBtn,[data-atab],[data-alog-filter],#alogRefresh,#analyticsRefresh,#overviewAuditRefresh,#alogSearchBtn,[data-preset],[data-cmp-metoo],[data-cmp-quick],[data-cmp-post],[data-cmp-filter],[data-cdel]';

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

  // ----- Fees -----
  else if (t.dataset.pay) {                                  // pay a fee (demo)
    appData.fees[t.dataset.pay][2] = 1;
    appData.fees[t.dataset.pay][3] = '30 Sep 2026';
    render();
  }

  // ----- Filters + view switches -----
  else if (t.dataset.nf) { noticeFilter = t.dataset.nf; render(); triggerTabDropDown(); }
  else if (t.dataset.nyf) { noticeYearFilter = t.dataset.nyf; render(); triggerTabDropDown(); }
  else if (t.dataset.nreset) { noticeFilter = 'All'; noticeYearFilter = 'All'; render(); triggerTabDropDown(); }
  else if (t.dataset.hf) { holidayFilter = t.dataset.hf; render(); triggerTabDropDown(); }
  else if (t.dataset.tv) { timetableView = t.dataset.tv; render(); triggerTabDropDown(); }
  else if (t.dataset.td) { timetableDay = t.dataset.td; render(); triggerTabDropDown(); }
  else if (t.dataset.cf) { staffComplaintFilter = t.dataset.cf; render(); triggerTabDropDown(); }
  else if (t.dataset.rs) { selectedSemester = t.dataset.rs; render(); triggerTabDropDown(); }
  else if (t.dataset.examTab) { examActiveTab = t.dataset.examTab; render(); triggerTabDropDown(); }
  else if (t.dataset.todoToggle) { toggleTodoItem(t.dataset.role, t.dataset.todoToggle); render(); }
  else if (t.dataset.todoDel) { deleteTodoItem(t.dataset.role, t.dataset.todoDel); render(); }
  else if (t.id === 'todoAddBtn') {
    const inp = $('todoInput');
    const pr = $('todoPriority');
    if (inp && inp.value.trim()) {
      addTodoItem(t.dataset.role, inp.value.trim(), pr ? pr.value : 'normal');
      render();
    }
  }

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
  else if (t.hasAttribute('data-ics')) exportTimetableIcs();
  else if (t.hasAttribute('data-sms-send') || t.id === 'btn-send-sms') sendSimulatedSMSAction();
  else if (t.dataset.smsSet) {
    const inp = $('sms-text-inp');
    if (inp) {
      inp.value = t.dataset.smsSet;
      inp.focus();
    }
  }

  // ----- Students (staff/admin) -----
  else if (t.dataset.cr) setCR(+t.dataset.cr);
  else if (t.dataset.rm) removeStudent(+t.dataset.rm);
  else if (t.dataset.trm) removeTeacher(+t.dataset.trm);   // admin: remove teacher
  else if (t.id === 'tadd') addTeacher();                    // admin: add teacher
  else if (t.id === 'sadd') addStudent();
  else if (t.id === 'accadd') addAccount();                  // admin: Accounts page
  else if (t.dataset.acc) accountAction(t);
  else if (t.dataset.acRoleSelect) {
    saveNewAccountDraft();
    newAccountRole = t.dataset.acRoleSelect;
    render();
  }

  // ----- Achievements -----
  else if (t.dataset.av) {                                   // teacher / admin verifies or rejects
    const [id, status] = t.dataset.av.split(':');
    const a = ACHIEVEMENTS.find(x => String(x.id) === id);
    if (a) {
      if (typeof API !== 'undefined' && API.verifyAchievement) {
        API.verifyAchievement(id, status).then(() => {
          a.st = status;
          a.vb = { n: userName(), r: getRole() === 'admin' ? 'Admin' : 'Teacher', at: Date.now() };
          saveJson('cc_ach', ACHIEVEMENTS);
          showToast(`Achievement ${status === 'Verified' ? 'verified ✓' : 'rejected'}`);
          render();
        }).catch(err => {
          console.warn('API verifyAchievement note:', err);
          a.st = status;
          a.vb = { n: userName(), r: getRole() === 'admin' ? 'Admin' : 'Teacher', at: Date.now() };
          saveJson('cc_ach', ACHIEVEMENTS);
          showToast(`Achievement updated to ${status}`);
          render();
        });
      } else {
        a.st = status;
        a.vb = { n: userName(), r: getRole() === 'admin' ? 'Admin' : 'Teacher', at: Date.now() };
        saveJson('cc_ach', ACHIEVEMENTS);
        render();
      }
    }
  }
  else if (t.id === 'achsub') submitAchievement();

  // ----- Complaints & Presets -----
  else if (t.dataset.cmpFilter) {
    communityComplaintFilter = t.dataset.cmpFilter;
    refreshComplaintsView();
  }
  else if (t.dataset.cdel) {
    const cid = t.dataset.cdel;
    if (confirm('Are you sure you want to remove this complaint from the system?')) {
      removeComplaintByAdmin(cid);
    }
  }
  else if (t.dataset.adv) advanceComplaint(+t.dataset.adv);
  else if (t.dataset.metoo) meToo(+t.dataset.metoo);
  else if (t.dataset.cmpMetoo) toggleComplaintOpinion(+t.dataset.cmpMetoo);
  else if (t.dataset.cmpQuick) {
    const parts = t.dataset.cmpQuick.split(':');
    toggleComplaintOpinion(+parts[0], parts.slice(1).join(':'));
  }
  else if (t.dataset.cmpPost) submitCustomComplaintOpinion(+t.dataset.cmpPost);
  else if (t.dataset.preset) {
    const parts = t.dataset.preset.split(':');
    applyPreset(parts[0], parts[1], parts[2] || '');
  }
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

  // ----- My account (photo / password), Resources, Recruiter -----
  else if (t.dataset.me) { if (t.dataset.me === 'photorm') saveMyPhoto(''); else if (t.dataset.me === 'pwsave') changeMyPassword(); }
  else if (t.dataset.res) resourceAction(t);
  else if (t.dataset.rc) rcAction(t);
  else if (t.dataset.po) poAction(t);
  else if (t.dataset.rec) recAction(t);

  // ----- Warden: attendance, complaints, reviews & student reviews -----
  else if (t.dataset.hatt) {
    const [roll, mark] = t.dataset.hatt.split(':');
    wardenAttMarks[roll] = mark;
    render();
  }
  else if (t.hasAttribute('data-hallp')) {
    const hName = wardenHostel();
    hostelResidents(hName).forEach(s => { wardenAttMarks[s.roll] = 'P'; });
    render();
  }
  else if (t.hasAttribute('data-hsave')) saveWardenAttendance();
  else if (t.dataset.wtab) { wardenComplaintTab = t.dataset.wtab; render(); triggerTabDropDown(); }
  else if (t.dataset.wcf) { wardenComplaintFilter = t.dataset.wcf; render(); triggerTabDropDown(); }
  else if (t.dataset.wrf) { wardenReviewFilter = t.dataset.wrf; render(); triggerTabDropDown(); }
  else if (t.dataset.wadv) {
    const [id, st] = t.dataset.wadv.split(':');
    advanceWardenComplaint(id, st);
  }
  else if (t.dataset.wreply) replyWardenReview(t.dataset.wreply);
  else if (t.hasAttribute('data-srev')) submitStudentReview();

  // ----- Administrator Analytics & Audit Trail -----
  else if (t.dataset.atab) {
    adminHomeTab = t.dataset.atab;
    if (adminHomeTab === 'audit' && !adminAuditLogs) loadAdminAuditLogs();
    render();
    triggerTabDropDown();
  }
  else if (t.dataset.alogFilter) {
    adminAuditFilter = t.dataset.alogFilter;
    loadAdminAuditLogs(true);
  }
  else if (t.id === 'alogRefresh') {
    loadAdminAuditLogs(true);
  }
  else if (t.id === 'analyticsRefresh' || t.id === 'overviewAuditRefresh') {
    loadAdminAnalytics(true);
  }
  else if (t.id === 'alogSearchBtn') {
    const q = $('alogSearchInput');
    adminAuditSearch = q ? q.value : '';
    loadAdminAuditLogs(true);
  }

  // ----- Digital Gate Pass & QR Outpass -----
  else if (t.dataset.gp) openSheet('gp:' + t.dataset.gp);
  else if (t.dataset.gpAct) {
    const [id, act] = t.dataset.gpAct.split(':');
    recordGateCheck(id, act);
  }

  // ----- Emergency SOS & Safety Dispatch -----
  else if (t.id === 'sosSubmitBtn') submitSosAlert();
  else if (t.dataset.sosCancel) cancelSosAlert(t.dataset.sosCancel);
  else if (t.dataset.sosRes) resolveSosAlert(t.dataset.sosRes);

  // ----- Campus Events & Fests -----
  else if (t.dataset.evReg) toggleEventRegistration(t.dataset.evReg);
  else if (t.dataset.evPass) openSheet('evpass:' + t.dataset.evPass);
  else if (t.dataset.evF) setEventFilter(t.dataset.evF);
  else if (t.id === 'evPostSubmit') submitNewEvent();
  else if (t.dataset.evDel) deleteEvent(t.dataset.evDel);

  // ----- HOD Classes Conduction Tracker -----
  else if (t.dataset.clsYf !== undefined) {
    hodClassYearFilter = t.dataset.clsYf;
    render();
  }
  else if (t.dataset.clsSf !== undefined) {
    hodClassSecFilter = t.dataset.clsSf;
    render();
  }
  else if (t.dataset.clsLog) {
    openSheet('cls_log:' + t.dataset.clsLog);
  }
  else if (t.dataset.clsAdd) {
    openSheet('cls_add:' + t.dataset.clsAdd);
  }
  else if (t.id === 'clsExtraSubmit') {
    submitExtraClassConduction();
  }
  else if (t.hasAttribute('data-cls-export')) {
    window.print();
  }
});

document.addEventListener('change', e => {
  if (e.target && e.target.id === 'ntdur') {
    const wrap = $('ntcustom_wrap');
    if (wrap) wrap.style.display = e.target.value === 'custom' ? 'block' : 'none';
  } else if (e.target && e.target.id === 'endur') {
    const wrap = $('encustom_wrap');
    if (wrap) wrap.style.display = e.target.value === 'custom' ? 'block' : 'none';
  } else if (e.target && e.target.id === 'watsess') { wardenAttSession = e.target.value; }
  else if (e.target && e.target.id === 'watdate') { wardenAttDate = e.target.value; }
});

document.addEventListener('input', e => {
  if (e.target && e.target.id === 'evSearchInput') {
    eventsSearchQuery = e.target.value.trim().toLowerCase();
    const grid = $('eventsGrid');
    if (grid) grid.innerHTML = renderEventCards();
  }
  else if (e.target && e.target.id === 'clsSearchInput') {
    hodClassSearchQuery = e.target.value.trim().toLowerCase();
    const grid = $('deptClassesGrid');
    if (grid) grid.innerHTML = renderDeptClassCards();
  }
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
// Same visibility rule as the Notices page: students never see Staff-only notices, expired notices, and only their own year or All
const visibleNotices = () => {
  const s = myStudent();
  const sYear = s && s.year ? String(s.year) : null;
  return appData.notices.filter(n => {
    if (!isStaffOrAdmin() && !postedByMe(n) && isNoticeExpired(n)) return false;
    if (!isStaffOrAdmin() && (n[4] || 'Everyone') === 'Staff') return false;
    if (sYear && n[7] && n[7] !== 'All' && String(n[7]) !== sYear) return false;
    return true;
  });
};

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
    if (canReviewStudentLeave()) {
      studentApprovals.filter(r => r && r.id && r.s === 'Pending')
        .forEach(r => out.push(waiting(r, 'sr:', 'Student leave to review (HOD)')));
    }
    leaveRequests.staff.filter(r => r.id && isMyLeave(r) && r.s !== 'Pending').forEach(r => out.push(decided(r)));
  } else {
    leaveRequests.student.filter(r => r.id && r.s !== 'Pending').forEach(r => out.push(decided(r)));
    if (recState && Array.isArray(recState.requests)) {
      recState.requests.filter(r => r.status === 'awaiting_student').forEach(r => {
        out.push({
          id: 'rec:' + r.id,
          icon: '💬',
          title: 'Recruiter Message: ' + r.company,
          text: (r.message ? `“${r.message}” · ` : '') + 'Sent you a contact request & message',
          go: 'profile',
          isNew: true
        });
      });
    }
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

// The Notifications card shown on every dashboard (simple, minimal & clean)
function renderNotifications() {
  const items = buildNotifications();
  return `<div class="nbox" id="nfbox">` +
    `<div class="nhead">` +
    `<h3><span aria-hidden="true">🔔</span> Notifications` +
    (items.length ? `<span class="ncount">${items.length}</span>` : '') + `</h3>` +
    (items.length ? `<button class="nclear-btn" data-nclear type="button">Clear all</button>` : '') +
    `</div>` +
    (items.length
      ? `<div class="nlist">` + items.map(x =>
        `<div class="ncard ${x.isNew ? 'new' : ''}" data-nid="${escapeHtml(x.id)}">` +
        `<span class="ni" aria-hidden="true">${x.icon}</span>` +
        `<div class="nb"><b>${escapeHtml(x.title)}</b><p>${escapeHtml(x.text)}</p></div>` +
        `<button class="nl" data-go="${x.go}" type="button">View →</button>` +
        `<button class="nx" data-ndis="1" type="button" aria-label="Dismiss">✕</button>` +
        `</div>`).join('') + `</div>`
      : `<div class="nempty-minimal"><span class="nempty-check">✓</span> All caught up · No unread notifications</div>`) +
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
    try { nDrag.card.setPointerCapture(e.pointerId); } catch (err) { }
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
try { if (sessionStorage.getItem('cc_in') === '1') showSite(); } catch (e) { }

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
    } catch (e) { }
    try { await API.hydrate(); sessionStorage.setItem('cc_hyd', '1'); } catch (e) { }   // load shared data
    $('formPane').classList.add('hidden');
    $('donePane').classList.remove('hidden');
    setLoading(false);
    const greetMs = greetGuard(data.name);
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
    sessionStorage.clear();
  } catch (e) { }
  showLogin();
};
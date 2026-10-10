/* College Connect - backend bridge.
   Keeps your existing code working: every time script.js saves one of the shared
   data sets to localStorage, it is also sent to the server (and loaded from the
   server after sign-in). Loaded BEFORE script.js. */
(function () {
  'use strict';

  // Same keys as the server's RULES table in main.py (blob collections removed)
  const SYNC_KEYS = ['cc_stud', 'cc_staff', 'cc_nt', 'cc_hol',
                     'cc_admin_prof', 'cc_hostel_att', 'cc_reviews',
                     'cc_events', 'cc_sos', 'cc_dept_classes'];

  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  const timers = {};

  const getToken = () => { try { return sessionStorage.getItem('cc_token'); } catch (e) { return null; } };

  function expire() {            // token rejected: go back to the login page
    try { sessionStorage.clear(); } catch (e) {}
    location.reload();
  }

  async function request(path, options = {}) {
    const headers = Object.assign({}, options.headers);
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try { res = await fetch(path, Object.assign({}, options, { headers })); }
    catch (e) { throw new Error('Cannot reach the server. Check your connection.'); }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const detail = data && typeof data.detail === 'string' ? data.detail : 'Request failed';
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Send one data set to the server
  function push(key, keepalive) {
    let value = null;
    try { value = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    if (value === null) return Promise.resolve();
    return request('/api/collections/' + key, {
      method: 'PUT', body: JSON.stringify({ data: value }), keepalive: !!keepalive
    }).then(res => {
      try {
        if (typeof window.onCollectionSynced === 'function') {
          window.onCollectionSynced(key);
        }
      } catch (e) {}
      return res;
    }).catch(err => { if (err.status === 401) expire(); });   // 403 = not allowed for this role: ignore
  }

  function schedule(key) {       // wait 0.6s so rapid edits become one request
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => { delete timers[key]; push(key); }, 600);
  }

  // Intercept localStorage.setItem so no change to script.js is needed for saving
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === localStorage && SYNC_KEYS.includes(k) && getToken()) schedule(k);
  };

  // Don't lose edits when the tab is closed
  const flush = () => Object.keys(timers).forEach(k => { clearTimeout(timers[k]); delete timers[k]; push(k, true); });
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // Copy server data into localStorage. Returns true if anything changed.
  async function hydrate() {
    const remote = await request('/api/collections');
    let changed = false;
    SYNC_KEYS.forEach(k => {
      if (k in remote) {
        const text = JSON.stringify(remote[k]);
        if (localStorage.getItem(k) !== text) { rawSet.call(localStorage, k, text); changed = true; }
      } else if (localStorage.getItem(k) !== null) {
        schedule(k);             // server has nothing yet: upload what this browser has (one-time seeding)
      }
    });
    return changed;
  }

  window.API = {
    request,
    hydrate,
    async login(user, password, role) {
      const data = await request('/api/login', { method: 'POST', body: JSON.stringify({ user, password, role }) });
      try { sessionStorage.setItem('cc_token', data.token); } catch (e) {}
      return data;
    },
    // Download a protected file: fetch it with the sign-in token, then save it from memory
    async download(path, fallbackName) {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      let res;
      try { res = await fetch(path, { headers }); }
      catch (e) { throw new Error('Cannot reach the server. Check your connection.'); }
      if (!res.ok) {
        let detail = 'Download failed';
        try { const d = await res.json(); if (d && typeof d.detail === 'string') detail = d.detail; } catch (e) {}
        const err = new Error(detail); err.status = res.status; throw err;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fallbackName || 'download';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    async logout() {
      await Promise.all(Object.keys(timers).map(k => { clearTimeout(timers[k]); delete timers[k]; return push(k); }));
      try { sessionStorage.removeItem('cc_token'); sessionStorage.removeItem('cc_name'); sessionStorage.removeItem('cc_photo'); } catch (e) {}
      SYNC_KEYS.forEach(k => rawRemove.call(localStorage, k));   // don't leave data on shared computers
    },
    // Unified Request Engine helpers (Leave, Complaint, Recruiter Contact, Achievement, Approval, Escalation)
    async createRequest(data) {
      return request('/api/requests', { method: 'POST', body: JSON.stringify(data) });
    },
    async getRequests(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request('/api/requests' + (q ? '?' + q : ''));
    },
    async actOnRequest(id, action) {
      return request('/api/requests/' + encodeURIComponent(id) + '/action', { method: 'POST', body: JSON.stringify(action) });
    },

    // --- Per-Record REST Endpoints (Identity from Token, Ownership Checked) ---
    // 1. Leaves
    async getLeaves() { return request('/api/leaves'); },
    async createLeave(data) { return request('/api/leaves', { method: 'POST', body: JSON.stringify(data) }); },
    async getLeave(id) { return request('/api/leaves/' + encodeURIComponent(id)); },
    async updateLeave(id, data) { return request('/api/leaves/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteLeave(id) { return request('/api/leaves/' + encodeURIComponent(id), { method: 'DELETE' }); },
    async actOnLeave(id, action) { return request('/api/leaves/' + encodeURIComponent(id) + '/action', { method: 'POST', body: JSON.stringify(action) }); },

    // 2. Achievements
    async getAchievements(mineOnly) { return request('/api/achievements' + (mineOnly ? '?mine_only=true' : '')); },
    async createAchievement(data) { return request('/api/achievements', { method: 'POST', body: JSON.stringify(data) }); },
    async getAchievement(id) { return request('/api/achievements/' + encodeURIComponent(id)); },
    async updateAchievement(id, data) { return request('/api/achievements/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteAchievement(id) { return request('/api/achievements/' + encodeURIComponent(id), { method: 'DELETE' }); },
    async verifyAchievement(id, status = 'Verified') { return request('/api/achievements/' + encodeURIComponent(id) + '/verify', { method: 'POST', body: JSON.stringify({ status }) }); },

    // 3. Complaints
    async getComplaints() { return request('/api/complaints'); },
    async createComplaint(data) { return request('/api/complaints', { method: 'POST', body: JSON.stringify(data) }); },
    async getComplaint(id) { return request('/api/complaints/' + encodeURIComponent(id)); },
    async updateComplaint(id, data) { return request('/api/complaints/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteComplaint(id) { return request('/api/complaints/' + encodeURIComponent(id), { method: 'DELETE' }); },
    async changeComplaintStatus(id, status, action_note = '') { return request('/api/complaints/' + encodeURIComponent(id) + '/status', { method: 'POST', body: JSON.stringify({ status, action_note }) }); },

    // 4. Issues
    async getIssues() { return request('/api/issues'); },
    async createIssue(data) { return request('/api/issues', { method: 'POST', body: JSON.stringify(data) }); },
    async getIssue(id) { return request('/api/issues/' + encodeURIComponent(id)); },
    async updateIssue(id, data) { return request('/api/issues/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteIssue(id) { return request('/api/issues/' + encodeURIComponent(id), { method: 'DELETE' }); },

    // 5. Attendance with Idempotent UUID & IndexedDB Queue
    async getAttendance(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request('/api/attendance' + (q ? '?' + q : ''));
    },
    async queueAttendance(batch) { return queueAttendanceBatch(batch); },
    async getAttendanceQueue() { return getQueuedAttendanceBatches(); },
    async flushAttendanceQueue() { return flushAttendanceQueue(); },
    async syncAttendance(batch) {
      if (!batch.client_uuid) {
        batch.client_uuid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('att-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      }
      await queueAttendanceBatch(batch);
      if (navigator.onLine) {
        try {
          const res = await request('/api/attendance/sync', { method: 'POST', body: JSON.stringify(batch) });
          await removeQueuedAttendanceBatch(batch.client_uuid);
          return Object.assign({ offline: false }, res);
        } catch (e) {
          return { ok: true, offline: true, client_uuid: batch.client_uuid, message: 'Offline / Airplane mode: Attendance safely queued in IndexedDB.' };
        }
      }
      return { ok: true, offline: true, client_uuid: batch.client_uuid, message: 'Airplane mode active: Queued in IndexedDB. Will sync when back online.' };
    },

    // 6. SMS Simulator (LEAVE 2 FEVER)
    async sendSimulatedSMS(message, roll = '') {
      return request('/api/sms/inbound', { method: 'POST', body: JSON.stringify({ message, roll }) });
    },

    // 7. Administrator Analytics & Institutional Audit Trail
    async getAdminAnalytics() {
      return request('/api/admin/analytics');
    },
    async getAuditLogs(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request('/api/admin/audit-logs' + (q ? '?' + q : ''));
    },

    // 8. Timetable Adjustments
    async getTimetableAdjustments(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request('/api/timetable/adjustments' + (q ? '?' + q : ''));
    },
    async createTimetableAdjustment(data) {
      return request('/api/timetable/adjustments', { method: 'POST', body: JSON.stringify(data) });
    },

    // 9. Attendance Oversight & Alerts
    async getAttendanceAlerts(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request('/api/attendance/alerts' + (q ? '?' + q : ''));
    },
    async getAttendanceSummary(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request('/api/attendance/summary' + (q ? '?' + q : ''));
    },

    // 10. Certificates (SHA-256)
    async getCertificates() {
      return request('/api/certificates');
    },
    async issueCertificate(data) {
      return request('/api/certificates', { method: 'POST', body: JSON.stringify(data) });
    },
    async revokeCertificate(id, reason) {
      return request('/api/certificates/' + encodeURIComponent(id) + '/revoke', { method: 'POST', body: JSON.stringify({ reason }) });
    },
    async verifyCertificate(ref) {
      return request('/api/certificates/verify/' + encodeURIComponent(ref));
    },

    // 11. Searchable Institutional Audit (/api/audit)
    async getAudit(params = {}) {
      const q = new URLSearchParams(params).toString();
      return request('/api/audit' + (q ? '?' + q : ''));
    },

    // 12. On-Demand SLA Execution
    async runSlaCheck(forceAll = false) {
      return request('/api/admin/sla/run' + (forceAll ? '?force_all=true' : ''), { method: 'POST' });
    },

    // 13. College-Wide Insights & Telemetry
    async getRecurringComplaints() {
      return request('/api/complaint-insights/recurring');
    },
    async getMessSummary() {
      return request('/api/mess/summary');
    },
    async getOpportunities() {
      return request('/api/opportunities');
    }
  };

  // --- IndexedDB Queue Support for Offline / Airplane Mode Attendance ---
  function openOfflineDB() {
    return new Promise(resolve => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const req = indexedDB.open('CampBitOfflineDB', 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('attendance_queue')) {
            db.createObjectStore('attendance_queue', { keyPath: 'client_uuid' });
          }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function queueAttendanceBatch(batch) {
    const db = await openOfflineDB();
    if (!db) {
      const q = JSON.parse(localStorage.getItem('cc_att_queue') || '[]');
      q.push(batch);
      localStorage.setItem('cc_att_queue', JSON.stringify(q));
      return true;
    }
    return new Promise(resolve => {
      try {
        const tx = db.transaction('attendance_queue', 'readwrite');
        tx.objectStore('attendance_queue').put(batch);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  async function getQueuedAttendanceBatches() {
    const db = await openOfflineDB();
    if (!db) {
      return JSON.parse(localStorage.getItem('cc_att_queue') || '[]');
    }
    return new Promise(resolve => {
      try {
        const tx = db.transaction('attendance_queue', 'readonly');
        const req = tx.objectStore('attendance_queue').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  async function removeQueuedAttendanceBatch(client_uuid) {
    const db = await openOfflineDB();
    if (!db) {
      let q = JSON.parse(localStorage.getItem('cc_att_queue') || '[]');
      q = q.filter(b => b.client_uuid !== client_uuid);
      localStorage.setItem('cc_att_queue', JSON.stringify(q));
      return true;
    }
    return new Promise(resolve => {
      try {
        const tx = db.transaction('attendance_queue', 'readwrite');
        tx.objectStore('attendance_queue').delete(client_uuid);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  async function flushAttendanceQueue() {
    const batches = await getQueuedAttendanceBatches();
    if (!batches.length) return { synced: 0, pending: 0 };
    let synced = 0;
    for (const batch of batches) {
      try {
        const res = await request('/api/attendance/sync', {
          method: 'POST',
          body: JSON.stringify(batch)
        });
        if (res && res.ok) {
          await removeQueuedAttendanceBatch(batch.client_uuid);
          synced++;
        }
      } catch (e) {
        break; // Still offline
      }
    }
    const remaining = await getQueuedAttendanceBatches();
    return { synced, pending: remaining.length };
  }

  window.addEventListener('online', () => {
    flushAttendanceQueue().then(r => {
      if (r.synced > 0 && typeof showToast === 'function') {
        showToast(`✈️ Back Online: Synced ${r.synced} offline attendance batch(es) from IndexedDB!`);
      }
    });
  });

  // Already signed in from before this update: fetch the account name once
  if (getToken() && !sessionStorage.getItem('cc_name')) {
    request('/api/me').then(me => {
      if (me && me.name) { sessionStorage.setItem('cc_name', me.name); location.reload(); }
    }).catch(() => {});
  }

  // On every page load while signed in, refresh from the server once
  if (getToken()) {
    if (sessionStorage.getItem('cc_hyd') === '1') sessionStorage.removeItem('cc_hyd');
    else hydrate().then(changed => {
      if (changed) { sessionStorage.setItem('cc_hyd', '1'); location.reload(); }
    }).catch(err => { if (err.status === 401) expire(); });
  }
})();
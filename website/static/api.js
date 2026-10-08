/* College Connect - backend bridge.
   Keeps your existing code working: every time script.js saves one of the shared
   data sets to localStorage, it is also sent to the server (and loaded from the
   server after sign-in). Loaded BEFORE script.js. */
(function () {
  'use strict';

  // Same keys as the server's RULES table in main.py
  const SYNC_KEYS = ['cc_stud', 'cc_staff', 'cc_ach', 'cc_nt', 'cc_hol',
                     'cc_iss', 'cc_cmp', 'cc_lv2', 'cc_admin_prof'];

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
    }
  };

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
// app.js — application shell: auth, router, navigation
'use strict';
window.SMS = window.SMS || {};

(function () {
  const { esc, icon, toast, openModal } = SMS.ui;
  const api = SMS.api;

  const NAV = [
    { group: 'Main' },
    { route: 'dashboard', icon: 'grid', label: 'Dashboard', roles: ['admin', 'teacher', 'manager', 'staff'] },
    { group: 'Academics' },
    { route: 'admission', icon: 'userPlus', label: 'Admission', roles: ['admin', 'manager', 'staff'] },
    { route: 'students', icon: 'users', label: 'Students', roles: ['admin', 'teacher', 'manager', 'staff'] },
    { route: 'attendance', icon: 'calendar', label: 'Attendance', roles: ['admin', 'teacher', 'manager', 'staff'] },
    { route: 'exams', icon: 'book', label: 'Exams & Results', roles: ['admin', 'teacher', 'manager', 'staff'] },
    { route: 'report-cards', icon: 'award', label: 'Report Cards', roles: ['admin', 'teacher', 'manager', 'staff'] },
    { group: 'Administration' },
    { route: 'fees', icon: 'wallet', label: 'Fees', roles: ['admin', 'manager', 'staff'] },
    { route: 'employees', icon: 'briefcase', label: 'Employees', roles: ['admin', 'manager', 'staff'] },
    { route: 'staff-entry', icon: 'userPlus', label: 'Staff Entry', roles: ['admin', 'manager', 'staff'] },
    { route: 'transport', icon: 'bus', label: 'Transport', roles: ['admin', 'manager', 'staff'] },
    { route: 'notifications', icon: 'bell', label: 'Notifications', roles: ['admin', 'teacher', 'manager', 'staff', 'parent'] },
    { group: 'System' },
    { route: 'users', icon: 'key', label: 'Users', roles: ['admin'] },
    { route: 'settings', icon: 'gear', label: 'Settings', roles: ['admin'] },
    { route: 'parent', icon: 'home', label: 'Parent Portal', roles: ['parent'] },
  ];

  const PAGES = {
    dashboard: { title: 'Dashboard', roles: ['admin', 'teacher', 'manager', 'staff'], fn: (c) => SMS.pages.dashboard(c) },
    admission: { title: 'Admission', roles: ['admin', 'manager', 'staff'], fn: (c) => SMS.pages.admission(c) },
    students: { title: 'Students', roles: ['admin', 'teacher', 'manager', 'staff'], fn: (c) => SMS.pages.students(c) },
    attendance: { title: 'Attendance', roles: ['admin', 'teacher', 'manager', 'staff'], fn: (c) => SMS.pages.attendance(c) },
    fees: { title: 'Fee Management', roles: ['admin', 'manager', 'staff'], fn: (c) => SMS.pages.fees(c) },
    exams: { title: 'Exams & Results', roles: ['admin', 'teacher', 'manager', 'staff'], fn: (c) => SMS.pages.exams(c) },
    'exams/:id/marks': { title: 'Marks Entry', roles: ['admin', 'teacher', 'manager'], fn: (c, p) => SMS.pages.examMarks(c, p.id) },
    'exams/:id/results': { title: 'Results', roles: ['admin', 'teacher', 'manager', 'staff'], fn: (c, p) => SMS.pages.examResults(c, p.id) },
    'report-cards': { title: 'Report Cards', roles: ['admin', 'teacher', 'manager', 'staff'], fn: (c) => SMS.pages.reportCards(c) },
    employees: { title: 'Employee Management', roles: ['admin', 'manager', 'staff'], fn: (c) => SMS.pages.employees(c) },
    'staff-entry': { title: 'Staff / Teacher / Driver Entry', roles: ['admin', 'manager', 'staff'], fn: (c) => SMS.pages.staffEntry(c) },
    notifications: { title: 'Notifications', roles: ['admin', 'teacher', 'manager', 'staff', 'parent'], fn: (c) => SMS.pages.notifications(c) },
    transport: { title: 'Transport', roles: ['admin', 'manager', 'staff'], fn: (c) => SMS.pages.transport(c) },
    users: { title: 'User Management', roles: ['admin'], fn: (c) => SMS.pages.users(c) },
    settings: { title: 'Settings', roles: ['admin'], fn: (c) => SMS.pages.settings(c) },
    parent: { title: 'Parent Portal', roles: ['parent'], fn: (c) => SMS.pages.parent(c) },
  };

  function routeFor(hash) {
    const segs = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!segs.length) return { page: 'dashboard', params: {} };
    if (segs[0] === 'exams' && segs.length === 3) {
      if (segs[2] === 'marks') return { page: 'exams/:id/marks', params: { id: segs[1] } };
      if (segs[2] === 'results') return { page: 'exams/:id/results', params: { id: segs[1] } };
    }
    return { page: segs[0], params: {} };
  }

  // ---------------------------------------------------------------------------
  // favicon helper — sets the browser tab icon to the school logo
  // ---------------------------------------------------------------------------
  function setFavicon(url) {
    // Remove any existing favicon links
    document.querySelectorAll('link[rel~="icon"]').forEach(el => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = url;
    document.head.appendChild(link);
  }

  const app = {
    init() {
      // login form
      document.getElementById('login-form').addEventListener('submit', login);
      document.getElementById('pw-form').addEventListener('submit', changePasswordGate);
      // password visibility toggles
      document.getElementById('eye-login').addEventListener('click', () => togglePw('login-password', 'eye-login'));
      document.getElementById('eye-pw-old').addEventListener('click', () => togglePw('pw-old', 'eye-pw-old'));
      document.getElementById('eye-pw-new').addEventListener('click', () => togglePw('pw-new', 'eye-pw-new'));
      document.getElementById('eye-pw-confirm').addEventListener('click', () => togglePw('pw-confirm', 'eye-pw-confirm'));
      document.getElementById('forgot-link').addEventListener('click', () => openModal({
        title: 'Forgot Password?',
        body: `<p style="color:var(--muted);font-size:.9rem;margin:0">Please contact your school administrator. They can reset your password from the <b>User Management</b> page.</p>`,
        footer: `<button class="btn btn-primary" data-close>Got it</button>`,
      }));
      // input icons
      document.getElementById('ico-user').innerHTML = icon('user', 18);
      document.getElementById('ico-lock').innerHTML = icon('lock', 18);
      const yearEl = document.getElementById('login-year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();
      ['eye-login', 'eye-pw-old', 'eye-pw-new', 'eye-pw-confirm'].forEach(id => {
        const b = document.getElementById(id);
        b.innerHTML = icon('eye', 18);
        b.dataset.state = 'off';
      });
      document.getElementById('hamburger').addEventListener('click', () => toggleSidebar(true));
      document.getElementById('notif-bell').addEventListener('click', toggleBell);
      document.getElementById('user-chip').addEventListener('click', (e) => {
        const menu = document.getElementById('user-menu');
        menu.classList.toggle('hidden');
        e.stopPropagation();
      });
      document.getElementById('user-menu').addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (action === 'logout') await logout();
        if (action === 'change-password') { showChangePassword(); }
        document.getElementById('user-menu').classList.add('hidden');
      });
      document.addEventListener('click', () => document.getElementById('user-menu').classList.add('hidden'));
      window.addEventListener('hashchange', route);

      // theme the login page
      fetch('/api/public-info').then(r => r.json()).then(d => {
        if (d.school && d.school.name) {
          document.title = d.school.name + ' — School Management';
          document.getElementById('login-school-name').textContent = d.school.name;
          document.getElementById('login-system-name').textContent = 'School Management System';
          if (d.school.logo) {
            setFavicon(d.school.logo);
            const logoImg = document.getElementById('login-logo-img');
            if (logoImg) {
              logoImg.src = d.school.logo;
              logoImg.classList.remove('hidden');
              const emoji = document.querySelector('.login-logo-emoji');
              if (emoji) emoji.classList.add('hidden');
            }
          }
        }
        if (d.appearance && d.appearance.themeColor) document.documentElement.style.setProperty('--primary', d.appearance.themeColor);
      }).catch(() => { });

      // already logged in?
      if (api.state.token) {
        // /api/auth/me returns user + settings in one round trip (fewer
        // serverless cold starts = faster page load).
        api.get('/api/auth/me').then(d => {
          api.state.user = d.user;
          api.state.settings = d.settings;
        }).then(() => enterApp()).catch(() => { api.clearToken(); showLogin(); });
      } else {
        showLogin();
      }
    },

    handleAuthFailure(msg) {
      api.clearToken();
      toast(msg || 'Please log in again', 'warning');
      showLogin();
    },

    goto(hash) {
      if (location.hash === hash) route();
      else location.hash = hash;
    },

    applyAppearance() {
      const a = (api.state.settings && api.state.settings.appearance) || {};
      if (a.themeColor) document.documentElement.style.setProperty('--primary', a.themeColor);
      document.getElementById('sidebar').classList.toggle('light', a.sidebarStyle === 'light');
      document.documentElement.style.fontSize = { small: '13px', medium: '14.5px', large: '16px' }[a.fontSize] || '14.5px';
    },

    renderShell() {
      const u = api.state.user;
      const s = api.state.settings.school;
      // Sidebar: logo only (no school name text)
      document.title = s.name + ' — School Management';
      if (s.logo) setFavicon(s.logo);
      const brandLogo = document.getElementById('brand-logo');
      if (s.logo) brandLogo.innerHTML = `<img src="${s.logo}" alt="School logo" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
      else brandLogo.textContent = '🏫';
      // Topbar: show the uploaded school logo next to the page title
      const topbarLogo = document.getElementById('topbar-logo');
      if (topbarLogo) {
        if (s.logo) { topbarLogo.src = s.logo; topbarLogo.classList.remove('hidden'); }
        else topbarLogo.classList.add('hidden');
      }
      // sidebar nav
      const nav = document.getElementById('nav');
      const visible = NAV.filter(n => !n.roles || n.roles.includes(u.role));
      const current = routeFor(location.hash).page;
      const html = [];
      visible.forEach((n, i) => {
        if (n.group) {
          // only show the group header if at least one route follows it before the next group
          const hasNext = visible.slice(i + 1).some(x => x.route);
          if (hasNext) html.push(`<div class="nav-group">${n.group}</div>`);
          return;
        }
        html.push(`<button class="nav-item ${current === n.route ? 'active' : ''}" data-route="${n.route}">
          ${icon(n.icon)}<span class="nav-label">${n.label}</span></button>`);
      });
      nav.innerHTML = html.join('');
      nav.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
        app.goto('#/' + b.dataset.route);
        toggleSidebar(false);
      }));
      // user chip
      const name = u.linked ? u.linked.split(' — ')[0] : u.username;
      document.getElementById('user-avatar').textContent = (name || '?')[0].toUpperCase();
      document.getElementById('user-name').textContent = name;
      document.getElementById('user-role').textContent = SMS.ui.ROLE_LABEL[u.role] || u.role;
      document.getElementById('sidebar-user').innerHTML = `
        <div class="su-name">${esc(name)}</div><div style="font-size:.74rem">${esc(SMS.ui.ROLE_LABEL[u.role] || u.role)} · ${esc(u.username)}</div>`;
      // mobile nav
      const mn = document.getElementById('mobile-nav');
      const items = u.role === 'parent'
        ? [['parent', 'home', 'Portal'], ['notifications', 'bell', 'Alerts']]
        : [['dashboard', 'grid', 'Home'], ['students', 'users', 'Students'], ['attendance', 'calendar', 'Attendance'], ['fees', 'wallet', 'Fees'], ['notifications', 'bell', 'Alerts']];
      mn.innerHTML = items.map(([r, ic, l]) => `<button class="mn-item ${current === r ? 'active' : ''}" data-mroute="${r}">${icon(ic, 20)}<span>${l}</span></button>`).join('');
      mn.querySelectorAll('.mn-item').forEach(b => b.addEventListener('click', () => app.goto('#/' + b.dataset.mroute)));
      app.refreshNotifBadge();
    },

    async refreshNotifBadge() {
      if (!api.state.user) return;
      try {
        const d = await api.get('/api/notifications/unread-count');
        const badge = document.getElementById('notif-badge');
        badge.textContent = d.unreadCount;
        badge.classList.toggle('hidden', d.unreadCount === 0);
        document.getElementById('bell-icon').innerHTML = icon('bell', 21);
      } catch (e) { /* ignore */ }
    },
  };

  // ---------------- auth flow ----------------
  async function login(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const errBox = document.getElementById('login-error');
    errBox.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const d = await api.post('/api/auth/login', {
        username: document.getElementById('login-username').value.trim(),
        password: document.getElementById('login-password').value
      });
      api.setToken(d.token);
      api.state.user = d.user;
      api.state.settings = d.settings;
      if (d.user.force_password_change) { showPasswordGate(); }
      else enterApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.innerHTML = 'Sign In <span class="btn-arrow">→</span>';
    }
  }

  function togglePw(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = icon(show ? 'eyeOff' : 'eye', 18);
    input.focus();
  }

  function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('pw-screen').classList.add('hidden');
    document.getElementById('mobile-nav').classList.add('hidden');
    const pw = document.getElementById('login-password');
    pw.value = ''; pw.type = 'password';
    const btn = document.getElementById('login-btn');
    btn.disabled = false; btn.innerHTML = 'Sign In <span class="btn-arrow">→</span>';
    const eye = document.getElementById('eye-login');
    if (eye) eye.innerHTML = icon('eye', 18);
  }

  function showPasswordGate() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('pw-screen').classList.remove('hidden');
  }

  async function changePasswordGate(e) {
    e.preventDefault();
    const errBox = document.getElementById('pw-error');
    errBox.classList.add('hidden');
    const oldP = document.getElementById('pw-old').value;
    const newP = document.getElementById('pw-new').value;
    const confirmP = document.getElementById('pw-confirm').value;
    if (newP.length < 6) { errBox.textContent = 'New password must be at least 6 characters'; errBox.classList.remove('hidden'); return; }
    if (newP !== confirmP) { errBox.textContent = 'Passwords do not match'; errBox.classList.remove('hidden'); return; }
    try {
      await api.post('/api/auth/change-password', { old_password: oldP, new_password: newP });
      api.state.user.force_password_change = false;
      toast('Password updated successfully', 'success');
      enterApp();
    } catch (err) {
      errBox.textContent = err.message; errBox.classList.remove('hidden');
    }
  }

  function showChangePassword() {
    openModal({
      title: 'Change Password',
      body: `
        <div class="form-field"><label>Current Password</label><input type="password" id="cp-old"></div>
        <div class="form-field" style="margin-top:12px"><label>New Password</label><input type="password" id="cp-new" minlength="6"></div>
        <div class="form-field" style="margin-top:12px"><label>Confirm New Password</label><input type="password" id="cp-confirm" minlength="6"></div>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="cp-save">Update Password</button>`,
    });
    const root = document.querySelector('#modal-root .modal:last-child');
    root.querySelector('[data-close]').addEventListener('click', () => SMS.ui.closeTopModal());
    root.querySelector('#cp-save').addEventListener('click', async () => {
      const oldP = root.querySelector('#cp-old').value, newP = root.querySelector('#cp-new').value, conf = root.querySelector('#cp-confirm').value;
      if (newP.length < 6) { toast('Min 6 characters', 'error'); return; }
      if (newP !== conf) { toast('Passwords do not match', 'error'); return; }
      try {
        await api.post('/api/auth/change-password', { old_password: oldP, new_password: newP });
        toast('Password changed', 'success');
        SMS.ui.closeTopModal();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  async function logout() {
    try { await api.post('/api/auth/logout'); } catch (e) { /* ignore */ }
    api.clearToken();
    api.state.user = null;
    showLogin();
    toast('Signed out', 'info');
  }

  function enterApp() {
    app.applyAppearance();
    app.renderShell();
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('pw-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('mobile-nav').classList.remove('hidden');
    const dest = api.state.user.role === 'parent' ? '#/parent' : (location.hash || '#/dashboard');
    if (location.hash !== dest && dest !== '#/dashboard') location.hash = dest;
    route();
    setInterval(() => app.refreshNotifBadge(), 60000);
  }

  // ---------------- routing ----------------
  async function route() {
    const view = document.getElementById('view');
    const { page, params } = routeFor(location.hash);
    const def = PAGES[page];
    const u = api.state.user;
    if (!u) return;
    if (!def || (def.roles && !def.roles.includes(u.role))) {
      toast('You do not have access to that page', 'error');
      app.goto(u.role === 'parent' ? '#/parent' : '#/dashboard');
      return;
    }
    document.getElementById('page-title').textContent = def.title;
    // highlight nav
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.route === page));
    document.querySelectorAll('.mn-item').forEach(b => b.classList.toggle('active', b.dataset.mroute === page));
    try {
      await def.fn(view, params);
    } catch (e) {
      if (!/Not authenticated/.test(e.message)) toast(e.message, 'error');
    }
    window.scrollTo(0, 0);
  }

  // ---------------- sidebar / bell ----------------
  function toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    if (open) {
      sidebar.classList.add('open');
      let back = document.getElementById('sidebar-backdrop');
      if (!back) {
        back = document.createElement('div');
        back.id = 'sidebar-backdrop';
        back.style.cssText = 'position:fixed;inset:0;background:rgba(16,24,40,.4);z-index:55';
        back.addEventListener('click', () => toggleSidebar(false));
        document.body.appendChild(back);
      }
    } else {
      sidebar.classList.remove('open');
      const back = document.getElementById('sidebar-backdrop');
      if (back) back.remove();
    }
  }

  async function toggleBell(e) {
    e.stopPropagation();
    const existing = document.getElementById('notif-popover');
    if (existing) { existing.remove(); return; }
    const pop = document.createElement('div');
    pop.className = 'notif-popover';
    pop.id = 'notif-popover';
    pop.innerHTML = `<div class="np-head"><span>Notifications</span><a href="#/notifications" style="font-size:.78rem">View all</a></div><div class="np-loading">Loading…</div>`;
    document.getElementById('notif-bell').appendChild(pop);
    try {
      const d = await api.get('/api/notifications?filter=all');
      const typeIco = { info: 'ℹ️', warning: '⚠️', success: '✅', urgent: '🚨' };
      pop.querySelector('.np-loading').outerHTML = d.notifications.slice(0, 8).map(n => `
        <div class="np-item ${n.read ? '' : 'unread'}" data-bell-nid="${n.id}">
          <span style="font-size:1.05rem">${typeIco[n.type] || 'ℹ️'}</span>
          <div style="min-width:0">
            <div class="np-title">${esc(n.title)}</div>
            <div class="np-msg">${esc(n.message)}</div>
            <div style="font-size:.7rem;color:var(--muted-2);margin-top:3px">${SMS.ui.timeAgo(n.created_at)}</div>
          </div>
        </div>`).join('') || '<div class="np-item"><div>No notifications yet.</div></div>';
      pop.querySelectorAll('[data-bell-nid]').forEach(b => b.addEventListener('click', async () => {
        const nid = Number(b.dataset.bellNid);
        try { await api.post(`/api/notifications/${nid}/read`); app.refreshNotifBadge(); } catch (err) {}
        closeBell();
        app.goto('#/notifications');
      }));
    } catch (err) {
      pop.querySelector('.np-loading').textContent = 'Could not load notifications.';
    }
  }
  function closeBell() {
    const pop = document.getElementById('notif-popover');
    if (pop) pop.remove();
  }

  // document click closes bell when clicking outside
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('notif-popover');
    if (pop && !pop.contains(e.target) && !e.target.closest('#notif-bell')) closeBell();
  });

  window.SMS.app = app;
  document.addEventListener('DOMContentLoaded', () => app.init());
})();

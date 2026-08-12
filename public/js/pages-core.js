// pages-core.js — Dashboard & Settings
'use strict';
window.SMS = window.SMS || {};
SMS.pages = SMS.pages || {};

(function () {
  const { esc, icon, fmtMoney, fmtDate, toast, statCard, withLoading, roleBadge, ROLE_LABEL } = SMS.ui;
  const api = SMS.api;

  // ================= DASHBOARD =================
  SMS.pages.dashboard = async function (container) {
    await withLoading(container, async () => {
      const d = await api.get('/api/dashboard');
      if (d.parentPortal) { SMS.app.goto('#/parent'); return; }
      const s = d.stats;
      const cur = SMS.api.state.settings.academic.currency;
      const stPct = s.todayStudents ? Math.round(s.todayPresentStudents / s.todayStudents * 100) : 0;
      const sfPct = s.todayStaff ? Math.round(s.todayPresentStaff / s.todayStaff * 100) : 0;
      // only show data-driven cards when there is real data
      const feeHasData = d.monthly.some(m => m.total > 0);
      const trendHasData = d.trend.some(t => t.studentsPct > 0 || t.staffPct > 0);

      container.innerHTML = `
        <div class="grid grid-6" style="margin-bottom:20px">
          ${statCard('users', 'Total Students', s.totalStudents, 'across all classes', 'primary')}
          ${statCard('briefcase', 'Staff Members', s.totalStaff, 'active employees', 'violet')}
          ${statCard('wallet', 'Fee Collected', fmtMoney(s.totalCollected, cur), 'lifetime collection', 'success')}
          ${statCard('bus', 'Bus Routes', s.totalRoutes, s.studentsOnBus + ' students on bus', 'warning')}
          ${statCard('check', 'Students Present', `${s.todayPresentStudents}/${s.todayStudents}`, `${stPct}% today`, 'info')}
          ${statCard('clock', 'Staff Present', `${s.todayPresentStaff}/${s.todayStaff}`, `${sfPct}% today`, 'danger')}
        </div>

        ${feeHasData || d.gender.length ? `<div class="grid grid-3">
          ${feeHasData ? `<div class="card span-2">
            <div class="card-head"><div><h3 class="card-title">Monthly Fee Collection</h3><div class="card-sub">Last ${d.monthly.length} months</div></div></div>
            <div id="dash-fee-chart" style="height:250px"></div>
          </div>` : ''}
          ${d.gender.length ? `<div class="card">
            <div class="card-head"><div><h3 class="card-title">Student Gender</h3><div class="card-sub">Active students</div></div></div>
            <div id="dash-gender-chart" style="display:flex;flex-direction:column;align-items:center"></div>
          </div>` : ''}
        </div>` : ''}

        ${trendHasData || d.classStrength.length ? `<div class="grid grid-3">
          ${trendHasData ? `<div class="card span-2">
            <div class="card-head"><div><h3 class="card-title">Attendance Trend</h3><div class="card-sub">Last 7 days — present %</div></div></div>
            <div id="dash-trend-chart" style="height:250px"></div>
          </div>` : ''}
          ${d.classStrength.length ? `<div class="card">
            <div class="card-head"><div><h3 class="card-title">Class Strength</h3><div class="card-sub">Students per class</div></div></div>
            <div id="dash-class-chart"></div>
          </div>` : ''}
        </div>` : ''}

        ${d.notifications.length || d.upcomingExams.length || d.recentAdmissions.length ? `<div class="grid grid-3">
          ${d.notifications.length ? `<div class="card">
            <div class="card-head"><div><h3 class="card-title">Recent Notifications</h3></div><a href="#/notifications" style="font-size:.84rem">View all</a></div></div>
            <div id="dash-notifs"></div>
          </div>` : ''}
          ${d.upcomingExams.length ? `<div class="card">
            <div class="card-head"><h3 class="card-title">Upcoming Exams</h3></div>
            <div id="dash-exams"></div>
          </div>` : ''}
          ${d.recentAdmissions.length ? `<div class="card">
            <div class="card-head"><div><h3 class="card-title">Recent Admissions</h3></div><a href="#/admission" style="font-size:.84rem">Admission</a></div></div>
            <div id="dash-admissions"></div>
          </div>` : ''}
        </div>` : ''}`;

      const feeEl = document.getElementById('dash-fee-chart');
      if (feeEl) SMS.charts.barChart(feeEl, d.monthly.map(m => ({ label: m.label, value: m.total })), { money: true, color: 'var(--primary)' });

      const genderEl = document.getElementById('dash-gender-chart');
      if (genderEl) {
        const genderColors = { M: '#4f46e5', F: '#ec4899' };
        SMS.charts.pieChart(genderEl,
          d.gender.map(gd => ({ label: gd.gender === 'M' ? 'Boys' : 'Girls', value: gd.c, color: genderColors[gd.gender] || '#94a3b8' })));
      }

      const trendEl = document.getElementById('dash-trend-chart');
      if (trendEl) {
        SMS.charts.lineChart(trendEl, d.trend.map(t => ({ label: t.label, values: { s: t.studentsPct, e: t.staffPct } })),
          [{ name: 's', color: 'var(--primary)' }, { name: 'e', color: '#ec4899' }]);
        const legend = document.createElement('div');
        legend.style.cssText = 'display:flex;gap:16px;font-size:.8rem;margin-top:8px;color:var(--muted)';
        legend.innerHTML = `<span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--primary);margin-right:5px"></span>Students</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#ec4899;margin-right:5px"></span>Staff</span>`;
        trendEl.appendChild(legend);
      }

      const cls = {};
      d.classStrength.forEach(c => { cls['Class ' + c.class + ' ' + c.section] = (cls['Class ' + c.class + ' ' + c.section] || 0) + c.c; });
      const classEl = document.getElementById('dash-class-chart');
      if (classEl) SMS.charts.hbarList(classEl, Object.entries(cls).map(([k, v]) => ({ label: k, value: v })));

      const notifTypes = { info: 'badge-info', warning: 'badge-warning', success: 'badge-success', urgent: 'badge-danger' };
      const notifEl = document.getElementById('dash-notifs');
      if (notifEl) notifEl.innerHTML = d.notifications.map(n => `
        <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #f0f2f6;align-items:flex-start">
          <span class="badge ${notifTypes[n.type]}">${n.type}</span>
          <div style="min-width:0">
            <div style="font-weight:600;font-size:.88rem">${esc(n.title)}</div>
            <div style="font-size:.8rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(n.message)}</div>
          </div>
        </div>`).join('');

      const examEl = document.getElementById('dash-exams');
      if (examEl) examEl.innerHTML = d.upcomingExams.map(e => `
        <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #f0f2f6;align-items:center">
          <span class="stat-icon tint-violet" style="width:36px;height:36px">${icon('calendar', 17)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.88rem">${esc(e.name)}</div>
            <div style="font-size:.78rem;color:var(--muted)">Class ${esc(e.class)}${e.section ? ' ' + esc(e.section) : ''} · ${fmtDate(e.start_date)}</div>
          </div>
          <span class="badge badge-primary">${esc(e.type)}</span>
        </div>`).join('');

      const admEl = document.getElementById('dash-admissions');
      if (admEl) admEl.innerHTML = d.recentAdmissions.map(a => `
        <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #f0f2f6;align-items:center">
          <div class="user-avatar" style="width:32px;height:32px;font-size:.78rem;background:var(--success)">${esc((a.name || '?')[0])}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.88rem">${esc(a.name)}</div>
            <div style="font-size:.76rem;color:var(--muted)" class="mono">${esc(a.admission_no)}</div>
          </div>
          <span class="badge badge-gray">Class ${esc(a.class)}</span>
        </div>`).join('');
    });
  };

  // ================= SETTINGS =================
  SMS.pages.settings = async function (container) {
    await withLoading(container, async () => {
      const { settings } = await api.get('/api/settings');
      let tab = 'school';
      let pendingLogo = null;
      const RENDER = {
        school: () => `
          <div class="form-field"><label>School Logo</label>
            <div style="display:flex;align-items:center;gap:16px">
              <div id="logo-preview" style="width:76px;height:76px;border-radius:16px;border:2px dashed #d7dce6;display:flex;align-items:center;justify-content:center;font-size:2.1rem;overflow:hidden;background:#f8fafc;flex-shrink:0">${settings.school.logo ? `<img src="${settings.school.logo}" alt="logo" style="width:100%;height:100%;object-fit:cover">` : '🏫'}</div>
              <div>
                <input type="file" id="f-school-logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none">
                <div style="display:flex;gap:8px">
                  <button class="btn" id="logo-upload-btn" type="button">${icon('upload', 15)} Upload Logo</button>
                  <button class="btn" id="logo-remove-btn" type="button" ${settings.school.logo ? '' : 'disabled'}>Remove</button>
                </div>
                <div class="form-hint">PNG, JPG, WEBP or SVG. Square image recommended (min 200×200).</div>
              </div>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-field"><label>School Name</label><input id="f-school-name" value="${esc(settings.school.name)}"></div>
            <div class="form-field"><label>Tagline</label><input id="f-school-tagline" value="${esc(settings.school.tagline)}"></div>
            <div class="form-field"><label>Principal Name</label><input id="f-school-principal" value="${esc(settings.school.principal)}"></div>
            <div class="form-field"><label>Phone</label><input id="f-school-phone" value="${esc(settings.school.phone)}"></div>
            <div class="form-field"><label>Email</label><input id="f-school-email" value="${esc(settings.school.email)}"></div>
            <div class="form-field"><label>Website</label><input id="f-school-website" value="${esc(settings.school.website)}"></div>
          </div>
          <div class="form-field" style="margin-top:14px"><label>Address</label><textarea id="f-school-address">${esc(settings.school.address)}</textarea></div>
          <div class="form-actions"><button class="btn btn-primary" data-save="school">Save School Info</button></div>`,
        academic: () => `
          <div class="form-grid">
            <div class="form-field"><label>Established Year</label><input type="number" id="f-academic-established" value="${esc(settings.academic.established)}"></div>
            <div class="form-field"><label>Academic Year</label><input id="f-academic-academicYear" value="${esc(settings.academic.academicYear)}"></div>
            <div class="form-field"><label>Affiliation Board</label><input id="f-academic-board" value="${esc(settings.academic.board)}"></div>
            <div class="form-field"><label>Affiliation Number</label><input id="f-academic-affiliationNo" value="${esc(settings.academic.affiliationNo)}"></div>
            <div class="form-field"><label>School Code</label><input id="f-academic-schoolCode" value="${esc(settings.academic.schoolCode)}"><div class="form-hint">Used to auto-generate admission numbers</div></div>
            <div class="form-field"><label>Currency Symbol</label><input id="f-academic-currency" value="${esc(settings.academic.currency)}" style="max-width:120px"></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" data-save="academic">Save Academic Config</button></div>`,
        notifications: () => `
          <div class="section-label">Channels</div>
          ${switchRow('notifications', 'email', 'Email', 'Send notifications via email')}
          ${switchRow('notifications', 'sms', 'SMS', 'Send notifications via SMS')}
          ${switchRow('notifications', 'push', 'Push', 'Send in-app push notifications')}
          <div class="section-label">Automated Alerts</div>
          ${switchRow('notifications', 'autoFees', 'Fee reminders', 'Automatically remind parents about pending fees')}
          ${switchRow('notifications', 'autoAttendance', 'Attendance alerts', 'Alert parents when a child is absent')}
          ${switchRow('notifications', 'autoExams', 'Exam alerts', 'Notify about upcoming exam schedules')}
          ${switchRow('notifications', 'autoResults', 'Results alerts', 'Notify when results are published')}
          <div class="form-field" style="max-width:240px;margin-top:16px"><label>Fee Reminder Days</label>
            <input type="number" id="f-notifications-feeReminderDays" value="${esc(settings.notifications.feeReminderDays)}"><div class="form-hint">Days before due date to send the reminder</div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" data-save="notifications">Save Notification Settings</button></div>`,
        security: () => `
          <div class="form-grid">
            <div class="form-field"><label>Session Timeout (minutes)</label><input type="number" id="f-security-sessionTimeout" value="${esc(settings.security.sessionTimeout)}"></div>
            <div class="form-field"><label>Login Attempt Limit</label><input type="number" id="f-security-loginAttempts" value="${esc(settings.security.loginAttempts)}"></div>
            <div class="form-field"><label>Password Policy</label>
              <select id="f-security-passwordPolicy">
                <option value="low" ${settings.security.passwordPolicy === 'low' ? 'selected' : ''}>Low — 6+ characters</option>
                <option value="medium" ${settings.security.passwordPolicy === 'medium' ? 'selected' : ''}>Medium — 8+ characters</option>
                <option value="high" ${settings.security.passwordPolicy === 'high' ? 'selected' : ''}>High — 10+ chars, symbols</option>
              </select></div>
            <div class="form-field"><label>Two-Factor Authentication</label>
              <select id="f-security-twoFactor">
                <option value="false" ${!settings.security.twoFactor ? 'selected' : ''}>Disabled</option>
                <option value="true" ${settings.security.twoFactor ? 'selected' : ''}>Enabled</option>
              </select></div>
          </div>
          <div style="margin-top:12px">${switchRow('security', 'auditLogging', 'Audit Logging', 'Keep a log of admin actions')}</div>
          <div class="form-actions"><button class="btn btn-primary" data-save="security">Save Security Settings</button></div>`,
        appearance: () => `
          <div class="form-field"><label>Theme Color</label>
            <div style="display:flex;align-items:center;gap:12px">
              <input type="color" id="f-appearance-themeColor" value="${settings.appearance.themeColor}" style="width:56px;height:38px;padding:3px;cursor:pointer">
              <span id="theme-hex" class="mono" style="color:var(--muted)">${settings.appearance.themeColor}</span>
            </div>
          </div>
          <div class="form-field" style="margin-top:16px"><label>Sidebar Style</label>
            <select id="f-appearance-sidebarStyle">
              <option value="dark" ${settings.appearance.sidebarStyle === 'dark' ? 'selected' : ''}>Dark sidebar</option>
              <option value="light" ${settings.appearance.sidebarStyle === 'light' ? 'selected' : ''}>Light sidebar</option>
            </select></div>
          <div class="form-field" style="margin-top:16px"><label>Font Size</label>
            <select id="f-appearance-fontSize">
              <option value="small" ${settings.appearance.fontSize === 'small' ? 'selected' : ''}>Small</option>
              <option value="medium" ${settings.appearance.fontSize === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="large" ${settings.appearance.fontSize === 'large' ? 'selected' : ''}>Large</option>
            </select></div>
          <div class="form-actions"><button class="btn btn-primary" data-save="appearance">Save Appearance</button></div>`,
      };

      function switchRow(group, key, label, sub) {
        const checked = settings[group][key] ? 'checked' : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f0f2f6">
          <div><div style="font-weight:600;font-size:.92rem">${label}</div><div style="font-size:.8rem;color:var(--muted)">${sub}</div></div>
          <label class="switch"><input type="checkbox" id="f-${group}-${key}" ${checked}><span class="slider"></span></label>
        </div>`;
      }

      function collect(group) {
        const out = {};
        const keys = Object.keys(settings[group]);
        keys.forEach(k => {
          const el = document.getElementById(`f-${group}-${k}`);
          if (!el) return;
          if (el.type === 'checkbox') out[k] = el.checked;
          else if (el.type === 'number') out[k] = Number(el.value);
          else out[k] = el.value;
        });
        return out;
      }

      async function save(e) {
        const group = e.target.dataset.save;
        try {
          const payload = { [group]: collect(group) };
          if (group === 'school' && pendingLogo !== null) payload.school.logo = pendingLogo;
          await api.put('/api/settings', payload);
          pendingLogo = null;
          const resp = await api.get('/api/settings');
          api.state.settings = resp.settings;
          SMS.app.applyAppearance();
          SMS.app.renderShell();
          toast('Settings saved', 'success');
        } catch (err) { toast(err.message, 'error'); }
      }

      // build tabs with explicit renderers
      const TABS = [
        ['school', 'School Info'], ['academic', 'Academic'], ['notifications', 'Notifications'],
        ['security', 'Security'], ['appearance', 'Appearance']];
      container.innerHTML = `
        <h2 style="margin-bottom:4px">Settings</h2>
        <p style="color:var(--muted);margin-bottom:18px">Manage school information, notification channels, security and appearance.</p>
        <div class="tabs">
          ${TABS.map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
        </div>
        <div class="card" style="max-width:780px" id="settings-tab-body"></div>`;

      const body = container.querySelector('#settings-tab-body');
      const bindTab = () => {
        body.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', save));
        const theme = document.getElementById('f-appearance-themeColor');
        if (theme) theme.addEventListener('input', () => {
          const hex = document.getElementById('theme-hex'); if (hex) hex.textContent = theme.value;
          document.documentElement.style.setProperty('--primary', theme.value);
        });
        if (tab === 'appearance') {
          const ss = document.getElementById('f-appearance-sidebarStyle');
          const fs = document.getElementById('f-appearance-fontSize');
          if (ss) ss.addEventListener('change', () => document.getElementById('sidebar').classList.toggle('light', ss.value === 'light'));
          if (fs) fs.addEventListener('change', () => document.documentElement.style.fontSize = { small: '13px', medium: '14.5px', large: '16px' }[fs.value]);
        }
        if (tab === 'school') {
          const uploadBtn = document.getElementById('logo-upload-btn');
          const fileInput = document.getElementById('f-school-logo-file');
          if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput.click());
          if (fileInput) fileInput.addEventListener('change', () => {
            const f = fileInput.files[0];
            if (!f) return;
            if (f.size > 1024 * 1024) { toast('Logo must be under 1 MB', 'error'); return; }
            const reader = new FileReader();
            reader.onload = () => {
              pendingLogo = reader.result;
              const pv = document.getElementById('logo-preview');
              if (pv) pv.innerHTML = `<img src="${pendingLogo}" alt="logo" style="width:100%;height:100%;object-fit:cover">`;
              const rm = document.getElementById('logo-remove-btn');
              if (rm) rm.disabled = false;
              toast('Logo selected — click Save School Info', 'info');
            };
            reader.readAsDataURL(f);
          });
          const removeBtn = document.getElementById('logo-remove-btn');
          if (removeBtn) removeBtn.addEventListener('click', () => {
            pendingLogo = '';
            const pv = document.getElementById('logo-preview');
            if (pv) pv.innerHTML = '🏫';
            removeBtn.disabled = true;
            if (fileInput) fileInput.value = '';
          });
        }
      };
      body.innerHTML = RENDER[tab]();
      bindTab();
      container.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
        tab = b.dataset.tab; body.innerHTML = RENDER[tab]();
        container.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
        bindTab();
      }));
    });
  };
})();

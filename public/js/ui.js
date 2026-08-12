// ui.js — icons, toasts, modals, formatting and shared components
'use strict';
window.SMS = window.SMS || {};

(function () {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---------------- icons (stroke-based, feather-like) ----------------
  const PATHS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    bus: '<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16M8 17v3M16 17v3M8 6h8"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M14 9l3 3M17 6l2 2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    edit: '<path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="m1 1 22 22"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
    route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H12"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    school: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    warning: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  };
  function icon(name, size) {
    return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || PATHS.info}</svg>`;
  }

  // ---------------- formatting ----------------
  function fmtMoney(n, cur) {
    cur = cur || '₹';
    return cur + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  function fmtDate(d) {
    if (!d) return '—';
    const p = String(d).slice(0, 10);
    const [y, m, day] = p.split('-');
    if (!y || !m || !day) return p;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[Number(m) - 1]} ${y}`;
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso.replace(' ', 'T'));
    const sec = Math.floor((Date.now() - then.getTime()) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    if (sec < 86400 * 7) return Math.floor(sec / 86400) + 'd ago';
    return fmtDate(iso);
  }
  const ROLE_LABEL = { admin: 'Administrator', teacher: 'Teacher', manager: 'Manager', staff: 'Staff', parent: 'Parent' };
  const EMP_TYPE = { teacher: 'Teacher', staff: 'Staff', admin: 'Admin', driver: 'Driver', conductor: 'Conductor', guard: 'Guard', cleaner: 'Cleaner' };
  function roleBadge(role) { return `<span class="badge role-${role}">${ROLE_LABEL[role] || role}</span>`; }
  function typeBadge(type) {
    const map = { teacher: 'badge-primary', staff: 'badge-info', admin: 'badge-violet', driver: 'badge-warning', conductor: 'badge-warning', guard: 'badge-gray', cleaner: 'badge-gray' };
    return `<span class="badge ${map[type] || 'badge-gray'}">${EMP_TYPE[type] || type}</span>`;
  }
  function attBadge(status) {
    const map = { present: ['badge-success', 'Present'], absent: ['badge-danger', 'Absent'], late: ['badge-warning', 'Late'], leave: ['badge-info', 'Leave'] };
    const [cls, label] = map[status] || ['badge-gray', status || '—'];
    return `<span class="badge ${cls}">${label}</span>`;
  }
  function gradeColor(g) {
    if (g === 'A+' || g === 'A') return 'var(--success)';
    if (g === 'B+' || g === 'B') return 'var(--info)';
    if (g === 'C+' || g === 'C' || g === 'D') return 'var(--warning)';
    return 'var(--danger)';
  }

  // ---------------- toasts ----------------
  function toast(msg, type) {
    type = type || 'info';
    const ico = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-ico">${ico}</span><span>${msg}</span>`;
    el.addEventListener('click', () => remove());
    document.getElementById('toast-root').appendChild(el);
    setTimeout(remove, 4200);
    function remove() {
      if (!el.parentNode) return;
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }
  }

  // ---------------- modal ----------------
  let modalStack = [];
  function openModal({ title, body, footer, size, onClose }) {
    const root = document.getElementById('modal-root');
    const overlay = document.getElementById('overlay');
    const modal = document.createElement('div');
    modal.className = 'modal' + (size === 'lg' ? ' modal-lg' : '');
    modal.innerHTML = `
      <div class="modal-head">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" data-close>×</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}`;
    root.appendChild(modal);
    overlay.classList.add('show');
    requestAnimationFrame(() => modal.classList.add('show'));
    const close = () => {
      modal.classList.remove('show');
      overlay.classList.remove('show');
      setTimeout(() => { modal.remove(); }, 180);
      modalStack = modalStack.filter(m => m !== modal);
      if (onClose) onClose();
    };
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modalStack.push(modal);
    return { el: modal, close, bodyEl: modal.querySelector('.modal-body') };
  }
  function closeTopModal() {
    const m = modalStack.pop();
    if (m) { m.classList.remove('show'); document.getElementById('overlay').classList.remove('show'); setTimeout(() => m.remove(), 180); }
  }

  function confirmDialog(msg, { danger, okText } = {}) {
    return new Promise(resolve => {
      const m = openModal({
        title: 'Confirm',
        body: `<p style="margin:4px 0 0">${msg}</p>`,
        footer: `<button class="btn" data-cancel>Cancel</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${okText || 'Confirm'}</button>`,
        onClose: () => resolve(false),
      });
      m.el.querySelector('[data-cancel]').addEventListener('click', () => { resolve(false); m.close(); });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { resolve(true); m.close(); });
    });
  }

  // ---------------- shared components ----------------
  function statCard(iconName, label, value, sub, tint) {
    return `<div class="card stat-card">
      <div class="stat-icon tint-${tint || 'primary'}">${icon(iconName)}</div>
      <div>
        <div class="stat-value">${value}</div>
        <div class="stat-label">${label}</div>
        ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
      </div>
    </div>`;
  }

  function loading(container, text) {
    container.innerHTML = `<div class="loading-block"><div class="spinner"></div><div>${text || 'Loading…'}</div></div>`;
  }
  function emptyState(container, iconName, title, sub) {
    container.innerHTML = `<div class="empty-state">
      <div class="es-icon">${icon(iconName, 34)}</div>
      <h3>${title}</h3><p>${sub || ''}</p>
    </div>`;
  }

  // helper: run a page render with loading + error handling
  async function withLoading(container, fn, loaderText) {
    loading(container, loaderText);
    try {
      await fn();
    } catch (e) {
      container.innerHTML = '';
      toast(e.message, 'error');
    }
  }

  // Show auto-created login credentials (after admission / employee creation)
  function loginCreds({ title, username, password, roleLabel } = {}) {
    const m = openModal({
      title: title || 'Login Credentials Created',
      body: `
        <p style="color:var(--muted);font-size:.88rem;margin:0 0 14px">Login was auto-created successfully. Save these credentials — they are shown only once.</p>
        <div style="background:color-mix(in srgb,var(--primary) 7%,#fff);border:1px solid color-mix(in srgb,var(--primary) 22%,#fff);border-radius:12px;padding:14px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 0;border-bottom:1px dashed color-mix(in srgb,var(--primary) 18%,#fff)">
            <span style="color:var(--muted);font-size:.78rem;font-weight:700;letter-spacing:.04em">USERNAME${roleLabel ? ` · ${esc(roleLabel)}` : ''}</span>
            <b class="mono">${esc(username)}</b>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 0">
            <span style="color:var(--muted);font-size:.78rem;font-weight:700;letter-spacing:.04em">PASSWORD</span>
            <b class="mono">${esc(password)}</b>
          </div>
        </div>
        <p style="color:var(--muted);font-size:.8rem;margin:12px 0 0">The password must be changed on first login. The admin can reset any password from <b>User Management</b>.</p>`,
      footer: `<button class="btn btn-primary" data-close>Got it</button>`,
    });
    return m;
  }

  function downloadCSV(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  function qs(obj) {
    return Object.entries(obj).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }

  window.SMS.ui = { esc, icon, fmtMoney, fmtDate, timeAgo, roleBadge, typeBadge, attBadge, gradeColor, ROLE_LABEL, EMP_TYPE,
    toast, openModal, closeTopModal, confirmDialog, statCard, loading, emptyState, withLoading, downloadCSV, qs, loginCreds };
})();

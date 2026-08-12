// pages-students.js — Admission & Student Management
'use strict';
window.SMS = window.SMS || {};
SMS.pages = SMS.pages || {};

(function () {
  const { esc, icon, fmtDate, toast, openModal, confirmDialog, statCard, withLoading, attBadge, loginCreds } = SMS.ui;
  const api = SMS.api;

  const CLASSES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const CASTES = ['General', 'OBC', 'SC/ST'];

  // Dropdown options for Caste; keeps an existing non-standard value so it is never lost on edit.
  function casteOptions(current) {
    const norm = String(current || '').trim();
    const std = CASTES.find(c => c.toLowerCase() === norm.toLowerCase());
    if (std) return CASTES.map(c => `<option ${c === std ? 'selected' : ''}>${c}</option>`).join('');
    return `<option value="">Select</option>${norm ? `<option selected>${esc(norm)}</option>` : ''}${CASTES.map(c => `<option>${c}</option>`).join('')}`;
  }

  function todayLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function normMobile(raw) {
    let s = String(raw || '').trim().replace(/\D/g, '');
    if (s.startsWith('91') && s.length === 12) s = s.slice(2);
    return s.length === 10 ? s : null;
  }

  function studentFormFields(s, prefix) {
    prefix = prefix || '';
    const val = (k) => esc(s && s[k] != null ? s[k] : '');
    return `
      <div class="section-label">Student Details</div>
      <div class="form-grid">
        <div class="form-field"><label>Name of the Student *</label><input id="${prefix}f-name" value="${val('name')}" required placeholder="Full name as per records"></div>
        <div class="form-field"><label>Admission Number *</label><input id="${prefix}f-admission" value="${val('admission_no')}" placeholder="e.g. 2026-01" required><div class="form-hint">Written manually — must be unique, cannot match another student</div></div>
        <div class="form-field"><label>Class *</label><select id="${prefix}f-class">${CLASSES.map(c => `<option ${s && s.class === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="form-field"><label>Section</label><input id="${prefix}f-section" value="${val('section')}" placeholder="e.g. A — type any section"></div>
        <div class="form-field"><label>Date of Birth</label><input type="date" id="${prefix}f-dob" value="${val('dob')}"></div>
        <div class="form-field"><label>Gender</label><select id="${prefix}f-gender"><option value="">Select</option><option value="M" ${s && s.gender === 'M' ? 'selected' : ''}>Male</option><option value="F" ${s && s.gender === 'F' ? 'selected' : ''}>Female</option></select></div>
        <div class="form-field"><label>Religion</label><input id="${prefix}f-religion" value="${val('religion')}"></div>
        <div class="form-field"><label>Caste</label><select id="${prefix}f-caste">${casteOptions(s && s.caste)}</select></div>
        <div class="form-field"><label>Address</label><input id="${prefix}f-address" value="${val('address')}" placeholder="Full residential address"></div>
        <div class="form-field"><label>Aadhaar Number (Student)</label><input id="${prefix}f-aadhaar" value="${val('aadhar_no')}" placeholder="12 digits" maxlength="12" inputmode="numeric"><div class="form-hint">12-digit Aadhaar number</div></div>
        <div class="form-field"><label>PEN (Permanent Education Number)</label><input id="${prefix}f-pen" value="${val('pen')}" placeholder="e.g. 201623456789"></div>
        <div class="form-field"><label>Date of Admission</label><input type="date" id="${prefix}f-admission-date" value="${val('admission_date') || todayLocal()}"><div class="form-hint">Auto-filled with today's date, editable</div></div>
      </div>
      <div class="section-label">Parent / Guardian Details</div>
      <div class="form-grid">
        <div class="form-field"><label>Father's Name</label><input id="${prefix}f-father" value="${val('father_name')}"></div>
        <div class="form-field"><label>Mother's Name</label><input id="${prefix}f-mother" value="${val('mother_name')}"></div>
        <div class="form-field"><label>Guardian's Name</label><input id="${prefix}f-guardian" value="${val('guardian_name')}"></div>
        <div class="form-field"><label>Occupation</label><input id="${prefix}f-occupation" value="${val('occupation')}" placeholder="Father's / mother's / guardian's occupation"></div>
        <div class="form-field"><label>Mobile Number 1 *</label><div style="display:flex;gap:8px"><span class="phone-prefix">+91</span><input id="${prefix}f-mobile1" value="${val('mobile1')}" placeholder="98765 43210" maxlength="10" inputmode="numeric" required><span id="${prefix}f-mobile1-ok" class="field-check"></span></div><div class="form-hint">At least one mobile number is required — 10 digits</div></div>
        <div class="form-field"><label>Mobile Number 2 (optional)</label><div style="display:flex;gap:8px"><span class="phone-prefix">+91</span><input id="${prefix}f-mobile2" value="${val('mobile2')}" placeholder="98765 43210" maxlength="10" inputmode="numeric"></div></div>
      </div>
      <div class="form-hint" style="margin-top:10px">Guardian for the parent login is chosen automatically: Father → Mother → Guardian. The parent's login will be the <b>Admission Number</b> with password <b>AdmissionNumber@123</b>.</div>`;
  }

  // ================= STUDENTS =================
  SMS.pages.students = async function (container) {
    await withLoading(container, async () => {
      let data = await api.get('/api/students');
      let list = data.students;
      let q = { search: '', class: '', gender: '', status: '' };

      const render = () => {
        list = data.students.filter(s =>
          (!q.search || (s.name + ' ' + s.admission_no + ' ' + (s.parent_name || '')).toLowerCase().includes(q.search.toLowerCase())) &&
          (!q.class || s.class === q.class) && (!q.gender || s.gender === q.gender) && (!q.status || s.status === q.status));
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Students</h2>
          <p style="color:var(--muted);margin-bottom:18px">Manage student records, search and filter across all classes.</p>
          <div class="grid grid-4" style="margin-bottom:20px">
            ${statCard('users', 'Total Students', data.stats.total, 'enrolled', 'primary')}
            ${statCard('user', 'Boys', data.stats.boys, 'male students', 'info')}
            ${statCard('user', 'Girls', data.stats.girls, 'female students', 'danger')}
            ${statCard('check', 'Active', data.stats.active, 'currently studying', 'success')}
          </div>
          <div class="toolbar">
            <div class="search-wrap grow">${icon('search')}<input id="st-search" placeholder="Search by name or admission no…" value="${esc(q.search)}"></div>
            <select id="st-class" class="filter-select"><option value="">All classes</option>${data.classes.map(c => `<option ${q.class === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
            <select id="st-gender" class="filter-select"><option value="">All genders</option><option value="M" ${q.gender === 'M' ? 'selected' : ''}>Male</option><option value="F" ${q.gender === 'F' ? 'selected' : ''}>Female</option></select>
            <select id="st-status" class="filter-select"><option value="">All status</option><option value="active" ${q.status === 'active' ? 'selected' : ''}>Active</option><option value="transferred" ${q.status === 'transferred' ? 'selected' : ''}>Transferred</option></select>
            <button class="btn" id="st-export">${icon('download', 15)} Export</button>
            <button class="btn btn-primary" id="st-add">${icon('plus', 15)} Add Student</button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Admission No</th><th>Name</th><th>Class</th><th>Roll</th><th>Gender</th><th>Parent</th><th>Status</th><th></th></tr></thead>
              <tbody id="st-body"></tbody>
            </table>
          </div>`;

        const body = container.querySelector('#st-body');
        if (!list.length) {
          body.innerHTML = `<tr><td colspan="8"><div class="ta-empty"><div class="ta-icon">${icon('users', 30)}</div>No students found. Try adjusting your filters.</div></td></tr>`;
        } else {
          body.innerHTML = list.map(s => `
            <tr>
              <td class="mono">${esc(s.admission_no)}</td>
              <td class="td-name">${esc(s.name)}</td>
              <td>${esc(s.class)}${esc(s.section)}</td>
              <td>${s.roll_no || '—'}</td>
              <td>${s.gender === 'M' ? 'Male' : s.gender === 'F' ? 'Female' : '—'}</td>
              <td style="font-size:.84rem">${esc(s.parent_name || '—')}</td>
              <td>${s.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-gray">Transferred</span>'}</td>
              <td><div class="tbl-actions">
                <button class="icon-btn" data-view="${s.id}" title="View">${icon('eye', 16)}</button>
                <button class="icon-btn" data-edit="${s.id}" title="Edit">${icon('edit', 16)}</button>
                <button class="icon-btn" data-del="${s.id}" title="Delete" style="color:var(--danger)">${icon('trash', 16)}</button>
              </div></td>
            </tr>`).join('');
        }

        container.querySelector('#st-search').addEventListener('input', e => { q.search = e.target.value; render(); });
        container.querySelector('#st-class').addEventListener('change', e => { q.class = e.target.value; render(); });
        container.querySelector('#st-gender').addEventListener('change', e => { q.gender = e.target.value; render(); });
        container.querySelector('#st-status').addEventListener('change', e => { q.status = e.target.value; render(); });
        container.querySelector('#st-export').addEventListener('click', async () => {
          try {
            const res = await fetch('/api/students/export/csv', { headers: { Authorization: 'Bearer ' + api.state.token } });
            SMS.ui.downloadCSV('students.csv', await res.text());
            toast('Students exported', 'success');
          } catch (e) { toast(e.message, 'error'); }
        });
        container.querySelector('#st-add').addEventListener('click', () => studentModal(null, () => refresh()));
        body.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => viewStudent(Number(b.dataset.view))));
        body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
          const s = data.students.find(x => x.id === Number(b.dataset.edit));
          studentModal(s, () => refresh());
        }));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          const s = data.students.find(x => x.id === Number(b.dataset.del));
          if (await confirmDialog(`Delete <b>${esc(s.name)}</b>? This cannot be undone.`, { danger: true, okText: 'Delete' })) {
            try { await api.del('/api/students/' + s.id); toast('Student deleted', 'success'); refresh(); }
            catch (e) { toast(e.message, 'error'); }
          }
        }));
      };

      async function refresh() {
        const d2 = await api.get('/api/students');
        data = d2; render();
      }

      render();
    });
  };

  function studentModal(s, onSaved) {
    const isNew = !s;
    const m = openModal({
      title: isNew ? 'Add Student' : `Edit — ${esc(s.name)}`,
      size: 'lg',
      body: `
        ${studentFormFields(s, 's-')}
        <div class="form-field" style="max-width:260px;margin-top:12px"><label>Status</label>
          <select id="s-f-status"><option value="active" ${s && s.status === 'active' ? 'selected' : ''}>Active</option><option value="transferred" ${s && s.status === 'transferred' ? 'selected' : ''}>Transferred</option></select>
        </div>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="s-save">${isNew ? 'Add Student' : 'Save Changes'}</button>`,
    });
    m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
    m.el.querySelector('#s-save').addEventListener('click', async () => {
      const btn = m.el.querySelector('#s-save');
      if (btn.disabled) return; // guard against double submit
      btn.disabled = true; btn.textContent = isNew ? 'Admitting…' : 'Saving…';
      const g = (id) => document.getElementById(id).value.trim();
      const name = g('s-f-name');
      if (!name) { toast('Student name is required', 'error'); return; }
      const n1 = normMobile(g('s-f-mobile1')), n2 = g('s-f-mobile2') ? normMobile(g('s-f-mobile2')) : null;
      if (!n1 && !n2) { toast('At least one valid 10-digit mobile number is required', 'error'); return; }
      const student = {
        name, admission_no: g('s-f-admission'), class: g('s-f-class'), section: g('s-f-section'),
        gender: g('s-f-gender'), dob: g('s-f-dob'), religion: g('s-f-religion'), caste: g('s-f-caste'),
        address: g('s-f-address'), aadhar_no: g('s-f-aadhaar'), pen: g('s-f-pen'),
        admission_date: g('s-f-admission-date'), father_name: g('s-f-father'), mother_name: g('s-f-mother'),
        guardian_name: g('s-f-guardian'), occupation: g('s-f-occupation'),
        mobile1: n1 ? '+91' + n1 : (g('s-f-mobile1') || ''), mobile2: n2 ? '+91' + n2 : (g('s-f-mobile2') || ''),
        status: g('s-f-status')
      };
      try {
        if (isNew) {
          const res = await api.post('/api/students', { student });
          m.close();
          toast(`Admitted ${res.student.name} — ${res.student.admission_no}`, 'success');
          if (res.defaultPassword) {
            loginCreds({ title: `${res.student.name} — Login Created`, username: res.student.admission_no, password: res.defaultPassword, roleLabel: 'Parent' });
          }
        } else {
          student.id = s.id;
          await api.put('/api/students/' + s.id, student);
          const guardian = student.father_name || student.mother_name || student.guardian_name;
          if (s.parent_id && guardian && student.mobile1) {
            await api.put('/api/parents/' + s.parent_id, { name: guardian, phone: student.mobile1, occupation: student.occupation, address: student.address });
          }
          m.close();
          toast('Student updated', 'success');
        }
        if (onSaved) onSaved();
      } catch (e) { toast(e.message, 'error'); }
      finally {
        btn.disabled = false;
        btn.textContent = isNew ? 'Add Student' : 'Save Changes';
      }
    });
  }

  async function viewStudent(id) {
    const d = await api.get('/api/students/' + id);
    const s = d.student;
    const m = openModal({
      title: `${esc(s.name)} — ${esc(s.admission_no)}`,
      size: 'lg',
      body: `
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px;flex-wrap:wrap">
          <div class="user-avatar" style="width:56px;height:56px;font-size:1.3rem;background:var(--primary)">${esc((s.name || '?')[0])}</div>
          <div>
            <div style="font-size:1.1rem;font-weight:700">${esc(s.name)}</div>
            <div class="mono" style="color:var(--muted)">${esc(s.admission_no)}</div>
          </div>
          <div style="margin-left:auto">
            ${s.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-gray">Transferred</span>'}
          </div>
        </div>
        <div class="grid grid-2">
          <div>
            <div class="section-label">Student Details</div>
            ${kv('Class & Section', esc(s.class) + (s.section || ''))}
            ${kv('Roll Number', s.roll_no || '—')}
            ${kv('Gender', s.gender === 'M' ? 'Male' : s.gender === 'F' ? 'Female' : '—')}
            ${kv('Date of Birth', fmtDate(s.dob))}
            ${kv('Religion', s.religion || '—')}
            ${kv('Caste', s.caste || '—')}
            ${kv('Address', s.address || '—')}
            ${kv('Aadhaar No', s.aadhar_no || '—')}
            ${kv('PEN', s.pen || '—')}
            ${kv('Admitted On', fmtDate(s.admission_date))}
          </div>
          <div>
            <div class="section-label">Parent / Guardian</div>
            ${kv('Father', s.father_name || '—')}
            ${kv('Mother', s.mother_name || '—')}
            ${kv('Guardian', s.guardian_name || '—')}
            ${kv('Occupation', s.occupation || '—')}
            ${kv('Mobile 1', s.mobile1 || '—')}
            ${kv('Mobile 2', s.mobile2 || '—')}
            <div class="section-label">Transport</div>
            ${kv('Bus Route', s.route_no || 'Not assigned')}
            ${s.route_no ? kv('Monthly Fee', SMS.ui.fmtMoney(s.route_fee, api.state.settings.academic.currency)) : ''}
            <div class="section-label">Fees</div>
            ${kv('Total Paid', SMS.ui.fmtMoney(d.totalPaid, api.state.settings.academic.currency))}
            ${kv('Balance', `<span style="color:${d.balance > 0 ? 'var(--danger)' : 'var(--success)'}">${SMS.ui.fmtMoney(d.balance, api.state.settings.academic.currency)}</span>`)}
          </div>
        </div>
        ${d.attendancePct != null ? `<div class="section-label">Attendance</div>
          <div style="display:flex;align-items:center;gap:14px">
            <div class="progress ${d.attendancePct < 75 ? 'red' : d.attendancePct < 90 ? 'amber' : 'green'}" style="flex:1"><div style="width:${d.attendancePct}%"></div></div>
            <b style="font-size:1rem">${d.attendancePct}%</b>
          </div>` : ''}
        <div class="section-label">Payment History</div>
        ${d.payments.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>Receipt</th><th>Amount</th><th>Discount</th><th>Mode</th><th>Date</th></tr></thead>
          <tbody>${d.payments.map(p => `<tr><td class="mono">${esc(p.receipt_no)}</td><td>${SMS.ui.fmtMoney(p.amount, api.state.settings.academic.currency)}</td><td>${p.discount ? SMS.ui.fmtMoney(p.discount, api.state.settings.academic.currency) : '—'}</td><td style="text-transform:capitalize">${esc(p.mode)}</td><td>${fmtDate(p.date)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p style="color:var(--muted)">No payments recorded yet.</p>'}
        ${d.routes.length ? `<div class="form-field" style="margin-top:16px"><label>Assign Bus Route</label>
          <select id="view-route"><option value="">— None —</option>${d.routes.map(r => `<option value="${r.id}" ${s.route_id === r.id ? 'selected' : ''}>${esc(r.route_no)}</option>`).join('')}</select></div>` : ''}`,
      footer: `<button class="btn" data-close>Close</button>`,
    });
    m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
    const sel = m.el.querySelector('#view-route');
    if (sel) sel.addEventListener('change', async () => {
      try { await api.put('/api/students/' + id, { ...s, route_id: sel.value || null }); toast('Route updated', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    });
  }
  function kv(k, v) {
    return `<div style="display:flex;justify-content:space-between;gap:14px;padding:6px 0;border-bottom:1px solid #f0f2f6;font-size:.88rem">
      <span style="color:var(--muted)">${k}</span><span style="font-weight:500;text-align:right">${v}</span></div>`;
  }

  // ================= ADMISSION =================
  SMS.pages.admission = async function (container) {
    await withLoading(container, async () => {
      const d = await api.get('/api/admissions/overview');
      let search = '';
      let wizard = { step: 1, student: {}, parent: {} };

      const render = () => {
        const list = d.recent.filter(r => !search || (r.name + r.admission_no + (r.parent_name || '')).toLowerCase().includes(search.toLowerCase()));
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Admission</h2>
          <p style="color:var(--muted);margin-bottom:18px">Admit new students with a guided form, or import them in bulk from a CSV file.</p>
          <div class="grid grid-4" style="margin-bottom:20px">
            ${statCard('userPlus', 'New This Month', d.stats.newThisMonth, 'admitted recently', 'success')}
            ${statCard('users', 'Active Students', d.stats.active, 'currently enrolled', 'primary')}
            ${statCard('arrowRight', 'Transferred', d.stats.transferred, 'moved to other schools', 'warning')}
            ${statCard('school', 'Total Enrolled', d.stats.total, 'all time', 'info')}
          </div>
          <div class="grid grid-2" style="grid-template-columns: 1.5fr 1fr; align-items:start">
            <div class="card">
              <div class="card-head"><div><h3 class="card-title">New Student Admission</h3><div class="card-sub">Student Details → Review</div></div></div>
              <div class="wizard-steps">
                <div class="ws-step ${wizard.step >= 1 ? (wizard.step > 1 ? 'done' : 'active') : ''}"><span class="ws-num">${wizard.step > 1 ? '✓' : '1'}</span> Student Details</div>
                <div class="ws-line ${wizard.step > 1 ? 'done' : ''}"></div>
                <div class="ws-step ${wizard.step >= 2 ? 'active' : ''}"><span class="ws-num">2</span> Review</div>
              </div>
              <div id="wizard-body"></div>
            </div>
            <div class="card">
              <div class="card-head"><h3 class="card-title">Bulk Import (CSV)</h3></div>
              <p style="font-size:.86rem;color:var(--muted)">Upload a CSV with student and parent details to admit many students at once.</p>
              <div style="display:flex;gap:8px;margin-bottom:12px">
                <button class="btn btn-sm" id="adm-template">${icon('download', 13)} Template</button>
              </div>
              <label class="switch" style="display:flex;align-items:center;gap:10px;margin-bottom:14px;width:100%">
                <input type="checkbox" id="adm-create-logins"><span class="slider"></span>
                <span style="font-size:.84rem;font-weight:600">Auto-create parent login accounts</span>
              </label>
              <div id="adm-file-zone" style="border:2px dashed var(--border-strong);border-radius:10px;padding:22px;text-align:center;cursor:pointer;transition:.15s">
                <div style="font-size:1.8rem;margin-bottom:6px">${icon('upload', 28)}</div>
                <div style="font-weight:600;font-size:.9rem">Click to choose a CSV file</div>
                <div style="font-size:.78rem;color:var(--muted)">Students, parents and optional login accounts</div>
                <input type="file" id="adm-file" accept=".csv,text/csv" hidden>
              </div>
              <div id="adm-import-result" style="margin-top:14px"></div>
            </div>
          </div>
          <div class="card" style="margin-top:20px">
            <div class="card-head">
              <div><h3 class="card-title">Recent Admissions</h3></div>
              <div class="search-wrap" style="width:260px">${icon('search')}<input id="adm-search" placeholder="Search recent admissions…" value="${esc(search)}"></div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Admission No</th><th>Name</th><th>Class</th><th>Parent</th><th>Status</th><th>Admitted</th></tr></thead>
                <tbody>${list.map(r => `<tr>
                  <td class="mono">${esc(r.admission_no)}</td>
                  <td class="td-name">${esc(r.name)}</td>
                  <td>${esc(r.class)}${esc(r.section)}</td>
                  <td style="font-size:.84rem">${esc(r.parent_name || '—')}</td>
                  <td>${r.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-gray">Transferred</span>'}</td>
                  <td style="font-size:.84rem">${fmtDate(r.created_at)}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>`;

        renderWizard();
        container.querySelector('#adm-search').addEventListener('input', e => { search = e.target.value; render(); });
        container.querySelector('#adm-template').addEventListener('click', downloadTemplate);
        const zone = container.querySelector('#adm-file-zone');
        const fileInput = container.querySelector('#adm-file');
        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => importCSV(fileInput.files[0]));
        ['dragover', 'drop'].forEach(ev => zone.addEventListener(ev, e => e.preventDefault()));
        zone.addEventListener('drop', e => {
          const f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (f) importCSV(f);
        });
      };

      function renderWizard() {
        const body = container.querySelector('#wizard-body');
        const w = wizard;
        if (w.step === 1) {
          body.innerHTML = `${studentFormFields(w.student, 'w-')}
            <div class="form-actions">
              <button class="btn btn-primary" id="w-next">Review Admission →</button>
            </div>`;
          body.querySelector('#w-next').addEventListener('click', () => {
            const err = validateStudentForm();
            if (err) { toast(err, 'error'); return; }
            w.student = readFields();
            w.step = 2; render();
          });
          // live mobile validation
          [['w-f-mobile1', 'w-f-mobile1-ok'], ['w-f-mobile2', 'w-f-mobile2-ok']].forEach(([inp, ok]) => {
            const el = document.getElementById(inp), okEl = document.getElementById(ok);
            if (!el || !okEl) return;
            const check = () => {
              const v = el.value.trim();
              if (!v) { okEl.textContent = ''; return; }
              okEl.textContent = normMobile(v) ? '✓' : '✕';
              okEl.style.color = normMobile(v) ? 'var(--success)' : 'var(--danger)';
            };
            el.addEventListener('input', check);
            check();
          });
        } else {
          const s = w.student;
          const guardian = (s.father_name || '').trim() || (s.mother_name || '').trim() || (s.guardian_name || '').trim() || '—';
          body.innerHTML = `
            <div class="grid grid-2" style="grid-template-columns:1fr 1fr">
              <div>
                <div class="section-label">Student Details</div>
                ${rkv('Name', s.name)}${rkv('Admission No', s.admission_no)}${rkv('Class / Section', s.class + (s.section || ''))}
                ${rkv('Gender', s.gender === 'M' ? 'Male' : s.gender === 'F' ? 'Female' : '—')}${rkv('Date of Birth', s.dob || '—')}
                ${rkv('Religion', s.religion || '—')}${rkv('Caste', s.caste || '—')}${rkv('Address', s.address || '—')}
                ${rkv('Aadhaar No', s.aadhar_no || '—')}${rkv('PEN', s.pen || '—')}${rkv('Admission Date', s.admission_date || '—')}
              </div>
              <div>
                <div class="section-label">Parent / Guardian</div>
                ${rkv('Father', s.father_name || '—')}${rkv('Mother', s.mother_name || '—')}${rkv('Guardian', s.guardian_name || '—')}
                ${rkv('Occupation', s.occupation || '—')}${rkv('Mobile 1', s.mobile1 || '—')}${rkv('Mobile 2', s.mobile2 || '—')}
                <div class="section-label" style="margin-top:10px">Parent Login (auto-created)</div>
                <div style="font-size:.84rem;background:#f8fafc;border:1px solid #eef1f6;border-radius:8px;padding:10px">
                  <div>Guardian: <b>${esc(guardian)}</b></div>
                  <div style="margin-top:4px">Username: <span class="mono">${esc(s.admission_no)}</span></div>
                  <div>Password: <span class="mono">${esc(s.admission_no)}@123</span></div>
                  <div style="font-size:.76rem;color:var(--muted);margin-top:4px">Forced password change on first login</div>
                </div>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn" id="w-back2">← Back</button>
              <button class="btn btn-success" id="w-submit">${icon('check', 15)} Complete Admission</button>
            </div>`;
          body.querySelector('#w-back2').addEventListener('click', () => { w.step = 1; render(); });
          body.querySelector('#w-submit').addEventListener('click', async () => {
            const btn = body.querySelector('#w-submit');
            btn.disabled = true; btn.textContent = 'Admitting…';
            try {
              const res = await api.post('/api/students', { student: s });
              toast(`🎉 ${res.student.name} admitted — ${res.student.admission_no}`, 'success');
              if (res.defaultPassword) {
                loginCreds({ title: `${res.student.name} — Login Created`, username: res.student.admission_no, password: res.defaultPassword, roleLabel: 'Parent' });
              }
              wizard = { step: 1, student: {}, parent: {} };
              const d2 = await api.get('/api/admissions/overview');
              d.recent = d2.recent; d.stats = d2.stats;
              render();
            } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Complete Admission'; }
          });
        }
      }
      function g(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
      function rkv(k, v) { return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f2f6;font-size:.86rem"><span style="color:var(--muted)">${k}</span><span style="font-weight:600">${esc(v)}</span></div>`; }
      function validateStudentForm() {
        const val = (id) => document.getElementById(id).value.trim();
        if (!val('w-f-name')) return 'Name of the student is required';
        if (!val('w-f-admission')) return 'Admission number is required — it is given to the student at admission time';
        const m1 = normMobile(val('w-f-mobile1'));
        const m2 = val('w-f-mobile2') ? normMobile(val('w-f-mobile2')) : null;
        if (!m1 && !m2) return 'At least one valid 10-digit mobile number is required (with +91)';
        if (val('w-f-mobile2') && !m2) return 'Second mobile number must be a valid 10-digit number';
        const aad = val('w-f-aadhaar');
        if (aad && !/^\d{12}$/.test(aad)) return 'Aadhaar number must be exactly 12 digits';
        if (val('w-f-dob') && val('w-f-dob') > todayLocal()) return 'Date of birth cannot be in the future';
        return null;
      }
      function readFields() {
        const map = {
          name: 'w-f-name', admission_no: 'w-f-admission', class: 'w-f-class', section: 'w-f-section',
          gender: 'w-f-gender', dob: 'w-f-dob', religion: 'w-f-religion', caste: 'w-f-caste', address: 'w-f-address',
          aadhar_no: 'w-f-aadhaar', pen: 'w-f-pen', admission_date: 'w-f-admission-date',
          father_name: 'w-f-father', mother_name: 'w-f-mother', guardian_name: 'w-f-guardian',
          occupation: 'w-f-occupation', mobile1: 'w-f-mobile1', mobile2: 'w-f-mobile2'
        };
        const out = {};
        Object.keys(map).forEach(k => { out[k] = g(map[k]); });
        // normalize mobiles to +91 form
        const n1 = normMobile(out.mobile1), n2 = out.mobile2 ? normMobile(out.mobile2) : null;
        out.mobile1 = n1 ? '+91' + n1 : (out.mobile1 || '');
        out.mobile2 = n2 ? '+91' + n2 : (out.mobile2 || '');
        return out;
      }

      async function downloadTemplate() {
        try {
          const res = await fetch('/api/templates/students.csv', { headers: { Authorization: 'Bearer ' + api.state.token } });
          SMS.ui.downloadCSV('students_template.csv', await res.text());
          toast('Template downloaded', 'success');
        } catch (e) { toast(e.message, 'error'); }
      }

      async function importCSV(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          const resultEl = container.querySelector('#adm-import-result');
          resultEl.innerHTML = '<div class="loading-block" style="padding:16px"><div class="spinner"></div><div>Importing…</div></div>';
          try {
            const res = await api.post('/api/students/import', { csv: reader.result, createParentLogins: document.getElementById('adm-create-logins').checked });
            resultEl.innerHTML = `<div style="background:var(--success-050);border:1px solid color-mix(in srgb,var(--success),#fff 60%);color:var(--success);padding:12px;border-radius:8px;font-size:.88rem">
              ✅ <b>${res.created}</b> students imported${res.parentLogins ? ` · <b>${res.parentLogins}</b> parent logins created` : ''}${res.skipped ? ` · ${res.skipped} skipped` : ''}
              ${res.parentLogins ? '<div style="font-size:.78rem;margin-top:6px;color:var(--muted)">Parent login = <b>Admission Number</b> · Password = <b>AdmissionNo@123</b> (change on first login)</div>' : ''}
            </div>`;
            toast(`${res.created} students imported`, 'success');
            const d2 = await api.get('/api/admissions/overview');
            d.recent = d2.recent; d.stats = d2.stats;
            render();
          } catch (e) {
            resultEl.innerHTML = `<div style="background:var(--danger-050);color:var(--danger);padding:12px;border-radius:8px;font-size:.88rem">✕ ${esc(e.message)}</div>`;
          }
        };
        reader.readAsText(file);
      }

      render();
    });
  };
})();

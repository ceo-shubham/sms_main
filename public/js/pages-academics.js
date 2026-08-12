// pages-academics.js — Attendance, Exams & Marks, Results, Report Cards
'use strict';
window.SMS = window.SMS || {};
SMS.pages = SMS.pages || {};

(function () {
  const { esc, icon, fmtDate, fmtMoney, toast, openModal, confirmDialog, statCard, withLoading, attBadge, gradeColor } = SMS.ui;
  const api = SMS.api;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const gradeOf = (pct) => pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C+' : pct >= 40 ? 'C' : pct >= 33 ? 'D' : 'F';
  const remarkOf = (pct) => ({ 'A+': 'Outstanding', A: 'Excellent', 'B+': 'Very Good', B: 'Good', 'C+': 'Fair', C: 'Average', D: 'Below Average', F: 'Needs Improvement' }[gradeOf(pct)]);
  const GRADE_SCALE = [['A+', '90 – 100', 'Outstanding'], ['A', '80 – 89', 'Excellent'], ['B+', '70 – 79', 'Very Good'], ['B', '60 – 69', 'Good'], ['C+', '50 – 59', 'Fair'], ['C', '40 – 49', 'Average'], ['D', '33 – 39', 'Below Average'], ['F', 'Below 33', 'Needs Improvement']];

  // ================= ATTENDANCE =================
  SMS.pages.attendance = async function (container) {
    await withLoading(container, async () => {
      let state = { kind: 'student', date: today(), class: '', section: '', roster: [], counts: {}, classes: [], sections: [], locked: null };
      const isTeacher = api.state.user && api.state.user.role === 'teacher';

      const fetchRoster = async () => {
        const q = SMS.ui.qs({ date: state.date, kind: state.kind, class: state.class, section: state.section });
        const d = await api.get('/api/attendance/roster?' + q);
        state.roster = d.roster; state.counts = d.counts; state.classes = d.classes; state.sections = d.sections;
        state.locked = d.locked;
        if (d.locked) { state.class = d.locked.class; state.section = d.locked.section || ''; }
      };

      const render = async () => {
        await fetchRoster();
        const c = state.counts;
        const statuses = ['present', 'absent', 'late', 'leave'];
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Attendance</h2>
          <p style="color:var(--muted);margin-bottom:18px">Mark daily attendance for students and staff. Bulk save one class or the whole staff at once.</p>
          ${state.kind === 'student' && state.locked ? `<div style="background:color-mix(in srgb,var(--primary) 8%,#fff);border:1px solid color-mix(in srgb,var(--primary) 25%,#fff);border-radius:10px;padding:10px 14px;font-size:.86rem;margin-bottom:14px;display:flex;align-items:center;gap:10px">
            ${icon('lock', 16)} <b>Class Teacher</b> — you can only mark attendance for <b>Class ${esc(state.locked.class)}${state.locked.section ? '-' + esc(state.locked.section) : ''}</b>.
          </div>` : ''}
          <div class="card" style="margin-bottom:20px">
            <div class="toolbar" style="margin-bottom:0">
              <div class="seg">
                <button class="chip ${state.kind === 'student' ? 'active' : ''}" data-kind="student">${icon('users', 14)} Students</button>
                ${isTeacher ? '' : `<button class="chip ${state.kind === 'employee' ? 'active' : ''}" data-kind="employee">${icon('briefcase', 14)} Employees</button>`}
              </div>
              <input type="date" id="att-date" value="${state.date}" style="width:auto">
              ${state.kind === 'student' && !state.locked ? `
                <select id="att-class" style="width:auto"><option value="">All classes</option>${state.classes.map(x => `<option ${state.class === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
                <select id="att-section" style="width:auto"><option value="">All sections</option>${state.sections.map(x => `<option ${state.section === x ? 'selected' : ''}>${x}</option>`).join('')}</select>` : ''}
              ${state.kind === 'student' && state.locked ? `<div class="mono" style="font-size:.86rem;font-weight:700;color:var(--primary)">Class ${esc(state.locked.class)}${state.locked.section ? '-' + esc(state.locked.section) : ''}</div>` : ''}
              <div style="flex:1"></div>
              <button class="btn btn-sm" id="att-all-present">${icon('check', 14)} Mark All Present</button>
              <button class="btn btn-sm" id="att-all-absent">${icon('x', 14)} Mark All Absent</button>
              <button class="btn btn-primary" id="att-save">${icon('save', 14)} Save Attendance</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
              <span class="badge badge-success">Present: ${c.present}</span>
              <span class="badge badge-danger">Absent: ${c.absent}</span>
              <span class="badge badge-warning">Late: ${c.late}</span>
              <span class="badge badge-info">Leave: ${c.leave}</span>
              <span class="badge badge-gray">Unmarked: ${c.unmarked}</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr>
                ${state.kind === 'student' ? '<th>Roll</th><th>Name</th><th>Class</th><th>Admission No</th>' : '<th>Code</th><th>Name</th><th>Type</th><th>Designation</th>'}
                <th>Status</th>
              </tr></thead>
              <tbody id="att-body"></tbody>
            </table>
          </div>`;

        const body = container.querySelector('#att-body');
        if (!state.roster.length) {
          body.innerHTML = `<tr><td colspan="5"><div class="ta-empty"><div class="ta-icon">${icon('users', 28)}</div>No ${state.kind === 'student' ? 'students' : 'employees'} to mark.</div></td></tr>`;
        } else {
          body.innerHTML = state.roster.map(r => `
            <tr>
              ${state.kind === 'student' ? `<td>${r.roll_no || '—'}</td><td class="td-name">${esc(r.name)}</td><td>${esc(r.class)}${esc(r.section)}</td><td class="mono" style="font-size:.82rem">${esc(r.admission_no)}</td>`
                : `<td class="mono">${esc(r.code)}</td><td class="td-name">${esc(r.name)}</td><td><span class="badge badge-gray">${esc(r.type)}</span></td><td>${esc(r.designation || '—')}</td>`}
              <td style="width:170px">
                <select class="att-status" data-id="${r.ref_id}">
                  ${['', 'present', 'absent', 'late', 'leave'].map(s => `<option value="${s}" ${r.att === s ? 'selected' : ''}>${s === '' ? '— Mark —' : s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
                </select>
              </td>
            </tr>`).join('');
        }

        container.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
          state.kind = ch.dataset.kind; state.class = ''; state.section = ''; render();
        }));
        container.querySelector('#att-date').addEventListener('change', e => { state.date = e.target.value; render(); });
        const cls = container.querySelector('#att-class');
        if (cls) cls.addEventListener('change', e => { state.class = e.target.value; state.section = ''; render(); });
        const sec = container.querySelector('#att-section');
        if (sec) sec.addEventListener('change', e => { state.section = e.target.value; render(); });

        const setAll = (status) => {
          container.querySelectorAll('.att-status').forEach(sel => { sel.value = status; });
        };
        container.querySelector('#att-all-present').addEventListener('click', () => setAll('present'));
        container.querySelector('#att-all-absent').addEventListener('click', () => setAll('absent'));
        container.querySelector('#att-save').addEventListener('click', async () => {
          const records = state.roster.map(r => {
            const sel = container.querySelector(`.att-status[data-id="${r.ref_id}"]`);
            return { ref_id: r.ref_id, status: sel ? sel.value : null };
          }).filter(r => r.status);
          if (!records.length) { toast('Mark at least one person', 'warning'); return; }
          try {
            const res = await api.post('/api/attendance/save', { date: state.date, kind: state.kind, records });
            toast(`Saved ${res.saved} attendance records for ${fmtDate(state.date)}`, 'success');
            render();
          } catch (e) { toast(e.message, 'error'); }
        });
      };

      render();
    });
  };

  // ================= EXAMS =================
  SMS.pages.exams = async function (container) {
    await withLoading(container, async () => {
      const d = await api.get('/api/exams');
      let q = { search: '', type: '', status: '' };
      const todayStr = today();

      const render = () => {
        const list = d.exams.filter(e =>
          (!q.search || e.name.toLowerCase().includes(q.search.toLowerCase())) &&
          (!q.type || e.type === q.type) && (!q.status || e.exam_status === q.status));
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Exams &amp; Results</h2>
          <p style="color:var(--muted);margin-bottom:18px">Schedule exams, enter subject-wise marks and view results with automatic grade calculation.</p>
          <div class="grid grid-4" style="margin-bottom:20px">
            ${statCard('book', 'Total Exams', d.stats.total, 'scheduled', 'primary')}
            ${statCard('calendar', 'Upcoming', d.stats.upcoming, 'not started', 'info')}
            ${statCard('check', 'Completed', d.stats.completed, 'results available', 'success')}
            ${statCard('award', 'Marks Entries', d.stats.marksEntries, 'individual records', 'violet')}
          </div>
          <div class="toolbar">
            <div class="search-wrap grow">${icon('search')}<input id="ex-search" placeholder="Search exams…" value="${esc(q.search)}"></div>
            <select id="ex-type" class="filter-select"><option value="">All types</option>${d.types.map(t => `<option ${q.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <select id="ex-status" class="filter-select"><option value="">All status</option>
              <option value="upcoming" ${q.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
              <option value="ongoing" ${q.status === 'ongoing' ? 'selected' : ''}>Ongoing</option>
              <option value="completed" ${q.status === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
            <button class="btn btn-primary" id="ex-add">${icon('plus', 15)} Schedule Exam</button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Exam</th><th>Type</th><th>Class</th><th>Dates</th><th>Marks</th><th>Status</th><th>Entries</th><th></th></tr></thead>
              <tbody id="ex-body"></tbody>
            </table>
          </div>`;

        const body = container.querySelector('#ex-body');
        if (!list.length) {
          body.innerHTML = `<tr><td colspan="8"><div class="ta-empty"><div class="ta-icon">${icon('book', 30)}</div>No exams found.</div></td></tr>`;
        } else {
          const stBadge = { upcoming: ['badge-info', 'Upcoming'], ongoing: ['badge-warning', 'Ongoing'], completed: ['badge-success', 'Completed'] };
          body.innerHTML = list.map(e => {
            const [bc, bl] = stBadge[e.exam_status];
            return `<tr>
              <td class="td-name">${esc(e.name)}</td>
              <td><span class="badge badge-primary">${esc(e.type)}</span></td>
              <td>${esc(e.class)}${esc(e.section)}</td>
              <td style="font-size:.84rem">${fmtDate(e.start_date)} — ${fmtDate(e.end_date)}</td>
              <td>${e.total_marks}<span style="color:var(--muted-2)"> / pass ${e.passing_marks}</span></td>
              <td><span class="badge ${bc}">${bl}</span></td>
              <td>${e.marks_entries}</td>
              <td><div class="tbl-actions">
                <button class="icon-btn" data-marks="${e.id}" title="Enter Marks">${icon('edit', 16)}</button>
                <button class="icon-btn" data-results="${e.id}" title="Results">${icon('chart', 16)}</button>
                <button class="icon-btn" data-edit="${e.id}" title="Edit">${icon('gear', 15)}</button>
                <button class="icon-btn" data-del="${e.id}" title="Delete" style="color:var(--danger)">${icon('trash', 16)}</button>
              </div></td>
            </tr>`;
          }).join('');
        }

        container.querySelector('#ex-search').addEventListener('input', e => { q.search = e.target.value; render(); });
        container.querySelector('#ex-type').addEventListener('change', e => { q.type = e.target.value; render(); });
        container.querySelector('#ex-status').addEventListener('change', e => { q.status = e.target.value; render(); });
        container.querySelector('#ex-add').addEventListener('click', () => examModal(null, () => refresh()));
        body.querySelectorAll('[data-marks]').forEach(b => b.addEventListener('click', () => SMS.app.goto('#/exams/' + b.dataset.marks + '/marks')));
        body.querySelectorAll('[data-results]').forEach(b => b.addEventListener('click', () => SMS.app.goto('#/exams/' + b.dataset.results + '/results')));
        body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
          examModal(d.exams.find(x => x.id === Number(b.dataset.edit)), () => refresh());
        }));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          const e = d.exams.find(x => x.id === Number(b.dataset.del));
          if (await confirmDialog(`Delete <b>${esc(e.name)}</b> and all its marks entries?`, { danger: true, okText: 'Delete' })) {
            try { await api.del('/api/exams/' + e.id); toast('Exam deleted', 'success'); refresh(); }
            catch (err) { toast(err.message, 'error'); }
          }
        }));
      };

      async function refresh() { const d2 = await api.get('/api/exams'); d.exams = d2.exams; d.stats = d2.stats; render(); }

      render();
    });
  };

  function examModal(exam, onSaved) {
    const isNew = !exam;
    const e = exam || {};
    const m = openModal({
      title: isNew ? 'Schedule Exam' : 'Edit Exam',
      body: `
        <div class="form-grid">
          <div class="form-field" style="grid-column:span 2"><label>Exam Name *</label><input id="e-name" value="${esc(e.name || '')}" placeholder="e.g. Unit Test 2"></div>
          <div class="form-field"><label>Type</label><select id="e-type">${['Unit Test', 'Half Yearly', 'Annual', 'Pre-Board', 'Mock'].map(t => `<option ${e.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="form-field"><label>Class</label><select id="e-class">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(c => `<option ${e.class === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="form-field"><label>Section</label><input id="e-section" value="${esc(e.section || '')}" placeholder="e.g. A — leave blank for whole class"></div>
          <div class="form-field"><label>Start Date</label><input type="date" id="e-start" value="${esc(e.start_date || '')}"></div>
          <div class="form-field"><label>End Date</label><input type="date" id="e-end" value="${esc(e.end_date || '')}"></div>
          <div class="form-field"><label>Total Marks (per subject)</label><input type="number" id="e-total" value="${e.total_marks || 100}"></div>
          <div class="form-field"><label>Passing Marks</label><input type="number" id="e-pass" value="${e.passing_marks || 35}"></div>
        </div>`,
      footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="e-save">${isNew ? 'Create Exam' : 'Save'}</button>`,
    });
    m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
    m.el.querySelector('#e-save').addEventListener('click', async () => {
      const name = m.el.querySelector('#e-name').value.trim();
      if (!name) { toast('Exam name is required', 'error'); return; }
      const payload = {
        name, type: m.el.querySelector('#e-type').value, class: m.el.querySelector('#e-class').value,
        section: m.el.querySelector('#e-section').value, start_date: m.el.querySelector('#e-start').value,
        end_date: m.el.querySelector('#e-end').value, total_marks: Number(m.el.querySelector('#e-total').value),
        passing_marks: Number(m.el.querySelector('#e-pass').value)
      };
      try {
        if (isNew) { await api.post('/api/exams', payload); toast('Exam scheduled', 'success'); }
        else { await api.put('/api/exams/' + e.id, payload); toast('Exam updated', 'success'); }
        m.close(); if (onSaved) onSaved();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ================= MARKS ENTRY =================
  SMS.pages.examMarks = async function (container, id) {
    await withLoading(container, async () => {
      const d = await api.get(`/api/exams/${id}/marks`);
      const exam = d.exam;
      let subjectId = d.subjects[0] ? d.subjects[0].id : null;

      const render = () => {
        container.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap">
            <button class="icon-btn" onclick="location.hash='#/exams'">${icon('chevronLeft', 18)}</button>
            <div>
              <h2 style="margin:0">${esc(exam.name)} — Marks Entry</h2>
              <div class="card-sub" style="color:var(--muted);font-size:.86rem">Class ${esc(exam.class)}${esc(exam.section)} · Total ${exam.total_marks} · Passing ${exam.passing_marks} · ${fmtDate(exam.start_date)} to ${fmtDate(exam.end_date)}</div>
            </div>
            <div style="margin-left:auto;display:flex;gap:8px">
              <button class="btn" id="me-results">${icon('chart', 15)} View Results</button>
            </div>
          </div>
          <div class="tabs" style="margin-top:12px">
            ${d.subjects.map(s => `<button class="tab ${s.id === subjectId ? 'active' : ''}" data-sub="${s.id}">${esc(s.name)}</button>`).join('')}
          </div>
          <div class="card">
            <div class="card-head">
              <div><h3 class="card-title">${esc(d.subjects.find(s => s.id === subjectId)?.name || '')}</h3>
              <div class="card-sub">Marks out of ${exam.total_marks} — grade is calculated in real time</div></div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm" id="me-clear">Clear Unfilled</button>
                <button class="btn btn-primary" id="me-save">${icon('save', 14)} Save Subject Marks</button>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Roll</th><th>Name</th><th>Admission No</th><th style="width:120px">Marks</th><th>Grade</th><th>Remark</th></tr></thead>
                <tbody id="me-body"></tbody>
              </table>
            </div>
            <div style="margin-top:14px;font-size:.82rem;color:var(--muted)">Enter marks out of <b>${exam.total_marks}</b>. A value below ${exam.passing_marks} is marked as fail for that subject. Empty cells are left ungraded.</div>
          </div>`;

        const body = container.querySelector('#me-body');
        body.innerHTML = d.roster.map(s => {
          const val = (d.marks[subjectId] && d.marks[subjectId][s.id] != null) ? d.marks[subjectId][s.id] : '';
          return `<tr>
            <td>${s.roll_no || '—'}</td>
            <td class="td-name">${esc(s.name)}</td>
            <td class="mono" style="font-size:.82rem">${esc(s.admission_no)}</td>
            <td><input type="number" class="marks-input me-input" data-sid="${s.id}" value="${esc(val)}" min="0" max="${exam.total_marks}" step="any"></td>
            <td class="me-grade" style="font-weight:700">${val !== '' ? gradeBadge(val) : '—'}</td>
            <td class="me-remark" style="font-size:.82rem;color:var(--muted)">${val !== '' ? remarkOf(Number(val) / exam.total_marks * 100) : ''}</td>
          </tr>`;
        }).join('');

        container.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
          subjectId = Number(t.dataset.sub); render();
        }));
        container.querySelectorAll('.me-input').forEach(inp => inp.addEventListener('input', () => {
          const val = inp.value;
          const tr = inp.closest('tr');
          const grade = tr.querySelector('.me-grade');
          const remark = tr.querySelector('.me-remark');
          if (val === '') { grade.textContent = '—'; grade.style.color = ''; remark.textContent = ''; inp.classList.remove('good', 'bad'); }
          else {
            const pct = Number(val) / exam.total_marks * 100;
            grade.textContent = gradeOf(pct);
            grade.style.color = gradeColor(gradeOf(pct));
            remark.textContent = remarkOf(pct);
            inp.classList.toggle('good', pct >= exam.passing_marks / exam.total_marks * 100);
            inp.classList.toggle('bad', pct < exam.passing_marks / exam.total_marks * 100);
          }
        }));
        container.querySelector('#me-save').addEventListener('click', async () => {
          const rows = d.roster.map(s => {
            const inp = body.querySelector(`.me-input[data-sid="${s.id}"]`);
            return { student_id: s.id, marks: inp ? inp.value : '' };
          });
          try {
            await api.post(`/api/exams/${id}/marks`, { subject_id: subjectId, rows });
            toast('Marks saved', 'success');
          } catch (e) { toast(e.message, 'error'); }
        });
        container.querySelector('#me-clear').addEventListener('click', () => {
          container.querySelectorAll('.me-input').forEach(inp => { inp.value = ''; inp.classList.remove('good', 'bad'); });
          container.querySelectorAll('.me-grade').forEach(g => { g.textContent = '—'; g.style.color = ''; });
          container.querySelectorAll('.me-remark').forEach(r => r.textContent = '');
        });
        container.querySelector('#me-results').addEventListener('click', () => SMS.app.goto('#/exams/' + id + '/results'));
      };
      function gradeBadge(val) {
        const pct = Number(val) / exam.total_marks * 100;
        const g = gradeOf(pct);
        return `<span class="badge" style="background:${gradeColor(g)}22;color:${gradeColor(g)}">${g}</span>`;
      }
      render();
    });
  };

  // ================= RESULTS =================
  SMS.pages.examResults = async function (container, id) {
    await withLoading(container, async () => {
      const d = await api.get(`/api/exams/${id}/results`);
      const exam = d.exam;
      const cur = api.state.settings.academic.currency;

      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
          <button class="icon-btn" onclick="location.hash='#/exams'">${icon('chevronLeft', 18)}</button>
          <div>
            <h2 style="margin:0">${esc(exam.name)} — Results</h2>
            <div class="card-sub" style="color:var(--muted);font-size:.86rem">Class ${esc(exam.class)}${esc(exam.section)} · ${d.subjects.length} subjects · Max total ${d.maxTotal}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:8px">
            <button class="btn btn-primary" id="re-report">${icon('print', 15)} Report Cards</button>
          </div>
        </div>
        <div class="card">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Rank</th><th>Name</th><th>Roll</th>
                ${d.subjects.map(s => `<th>${esc(s.name)}</th>`).join('')}
                <th>Total</th><th>%</th><th>Grade</th><th>Result</th></tr></thead>
              <tbody>${d.results.map(r => {
                const passed = r.passed !== false;
                return `<tr>
                  <td><b>${r.rank ? '#' + r.rank : '—'}</b></td>
                  <td class="td-name">${esc(r.student.name)}</td>
                  <td>${r.student.roll_no || '—'}</td>
                  ${d.subjects.map(sub => {
                    const sm = r.subjectMarks.find(x => x.subject === sub.name);
                    if (sm == null || sm.marks == null) return '<td style="color:var(--muted-2)">—</td>';
                    const fail = sm.marks < exam.passing_marks;
                    return `<td style="${fail ? 'color:var(--danger);font-weight:600' : ''}">${sm.marks}${sm.marks != null ? `<span style="color:var(--muted-2);font-size:.72rem">/${exam.total_marks}</span>` : ''}</td>`;
                  }).join('')}
                  <td><b>${r.total}</b></td>
                  <td>${r.percentage}%</td>
                  <td style="font-weight:700;color:${gradeColor(r.grade)}">${r.grade}</td>
                  <td>${passed ? '<span class="badge badge-success">Pass</span>' : `<span class="badge badge-danger">Fail</span>`}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>`;
      container.querySelector('#re-report').addEventListener('click', () => SMS.app.goto('#/report-cards'));
    });
  };

  // ================= REPORT CARDS =================
  SMS.pages.reportCards = async function (container) {
    await withLoading(container, async () => {
      const exams = (await api.get('/api/exams?status=completed')).exams;
      const students = (await api.get('/api/students?status=active')).students;
      let studentId = students.length ? students[0].id : null;
      let examId = exams.length ? exams[0].id : null;
      let card = null;
      let school = null, academic = null;

      const fetchCard = async () => {
        if (!studentId || !examId) { card = null; return; }
        const d = await api.get(`/api/reportcard?student_id=${studentId}&exam_id=${examId}`);
        card = { ...d.card, exam: d.exam, maxTotal: d.maxTotal };
        school = d.school; academic = d.academic;
      };

      const render = async () => {
        await fetchCard();
        container.innerHTML = `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
            <div>
              <h2 style="margin:0">Report Cards</h2>
              <div class="card-sub" style="color:var(--muted);font-size:.86rem">Generate a printable report card for any student and exam</div>
            </div>
            <div style="margin-left:auto">
              <button class="btn btn-primary" id="rc-print" ${card ? '' : 'disabled'}>${icon('print', 15)} Print / Save PDF</button>
            </div>
          </div>
          <div class="card" style="margin-bottom:20px">
            <div class="form-grid" style="grid-template-columns:1fr 1fr">
              <div class="form-field"><label>Student</label>
                <select id="rc-student">${students.map(s => `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${esc(s.name)} (${esc(s.admission_no)})</option>`).join('')}</select>
              </div>
              <div class="form-field"><label>Exam</label>
                <select id="rc-exam">${exams.map(e => `<option value="${e.id}" ${e.id === examId ? 'selected' : ''}>${esc(e.name)} — Class ${esc(e.class)}${esc(e.section)}</option>`).join('')}</select>
              </div>
            </div>
            ${!exams.length ? '<p style="color:var(--muted)">No completed exams yet. Results will appear here once marks are entered.</p>' : ''}
          </div>
          <div class="print-area">${card ? renderCard() : '<div class="empty-state"><div class="es-icon">📄</div><h3>Select a student and exam</h3><p>Report cards are available once an exam is completed and marks are entered.</p></div>'}</div>`;

        container.querySelector('#rc-student').addEventListener('change', e => { studentId = Number(e.target.value); render(); });
        container.querySelector('#rc-exam').addEventListener('change', e => { examId = Number(e.target.value); render(); });
        container.querySelector('#rc-print').addEventListener('click', () => window.print());
      };

      function renderCard() {
        const c = card;
        const schoolName = school ? school.name : api.state.settings.school.name;
        const tagline = school ? school.tagline : '';
        const principal = school ? school.principal : api.state.settings.school.principal;
        const year = academic ? academic.academicYear : api.state.settings.academic.academicYear;
        return `
        <div class="report-card">
          <div class="rc-head">
            ${api.state.settings.school.logo ? `<img src="${api.state.settings.school.logo}" alt="School logo" style="width:64px;height:64px;object-fit:contain;margin-bottom:6px">` : ''}
            <div class="rc-school">${esc(schoolName)}</div>
            <div class="rc-tagline">${esc(tagline)}</div>
            <div class="rc-report">Report Card</div>
            <div style="font-size:.8rem;color:var(--muted)">${esc(academic ? academic.board : '')} · Academic Year ${esc(year)}</div>
          </div>
          <div class="rc-info">
            <div><span class="rc-label">Student:</span> <b>${esc(c.student.name)}</b></div>
            <div><span class="rc-label">Admission No:</span> ${esc(c.student.admission_no)}</div>
            <div><span class="rc-label">Class:</span> ${esc(c.student.class)}${esc(c.student.section)}</div>
            <div><span class="rc-label">Roll No:</span> ${c.student.roll_no || '—'}</div>
            <div><span class="rc-label">Exam:</span> ${esc(c.exam ? c.exam.name : '')}</div>
            <div><span class="rc-label">Exam Type:</span> ${esc(c.exam ? c.exam.type : '')}</div>
          </div>
          <table class="data" style="border:1px solid var(--border)">
            <thead><tr><th>Subject</th><th>Max Marks</th><th>Marks Obtained</th><th>Grade</th><th>Remarks</th></tr></thead>
            <tbody>
              ${c.subjectMarks.map(sm => `<tr>
                <td>${esc(sm.subject)}</td>
                <td>${c.exam ? c.exam.total_marks : ''}</td>
                <td style="font-weight:600">${sm.marks != null ? sm.marks : '—'}</td>
                <td style="color:${gradeColor(sm.grade)};font-weight:700">${sm.grade}</td>
                <td style="font-size:.84rem">${esc(sm.remark)}</td>
              </tr>`).join('')}
              <tr style="background:#f8fafc">
                <td colspan="2"><b>Total / Percentage</b></td>
                <td><b>${c.total}</b> / ${c.maxTotal}</td>
                <td><b>${c.percentage}%</b></td>
                <td></td>
              </tr>
              <tr>
                <td colspan="2"><b>Overall Grade</b></td>
                <td colspan="2" style="color:${gradeColor(c.grade)};font-weight:800;font-size:1.05rem">${c.grade}${c.rank ? ` · Class Rank #${c.rank}` : ''}</td>
                <td>${c.passed !== false ? '<span class="badge badge-success">PASS</span>' : '<span class="badge badge-danger">FAIL</span>'}</td>
              </tr>
            </tbody>
          </table>
          <div class="section-label">Grade Scale</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px 14px;font-size:.78rem">
            ${GRADE_SCALE.map(([g, r, d]) => `<div style="display:flex;gap:6px"><b style="color:${gradeColor(g)}">${g}</b><span style="color:var(--muted)">${r} — ${d}</span></div>`).join('')}
          </div>
          <div class="rc-sig">
            <div><div class="sig-line">Class Teacher</div></div>
            <div><div class="sig-line">${esc(principal || 'Principal')}</div></div>
            <div><div class="sig-line">Parent / Guardian</div></div>
          </div>
        </div>`;
      }

      render();
    });
  };

  SMS.pages.examMarksPage = SMS.pages.examMarks;
  SMS.pages.examResultsPage = SMS.pages.examResults;
})();

// pages-admin.js — Fees, Employees & Salaries, Notifications, Transport, Users
'use strict';
window.SMS = window.SMS || {};
SMS.pages = SMS.pages || {};

(function () {
  const { esc, icon, fmtDate, fmtMoney, toast, openModal, confirmDialog, statCard, withLoading, typeBadge, roleBadge, loginCreds } = SMS.ui;
  const api = SMS.api;
  const cur = () => api.state.settings.academic.currency;

  // ================= FEES =================
  SMS.pages.fees = async function (container) {
    await withLoading(container, async () => {
      const data = await api.get('/api/fees');
      const monthly = (await api.get('/api/fees/monthly-collection')).data;
      const payments = (await api.get('/api/payments?limit=15')).payments;
      let q = { search: '', status: 'all' };

      const render = () => {
        const list = data.fees.filter(f =>
          (!q.search || (f.name + f.admission_no).toLowerCase().includes(q.search.toLowerCase())) &&
          (q.status === 'all' || f.status === q.status));
        const stCls = { paid: 'badge-success', pending: 'badge-warning', overdue: 'badge-danger' };
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Fee Management</h2>
          <p style="color:var(--muted);margin-bottom:18px">Collect fees with discounts, track paid vs pending students and manage fee categories.</p>
          <div class="grid grid-4" style="margin-bottom:20px">
            ${statCard('wallet', 'Total Collected', fmtMoney(data.stats.totalCollected, cur()), 'all time', 'success')}
            ${statCard('check', 'Paid Students', data.stats.paidStudents, 'no outstanding balance', 'primary')}
            ${statCard('clock', 'Pending', data.stats.pendingStudents, 'balance due', 'warning')}
            ${statCard('alert', 'Overdue', data.stats.overdue, 'past due date', 'danger')}
          </div>
          <div class="grid grid-3">
            <div class="card span-2">
              <div class="card-head"><div><h3 class="card-title">Monthly Fee Collection</h3><div class="card-sub">Last 12 months</div></div></div>
              <div id="fee-chart" style="height:240px"></div>
            </div>
            <div class="card">
              <div class="card-head"><div><h3 class="card-title">Fee Categories</h3></div><button class="btn btn-sm" id="cat-add">${icon('plus', 13)} Add</button></div></div>
              <div id="fee-cats"></div>
            </div>
          </div>
          <div class="card" style="margin-top:20px">
            <div class="card-head">
              <div><h3 class="card-title">Students — Paid vs Pending</h3></div>
              <div style="display:flex;gap:8px">
                <div class="search-wrap" style="width:220px">${icon('search')}<input id="fee-search" placeholder="Search student…" value="${esc(q.search)}"></div>
                <select id="fee-status" class="filter-select">
                  <option value="all" ${q.status === 'all' ? 'selected' : ''}>All</option>
                  <option value="paid" ${q.status === 'paid' ? 'selected' : ''}>Paid</option>
                  <option value="pending" ${q.status === 'pending' ? 'selected' : ''}>Pending</option>
                  <option value="overdue" ${q.status === 'overdue' ? 'selected' : ''}>Overdue</option>
                </select>
              </div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Student</th><th>Class</th><th>Paid</th><th>Balance</th><th>Breakdown</th><th>Status</th><th></th></tr></thead>
                <tbody id="fee-body"></tbody>
              </table>
            </div>
          </div>
          <div class="card" style="margin-top:20px">
            <div class="card-head"><h3 class="card-title">Recent Payments</h3></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Receipt</th><th>Student</th><th>Amount</th><th>Mode</th><th>Date</th></tr></thead>
                <tbody>${payments.map(p => `<tr>
                  <td class="mono">${esc(p.receipt_no)}</td>
                  <td class="td-name">${esc(p.student_name || '—')}</td>
                  <td style="font-weight:600">${fmtMoney(p.amount, cur())}</td>
                  <td><span class="badge badge-gray" style="text-transform:capitalize">${esc(p.mode)}</span></td>
                  <td style="font-size:.84rem">${fmtDate(p.date)}</td>
                </tr>`).join('')}</tbody>
              </table>
            </div>
          </div>`;

        SMS.charts.barChart(document.getElementById('fee-chart'), monthly.map(m => ({ label: m.label, value: m.total })), { money: true, color: 'var(--success)' });

        const cats = data.categories;
        document.getElementById('fee-cats').innerHTML = cats.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #f0f2f6">
            <div>
              <div style="font-weight:600;font-size:.88rem">${esc(c.name)}</div>
              <div style="font-size:.76rem;color:var(--muted)">${fmtMoney(c.total_amount, cur())}${c.due_date ? ' · due ' + fmtDate(c.due_date) : ''}</div>
            </div>
            <div class="tbl-actions">
              <button class="icon-btn" data-cat-edit="${c.id}">${icon('edit', 14)}</button>
              <button class="icon-btn" data-cat-del="${c.id}" style="color:var(--danger)">${icon('trash', 14)}</button>
            </div>
          </div>`).join('') || '<p style="color:var(--muted)">No categories yet</p>';

        document.getElementById('cat-add').addEventListener('click', () => categoryModal(null, refresh));
        document.querySelectorAll('[data-cat-edit]').forEach(b => b.addEventListener('click', () => categoryModal(data.categories.find(c => c.id === Number(b.dataset.catEdit)), refresh)));
        document.querySelectorAll('[data-cat-del]').forEach(b => b.addEventListener('click', async () => {
          const c = data.categories.find(x => x.id === Number(b.dataset.catDel));
          if (await confirmDialog(`Delete fee category <b>${esc(c.name)}</b>?`, { danger: true, okText: 'Delete' })) {
            try { await api.del('/api/fee-categories/' + c.id); toast('Category deleted', 'success'); refresh(); }
            catch (e) { toast(e.message, 'error'); }
          }
        }));

        const body = container.querySelector('#fee-body');
        if (!list.length) {
          body.innerHTML = `<tr><td colspan="7"><div class="ta-empty"><div class="ta-icon">${icon('wallet', 28)}</div>No students found.</div></td></tr>`;
        } else {
          body.innerHTML = list.map(f => `
            <tr>
              <td><div class="td-name">${esc(f.name)}</div><div class="mono" style="font-size:.76rem;color:var(--muted)">${esc(f.admission_no)}</div></td>
              <td>${esc(f.class)}${esc(f.section)}</td>
              <td style="font-weight:600;color:var(--success)">${fmtMoney(f.paid, cur())}</td>
              <td style="font-weight:600;color:${f.balance > 0 ? 'var(--danger)' : 'var(--text)'}">${fmtMoney(f.balance, cur())}</td>
              <td style="min-width:150px">
                <div style="display:flex;flex-direction:column;gap:3px">
                  ${f.perCategory.map(c => `
                    <div style="display:flex;align-items:center;gap:6px;font-size:.72rem">
                      <span style="color:var(--muted);width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(c.name)}">${esc(c.name)}</span>
                      <div class="progress" style="flex:1;height:5px"><div style="width:${c.total ? Math.min(100, Math.round(c.paid / c.total * 100)) : 0}%"></div></div>
                      <span style="color:var(--muted-2);width:52px;text-align:right">${fmtMoney(c.paid, '')}</span>
                    </div>`).join('')}
                </div>
              </td>
              <td><span class="badge ${stCls[f.status]}">${f.status.charAt(0).toUpperCase() + f.status.slice(1)}</span></td>
              <td>${f.status !== 'paid' ? `<button class="btn btn-sm btn-primary" data-collect="${f.id}">${icon('money', 13)} Collect</button>` : ''}</td>
            </tr>`).join('');
        }
        body.querySelectorAll('[data-collect]').forEach(b => b.addEventListener('click', () => collectModal(list.find(f => f.id === Number(b.dataset.collect)), refresh)));

        container.querySelector('#fee-search').addEventListener('input', e => { q.search = e.target.value; render(); });
        container.querySelector('#fee-status').addEventListener('change', e => { q.status = e.target.value; render(); });
      };

      function categoryModal(cat, onSaved) {
        const c = cat || {};
        const m = openModal({
          title: c.id ? 'Edit Fee Category' : 'Add Fee Category',
          body: `
            <div class="form-grid">
              <div class="form-field" style="grid-column:span 2"><label>Category Name *</label><input id="c-name" value="${esc(c.name || '')}" placeholder="e.g. Transport Fee"></div>
              <div class="form-field"><label>Total Amount</label><input type="number" id="c-amount" value="${c.total_amount || ''}"></div>
              <div class="form-field"><label>Installments</label><input type="number" id="c-inst" value="${c.installments || 1}" min="1"></div>
              <div class="form-field" style="grid-column:span 2"><label>Due Date</label><input type="date" id="c-due" value="${esc(c.due_date || '')}"></div>
              <div class="form-field" style="grid-column:span 2"><label>Description</label><textarea id="c-desc">${esc(c.description || '')}</textarea></div>
            </div>`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="c-save">${c.id ? 'Save' : 'Add Category'}</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#c-save').addEventListener('click', async () => {
          const payload = {
            name: m.el.querySelector('#c-name').value.trim(), total_amount: Number(m.el.querySelector('#c-amount').value) || 0,
            installments: Number(m.el.querySelector('#c-inst').value) || 1, due_date: m.el.querySelector('#c-due').value,
            description: m.el.querySelector('#c-desc').value.trim()
          };
          if (!payload.name) { toast('Name is required', 'error'); return; }
          try {
            if (c.id) { await api.put('/api/fee-categories/' + c.id, payload); toast('Category updated', 'success'); }
            else { await api.post('/api/fee-categories', payload); toast('Category added', 'success'); }
            m.close(); if (onSaved) onSaved();
          } catch (e) { toast(e.message, 'error'); }
        });
      }

      function collectModal(student, onSaved) {
        const cats = data.categories;
        const m = openModal({
          title: `Collect Fee — ${esc(student.name)}`,
          body: `
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
              <span class="badge badge-primary">Balance: ${fmtMoney(student.balance, cur())}</span>
              <span class="badge badge-success">Paid: ${fmtMoney(student.paid, cur())}</span>
            </div>
            <div class="form-grid">
              <div class="form-field"><label>Fee Category</label>
                <select id="p-cat">${cats.map(c => `<option value="${c.id}">${esc(c.name)} — ${fmtMoney(c.total_amount, cur())}</option>`).join('')}</select></div>
              <div class="form-field"><label>Payment Mode</label>
                <select id="p-mode"><option value="cash">Cash</option><option value="online">Online</option><option value="cheque">Cheque</option><option value="dd">Demand Draft</option></select></div>
              <div class="form-field"><label>Amount Received</label><input type="number" id="p-amount" placeholder="0"></div>
              <div class="form-field"><label>Discount</label><input type="number" id="p-discount" value="0" min="0"></div>
              <div class="form-field" style="grid-column:span 2"><label>Date</label><input type="date" id="p-date" value="${todayStr()}"></div>
              <div class="form-field" style="grid-column:span 2"><label>Note</label><input id="p-note" placeholder="Optional remark"></div>
            </div>
            <div style="margin-top:10px;font-size:.84rem;color:var(--muted)">A unique receipt number will be generated automatically.</div>`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-success" id="p-save">${icon('check', 14)} Collect &amp; Generate Receipt</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#p-save').addEventListener('click', async () => {
          const payload = {
            student_id: student.id, category_id: Number(m.el.querySelector('#p-cat').value),
            amount: Number(m.el.querySelector('#p-amount').value) || 0, discount: Number(m.el.querySelector('#p-discount').value) || 0,
            mode: m.el.querySelector('#p-mode').value, note: m.el.querySelector('#p-note').value.trim(), date: m.el.querySelector('#p-date').value
          };
          if (!payload.amount) { toast('Enter an amount', 'error'); return; }
          try {
            const res = await api.post('/api/payments', payload);
            m.close();
            toast(`Payment recorded — Receipt ${res.payment.receipt_no}`, 'success');
            if (onSaved) onSaved();
          } catch (e) { toast(e.message, 'error'); }
        });
      }
      function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

      async function refresh() {
        const d2 = await api.get('/api/fees');
        data.fees = d2.fees; data.stats = d2.stats;
        const p2 = await api.get('/api/payments?limit=15');
        payments.length = 0; payments.push(...p2.payments);
        render();
      }

      render();
    });
  };

  // ================= EMPLOYEES =================
  SMS.pages.employees = async function (container) {
    await withLoading(container, async () => {
      const data = await api.get('/api/employees');
      let tab = 'list';
      let q = { search: '', type: 'all' };
      let salMonth = ''; { const d = new Date(); salMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

      const renderList = () => {
        const list = data.employees.filter(e =>
          (!q.search || (e.name + e.code + e.designation).toLowerCase().includes(q.search.toLowerCase())) &&
          (q.type === 'all' || (q.type === 'teachers' && e.type === 'teacher') || (q.type === 'staff' && ['staff', 'admin'].includes(e.type))));
        return `
          <div class="grid grid-4" style="margin-bottom:20px">
            ${statCard('briefcase', 'Total Employees', data.stats.total, 'on payroll', 'primary')}
            ${statCard('user', 'Teachers', data.stats.teachers, 'teaching staff', 'violet')}
            ${statCard('wallet', 'Salary Paid', fmtMoney(data.stats.salaryPaid, cur()), 'across all months', 'success')}
            ${statCard('clock', 'Pending Salaries', fmtMoney(data.stats.pending, cur()), 'not yet paid', 'warning')}
          </div>
          <div class="toolbar">
            <div class="search-wrap grow">${icon('search')}<input id="emp-search" placeholder="Search by name, code or designation…" value="${esc(q.search)}"></div>
            <select id="emp-type" class="filter-select">
              <option value="all" ${q.type === 'all' ? 'selected' : ''}>All employees</option>
              <option value="teachers" ${q.type === 'teachers' ? 'selected' : ''}>Teachers</option>
              <option value="staff" ${q.type === 'staff' ? 'selected' : ''}>Staff</option>
            </select>
            <button class="btn" id="emp-export">${icon('download', 15)} Export</button>
            <button class="btn btn-primary" id="emp-add">${icon('plus', 15)} Add Employee</button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Designation</th><th>Department</th><th>Phone</th><th>Salary</th><th></th></tr></thead>
              <tbody id="emp-body"></tbody>
            </table>
          </div>`;
      };

      const renderSalaries = () => {
        return `
          <div class="toolbar">
            <input type="month" id="sal-month" value="${salMonth}" style="width:auto">
            <div style="flex:1"></div>
            <button class="btn btn-sm" id="sal-refresh">${icon('refresh', 13)} Refresh</button>
          </div>
          <div id="sal-table"></div>`;
      };

      const renderImport = () => `
        <div class="grid grid-2" style="grid-template-columns:1fr 1fr;align-items:start">
          <div class="card" style="margin-top:0">
            <h3 class="card-title">Import Employees (CSV)</h3>
            <p style="font-size:.86rem;color:var(--muted)">Bulk import teachers and staff. Optionally auto-create login accounts for them.</p>
            <div style="display:flex;gap:8px;margin-bottom:12px">
              <button class="btn btn-sm" id="emp-template">${icon('download', 13)} Download Template</button>
            </div>
            <label class="switch" style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
              <input type="checkbox" id="emp-create-logins"><span class="slider"></span>
              <span style="font-size:.84rem;font-weight:600">Auto-create login accounts</span>
            </label>
            <div id="emp-file-zone" style="border:2px dashed var(--border-strong);border-radius:10px;padding:22px;text-align:center;cursor:pointer">
              <div style="font-size:1.8rem;margin-bottom:6px">${icon('upload', 28)}</div>
              <div style="font-weight:600;font-size:.9rem">Click to choose a CSV file</div>
              <input type="file" id="emp-file" accept=".csv,text/csv" hidden>
            </div>
            <div id="emp-import-result" style="margin-top:14px"></div>
          </div>
          <div class="card" style="margin-top:0">
            <h3 class="card-title">CSV Format</h3>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>Column</th><th>Required</th></tr></thead>
              <tbody>
                <tr><td>Name</td><td><span class="badge badge-danger">Yes</span></td></tr>
                <tr><td>Type</td><td>No — default "staff"</td></tr>
                <tr><td>Code, Designation, Department</td><td>No</td></tr>
                <tr><td>Phone, Email</td><td>No — used for login creation</td></tr>
                <tr><td>Salary, Join Date</td><td>No</td></tr>
              </tbody>
            </table></div>
            <p style="font-size:.8rem;color:var(--muted)">Type options: teacher, staff, admin, driver, guard, cleaner</p>
          </div>
        </div>`;

      const render = () => {
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Employee Management</h2>
          <p style="color:var(--muted);margin-bottom:18px">Manage teachers, staff, drivers, guards and cleaners along with their salaries.</p>
          <div class="tabs">
            <button class="tab ${tab === 'list' ? 'active' : ''}" data-tab="list">Employees</button>
            <button class="tab ${tab === 'salaries' ? 'active' : ''}" data-tab="salaries">Salary Management</button>
            <button class="tab ${tab === 'import' ? 'active' : ''}" data-tab="import">Bulk Import</button>
          </div>
          <div id="emp-tab-body"></div>`;
        container.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));
        const body = container.querySelector('#emp-tab-body');
        if (tab === 'list') {
          body.innerHTML = renderList();
          bindList();
        } else if (tab === 'salaries') {
          body.innerHTML = renderSalaries();
          loadSalaries();
        } else {
          body.innerHTML = renderImport();
          bindImport();
        }
      };

      function bindList() {
        const body = container.querySelector('#emp-body');
        const list = data.employees.filter(e =>
          (!q.search || (e.name + e.code + e.designation).toLowerCase().includes(q.search.toLowerCase())) &&
          (q.type === 'all' || (q.type === 'teachers' && e.type === 'teacher') || (q.type === 'staff' && ['staff', 'admin'].includes(e.type))));
        if (!list.length) {
          body.innerHTML = `<tr><td colspan="8"><div class="ta-empty"><div class="ta-icon">${icon('briefcase', 28)}</div>No employees found.</div></td></tr>`;
        } else {
          body.innerHTML = list.map(e => `<tr>
            <td class="mono">${esc(e.code)}</td>
            <td class="td-name">${esc(e.name)}</td>
            <td>${typeBadge(e.type)}</td>
            <td style="font-size:.86rem">${esc(e.designation || '—')}</td>
            <td style="font-size:.86rem">${esc(e.department || '—')}</td>
            <td style="font-size:.86rem">${esc(e.phone || '—')}</td>
            <td>${fmtMoney(e.salary, cur())}</td>
            <td><div class="tbl-actions">
              <button class="icon-btn" data-view="${e.id}" title="Profile">${icon('eye', 15)}</button>
              <button class="icon-btn" data-edit="${e.id}" title="Edit">${icon('edit', 15)}</button>
              <button class="icon-btn" data-del="${e.id}" title="Delete" style="color:var(--danger)">${icon('trash', 15)}</button>
            </div></td>
          </tr>`).join('');
        }
        container.querySelector('#emp-search').addEventListener('input', e => { q.search = e.target.value; bindList(); });
        container.querySelector('#emp-type').addEventListener('change', e => { q.type = e.target.value; bindList(); });
        container.querySelector('#emp-export').addEventListener('click', async () => {
          const res = await fetch('/api/employees/export/csv', { headers: { Authorization: 'Bearer ' + api.state.token } });
          SMS.ui.downloadCSV('employees.csv', await res.text());
          toast('Employees exported', 'success');
        });
        container.querySelector('#emp-add').addEventListener('click', () => employeeModal(null, refresh));
        body.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => employeeProfile(Number(b.dataset.view))));
        body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => employeeModal(data.employees.find(e => e.id === Number(b.dataset.edit)), refresh)));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          const e = data.employees.find(x => x.id === Number(b.dataset.del));
          if (await confirmDialog(`Remove <b>${esc(e.name)}</b>?`, { danger: true, okText: 'Remove' })) {
            try { await api.del('/api/employees/' + e.id); toast('Employee removed', 'success'); refresh(); }
            catch (err) { toast(err.message, 'error'); }
          }
        }));
      }

      async function loadSalaries() {
        const box = container.querySelector('#sal-table');
        box.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';
        try {
          const d = await api.get('/api/salaries?month=' + salMonth);
          box.innerHTML = `
            <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
              <span class="badge badge-success">Paid: ${d.stats.paidCount}</span>
              <span class="badge badge-warning">Pending: ${d.stats.pendingCount}</span>
              <span class="badge badge-primary">Total Net: ${fmtMoney(d.stats.paid + d.stats.pending, cur())}</span>
            </div>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>Net Salary</th><th>Status</th><th></th></tr></thead>
              <tbody>${d.salaries.map(s => `<tr>
                <td class="mono">${esc(s.code)}</td>
                <td class="td-name">${esc(s.name)}</td>
                <td><span class="badge badge-gray">${esc(s.type)}</span></td>
                <td>${fmtMoney(s.basic, cur())}</td>
                <td style="color:var(--success)">+${fmtMoney(s.allowances, cur())}</td>
                <td style="color:var(--danger)">−${fmtMoney(s.deductions, cur())}</td>
                <td style="font-weight:700">${fmtMoney(s.net, cur())}</td>
                <td>${s.status === 'paid' ? '<span class="badge badge-success">Paid</span>' : '<span class="badge badge-warning">Pending</span>'}</td>
                <td>${s.status === 'pending' ? `<button class="btn btn-sm btn-success" data-pay="${s.employee_id}">${icon('check', 13)} Mark Paid</button>` : ''}</td>
              </tr>`).join('')}</tbody>
            </table></div>`;
          box.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', async () => {
            try {
              await api.post('/api/salaries/pay', { employee_id: Number(b.dataset.pay), month: salMonth });
              toast('Salary marked as paid', 'success');
              loadSalaries();
            } catch (e) { toast(e.message, 'error'); }
          }));
        } catch (e) { box.innerHTML = `<p style="color:var(--danger)">${esc(e.message)}</p>`; }
        container.querySelector('#sal-month').addEventListener('change', e => { salMonth = e.target.value; loadSalaries(); });
      }

      function bindImport() {
        container.querySelector('#emp-template').addEventListener('click', async () => {
          const res = await fetch('/api/templates/employees.csv', { headers: { Authorization: 'Bearer ' + api.state.token } });
          SMS.ui.downloadCSV('employees_template.csv', await res.text());
        });
        const zone = container.querySelector('#emp-file-zone');
        const fileInput = container.querySelector('#emp-file');
        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => importCSV(fileInput.files[0]));
        ['dragover', 'drop'].forEach(ev => zone.addEventListener(ev, e => e.preventDefault()));
        zone.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) importCSV(f); });
      }

      async function importCSV(file) {
        const reader = new FileReader();
        reader.onload = async () => {
          const box = container.querySelector('#emp-import-result');
          box.innerHTML = '<div class="loading-block" style="padding:14px"><div class="spinner"></div></div>';
          try {
            const res = await api.post('/api/employees/import', { csv: reader.result, createLogins: document.getElementById('emp-create-logins').checked });
            box.innerHTML = `<div style="background:var(--success-050);color:var(--success);padding:12px;border-radius:8px;font-size:.88rem">✅ <b>${res.created}</b> employees imported${res.logins ? ` · <b>${res.logins}</b> logins created` : ''}${res.skipped ? ` · ${res.skipped} skipped` : ''}${res.logins ? '<div style="font-size:.78rem;margin-top:6px;color:var(--muted)">Login = <b>Employee Code</b> · Password = <b>Code@123</b> (change on first login)</div>' : ''}</div>`;
            toast(`${res.created} employees imported`, 'success');
            refresh();
          } catch (e) { box.innerHTML = `<div style="background:var(--danger-050);color:var(--danger);padding:12px;border-radius:8px">✕ ${esc(e.message)}</div>`; }
        };
        reader.readAsText(file);
      }

      function employeeModal(emp, onSaved) {
        const isNew = !emp;
        const e = emp || {};
        const m = openModal({
          title: isNew ? 'Add Employee' : `Edit — ${esc(e.name)}`,
          size: 'lg',
          body: `
            <div class="form-grid">
              <div class="form-field"><label>Full Name *</label><input id="e-name" value="${esc(e.name || '')}"></div>
              <div class="form-field"><label>Employee Code</label><input id="e-code" value="${esc(e.code || '')}" placeholder="Auto-generated"></div>
              <div class="form-field"><label>Type</label><select id="e-type">${['teacher', 'staff', 'admin', 'driver', 'guard', 'cleaner'].map(t => `<option ${e.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
              <div class="form-field"><label>Designation</label><input id="e-designation" value="${esc(e.designation || '')}"></div>
              <div class="form-field"><label>Department</label><input id="e-dept" value="${esc(e.department || '')}"></div>
              <div class="form-field"><label>Monthly Salary</label><input type="number" id="e-salary" value="${e.salary || ''}"></div>
              <div class="form-field"><label>Phone</label><input id="e-phone" value="${esc(e.phone || '')}"></div>
              <div class="form-field"><label>Email</label><input id="e-email" value="${esc(e.email || '')}"></div>
              <div class="form-field"><label>Join Date</label><input type="date" id="e-join" value="${esc(e.join_date || '')}"></div>
              <div class="form-field"><label>Status</label><select id="e-status"><option value="active" ${e.status !== 'inactive' ? 'selected' : ''}>Active</option><option value="inactive" ${e.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></div>
              <div class="form-field"><label>Class Teacher — Class</label><select id="e-home-class"><option value="">— None —</option>${['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(c => `<option value="${c}" ${e.home_class === c ? 'selected' : ''}>Class ${c}</option>`).join('')}</select><div class="form-hint">Only class teachers can mark attendance for their own class</div></div>
              <div class="form-field"><label>Class Teacher — Section</label><input id="e-home-section" value="${esc(e.home_section || '')}" placeholder="e.g. A — type any section"><div class="form-hint">Leave blank if not a class teacher</div></div>
              <div class="form-field" style="grid-column:span 2"><label>Address</label><input id="e-address" value="${esc(e.address || '')}"></div>
            </div>`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="e-save">${isNew ? 'Add Employee' : 'Save Changes'}</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#e-save').addEventListener('click', async () => {
          const g = (id) => m.el.querySelector(id).value.trim();
          const name = g('#e-name');
          if (!name) { toast('Name is required', 'error'); return; }
          const payload = {
            name, code: g('#e-code'), type: g('#e-type'), designation: g('#e-designation'), department: g('#e-dept'),
            salary: Number(g('#e-salary')) || 0, phone: g('#e-phone'), email: g('#e-email'), join_date: g('#e-join'),
            address: g('#e-address'), status: g('#e-status'),
            home_class: g('#e-home-class'), home_section: g('#e-home-section')
          };
          try {
            if (isNew) {
              const res = await api.post('/api/employees', payload);
              toast('Employee added', 'success');
              if (res.defaultPassword) {
                loginCreds({ title: `${res.employee.name} — Login Created`, username: res.employee.code, password: res.defaultPassword, roleLabel: res.employee.type === 'teacher' ? 'Teacher' : 'Staff' });
              }
            } else { await api.put('/api/employees/' + e.id, payload); toast('Employee updated', 'success'); }
            m.close(); if (onSaved) onSaved();
          } catch (err) { toast(err.message, 'error'); }
        });
      }

      async function employeeProfile(id) {
        const d = await api.get('/api/employees/' + id);
        const e = d.employee;
        const m = openModal({
          title: `${esc(e.name)} — ${esc(e.code)}`,
          size: 'lg',
          body: `
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px;flex-wrap:wrap">
              <div class="user-avatar" style="width:56px;height:56px;font-size:1.3rem;background:var(--violet)">${esc((e.name || '?')[0])}</div>
              <div>
                <div style="font-size:1.1rem;font-weight:700">${esc(e.name)}</div>
                <div style="color:var(--muted)">${typeBadge(e.type)} ${esc(e.designation || '')} · ${esc(e.department || '')}</div>
              </div>
              ${d.login ? `<div style="margin-left:auto">${roleBadge(d.login.role)} <span class="mono" style="font-size:.8rem;color:var(--muted)">@${esc(d.login.username)}</span></div>` : ''}
            </div>
            <div class="grid grid-2">
              <div>
                <div class="section-label">Contact</div>
                ${kv('Phone', e.phone || '—')}${kv('Email', e.email || '—')}${kv('Address', e.address || '—')}
                <div class="section-label">Employment</div>
                ${kv('Joined', fmtDate(e.join_date))}${kv('Monthly Salary', fmtMoney(e.salary, cur()))}
                ${e.home_class ? kv('Class Teacher', `Class ${esc(e.home_class)}${e.home_section ? '-' + esc(e.home_section) : ''}`) : ''}
              </div>
              <div>
                <div class="section-label">Salary History</div>
                ${d.salaries.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Month</th><th>Net</th><th>Status</th></tr></thead>
                  <tbody>${d.salaries.map(s => `<tr><td class="mono">${esc(s.month)}</td><td>${fmtMoney(s.net, cur())}</td><td>${s.status === 'paid' ? '<span class="badge badge-success">Paid</span>' : '<span class="badge badge-warning">Pending</span>'}</td></tr>`).join('')}</tbody></table></div>`
                  : '<p style="color:var(--muted)">No salary records yet</p>'}
              </div>
            </div>`,
          footer: `<button class="btn" data-close>Close</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
      }
      function kv(k, v) { return `<div style="display:flex;justify-content:space-between;gap:14px;padding:6px 0;border-bottom:1px solid #f0f2f6;font-size:.88rem"><span style="color:var(--muted)">${k}</span><span style="font-weight:500">${v}</span></div>`; }

      async function refresh() {
        const d2 = await api.get('/api/employees');
        data.employees = d2.employees; data.stats = d2.stats;
        render();
      }

      render();
    });
  };

  // ================= STAFF / TEACHER / DRIVER ENTRY =================
  SMS.pages.staffEntry = async function (container) {
    await withLoading(container, async () => {
      const today = new Date().toISOString().slice(0, 10);
      const KINDS = [
        { id: 'staff', icon: 'user', label: 'Staff', desc: 'Office & non-teaching staff' },
        { id: 'teacher', icon: 'book', label: 'Teacher', desc: 'Teaching staff' },
        { id: 'driver', icon: 'bus', label: 'Driver', desc: 'Bus / vehicle driver' },
        { id: 'conductor', icon: 'bus', label: 'Conductor', desc: 'Bus conductor / attendant' },
      ];
      let kind = 'staff';
      let busy = false;

      const typeFields = (k) => {
        let extra = '';
        if (k === 'teacher') {
          extra = `
            <div class="form-field"><label>Highest Qualification <span class="req">*</span></label><input id="e-qual" placeholder="e.g. M.Sc., B.Ed"></div>
            <div class="form-field"><label>Core Subject <span class="req">*</span></label><input id="e-subject" placeholder="e.g. Mathematics"></div>`;
        } else if (k === 'driver' || k === 'conductor') {
          extra = `
            <div class="form-field" style="grid-column:span 2"><label>Driving Licence ${k === 'driver' ? '<span class="req">*</span>' : ''}</label><input id="e-license" placeholder="e.g. MH12 2014 0123456"><div class="form-hint">${k === 'driver' ? 'Required for drivers' : 'Optional for conductors'}</div></div>`;
        }
        return extra;
      };

      const formHtml = (k) => `
        <div class="card" style="margin-top:0">
          <div class="card-head"><div><h3 class="card-title">${KINDS.find(x => x.id === k).label} Details</h3><div class="card-sub">Fill the details below — fields marked <span class="req">*</span> are mandatory</div></div></div>
          <div class="entry-form-note">${icon('info', 15)} A login account is created automatically (username = employee code, password = <b>code@123</b>) and must be changed on first login.</div>
          <div class="form-grid">
            <div class="form-field"><label>Date of Joining</label><input type="date" id="e-join" value="${today}"><div class="form-hint">Auto-filled with today's date — you can change it</div></div>
            <div class="form-field"><label>Full Name <span class="req">*</span></label><input id="e-name" placeholder="Enter full name"></div>
            <div class="form-field"><label>Relation <span class="req">*</span></label><select id="e-relation"><option value="">Choose…</option><option>Father</option><option>Mother</option><option>Husband</option></select></div>
            <div class="form-field"><label>Father / Mother / Husband Name <span class="req">*</span></label><input id="e-guardian" placeholder="Enter name"><div class="form-hint">Any one of them is mandatory</div></div>
            <div class="form-field"><label>Unique ID <span class="req">*</span></label><input id="e-uid" placeholder="e.g. STF-101"><div class="form-hint">Must be unique — no two employees can share it</div></div>
            <div class="form-field"><label>Monthly Salary <span class="req">*</span></label><input type="number" id="e-salary" min="0" placeholder="e.g. 15000"></div>
            <div class="form-field" style="grid-column:span 2"><label>Address <span class="req">*</span></label><textarea id="e-address" rows="2" placeholder="Full residential address"></textarea></div>
            <div class="form-field"><label>Mobile Number <span class="req">*</span></label><input type="tel" id="e-phone" placeholder="10-digit mobile number"></div>
            <div class="form-field"><label>Email ID</label><input type="email" id="e-email" placeholder="Optional"></div>
            <div class="form-field"><label>Aadhaar Number</label><input id="e-aadhar" inputmode="numeric" maxlength="12" placeholder="12-digit Aadhaar"><div class="form-hint">Either Aadhaar or PAN is required</div></div>
            <div class="form-field"><label>PAN Number</label><input id="e-pan" maxlength="10" placeholder="e.g. ABCDE1234F" style="text-transform:uppercase"><div class="form-hint">Either Aadhaar or PAN is required</div></div>
            ${typeFields(k)}
          </div>
          <div style="display:flex;gap:10px;margin-top:18px;align-items:center">
            <button class="btn btn-primary" id="entry-save">${icon('plus', 15)} Add ${KINDS.find(x => x.id === k).label}</button>
            <button class="btn" id="entry-reset">${icon('refresh', 14)} Clear</button>
          </div>
        </div>`;

      const render = () => {
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Staff / Teacher / Driver Entry</h2>
          <p style="color:var(--muted);margin-bottom:18px">Choose who you want to add, then fill in the details — the form changes based on your choice.</p>
          <div class="entry-kinds">
            ${KINDS.map(x => `
              <button class="entry-kind ${kind === x.id ? 'active' : ''}" data-kind="${x.id}">
                <div class="ek-icon">${icon(x.icon, 20)}</div>
                <div class="ek-label">${x.label}</div>
                <div class="ek-desc">${x.desc}</div>
              </button>`).join('')}
          </div>
          <div id="entry-form"></div>`;
        container.querySelectorAll('.entry-kind').forEach(b => b.addEventListener('click', () => {
          kind = b.dataset.kind;
          render();
        }));
        const box = container.querySelector('#entry-form');
        box.innerHTML = formHtml(kind);
        bindForm(box);
      };

      function bindForm(box) {
        const g = (id) => { const el = box.querySelector('#' + id); return el ? el.value.trim() : ''; };
        const set = (id, val) => { const el = box.querySelector('#' + id); if (el) el.value = val; };

        box.querySelector('#entry-reset').addEventListener('click', () => {
          const join = g('e-join') || today;
          box.innerHTML = formHtml(kind);
          set('e-join', join);
          bindForm(box);
        });

        box.querySelector('#entry-save').addEventListener('click', async () => {
          if (busy) return;
          const errs = [];
          const name = g('e-name');
          const guardian = g('e-guardian');
          const relation = g('e-relation');
          const uid = g('e-uid');
          const salary = g('e-salary');
          const address = g('e-address');
          const phone = g('e-phone').replace(/\D/g, '');
          const email = g('e-email');
          const aadhar = g('e-aadhar');
          const pan = g('e-pan').toUpperCase();

          if (!name) errs.push('Full name is required');
          if (!guardian) errs.push('Father / Mother / Husband name is required');
          if (!relation) errs.push('Please choose the relation (Father / Mother / Husband)');
          if (!uid) errs.push('Unique ID is required');
          if (salary === '' || isNaN(Number(salary)) || Number(salary) < 0) errs.push('Monthly salary is required');
          if (!address) errs.push('Address is required');
          if (phone.length !== 10) errs.push('Enter a valid 10-digit mobile number');
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push('Email address is not valid');
          if (aadhar && !/^\d{12}$/.test(aadhar)) errs.push('Aadhaar number must be exactly 12 digits');
          if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) errs.push('PAN number is not valid (e.g. ABCDE1234F)');
          if (!aadhar && !pan) errs.push('Either Aadhaar number or PAN number is required');
          if (kind === 'teacher') {
            if (!g('e-qual')) errs.push('Highest Qualification is required');
            if (!g('e-subject')) errs.push('Core subject is required');
          }
          if (kind === 'driver' && !g('e-license')) errs.push('Driving licence is required for drivers');

          if (errs.length) {
            toast(errs[0], 'error');
            return;
          }

          const payload = {
            entry_form: true,
            type: kind,
            name,
            join_date: g('e-join') || today,
            guardian_name: guardian,
            guardian_relation: relation,
            unique_id: uid,
            salary: Number(salary),
            address,
            phone: g('e-phone'),
            email,
            aadhar_no: aadhar,
            pan_no: pan,
            highest_qualification: g('e-qual'),
            core_subject: g('e-subject'),
            driving_license: g('e-license'),
          };

          busy = true;
          const btn = box.querySelector('#entry-save');
          btn.disabled = true; btn.textContent = 'Adding…';
          try {
            const res = await api.post('/api/employees', payload);
            const k = KINDS.find(x => x.id === kind);
            toast(`${res.employee.name} added as ${k.label}`, 'success');
            box.innerHTML = formHtml(kind);
            bindForm(box);
            if (res.defaultPassword) {
              loginCreds({ title: `${res.employee.name} — Login Created`, username: res.employee.code, password: res.defaultPassword, roleLabel: k.label });
            }
          } catch (e) {
            toast(e.message, 'error');
          } finally {
            busy = false;
          }
        });
      }

      render();
    });
  };

  // ================= NOTIFICATIONS =================
  SMS.pages.notifications = async function (container) {
    await withLoading(container, async () => {
      const isAdmin = api.state.user.role === 'admin';
      let filter = 'all';
      let list = [];

      const load = async () => {
        const d = await api.get('/api/notifications?filter=' + filter);
        list = d.notifications;
        return d.unreadCount;
      };

      const render = async () => {
        await load();
        const typeCls = { info: 'badge-info', warning: 'badge-warning', success: 'badge-success', urgent: 'badge-danger' };
        const audLabel = { all: 'All users', parents: 'Parents', teachers: 'Teachers', staff: 'Staff' };
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Notifications</h2>
          <p style="color:var(--muted);margin-bottom:18px">Broadcast announcements to everyone, or target parents, teachers and staff specifically.</p>
          <div class="grid grid-2" style="grid-template-columns:1.2fr 1fr;align-items:start">
            <div class="card">
              <div class="card-head"><h3 class="card-title">Send Notification</h3></div>
              <div class="form-field"><label>Title</label><input id="n-title" placeholder="e.g. Sports Day Schedule"></div>
              <div class="form-field" style="margin-top:12px"><label>Message</label><textarea id="n-msg" placeholder="Write your announcement here…"></textarea></div>
              <div class="form-grid" style="margin-top:12px">
                <div class="form-field"><label>Type</label>
                  <select id="n-type"><option value="info">Info</option><option value="warning">Warning</option><option value="success">Success</option><option value="urgent">Urgent</option></select></div>
                <div class="form-field"><label>Audience</label>
                  <select id="n-aud"><option value="all">All users</option><option value="parents">Parents only</option><option value="teachers">Teachers only</option><option value="staff">Staff only</option></select></div>
              </div>
              <div class="form-actions">
                <button class="btn btn-sm btn-primary-soft" data-quick="all">${icon('send', 13)} All Users</button>
                <button class="btn btn-sm btn-primary-soft" data-quick="parents">${icon('send', 13)} Parents</button>
                <button class="btn btn-sm btn-primary-soft" data-quick="teachers">${icon('send', 13)} Teachers</button>
                <button class="btn btn-sm btn-primary-soft" data-quick="staff">${icon('send', 13)} Staff</button>
                <button class="btn btn-primary" id="n-send">${icon('send', 14)} Send</button>
              </div>
            </div>
            <div class="card">
              <div class="card-head">
                <div><h3 class="card-title">All Notifications</h3></div>
                <div style="display:flex;gap:6px">
                  <button class="chip ${filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                  <button class="chip ${filter === 'unread' ? 'active' : ''}" data-filter="unread">Unread</button>
                  <button class="btn btn-sm" id="n-read-all">Mark all read</button>
                </div>
              </div>
              <div id="n-list"></div>
            </div>
          </div>`;

        const nlist = container.querySelector('#n-list');
        if (!list.length) {
          nlist.innerHTML = `<div class="empty-state" style="padding:30px 10px"><div class="es-icon">${icon('bell', 30)}</div><h3>No ${filter === 'unread' ? 'unread ' : ''}notifications</h3><p>You're all caught up!</p></div>`;
        } else {
          nlist.innerHTML = list.map(n => `
            <div style="display:flex;gap:12px;padding:12px;border-radius:10px;margin-bottom:8px;cursor:pointer;${n.read ? 'background:transparent;border:1px solid var(--border)' : 'background:var(--primary-050);border:1px solid color-mix(in srgb,var(--primary),#fff 80%)'}" data-nid="${n.id}">
              <span class="badge ${typeCls[n.type]}" style="align-self:flex-start">${n.type}</span>
              <div style="flex:1;min-width:0">
                <div style="display:flex;justify-content:space-between;gap:8px">
                  <b style="font-size:.92rem">${esc(n.title)}</b>
                  <span style="font-size:.74rem;color:var(--muted-2);white-space:nowrap">${SMS.ui.timeAgo(n.created_at)}</span>
                </div>
                <div style="font-size:.84rem;color:var(--muted);margin-top:2px">${esc(n.message)}</div>
                <div style="font-size:.74rem;color:var(--muted-2);margin-top:6px">
                  ${audLabel[n.audience] || n.audience}${n.creator_name ? ' · by ' + esc(n.creator_name) : ''}
                  ${!n.read ? '<span class="badge badge-primary" style="margin-left:8px">New</span>' : ''}
                </div>
              </div>
              ${isAdmin ? `<div style="display:flex;flex-direction:column;gap:4px">
                <button class="icon-btn" data-nedit="${n.id}" title="Edit">${icon('edit', 14)}</button>
                <button class="icon-btn" data-ndel="${n.id}" title="Delete" style="color:var(--danger)">${icon('trash', 14)}</button>
              </div>` : ''}
            </div>`).join('');
        }

        container.querySelectorAll('.chip[data-filter]').forEach(ch => ch.addEventListener('click', () => { filter = ch.dataset.filter; render(); }));
        container.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => {
          container.querySelector('#n-aud').value = b.dataset.quick;
        }));
        container.querySelector('#n-send').addEventListener('click', send);
        container.querySelector('#n-read-all').addEventListener('click', async () => {
          try { await api.post('/api/notifications/read-all'); toast('All marked as read', 'success'); SMS.app.refreshNotifBadge(); render(); }
          catch (e) { toast(e.message, 'error'); }
        });
        nlist.querySelectorAll('[data-nid]').forEach(d => d.addEventListener('click', async () => {
          const n = list.find(x => x.id === Number(d.dataset.nid));
          if (!n.read) { try { await api.post(`/api/notifications/${n.id}/read`); SMS.app.refreshNotifBadge(); } catch (e) {} }
        }));
        nlist.querySelectorAll('[data-ndel]').forEach(b => b.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const n = list.find(x => x.id === Number(b.dataset.ndel));
          if (await confirmDialog(`Delete notification <b>${esc(n.title)}</b>?`, { danger: true, okText: 'Delete' })) {
            try { await api.del('/api/notifications/' + n.id); toast('Notification deleted', 'success'); render(); }
            catch (e) { toast(e.message, 'error'); }
          }
        }));
        nlist.querySelectorAll('[data-nedit]').forEach(b => b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          editModal(list.find(x => x.id === Number(b.dataset.nedit)));
        }));
      };

      async function send(ev, overrides) {
        const title = (overrides && overrides.title) || container.querySelector('#n-title').value.trim();
        const msg = (overrides && overrides.message) || container.querySelector('#n-msg').value.trim();
        const type = (overrides && overrides.type) || container.querySelector('#n-type').value;
        const audience = (overrides && overrides.audience) || container.querySelector('#n-aud').value;
        if (!title || !msg) { toast('Title and message are required', 'error'); return; }
        try {
          await api.post('/api/notifications', { title, message: msg, type, audience });
          toast('Notification sent', 'success');
          container.querySelector('#n-title').value = '';
          container.querySelector('#n-msg').value = '';
          SMS.app.refreshNotifBadge();
          render();
        } catch (e) { toast(e.message, 'error'); }
      }

      function editModal(n) {
        const m = openModal({
          title: 'Edit Notification',
          body: `
            <div class="form-field"><label>Title</label><input id="ne-title" value="${esc(n.title)}"></div>
            <div class="form-field" style="margin-top:12px"><label>Message</label><textarea id="ne-msg">${esc(n.message)}</textarea></div>
            <div class="form-grid" style="margin-top:12px">
              <div class="form-field"><label>Type</label><select id="ne-type">${['info', 'warning', 'success', 'urgent'].map(t => `<option ${n.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
              <div class="form-field"><label>Audience</label><select id="ne-aud">${['all', 'parents', 'teachers', 'staff'].map(t => `<option ${n.audience === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            </div>`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ne-save">Save Changes</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#ne-save').addEventListener('click', async () => {
          try {
            await api.put('/api/notifications/' + n.id, {
              title: m.el.querySelector('#ne-title').value.trim(), message: m.el.querySelector('#ne-msg').value.trim(),
              type: m.el.querySelector('#ne-type').value, audience: m.el.querySelector('#ne-aud').value
            });
            toast('Notification updated', 'success'); m.close(); render();
          } catch (e) { toast(e.message, 'error'); }
        });
      }

      render();
    });
  };

  // ================= TRANSPORT =================
  SMS.pages.transport = async function (container) {
    await withLoading(container, async () => {
      const data = await api.get('/api/routes');
      const drivers = (await api.get('/api/drivers')).drivers;

      const render = () => {
        container.innerHTML = `
          <h2 style="margin-bottom:4px">Transport</h2>
          <p style="color:var(--muted);margin-bottom:18px">Manage bus routes, assign drivers and see which students travel on each route.</p>
          <div class="grid grid-4" style="margin-bottom:20px">
            ${statCard('route', 'Total Routes', data.stats.totalRoutes, 'active routes', 'primary')}
            ${statCard('bus', 'Total Capacity', data.stats.totalCapacity, 'seats available', 'info')}
            ${statCard('users', 'Students on Bus', data.stats.studentsOnBus, 'assigned students', 'success')}
            ${statCard('user', 'Drivers', data.stats.drivers, 'on the team', 'warning')}
          </div>
          <div class="toolbar">
            <div style="flex:1"></div>
            <button class="btn btn-primary" id="rt-add">${icon('plus', 15)} Add Route</button>
          </div>
          <div class="grid grid-3" id="rt-grid"></div>`;

        const grid = container.querySelector('#rt-grid');
        if (!data.routes.length) {
          grid.innerHTML = `<div class="card" style="grid-column:span 3"><div class="empty-state"><div class="es-icon">${icon('bus', 32)}</div><h3>No bus routes yet</h3><p>Add your first route to start assigning students.</p></div></div>`;
        } else {
          grid.innerHTML = data.routes.map(r => `
            <div class="card" style="display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div><b style="font-size:1.05rem">Route ${esc(r.route_no)}</b>
                  <div class="mono" style="font-size:.78rem;color:var(--muted)">${esc(r.vehicle_no || 'No vehicle')}</div>
                </div>
                <div class="tbl-actions">
                  <button class="icon-btn" data-edit="${r.id}">${icon('edit', 15)}</button>
                  <button class="icon-btn" data-del="${r.id}" style="color:var(--danger)">${icon('trash', 15)}</button>
                </div>
              </div>
              <div>
                <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:5px">
                  <span style="color:var(--muted)">Occupancy</span>
                  <b>${r.students_count}/${r.capacity}</b>
                </div>
                <div class="progress"><div style="width:${r.capacity ? Math.min(100, Math.round(r.students_count / r.capacity * 100)) : 0}%"></div></div>
              </div>
              <div style="font-size:.84rem">💵 <b>${fmtMoney(r.monthly_fee, cur())}</b><span style="color:var(--muted)">/month</span></div>
              ${r.driver_name ? `<div style="display:flex;gap:9px;align-items:center;background:var(--bg);padding:9px 11px;border-radius:9px">
                <div class="user-avatar" style="width:30px;height:30px;font-size:.78rem;background:var(--warning)">${esc(r.driver_name[0])}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:.84rem">${esc(r.driver_name)}</div>
                  <div style="font-size:.76rem;color:var(--muted)">${icon('phone', 11)} ${esc(r.driver_phone || 'No phone')}</div>
                </div>
              </div>` : '<div style="font-size:.8rem;color:var(--muted)">No driver assigned</div>'}
              <button class="btn btn-sm btn-primary-soft" data-view="${r.id}">View Stops &amp; Students →</button>
            </div>`).join('');
        }

        container.querySelector('#rt-add').addEventListener('click', () => routeModal(null, refresh));
        grid.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => routeDetail(Number(b.dataset.view))));
        grid.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => routeModal(data.routes.find(r => r.id === Number(b.dataset.edit)), refresh)));
        grid.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          const r = data.routes.find(x => x.id === Number(b.dataset.del));
          if (await confirmDialog(`Delete route <b>${esc(r.route_no)}</b>? Students will be unassigned.`, { danger: true, okText: 'Delete' })) {
            try { await api.del('/api/routes/' + r.id); toast('Route deleted', 'success'); refresh(); }
            catch (e) { toast(e.message, 'error'); }
          }
        }));
      };

      function routeModal(route, onSaved) {
        const isNew = !route;
        const r = route || { stops: [] };
        const stops = r.stops && r.stops.length ? r.stops : [{ place: '', time: '' }];
        const m = openModal({
          title: isNew ? 'Add Bus Route' : `Edit Route ${esc(r.route_no)}`,
          size: 'lg',
          body: `
            <div class="form-grid">
              <div class="form-field"><label>Route Number *</label><input id="r-no" value="${esc(r.route_no || '')}" placeholder="e.g. R-04"></div>
              <div class="form-field"><label>Vehicle Number</label><input id="r-vehicle" value="${esc(r.vehicle_no || '')}"></div>
              <div class="form-field"><label>Capacity</label><input type="number" id="r-capacity" value="${r.capacity || 40}"></div>
              <div class="form-field"><label>Monthly Fee</label><input type="number" id="r-fee" value="${r.monthly_fee || ''}"></div>
              <div class="form-field" style="grid-column:span 2"><label>Driver</label>
                <select id="r-driver"><option value="">— No driver —</option>${drivers.map(d => `<option value="${d.id}" ${r.driver_id === d.id ? 'selected' : ''}>${esc(d.name)} (${esc(d.code)})</option>`).join('')}</select>
              </div>
            </div>
            <div class="section-label">Route Stops</div>
            <div id="stops-list"></div>
            <button class="btn btn-sm" id="stop-add" style="margin-top:8px">${icon('plus', 13)} Add Stop</button>`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="r-save">${isNew ? 'Create Route' : 'Save'}</button>`,
        });
        const stopsBox = m.el.querySelector('#stops-list');
        const renderStops = () => {
          stopsBox.innerHTML = stops.map((s, i) => `
            <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
              <span class="mono" style="color:var(--muted-2);font-size:.8rem">${i + 1}.</span>
              <input placeholder="Stop place" class="stop-place" value="${esc(s.place)}" style="flex:1">
              <input type="time" class="stop-time" value="${esc(s.time)}" style="width:110px">
              <button class="icon-btn stop-del" ${stops.length === 1 ? 'disabled' : ''} style="color:var(--danger)">${icon('x', 15)}</button>
            </div>`).join('');
          stopsBox.querySelectorAll('.stop-del').forEach(b => b.addEventListener('click', () => {
            if (stops.length === 1) return;
            stops.splice([...stopsBox.querySelectorAll('.stop-del')].indexOf(b), 1);
            renderStops();
          }));
        };
        renderStops();
        m.el.querySelector('#stop-add').addEventListener('click', () => { stops.push({ place: '', time: '' }); renderStops(); });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#r-save').addEventListener('click', async () => {
          const no = m.el.querySelector('#r-no').value.trim();
          if (!no) { toast('Route number is required', 'error'); return; }
          const stopsOut = stops.map((s, i) => ({
            place: (m.el.querySelectorAll('.stop-place')[i] || {}).value || '',
            time: (m.el.querySelectorAll('.stop-time')[i] || {}).value || ''
          })).filter(s => s.place);
          const payload = {
            route_no: no, vehicle_no: m.el.querySelector('#r-vehicle').value.trim(),
            capacity: Number(m.el.querySelector('#r-capacity').value) || 0, monthly_fee: Number(m.el.querySelector('#r-fee').value) || 0,
            driver_id: m.el.querySelector('#r-driver').value || null, stops: stopsOut
          };
          try {
            if (isNew) { await api.post('/api/routes', payload); toast('Route created', 'success'); }
            else { await api.put('/api/routes/' + r.id, payload); toast('Route updated', 'success'); }
            m.close(); if (onSaved) onSaved();
          } catch (e) { toast(e.message, 'error'); }
        });
      }

      async function routeDetail(id) {
        const d = await api.get('/api/routes/' + id);
        const r = d.route;
        const m = openModal({
          title: `Route ${esc(r.route_no)} — ${esc(r.vehicle_no)}`,
          size: 'lg',
          body: `
            ${r.driver_name ? `<div style="display:flex;gap:12px;align-items:center;background:var(--bg);padding:12px 14px;border-radius:10px;margin-bottom:16px">
              <div class="user-avatar" style="width:40px;height:40px;background:var(--warning)">${esc(r.driver_name[0])}</div>
              <div>
                <div style="font-weight:700">${esc(r.driver_name)} <span class="mono" style="font-size:.76rem;color:var(--muted)">${esc(r.driver_code || '')}</span></div>
                <div style="font-size:.84rem;color:var(--muted)">${icon('phone', 12)} ${esc(r.driver_phone || '—')} ${r.driver_email ? ' · ' + esc(r.driver_email) : ''}</div>
              </div>
              <div style="margin-left:auto;text-align:right;font-size:.84rem">
                <div style="color:var(--muted)">Fee</div><b>${fmtMoney(r.monthly_fee, cur())}/mo</b>
              </div>
            </div>` : '<p style="color:var(--muted)">No driver assigned to this route.</p>'}
            <div class="section-label">Route Stops</div>
            <div style="display:flex;flex-direction:column;gap:0">
              ${r.stops.map((s, i) => `<div style="display:flex;gap:10px;align-items:center;padding:6px 0">
                <div style="width:14px;height:14px;border-radius:50%;border:2px solid var(--primary);background:#fff;flex-shrink:0"></div>
                ${i < r.stops.length - 1 ? '<div style="position:relative;left:-9px;width:2px;height:22px;background:var(--primary-100)"></div>' : ''}
                <div style="flex:1">${esc(s.place)}</div>
                <b class="mono">${esc(s.time)}</b>
              </div>`).join('')}
            </div>
            <div class="section-label">Students Assigned (${d.students.length})</div>
            ${d.students.length ? `<div class="table-wrap"><table class="data">
              <thead><tr><th>Name</th><th>Admission No</th><th>Class</th><th></th></tr></thead>
              <tbody>${d.students.map(s => `<tr>
                <td class="td-name">${esc(s.name)}</td><td class="mono" style="font-size:.8rem">${esc(s.admission_no)}</td><td>${esc(s.class)}${esc(s.section)}</td>
                <td><button class="btn btn-sm btn-danger" data-unassign="${s.id}">${icon('x', 13)} Unassign</button></td>
              </tr>`).join('')}</tbody>
            </table></div>` : '<p style="color:var(--muted)">No students assigned yet.</p>'}
            ${d.unassigned.length ? `<div class="form-field" style="margin-top:16px"><label>Assign a student to this route</label>
              <div style="display:flex;gap:8px"><select id="rt-assign"><option value="">Select student…</option>${d.unassigned.map(s => `<option value="${s.id}">${esc(s.name)} — Class ${esc(s.class)}${esc(s.section)}</option>`).join('')}</select>
              <button class="btn btn-primary" id="rt-assign-btn">Assign</button></div></div>` : ''}`,
          footer: `<button class="btn" data-close>Close</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelectorAll('[data-unassign]').forEach(b => b.addEventListener('click', async () => {
          try { await api.post(`/api/routes/${r.id}/assign`, { unassign: Number(b.dataset.unassign) }); toast('Student unassigned', 'success'); m.close(); refresh(); }
          catch (e) { toast(e.message, 'error'); }
        }));
        const btn = m.el.querySelector('#rt-assign-btn');
        if (btn) btn.addEventListener('click', async () => {
          const sid = m.el.querySelector('#rt-assign').value;
          if (!sid) { toast('Select a student', 'warning'); return; }
          try { await api.post(`/api/routes/${r.id}/assign`, { student_id: Number(sid) }); toast('Student assigned', 'success'); m.close(); refresh(); }
          catch (e) { toast(e.message, 'error'); }
        });
      }

      async function refresh() {
        const d2 = await api.get('/api/routes');
        data.routes = d2.routes; data.stats = d2.stats;
        render();
      }

      render();
    });
  };

  // ================= USERS =================
  SMS.pages.users = async function (container) {
    await withLoading(container, async () => {
      const data = await api.get('/api/users');
      const links = await api.get('/api/users/link-options');
      let role = '';

      const render = () => {
        const list = data.users.filter(u => !role || u.role === role);
        container.innerHTML = `
          <h2 style="margin-bottom:4px">User Management</h2>
          <p style="color:var(--muted);margin-bottom:18px">Create login accounts, control roles and access, and reset passwords.</p>
          <div class="grid grid-5" style="grid-template-columns:repeat(5,1fr);margin-bottom:20px">
            ${statCard('users', 'Total Users', data.stats.total, 'accounts', 'primary')}
            ${statCard('key', 'Admins', data.stats.admins, 'full access', 'violet')}
            ${statCard('user', 'Teachers', data.stats.teachers, 'teaching accounts', 'info')}
            ${statCard('heart', 'Parents', data.stats.parents, 'portal accounts', 'success')}
            ${statCard('briefcase', 'Managers', data.stats.managers, 'management', 'warning')}
          </div>
          <div class="toolbar">
            <select id="u-role" class="filter-select">
              <option value="">All roles</option>
              <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="teacher" ${role === 'teacher' ? 'selected' : ''}>Teacher</option>
              <option value="manager" ${role === 'manager' ? 'selected' : ''}>Manager</option>
              <option value="staff" ${role === 'staff' ? 'selected' : ''}>Staff</option>
              <option value="parent" ${role === 'parent' ? 'selected' : ''}>Parent</option>
            </select>
            <button class="btn btn-sm" id="u-import">${icon('upload', 14)} Import CSV</button>
            <div style="flex:1"></div>
            <button class="btn btn-primary" id="u-add">${icon('plus', 15)} Create User</button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Username</th><th>Role</th><th>Linked To</th><th>Status</th><th>Last Login</th><th>Force Change</th><th></th></tr></thead>
              <tbody id="u-body"></tbody>
            </table>
          </div>`;

        const body = container.querySelector('#u-body');
        body.innerHTML = list.map(u => `
          <tr>
            <td><span class="mono">${esc(u.username)}</span>
              <button class="icon-btn" data-copy="${u.email || u.username}" title="Copy email/username" style="color:var(--muted-2)">${icon('copy', 13)}</button>
            </td>
            <td>${roleBadge(u.role)}</td>
            <td style="font-size:.86rem">${esc(u.linked_name || '—')}</td>
            <td>${u.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-gray">Deactivated</span>'}</td>
            <td style="font-size:.84rem">${u.last_login ? fmtDate(u.last_login) : 'Never'}</td>
            <td>${u.force_password_change ? '<span class="badge badge-warning">Yes</span>' : '<span class="badge badge-gray">No</span>'}</td>
            <td><div class="tbl-actions">
              <button class="icon-btn" data-reset="${u.id}" title="Reset password">${icon('key', 15)}</button>
              <button class="icon-btn" data-edit="${u.id}" title="Edit">${icon('edit', 15)}</button>
              <button class="icon-btn" data-toggle="${u.id}" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}" style="color:${u.status === 'active' ? 'var(--warning)' : 'var(--success)'}">${icon(u.status === 'active' ? 'x' : 'check', 15)}</button>
              <button class="icon-btn" data-del="${u.id}" title="Delete" style="color:var(--danger)">${icon('trash', 15)}</button>
            </div></td>
          </tr>`).join('') || `<tr><td colspan="7"><div class="ta-empty"><div class="ta-icon">${icon('users', 28)}</div>No users found.</div></td></tr>`;

        container.querySelector('#u-role').addEventListener('change', e => { role = e.target.value; render(); });
        container.querySelector('#u-add').addEventListener('click', () => userModal(null, refresh));
        container.querySelector('#u-import').addEventListener('click', () => userImport());
        body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied to clipboard', 'success'); }
          catch (e) { toast('Copy failed', 'error'); }
        }));
        body.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
          const u = data.users.find(x => x.id === Number(b.dataset.reset));
          resetPasswordModal(u, refresh);
        }));
        body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => userModal(data.users.find(x => x.id === Number(b.dataset.edit)), refresh)));
        body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
          const u = data.users.find(x => x.id === Number(b.dataset.toggle));
          const action = u.status === 'active' ? 'deactivate' : 'activate';
          if (await confirmDialog(`${action === 'deactivate' ? 'Deactivate' : 'Activate'} <b>${esc(u.username)}</b>?`, { okText: action === 'deactivate' ? 'Deactivate' : 'Activate' })) {
            try { await api.put('/api/users/' + u.id, { status: u.status === 'active' ? 'deactivated' : 'active' }); toast(`User ${action}d`, 'success'); refresh(); }
            catch (e) { toast(e.message, 'error'); }
          }
        }));
        body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
          const u = data.users.find(x => x.id === Number(b.dataset.del));
          if (await confirmDialog(`Delete user <b>${esc(u.username)}</b>?`, { danger: true, okText: 'Delete' })) {
            try { await api.del('/api/users/' + u.id); toast('User deleted', 'success'); refresh(); }
            catch (e) { toast(e.message, 'error'); }
          }
        }));
      };

      function resetPasswordModal(u, onSaved) {
        const m = openModal({
          title: `Reset Password — ${esc(u.username)}`,
          body: `
            <p style="font-size:.86rem;color:var(--muted);margin:0 0 14px">Set a new password for <b>${esc(u.username)}</b>. Leave blank to use the default: <span class="mono">${esc(u.username)}@123</span></p>
            <div class="form-field"><label>New Password</label>
              <div class="input-group">
                <input type="password" id="rp-new" placeholder="Leave blank for default" minlength="6">
                <button type="button" class="eye-btn" id="rp-eye" title="Show / hide"></button>
              </div>
              <div class="form-hint">No old password needed — this works on any account.</div>
            </div>`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="rp-save">Reset Password</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        const eyeBtn = m.el.querySelector('#rp-eye');
        eyeBtn.innerHTML = icon('eye', 18);
        eyeBtn.addEventListener('click', () => {
          const inp = m.el.querySelector('#rp-new');
          const show = inp.type === 'password';
          inp.type = show ? 'text' : 'password';
          eyeBtn.innerHTML = icon(show ? 'eyeOff' : 'eye', 18);
        });
        m.el.querySelector('#rp-save').addEventListener('click', async () => {
          const pass = m.el.querySelector('#rp-new').value.trim();
          if (pass && pass.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
          try {
            const res = await api.post('/api/users/' + u.id + '/reset-password', { password: pass || null });
            m.close();
            showTempPassword(res.username, res.tempPassword, true);
            toast('Password reset', 'success'); onSaved();
          } catch (e) { toast(e.message, 'error'); }
        });
      }

      function showTempPassword(username, pass, isReset) {
        const m = openModal({
          title: isReset ? 'Password Reset' : 'User Created',
          body: `
            <div style="text-align:center;padding:8px 0 14px">
              <div style="font-size:2.4rem;margin-bottom:8px">🔑</div>
              <p style="margin:0 0 4px">${isReset ? 'Password has been reset for' : 'User account created for'} <b>${esc(username)}</b></p>
              <p style="color:var(--muted);font-size:.86rem;margin:0 0 14px">Temporary password (force change on first login):</p>
              <div class="mono" style="background:var(--bg);border:1px dashed var(--border-strong);border-radius:10px;padding:14px;font-size:1.15rem;font-weight:700;letter-spacing:.05em">${esc(pass)}</div>
              <button class="btn btn-sm" id="tp-copy" style="margin-top:12px">${icon('copy', 13)} Copy password</button>
            </div>`,
          footer: `<button class="btn btn-primary" data-close>Done</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#tp-copy').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(pass); toast('Copied', 'success'); } catch (e) {}
        });
      }

      function userModal(u, onSaved) {
        const isNew = !u;
        const employees = links.employees, parents = links.parents;
        const m = openModal({
          title: isNew ? 'Create User Account' : `Edit — ${esc(u.username)}`,
          size: 'lg',
          body: `
            <div class="form-grid">
              <div class="form-field"><label>Username *</label><input id="u-name" value="${esc(u ? u.username : '')}" ${isNew ? '' : 'disabled'}></div>
              <div class="form-field"><label>Role *</label>
                <select id="u-role2">${['admin', 'teacher', 'manager', 'staff', 'parent'].map(r => `<option ${u && u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
              </div>
              <div class="form-field"><label>Link Type</label>
                <select id="u-ltype"><option value="">— None —</option><option value="employee" ${u && u.linked_type === 'employee' ? 'selected' : ''}>Employee</option><option value="parent" ${u && u.linked_type === 'parent' ? 'selected' : ''}>Parent</option></select></div>
              <div class="form-field"><label>Link Record</label><select id="u-lid"></select></div>
              <div class="form-field"><label>Status</label>
                <select id="u-status"><option value="active" ${!u || u.status === 'active' ? 'selected' : ''}>Active</option><option value="deactivated" ${u && u.status === 'deactivated' ? 'selected' : ''}>Deactivated</option></select></div>
              <div class="form-field"><label>Force Password Change on Login</label>
                <select id="u-force"><option value="1">Yes</option><option value="0" ${u && !u.force_password_change ? 'selected' : ''}>No</option></select></div>
            </div>
            ${isNew ? '<p style="font-size:.84rem;color:var(--muted);margin-top:12px">A temporary password will be auto-generated. The user must change it on first login.</p>' : ''}`,
          footer: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="u-save">${isNew ? 'Create User' : 'Save Changes'}</button>`,
        });
        const ltypeSel = m.el.querySelector('#u-ltype');
        const lidSel = m.el.querySelector('#u-lid');
        const renderLinks = () => {
          const t = ltypeSel.value;
          const opts = t === 'employee' ? employees.map(e => `<option value="${e.id}" ${u && u.linked_type === 'employee' && u.linked_id === e.id ? 'selected' : ''}>${esc(e.name)} (${esc(e.code)})</option>`)
            : t === 'parent' ? parents.map(p => `<option value="${p.id}" ${u && u.linked_type === 'parent' && u.linked_id === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.phone)})</option>`) : [];
          lidSel.innerHTML = '<option value="">— Select —</option>' + opts.join('');
        };
        renderLinks();
        ltypeSel.addEventListener('change', renderLinks);
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#u-save').addEventListener('click', async () => {
          const username = m.el.querySelector('#u-name').value.trim();
          const role = m.el.querySelector('#u-role2').value;
          if (!username || !role) { toast('Username and role required', 'error'); return; }
          const payload = {
            username, role, linked_type: ltypeSel.value || null, linked_id: lidSel.value || null,
            status: m.el.querySelector('#u-status').value
          };
          try {
            if (isNew) {
              const res = await api.post('/api/users', payload);
              m.close();
              showTempPassword(res.user.username, res.tempPassword, false);
              toast('User created', 'success');
            } else {
              payload.force = Number(m.el.querySelector('#u-force').value);
              await api.put('/api/users/' + u.id, payload);
              m.close(); toast('User updated', 'success');
            }
            if (onSaved) onSaved();
          } catch (e) { toast(e.message, 'error'); }
        });
      }

      function userImport() {
        const m = openModal({
          title: 'Bulk Import Users (CSV)',
          body: `
            <p style="font-size:.86rem;color:var(--muted)">Columns: <b>Username, Role, Linked Type, Linked Code</b>. Roles: admin, teacher, manager, staff, parent.</p>
            <button class="btn btn-sm" id="ui-template" style="margin-bottom:12px">${icon('download', 13)} Download Template</button>
            <div id="ui-zone" style="border:2px dashed var(--border-strong);border-radius:10px;padding:22px;text-align:center;cursor:pointer">
              <div style="font-size:1.7rem;margin-bottom:6px">${icon('upload', 26)}</div>
              <div style="font-weight:600;font-size:.88rem">Choose a CSV file</div>
              <input type="file" id="ui-file" accept=".csv,text/csv" hidden>
            </div>
            <div id="ui-result" style="margin-top:14px"></div>`,
          footer: `<button class="btn" data-close>Close</button>`,
        });
        m.el.querySelector('[data-close]').addEventListener('click', () => m.close());
        m.el.querySelector('#ui-template').addEventListener('click', async () => {
          const res = await fetch('/api/templates/users.csv', { headers: { Authorization: 'Bearer ' + api.state.token } });
          SMS.ui.downloadCSV('users_template.csv', await res.text());
        });
        const zone = m.el.querySelector('#ui-zone');
        const fileInput = m.el.querySelector('#ui-file');
        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => go(fileInput.files[0]));
        ['dragover', 'drop'].forEach(ev => zone.addEventListener(ev, e => e.preventDefault()));
        zone.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) go(f); });
        function go(file) {
          const reader = new FileReader();
          reader.onload = async () => {
            const box = m.el.querySelector('#ui-result');
            box.innerHTML = '<div class="loading-block" style="padding:14px"><div class="spinner"></div></div>';
            try {
              const res = await api.post('/api/users/import', { csv: reader.result });
              box.innerHTML = `<div style="background:var(--success-050);color:var(--success);padding:12px;border-radius:8px;font-size:.88rem">✅ <b>${res.created}</b> users created${res.skipped ? ` · ${res.skipped} skipped` : ''}</div>`;
              toast(`${res.created} users imported`, 'success');
              refresh();
            } catch (e) { box.innerHTML = `<div style="background:var(--danger-050);color:var(--danger);padding:12px;border-radius:8px">✕ ${esc(e.message)}</div>`; }
          };
          reader.readAsText(file);
        }
      }

      async function refresh() {
        const d2 = await api.get('/api/users');
        data.users = d2.users; data.stats = d2.stats;
        render();
      }

      render();
    });
  };
})();

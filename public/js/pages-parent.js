// pages-parent.js — Parent Portal
'use strict';
window.SMS = window.SMS || {};
SMS.pages = SMS.pages || {};

(function () {
  const { esc, icon, fmtDate, fmtMoney, toast, withLoading, attBadge, gradeColor } = SMS.ui;
  const api = SMS.api;
  const cur = () => api.state.settings.academic.currency;

  SMS.pages.parent = async function (container) {
    await withLoading(container, async () => {
      const d = await api.get('/api/parent/overview');
      let childId = d.children.length ? d.children[0].id : null;
      let tab = 'overview';

      const renderOverview = (c) => `
        <div class="card" style="margin-bottom:20px">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div class="user-avatar" style="width:58px;height:58px;font-size:1.4rem;background:var(--primary)">${esc((c.name || '?')[0])}</div>
            <div style="flex:1;min-width:200px">
              <div style="font-size:1.15rem;font-weight:700">${esc(c.name)}</div>
              <div style="color:var(--muted);font-size:.86rem">Class ${esc(c.class)}${esc(c.section)} · <span class="mono">${esc(c.admission_no)}</span></div>
            </div>
            <div style="text-align:center;padding:0 18px;border-left:1px solid var(--border)">
              <div style="font-size:.74rem;color:var(--muted)">Today</div>
              <div style="margin-top:4px">${c.todayStatus ? attBadge(c.todayStatus) : '<span class="badge badge-gray">Not marked</span>'}</div>
            </div>
            <div style="text-align:center;padding:0 18px;border-left:1px solid var(--border)">
              <div style="font-size:.74rem;color:var(--muted)">Attendance</div>
              <div style="font-size:1.3rem;font-weight:800;color:${c.attendancePct < 75 ? 'var(--danger)' : c.attendancePct < 90 ? 'var(--warning)' : 'var(--success)'}">${c.attendancePct}%</div>
            </div>
            <div style="text-align:center;padding:0 18px;border-left:1px solid var(--border)">
              <div style="font-size:.74rem;color:var(--muted)">Fees</div>
              <div style="font-size:.92rem;font-weight:700;color:${c.feesBalance > 0 ? 'var(--warning)' : 'var(--success)'}">${fmtMoney(c.feesPaid, cur())}</div>
              <div style="font-size:.72rem;color:var(--muted-2)">balance ${fmtMoney(c.feesBalance, cur())}</div>
            </div>
            ${c.route_no ? `<div style="text-align:center;padding:0 18px;border-left:1px solid var(--border)">
              <div style="font-size:.74rem;color:var(--muted)">Transport</div>
              <div style="font-weight:700;font-size:.92rem">${esc(c.route_no)}</div>
              <div style="font-size:.72rem;color:var(--muted-2)">${esc(c.vehicle_no)}</div>
            </div>` : ''}
          </div>
          ${c.attendancePct < 75 ? `<div style="margin-top:14px;background:var(--danger-050);color:var(--danger);padding:10px 14px;border-radius:8px;font-size:.86rem">
            ⚠️ Attendance below 75% — please contact the school office to discuss your child's attendance.</div>` : ''}
        </div>
        <div class="tabs">
          <button class="tab ${tab === 'attendance' ? 'active' : ''}" data-tab="attendance">Attendance</button>
          <button class="tab ${tab === 'fees' ? 'active' : ''}" data-tab="fees">Fees</button>
          <button class="tab ${tab === 'results' ? 'active' : ''}" data-tab="results">Results</button>
          <button class="tab ${tab === 'transport' ? 'active' : ''}" data-tab="transport">Transport</button>
        </div>
        <div id="ptab-body"></div>`;

      const render = () => {
        container.innerHTML = `
          <div class="chip-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
            <div style="background:var(--primary-050);color:var(--primary-600);padding:8px 14px;border-radius:999px;font-weight:600;font-size:.86rem;display:inline-flex;align-items:center">
              ${d.children.length} ${d.children.length === 1 ? 'child' : 'children'} enrolled
            </div>
            ${d.children.map(c => `<button class="chip ${c.id === childId ? 'active' : ''}" data-child="${c.id}">${esc(c.name)} · Class ${esc(c.class)}${esc(c.section)}</button>`).join('')}
          </div>
          <div id="ptab"></div>
          <div class="card" style="margin-top:20px">
            <div class="card-head">
              <div><h3 class="card-title">School Alerts</h3></div>
              <button class="btn btn-sm" id="p-read-all">Mark all read</button>
            </div>
            <div id="p-notifs"></div>
          </div>`;

        const selected = d.children.find(c => c.id === childId);
        if (!selected) {
          container.querySelector('#ptab').innerHTML = '<div class="empty-state"><p>No children linked to this account yet.</p></div>';
        } else {
          container.querySelector('#ptab').innerHTML = renderOverview(selected);
        }
        loadTab(selected);
        loadNotifs();

        container.querySelectorAll('[data-child]').forEach(ch => ch.addEventListener('click', () => {
          childId = Number(ch.dataset.child); tab = 'overview'; render();
        }));
        container.querySelectorAll('.tab[data-tab]').forEach(t => t.addEventListener('click', () => {
          tab = t.dataset.tab;
          container.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
          loadTab(selected);
        }));
        container.querySelector('#p-read-all').addEventListener('click', async () => {
          try { await api.post('/api/notifications/read-all'); toast('All alerts marked read', 'success'); SMS.app.refreshNotifBadge(); loadNotifs(); }
          catch (e) { toast(e.message, 'error'); }
        });
      };

      async function loadTab(selected) {
        if (!selected) return;
        const box = container.querySelector('#ptab-body');
        if (tab === 'overview') return;
        box.innerHTML = '<div class="loading-block" style="padding:30px"><div class="spinner"></div></div>';
        if (tab === 'attendance') {
          const a = await api.get(`/api/parent/children/${selected.id}/attendance?days=30`);
          const statuses = ['present', 'absent', 'late', 'leave'];
          box.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
              <span class="badge badge-primary">Last 30 school days</span>
              ${statuses.map(s => {
                const n = a.records.filter(r => r.status === s).length;
                const map = { present: ['badge-success', 'Present'], absent: ['badge-danger', 'Absent'], late: ['badge-warning', 'Late'], leave: ['badge-info', 'Leave'] };
                return `<span class="badge ${map[s][0]}">${map[s][1]}: ${n}</span>`;
              }).join('')}
            </div>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>Date</th><th>Status</th></tr></thead>
              <tbody>${a.records.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${attBadge(r.status)}</td></tr>`).join('') || '<tr><td colspan="2"><div class="ta-empty">No attendance records yet</div></td></tr>'}</tbody>
            </table></div>`;
        } else if (tab === 'fees') {
          const f = await api.get(`/api/parent/children/${selected.id}/fees`);
          box.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
              <span class="badge badge-success">Paid: ${fmtMoney(f.paid, cur())}</span>
              <span class="badge badge-warning">Balance: ${fmtMoney(f.balance, cur())}</span>
            </div>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>Receipt No</th><th>Amount</th><th>Discount</th><th>Mode</th><th>Date</th></tr></thead>
              <tbody>${f.payments.map(p => `<tr>
                <td class="mono">${esc(p.receipt_no)}</td>
                <td style="font-weight:600">${fmtMoney(p.amount, cur())}</td>
                <td>${p.discount ? fmtMoney(p.discount, cur()) : '—'}</td>
                <td><span class="badge badge-gray" style="text-transform:capitalize">${esc(p.mode)}</span></td>
                <td>${fmtDate(p.date)}</td>
              </tr>`).join('') || '<tr><td colspan="5"><div class="ta-empty">No payments yet</div></td></tr>'}</tbody>
            </table></div>`;
        } else if (tab === 'results') {
          const r = await api.get(`/api/parent/children/${selected.id}/results`);
          if (!r.results.length) {
            box.innerHTML = `<div class="empty-state"><div class="es-icon">📝</div><h3>No results published yet</h3><p>Results will appear here once the school enters marks for completed exams.</p></div>`;
          } else {
            box.innerHTML = r.results.map(res => `
              <div class="card" style="margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
                  <b>${esc(res.exam.name)} <span class="badge badge-primary">${esc(res.exam.type)}</span></b>
                  <span style="font-size:.84rem;color:var(--muted)">${fmtDate(res.exam.start_date)}</span>
                </div>
                <div class="table-wrap"><table class="data">
                  <thead><tr><th>Subject</th><th>Marks</th><th>Grade</th></tr></thead>
                  <tbody>${res.card.subjectMarks.map(sm => `<tr><td>${esc(sm.subject)}</td><td>${sm.marks != null ? sm.marks + ' / ' + res.exam.total_marks : '—'}</td>
                    <td style="color:${gradeColor(sm.grade)};font-weight:700">${sm.grade}</td></tr>`).join('')}</tbody>
                </table></div>
                <div style="display:flex;gap:14px;margin-top:10px;font-size:.88rem;flex-wrap:wrap">
                  <span>Total: <b>${res.card.total}</b> / ${res.maxTotal}</span>
                  <span>Percentage: <b>${res.card.percentage}%</b></span>
                  <span>Grade: <b style="color:${gradeColor(res.card.grade)}">${res.card.grade}</b></span>
                  <span>Rank: <b>${res.card.rank ? '#' + res.card.rank : '—'}</b></span>
                  <span>${res.card.passed !== false ? '<span class="badge badge-success">Pass</span>' : '<span class="badge badge-danger">Fail</span>'}</span>
                </div>
              </div>`).join('');
          }
        } else if (tab === 'transport') {
          if (!selected.route_no) {
            box.innerHTML = `<div class="empty-state"><div class="es-icon">${icon('bus', 32)}</div><h3>Not using the school bus</h3><p>This child has not been assigned a bus route.</p></div>`;
          } else {
            const tr = await api.get(`/api/routes/${selected.route_id}`);
            const r = tr.route;
            box.innerHTML = `
              <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px">
                <span class="badge badge-primary">Route ${esc(r.route_no)}</span>
                <span class="badge badge-gray">${esc(r.vehicle_no)}</span>
                <span class="badge badge-info">Fee: ${fmtMoney(r.monthly_fee, cur())}/mo</span>
              </div>
              ${r.driver_name ? `<div style="display:flex;gap:10px;align-items:center;background:var(--bg);padding:10px 14px;border-radius:10px;margin-bottom:16px">
                <div class="user-avatar" style="width:34px;height:34px;font-size:.8rem;background:var(--warning)">${esc(r.driver_name[0])}</div>
                <div><div style="font-weight:600;font-size:.9rem">${esc(r.driver_name)} — Driver</div>
                <div style="font-size:.8rem;color:var(--muted)">${icon('phone', 11)} ${esc(r.driver_phone || '—')}</div></div>
              </div>` : ''}
              <div class="section-label">Route Stops &amp; Timings</div>
              <div>
                ${r.stops.map((s, i) => `<div style="display:flex;gap:10px;align-items:center;padding:6px 0">
                  <div style="width:14px;height:14px;border-radius:50%;border:2px solid var(--primary);background:#fff;flex-shrink:0"></div>
                  <div style="flex:1">${esc(s.place)}</div><b class="mono">${esc(s.time)}</b>
                </div>`).join('')}
              </div>`;
          }
        }
      }

      async function loadNotifs() {
        const box = container.querySelector('#p-notifs');
        try {
          const n = await api.get('/api/notifications');
          const typeCls = { info: 'badge-info', warning: 'badge-warning', success: 'badge-success', urgent: 'badge-danger' };
          box.innerHTML = n.notifications.length ? n.notifications.map(x => `
            <div style="display:flex;gap:12px;padding:12px;border-radius:10px;margin-bottom:8px;${x.read ? 'border:1px solid var(--border)' : 'background:var(--primary-050);border:1px solid color-mix(in srgb,var(--primary),#fff 80%)'}" data-pnid="${x.id}">
              <span class="badge ${typeCls[x.type]}">${x.type}</span>
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(x.title)}</b><span style="font-size:.74rem;color:var(--muted-2)">${SMS.ui.timeAgo(x.created_at)}</span></div>
                <div style="font-size:.84rem;color:var(--muted)">${esc(x.message)}</div>
                ${!x.read ? '<span class="badge badge-primary" style="margin-top:6px">New</span>' : ''}
              </div>
            </div>`).join('') : `<div class="empty-state" style="padding:20px"><p>No school alerts yet.</p></div>`;
          box.querySelectorAll('[data-pnid]').forEach(b => b.addEventListener('click', async () => {
            const x = n.notifications.find(y => y.id === Number(b.dataset.pnid));
            if (!x.read) { try { await api.post(`/api/notifications/${x.id}/read`); SMS.app.refreshNotifBadge(); loadNotifs(); } catch (e) {} }
          }));
        } catch (e) { box.innerHTML = `<p style="color:var(--muted)">Could not load alerts.</p>`; }
      }

      render();
    });
  };
})();

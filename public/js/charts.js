// charts.js — dependency-free SVG charts
'use strict';
window.SMS = window.SMS || {};

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function fmtNum(n) {
    if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(Math.round(n));
  }

  // Vertical bar chart. data: [{label, value}]
  function barChart(container, data, opts) {
    opts = opts || {};
    const W = opts.width || 520, H = opts.height || 240;
    const padL = 44, padR = 8, padT = 16, padB = 34;
    const cw = W - padL - padR, ch = H - padT - padB;
    const max = Math.max(...data.map(d => d.value), 1) * 1.12;
    const color = opts.color || 'var(--primary)';
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H });
    // gridlines
    for (let i = 0; i <= 4; i++) {
      const y = padT + ch - (ch * i / 4);
      el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'var(--border)', 'stroke-width': 1 }, svg);
      el('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--muted-2)' }, svg)
        .textContent = fmtNum(max * i / 4);
    }
    const n = data.length;
    const slot = cw / n;
    const bw = Math.min(slot * 0.55, 42);
    data.forEach((d, i) => {
      const h = Math.max((d.value / max) * ch, d.value ? 2 : 1);
      const x = padL + slot * i + (slot - bw) / 2;
      const y = padT + ch - h;
      const rect = el('rect', { x, y, width: bw, height: h, rx: 4, fill: color, opacity: 0.92 }, svg);
      rect.addEventListener('mouseenter', () => { rect.setAttribute('opacity', 1); });
      rect.addEventListener('mouseleave', () => { rect.setAttribute('opacity', 0.92); });
      const tip = document.createElement('div');
      tip.className = 'chart-tip'; tip.style.cssText = 'position:absolute;background:#1c2333;color:#fff;padding:4px 8px;border-radius:6px;font-size:11px;pointer-events:none;opacity:0;transition:opacity .12s;z-index:20';
      container.style.position = 'relative';
      container.appendChild(tip);
      rect.addEventListener('mousemove', (e) => {
        tip.textContent = `${d.label} : ${opts.money ? fmtMoneyShort(d.value) : d.value}`;
        tip.style.opacity = 1;
        const r = container.getBoundingClientRect();
        tip.style.left = Math.min(e.clientX - r.left, container.clientWidth - 120) + 'px';
        tip.style.top = (e.clientY - r.top - 34) + 'px';
      });
      rect.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
      const lx = padL + slot * i + slot / 2;
      el('text', { x: lx, y: H - 12, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted-2)' }, svg)
        .textContent = d.label;
      if (d.value > 0) {
        el('text', { x: lx, y: y - 5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: 'var(--text)' }, svg)
          .textContent = opts.money ? fmtMoneyShort(d.value) : d.value;
      }
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }
  function fmtMoneyShort(n) {
    if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  // Multi-series line chart. data: [{label, values: {name: v}}], series: [{name, color}]
  function lineChart(container, data, series, opts) {
    opts = opts || {};
    const W = opts.width || 520, H = opts.height || 240;
    const padL = 40, padR = 10, padT = 14, padB = 30;
    const cw = W - padL - padR, ch = H - padT - padB;
    const all = data.flatMap(d => series.map(s => d.values[s.name]));
    const max = Math.max(...all, 1) * 1.08;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H });
    for (let i = 0; i <= 4; i++) {
      const y = padT + ch - (ch * i / 4);
      el('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: 'var(--border)', 'stroke-width': 1 }, svg);
      el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--muted-2)' }, svg)
        .textContent = Math.round(max * i / 4) + '%';
    }
    const n = data.length;
    const xAt = (i) => padL + (n === 1 ? cw / 2 : cw * i / (n - 1));
    const yAt = (v) => padT + ch - (v / max) * ch;
    series.forEach(s => {
      let d = '';
      data.forEach((p, i) => { d += (i ? ' L' : 'M') + xAt(i) + ',' + yAt(p.values[s.name]); });
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      data.forEach((p, i) => {
        const c = el('circle', { cx: xAt(i), cy: yAt(p.values[s.name]), r: 3.5, fill: '#fff', stroke: s.color, 'stroke-width': 2 }, svg);
        c.addEventListener('mouseenter', () => {
          const tip = document.createElement('div');
          tip.className = 'chart-tip'; tip.style.cssText = 'position:absolute;background:#1c2333;color:#fff;padding:4px 9px;border-radius:6px;font-size:11px;pointer-events:none;z-index:20;white-space:nowrap';
          tip.textContent = `${p.label} — ${s.name}: ${p.values[s.name]}%`;
          container.style.position = 'relative';
          container.appendChild(tip);
          const r = container.getBoundingClientRect();
          tip.style.left = Math.min(xAt(i) - r.width / 2 + 20, container.clientWidth - 160) + 'px';
          tip.style.top = '8px';
          c._tip = tip;
        });
        c.addEventListener('mouseleave', () => { if (c._tip) { c._tip.remove(); c._tip = null; } });
      });
    });
    const step = Math.max(1, Math.ceil(n / 8));
    data.forEach((p, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      el('text', { x: xAt(i), y: H - 10, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted-2)' }, svg)
        .textContent = p.label;
    });
    container.innerHTML = '';
    container.appendChild(svg);
  }

  // Pie/donut chart. data: [{label, value, color}]
  function pieChart(container, data, opts) {
    opts = opts || {};
    const size = opts.size || 200;
    const total = data.reduce((a, d) => a + d.value, 0);
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
    const cx = size / 2, cy = size / 2, R = size / 2 - 6, r = R * 0.62;
    let angle = -Math.PI / 2;
    data.forEach(d => {
      const frac = total ? d.value / total : 0;
      const a2 = angle + frac * Math.PI * 2;
      if (frac > 0) {
        const large = frac > 0.5 ? 1 : 0;
        const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
        const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
        const x3 = cx + r * Math.cos(angle), y3 = cy + r * Math.sin(angle);
        const x4 = cx + r * Math.cos(a2), y4 = cy + r * Math.sin(a2);
        el('path', { d: `M${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} L${x4},${y4} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`, fill: d.color }, svg);
      }
      angle = a2;
    });
    el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': size * 0.13, 'font-weight': 800, fill: 'var(--text)' }, svg)
      .textContent = total;
    el('text', { x: cx, y: cy + size * 0.075, 'text-anchor': 'middle', 'font-size': size * 0.055, fill: 'var(--muted-2)' }, svg)
      .textContent = 'Total';
    container.innerHTML = '';
    container.appendChild(svg);
    // legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-direction:column;gap:7px;margin-top:12px';
    data.forEach(d => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:.82rem';
      row.innerHTML = `<span style="width:10px;height:10px;border-radius:3px;background:${d.color};flex-shrink:0"></span>
        <span style="flex:1;color:var(--muted)">${d.label}</span>
        <span style="font-weight:700">${d.value}</span>
        <span style="color:var(--muted-2);width:44px;text-align:right">${total ? Math.round(d.value / total * 100) : 0}%</span>`;
      legend.appendChild(row);
    });
    container.appendChild(legend);
  }

  // Horizontal bar list (class strength). data: [{label, value}]
  function hbarList(container, data, opts) {
    opts = opts || {};
    const max = Math.max(...data.map(d => d.value), 1);
    const color = opts.color || 'var(--primary)';
    container.innerHTML = data.map(d => `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:5px">
          <span style="font-weight:600">${d.label}</span>
          <span style="color:var(--muted)">${d.value} students</span>
        </div>
        <div class="progress"><div style="width:${Math.round(d.value / max * 100)}%;background:${color}"></div></div>
      </div>`).join('');
  }

  window.SMS.charts = { barChart, lineChart, pieChart, hbarList };
})();

// backup.js — automatic CSV backups organised as backups/YYYY-MM-DD/<module>/
// A module's folder and file are created ONLY when there is actual data / activity
// for that module — no empty folders, no files for untouched modules.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Backup location — override with SMS_BACKUP_DIR=<dir> node server.js
const BACKUP_ROOT = process.env.SMS_BACKUP_DIR ? path.resolve(process.env.SMS_BACKUP_DIR) : path.join(__dirname, 'backups');

function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function esc(v) {
  const s = v == null ? '' : String(v);
  return /[\",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(header, rows) {
  return [header, ...rows.map(r => header.map(h => esc(r[h])))]
    .map(row => row.join(',')).join('\r\n');
}

// ---------------------------------------------------------------------------
// Category config.
//   mode 'today' — only that day's rows are backed up (attendance marked today,
//                  fees collected today). Nothing is written when there is no
//                  activity for that date.
//   mode 'full'  — the whole master table is backed up, but a new file is written
//                  only when the table's data actually changed (an action in that
//                  field). Nothing is written while the table is empty.
// ---------------------------------------------------------------------------
const CATEGORIES = [
  {
    folder: 'attendance',
    tables: [{
      name: 'attendance',
      mode: 'today',
      header: ['id', 'date', 'kind', 'name', 'code', 'class', 'section', 'status'],
      sql: `SELECT a.id, a.date, a.kind,
                   COALESCE(s.name, e.name) AS name,
                   COALESCE(s.admission_no, e.code) AS code,
                   COALESCE(s.class, e.type) AS class,
                   COALESCE(s.section, e.designation) AS section,
                   a.status
            FROM attendance a
            LEFT JOIN students s ON s.id = a.ref_id AND a.kind = 'student'
            LEFT JOIN employees e ON e.id = a.ref_id AND a.kind = 'employee'
            WHERE a.date = ?
            ORDER BY a.kind, s.class, s.section, s.roll_no`
    }]
  },
  {
    folder: 'fees',
    tables: [{
      name: 'payments',
      mode: 'today',
      header: ['receipt_no', 'date', 'student', 'admission_no', 'class', 'section', 'category', 'amount', 'discount', 'mode', 'note'],
      sql: `SELECT p.receipt_no, p.date, s.name AS student, s.admission_no AS admission_no,
                   s.class, s.section, c.name AS category, p.amount, p.discount, p.mode, p.note
            FROM payments p
            LEFT JOIN students s ON s.id = p.student_id
            LEFT JOIN fee_categories c ON c.id = p.category_id
            WHERE p.date = ?
            ORDER BY p.id`
    }]
  },
  { folder: 'students',         tables: [{ name: 'students', mode: 'full' }] },
  { folder: 'employees',        tables: [{ name: 'employees', mode: 'full' }] },
  { folder: 'users',            tables: [{ name: 'users', mode: 'full' }] },
  { folder: 'parents',          tables: [{ name: 'parents', mode: 'full' }] },
  { folder: 'fee_categories',   tables: [{ name: 'fee_categories', mode: 'full' }] },
  { folder: 'exams',            tables: [{ name: 'exams', mode: 'full' }] },
  { folder: 'subjects',         tables: [{ name: 'subjects', mode: 'full' }] },
  { folder: 'exam_marks',       tables: [{ name: 'exam_marks', mode: 'full' }] },
  { folder: 'notifications',    tables: [{ name: 'notifications', mode: 'full' }] },
  { folder: 'notification_reads', tables: [{ name: 'notification_reads', mode: 'full' }] },
  { folder: 'transport',        tables: [{ name: 'routes', mode: 'full' }] },
  { folder: 'salaries',         tables: [{ name: 'salaries', mode: 'full' }] },
  { folder: 'settings',         tables: [{ name: 'settings', mode: 'full' }] }
];

// Build the CSV for one table; returns null when there is nothing to back up.
function dumpTable(db, spec) {
  if (spec.mode === 'today') {
    const rows = db.prepare(spec.sql).all(todayStr());
    if (!rows.length) return null; // no activity on this date → no file/folder
    return toCSV(spec.header, rows);
  }
  const rows = db.prepare(`SELECT * FROM ${spec.name}`).all();
  if (!rows.length) return null; // table is empty → no file/folder
  return toCSV(Object.keys(rows[0]), rows);
}

const lastHash = {}; // table name -> sha1 of the last CSV actually written

// Write CSVs into backups/YYYY-MM-DD/<module>/ — only for modules that have data
// and only when that data changed since the last backup.
function writeBackups(db) {
  const day = todayStr();
  const dayDir = path.join(BACKUP_ROOT, day);
  const now = new Date();
  const stamp = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  let wrote = 0;

  for (const cat of CATEGORIES) {
    for (const spec of cat.tables) {
      let csv;
      try { csv = dumpTable(db, spec); } catch (e) { continue; } // table missing / query failed
      if (csv == null) continue;
      const hash = crypto.createHash('sha1').update(csv).digest('hex');
      if (lastHash[spec.name] === hash) continue; // unchanged since last backup
      const dir = path.join(dayDir, cat.folder);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${spec.name}_${stamp}.csv`);
      fs.writeFileSync(file, csv, 'utf8');
      lastHash[spec.name] = hash;
      wrote++;
    }
  }

  if (wrote) {
    // index.json lists every file present in today's folders (not just new ones)
    const index = { day, categories: {}, updatedAt: new Date().toISOString() };
    for (const cat of CATEGORIES) {
      const dir = path.join(dayDir, cat.folder);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort();
      if (files.length) index.categories[cat.folder] = files;
    }
    fs.writeFileSync(path.join(dayDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
    console.log(`💾 Backup written → backups/${day}/ (${wrote} file${wrote === 1 ? '' : 's'} changed)`);
  }
  return wrote > 0;
}

function startAutoBackup(db, intervalMs) {
  writeBackups(db);
  const timer = setInterval(() => {
    try { writeBackups(db); } catch (e) { console.error('Backup error:', e.message); }
  }, intervalMs || 60000);
  timer.unref && timer.unref();
  return timer;
}

module.exports = { writeBackups, startAutoBackup, BACKUP_ROOT };

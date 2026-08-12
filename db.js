// db.js — SQLite schema + minimal bootstrap seed for the School Management System
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// NOTE: node:sqlite is NOT required at module load. It is only available on
// some runtimes (local Node >= 22.5 with the flag; NOT on Vercel), so we load
// it lazily inside initDb() — the Turso backend never touches it.

// NOTE: no filesystem work at module load. Vercel's function directory is
// read-only, so any mkdirSync/write here would crash the whole function even
// when Turso is used. The data dir is created lazily inside initDb().
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'school.db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes('$')) return false;
  const [salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  phone TEXT,
  email TEXT,
  salary REAL DEFAULT 0,
  join_date TEXT,
  address TEXT,
  home_class TEXT,
  home_section TEXT,
  status TEXT DEFAULT 'active',
  unique_id TEXT,
  guardian_name TEXT,
  guardian_relation TEXT,
  aadhar_no TEXT,
  pan_no TEXT,
  highest_qualification TEXT,
  core_subject TEXT,
  driving_license TEXT
);

CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  occupation TEXT,
  address TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_no TEXT UNIQUE,
  name TEXT NOT NULL,
  class TEXT,
  section TEXT,
  roll_no INTEGER,
  gender TEXT,
  dob TEXT,
  blood_group TEXT,
  religion TEXT,
  category TEXT,
  caste TEXT,
  address TEXT,
  father_name TEXT,
  mother_name TEXT,
  guardian_name TEXT,
  occupation TEXT,
  mobile1 TEXT,
  mobile2 TEXT,
  aadhar_no TEXT,
  pen TEXT,
  admission_date TEXT,
  parent_id INTEGER,
  route_id INTEGER,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL,
  linked_type TEXT,
  linked_id INTEGER,
  status TEXT DEFAULT 'active',
  force_password_change INTEGER DEFAULT 0,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(date, kind, ref_id)
);

CREATE TABLE IF NOT EXISTS fee_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  total_amount REAL,
  installments INTEGER DEFAULT 1,
  due_date TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT UNIQUE,
  student_id INTEGER,
  category_id INTEGER,
  amount REAL,
  discount REAL DEFAULT 0,
  mode TEXT,
  note TEXT,
  date TEXT DEFAULT (date('now','localtime'))
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT,
  class TEXT,
  section TEXT,
  start_date TEXT,
  end_date TEXT,
  total_marks REAL,
  passing_marks REAL
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS exam_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER,
  student_id INTEGER,
  subject_id INTEGER,
  marks REAL,
  UNIQUE(exam_id, student_id, subject_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  message TEXT,
  type TEXT DEFAULT 'info',
  audience TEXT DEFAULT 'all',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER,
  user_id INTEGER,
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_no TEXT UNIQUE,
  vehicle_no TEXT,
  capacity INTEGER,
  monthly_fee REAL,
  driver_id INTEGER,
  stops TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS salaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER,
  month TEXT,
  basic REAL,
  allowances REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  net REAL,
  status TEXT DEFAULT 'pending',
  paid_date TEXT,
  UNIQUE(employee_id, month)
);
`;

const DEFAULT_SETTINGS = {
  school: {
    name: 'Greenfield Public School',
    tagline: 'Simplify. Manage. Succeed.',
    logo: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    principal: ''
  },
  academic: {
    established: 2000,
    academicYear: '2026-27',
    board: '',
    affiliationNo: '',
    currency: '₹',
    schoolCode: 'GFS'
  },
  notifications: {
    email: false, sms: false, push: true,
    autoFees: true, autoAttendance: true, autoExams: true, autoResults: true,
    feeReminderDays: 5
  },
  security: {
    sessionTimeout: 30, passwordPolicy: 'medium', twoFactor: false,
    loginAttempts: 5, auditLogging: true
  },
  appearance: { themeColor: '#4f46e5', sidebarStyle: 'dark', fontSize: 'medium' }
};

// Columns added to existing tables after the first release — safe to re-run.
function migrate(db) {
  const empCols = new Set(db.prepare('PRAGMA table_info(employees)').all().map(r => r.name));
  const empAdds = [
    ['unique_id', 'TEXT'], ['guardian_name', 'TEXT'], ['guardian_relation', 'TEXT'],
    ['aadhar_no', 'TEXT'], ['pan_no', 'TEXT'], ['highest_qualification', 'TEXT'],
    ['core_subject', 'TEXT'], ['driving_license', 'TEXT']
  ];
  for (const [name, type] of empAdds) {
    if (!empCols.has(name)) db.exec(`ALTER TABLE employees ADD COLUMN ${name} ${type}`);
  }
}

function initDb() {
  const { DatabaseSync } = require('node:sqlite'); // lazy: only for local dev
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new DatabaseSync(DB_PATH);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec(SCHEMA);
  migrate(sqlite);
  seedIfEmpty(sqlite);
  // Async facade — same shape as the Turso backend below, so server.js is
  // identical on both (always `await db.prepare(...).get/all/run`).
  return {
    backend: 'sqlite',
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        get: async (...args) => stmt.get(...args),
        all: async (...args) => stmt.all(...args),
        run: async (...args) => {
          const r = stmt.run(...args);
          return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        }
      };
    },
    exec: async (sql) => { sqlite.exec(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        let last = { changes: 0, lastInsertRowid: 0 };
        for (const s of statements) {
          const r = sqlite.prepare(s.sql).run(...(s.args || []));
          last = { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
        }
        sqlite.exec('COMMIT');
        return last;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
    close: () => sqlite.close()
  };
}

// Minimal bootstrap: no demo/fake data — just the two primary accounts.
function seedIfEmpty(db) {
  const row = db.prepare("SELECT COUNT(*) AS c FROM settings").get();
  if (row.c > 0) return;

  const ins = (sql, ...args) => db.prepare(sql).run(...args);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    ins('INSERT INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));
  }
  // admin — admin@123, manager — manager@123
  ins("INSERT INTO users (username,password_hash,role,status,force_password_change) VALUES ('admin',?, 'admin', 'active', 0)", hashPassword('admin@123'));
  ins("INSERT INTO users (username,password_hash,role,status,force_password_change) VALUES ('manager',?, 'manager', 'active', 0)", hashPassword('manager@123'));
  console.log('✅ Fresh database created (admin / admin@123, manager / manager@123)');
}

// ---------------------------------------------------------------------------
// Turso (serverless libSQL) backend — used on Vercel where SQLite's local file
// can't persist. Same SQL, same schema, same async facade as the SQLite path.
// ---------------------------------------------------------------------------
async function bootstrapDb(db) {
  // Fast path: an already-seeded DB skips the whole schema exec. On Vercel every
  // request can hit a fresh instance, so this must be one cheap query.
  let count = 0;
  try {
    const row = await db.prepare('SELECT COUNT(*) AS c FROM settings').get();
    count = row ? Number(row.c) : 0;
  } catch { /* settings table missing -> create schema below */ }
  if (count > 0) return;
  await db.exec(SCHEMA);
  const row2 = await db.prepare('SELECT COUNT(*) AS c FROM settings').get();
  if (row2 && Number(row2.c) > 0) return; // existing DB with data (e.g. migrated)
  const ins = (sql, ...args) => db.prepare(sql).run(...args);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await ins('INSERT INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));
  await ins("INSERT INTO users (username,password_hash,role,status,force_password_change) VALUES ('admin',?, 'admin', 'active', 0)", hashPassword('admin@123'));
  await ins("INSERT INTO users (username,password_hash,role,status,force_password_change) VALUES ('manager',?, 'manager', 'active', 0)", hashPassword('manager@123'));
  console.log('✅ Fresh database seeded (admin / admin@123, manager / manager@123)');
}

// Minimal Turso client over its HTTP API (v2 pipeline) using only built-in
// fetch. No native bindings, no ws/node-fetch — near-zero module load cost,
// so Vercel cold starts are fast.
function initTurso({ url, authToken }) {
  const httpUrl = url.replace(/^libsql:/, 'https:');
  const enc = (a) => {
    if (a === null || a === undefined) return { type: 'null', value: null };
    if (typeof a === 'number') return Number.isInteger(a) ? { type: 'integer', value: String(a) } : { type: 'float', value: String(a) };
    if (typeof a === 'boolean') return { type: 'integer', value: a ? '1' : '0' };
    return { type: 'text', value: String(a) };
  };
  const dec = (v) => {
    if (!v) return null;
    switch (v.type) {
      case 'integer': return Number(v.value);
      case 'float': return Number(v.value);
      case 'text': return v.value;
      case 'null': return null;
      default: return v.value;
    }
  };
  const stmt = (sql, args) => ({ sql, args: (args || []).map(enc) });
  // Runs a v2 pipeline; returns the array of step results ({cols, rows, affected_row_count, last_insert_rowid}).
  async function pipeline(requests) {
    const res = await fetch(httpUrl + '/v2/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests })
    });
    if (!res.ok) {
      let msg = 'Turso HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* keep default */ }
      throw new Error(msg);
    }
    const j = await res.json();
    const out = [];
    for (const r of (j.results || [])) {
      if (r.type !== 'ok' || !r.response) throw new Error((r.error) || 'Turso request failed');
      if (r.response.type === 'execute') {
        out.push(r.response.result);
      } else if (r.response.type === 'batch' && r.response.result) {
        out.push(...r.response.result.step_results);
      }
    }
    return out;
  }
  const rowsOf = (result) => {
    const cols = (result && result.cols || []).map(c => c.name);
    return (result && result.rows || []).map(row => {
      const o = {};
      cols.forEach((c, i) => { o[c] = dec(row[i]); });
      return o;
    });
  };
  return {
    backend: 'turso',
    prepare(sql) {
      return {
        get: async (...args) => rowsOf((await pipeline([{ type: 'execute', stmt: stmt(sql, args) }]))[0])[0],
        all: async (...args) => rowsOf((await pipeline([{ type: 'execute', stmt: stmt(sql, args) }]))[0]),
        run: async (...args) => {
          const r = (await pipeline([{ type: 'execute', stmt: stmt(sql, args) }]))[0];
          return { changes: Number(r.affected_row_count || 0), lastInsertRowid: Number(r.last_insert_rowid || 0) };
        }
      };
    },
    exec: async (sql) => {
      const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
      await pipeline(stmts.map(s => ({ type: 'execute', stmt: { sql: s, args: [] } })));
    },
    // Runs a batch in a single HTTP round trip; Turso wraps it in an implicit
    // transaction (all steps commit or none do).
    async batch(statements) {
      const results = await pipeline([{ type: 'batch', batch: { steps: statements.map(s => ({ type: 'execute', stmt: stmt(s.sql, s.args) })) } }]);
      const last = results.length ? results[results.length - 1] : null;
      return { changes: Number(last ? last.affected_row_count : 0), lastInsertRowid: Number(last ? (last.last_insert_rowid || 0) : 0) };
    },
    close: async () => {}
  };
}

// Pick the backend: Turso when TURSO_URL is set (Vercel/production), otherwise
// the local SQLite file (dev). Both return the same async facade.
async function createDb() {
  if (process.env.TURSO_URL) {
    const db = initTurso({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    await bootstrapDb(db);
    return db;
  }
  const db = initDb();
  await bootstrapDb(db);
  return db;
}

module.exports = { initDb, initTurso, createDb, bootstrapDb, SCHEMA, hashPassword, verifyPassword, DEFAULT_SETTINGS, DB_PATH };

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
// MongoDB backend — used on Vercel/serverless where SQLite's file storage can't
// persist. The SQLite path above (initDb) remains for local development.
// Docs keep the SAME field names as the SQLite tables (including the numeric
// `id`) so the API response shapes are identical on both backends.
// ---------------------------------------------------------------------------
const dns = require('node:dns');
const { MongoClient } = require('mongodb');

const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'sms_main';

// Some networks/sandboxes block Node's default DNS for SRV records while the OS
// resolver works fine (Vercel is unaffected). Fall back to public resolvers only
// when the default resolver refuses queries.
async function ensureDns() {
  try {
    await dns.promises.resolveSrv('_mongodb._tcp.does-not-exist.invalid');
  } catch (e) {
    if (e && e.code === 'ECONNREFUSED') dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

async function initMongo(uri, { seed = true } = {}) {
  await ensureDns();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  const db = client.db(MONGO_DB_NAME);
  const store = {
    client, db,
    col: (name) => db.collection(name),
    // Read one row (drops the Mongo _id so shapes match SQLite exactly).
    async one(name, filter, opts = {}) {
      return db.collection(name).findOne(filter, { projection: { _id: 0 }, ...opts });
    },
    async many(name, filter, opts = {}) {
      return db.collection(name).find(filter, { projection: { _id: 0 }, ...opts }).toArray();
    },
    // SQLite AUTOINCREMENT equivalent: per-collection counter.
    async nextId(name) {
      const r = await db.collection('counters').findOneAndUpdate(
        { _id: name }, { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      return r && r.value ? r.value.seq : 1;
    }
  };
  if (seed) await seedMongo(store);
  return store;
}

async function seedMongo(store) {
  const settingsCount = await store.col('settings').countDocuments();
  if (settingsCount > 0) return;
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await store.col('settings').insertOne({ id: await store.nextId('settings'), key: k, value: JSON.stringify(v) });
  }
  const mk = async (username, role, password) => store.col('users').insertOne({
    id: await store.nextId('users'), username, password_hash: hashPassword(password),
    role, status: 'active', force_password_change: 0, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  });
  await mk('admin', 'admin', 'admin@123');
  await mk('manager', 'manager', 'manager@123');
  console.log('🌱 Mongo database seeded (admin / admin@123, manager / manager@123)');
}

// ---------------------------------------------------------------------------
// Turso (serverless libSQL) backend — used on Vercel where SQLite's local file
// can't persist. Same SQL, same schema, same async facade as the SQLite path.
// ---------------------------------------------------------------------------
async function bootstrapDb(db) {
  await db.exec(SCHEMA);
  const row = await db.prepare('SELECT COUNT(*) AS c FROM settings').get();
  if (row && row.c > 0) return;
  const ins = (sql, ...args) => db.prepare(sql).run(...args);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await ins('INSERT INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));
  await ins("INSERT INTO users (username,password_hash,role,status,force_password_change) VALUES ('admin',?, 'admin', 'active', 0)", hashPassword('admin@123'));
  await ins("INSERT INTO users (username,password_hash,role,status,force_password_change) VALUES ('manager',?, 'manager', 'active', 0)", hashPassword('manager@123'));
  console.log('✅ Fresh database seeded (admin / admin@123, manager / manager@123)');
}

function initTurso({ url, authToken }) {
  // Use the pure-JS HTTP transport (no native bindings) so this works on
  // serverless runtimes like Vercel. libsql:// -> https://
  const { createClient } = require('@libsql/client/http');
  const httpUrl = url.replace(/^libsql:/, 'https:');
  const client = createClient({ url: httpUrl, authToken });
  return {
    backend: 'turso',
    prepare(sql) {
      return {
        get: async (...args) => (await client.execute({ sql, args })).rows[0],
        all: async (...args) => (await client.execute({ sql, args })).rows,
        run: async (...args) => {
          const r = await client.execute({ sql, args });
          return { changes: Number(r.rowsAffected ?? 0), lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
        }
      };
    },
    exec: async (sql) => { await client.executeMultiple(sql); },
    async batch(statements) {
      const results = await client.batch(statements.map(s => ({ sql: s.sql, args: s.args || [] })), 'write');
      const last = results && results.length ? results[results.length - 1] : null;
      return { changes: Number(last ? last.rowsAffected : 0), lastInsertRowid: Number(last ? (last.lastInsertRowid ?? 0) : 0) };
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

module.exports = { initDb, initTurso, createDb, bootstrapDb, SCHEMA, initMongo, seedMongo, hashPassword, verifyPassword, DEFAULT_SETTINGS, DB_PATH, MONGO_DB_NAME };

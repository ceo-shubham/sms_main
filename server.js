// server.js — zero-dependency HTTP API + static server for the School Management System
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createDb, hashPassword, verifyPassword, DEFAULT_SETTINGS } = require('./db');
const backup = require('./backup');

const PORT = process.env.SMS_PORT || 4321;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Data layer is initialised lazily (Turso when TURSO_URL is set, else local
// SQLite) so importing this module never blocks on a database connection.
let db = null;
let dbReady = null;
function ensureDb() {
  if (!dbReady) {
    dbReady = createDb().then((d) => {
      db = d;
      // Local-dev only: periodic CSV backups. On Vercel (serverless) timers +
      // local disk don't apply — backups are pushed to B2 instead (backup.js).
      if (require.main === module) backup.startAutoBackup(db, 60000);
      return d;
    });
  }
  return dbReady;
}

// ---- stateless sessions (serverless-safe) ----
// Token = base64url(JSON{uid, exp}) . HMAC-SHA256(payload, SESSION_SECRET).
// No server-side state, so it survives Vercel's per-request instances.
// SESSION_SECRET must be set in production; locally we fall back to a random
// per-process secret (fine for dev, but users get logged out on restart).
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
function signSession(userId, timeoutMin) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + timeoutMin * 60000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.uid || !data.exp || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const ok = (res, data) => json(res, 200, data);
const fail = (res, status, message) => json(res, status, { error: message });

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

function toCSV(rows) {
  return rows.map(r => r.map(c => {
    const s = c == null ? '' : String(c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > 8 * 1024 * 1024) { reject(new Error('Payload too large')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON body')); }
  });
  req.on('error', reject);
});

async function genAdmissionNo() {
  const settings = await getSettings();
  const code = (settings.academic.schoolCode || 'SCH').toUpperCase();
  const year = new Date().getFullYear();
  const count = (await db.prepare('SELECT COUNT(*) c FROM students').get()).c;
  let n = count + 1, no;
  do { no = `${code}-${year}-${String(n++).padStart(3, '0')}`; } while (await db.prepare('SELECT 1 x FROM students WHERE admission_no=?').get(no));
  return no;
}
async function genEmpCode() {
  const count = (await db.prepare('SELECT COUNT(*) c FROM employees').get()).c;
  let n = count + 1, code;
  do { code = `EMP-${String(n++).padStart(3, '0')}`; } while (await db.prepare('SELECT 1 x FROM employees WHERE code=?').get(code));
  return code;
}
async function genReceiptNo() {
  const count = (await db.prepare('SELECT COUNT(*) c FROM payments').get()).c;
  return `RCPT-${String(count + 1).padStart(6, '0')}`;
}
function genTempPassword() {
  return 'Temp@' + crypto.randomBytes(4).toString('hex').slice(0, 6);
}

// Normalise a phone number to '+91XXXXXXXXXX'. Returns null when invalid.
function normalizeMobile(raw) {
  let s = String(raw || '').trim().replace(/[^\d]/g, '');
  if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  if (s.length === 10) return '+91' + s;
  return null;
}

// Validate the Staff / Teacher / Driver entry form payload.
// Returns an error message, or null when everything is valid.
function employeeEntryErrors(b) {
  const has = (v) => v != null && String(v).trim() !== '';
  const type = String(b.type || 'staff').toLowerCase();
  const uid = has(b.unique_id) ? String(b.unique_id).trim() : '';
  const guardian = has(b.guardian_name) ? String(b.guardian_name).trim() : '';
  const relation = has(b.guardian_relation) ? String(b.guardian_relation).trim().toLowerCase() : '';
  const addr = has(b.address) ? String(b.address).trim() : '';
  const email = has(b.email) ? String(b.email).trim() : '';
  const aadhar = has(b.aadhar_no) ? String(b.aadhar_no).trim() : '';
  const pan = has(b.pan_no) ? String(b.pan_no).trim().toUpperCase() : '';
  const qual = has(b.highest_qualification) ? String(b.highest_qualification).trim() : '';
  const subj = has(b.core_subject) ? String(b.core_subject).trim() : '';
  const lic = has(b.driving_license) ? String(b.driving_license).trim() : '';
  const salary = (b.salary === '' || b.salary == null) ? NaN : Number(b.salary);

  if (!uid) return 'Unique ID is required and must be unique';
  if (!guardian) return 'Father / Mother / Husband name is required';
  if (!['father', 'mother', 'husband'].includes(relation)) return 'Please choose the relation: Father, Mother or Husband';
  if (isNaN(salary) || salary < 0) return 'Monthly salary is required';
  if (!addr) return 'Address is required';
  if (!normalizeMobile(b.phone)) return 'A valid 10-digit mobile number is required';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Email address is not valid';
  if (aadhar && !/^\d{12}$/.test(aadhar)) return 'Aadhaar number must be exactly 12 digits';
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return 'PAN number is not valid (e.g. ABCDE1234F)';
  if (!aadhar && !pan) return 'Either Aadhaar number or PAN number is required';
  if (type === 'teacher') {
    if (!qual) return 'Highest Qualification is required for teachers';
    if (!subj) return 'Core subject is required for teachers';
  }
  if (type === 'driver' && !lic) return 'Driving licence is required for drivers';
  return null;
}

// Guardian priority: father → mother → guardian
function guardianOf(s) {
  return (s.father_name && s.father_name.trim()) || (s.mother_name && s.mother_name.trim()) || (s.guardian_name && s.guardian_name.trim()) || '';
}

// Create (if missing) the parent login account for a student's admission number
async function ensureParentLogin(admissionNo, force, parentId) {
  if (!admissionNo) return null;
  const uname = String(admissionNo).trim();
  const existing = await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').get(uname);
  if (existing) return existing.id;
  const r = await db.prepare('INSERT INTO users (username,password_hash,role,linked_type,linked_id,status,force_password_change) VALUES (?,?,?,?,?,?,?)')
    .run(uname, hashPassword(uname + '@123'), 'parent', 'parent', parentId || null, 'active', force ? 1 : 0);
  return Number(r.lastInsertRowid);
}
function usernameFrom(name, phone) {
  const base = (name || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'user';
  const suffix = phone ? phone.slice(-4) : String(Math.floor(Math.random() * 9999));
  return `${base}_${suffix}`;
}

async function getSettings() {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = JSON.parse(r.value);
  return out;
}

function gradeOf(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C+';
  if (pct >= 40) return 'C';
  if (pct >= 33) return 'D';
  return 'F';
}
const GRADE_SCALE = [
  ['A+', '90 – 100', 'Outstanding'], ['A', '80 – 89', 'Excellent'], ['B+', '70 – 79', 'Very Good'],
  ['B', '60 – 69', 'Good'], ['C+', '50 – 59', 'Fair'], ['C', '40 – 49', 'Average'],
  ['D', '33 – 39', 'Below Average'], ['F', 'Below 33', 'Needs Improvement']
];
function remarkFor(pct) {
  const g = gradeOf(pct);
  return (GRADE_SCALE.find(x => x[0] === g) || [])[2] || '';
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
const routes = [];
function route(method, pattern, handler, roles = null) {
  routes.push({ method, pattern: pattern.split('/').filter(Boolean), handler, roles });
}
function match(pattern, parts) {
  if (pattern.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
    else if (pattern[i] !== parts[i]) return null;
  }
  return params;
}

const ROLE_GROUP = { admin: 'admin', teacher: 'teachers', manager: 'staff', staff: 'staff', parent: 'parents' };
function audienceMatches(audience, role) {
  if (audience === 'all') return true;
  if (role === 'admin') return true;
  const group = ROLE_GROUP[role];
  if (audience === 'teachers' && (role === 'teacher' || role === 'admin')) return true;
  if (audience === 'staff' && (role === 'staff' || role === 'manager' || role === 'admin')) return true;
  if (audience === 'parents' && role === 'parent') return true;
  return false;
}

// ---------------------------------------------------------------------------
// auth middleware
// ---------------------------------------------------------------------------
async function auth(req, res, roles) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.url.split('?')[0] && new URL(req.url, 'http://x').searchParams.get('token')) || '';
  const sess = verifySession(token);
  if (!sess) { fail(res, 401, 'Not authenticated'); return null; }
  const user = await db.prepare('SELECT * FROM users WHERE id=?').get(sess.uid);
  if (!user || user.status !== 'active') { fail(res, 401, 'Account is not active'); return null; }
  // Sliding expiry: re-issue a fresh token when more than half the timeout is used.
  const settings = await getSettings();
  const timeoutMin = Number(settings.security.sessionTimeout) || 30;
  const used = (Date.now() - (sess.exp - timeoutMin * 60000)) / 60000;
  if (used > timeoutMin / 2 && !res.headersSent) {
    res.setHeader('X-Session-Token', signSession(user.id, timeoutMin));
  }
  if (roles && !roles.includes(user.role)) { fail(res, 403, 'You do not have permission for this action'); return null; }
  req.user = user;
  req.token = token;
  return user;
}

// ---------------------------------------------------------------------------
// route handlers
// ---------------------------------------------------------------------------

// ---- auth ----
route('POST', '/api/auth/login', async (req, res) => {
  const body = await readBody(req);
  const user = await db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(String(body.username || '').trim());
  if (!user || !verifyPassword(body.password, user.password_hash)) {
    fail(res, 401, 'Invalid username or password');
    return;
  }
  if (user.status !== 'active') { fail(res, 403, 'Your account has been deactivated. Contact the administrator.'); return; }
  const settings = await getSettings();
  const timeoutMin = Number(settings.security.sessionTimeout) || 30;
  const token = signSession(user.id, timeoutMin);
  await db.prepare('UPDATE users SET last_login=? WHERE id=?').run(todayStr(), user.id);
  const linked = await linkedName(user);
  ok(res, {
    token, user: {
      id: user.id, username: user.username, role: user.role, linked_type: user.linked_type,
      linked_id: user.linked_id, force_password_change: !!user.force_password_change, linked,
      last_login: user.last_login
    },
    settings
  });
});
route('POST', '/api/auth/logout', async (req, res) => {
  // Stateless sessions: nothing to delete server-side, the client drops the token.
  ok(res, { ok: true });
});
route('GET', '/api/auth/me', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  ok(res, { user: { id: user.id, username: user.username, role: user.role, linked_type: user.linked_type, linked_id: user.linked_id, force_password_change: !!user.force_password_change, linked: await linkedName(user), last_login: user.last_login }, settings: await getSettings() });
});
route('POST', '/api/auth/change-password', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const body = await readBody(req);
  if (!verifyPassword(body.old_password, user.password_hash)) { fail(res, 400, 'Current password is incorrect'); return; }
  if (!body.new_password || String(body.new_password).length < 6) { fail(res, 400, 'New password must be at least 6 characters'); return; }
  await db.prepare('UPDATE users SET password_hash=?, force_password_change=0 WHERE id=?').run(hashPassword(body.new_password), user.id);
  ok(res, { ok: true });
});
route('GET', '/api/public-info', async (req, res) => {
  const s = await getSettings();
  // School name/logo/theme rarely change — let the browser cache this so page
  // loads don't pay an extra serverless round trip every time.
  res.setHeader('Cache-Control', 'public, max-age=300');
  ok(res, { school: s.school, appearance: s.appearance });
});

// ---- dashboard ----
route('GET', '/api/dashboard', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  if (user.role === 'parent') return ok(res, { parentPortal: true });
  const today = todayStr();
  // All dashboard queries are independent — fire them in PARALLEL so the total
  // is one network round-trip worth of latency, not ~30 sequential ones.
  const trendDays = 7;
  const trendDates = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    trendDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const Q = (sql, ...args) => db.prepare(sql).get(...args);
  const QA = (sql, ...args) => db.prepare(sql).all(...args);
  const [
    rTotalStudents, rTotalStaff, rCollected, rRoutes, rTStu, rTStaff,
    rTPStu, rTPStaff, rBus, rSal, rMonthly, rGender, rClass, rDenomS, rDenomE,
    ...rTrend
  ] = await Promise.all([
    Q("SELECT COUNT(*) c FROM students WHERE status='active'"),
    Q("SELECT COUNT(*) c FROM employees WHERE status='active'"),
    Q('SELECT COALESCE(SUM(amount),0) s FROM payments'),
    Q('SELECT COUNT(*) c FROM routes'),
    Q("SELECT COUNT(*) c FROM attendance WHERE date=? AND kind='student'", today),
    Q("SELECT COUNT(*) c FROM attendance WHERE date=? AND kind='employee'", today),
    Q("SELECT COUNT(*) c FROM attendance WHERE date=? AND kind='student' AND status IN ('present','late')", today),
    Q("SELECT COUNT(*) c FROM attendance WHERE date=? AND kind='employee' AND status IN ('present','late')", today),
    Q("SELECT COUNT(*) c FROM students WHERE route_id IS NOT NULL AND status='active'"),
    Q("SELECT COUNT(*) c FROM salaries WHERE status='pending'"),
    QA("SELECT strftime('%Y-%m',date) m, SUM(amount) total FROM payments GROUP BY m ORDER BY m DESC LIMIT 12"),
    QA("SELECT gender, COUNT(*) c FROM students WHERE status='active' GROUP BY gender"),
    QA("SELECT class, section, COUNT(*) c FROM students WHERE status='active' GROUP BY class, section ORDER BY class, section"),
    Q("SELECT COUNT(*) c FROM students WHERE status='active'"),
    Q("SELECT COUNT(*) c FROM employees WHERE status='active'"),
    ...trendDates.flatMap(ds => [
      QA("SELECT status, COUNT(*) c FROM attendance WHERE date=? AND kind='student' GROUP BY status", ds),
      QA("SELECT status, COUNT(*) c FROM attendance WHERE date=? AND kind='employee' GROUP BY status", ds)
    ]),
    QA('SELECT * FROM notifications ORDER BY id DESC LIMIT 5'),
    QA('SELECT * FROM exams WHERE start_date >= ? ORDER BY start_date LIMIT 5', today),
    QA("SELECT id, name, admission_no, class, section, created_at FROM students WHERE status='active' ORDER BY id DESC LIMIT 6")
  ]);
  const stats = {
    totalStudents: (rTotalStudents || {}).c || 0,
    totalStaff: (rTotalStaff || {}).c || 0,
    totalCollected: (rCollected || {}).s || 0,
    totalRoutes: (rRoutes || {}).c || 0,
    todayStudents: (rTStu || {}).c || 0,
    todayStaff: (rTStaff || {}).c || 0,
    todayPresentStudents: (rTPStu || {}).c || 0,
    todayPresentStaff: (rTPStaff || {}).c || 0,
    studentsOnBus: (rBus || {}).c || 0,
    pendingSalaries: (rSal || {}).c || 0
  };
  const monthly = (rMonthly || []).reverse();
  const gender = rGender || [];
  const classStrength = rClass || [];
  const denomS = Math.max((rDenomS || {}).c || 0, 1);
  const denomE = Math.max((rDenomE || {}).c || 0, 1);
  const trend = [];
  for (let i = 0; i < trendDays; i++) {
    const s = rTrend[i * 2] || [];
    const e = rTrend[i * 2 + 1] || [];
    const sum = (rows) => rows.filter(x => ['present', 'late'].includes(x.status)).reduce((a, x) => a + x.c, 0);
    trend.push({ date: trendDates[i], label: trendDates[i].slice(5), studentsPct: Math.round(sum(s) / denomS * 100), staffPct: Math.round(sum(e) / denomE * 100) });
  }
  const notifs = (rTrend[14] || []).filter(n => audienceMatches(n.audience, user.role));
  const exams = rTrend[15] || [];
  const recentAdmissions = rTrend[16] || [];
  ok(res, { stats, monthly, gender, classStrength, trend, notifications: notifs, upcomingExams: exams, recentAdmissions });
});

// ---- students ----
route('GET', '/api/students', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const search = (u.searchParams.get('search') || '').trim();
  const cls = u.searchParams.get('class') || '';
  const gender = u.searchParams.get('gender') || '';
  const status = u.searchParams.get('status') || '';
  const section = u.searchParams.get('section') || '';
  let sql = `SELECT s.*, p.name parent_name, p.phone parent_phone, p.email parent_email, r.route_no
    FROM students s LEFT JOIN parents p ON p.id = s.parent_id LEFT JOIN routes r ON r.id = s.route_id WHERE 1=1`;
  const args = [];
  if (search) { sql += ' AND (s.name LIKE ? OR s.admission_no LIKE ?)'; args.push(`%${search}%`, `%${search}%`); }
  if (cls) { sql += ' AND s.class = ?'; args.push(cls); }
  if (section) { sql += ' AND s.section = ?'; args.push(section); }
  if (gender) { sql += ' AND s.gender = ?'; args.push(gender); }
  if (status) { sql += ' AND s.status = ?'; args.push(status); }
  sql += ' ORDER BY s.class, s.section, s.roll_no';
  const students = await db.prepare(sql).all(...args);
  const classes = (await db.prepare('SELECT DISTINCT class FROM students ORDER BY class').all()).map(r => r.class);
  const stat = {
    total: (await db.prepare('SELECT COUNT(*) c FROM students').get()).c,
    boys: (await db.prepare("SELECT COUNT(*) c FROM students WHERE gender='M'").get()).c,
    girls: (await db.prepare("SELECT COUNT(*) c FROM students WHERE gender='F'").get()).c,
    active: (await db.prepare("SELECT COUNT(*) c FROM students WHERE status='active'").get()).c
  };
  ok(res, { students, classes, stats: stat });
});
route('POST', '/api/students', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const body = await readBody(req);
  const s = body.student || body;
  if (!s.name) return fail(res, 400, 'Student name is required');
  const admission_no = String(s.admission_no || '').trim();
  if (!admission_no) return fail(res, 400, 'Admission number is required — it is given to the student at admission time');
  if (await db.prepare('SELECT 1 x FROM students WHERE admission_no=? COLLATE NOCASE').get(admission_no)) return fail(res, 400, 'This admission number is already used by another student');
  const m1 = normalizeMobile(s.mobile1);
  const m2 = s.mobile2 ? normalizeMobile(s.mobile2) : null;
  if (s.mobile2 && !m2) return fail(res, 400, 'Second mobile number must be a valid 10-digit number');
  if (!m1) return fail(res, 400, 'At least one valid 10-digit mobile number is required (with +91)');
  if (s.aadhar_no && !/^\d{12}$/.test(String(s.aadhar_no).trim())) return fail(res, 400, 'Aadhaar number must be 12 digits');
  const guardian = guardianOf(s);
  let parentId = s.parent_id || null;
  let parentLogin = null;
  try {
    if (guardian) {
      // reuse an existing parent record for the same guardian + phone when possible
      const existing = await db.prepare('SELECT id FROM parents WHERE name=? AND phone=?').get(guardian, m1);
      if (existing) parentId = existing.id;
      else {
        const pr = await db.batch([{ sql: 'INSERT INTO parents (name,phone,email,occupation,address) VALUES (?,?,?,?,?)', args: [guardian, m1, '', s.occupation || '', s.address || ''] }]);
        parentId = pr.lastInsertRowid;
      }
    }
    const sr = await db.batch([{ sql: `INSERT INTO students
      (admission_no,name,class,section,roll_no,gender,dob,blood_group,religion,category,caste,address,
       father_name,mother_name,guardian_name,occupation,mobile1,mobile2,aadhar_no,pen,admission_date,parent_id,route_id,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [
        admission_no, s.name, s.class || '', s.section || '', s.roll_no || null, s.gender || '', s.dob || '',
        s.blood_group || '', s.religion || '', s.category || '', s.caste || '', s.address || '',
        s.father_name || '', s.mother_name || '', s.guardian_name || '', s.occupation || '', m1, m2 || '',
        s.aadhar_no || '', s.pen || '', s.admission_date || todayStr(), parentId, s.route_id || null, s.status || 'active'
      ] }]);
    const sid = sr.lastInsertRowid;
    if (parentId) {
      await db.batch([{ sql: 'UPDATE students SET parent_id=? WHERE id=?', args: [parentId, sid] }]);
    }
    // parent login: username = admission number, password = admission number + @123
    parentLogin = await ensureParentLogin(admission_no, true, parentId);
    const created = await db.prepare('SELECT s.*, p.name parent_name FROM students s LEFT JOIN parents p ON p.id=s.parent_id WHERE s.id=?').get(sid);
    ok(res, { student: created, parentLogin, defaultPassword: admission_no + '@123' });
  } catch (e) {
    fail(res, 400, e.message);
  }
});
route('GET', '/api/students/:id', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const id = Number(params.id);
  const student = await db.prepare('SELECT s.*, p.name parent_name, p.phone parent_phone, p.email parent_email, p.occupation parent_occupation, p.address parent_address, r.route_no, r.monthly_fee route_fee FROM students s LEFT JOIN parents p ON p.id=s.parent_id LEFT JOIN routes r ON r.id=s.route_id WHERE s.id=?').get(id);
  if (!student) return fail(res, 404, 'Student not found');
  const payments = await db.prepare('SELECT * FROM payments WHERE student_id=? ORDER BY date DESC, id DESC').all(id);
  const totalPaid = payments.reduce((a, p) => a + p.amount + p.discount, 0);
  const totalDue = (await db.prepare('SELECT COALESCE(SUM(total_amount),0) s FROM fee_categories').get()).s;
  const att = await db.prepare("SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END),0) p FROM attendance WHERE kind='student' AND ref_id=?").get(id);
  ok(res, { student, payments, totalPaid, balance: Math.max(0, totalDue - totalPaid), attendancePct: att.c ? Math.round(att.p / att.c * 100) : null, routes: await db.prepare('SELECT id, route_no FROM routes').all() });
});
route('PUT', '/api/students/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const body = await readBody(req);
  const s = body;
  if (!s.name) return fail(res, 400, 'Student name is required');
  if (s.admission_no) {
    const dup = await db.prepare('SELECT id FROM students WHERE admission_no=? COLLATE NOCASE AND id<>?').get(s.admission_no, Number(params.id));
    if (dup) return fail(res, 400, 'This admission number is already used by another student');
  }
  const m1 = normalizeMobile(s.mobile1);
  const m2 = s.mobile2 ? normalizeMobile(s.mobile2) : null;
  if (s.mobile2 && !m2) return fail(res, 400, 'Second mobile number must be a valid 10-digit number');
  if (!m1) return fail(res, 400, 'At least one valid 10-digit mobile number is required (with +91)');
  const existing = await db.prepare('SELECT * FROM students WHERE id=?').get(Number(params.id));
  if (!existing) return fail(res, 404, 'Student not found');
  const guardian = guardianOf(s);
  let parentId = existing.parent_id || null;
  if (guardian && parentId) {
    await db.prepare('UPDATE parents SET name=?,phone=?,occupation=?,address=? WHERE id=?').run(guardian, m1, s.occupation || '', s.address || '', parentId);
  } else if (guardian && !parentId) {
    const r = await db.prepare('INSERT INTO parents (name,phone,occupation,address) VALUES (?,?,?,?)').run(guardian, m1, s.occupation || '', s.address || '');
    parentId = Number(r.lastInsertRowid);
  }
  await db.prepare(`UPDATE students SET name=?,class=?,section=?,roll_no=?,gender=?,dob=?,blood_group=?,religion=?,category=?,caste=?,address=?,
    father_name=?,mother_name=?,guardian_name=?,occupation=?,mobile1=?,mobile2=?,aadhar_no=?,pen=?,admission_date=?,parent_id=?,route_id=?,status=? WHERE id=?`)
    .run(s.name, s.class || '', s.section || '', s.roll_no || null, s.gender || '', s.dob || '', s.blood_group || '',
      s.religion || '', s.category || '', s.caste || '', s.address || '', s.father_name || '', s.mother_name || '',
      s.guardian_name || '', s.occupation || '', m1, m2 || '', s.aadhar_no || '', s.pen || '',
      s.admission_date || existing.admission_date, parentId, s.route_id || null, s.status || 'active', Number(params.id));
  ok(res, { ok: true });
});
route('DELETE', '/api/students/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  await db.prepare('DELETE FROM students WHERE id=?').run(Number(params.id));
  ok(res, { ok: true });
});
route('GET', '/api/students/export/csv', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const rows = await db.prepare(`SELECT admission_no,name,class,section,roll_no,gender,dob,blood_group,religion,category,caste,address,father_name,mother_name,guardian_name,occupation,mobile1,mobile2,aadhar_no,pen,admission_date,status FROM students ORDER BY class,roll_no`).all();
  const csv = toCSV([['Admission No','Name','Class','Section','Roll No','Gender','DOB','Blood Group','Religion','Category','Caste','Address','Father Name','Mother Name','Guardian Name','Occupation','Mobile 1','Mobile 2','Aadhaar No','PEN','Admission Date','Status'], ...rows.map(r => Object.values(r))]);
  res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="students.csv"' });
  res.end(csv);
});
route('POST', '/api/students/import', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  const body = await readBody(req);
  const rows = parseCSV(body.csv || '');
  if (rows.length < 2) return fail(res, 400, 'CSV must contain a header row and at least one data row');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name.toLowerCase());
  const map = {
    admission: idx('admission no'), name: idx('name'), class: idx('class'), section: idx('section'), roll: idx('roll no'),
    gender: idx('gender'), dob: idx('dob'), blood: idx('blood group'), religion: idx('religion'), category: idx('category'),
    caste: idx('caste'), address: idx('address'), father: idx('father name'), mother: idx('mother name'),
    guardian: idx('guardian name'), occupation: idx('occupation'), m1: idx('mobile 1'), m2: idx('mobile 2'),
    aadhar: idx('aadhaar no'), pen: idx('pen'), adate: idx('admission date')
  };
  if (map.name < 0) return fail(res, 400, 'CSV must include a "Name" column');
  let created = 0, skipped = 0, parentLogins = 0;
  const errors = [];
  try {
    for (const r of rows.slice(1)) {
      const name = (r[map.name] || '').trim();
      if (!name) { skipped++; continue; }
      const admission = (r[map.admission] || '').trim();
      if (!admission || await db.prepare('SELECT 1 x FROM students WHERE admission_no=? COLLATE NOCASE').get(admission)) { skipped++; continue; }
      const father = (r[map.father] || '').trim();
      const mother = (r[map.mother] || '').trim();
      const guardian = (r[map.guardian] || '').trim() || father || mother;
      const m1raw = (r[map.m1] || '').trim();
      const m2raw = (r[map.m2] || '').trim();
      const m1 = normalizeMobile(m1raw);
      const m2 = m2raw ? normalizeMobile(m2raw) : null;
      if (!m1) { errors.push(`${admission}: invalid or missing mobile 1`); skipped++; continue; }
      let parentId = null;
      if (guardian) {
        const existing = await db.prepare('SELECT id FROM parents WHERE name=? AND phone=?').get(guardian, m1);
        if (existing) parentId = existing.id;
        else {
          const pr = await db.batch([{ sql: 'INSERT INTO parents (name,phone,occupation,address) VALUES (?,?,?,?)', args: [guardian, m1, (r[map.occupation] || '').trim(), (r[map.address] || '').trim()] }]);
          parentId = pr.lastInsertRowid;
        }
      }
      await db.batch([{ sql: `INSERT INTO students
        (admission_no,name,class,section,roll_no,gender,dob,blood_group,religion,category,caste,address,
         father_name,mother_name,guardian_name,occupation,mobile1,mobile2,aadhar_no,pen,admission_date,parent_id,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args: [
          admission, name, (r[map.class] || '').trim(), (r[map.section] || '').trim(), (r[map.roll] || '').trim() || null,
          (r[map.gender] || '').trim(), (r[map.dob] || '').trim(), (r[map.blood] || '').trim(), (r[map.religion] || '').trim(),
          (r[map.category] || '').trim(), (r[map.caste] || '').trim(), (r[map.address] || '').trim(), father, mother, guardian,
          (r[map.occupation] || '').trim(), m1, m2 || '', (r[map.aadhar] || '').trim(), (r[map.pen] || '').trim(),
          (r[map.adate] || '').trim() || todayStr(), parentId, 'active'
        ] }]);
      if (await ensureParentLogin(admission, true, parentId)) parentLogins++;
      created++;
    }
    ok(res, { created, skipped, parentLogins, errors: errors.slice(0, 10) });
  } catch (e) { fail(res, 400, 'Import failed: ' + e.message); }
});
route('GET', '/api/admissions/overview', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const today = todayStr();
  const month = today.slice(0, 7);
  const recent = await db.prepare("SELECT s.id,s.name,s.admission_no,s.class,s.section,s.status,s.created_at,p.name parent_name FROM students s LEFT JOIN parents p ON p.id=s.parent_id ORDER BY s.id DESC LIMIT 10").all();
  const stats = {
    newThisMonth: (await db.prepare("SELECT COUNT(*) c FROM students WHERE created_at LIKE ?").get(month + '%')).c,
    active: (await db.prepare("SELECT COUNT(*) c FROM students WHERE status='active'").get()).c,
    transferred: (await db.prepare("SELECT COUNT(*) c FROM students WHERE status='transferred'").get()).c,
    total: (await db.prepare('SELECT COUNT(*) c FROM students').get()).c
  };
  ok(res, { recent, stats });
});

// ---- parents ----
route('GET', '/api/parents', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const search = (u.searchParams.get('search') || '').trim();
  let sql = 'SELECT p.*, (SELECT COUNT(*) FROM students s WHERE s.parent_id=p.id) children FROM parents p WHERE 1=1';
  const args = [];
  if (search) { sql += ' AND (p.name LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)'; args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY p.name';
  ok(res, { parents: await db.prepare(sql).all(...args) });
});
route('GET', '/api/parents/:id', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const parent = await db.prepare('SELECT * FROM parents WHERE id=?').get(Number(params.id));
  if (!parent) return fail(res, 404, 'Parent not found');
  const children = await db.prepare('SELECT id,name,admission_no,class,section,roll_no,status FROM students WHERE parent_id=?').all(parent.id);
  ok(res, { parent, children });
});
route('POST', '/api/parents', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const body = await readBody(req);
  if (!body.name) return fail(res, 400, 'Parent name is required');
  const r = await db.prepare('INSERT INTO parents (name,phone,email,occupation,address) VALUES (?,?,?,?,?)')
    .run(body.name, body.phone || '', body.email || '', body.occupation || '', body.address || '');
  ok(res, { parent: await db.prepare('SELECT * FROM parents WHERE id=?').get(Number(r.lastInsertRowid)) });
});
route('PUT', '/api/parents/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const body = await readBody(req);
  await db.prepare('UPDATE parents SET name=?,phone=?,email=?,occupation=?,address=? WHERE id=?')
    .run(body.name, body.phone || '', body.email || '', body.occupation || '', body.address || '', Number(params.id));
  ok(res, { ok: true });
});

// ---- attendance ----
async function teacherAssignment(user) {
  if (user.role !== 'teacher') return null;
  const e = await db.prepare('SELECT * FROM employees WHERE id=?').get(user.linked_id);
  return (e && e.home_class) ? { class: e.home_class, section: e.home_section || '' } : null;
}

route('GET', '/api/attendance/roster', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const date = u.searchParams.get('date') || todayStr();
  const kind = u.searchParams.get('kind') || 'student';
  let cls = u.searchParams.get('class') || '';
  let section = u.searchParams.get('section') || '';
  const locked = kind === 'student' ? await teacherAssignment(user) : null;
  if (locked) { cls = locked.class; section = locked.section; }
  let roster;
  if (kind === 'student') {
    let sql = `SELECT s.id ref_id, s.name, s.admission_no, s.class, s.section, s.roll_no, a.status att FROM students s
      LEFT JOIN attendance a ON a.ref_id=s.id AND a.kind='student' AND a.date=? WHERE s.status='active'`;
    const args = [date];
    if (cls) { sql += ' AND s.class=?'; args.push(cls); }
    if (section) { sql += ' AND s.section=?'; args.push(section); }
    sql += ' ORDER BY s.class, s.section, s.roll_no';
    roster = await db.prepare(sql).all(...args);
  } else {
    roster = await db.prepare(`SELECT e.id ref_id, e.name, e.code, e.type, e.designation, a.status att FROM employees e
      LEFT JOIN attendance a ON a.ref_id=e.id AND a.kind='employee' AND a.date=? WHERE e.status='active' ORDER BY e.type, e.name`).all(date);
  }
  const classes = (await db.prepare('SELECT DISTINCT class FROM students ORDER BY class').all()).map(r => r.class);
  const sections = (await db.prepare('SELECT DISTINCT section FROM students ORDER BY section').all()).map(r => r.section);
  const counts = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
  for (const r of roster) { if (r.att) counts[r.att]++; else counts.unmarked++; }
  ok(res, { roster, classes, sections, counts, date, locked, lockedClass: locked ? locked.class : null, lockedSection: locked ? locked.section : null });
});
route('POST', '/api/attendance/save', async (req, res) => {
  const user = await auth(req, res, ['admin', 'teacher', 'manager', 'staff']);
  if (!user) return;
  const body = await readBody(req);
  const date = body.date || todayStr();
  const kind = body.kind || 'student';
  if (!Array.isArray(body.records)) return fail(res, 400, 'records array required');
  // class teachers may only mark attendance for their own class
  if (user.role === 'teacher') {
    if (kind !== 'student') return fail(res, 403, 'Teachers can only mark student attendance');
    const assign = await teacherAssignment(user);
    if (!assign) return fail(res, 403, 'You are not assigned to any class yet. Contact the administrator.');
    const ids = body.records.map(r => r.ref_id).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const bad = await db.prepare(`SELECT COUNT(*) c FROM students WHERE id IN (${placeholders}) AND (class<>? OR section<>?)`).get(...ids, assign.class, assign.section);
      if (bad.c > 0) return fail(res, 403, 'You can only mark attendance for your assigned class');
    }
  }
  let saved = 0;
  const stmts = [];
  for (const rec of body.records) {
    if (!rec.ref_id || !rec.status) continue;
    stmts.push({ sql: `INSERT INTO attendance (date,kind,ref_id,status) VALUES (?,?,?,?)
        ON CONFLICT(date,kind,ref_id) DO UPDATE SET status=excluded.status`, args: [date, kind, rec.ref_id, rec.status] });
    saved++;
  }
  try {
    if (stmts.length) await db.batch(stmts);
    ok(res, { saved });
  } catch (e) { fail(res, 400, e.message); }
});
route('GET', '/api/attendance/trend', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const days = Math.min(Number(u.searchParams.get('days') || 7), 30);
  const denomS = Math.max((await db.prepare("SELECT COUNT(*) c FROM students WHERE status='active'").get()).c, 1);
  const denomE = Math.max((await db.prepare("SELECT COUNT(*) c FROM employees WHERE status='active'").get()).c, 1);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const s = await db.prepare("SELECT status, COUNT(*) c FROM attendance WHERE date=? AND kind='student' GROUP BY status").all(ds);
    const e = await db.prepare("SELECT status, COUNT(*) c FROM attendance WHERE date=? AND kind='employee' GROUP BY status").all(ds);
    const sum = (rows) => rows.filter(r => ['present', 'late'].includes(r.status)).reduce((a, r) => a + r.c, 0);
    out.push({ date: ds, label: ds.slice(5), studentsPct: Math.round(sum(s) / denomS * 100), staffPct: Math.round(sum(e) / denomE * 100) });
  }
  ok(res, { trend: out });
});
route('GET', '/api/attendance/student/:id', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const days = Number(u.searchParams.get('days') || 30);
  const id = Number(params.id);
  const rows = await db.prepare("SELECT date, status FROM attendance WHERE kind='student' AND ref_id=? AND date >= ? ORDER BY date DESC").all(id, daysAgoStr(days));
  const total = rows.length;
  const attended = rows.filter(r => ['present', 'late'].includes(r.status)).length;
  ok(res, { records: rows, pct: total ? Math.round(attended / total * 100) : 100, total, attended });
});
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ---- fees ----
route('GET', '/api/fee-categories', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  ok(res, { categories: await db.prepare('SELECT * FROM fee_categories ORDER BY id').all() });
});
route('POST', '/api/fee-categories', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const b = await readBody(req);
  if (!b.name) return fail(res, 400, 'Category name required');
  const r = await db.prepare('INSERT INTO fee_categories (name,total_amount,installments,due_date,description) VALUES (?,?,?,?,?)')
    .run(b.name, Number(b.total_amount) || 0, Number(b.installments) || 1, b.due_date || '', b.description || '');
  ok(res, { category: await db.prepare('SELECT * FROM fee_categories WHERE id=?').get(Number(r.lastInsertRowid)) });
});
route('PUT', '/api/fee-categories/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const b = await readBody(req);
  await db.prepare('UPDATE fee_categories SET name=?,total_amount=?,installments=?,due_date=?,description=? WHERE id=?')
    .run(b.name, Number(b.total_amount) || 0, Number(b.installments) || 1, b.due_date || '', b.description || '', Number(params.id));
  ok(res, { ok: true });
});
route('DELETE', '/api/fee-categories/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  await db.prepare('DELETE FROM fee_categories WHERE id=?').run(Number(params.id));
  ok(res, { ok: true });
});

async function feeStatusList(search, statusFilter) {
  const cats = await db.prepare('SELECT * FROM fee_categories ORDER BY id').all();
  const totalDue = cats.reduce((a, c) => a + c.total_amount, 0);
  const students = await db.prepare(`SELECT s.id,s.name,s.admission_no,s.class,s.section,s.roll_no FROM students s WHERE s.status='active' ORDER BY s.class,s.section,s.roll_no`).all();
  const pays = await db.prepare('SELECT student_id, category_id, COALESCE(SUM(amount + discount),0) total FROM payments GROUP BY student_id, category_id').all();
  const payMap = {};
  for (const p of pays) {
    payMap[p.student_id] = payMap[p.student_id] || {};
    payMap[p.student_id][p.category_id || 0] = (payMap[p.student_id][p.category_id || 0] || 0) + p.total;
  }
  const today = todayStr();
  const out = students
    .filter(s => !search || (s.name + s.admission_no).toLowerCase().includes(search.toLowerCase()))
    .map(s => {
      const catPaid = payMap[s.id] || {};
      const paid = Object.values(catPaid).reduce((a, b) => a + b, 0);
      const balance = Math.max(0, totalDue - paid);
      const overdue = cats.some(c => c.due_date && c.due_date < today && (catPaid[c.id] || 0) < c.total_amount);
      const status = balance <= 0 ? 'paid' : (overdue ? 'overdue' : 'pending');
      const perCategory = cats.map(c => ({ id: c.id, name: c.name, total: c.total_amount, due_date: c.due_date, paid: catPaid[c.id] || 0, remaining: Math.max(0, c.total_amount - (catPaid[c.id] || 0)) }));
      return { ...s, totalDue, paid, balance, status, perCategory };
    });
  if (statusFilter && statusFilter !== 'all') return out.filter(s => s.status === statusFilter);
  return out;
}
route('GET', '/api/fees', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const search = (u.searchParams.get('search') || '').trim();
  const status = u.searchParams.get('status') || 'all';
  const list = await feeStatusList(search, status);
  const stats = {
    totalCollected: (await db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments').get()).s,
    paidStudents: list.filter(s => s.status === 'paid').length,
    pendingStudents: list.filter(s => s.status === 'pending').length,
    overdue: list.filter(s => s.status === 'overdue').length
  };
  ok(res, { fees: list, stats, categories: await db.prepare('SELECT id,name,total_amount FROM fee_categories').all() });
});
route('POST', '/api/payments', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const b = await readBody(req);
  if (!b.student_id) return fail(res, 400, 'Student required');
  const student = await db.prepare('SELECT * FROM students WHERE id=?').get(Number(b.student_id));
  if (!student) return fail(res, 404, 'Student not found');
  const receipt = await genReceiptNo();
  const date = b.date || todayStr();
  await db.prepare('INSERT INTO payments (receipt_no,student_id,category_id,amount,discount,mode,note,date) VALUES (?,?,?,?,?,?,?,?)')
    .run(receipt, Number(b.student_id), b.category_id ? Number(b.category_id) : null, Number(b.amount) || 0, Number(b.discount) || 0, b.mode || 'cash', b.note || '', date);
  ok(res, { payment: await db.prepare('SELECT * FROM payments WHERE receipt_no=?').get(receipt) });
});
route('GET', '/api/payments', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const limit = Math.min(Number(u.searchParams.get('limit') || 50), 200);
  const search = (u.searchParams.get('search') || '').trim();
  let sql = `SELECT p.*, s.name student_name, s.admission_no FROM payments p LEFT JOIN students s ON s.id=p.student_id`;
  const args = [];
  if (search) { sql += ' WHERE s.name LIKE ? OR s.admission_no LIKE ? OR p.receipt_no LIKE ?'; args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY p.id DESC LIMIT ?';
  args.push(limit);
  ok(res, { payments: await db.prepare(sql).all(...args) });
});
route('GET', '/api/fees/monthly-collection', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const months = Math.min(Number(u.searchParams.get('months') || 12), 24);
  const start = monthAgoStr(months - 1);
  const rows = await db.prepare("SELECT strftime('%Y-%m',date) m, COALESCE(SUM(amount),0) total FROM payments WHERE date >= ? GROUP BY m").all(start);
  const map = Object.fromEntries(rows.map(r => [r.m, r.total]));
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = monthAgoStr(i);
    out.push({ month: key, label: key.slice(5) + '/' + key.slice(2, 4), total: map[key] || 0 });
  }
  ok(res, { data: out });
});
function monthAgoStr(n) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
route('GET', '/api/fees/overview', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const list = await feeStatusList('', '');
  ok(res, {
    totalCollected: (await db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments').get()).s,
    totalDue: list.length ? list[0].totalDue : 0,
    paidStudents: list.filter(s => s.status === 'paid').length,
    pendingStudents: list.filter(s => s.status === 'pending').length,
    overdue: list.filter(s => s.status === 'overdue').length
  });
});

// ---- exams & marks ----
route('GET', '/api/exams', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const search = (u.searchParams.get('search') || '').trim();
  const type = u.searchParams.get('type') || '';
  const status = u.searchParams.get('status') || '';
  const today = todayStr();
  let sql = 'SELECT e.*, (SELECT COUNT(*) FROM exam_marks m WHERE m.exam_id=e.id) marks_entries FROM exams e WHERE 1=1';
  const args = [];
  if (search) { sql += ' AND e.name LIKE ?'; args.push(`%${search}%`); }
  if (type) { sql += ' AND e.type=?'; args.push(type); }
  const rows = await db.prepare(sql).all(...args);
  const exams = rows.map(e => ({ ...e, exam_status: e.end_date < today ? 'completed' : (e.start_date > today ? 'upcoming' : 'ongoing') }));
  const filtered = status ? exams.filter(e => e.exam_status === status) : exams;
  const stats = {
    total: exams.length,
    upcoming: exams.filter(e => e.exam_status === 'upcoming').length,
    completed: exams.filter(e => e.exam_status === 'completed').length,
    marksEntries: exams.reduce((a, e) => a + e.marks_entries, 0)
  };
  ok(res, { exams: filtered, stats, types: ['Unit Test', 'Half Yearly', 'Annual', 'Pre-Board', 'Mock'] });
});
route('POST', '/api/exams', async (req, res) => {
  const user = await auth(req, res, ['admin', 'teacher', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  if (!b.name) return fail(res, 400, 'Exam name required');
  const r = await db.prepare('INSERT INTO exams (name,type,class,section,start_date,end_date,total_marks,passing_marks) VALUES (?,?,?,?,?,?,?,?)')
    .run(b.name, b.type || 'Unit Test', b.class || '', b.section || '', b.start_date || '', b.end_date || '', Number(b.total_marks) || 100, Number(b.passing_marks) || 35);
  ok(res, { exam: await db.prepare('SELECT * FROM exams WHERE id=?').get(Number(r.lastInsertRowid)) });
});
route('PUT', '/api/exams/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'teacher', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  await db.prepare('UPDATE exams SET name=?,type=?,class=?,section=?,start_date=?,end_date=?,total_marks=?,passing_marks=? WHERE id=?')
    .run(b.name, b.type || 'Unit Test', b.class || '', b.section || '', b.start_date || '', b.end_date || '', Number(b.total_marks) || 100, Number(b.passing_marks) || 35, Number(params.id));
  ok(res, { ok: true });
});
route('DELETE', '/api/exams/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  await db.prepare('DELETE FROM exams WHERE id=?').run(Number(params.id));
  await db.prepare('DELETE FROM exam_marks WHERE exam_id=?').run(Number(params.id));
  ok(res, { ok: true });
});
route('GET', '/api/exams/:id/roster', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const exam = await db.prepare('SELECT * FROM exams WHERE id=?').get(Number(params.id));
  if (!exam) return fail(res, 404, 'Exam not found');
  const students = await db.prepare(`SELECT id,name,admission_no,roll_no FROM students WHERE status='active' AND class=? AND section=? ORDER BY roll_no`).all(exam.class, exam.section);
  ok(res, { exam, students });
});
route('GET', '/api/exams/:id/marks', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const exam = await db.prepare('SELECT * FROM exams WHERE id=?').get(Number(params.id));
  if (!exam) return fail(res, 404, 'Exam not found');
  const roster = await db.prepare(`SELECT id,name,admission_no,roll_no FROM students WHERE status='active' AND class=? AND section=? ORDER BY roll_no`).all(exam.class, exam.section);
  const subjects = await db.prepare('SELECT * FROM subjects ORDER BY id').all();
  const marksRows = await db.prepare('SELECT student_id, subject_id, marks FROM exam_marks WHERE exam_id=?').all(exam.id);
  const marks = {};
  for (const m of marksRows) {
    marks[m.subject_id] = marks[m.subject_id] || {};
    marks[m.subject_id][m.student_id] = m.marks;
  }
  ok(res, { exam, roster, subjects, marks });
});
route('POST', '/api/exams/:id/marks', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'teacher', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  const examId = Number(params.id);
  const subjectId = Number(b.subject_id);
  if (!subjectId || !Array.isArray(b.rows)) return fail(res, 400, 'subject_id and rows required');
  const stmts = [];
  for (const r of b.rows) {
    if (r.student_id == null) continue;
    const val = (r.marks === '' || r.marks == null) ? null : Number(r.marks);
    if (val == null) {
      stmts.push({ sql: 'DELETE FROM exam_marks WHERE exam_id=? AND student_id=? AND subject_id=?', args: [examId, Number(r.student_id), subjectId] });
    } else {
      stmts.push({ sql: `INSERT INTO exam_marks (exam_id,student_id,subject_id,marks) VALUES (?,?,?,?)
          ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET marks=excluded.marks`, args: [examId, Number(r.student_id), subjectId, val] });
    }
  }
  try {
    if (stmts.length) await db.batch(stmts);
    ok(res, { ok: true });
  } catch (e) { fail(res, 400, e.message); }
});
route('GET', '/api/exams/:id/results', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const exam = await db.prepare('SELECT * FROM exams WHERE id=?').get(Number(params.id));
  if (!exam) return fail(res, 404, 'Exam not found');
  const roster = await db.prepare(`SELECT id,name,admission_no,roll_no,class,section FROM students WHERE status='active' AND class=? AND section=? ORDER BY roll_no`).all(exam.class, exam.section);
  const marksRows = await db.prepare(`SELECT m.student_id, m.subject_id, m.marks, s.name subject FROM exam_marks m JOIN subjects s ON s.id=m.subject_id WHERE m.exam_id=? ORDER BY m.subject_id`).all(exam.id);
  ok(res, buildResults(exam, roster, marksRows));
});

function buildResults(exam, roster, marksRows) {
  const subjects = [];
  const perStudent = {};
  for (const m of marksRows) {
    if (!subjects.some(s => s.id === m.subject_id)) subjects.push({ id: m.subject_id, name: m.subject });
    perStudent[m.student_id] = perStudent[m.student_id] || {};
    perStudent[m.student_id][m.subject_id] = m.marks;
  }
  const maxTotal = subjects.length * exam.total_marks;
  const results = roster.map(s => {
    const row = { student: { id: s.id, name: s.name, admission_no: s.admission_no, roll_no: s.roll_no, class: s.class, section: s.section } };
    row.subjectMarks = subjects.map(sub => {
      const mk = perStudent[s.id] && perStudent[s.id][sub.id];
      const pct = mk == null ? null : Math.round(mk / exam.total_marks * 100);
      return { subject: sub.name, marks: mk, grade: pct == null ? '—' : gradeOf(pct), remark: pct == null ? '' : remarkFor(pct) };
    });
    const scored = row.subjectMarks.map(x => x.marks).filter(x => x != null);
    row.total = Math.round(scored.reduce((a, b) => a + b, 0) * 10) / 10;
    row.percentage = maxTotal ? Math.round(row.total / maxTotal * 1000) / 10 : 0;
    row.grade = row.percentage >= 0 ? gradeOf(row.percentage) : '—';
    row.passed = scored.length === subjects.length && scored.every(m => m >= exam.passing_marks);
    row.failedSubjects = subjects.length - scored.length > 0 ? subjects.length - scored.length : (row.subjectMarks.filter(x => x.marks != null && x.marks < exam.passing_marks).length);
    return row;
  });
  results.sort((a, b) => b.total - a.total);
  results.forEach((r, i) => { r.rank = r.total > 0 ? i + 1 : null; });
  return { exam, subjects, results, gradeScale: GRADE_SCALE, maxTotal };
}

route('GET', '/api/reportcard', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const studentId = Number(u.searchParams.get('student_id'));
  const examId = Number(u.searchParams.get('exam_id'));
  const student = await db.prepare('SELECT s.*, p.name parent_name FROM students s LEFT JOIN parents p ON p.id=s.parent_id WHERE s.id=?').get(studentId);
  const exam = await db.prepare('SELECT * FROM exams WHERE id=?').get(examId);
  if (!student || !exam) return fail(res, 404, 'Student or exam not found');
  const roster = await db.prepare(`SELECT id FROM students WHERE status='active' AND class=? AND section=?`).all(exam.class, exam.section);
  const marksRows = await db.prepare(`SELECT m.student_id, m.subject_id, m.marks, s.name subject FROM exam_marks m JOIN subjects s ON s.id=m.subject_id WHERE m.exam_id=? AND m.student_id=? ORDER BY m.subject_id`).all(examId, studentId);
  const all = buildResults(exam, roster, marksRows);
  const mine = all.results.find(r => r.student.id === studentId);
  const settings = await getSettings();
  ok(res, { student, exam, card: mine, gradeScale: all.gradeScale, maxTotal: all.maxTotal, school: settings.school, academic: settings.academic });
});

// ---- employees ----
route('GET', '/api/employees', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const search = (u.searchParams.get('search') || '').trim();
  const type = u.searchParams.get('type') || 'all';
  let sql = "SELECT e.*, (SELECT COUNT(*) FROM users u WHERE u.linked_type='employee' AND u.linked_id=e.id) has_login FROM employees e WHERE 1=1";
  const args = [];
  if (search) { sql += ' AND (e.name LIKE ? OR e.code LIKE ? OR e.designation LIKE ?)'; args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (type === 'teachers') sql += " AND e.type='teacher'";
  if (type === 'staff') sql += " AND e.type IN ('staff','admin')";
  sql += ' ORDER BY e.type, e.name';
  const employees = await db.prepare(sql).all(...args);
  const stat = {
    total: (await db.prepare('SELECT COUNT(*) c FROM employees').get()).c,
    teachers: (await db.prepare("SELECT COUNT(*) c FROM employees WHERE type='teacher'").get()).c,
    salaryPaid: (await db.prepare("SELECT COALESCE(SUM(net),0) s FROM salaries WHERE status='paid'").get()).s,
    pending: (await db.prepare("SELECT COALESCE(SUM(net),0) s FROM salaries WHERE status='pending'").get()).s
  };
  ok(res, { employees, stats: stat });
});
route('POST', '/api/employees', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  if (!b.name) return fail(res, 400, 'Employee name required');
  const has = (v) => v != null && String(v).trim() !== '';
  // Staff / Teacher / Driver entry form → run full validation
  let phone = b.phone || '';
  if (b.entry_form) {
    const err = employeeEntryErrors(b);
    if (err) return fail(res, 400, err);
    phone = normalizeMobile(b.phone);
  }
  const uid = has(b.unique_id) ? String(b.unique_id).trim() : '';
  if (uid && await db.prepare('SELECT 1 x FROM employees WHERE unique_id=? COLLATE NOCASE').get(uid)) return fail(res, 400, 'This Unique ID is already used by another employee');
  const code = b.code || await genEmpCode();
  if (await db.prepare('SELECT 1 x FROM employees WHERE code=?').get(code)) return fail(res, 400, 'Employee code already exists');
  const r = await db.prepare(`INSERT INTO employees
    (code,name,type,designation,department,phone,email,salary,join_date,address,home_class,home_section,status,
     unique_id,guardian_name,guardian_relation,aadhar_no,pan_no,highest_qualification,core_subject,driving_license)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(code, b.name, b.type || 'staff', b.designation || '', b.department || '', phone, b.email || '', Number(b.salary) || 0, b.join_date || '', b.address || '', b.home_class || '', b.home_section || '', b.status || 'active',
      uid, has(b.guardian_name) ? String(b.guardian_name).trim() : '', has(b.guardian_relation) ? String(b.guardian_relation).trim() : '',
      has(b.aadhar_no) ? String(b.aadhar_no).trim() : '', has(b.pan_no) ? String(b.pan_no).trim().toUpperCase() : '',
      has(b.highest_qualification) ? String(b.highest_qualification).trim() : '', has(b.core_subject) ? String(b.core_subject).trim() : '',
      has(b.driving_license) ? String(b.driving_license).trim() : '');
  const empId = Number(r.lastInsertRowid);
  // auto-create the staff/teacher login: username = employee code, password = code@123
  let login = null;
  if (!await db.prepare('SELECT 1 x FROM users WHERE username=? COLLATE NOCASE').get(code)) {
    const role = b.type === 'teacher' ? 'teacher' : b.type === 'admin' ? 'admin' : 'staff';
    await db.prepare('INSERT INTO users (username,password_hash,role,linked_type,linked_id,status,force_password_change) VALUES (?,?,?,?,?,?,1)')
      .run(code, hashPassword(code + '@123'), role, 'employee', empId, 'active');
    login = code + '@123';
  }
  ok(res, { employee: await db.prepare('SELECT * FROM employees WHERE id=?').get(empId), loginUsername: code, defaultPassword: login });
});
route('GET', '/api/employees/:id', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const employee = await db.prepare('SELECT * FROM employees WHERE id=?').get(Number(params.id));
  if (!employee) return fail(res, 404, 'Employee not found');
  const salaries = await db.prepare('SELECT * FROM salaries WHERE employee_id=? ORDER BY month DESC').all(employee.id);
  const login = await db.prepare("SELECT id, username, role, status FROM users WHERE linked_type='employee' AND linked_id=?").get(employee.id);
  ok(res, { employee, salaries, login });
});
route('PUT', '/api/employees/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  const existing = await db.prepare('SELECT * FROM employees WHERE id=?').get(Number(params.id));
  if (!existing) return fail(res, 404, 'Employee not found');
  const has = (v) => v != null && String(v).trim() !== '';
  let phone = b.phone || existing.phone || '';
  if (b.entry_form) {
    const err = employeeEntryErrors(b);
    if (err) return fail(res, 400, err);
    phone = normalizeMobile(b.phone);
  }
  const uid = has(b.unique_id) ? String(b.unique_id).trim() : (existing.unique_id || '');
  if (uid && await db.prepare('SELECT 1 x FROM employees WHERE unique_id=? COLLATE NOCASE AND id<>?').get(uid, Number(params.id))) return fail(res, 400, 'This Unique ID is already used by another employee');
  await db.prepare(`UPDATE employees SET name=?,type=?,designation=?,department=?,phone=?,email=?,salary=?,join_date=?,address=?,home_class=?,home_section=?,status=?,
    unique_id=?,guardian_name=?,guardian_relation=?,aadhar_no=?,pan_no=?,highest_qualification=?,core_subject=?,driving_license=? WHERE id=?`)
    .run(b.name, b.type || 'staff', b.designation || '', b.department || '', phone, b.email || '', Number(b.salary) || 0, b.join_date || '', b.address || '', b.home_class || '', b.home_section || '', b.status || 'active',
      uid, has(b.guardian_name) ? String(b.guardian_name).trim() : (existing.guardian_name || ''), has(b.guardian_relation) ? String(b.guardian_relation).trim() : (existing.guardian_relation || ''),
      has(b.aadhar_no) ? String(b.aadhar_no).trim() : (existing.aadhar_no || ''), has(b.pan_no) ? String(b.pan_no).trim().toUpperCase() : (existing.pan_no || ''),
      has(b.highest_qualification) ? String(b.highest_qualification).trim() : (existing.highest_qualification || ''), has(b.core_subject) ? String(b.core_subject).trim() : (existing.core_subject || ''),
      has(b.driving_license) ? String(b.driving_license).trim() : (existing.driving_license || ''), Number(params.id));
  ok(res, { ok: true });
});
route('DELETE', '/api/employees/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  await db.prepare('DELETE FROM employees WHERE id=?').run(Number(params.id));
  ok(res, { ok: true });
});
route('GET', '/api/employees/export/csv', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const rows = await db.prepare('SELECT code,name,type,designation,department,phone,email,salary,join_date,address,status FROM employees ORDER BY code').all();
  const csv = toCSV([['Code','Name','Type','Designation','Department','Phone','Email','Salary','Join Date','Address','Status'], ...rows.map(r => Object.values(r))]);
  res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="employees.csv"' });
  res.end(csv);
});
route('POST', '/api/employees/import', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  const body = await readBody(req);
  const rows = parseCSV(body.csv || '');
  if (rows.length < 2) return fail(res, 400, 'CSV must contain a header row and at least one data row');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (n) => header.indexOf(n.toLowerCase());
  const map = { code: idx('code'), name: idx('name'), type: idx('type'), designation: idx('designation'), department: idx('department'), phone: idx('phone'), email: idx('email'), salary: idx('salary'), join: idx('join date') };
  if (map.name < 0) return fail(res, 400, 'CSV must include a "Name" column');
  let created = 0, skipped = 0, logins = 0;
  try {
    for (const r of rows.slice(1)) {
      const name = (r[map.name] || '').trim();
      if (!name) { skipped++; continue; }
      const code = (r[map.code] || '').trim() || await genEmpCode();
      if (await db.prepare('SELECT 1 x FROM employees WHERE code=?').get(code)) { skipped++; continue; }
      const type = (r[map.type] || 'staff').trim().toLowerCase();
      const er = await db.batch([{ sql: 'INSERT INTO employees (code,name,type,designation,department,phone,email,salary,join_date,status) VALUES (?,?,?,?,?,?,?,?,?,?)', args: [code, name, type, (r[map.designation] || '').trim(), (r[map.department] || '').trim(), (r[map.phone] || '').trim(), (r[map.email] || '').trim(), Number(r[map.salary]) || 0, (r[map.join] || '').trim(), 'active'] }]);
      // every employee gets a login: username = employee code, password = code@123
      if (!await db.prepare('SELECT 1 x FROM users WHERE username=? COLLATE NOCASE').get(code)) {
        const role = type === 'teacher' ? 'teacher' : type === 'admin' ? 'admin' : 'staff';
        await db.batch([{ sql: 'INSERT INTO users (username,password_hash,role,linked_type,linked_id,status,force_password_change) VALUES (?,?,?,?,?,?,1)', args: [code, hashPassword(code + '@123'), role, 'employee', er.lastInsertRowid, 'active'] }]);
        logins++;
      }
      created++;
    }
    ok(res, { created, skipped, logins });
  } catch (e) { fail(res, 400, 'Import failed: ' + e.message); }
});

// ---- salaries ----
route('GET', '/api/salaries', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const month = u.searchParams.get('month') || monthAgoStr(0);
  const employees = await db.prepare("SELECT * FROM employees WHERE status='active' ORDER BY type, name").all();
  // ensure salary rows exist for this month
  try {
    const stmts = [];
    for (const e of employees) {
      const exists = await db.prepare('SELECT 1 x FROM salaries WHERE employee_id=? AND month=?').get(e.id, month);
      if (!exists) {
        const basic = e.salary, allow = Math.round(basic * 0.12), ded = Math.round(basic * 0.08);
        stmts.push({ sql: 'INSERT INTO salaries (employee_id,month,basic,allowances,deductions,net,status) VALUES (?,?,?,?,?,?,?)', args: [e.id, month, basic, allow, ded, basic + allow - ded, 'pending'] });
      }
    }
    if (stmts.length) await db.batch(stmts);
  } catch (e) { /* salaries are best-effort; the read below still works */ }
  const rows = await db.prepare(`SELECT s.*, e.name, e.code, e.type, e.designation FROM salaries s JOIN employees e ON e.id=s.employee_id WHERE s.month=? ORDER BY e.type, e.name`).all(month);
  const paid = rows.filter(r => r.status === 'paid').reduce((a, r) => a + r.net, 0);
  const pending = rows.filter(r => r.status === 'pending').reduce((a, r) => a + r.net, 0);
  ok(res, { salaries: rows, month, stats: { total: rows.length, paidCount: rows.filter(r => r.status === 'paid').length, pendingCount: rows.filter(r => r.status === 'pending').length, paid, pending } });
});
route('POST', '/api/salaries/pay', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  const r = await db.prepare("UPDATE salaries SET status='paid', paid_date=? WHERE employee_id=? AND month=?").run(todayStr(), Number(b.employee_id), b.month);
  ok(res, { ok: r.changes > 0 });
});

// ---- notifications ----
route('GET', '/api/notifications', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const filter = u.searchParams.get('filter') || 'all';
  const all = (await db.prepare('SELECT n.*, u.username creator_name FROM notifications n LEFT JOIN users u ON u.id=n.created_by ORDER BY n.id DESC').all())
    .filter(n => audienceMatches(n.audience, user.role));
  const readIds = new Set((await db.prepare('SELECT notification_id FROM notification_reads WHERE user_id=?').all(user.id)).map(r => r.notification_id));
  const list = all.map(n => ({ ...n, read: readIds.has(n.id) }));
  const out = filter === 'unread' ? list.filter(n => !n.read) : list;
  ok(res, { notifications: out, unreadCount: list.filter(n => !n.read).length });
});
route('POST', '/api/notifications', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager', 'teacher', 'staff']);
  if (!user) return;
  const b = await readBody(req);
  if (!b.title || !b.message) return fail(res, 400, 'Title and message required');
  const audiences = ['all', 'parents', 'teachers', 'staff'];
  const audience = audiences.includes(b.audience) ? b.audience : 'all';
  const types = ['info', 'warning', 'success', 'urgent'];
  const type = types.includes(b.type) ? b.type : 'info';
  const r = await db.prepare('INSERT INTO notifications (title,message,type,audience,created_by) VALUES (?,?,?,?,?)')
    .run(b.title, b.message, type, audience, user.id);
  ok(res, { notification: await db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(r.lastInsertRowid)) });
});
route('PUT', '/api/notifications/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const b = await readBody(req);
  await db.prepare('UPDATE notifications SET title=?,message=?,type=?,audience=? WHERE id=?')
    .run(b.title, b.message, b.type || 'info', b.audience || 'all', Number(params.id));
  ok(res, { ok: true });
});
route('DELETE', '/api/notifications/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  await db.prepare('DELETE FROM notifications WHERE id=?').run(Number(params.id));
  await db.prepare('DELETE FROM notification_reads WHERE notification_id=?').run(Number(params.id));
  ok(res, { ok: true });
});
route('POST', '/api/notifications/:id/read', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  await db.prepare('INSERT OR IGNORE INTO notification_reads (notification_id,user_id) VALUES (?,?)').run(Number(params.id), user.id);
  ok(res, { ok: true });
});
route('POST', '/api/notifications/read-all', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const ids = (await db.prepare('SELECT id FROM notifications').all()).filter(n => audienceMatches(n.audience, user.role)).map(n => n.id);
  for (const id of ids) await db.prepare('INSERT OR IGNORE INTO notification_reads (notification_id,user_id) VALUES (?,?)').run(id, user.id);
  ok(res, { ok: true });
});
route('GET', '/api/notifications/unread-count', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const all = (await db.prepare('SELECT id FROM notifications').all()).filter(n => audienceMatches(n.audience, user.role));
  const readIds = new Set((await db.prepare('SELECT notification_id FROM notification_reads WHERE user_id=?').all(user.id)).map(r => r.notification_id));
  ok(res, { unreadCount: all.filter(n => !readIds.has(n.id)).length });
});

// ---- transport ----
route('GET', '/api/routes', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const rows = await db.prepare(`SELECT r.*, e.name driver_name, e.phone driver_phone,
    (SELECT COUNT(*) FROM students s WHERE s.route_id=r.id AND s.status='active') students_count
    FROM routes r LEFT JOIN employees e ON e.id=r.driver_id ORDER BY r.route_no`).all();
  const stats = {
    totalRoutes: rows.length,
    totalCapacity: rows.reduce((a, r) => a + r.capacity, 0),
    studentsOnBus: (await db.prepare("SELECT COUNT(*) c FROM students WHERE route_id IS NOT NULL AND status='active'").get()).c,
    drivers: (await db.prepare("SELECT COUNT(*) c FROM employees WHERE type='driver' AND status='active'").get()).c
  };
  ok(res, { routes: rows.map(r => ({ ...r, stops: JSON.parse(r.stops || '[]') })), stats });
});
route('GET', '/api/routes/:id', async (req, res, params) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const route = await db.prepare(`SELECT r.*, e.name driver_name, e.phone driver_phone, e.email driver_email, e.code driver_code FROM routes r LEFT JOIN employees e ON e.id=r.driver_id WHERE r.id=?`).get(Number(params.id));
  if (!route) return fail(res, 404, 'Route not found');
  route.stops = JSON.parse(route.stops || '[]');
  const students = await db.prepare('SELECT id,name,admission_no,class,section FROM students WHERE route_id=? AND status=? ORDER BY class,roll_no').all(route.id, 'active');
  const unassigned = await db.prepare("SELECT id,name,admission_no,class,section FROM students WHERE route_id IS NULL AND status='active' ORDER BY class,roll_no").all();
  ok(res, { route, students, unassigned });
});
route('POST', '/api/routes', async (req, res) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  if (!b.route_no) return fail(res, 400, 'Route number required');
  const r = await db.prepare('INSERT INTO routes (route_no,vehicle_no,capacity,monthly_fee,driver_id,stops) VALUES (?,?,?,?,?,?)')
    .run(b.route_no, b.vehicle_no || '', Number(b.capacity) || 0, Number(b.monthly_fee) || 0, b.driver_id ? Number(b.driver_id) : null, JSON.stringify(b.stops || []));
  ok(res, { route: await db.prepare('SELECT * FROM routes WHERE id=?').get(Number(r.lastInsertRowid)) });
});
route('PUT', '/api/routes/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  const b = await readBody(req);
  await db.prepare('UPDATE routes SET route_no=?,vehicle_no=?,capacity=?,monthly_fee=?,driver_id=?,stops=? WHERE id=?')
    .run(b.route_no, b.vehicle_no || '', Number(b.capacity) || 0, Number(b.monthly_fee) || 0, b.driver_id ? Number(b.driver_id) : null, JSON.stringify(b.stops || []), Number(params.id));
  ok(res, { ok: true });
});
route('DELETE', '/api/routes/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager']);
  if (!user) return;
  await db.prepare('DELETE FROM routes WHERE id=?').run(Number(params.id));
  await db.prepare('UPDATE students SET route_id=NULL WHERE route_id=?').run(Number(params.id));
  ok(res, { ok: true });
});
route('POST', '/api/routes/:id/assign', async (req, res, params) => {
  const user = await auth(req, res, ['admin', 'manager', 'staff']);
  if (!user) return;
  const b = await readBody(req);
  if (b.student_id) await db.prepare('UPDATE students SET route_id=? WHERE id=?').run(Number(params.id), Number(b.student_id));
  else if (b.unassign) await db.prepare('UPDATE students SET route_id=NULL WHERE id=?').run(Number(b.unassign));
  ok(res, { ok: true });
});
route('GET', '/api/drivers', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  ok(res, { drivers: await db.prepare("SELECT id,name,code,phone FROM employees WHERE type='driver' AND status='active'").all() });
});

// ---- users ----
route('GET', '/api/users', async (req, res) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const u = new URL(req.url, 'http://x');
  const role = u.searchParams.get('role') || '';
  let sql = `SELECT u.*, COALESCE(e.name, p.name) linked_name FROM users u
    LEFT JOIN employees e ON u.linked_type='employee' AND e.id=u.linked_id
    LEFT JOIN parents p ON u.linked_type='parent' AND p.id=u.linked_id WHERE 1=1`;
  const args = [];
  if (role) { sql += ' AND u.role=?'; args.push(role); }
  sql += ' ORDER BY u.id';
  const users = await db.prepare(sql).all(...args);
  const stats = {
    total: (await db.prepare('SELECT COUNT(*) c FROM users').get()).c,
    admins: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get()).c,
    teachers: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='teacher'").get()).c,
    parents: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='parent'").get()).c,
    managers: (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='manager'").get()).c
  };
  ok(res, { users, stats });
});
route('POST', '/api/users', async (req, res) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const b = await readBody(req);
  if (!b.username || !b.role) return fail(res, 400, 'Username and role required');
  if (await db.prepare('SELECT 1 x FROM users WHERE username=?').get(b.username)) return fail(res, 400, 'Username already exists');
  const roles = ['admin', 'teacher', 'manager', 'staff', 'parent'];
  if (!roles.includes(b.role)) return fail(res, 400, 'Invalid role');
  const tempPass = b.password || `${b.username}@123`;
  if (String(tempPass).length < 6) return fail(res, 400, 'Password must be at least 6 characters');
  const r = await db.prepare('INSERT INTO users (username,password_hash,role,linked_type,linked_id,status,force_password_change) VALUES (?,?,?,?,?,?,1)')
    .run(b.username, hashPassword(tempPass), b.role, b.linked_type || null, b.linked_id ? Number(b.linked_id) : null, b.status || 'active');
  ok(res, { user: await db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid)), tempPassword: tempPass });
});
route('PUT', '/api/users/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const b = await readBody(req);
  const target = await db.prepare('SELECT * FROM users WHERE id=?').get(Number(params.id));
  if (!target) return fail(res, 404, 'User not found');
  if (target.id === user.id && b.status === 'deactivated') return fail(res, 400, 'You cannot deactivate your own account');
  await db.prepare('UPDATE users SET role=?,status=?,linked_type=?,linked_id=? WHERE id=?')
    .run(b.role || target.role, b.status || target.status, b.linked_type != null ? b.linked_type : target.linked_type, b.linked_id ? Number(b.linked_id) : null, Number(params.id));
  ok(res, { ok: true });
});
route('DELETE', '/api/users/:id', async (req, res, params) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const target = await db.prepare('SELECT * FROM users WHERE id=?').get(Number(params.id));
  if (!target) return fail(res, 404, 'User not found');
  if (target.id === user.id) return fail(res, 400, 'You cannot delete your own account');
  await db.prepare('DELETE FROM users WHERE id=?').run(Number(params.id));
  ok(res, { ok: true });
});
route('POST', '/api/users/:id/reset-password', async (req, res, params) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const target = await db.prepare('SELECT * FROM users WHERE id=?').get(Number(params.id));
  if (!target) return fail(res, 404, 'User not found');
  let body = {};
  try { body = await readBody(req); } catch (e) { /* optional body */ }
  const tempPass = (body && body.password) || `${target.username}@123`;
  if (String(tempPass).length < 6) return fail(res, 400, 'Password must be at least 6 characters');
  await db.prepare('UPDATE users SET password_hash=?, force_password_change=1 WHERE id=?').run(hashPassword(tempPass), target.id);
  ok(res, { tempPassword: tempPass, username: target.username });
});
route('POST', '/api/users/import', async (req, res) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const body = await readBody(req);
  const rows = parseCSV(body.csv || '');
  if (rows.length < 2) return fail(res, 400, 'CSV must contain a header row and at least one data row');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (n) => header.indexOf(n.toLowerCase());
  const map = { username: idx('username'), role: idx('role'), linkedType: idx('linked type'), linkedCode: idx('linked code') };
  if (map.username < 0 || map.role < 0) return fail(res, 400, 'CSV must include "Username" and "Role" columns');
  let created = 0, skipped = 0;
  const roles = ['admin', 'teacher', 'manager', 'staff', 'parent'];
  try {
    const stmts = [];
    for (const r of rows.slice(1)) {
      const username = (r[map.username] || '').trim();
      const role = (r[map.role] || '').trim().toLowerCase();
      if (!username || !roles.includes(role)) { skipped++; continue; }
      if (await db.prepare('SELECT 1 x FROM users WHERE username=?').get(username)) { skipped++; continue; }
      let linkedType = null, linkedId = null;
      const ltype = (r[map.linkedType] || '').trim().toLowerCase();
      const lcode = (r[map.linkedCode] || '').trim();
      if (ltype === 'employee' && lcode) { const e = await db.prepare('SELECT id FROM employees WHERE code=?').get(lcode); if (e) { linkedType = 'employee'; linkedId = e.id; } }
      if (ltype === 'parent' && lcode) { const p = await db.prepare('SELECT id FROM parents WHERE name=? OR phone=?').get(lcode, lcode); if (p) { linkedType = 'parent'; linkedId = p.id; } }
      stmts.push({ sql: 'INSERT INTO users (username,password_hash,role,linked_type,linked_id,status,force_password_change) VALUES (?,?,?,?,?,?,1)', args: [username, hashPassword(genTempPassword()), role, linkedType, linkedId, 'active'] });
      created++;
    }
    if (stmts.length) await db.batch(stmts);
    ok(res, { created, skipped });
  } catch (e) { fail(res, 400, 'Import failed: ' + e.message); }
});
route('GET', '/api/users/link-options', async (req, res) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  ok(res, {
    employees: await db.prepare("SELECT id,code,name,type FROM employees WHERE status='active' ORDER BY name").all(),
    parents: await db.prepare("SELECT id,name,phone FROM parents ORDER BY name").all()
  });
});

// ---- parent portal ----
route('GET', '/api/parent/overview', async (req, res) => {
  const user = await auth(req, res, ['parent']);
  if (!user) return;
  const parent = await db.prepare('SELECT * FROM parents WHERE id=?').get(user.linked_id);
  if (!parent) return fail(res, 404, 'Parent record not found');
  const children = await db.prepare(`SELECT s.*, r.route_no, r.vehicle_no FROM students s LEFT JOIN routes r ON r.id=s.route_id WHERE s.parent_id=? AND s.status='active'`).all(parent.id);
  const today = todayStr();
  const out = await Promise.all(children.map(async c => {
    const att = await db.prepare("SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END),0) p FROM attendance WHERE kind='student' AND ref_id=? AND date >= ?").get(c.id, daysAgoStr(89));
    const tod = await db.prepare("SELECT status FROM attendance WHERE kind='student' AND ref_id=? AND date=?").get(c.id, today);
    const totalDue = (await db.prepare('SELECT COALESCE(SUM(total_amount),0) s FROM fee_categories').get()).s;
    const paid = (await db.prepare('SELECT COALESCE(SUM(amount + discount),0) s FROM payments WHERE student_id=?').get(c.id)).s;
    const results = (await db.prepare(`SELECT COUNT(DISTINCT exam_id) c FROM exam_marks m JOIN exams e ON e.id=m.exam_id WHERE m.student_id=? AND e.end_date < ?`).get(c.id, today)).c;
    return {
      ...c, attendancePct: att.c ? Math.round(att.p / att.c * 100) : 100, todayStatus: tod ? tod.status : null,
      feesPaid: paid, feesBalance: Math.max(0, totalDue - paid), hasResults: results > 0
    };
  }));
  const unread = (await db.prepare(`SELECT COUNT(*) c FROM notifications n WHERE (n.audience='all' OR n.audience='parents')
    AND NOT EXISTS (SELECT 1 FROM notification_reads nr WHERE nr.notification_id=n.id AND nr.user_id=?)`).get(user.id)).c;
  ok(res, { parent, children: out, unread });
});
route('GET', '/api/parent/children/:id/attendance', async (req, res, params) => {
  const user = await auth(req, res, ['parent']);
  if (!user) return;
  const owned = await db.prepare('SELECT 1 x FROM students WHERE id=? AND parent_id=?').get(Number(params.id), user.linked_id);
  if (!owned) return fail(res, 403, 'Not your child');
  const u = new URL(req.url, 'http://x');
  const days = Math.min(Number(u.searchParams.get('days') || 60), 180);
  const records = await db.prepare("SELECT date, status FROM attendance WHERE kind='student' AND ref_id=? AND date >= ? ORDER BY date DESC").all(Number(params.id), daysAgoStr(days));
  ok(res, { records });
});
route('GET', '/api/parent/children/:id/fees', async (req, res, params) => {
  const user = await auth(req, res, ['parent']);
  if (!user) return;
  const owned = await db.prepare('SELECT 1 x FROM students WHERE id=? AND parent_id=?').get(Number(params.id), user.linked_id);
  if (!owned) return fail(res, 403, 'Not your child');
  const payments = await db.prepare('SELECT * FROM payments WHERE student_id=? ORDER BY date DESC, id DESC').all(Number(params.id));
  const totalDue = (await db.prepare('SELECT COALESCE(SUM(total_amount),0) s FROM fee_categories').get()).s;
  const paid = payments.reduce((a, p) => a + p.amount + p.discount, 0);
  ok(res, { payments, totalDue, paid, balance: Math.max(0, totalDue - paid) });
});
route('GET', '/api/parent/children/:id/results', async (req, res, params) => {
  const user = await auth(req, res, ['parent']);
  if (!user) return;
  const owned = await db.prepare('SELECT 1 x FROM students WHERE id=? AND parent_id=?').get(Number(params.id), user.linked_id);
  if (!owned) return fail(res, 403, 'Not your child');
  const today = todayStr();
  const exams = await db.prepare('SELECT DISTINCT e.* FROM exam_marks m JOIN exams e ON e.id=m.exam_id WHERE m.student_id=? AND e.end_date < ? ORDER BY e.end_date DESC').all(Number(params.id), today);
  const list = await Promise.all(exams.map(async exam => {
    const roster = await db.prepare('SELECT id FROM students WHERE status=? AND class=? AND section=?').all('active', exam.class, exam.section);
    const marksRows = await db.prepare(`SELECT m.student_id, m.subject_id, m.marks, s.name subject FROM exam_marks m JOIN subjects s ON s.id=m.subject_id WHERE m.exam_id=? AND m.student_id=? ORDER BY m.subject_id`).all(exam.id, Number(params.id));
    const built = buildResults(exam, roster, marksRows);
    return { exam, card: built.results.find(r => r.student.id === Number(params.id)), gradeScale: built.gradeScale, maxTotal: built.maxTotal };
  }));
  ok(res, { results: list });
});

// ---- settings ----
route('GET', '/api/settings', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  ok(res, { settings: await getSettings() });
});
route('PUT', '/api/settings', async (req, res) => {
  const user = await auth(req, res, ['admin']);
  if (!user) return;
  const body = await readBody(req);
  const current = await getSettings();
  for (const [group, values] of Object.entries(body)) {
    if (!current[group] || typeof values !== 'object' || values === null) continue;
    const merged = { ...current[group], ...values };
    await db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(merged), group);
  }
  ok(res, { settings: await getSettings() });
});

// ---- CSV templates ----
route('GET', '/api/templates/students.csv', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const csv = toCSV([
    ['Admission No', 'Name', 'Class', 'Section', 'Roll No', 'Gender', 'DOB', 'Blood Group', 'Religion', 'Category', 'Caste', 'Address', 'Father Name', 'Mother Name', 'Guardian Name', 'Occupation', 'Mobile 1', 'Mobile 2', 'Aadhaar No', 'PEN', 'Admission Date'],
    ['GFS-2026-101', 'Sample Student', '5', 'A', '1', 'M', '2015-01-15', 'O+', 'Hindu', 'General', 'General', 'Bengaluru', 'Sample Father', 'Sample Mother', '', 'Business', '9886000000', '', '123456789012', 'PEN123456', '2026-08-11']
  ]);
  res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="students_template.csv"' });
  res.end(csv);
});
route('GET', '/api/templates/employees.csv', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const csv = toCSV([
    ['Code', 'Name', 'Type', 'Designation', 'Department', 'Phone', 'Email', 'Salary', 'Join Date'],
    ['', 'Sample Employee', 'teacher', 'PGT Mathematics', 'Mathematics', '9886000001', 'emp@mail.com', '40000', '2024-06-01']
  ]);
  res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="employees_template.csv"' });
  res.end(csv);
});
route('GET', '/api/templates/users.csv', async (req, res) => {
  const user = await auth(req, res, null);
  if (!user) return;
  const csv = toCSV([
    ['Username', 'Role', 'Linked Type', 'Linked Code'],
    ['teacher_john', 'teacher', 'employee', 'EMP-011'],
    ['parent_smith', 'parent', 'parent', 'John Smith']
  ]);
  res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="users_template.csv"' });
  res.end(csv);
});

// ---- misc helpers ----
async function linkedName(user) {
  if (user.linked_type === 'employee') {
    const e = await db.prepare('SELECT name, designation FROM employees WHERE id=?').get(user.linked_id);
    return e ? `${e.name}${e.designation ? ' — ' + e.designation : ''}` : '';
  }
  if (user.linked_type === 'parent') {
    const p = await db.prepare('SELECT name FROM parents WHERE id=?').get(user.linked_id);
    return p ? p.name : '';
  }
  return '';
}

// ---------------------------------------------------------------------------
// static file serving
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json'
};
function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const full = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!full.startsWith(PUBLIC_DIR)) { fail(res, 403, 'Forbidden'); return true; }
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
    return true;
  }
  if (!path.extname(pathname)) { // SPA fallback
    const index = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(index)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(index).pipe(res); return true; }
  }
  return false;
}

// ---------------------------------------------------------------------------
// server
// ---------------------------------------------------------------------------
// Request handler shared by the local HTTP server AND the Vercel serverless
// function (api/index.js). Vercel calls it with the same (req, res) pair.
async function handleRequest(req, res) {
  const pathname = req.url.split('?')[0];
  try {
    await ensureDb();
    if (pathname.startsWith('/api/')) {
      const parts = pathname.split('/').filter(Boolean);
      let handled = false;
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const params = match(r.pattern, parts);
        if (!params) continue;
        handled = true;
        try {
          const result = await r.handler(req, res, params);
          if (result !== undefined && !res.writableEnded) ok(res, result);
        } catch (e) {
          console.error(`✗ ${req.method} ${pathname}:`, e.message);
          if (!res.writableEnded) fail(res, 500, e.message || 'Server error');
        }
        break;
      }
      if (!handled) fail(res, 404, `No route for ${req.method} ${pathname}`);
      return;
    }
    if (!serveStatic(req, res, pathname)) fail(res, 404, 'Not found');
  } catch (e) {
    console.error('Server error:', e);
    if (!res.writableEnded) fail(res, 500, e && e.message ? `Server error: ${e.message}` : 'Server error');
  }
}

const server = http.createServer(handleRequest);

// Only bind the port when run directly (node server.js). When imported as a
// module (e.g. by the Vercel serverless function) the handler is exported instead.
if (require.main === module) {
  server.listen(PORT, async () => {
    await ensureDb();
    const s = await getSettings();
    console.log(`\n🏫 ${s.school.name} — School Management System`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   Admin:  admin / admin@123`);
    console.log(`   Manager: manager / manager@123`);
    console.log(`   Staff/Teacher: <employee code> / <code>@123   |   Parent: <admission no> / <admission no>@123`);
    console.log(`   Backups → backups/<date>/ every minute when data changes\n`);
  });
}

module.exports = { handleRequest, server };


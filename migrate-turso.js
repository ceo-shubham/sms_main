// One-off migration: local data/school.db -> Turso (sms-main)
// Run: node --env-file=.env migrate-turso.js
const { initDb, initTurso } = require('./db.js');

(async () => {
  const local = initDb();
  const turso = initTurso({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });

  const tables = (await local.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).map(t => t.name);

  for (const table of tables) {
    const rows = await local.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) { console.log(`${table}: 0 rows (skip)`); continue; }
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(',');
    const ins = `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;
    let n = 0;
    await turso.batch(rows.map(r => ({ sql: ins, args: cols.map(c => r[c]) })));
    n = rows.length;
    console.log(`${table}: ${n} rows migrated`);
  }
  console.log('✅ Migration complete');
  process.exit(0);
})().catch(e => { console.error('MIGRATION FAIL:', e.message); process.exit(1); });

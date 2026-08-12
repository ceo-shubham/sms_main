// migrate-to-mongo.js — one-time script: copy all data from the local SQLite
// database (data/school.db) into MongoDB Atlas.
//
// Usage:  node --env-file=.env migrate-to-mongo.js
// (MONGODB_URI must be set — either in .env or in the environment)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { initMongo } = require('./db');

const DB_PATH = path.join(__dirname, 'data', 'school.db');

// Same table names as the SQLite schema. Order matters only for readability.
const TABLES = [
  'settings', 'employees', 'parents', 'students', 'users', 'attendance',
  'fee_categories', 'payments', 'exams', 'subjects', 'exam_marks',
  'notifications', 'notification_reads', 'routes', 'salaries'
];

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Run with:  node --env-file=.env migrate-to-mongo.js');
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error('No SQLite database found at', DB_PATH);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(DB_PATH);
  const store = await initMongo(uri, { seed: false }); // don't seed — real data comes next

  let total = 0;
  for (const t of TABLES) {
    let rows;
    try {
      rows = sqlite.prepare(`SELECT * FROM ${t}`).all();
    } catch {
      console.log(`- ${t}: table missing, skipped`);
      continue;
    }
    if (!rows.length) { console.log(`- ${t}: 0 rows (empty)`); continue; }

    let maxId = 0;
    for (const r of rows) {
      const doc = { ...r };
      if (typeof doc.id === 'bigint') doc.id = Number(doc.id);
      if (typeof doc.id === 'number') maxId = Math.max(maxId, doc.id);
      await store.col(t).insertOne(doc);
    }
    // keep the AUTOINCREMENT counter ahead of the migrated ids
    if (maxId > 0) {
      await store.db.collection('counters').updateOne({ _id: t }, { $set: { seq: maxId } }, { upsert: true });
    }
    total += rows.length;
    console.log(`- ${t}: ${rows.length} rows migrated`);
  }

  console.log(`\n✅ Done — ${total} rows copied to MongoDB (db: ${store.db.databaseName}).`);
  await store.client.close();
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });

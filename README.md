# 🏫 School Management System

A complete, production-style School Management System — a native HTTP API server backed by SQLite, with a responsive single-page frontend.

## Quick Start (local)

```bash
node server.js
```

Then open **http://localhost:4321** (override the port with `SMS_PORT=xxxx node server.js`, and the backup folder with `SMS_BACKUP_DIR=./mybackups node server.js`).

When `TURSO_URL` is set in `.env`, the app uses a hosted **Turso** database instead of the local file (see below).

## Deploy (Vercel + Turso + Backblaze B2)

The app is serverless-ready: `api/index.js` is the Vercel entry that reuses the same request handler, and `vercel.json` maps `/api/*` to it with `public/` as static files.

1. **Turso** — free signup at turso.tech, create a database, then generate a **database token** (Databases → your db → *Generate Token*). Set `TURSO_URL` and `TURSO_AUTH_TOKEN`. These two env vars make the app use Turso everywhere, including Vercel.
2. **Backblaze B2** — create a Private bucket and an app key limited to that bucket; set `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `B2_ENDPOINT`. Backups are then uploaded to B2 automatically.
3. **Vercel** — import the repo, add all the env vars from `.env.example` (plus `SESSION_SECRET`), and deploy. No code changes needed between local and production.
4. **Migrate existing data** — `node --env-file=.env migrate-turso.js` copies the local `data/school.db` into Turso.

Copy `.env.example` to `.env`, fill in the values, then run `node --env-file=.env server.js` to run with Turso locally.

The database (`data/school.db`) is created fresh on first run — no demo/fake data. The system starts with only two accounts.

### Default accounts

| Role    | Username  | Password      |
| ------- | --------- | ------------- |
| Admin   | `admin`   | `admin@123`   |
| Manager | `manager` | `manager@123` |

Both are available as one-click chips on the login screen.

### How every other account is created

- **Teacher / Staff** — when an admin creates the employee profile, their login is generated automatically: username = **Employee Code** (e.g. `EMP-001`), password = **`code@123`**.
- **Parent** — when a student takes admission, their login is generated automatically: username = **Admission Number** (e.g. `SPS-2026-001`), password = **`admissionid@123`**.

All such accounts are forced to change their password on first login. The admin can reset **any** password from User Management **without the old password** (set a custom one or use the default). Staff, teachers and parents can change their own password from the user menu.

## Features

- **Login page** — two-panel design (form + school illustration), show/hide password eye toggle, live school name + logo branding, forgot-password hint
- **Dashboard** — live stats, monthly fee collection bar chart, gender pie chart, 7-day attendance trend, class-wise strength, notifications, upcoming exams
- **Admission** — one-page form with every field entered manually: Name, **Admission Number (manual, must be unique)**, Class, Section, Date of Birth, Father's Name, Mother's Name, Guardian's Name, Occupation, **2 mobile numbers (+91, 10 digits, at least one required)**, Religion, Caste, Address, **Aadhaar Number**, **PEN**, and Date of Admission (auto-filled, editable). Guardian is auto-chosen Father → Mother → Guardian; the parent login is auto-created. Review step shows everything before admit
- **Students** — full records with the new fields, search, class/gender/status filters, CSV export/template with all columns, detail view with payments & attendance
- **Attendance** — **class teachers can only mark attendance for their own class** (locked roster, no class picker, server-enforced); admin/manager/staff can mark any class plus employees; Present/Absent/Late/Leave, Mark-All buttons, bulk save
- **Fees** — categories with installment structure, collect with discount & mode, auto receipt numbers, paid/pending/overdue tracking, monthly chart
- **Exams & Results** — schedule exams, per-subject marks entry with real-time grade calculation, results with totals/percentages/ranks
- **Report Cards** — printable, school-branded (name + logo) with grade scale and signature lines
- **Employees** — profiles with **Class Teacher assignment (class + section)**, auto login creation (`code` / `code@123`), bulk import, salary management
- **Notifications** — target all/parents/teachers/staff, unread badge, read tracking
- **Transport** — bus routes, stops, timings, driver cards, capacity, student assignment
- **Parents Portal** — children overview, attendance % and alerts, fees, results, transport
- **Users** — role-based accounts, **admin password reset without old password**, force-change on first login, activate/deactivate, bulk import
- **Settings** — **school name + logo upload** (shown on login, sidebar and report cards), academic config, notification channels, security, appearance
- **CSV backups** — automatic backups organised as **date → module** folders (`backups/YYYY-MM-DD/attendance/`, `fees/`, `students/`, …). A module's folder/file is created **only when there is actual data or activity** in it: `attendance/` holds that day's attendance of all classes & staff, `fees/` holds the fees collected that date, master tables (`students`, `employees`, …) are snapshotted only when they change. Empty folders are never created. Each day gets an `index.json`

## Architecture

```
server.js            HTTP server + all API routes (no frameworks)
db.js                SQLite/Turso data layer + schema + bootstrap (admin/manager only)
api/index.js         Vercel serverless entry (reuses the same request handler)
vercel.json          Vercel routing: /api/* -> function, rest -> public/
backup.js            Automatic CSV backups by date → module, uploaded to B2 when configured
migrate-turso.js     One-off: copy local data/school.db into Turso
public/index.html    SPA shell
public/css/app.css   Design system (CSS variables, theming, print styles)
public/js/           api, ui, charts (hand-rolled SVG), router + pages
data/school.db       Local SQLite database (dev only, auto-created, git-ignored)
backups/YYYY-MM-DD/  Daily backups: attendance/, fees/, students/, employees/, …
```

- **Runtime:** Node.js ≥ 22.5 (uses the built-in `node:sqlite` module — Node 24 recommended)
- **API:** JSON REST under `/api/*`, bearer-token auth, role-based access control
- **Charts:** dependency-free inline SVG (bar, line, donut)
- **Passwords:** salted scrypt hashes via `node:crypto`

## Start clean / reset data

Stop the server, then delete the database and backups, and restart:

```bash
rm -rf data backups
node server.js
```

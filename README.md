# 🏫 School Management System

A complete, production-style School Management System built as a **zero-dependency Node.js app** — a native HTTP API server backed by SQLite, with a responsive single-page frontend. No `npm install` required.

## Quick Start

```bash
node server.js
```

Then open **http://localhost:4321** (override the port with `SMS_PORT=xxxx node server.js`, and the backup folder with `SMS_BACKUP_DIR=./mybackups node server.js`).

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
db.js                SQLite schema + clean bootstrap (admin/manager only)
backup.js            Automatic CSV backups by date → module (only where there is data)
public/index.html    SPA shell
public/css/app.css   Design system (CSS variables, theming, print styles)
public/js/           api, ui, charts (hand-rolled SVG), router + pages
data/school.db       SQLite database (auto-created, git-ignored)
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

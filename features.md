# School Management System — Features

## Dashboard
- Overview of key stats: total students, staff, fee collection, bus routes
- Today's attendance count for students and staff
- Monthly fee collection bar chart
- Student gender distribution pie chart
- 7-day attendance trend line chart (students vs staff)
- Class-wise student strength bar view
- Recent notifications panel
- Upcoming exams list
- Time-based greeting for logged-in user

---

## Admission
- Multi-step new student admission form (Student Info → Parent Info → Review)
- Auto-generates admission number
- Simultaneous parent record creation on admission
- Bulk import students and parents via CSV upload
- Option to auto-create parent login accounts during bulk import
- Recent admissions list with search
- Stats: new admissions, active, transferred, total enrolled

---

## Student Management
- Full student records: name, admission number, class, section, roll number, gender, DOB, blood group, religion, category, address
- Add, edit, view, and delete students
- Search by name or admission number
- Filter by class, gender, and status
- Linked parent info visible in student detail view
- Export button for student records
- Stats: total, boys, girls, active students

---

## Attendance
- Daily attendance marking for both students and employees
- Mark status: Present, Absent, Late, Leave
- One-tap "Mark All Present" and "Mark All Absent" buttons
- Filter by class for student attendance
- Date picker to view or edit attendance for any day
- Pre-fills from existing saved records
- Bulk save for the entire class or staff in one action
- Stats: present, absent, late, total count

---

## Fee Management
- Fee category creation with installment structure
- Collect fee with discount and payment mode selection (Cash, Online, Cheque, DD)
- Auto-generates receipt number on collection
- Paid vs pending student list with search
- Monthly fee collection bar chart
- Recent payments table with receipt details
- Quick-collect button from the pending list
- Stats: total collected, paid students, pending students, overdue count

---

## Exams & Results
- Schedule exams with name, type, class, section, dates, total marks, passing marks
- Exam types: Unit Test, Half Yearly, Annual, Pre-Board, Mock
- Per-subject marks entry for individual students
- Real-time grade calculation while entering marks (A+ to F)
- Results table: subject-wise marks, total, percentage, grade, pass/fail
- Stats: total exams, upcoming, completed, marks entries

---

## Report Cards
- Select student and exam to generate a printable report card
- Subject-wise marks with grade and remarks
- Overall percentage, grade, class rank, and pass/fail result
- Grade scale reference table
- Signature section for class teacher, principal, and parent
- Browser print support

---

## Employee Management
- Add and manage teachers, staff, drivers, guards, cleaners, admin
- Employee profiles: code, name, type, designation, department, phone, email, salary, join date
- Bulk import employees via CSV
- Option to auto-create login accounts for employees during bulk import
- View detailed employee profile modal
- Salary management tab: basic, allowances, deductions, net salary, payment status
- Mark salary as paid with one click
- Filter by all / teachers / staff
- Search by name or employee code
- Stats: total employees, teachers, salary paid, pending salaries

---

## Notifications
- Admin can send notifications to all users, parents only, teachers only, or staff
- Notification types: Info, Warning, Success, Urgent
- Quick-send buttons for targeting parents, teachers, or staff
- Edit and delete existing notifications
- Mark individual notifications as read, or mark all as read
- Filter notifications by all / unread
- Non-admin users see only their own notifications
- Unread count badge

---

## Transport
- Add and manage bus routes with route number, vehicle number, capacity, and monthly fee
- Assign a driver from employee list to each route
- View route stops with arrival times
- See students assigned to each route
- Driver info card with contact details
- Stats: total routes, total capacity, students on bus, driver count

---

## Parents Portal
- Dedicated view for parent role after login
- My Children: list of linked children with class and section info
- Attendance tab: day-by-day attendance records, overall attendance percentage with progress bar, low-attendance warning below 75%
- Fees tab: payment history with receipt number, mode, and amount
- Results tab: placeholder shown until marks are entered
- Notifications tab: school alerts with read/unread state
- Transport tab: bus route details with stops and timings
- Unread notification badge on alerts tab

---

## User Management
- Create login accounts for admin, teacher, manager, staff, parent roles
- Link user accounts to employee or parent records
- Role-based color-coded user list
- Filter users by role
- Edit user details and role
- Activate / deactivate accounts
- Admin-reset password with auto-generated temporary password
- Copy email to clipboard
- Bulk import user accounts via CSV
- Force password change on first login
- Last login date display
- Stats: total users, admins, teachers, parents, managers

---

## Settings
- **School Info**: name, tagline, address, phone, email, website, principal name
- **Academic Config**: established year, academic year, affiliation board, affiliation number, currency
- **Notification Settings**: toggle email, SMS, and push notification channels; configure automated alerts for fees, attendance, exams, and results; set fee reminder days
- **Security Settings**: session timeout, password policy, two-factor authentication, login attempt limit, audit logging
- **Appearance**: theme color picker, sidebar style (dark/light), font size selector

---

## Authentication
- Role-based login: admin, teacher, manager, staff, parent
- Admins and staff land on the main dashboard; parents land on the parent portal
- First-login password change enforcement
- Change password gate on first login

---

## Data Import (CSV)
- Bulk import students with parent details
- Bulk import employees with optional login account creation
- Bulk import user accounts with role and linked record
- Downloadable CSV templates for each import type
- Import results feedback

---

## General
- Fully responsive layout — works on mobile, tablet, and desktop
- Mobile bottom navigation
- Role-based route access
- Toast notifications for all actions (success, error)
- Real-time data from backend API
- Loading states and empty states throughout the app

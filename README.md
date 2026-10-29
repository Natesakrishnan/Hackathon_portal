# SYNEX 2026 — Hackathon Registration Portal (Full-Stack Architecture)

> **SYNEX 2026** is a dedicated 36-hour national technology hackathon uniting 1,200+ engineers, designers, and innovators across 6 multidisciplinary domains.
> 
> This repository contains the complete full-stack web application featuring a modern, responsive frontend (HTML5/CSS3/Vanilla JS/Chart.js) and a robust Python Flask backend with MySQL 8 persistence, Razorpay payment gateway integration, secure admin authentication, and automated testing.

---

## 1. System Architecture & Features

### Public & Participant Experience
1. **Public Portal:** Hero section with countdown timer, event highlights, 6 innovation domains (explicitly named *Domains*), schedule preview, prize pool (INR 2,50,000+), rules, and interactive FAQ accordion.
2. **Participant Registration Flow (`/register`):** 
   - 4-step progress stepper
   - Individual (INR 299) vs. Team (INR 999) registration toggle
   - Dynamic team members addition (2 to 4 members total) with real-time validation
   - Atomic database creation of `Participant`, `Team`, `TeamMember`, and `Registration` records
3. **Razorpay Payment Checkout (`/payment`):**
   - Live order creation (`POST /api/payments/create-order`)
   - Official Razorpay modal checkout support in Test Mode
   - Built-in simulation fallback for instant local offline testing
   - Cryptographic HMAC-SHA256 signature verification (`POST /api/payments/verify`)
   - Idempotent webhook processing (`POST /api/payments/webhook`)
4. **Registration Confirmation Pass (`/confirmation`):**
   - Live registration and payment verification from database
   - Printable participant entry badge with QR placeholder and team member listing (`window.print()`)
   - Automated confirmation email dispatch (with safe console logging fallback if SMTP is omitted)

### Organizer Administration Portal
1. **Admin Authentication (`/admin/login`):**
   - Flask-Login session management with Scrypt password hashing
   - Protected dashboard routes (`@login_required`) with HTTP 401 JSON responses for API clients
2. **Admin Dashboard (`/admin/dashboard`):**
   - Live KPI cards: Total registrations, individual vs. team count, total participants, gross revenue, confirmed vs. pending payments
   - Interactive Chart.js analytics: Domain distribution bar chart and payment status doughnut chart
   - Advanced registration table: Real-time search, domain dropdown filtering, and payment status filter
   - **Clickable Team Details Modal:** Inspect all registered members, roles, contact info, and institutions
   - Real-time status update dropdown (`PATCH /api/admin/registrations/<id>/status`)
   - **Clickable CSV & Management Reports:**
     - Full Registrations CSV (`GET /api/admin/reports/registrations.csv`)
     - Executive Summary Report CSV (`GET /api/admin/reports/summary.csv`)
     - Domain Breakdown Report CSV (`GET /api/admin/reports/domains.csv`)
      - Paid Participants & Fee Audit CSV (`GET /api/admin/reports/paid-participants.csv`)
     *(All reports feature automated formula injection prevention escaping `=`, `+`, `-`, `@`, `\t`, `\r`)*
3. **Multi-Channel Announcement Engine (`/api/admin/announcements`):**
   - Broadcast announcements to specific target audiences (`all`, `confirmed`, `pending`)
   - Multi-channel delivery support: Discord webhook (`requests.post`) and SMTP email delivery with honest status telemetry
   - 60-second duplicate broadcast protection / idempotency safeguard
   - Live Dispatches History log table with delivery channel badges, timestamps, and recipient counts
4. **Dynamic Event Configuration (`/api/admin/settings`):**
   - Real-time organizer controls for Event Name, Registration Deadline, Individual Fee, Team Fee, Total Prize Pool, and Registration Open status
   - Atomic database persistence via `EventSetting` key-value store with audit timestamps
   - Instant synchronization with public landing page and countdown timer (`GET /api/config`) without restarting the server
5. **Public Rules & Schedule Editor (`/api/admin/content/rules` & `/api/admin/content/schedule`):**
   - In Event Settings (`#settingsSection`), added interactive editors: **Edit Event Rules** and **Edit Event Schedule**
   - Edit header notice banners, rule guideline sections, and 36-hour schedule milestones across all phases (Pre-Event, Day 1 Sprint, Day 2 Finale)
   - Real-time synchronization with public pages (`/rules`, `/rules.html`, `/schedule`, `/schedule.html`) and dedicated JSON APIs (`/api/public/rules`, `/api/public/schedule`)
   - "Reset to Defaults" button for restoring official guidelines and default 36-hour milestone agenda anytime
   - Complete `@login_required` route security and CSRF-safe JSON mutations
6. **Danger Zone: Participant Records Reset (`/api/admin/reset-participants`):**
   - Modal confirmation safeguard preventing accidental resets
   - Atomically purges all participants, registrations, teams, members, and payment orders while preserving admin credentials and event settings

---

## 2. Technology Stack

- **Backend:** Python 3.10+, Flask 3.1, Flask-SQLAlchemy 3.1, Flask-Migrate 4.1, Flask-Login 0.6, Flask-WTF 1.3, Werkzeug 3.0
- **Database:** MySQL 8.0 (via `PyMySQL` and `cryptography`) with automatic zero-friction SQLite fallback for local development
- **Payment Gateway:** Razorpay Python SDK 2.0 (Test Mode with HMAC verification)
- **Frontend:** Semantic HTML5, Vanilla CSS3 (Custom Design System with CSS variables), Vanilla JavaScript (ES6+), Chart.js
- **Testing:** Pytest 8.0+ (47 unit and integration tests covering registration, payment, admin authentication, CSV reports, announcements, event settings, participant reset, public rules & schedule editors)

---

## 3. Directory Layout

```text
Hackathon_Portal/
│
├── .env.example              # Environment variables template
├── .env                      # Local environment configuration (untracked)
├── config.py                 # App configuration (Dev, Test, Prod with DB fallback)
├── run.py                    # Application entrypoint & auto-setup hook
├── requirements.txt          # Python dependencies
├── README.md                 # Project documentation
├── migrations/               # Alembic database migrations
│
├── app/
│   ├── __init__.py           # Application factory (create_app), blueprints, CLI commands
│   ├── extensions.py         # SQLAlchemy, Migrate, LoginManager, CSRFProtect
│   │
│   ├── models/               # SQLAlchemy ORM Models
│   │   ├── admin.py          # Admin model with password hashing & Flask-Login
│   │   ├── participant.py    # Participant record (name, email, college, phone)
│   │   ├── team.py           # Team and TeamMember models
│   │   ├── registration.py   # Registration record (public_id, type, domain, fee)
│   │   ├── payment.py        # Payment transactions (order_id, payment_id, status)
│   │   ├── event_setting.py  # Dynamic event settings and fee configuration
│   │   ├── announcement.py   # Broadcast announcements & dispatch history
│   │   └── contact_message.py# Contact inquiries
│   │
│   ├── services/             # Core Business Logic Layer
│   │   ├── registration_service.py # Registration validation & atomic persistence
│   │   ├── payment_service.py      # Razorpay order, HMAC verification & webhooks
│   │   ├── admin_service.py        # Dashboard metrics, filtering & CSV exports
│   │   ├── announcement_service.py # Broadcast engine, Discord webhooks & duplicate protection
│   │   └── email_service.py        # Transactional confirmation emails
│   │
│   ├── routes/               # Flask Blueprints & REST Endpoints
│   │   ├── public.py         # Home, rules, schedule, contact & public config APIs
│   │   ├── registration.py   # Register page & registration creation API
│   │   ├── payment.py        # Checkout, confirmation & Razorpay verification APIs
│   │   └── admin.py          # Admin login, dashboard, stats & report APIs
│   │
│   ├── templates/            # Jinja2 HTML Templates
│   │   ├── index.html
│   │   ├── register.html
│   │   ├── payment.html
│   │   ├── confirmation.html
│   │   ├── admin-login.html
│   │   ├── admin-dashboard.html
│   │   ├── rules.html
│   │   ├── schedule.html
│   │   └── contact.html
│   │
│   └── static/               # Static Web Assets
│       ├── css/              # style.css, register.css, payment.css, admin.css
│       ├── js/               # main.js, register.js, payment.js, admin.js
│       └── assets/           # Logos, badges, favicons
│
└── tests/                    # Pytest Test Suite
    ├── conftest.py           # In-memory test client & database fixtures
    ├── test_registration.py  # Registration flow & validation tests
    ├── test_payment.py       # Payment orders, verification & idempotency tests
    ├── test_admin.py         # Admin authentication, metrics, filters & CSV tests
    └── test_public.py        # Public page rendering & contact form tests
```

---

## 4. Windows Quick Start & MySQL 8 Setup Guide

### Step 1: Install or Start MySQL 8 on Windows

Check whether the MySQL service is installed and running:

```powershell
# In PowerShell (Run as Administrator):
Get-Service -Name "*mysql*"
```

If the service status is `Stopped`, start it:
```powershell
Start-Service MySQL80
```

*(If MySQL is not installed, download and install MySQL Server 8 from the official [MySQL Community Installer for Windows](https://dev.mysql.com/downloads/installer/).)*

---

### Step 2: Create MySQL Database and Dedicated Application User

Open the MySQL command line client or run in PowerShell:

```sql
-- Connect as root:
mysql -u root -p

-- 1. Create the database with UTF-8 support:
CREATE DATABASE IF NOT EXISTS synex_hackathon 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- 2. Create the dedicated non-root application user for both localhost and 127.0.0.1:
CREATE USER IF NOT EXISTS 'synex_app'@'localhost' IDENTIFIED BY 'SynexApp#2026!SecureKey';
CREATE USER IF NOT EXISTS 'synex_app'@'127.0.0.1' IDENTIFIED BY 'SynexApp#2026!SecureKey';

-- 3. Grant privileges specifically on synex_hackathon:
GRANT ALL PRIVILEGES ON synex_hackathon.* TO 'synex_app'@'localhost';
GRANT ALL PRIVILEGES ON synex_hackathon.* TO 'synex_app'@'127.0.0.1';
FLUSH PRIVILEGES;

-- Verify connection:
SELECT USER(), CURRENT_USER();
EXIT;
```

---

### Step 3: Configure Environment Variables (`.env`)

Create or update your `.env` file in the project root:

```env
# Flask Application Settings
SECRET_KEY=synex-dev-secret-key-36hr-hackathon-2026-secure
FLASK_APP=run.py
FLASK_ENV=development
FLASK_DEBUG=1

# MySQL 8 Database Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=synex_hackathon
DB_USER=synex_app
DB_PASSWORD=SynexApp#2026!SecureKey

# Set to false to enforce strict MySQL 8 usage (will fail explicitly if MySQL is offline)
# Set to true only if you want automatic fallback to local SQLite (synex_hackathon.db)
USE_SQLITE_FALLBACK=false

# Razorpay Test Credentials (Test Mode)
RAZORPAY_KEY_ID=rzp_test_SYNEX_DEMO_KEY
RAZORPAY_KEY_SECRET=synex_razorpay_secret_test_2026
RAZORPAY_WEBHOOK_SECRET=synex_webhook_secret_test_2026

# Event Fees (in INR)
EVENT_NAME=SYNEX 2026
EVENT_INDIVIDUAL_FEE=299
EVENT_TEAM_FEE=999
EVENT_CURRENCY=INR

# External Integrations (Optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_id/your_webhook_token

# Notifications & Session Lifetime
MAIL_DEFAULT_SENDER=SYNEX Hackathon Team <noreply@synex.org>
ADMIN_SESSION_LIFETIME_HOURS=12
```

---

### Step 4: Install Dependencies

```powershell
# Windows PowerShell:
cd K:\Hackathon_portal
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

---

### Step 5: Check Database Health & Connectivity

Run the built-in database diagnosis command:

```powershell
.\venv\Scripts\python.exe -m flask check-db
```

Expected diagnostic output:
```text
==================================================
 SYNEX Hackathon Portal - Database Health Check
==================================================
[1/6] Database Configuration Loaded:
      - Target Host:     127.0.0.1:3306
      - Database Name:   synex_hackathon
      - DB User:         synex_app
      - Password:        [MASKED/CONFIGURED]
      - SQLite Fallback: Disabled (Strict MySQL)
[2/6] Establishing SQLAlchemy Connection...
      [OK] Connection established successfully.
[3/6] Database Engine Dialect: mysql
      [OK] Active database engine is MySQL 8.
[4/6] Selected Database: synex_hackathon
      [OK] Connected to target database 'synex_hackathon'.
[5/6] Inspecting Database Tables:
      - Found tables (10): admins, alembic_version, announcements, contact_messages, event_settings, participants, payments, registrations, team_members, teams
      [OK] All 10 required application tables exist.
[6/6] Executing Diagnostic Query 'SELECT 1'...
      [OK] Query 'SELECT 1' executed successfully.
==================================================
 Database Health Status: HEALTHY (MySQL Connected)
==================================================
```

---

### Step 6: Initialize Tables & Apply Migrations

```powershell
# Initialize tables and default event settings
.\venv\Scripts\python.exe -m flask init-db

# Or use Flask-Migrate
.\venv\Scripts\python.exe -m flask db upgrade

# (Optional) Seed realistic sample registrations for testing
.\venv\Scripts\python.exe -m flask seed-demo
```

---

### Step 7: Run the Application Server

```powershell
.\venv\Scripts\python.exe run.py
```

Safe startup output displayed:
```text
[OK] Default administrator ready: username='admin'
Database backend: MySQL (Host: 127.0.0.1:3306, DB: synex_hackathon)
[SERVER] SYNEX Hackathon Portal Backend is starting on http://localhost:5000
   - Public Portal:     http://localhost:5000
   - Registration:      http://localhost:5000/register
   - Admin Dashboard:   http://localhost:5000/admin/dashboard
   - Admin Login:       http://localhost:5000/admin/login (admin / Admin@SYNEX2026)
=======================================================
```

---

### Step 8: Run Automated Tests

Automated tests are isolated and run in-memory without altering or polluting your live MySQL database:

```powershell
.\venv\Scripts\python.exe -m pytest -v
```

Expected result: **`41 passed in 7.79s`**.

---

## 5. Troubleshooting & Common Issues

| Issue / Error | Root Cause | Solution |
| :--- | :--- | :--- |
| **`Can't connect to MySQL server on '127.0.0.1' (10061)`** | Windows MySQL service is stopped. | Run PowerShell as Admin: `Start-Service MySQL80`. |
| **`Access denied for user 'synex_app'@'localhost'`** | User credentials or host matching mismatch. | Ensure user exists for both `'synex_app'@'localhost'` and `'synex_app'@'127.0.0.1'` and run `FLUSH PRIVILEGES;`. |
| **`Unknown database 'synex_hackathon'`** | Database has not been created yet. | Execute `CREATE DATABASE IF NOT EXISTS synex_hackathon CHARACTER SET utf8mb4;`. |
| **`Refusing to silently fall back to SQLite`** | `USE_SQLITE_FALLBACK=false` is enforced and MySQL is unreachable. | Start MySQL and verify credentials. If intentional offline development is desired, set `USE_SQLITE_FALLBACK=true` in `.env`. |
| **Special characters in DB password causing URI errors** | Special characters like `@`, `#`, `!` in raw connection strings. | The application builds URIs using `sqlalchemy.engine.URL.create()`, which properly percent-encodes credentials automatically. |
| **`ModuleNotFoundError: No module named 'pymysql'`** | PyMySQL is not installed in current environment. | Run `.\venv\Scripts\python.exe -m pip install pymysql cryptography`. |
| **Missing tables warning in `check-db`** | Tables have not been generated yet. | Run `.\venv\Scripts\python.exe -m flask init-db` to generate all 10 tables. |

---

## 6. Default Credentials & Important URLs

| Page / Feature | URL | Description / Credentials |
| :--- | :--- | :--- |
| **Public Homepage** | `http://localhost:5000/` | Main event landing page |
| **Registration Flow** | `http://localhost:5000/register` | Individual or team registration |
| **Payment Checkout** | `http://localhost:5000/payment` | Razorpay checkout preview |
| **Confirmation Pass** | `http://localhost:5000/confirmation` | Printable badge & confirmation |
| **Organizer Login** | `http://localhost:5000/admin/login` | **Username:** `admin`<br>**Password:** `Admin@SYNEX2026` |
| **Admin Dashboard** | `http://localhost:5000/admin/dashboard` | Organizer console & real-time analytics |
| **Event Rules** | `http://localhost:5000/rules` | Eligibility, IP & evaluation rubric |
| **36-Hour Schedule** | `http://localhost:5000/schedule` | Day-by-day interactive timeline |
| **Contact Desk** | `http://localhost:5000/contact` | Organizer inquiry form |

---

## 7. Security & Hardening Measures

1. **Password Encryption:** Admin passwords are encrypted using Scrypt with salt via `werkzeug.security`.
2. **Session Security:** `HTTPOnly` and `SameSite=Lax` cookies prevent XSS session theft.
3. **Financial Protection:**
   - Entry fees (INR 299 / INR 999) are strictly enforced server-side from `EventSetting`. Client-side fee overrides are impossible.
   - Payment signatures are cryptographically verified using HMAC-SHA256 with constant-time comparison (`hmac.compare_digest`).
   - Webhook processing is idempotent to prevent duplicate status changes.
4. **CSV Injection Prevention:** Cells starting with formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) are automatically escaped with a leading single quote (`'`).
5. **Database Integrity:** Foreign key constraints, unique constraints on team names and participant emails, and transactional rollbacks ensure complete ACID compliance.

---

&copy; 2026 SYNEX Hackathon Organizing Committee. All rights reserved.

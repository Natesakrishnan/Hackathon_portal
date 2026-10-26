# SYNEX 2026 — Hackathon Registration Portal (Frontend Architecture)

> **Role & Objective:** A complete, professional, modern, and responsive single-event Hackathon Registration Portal frontend for **SYNEX 2026 National Innovation Hackathon**. Built with pure web standards (HTML5, CSS3, Vanilla JavaScript) ready for future integration with Python Flask and MySQL.

---

## 1. Project Overview

**SYNEX** is a dedicated 36-hour national technology hackathon uniting 1,200+ engineers, designers, and innovators across 8 multidisciplinary domains. 

This repository houses the complete, standalone frontend application. It provides:
1. **Public Event Information:** Hero with live countdown, 4 statistics cards, about section, 8 innovation domains (explicitly named *Domains*, not *Themes*), schedule timeline preview, prize cards (₹2,50,000+ pool), rules summary, interactive FAQ accordion, and call-to-action sections.
2. **Participant Registration Flow:** 4-step progress indicator, individual vs. team registration toggle, dynamic member cards with configurable limits, client-side validation, fee calculations, and temporary `sessionStorage` draft persistence.
3. **Payment Checkout Preview:** Safe simulation showing order summary, fee breakdown (₹299 individual / ₹999 team), payment method selectors (UPI, Card, NetBanking preview), simulated gateway handshake modal, demo success routing, and failure state previews.
4. **Registration Confirmation Pass:** Complete participant badge/pass with simulated QR code, event instructions, and print-friendly formatting (`window.print()`).
5. **Organizer Admin Portal:** Professional login interface with password visibility toggle, preview notice, and a full-featured admin dashboard displaying 6 key summary metrics, 3 Chart.js analytical charts, search/filter controls, and a demo CSV export utility.
6. **Detailed Supporting Pages:** Complete rules & evaluation rubric (`rules.html`), 36-hour schedule with interactive day filtering (`schedule.html`), and an inquiry form with validation (`contact.html`).

---

## 2. Frontend Technology Stack

- **Markup:** Semantic HTML5 (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`)
- **Styling:** Vanilla CSS3 with CSS Custom Properties (Variables), Flexbox, CSS Grid, media queries, and print styles (`@media print`). *No Tailwind or external CSS frameworks.*
- **Logic:** Vanilla JavaScript (ES6+), native DOM APIs, `sessionStorage` API, and Blob API for CSV downloads. *No React, Vue, Angular, or jQuery.*
- **Typography:** Google Fonts (`Inter`, weights 300 to 800)
- **Icons:** Font Awesome 6.5.1 (via CDN)
- **Data Visualization:** Chart.js (via CDN, with built-in graceful offline fallbacks)
- **Zero Build Step:** Runs immediately in any standard modern web browser without Node.js, npm, or bundlers.

---

## 3. Project Directory Structure

```text
Hackathon_Portal/
│
├── index.html              # Homepage: Hero, countdown, stats, domains, timeline, prizes, FAQ
├── register.html           # 4-step registration: Individual/Team toggle, dynamic members
├── payment.html            # Checkout preview: Order summary, fee breakdown, demo gateway
├── confirmation.html       # Confirmation pass: Printable badge, SVG QR code, next steps
├── admin-login.html        # Organizer login screen: Validation & preview disclaimers
├── admin-dashboard.html    # Admin console: 6 metric cards, 3 Chart.js graphs, table, CSV export
├── rules.html              # Detailed rules: Eligibility, IP retention, judging criteria
├── schedule.html           # 36-hour timeline: Pre-event, Day 1 & Day 2 with interactive tabs
├── contact.html            # Contact & venue information with client-validated inquiry form
│
├── css/
│   ├── style.css           # Core design system tokens, typography, navbar, footer, buttons
│   ├── register.css        # Stepper progress, form layouts, dynamic member cards, sidebar
│   ├── payment.css         # Order breakdown, mock payment channels, modal, printable slip
│   └── admin.css           # Admin login, sidebar navigation, metrics grid, charts, data table
│
├── js/
│   ├── main.js             # Shared config, mobile navigation, countdown timer, FAQ accordion
│   ├── register.js         # Dynamic team members, regex validation, draft sessionStorage
│   ├── payment.js          # Draft retrieval, fee calculator, demo modal, failure preview
│   └── admin.js            # Sample dataset, table search & status filter, Chart.js, CSV export
│
├── assets/
│   └── images/             # Vector brand assets and illustrations
│
└── README.md               # Project documentation and architectural guide
```

---

## 4. How to Open the Website

Because this project requires no compiler or Node.js server, you can run it immediately using any of the following approaches:

### Method A: Direct Browser File Launch (Zero Installation)
1. Navigate to the project root: `k:\Hackathon_portal\` (or your local clone directory).
2. Double-click `index.html` to open it in your default web browser (Chrome, Edge, Firefox, Safari).
3. All local navigation links use relative paths and will work seamlessly.

---

## 5. How to Run with VS Code Live Server

For hot-reloading and development testing:
1. Open Visual Studio Code.
2. Select **File > Open Folder...** and choose the `Hackathon_portal` directory.
3. Install the **Live Server** extension by *Ritwick Dey* (Extension ID: `ritwickdey.LiveServer`) if not already installed.
4. Right-click on `index.html` in the file explorer and click **"Open with Live Server"** (or click the **"Go Live"** button in the bottom status bar).
5. The site will launch automatically at `http://127.0.0.1:5500/index.html`.

---

## 6. How to Configure Sample Event Information

All central event metadata is stored in a clean configuration object in [`js/main.js`](file:///k:/Hackathon_portal/js/main.js):

```javascript
window.SYNEX_CONFIG = {
  eventName: "SYNEX",
  fullName: "SYNEX National Innovation Hackathon 2026",
  tagline: "BUILD THE FUTURE. ONE IDEA AT A TIME.",
  eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  venue: "Dr. APJ Abdul Kalam Tech Auditorium, Tech Campus, Bengaluru",
  format: "36-Hour In-Person & Hybrid Hackathon",
  expectedParticipants: "1,200+",
  totalTeams: "300+",
  duration: "36 Hours",
  prizePool: "₹2,50,000",
  fees: {
    individual: 299,
    team: 999,
    currency: "₹"
  }
};
```
To update the hackathon name, venue, prize pool, or dates, edit this object in [`js/main.js`](file:///k:/Hackathon_portal/js/main.js).

---

## 7. How to Configure Sample Fees

Registration fees are configured in [`js/register.js`](file:///k:/Hackathon_portal/js/register.js) and reflected across the form and payment calculations:

```javascript
const REG_CONFIG = {
  individualFee: 299,      // Individual entry fee in INR
  teamFee: 999,            // Flat team entry fee (for 2 to 4 members)
  currency: "₹",           // Currency symbol
  minTeamSize: 2,          // Minimum allowed team members
  maxTeamSize: 4,          // Maximum allowed team members
  currentTeamSize: 3       // Default starting member count
};
```
- Changing `individualFee` or `teamFee` automatically updates the registration radio pills, the sticky summary card, and the payment checkout total.
- Changing `maxTeamSize` dynamically sets how many team member cards can be added before the "Add Member" button hides.

---

## 8. How to Configure the Countdown Date

The countdown timer in [`js/main.js`](file:///k:/Hackathon_portal/js/main.js) uses `window.SYNEX_CONFIG.eventDate`:
- **Default Behavior:** Sets the countdown target dynamically to **30 days in the future** (`Date.now() + 30 days`), ensuring a realistic, active timer during any evaluation.
- **Fixed Date Configuration:** Replace `eventDate` with any ISO timestamp string:
  ```javascript
  eventDate: "2026-11-14T08:30:00+05:30"
  ```
- **Event Concluded Behavior:** If the target date has passed, the script automatically hides the numeric countdown boxes and displays an accessible alert: *"SYNEX Hackathon is currently live or registration has concluded!"* (avoiding negative numbers).

---

## 9. Which Features are Functional

| Feature | Status | Description |
| :--- | :---: | :--- |
| **Responsive Navigation** | ✅ Functional | Desktop navbar, mobile drawer with outside-click closing and ESC key support. |
| **Live Countdown** | ✅ Functional | Real-time seconds ticking with zero-padded tabular figures and expired state handling. |
| **FAQ Accordion** | ✅ Functional | Expand/collapse with ARIA `aria-expanded` attributes and chevron animation. |
| **Registration Type Switch** | ✅ Functional | Seamless toggle between Individual (₹299) and Team (₹999) layouts. |
| **Dynamic Team Members** | ✅ Functional | Add and remove team members (Member 2 to 4) with automatic index re-calculation. |
| **Form Validation** | ✅ Functional | Validates required fields, college email format, 10-digit Indian phone regex (`/^[6-9]\d{9}$/`), and terms acceptance with inline error hints. |
| **Temporary Draft Persistence**| ✅ Functional | Stores complete validated draft in `sessionStorage` (`synex_registration_draft`) with random reference code (`SYN-DEMO-XXXXX`). |
| **Payment Calculations** | ✅ Functional | Automatically loads draft from `sessionStorage` and calculates itemized order summary. |
| **Demo Payment Gateway** | ✅ Functional | Simulated gateway handshake modal with loader and successful confirmation redirect. |
| **Payment Failure Preview** | ✅ Functional | Dedicated failure screen with retry button and clear disclaimers that no funds were lost. |
| **Printable Participant Pass**| ✅ Functional | Formatted pass slip with SVG QR code mockup and `@media print` layout. |
| **Missing State Protection** | ✅ Functional | Opening `payment.html` or `confirmation.html` without draft data gracefully displays a missing-session alert with a return button. |
| **Admin Table Multi-Filtering** | ✅ Functional | Real-time text search (name, ID, college, domain), status filter dropdown (`paid`, `pending`, `failed`), and domain track dropdown (8 domains). |
| **Participant Details Modal** | ✅ Functional | Clicking any team name or participant opens a rich modal dialog with full leader contact details, department, year, and team members roster. |
| **Sample CSV Export** | ✅ Functional | Generates and downloads a real `.csv` file of the participant dataset using HTML5 Blob APIs. |
| **Interactive Charts** | ✅ Functional | Renders 3 Chart.js graphs (trend line, payment doughnut, domain bar chart) with offline fallback message. |
| **Schedule Day Filter** | ✅ Functional | Filters schedule events by Pre-Event, Day 1, and Day 2. |
| **Contact Form Validation** | ✅ Functional | Validates inquiry fields and displays client-side simulation receipt banner. |

---

## 10. Which Features are Demo-Only

- **Real Payment Processing:** No payment gateway keys (Razorpay, Stripe, PayU, Cashfree) are wired.
- **Admin Authentication:** The login screen does not check a database password; any non-empty input opens the dashboard preview.
- **Permanent Database Storage:** Information is saved only to the user's browser `sessionStorage`, not to an external database.
- **Email/SMS Dispatches:** Pass confirmations and contact messages are simulated client-side.
- **Report Generation & Push Announcements:** Placeholders with informative modal alerts explaining future backend integration.

---

## 11. Why Payment Processing is Not Real

This phase is **FRONTEND ONLY**. A production payment integration requires:
1. **Server-Side API Keys:** Private secret keys must remain on a secure backend server to prevent client exposure.
2. **Cryptographic Webhook Handshakes:** Payment gateways dispatch asynchronous HTTP POST webhooks to the server to verify HMAC-SHA256 signatures before confirming payment.
3. **Database Ledger:** Transactions must be recorded in an ACID-compliant SQL database to prevent double-charging and race conditions.

To keep the frontend strictly safe, compliant, and testable:
- No real card numbers, CVVs, or UPI PINs are ever collected.
- A clearly marked **Demo Gateway Handshake** is provided so reviewers can test the complete user journey.

---

## 12. Why Admin Authentication is Not Connected

True administrative security cannot reside in client-side HTML/JavaScript:
- In production, admin authentication requires a backend session store, encrypted HTTP-only session cookies or JWTs, and server-side role-based access control (RBAC).
- Exposing hardcoded administrative credentials in JavaScript files would be an insecure anti-pattern.
- For this design phase, `admin-login.html` verifies that fields are filled and navigates to `admin-dashboard.html`, which is explicitly labeled as a development layout preview.

---

## 13. How the Frontend Will Later Integrate with Flask & MySQL

When backend development begins, this frontend is structured for easy plug-and-play integration:

### 1. Flask REST Endpoints Mapping
- `POST /api/register`: Replaces the `sessionStorage` logic in [`js/register.js`](file:///k:/Hackathon_portal/js/register.js). Receives JSON payload, validates server-side, inserts into MySQL, and generates an order ID.
- `POST /api/payment/create-order`: Generates a real payment order token from Razorpay/Stripe.
- `POST /api/payment/verify`: Verifies the payment signature and marks the registration as `PAID`.
- `POST /api/admin/login`: Verifies admin bcrypt hash and issues an HTTP-only session cookie.
- `GET /api/admin/registrations`: Populates the table in [`js/admin.js`](file:///k:/Hackathon_portal/js/admin.js) with real MySQL records via `fetch()`.
- `GET /api/admin/analytics`: Feeds live registration counts into the Chart.js visualizers.

### 2. Suggested MySQL Database Schema
```sql
CREATE DATABASE synex_hackathon;

CREATE TABLE registrations (
    id VARCHAR(32) PRIMARY KEY,
    type ENUM('Individual', 'Team') NOT NULL,
    participant_name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    college VARCHAR(200) NOT NULL,
    department VARCHAR(120) NOT NULL,
    year_of_study VARCHAR(30) NOT NULL,
    domain VARCHAR(100) NOT NULL,
    team_name VARCHAR(100) NULL,
    amount DECIMAL(8, 2) NOT NULL,
    payment_status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
    payment_id VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_members (
    id INT AUTO-INCREMENT PRIMARY KEY,
    registration_id VARCHAR(32) NOT NULL,
    member_name VARCHAR(120) NOT NULL,
    member_email VARCHAR(160) NOT NULL,
    FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
);
```

### 3. SessionStorage Disclaimer
> **IMPORTANT:** `sessionStorage` is temporary browser-tab memory. It is cleared as soon as the browser tab is closed. It serves solely as an in-memory client draft bridge between `register.html`, `payment.html`, and `confirmation.html` during this frontend demonstration.

---

## 14. Accessibility & Quality Compliance

- **Color Contrast:** All text meets WCAG AA standards against white (`#FFFFFF`) and light blue (`#F0F7FF`) backgrounds.
- **Focus Rings:** Distinct outline focus indicators (`:focus-visible`) for keyboard navigation.
- **ARIA Attributes:** `aria-expanded`, `aria-label`, `aria-controls`, and `role="status"` on dynamic components.
- **Semantic Structure:** Proper `h1` through `h4` hierarchy on every page.
- **No Insecure Functions:** Zero usage of `eval()` or un-sanitized HTML injection.

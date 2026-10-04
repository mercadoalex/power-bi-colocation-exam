# Power BI Skills Assessment Platform

> A web-based exam platform for training & consultancy — evaluates participant proficiency in Microsoft Power BI and automatically classifies them into Beginner, Intermediate, or Advanced tracks.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Live URLs](#live-urls)
- [Access Code Protection](#access-code-protection)
- [Session Delivery — Trainer Guide](#session-delivery--trainer-guide)
- [Setup & Deployment](#setup--deployment)
  - [1. GitHub Pages](#1-github-pages)
  - [2. AWS Route 53 — Custom Domain](#2-aws-route-53--custom-domain)
  - [3. Supabase — Database & Edge Function](#3-supabase--database--edge-function)
  - [4. Resend — Email Notifications](#4-resend--email-notifications)
  - [5. Power BI — HR Dashboard](#5-power-bi--hr-dashboard)
- [Scoring Logic](#scoring-logic)
- [Database Schema](#database-schema)
- [Managing Access Codes](#managing-access-codes)
- [Viewing Results — HR Guide](#viewing-results--hr-guide)
- [Cost Breakdown](#cost-breakdown)
- [Roadmap](#roadmap)

---

## Overview

This platform allows training coordinators to send participants a single URL and an access code. The participant registers with their name and email, enters the access code, completes a 20-question timed Power BI assessment, and receives an instant result with a training recommendation. All results are stored in Supabase PostgreSQL and HR is notified automatically by email on every submission.

---

## Features

- **Access Code Protection** — Participants must enter a valid session code before starting; validated on both client and server
- **Participant Registration** — First name, last name, corporate email with full validation
- **20-Question Exam** — Mixed difficulty (Beginner / Intermediate / Advanced), single correct answer per question, randomised order per difficulty tier
- **30-Minute Countdown Timer** — Auto-submits on timeout with visual warnings at 5 min and 1 min
- **Instant Level Classification** — Beginner, Intermediate, or Advanced assigned on submission
- **Auto-generated HR Report** — Score breakdown by difficulty tier, training recommendation, full question review
- **Print / Save as PDF** — Native browser print dialog, zero dependencies
- **Supabase Edge Function** — Server-side validation, scoring, classification, DB persist, HTML report generation, HR email
- **Offline Fallback** — If Edge Function is unreachable, exam scores locally in the browser so participants never see a broken screen
- **GitHub Actions** — Auto-deploys Edge Function on every push to `main`
- **Power BI Ready** — `exam_results_summary` and `exam_stats` views pre-built for immediate dashboard connection

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JS | Exam UI — zero framework dependencies, single file |
| Hosting | GitHub Pages | Static file hosting, free, HTTPS |
| DNS | AWS Route 53 | Custom domain routing |
| Backend | Supabase Edge Functions (Deno / TypeScript) | Validate, score, classify, save, generate report, email HR |
| Database | Supabase (PostgreSQL) | Stores all participant results |
| Storage | Supabase Storage | Stores generated HTML reports per participant |
| CI/CD | GitHub Actions | Auto-deploys Edge Function on push |
| Notifications | Resend.com | HR email alerts on submission |
| HR Dashboard | Power BI Service | Live reporting on exam results |

---

## Architecture

```
Participant Browser
  https://exam.rootaccess.news  (custom domain via AWS Route 53)
         │
         │  1. Enter access code + registration form
         │  2. Take 20-question timed exam
         │  3. POST answers to Edge Function
         ▼
  Supabase Edge Function
  https://uzelhlkezkwwpzeydtwi.supabase.co/functions/v1/submit-exam
         │
         │  Validate access code + fields
         │  Score against server-side answer key
         │  Classify: Beginner / Intermediate / Advanced
         │
         ├──► INSERT into exam_results (PostgreSQL)
         ├──► Upload HTML report to exam-reports (Storage)
         ├──► Send HR email via Resend
         └──► Return JSON result to browser
                    │
                    ▼
         Browser renders result page
         (score, level, breakdown, recommendation, question review)

HR Reporting:
  Supabase Table Viewer  ──►  view / filter / export CSV
  Power BI Desktop       ──►  connect via PostgreSQL → publish dashboard
  Email inbox            ──►  one email per submission (via Resend)
```

---

## Project Structure

```
power-bi-colocation-exam/
├── index.html                            # Full exam UI — single file, zero dependencies
├── README.md                             # This file
├── .github/
│   └── workflows/
│       └── deploy.yml                    # Auto-deploys Edge Function on push to main
└── supabase/
    ├── setup.sql                         # Run once in Supabase SQL Editor
    └── functions/
        └── submit-exam/
            └── index.ts                  # Edge Function: validate, score, save, email
```

---

## Live URLs

| Resource | URL |
|---|---|
| **Exam** | https://exam.rootaccess.news |
| **HR Dashboard** | https://exam.rootaccess.news/dashboard.html *(password protected)* |
| **Edge Function** | https://uzelhlkezkwwpzeydtwi.supabase.co/functions/v1/submit-exam |
| **Supabase Dashboard** | https://supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi |
| **Function Logs** | https://supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi/functions |
| **DB Table Viewer** | https://supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi/editor |
| **Storage Bucket** | https://supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi/storage/buckets/exam-reports |
| **GitHub Repo** | https://github.com/mercadoalex/power-bi-colocation-exam |

---

## Access Code Protection

Every exam submission is protected by a session access code validated on **both the client and the server**.

- The browser checks the code against `VALID_CODES` in [`index.html`](index.html) before the exam starts
- The Edge Function re-validates the code against the `EXAM_ACCESS_CODES` Supabase secret — bypass of the browser check is rejected server-side
- No result is ever saved without a valid code

### Current active codes

| Code | Use for |
|---|---|
| `PBI-2025` | Default / general sessions |
| `TRAIN-01` | Training group 1 |
| `CONSUL-02` | Consultancy group 2 |

### Rotate codes between sessions

**Step 1 — Update Supabase secret:**
```bash
supabase secrets set \
  EXAM_ACCESS_CODES="NEWCODE-JAN,NEWCODE-FEB" \
  --project-ref uzelhlkezkwwpzeydtwi
```

**Step 2 — Update `index.html` line ~512 to match:**
```js
const VALID_CODES = ['NEWCODE-JAN', 'NEWCODE-FEB'];
```

**Step 3 — Commit and push:**
```bash
git add index.html
git commit -m "config: rotate access codes for new session"
git push
```

---

## Session Delivery — Trainer Guide

### Before the session (coordinator)

1. Decide which access code to use for this cohort (or generate a new one — see above)
2. Send the trainer this message:

```
Hi [Trainer],

Please share the following with participants at the START of the session only.
Do not distribute beforehand.

📋 Power BI Skills Assessment
──────────────────────────────
URL:   https://exam.rootaccess.news
Code:  PBI-2025
──────────────────────────────
⏱ 30 minutes | 20 questions | Individual work

Results and training placement are generated automatically.
HR receives a notification for each submission.
```

### During the session (trainer)

- Share the URL and code **verbally or on the projector screen** — not via email/chat in advance
- Participants complete registration, enter the code, and take the exam independently
- Each participant sees their result and training recommendation immediately on screen

### After the session (HR / coordinator)

Check results in any of these ways:

| Method | Where |
|---|---|
| Supabase table viewer | [Dashboard → Table Editor → exam_results](https://supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi/editor) |
| Power BI dashboard | Connect to `exam_results_summary` view — see setup below |
| Email | One email per participant lands in HR inbox (requires Resend setup) |
| Export CSV | Supabase Table Editor → download button |

---

## Setup & Deployment

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`brew install supabase/tap/supabase`)
- GitHub account with repo access
- AWS account with a hosted zone in Route 53 (for custom domain)

### 1. GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set **Source** → `Deploy from branch` → `main` → `/ (root)` → **Save**
4. Exam is live at `https://exam.rootaccess.news`

> ✅ Already done — exam is live.

---

### 2. AWS Route 53 — Custom Domain

**In Route 53:**
1. Open your Hosted Zone in the AWS Console
2. Create a new record:
   - **Type:** `CNAME`
   - **Name:** `exam` → resolves to `exam.rootaccess.news`
   - **Value:** `mercadoalex.github.io`
3. Save (propagation: 1–5 minutes)

**In GitHub:**
1. Go to **Settings → Pages → Custom domain**
2. Enter `exam.rootaccess.news`
3. Enable **Enforce HTTPS**

Participants access the exam at `https://exam.rootaccess.news` ✅

---

### 3. Supabase — Database & Edge Function

#### Project details

| Field | Value |
|---|---|
| Project ref | `uzelhlkezkwwpzeydtwi` |
| Project URL | `https://uzelhlkezkwwpzeydtwi.supabase.co` |
| DB host | `db.uzelhlkezkwwpzeydtwi.supabase.co:5432` |
| Edge Function URL | `https://uzelhlkezkwwpzeydtwi.supabase.co/functions/v1/submit-exam` |

#### 3a. Run SQL setup (one time)

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi/sql)
2. Paste and run the full contents of [`supabase/setup.sql`](supabase/setup.sql)

This creates:
- `exam_results` table with constraints, indexes, RLS policies
- `exam-reports` storage bucket (public, for HTML report links)
- `exam_results_summary` view — flat view optimised for Power BI
- `exam_stats` view — KPI aggregates (totals and % per level)

> ✅ Already done.

#### 3b. Deploy the Edge Function

```bash
# Install CLI
brew install supabase/tap/supabase

# Login and link
supabase login
supabase link --project-ref uzelhlkezkwwpzeydtwi

# Set runtime secrets
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set HR_EMAIL=hr@yourcompany.com
supabase secrets set EXAM_ACCESS_CODES="PBI-2025,TRAIN-01,CONSUL-02"

# Deploy
supabase functions deploy submit-exam --project-ref uzelhlkezkwwpzeydtwi
```

> ✅ Already done. Auto-redeploys via GitHub Actions on every push to `main` that touches `supabase/functions/**`.

#### 3c. GitHub Actions auto-deploy

The workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) redeploys the Edge Function automatically on every push.

Add this secret once in **GitHub → Settings → Secrets → Actions**:

| Secret name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Generate at [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |

#### What the Edge Function does

| Step | Action |
|---|---|
| 1 | Validates access code against `EXAM_ACCESS_CODES` secret |
| 2 | Validates participant fields (name, email format) |
| 3 | Scores exam against the server-side answer key |
| 4 | Classifies: Beginner / Intermediate / Advanced |
| 5 | Inserts record into `exam_results` (PostgreSQL) |
| 6 | Generates full HTML report → uploads to `exam-reports` storage |
| 7 | Sends HR notification email via Resend |
| 8 | Returns JSON result to the browser |

> **Offline fallback:** if the Edge Function is unreachable, `index.html` scores locally so the participant still sees their result. The result will not be persisted in that case.

#### Current Supabase secrets

| Secret | Value |
|---|---|
| `RESEND_API_KEY` | `placeholder` — update when Resend account is created |
| `HR_EMAIL` | `hr@yourcompany.com` — update to real HR email |
| `EXAM_ACCESS_CODES` | `PBI-2025,TRAIN-01,CONSUL-02` |

---

### 4. Resend — Email Notifications

HR receives one email per exam submission automatically.

1. Create a free account at [resend.com](https://resend.com) — 3,000 emails/month free
2. Go to **Domains → Add Domain** → verify your sending domain
3. Go to **API Keys → Create API Key** → copy the key (starts with `re_`)
4. Update the Supabase secret:
   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_yourrealkey \
     HR_EMAIL=hr@yourcompany.com \
     --project-ref uzelhlkezkwwpzeydtwi
   ```
5. Update the `from` address in [`supabase/functions/submit-exam/index.ts`](supabase/functions/submit-exam/index.ts):
   ```ts
   from: "assessments@yourdomain.com",  // must match your verified Resend domain
   ```
6. Redeploy:
   ```bash
   supabase functions deploy submit-exam --project-ref uzelhlkezkwwpzeydtwi
   ```

HR email format:
```
Subject: [Assessment] María García — Advanced (80%)

Participant:  María García
Email:        m.garcia@company.com
Score:        16 / 20 (80%)
Level:        Advanced
Track:        Power BI Advanced Analytics & Governance (2 days)
Time used:    18:42
Submitted:    15 Jan 2025 at 09:34
```

---

### 5. Power BI — HR Dashboard

1. Open **Power BI Desktop**
2. **Get Data → PostgreSQL database**
3. Enter the connection details:

   | Field | Value |
   |---|---|
   | Server | `db.uzelhlkezkwwpzeydtwi.supabase.co:5432` |
   | Database | `postgres` |
   | Username | `postgres` |
   | Password | your Supabase DB password (Settings → Database → Reset if needed) |

   Full connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.uzelhlkezkwwpzeydtwi.supabase.co:5432/postgres
   ```

4. Select these views:
   - `exam_results_summary` — full participant list, flat columns, ready for visuals
   - `exam_stats` — KPI aggregates (totals and % per level)

5. Suggested visuals:
   - **Bar chart** — count of participants by level (Beginner / Intermediate / Advanced)
   - **Line chart** — submissions over time
   - **Table** — full participant list with name, email, score, level, date
   - **Card** — average score, total participants, pass rate

6. **Publish to Power BI Service** → share dashboard link with HR

---

## Scoring Logic

| Raw Score | Percentage | Level Assigned | Recommended Track | Duration |
|---|---|---|---|---|
| 0 – 9 / 20 | 0 – 45% | 🔵 Beginner | Power BI Fundamentals | 2–3 days |
| 10 – 15 / 20 | 50 – 75% | 🟡 Intermediate | Power BI Data Modeling & DAX | 2 days |
| 16 – 20 / 20 | 80 – 100% | 🟢 Advanced | Power BI Advanced Analytics & Governance | 2 days |

### Question Distribution

| Difficulty | Count | Topics Covered |
|---|---|---|
| Beginner | 8 | Data sources, visuals, slicers, dashboards, Power Query basics, file formats |
| Intermediate | 7 | DAX (CALCULATE, RELATED, ALL), relationships, star schema, Gateway, Merge Queries |
| Advanced | 5 | DirectQuery vs Import, USERELATIONSHIP, RLS, composite models, RANKX |

---

## Database Schema

```sql
exam_results
├── id                  uuid          PRIMARY KEY  (auto-generated)
├── first_name          text          NOT NULL
├── last_name           text          NOT NULL
├── email               text          NOT NULL
├── score               int           NOT NULL  -- raw correct answers (0–20)
├── percentage          int           NOT NULL  -- 0–100
├── level               text          NOT NULL  -- 'Beginner' | 'Intermediate' | 'Advanced'
├── correct             int           NOT NULL
├── wrong               int           NOT NULL
├── skipped             int           NOT NULL
├── time_used           text          NOT NULL  -- "MM:SS"
├── answers             jsonb                   -- { "0": 1, "1": 3, ... }
├── breakdown           jsonb                   -- { beginner: {correct,total,pct}, ... }
├── recommendation      text
├── taken_at            timestamptz   DEFAULT now()
├── session_name        text          NOT NULL  DEFAULT 'Session 1'
├── focus_lost          int           NOT NULL  DEFAULT 0
├── copy_attempts       int           NOT NULL  DEFAULT 0
├── time_per_question   int[]                   -- seconds per question slot [0..19]
├── avg_time_per_q      int           NOT NULL  DEFAULT 0
├── suspicious          boolean       NOT NULL  DEFAULT false
└── suspicious_flags    text[]                  -- human-readable flag reasons
```

Indexes: `level`, `taken_at DESC`, `email`
RLS: HR (authenticated) can read all rows; no client updates or deletes.

---

## Managing Access Codes

### Add or rotate codes

```bash
# Set new codes (comma-separated, case-insensitive)
supabase secrets set \
  EXAM_ACCESS_CODES="PBI-MAR2025,TRAIN-03" \
  --project-ref uzelhlkezkwwpzeydtwi
```

Update the matching array in [`index.html`](index.html):
```js
const VALID_CODES = ['PBI-MAR2025', 'TRAIN-03'];
```

Commit and push — GitHub Pages updates in ~30 seconds.

### Invalidate a code mid-session

Remove it from both the Supabase secret and the `VALID_CODES` array in `index.html`, then push.
Participants who already passed the code and are mid-exam are unaffected (the timer continues).
New attempts with the old code will be rejected.

---

## Viewing Results — HR Guide

### Option 1 — Supabase Table Viewer (no setup needed)
1. Go to [supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi/editor](https://supabase.com/dashboard/project/uzelhlkezkwwpzeydtwi/editor)
2. Select `exam_results_summary` from the left panel
3. Filter by `level`, `exam_date`, or `email` as needed
4. Click **Download CSV** to export

### Option 2 — Power BI Dashboard
Connect Power BI Desktop to Supabase using the PostgreSQL connection string above.
Use `exam_results_summary` and `exam_stats` views — both are pre-built for reporting.

### Option 3 — Email (after Resend setup)
HR receives one formatted email per submission automatically — no login required.

### Option 4 — HTML Report per Participant
Each submission generates a full HTML report stored at:
```
https://uzelhlkezkwwpzeydtwi.supabase.co/storage/v1/object/public/exam-reports/reports/[result-id].html
```
The report URL is returned in the Edge Function response and shown as an "Open Full Report" button on the participant's result screen.

---

## Cost Breakdown

| Service | Purpose | Cost |
|---|---|---|
| GitHub Pages | Hosts the exam | **Free** |
| GitHub Actions | Auto-deploys Edge Function | **Free** (2,000 min/month) |
| AWS Route 53 | Custom domain DNS | **~$0.50/mo** (already owned) |
| Supabase | DB + Edge Functions + Storage | **Free** (500 MB, 500k function calls/month) |
| Resend | HR email notifications | **Free** (3,000 emails/month) |
| Power BI Service | HR results dashboard | **Free** (Power BI free tier) |
| **Total** | | **~$0.50/mo** |

---

## Roadmap

- [x] Registration with name, last name, email validation
- [x] 20-question timed exam (Beginner / Intermediate / Advanced)
- [x] Auto-scoring and level classification
- [x] Auto-generated HR report with question review
- [x] Print / Save as PDF
- [x] Supabase Edge Function — server-side validation, scoring, DB persist
- [x] HTML report generation and storage
- [x] GitHub Pages hosting
- [x] GitHub Actions auto-deploy
- [x] Access code protection (client + server)
- [x] Point AWS domain → `exam.rootaccess.news` ✅
- [ ] Resend email notifications — update with real API key and domain
- [ ] Power BI dashboard — connect and publish to Power BI Service
- [ ] Question bank expansion — randomise 20 questions from a larger pool
- [ ] Multi-language support — Spanish / English toggle
- [ ] Prevent duplicate submissions from the same email per session
- [ ] Cohort tagging — tag participants by session date or group
- [ ] Admin panel — view, filter, and export results without Supabase login

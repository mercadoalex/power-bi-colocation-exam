date,# Power BI Skills Assessment Platform

> A web-based exam platform for training & consultancy — evaluates participant proficiency in Microsoft Power BI and automatically classifies them into Beginner, Intermediate, or Advanced tracks.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Setup & Deployment](#setup--deployment)
  - [1. GitHub Pages](#1-github-pages)
  - [2. AWS Route 53 — Custom Domain](#2-aws-route-53--custom-domain)
  - [3. Supabase — Database & Edge Function](#3-supabase--database--edge-function)
  - [4. Resend — Email Notifications](#4-resend--email-notifications)
  - [5. Power BI — HR Dashboard](#5-power-bi--hr-dashboard)
- [Scoring Logic](#scoring-logic)
- [Database Schema](#database-schema)
- [Cost Breakdown](#cost-breakdown)
- [Roadmap](#roadmap)

---

## Overview

This platform allows training coordinators to send participants a single URL. The participant registers with their name and email, completes a 20-question timed Power BI assessment, and receives an instant result. All results are stored in a cloud database and HR is notified automatically by email on every submission.

---

## Features

- **Participant Registration** — First name, last name, corporate email with client-side validation
- **20-Question Exam** — Mixed difficulty (Beginner / Intermediate / Advanced), single correct answer per question
- **30-Minute Countdown Timer** — Auto-submits on timeout with visual warnings
- **Instant Level Classification** — Beginner, Intermediate, or Advanced assigned on submission
- **Auto-generated HR Report** — Score breakdown by difficulty tier, training recommendation, full question review
- **Print / Save as PDF** — Native browser print dialog, zero dependencies
- **Supabase Integration** — All results persisted to PostgreSQL in real time
- **Email Notifications** — HR receives an email on every exam submission via Resend
- **Power BI Dashboard** — Live HR reporting dashboard connected directly to Supabase
- **Custom Domain** — Served over HTTPS from your AWS Route 53 domain via GitHub Pages

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | HTML5 / CSS3 / Vanilla JS | Exam UI, no framework dependencies |
| Hosting | GitHub Pages | Static file hosting |
| DNS | AWS Route 53 | Custom domain routing |
| Database | Supabase (PostgreSQL) | Stores all participant results |
| Notifications | Resend.com | HR email alerts on submission |
| HR Dashboard | Power BI Service | Live reporting on exam results |

---

## Architecture

```
Participant Browser
  https://exam.yourdomain.com
         │
         │  Registration + Exam
         │
         ▼
  GitHub Pages (index.html)
  ── served via AWS Route 53 CNAME ──►  exam.yourdomain.com
         │
         │  fetch() POST on exam completion
         ▼
  Supabase (PostgreSQL)
  table: exam_results
         │
         ├──► Power BI Service (PostgreSQL connector)
         │    Live HR dashboard — scores, levels, trends
         │
         └──► Supabase Edge Function / Resend
              Email notification to HR on each submission
```

---

## Project Structure

```
powerbi-exam/
├── index.html                          # Exam UI — posts to Edge Function on submit
├── README.md                           # This file
└── supabase/
    ├── setup.sql                       # Run once in Supabase SQL Editor
    └── functions/
        └── submit-exam/
            └── index.ts               # Edge Function: validate, score, save, email
```

---

## Setup & Deployment

### 1. GitHub Pages

1. Create a GitHub repository named `powerbi-exam`
2. Push `index.html` to the `main` branch
3. Go to **Settings → Pages**
4. Set **Source** to `Deploy from branch` → `main` → `/ (root)`
5. GitHub will publish the site at `https://yourorg.github.io/powerbi-exam`

---

### 2. AWS Route 53 — Custom Domain

**In Route 53:**

1. Open your Hosted Zone in the AWS Console
2. Create a new record:
   - **Record type:** CNAME
   - **Name:** `exam` (resolves to `exam.yourdomain.com`)
   - **Value:** `yourorg.github.io`
3. Save the record (propagation takes 1–5 minutes)

**In GitHub:**

1. Go to **Settings → Pages → Custom domain**
2. Enter `exam.yourdomain.com`
3. Enable **Enforce HTTPS** — GitHub provisions the SSL certificate automatically

Participants now access the exam at `https://exam.yourdomain.com` ✅

---

### 3. Supabase — Database & Edge Function

#### 3a. Create project & run SQL setup

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Open the **SQL Editor** and paste + run the entire contents of [`supabase/setup.sql`](supabase/setup.sql)
   - Creates `exam_results` table with indexes and RLS
   - Creates `exam-reports` storage bucket
   - Creates `exam_results_summary` and `exam_stats` views for Power BI

#### 3b. Deploy the Edge Function

Install the Supabase CLI, then:

```bash
# Log in and link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set required environment variables (secrets)
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set HR_EMAIL=hr@yourcompany.com

# Deploy the function
supabase functions deploy submit-exam
```

The function URL will be:
```
 is https://uzelhlkezkwwpzeydtwi.supabase.co/functions/v1/submit-exam
```

#### 3c. Update index.html config

Open `index.html` and replace the config line at the top of the `<script>` block:

```js
const SUPABASE_FUNCTION_URL = 'https://uzelhlkezkwwpzeydtwi.supabase.co/functions/v1/submit-exam';
```

#### What the Edge Function does

| Step | Action |
|---|---|
| 1 | Validates participant fields and answer payload |
| 2 | Scores exam against the server-side answer key |
| 3 | Classifies result: Beginner / Intermediate / Advanced |
| 4 | Inserts record into `exam_results` (PostgreSQL) |
| 5 | Generates a full HTML report and uploads to `exam-reports` storage |
| 6 | Sends HR notification email via Resend with score, level, and recommendation |
| 7 | Returns JSON result to the browser |

> **Offline fallback:** if the Edge Function is unreachable, `index.html` scores the exam locally in the browser so the participant still sees their result. The result will not be saved to the database in that case.

---

### 4. Resend — Email Notifications

1. Create a free account at [resend.com](https://resend.com) (3,000 emails/month free)
2. Verify your sending domain at Resend → Domains
3. Generate an API key
4. Set the secret in Supabase (already done in step 3b above):
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
   supabase secrets set HR_EMAIL=hr@yourcompany.com
   ```
5. Update the `from` address in [`supabase/functions/submit-exam/index.ts`](supabase/functions/submit-exam/index.ts):
   ```ts
   from: "assessments@yourdomain.com",  // must match your verified Resend domain
   ```

HR receives an email like:
```
Subject: New Assessment Submission — María García

Participant:  María García (m.garcia@company.com)
Score:        16 / 20  (80%)
Level:        Advanced
Time used:    18:42
Submitted:    15 January 2025 at 09:34

View all results: https://app.supabase.com/project/your-project/editor
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
   | Password | your Supabase DB password |

   Full connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.uzelhlkezkwwpzeydtwi.supabase.co:5432/postgres
   ```

4. Select these views (created by `setup.sql`):
   - `exam_results_summary` — full participant list, flat columns, ready for visuals
   - `exam_stats` — KPI aggregates (totals and % per level)
5. Build visuals:
   - Bar chart — count of participants by level
   - Line chart — submissions over time
   - Table — full participant list with scores
   - Card visuals — average score, pass rate, total participants
6. Publish to **Power BI Service** and share the dashboard link with HR

---

## Scoring Logic

| Raw Score | Percentage | Level Assigned | Recommended Track |
|---|---|---|---|
| 0 – 9 / 20 | 0 – 45% | 🔵 Beginner | Power BI Fundamentals (2–3 days) |
| 10 – 15 / 20 | 50 – 75% | 🟡 Intermediate | Power BI Data Modeling & DAX (2 days) |
| 16 – 20 / 20 | 80 – 100% | 🟢 Advanced | Power BI Advanced Analytics & Governance (2 days) |

### Question Distribution

| Difficulty | Questions | Topics Covered |
|---|---|---|
| Beginner | 8 | Data sources, visuals, slicers, Power Query basics, file formats |
| Intermediate | 7 | DAX (CALCULATE, RELATED), relationships, star schema, Gateway, Merge Queries |
| Advanced | 5 | DirectQuery vs Import, RLS, composite models, RANKX, inactive relationships |

---

## Database Schema

```sql
exam_results
├── id          uuid          PRIMARY KEY
├── first_name  text          NOT NULL
├── last_name   text          NOT NULL
├── email       text          NOT NULL
├── score       int           NOT NULL  -- raw correct answers (0-20)
├── percentage  int           NOT NULL  -- 0-100
├── level       text          NOT NULL  -- 'Beginner' | 'Intermediate' | 'Advanced'
├── correct     int           NOT NULL
├── wrong       int           NOT NULL
├── skipped     int           NOT NULL
├── time_used   text          NOT NULL  -- e.g. "18:42"
├── answers     jsonb                   -- full answer map { questionIndex: selectedOption }
└── taken_at    timestamptz   DEFAULT now()
```

---

## Cost Breakdown

| Service | Purpose | Cost |
|---|---|---|
| GitHub Pages | Hosts the exam | **Free** |
| AWS Route 53 | Custom domain DNS | **~$0.50/mo** (already owned) |
| Supabase | PostgreSQL database | **Free** (500 MB, unlimited rows) |
| Resend | HR email notifications | **Free** (3,000 emails/month) |
| Power BI Service | HR results dashboard | **Free** (Power BI free tier) |
| **Total** | | **~$0.50/mo** |

---

## Roadmap

- [ ] Supabase integration — persist results on exam completion
- [ ] Resend email notifications — HR alert on every submission
- [ ] Power BI dashboard — live HR reporting connected to Supabase
- [ ] Admin panel — view, filter, and export all results
- [ ] Question bank expansion — randomize question selection per session
- [ ] Multi-language support — Spanish / English toggle
- [ ] Session token — prevent duplicate submissions from same email
- [ ] Cohort tagging — tag participants by training group or date

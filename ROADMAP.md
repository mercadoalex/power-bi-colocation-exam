# KMMX Power BI Assessment Platform — Roadmap

## ✅ Shipped

- Registration with access code gate
- 20-question timed exam (25 min), Beginner / Intermediate / Advanced classification
- Auto-scoring + instant result page
- Participant personal result email (Resend)
- Coordinator backup email copy
- HR Dashboard — KPIs, participant table, session filter, CSV export
- Session management — New Session, End Assessment
- Duplicate submission prevention (per email per session)
- Tab-blur overlay, keyboard guards, copy/right-click block
- Integrity counters (focus lost + copy attempts) in result + DB
- Answer key XOR-obfuscation
- Server-side timestamp (client cannot fake time)
- Rate limiting (3 req / IP / 60 s)
- Session state persistence (tab close recovery with elapsed timer)

---

## 🗺️ Future Features

### 🔒 Security & Integrity

| # | Feature | Notes |
|---|---|---|
| **S-1** | **Webcam photo capture during exam** | Use `getUserMedia` to request camera permission at exam start. Take 2–3 silent snapshots at random intervals during the exam. Upload to Supabase Storage alongside the result. Show thumbnails in the HR Dashboard for review. Requires HTTPS (already in place) and participant consent notice. |
| **S-2** | Question randomisation per participant | Shuffle question order and option order server-side using a per-session seed. Prevents two participants comparing answers in real time. |
| **S-3** | One question visible at a time with server validation | Send each question answer to the server before revealing the next — prevents grabbing all 20 via DevTools. High effort, adds latency. |
| **S-4** | IP-based duplicate detection | Flag if two submissions come from the same IP in the same session (proxy cheating). Show warning in dashboard, not a hard block. |
| **S-5** | Time-per-question tracking | Record how many seconds were spent on each question. Flag suspiciously fast completions (< 5 s/question average). |

### 📊 Dashboard & Reporting

| # | Feature | Notes |
|---|---|---|
| **D-1** | PDF export directly from dashboard | Generate server-side PDF via a headless browser (Puppeteer/Playwright) Edge Function. |
| **D-2** | Email blast to all participants in a session | Send a summary email to all participants at once from the dashboard. |
| **D-3** | Trend view across sessions | Line chart showing level distribution over time across multiple Ford cohorts. |
| **D-4** | Power BI Embedded report | Embed an actual Power BI report inside the dashboard using the REST API — meta and on-brand. |

### 🎓 Exam Experience

| # | Feature | Notes |
|---|---|---|
| **E-1** | Multi-language support (ES / EN) | Toggle between Spanish and English on the registration page. Questions and UI already in English; add Spanish translations. |
| **E-2** | Additional assessment topics | Excel, Azure, SQL, Power Automate — each as a separate exam module. Requires the "Create New Training Assessment" permission flow already built in the dashboard. |
| **E-3** | Retake policy configuration | Allow HR to set a cooldown period (e.g. 30 days) before the same email can retake the exam. |
| **E-4** | Participant self-service result lookup | Let participants retrieve their result by entering their email after the fact — no login required. |

---

*Last updated: 2025 — KMMX Training & Consultancy · info@kmmx.mx*

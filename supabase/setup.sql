-- ═══════════════════════════════════════════════════════════════════════════
--  Power BI Skills Assessment — Supabase Database Setup
--  Run this entire file in the Supabase SQL Editor once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Main results table ────────────────────────────────────────────────────

create table if not exists exam_results (
  id                  uuid          default gen_random_uuid() primary key,
  first_name          text          not null,
  last_name           text          not null,
  email               text          not null,
  score               int           not null check (score >= 0 and score <= 20),
  percentage          int           not null check (percentage >= 0 and percentage <= 100),
  level               text          not null check (level in ('Beginner', 'Intermediate', 'Advanced')),
  correct             int           not null,
  wrong               int           not null,
  skipped             int           not null,
  time_used           text          not null,   -- "MM:SS"
  answers             jsonb,                    -- { "0": 1, "1": 3, ... }
  breakdown           jsonb,                    -- { beginner: {correct,total,pct}, ... }
  recommendation      text,
  taken_at            timestamptz   not null default now(),
  session_name        text          not null default 'Session 1',
  focus_lost          int           not null default 0,
  copy_attempts       int           not null default 0,
  time_per_question   int[],                    -- seconds per question slot [0..19]
  avg_time_per_q      int           not null default 0,
  suspicious          boolean       not null default false,
  suspicious_flags    text[]                    -- human-readable flag reasons
);

-- Index for HR queries: filter by level, sort by date
create index if not exists idx_exam_results_level    on exam_results (level);
create index if not exists idx_exam_results_taken_at on exam_results (taken_at desc);
create index if not exists idx_exam_results_email    on exam_results (email);

-- ── 2. Row Level Security ────────────────────────────────────────────────────
--  - Anonymous users (exam takers) cannot read any rows
--  - Only authenticated HR users (service role or authenticated role) can read
--  - Inserts are done via the service role key inside the Edge Function

alter table exam_results enable row level security;

-- HR staff (authenticated) can read all results
create policy "HR can read all results"
  on exam_results for select
  to authenticated
  using (true);

-- No one can update or delete via client (only service role can)
create policy "No client updates"
  on exam_results for update
  to authenticated
  using (false);

create policy "No client deletes"
  on exam_results for delete
  to authenticated
  using (false);

-- ── 3. Supabase Storage bucket for HTML reports ──────────────────────────────
--  Run this via the Supabase dashboard: Storage → New Bucket
--  Name: exam-reports  |  Public: true (so HR can open the report URL directly)
--
--  Or via SQL (requires storage schema):
insert into storage.buckets (id, name, public)
values ('exam-reports', 'exam-reports', true)
on conflict (id) do nothing;

-- Allow the service role (Edge Function) to upload reports
create policy "Service role can upload reports"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'exam-reports');

-- Allow anyone to read/download reports (HR shares the URL)
create policy "Public can read reports"
  on storage.objects for select
  to public
  using (bucket_id = 'exam-reports');

-- ── 4. Convenience view for Power BI / HR dashboard ─────────────────────────

create or replace view exam_results_summary as
select
  id,
  first_name,
  last_name,
  first_name || ' ' || last_name  as full_name,
  email,
  score,
  percentage,
  level,
  correct,
  wrong,
  skipped,
  time_used,
  session_name,
  focus_lost,
  copy_attempts,
  time_per_question,
  avg_time_per_q,
  suspicious,
  suspicious_flags,
  (breakdown -> 'beginner'  ->> 'pct')::int  as beginner_pct,
  (breakdown -> 'intermediate' ->> 'pct')::int as intermediate_pct,
  (breakdown -> 'advanced'  ->> 'pct')::int  as advanced_pct,
  recommendation,
  taken_at::date                              as exam_date,
  taken_at
from exam_results
order by taken_at desc;

-- ── 5. Stats view (for dashboard KPI cards) ──────────────────────────────────

create or replace view exam_stats as
select
  count(*)                                                  as total_participants,
  round(avg(percentage), 1)                                 as avg_percentage,
  count(*) filter (where level = 'Beginner')                as total_beginners,
  count(*) filter (where level = 'Intermediate')            as total_intermediates,
  count(*) filter (where level = 'Advanced')                as total_advanced,
  round(count(*) filter (where level = 'Beginner')::numeric    / nullif(count(*),0) * 100, 1) as pct_beginners,
  round(count(*) filter (where level = 'Intermediate')::numeric / nullif(count(*),0) * 100, 1) as pct_intermediates,
  round(count(*) filter (where level = 'Advanced')::numeric    / nullif(count(*),0) * 100, 1) as pct_advanced
from exam_results;

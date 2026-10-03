-- Add session_name column to exam_results
alter table exam_results
  add column if not exists session_name text not null default 'Session 1';

-- Tag all existing rows as Session 1
update exam_results
  set session_name = 'Session 1'
  where session_name is null or session_name = '';

-- Recreate summary view to include session_name
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
  (breakdown -> 'beginner'  ->> 'pct')::int   as beginner_pct,
  (breakdown -> 'intermediate' ->> 'pct')::int as intermediate_pct,
  (breakdown -> 'advanced'  ->> 'pct')::int   as advanced_pct,
  recommendation,
  taken_at::date as exam_date,
  taken_at
from exam_results
order by taken_at desc;

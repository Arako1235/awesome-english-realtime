create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  work_start time not null default '13:00',
  work_end time not null default '19:00',
  run_target_minutes int not null default 480,
  grow_target_minutes int not null default 480,
  build_target_minutes int not null default 180,
  idea_target_minutes int not null default 60,
  sample_data_loaded boolean not null default false,
  unique(user_id)
);

create type public.task_category as enum ('RUN', 'GROW', 'BUILD', 'IDEA');
create type public.task_status as enum ('수집됨', '이번 주', '진행 중', '확인 대기', '완료');
create type public.task_importance as enum ('긴급', '높음', '보통', '낮음');
create type public.branch_type as enum ('공릉', '중계', '공통');
create type public.recurrence_frequency as enum ('weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly');
create type public.idea_status as enum ('수집함', '검토 예정', '다음에 실행', '이번 달 실행', '진행 중', '결과 확인', '보관 또는 폐기');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  category public.task_category not null,
  importance public.task_importance not null default '보통',
  status public.task_status not null default '수집됨',
  scheduled_date date not null,
  scheduled_start time,
  scheduled_end time,
  estimated_minutes int not null default 30 check (estimated_minutes >= 0),
  actual_minutes_manual int not null default 0 check (actual_minutes_manual >= 0),
  deadline date,
  branch public.branch_type not null default '공통',
  is_recurring boolean not null default false,
  recurring_rule_id uuid,
  recurrence_occurrence_date date,
  outcome_memo text not null default '',
  long_reason text not null default '',
  next_estimate_minutes int,
  follow_up text not null default '',
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  note text not null default '',
  deleted_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create table public.recurring_task_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  category public.task_category not null,
  importance public.task_importance not null default '보통',
  branch public.branch_type not null default '공통',
  frequency public.recurrence_frequency not null,
  interval int not null default 1 check (interval > 0),
  start_date date not null,
  external_deadline_offset_days int not null default 0,
  internal_deadline_offset_days int not null default -2,
  checklist text[] not null default '{}',
  contact_memo text not null default '',
  next_occurrence_date date not null,
  is_active boolean not null default true,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add constraint tasks_recurring_rule_fk foreign key (recurring_rule_id) references public.recurring_task_rules(id) on delete set null;
create unique index tasks_unique_recurring_occurrence on public.tasks(user_id, recurring_rule_id, recurrence_occurrence_date) where recurring_rule_id is not null and deleted_at is null;

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  detail text not null default '',
  category public.task_category not null default 'IDEA',
  estimated_minutes int not null default 30,
  expected_effect text not null default '',
  expected_revenue numeric not null default 0,
  difficulty text not null default '보통',
  required_materials text not null default '',
  reference_link text not null default '',
  created_date date not null default (now() at time zone 'Asia/Seoul')::date,
  review_date date,
  status public.idea_status not null default '수집함',
  actual_result text not null default '',
  deleted_at timestamptz
);

create table public.idea_task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, idea_id, task_id)
);

create table public.weekly_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  run_minutes int not null default 480,
  grow_minutes int not null default 480,
  build_minutes int not null default 180,
  idea_minutes int not null default 60,
  unique(user_id, week_start)
);

create table public.weekly_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  inquiries int not null default 0,
  consultations int not null default 0,
  event_applications int not null default 0,
  new_enrollments int not null default 0,
  marketing_cost numeric not null default 0,
  revenue numeric not null default 0,
  expected_revenue numeric not null default 0,
  saved_minutes int not null default 0,
  notes text not null default '',
  unique(user_id, week_start)
);

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  draft text not null default '',
  updated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.time_sessions enable row level security;
alter table public.recurring_task_rules enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_task_links enable row level security;
alter table public.weekly_targets enable row level security;
alter table public.weekly_metrics enable row level security;
alter table public.weekly_reports enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy "profiles own rows" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "settings own rows" on public.user_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks own rows" on public.tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "checklist own rows" on public.task_checklist_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "sessions own rows" on public.time_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "rules own rows" on public.recurring_task_rules for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ideas own rows" on public.ideas for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "idea links own rows" on public.idea_task_links for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "targets own rows" on public.weekly_targets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "metrics own rows" on public.weekly_metrics for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reports own rows" on public.weekly_reports for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table
  public.tasks,
  public.task_checklist_items,
  public.time_sessions,
  public.recurring_task_rules,
  public.ideas,
  public.idea_task_links,
  public.weekly_targets,
  public.weekly_metrics,
  public.weekly_reports,
  public.user_settings;

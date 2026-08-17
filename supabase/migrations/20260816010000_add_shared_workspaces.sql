create schema if not exists private;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Awesome English',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id, email)
);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant usage on schema private to authenticated;

alter table public.tasks add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.task_checklist_items add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.time_sessions add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.recurring_task_rules add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.ideas add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.idea_task_links add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.weekly_targets add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.weekly_metrics add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.weekly_reports add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and (
        wm.user_id = (select auth.uid())
        or lower(wm.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  );
$$;

create or replace function private.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.role = 'owner'
      and (
        wm.user_id = (select auth.uid())
        or lower(wm.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.is_workspace_owner(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_owner(uuid) to authenticated;

create policy "workspace select" on public.workspaces for select to authenticated using (private.is_workspace_member(id));
create policy "workspace insert" on public.workspaces for insert to authenticated with check (created_by = (select auth.uid()));
create policy "workspace update" on public.workspaces for update to authenticated using (private.is_workspace_owner(id)) with check (private.is_workspace_owner(id));
create policy "workspace delete" on public.workspaces for delete to authenticated using (private.is_workspace_owner(id));

create policy "member select" on public.workspace_members for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "member insert" on public.workspace_members for insert to authenticated with check (private.is_workspace_owner(workspace_id));
create policy "member update" on public.workspace_members for update to authenticated using (private.is_workspace_owner(workspace_id) or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))) with check (private.is_workspace_owner(workspace_id) or user_id = (select auth.uid()));
create policy "member delete" on public.workspace_members for delete to authenticated using (private.is_workspace_owner(workspace_id));

drop policy if exists "tasks own rows" on public.tasks;
drop policy if exists "checklist own rows" on public.task_checklist_items;
drop policy if exists "sessions own rows" on public.time_sessions;
drop policy if exists "rules own rows" on public.recurring_task_rules;
drop policy if exists "ideas own rows" on public.ideas;
drop policy if exists "idea links own rows" on public.idea_task_links;
drop policy if exists "targets own rows" on public.weekly_targets;
drop policy if exists "metrics own rows" on public.weekly_metrics;
drop policy if exists "reports own rows" on public.weekly_reports;

do $$
declare tbl text;
begin
  foreach tbl in array array['tasks','task_checklist_items','time_sessions','recurring_task_rules','ideas','idea_task_links','weekly_targets','weekly_metrics','weekly_reports'] loop
    execute format('create policy "workspace rows" on public.%I for all to authenticated using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id))', tbl);
  end loop;
end $$;

alter publication supabase_realtime add table public.workspaces, public.workspace_members;

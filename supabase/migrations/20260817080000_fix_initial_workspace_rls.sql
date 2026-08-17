drop policy if exists "workspace select" on public.workspaces;
create policy "workspace select" on public.workspaces
for select to authenticated
using (
  created_by = (select auth.uid())
  or private.is_workspace_member(id)
);

drop policy if exists "member insert" on public.workspace_members;
create policy "member insert" on public.workspace_members
for insert to authenticated
with check (
  private.is_workspace_owner(workspace_id)
  or (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1
      from public.workspaces w
      where w.id = workspace_id
        and w.created_by = (select auth.uid())
    )
  )
);

drop policy if exists "member select" on public.workspace_members;
create policy "member select" on public.workspace_members
for select to authenticated
using (
  private.is_workspace_member(workspace_id)
  or user_id = (select auth.uid())
  or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

-- Authentication + roles.
--   uploader : can view returns and upload new versions (uploads go through the app server, see below)
--   approver : can view returns and mark a validated return as submitted to CBN
-- A user may hold both. A signed-in user with no role sees nothing.
--
-- Who can write what:
--   * Returns are inserted only by the app server (service role), after it has checked the caller is an
--     uploader and has run the validation itself. Letting browsers insert would let anyone with an
--     uploader login store a return whose status / error_count they made up.
--   * Marking submitted is done with the caller's own login through fc_submit_return(), which checks the
--     approver role in the database and records who did it. There is no general UPDATE or DELETE.
--   * Roles are granted by an administrator (SQL editor / service role), never by users themselves.

-- Roles ------------------------------------------------------------------------------------------
create table if not exists public.fc_user_roles (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null check (role in ('uploader', 'approver')),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.fc_user_roles enable row level security;
revoke all on public.fc_user_roles from anon, authenticated;
grant select on public.fc_user_roles to authenticated;
create policy "read own roles" on public.fc_user_roles for select to authenticated using (user_id = auth.uid());

-- True when the signed-in caller holds the role. Security definer so RLS policies can call it
-- without granting users read access to everyone's roles.
create or replace function public.fc_has_role(p_role text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fc_user_roles where user_id = auth.uid() and role = p_role)
$$;
revoke all on function public.fc_has_role(text) from public, anon;
grant execute on function public.fc_has_role(text) to authenticated;

-- Audit columns ----------------------------------------------------------------------------------
-- Emails are copied at the time of the action so the record still reads correctly if an account changes.
alter table public.fc_returns alter column uploaded_by drop default;
alter table public.fc_returns add column if not exists uploaded_by_email  text;
alter table public.fc_returns add column if not exists submitted_by       uuid references auth.users (id);
alter table public.fc_returns add column if not exists submitted_by_email text;
-- NOT VALID: enforced for every new row; rows from before this migration (test data only) are left alone.
alter table public.fc_returns add constraint fc_returns_uploaded_by_required
  check (uploaded_by is not null and uploaded_by_email is not null) not valid;
alter table public.fc_returns add constraint fc_returns_submitted_by_required
  check (status <> 'submitted' or submitted_by is not null) not valid;

-- Returns: replace the open "staff" policies from 0001 ----------------------------------------------
drop policy if exists "staff read"   on public.fc_returns;
drop policy if exists "staff insert" on public.fc_returns;
drop policy if exists "staff update" on public.fc_returns;

revoke all on public.fc_returns from anon, authenticated;
grant select on public.fc_returns to authenticated;
create policy "staff read" on public.fc_returns for select to authenticated
  using (public.fc_has_role('uploader') or public.fc_has_role('approver'));

-- Submission: the only change a signed-in user can make to a return.
create or replace function public.fc_submit_return(p_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  r public.fc_returns%rowtype;
begin
  if auth.uid() is null or not public.fc_has_role('approver') then
    raise exception 'Only an approver can mark a return as submitted.' using errcode = '42501';
  end if;
  select * into r from public.fc_returns where id = p_id for update;
  if not found then
    raise exception 'Return % not found.', p_id using errcode = 'P0002';
  end if;
  if r.status = 'submitted' then
    raise exception 'Return % was submitted and is locked', p_id;
  end if;
  if r.status <> 'validated' or r.error_count > 0 then
    raise exception 'This return still has validation errors and cannot be marked as submitted.';
  end if;
  update public.fc_returns
     set status = 'submitted',
         submitted_at = now(),
         submitted_by = auth.uid(),
         submitted_by_email = (select email from auth.users where id = auth.uid())
   where id = p_id;
end $$;
revoke all on function public.fc_submit_return(uuid) from public, anon;
grant execute on function public.fc_submit_return(uuid) to authenticated;

-- Original workbooks: read by staff, written only by the app server ---------------------------------
drop policy if exists "staff read files"   on storage.objects;
drop policy if exists "staff upload files" on storage.objects;
create policy "staff read files" on storage.objects for select to authenticated
  using (bucket_id = 'fc-return-files' and (public.fc_has_role('uploader') or public.fc_has_role('approver')));

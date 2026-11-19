-- FC regulatory returns: one row per uploaded workbook (each re-upload of a period is a new version).
create table if not exists public.fc_returns (
  id            uuid primary key,
  fc_code       text        not null,
  fc_name       text        not null,
  as_at         date        not null,
  version       int         not null check (version >= 1),
  status        text        not null check (status in ('needs-fixes', 'validated', 'submitted')),
  file_name     text        not null,
  file_sha256   text        not null unique,          -- blocks the same file being uploaded twice
  uploaded_by   uuid        references auth.users (id) default auth.uid(),
  uploaded_at   timestamptz not null default now(),
  submitted_at  timestamptz,
  error_count   int         not null default 0,
  warning_count int         not null default 0,
  issues        jsonb       not null default '[]'::jsonb,
  kpis          jsonb       not null default '[]'::jsonb,
  parsed        jsonb       not null,                 -- full normalised return (all sheets)
  unique (fc_code, as_at, version),
  check (status <> 'submitted' or error_count = 0)     -- a return with errors can never be marked submitted
);

create index if not exists fc_returns_period_idx on public.fc_returns (as_at desc, fc_code, version desc);

-- Submitted returns are the regulatory record: they cannot be edited or deleted.
create or replace function public.fc_returns_lock_submitted() returns trigger language plpgsql as $$
begin
  if old.status = 'submitted' then
    raise exception 'Return % was submitted and is locked', old.id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists fc_returns_lock on public.fc_returns;
create trigger fc_returns_lock before update or delete on public.fc_returns
  for each row execute function public.fc_returns_lock_submitted();

-- Row level security: signed-in staff only. Tighten per role (uploader / approver) once roles are agreed.
alter table public.fc_returns enable row level security;
create policy "staff read"   on public.fc_returns for select to authenticated using (true);
create policy "staff insert" on public.fc_returns for insert to authenticated with check (true);
create policy "staff update" on public.fc_returns for update to authenticated using (true);

-- Private bucket for the original uploaded workbooks: <return id>.xlsx
insert into storage.buckets (id, name, public) values ('fc-return-files', 'fc-return-files', false)
on conflict (id) do nothing;
create policy "staff read files"   on storage.objects for select to authenticated using (bucket_id = 'fc-return-files');
create policy "staff upload files" on storage.objects for insert to authenticated with check (bucket_id = 'fc-return-files');

-- Ratownik PLK v2 — schemat części wewnętrznej
-- Wersja robocza do zastosowania w osobnych projektach dev/test/prod.
-- Plik nie zawiera danych pracowników ani sekretów.
-- Przed wdrożeniem utwórz migrację poleceniem: supabase migration new internal_platform

begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.organizations(id) on delete restrict check (parent_id is distinct from id),
  name text not null check (char_length(name) between 2 and 160),
  code text not null unique check (char_length(code) between 2 and 40),
  kind text not null check (kind in ('company', 'zlk', 'section', 'workplace')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kody ról pozostają zgodne z 2.6.1. Nazwa „koordynator” nie tworzy nowej roli.
create table if not exists public.roles (
  code text primary key check (code in ('employee', 'responder', 'unit_admin', 'system_admin')),
  label text not null,
  description text not null
);
insert into public.roles (code, label, description) values
  ('employee', 'Pracownik', 'Dostęp w zatwierdzonym zakresie jednostek.'),
  ('responder', 'Ratownik', 'Funkcje pracownika oraz gotowość i odbieranie alarmów.'),
  ('unit_admin', 'Koordynator jednostki', 'Zarządzanie przydzieloną jednostką i jej podjednostkami.'),
  ('system_admin', 'Administrator', 'Zarządzanie całym systemem.')
on conflict (code) do update set label = excluded.label, description = excluded.description;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  role text not null check (role in ('employee', 'responder', 'unit_admin', 'system_admin')),
  active boolean not null default true,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id, role)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.memberships'::regclass and conname = 'memberships_role_catalog_fk') then
    alter table public.memberships add constraint memberships_role_catalog_fk
      foreign key (role) references public.roles(code);
  end if;
end;
$$;

-- Preferencje miejsca pracy NIE przyznają uprawnień. Ich źródłem są memberships.
-- Brak wiersza oznacza profil jeszcze nieuzupełniony, nie domyślne uprawnienia.
create table if not exists public.user_work_contexts (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  primary_organization_id uuid references public.organizations(id) on delete restrict,
  primary_section_id uuid references public.organizations(id) on delete restrict,
  current_section_id uuid references public.organizations(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (primary_section_id is null or primary_organization_id is not null)
);

create table if not exists public.responder_profiles (
  membership_id uuid primary key references public.memberships(id) on delete cascade,
  available boolean not null default false,
  competencies text[] not null default array[]::text[],
  last_confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists private.responder_contacts (
  membership_id uuid primary key references public.memberships(id) on delete cascade,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  sms_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (membership_id, endpoint)
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  idempotency_key uuid not null,
  incident_type text not null check (incident_type in ('unconscious', 'cardiac_arrest', 'trauma', 'bleeding', 'other')),
  place_description text not null check (char_length(place_description) between 2 and 240),
  note text check (note is null or char_length(note) <= 500),
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  accuracy_m integer check (accuracy_m is null or accuracy_m between 0 and 100000),
  status text not null default 'created' check (status in ('created', 'dispatching', 'sent', 'partial', 'failed', 'simulated', 'closed')),
  notification_mode text not null default 'simulation' check (notification_mode in ('simulation', 'production')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (created_by, idempotency_key)
);

create table if not exists public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  channels text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  unique (incident_id, membership_id)
);

create table if not exists public.delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  recipient_id uuid references public.alert_recipients(id) on delete set null,
  channel text not null check (channel in ('push', 'sms')),
  status text not null check (status in ('queued', 'simulated', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  destination_masked text,
  error_code text,
  attempted_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  organization_id uuid references public.organizations(id),
  action text not null check (char_length(action) between 2 and 100),
  entity_type text not null check (char_length(entity_type) between 2 and 80),
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists memberships_user_active_idx on public.memberships(user_id, active);
create index if not exists memberships_org_role_idx on public.memberships(organization_id, role, active);
create index if not exists organizations_parent_idx on public.organizations(parent_id);
create index if not exists incidents_org_created_idx on public.incidents(organization_id, created_at desc);
create index if not exists incidents_author_created_idx on public.incidents(created_by, created_at desc);
create index if not exists alert_recipients_incident_idx on public.alert_recipients(incident_id);
create index if not exists delivery_attempts_incident_idx on public.delivery_attempts(incident_id);
create index if not exists audit_log_org_created_idx on public.audit_log(organization_id, created_at desc);
create index if not exists work_contexts_primary_org_idx on public.user_work_contexts(primary_organization_id);
create index if not exists work_contexts_primary_section_idx on public.user_work_contexts(primary_section_id);
create index if not exists work_contexts_current_section_idx on public.user_work_contexts(current_section_id);
create index if not exists alert_recipients_membership_idx on public.alert_recipients(membership_id, incident_id);
create index if not exists memberships_role_idx on public.memberships(role);

-- Te wewnętrzne funkcje invoker są wywoływane przez predykaty RLS lub service_role.
-- Nie udostępniamy ich bezpośrednio użytkownikowi z dowolnym UUID innej osoby.
create or replace function private.organization_path_is_active(target_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  with recursive path as (
    select id, parent_id, active, array[id] as visited, false as cycle
    from public.organizations where id = target_id
    union all
    select p.id, p.parent_id, p.active, c.visited || p.id, p.id = any(c.visited)
    from public.organizations p join path c on p.id = c.parent_id
    where not c.cycle
  )
  select coalesce(bool_and(active) and not bool_or(cycle) and bool_or(parent_id is null), false) from path;
$$;

create or replace function private.user_is_system_admin(target_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.profiles p on p.user_id = m.user_id
    where m.user_id = target_user_id and p.active and m.active and m.role = 'system_admin'
      and private.organization_path_is_active(m.organization_id)
  );
$$;

create or replace function private.user_can_manage_organization(target_user_id uuid, target_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = target_user_id and active)
    and exists (select 1 from public.organizations where id = target_id)
    and (private.user_is_system_admin(target_user_id) or exists (
      with recursive ancestry as (
        select id, parent_id from public.organizations where id = target_id
        union
        select p.id, p.parent_id from public.organizations p join ancestry c on c.parent_id = p.id
      )
      select 1 from public.memberships m join ancestry a on a.id = m.organization_id
      where m.user_id = target_user_id and m.active and m.role = 'unit_admin'
        and private.organization_path_is_active(m.organization_id)
    ));
$$;

create or replace function private.user_can_access_organization(target_user_id uuid, target_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.organization_path_is_active(target_id)
    and exists (select 1 from public.profiles where user_id = target_user_id and active)
    and (private.user_can_manage_organization(target_user_id, target_id) or exists (
      select 1 from public.memberships where user_id = target_user_id and organization_id = target_id and active
    ));
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations
for each row execute function private.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at before update on public.memberships
for each row execute function private.set_updated_at();

drop trigger if exists responder_profiles_set_updated_at on public.responder_profiles;
create trigger responder_profiles_set_updated_at before update on public.responder_profiles
for each row execute function private.set_updated_at();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and active
  );
$$;

create or replace function private.is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and private.user_is_system_admin((select auth.uid()));
$$;

create or replace function private.can_view_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.user_can_access_organization((select auth.uid()), target_organization_id);
$$;

create or replace function private.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.user_can_manage_organization((select auth.uid()), target_organization_id);
$$;

create or replace function private.can_view_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_active_user() then false
    when target_user_id = (select auth.uid()) then true
    when private.is_system_admin() then true
    else exists (
      select 1
      from public.memberships target_membership
      join public.profiles target_profile
        on target_profile.user_id = target_membership.user_id and target_profile.active
      join public.memberships own_membership
        on own_membership.organization_id = target_membership.organization_id
      where target_membership.user_id = target_user_id
        and target_membership.active
        and target_membership.role = 'responder'
        and own_membership.user_id = (select auth.uid())
        and own_membership.active
        and private.organization_path_is_active(target_membership.organization_id)
    )
    or exists (
      select 1
      from public.memberships target_membership
      where target_membership.user_id = target_user_id
        and target_membership.active
        and private.can_manage_organization(target_membership.organization_id)
    )
  end;
$$;

create or replace function private.can_view_incident(target_incident_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.is_active_user() and exists (
    select 1 from public.incidents i
    where i.id = target_incident_id and private.can_view_organization(i.organization_id)
      and (i.created_by = (select auth.uid()) or private.can_manage_organization(i.organization_id)
        or exists (
          select 1 from public.alert_recipients r join public.memberships m on m.id = r.membership_id
          where r.incident_id = i.id and m.user_id = (select auth.uid()) and m.active and m.role = 'responder'
            and private.organization_path_is_active(m.organization_id)
        ))
  );
$$;

revoke all on all functions in schema private from public;
revoke all on all functions in schema private from anon;
revoke all on all functions in schema private from authenticated;
grant execute on function private.set_updated_at() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_system_admin() to authenticated;
grant execute on function private.can_view_organization(uuid) to authenticated;
grant execute on function private.can_manage_organization(uuid) to authenticated;
grant execute on function private.can_view_user(uuid) to authenticated;
grant execute on function private.can_view_incident(uuid) to authenticated;
grant execute on function private.organization_path_is_active(uuid) to service_role;
grant execute on function private.user_is_system_admin(uuid) to service_role;
grant execute on function private.user_can_manage_organization(uuid, uuid) to service_role;
grant execute on function private.user_can_access_organization(uuid, uuid) to service_role;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_work_contexts enable row level security;
alter table public.memberships enable row level security;
alter table public.responder_profiles enable row level security;
alter table public.incidents enable row level security;
alter table public.alert_recipients enable row level security;
alter table public.delivery_attempts enable row level security;
alter table public.audit_log enable row level security;
alter table private.responder_contacts enable row level security;
alter table private.push_subscriptions enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
for select to authenticated
using (
  private.is_system_admin()
  or private.can_manage_organization(id)
  or
  private.can_view_organization(id)
  -- INSERT ... RETURNING musi widzieć nowy wiersz przed zmianą snapshotu funkcji STABLE.
  or (active and private.can_manage_organization(parent_id))
);

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (parent_id is null and private.is_system_admin())
    or private.can_manage_organization(parent_id)
  )
);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
for update to authenticated
using (private.can_manage_organization(id))
with check (
  private.can_manage_organization(id)
  and (
    (parent_id is null and private.is_system_admin())
    or private.can_manage_organization(parent_id)
  )
);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (private.can_view_user(user_id));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using (user_id = (select auth.uid()) and private.is_active_user())
with check (user_id = (select auth.uid()) and private.is_active_user());

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
using (private.is_active_user());

drop policy if exists work_contexts_select on public.user_work_contexts;
create policy work_contexts_select on public.user_work_contexts for select to authenticated
using (private.is_active_user() and (user_id = (select auth.uid()) or private.is_system_admin()));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
for select to authenticated
using (
  private.is_active_user()
  and (
    private.can_manage_organization(organization_id)
    or (private.can_view_organization(organization_id) and (
      user_id = (select auth.uid())
      or (role = 'responder' and active and exists (
        select 1 from public.profiles p where p.user_id = memberships.user_id and p.active
      ))
    ))
  )
);

drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships
for insert to authenticated
with check (
  private.can_manage_organization(organization_id)
  and (
    private.is_system_admin()
    or role in ('employee', 'responder')
  )
);

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
for update to authenticated
using (
  private.can_manage_organization(organization_id)
  and (
    private.is_system_admin()
    or role in ('employee', 'responder')
  )
)
with check (
  private.can_manage_organization(organization_id)
  and (
    private.is_system_admin()
    or role in ('employee', 'responder')
  )
);

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
for delete to authenticated
using (
  private.can_manage_organization(organization_id)
  and (
    private.is_system_admin()
    or role in ('employee', 'responder')
  )
);

drop policy if exists responders_select on public.responder_profiles;
create policy responders_select on public.responder_profiles
for select to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and private.can_view_organization(m.organization_id)
  )
);

drop policy if exists responders_insert on public.responder_profiles;
create policy responders_insert on public.responder_profiles
for insert to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and m.active and m.role = 'responder'
      and private.can_manage_organization(m.organization_id)
  )
);

drop policy if exists responders_update on public.responder_profiles;
create policy responders_update on public.responder_profiles
for update to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and m.active and m.role = 'responder' and private.is_active_user()
      and private.can_view_organization(m.organization_id)
      and (
        m.user_id = (select auth.uid())
        or private.can_manage_organization(m.organization_id)
      )
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and m.active and m.role = 'responder' and private.is_active_user()
      and private.can_view_organization(m.organization_id)
      and (
        m.user_id = (select auth.uid())
        or private.can_manage_organization(m.organization_id)
      )
  )
);

drop policy if exists incidents_select on public.incidents;
create policy incidents_select on public.incidents
for select to authenticated
using (
  private.can_view_incident(id)
);

-- Alarmy i ich statusy może zapisywać wyłącznie zweryfikowana funkcja serwerowa.
drop policy if exists incidents_insert on public.incidents;
drop policy if exists incidents_update on public.incidents;

drop policy if exists alert_recipients_select on public.alert_recipients;
create policy alert_recipients_select on public.alert_recipients
for select to authenticated
using (
  private.can_view_incident(incident_id) and (
  exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = (select auth.uid()))
  or
  exists (
    select 1
    from public.incidents i
    where i.id = incident_id
      and private.can_manage_organization(i.organization_id)
  )
  )
);

drop policy if exists delivery_attempts_select on public.delivery_attempts;
create policy delivery_attempts_select on public.delivery_attempts
for select to authenticated
using (
  exists (
    select 1
    from public.incidents i
    where i.id = incident_id
      and private.can_manage_organization(i.organization_id)
  )
);

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
for select to authenticated
using (
  organization_id is not null
  and private.can_manage_organization(organization_id)
);

grant usage on schema public to authenticated;
-- Nie polegamy na domyślnych grantach konkretnego projektu Supabase.
revoke all on public.organizations, public.profiles, public.memberships,
  public.responder_profiles, public.incidents, public.alert_recipients,
  public.delivery_attempts, public.audit_log from public, anon, authenticated;
revoke all on public.roles, public.user_work_contexts from public, anon, authenticated;
grant select on public.roles, public.user_work_contexts to authenticated;
grant select, insert on public.organizations to authenticated;
-- Zmiana rodzica i identyfikatora wymaga kontrolowanej operacji serwerowej.
grant update (name, code, active, updated_at, updated_by) on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, delete on public.memberships to authenticated;
grant update (active) on public.memberships to authenticated;
grant select, insert on public.responder_profiles to authenticated;
grant update (available, last_confirmed_at) on public.responder_profiles to authenticated;
grant select on public.incidents to authenticated;
grant select on public.alert_recipients to authenticated;
grant select on public.delivery_attempts to authenticated;
grant select on public.audit_log to authenticated;

revoke all on private.responder_contacts from public, anon, authenticated;
revoke all on private.push_subscriptions from public, anon, authenticated;
grant usage on schema public, private to service_role;
grant select, insert, update on public.organizations, public.profiles, public.memberships,
  public.responder_profiles, public.incidents, public.alert_recipients,
  public.delivery_attempts, public.audit_log, private.responder_contacts,
  private.push_subscriptions to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;
grant select on public.roles to service_role;
grant select, insert, update on public.user_work_contexts to service_role;

create or replace function public.get_alert_recipients_for_dispatch(target_organization_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  phone_e164 text,
  sms_enabled boolean,
  push_subscriptions jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id,
    m.user_id,
    c.phone_e164,
    coalesce(c.sms_enabled, false),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'endpoint', p.endpoint,
          'p256dh', p.p256dh,
          'auth', p.auth_secret
        )
      ) filter (where p.id is not null),
      '[]'::jsonb
    )
  from public.memberships m
  join public.profiles person on person.user_id = m.user_id and person.active
  join public.organizations organization on organization.id = m.organization_id and organization.active
  join public.responder_profiles r
    on r.membership_id = m.id
   and r.available
  left join private.responder_contacts c
    on c.membership_id = m.id
  left join private.push_subscriptions p
    on p.membership_id = m.id
   and p.active
  where m.organization_id = target_organization_id
    and m.role = 'responder'
    and m.active
    and private.organization_path_is_active(m.organization_id)
  group by m.id, m.user_id, c.phone_e164, c.sms_enabled;
$$;

create or replace function public.upsert_responder_contact(
  target_membership_id uuid,
  target_phone_e164 text,
  target_sms_enabled boolean default true
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if target_phone_e164 is not null and target_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid phone format';
  end if;

  insert into private.responder_contacts (membership_id, phone_e164, sms_enabled)
  values (target_membership_id, target_phone_e164, target_sms_enabled)
  on conflict (membership_id) do update
  set phone_e164 = excluded.phone_e164,
      sms_enabled = excluded.sms_enabled,
      updated_at = now();
end;
$$;

create or replace function public.register_invited_responder(
  invited_user_id uuid,
  target_organization_id uuid,
  target_display_name text,
  target_phone_e164 text,
  target_competencies text[],
  approving_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_membership_id uuid;
begin
  if invited_user_id is null or approving_user_id is null then
    raise exception 'missing user id';
  end if;
  if not private.user_can_manage_organization(approving_user_id, target_organization_id)
    or not private.organization_path_is_active(target_organization_id) then
    raise exception 'access_denied';
  end if;
  if exists (select 1 from public.profiles where user_id = invited_user_id and not active) then
    raise exception 'profile_disabled';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = target_organization_id and active
  ) then
    raise exception 'organization not found';
  end if;
  if char_length(trim(target_display_name)) not between 2 and 120 then
    raise exception 'invalid display name';
  end if;
  if target_phone_e164 is not null and target_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid phone format';
  end if;

  insert into public.profiles (user_id, display_name, active)
  values (invited_user_id, trim(target_display_name), true)
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      updated_at = now();

  insert into public.memberships (
    user_id,
    organization_id,
    role,
    active,
    approved_by,
    approved_at
  )
  values (
    invited_user_id,
    target_organization_id,
    'responder',
    true,
    approving_user_id,
    now()
  )
  on conflict (user_id, organization_id, role) do update
  set active = true,
      approved_by = excluded.approved_by,
      approved_at = excluded.approved_at,
      updated_at = now()
  returning id into new_membership_id;

  insert into public.responder_profiles (
    membership_id,
    available,
    competencies,
    last_confirmed_at
  )
  values (
    new_membership_id,
    false,
    coalesce(target_competencies, array[]::text[]),
    now()
  )
  on conflict (membership_id) do update
  set available = false,
      competencies = excluded.competencies,
      last_confirmed_at = now(),
      updated_at = now();

  insert into private.responder_contacts (
    membership_id,
    phone_e164,
    sms_enabled
  )
  values (
    new_membership_id,
    target_phone_e164,
    target_phone_e164 is not null
  )
  on conflict (membership_id) do update
  set phone_e164 = excluded.phone_e164,
      sms_enabled = excluded.sms_enabled,
      updated_at = now();

  insert into public.audit_log (
    actor_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values (
    approving_user_id,
    target_organization_id,
    'responder_invited',
    'membership',
    new_membership_id::text,
    jsonb_build_object('role', 'responder')
  );

  return new_membership_id;
end;
$$;

create or replace function public.upsert_push_subscription(
  target_membership_id uuid,
  target_endpoint text,
  target_p256dh text,
  target_auth_secret text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_id uuid;
begin
  if not exists (
    select 1 from public.memberships
    where id = target_membership_id
      and role = 'responder'
      and active
      and private.organization_path_is_active(organization_id)
      and exists (select 1 from public.profiles p where p.user_id = public.memberships.user_id and p.active)
  ) then
    raise exception 'active responder membership not found';
  end if;
  if target_endpoint !~ '^https://'
    or char_length(target_endpoint) not between 10 and 2048
    or char_length(target_p256dh) not between 10 and 512
    or char_length(target_auth_secret) not between 6 and 512 then
    raise exception 'invalid push subscription';
  end if;

  -- Wspólny telefon nie może po zmianie konta odbierać alarmów poprzedniego użytkownika.
  update private.push_subscriptions p set active = false
  where p.endpoint = target_endpoint and p.membership_id in (
    select previous.id from public.memberships previous
    where previous.user_id <> (select current_member.user_id from public.memberships current_member where current_member.id = target_membership_id)
  );

  insert into private.push_subscriptions (
    membership_id,
    endpoint,
    p256dh,
    auth_secret,
    active
  )
  values (
    target_membership_id,
    target_endpoint,
    target_p256dh,
    target_auth_secret,
    true
  )
  on conflict (membership_id, endpoint) do update
  set p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret,
      active = true,
      last_used_at = now()
  returning id into subscription_id;

  return subscription_id;
end;
$$;

-- Rezerwacja alarmu i ograniczenie częstotliwości w jednej transakcji.
-- Powtórzenie żądania z tym samym kluczem nigdy nie uruchamia drugiej wysyłki.
create or replace function public.reserve_incident(
  target_user_id uuid,
  target_organization_id uuid,
  target_key uuid,
  target_type text,
  target_place text,
  target_note text,
  target_latitude numeric,
  target_longitude numeric,
  target_accuracy integer,
  target_mode text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved public.incidents%rowtype;
begin
  if target_user_id is null or target_key is null then
    raise exception 'invalid_request';
  end if;
  if not private.user_can_access_organization(target_user_id, target_organization_id) then
    raise exception 'access_denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  select * into saved from public.incidents
  where created_by = target_user_id and idempotency_key = target_key;
  if found then
    if saved.organization_id <> target_organization_id then
      raise exception 'idempotency_conflict';
    end if;
    return to_jsonb(saved) || jsonb_build_object('is_duplicate', true);
  end if;
  if exists (
    select 1 from public.incidents
    where created_by = target_user_id and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'rate_limited';
  end if;
  insert into public.incidents (
    created_by, organization_id, idempotency_key, incident_type, place_description,
    note, latitude, longitude, accuracy_m, notification_mode, status
  ) values (
    target_user_id, target_organization_id, target_key, target_type, target_place,
    target_note, target_latitude, target_longitude, target_accuracy, target_mode, 'dispatching'
  ) returning * into saved;
  return to_jsonb(saved) || jsonb_build_object('is_duplicate', false);
end;
$$;

revoke all on function public.get_alert_recipients_for_dispatch(uuid) from public, anon, authenticated;
revoke all on function public.upsert_push_subscription(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.register_invited_responder(uuid, uuid, text, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.upsert_responder_contact(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.get_alert_recipients_for_dispatch(uuid) to service_role;
grant execute on function public.upsert_responder_contact(uuid, text, boolean) to service_role;
grant execute on function public.register_invited_responder(uuid, uuid, text, text, text[], uuid) to service_role;
grant execute on function public.upsert_push_subscription(uuid, text, text, text) to service_role;
revoke all on function public.reserve_incident(uuid, uuid, uuid, text, text, text, numeric, numeric, integer, text) from public, anon, authenticated;
grant execute on function public.reserve_incident(uuid, uuid, uuid, text, text, text, numeric, numeric, integer, text) to service_role;

-- Jeden kontrakt autoryzacji dla Edge Functions. Tożsamość pochodzi z JWT,
-- nigdy z userId przesłanego przez przeglądarkę. Funkcja nie ujawnia danych osób.
create or replace function public.organization_access(target_organization_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'can_access', private.can_view_organization(target_organization_id),
    'can_manage', private.can_manage_organization(target_organization_id)
  );
$$;
revoke all on function public.organization_access(uuid) from public, anon, authenticated;
grant execute on function public.organization_access(uuid) to authenticated;

-- Organizacje tworzą jedno drzewo: spółka → zakład → sekcja → miejsce pracy.
-- Nie przenosimy istniejących gałęzi po cichu (mogłoby to przenieść uprawnienia).
do $$
begin
  if exists (
    select 1 from public.organizations o left join public.organizations p on p.id = o.parent_id
    where (case o.kind
      when 'company' then o.parent_id is null
      when 'zlk' then p.kind = 'company'
      when 'section' then p.kind = 'zlk'
      when 'workplace' then p.kind = 'section'
      else false end) is not true
  ) then raise exception 'organization_hierarchy_review_required'; end if;
  if exists (select 1 from public.memberships m join public.organizations o on o.id = m.organization_id
    where m.role = 'system_admin' and o.kind <> 'company')
  then raise exception 'system_admin_scope_review_required'; end if;
end;
$$;

create or replace function private.validate_organization()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare parent_kind text;
begin
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' and not (
      (new.parent_id is null and private.is_system_admin()) or private.can_manage_organization(new.parent_id)
    ) then raise exception 'permission denied: organization scope' using errcode = '42501'; end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.parent_id is distinct from old.parent_id or new.kind is distinct from old.kind then
      raise exception 'organization_structure_immutable';
    end if;
    if old.active and not new.active and exists (
      select 1 from public.memberships where organization_id = old.id and role = 'system_admin' and active
    ) then
      raise exception 'organization_hosts_system_admin';
    end if;
  else
    if new.kind = 'company' then
      if new.parent_id is not null then raise exception 'invalid_organization_hierarchy'; end if;
    else
      select kind into parent_kind from public.organizations where id = new.parent_id;
      if parent_kind is null or not (
        (new.kind = 'zlk' and parent_kind = 'company') or
        (new.kind = 'section' and parent_kind = 'zlk') or
        (new.kind = 'workplace' and parent_kind = 'section')
      ) then raise exception 'invalid_organization_hierarchy'; end if;
    end if;
  end if;
  new.name = btrim(new.name);
  new.code = upper(btrim(new.code));
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then new.created_by = (select auth.uid());
    else new.updated_by = (select auth.uid()); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists organizations_validate on public.organizations;
create trigger organizations_validate before insert or update on public.organizations
for each row execute function private.validate_organization();

create or replace function private.validate_membership()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    if not (private.can_manage_organization(new.organization_id)
      and (private.is_system_admin() or new.role in ('employee', 'responder'))
    ) then raise exception 'permission denied: membership scope' using errcode = '42501'; end if;
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id or new.user_id is distinct from old.user_id
    or new.organization_id is distinct from old.organization_id or new.role is distinct from old.role
  ) then raise exception 'membership_identity_immutable'; end if;
  if new.role = 'system_admin' and not exists (
    select 1 from public.organizations where id = new.organization_id and kind = 'company'
  ) then raise exception 'system_admin_requires_company'; end if;
  if (select auth.uid()) is not null then
    new.approved_by = (select auth.uid());
    new.approved_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists memberships_validate on public.memberships;
create trigger memberships_validate before insert or update on public.memberships
for each row execute function private.validate_membership();

-- Audyt jest częścią tej samej transakcji co operacja. Nie zapisujemy w nim
-- nazwisk, telefonów, treści alarmu ani dowolnego JSON z przeglądarki.
create or replace function private.audit_administrative_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  row_data jsonb;
  previous jsonb;
  scope_id uuid;
begin
  if actor is not null and not private.is_active_user() then raise exception 'inactive_audit_actor'; end if;
  if actor is null and coalesce(current_setting('role', true), 'none') not in ('none', 'postgres', 'service_role') then
    raise exception 'missing_audit_actor';
  end if;
  if tg_op = 'DELETE' then row_data = to_jsonb(old); else row_data = to_jsonb(new); end if;
  if tg_op = 'UPDATE' then previous = to_jsonb(old); end if;
  scope_id = case when tg_table_name = 'organizations' then (row_data->>'id')::uuid
    else (row_data->>'organization_id')::uuid end;
  insert into public.audit_log (actor_id, organization_id, action, entity_type, entity_id, details)
  values (actor, scope_id, lower(tg_table_name || '_' || tg_op), tg_table_name, row_data->>'id',
    jsonb_strip_nulls(jsonb_build_object(
      'active', row_data->'active', 'previous_active', previous->'active',
      'role', row_data->'role', 'kind', row_data->'kind',
      'origin', case when actor is null then 'server_or_bootstrap' else 'authenticated' end
    )));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists organizations_audit on public.organizations;
create trigger organizations_audit after insert or update on public.organizations
for each row execute function private.audit_administrative_change();
drop trigger if exists memberships_audit on public.memberships;
create trigger memberships_audit after insert or update or delete on public.memberships
for each row execute function private.audit_administrative_change();

create or replace function private.validate_work_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where user_id = new.user_id and active) then
    raise exception 'work_context_inactive_user';
  end if;
  if new.primary_organization_id is not null and not exists (
    select 1 from public.organizations where id = new.primary_organization_id and kind = 'zlk'
      and private.organization_path_is_active(id)
  ) then raise exception 'work_context_invalid_zlk'; end if;
  if new.primary_section_id is not null then
    if not exists (select 1 from public.organizations where id = new.primary_section_id
      and kind = 'section' and parent_id = new.primary_organization_id)
      or not private.user_can_access_organization(new.user_id, new.primary_section_id)
    then raise exception 'work_context_invalid_primary_section'; end if;
  elsif new.primary_organization_id is not null
    and not private.user_can_access_organization(new.user_id, new.primary_organization_id)
  then raise exception 'work_context_unapproved_zlk'; end if;
  if new.current_section_id is not null and (
    not exists (select 1 from public.organizations where id = new.current_section_id and kind = 'section')
    or not private.user_can_access_organization(new.user_id, new.current_section_id)
  ) then raise exception 'work_context_unapproved_current_section'; end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists work_contexts_validate on public.user_work_contexts;
create trigger work_contexts_validate before insert or update on public.user_work_contexts
for each row execute function private.validate_work_context();

-- Do podłączenia w ETAPIE B: funkcja serwerowa ma pobrać target_user_id z
-- requireUser(), a nie z formularza. Wybór miejsca nie dodaje memberships.
create or replace function public.save_work_context(
  target_user_id uuid,
  target_primary_organization_id uuid,
  target_primary_section_id uuid,
  target_current_section_id uuid
)
returns public.user_work_contexts language plpgsql security invoker set search_path = '' as $$
declare saved public.user_work_contexts%rowtype;
begin
  insert into public.user_work_contexts (user_id, primary_organization_id, primary_section_id, current_section_id)
  values (target_user_id, target_primary_organization_id, target_primary_section_id, target_current_section_id)
  on conflict (user_id) do update set
    primary_organization_id = excluded.primary_organization_id,
    primary_section_id = excluded.primary_section_id,
    current_section_id = excluded.current_section_id
  returning * into saved;
  insert into public.audit_log (actor_id, organization_id, action, entity_type, entity_id, details)
  values (target_user_id, coalesce(target_current_section_id, target_primary_section_id, target_primary_organization_id),
    'work_context_saved', 'user_work_context', target_user_id::text, '{}'::jsonb);
  return saved;
end;
$$;
revoke all on function public.save_work_context(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.save_work_context(uuid, uuid, uuid, uuid) to service_role;

-- Widoki mapują wymagania domenowe bez duplikowania drzew i przypisań.
-- security_invoker jest konieczne, aby zachować RLS tabel bazowych (Postgres 15+).
create or replace view public.sections with (security_invoker = true) as
  select id, parent_id as organization_id, name, code, active from public.organizations where kind = 'section';
create or replace view public.user_sections with (security_invoker = true) as
  select m.id as membership_id, m.user_id, m.organization_id as section_id, m.role, m.active, m.approved_at
  from public.memberships m join public.organizations o on o.id = m.organization_id where o.kind = 'section';
revoke all on public.sections, public.user_sections from public, anon, authenticated;
grant select on public.sections, public.user_sections to authenticated, service_role;

revoke all on function private.validate_organization() from public, anon, authenticated;
revoke all on function private.validate_membership() from public, anon, authenticated;
revoke all on function private.audit_administrative_change() from public, anon, authenticated;
revoke all on function private.validate_work_context() from public, anon, authenticated;

commit;

-- Pierwsze uruchomienie:
-- 1. Utwórz konto właściciela w Supabase Auth.
-- 2. W SQL Editor dodaj profil, organizację główną i członkostwo system_admin.
-- 3. Nie używaj user_metadata jako źródła uprawnień.
-- 4. Po wdrożeniu uruchom Security Advisor i sprawdź wszystkie ostrzeżenia.

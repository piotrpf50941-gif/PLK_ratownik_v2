import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Izolowany Postgres w pamięci. Bez połączenia z Supabase, pocztą, PUSH lub SMS.
const db = new PGlite();
const uid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const ids = { system: uid(1), admin: uid(2), employee: uid(3), responder: uid(4), other: uid(5), inactive: uid(6), invited: uid(7) };
const orgs = { root: uid(101), a: uid(102), b: uid(103), child: uid(104) };
const membership = { system: uid(201), admin: uid(202), employee: uid(203), responder: uid(204), other: uid(205), inactive: uid(206) };
let assertions = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
async function forbidden(sql, params = []) {
  await assert.rejects(db.query(sql, params), /permission denied|row-level security/);
  assertions += 1;
}
async function rejected(sql, params, pattern) {
  await assert.rejects(db.query(sql, params), pattern);
  assertions += 1;
}
async function asUser(user, callback, role = 'authenticated') {
  await db.exec('set role ' + role);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
  try { await callback(); } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  const schema = readFileSync(new URL('../supabase/internal-platform.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  await db.exec(schema); // Ponowne wykonanie blueprintu nie otwiera grantów.

  for (const id of Object.values(ids)) await db.query('insert into auth.users values ($1)', [id]);
  for (const [name, id] of Object.entries(ids)) {
    if (name === 'invited') continue;
    await db.query('insert into public.profiles (user_id, display_name, active) values ($1,$2,$3)', [id, 'TEST ' + name, name !== 'inactive']);
  }
  for (const [name, id] of Object.entries(orgs)) {
    const parent = name === 'root' ? null : name === 'child' ? orgs.a : orgs.root;
    await db.query('insert into public.organizations (id,parent_id,name,code,kind) values ($1,$2,$3,$4,$5)',
      [id, parent, 'TEST ' + name, 'TEST-' + name.toUpperCase(), name === 'root' ? 'company' : name === 'child' ? 'section' : 'zlk']);
  }
  const roles = { system: 'system_admin', admin: 'unit_admin', employee: 'employee', responder: 'responder', other: 'responder', inactive: 'responder' };
  for (const [name, id] of Object.entries(membership)) {
    const org = name === 'system' ? orgs.root : name === 'other' ? orgs.b : orgs.a;
    await db.query('insert into public.memberships (id,user_id,organization_id,role) values ($1,$2,$3,$4)', [id, ids[name], org, roles[name]]);
    if (roles[name] === 'responder') await db.query('insert into public.responder_profiles (membership_id,available) values ($1,true)', [id]);
  }
  check((await db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity")).rows[0].n, 0, 'RLS na każdej tabeli aplikacji');
  check((await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef")).rows[0].n, 0, 'Brak funkcji SECURITY DEFINER w publicznym API');
  check((await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (has_function_privilege('anon',p.oid,'EXECUTE') or (p.proname <> 'organization_access' and has_function_privilege('authenticated',p.oid,'EXECUTE')))")).rows[0].n, 0, 'Każdy uprzywilejowany RPC jest niedostępny dla anon i authenticated');

  await asUser(null, async () => {
    for (const table of ['organizations','profiles','memberships','incidents','audit_log']) await forbidden('select * from public.' + table);
    await forbidden('select * from private.responder_contacts');
    await forbidden('select * from public.get_alert_recipients_for_dispatch($1)', [orgs.a]);
  }, 'anon');

  await asUser(ids.employee, async () => {
    check((await db.query('select id from public.organizations order by id')).rows.map(r => r.id), [orgs.a], 'Pracownik nie widzi obcej jednostki');
    check((await db.query('select distinct organization_id from public.memberships')).rows.map(r => r.organization_id), [orgs.a]);
    check((await db.query('select user_id from public.profiles order by user_id')).rows.map(r => r.user_id), [ids.employee, ids.responder],
      'Pracownik widzi własny profil i aktywnego ratownika, nie spis współpracowników');
    await forbidden('select * from private.responder_contacts');
    await forbidden('select * from public.get_alert_recipients_for_dispatch($1)', [orgs.a]);
    await forbidden("insert into public.memberships (user_id,organization_id,role) values ($1,$2,'system_admin')", [ids.employee, orgs.a]);
    await forbidden('update public.profiles set active=true where user_id=$1', [ids.employee]);
    await forbidden("insert into public.incidents (organization_id,created_by,idempotency_key,incident_type,place_description) values ($1,$2,$3,'other','TEST')", [orgs.a, ids.employee, uid(300)]);
  });

  await asUser(ids.admin, async () => {
    check((await db.query('select id from public.organizations order by id')).rows.map(r => r.id), [orgs.a, orgs.child], 'Admin jednostki dziedziczy zakres, ale nie widzi sąsiedniej jednostki');
    const inserted = await db.query("insert into public.organizations (parent_id,name,code,kind) values ($1,'TEST nowa','TEST-NEW','section') returning created_by", [orgs.a]);
    check(inserted.rows[0].created_by, ids.admin, 'Autor dodanej jednostki jest zapisany');
    await forbidden('update public.organizations set parent_id=$1 where id=$2', [orgs.child, orgs.a]);
    await forbidden("insert into public.organizations (parent_id,name,code,kind) values ($1,'TEST obca','TEST-FORBIDDEN','workplace')", [orgs.b]);
    await forbidden("insert into public.memberships (user_id,organization_id,role) values ($1,$2,'system_admin')", [ids.admin, orgs.a]);
    await forbidden("update public.memberships set role='system_admin' where id=$1", [membership.employee]);
    check((await db.query('update public.memberships set active=false where id=$1 returning id', [membership.system])).rows.length, 0, 'Admin jednostki nie wyłącza admina systemu');
  });

  await asUser(ids.responder, async () => {
    check((await db.query('update public.responder_profiles set available=false where membership_id=$1 returning membership_id', [membership.responder])).rows.length, 1);
    check((await db.query('update public.responder_profiles set available=false where membership_id=$1 returning membership_id', [membership.other])).rows.length, 0);
    await db.query('update public.responder_profiles set available=true where membership_id=$1', [membership.responder]);
    await forbidden('select public.upsert_push_subscription($1,$2,$3,$4)', [membership.responder, 'https://example.test/push', 'test-key-12345', 'test-auth-12345']);
  });

  await asUser(ids.inactive, async () => {
    check((await db.query('select * from public.memberships')).rows.length, 0, 'Wyłączony profil nie odzyskuje dostępu dzięki starej sesji');
    check((await db.query('select * from public.organizations')).rows.length, 0);
    check((await db.query('update public.responder_profiles set available=true returning membership_id')).rows.length, 0);
  });

  await asUser(null, async () => {
    const invited = await db.query('select public.register_invited_responder($1,$2,$3,$4,$5,$6) as id',
      [ids.invited, orgs.a, 'TEST Zaproszenie', null, ['TEST'], ids.admin]);
    assert.ok(invited.rows[0].id);
    assertions += 1;
    check((await db.query('select available from public.responder_profiles where membership_id=$1', [invited.rows[0].id])).rows[0].available, false, 'Nowo zaproszony ratownik musi zgłosić gotowość');
    const push = await db.query('select public.upsert_push_subscription($1,$2,$3,$4) as id',
      [membership.responder, 'https://fcm.googleapis.com/test', 'test-key-12345', 'test-auth-12345']);
    assert.ok(push.rows[0].id);
    assertions += 1;
    const recipients = await db.query('select * from public.get_alert_recipients_for_dispatch($1)', [orgs.a]);
    check(recipients.rows.some(r => r.user_id === ids.inactive), false, 'Wyłączony pracownik nie otrzymuje alarmów');
    check(recipients.rows.some(r => r.user_id === ids.other), false, 'Alarm nie trafia do obcej jednostki');
    check(recipients.rows.find(r => r.user_id === ids.responder).push_subscriptions.length, 1);
    const sql = 'select public.reserve_incident($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as incident';
    const params = [ids.employee, orgs.a, uid(301), 'other', 'TEST miejsce', null, null, null, null, 'simulation'];
    const first = (await db.query(sql, params)).rows[0].incident;
    const retry = (await db.query(sql, params)).rows[0].incident;
    check(first.is_duplicate, false);
    check(retry.is_duplicate, true);
    check(retry.id, first.id, 'Ponowienie zachowuje ten sam alarm');
    await assert.rejects(db.query(sql, [ids.employee, orgs.a, uid(302), ...params.slice(3)]), /rate_limited/);
    await assert.rejects(db.query(sql, [ids.employee, orgs.b, uid(301), ...params.slice(3)]), /access_denied/);
    assertions += 2;
  }, 'service_role');

  await asUser(ids.other, async () => check((await db.query('select * from public.incidents')).rows.length, 0));
  await asUser(ids.system, async () => check((await db.query('select * from public.organizations')).rows.length, 5));

  // Regresja: wyłączenie zakładu musi wyłączyć uprawnienia także w jego sekcjach.
  await db.query("insert into public.memberships (user_id,organization_id,role) values ($1,$2,'employee')", [ids.employee, orgs.child]);
  await db.query('update public.organizations set active=false where id=$1', [orgs.a]);
  await asUser(ids.employee, async () => {
    check((await db.query('select * from public.organizations where id=$1', [orgs.child])).rows.length, 0,
      'Nieaktywna jednostka nadrzędna odcina dostęp do sekcji');
  });
  await db.query('update public.organizations set active=true where id=$1', [orgs.a]);

  check((await db.query('select code,label from public.roles order by code')).rows.length, 4, 'Cztery istniejące kody ról');
  check((await db.query("select label from public.roles where code='unit_admin'")).rows[0].label, 'Koordynator jednostki');
  check((await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prosecdef order by proname")).rows.map(r => r.proname),
    ['audit_administrative_change', 'can_manage_organization', 'can_view_incident', 'can_view_organization', 'can_view_user', 'is_active_user', 'is_system_admin'],
    'Zamknięta lista prywatnych funkcji uprzywilejowanych');
  for (const view of ['sections', 'user_sections']) {
    check((await db.query('select reloptions from pg_class where oid=$1::regclass', ['public.' + view])).rows[0].reloptions.includes('security_invoker=true'), true, 'Widok zachowuje RLS: ' + view);
  }

  await asUser(null, async () => {
    for (const table of ['roles', 'user_work_contexts', 'sections', 'user_sections']) await forbidden('select * from public.' + table);
    await forbidden('select public.organization_access($1)', [orgs.a]);
  }, 'anon');
  await asUser(ids.employee, async () => {
    check((await db.query('select id from public.sections')).rows.map(r => r.id), [orgs.child], 'Pracownik widzi wyłącznie zatwierdzoną sekcję');
    check((await db.query('select section_id from public.user_sections where user_id=$1', [ids.employee])).rows.map(r => r.section_id), [orgs.child]);
    check((await db.query('select public.organization_access($1) as access', [orgs.child])).rows[0].access, { can_access: true, can_manage: false });
    check((await db.query('select public.organization_access($1) as access', [orgs.b])).rows[0].access, { can_access: false, can_manage: false });
    await forbidden("update public.roles set label='TEST przejęcie'");
    await forbidden('select private.user_can_access_organization($1,$2)', [ids.system, orgs.b]);
  });

  // Walidacja struktury działa również dla zapisów serwera, nie tylko formularza.
  await rejected("insert into public.organizations (name,code,kind,parent_id) values ('TEST','BAD-SECTION','section',$1)", [orgs.root], /invalid_organization_hierarchy/);
  await rejected("insert into public.organizations (name,code,kind,parent_id) values ('TEST','BAD-ROOT','company',$1)", [orgs.child], /invalid_organization_hierarchy/);
  await rejected('update public.organizations set parent_id=$1 where id=$2', [orgs.child, orgs.a], /organization_structure_immutable/);
  await rejected('update public.organizations set active=false where id=$1', [orgs.root], /organization_hosts_system_admin/);
  await rejected("insert into public.memberships (user_id,organization_id,role) values ($1,$2,'system_admin')", [ids.invited, orgs.child], /system_admin_requires_company/);
  await rejected('update public.memberships set user_id=$1 where id=$2', [ids.invited, membership.responder], /membership_identity_immutable/);

  await asUser(ids.admin, async () => {
    await db.query("update public.organizations set name='TEST zmieniona sekcja' where id=$1", [orgs.child]);
    const log = (await db.query("select actor_id,details from public.audit_log where entity_id=$1 and action='organizations_update' order by id desc limit 1", [orgs.child])).rows[0];
    check(log.actor_id, ids.admin, 'Autor edycji jest rejestrowany w tej samej transakcji');
    check(Object.keys(log.details).includes('name'), false, 'Audyt nie kopiuje treści formularza');
    const approval = (await db.query("insert into public.memberships (user_id,organization_id,role,approved_by) values ($1,$2,'employee',$3) returning approved_by,approved_at",
      [ids.invited, orgs.child, ids.system])).rows[0];
    check(approval.approved_by, ids.admin, 'Nie można podrobić osoby zatwierdzającej');
    check(Boolean(approval.approved_at), true, 'Przypisanie ma czas zatwierdzenia');
    const memberLog = (await db.query("select actor_id from public.audit_log where organization_id=$1 and action='memberships_insert' order by id desc limit 1", [orgs.child])).rows[0];
    check(memberLog.actor_id, ids.admin, 'Przypisanie sekcji jest audytowane');
  });

  // Użytkownik zna status własnego alarmu, nie historię wszystkich współpracowników.
  const unrelatedIncident = uid(410);
  await db.query("insert into public.incidents (id,organization_id,created_by,idempotency_key,incident_type,place_description) values ($1,$2,$3,$4,'other','TEST inne zdarzenie')",
    [unrelatedIncident, orgs.a, ids.invited, uid(411)]);
  await asUser(ids.employee, async () => {
    check((await db.query('select created_by from public.incidents')).rows.map(r => r.created_by), [ids.employee], 'Pracownik widzi tylko swój alarm');
  });
  await asUser(ids.responder, async () => check((await db.query('select * from public.incidents')).rows.length, 0, 'Sam status ratownika nie otwiera całej historii'));
  await db.query('insert into public.alert_recipients (incident_id,membership_id) values ($1,$2)', [unrelatedIncident, membership.responder]);
  await asUser(ids.responder, async () => {
    check((await db.query('select id from public.incidents')).rows.map(r => r.id), [unrelatedIncident], 'Ratownik widzi skierowany do niego alarm');
    check((await db.query('select membership_id from public.alert_recipients')).rows.map(r => r.membership_id), [membership.responder]);
  });
  await asUser(ids.admin, async () => check((await db.query('select id from public.incidents')).rows.length, 2, 'Koordynator widzi historię swojej jednostki'));

  // Jeden ratownik, dwie zatwierdzone sekcje i osobna gotowość w każdej z nich.
  const sectionB = uid(420), responderSectionA = uid(421), responderSectionB = uid(422);
  await db.query("insert into public.organizations (id,parent_id,name,code,kind) values ($1,$2,'TEST sekcja B','TEST-B-SEC','section')", [sectionB, orgs.b]);
  for (const [id, section] of [[responderSectionA, orgs.child], [responderSectionB, sectionB]]) {
    await db.query("insert into public.memberships (id,user_id,organization_id,role) values ($1,$2,$3,'responder')", [id, ids.responder, section]);
    await db.query('insert into public.responder_profiles (membership_id) values ($1)', [id]);
  }
  await asUser(ids.responder, async () => {
    check((await db.query('select section_id from public.user_sections where user_id=$1 order by section_id', [ids.responder])).rows.map(r => r.section_id), [orgs.child, sectionB]);
    await db.query('update public.responder_profiles set available=true where membership_id=$1', [responderSectionA]);
    check((await db.query('select available from public.responder_profiles where membership_id=$1', [responderSectionB])).rows[0].available, false, 'Gotowość nie przenosi się na inne sekcje');
    await forbidden('insert into public.user_work_contexts (user_id,current_section_id) values ($1,$2)', [ids.responder, sectionB]);
    await forbidden('select public.save_work_context($1,$2,$3,$4)', [ids.responder, orgs.a, orgs.child, sectionB]);
  });

  const saveContextSql = 'select * from public.save_work_context($1,$2,$3,$4)';
  await asUser(null, async () => {
    const saved = (await db.query(saveContextSql, [ids.responder, orgs.a, orgs.child, sectionB])).rows[0];
    check(saved.primary_organization_id, orgs.a, 'Podstawowy zakład jest zapisany');
    check(saved.primary_section_id, orgs.child, 'Podstawowa sekcja jest zapisana');
    check(saved.current_section_id, sectionB, 'Bieżące miejsce pracy może być inne niż podstawowe');
    await rejected(saveContextSql, [ids.responder, orgs.b, orgs.child, sectionB], /work_context_invalid_primary_section/);
    await rejected(saveContextSql, [ids.employee, orgs.a, orgs.child, sectionB], /work_context_unapproved_current_section/);
    await rejected(saveContextSql, [ids.responder, orgs.a, orgs.child, orgs.a], /work_context_unapproved_current_section/);
    await rejected(saveContextSql, [ids.inactive, orgs.a, null, null], /work_context_inactive_user/);
    check((await db.query('select * from public.get_alert_recipients_for_dispatch($1)', [orgs.child])).rows.map(r => r.membership_id), [responderSectionA]);
    check((await db.query('select * from public.get_alert_recipients_for_dispatch($1)', [sectionB])).rows.length, 0, 'Niedostępny ratownik nie trafia na listę wysyłkową');
  }, 'service_role');
  await asUser(ids.employee, async () => check((await db.query('select * from public.user_work_contexts')).rows.length, 0, 'Miejsce pracy innej osoby pozostaje prywatne'));
  await asUser(ids.responder, async () => check((await db.query('select current_section_id from public.user_work_contexts')).rows.map(r => r.current_section_id), [sectionB]));
  await asUser(ids.system, async () => check((await db.query('select * from public.user_work_contexts')).rows.length, 1));
  await db.query('update public.memberships set active=false where id=$1', [responderSectionB]);
  await asUser(ids.responder, async () => check((await db.query('select public.organization_access($1) as access', [sectionB])).rows[0].access.can_access, false, 'Zapisane miejsce pracy nie przywraca cofniętych uprawnień'));
  await asUser(null, async () => rejected(saveContextSql, [ids.responder, orgs.a, orgs.child, sectionB], /work_context_unapproved_current_section/), 'service_role');

  await db.query('update public.organizations set active=false where id=$1', [orgs.a]);
  await asUser(ids.responder, async () => {
    check((await db.query('select public.organization_access($1) as access', [orgs.child])).rows[0].access, { can_access: false, can_manage: false });
    check((await db.query('update public.responder_profiles set available=true where membership_id=$1 returning membership_id', [responderSectionA])).rows.length, 0, 'Wyłączona hierarchia blokuje zgłoszenie gotowości');
    check((await db.query('select * from public.incidents')).rows.length, 0, 'Wyłączenie hierarchii odcina również historię alarmów');
  });
  await asUser(null, async () => {
    check((await db.query('select * from public.get_alert_recipients_for_dispatch($1)', [orgs.child])).rows.length, 0, 'Serwer również odrzuca ratowników nieaktywnej hierarchii');
    await rejected('select public.upsert_push_subscription($1,$2,$3,$4)', [responderSectionA, 'https://fcm.googleapis.com/TEST-A', 'test-key-12345', 'test-auth-12345'], /active responder membership not found/);
  }, 'service_role');
  await asUser(ids.system, async () => {
    check((await db.query('select id from public.organizations where id=$1', [orgs.a])).rows.length, 1, 'Administrator widzi nieaktywną jednostkę do ponownego włączenia');
    await db.query('update public.organizations set active=true where id=$1', [orgs.a]);
  });

  const membershipCount = (await db.query('select count(*)::int as n from public.memberships')).rows[0].n;
  await db.exec(schema);
  check((await db.query('select count(*)::int as n from public.memberships')).rows[0].n, membershipCount, 'Ponowne wykonanie schematu nie usuwa wcześniejszych przypisań');
  await asUser(ids.employee, async () => check((await db.query('select created_by from public.incidents')).rows.map(r => r.created_by), [ids.employee], 'Ponowne wykonanie schematu nie otwiera historii innych osób'));

  // Wyłącznie ta izolowana baza: odtwarzamy wadliwe dane starszej wersji.
  // Blueprint musi zatrzymać wdrożenie, nie naprawiać struktury przez utratę danych.
  await db.exec('alter table public.organizations disable trigger organizations_validate');
  await db.query('update public.organizations set parent_id=$1 where id=$2', [orgs.child, orgs.a]);
  await db.exec('alter table public.organizations enable trigger organizations_validate');
  await asUser(ids.employee, async () => {
    check((await db.query('select public.organization_access($1) as access', [orgs.child])).rows[0].access,
      { can_access: false, can_manage: false }, 'Cykl ze starszej bazy nie przyznaje uprawnień i nie zapętla zapytania');
  });
  await assert.rejects(db.exec(schema), /organization_hierarchy_review_required/);
  assertions += 1;
  await db.exec('rollback');
  check((await db.query('select parent_id from public.organizations where id=$1', [orgs.a])).rows[0].parent_id,
    orgs.child, 'Niezgodna stara struktura pozostaje nietknięta do przeglądu');
  check((await db.query('select count(*)::int as n from public.memberships')).rows[0].n,
    membershipCount, 'Nieudane wdrożenie nie usuwa przypisań');
  await db.exec('alter table public.organizations disable trigger organizations_validate');
  await db.query('update public.organizations set parent_id=$1 where id=$2', [orgs.root, orgs.a]);
  await db.exec('alter table public.organizations enable trigger organizations_validate');
  await db.exec(schema);
  await asUser(ids.employee, async () => check((await db.query('select public.organization_access($1) as access', [orgs.child])).rows[0].access.can_access,
    true, 'Poprawna struktura ponownie przechodzi walidację'));
  console.log('Test bazy PostgreSQL: OK (' + assertions + ' kontroli SQL, RLS, izolacji jednostek i idempotencji)');
} catch (error) {
  console.error('Test bazy: BŁĄD', error.message, error.query || '', error.detail || '', error.where || '');
  process.exitCode = 1;
} finally {
  await db.close();
}

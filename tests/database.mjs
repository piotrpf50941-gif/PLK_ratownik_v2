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
async function asUser(user, callback, role = 'authenticated') {
  await db.exec('set role ' + role);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
  try { await callback(); } finally { await db.exec('reset role'); }
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
      [id, parent, 'TEST ' + name, 'TEST-' + name.toUpperCase(), name === 'root' ? 'company' : 'section']);
  }
  const roles = { system: 'system_admin', admin: 'unit_admin', employee: 'employee', responder: 'responder', other: 'responder', inactive: 'responder' };
  for (const [name, id] of Object.entries(membership)) {
    const org = name === 'system' ? orgs.root : name === 'other' ? orgs.b : orgs.a;
    await db.query('insert into public.memberships (id,user_id,organization_id,role) values ($1,$2,$3,$4)', [id, ids[name], org, roles[name]]);
    if (roles[name] === 'responder') await db.query('insert into public.responder_profiles (membership_id,available) values ($1,true)', [id]);
  }
  check((await db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity")).rows[0].n, 0, 'RLS na każdej tabeli aplikacji');
  check((await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef")).rows[0].n, 0, 'Brak funkcji SECURITY DEFINER w publicznym API');
  check((await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))")).rows[0].n, 0, 'Każdy uprzywilejowany RPC jest niedostępny dla anon i authenticated');

  await asUser(null, async () => {
    for (const table of ['organizations','profiles','memberships','incidents','audit_log']) await forbidden('select * from public.' + table);
    await forbidden('select * from private.responder_contacts');
    await forbidden('select * from public.get_alert_recipients_for_dispatch($1)', [orgs.a]);
  }, 'anon');

  await asUser(ids.employee, async () => {
    check((await db.query('select id from public.organizations order by id')).rows.map(r => r.id), [orgs.a], 'Pracownik nie widzi obcej jednostki');
    check((await db.query('select distinct organization_id from public.memberships')).rows.map(r => r.organization_id), [orgs.a]);
    await forbidden('select * from private.responder_contacts');
    await forbidden('select * from public.get_alert_recipients_for_dispatch($1)', [orgs.a]);
    await forbidden("insert into public.memberships (user_id,organization_id,role) values ($1,$2,'system_admin')", [ids.employee, orgs.a]);
    await forbidden('update public.profiles set active=true where user_id=$1', [ids.employee]);
    await forbidden("insert into public.incidents (organization_id,created_by,idempotency_key,incident_type,place_description) values ($1,$2,$3,'other','TEST')", [orgs.a, ids.employee, uid(300)]);
  });

  await asUser(ids.admin, async () => {
    check((await db.query('select id from public.organizations order by id')).rows.map(r => r.id), [orgs.a, orgs.child], 'Admin jednostki dziedziczy zakres, ale nie widzi sąsiedniej jednostki');
    const inserted = await db.query("insert into public.organizations (parent_id,name,code,kind) values ($1,'TEST nowa','TEST-NEW','workplace') returning created_by", [orgs.a]);
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
    await assert.rejects(db.query(sql, [ids.employee, orgs.b, uid(301), ...params.slice(3)]), /idempotency_conflict/);
    assertions += 2;
  }, 'service_role');

  await asUser(ids.other, async () => check((await db.query('select * from public.incidents')).rows.length, 0));
  await asUser(ids.system, async () => check((await db.query('select * from public.organizations')).rows.length, 5));
  console.log('Test bazy PostgreSQL: OK (' + assertions + ' kontroli SQL, RLS, izolacji jednostek i idempotencji)');
} catch (error) {
  console.error('Test bazy: BŁĄD', error.message, error.query || '', error.detail || '');
  process.exitCode = 1;
} finally {
  await db.close();
}

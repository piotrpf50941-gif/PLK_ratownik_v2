import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'internal/index.html',
  'internal/styles.css',
  'internal/config.js',
  'internal/config.example.js',
  'internal/app.js',
  'internal/README.md',
  'supabase/config.toml',
  'supabase/internal-platform.sql',
  'supabase/functions/_shared/common.ts',
  'supabase/functions/dispatch-responder-alert/index.ts',
  'supabase/functions/manage-responder/index.ts'
];

for (const path of requiredFiles) {
  assert.equal(existsSync(path), true, 'Brak wymaganego pliku: ' + path);
}

const html = readFileSync('internal/index.html', 'utf8');
const app = readFileSync('internal/app.js', 'utf8');
const config = readFileSync('internal/config.js', 'utf8');
const example = readFileSync('internal/config.example.js', 'utf8');
const sql = readFileSync('supabase/internal-platform.sql', 'utf8');
const dispatcher = readFileSync('supabase/functions/dispatch-responder-alert/index.ts', 'utf8');
const manager = readFileSync('supabase/functions/manage-responder/index.ts', 'utf8');
const common = readFileSync('supabase/functions/_shared/common.ts', 'utf8');
const sw = readFileSync('sw.js', 'utf8');

assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
assert.match(html, /@supabase\/supabase-js@2\.112\.4\/dist\/umd\/supabase\.min\.js/);
assert.doesNotMatch(html, /@supabase\/supabase-js@(latest|\^|~)/);
assert.match(html, /id="loginSection"/);
assert.match(html, /id="respondersPanel"/);
assert.match(html, /id="organizationsPanel"/);
assert.match(html, /id="incidentsPanel"/);
assert.match(html, /id="alertConfirm"/);
assert.match(html, /Content-Security-Policy/);

const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, 'Identyfikatory HTML nie mogą się powtarzać.');

const usedIds = [...app.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
const missingIds = [...new Set(usedIds)].filter((id) => !htmlIds.includes(id));
assert.deepEqual(missingIds, [], 'app.js odwołuje się do nieistniejących ID: ' + missingIds.join(', '));

assert.match(config, /supabaseUrl:\s*''/);
assert.match(config, /supabasePublishableKey:\s*''/);
assert.doesNotMatch(config, /supabasePublishableKey:\s*'(sb_secret_|eyJ[A-Za-z0-9_-]{30,})/);
assert.match(example, /sb_publishable_TUTAJ_KLUCZ_PUBLICZNY/);
assert.doesNotMatch(app, /localStorage/);
assert.doesNotMatch(app + html, /\+48[0-9]{7,}/);
assert.match(app, /shouldCreateUser:\s*false/);
assert.match(app, /flowType:\s*'pkce'/);
assert.match(app, /functions\.invoke\('dispatch-responder-alert'/);
assert.match(app, /functions\.invoke\('manage-responder'/);

const rlsTables = [
  'organizations',
  'profiles',
  'memberships',
  'responder_profiles',
  'incidents',
  'alert_recipients',
  'delivery_attempts',
  'audit_log'
];
for (const table of rlsTables) {
  assert.match(sql, new RegExp('alter table public\\.' + table + ' enable row level security;', 'i'));
}
assert.doesNotMatch(sql, /auth\.role\s*\(/);
assert.doesNotMatch(sql, /auth\.jwt\s*\([^)]*\).*user_metadata/is);
assert.match(sql, /revoke all on private\.responder_contacts from public, anon, authenticated;/);
assert.match(sql, /revoke all on private\.push_subscriptions from public, anon, authenticated;/);
assert.match(sql, /grant execute on function public\.get_alert_recipients_for_dispatch\(uuid\) to service_role;/);
assert.match(sql, /grant execute on function public\.register_invited_responder\(uuid, uuid, text, text, text\[\], uuid\) to service_role;/);
assert.match(sql, /private\.is_system_admin\(\)\s+or role in \('employee', 'responder'\)/);
assert.equal((sql.match(/security definer/gi) || []).length >= 6, true);
assert.equal((sql.match(/set search_path = ''/g) || []).length >= 8, true);
assert.equal((sql.match(/as \$\$/g) || []).length, (sql.match(/\$\$;/g) || []).length, 'Niesparowane ograniczniki funkcji SQL.');

assert.match(common, /@supabase\/supabase-js@2\.112\.4/);
assert.match(common, /Cache-Control': 'no-store'/);
assert.match(dispatcher, /Deno\.env\.get\('NOTIFICATION_MODE'\) === 'production'/);
assert.match(dispatcher, /SMS_WEBHOOK_URL/);
assert.match(dispatcher, /PUSH_WEBHOOK_URL/);
assert.match(dispatcher, /idempotency_key/);
assert.match(dispatcher, /alarm_dispatched/);
assert.match(dispatcher, /rate_limited/);
assert.match(manager, /inviteUserByEmail/);
assert.match(manager, /register_invited_responder/);
assert.doesNotMatch(dispatcher + manager + common, /sb_secret_[A-Za-z0-9_-]+/);
assert.doesNotMatch(dispatcher + manager + common, /service_role\s*[:=]\s*['"][A-Za-z0-9]/i);

assert.match(sw, /PUBLIC_NAVIGATION_PATHS/);
assert.match(sw, /if \(!PUBLIC_NAVIGATION_PATHS\.has\(url\.pathname\)\) return;/);
assert.doesNotMatch(sw, /internal\/index\.html/);

console.log('Test panelu wewnętrznego: OK (' + requiredFiles.length + ' plików, ' + usedIds.length + ' odwołań DOM)');

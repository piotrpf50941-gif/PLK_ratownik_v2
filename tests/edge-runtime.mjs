import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// Uruchamia rzeczywiste handlery TS z atrapami Auth, API bazy i dostawców.
// Test nie ma połączenia z internetem i nie wysyła wiadomości.
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const userId = id(1), orgId = id(2), memberId = id(3), key = id(4), incidentId = id(5);
const body = { organizationId: orgId, idempotencyKey: key, expectedMode: 'simulation', incidentType: 'other', placeDescription: 'TEST miejsce', note: 'TEST nie przesyłaj do dostawcy', location: { latitude: 52, longitude: 21, accuracyMeters: 20 } };
const common = stripTypeScriptTypes(readFileSync('supabase/functions/_shared/common.ts', 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, ''));

function harness(file = 'dispatch-responder-alert', options = {}) {
  const state = { authenticated: true, profileActive: true, roles: [{ organization_id: orgId, role: 'employee' }], mode: 'simulation', rows: [], network: [], rpcCalls: [], invites: [], writes: [], recipients: [{ membership_id: memberId, user_id: userId, phone_e164: '+48111111111', sms_enabled: true, push_subscriptions: [{ endpoint: 'https://fcm.googleapis.com/TEST' }] }], ...options };
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-public-key', SUPABASE_SECRET_KEY: 'test-server-key', NOTIFICATION_MODE: state.mode, INTERNAL_APP_URL: 'https://example.test/internal/', SMS_WEBHOOK_URL: 'https://sms.example.test/send', SMS_WEBHOOK_TOKEN: 'test-only', PUSH_WEBHOOK_URL: 'https://push.example.test/send', PUSH_WEBHOOK_TOKEN: 'test-only' };
  function from(table) {
    const query = { table, op: 'select', filters: [], data: null };
    const api = {
      select(columns, settings) { query.columns = columns; query.settings = settings; return api; },
      eq(column, value) { query.filters.push([column, value]); return api; },
      in(column, value) { query.filters.push([column, value]); return api; },
      insert(data) { query.op = 'insert'; query.data = data; return api; },
      update(data) { query.op = 'update'; query.data = data; return api; },
      maybeSingle() { query.single = true; return api; },
      single() { query.single = true; return api; },
      then(resolve, reject) { return Promise.resolve().then(() => execute(query)).then(resolve, reject); }
    };
    return api;
  }
  function execute(query) {
    if (query.op !== 'select') {
      state.writes.push(query);
      if (state.failWrite === query.table) return { data: null, error: { message: 'TEST db failure' } };
      if (query.table === 'incidents') {
        const row = state.rows.find(r => r.id === query.filters.find(f => f[0] === 'id')?.[1]);
        if (row) Object.assign(row, query.data);
      }
      if (query.table === 'alert_recipients') return { data: query.data.map((r, i) => ({ ...r, id: id(100 + i) })), error: null };
      return { data: query.data, error: null };
    }
    if (query.table === 'profiles') return { data: state.profileActive ? { user_id: userId } : null, error: null };
    if (query.table === 'memberships') {
      if (query.single) return { data: state.pushMembership === false ? null : { id: memberId, organization_id: orgId }, error: null };
      const allowedRoles = query.filters.find(f => f[0] === 'role')?.[1];
      return { data: allowedRoles ? state.roles.filter(r => allowedRoles.includes(r.role)) : state.roles, error: null };
    }
    if (query.table === 'organizations') return { data: state.organizationInactive ? null : { id: orgId, name: 'TEST jednostka', code: 'TEST', parent_id: null }, error: null };
    if (query.table === 'alert_recipients') return { count: state.recipients.length, data: null, error: null };
    return { data: [], error: null };
  }
  const client = {
    from,
    auth: {
      async getUser() { return { data: { user: state.authenticated ? { id: userId, is_anonymous: false } : null }, error: null }; },
      admin: { async inviteUserByEmail(email, options) { state.invites.push({ email, options }); return { data: { user: { id: id(6) } }, error: null }; } }
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args });
      if (name === 'reserve_incident') {
        if (state.rateLimited) return { error: { message: 'rate_limited' }, data: null };
        const duplicate = state.rows.find(r => r.idempotency_key === args.target_key);
        if (duplicate) return { data: { ...duplicate, is_duplicate: true }, error: null };
        const row = { id: incidentId, idempotency_key: args.target_key, created_at: new Date().toISOString(), status: 'dispatching', notification_mode: args.target_mode };
        state.rows.push(row);
        return { data: { ...row, is_duplicate: false }, error: null };
      }
      if (name === 'get_alert_recipients_for_dispatch') return { data: state.recipients, error: null };
      if (name === 'register_invited_responder' && state.registrationFails) return { data: null, error: { message: 'TEST registration failed' } };
      return { data: memberId, error: null };
    }
  };
  let handler;
  const sandbox = {
    Request, Response, Headers, URL, AbortSignal,
    createClient: () => client,
    corsHeaders: { 'Access-Control-Allow-Origin': '*' },
    Deno: { env: { get: name => env[name] }, serve: callback => { handler = callback; } },
    console: { error() {} },
    async fetch(url, options) {
      state.network.push({ url, options, body: JSON.parse(options.body) });
      if (state.providerFails || (state.partial && String(url).includes('sms.'))) return new Response('{}', { status: 503 });
      return new Response(JSON.stringify(state.providerEmpty ? {} : { accepted: true, messageId: 'TEST-provider-id' }), { status: 200 });
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(common, sandbox, { filename: 'common.ts' });
  const source = readFileSync('supabase/functions/' + file + '/index.ts', 'utf8').replace(/^import\s+\{[\s\S]*?\}\s+from\s+'[^']+'\s*/, '');
  vm.runInContext(stripTypeScriptTypes(source), sandbox, { filename: file + '.ts' });
  return {
    state,
    async request(payload = body, method = 'POST') {
      const response = await handler(new Request('https://example.test/function', { method, headers: { Authorization: 'Bearer TEST', 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}) }));
      return { status: response.status, data: await response.json() };
    }
  };
}

let checks = 0;
async function scenario(name, callback) { await callback(); checks += 1; }
await scenario('auth', async () => {
  const h = harness(undefined, { authenticated: false });
  assert.equal((await h.request()).status, 401);
  assert.equal(h.state.writes.length, 0);
});
await scenario('revoked profile', async () => assert.equal((await harness(undefined, { profileActive: false }).request()).status, 403));
await scenario('bad body', async () => assert.equal((await harness().request(null)).status, 400));
await scenario('HTTP method', async () => assert.equal((await harness().request(null, 'GET')).status, 405));
await scenario('test cannot send production', async () => {
  const h = harness(undefined, { mode: 'production' });
  assert.equal((await h.request()).data.error, 'mode_mismatch');
  assert.equal(h.state.rows.length + h.state.network.length, 0);
});
await scenario('foreign organization', async () => assert.equal((await harness().request({ ...body, organizationId: id(99) })).status, 403));
await scenario('invalid GPS', async () => assert.equal((await harness().request({ ...body, location: { latitude: 900, longitude: 20 } })).status, 400));
await scenario('rate limit', async () => assert.equal((await harness(undefined, { rateLimited: true }).request()).status, 429));
await scenario('simulation and retry', async () => {
  const h = harness();
  const first = await h.request();
  assert.equal(first.data.status, 'simulated');
  assert.equal(h.state.network.length, 0);
  const second = await h.request();
  assert.equal(second.data.duplicate, true);
  assert.equal(second.data.incidentId, first.data.incidentId);
  assert.equal(h.state.rows.length, 1);
  assert.equal(h.state.writes.filter(w => w.table === 'delivery_attempts').length, 1);
});
await scenario('no recipients', async () => {
  const h = harness(undefined, { recipients: [] });
  assert.equal((await h.request()).data.error, 'no_recipients');
  assert.equal(h.state.rows[0].status, 'failed');
});
for (const [options, expected] of [[{ providerFails: true }, 'failed'], [{ providerEmpty: true }, 'failed'], [{ partial: true }, 'partial'], [{}, 'sent']]) {
  await scenario('provider outcome ' + expected, async () => {
    const h = harness(undefined, { mode: 'production', ...options });
    assert.equal((await h.request({ ...body, expectedMode: 'production' })).data.status, expected);
    assert.equal(h.state.network.length, 2);
    assert.doesNotMatch(JSON.stringify(h.state.network), /TEST nie przesyłaj/);
    assert.equal(h.state.network[0].options.redirect, 'error');
  });
}
await scenario('database failure after provider', async () => {
  const h = harness(undefined, { mode: 'production', failWrite: 'delivery_attempts' });
  assert.equal((await h.request({ ...body, expectedMode: 'production' })).status, 500);
  assert.equal(h.state.rows[0].status, 'partial');
});
const invitation = { action: 'invite', organizationId: orgId, displayName: 'TEST Ratownik', email: 'test@example.invalid', phoneE164: null, competencies: [] };
await scenario('invite privilege check', async () => {
  const h = harness('manage-responder');
  assert.equal((await h.request(invitation)).status, 403);
  assert.equal(h.state.invites.length, 0);
});
await scenario('invitation validated before email', async () => {
  const h = harness('manage-responder', { roles: [{ organization_id: orgId, role: 'unit_admin' }] });
  assert.equal((await h.request({ ...invitation, displayName: 'x' })).status, 400);
  assert.equal(h.state.invites.length, 0);
  assert.equal((await h.request(invitation)).status, 201);
});
await scenario('invitation repair status', async () => {
  const h = harness('manage-responder', { roles: [{ organization_id: orgId, role: 'unit_admin' }], registrationFails: true });
  assert.equal((await h.request(invitation)).data.error, 'invitation_needs_repair');
});
const pushBody = { membershipId: memberId, subscription: { endpoint: 'https://fcm.googleapis.com/TEST', keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } } };
await scenario('push registration', async () => assert.equal((await harness('manage-push-subscription').request(pushBody)).status, 200));
await scenario('push ownership', async () => assert.equal((await harness('manage-push-subscription', { pushMembership: false }).request(pushBody)).status, 403));
await scenario('reject push SSRF target', async () => {
  const h = harness('manage-push-subscription');
  assert.equal((await h.request({ ...pushBody, subscription: { ...pushBody.subscription, endpoint: 'http://127.0.0.1/' } })).status, 400);
  assert.equal(h.state.rpcCalls.length, 0);
});
console.log('Test Edge Functions: OK (' + checks + ' scenariuszy, wyłącznie atrapy dostawców — bez wysyłki)');

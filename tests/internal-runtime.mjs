import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = readFileSync('internal/index.html', 'utf8');
const app = readFileSync('internal/app.js', 'utf8');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const userId = uuid(1), orgA = uuid(2), orgB = uuid(3), memberId = uuid(4);
const organizations = [{ id: orgA, name: 'TEST A', code: 'A1', active: true, parent_id: null }, { id: orgB, name: 'TEST B', code: 'B1', active: true, parent_id: null }];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function settle() { for (let i = 0; i < 20; i += 1) await new Promise(resolve => setImmediate(resolve)); }
const pages = [];

async function createPage(options = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: options.url || 'https://example.test/PLK_ratownik_v2/internal/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  pages.push(dom);
  const w = dom.window;
  const state = { role: 'employee', session: { access_token: 'TEST-session', user: { id: userId, email: 'test@example.invalid' } }, organizations: [...organizations], functionCalls: [], queries: [], ...options };
  const $ = id => w.document.getElementById(id);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.fetch = async () => { throw new Error('Tests must not access the network'); };
  if (options.storageBlocked) Object.defineProperty(w, 'sessionStorage', { get() { throw new Error('TEST storage blocked'); } });
  let onAuth;
  function query(table) {
    const operation = { table, kind: 'select', filters: [], values: null };
    const chain = {
      select(columns) { operation.columns = columns; return chain; },
      eq(column, value) { operation.filters.push([column, value]); return chain; },
      gte() { return chain; }, order() { return chain; }, limit() { return chain; },
      maybeSingle() { return chain; }, single() { return chain; },
      insert(values) { operation.kind = 'insert'; operation.values = values; return chain; },
      update(values) { operation.kind = 'update'; operation.values = values; return chain; },
      then(resolve, reject) { return Promise.resolve().then(() => execute(operation)).then(resolve, reject); }
    };
    return chain;
  }
  async function execute(op) {
    state.queries.push(op);
    if (state.deferQuery) {
      const delay = state.deferQuery(op);
      if (delay) return delay;
    }
    if (op.kind !== 'select') return { data: { id: uuid(7), membership_id: memberId }, error: null };
    if (op.table === 'profiles') return { data: { user_id: userId, display_name: 'TEST Pracownik', active: true }, error: null };
    if (op.table === 'organizations') return { data: state.organizations, error: null };
    if (op.table === 'incidents') return { data: [], error: null };
    if (op.table === 'memberships' && op.filters.some(f => f[0] === 'user_id')) {
      return { data: organizations.map(o => ({ id: memberId, user_id: userId, organization_id: o.id, role: state.role, active: true })), error: null };
    }
    if (op.table === 'memberships') {
      const org = op.filters.find(f => f[0] === 'organization_id')[1];
      return { data: [{ id: memberId, user_id: userId, organization_id: org, role: 'responder', active: true, profiles: { display_name: org === orgA ? 'TEST Ratownik A <img src=x>' : 'TEST Ratownik B' }, responder_profiles: { available: true, competencies: ['TEST KPP'] } }], error: null };
    }
    return { data: null, error: null };
  }
  const client = {
    from: query,
    functions: { async invoke(name, options) {
      state.functionCalls.push({ name, body: structuredClone(options.body) });
      if (state.invoke) return state.invoke(name, options);
      return { data: { status: 'simulated', mode: 'simulation', recipientCount: 1 }, error: null };
    } },
    auth: {
      onAuthStateChange(callback) { onAuth = callback; },
      async getSession() { return { data: { session: state.session }, error: null }; },
      async signOut() { state.session = null; onAuth?.('SIGNED_OUT', null); return { error: null }; },
      async signInWithOtp(values) { state.otpRequest = values; return { error: null }; },
      async verifyOtp(values) { state.verified = values; return { error: null }; }
    }
  };
  w.supabase = { createClient(url, key, config) { state.clientConfig = config; return client; } };
  w.RATOWNIK_INTERNAL_CONFIG = { supabaseUrl: 'https://test-project.supabase.co', supabasePublishableKey: 'sb_publishable_TEST_ONLY', notificationMode: 'simulation', vapidPublicKey: '', ...(options.config || {}) };
  w.eval(app);
  await settle();
  return { $, w, state, errors, async auth(event, session) { onAuth(event, session); await settle(); }, async submit(id) { $(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await settle(); }, async click(id) { $(id).click(); await settle(); } };
}

let checks = 0;
async function scenario(name, fn) { await fn(); checks += 1; }
try {
  await scenario('safe unconfigured screen', async () => {
    const p = await createPage({ config: { supabaseUrl: '', supabasePublishableKey: '' } });
    assert.equal(p.$('configurationNotice').hidden, false);
    assert.equal(p.$('internalApp').hidden, true);
    assert.equal(p.w.document.querySelectorAll('script[src*="cdn.jsdelivr"]').length, 0);
    assert.deepEqual(p.errors, []);
  });
  await scenario('secret keys rejected', async () => {
    const p = await createPage({ config: { supabasePublishableKey: 'sb_secret_TEST_ONLY' } });
    assert.equal(p.$('configurationNotice').hidden, false);
    assert.equal(p.state.queries.length, 0);
  });
  await scenario('guest login', async () => {
    const p = await createPage({ session: null });
    p.$('emailInput').value = 'test@example.invalid';
    await p.submit('loginForm');
    assert.equal(p.state.otpRequest.options.shouldCreateUser, false);
    assert.equal(p.$('internalApp').hidden, true);
    assert.match(p.$('loginStatus').textContent, /Link został wysłany/);
  });
  await scenario('employee UI and escaping', async () => {
    const p = await createPage();
    assert.equal(p.$('internalApp').hidden, false);
    assert.equal(p.$('inviteResponderForm').hidden, true);
    assert.equal(p.$('responderList').querySelector('img'), null);
    assert.match(p.$('responderList').textContent, /TEST Ratownik A <img/);
    assert.deepEqual(p.errors, []);
  });
  await scenario('blocked storage', async () => {
    const p = await createPage({ storageBlocked: true });
    assert.equal(p.$('internalApp').hidden, false);
  });
  await scenario('admin creates organization with author', async () => {
    const p = await createPage({ role: 'unit_admin' });
    assert.equal(p.$('organizationForm').hidden, false);
    p.$('organizationName').value = 'TEST Nowa';
    p.$('organizationCode').value = 'TEST-NEW';
    await p.submit('organizationForm');
    const mutation = p.state.queries.find(q => q.kind === 'insert');
    assert.equal(mutation.values.created_by, userId);
    assert.equal(mutation.values.parent_id, orgA);
    assert.match(p.$('organizationStatus').textContent, /została dodana/);
  });
  await scenario('stale response from previous organization', async () => {
    const p = await createPage();
    const late = deferred();
    p.state.deferQuery = q => q.table === 'memberships' && q.filters.some(f => f[0] === 'organization_id' && f[1] === orgA) ? late.promise : null;
    await p.click('refreshButton');
    p.$('organizationSelect').value = orgB;
    p.$('organizationSelect').dispatchEvent(new p.w.Event('change'));
    await settle();
    assert.match(p.$('responderList').textContent, /Ratownik B/);
    late.resolve({ data: [{ role: 'responder', active: true, profiles: { display_name: 'TEST STARY WYNIK A' } }], error: null });
    await settle();
    assert.doesNotMatch(p.$('responderList').textContent, /STARY WYNIK/);
    assert.match(p.$('responderList').textContent, /Ratownik B/);
  });
  await scenario('logout clears pending and visible private data', async () => {
    const p = await createPage();
    const late = deferred();
    p.state.deferQuery = q => q.table === 'memberships' ? late.promise : null;
    await p.click('refreshButton');
    await p.click('signOutButton');
    late.resolve({ data: [{ profiles: { display_name: 'TEST STARY PO WYLOGOWANIU' } }], error: null });
    await settle();
    assert.equal(p.$('internalApp').hidden, true);
    assert.equal(p.$('userEmail').textContent, '');
    assert.equal(p.$('responderList').textContent, '');
    assert.equal(p.$('alertDialog').open, false);
  });
  await scenario('late access check after logout', async () => {
    const late = deferred();
    const p = await createPage({ deferQuery: q => q.table === 'profiles' ? late.promise : null });
    await p.auth('SIGNED_OUT', null);
    late.resolve({ data: { user_id: userId, display_name: 'TEST', active: true }, error: null });
    await settle();
    assert.equal(p.$('internalApp').hidden, true);
    assert.equal(p.$('userEmail').textContent, '');
  });
  async function prepareAlert(p) {
    await p.click('openAlertButton');
    p.$('incidentType').value = 'other';
    p.$('incidentPlace').value = 'TEST peron';
    p.$('alertConfirm').checked = true;
    p.$('alertConfirm').dispatchEvent(new p.w.Event('change'));
  }
  await scenario('confirmation and duplicate click', async () => {
    const waiting = deferred();
    const p = await createPage({ invoke: () => waiting.promise });
    await p.click('openAlertButton');
    await p.submit('alertForm');
    assert.equal(p.state.functionCalls.length, 0);
    p.$('incidentType').value = 'other';
    p.$('incidentPlace').value = 'TEST';
    p.$('alertConfirm').checked = true;
    await p.submit('alertForm');
    await p.submit('alertForm');
    assert.equal(p.state.functionCalls.length, 1);
    assert.equal(p.state.functionCalls[0].body.expectedMode, 'simulation');
    waiting.resolve({ data: { status: 'simulated', mode: 'simulation', recipientCount: 1 }, error: null });
    await settle();
    assert.match(p.$('alertStatus').textContent, /Nie wysłano PUSH ani SMS/);
  });
  await scenario('retry preserves payload and idempotency', async () => {
    let attempt = 0;
    const p = await createPage({ invoke: async () => ++attempt === 1 ? { error: new Error('TEST timeout') } : { data: { status: 'simulated', mode: 'simulation', recipientCount: 1 } } });
    await prepareAlert(p);
    await p.submit('alertForm');
    await p.submit('alertForm');
    assert.equal(p.state.functionCalls.length, 2);
    assert.deepEqual(p.state.functionCalls[0].body, p.state.functionCalls[1].body);
    assert.match(p.state.functionCalls[0].body.idempotencyKey, /^[a-f0-9-]{36}$/);
  });
  for (const status of ['failed', 'partial', 'dispatching']) {
    await scenario('no false success for ' + status, async () => {
      const p = await createPage({ invoke: async () => ({ data: { status, mode: 'production', recipientCount: 1 } }) });
      await prepareAlert(p);
      await p.submit('alertForm');
      assert.match(p.$('alertStatus').className, /error/);
      assert.doesNotMatch(p.$('alertStatus').textContent, /^Alarm wysłany/);
    });
  }
  await scenario('server error message is visible', async () => {
    const p = await createPage({ invoke: async () => ({ error: { context: new Response(JSON.stringify({ message: 'Brak dostępnych ratowników TEST' })) } }) });
    await prepareAlert(p);
    await p.submit('alertForm');
    assert.match(p.$('alertStatus').textContent, /Brak dostępnych ratowników TEST/);
  });
  await scenario('offline does not dispatch', async () => {
    const p = await createPage();
    Object.defineProperty(p.w.navigator, 'onLine', { value: false, configurable: true });
    p.w.dispatchEvent(new p.w.Event('offline'));
    await p.click('openAlertButton');
    assert.equal(p.$('offlineNotice').hidden, false);
    assert.equal(p.$('alertDialog').open, false);
    assert.equal(p.state.functionCalls.length, 0);
  });
  await scenario('invitation token exchange and URL cleanup', async () => {
    const p = await createPage({ url: 'https://example.test/PLK_ratownik_v2/internal/?token_hash=TEST-ONE-TIME&type=invite' });
    assert.equal(p.state.verified.type, 'invite');
    assert.equal(p.state.verified.token_hash, 'TEST-ONE-TIME');
    assert.doesNotMatch(p.w.location.href, /token_hash|TEST-ONE-TIME/);
  });
  await scenario('responder availability', async () => {
    const p = await createPage({ role: 'responder' });
    assert.equal(p.$('availabilityButton').hidden, false);
    await p.click('availabilityButton');
    assert.equal(p.state.queries.find(q => q.table === 'responder_profiles' && q.kind === 'update').values.available, false);
  });
  console.log('Test interfejsu wewnętrznego: OK (' + checks + ' scenariuszy DOM, sesji, jednostek i alarmowania)');
} finally {
  pages.forEach(page => page.window.close());
}

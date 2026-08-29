import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners = new Map();
const stores = new Map();
const baseUrl = 'https://example.test/PLK_ratownik_v2/';

function cacheKey(request) {
  const raw = typeof request === 'string' ? request : request.url;
  const url = new URL(raw, baseUrl);
  const scope = new URL(baseUrl).pathname;
  const relative = url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : url.pathname.replace(/^\//, '');
  return './' + relative;
}

function response(body) {
  return { body, status: 200, type: 'basic', clone() { return response(body); } };
}

const caches = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async addAll(paths) { paths.forEach((path) => store.set(cacheKey(path), response(path))); },
      async put(request, value) { store.set(cacheKey(request), value); }
    };
  },
  async keys() { return [...stores.keys()]; },
  async delete(name) { return stores.delete(name); },
  async match(request) {
    const key = cacheKey(request);
    for (const store of stores.values()) if (store.has(key)) return store.get(key);
    return undefined;
  }
};

const self = {
  location: { href: baseUrl, origin: new URL(baseUrl).origin },
  clients: { async claim() {} },
  addEventListener(type, callback) { listeners.set(type, callback); },
  skipWaiting() {}
};

const context = {
  self,
  caches,
  URL,
  Set,
  Promise,
  fetch: async () => { throw new Error('offline'); }
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), context, { filename: 'sw.js' });

let installPromise;
listeners.get('install')({ waitUntil(promise) { installPromise = promise; } });
await installPromise;
assert.equal(stores.size, 1);
const appCache = [...stores.values()][0];
assert.ok(appCache.has('./index.html'));
assert.ok(appCache.has('./app.js'));
assert.ok(appCache.has('./assets/topics/sec10.jpg'));

let navigationResponse;
listeners.get('fetch')({
  request: { method: 'GET', mode: 'navigate', url: baseUrl },
  respondWith(promise) { navigationResponse = promise; }
});
assert.ok(navigationResponse);
assert.equal((await navigationResponse).body, './index.html');

let staticResponse;
listeners.get('fetch')({
  request: { method: 'GET', mode: 'same-origin', url: baseUrl + 'styles.css' },
  respondWith(promise) { staticResponse = promise; }
});
assert.ok(staticResponse);
assert.equal((await staticResponse).body, './styles.css');

let protectedResponse = null;
listeners.get('fetch')({
  request: { method: 'GET', mode: 'same-origin', url: baseUrl + 'api/private/ratownicy' },
  respondWith(promise) { protectedResponse = promise; }
});
assert.equal(protectedResponse, null, 'Service Worker nie może przejmować ani buforować przyszłych odpowiedzi chronionego API');

console.log('Test offline: OK (powłoka PWA, nawigacja bez sieci, zasoby statyczne, brak cache API)');

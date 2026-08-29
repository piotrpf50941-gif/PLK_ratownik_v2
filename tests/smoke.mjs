import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class FakeClassList {
  constructor(initial = []) { this.values = new Set(initial); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
}

class FakeElement {
  constructor(id = '', options = {}) {
    this.id = id;
    this.dataset = { ...(options.dataset || {}) };
    this.classList = new FakeClassList(options.classes || []);
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.hidden = Boolean(options.hidden);
    this.disabled = false;
    this.innerHTML = '';
    this.textContent = '';
    this.value = options.value || '';
    this.files = [];
    this.open = false;
    this.childSpan = null;
    this.parentToolCard = null;
    this.parentResourceSearch = null;
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type, target = this) {
    const event = {
      type,
      target,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };
    for (const callback of this.listeners.get(type) || []) callback(event);
    return event;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector(selector) {
    if (selector === 'span') {
      if (!this.childSpan) this.childSpan = new FakeElement(this.id + '-span');
      return this.childSpan;
    }
    return null;
  }
  closest(selector) {
    if (selector === '.tool-card') return this.parentToolCard;
    if (selector === '.resource-search') {
      if (!this.parentResourceSearch) this.parentResourceSearch = new FakeElement(this.id + '-resource-search');
      return this.parentResourceSearch;
    }
    const checks = [
      ['data-nav', 'nav'], ['data-go', 'go'], ['data-procedure', 'procedure'],
      ['data-close-dialog', 'closeDialog'], ['data-category', 'category'],
      ['data-resource', 'resource'], ['data-entity', 'entity'],
      ['data-delete-entity', 'deleteEntity'], ['data-guide-action', 'guideAction'],
      ['data-procedure-tool', 'procedureTool'], ['data-online-required', 'onlineRequired']
    ];
    for (const [attribute, key] of checks) {
      if (selector.includes('[' + attribute + ']') && this.dataset[key] !== undefined) return this;
    }
    return null;
  }
  appendChild() {}
  remove() {}
  focus() {}
  select() {}
  scrollTo() {}
  click() { this.dispatch('click'); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  reportValidity() { return true; }
}

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const homeMarkup = html.slice(html.indexOf('<section id="screen-home"'), html.indexOf('<section id="screen-procedures"'));
const toolsMarkup = html.slice(html.indexOf('<section id="screen-tools"'), html.indexOf('</main>'));
assert.match(homeMarkup, /id="metronomeButton"/);
assert.match(homeMarkup, /id="breathTimerButton"/);
assert.doesNotMatch(toolsMarkup, /id="metronomeButton"/);
assert.doesNotMatch(toolsMarkup, /id="breathTimerButton"/);
const safetyPosition = homeMarkup.indexOf('class="safety-strip"');
const sequencePosition = homeMarkup.indexOf('class="section-block sequence-section"');
const helpPosition = homeMarkup.indexOf('class="emergency-call-section"');
const emergencyToolsPosition = homeMarkup.indexOf('class="section-block emergency-tools-section"');
const quickActionsPosition = homeMarkup.indexOf('id="quickTitle"');
assert.ok(safetyPosition >= 0 && safetyPosition < sequencePosition);
assert.ok(sequencePosition < helpPosition);
assert.ok(helpPosition < emergencyToolsPosition);
assert.ok(emergencyToolsPosition < quickActionsPosition);
assert.match(homeMarkup, /rękawiczki nitrylowe/);
assert.match(homeMarkup, /okulary ochronne/);
assert.match(html, /id="offlineBanner"/);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const elements = new Map(ids.map((id) => [id, new FakeElement(id)]));
elements.get('reportCasualties').value = '1';

const screens = ['home', 'procedures', 'resources', 'tools'].map((name) => {
  const element = elements.get('screen-' + name);
  element.classList.add('screen');
  return element;
});
const dialogs = ['procedureDialog', 'emergencyDialog', 'reportDialog', 'dataDialog'].map((id) => elements.get(id));
const navigation = ['home', 'procedures', 'resources', 'tools'].map((name) => new FakeElement('', { dataset: { nav: name } }));
const resourceTabs = ['aeds', 'kits', 'rescuers'].map((name) => new FakeElement('', { dataset: { resource: name } }));
const entityTabs = ['aeds', 'kits'].map((name) => new FakeElement('', { dataset: { entity: name } }));
elements.get('metronomeButton').parentToolCard = new FakeElement('metronome-card', { classes: ['tool-card'] });
elements.get('breathTimerButton').parentToolCard = new FakeElement('breath-timer-card', { classes: ['tool-card'] });
const metaTheme = new FakeElement('meta-theme');
const documentListeners = new Map();

const fakeDocument = {
  documentElement: new FakeElement('html'),
  body: new FakeElement('body'),
  getElementById(id) { return elements.get(id) || null; },
  querySelector(selector) { return selector === 'meta[name="theme-color"]' ? metaTheme : null; },
  querySelectorAll(selector) {
    if (selector === '.screen') return screens;
    if (selector === '[data-nav]') return navigation;
    if (selector === '#resourceTabs [data-resource]') return resourceTabs;
    if (selector === '#dataTabs [data-entity]') return entityTabs;
    if (selector === 'dialog') return dialogs;
    return [];
  },
  addEventListener(type, callback) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(callback);
  },
  dispatch(type, target) {
    const event = { type, target, currentTarget: this, preventDefault() {} };
    for (const callback of documentListeners.get(type) || []) callback(event);
  },
  createElement(tag) { return new FakeElement(tag); },
  execCommand() { return true; }
};

const storage = new Map();
const windowListeners = new Map();
const scheduledIntervals = new Map();
const scheduledTimeouts = new Map();
const scheduledTones = [];
let nextTimerId = 1;

class FakeAudioContext {
  constructor() {
    this.currentTime = 100;
    this.destination = {};
    this.state = 'running';
  }
  createOscillator() {
    const tone = { frequency: null, start: null, stop: null };
    scheduledTones.push(tone);
    return {
      type: 'sine',
      frequency: { setValueAtTime(value) { tone.frequency = value; } },
      connect() {},
      start(time) { tone.start = time; },
      stop(time) { tone.stop = time; }
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}
    };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

const fakeLocation = { hash: '#home', reload() {} };
const fakeWindow = {
  document: fakeDocument,
  location: fakeLocation,
  isSecureContext: true,
  AudioContext: FakeAudioContext,
  addEventListener(type, callback) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(callback);
  },
  scrollTo() {},
  setTimeout(callback, delay) {
    const id = nextTimerId++;
    scheduledTimeouts.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) { scheduledTimeouts.delete(id); },
  setInterval(callback, delay) {
    const id = nextTimerId++;
    scheduledIntervals.set(id, { callback, delay });
    return id;
  },
  clearInterval(id) { scheduledIntervals.delete(id); },
  confirm() { return true; }
};

const context = {
  window: fakeWindow,
  document: fakeDocument,
  navigator: { onLine: true },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  history: {
    replaceState(_state, _title, hash) { fakeLocation.hash = hash; }
  },
  location: fakeLocation,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URL,
  Blob,
  FormData,
  FileReader: class {},
  structuredClone,
  encodeURIComponent,
  decodeURIComponent,
  Date,
  Math,
  JSON,
  Number,
  String,
  Array,
  Map,
  Set,
  Promise
};
fakeWindow.window = fakeWindow;
fakeWindow.navigator = context.navigator;
fakeWindow.localStorage = context.localStorage;
fakeWindow.history = context.history;

vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../data.js', import.meta.url), 'utf8'), context, { filename: 'data.js' });
assert.equal(context.window.RATOWNIK_DATA.procedures.length, 10);
assert.equal(context.window.RATOWNIK_DATA.version, '2.5.0');
assert.equal(context.window.RATOWNIK_DATA.emergencyChoiceIds.length, 7);
assert.equal(context.window.RATOWNIK_DATA.emergencyChoiceIds.includes('rko-dorosly'), false);
assert.equal(context.window.RATOWNIK_DATA.emergencyChoiceIds.includes('pozycja-boczna'), false);
assert.equal(context.window.RATOWNIK_DATA.procedures.find((item) => item.id === 'oparzenie').steps[1].tools[0].seconds, 1200);
const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.match(appSource, /const BREATH_PREP_SECONDS = 2;/);
assert.match(appSource, /const BREATH_ASSESS_SECONDS = 10;/);
assert.match(appSource, /scheduleBreathCues/);
vm.runInContext(appSource, context, { filename: 'app.js' });

assert.equal(JSON.parse(storage.get('ratownik_plk_v2_state')).schemaVersion, 2);
assert.match(elements.get('quickActions').innerHTML, /Brak oddechu \/ RKO/);
assert.equal(elements.get('breathTimerValue').textContent, '12 sekund łącznie');
assert.match(elements.get('breathTimerStatus').textContent, /10 sekund oceny/);
elements.get('breathTimerButton').dispatch('click');
assert.equal(elements.get('breathTimerValue').textContent, 'Przygotowanie: 2 s');
assert.equal(elements.get('breathTimerButton').textContent, 'Zatrzymaj i wyzeruj');
assert.equal(scheduledTones.length, 12);
assert.equal(scheduledTones[0].frequency, 920);
assert.equal(scheduledTones[0].start, 102);
assert.equal(scheduledTones.at(-1).frequency, 520);
assert.equal(scheduledTones.at(-1).start, 112);
assert.equal([...scheduledIntervals.values()].some((timer) => timer.delay === 100), true);
elements.get('breathTimerButton').dispatch('click');
assert.equal(elements.get('breathTimerValue').textContent, '12 sekund łącznie');
assert.equal(elements.get('breathTimerButton').textContent, 'Rozpocznij ocenę');
assert.equal(scheduledIntervals.size, 0);

const inlineMetronomeTarget = new FakeElement('', { dataset: { procedureTool: 'metronome' } });
fakeDocument.dispatch('click', inlineMetronomeTarget);
assert.equal(elements.get('metronomeButton').textContent, 'Zatrzymaj metronom');
assert.equal([...scheduledIntervals.values()].some((timer) => timer.delay === 25), true);
fakeDocument.dispatch('click', inlineMetronomeTarget);
assert.equal(elements.get('metronomeButton').textContent, 'Uruchom metronom');

const inlineTimerTarget = new FakeElement('', { dataset: { procedureTool: 'timer', seconds: '5', label: 'Test działania' } });
fakeDocument.dispatch('click', inlineTimerTarget);
assert.equal([...scheduledIntervals.values()].some((timer) => timer.delay === 250), true);
fakeDocument.dispatch('click', inlineTimerTarget);
assert.equal([...scheduledIntervals.values()].some((timer) => timer.delay === 250), false);

const inlineTimeMarkTarget = new FakeElement('', { dataset: { procedureTool: 'time-mark', markKey: 'test:1' } });
fakeDocument.dispatch('click', inlineTimeMarkTarget);
assert.match(elements.get('toast').textContent, /Zapisano godzinę/);
assert.equal((elements.get('procedureList').innerHTML.match(/data-procedure=/g) || []).length, 10);
assert.equal(elements.get('aedCount').textContent, 3);
assert.match(elements.get('resourceList').innerHTML, /AED — wejście główne/);
assert.match(elements.get('resourceList').innerHTML, /resource-status/);
assert.match(elements.get('resourceList').innerHTML, /NIEDOSTĘPNY/);
assert.ok(Number(elements.get('readinessAlertCount').textContent) > 0);
assert.match(elements.get('readinessAlertList').innerHTML, /AED — samochód patrolowy/);
assert.equal(elements.get('screen-home').hidden, false);
assert.equal(elements.get('screen-procedures').hidden, true);

elements.get('emergencyGuideButton').dispatch('click');
assert.equal(elements.get('emergencyDialog').open, true);
assert.equal(elements.get('guideTitle').textContent, 'Czy miejsce jest bezpieczne?');
const guideSafeTarget = new FakeElement('', { dataset: { guideAction: 'safe' } });
fakeDocument.dispatch('click', guideSafeTarget);
assert.equal(elements.get('guideTitle').textContent, 'Czy poszkodowany reaguje?');
const guideUnresponsiveTarget = new FakeElement('', { dataset: { guideAction: 'unresponsive' } });
fakeDocument.dispatch('click', guideUnresponsiveTarget);
assert.equal(elements.get('guideTitle').textContent, 'Oceń oddech');
const guideAbnormalTarget = new FakeElement('', { dataset: { guideAction: 'breathing-abnormal' } });
fakeDocument.dispatch('click', guideAbnormalTarget);
assert.equal(elements.get('guideTitle').textContent, 'Wybierz właściwe prowadzenie RKO');
const guideAdultTarget = new FakeElement('', { dataset: { guideAction: 'rko-adult' } });
fakeDocument.dispatch('click', guideAdultTarget);
assert.equal(elements.get('guideTitle').textContent, 'Wezwij 112 i rozpocznij RKO');
assert.match(elements.get('emergencyChoices').innerHTML, /data-procedure-tool="metronome"/);
const guideRkoTarget = new FakeElement('', { dataset: { procedure: 'rko-dorosly', procedureStep: '4' } });
fakeDocument.dispatch('click', guideRkoTarget);
assert.equal(elements.get('stepProgressText').textContent, 'Krok 5 z 7');

elements.get('emergencyGuideButton').dispatch('click');
fakeDocument.dispatch('click', guideSafeTarget);
fakeDocument.dispatch('click', guideUnresponsiveTarget);
fakeDocument.dispatch('click', guideAbnormalTarget);
const guideChildTarget = new FakeElement('', { dataset: { guideAction: 'rko-child' } });
fakeDocument.dispatch('click', guideChildTarget);
assert.equal(elements.get('guideTitle').textContent, 'Wezwij 112 i rozpocznij RKO dziecka');
assert.match(elements.get('emergencyChoices').innerHTML, /data-procedure="rko-dziecko"/);

elements.get('emergencyGuideButton').dispatch('click');
fakeDocument.dispatch('click', guideSafeTarget);
const guideResponsiveTarget = new FakeElement('', { dataset: { guideAction: 'responds' } });
fakeDocument.dispatch('click', guideResponsiveTarget);
assert.equal(elements.get('guideTitle').textContent, 'Co się wydarzyło?');
assert.equal((elements.get('emergencyChoices').innerHTML.match(/class="emergency-choice"/g) || []).length, 7);
assert.match(elements.get('emergencyChoices').innerHTML, /Podejrzenie udaru/);
assert.doesNotMatch(elements.get('emergencyChoices').innerHTML, /RKO dziecka/);

elements.get('procedureSearch').value = 'udar';
elements.get('procedureSearch').dispatch('input');
assert.match(elements.get('procedureList').innerHTML, /Podejrzenie udaru/);
assert.doesNotMatch(elements.get('procedureList').innerHTML, /RKO dorosłego i AED/);

const procedureTarget = new FakeElement('', { dataset: { procedure: 'rko-dorosly' } });
fakeDocument.dispatch('click', procedureTarget);
assert.equal(elements.get('procedureDialog').open, true);
assert.match(elements.get('procedureContent').innerHTML, /RKO dorosłego i AED/);
assert.equal(elements.get('stepProgressText').textContent, 'Krok 1 z 7');
assert.match(elements.get('procedureContent').innerHTML, /step-details/);
elements.get('nextStepButton').dispatch('click');
assert.equal(elements.get('stepProgressText').textContent, 'Krok 2 z 7');
elements.get('nextStepButton').dispatch('click');
assert.match(elements.get('procedureContent').innerHTML, /href="tel:112"/);
elements.get('nextStepButton').dispatch('click');
assert.match(elements.get('procedureContent').innerHTML, /data-procedure-tool="breath"/);
elements.get('nextStepButton').dispatch('click');
assert.match(elements.get('procedureContent').innerHTML, /data-procedure-tool="metronome"/);

const burnTarget = new FakeElement('', { dataset: { procedure: 'oparzenie' } });
fakeDocument.dispatch('click', burnTarget);
elements.get('nextStepButton').dispatch('click');
assert.match(elements.get('procedureContent').innerHTML, /data-seconds="1200"/);

const bleedTarget = new FakeElement('', { dataset: { procedure: 'krwotok' } });
fakeDocument.dispatch('click', bleedTarget);
elements.get('nextStepButton').dispatch('click');
elements.get('nextStepButton').dispatch('click');
elements.get('nextStepButton').dispatch('click');
assert.match(elements.get('procedureContent').innerHTML, /data-procedure-tool="time-mark"/);

const toolsTarget = new FakeElement('', { dataset: { nav: 'tools' } });
fakeDocument.dispatch('click', toolsTarget);
assert.equal(elements.get('screen-tools').hidden, false);
assert.equal(elements.get('screen-home').hidden, true);

elements.get('openReportButton').dispatch('click');
elements.get('reportType').value = 'Wypadek kolejowy';
elements.get('reportPlace').value = 'LK 003, tor 1, km 184,500';
elements.get('reportDescription').value = 'Jedna osoba poszkodowana';
const submitEvent = elements.get('reportForm').dispatch('submit');
assert.equal(submitEvent.defaultPrevented, true);
assert.equal(elements.get('reportResultBlock').hidden, false);
assert.match(elements.get('reportResult').value, /LK 003, tor 1, km 184,500/);

elements.get('darkModeToggle').dispatch('click');
assert.equal(fakeDocument.documentElement.classList.contains('dark'), true);
assert.ok(storage.has('ratownik_plk_v2_state'));

elements.get('resourceTabs').dispatch('click', resourceTabs[1]);
assert.match(elements.get('resourceList').innerHTML, /Apteczka — portiernia/);
assert.match(elements.get('resourceList').innerHTML, /Pokaż apteczkę na mapie/);

elements.get('resourceTabs').dispatch('click', resourceTabs[2]);
assert.match(elements.get('resourceList').innerHTML, /Ratownicy i alarmowanie/);
assert.match(elements.get('resourceList').innerHTML, /CHRONIONE/);
assert.match(elements.get('resourceList').innerHTML, /href="internal[/]"/);
assert.equal(elements.get('resourceSearch').parentResourceSearch.hidden, true);
assert.equal(elements.get('resourceLocationButton').hidden, true);
const invalidResource = new FakeElement('', { dataset: { resource: 'phones' } });
elements.get('resourceTabs').dispatch('click', invalidResource);
assert.match(elements.get('resourceList').innerHTML, /Ratownicy i alarmowanie/);

elements.get('dataTabs').dispatch('click', entityTabs[1]);
assert.match(elements.get('entityForm').innerHTML, /name="nextInspection"/);
assert.match(elements.get('entityForm').innerHTML, /name="items"/);
assert.match(elements.get('entityForm').innerHTML, /stan minimalny|minimum/);

context.navigator.onLine = false;
for (const callback of windowListeners.get('offline') || []) callback();
assert.equal(elements.get('offlineBanner').hidden, false);
assert.equal(elements.get('networkBadge').childSpan.textContent, 'Offline');
context.navigator.onLine = true;
for (const callback of windowListeners.get('online') || []) callback();
assert.equal(elements.get('offlineBanner').hidden, true);

console.log('Test DOM: OK (hierarchia Start, Prowadź mnie, narzędzia w procedurach, offline, timer 2+10 s, metronom, raport, motyw, zasoby)');

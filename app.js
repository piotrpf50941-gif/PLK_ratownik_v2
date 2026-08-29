(function () {
  'use strict';

  const DATA = window.RATOWNIK_DATA;
  const STORAGE_KEY = 'ratownik_plk_v2_state';
  const LAST_ONLINE_KEY = 'ratownik_plk_v2_last_online';
  const STATE_SCHEMA_VERSION = 2;
  const VALID_SCREENS = ['home', 'procedures', 'resources', 'tools'];
  const VALID_ENTITIES = ['aeds', 'kits'];
  const VALID_RESOURCES = ['aeds', 'kits', 'rescuers'];
  const BREATH_PREP_SECONDS = 2;
  const BREATH_ASSESS_SECONDS = 10;
  const BREATH_TOTAL_SECONDS = BREATH_PREP_SECONDS + BREATH_ASSESS_SECONDS;

  const $ = function (id) { return document.getElementById(id); };
  const all = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };

  let state = loadState();
  let currentScreen = 'home';
  let currentProcedure = null;
  let currentStep = 0;
  let selectedProcedureCategory = 'Wszystkie';
  let selectedResource = 'aeds';
  let selectedEntity = 'aeds';
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let breathTimer = null;
  let breathSeconds = BREATH_TOTAL_SECONDS;
  let breathPhase = 'idle';
  let breathStartedAt = 0;
  let breathAudioNodes = [];
  let audioContext = null;
  let metronomeScheduler = null;
  let nextMetronomeBeat = 0;
  let procedureTimer = null;
  let procedureTimerEndsAt = 0;
  let procedureTimerDuration = 0;
  let procedureTimerRemaining = 0;
  let procedureTimerLabel = '';
  let procedureTimerComplete = false;
  let guideStep = 'safety';
  const timeMarks = new Map();
  let serviceWorkerRegistration = null;
  let reloadingForUpdate = false;

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength || 500);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function safeNumber(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeCoordinate(value, minimum, maximum) {
    const coordinate = safeNumber(value, null);
    return coordinate !== null && coordinate >= minimum && coordinate <= maximum ? coordinate : null;
  }

  function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1 || value === 'on') return true;
    if (value === 'false' || value === '0' || value === 0 || value === '') return false;
    return Boolean(fallback);
  }

  function normalizeDate(value) {
    const date = cleanText(value, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const parsed = new Date(date + 'T00:00:00Z');
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? '' : date;
  }

  function normalizeKitItem(item, index) {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: cleanText(raw.id, 80) || 'item-' + index,
      name: cleanText(raw.name, 120) || 'Element wyposażenia',
      quantity: Math.max(0, Math.floor(safeNumber(raw.quantity, 0))),
      minimum: Math.max(0, Math.floor(safeNumber(raw.minimum, 0))),
      expiry: normalizeDate(raw.expiry)
    };
  }

  function normalizeAed(item, index) {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: cleanText(raw.id, 80) || 'aed-' + Date.now() + '-' + index,
      name: cleanText(raw.name, 120) || 'AED',
      location: cleanText(raw.location, 240),
      lat: normalizeCoordinate(raw.lat, -90, 90),
      lon: normalizeCoordinate(raw.lon, -180, 180),
      available: normalizeBoolean(raw.available, true),
      access: cleanText(raw.access, 180),
      manufacturer: cleanText(raw.manufacturer, 120),
      model: cleanText(raw.model, 120),
      serialNumber: cleanText(raw.serialNumber, 120),
      lastInspection: normalizeDate(raw.lastInspection),
      nextInspection: normalizeDate(raw.nextInspection),
      electrodesExpiry: normalizeDate(raw.electrodesExpiry),
      batteryExpiry: normalizeDate(raw.batteryExpiry),
      notes: cleanText(raw.notes, 500)
    };
  }

  function normalizeKit(item, index) {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: cleanText(raw.id, 80) || 'kit-' + Date.now() + '-' + index,
      name: cleanText(raw.name, 120) || 'Apteczka',
      location: cleanText(raw.location, 240),
      lat: normalizeCoordinate(raw.lat, -90, 90),
      lon: normalizeCoordinate(raw.lon, -180, 180),
      type: cleanText(raw.type, 80) || 'inna',
      available: normalizeBoolean(raw.available, true),
      lastInspection: normalizeDate(raw.lastInspection),
      nextInspection: normalizeDate(raw.nextInspection),
      contents: cleanText(raw.contents, 700),
      items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 200).map(normalizeKitItem)
    };
  }

  function normalizeState(value) {
    const defaults = clone(DATA.defaultState);
    const raw = value && typeof value === 'object' ? value : {};
    const storedSchemaVersion = Math.max(1, Math.floor(safeNumber(raw.schemaVersion, 1)));
    const mergeLegacyDemo = function (items, entity) {
      if (storedSchemaVersion >= STATE_SCHEMA_VERSION) return items;
      return items.map(function (item) {
        const rawItem = item && typeof item === 'object' ? item : {};
        const demo = defaults[entity].find(function (candidate) { return candidate.id === rawItem.id; });
        return demo ? Object.assign({}, clone(demo), rawItem) : rawItem;
      });
    };
    const rawAeds = Array.isArray(raw.aeds) ? raw.aeds : defaults.aeds;
    const rawKits = Array.isArray(raw.kits) ? raw.kits : defaults.kits;
    const location = raw.location && typeof raw.location === 'object' ? {
      lat: normalizeCoordinate(raw.location.lat, -90, 90),
      lon: normalizeCoordinate(raw.location.lon, -180, 180),
      accuracy: Math.max(0, safeNumber(raw.location.accuracy, 0)),
      timestamp: safeNumber(raw.location.timestamp, Date.now())
    } : null;

    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      aeds: mergeLegacyDemo(rawAeds, 'aeds').slice(0, 1000).map(normalizeAed),
      kits: mergeLegacyDemo(rawKits, 'kits').slice(0, 1000).map(normalizeKit),
      location: location && location.lat !== null && location.lon !== null ? location : null,
      preferences: {
        darkMode: Boolean(raw.preferences && raw.preferences.darkMode),
        largeText: Boolean(raw.preferences && raw.preferences.largeText)
      }
    };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return normalizeState(saved ? JSON.parse(saved) : DATA.defaultState);
    } catch (error) {
      return normalizeState(DATA.defaultState);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast('Nie udało się zapisać danych na tym urządzeniu.');
    }
  }

  function normalizeSearch(value) {
    return cleanText(value, 500).toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function formatIsoDate(value) {
    const date = normalizeDate(value);
    if (!date) return 'brak daty';
    const parts = date.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }

  function daysUntil(value) {
    const date = normalizeDate(value);
    if (!date) return null;
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.ceil((Date.parse(date + 'T00:00:00Z') - todayUtc) / 86400000);
  }

  function deadlineAlert(label, value, required) {
    const date = normalizeDate(value);
    if (!date) return required ? { level: 'warning', text: label + ': brak terminu.' } : null;
    const remaining = daysUntil(date);
    const shownDate = formatIsoDate(date);
    if (remaining < 0) return { level: 'critical', text: label + ': termin minął (' + shownDate + ').' };
    if (remaining === 0) return { level: 'warning', text: label + ': termin przypada dzisiaj.' };
    if (remaining <= 30) return { level: 'warning', text: label + ': termin do 30 dni (' + shownDate + ').' };
    if (remaining <= 60) return { level: 'warning', text: label + ': termin do 60 dni (' + shownDate + ').' };
    if (remaining <= 90) return { level: 'warning', text: label + ': termin do 90 dni (' + shownDate + ').' };
    return null;
  }

  function readinessResult(alerts, unavailable) {
    const level = alerts.some(function (alert) { return alert.level === 'critical'; }) ? 'critical' : alerts.length ? 'warning' : 'ok';
    const labels = {
      ok: 'GOTOWY',
      warning: 'SPRAWDŹ',
      critical: unavailable ? 'NIEDOSTĘPNY' : 'NIEGOTOWY'
    };
    return { level: level, label: labels[level], alerts: alerts };
  }

  function evaluateAedReadiness(item) {
    const alerts = [];
    if (!item.available) alerts.push({ level: 'critical', text: 'Urządzenie oznaczono jako niedostępne.' });
    [
      deadlineAlert('Następna kontrola', item.nextInspection, true),
      deadlineAlert('Elektrody', item.electrodesExpiry, true),
      deadlineAlert('Bateria', item.batteryExpiry, true)
    ].forEach(function (alert) { if (alert) alerts.push(alert); });
    return readinessResult(alerts, !item.available);
  }

  function evaluateKitReadiness(item) {
    const alerts = [];
    if (!item.available) alerts.push({ level: 'critical', text: 'Apteczkę oznaczono jako niedostępną.' });
    const inspectionAlert = deadlineAlert('Następna kontrola', item.nextInspection, true);
    if (inspectionAlert) alerts.push(inspectionAlert);
    if (!item.items.length) {
      alerts.push({ level: 'warning', text: 'Brak szczegółowej ewidencji wyposażenia.' });
    }
    item.items.forEach(function (inventoryItem) {
      if (inventoryItem.quantity < inventoryItem.minimum) {
        alerts.push({ level: 'critical', text: inventoryItem.name + ': stan ' + inventoryItem.quantity + ', minimum ' + inventoryItem.minimum + '.' });
      } else if (inventoryItem.quantity === inventoryItem.minimum && inventoryItem.minimum > 0) {
        alerts.push({ level: 'warning', text: inventoryItem.name + ': osiągnięto stan minimalny (' + inventoryItem.minimum + ').' });
      }
      const expiryAlert = deadlineAlert(inventoryItem.name + ' — ważność', inventoryItem.expiry, false);
      if (expiryAlert) alerts.push(expiryAlert);
    });
    return readinessResult(alerts, !item.available);
  }

  function getReadiness(entity, item) {
    return entity === 'aeds' ? evaluateAedReadiness(item) : evaluateKitReadiness(item);
  }

  function renderReadinessBadge(readiness) {
    return '<span class="resource-status ' + readiness.level + '"><i aria-hidden="true"></i>' + esc(readiness.label) + '</span>';
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 3200);
  }

  function showDialog(id) {
    const dialog = $(id);
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(id) {
    const dialog = $(id);
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function showScreen(name, updateHash) {
    const next = VALID_SCREENS.indexOf(name) >= 0 ? name : 'home';
    currentScreen = next;
    all('.screen').forEach(function (screen) {
      const active = screen.id === 'screen-' + next;
      screen.hidden = !active;
      screen.classList.toggle('active', active);
    });
    all('[data-nav]').forEach(function (button) {
      const active = button.dataset.nav === next;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (updateHash !== false) {
      const hash = next === 'home' ? '#home' : '#' + next;
      if (window.location.hash !== hash) history.replaceState(null, '', hash);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (next === 'resources') renderResources();
  }

  function routeFromHash() {
    const requested = window.location.hash.replace(/^#/, '');
    showScreen(VALID_SCREENS.indexOf(requested) >= 0 ? requested : 'home', false);
  }

  function getProcedure(id) {
    return DATA.procedures.find(function (procedure) { return procedure.id === id; }) || null;
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const minutes = Math.floor(seconds / 60);
    return String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }

  function renderStepTools(step) {
    if (!Array.isArray(step.tools) || !step.tools.length) return '';
    const markKey = currentProcedure.id + ':' + currentStep;
    return '<div class="procedure-tools" aria-label="Narzędzia dla tego kroku">' + step.tools.map(function (rawTool) {
      const tool = typeof rawTool === 'string' ? { type: rawTool } : rawTool;
      if (!tool || !tool.type) return '';
      if (tool.type === 'call') {
        return '<a class="procedure-tool-action call" href="tel:112"><span aria-hidden="true">☎</span><strong>Zadzwoń pod 112</strong></a>';
      }
      if (tool.type === 'breath') {
        return [
          '<section class="procedure-tool-panel breath" data-breath-panel>',
          '<div><span class="procedure-tool-value" data-breath-value>12 sekund łącznie</span><small data-breath-status>2 sekundy przygotowania + 10 sekund oceny.</small></div>',
          '<button class="procedure-tool-action" type="button" data-procedure-tool="breath">▶ Uruchom ocenę oddechu 2+10 s</button>',
          '</section>'
        ].join('');
      }
      if (tool.type === 'metronome') {
        return [
          '<section class="procedure-tool-panel metronome" data-metronome-panel>',
          '<div><span class="procedure-tool-value">Metronom RKO 110/min</span><small data-metronome-status>Gotowy do uruchomienia.</small></div>',
          '<button class="procedure-tool-action" type="button" data-procedure-tool="metronome">♥ Uruchom metronom RKO</button>',
          '</section>'
        ].join('');
      }
      if (tool.type === 'timer') {
        const seconds = Math.max(1, Math.min(7200, Number(tool.seconds) || 60));
        const label = cleanText(tool.label, 100) || 'Pomiar czasu';
        return [
          '<section class="procedure-tool-panel timer" data-procedure-timer-panel data-timer-seconds="', seconds, '" data-timer-label="', esc(label), '">',
          '<div><span class="procedure-tool-value" data-procedure-timer-value>', esc(label), ' · ', formatDuration(seconds), '</span><small data-procedure-timer-status>Timer jest gotowy.</small></div>',
          '<button class="procedure-tool-action" type="button" data-procedure-tool="timer" data-seconds="', seconds, '" data-label="', esc(label), '">⏱ Uruchom timer</button>',
          '</section>'
        ].join('');
      }
      if (tool.type === 'time-mark') {
        const label = cleanText(tool.label, 100) || 'Zapisz bieżącą godzinę';
        return [
          '<section class="procedure-tool-panel time-mark" data-time-mark-panel="', esc(markKey), '">',
          '<div><span class="procedure-tool-value">', esc(label), '</span><small data-time-mark-status>Godzina nie została jeszcze zapisana.</small></div>',
          '<button class="procedure-tool-action" type="button" data-procedure-tool="time-mark" data-mark-key="', esc(markKey), '">⏱ Zapisz godzinę</button>',
          '</section>'
        ].join('');
      }
      return '';
    }).join('') + '</div>';
  }

  function renderQuickActions() {
    const container = $('quickActions');
    container.innerHTML = DATA.quickProcedureIds.map(function (id) {
      const procedure = getProcedure(id);
      if (!procedure) return '';
      return [
        '<button class="quick-action ', esc(procedure.tone), '" type="button" data-procedure="', esc(procedure.id), '">',
        '<span class="quick-icon" aria-hidden="true">', esc(procedure.icon), '</span>',
        '<strong>', esc(procedure.shortTitle), '</strong>',
        '</button>'
      ].join('');
    }).join('');
  }

  function renderProcedureFilters() {
    const categories = ['Wszystkie'].concat(Array.from(new Set(DATA.procedures.map(function (item) { return item.category; }))));
    $('procedureFilters').innerHTML = categories.map(function (category) {
      const active = category === selectedProcedureCategory;
      return '<button class="chip' + (active ? ' active' : '') + '" type="button" data-category="' + esc(category) + '" aria-pressed="' + active + '">' + esc(category) + '</button>';
    }).join('');
  }

  function renderProcedures() {
    const query = normalizeSearch($('procedureSearch').value);
    $('clearProcedureSearch').hidden = !query;
    const filtered = DATA.procedures.filter(function (procedure) {
      const matchesCategory = selectedProcedureCategory === 'Wszystkie' || procedure.category === selectedProcedureCategory;
      const haystack = normalizeSearch([procedure.title, procedure.shortTitle, procedure.category, procedure.summary].join(' '));
      return matchesCategory && (!query || haystack.indexOf(query) >= 0);
    });

    if (!filtered.length) {
      $('procedureList').innerHTML = '<div class="empty-state">Nie znaleziono procedury. Zmień kategorię lub wpisz inne hasło.</div>';
      return;
    }

    $('procedureList').innerHTML = filtered.map(function (procedure) {
      return [
        '<button class="procedure-card" type="button" data-procedure="', esc(procedure.id), '">',
        '<span class="procedure-card-image"><img src="', esc(procedure.image), '" alt="" loading="lazy"><span aria-hidden="true">', esc(procedure.icon), '</span></span>',
        '<span class="procedure-card-copy">',
        '<small>', esc(procedure.category), '</small>',
        '<strong>', esc(procedure.title), '</strong>',
        '<p>', esc(procedure.summary), '</p>',
        '<em>', procedure.steps.length, ' kroków · tryb krokowy</em>',
        '</span></button>'
      ].join('');
    }).join('');
  }

  function openProcedure(id, startStep) {
    const procedure = getProcedure(id);
    if (!procedure) return;
    currentProcedure = procedure;
    const requestedStep = Number.parseInt(startStep, 10);
    currentStep = Number.isInteger(requestedStep) ? Math.max(0, Math.min(procedure.steps.length - 1, requestedStep)) : 0;
    $('procedureCategory').textContent = procedure.category;
    renderProcedureStep();
    closeDialog('emergencyDialog');
    showDialog('procedureDialog');
  }

  function renderProcedureStep() {
    if (!currentProcedure) return;
    const step = currentProcedure.steps[currentStep];
    const progress = Math.round(((currentStep + 1) / currentProcedure.steps.length) * 100);
    const source = currentStep === currentProcedure.steps.length - 1 ? [
      '<p class="procedure-summary">Źródło odniesienia: <a href="', esc(currentProcedure.sourceUrl), '" target="_blank" rel="noopener noreferrer" data-online-required>', esc(currentProcedure.sourceLabel), '</a>. Procedurę kolejową należy uzgodnić z obowiązującymi instrukcjami zakładowymi.</p>'
    ].join('') : '';

    $('procedureContent').innerHTML = [
      '<article class="procedure-cover">',
      '<img src="', esc(currentProcedure.image), '" alt="" loading="eager">',
      '<div class="procedure-cover-copy"><span>', esc(currentProcedure.category), '</span><h2>', esc(currentProcedure.title), '</h2></div>',
      '</article>',
      currentStep === 0 ? '<p class="procedure-summary">' + esc(currentProcedure.summary) + '</p>' : '',
      '<article class="step-card">',
      '<span class="step-number"><i>', currentStep + 1, '</i> Krok ', currentStep + 1, ' z ', currentProcedure.steps.length, '</span>',
      '<h3>', esc(step.title), '</h3>',
      renderStepTools(step),
      '<details class="step-details"><summary>Więcej informacji</summary><p>', esc(step.text), '</p></details>',
      step.warning ? '<div class="step-warning"><strong>!</strong><span>' + esc(step.warning) + '</span></div>' : '',
      '</article>',
      source
    ].join('');

    $('stepProgressText').textContent = 'Krok ' + (currentStep + 1) + ' z ' + currentProcedure.steps.length;
    $('stepProgressBar').style.width = progress + '%';
    $('previousStepButton').disabled = currentStep === 0;
    $('nextStepButton').textContent = currentStep === currentProcedure.steps.length - 1 ? 'Zakończ procedurę' : 'Następny krok';
    syncToolDisplays();
    $('procedureContent').scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderGuideRkoContent(procedureId, stepIndex, buttonLabel) {
    return [
      '<a class="procedure-tool-action call" href="tel:112"><span aria-hidden="true">☎</span><strong>Zadzwoń pod 112</strong></a>',
      '<section class="procedure-tool-panel metronome" data-metronome-panel>',
      '<div><span class="procedure-tool-value">Metronom RKO 110/min</span><small data-metronome-status>Gotowy do uruchomienia.</small></div>',
      '<button class="procedure-tool-action" type="button" data-procedure-tool="metronome">♥ Uruchom metronom RKO</button>',
      '</section>',
      '<button class="guide-answer danger" type="button" data-procedure="', esc(procedureId), '" data-procedure-step="', stepIndex, '">', esc(buttonLabel), '</button>'
    ].join('');
  }

  function renderGuide(stepName) {
    guideStep = stepName || 'safety';
    let title = 'Co mam teraz zrobić?';
    let prompt = 'Odpowiedz jednym dotknięciem. Aplikacja pokaże kolejną czynność.';
    let content = '';

    if (guideStep === 'safety') {
      title = 'Czy miejsce jest bezpieczne?';
      prompt = 'Najpierw oceń zagrożenia dla siebie i innych. Nie podchodź, jeśli nie jest bezpiecznie.';
      content = [
        '<div class="guide-alert"><strong>Sprawdź:</strong><span>ruch kolejowy i pojazdy, sieć trakcyjną i urządzenia elektryczne, pożar, substancje niebezpieczne oraz inne zagrożenia.</span></div>',
        '<div class="guide-actions">',
        '<button class="guide-answer safe" type="button" data-guide-action="safe">Tak — jest bezpiecznie</button>',
        '<button class="guide-answer danger" type="button" data-guide-action="unsafe">Nie / nie mam pewności</button>',
        '</div>'
      ].join('');
    } else if (guideStep === 'unsafe') {
      title = 'Nie podchodź';
      prompt = 'Oddal się od zagrożenia, ostrzeż innych i wezwij właściwe służby. Nie ryzykuj własnego życia.';
      content = [
        '<div class="guide-alert danger"><strong>Zatrzymaj się</strong><span>Pomagaj dopiero po potwierdzeniu, że podejście jest bezpieczne.</span></div>',
        '<button class="guide-answer" type="button" data-guide-action="restart">Sprawdź bezpieczeństwo ponownie</button>'
      ].join('');
    } else if (guideStep === 'response') {
      title = 'Czy poszkodowany reaguje?';
      prompt = 'Zwróć się głośno do poszkodowanego. Jeżeli możesz bezpiecznie podejść, sprawdź reakcję.';
      content = [
        '<div class="guide-actions">',
        '<button class="guide-answer safe" type="button" data-guide-action="responds">Tak — reaguje</button>',
        '<button class="guide-answer danger" type="button" data-guide-action="unresponsive">Nie reaguje</button>',
        '</div>'
      ].join('');
    } else if (guideStep === 'breathing') {
      title = 'Oceń oddech';
      prompt = 'Udrożnij drogi oddechowe i sprawdzaj oddech nie dłużej niż 10 sekund. Uruchom sygnały bez zamykania tego ekranu.';
      content = [
        '<section class="procedure-tool-panel breath" data-breath-panel>',
        '<div><span class="procedure-tool-value" data-breath-value>12 sekund łącznie</span><small data-breath-status>2 sekundy przygotowania + 10 sekund oceny.</small></div>',
        '<button class="procedure-tool-action" type="button" data-procedure-tool="breath">▶ Uruchom ocenę oddechu 2+10 s</button>',
        '</section>',
        '<div class="guide-actions">',
        '<button class="guide-answer safe" type="button" data-guide-action="breathing-normal">Oddycha prawidłowo</button>',
        '<button class="guide-answer danger" type="button" data-guide-action="breathing-abnormal">Nie oddycha prawidłowo / mam wątpliwość</button>',
        '</div>'
      ].join('');
    } else if (guideStep === 'recovery') {
      title = 'Wezwij 112 i monitoruj oddech';
      prompt = 'Osoba nieprzytomna, która oddycha prawidłowo, wymaga pilnej pomocy i stałej kontroli oddechu.';
      content = [
        '<a class="procedure-tool-action call" href="tel:112"><span aria-hidden="true">☎</span><strong>Zadzwoń pod 112</strong></a>',
        '<button class="guide-answer safe" type="button" data-procedure="pozycja-boczna" data-procedure-step="2">Przejdź do ułożenia i monitorowania</button>'
      ].join('');
    } else if (guideStep === 'rko-age') {
      title = 'Wybierz właściwe prowadzenie RKO';
      prompt = 'Instrukcje różnią się zależnie od wieku poszkodowanego. Wybierz jedną odpowiedź.';
      content = [
        '<div class="guide-actions">',
        '<button class="guide-answer danger" type="button" data-guide-action="rko-adult">Dorosły</button>',
        '<button class="guide-answer danger" type="button" data-guide-action="rko-child">Dziecko</button>',
        '</div>'
      ].join('');
    } else if (guideStep === 'rko') {
      title = 'Wezwij 112 i rozpocznij RKO';
      prompt = 'Włącz głośnik, poproś o AED i rozpocznij uciśnięcia. Metronom możesz uruchomić tutaj.';
      content = renderGuideRkoContent('rko-dorosly', 4, 'Otwórz prowadzenie RKO dorosłego i AED');
    } else if (guideStep === 'rko-child') {
      title = 'Wezwij 112 i rozpocznij RKO dziecka';
      prompt = 'Włącz głośnik i postępuj według instrukcji dla dziecka. Metronom możesz uruchomić tutaj.';
      content = renderGuideRkoContent('rko-dziecko', 3, 'Otwórz prowadzenie RKO dziecka');
    } else {
      title = 'Co się wydarzyło?';
      prompt = 'Wybierz najlepiej pasującą sytuację. Każda procedura poprowadzi Cię krok po kroku.';
      content = '<div class="emergency-choice-list">' + DATA.emergencyChoiceIds.map(function (id) {
        const procedure = getProcedure(id);
        if (!procedure) return '';
        return [
          '<button class="emergency-choice" type="button" data-procedure="', esc(procedure.id), '">',
          '<span aria-hidden="true">', esc(procedure.icon), '</span>',
          '<span><strong>', esc(procedure.shortTitle), '</strong><small>', esc(procedure.summary), '</small></span>',
          '<span aria-hidden="true">›</span>',
          '</button>'
        ].join('');
      }).join('') + '</div>';
    }

    $('guideTitle').textContent = title;
    $('guidePrompt').textContent = prompt;
    $('emergencyChoices').innerHTML = content;
    syncToolDisplays();
  }

  function handleGuideAction(action) {
    if (action === 'safe') renderGuide('response');
    else if (action === 'unsafe') renderGuide('unsafe');
    else if (action === 'restart') renderGuide('safety');
    else if (action === 'responds') renderGuide('incident');
    else if (action === 'unresponsive') renderGuide('breathing');
    else if (action === 'breathing-normal') renderGuide('recovery');
    else if (action === 'breathing-abnormal') renderGuide('rko-age');
    else if (action === 'rko-adult') renderGuide('rko');
    else if (action === 'rko-child') renderGuide('rko-child');
  }

  function updateLocationSummary() {
    if (!state.location) {
      $('locationSummary').textContent = 'Nie pobrano jeszcze pozycji GPS.';
      return;
    }
    $('locationSummary').textContent = state.location.lat.toFixed(5) + ', ' + state.location.lon.toFixed(5) + ' · dokładność około ±' + Math.round(state.location.accuracy) + ' m';
  }

  function getLocation() {
    if (!navigator.geolocation) {
      showToast('To urządzenie nie udostępnia lokalizacji GPS.');
      return;
    }
    $('getLocationButton').disabled = true;
    $('resourceLocationButton').disabled = true;
    showToast('Pobieram lokalizację GPS…');
    navigator.geolocation.getCurrentPosition(function (position) {
      state.location = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy || 0,
        timestamp: Date.now()
      };
      saveState();
      updateLocationSummary();
      renderResources();
      $('getLocationButton').disabled = false;
      $('resourceLocationButton').disabled = false;
      showToast('Lokalizacja została zapisana.');
    }, function (error) {
      $('getLocationButton').disabled = false;
      $('resourceLocationButton').disabled = false;
      const denied = error && error.code === 1;
      showToast(denied ? 'Dostęp do lokalizacji jest zablokowany w ustawieniach telefonu.' : 'Nie udało się ustalić lokalizacji. Spróbuj ponownie na otwartej przestrzeni.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const radius = 6371;
    const toRadians = function (degrees) { return degrees * Math.PI / 180; };
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLon = toRadians(lon2 - lon1);
    const part = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    return radius * 2 * Math.atan2(Math.sqrt(part), Math.sqrt(1 - part));
  }

  function formatDistance(kilometres) {
    if (!Number.isFinite(kilometres)) return '';
    if (kilometres < 1) return Math.round(kilometres * 1000) + ' m';
    return kilometres.toFixed(kilometres < 10 ? 1 : 0) + ' km';
  }

  function renderResourceCounts() {
    $('aedCount').textContent = state.aeds.length;
    $('kitCount').textContent = state.kits.length;
    $('dataAedCount').textContent = state.aeds.length;
    $('dataKitCount').textContent = state.kits.length;
    renderReadinessDashboard();
  }

  function renderReadinessDashboard() {
    if (!$('readinessAlertList')) return;
    const aedResults = state.aeds.map(function (item) { return { item: item, readiness: evaluateAedReadiness(item), entity: 'AED' }; });
    const kitResults = state.kits.map(function (item) { return { item: item, readiness: evaluateKitReadiness(item), entity: 'Apteczka' }; });
    const allResults = aedResults.concat(kitResults);
    const needsAttention = allResults.filter(function (entry) { return entry.readiness.level !== 'ok'; }).sort(function (a, b) {
      const priority = { critical: 0, warning: 1, ok: 2 };
      return priority[a.readiness.level] - priority[b.readiness.level];
    });

    $('readinessAedOk').textContent = aedResults.filter(function (entry) { return entry.readiness.level === 'ok'; }).length;
    $('readinessAedAttention').textContent = aedResults.filter(function (entry) { return entry.readiness.level !== 'ok'; }).length;
    $('readinessKitOk').textContent = kitResults.filter(function (entry) { return entry.readiness.level === 'ok'; }).length;
    $('readinessKitAttention').textContent = kitResults.filter(function (entry) { return entry.readiness.level !== 'ok'; }).length;
    $('readinessAlertCount').textContent = needsAttention.length;

    $('readinessAlertList').innerHTML = needsAttention.length ? needsAttention.map(function (entry) {
      return [
        '<article class="readiness-alert ', entry.readiness.level, '">',
        '<div><span>', esc(entry.entity), '</span><strong>', esc(entry.item.name), '</strong></div>',
        '<ul>', entry.readiness.alerts.slice(0, 3).map(function (alert) { return '<li>' + esc(alert.text) + '</li>'; }).join(''), '</ul>',
        '</article>'
      ].join('');
    }).join('') : '<p class="empty-state compact">Brak alertów w danych demonstracyjnych.</p>';
  }

  function renderResources() {
    renderResourceCounts();
    const isResponderAccess = selectedResource === 'rescuers';
    const searchBox = $('resourceSearch').closest('.resource-search');
    searchBox.hidden = isResponderAccess;
    $('resourceLocationButton').hidden = isResponderAccess;

    if (isResponderAccess) {
      $('resourceHint').textContent = 'Dane ratowników są dostępne wyłącznie po bezpiecznym logowaniu i sprawdzeniu jednostki oraz roli.';
      $('resourceList').innerHTML = renderResponderAccessCard();
      return;
    }

    const query = normalizeSearch($('resourceSearch').value);
    let items = state[selectedResource].slice();

    if (state.location) {
      items = items.map(function (item) {
        const distance = item.lat !== null && item.lon !== null ? haversineDistance(state.location.lat, state.location.lon, item.lat, item.lon) : null;
        return Object.assign({}, item, { distance: distance });
      }).sort(function (a, b) {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    }

    items = items.filter(function (item) {
      const inventory = Array.isArray(item.items) ? item.items.map(function (inventoryItem) { return inventoryItem.name; }).join(' ') : '';
      const haystack = normalizeSearch(Object.keys(item).map(function (key) { return typeof item[key] === 'object' ? '' : item[key]; }).join(' ') + ' ' + inventory);
      return !query || haystack.indexOf(query) >= 0;
    });

    if (selectedResource === 'aeds') {
      $('resourceHint').textContent = state.location ? 'AED są posortowane według przybliżonej odległości w linii prostej.' : 'Włącz GPS, aby posortować AED według odległości.';
    } else if (selectedResource === 'kits') {
      $('resourceHint').textContent = state.location ? 'Apteczki są posortowane według przybliżonej odległości w linii prostej.' : 'Włącz GPS, aby posortować apteczki według odległości.';
    }

    if (!items.length) {
      $('resourceList').innerHTML = '<div class="empty-state">Brak pasujących pozycji.</div>';
      return;
    }

    $('resourceList').innerHTML = items.map(function (item) {
      if (selectedResource === 'aeds') return renderAedCard(item);
      return renderKitCard(item);
    }).join('');
  }

  function renderResponderAccessCard() {
    return [
      '<article class="resource-card internal-access">',
      '<span class="resource-icon rescuer" aria-hidden="true">♟</span>',
      '<div class="resource-copy"><div class="resource-title-line"><strong>Ratownicy i alarmowanie</strong><span class="readiness-badge warning">CHRONIONE</span></div>',
      '<span>Lista ratowników, numery telefonów, jednostki i historia alarmów nie są zapisane w publicznej aplikacji.</span>',
      '<small>Zaloguj się kontem wcześniej zatwierdzonym przez administratora.</small>',
      '<a class="button primary resource-login-button" href="internal/">OTWÓRZ LOGOWANIE</a>',
      '</div></article>'
    ].join('');
  }

  function renderAedCard(item) {
    const readiness = evaluateAedReadiness(item);
    const hasCoordinates = item.lat !== null && item.lon !== null;
    const mapUrl = hasCoordinates ? 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(item.lat) + '&mlon=' + encodeURIComponent(item.lon) + '#map=18/' + encodeURIComponent(item.lat) + '/' + encodeURIComponent(item.lon) : '';
    return [
      '<article class="resource-card ', readiness.level, '">',
      '<span class="resource-icon aed" aria-hidden="true">⚡</span>',
      '<div class="resource-copy"><div class="resource-title-line"><strong>', esc(item.name), '</strong>', renderReadinessBadge(readiness), '</div><span>', esc(item.location || 'Brak opisu lokalizacji'), '</span>',
      item.access ? '<small class="resource-access">' + esc(item.access) + '</small>' : '',
      item.distance !== null && item.distance !== undefined ? '<small>Około ' + esc(formatDistance(item.distance)) + ' w linii prostej</small>' : '',
      '</div>',
      '<div class="resource-actions">',
      hasCoordinates ? '<a class="resource-action" href="' + esc(mapUrl) + '" target="_blank" rel="noopener noreferrer" data-online-required aria-label="Pokaż AED na mapie">⌖</a>' : '',
      '</div></article>'
    ].join('');
  }

  function renderKitCard(item) {
    const readiness = evaluateKitReadiness(item);
    const hasCoordinates = item.lat !== null && item.lon !== null;
    const mapUrl = hasCoordinates ? 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(item.lat) + '&mlon=' + encodeURIComponent(item.lon) + '#map=18/' + encodeURIComponent(item.lat) + '/' + encodeURIComponent(item.lon) : '';
    return [
      '<article class="resource-card ', readiness.level, '">',
      '<span class="resource-icon kit" aria-hidden="true">✚</span>',
      '<div class="resource-copy"><div class="resource-title-line"><strong>', esc(item.name), '</strong>', renderReadinessBadge(readiness), '</div><span>', esc(item.location || 'Brak opisu lokalizacji'), '</span><small>', esc(item.type), item.distance !== null && item.distance !== undefined ? ' · około ' + esc(formatDistance(item.distance)) : '', '</small></div>',
      '<div class="resource-actions">',
      hasCoordinates ? '<a class="resource-action" href="' + esc(mapUrl) + '" target="_blank" rel="noopener noreferrer" data-online-required aria-label="Pokaż apteczkę na mapie">⌖</a>' : '',
      '</div>',
      '</article>'
    ].join('');
  }

  function renderReportTypes() {
    $('reportType').innerHTML = DATA.eventTypes.map(function (type) { return '<option>' + esc(type) + '</option>'; }).join('');
  }

  function openReport() {
    if (state.location && !$('reportPlace').value) {
      $('reportPlace').value = 'GPS: ' + state.location.lat.toFixed(5) + ', ' + state.location.lon.toFixed(5);
    }
    $('reportResultBlock').hidden = true;
    showDialog('reportDialog');
  }

  function generateReport() {
    const casualties = Math.max(1, Number.parseInt($('reportCasualties').value, 10) || 1);
    const gps = state.location ? state.location.lat.toFixed(5) + ', ' + state.location.lon.toFixed(5) + ' (dokładność około ±' + Math.round(state.location.accuracy) + ' m)' : 'nie pobrano';
    const report = [
      'ZGŁOSZENIE ZDARZENIA',
      'Rodzaj: ' + cleanText($('reportType').value, 120),
      'Liczba poszkodowanych: ' + casualties,
      'Miejsce: ' + (cleanText($('reportPlace').value, 260) || 'do uzupełnienia'),
      'GPS: ' + gps,
      'Dojazd / punkt orientacyjny: ' + (cleanText($('reportAccess').value, 260) || 'do uzupełnienia'),
      'Stan i opis: ' + (cleanText($('reportDescription').value, 600) || 'do uzupełnienia'),
      'Zagrożenia: sprawdzić ruch kolejowy, napięcie, ogień i ruch pojazdów.',
      'Pozostaję na linii i wykonuję polecenia dyspozytora.'
    ].join('\n');
    $('reportResult').value = report;
    $('reportResultBlock').hidden = false;
    $('reportResult').focus();
  }

  async function copyText(value, successMessage) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const temporary = document.createElement('textarea');
        temporary.value = value;
        temporary.setAttribute('readonly', '');
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.appendChild(temporary);
        temporary.select();
        document.execCommand('copy');
        temporary.remove();
      }
      showToast(successMessage || 'Skopiowano.');
    } catch (error) {
      showToast('Nie udało się skopiować. Zaznacz tekst ręcznie.');
    }
  }

  function applyPreferences() {
    document.documentElement.classList.toggle('dark', state.preferences.darkMode);
    document.documentElement.classList.toggle('large-text', state.preferences.largeText);
    $('darkModeToggle').setAttribute('aria-checked', String(state.preferences.darkMode));
    $('largeTextToggle').setAttribute('aria-checked', String(state.preferences.largeText));
    $('themeButton').textContent = state.preferences.darkMode ? '☀' : '☾';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', state.preferences.darkMode ? '#0b1e2d' : '#123b66');
  }

  function togglePreference(name) {
    state.preferences[name] = !state.preferences[name];
    applyPreferences();
    saveState();
  }

  function ensureAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = audioContext || new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function scheduleTone(time, frequency, duration, volume) {
    if (!audioContext) return null;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    return oscillator;
  }

  function scheduleBeat(time) {
    scheduleTone(time, 720, 0.065, 0.18);
  }

  function syncMetronomeDisplay() {
    const running = Boolean(metronomeScheduler);
    const homeButton = $('metronomeButton');
    if (homeButton) {
      homeButton.textContent = running ? 'Zatrzymaj metronom' : 'Uruchom metronom';
      const homeCard = homeButton.closest('.tool-card');
      if (homeCard) homeCard.classList.toggle('running', running);
    }
    all('[data-metronome-panel]').forEach(function (panel) { panel.classList.toggle('running', running); });
    all('[data-procedure-tool="metronome"]').forEach(function (button) {
      button.textContent = running ? '■ Zatrzymaj metronom RKO' : '♥ Uruchom metronom RKO';
    });
    all('[data-metronome-status]').forEach(function (status) {
      status.textContent = running ? 'Metronom działa — rytm 110 uciśnięć/min.' : 'Gotowy do uruchomienia.';
    });
  }

  function metronomeLoop() {
    while (audioContext && nextMetronomeBeat < audioContext.currentTime + 0.12) {
      scheduleBeat(nextMetronomeBeat);
      nextMetronomeBeat += 60 / 110;
    }
  }

  function startMetronome() {
    if (breathTimer || breathPhase === 'complete') stopBreathTimer(true);
    const context = ensureAudioContext();
    if (!context) {
      showToast('Przeglądarka nie obsługuje metronomu audio.');
      return;
    }
    nextMetronomeBeat = context.currentTime + 0.05;
    metronomeLoop();
    metronomeScheduler = window.setInterval(metronomeLoop, 25);
    syncMetronomeDisplay();
    showToast('Metronom: 110 uciśnięć na minutę.');
  }

  function stopMetronome() {
    window.clearInterval(metronomeScheduler);
    metronomeScheduler = null;
    if (audioContext && audioContext.state !== 'closed') audioContext.suspend();
    syncMetronomeDisplay();
  }

  function toggleMetronome() {
    if (metronomeScheduler) stopMetronome();
    else startMetronome();
  }

  function cancelBreathAudio() {
    breathAudioNodes.forEach(function (node) {
      try { node.stop(); } catch (error) { /* Sygnał mógł już wybrzmieć. */ }
    });
    breathAudioNodes = [];
  }

  function addBreathTone(time, frequency, duration, volume) {
    const node = scheduleTone(time, frequency, duration, volume);
    if (node) breathAudioNodes.push(node);
  }

  function scheduleBreathCues(startTime) {
    const assessmentStart = startTime + BREATH_PREP_SECONDS;
    addBreathTone(assessmentStart, 920, 0.14, 0.38);
    addBreathTone(assessmentStart + 0.22, 1200, 0.18, 0.42);
    for (let second = 1; second < BREATH_ASSESS_SECONDS; second += 1) {
      addBreathTone(assessmentStart + second, 700, 0.07, 0.22);
    }
    addBreathTone(assessmentStart + BREATH_ASSESS_SECONDS, 520, 0.55, 0.48);
  }

  function updateBreathTimerDisplay() {
    let value = '12 sekund łącznie';
    let status = '2 sekundy na przygotowanie, potem 10 sekund oceny z sygnałem startu, każdej sekundy i końca.';
    if (breathPhase === 'prepare') {
      value = 'Przygotowanie: ' + breathSeconds + ' s';
      status = 'Udrożnij drogi oddechowe. Po podwójnym sygnale rozpocznij obserwację.';
    } else if (breathPhase === 'assess') {
      value = 'Ocena: ' + breathSeconds + ' s';
      status = 'START — obserwuj ruch klatki piersiowej, słuchaj i wyczuwaj oddech.';
    } else if (breathPhase === 'complete') {
      value = 'Koniec oceny';
      status = '10 sekund minęło — oceń, czy oddech jest prawidłowy.';
    }
    const homeValue = $('breathTimerValue');
    const homeStatus = $('breathTimerStatus');
    const homeButton = $('breathTimerButton');
    if (homeValue) homeValue.textContent = value;
    if (homeStatus) homeStatus.textContent = status;
    if (homeButton) {
      homeButton.textContent = breathTimer ? 'Zatrzymaj i wyzeruj' : (breathPhase === 'complete' ? 'Uruchom ponownie' : 'Rozpocznij ocenę');
      const homeCard = homeButton.closest('.tool-card');
      if (homeCard) homeCard.classList.toggle('running', Boolean(breathTimer));
    }
    all('[data-breath-value]').forEach(function (element) { element.textContent = value; });
    all('[data-breath-status]').forEach(function (element) { element.textContent = status; });
    all('[data-breath-panel]').forEach(function (panel) { panel.classList.toggle('running', Boolean(breathTimer)); });
    all('[data-procedure-tool="breath"]').forEach(function (button) {
      button.textContent = breathTimer ? '■ Zatrzymaj i wyzeruj' : (breathPhase === 'complete' ? '▶ Uruchom ponownie 2+10 s' : '▶ Uruchom ocenę oddechu 2+10 s');
    });
  }

  function stopBreathTimer(reset) {
    window.clearInterval(breathTimer);
    breathTimer = null;
    cancelBreathAudio();
    breathStartedAt = 0;
    if (reset) {
      breathSeconds = BREATH_TOTAL_SECONDS;
      breathPhase = 'idle';
    }
    updateBreathTimerDisplay();
  }

  function completeBreathTimer() {
    window.clearInterval(breathTimer);
    breathTimer = null;
    breathStartedAt = 0;
    breathSeconds = 0;
    breathPhase = 'complete';
    updateBreathTimerDisplay();
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
    showToast('10 sekund oceny minęło — podejmij decyzję o oddechu.');
  }

  function updateBreathTimer() {
    const elapsedSeconds = (Date.now() - breathStartedAt) / 1000;
    if (elapsedSeconds >= BREATH_TOTAL_SECONDS) {
      completeBreathTimer();
      return;
    }
    if (elapsedSeconds >= BREATH_PREP_SECONDS) {
      if (breathPhase !== 'assess') {
        breathPhase = 'assess';
        if (navigator.vibrate) navigator.vibrate(140);
      }
      breathSeconds = Math.ceil(BREATH_TOTAL_SECONDS - elapsedSeconds);
    } else {
      breathPhase = 'prepare';
      breathSeconds = Math.ceil(BREATH_PREP_SECONDS - elapsedSeconds);
    }
    updateBreathTimerDisplay();
  }

  function startBreathTimer() {
    if (metronomeScheduler) stopMetronome();
    cancelBreathAudio();
    const context = ensureAudioContext();
    breathPhase = 'prepare';
    breathSeconds = BREATH_PREP_SECONDS;
    breathStartedAt = Date.now();
    updateBreathTimerDisplay();
    if (context) scheduleBreathCues(context.currentTime);
    else showToast('Brak dźwięku w tej przeglądarce — obserwuj odliczanie i wibracje.');
    breathTimer = window.setInterval(updateBreathTimer, 100);
    updateBreathTimerDisplay();
    showToast('Masz 2 sekundy na przygotowanie. Podwójny sygnał oznacza START.');
  }

  function toggleBreathTimer() {
    if (breathTimer) {
      stopBreathTimer(true);
      showToast('Ocena oddechu została przerwana.');
      return;
    }
    startBreathTimer();
  }

  function syncProcedureTimerDisplay() {
    all('[data-procedure-timer-panel]').forEach(function (panel) {
      const seconds = Math.max(1, Number(panel.dataset.timerSeconds) || 60);
      const label = panel.dataset.timerLabel || 'Pomiar czasu';
      const matches = procedureTimerDuration === seconds && procedureTimerLabel === label;
      const active = Boolean(procedureTimer) && matches;
      const complete = procedureTimerComplete && matches;
      const remaining = matches ? procedureTimerRemaining : seconds;
      const value = panel.querySelector('[data-procedure-timer-value]');
      const status = panel.querySelector('[data-procedure-timer-status]');
      const button = panel.querySelector('[data-procedure-tool="timer"]');
      if (value) value.textContent = label + ' · ' + formatDuration(remaining);
      if (status) status.textContent = active ? 'Timer działa.' : (complete ? 'Czas minął — wykonaj kolejny krok.' : 'Timer jest gotowy.');
      if (button) button.textContent = active ? '■ Zatrzymaj i wyzeruj' : (complete ? '⏱ Uruchom ponownie' : '⏱ Uruchom timer');
      panel.classList.toggle('running', active);
      panel.classList.toggle('complete', complete);
    });
  }

  function stopProcedureTimer(reset) {
    window.clearInterval(procedureTimer);
    procedureTimer = null;
    if (reset) {
      procedureTimerRemaining = procedureTimerDuration;
      procedureTimerComplete = false;
    }
    syncProcedureTimerDisplay();
  }

  function completeProcedureTimer() {
    window.clearInterval(procedureTimer);
    procedureTimer = null;
    procedureTimerRemaining = 0;
    procedureTimerComplete = true;
    const context = ensureAudioContext();
    if (context) {
      scheduleTone(context.currentTime, 760, 0.18, 0.38);
      scheduleTone(context.currentTime + 0.28, 520, 0.48, 0.46);
    }
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
    syncProcedureTimerDisplay();
    showToast('Timer „' + procedureTimerLabel + '” zakończony.');
  }

  function updateProcedureTimer() {
    procedureTimerRemaining = Math.max(0, Math.ceil((procedureTimerEndsAt - Date.now()) / 1000));
    if (procedureTimerRemaining <= 0) {
      completeProcedureTimer();
      return;
    }
    syncProcedureTimerDisplay();
  }

  function toggleProcedureTimer(seconds, label) {
    const duration = Math.max(1, Math.min(7200, Number(seconds) || 60));
    const cleanLabel = cleanText(label, 100) || 'Pomiar czasu';
    if (procedureTimer) {
      stopProcedureTimer(true);
      showToast('Timer został zatrzymany i wyzerowany.');
      return;
    }
    procedureTimerDuration = duration;
    procedureTimerRemaining = duration;
    procedureTimerLabel = cleanLabel;
    procedureTimerComplete = false;
    procedureTimerEndsAt = Date.now() + duration * 1000;
    procedureTimer = window.setInterval(updateProcedureTimer, 250);
    syncProcedureTimerDisplay();
    showToast('Uruchomiono timer: ' + cleanLabel + '.');
  }

  function saveTimeMark(key) {
    if (!key) return;
    const value = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    timeMarks.set(key, value);
    syncTimeMarks();
    showToast('Zapisano godzinę: ' + value + '.');
  }

  function syncTimeMarks() {
    all('[data-time-mark-panel]').forEach(function (panel) {
      const value = timeMarks.get(panel.dataset.timeMarkPanel);
      const status = panel.querySelector('[data-time-mark-status]');
      const button = panel.querySelector('[data-procedure-tool="time-mark"]');
      if (status) status.textContent = value ? 'Zapisana godzina: ' + value : 'Godzina nie została jeszcze zapisana.';
      if (button) button.textContent = value ? '↻ Zapisz nową godzinę' : '⏱ Zapisz godzinę';
      panel.classList.toggle('complete', Boolean(value));
    });
  }

  function syncToolDisplays() {
    syncMetronomeDisplay();
    updateBreathTimerDisplay();
    syncProcedureTimerDisplay();
    syncTimeMarks();
  }

  function parseInventoryRows(value) {
    return String(value == null ? '' : value).split(/\r?\n/).slice(0, 200).map(function (line, index) {
      const parts = line.split('|').map(function (part) { return part.trim(); });
      if (!parts[0]) return null;
      return normalizeKitItem({
        id: 'item-' + index,
        name: parts[0],
        quantity: parts[1],
        minimum: parts[2],
        expiry: parts[3]
      }, index);
    }).filter(Boolean);
  }

  function renderEntityForm() {
    let fields = '';
    if (selectedEntity === 'aeds') {
      fields = [
        '<label><span>Nazwa AED</span><input name="name" required maxlength="120" placeholder="np. AED — portiernia"></label>',
        '<label><span>Lokalizacja</span><input name="location" required maxlength="240" placeholder="budynek, piętro, punkt orientacyjny"></label>',
        '<label><span>Dostępność</span><select name="available"><option value="true">Dostępny</option><option value="false">Niedostępny</option></select></label>',
        '<label><span>Zasady dostępu</span><input name="access" maxlength="180" placeholder="np. dostęp 24/7"></label>',
        '<label><span>Producent</span><input name="manufacturer" maxlength="120" placeholder="dane demonstracyjne"></label>',
        '<label><span>Model</span><input name="model" maxlength="120"></label>',
        '<label><span>Numer seryjny</span><input name="serialNumber" maxlength="120" placeholder="bez danych osobowych"></label>',
        '<label><span>Ostatnia kontrola</span><input name="lastInspection" type="date"></label>',
        '<label><span>Następna kontrola</span><input name="nextInspection" type="date"></label>',
        '<label><span>Ważność elektrod</span><input name="electrodesExpiry" type="date"></label>',
        '<label><span>Termin baterii</span><input name="batteryExpiry" type="date"></label>',
        '<label><span>Szerokość GPS</span><input name="lat" type="number" step="0.000001" min="-90" max="90" placeholder="52.402000"></label>',
        '<label><span>Długość GPS</span><input name="lon" type="number" step="0.000001" min="-180" max="180" placeholder="16.949000"></label>',
        '<label class="wide"><span>Uwagi techniczne</span><textarea name="notes" rows="2" maxlength="500" placeholder="Nie wpisuj danych osobowych."></textarea></label>'
      ].join('');
    } else if (selectedEntity === 'kits') {
      fields = [
        '<label><span>Nazwa apteczki</span><input name="name" required maxlength="120" placeholder="np. Apteczka — hala 2"></label>',
        '<label><span>Rodzaj</span><select name="type"><option>zakładowa</option><option>samochodowa</option><option>terenowa</option><option>inna</option></select></label>',
        '<label><span>Dostępność</span><select name="available"><option value="true">Dostępna</option><option value="false">Niedostępna</option></select></label>',
        '<label><span>Ostatnia kontrola</span><input name="lastInspection" type="date"></label>',
        '<label><span>Następna kontrola</span><input name="nextInspection" type="date"></label>',
        '<label><span>Szerokość GPS</span><input name="lat" type="number" step="0.000001" min="-90" max="90" placeholder="52.402000"></label>',
        '<label><span>Długość GPS</span><input name="lon" type="number" step="0.000001" min="-180" max="180" placeholder="16.949000"></label>',
        '<label class="wide"><span>Lokalizacja</span><input name="location" required maxlength="240" placeholder="budynek, pomieszczenie, pojazd"></label>',
        '<label class="wide"><span>Krótki opis wyposażenia</span><textarea name="contents" rows="2" maxlength="700" placeholder="opatrunki, rękawiczki, koc termiczny…"></textarea></label>',
        '<label class="wide"><span>Ewidencja wyposażenia</span><textarea name="items" rows="5" maxlength="10000" placeholder="Nazwa | ilość | minimum | RRRR-MM-DD&#10;Opatrunek indywidualny | 4 | 2 | 2028-12-31"></textarea><small>Jeden element w wierszu. Datę pomiń, jeżeli produkt jej nie ma.</small></label>'
      ].join('');
    }
    $('entityForm').innerHTML = fields + '<button class="button primary" type="submit">Dodaj pozycję</button>';
  }

  function entitySummary(item) {
    const readiness = getReadiness(selectedEntity, item);
    if (selectedEntity === 'aeds') return [readiness.label, item.location].filter(Boolean).join(' · ');
    return [readiness.label, item.type, item.location].filter(Boolean).join(' · ');
  }

  function renderEntityList() {
    const items = state[selectedEntity];
    if (!items.length) {
      $('entityList').innerHTML = '<div class="empty-state">Brak zapisanych pozycji.</div>';
      return;
    }
    $('entityList').innerHTML = items.map(function (item) {
      const readiness = getReadiness(selectedEntity, item);
      return [
        '<article class="entity-row ', readiness.level, '"><div><strong>', esc(item.name), '</strong><small>', esc(entitySummary(item)), '</small></div>',
        '<button class="delete-button" type="button" data-delete-entity="', esc(item.id), '">Usuń</button></article>'
      ].join('');
    }).join('');
  }

  function renderDataManager() {
    all('#dataTabs [data-entity]').forEach(function (button) {
      button.setAttribute('aria-selected', String(button.dataset.entity === selectedEntity));
    });
    renderEntityForm();
    renderEntityList();
  }

  function addEntity(form) {
    const formData = new FormData(form);
    const id = selectedEntity.replace(/s$/, '') + '-' + Date.now();
    let item;
    if (selectedEntity === 'aeds') {
      item = normalizeAed({
        id: id,
        name: formData.get('name'),
        location: formData.get('location'),
        lat: formData.get('lat') || null,
        lon: formData.get('lon') || null,
        available: formData.get('available'),
        access: formData.get('access'),
        manufacturer: formData.get('manufacturer'),
        model: formData.get('model'),
        serialNumber: formData.get('serialNumber'),
        lastInspection: formData.get('lastInspection'),
        nextInspection: formData.get('nextInspection'),
        electrodesExpiry: formData.get('electrodesExpiry'),
        batteryExpiry: formData.get('batteryExpiry'),
        notes: formData.get('notes')
      }, 0);
    } else if (selectedEntity === 'kits') {
      item = normalizeKit({
        id: id,
        name: formData.get('name'),
        location: formData.get('location'),
        lat: formData.get('lat') || null,
        lon: formData.get('lon') || null,
        type: formData.get('type'),
        available: formData.get('available'),
        lastInspection: formData.get('lastInspection'),
        nextInspection: formData.get('nextInspection'),
        contents: formData.get('contents'),
        items: parseInventoryRows(formData.get('items'))
      }, 0);
    }
    state[selectedEntity].push(item);
    saveState();
    renderResourceCounts();
    renderResources();
    renderDataManager();
    showToast('Dodano nową pozycję.');
  }

  function deleteEntity(id) {
    const item = state[selectedEntity].find(function (candidate) { return candidate.id === id; });
    if (!item) return;
    if (!window.confirm('Usunąć pozycję „' + item.name + '” z tego urządzenia?')) return;
    state[selectedEntity] = state[selectedEntity].filter(function (candidate) { return candidate.id !== id; });
    saveState();
    renderResourceCounts();
    renderResources();
    renderDataManager();
    showToast('Pozycja została usunięta.');
  }

  function resetDemoData() {
    if (!window.confirm('Przywrócić wszystkie demonstracyjne AED i apteczki? Twoje lokalne zmiany zostaną zastąpione.')) return;
    const preferences = clone(state.preferences);
    state = normalizeState(DATA.defaultState);
    state.preferences = preferences;
    saveState();
    renderResourceCounts();
    renderResources();
    renderDataManager();
    showToast('Przywrócono dane demonstracyjne.');
  }

  function exportData() {
    const payload = {
      app: 'Ratownik PLK v2',
      version: DATA.version,
      exportedAt: new Date().toISOString(),
      data: state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ratownik-plk-v2-kopia-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('Kopia danych została przygotowana.');
  }

  function importData(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Plik jest zbyt duży. Maksymalny rozmiar to 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const payload = JSON.parse(String(reader.result || ''));
        const imported = payload && payload.data ? payload.data : payload;
        if (!imported || !Array.isArray(imported.aeds) || !Array.isArray(imported.kits)) throw new Error('invalid');
        if (!window.confirm('Import zastąpi bieżące dane lokalne. Kontynuować?')) return;
        state = normalizeState(imported);
        saveState();
        applyPreferences();
        updateLocationSummary();
        renderResourceCounts();
        renderResources();
        renderDataManager();
        showToast('Dane zostały zaimportowane.');
      } catch (error) {
        showToast('Nieprawidłowy plik kopii Ratownik PLK v2.');
      }
    };
    reader.onerror = function () { showToast('Nie udało się odczytać pliku.'); };
    reader.readAsText(file);
  }

  function updateNetworkStatus() {
    const online = navigator.onLine;
    const badge = $('networkBadge');
    const banner = $('offlineBanner');
    badge.classList.toggle('offline', !online);
    badge.querySelector('span').textContent = online ? 'Online' : 'Offline';
    badge.setAttribute('aria-label', online ? 'Aplikacja jest online' : 'Aplikacja jest offline i korzysta z danych lokalnych');
    banner.hidden = online;
    if (online) {
      try { localStorage.setItem(LAST_ONLINE_KEY, new Date().toISOString()); } catch (error) { /* Informacja pomocnicza. */ }
      return;
    }
    let lastOnline = '';
    try { lastOnline = localStorage.getItem(LAST_ONLINE_KEY) || ''; } catch (error) { /* Informacja pomocnicza. */ }
    const formatted = lastOnline ? new Date(lastOnline).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : 'brak danych';
    $('offlineDetails').textContent = 'Procedury i narzędzia działają lokalnie · wersja ' + DATA.version + ' · ostatnie połączenie: ' + formatted + '.';
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      $('installButton').hidden = false;
    });
    $('installButton').addEventListener('click', async function () {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('installButton').hidden = true;
    });
    window.addEventListener('appinstalled', function () {
      deferredInstallPrompt = null;
      $('installButton').hidden = true;
      showToast('Aplikacja została zainstalowana.');
    });
  }

  function showUpdateBanner(registration) {
    serviceWorkerRegistration = registration;
    $('updateBanner').hidden = false;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (registration) {
        serviceWorkerRegistration = registration;
        if (registration.waiting) showUpdateBanner(registration);
        registration.addEventListener('updatefound', function () {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(registration);
          });
        });
      }).catch(function () {
        showToast('Tryb offline nie został uruchomiony.');
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
  }

  function attachEvents() {
    document.addEventListener('click', function (event) {
      const onlineLink = event.target.closest('[data-online-required]');
      if (onlineLink && !navigator.onLine) {
        event.preventDefault();
        showToast('Ta funkcja wymaga internetu. Procedury i narzędzia nadal działają offline.');
        return;
      }

      const nav = event.target.closest('[data-nav], [data-go]');
      if (nav) showScreen(nav.dataset.nav || nav.dataset.go);

      const procedureButton = event.target.closest('[data-procedure]');
      if (procedureButton) openProcedure(procedureButton.dataset.procedure, procedureButton.dataset.procedureStep);

      const guideButton = event.target.closest('[data-guide-action]');
      if (guideButton) handleGuideAction(guideButton.dataset.guideAction);

      const toolButton = event.target.closest('[data-procedure-tool]');
      if (toolButton) {
        const tool = toolButton.dataset.procedureTool;
        if (tool === 'breath') toggleBreathTimer();
        else if (tool === 'metronome') toggleMetronome();
        else if (tool === 'timer') toggleProcedureTimer(toolButton.dataset.seconds, toolButton.dataset.label);
        else if (tool === 'time-mark') saveTimeMark(toolButton.dataset.markKey);
      }

      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) closeDialog(closeButton.dataset.closeDialog);
    });

    window.addEventListener('hashchange', routeFromHash);
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    $('emergencyGuideButton').addEventListener('click', function () {
      renderGuide('safety');
      showDialog('emergencyDialog');
    });
    $('getLocationButton').addEventListener('click', getLocation);
    $('resourceLocationButton').addEventListener('click', getLocation);
    $('openReportButton').addEventListener('click', openReport);
    $('generateReportButton').addEventListener('click', generateReport);
    $('reportForm').addEventListener('submit', function (event) {
      event.preventDefault();
      generateReport();
    });
    $('copyReportButton').addEventListener('click', function () { copyText($('reportResult').value, 'Treść zgłoszenia skopiowana.'); });

    $('procedureSearch').addEventListener('input', renderProcedures);
    $('clearProcedureSearch').addEventListener('click', function () {
      $('procedureSearch').value = '';
      $('procedureSearch').focus();
      renderProcedures();
    });
    $('procedureFilters').addEventListener('click', function (event) {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      selectedProcedureCategory = button.dataset.category;
      renderProcedureFilters();
      renderProcedures();
    });

    $('previousStepButton').addEventListener('click', function () {
      if (currentStep > 0) {
        currentStep -= 1;
        renderProcedureStep();
      }
    });
    $('nextStepButton').addEventListener('click', function () {
      if (!currentProcedure) return;
      if (currentStep < currentProcedure.steps.length - 1) {
        currentStep += 1;
        renderProcedureStep();
      } else {
        closeDialog('procedureDialog');
        showToast('Procedura zakończona. Nadal kontroluj stan poszkodowanego.');
      }
    });

    $('resourceTabs').addEventListener('click', function (event) {
      const button = event.target.closest('[data-resource]');
      if (!button || VALID_RESOURCES.indexOf(button.dataset.resource) < 0) return;
      selectedResource = button.dataset.resource;
      all('#resourceTabs [data-resource]').forEach(function (tab) { tab.setAttribute('aria-selected', String(tab === button)); });
      $('resourceSearch').value = '';
      renderResources();
    });
    $('resourceSearch').addEventListener('input', renderResources);

    $('metronomeButton').addEventListener('click', toggleMetronome);
    $('breathTimerButton').addEventListener('click', toggleBreathTimer);
    $('darkModeToggle').addEventListener('click', function () { togglePreference('darkMode'); });
    $('largeTextToggle').addEventListener('click', function () { togglePreference('largeText'); });
    $('themeButton').addEventListener('click', function () { togglePreference('darkMode'); });

    $('manageDataButton').addEventListener('click', function () {
      renderDataManager();
      showDialog('dataDialog');
    });
    $('exportButton').addEventListener('click', exportData);
    $('importButton').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function () {
      importData(this.files && this.files[0]);
      this.value = '';
    });
    $('dataTabs').addEventListener('click', function (event) {
      const button = event.target.closest('[data-entity]');
      if (!button || VALID_ENTITIES.indexOf(button.dataset.entity) < 0) return;
      selectedEntity = button.dataset.entity;
      renderDataManager();
    });
    $('entityForm').addEventListener('submit', function (event) {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      addEntity(event.currentTarget);
    });
    $('entityList').addEventListener('click', function (event) {
      const button = event.target.closest('[data-delete-entity]');
      if (button) deleteEntity(button.dataset.deleteEntity);
    });
    $('resetDemoButton').addEventListener('click', resetDemoData);

    $('updateButton').addEventListener('click', function () {
      if (serviceWorkerRegistration && serviceWorkerRegistration.waiting) serviceWorkerRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    });

    all('dialog').forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog && dialog.classList.contains('sheet-dialog')) dialog.close();
      });
    });
  }

  function init() {
    if (!DATA || !Array.isArray(DATA.procedures)) throw new Error('Brak danych aplikacji.');
    saveState();
    renderQuickActions();
    renderProcedureFilters();
    renderProcedures();
    renderGuide('safety');
    renderReportTypes();
    renderResourceCounts();
    updateLocationSummary();
    renderResources();
    renderDataManager();
    applyPreferences();
    syncToolDisplays();
    updateNetworkStatus();
    attachEvents();
    setupInstallPrompt();
    registerServiceWorker();
    routeFromHash();
  }

  init();
}());

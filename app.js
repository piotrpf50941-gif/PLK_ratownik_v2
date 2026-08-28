(function () {
  'use strict';

  const DATA = window.RATOWNIK_DATA;
  const STORAGE_KEY = 'ratownik_plk_v2_state';
  const VALID_SCREENS = ['home', 'procedures', 'resources', 'tools'];
  const VALID_ENTITIES = ['aeds', 'kits', 'rescuers'];

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
  let breathSeconds = 10;
  let audioContext = null;
  let metronomeScheduler = null;
  let nextMetronomeBeat = 0;
  let serviceWorkerRegistration = null;
  let reloadingForUpdate = false;

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength || 500);
  }

  function cleanPhone(value) {
    return String(value == null ? '' : value).replace(/[^0-9+]/g, '').slice(0, 20);
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

  function normalizeAed(item, index) {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: cleanText(raw.id, 80) || 'aed-' + Date.now() + '-' + index,
      name: cleanText(raw.name, 120) || 'AED',
      location: cleanText(raw.location, 240),
      lat: safeNumber(raw.lat, null),
      lon: safeNumber(raw.lon, null)
    };
  }

  function normalizeKit(item, index) {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: cleanText(raw.id, 80) || 'kit-' + Date.now() + '-' + index,
      name: cleanText(raw.name, 120) || 'Apteczka',
      location: cleanText(raw.location, 240),
      type: cleanText(raw.type, 80) || 'inna',
      contents: cleanText(raw.contents, 700)
    };
  }

  function normalizeRescuer(item, index) {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      id: cleanText(raw.id, 80) || 'rescuer-' + Date.now() + '-' + index,
      name: cleanText(raw.name, 120) || 'Ratownik',
      phone: cleanPhone(raw.phone),
      zone: cleanText(raw.zone, 160),
      location: cleanText(raw.location, 180),
      skills: cleanText(raw.skills, 240),
      active: raw.active !== false
    };
  }

  function normalizeState(value) {
    const defaults = clone(DATA.defaultState);
    const raw = value && typeof value === 'object' ? value : {};
    const location = raw.location && typeof raw.location === 'object' ? {
      lat: safeNumber(raw.location.lat, null),
      lon: safeNumber(raw.location.lon, null),
      accuracy: Math.max(0, safeNumber(raw.location.accuracy, 0)),
      timestamp: safeNumber(raw.location.timestamp, Date.now())
    } : null;

    return {
      aeds: (Array.isArray(raw.aeds) ? raw.aeds : defaults.aeds).slice(0, 1000).map(normalizeAed),
      kits: (Array.isArray(raw.kits) ? raw.kits : defaults.kits).slice(0, 1000).map(normalizeKit),
      rescuers: (Array.isArray(raw.rescuers) ? raw.rescuers : defaults.rescuers).slice(0, 1000).map(normalizeRescuer),
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

  function openProcedure(id) {
    const procedure = getProcedure(id);
    if (!procedure) return;
    currentProcedure = procedure;
    currentStep = 0;
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
      '<p class="procedure-summary">Źródło odniesienia: <a href="', esc(currentProcedure.sourceUrl), '" target="_blank" rel="noopener noreferrer">', esc(currentProcedure.sourceLabel), '</a>. Procedurę kolejową należy uzgodnić z obowiązującymi instrukcjami zakładowymi.</p>'
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
      '<p>', esc(step.text), '</p>',
      step.warning ? '<div class="step-warning"><strong>!</strong><span>' + esc(step.warning) + '</span></div>' : '',
      '</article>',
      source
    ].join('');

    $('stepProgressText').textContent = 'Krok ' + (currentStep + 1) + ' z ' + currentProcedure.steps.length;
    $('stepProgressBar').style.width = progress + '%';
    $('previousStepButton').disabled = currentStep === 0;
    $('nextStepButton').textContent = currentStep === currentProcedure.steps.length - 1 ? 'Zakończ procedurę' : 'Następny krok';
    $('procedureContent').scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderEmergencyChoices() {
    $('emergencyChoices').innerHTML = DATA.emergencyChoiceIds.map(function (id) {
      const procedure = getProcedure(id);
      if (!procedure) return '';
      return [
        '<button class="emergency-choice" type="button" data-procedure="', esc(procedure.id), '">',
        '<span aria-hidden="true">', esc(procedure.icon), '</span>',
        '<span><strong>', esc(procedure.shortTitle), '</strong><small>', esc(procedure.summary), '</small></span>',
        '<span aria-hidden="true">›</span>',
        '</button>'
      ].join('');
    }).join('');
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
    $('rescuerCount').textContent = state.rescuers.length;
    $('dataAedCount').textContent = state.aeds.length;
    $('dataKitCount').textContent = state.kits.length;
    $('dataRescuerCount').textContent = state.rescuers.length;
  }

  function renderResources() {
    renderResourceCounts();
    const query = normalizeSearch($('resourceSearch').value);
    let items = state[selectedResource].slice();

    if (selectedResource === 'aeds' && state.location) {
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
      const haystack = normalizeSearch(Object.keys(item).map(function (key) { return item[key]; }).join(' '));
      return !query || haystack.indexOf(query) >= 0;
    });

    if (selectedResource === 'aeds') {
      $('resourceHint').textContent = state.location ? 'AED są posortowane według przybliżonej odległości w linii prostej.' : 'Włącz GPS, aby posortować AED według odległości.';
    } else if (selectedResource === 'kits') {
      $('resourceHint').textContent = 'Sprawdź lokalizację oraz wyposażenie apteczki przed zdarzeniem.';
    } else {
      $('resourceHint').textContent = 'Połączenie i SMS są uruchamiane w aplikacji telefonu.';
    }

    if (!items.length) {
      $('resourceList').innerHTML = '<div class="empty-state">Brak pasujących pozycji.</div>';
      return;
    }

    $('resourceList').innerHTML = items.map(function (item) {
      if (selectedResource === 'aeds') return renderAedCard(item);
      if (selectedResource === 'kits') return renderKitCard(item);
      return renderRescuerCard(item);
    }).join('');
  }

  function renderAedCard(item) {
    const hasCoordinates = item.lat !== null && item.lon !== null;
    const mapUrl = hasCoordinates ? 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(item.lat) + '&mlon=' + encodeURIComponent(item.lon) + '#map=18/' + encodeURIComponent(item.lat) + '/' + encodeURIComponent(item.lon) : '';
    return [
      '<article class="resource-card">',
      '<span class="resource-icon aed" aria-hidden="true">⚡</span>',
      '<div class="resource-copy"><strong>', esc(item.name), '</strong><span>', esc(item.location || 'Brak opisu lokalizacji'), '</span>',
      item.distance !== null && item.distance !== undefined ? '<small>Około ' + esc(formatDistance(item.distance)) + ' w linii prostej</small>' : '',
      '</div>',
      '<div class="resource-actions">',
      hasCoordinates ? '<a class="resource-action" href="' + esc(mapUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Pokaż AED na mapie">⌖</a>' : '',
      '</div></article>'
    ].join('');
  }

  function renderKitCard(item) {
    return [
      '<article class="resource-card">',
      '<span class="resource-icon kit" aria-hidden="true">✚</span>',
      '<div class="resource-copy"><strong>', esc(item.name), '</strong><span>', esc(item.location || 'Brak opisu lokalizacji'), '</span><small>', esc(item.type), item.contents ? ' · ' + esc(item.contents) : '', '</small></div>',
      '<div class="resource-actions"></div>',
      '</article>'
    ].join('');
  }

  function renderRescuerCard(item) {
    const phone = cleanPhone(item.phone);
    const message = encodeURIComponent('ALARM RATOWNICZY. Proszę o pilny kontakt i gotowość do pomocy.');
    return [
      '<article class="resource-card">',
      '<span class="resource-icon rescuer" aria-hidden="true">●</span>',
      '<div class="resource-copy"><strong>', esc(item.name), '</strong><span>', esc([item.zone, item.location].filter(Boolean).join(' · ')), '</span><small>', esc(item.skills || (item.active ? 'aktywny' : 'nieaktywny')), '</small></div>',
      '<div class="resource-actions">',
      phone ? '<a class="resource-action" href="tel:' + esc(phone) + '" aria-label="Zadzwoń do ' + esc(item.name) + '">☎</a>' : '',
      phone ? '<a class="resource-action" href="sms:' + esc(phone) + '?body=' + message + '" aria-label="Wyślij SMS do ' + esc(item.name) + '">✉</a>' : '',
      '</div></article>'
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

  function scheduleBeat(time) {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(720, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.18, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.065);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.075);
  }

  function metronomeLoop() {
    while (audioContext && nextMetronomeBeat < audioContext.currentTime + 0.12) {
      scheduleBeat(nextMetronomeBeat);
      nextMetronomeBeat += 60 / 110;
    }
  }

  function startMetronome() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      showToast('Przeglądarka nie obsługuje metronomu audio.');
      return;
    }
    audioContext = audioContext || new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
    nextMetronomeBeat = audioContext.currentTime + 0.05;
    metronomeLoop();
    metronomeScheduler = window.setInterval(metronomeLoop, 25);
    $('metronomeButton').textContent = 'Zatrzymaj metronom';
    $('metronomeButton').closest('.tool-card').classList.add('running');
    showToast('Metronom: 110 uciśnięć na minutę.');
  }

  function stopMetronome() {
    window.clearInterval(metronomeScheduler);
    metronomeScheduler = null;
    if (audioContext && audioContext.state !== 'closed') audioContext.suspend();
    $('metronomeButton').textContent = 'Uruchom metronom';
    $('metronomeButton').closest('.tool-card').classList.remove('running');
  }

  function toggleMetronome() {
    if (metronomeScheduler) stopMetronome();
    else startMetronome();
  }

  function updateBreathTimer() {
    $('breathTimerValue').textContent = breathSeconds + (breathSeconds === 1 ? ' sekunda' : ' sekund');
  }

  function stopBreathTimer(reset) {
    window.clearInterval(breathTimer);
    breathTimer = null;
    if (reset) breathSeconds = 10;
    updateBreathTimer();
    $('breathTimerButton').textContent = 'Rozpocznij odliczanie';
    $('breathTimerButton').closest('.tool-card').classList.remove('running');
  }

  function toggleBreathTimer() {
    if (breathTimer) {
      stopBreathTimer(true);
      return;
    }
    breathSeconds = 10;
    updateBreathTimer();
    $('breathTimerButton').textContent = 'Zatrzymaj i wyzeruj';
    $('breathTimerButton').closest('.tool-card').classList.add('running');
    breathTimer = window.setInterval(function () {
      breathSeconds -= 1;
      updateBreathTimer();
      if (breathSeconds <= 0) {
        stopBreathTimer(false);
        $('breathTimerValue').textContent = 'Czas minął';
        if (navigator.vibrate) navigator.vibrate([180, 100, 180]);
        showToast('10 sekund minęło — podejmij decyzję o oddechu.');
      }
    }, 1000);
  }

  function renderEntityForm() {
    let fields = '';
    if (selectedEntity === 'aeds') {
      fields = [
        '<label><span>Nazwa AED</span><input name="name" required maxlength="120" placeholder="np. AED — portiernia"></label>',
        '<label><span>Lokalizacja</span><input name="location" required maxlength="240" placeholder="budynek, piętro, punkt orientacyjny"></label>',
        '<label><span>Szerokość GPS</span><input name="lat" type="number" step="0.000001" min="-90" max="90" placeholder="52.402000"></label>',
        '<label><span>Długość GPS</span><input name="lon" type="number" step="0.000001" min="-180" max="180" placeholder="16.949000"></label>'
      ].join('');
    } else if (selectedEntity === 'kits') {
      fields = [
        '<label><span>Nazwa apteczki</span><input name="name" required maxlength="120" placeholder="np. Apteczka — hala 2"></label>',
        '<label><span>Rodzaj</span><select name="type"><option>zakładowa</option><option>samochodowa</option><option>terenowa</option><option>inna</option></select></label>',
        '<label class="wide"><span>Lokalizacja</span><input name="location" required maxlength="240" placeholder="budynek, pomieszczenie, pojazd"></label>',
        '<label class="wide"><span>Najważniejsze wyposażenie</span><textarea name="contents" rows="3" maxlength="700" placeholder="opatrunki, rękawiczki, koc termiczny…"></textarea></label>'
      ].join('');
    } else {
      fields = [
        '<label><span>Imię i nazwisko</span><input name="name" required maxlength="120"></label>',
        '<label><span>Telefon</span><input name="phone" required inputmode="tel" maxlength="20"></label>',
        '<label><span>Zakład / obszar</span><input name="zone" maxlength="160"></label>',
        '<label><span>Lokalizacja / baza</span><input name="location" maxlength="180"></label>',
        '<label class="wide"><span>Uprawnienia</span><input name="skills" maxlength="240" placeholder="np. KPP, AED"></label>'
      ].join('');
    }
    $('entityForm').innerHTML = fields + '<button class="button primary" type="submit">Dodaj pozycję</button>';
  }

  function entitySummary(item) {
    if (selectedEntity === 'aeds') return item.location;
    if (selectedEntity === 'kits') return [item.type, item.location].filter(Boolean).join(' · ');
    return [item.zone, item.location, item.phone].filter(Boolean).join(' · ');
  }

  function renderEntityList() {
    const items = state[selectedEntity];
    if (!items.length) {
      $('entityList').innerHTML = '<div class="empty-state">Brak zapisanych pozycji.</div>';
      return;
    }
    $('entityList').innerHTML = items.map(function (item) {
      return [
        '<article class="entity-row"><div><strong>', esc(item.name), '</strong><small>', esc(entitySummary(item)), '</small></div>',
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
      item = normalizeAed({ id: id, name: formData.get('name'), location: formData.get('location'), lat: formData.get('lat') || null, lon: formData.get('lon') || null }, 0);
    } else if (selectedEntity === 'kits') {
      item = normalizeKit({ id: id, name: formData.get('name'), location: formData.get('location'), type: formData.get('type'), contents: formData.get('contents') }, 0);
    } else {
      item = normalizeRescuer({ id: id, name: formData.get('name'), phone: formData.get('phone'), zone: formData.get('zone'), location: formData.get('location'), skills: formData.get('skills'), active: true }, 0);
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
    if (!window.confirm('Przywrócić wszystkie demonstracyjne AED, apteczki i ratowników? Twoje lokalne zmiany zostaną zastąpione.')) return;
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
        if (!imported || !Array.isArray(imported.aeds) || !Array.isArray(imported.kits) || !Array.isArray(imported.rescuers)) throw new Error('invalid');
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
    $('networkBadge').classList.toggle('offline', !online);
    $('networkBadge').querySelector('span').textContent = online ? 'Online' : 'Offline';
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
      const nav = event.target.closest('[data-nav], [data-go]');
      if (nav) showScreen(nav.dataset.nav || nav.dataset.go);

      const procedureButton = event.target.closest('[data-procedure]');
      if (procedureButton) openProcedure(procedureButton.dataset.procedure);

      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) closeDialog(closeButton.dataset.closeDialog);
    });

    window.addEventListener('hashchange', routeFromHash);
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    $('emergencyGuideButton').addEventListener('click', function () { showDialog('emergencyDialog'); });
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
      if (!button) return;
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
    renderQuickActions();
    renderProcedureFilters();
    renderProcedures();
    renderEmergencyChoices();
    renderReportTypes();
    renderResourceCounts();
    updateLocationSummary();
    renderResources();
    renderDataManager();
    applyPreferences();
    updateNetworkStatus();
    attachEvents();
    setupInstallPrompt();
    registerServiceWorker();
    routeFromHash();
  }

  init();
}());

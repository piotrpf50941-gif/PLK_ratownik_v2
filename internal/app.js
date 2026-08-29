(function () {
  'use strict';

  var CONFIG = window.RATOWNIK_INTERNAL_CONFIG || {};
  var client = null;
  var currentSession = null;
  var currentUser = null;
  var profile = null;
  var memberships = [];
  var organizations = [];
  var currentOrganizationId = '';
  var locationSnapshot = null;
  var counters = { responders: 0, availableResponders: 0, incidents: 0, organizations: 0, attention: 0 };
  var refreshSequence = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setHidden(id, hidden) {
    var element = $(id);
    if (element) element.hidden = hidden;
  }

  function setStatus(id, message, type) {
    var element = $(id);
    if (!element) return;
    element.textContent = message || '';
    element.className = 'form-status' + (type ? ' ' + type : '');
  }

  function showToast(message) {
    var toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.hidden = true;
    }, 4200);
  }

  function errorMessage(error) {
    if (!error) return 'Nieznany błąd.';
    if (error.context && typeof error.context.json === 'function') {
      return 'Funkcja serwerowa odrzuciła żądanie.';
    }
    return error.message || String(error);
  }

  function isConfigured() {
    var url = text(CONFIG.supabaseUrl).trim();
    var key = text(CONFIG.supabasePublishableKey).trim();
    var safeUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
    var publishable = /^(sb_publishable_|eyJ)/.test(key);
    var forbidden = /(sb_secret_|service_role)/i.test(key);
    return Boolean(safeUrl && publishable && !forbidden);
  }

  function updateConnectionBadge() {
    var badge = $('connectionBadge');
    if (!badge) return;
    if (!navigator.onLine) {
      badge.textContent = 'OFFLINE';
      badge.className = 'badge offline';
      return;
    }
    badge.textContent = client ? 'ONLINE' : 'NIESKONFIGUROWANY';
    badge.className = client ? 'badge online' : 'badge muted';
  }

  function roleLabel(role) {
    return {
      employee: 'PRACOWNIK',
      responder: 'RATOWNIK',
      unit_admin: 'ADMIN JEDNOSTKI',
      system_admin: 'ADMIN SYSTEMU'
    }[role] || 'PRACOWNIK';
  }

  function incidentLabel(kind) {
    return {
      unconscious: 'Osoba nieprzytomna',
      cardiac_arrest: 'Podejrzenie zatrzymania krążenia',
      trauma: 'Uraz / wypadek',
      bleeding: 'Silny krwotok',
      other: 'Inne zdarzenie'
    }[kind] || kind || 'Zdarzenie';
  }

  function formatDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function one(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
  }

  function activeRolesForCurrentOrganization() {
    var organizationScope = new Set();
    var cursor = currentOrganizationId;
    var guard = 0;
    while (cursor && guard < 16) {
      organizationScope.add(cursor);
      var organization = organizations.find(function (item) { return item.id === cursor; });
      cursor = organization ? organization.parent_id : null;
      guard += 1;
    }

    var roles = memberships
      .filter(function (membership) {
        if (!membership.active) return false;
        if (membership.organization_id === currentOrganizationId) return true;
        return membership.role === 'unit_admin' && organizationScope.has(membership.organization_id);
      })
      .map(function (membership) { return membership.role; });

    if (memberships.some(function (membership) {
      return membership.active && membership.role === 'system_admin';
    }) && roles.indexOf('system_admin') === -1) {
      roles.push('system_admin');
    }
    return Array.from(new Set(roles));
  }

  function canManageCurrentOrganization() {
    var roles = activeRolesForCurrentOrganization();
    return roles.indexOf('system_admin') >= 0 || roles.indexOf('unit_admin') >= 0;
  }

  function highestRole() {
    var order = ['system_admin', 'unit_admin', 'responder', 'employee'];
    var roles = activeRolesForCurrentOrganization();
    return order.find(function (role) { return roles.indexOf(role) >= 0; }) || 'employee';
  }

  function updateRoleInterface() {
    var role = highestRole();
    $('roleBadge').textContent = roleLabel(role);
    document.querySelectorAll('.admin-only').forEach(function (element) {
      element.hidden = !canManageCurrentOrganization();
    });
  }

  function clearProtectedInterface() {
    currentSession = null;
    currentUser = null;
    profile = null;
    memberships = [];
    organizations = [];
    currentOrganizationId = '';
    locationSnapshot = null;
    $('responderList').replaceChildren();
    $('organizationList').replaceChildren();
    $('incidentList').replaceChildren();
    $('organizationSelect').replaceChildren();
    setHidden('internalApp', true);
    setHidden('accessDeniedSection', true);
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var email = text(new FormData(form).get('email')).trim().toLowerCase();
    if (!email) return;
    $('loginButton').disabled = true;
    setStatus('loginStatus', 'Wysyłam bezpieczny link…');
    var redirectUrl = window.location.origin + window.location.pathname;
    try {
      var result = await client.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: false
        }
      });
      if (result.error) throw result.error;
      setStatus('loginStatus', 'Link został wysłany. Otwórz wiadomość na tym samym urządzeniu.', 'success');
      form.reset();
    } catch (error) {
      setStatus('loginStatus', 'Nie udało się wysłać linku: ' + errorMessage(error), 'error');
    } finally {
      $('loginButton').disabled = false;
    }
  }

  async function signOut() {
    if (!client) return;
    try {
      await client.auth.signOut({ scope: 'local' });
    } finally {
      clearProtectedInterface();
      setHidden('loginSection', false);
      showToast('Wylogowano i usunięto dane panelu z bieżącego widoku.');
    }
  }

  function renderOrganizationSelector() {
    var select = $('organizationSelect');
    select.replaceChildren();
    organizations.forEach(function (organization) {
      var option = document.createElement('option');
      option.value = organization.id;
      option.textContent = (organization.code ? organization.code + ' — ' : '') + organization.name;
      select.appendChild(option);
    });
    if (!organizations.some(function (organization) { return organization.id === currentOrganizationId; })) {
      currentOrganizationId = organizations[0] ? organizations[0].id : '';
    }
    select.value = currentOrganizationId;
  }

  async function loadAccessContext(session) {
    var sequence = ++refreshSequence;
    currentSession = session;
    currentUser = session.user;
    setHidden('loginSection', true);
    setHidden('configurationNotice', true);
    try {
      var responses = await Promise.all([
        client.from('profiles').select('user_id,display_name').eq('user_id', currentUser.id).maybeSingle(),
        client.from('memberships').select('id,user_id,organization_id,role,active,organizations(id,name,code,kind,active)').eq('user_id', currentUser.id).eq('active', true),
        client.from('organizations').select('id,parent_id,name,code,kind,active').eq('active', true).order('name')
      ]);
      if (sequence !== refreshSequence) return;
      responses.forEach(function (response) {
        if (response.error) throw response.error;
      });
      profile = responses[0].data || null;
      memberships = responses[1].data || [];
      organizations = responses[2].data || [];

      if (!memberships.length || !organizations.length) {
        setHidden('internalApp', true);
        setHidden('accessDeniedSection', false);
        return;
      }

      var membershipOrganizationIds = memberships.map(function (membership) {
        return membership.organization_id;
      });
      var remembered = window.sessionStorage.getItem('ratownik_internal_org');
      currentOrganizationId = organizations.some(function (organization) {
        return organization.id === remembered;
      }) ? remembered : membershipOrganizationIds[0];

      if (!organizations.some(function (organization) { return organization.id === currentOrganizationId; })) {
        currentOrganizationId = organizations[0].id;
      }

      $('userDisplayName').textContent = profile && profile.display_name
        ? profile.display_name
        : text(currentUser.email).split('@')[0] || 'Pracownik';
      $('userEmail').textContent = currentUser.email || '';
      renderOrganizationSelector();
      updateRoleInterface();
      setHidden('accessDeniedSection', true);
      setHidden('internalApp', false);
      await refreshAll();
    } catch (error) {
      clearProtectedInterface();
      setHidden('loginSection', false);
      setStatus('loginStatus', 'Nie udało się pobrać uprawnień: ' + errorMessage(error), 'error');
    }
  }

  async function handleSession(session) {
    if (!session || !session.user) {
      clearProtectedInterface();
      setHidden('loginSection', false);
      return;
    }
    await loadAccessContext(session);
  }

  function responderCard(membership) {
    var person = one(membership.profiles);
    var responder = one(membership.responder_profiles);
    var name = person && person.display_name ? person.display_name : 'Ratownik';
    var competencies = responder && Array.isArray(responder.competencies) && responder.competencies.length
      ? responder.competencies.join(', ')
      : 'Brak wpisanych kompetencji';
    var available = Boolean(responder && responder.available && membership.active);
    return '<article class="list-item">' +
      '<div><h3>' + escapeHtml(name) + '</h3>' +
      '<p>' + escapeHtml(competencies) + '</p>' +
      '<div class="meta"><span class="badge">' + escapeHtml(roleLabel(membership.role)) + '</span>' +
      '<span class="badge ' + (available ? 'online' : 'offline') + '">' + (available ? 'DOSTĘPNY' : 'NIEDOSTĘPNY') + '</span></div></div>' +
      '<span aria-label="' + (available ? 'gotowy' : 'niedostępny') + '">' + (available ? '🟢' : '🟠') + '</span>' +
      '</article>';
  }

  async function loadResponders() {
    var result = await client
      .from('memberships')
      .select('id,user_id,organization_id,role,active,profiles(display_name),responder_profiles(available,competencies)')
      .eq('organization_id', currentOrganizationId)
      .eq('role', 'responder')
      .eq('active', true)
      .order('created_at', { ascending: true });
    if (result.error) throw result.error;
    var rows = result.data || [];
    counters.responders = rows.length;
    counters.availableResponders = rows.filter(function (membership) {
      var responder = one(membership.responder_profiles);
      return responder && responder.available;
    }).length;
    $('responderCountBadge').textContent = counters.availableResponders + ' AKTYWNYCH';
    $('responderList').innerHTML = rows.length
      ? rows.map(responderCard).join('')
      : '<div class="empty">W tej jednostce nie ma jeszcze aktywnych ratowników.</div>';
  }

  async function loadOrganizations() {
    var result = await client
      .from('organizations')
      .select('id,parent_id,name,code,kind,active')
      .eq('active', true)
      .order('name');
    if (result.error) throw result.error;
    organizations = result.data || [];
    counters.organizations = organizations.length;
    renderOrganizationSelector();
    $('organizationList').innerHTML = organizations.length
      ? organizations.map(function (organization) {
          return '<article class="list-item"><div><h3>' +
            escapeHtml((organization.code ? organization.code + ' — ' : '') + organization.name) +
            '</h3><p>Typ: ' + escapeHtml(organization.kind) +
            (organization.parent_id ? ' · jednostka podrzędna' : ' · jednostka główna') +
            '</p></div><span class="badge online">AKTYWNA</span></article>';
        }).join('')
      : '<div class="empty">Brak jednostek w dostępnym zakresie.</div>';
  }

  async function loadIncidents() {
    var since = new Date();
    since.setDate(since.getDate() - 30);
    var result = await client
      .from('incidents')
      .select('id,incident_type,place_description,status,notification_mode,created_at,created_by')
      .eq('organization_id', currentOrganizationId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (result.error) throw result.error;
    var rows = result.data || [];
    counters.incidents = rows.length;
    counters.attention = rows.filter(function (incident) {
      return incident.status === 'failed' || incident.status === 'partial';
    }).length;
    $('incidentList').innerHTML = rows.length
      ? rows.map(function (incident) {
          var mode = incident.notification_mode === 'production' ? 'PRODUKCJA' : 'SYMULACJA';
          return '<article class="list-item"><div><h3>' + escapeHtml(incidentLabel(incident.incident_type)) +
            '</h3><p>' + escapeHtml(incident.place_description) + '</p><div class="meta">' +
            '<span class="badge">' + escapeHtml(mode) + '</span><span class="badge">' +
            escapeHtml(incident.status || 'utworzony') + '</span></div></div><small>' +
            escapeHtml(formatDate(incident.created_at)) + '</small></article>';
        }).join('')
      : '<div class="empty">Brak alarmów z ostatnich 30 dni.</div>';
  }

  function renderMetrics() {
    $('responderMetric').textContent = counters.availableResponders;
    $('responderMetricNote').textContent = 'dostępni z ' + counters.responders;
    $('incidentMetric').textContent = counters.incidents;
    $('organizationMetric').textContent = counters.organizations;
    $('attentionMetric').textContent = counters.attention;
    $('lastRefresh').textContent = formatDate(new Date().toISOString());
    $('notificationMode').textContent = CONFIG.notificationMode === 'production'
      ? 'produkcja — funkcja serwerowa'
      : 'symulacja — bez wysyłki';
  }

  async function refreshAll() {
    if (!client || !currentOrganizationId) return;
    $('refreshButton').disabled = true;
    try {
      await Promise.all([loadResponders(), loadOrganizations(), loadIncidents()]);
      renderMetrics();
    } catch (error) {
      showToast('Nie udało się odświeżyć panelu: ' + errorMessage(error));
    } finally {
      $('refreshButton').disabled = false;
    }
  }

  function switchPanel(name) {
    var valid = ['dashboard', 'responders', 'organizations', 'incidents'];
    if (valid.indexOf(name) < 0) return;
    document.querySelectorAll('[data-panel]').forEach(function (button) {
      var selected = button.dataset.panel === name;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('[data-panel-view]').forEach(function (panel) {
      panel.hidden = panel.dataset.panelView !== name;
      panel.classList.toggle('active', panel.dataset.panelView === name);
    });
  }

  async function inviteResponder(event) {
    event.preventDefault();
    if (!canManageCurrentOrganization()) return;
    var form = event.currentTarget;
    var data = new FormData(form);
    var competencies = text(data.get('competencies')).split(',').map(function (item) {
      return item.trim();
    }).filter(Boolean);
    setStatus('inviteStatus', 'Tworzę bezpieczne zaproszenie…');
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      var result = await client.functions.invoke('manage-responder', {
        body: {
          action: 'invite',
          organizationId: currentOrganizationId,
          displayName: text(data.get('displayName')).trim(),
          email: text(data.get('email')).trim().toLowerCase(),
          phoneE164: text(data.get('phone')).trim() || null,
          competencies: competencies
        }
      });
      if (result.error) throw result.error;
      setStatus('inviteStatus', 'Zaproszenie utworzone. Konto otrzyma rolę ratownika po przyjęciu zaproszenia.', 'success');
      form.reset();
      await loadResponders();
      renderMetrics();
    } catch (error) {
      setStatus('inviteStatus', 'Nie udało się dodać ratownika: ' + errorMessage(error), 'error');
    } finally {
      form.querySelector('button[type="submit"]').disabled = false;
    }
  }

  async function createOrganization(event) {
    event.preventDefault();
    if (!canManageCurrentOrganization()) return;
    var form = event.currentTarget;
    var data = new FormData(form);
    setStatus('organizationStatus', 'Zapisuję jednostkę…');
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      var result = await client.from('organizations').insert({
        parent_id: currentOrganizationId,
        name: text(data.get('name')).trim(),
        code: text(data.get('code')).trim().toUpperCase(),
        kind: text(data.get('kind')),
        active: true
      }).select('id').single();
      if (result.error) throw result.error;
      setStatus('organizationStatus', 'Jednostka została dodana.', 'success');
      form.reset();
      await loadOrganizations();
      renderMetrics();
    } catch (error) {
      setStatus('organizationStatus', 'Nie udało się dodać jednostki: ' + errorMessage(error), 'error');
    } finally {
      form.querySelector('button[type="submit"]').disabled = false;
    }
  }

  function openAlertDialog() {
    if (!navigator.onLine) {
      showToast('Alarmowanie wymaga połączenia z internetem. Zadzwoń pod 112 i użyj obowiązującej ścieżki służbowej.');
      return;
    }
    $('alertForm').reset();
    locationSnapshot = null;
    $('locationStatus').textContent = 'Lokalizacja niepobrana';
    setStatus('alertStatus', '');
    $('sendAlertButton').disabled = true;
    $('alertModeNotice').textContent = CONFIG.notificationMode === 'production'
      ? 'Tryb produkcyjny: po potwierdzeniu funkcja serwerowa może wysłać PUSH i awaryjny SMS.'
      : 'Tryb testowy: alarm zostanie zapisany, ale PUSH ani SMS nie zostaną wysłane.';
    $('alertDialog').showModal();
  }

  function closeAlertDialog() {
    $('alertDialog').close();
  }

  function getLocation() {
    if (!navigator.geolocation) {
      $('locationStatus').textContent = 'GPS niedostępny — wpisz miejsce ręcznie';
      return;
    }
    $('getLocationButton').disabled = true;
    $('locationStatus').textContent = 'Pobieram lokalizację…';
    navigator.geolocation.getCurrentPosition(function (position) {
      locationSnapshot = {
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
        accuracyMeters: Math.round(position.coords.accuracy)
      };
      $('locationStatus').textContent = 'GPS zapisany · dokładność około ' + locationSnapshot.accuracyMeters + ' m';
      $('getLocationButton').disabled = false;
    }, function () {
      locationSnapshot = null;
      $('locationStatus').textContent = 'Nie udało się pobrać GPS — wpisz miejsce ręcznie';
      $('getLocationButton').disabled = false;
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 15000
    });
  }

  function idempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'web-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  async function dispatchAlert(event) {
    event.preventDefault();
    if (!$('alertConfirm').checked || !currentOrganizationId) return;
    var form = event.currentTarget;
    var data = new FormData(form);
    $('sendAlertButton').disabled = true;
    setStatus('alertStatus', 'Weryfikuję uprawnienia i uruchamiam alarm…');
    try {
      var result = await client.functions.invoke('dispatch-responder-alert', {
        body: {
          idempotencyKey: idempotencyKey(),
          organizationId: currentOrganizationId,
          incidentType: text(data.get('incidentType')),
          placeDescription: text(data.get('place')).trim(),
          note: text(data.get('note')).trim() || null,
          location: locationSnapshot
        }
      });
      if (result.error) throw result.error;
      var response = result.data || {};
      var modeText = response.mode === 'production' ? 'wysłany' : 'zapisany jako symulacja';
      setStatus('alertStatus', 'Alarm ' + modeText + '. Odbiorcy: ' + (response.recipientCount || 0) + '.', 'success');
      showToast('Alarm ' + modeText + '. Zdarzenie ma zapis audytowy.');
      await loadIncidents();
      renderMetrics();
    } catch (error) {
      setStatus('alertStatus', 'Alarm nie został uruchomiony: ' + errorMessage(error) + '. W razie zagrożenia dzwoń 112.', 'error');
      $('sendAlertButton').disabled = false;
    }
  }

  function bindEvents() {
    $('loginForm').addEventListener('submit', sendMagicLink);
    $('signOutButton').addEventListener('click', signOut);
    $('deniedSignOutButton').addEventListener('click', signOut);
    $('refreshButton').addEventListener('click', refreshAll);
    $('organizationSelect').addEventListener('change', function (event) {
      currentOrganizationId = event.target.value;
      window.sessionStorage.setItem('ratownik_internal_org', currentOrganizationId);
      updateRoleInterface();
      refreshAll();
    });
    $('adminTabs').addEventListener('click', function (event) {
      var button = event.target.closest('[data-panel]');
      if (button) switchPanel(button.dataset.panel);
    });
    $('inviteResponderForm').addEventListener('submit', inviteResponder);
    $('organizationForm').addEventListener('submit', createOrganization);
    $('openAlertButton').addEventListener('click', openAlertDialog);
    $('closeAlertButton').addEventListener('click', closeAlertDialog);
    $('getLocationButton').addEventListener('click', getLocation);
    $('alertConfirm').addEventListener('change', function (event) {
      $('sendAlertButton').disabled = !event.target.checked;
    });
    $('alertForm').addEventListener('submit', dispatchAlert);
    $('alertDialog').addEventListener('cancel', function (event) {
      event.preventDefault();
      closeAlertDialog();
    });
    window.addEventListener('online', updateConnectionBadge);
    window.addEventListener('offline', updateConnectionBadge);
  }

  async function boot() {
    bindEvents();
    updateConnectionBadge();
    if (!isConfigured() || !window.supabase || typeof window.supabase.createClient !== 'function') {
      setHidden('configurationNotice', false);
      setHidden('loginSection', true);
      return;
    }

    client = window.supabase.createClient(
      text(CONFIG.supabaseUrl).trim(),
      text(CONFIG.supabasePublishableKey).trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      }
    );
    updateConnectionBadge();

    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') {
        handleSession(null);
      } else if (session && (!currentSession || currentSession.access_token !== session.access_token)) {
        window.setTimeout(function () { handleSession(session); }, 0);
      }
    });

    try {
      var result = await client.auth.getSession();
      if (result.error) throw result.error;
      await handleSession(result.data.session);
    } catch (error) {
      setHidden('loginSection', false);
      setStatus('loginStatus', 'Nie udało się uruchomić logowania: ' + errorMessage(error), 'error');
    }
  }

  boot();
}());

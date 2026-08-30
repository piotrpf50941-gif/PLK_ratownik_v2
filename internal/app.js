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
  var viewSequence = 0;
  var authEventSequence = 0;
  var alertDraft = null;
  var ownAvailability = false;
  var signOutRequested = false;

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
    var publishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
    var forbidden = /(sb_secret_|service_role)/i.test(key);
    return Boolean(safeUrl && publishable && !forbidden);
  }

  async function actionErrorMessage(error) {
    if (error && error.context && typeof error.context.json === 'function') {
      try {
        var response = error.context.clone ? error.context.clone() : error.context;
        var payload = await response.json();
        if (payload && typeof payload.message === 'string') return payload.message.slice(0, 500);
      } catch (ignored) { /* Odpowiedź bramy nie zawsze jest JSON. */ }
    }
    return errorMessage(error);
  }

  function viewContext() {
    return { sequence: viewSequence, userId: currentUser && currentUser.id, organizationId: currentOrganizationId };
  }

  function isCurrentView(context) {
    return Boolean(currentUser && context && context.sequence === viewSequence &&
      context.userId === currentUser.id && context.organizationId === currentOrganizationId);
  }

  function rememberedOrganization(value) {
    try {
      if (value === null) window.sessionStorage.removeItem('ratownik_internal_org');
      else if (value !== undefined) window.sessionStorage.setItem('ratownik_internal_org', value);
      else return window.sessionStorage.getItem('ratownik_internal_org');
    } catch (ignored) { /* Zablokowany storage nie może blokować panelu. */ }
    return '';
  }

  function clearLists() {
    ['responderList', 'organizationList', 'incidentList'].forEach(function (id) { $(id).replaceChildren(); });
    ['responderMetric', 'incidentMetric', 'organizationMetric', 'attentionMetric', 'lastRefresh'].forEach(function (id) { $(id).textContent = '—'; });
    $('responderCountBadge').textContent = 'BRAK AKTUALNYCH DANYCH';
    counters = { responders: 0, availableResponders: 0, incidents: 0, organizations: 0, attention: 0 };
  }

  function updateConnectionBadge() {
    var badge = $('connectionBadge');
    if (!badge) return;
    if (!navigator.onLine) {
      badge.textContent = 'OFFLINE';
      badge.className = 'badge offline';
      setHidden('offlineNotice', false);
      $('openAlertButton').disabled = true;
      return;
    }
    setHidden('offlineNotice', true);
    $('openAlertButton').disabled = !currentUser || !currentOrganizationId;
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

  function responderMembershipForCurrentOrganization() {
    return memberships.find(function (membership) {
      return membership.active &&
        membership.role === 'responder' &&
        membership.organization_id === currentOrganizationId;
    }) || null;
  }

  function updatePushInterface() {
    var membership = responderMembershipForCurrentOrganization();
    var button = $('enablePushButton');
    var status = $('pushStatus');
    $('availabilityButton').hidden = !membership;
    button.hidden = !membership;
    if (!membership) {
      status.textContent = 'dostępne dla ratownika';
      $('availabilityStatus').textContent = 'dotyczy ratowników';
      return;
    }
    if (!text(CONFIG.vapidPublicKey).trim()) {
      button.disabled = true;
      status.textContent = 'brak klucza VAPID';
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      button.disabled = true;
      status.textContent = 'telefon nie obsługuje PUSH';
      return;
    }
    button.disabled = false;
    button.textContent = 'WŁĄCZ PUSH';
    status.textContent = Notification.permission === 'granted'
      ? 'zgoda udzielona — zarejestruj telefon'
      : Notification.permission === 'denied'
        ? 'zablokowane w ustawieniach'
        : 'niewłączone';
  }

  function updateRoleInterface() {
    var role = highestRole();
    $('roleBadge').textContent = roleLabel(role);
    document.querySelectorAll('.admin-only').forEach(function (element) {
      element.hidden = !canManageCurrentOrganization();
    });
    updatePushInterface();
  }

  function clearProtectedInterface() {
    refreshSequence += 1;
    viewSequence += 1;
    currentSession = null;
    currentUser = null;
    profile = null;
    memberships = [];
    organizations = [];
    currentOrganizationId = '';
    locationSnapshot = null;
    alertDraft = null;
    clearLists();
    if ($('alertDialog').open) $('alertDialog').close();
    ['inviteResponderForm', 'organizationForm', 'alertForm', 'loginForm'].forEach(function (id) { $(id).reset(); });
    ['userDisplayName', 'userEmail', 'inviteStatus', 'organizationStatus', 'alertStatus', 'panelStatus'].forEach(function (id) { $(id).textContent = ''; });
    $('toast').hidden = true;
    $('organizationSelect').replaceChildren();
    rememberedOrganization(null);
    setAlertFieldsDisabled(false);
    setHidden('internalApp', true);
    setHidden('accessDeniedSection', true);
    updateConnectionBadge();
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    var form = event.currentTarget;
    if (!navigator.onLine || !client) {
      setStatus('loginStatus', 'Logowanie wymaga połączenia z internetem.', 'error');
      return;
    }
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
    signOutRequested = true;
    authEventSequence += 1;
    clearProtectedInterface();
    setHidden('loginSection', false);
    setHidden('retrySignOutButton', true);
    try {
      var result = await withTimeout(client.auth.signOut({ scope: 'local' }), 12000, 'Nie można potwierdzić wylogowania.');
      if (result.error) throw result.error;
      if ('serviceWorker' in navigator) {
        var registration = await navigator.serviceWorker.getRegistration(new URL('../', window.location.href).href);
        if (registration && registration.pushManager) {
          var subscription = await registration.pushManager.getSubscription();
          if (subscription) await withTimeout(subscription.unsubscribe(), 8000, 'Nie można potwierdzić wyłączenia PUSH.');
        }
        if (registration && registration.getNotifications) {
          (await registration.getNotifications()).forEach(function (notification) { notification.close(); });
        }
      }
      showToast('Wylogowano. Dane panelu zostały usunięte z widoku.');
    } catch (error) {
      setStatus('loginStatus', 'Widok wyczyszczony. Nie udało się potwierdzić wylogowania lub wyłączenia PUSH. Sprawdź połączenie i wyloguj ponownie.', 'error');
      setHidden('retrySignOutButton', false);
    } finally {
      $('loginButton').disabled = false;
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
    viewSequence += 1;
    var sequence = ++refreshSequence;
    currentSession = session;
    currentUser = session.user;
    setHidden('loginSection', true);
    setHidden('configurationNotice', true);
    setHidden('internalApp', true);
    clearLists();
    try {
      var responses = await Promise.all([
        client.from('profiles').select('user_id,display_name,active').eq('user_id', currentUser.id).eq('active', true).maybeSingle(),
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

      if (!profile || !memberships.length || !organizations.length) {
        setHidden('internalApp', true);
        setHidden('accessDeniedSection', false);
        return;
      }

      var membershipOrganizationIds = memberships.map(function (membership) {
        return membership.organization_id;
      });
      var remembered = rememberedOrganization();
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
      updateConnectionBadge();
      await refreshAll();
    } catch (error) {
      if (sequence !== refreshSequence) return;
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
    if (signOutRequested) return;
    if (currentUser && currentUser.id === session.user.id && memberships.length) {
      currentSession = session;
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

  async function loadResponders(context) {
    context = context || viewContext();
    var result = await client
      .from('memberships')
      .select('id,user_id,organization_id,role,active,profiles!inner(display_name,active),responder_profiles(available,competencies)')
      .eq('organization_id', context.organizationId)
      .eq('role', 'responder')
      .eq('active', true)
      .eq('profiles.active', true)
      .order('created_at', { ascending: true });
    if (!isCurrentView(context)) return;
    if (result.error) throw result.error;
    var rows = result.data || [];
    var own = rows.find(function (row) { return row.user_id === context.userId; });
    var ownResponder = own && one(own.responder_profiles);
    ownAvailability = Boolean(ownResponder && ownResponder.available);
    $('availabilityButton').textContent = ownAvailability ? 'JESTEM DOSTĘPNY — ZMIEŃ' : 'ZGŁOŚ GOTOWOŚĆ';
    $('availabilityStatus').textContent = ownAvailability ? 'otrzymujesz alarmy w tej jednostce' : 'gotowość niepotwierdzona';
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

  async function loadOrganizations(context) {
    context = context || viewContext();
    var result = await client
      .from('organizations')
      .select('id,parent_id,name,code,kind,active')
      .eq('active', true)
      .order('name');
    if (!isCurrentView(context)) return;
    if (result.error) throw result.error;
    organizations = result.data || [];
    counters.organizations = organizations.length;
    renderOrganizationSelector();
    context.organizationId = currentOrganizationId;
    updateRoleInterface();
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

  async function loadIncidents(context) {
    context = context || viewContext();
    var since = new Date();
    since.setDate(since.getDate() - 30);
    var result = await client
      .from('incidents')
      .select('id,incident_type,place_description,status,notification_mode,created_at,created_by,latitude,longitude')
      .eq('organization_id', context.organizationId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (!isCurrentView(context)) return;
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
            escapeHtml(incident.status || 'utworzony') + '</span></div>' + incidentLocationLink(incident) + '</div><small>' +
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

  function incidentLocationLink(incident) {
    if (incident.latitude === null || incident.longitude === null) return '';
    var latitude = Number(incident.latitude);
    var longitude = Number(incident.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return '';
    return '<a class="button secondary" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=' + latitude + ',' + longitude + '">OTWÓRZ LOKALIZACJĘ</a>';
  }

  async function changeAvailability() {
    var membership = responderMembershipForCurrentOrganization();
    if (!membership || !navigator.onLine) return;
    var context = viewContext();
    $('availabilityButton').disabled = true;
    try {
      var result = await client.from('responder_profiles').update({
        available: !ownAvailability,
        last_confirmed_at: new Date().toISOString()
      }).eq('membership_id', membership.id).select('membership_id').single();
      if (result.error) throw result.error;
      if (isCurrentView(context)) await refreshAll();
    } catch (error) {
      if (isCurrentView(context)) showToast('Nie udało się zmienić gotowości: ' + errorMessage(error));
    } finally {
      $('availabilityButton').disabled = false;
    }
  }

  async function refreshAll() {
    if (!client || !currentOrganizationId) return;
    viewSequence += 1;
    var context = viewContext();
    clearLists();
    $('refreshButton').disabled = true;
    setStatus('panelStatus', 'Odświeżam dane jednostki…');
    try {
      await loadOrganizations(context);
      if (!isCurrentView(context)) return;
      if (!currentOrganizationId) {
        clearProtectedInterface();
        setHidden('accessDeniedSection', false);
        return;
      }
      await Promise.all([loadResponders(context), loadIncidents(context)]);
      if (!isCurrentView(context)) return;
      renderMetrics();
      setStatus('panelStatus', '');
    } catch (error) {
      if (!isCurrentView(context)) return;
      viewSequence += 1;
      clearLists();
      $('refreshButton').disabled = false;
      setStatus('panelStatus', 'Nie udało się pobrać aktualnych danych: ' + errorMessage(error) + '. Użyj Odśwież po odzyskaniu połączenia.', 'error');
    } finally {
      if (context.sequence === viewSequence) $('refreshButton').disabled = false;
      updateConnectionBadge();
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
    var context = viewContext();
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
          organizationId: context.organizationId,
          displayName: text(data.get('displayName')).trim(),
          email: text(data.get('email')).trim().toLowerCase(),
          phoneE164: text(data.get('phone')).trim() || null,
          competencies: competencies
        }
      });
      if (!isCurrentView(context)) return;
      if (result.error) throw result.error;
      setStatus('inviteStatus', 'Zaproszenie utworzone i rola ratownika przypisana. Osoba musi potwierdzić e-mail, aby się zalogować.', 'success');
      form.reset();
      await refreshAll();
    } catch (error) {
      var message = await actionErrorMessage(error);
      if (isCurrentView(context)) setStatus('inviteStatus', 'Nie udało się dodać ratownika: ' + message, 'error');
    } finally {
      form.querySelector('button[type="submit"]').disabled = false;
    }
  }

  async function createOrganization(event) {
    event.preventDefault();
    if (!canManageCurrentOrganization()) return;
    var context = viewContext();
    var form = event.currentTarget;
    var data = new FormData(form);
    setStatus('organizationStatus', 'Zapisuję jednostkę…');
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      var result = await client.from('organizations').insert({
        parent_id: context.organizationId,
        created_by: context.userId,
        name: text(data.get('name')).trim(),
        code: text(data.get('code')).trim().toUpperCase(),
        kind: text(data.get('kind')),
        active: true
      }).select('id').single();
      if (!isCurrentView(context)) return;
      if (result.error) throw result.error;
      setStatus('organizationStatus', 'Jednostka została dodana.', 'success');
      form.reset();
      await refreshAll();
    } catch (error) {
      if (isCurrentView(context)) setStatus('organizationStatus', 'Nie udało się dodać jednostki: ' + errorMessage(error), 'error');
    } finally {
      form.querySelector('button[type="submit"]').disabled = false;
    }
  }

  function openAlertDialog() {
    if (!currentUser || !currentOrganizationId) return;
    if (alertDraft && alertDraft.submitting) {
      showToast('Poprzedni alarm jest jeszcze przetwarzany. Sprawdź jego wynik w historii.');
      return;
    }
    if (!navigator.onLine) {
      showToast('Alarmowanie wymaga połączenia z internetem. Zadzwoń pod 112 i użyj obowiązującej ścieżki służbowej.');
      return;
    }
    $('alertForm').reset();
    setAlertFieldsDisabled(false);
    alertDraft = { context: viewContext(), key: idempotencyKey(), payload: null, submitting: false, completed: false };
    locationSnapshot = null;
    $('locationStatus').textContent = 'Lokalizacja niepobrana';
    setStatus('alertStatus', '');
    $('sendAlertButton').disabled = true;
    $('sendAlertButton').textContent = 'URUCHOM ALARM';
    var organization = organizations.find(function (item) { return item.id === currentOrganizationId; });
    $('alertOrganizationName').textContent = organization ? organization.name : 'Wybrana jednostka';
    $('alertModeNotice').textContent = CONFIG.notificationMode === 'production'
      ? 'Tryb produkcyjny: po potwierdzeniu funkcja serwerowa może wysłać PUSH i dodatkowy SMS.'
      : 'Tryb testowy: alarm zostanie zapisany, ale PUSH ani SMS nie zostaną wysłane.';
    $('alertDialog').showModal();
  }

  function closeAlertDialog() {
    $('alertDialog').close();
  }

  function getLocation() {
    var draft = alertDraft;
    if (!draft || draft.payload) return;
    if (!navigator.geolocation) {
      $('locationStatus').textContent = 'GPS niedostępny — wpisz miejsce ręcznie';
      return;
    }
    $('getLocationButton').disabled = true;
    $('locationStatus').textContent = 'Pobieram lokalizację…';
    navigator.geolocation.getCurrentPosition(function (position) {
      if (alertDraft !== draft || !isCurrentView(draft.context)) return;
      locationSnapshot = {
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
        accuracyMeters: Math.round(position.coords.accuracy)
      };
      $('locationStatus').textContent = 'GPS zapisany · dokładność około ' + locationSnapshot.accuracyMeters + ' m';
      $('getLocationButton').disabled = false;
    }, function () {
      if (alertDraft !== draft || !isCurrentView(draft.context)) return;
      locationSnapshot = null;
      $('locationStatus').textContent = 'Nie udało się pobrać GPS — wpisz miejsce ręcznie';
      $('getLocationButton').disabled = false;
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 15000
    });
  }

  function vapidKeyBytes(value) {
    var normalized = text(value).trim().replace(/-/g, '+').replace(/_/g, '/');
    var padding = '='.repeat((4 - normalized.length % 4) % 4);
    var decoded = window.atob(normalized + padding);
    return Uint8Array.from(decoded, function (character) { return character.charCodeAt(0); });
  }

  async function enablePushNotifications() {
    var membership = responderMembershipForCurrentOrganization();
    if (!membership) {
      showToast('Powiadomienia PUSH może włączyć aktywny ratownik w swojej jednostce.');
      return;
    }
    if (!navigator.onLine) {
      showToast('Włączenie PUSH wymaga połączenia z internetem.');
      return;
    }

    var button = $('enablePushButton');
    var context = viewContext();
    button.disabled = true;
    $('pushStatus').textContent = 'konfiguruję…';
    try {
      var permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Nie udzielono zgody na powiadomienia.');
      }

      var scopeUrl = new URL('../', window.location.href).href;
      var registration = await navigator.serviceWorker.getRegistration(scopeUrl);
      if (!registration) {
        registration = await navigator.serviceWorker.register('../sw.js', { scope: '../' });
      }
      if (!registration.active) {
        registration = await withTimeout(navigator.serviceWorker.ready, 10000, 'Uruchomienie obsługi PUSH trwa zbyt długo. Spróbuj ponownie.');
      }

      var subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(CONFIG.vapidPublicKey)
        });
      }

      var result = await client.functions.invoke('manage-push-subscription', {
        body: {
          membershipId: membership.id,
          subscription: subscription.toJSON()
        }
      });
      if (!isCurrentView(context)) {
        await subscription.unsubscribe();
        return;
      }
      if (result.error) throw result.error;
      $('pushStatus').textContent = 'włączone i zapisane';
      button.textContent = 'PUSH WŁĄCZONE';
      showToast('Ten telefon będzie mógł otrzymywać alarmy PUSH dla wybranej jednostki.');
    } catch (error) {
      var message = await actionErrorMessage(error);
      if (!isCurrentView(context)) {
        if (subscription) await subscription.unsubscribe().catch(function () {});
        return;
      }
      $('pushStatus').textContent = Notification.permission === 'denied'
        ? 'zablokowane w ustawieniach'
        : 'nie udało się włączyć';
      showToast('PUSH nie został włączony: ' + message);
      button.disabled = false;
    }
  }

  function idempotencyKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    if (!window.crypto || !window.crypto.getRandomValues) return null;
    var bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function setAlertFieldsDisabled(disabled) {
    $('alertForm').querySelectorAll('input,select,textarea').forEach(function (field) { field.disabled = disabled; });
    $('getLocationButton').disabled = disabled;
  }

  function alertOutcome(response) {
    var count = Number.isInteger(response.recipientCount) ? ' Odbiorcy: ' + response.recipientCount + '.' : '';
    if (response.mode === 'simulation' && response.status === 'simulated') {
      return { message: 'Symulacja zapisana. Nie wysłano PUSH ani SMS.' + count, type: 'success' };
    }
    if (response.mode === 'production' && response.status === 'sent') {
      return { message: 'Bramy przyjęły powiadomienia.' + count + ' To nie potwierdza dotarcia ani reakcji ratownika.', type: 'success' };
    }
    if (response.status === 'partial') return { message: 'Nie wszystkie kanały mają potwierdzony wynik. Sprawdź historię; użyj 112 i ścieżki służbowej.', type: 'error' };
    if (response.status === 'failed') return { message: 'Alarm nie został skutecznie wysłany. Użyj 112 i ścieżki służbowej.', type: 'error' };
    return { message: 'Wynik alarmu nie jest jeszcze potwierdzony. Sprawdź historię; nie zakładaj, że pomoc została wezwana.', type: 'error' };
  }

  async function dispatchAlert(event) {
    event.preventDefault();
    var draft = alertDraft;
    if (!draft || draft.submitting || draft.completed || !isCurrentView(draft.context)) return;
    if (!$('alertConfirm').checked || !currentOrganizationId) return;
    if (!navigator.onLine || !draft.key) {
      setStatus('alertStatus', 'Brak połączenia lub bezpiecznej obsługi alarmu. Użyj 112 i ścieżki służbowej.', 'error');
      return;
    }
    var form = event.currentTarget;
    if (!draft.payload) {
      var data = new FormData(form);
      draft.payload = {
        idempotencyKey: draft.key,
        organizationId: draft.context.organizationId,
        expectedMode: CONFIG.notificationMode === 'production' ? 'production' : 'simulation',
        incidentType: text(data.get('incidentType')),
        placeDescription: text(data.get('place')).trim(),
        note: text(data.get('note')).trim() || null,
        location: locationSnapshot
      };
    }
    draft.submitting = true;
    setAlertFieldsDisabled(true);
    $('sendAlertButton').disabled = true;
    setStatus('alertStatus', 'Weryfikuję uprawnienia i uruchamiam alarm…');
    try {
      var result = await client.functions.invoke('dispatch-responder-alert', {
        body: draft.payload
      });
      if (alertDraft !== draft || !isCurrentView(draft.context)) return;
      if (result.error) throw result.error;
      var response = result.data || {};
      var outcome = alertOutcome(response);
      draft.completed = true;
      setStatus('alertStatus', outcome.message, outcome.type);
      showToast(outcome.message);
      await loadIncidents(draft.context);
      if (isCurrentView(draft.context)) renderMetrics();
    } catch (error) {
      var message = await actionErrorMessage(error);
      if (alertDraft !== draft || !isCurrentView(draft.context)) return;
      setStatus('alertStatus', 'Nie można potwierdzić wyniku: ' + message + '. Ponowienie sprawdzi ten sam alarm. W razie zagrożenia dzwoń 112.', 'error');
      $('sendAlertButton').textContent = 'SPRAWDŹ / PONÓW TEN ALARM';
      $('sendAlertButton').disabled = false;
    } finally {
      draft.submitting = false;
    }
  }

  function bindEvents() {
    $('loginForm').addEventListener('submit', sendMagicLink);
    $('signOutButton').addEventListener('click', signOut);
    $('deniedSignOutButton').addEventListener('click', signOut);
    $('retrySignOutButton').addEventListener('click', signOut);
    $('refreshButton').addEventListener('click', refreshAll);
    $('enablePushButton').addEventListener('click', enablePushNotifications);
    $('availabilityButton').addEventListener('click', changeAvailability);
    $('retryConnectionButton').addEventListener('click', function () { window.location.reload(); });
    $('organizationSelect').addEventListener('change', function (event) {
      currentOrganizationId = event.target.value;
      rememberedOrganization(currentOrganizationId);
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
      $('sendAlertButton').disabled = !event.target.checked || !alertDraft || alertDraft.submitting || alertDraft.completed;
    });
    $('alertForm').addEventListener('submit', dispatchAlert);
    $('alertDialog').addEventListener('cancel', function (event) {
      event.preventDefault();
      closeAlertDialog();
    });
    window.addEventListener('online', updateConnectionBadge);
    window.addEventListener('offline', updateConnectionBadge);
  }

  function withTimeout(promise, milliseconds, message) {
    var timer;
    return Promise.race([promise, new Promise(function (resolve, reject) {
      timer = window.setTimeout(function () { reject(new Error(message)); }, milliseconds);
    })]).finally(function () { window.clearTimeout(timer); });
  }

  function loadAuthSdk() {
    if (window.supabase && typeof window.supabase.createClient === 'function') return Promise.resolve();
    return withTimeout(new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.min.js';
      script.integrity = 'sha384-yiVMs0R/Jyz7OhoXa/DsEMUSBLjEhr/QJta2ONO+zB6I8/GmNg/7AUFrZmAJV7KV';
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Nie można pobrać modułu logowania. Sprawdź połączenie.')); };
      document.head.appendChild(script);
    }), 10000, 'Połączenie z modułem logowania trwa zbyt długo. Spróbuj ponownie.');
  }

  async function boundedFetch(url, options) {
    var settings = Object.assign({}, options || {});
    var controller = new AbortController();
    var previousSignal = settings.signal;
    function abort() { controller.abort(); }
    if (previousSignal) {
      if (previousSignal.aborted) abort();
      else previousSignal.addEventListener('abort', abort, { once: true });
    }
    var timer = window.setTimeout(abort, 20000);
    settings.signal = controller.signal;
    settings.cache = 'no-store';
    try { return await window.fetch(url, settings); }
    finally {
      window.clearTimeout(timer);
      if (previousSignal) previousSignal.removeEventListener('abort', abort);
    }
  }

  async function boot() {
    bindEvents();
    updateConnectionBadge();

    // Zaproszenie administratora nie jest przepływem PKCE. Własny link e-mail
    // przenosi jednorazowy token_hash, który weryfikujemy w Auth, nie w interfejsie.
    var callbackUrl = new URL(window.location.href);
    var tokenHash = callbackUrl.searchParams.get('token_hash');
    var tokenType = callbackUrl.searchParams.get('type');
    if (tokenHash) {
      callbackUrl.searchParams.delete('token_hash');
      callbackUrl.searchParams.delete('type');
      window.history.replaceState(null, '', callbackUrl.pathname + callbackUrl.search + callbackUrl.hash);
    }
    if (!isConfigured()) {
      setHidden('configurationNotice', false);
      setHidden('loginSection', true);
      return;
    }

    setHidden('loginSection', false);
    $('loginButton').disabled = true;
    setStatus('loginStatus', 'Łączę z modułem logowania…');
    try {
      if (!navigator.onLine) throw new Error('Logowanie wymaga internetu. Procedury i narzędzia są dostępne w aplikacji publicznej.');
      await loadAuthSdk();
    } catch (error) {
      setStatus('loginStatus', errorMessage(error), 'error');
      setHidden('retryConnectionButton', false);
      return;
    }

    client = window.supabase.createClient(
      text(CONFIG.supabaseUrl).trim(),
      text(CONFIG.supabasePublishableKey).trim(),
      {
        global: { fetch: boundedFetch },
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      }
    );
    $('loginButton').disabled = false;
    setStatus('loginStatus', '');
    updateConnectionBadge();

    var callbackError = null;
    if (tokenHash) {
      try {
        if (tokenType !== 'invite' && tokenType !== 'email') throw new Error('Nieobsługiwany link logowania.');
        var verification = await client.auth.verifyOtp({ token_hash: tokenHash, type: tokenType });
        if (verification.error) throw verification.error;
      } catch (error) {
        callbackError = error;
      }
    }

    client.auth.onAuthStateChange(function (event, session) {
      var sequence = ++authEventSequence;
      if (event === 'SIGNED_OUT') {
        handleSession(null);
      } else if (session && (!currentSession || currentSession.access_token !== session.access_token)) {
        window.setTimeout(function () {
          if (sequence === authEventSequence) handleSession(session);
        }, 0);
      }
    });

    try {
      if (callbackError) throw callbackError;
      var initialSequence = authEventSequence;
      var result = await client.auth.getSession();
      if (initialSequence !== authEventSequence) return;
      if (result.error) throw result.error;
      await handleSession(result.data.session);
    } catch (error) {
      setHidden('loginSection', false);
      setStatus('loginStatus', 'Nie udało się uruchomić logowania: ' + errorMessage(error), 'error');
    }
  }

  boot();
}());

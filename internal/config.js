'use strict';

/*
 * Ten plik może zawierać wyłącznie publiczny adres projektu i klucz publikowalny.
 * Nigdy nie wpisuj tutaj sb_secret_..., service_role, tokenu SMS ani klucza PUSH.
 */
window.RATOWNIK_INTERNAL_CONFIG = Object.freeze({
  supabaseUrl: '',
  supabasePublishableKey: '',
  vapidPublicKey: '',
  environment: 'test',
  notificationMode: 'simulation'
});

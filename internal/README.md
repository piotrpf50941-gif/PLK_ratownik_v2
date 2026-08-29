# Ratownik PLK — panel wewnętrzny

Ten katalog zawiera uwierzytelnioną część aplikacji: jednostki, ratowników, alarmowanie i panel administracyjny. Kod interfejsu jest publiczny, ale dane są pobierane dopiero po zalogowaniu i przejściu polityk RLS w bazie.

## Stan tego etapu

- logowanie jednorazowym linkiem e-mail dla wcześniej zaproszonych kont;
- profile, jednostki i role: pracownik, ratownik, administrator jednostki, administrator systemu;
- dashboard jednostki;
- lista ratowników bez ujawniania numerów telefonów w przeglądarce;
- zapraszanie ratownika przez chronioną Edge Function;
- alarm z dwustopniowym potwierdzeniem, GPS i kluczem idempotencji;
- tryb simulation, który zapisuje alarm i audyt, ale niczego nie wysyła;
- rejestracja urządzenia PUSH dostępna wyłącznie dla zalogowanego ratownika;
- adaptery PUSH/SMS uruchamiane wyłącznie po stronie funkcji serwerowej;
- brak danych osobowych i sekretów w repozytorium.

## 1. Utwórz środowisko testowe Supabase

Najpierw utwórz osobny projekt test. Projektu produkcyjnego nie podłączaj przed zatwierdzeniem klasyfikacji danych, hostingu, SSO oraz dostawców wiadomości.

W katalogu repozytorium:

    supabase login
    supabase link --project-ref TWOJ_PROJECT_REF
    supabase migration new internal_platform

Skopiuj zawartość pliku supabase/internal-platform.sql do utworzonego pliku migracji, a następnie wykonaj:

    supabase db reset
    supabase db lint
    supabase db push

Po wdrożeniu otwórz w Supabase Security Advisor i Performance Advisor. Każde ostrzeżenie dotyczące RLS lub funkcji uprzywilejowanych musi zostać sprawdzone przed użyciem danych rzeczywistych.

## 2. Skonfiguruj logowanie

W Supabase Auth:

1. wyłącz publiczne samodzielne zakładanie kont;
2. pozostaw zaproszenia i logowanie e-mail OTP/Magic Link;
3. ustaw adres aplikacji wewnętrznej jako dozwolony Redirect URL;
4. dla pilota skonfiguruj zatwierdzony serwer SMTP;
5. produkcyjnie podłącz firmowy Microsoft Entra ID/OIDC, jeżeli dopuści to polityka PKP PLK.

Panel wysyła shouldCreateUser: false, więc nie tworzy konta przez samo wpisanie e-maila.

## 3. Dodaj pierwszego administratora

Pierwsze konto i pierwsze uprawnienie tworzy właściciel bazy w SQL Editor. Nie twórz roli z poziomu user_metadata.

Przykład z wartościami zastępczymi:

    insert into public.organizations (name, code, kind, created_by)
    values ('PKP Polskie Linie Kolejowe S.A.', 'PKP-PLK', 'company', 'UUID_ADMINA')
    returning id;

    insert into public.profiles (user_id, display_name)
    values ('UUID_ADMINA', 'Administrator systemu');

    insert into public.memberships (
      user_id, organization_id, role, active, approved_by, approved_at
    )
    values (
      'UUID_ADMINA',
      'UUID_ORGANIZACJI',
      'system_admin',
      true,
      'UUID_ADMINA',
      now()
    );

UUID administratora odczytaj z Authentication → Users. Po tym kroku kolejnych ratowników można zapraszać z panelu.

## 4. Podłącz publiczny klucz panelu

Skopiuj internal/config.example.js do internal/config.js i wpisz:

- adres projektu https://...supabase.co;
- wyłącznie klucz sb_publishable_...;
- publiczny klucz VAPID zgodny z zatwierdzoną bramą PUSH;
- environment: test;
- notificationMode: simulation.

Klucz publikowalny może znajdować się w przeglądarce, ponieważ ochronę danych realizują RLS i funkcje serwerowe. Nigdy nie wpisuj do tego pliku sb_secret_..., service_role, tokenu dostawcy SMS ani prywatnego klucza PUSH.

## 5. Wdróż funkcje

Najpierw ustaw tryb bez wysyłki:

    supabase secrets set NOTIFICATION_MODE=simulation
    supabase secrets set INTERNAL_APP_URL=https://TWOJ-ADRES/internal/
    supabase functions deploy dispatch-responder-alert
    supabase functions deploy manage-responder
    supabase functions deploy manage-push-subscription

Funkcje mają włączone verify_jwt. Ratownik rejestruje subskrypcję PUSH przyciskiem WŁĄCZ PUSH; endpoint i klucze subskrypcji trafiają do prywatnego schematu bazy, a nie do publicznego API.

Funkcje Dodatkowo same ponownie sprawdzają użytkownika, rolę i zakres jednostki.

## 6. Test alarmu bez SMS

1. Zaloguj się kontem pracownika przypisanym do jednostki.
2. Wybierz WEZWIJ RATOWNIKÓW.
3. Wpisz testowe miejsce oznaczone słowem TEST.
4. Potwierdź alarm.
5. Sprawdź incidents, alert_recipients, delivery_attempts i audit_log.
6. Status powinien mieć wartość simulated. Żadne żądanie do dostawcy PUSH/SMS nie powinno wyjść.

## 7. Produkcyjne PUSH/SMS

Produkcję można włączyć dopiero po zatwierdzeniu dostawcy, umowy powierzenia danych, retencji, limitów, ponowień i procedury awaryjnej. Sekrety ustawiane są wyłącznie w środowisku Edge Functions:

- NOTIFICATION_MODE=production;
- PUSH_WEBHOOK_URL, PUSH_WEBHOOK_TOKEN;
- SMS_WEBHOOK_URL, SMS_WEBHOOK_TOKEN.

Adapter wysyła do zatwierdzonej bramy komunikat zawierający jednostkę, rodzaj zdarzenia, miejsce, identyfikator alarmu i opcjonalny odnośnik GPS. Nie przesyła notatki opisowej. Wynik każdej próby zapisuje w delivery_attempts.

## Ważna granica

GitHub Pages może służyć jako demonstracyjny adres ekranu logowania, lecz produkcyjna część wewnętrzna powinna otrzymać osobne wdrożenie HTTPS i domenę. Publiczny Service Worker nie buforuje tras panelu ani odpowiedzi Supabase.

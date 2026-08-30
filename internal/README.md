# Ratownik PLK — panel wewnętrzny

Ten katalog zawiera uwierzytelnioną część aplikacji: jednostki, ratowników, alarmowanie i panel administracyjny. Kod interfejsu jest publiczny, ale dane są pobierane dopiero po zalogowaniu i przejściu polityk RLS w bazie.

## Stan tego etapu

- logowanie jednorazowym linkiem e-mail dla wcześniej zaproszonych kont;
- profile, jednostki i role: pracownik, ratownik, koordynator jednostki, administrator (zachowane kody `unit_admin` i `system_admin`);
- dashboard jednostki;
- lista ratowników bez ujawniania numerów telefonów w przeglądarce;
- zapraszanie ratownika przez chronioną Edge Function;
- alarm z dwustopniowym potwierdzeniem, GPS i kluczem idempotencji;
- tryb simulation, który zapisuje alarm i audyt, ale niczego nie wysyła;
- rejestracja urządzenia PUSH dostępna wyłącznie dla zalogowanego ratownika;
- potwierdzanie własnej gotowości do odbierania alarmów;
- adaptery PUSH/SMS uruchamiane wyłącznie po stronie funkcji serwerowej;
- brak danych osobowych i sekretów w repozytorium.

ETAP A dodaje walidowaną hierarchię `company → zlk → section → workplace`, katalog ról, widoki sekcji i wielu przypisań, model podstawowego/aktualnego miejsca pracy oraz audyt zmian jednostek i przypisań. Uprawnienia są sprawdzane dla całej aktywnej ścieżki. Panel odświeża role po zmianie sesji; pracownik nie otrzymuje cudzej historii alarmów ani pełnego spisu profili współpracowników.

Model miejsca pracy jest gotowy po stronie bazy; formularz profilu i pełny cykl życia kont pozostają do ETAPU B. Szczegóły: [raport ETAPU A](../docs/ETAP_A_JEDNOSTKI.md). Brak skonfigurowanego backendu nie jest zastępowany pozornym logowaniem lub danymi pracowników w plikach JSON.

## 1. Utwórz środowisko testowe Supabase

Najpierw utwórz osobny projekt test. Projektu produkcyjnego nie podłączaj przed zatwierdzeniem klasyfikacji danych, hostingu, SSO oraz dostawców wiadomości.

Blueprint SQL jest przeznaczony dla pustego projektu testowego. Nie uruchamiaj go jako zamiennika migracji istniejącej bazy z danymi. Nie wykonuj resetu bazy zdalnej. Polecenie `db reset` poniżej dotyczy wyłącznie lokalnego środowiska Docker uruchomionego przez Supabase CLI; usuwa jego dane testowe.

Wymagany PostgreSQL 15+ (`security_invoker` dla widoków). Kontrola wstępna zatrzymuje blueprint przy niezgodnej starej hierarchii lub przypisaniu administratora systemu poza organizacją główną. Nie wyłączaj walidacji w celu wdrożenia: sprawdź dane i przygotuj migrację przyrostową. Nowe funkcje i panel wymagają SQL z RPC `organization_access`; wdrażaj najpierw bazę, potem funkcje, na końcu panel.

W katalogu repozytorium:

    supabase login
    supabase link --project-ref TWOJ_PROJECT_REF
    supabase migration new internal_platform

Skopiuj zawartość pliku supabase/internal-platform.sql do utworzonego pliku migracji, a następnie wykonaj:

    supabase start
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

### Ważne: szablony wiadomości

Zwykłe zaproszenie administratora nie korzysta z PKCE. Aby przyjęcie zaproszenia działało również na telefonie, w **Auth → Email Templates → Invite user** umieść odnośnik:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=invite">Przyjmij zaproszenie do Ratownika PLK</a>
```

W **Magic Link** użyj analogicznego odnośnika z `type=email`. Panel wymienia jednorazowy token przez `auth.verifyOtp` i usuwa token z adresu przed pobieraniem danych. `INTERNAL_APP_URL` i Redirect URL muszą wskazywać dokładnie katalog `/internal/` (bez własnego query string).

Podstawa konfiguracji: [Supabase — logowanie e-mail](https://supabase.com/docs/guides/auth/auth-email-passwordless) i [szablony wiadomości](https://supabase.com/docs/guides/auth/auth-email-templates). Nie wpisuj tokenów ani haseł do repozytorium lub rozmowy.

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

Funkcje dodatkowo sprawdzają użytkownika, aktywność profilu, rolę i zakres jednostki. Tryb `notificationMode` panelu musi zgadzać się z `NOTIFICATION_MODE` serwera; niezgodność blokuje alarm, zanim nastąpi wysyłka.

Wszystkie trzy funkcje korzystają z tego samego RPC zakresu co RLS. Nieaktywny zakład odcina również aktywne przypisania do jego sekcji. `organization_access` zwraca tylko dwa wskaźniki dla bieżącego użytkownika; nie jest uprzywilejowanym RPC do odczytu danych innych osób.

## 6. Test alarmu bez SMS

1. Zaloguj się testowym ratownikiem, zgłoś gotowość i skonfiguruj testowy kanał kontaktu. Nowo zaproszona osoba nie jest automatycznie uznawana za dostępną.
2. Zaloguj się kontem pracownika przypisanym do tej jednostki.
3. Wybierz WEZWIJ RATOWNIKÓW.
4. Wpisz testowe miejsce oznaczone słowem TEST i potwierdź alarm.
5. Sprawdź incidents, alert_recipients, delivery_attempts i audit_log.
6. Status powinien mieć wartość simulated. Żadne żądanie do dostawcy PUSH/SMS nie powinno wyjść. Przy braku dostępnych odbiorców poprawnym wynikiem jest czytelny błąd, a nie komunikat o sukcesie.
7. Sprawdź drugą jednostkę: jej dane nie mogą być widoczne bez uprawnień. Wyłączony profil nie może korzystać z API mimo starego tokenu.

## 7. Produkcyjne PUSH/SMS

Produkcję można włączyć dopiero po zatwierdzeniu dostawcy, umowy powierzenia danych, retencji, limitów, ponowień i procedury awaryjnej. Sekrety ustawiane są wyłącznie w środowisku Edge Functions:

- NOTIFICATION_MODE=production;
- PUSH_WEBHOOK_URL, PUSH_WEBHOOK_TOKEN;
- SMS_WEBHOOK_URL, SMS_WEBHOOK_TOKEN.

Adapter wysyła do zatwierdzonej bramy komunikat zawierający jednostkę, rodzaj zdarzenia, miejsce, identyfikator alarmu i opcjonalny odnośnik GPS. Nie przesyła notatki opisowej. Wynik każdej próby zapisuje w delivery_attempts.

Kontrakt bramy: HTTPS, brak przekierowań, nagłówek Bearer, odpowiedź JSON `{"accepted":true,"messageId":"identyfikator-dostawcy"}`. Sam HTTP 200 nie jest potwierdzeniem. Status `sent` oznacza przyjęcie przez bramę, nie dostarczenie ani reakcję człowieka. SMS jest obecnie dodatkowym kanałem, a nie automatycznym ponowieniem po potwierdzonym braku odbioru PUSH.

PUSH w przeglądarkach Chrome/Firefox/Safari korzysta z listy dozwolonych hostów w `manage-push-subscription`; rozszerzenie o innego dostawcę wymaga przeglądu bezpieczeństwa. Ekran blokady pokazuje tylko ogólny komunikat. Lokalizacja i opis są dostępne po zalogowaniu w historii alarmów. Wylogowanie unieważnia subskrypcję na tym telefonie, a późniejsza rejestracja przenosi powiązanie urządzenia na aktualne konto.

Przed produkcją pozostają: zatwierdzenie dostawcy/retencji, kolejka wysyłkowa i monitoring utkniętych alarmów, potwierdzenia dostarczenia/reakcji, limity kosztów oraz próby na rzeczywistych urządzeniach. Nie traktuj tego etapu jako uruchomionego systemu alarmowania operacyjnego.

## Testy automatyczne bez usług zewnętrznych

```sh
npm ci --ignore-scripts
npm test
```

Test SQL używa PostgreSQL w pamięci (PGlite), a testy interfejsu i Edge Functions korzystają wyłącznie z atrap Auth/API/PUSH/SMS. Wykonują rzeczywisty kod aplikacji. Nie zastępują testu integracji na osobnym projekcie Supabase ani kontroli na fizycznym telefonie.

Po ETAPIE A zestaw obejmuje 108 kontroli SQL/RLS, 25 scenariuszy panelu oraz 26 scenariuszy funkcji serwerowych, oprócz regresji publicznej PWA, offline i mobilnego CSS. Żaden test nie wysyła rzeczywistych wiadomości.

## Ważna granica

GitHub Pages może służyć jako demonstracyjny adres ekranu logowania, lecz produkcyjna część wewnętrzna powinna otrzymać osobne wdrożenie HTTPS i domenę. Publiczny Service Worker nie buforuje tras panelu ani odpowiedzi Supabase.

Na hostingu produkcyjnym ustaw nagłówki `Cache-Control: no-store` dla części wewnętrznej i `Content-Security-Policy: frame-ancestors 'none'`. Ochrony przed osadzaniem w ramce nie da się uzyskać przez znacznik meta CSP. Standardowa sesja Supabase jest utrwalana w pamięci przeglądarki; wybór okresu ważności, SSO/MFA i zasad używania wspólnych urządzeń wymaga zatwierdzenia przed danymi rzeczywistymi.

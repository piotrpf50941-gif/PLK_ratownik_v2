# Ratownik PLK v2 — architektura rozwoju

Stan dokumentu: 29.08.2026, aplikacja 2.6.0. Kod pilota backendu i panelu wewnętrznego jest przygotowany na osobnej gałęzi; konkretny projekt Supabase i dostawcy wiadomości nie są jeszcze podłączeni.

## 1. Audyt obecnej aplikacji

Obecna wersja jest statyczną aplikacją PWA napisaną w HTML, CSS i JavaScript bez procesu kompilacji. GitHub Pages udostępnia część publiczną, a Service Worker zapisuje powłokę aplikacji, procedury i grafiki do działania offline.

Elementy, które warto zachować i rozwijać:

- interfejs mobilny i dolna nawigacja;
- procedury przechowywane w jednym, walidowanym modelu danych;
- pełnoekranowy tryb krokowy;
- metronom 110/min i ocena oddechu 2+10 s;
- GPS, generator zgłoszenia oraz demonstracyjne listy AED i apteczek;
- lokalną, demonstracyjną ocenę gotowości AED i apteczek, w tym terminy 90/60/30 dni oraz minimalne stany wyposażenia;
- lokalne preferencje, import/eksport danych demonstracyjnych;
- PWA, Service Worker i sygnalizacja dostępności aktualizacji;
- test walidacyjny oraz test logiki DOM bez zewnętrznych zależności.

Główne ograniczenia obecnej technologii:

- brak serwera, bazy użytkowników, uwierzytelnienia i autoryzacji;
- `localStorage` nie jest właściwym miejscem dla danych pracowników ani tajemnic;
- GitHub Pages jest publiczny i nie może chronić danych przez ukrywanie elementów interfejsu;
- powiadomienia PUSH i SMS wymagają zaufanej funkcji serwerowej;
- dane AED, apteczek, kontroli i terminów wymagają wspólnej bazy, historii zmian i zakresów organizacyjnych;
- Service Worker nie może bezwarunkowo buforować odpowiedzi zawierających dane chronione.

## 2. Granica publiczna i wewnętrzna

### Część publiczna — obecne repozytorium

Może działać bez logowania i offline. Zawiera procedury, „Prowadź mnie”, 112, metronom, ocenę oddechu, timery, zapis godziny, GPS oraz wyłącznie jawne albo demonstracyjne dane AED i apteczek.

Nie może zawierać danych pracowników, numerów telefonów, sekretów API, pełnych lokalizacji wewnętrznych ani mechanizmu udającego kontrolę dostępu.

### Część wewnętrzna — po uwierzytelnieniu

Obejmie profil i jednostkę użytkownika, ratowników, wewnętrzne zasoby, alarmowanie, kontrole, alerty, panel administracyjny i audyt operacji. Dane będą pobierane dopiero po zalogowaniu i sprawdzeniu uprawnień po stronie bazy/API.

Rekomendowane jest utrzymanie dwóch osobnych wdrożeń lub przynajmniej dwóch osobnych pakietów aplikacji pod różnymi adresami. Mogą korzystać ze wspólnych komponentów wizualnych, lecz publiczny Service Worker nie powinien kontrolować części wewnętrznej.

## 3. Rekomendowana architektura docelowa

Najprostszy do etapowego utrzymania wariant:

1. **Publiczna PWA** — obecny HTML/CSS/JS na GitHub Pages.
2. **Wewnętrzna PWA/panel** — osobne wdrożenie HTTPS, uruchamiane po logowaniu.
3. **Supabase Auth** — uwierzytelnienie; docelowo preferowane firmowe SSO/OIDC, jeżeli polityka PKP PLK i posiadany plan na to pozwalają.
4. **PostgreSQL** — wspólna baza jednostek, użytkowników, AED, apteczek, wyposażenia, kontroli, alertów i alarmów.
5. **Row Level Security (RLS)** — ograniczenie każdego zapytania do roli i jednostki użytkownika; samo `authenticated` nie jest autoryzacją.
6. **Edge Functions/API** — operacje uprzywilejowane: alarm, PUSH, SMS, generowanie QR, zadania cykliczne i integracje.
7. **Dostawca PUSH oraz adapter SMS** — sekrety wyłącznie po stronie funkcji serwerowych; środowisko testowe zapisuje alarm demonstracyjny, ale niczego nie wysyła.
8. **Dziennik audytowy** — kto, kiedy i w jakiej jednostce zmienił zasób, wykonał kontrolę lub uruchomił alarm.

### Stan implementacji 2.6.0

W repozytorium przygotowano katalog `internal/` z logowaniem Magic Link dla wcześniej zaproszonych kont, wyborem jednostki, rolami, dashboardem, listą ratowników i formularzem alarmu. Katalog `supabase/` zawiera schemat RLS oraz dwie Edge Functions: zapraszanie ratowników i alarmowanie.

Tryb wysyłki ma bezpieczną wartość domyślną `simulation`. W tym trybie system zapisuje incydent, odbiorców, próby dostarczenia i audyt, ale nie wywołuje dostawcy PUSH ani SMS. Zmiana na produkcję jest możliwa wyłącznie przez sekret środowiska funkcji serwerowej.

W przeglądarce może znajdować się jedynie klucz publikowalny. Klucz tajny/`service_role`, dane dostawcy SMS i klucze PUSH nie mogą trafić do repozytorium ani kodu klienta. Każda tabela dostępna przez Data API musi mieć RLS i jawnie minimalne uprawnienia. Operacje alarmowe powinny dodatkowo ponownie sprawdzać członkostwo i rolę po stronie funkcji serwerowej.

## 4. Proponowany model danych

| Obszar | Najważniejsze encje |
|---|---|
| Organizacja | `organizations` (drzewo), `workplaces`, `memberships` |
| Użytkownicy | `profiles`, `roles`, `role_scopes`, `responder_profiles` |
| Apteczki | `first_aid_kits`, `kit_items`, `kit_inspections`, `kit_item_batches` |
| AED | `aeds`, `aed_components`, `aed_inspections` |
| Alarmy | `incidents`, `alerts`, `alert_recipients`, `delivery_attempts` |
| PUSH | `push_subscriptions` |
| Kontrole | `inspection_results`, `attachments`, `audit_log` |
| Alerty terminów | `readiness_alerts`, `notification_rules` |

Każdy rekord operacyjny powinien posiadać co najmniej `organization_id`, znaczniki czasu, autora zmiany i status. Daty ważności należy przechowywać jako daty, a reguły 90/60/30 dni wyliczać w kontrolowanym zadaniu serwerowym, nie wyłącznie w przeglądarce.

## 5. Role i zasada najmniejszych uprawnień

| Rola | Zakres |
|---|---|
| Gość | tylko publiczna PWA |
| Pracownik | odczyt dozwolonych danych swojej jednostki |
| Ratownik | pracownik + odbiór alarmów dla przypisanych miejsc pracy |
| Administrator jednostki | zarządzanie zasobami i ratownikami wyłącznie w swoim zakresie |
| Administrator systemu | struktura organizacyjna i konfiguracja globalna |

Roli nie należy wyznaczać na podstawie edytowalnego przez użytkownika `user_metadata`. Źródłem uprawnień powinna być chroniona tabela członkostw/ról; ewentualne roszczenia JWT mogą być tylko przyspieszeniem i muszą uwzględniać opóźnienie odświeżenia tokenu.

## 6. Offline i dane chronione

- Procedury i narzędzia publiczne pozostają w Cache Storage i działają bez sieci.
- Po zalogowaniu można przechowywać w IndexedDB minimalne, wcześniej zsynchronizowane podsumowania AED i apteczek, z identyfikatorem użytkownika, czasem synchronizacji i terminem ważności lokalnej kopii.
- Numery telefonów, pełna lista ratowników, tokeny PUSH i dane administracyjne nie powinny być dostępne offline bez osobnej analizy ryzyka urządzeń służbowych.
- Wylogowanie, utrata uprawnień lub przekroczenie terminu ważności kopii musi usuwać dane chronione z urządzenia.
- Service Worker części publicznej nie może buforować odpowiedzi API wymagających uwierzytelnienia.

## 7. Alarmowanie

Bezpieczny przepływ docelowy:

1. użytkownik wybiera jednostkę/miejsce i rodzaj zdarzenia;
2. aplikacja pokazuje ekran potwierdzenia, lokalizację oraz kanały;
3. żądanie z unikalnym kluczem idempotencji trafia do Edge Function;
4. funkcja ponownie weryfikuje sesję, rolę i zakres organizacyjny;
5. zapisuje incydent i listę odbiorców;
6. środowisko testowe tylko symuluje wysyłkę;
7. środowisko produkcyjne przekazuje PUSH, a SMS wykorzystuje jako kanał dodatkowy;
8. wynik każdej próby trafia do dziennika audytowego.

Kod QR powinien zawierać wyłącznie losowy publiczny identyfikator albo krótki podpisany odnośnik. Szczegółowa karta i zapis kontroli wymagają zalogowania; sam QR nie nadaje uprawnienia.

## 8. Gotowość zasobów i panel administracyjny

Status AED lub apteczki powinien być wyliczany na podstawie kontroli, minimalnego stanu i terminów, a nie wpisywany ręcznie jako jedyne źródło prawdy:

- **zielony** — kontrola aktualna, wymagany stan dostępny, brak bliskich terminów;
- **pomarańczowy** — niski stan, kontrola lub ważność w zdefiniowanym oknie 90/60/30 dni;
- **czerwony** — brak wymaganego elementu, termin minął, urządzenie wyłączone albo kontrola zaległa.

Dashboard administratora jednostki powinien pobierać wyłącznie agregaty z jego zakresu organizacyjnego i prowadzić do filtrowanej listy źródłowej. Sekcje: **Apteczki | AED | Ratownicy | Jednostki | Kontrole | Alerty**. Każda zmiana stanu, kontroli, komponentu AED lub partii wyposażenia apteczki trafia do dziennika audytowego.

Profil użytkownika łączy `auth.users` z jednym lub kilkoma rekordami `memberships`. Drzewo `organizations` odwzorowuje: PKP PLK → ZLK → sekcja/jednostka → miejsce pracy. Flaga ratownika należy do członkostwa w konkretnym zakresie, a nie do dowolnie edytowanego profilu.

## 9. Kolejność realizacji po obecnym etapie

1. **Gotowe w kodzie:** hierarchia Start, narzędzia w procedurach, „Prowadź mnie”, offline części publicznej i testy mobilne.
2. **Gotowe w kodzie pilota:** panel wewnętrzny, model jednostek i ról, ratownicy, RLS, audyt oraz alarm demonstracyjny.
3. **Następny krok wdrożeniowy:** utworzyć osobny projekt Supabase `test`, zastosować schemat i podłączyć klucz publikowalny.
4. Skonfigurować zaproszenia e-mail i dozwolony adres powrotu; produkcyjnie zatwierdzić Microsoft Entra ID/OIDC.
5. Wykonać test RLS dla każdej roli oraz test alarmu w trybie `simulation`.
6. Przenieść ewidencję apteczek, AED, kontroli i alertów terminów do chronionej bazy.
7. Zatwierdzić bramy PUSH/SMS, retencję oraz procedurę awaryjną; dopiero wtedy włączyć tryb produkcyjny.
8. Dodać QR, raporty, pełne zarządzanie kontrolami i rozszerzyć dziennik audytowy.

## 10. Decyzje wymagane przed backendem

- Czy logowanie ma korzystać z firmowego Microsoft Entra ID/SSO, czy z osobnych kont?
- Kto jest właścicielem struktury jednostek i źródłem prawdy dla ZLK/sekcji/miejsc pracy?
- Jakie dane wolno przechowywać poza infrastrukturą PKP PLK i na urządzeniach prywatnych?
- Czy część wewnętrzna może być hostowana w usłudze zarządzanej, czy wymaga infrastruktury firmowej?
- Kto zatwierdza role i odbiera uprawnienia pracownikowi?
- Jaki dostawca SMS/PUSH jest dopuszczony i jaki ma być limit, retry oraz retencja logów?
- Czy alarm ratowników jest tylko wsparciem, czy elementem formalnej procedury operacyjnej?

Przygotowany schemat służy środowisku deweloperskiemu/testowemu i nie zawiera danych rzeczywistych. Dopiero po tych decyzjach wolno wdrożyć go produkcyjnie, zasilić danymi pracowników oraz włączyć integracje wysyłkowe.

## 11. Źródła techniczne

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — zabezpieczanie danych](https://supabase.com/docs/guides/database/secure-data)
- [Supabase — klucze publikowalne i tajne](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase — RBAC i własne roszczenia](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)
- [Supabase — zmienne i sekrety Edge Functions](https://supabase.com/docs/guides/functions/secrets)

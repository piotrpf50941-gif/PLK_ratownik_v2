# ETAP A — użytkownicy, role, jednostki i sekcje

Stan: 30.08.2026. Zakończony zakres kodu i testów ETAPU A; bez uruchomienia produkcyjnego backendu lub wysyłki wiadomości.

## Punkt kontynuacji

- Źródłem była istniejąca wersja 2.6.1, `main` na GitHubie: `d0c3812cc5c0fa2203f32dffdd68c2fe827af99d` (po scaleniu wcześniejszego PR #1).
- Początkowy `git status` był czysty, a `git diff` pusty. Lokalne drzewo `547f6d3` było identyczne z drzewem zdalnego `main`; nie było niezapisanych zmian do odtwarzania.
- Przed zmianami utworzono lokalny punkt przywracania `checkpoint/stage-a-before-changes-2026-08-30` i gałąź roboczą `feature/stage-a-organizations`.
- Nie przebudowano aplikacji ani nie zmieniono publicznych procedur, narzędzi, Service Workera, manifestu, routingu, GPS i demonstracyjnych zasobów.

## Co istniało i zostało wykorzystane

Publiczna PWA: bezpieczeństwo przed narzędziami, „Prowadź mnie”, procedury krokowe, narzędzia uruchamiane w procedurach, oddech 2+10 s, metronom, timer, GPS, AED/apteczki DEMO i offline.

Część wewnętrzna: ekran logowania przez zaproszenie/link e-mail, profile, przypisania ról, drzewo jednostek, lista ratowników, dostępność, zapraszanie ratownika, podstawowy dashboard, formularz alarmu, historia techniczna wysyłki, adaptery PUSH/SMS i symulacja. Backend stanowił niewdrożony blueprint Supabase z RLS i trzema Edge Functions, nie działającą usługę produkcyjną.

## Naprawione błędy

1. **Wyłączenie zakładu nie odcinało konsekwentnie jego sekcji.** RLS, dobór odbiorców i Edge Functions sprawdzają teraz aktywność całej ścieżki organizacyjnej. Stary token ani aktywne przypisanie do dziecka nie omijają wyłączenia rodzica.
2. **Pracownik mógł odczytać cudzą historię zdarzeń w tej samej jednostce.** Zwykły użytkownik widzi własne alarmy; ratownik dodatkowo alarmy skierowane do niego; koordynator historię zarządzanego zakresu. Szczegóły wysyłki i dane innych odbiorców nie są otwierane zgłaszającemu.
3. **Odczyt profili był szerszy niż lista ratowników w interfejsie.** RLS ogranicza pracownika do własnego profilu i aktywnych ratowników w zatwierdzonym zakresie. Koordynator zachowuje dostęp do zarządzanych osób. Telefony pozostają w schemacie prywatnym.
4. **Panel zachowywał wcześniej pobrane role.** Odświeżenie danych oraz zmiana tokenu sesji ponownie pobierają profil, przypisania i uprawnienia jednostki. Cofnięcie dostępu czyści chroniony widok. Do czasu sprawdzenia uprawnień alarm i operacje administracyjne pozostają zablokowane.
5. **Można było utworzyć niepoprawny poziom struktury.** Walidacja w bazie i formularzu wymusza `company → zlk → section → workplace`. Cykl w starszych danych nie zapętla kontroli uprawnień i nie przyznaje dostępu.
6. **Autor operacji mógł być podany przez klienta.** Przy bezpośrednich zapisach zatwierdzenie przypisania, autor jednostki i audit log korzystają z uwierzytelnionej tożsamości, nie z dowolnego UUID z formularza.
7. **112 nie było równie widoczne w każdym stanie panelu.** Dodano duży przycisk zarówno przy alarmowaniu, jak i przy braku internetu oraz jednoznaczny komunikat, że alarm zakładowy nie zastępuje 112.

## Model — bez dublowania istniejących danych

| Pojęcie | Implementacja po ETAPIE A |
|---|---|
| Użytkownik | `auth.users` + `public.profiles`; konto Auth samo nie przyznaje dostępu |
| Role | nowy katalog `public.roles`; istniejące kody w `memberships.role` związane kluczem obcym |
| Jednostki | istniejące `public.organizations`, relacja `parent_id`, cztery walidowane poziomy |
| Sekcje | widok `public.sections` nad wierszami `organizations(kind='section')` |
| Użytkownik–sekcje | widok `public.user_sections` nad `memberships`; wiele zatwierdzonych przypisań na osobę |
| Ratownik i dostępność | istniejące `memberships(role='responder')` + `responder_profiles`, osobna gotowość dla każdego przypisania |
| Podstawowe i aktualne miejsce pracy | nowa tabela `public.user_work_contexts`: podstawowy ZLK, podstawowa sekcja, aktualna sekcja i czas aktualizacji |
| Alarm, odbiorcy, próby powiadomienia | zachowane `incidents`, `alert_recipients`, `delivery_attempts`; nie są jeszcze pełnym modelem przyjęcia i prowadzenia akcji |
| Audyt | istniejące `audit_log` + nowe transakcyjne wyzwalacze operacji jednostek i przypisań |

Nie dodano drugiej tabeli `users`, drugiego drzewa organizacyjnego ani alternatywnych kodów tych samych ról.

| Kod istniejący w bazie | Nazwa w aplikacji | Zakres |
|---|---|---|
| `employee` | Pracownik | Zatwierdzone przypisania |
| `responder` | Ratownik | Przypisania + własna gotowość i skierowane alarmy |
| `unit_admin` | Koordynator jednostki | Zarządzana jednostka i jej podjednostki |
| `system_admin` | Administrator | Cały system; przypisanie do organizacji typu `company` |

Wybór miejsca pracy **nie nadaje uprawnień**. Podstawowa i aktualna sekcja mogą być różne, także w różnych zakładach, jeżeli użytkownik ma zatwierdzony dostęp. Zapisane wcześniej miejsce nie przywraca cofniętej roli. Brak rekordu oznacza nieuzupełniony profil, nie domyślne uprawnienie.

`public.save_work_context(...)` jest dostępne wyłącznie dla zaufanego serwera (`service_role`). W ETAPIE B nowa Edge Function musi wyprowadzić identyfikator użytkownika z `requireUser()`, a nie przyjmować dowolnego identyfikatora z formularza. Kontrolowane zmiany administratora będą wymagały osobnej autoryzacji i zapisu rzeczywistego autora.

## Kontrola dostępu

- Nowe tabele mają RLS i jawne, ograniczone granty.
- Widoki `sections` i `user_sections` używają `security_invoker=true`, zachowując RLS tabel bazowych; wymagają PostgreSQL 15+.
- `public.organization_access(uuid)` to uwierzytelnione, nieuprzywilejowane RPC zwracające tylko `can_access` / `can_manage` dla bieżącego `auth.uid()`. Nie przyjmuje UUID innej osoby i nie zwraca danych osobowych.
- Publiczne RPC wykonujące uprzywilejowane zapisy pozostają niedostępne dla `anon` i `authenticated`; nie ma publicznych funkcji `SECURITY DEFINER`.
- Prywatne predykaty RLS mają jawny kontekst użytkownika i pusty `search_path`. Prywatny uprzywilejowany wyzwalacz audytu nie jest wywoływalny przez klienta.
- Audit log zapisuje identyfikatory, rodzaj operacji i niezbędne zmiany statusu; nie kopiuje nazwisk, telefonów ani dowolnych treści formularza. Operacje zaufanego serwera/bootstrapu są oznaczone, a funkcje zaproszenia i kontekstu dodatkowo zapisują aktora operacji.
- Zmiana rodzica/typu istniejącej jednostki oraz tożsamości istniejącego przypisania jest zablokowana. To celowe zabezpieczenie przed przeniesieniem danych między zakresami; przenoszenie wymaga późniejszej kontrolowanej operacji, nie obejścia walidacji.
- Nie można wyłączyć organizacji, do której jest przypisany aktywny administrator systemu. Pełna obsługa cyklu życia kont, w tym ochrona przed usunięciem ostatniego administratora, pozostaje do ETAPU B.

Podstawy techniczne: [Supabase — RLS i widoki](https://supabase.com/docs/guides/database/postgres/row-level-security), [uwierzytelnienie Edge Functions](https://supabase.com/docs/guides/functions/auth), [PostgreSQL — ograniczenia integralności](https://www.postgresql.org/docs/current/ddl-constraints.html).

## Testy i ograniczenia

Wykonano pełne `npm --offline test` po zmianach. Wszystkie osiem zestawów przechodzi:

- walidacja PWA, identyfikatorów, manifestu i plików cache;
- wykonanie publicznego interfejsu: kolejność Start, procedury, „Prowadź mnie”, narzędzia, zasoby i zachowanie miejsca w procedurze;
- Service Worker: zasoby i nawigacja bez sieci, brak buforowania danych panelu/API;
- kontrola reguł mobilnego CSS, dużych celów dotykowych i bezpiecznych marginesów;
- kontrakt panelu i funkcji, składnia oraz granice danych publicznych/prywatnych;
- **108 kontroli SQL/RLS** w izolowanym PostgreSQL (PGlite), w tym hierarchia, role, wiele sekcji, kontekst pracy, prywatność i ponowne wykonanie blueprintu;
- **25 scenariuszy DOM** panelu: sesje, cofnięcie uprawnień, spóźnione odpowiedzi, formularze, błędy i offline;
- **26 scenariuszy Edge Functions**, w tym odmowa dostępu przy nieaktywnej hierarchii oraz wycofanie uprawnienia przed utworzeniem alarmu.

Regresje odcięcia sekcji przez nieaktywny zakład i zbyt szerokiego odczytu profili najpierw odtworzono testem kończącym się błędem, a następnie naprawiono. Test starszej błędnej struktury sprawdza zatrzymanie transakcji bez utraty przypisań.

Nie wysłano żadnego e-maila, SMS-a ani PUSH. Testy używają wyłącznie danych syntetycznych i atrap dostawców.

Lokalny serwer HTTP uruchomił się. Przeglądarka chmurowa zablokowała otwarcie `127.0.0.1` (`ERR_BLOCKED_BY_CLIENT`); tę kontrolę pominięto bez ponawiania blokowanej ścieżki. Test DOM i kontrola CSS **nie są kontrolą wizualną ani próbą na fizycznym telefonie**. Nie wykonano też wdrożenia Supabase, testu prawdziwego Auth/SMTP ani Security/Performance Advisor na zdalnej bazie.

## Zmienione pliki

- `supabase/internal-platform.sql` — model, walidacja, uprawnienia i audyt;
- `supabase/functions/_shared/common.ts` i trzy istniejące funkcje `dispatch-responder-alert`, `manage-responder`, `manage-push-subscription` — wspólna kontrola zakresu;
- `internal/app.js`, `internal/index.html` — odświeżanie uprawnień, prawidłowe poziomy jednostek, widoczność 112;
- `tests/database.mjs`, `tests/internal-runtime.mjs`, `tests/edge-runtime.mjs`, `tests/internal-platform.mjs` — regresje i kontrakty;
- `README.md`, `internal/README.md`, ten dokument — stan wdrożenia i instrukcje kontynuacji.

## Wdrożenie i zgodność

`internal/config.js` nadal ma puste dane połączenia i tryb symulacji. Samo scalenie kodu nie tworzy kont, bazy ani usługi alarmowej. Publiczna PWA nadal działa niezależnie.

Blueprint SQL jest przeznaczony do **pustego, osobnego środowiska testowego**. Nie jest migracją produkcyjnej bazy. Kontrola wstępna przerywa wykonanie przy niezgodnej starej hierarchii (`organization_hierarchy_review_required`) albo administratorze poza poziomem `company` (`system_admin_scope_review_required`); nie poprawia istniejących danych na ślepo.

Kolejność na zatwierdzonym projekcie testowym: migracja utworzona Supabase CLI i sprawdzona lokalnie → SQL i RLS → trzy Edge Functions → panel. Nowe wersje panelu i funkcji wymagają RPC `organization_access`; brak RPC blokuje akcje zamiast korzystać ze starej, słabszej kontroli. Jeśli jakakolwiek wcześniejsza wersja backendu została wdrożona poza tym repozytorium, najpierw należy porównać jej migracje i przygotować migrację przyrostową.

## Co pozostało do ETAPU B

1. Zatwierdzić projekt testowy/region, zasady danych, domenę części wewnętrznej oraz SMTP; ustalić SSO/MFA i zasady sesji na współdzielonych telefonach. Nie wymaga to zmiany technologii aplikacji.
2. Podłączyć i przetestować istniejące logowanie zaproszonych kont na rzeczywistym Auth oraz urządzeniu mobilnym. Nie włączać publicznej rejestracji.
3. Dodać ekran profilu i wybór „Aktualnie pracuję na terenie: Zakład → Sekcja”, korzystając z przygotowanego modelu i serwerowej kontroli zakresu. Katalog nazw przodków ma ujawniać tylko niezbędne metadane, a nie otwierać danych całego zakładu pracownikowi jednej sekcji.
4. Rozwinąć panel kont: tworzenie pracowników, zmiana ról, wiele przypisań, aktywacja/dezaktywacja kont, ochrona ostatniego administratora i audyt; nie usuwać danych historii.
5. Dodać edycję i dezaktywację jednostek w interfejsie na bazie istniejącej walidacji/RLS. Dodawanie właściwego poziomu jest już dostępne.

Dalsze C–F: uproszczony alarm z sekcją i znacznikiem czasu GPS, `PRZYJMUJĘ / NIE MOGĘ`, osobne statusy prowadzenia akcji i potwierdzeń, bezpieczny status dla zgłaszającego, kolejka PUSH → SMS z konfiguracją eskalacji, QR lokalizacji, wewnętrzne AED/apteczki i raporty. Istniejący status `sent` oznacza przyjęcie przez bramę, **nie** potwierdzenie ratownika ani czas jego przybycia. Nie zmieniono tych statusów pozornie na pełny przepływ operacyjny.

Rekomendacja: kontynuować ETAP B w tej samej architekturze (obecna PWA + Supabase Auth/PostgreSQL/RLS + Edge Functions), a decyzje o rzeczywistych danych i płatnych kanałach podjąć przed ich podłączeniem.

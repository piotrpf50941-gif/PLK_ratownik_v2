# Kontynuacja Ratownika PLK — 30.08.2026

## Punkt wznowienia

Lokalny `main` był czysty (`65174f7`), a jego drzewo identyczne z `origin/main` (`9d4a717`). Nowsze prace były zapisane na GitHubie w gałęzi `feature/internal-platform-v1`, PR #1, do commita `68bcb81`. Nie nadpisano zmian ani nie odtworzono aplikacji. Przed poprawkami utworzono lokalny checkpoint `checkpoint/internal-platform-before-verification-2026-08-30`.

## Zakończone poprawki 2.6.1

- Naprawiony uszkodzony SQL oraz rzeczywiste granty RPC. Funkcje dostępne przez API nie używają `SECURITY DEFINER`; uprzywilejowane operacje są wykonywane wyłącznie jako `service_role`.
- Testy wykonują cały schemat w PostgreSQL w pamięci, a nie tylko wyszukują tekst. Sprawdzają izolację jednostek, role, nieaktywne profile, prywatne kontakty i uprawnienia funkcji.
- Dodawanie jednostki zapisuje autora i działa z polityką `INSERT ... RETURNING`.
- Wylogowanie czyści widok, formularze i dialog; spóźnione odpowiedzi nie odtwarzają danych. Zmiana jednostki unieważnia poprzednie żądania.
- Poprawiony odbiór zaproszeń przez jednorazowy token; wymagane szablony e-mail opisano w instrukcji panelu. SDK ma przypiętą wersję, integralność SRI i ograniczony czas ładowania.
- Alarm ma trwały identyfikator dla ponowień, blokadę podwójnego kliknięcia i atomową rezerwację w bazie. Tryb testowy panelu nie uruchamia serwera produkcyjnego.
- Błąd, częściowe przyjęcie i nieznany wynik alarmu nie są prezentowane jako sukces. Błędy serwera mają czytelne komunikaty.
- Ratownik potwierdza gotowość; nowe zaproszenie nie oznacza automatycznie dostępności. Lokalizacja alarmu jest dostępna po zalogowaniu.
- Rejestracja PUSH weryfikuje właściciela i host; powiadomienie na ekranie blokady nie zawiera miejsca ani opisu zdarzenia. Wylogowanie unieważnia subskrypcję urządzenia.
- Publiczny cache nie obejmuje panelu/API, nie usuwa cache innych aplikacji i nie jest nadpisywany stroną błędu HTTP.
- Poprawione nieaktualne testy wersji i Service Workera. CI obejmuje nowe testy; Pages publikuje tylko pliki aplikacji.

## Weryfikacja

`npm test`: integralność plików, publiczny DOM, offline/Service Worker, mobilne CSS, kontrakt panelu, SQL/RLS, wewnętrzny DOM i Edge Functions. Dane i dostawcy w testach są syntetyczne; nie wysyłano SMS/PUSH/e-maili.

Przeglądarka chmurowa odmówiła otwarcia lokalnego serwera (`ERR_BLOCKED_BY_CLIENT`). Nie powtarzano tej zablokowanej ścieżki. Testy automatyczne nie są testem fizycznego telefonu ani działającego projektu Supabase.

## Nieukończone / wymagające osobnego wdrożenia

1. Wybrać i zatwierdzić projekt Supabase test, region, zasady danych, SMTP i docelowe SSO/MFA. Wgrać schemat i funkcje, dodać pierwszego administratora, uzupełnić wyłącznie publiczny config, wykonać testy integracyjne i Security Advisor.
2. Wykonać kontrolę logowania, PUSH i dźwięków na rzeczywistych telefonach. Zatwierdzić zasady pracy na wspólnych urządzeniach.
3. Zatwierdzić dostawców PUSH/SMS, retencję, limity kosztów, kolejkę, ponowienia, potwierdzenia i monitoring przed użyciem operacyjnym.
4. Dokończyć zarządzanie cyklem życia kont i ról oraz migrację AED/apteczek/kontroli do części uwierzytelnionej. Ich publiczne moduły nadal są demonstracyjne. Pełny panel zasobów, QR i raportowanie to kolejne etapy, nie zakończone funkcje produkcyjne.

Nie podłączono rzeczywistych danych pracowników ani usług wysyłkowych. Wstrzymanego wywołania pobierania projektów Supabase nie ponawiano.

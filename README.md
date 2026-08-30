# Ratownik PLK v2

Wersja porównawcza aplikacji **Ratownik PLK**, rozwijana iteracyjnie z naciskiem na prostotę obsługi na telefonie i szybkie działanie w stresie. Aktualna wersja aplikacji: **2.6.1**.

## Najważniejsza zmiana

W poprzedniej wersji ekran startowy łączył alarmowanie, lokalizację, raport, powiadomienia, timery i bazę wiedzy. W v2 zastosowano cztery wyraźne obszary:

| Obszar | Przeznaczenie |
|---|---|
| **Start** | własne bezpieczeństwo, sekwencja 1–2–3, wezwanie 112 i narzędzia natychmiastowe |
| **Procedury** | wyszukiwarka oraz prowadzenie krok po kroku |
| **Zasoby** | demonstracyjne AED i apteczki dostępne offline |
| **Więcej** | ustawienia, dane demonstracyjne i informacja o części wewnętrznej |

## Funkcje

- szybki telefon pod 112,
- blok bezpieczeństwa własnego i środków ochrony osobistej przed narzędziami oraz procedurami,
- podstawowa sekwencja ratownicza 1–2–3 widoczna od razu na ekranie Start,
- interaktywne „Prowadź mnie”: bezpieczeństwo → reakcja → oddech → wybór RKO dorosłego lub dziecka albo właściwej procedury zdarzenia,
- tryb krokowy procedur z krótkim poleceniem i rozwijanym opisem,
- RKO dorosłego i dziecka, AED, zadławienie, krwotok, oparzenie, porażenie prądem, wypadek kolejowy, drgawki, pozycja boczna i FAST,
- metronom RKO 110/min dostępny bezpośrednio na ekranie Start,
- wspomagana dźwiękiem ocena oddechu: 2 sekundy przygotowania i pełne 10 sekund obserwacji,
- metronom, ocena oddechu, timer, zapis godziny i telefon 112 dostępne bezpośrednio w odpowiednich krokach procedur,
- pobieranie GPS i generator treści zgłoszenia,
- sortowanie AED i apteczek według przybliżonej odległości oraz otwieranie ich lokalizacji na mapie,
- lokalne dodawanie i usuwanie demonstracyjnych AED oraz apteczek,
- demonstracyjna ewidencja kontroli, terminów elektrod i baterii AED oraz wyposażenia apteczek,
- automatyczna ocena gotowości zasobów: zielony / pomarańczowy / czerwony, alerty 90/60/30 dni i kontrola minimalnych stanów,
- import i eksport kopii JSON,
- tryb ciemny i większy tekst,
- instalacja jako PWA i działanie offline,
- spójny zestaw nowych grafik dopasowanych do każdej procedury.
- osobny panel wewnętrzny z logowaniem, rolami, jednostkami, ratownikami i dashboardem administracyjnym,
- bezpieczny alarm ratowników z potwierdzeniem, GPS, idempotencją i audytem; domyślnie działa w trybie symulacji bez wysyłania wiadomości,
- schemat Supabase z RLS, prywatnymi kontaktami oraz Edge Functions dla zaproszeń i adapterów PUSH/SMS.

Publiczna wersja nie zawiera danych pracowników ani numerów telefonów. Przygotowany moduł `internal/` pobiera dane dopiero po uwierzytelnieniu i sprawdzeniu RLS. Do czasu podłączenia osobnego projektu Supabase pokazuje bezpieczny ekran konfiguracji; żadna lista pracowników ani sekret nie trafia do GitHub Pages. Szczegóły zawiera [instrukcja panelu](internal/README.md) i [architektura rozwoju](docs/ARCHITEKTURA_ROZWOJU.md).

## Uruchomienie lokalne

Repozytorium nie wymaga kompilacji ani instalowania zależności:

```bash
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

## Testy

Testy publicznej PWA można uruchomić bez bibliotek. Pełny zestaw obejmuje też wykonanie SQL w izolowanym PostgreSQL oraz testy panelu i funkcji serwerowych z atrapami usług:

```bash
npm ci --ignore-scripts
npm test
```

## Publikacja

Workflow GitHub Actions testuje PR oraz gałąź `main`. Publikacja następuje tylko po pozytywnych testach i obejmuje wyłącznie pliki aplikacji, bez testów, zależności i kodu backendu. W ustawieniach repozytorium wybierz **Settings → Pages → Source: GitHub Actions**.

Docelowy adres po publikacji:

[Otwórz aplikację](https://piotrpf50941-gif.github.io/PLK_ratownik_v2/).

Na telefonie: otwórz adres w Chrome/Safari, odśwież aplikację i wybierz instalację / dodanie do ekranu głównego. Po pierwszym pełnym załadowaniu przetestuj procedury, „Prowadź mnie” i narzędzia w trybie samolotowym. Nie uruchamiaj rzeczywistego połączenia 112 podczas testu. Zakładka Zasoby → Ratownicy prowadzi do części wewnętrznej, która wymaga osobnej konfiguracji opisanej w `internal/README.md`.

Raport ostatniej kontroli i dalsze kroki: [Kontynuacja 30.08.2026](docs/KONTYNUACJA_2026-08-30.md).

## Ważne

To prototyp pomocniczy, nie wyrób medyczny. Nie zastępuje szkolenia, oceny sytuacji, obowiązujących instrukcji kolejowych ani poleceń dyspozytora 112. Dane zakładowe w repozytorium są demonstracyjne i należy je zastąpić zweryfikowanymi danymi.

Procedury opracowano w oparciu o [Wytyczne ERC 2025](https://www.erc.edu/science-research/guidelines/guidelines-2025/guidelines-2025-english/). Przed wdrożeniem produkcyjnym wymagają przeglądu osoby odpowiedzialnej za BHP/KPP oraz zgodności z instrukcjami zakładowymi.

# Ratownik PLK v2

Wersja porównawcza aplikacji **Ratownik PLK**, zaprojektowana od nowa z naciskiem na prostotę obsługi na telefonie i szybkie działanie w stresie.

## Najważniejsza zmiana

W poprzedniej wersji ekran startowy łączył alarmowanie, lokalizację, raport, powiadomienia, timery i bazę wiedzy. W v2 zastosowano cztery wyraźne obszary:

| Obszar | Przeznaczenie |
|---|---|
| **Start** | wezwanie 112 i najpilniejsze procedury |
| **Procedury** | wyszukiwarka oraz prowadzenie krok po kroku |
| **Zasoby** | AED, apteczki i ratownicy |
| **Więcej** | metronom, timer, ustawienia i dane lokalne |

## Funkcje

- szybki telefon pod 112,
- tryb krokowy procedur,
- RKO dorosłego i dziecka, AED, zadławienie, krwotok, oparzenie, porażenie prądem, wypadek kolejowy, drgawki, pozycja boczna i FAST,
- metronom RKO 110/min dostępny bezpośrednio na ekranie Start,
- wspomagana dźwiękiem ocena oddechu: 2 sekundy przygotowania i pełne 10 sekund obserwacji,
- pobieranie GPS i generator treści zgłoszenia,
- sortowanie AED według przybliżonej odległości,
- połączenia i SMS do ratowników,
- lokalne dodawanie i usuwanie AED, apteczek oraz ratowników,
- import i eksport kopii JSON,
- tryb ciemny i większy tekst,
- instalacja jako PWA i działanie offline,
- spójny zestaw nowych grafik dopasowanych do każdej procedury.

## Uruchomienie lokalne

Repozytorium nie wymaga kompilacji ani instalowania zależności:

```bash
python3 -m http.server 8080
```

Następnie otwórz `http://localhost:8080`.

## Testy

Testy nie wymagają instalowania bibliotek:

```bash
node --check app.js
node --check data.js
node --check sw.js
python3 tests/validate.py
node tests/smoke.mjs
```

## Publikacja

Workflow GitHub Actions publikuje zawartość gałęzi `main` w GitHub Pages. W ustawieniach repozytorium wybierz **Settings → Pages → Source: GitHub Actions**.

Docelowy adres po publikacji:

`https://piotrpf50941-gif.github.io/PLK_ratownik_v2/`

## Ważne

To prototyp pomocniczy, nie wyrób medyczny. Nie zastępuje szkolenia, oceny sytuacji, obowiązujących instrukcji kolejowych ani poleceń dyspozytora 112. Dane zakładowe w repozytorium są demonstracyjne i należy je zastąpić zweryfikowanymi danymi.

Procedury opracowano w oparciu o [Wytyczne ERC 2025](https://www.erc.edu/science-research/guidelines/guidelines-2025/guidelines-2025-english/). Przed wdrożeniem produkcyjnym wymagają przeglądu osoby odpowiedzialnej za BHP/KPP oraz zgodności z instrukcjami zakładowymi.

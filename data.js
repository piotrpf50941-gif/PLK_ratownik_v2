(function () {
  'use strict';

  const sourceUrl = 'https://www.erc.edu/science-research/guidelines/guidelines-2025/guidelines-2025-english/';

  window.RATOWNIK_DATA = {
    version: '2.7.0',
    reviewedAt: '2026-10-08',
    quickProcedureIds: ['rko-dorosly', 'krwotok', 'porazenie-pradem', 'wypadek-kolejowy'],
    emergencyChoiceIds: [
      'krwotok',
      'zadlawienie',
      'oparzenie',
      'porazenie-pradem',
      'wypadek-kolejowy',
      'drgawki',
      'udar'
    ],
    eventTypes: [
      'Brak przytomności',
      'Brak prawidłowego oddechu / RKO',
      'Silny krwotok',
      'Zadławienie',
      'Oparzenie',
      'Drgawki',
      'Porażenie prądem',
      'Wypadek kolejowy',
      'Inne nagłe zdarzenie'
    ],
    procedures: [
      {
        id: 'rko-dorosly',
        icon: '♥',
        title: 'RKO dorosłego i AED',
        shortTitle: 'Brak oddechu / RKO',
        category: 'RKO',
        tone: 'danger',
        image: 'assets/topics/sec06.jpg',
        summary: 'Dla osoby nieprzytomnej, która nie oddycha prawidłowo. Oddechy agonalne traktuj jak brak prawidłowego oddechu.',
        sourceLabel: 'ERC 2025 — Adult Basic Life Support',
        sourceUrl: sourceUrl,
        steps: [
          {
            title: 'Sprawdź bezpieczeństwo',
            text: 'Rozejrzyj się. Nie podchodź, jeżeli zagraża Ci ruch kolejowy, sieć trakcyjna, prąd, ogień, dym albo ruch pojazdów.',
            warning: 'Na tor i w pobliże urządzeń pod napięciem wchodź dopiero po potwierdzeniu, że jest bezpiecznie.'
          },
          {
            title: 'Sprawdź reakcję',
            text: 'Głośno zapytaj, czy wszystko w porządku, i delikatnie potrząśnij za ramiona. Brak reakcji oznacza konieczność natychmiastowego działania.'
          },
          {
            title: 'Wezwij 112 i poproś o AED',
            text: 'Włącz tryb głośnomówiący. Jeśli ktoś jest obok, wskaż konkretną osobę: „zadzwoń pod 112 i przynieś AED”. Wykonuj polecenia dyspozytora.',
            tools: ['call']
          },
          {
            title: 'Oceń oddech do 10 sekund',
            text: 'Udrożnij drogi oddechowe. Patrz, słuchaj i czuj nie dłużej niż 10 sekund. Pojedyncze westchnięcia i oddech agonalny nie są prawidłowym oddechem.',
            warning: 'Jeżeli masz wątpliwość, czy oddech jest prawidłowy — rozpocznij RKO.',
            tools: ['breath']
          },
          {
            title: 'Wykonuj uciśnięcia 30 : 2',
            text: 'Uciskaj środek klatki piersiowej 100–120 razy na minutę na głębokość 5–6 cm. Po 30 uciśnięciach wykonaj 2 oddechy, jeśli potrafisz i możesz. W przeciwnym razie uciskaj bez przerw.',
            tools: ['metronome']
          },
          {
            title: 'Podłącz AED',
            text: 'Włącz AED, przyklej elektrody na odsłoniętą klatkę piersiową i wykonuj jego polecenia. Podczas analizy i wyładowania nikt nie może dotykać poszkodowanego.'
          },
          {
            title: 'Nie przerywaj bez powodu',
            text: 'Kontynuuj do przyjazdu służb, pojawienia się prawidłowego oddechu, wyczerpania lub utraty bezpieczeństwa. Zmieniaj osobę uciskającą mniej więcej co 2 minuty, jeśli to możliwe.'
          }
        ]
      },
      {
        id: 'rko-dziecko',
        icon: '●',
        title: 'RKO dziecka',
        shortTitle: 'RKO dziecka',
        category: 'RKO',
        tone: 'blue',
        image: 'assets/topics/sec02.jpg',
        summary: 'Podstawowe postępowanie przy braku prawidłowego oddechu u dziecka. Wezwij pomoc jak najwcześniej.',
        sourceLabel: 'ERC 2025 — Paediatric Life Support',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Zadbaj o bezpieczeństwo', text: 'Sprawdź otoczenie, oceń reakcję dziecka i zawołaj o pomoc.' },
          { title: 'Udrożnij drogi oddechowe', text: 'Ułóż głowę odpowiednio do wieku i sprawdzaj oddech nie dłużej niż 10 sekund.', tools: ['breath'] },
          { title: 'Wykonaj 5 oddechów', text: 'Jeżeli dziecko nie oddycha prawidłowo, wykonaj 5 początkowych oddechów ratowniczych i obserwuj unoszenie klatki piersiowej.' },
          { title: 'Rozpocznij uciśnięcia', text: 'Uciskaj dolną połowę mostka na około 1/3 głębokości klatki piersiowej, w tempie 100–120/min. Samotny ratownik stosuje 30 : 2; dwie osoby przeszkolone pediatrycznie mogą stosować 15 : 2.', tools: ['metronome'] },
          { title: 'Wezwij 112 i użyj AED', text: 'Jeśli jesteś sam i nie możesz zadzwonić od razu, wykonuj RKO około minutę, a następnie wezwij pomoc. Użyj AED i elektrod pediatrycznych, gdy są dostępne.', warning: 'Dyspozytor 112 może dopasować instrukcje do wieku dziecka — słuchaj jego poleceń.', tools: ['call'] }
        ]
      },
      {
        id: 'zadlawienie',
        icon: '◒',
        title: 'Zadławienie',
        shortTitle: 'Zadławienie',
        category: 'Drogi oddechowe',
        tone: 'amber',
        image: 'assets/topics/sec03.jpg',
        summary: 'Szybko odróżnij skuteczny kaszel od ciężkiej niedrożności dróg oddechowych.',
        sourceLabel: 'ERC 2025 — Adult Basic Life Support',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Zapytaj i oceń kaszel', text: 'Jeśli poszkodowany może mówić, oddychać i kaszleć — zachęcaj do kaszlu i obserwuj. Nie uderzaj wtedy w plecy.' },
          { title: 'Wykonaj 5 uderzeń w plecy', text: 'Przy nieskutecznym kaszlu pochyl osobę do przodu i wykonaj do 5 mocnych uderzeń między łopatki. Po każdym sprawdź, czy ciało obce wypadło.' },
          { title: 'Wykonaj 5 uciśnięć nadbrzusza', text: 'Jeśli uderzenia nie pomogły, wykonaj do 5 uciśnięć nadbrzusza. Powtarzaj serię 5 uderzeń i 5 uciśnięć.', warning: 'U kobiety w zaawansowanej ciąży lub gdy nie możesz objąć nadbrzusza, zastosuj uciśnięcia klatki piersiowej.' },
          { title: 'Utrata przytomności — RKO', text: 'Ostrożnie ułóż osobę na podłożu, wezwij 112 i rozpocznij RKO. Przed oddechami usuń tylko widoczne ciało obce — nie szukaj go palcem na ślepo.', tools: ['call', 'metronome'] },
          { title: 'Po zdarzeniu potrzebna jest ocena', text: 'Po uciśnięciach nadbrzusza lub klatki piersiowej poszkodowany powinien zostać oceniony medycznie, nawet jeśli poczuje się lepiej.' }
        ]
      },
      {
        id: 'krwotok',
        icon: '◆',
        title: 'Masywny krwotok',
        shortTitle: 'Masywny krwotok',
        category: 'Urazy',
        tone: 'danger',
        image: 'assets/topics/sec07.jpg',
        summary: 'Silne krwawienie może zabić w kilka minut. Natychmiast zastosuj mocny, bezpośredni ucisk.',
        sourceLabel: 'ERC 2025 — First Aid',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Załóż ochronę i odsłoń ranę', text: 'Jeśli są dostępne, załóż rękawiczki. Odsłoń miejsce krwawienia i szybko oceń jego źródło.' },
          { title: 'Uciskaj bezpośrednio', text: 'Dociśnij ranę mocno ręką przez materiał opatrunkowy lub czystą tkaninę. Nie odrywaj pierwszej warstwy, jeśli przemaka — dołóż następną.' },
          { title: 'Wezwij 112', text: 'Poproś konkretną osobę o wezwanie służb i przyniesienie apteczki. Ułóż poszkodowanego i chroń go przed wychłodzeniem.', tools: ['call'] },
          { title: 'Staza przy krwotoku z kończyny', text: 'Jeśli zagrażającego życiu krwotoku z ręki lub nogi nie da się szybko opanować uciskiem, załóż zatwierdzoną stazę zgodnie z instrukcją — powyżej rany, nie na stawie.', warning: 'Zapisz dokładny czas założenia i nie zdejmuj stazy samodzielnie.', tools: [{ type: 'time-mark', label: 'Godzina założenia stazy' }] },
          { title: 'Monitoruj stan', text: 'Kontroluj reakcję i oddech. Jeśli poszkodowany przestanie oddychać prawidłowo, rozpocznij RKO.', tools: ['breath', 'metronome'] }
        ]
      },
      {
        id: 'oparzenie',
        icon: '▲',
        title: 'Oparzenie termiczne',
        shortTitle: 'Oparzenie',
        category: 'Urazy',
        tone: 'amber',
        image: 'assets/topics/sec09.jpg',
        summary: 'Przerwij działanie źródła ciepła i chłodź oparzenie chłodną bieżącą wodą przez 20 minut.',
        sourceLabel: 'ERC 2025 — First Aid',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Przerwij działanie ciepła', text: 'Zadbaj o własne bezpieczeństwo. Odsuń poszkodowanego od źródła urazu i ugaś płonącą odzież.' },
          { title: 'Chłodź przez 20 minut', text: 'Jak najszybciej chłodź oparzoną okolicę chłodną bieżącą wodą przez 20 minut. Chroń resztę ciała przed wychłodzeniem.', tools: [{ type: 'timer', seconds: 1200, label: 'Chłodzenie oparzenia' }] },
          { title: 'Usuń luźne przedmioty', text: 'Zdejmij biżuterię, zegarek i luźną odzież z okolicy oparzenia, zanim pojawi się obrzęk. Nie odrywaj materiału przyklejonego do skóry.' },
          { title: 'Osłoń oparzenie', text: 'Po chłodzeniu luźno osłoń ranę jałowym, nieprzylegającym opatrunkiem. Nie przebijaj pęcherzy i niczym nie smaruj.' },
          { title: 'Wezwij pomoc, gdy uraz jest poważny', text: 'Dzwoń pod 112 przy rozległym lub głębokim oparzeniu, urazie twarzy, dróg oddechowych, dłoni, stóp, krocza, dużych stawów, a także po oparzeniu prądem lub chemicznym.' }
        ]
      },
      {
        id: 'porazenie-pradem',
        icon: 'ϟ',
        title: 'Porażenie prądem',
        shortTitle: 'Porażenie prądem',
        category: 'Kolej',
        tone: 'amber',
        image: 'assets/topics/sec05.jpg',
        summary: 'Nie dotykaj poszkodowanego, dopóki kompetentna osoba nie potwierdzi odłączenia napięcia i bezpieczeństwa podejścia.',
        sourceLabel: 'ERC 2025 — Special Circumstances / zasada bezpieczeństwa',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Nie podchodź i nie dotykaj', text: 'Traktuj przewody, sieć trakcyjną i urządzenia jako będące pod napięciem. Zachowaj bezpieczną odległość i ostrzeż inne osoby.', warning: 'Prąd może oddziaływać bez bezpośredniego dotknięcia. Nie próbuj samodzielnie usuwać przewodu ani odciągać poszkodowanego.' },
          { title: 'Wezwij 112 i służby kolejowe', text: 'Podaj dokładną lokalizację i rodzaj zagrożenia. Powiadom właściwego dyspozytora lub służby zakładowe zgodnie z lokalną procedurą.', tools: ['call'] },
          { title: 'Poczekaj na potwierdzenie bezpieczeństwa', text: 'Podejdź dopiero po formalnym potwierdzeniu wyłączenia napięcia, zabezpieczenia urządzeń i dopuszczenia do działań.' },
          { title: 'Oceń reakcję i oddech', text: 'Gdy jest bezpiecznie, sprawdź przytomność i prawidłowy oddech. Przy jego braku rozpocznij RKO i użyj AED.', tools: ['breath', 'metronome'] },
          { title: 'Każde porażenie wymaga oceny', text: 'Zabezpiecz oparzenia, monitoruj stan i chroń przed wychłodzeniem. Poszkodowany powinien zostać oceniony medycznie, nawet jeśli początkowo czuje się dobrze.' }
        ]
      },
      {
        id: 'wypadek-kolejowy',
        icon: '▰',
        title: 'Wypadek kolejowy',
        shortTitle: 'Wypadek kolejowy',
        category: 'Kolej',
        tone: 'blue',
        image: 'assets/topics/sec01.jpg',
        summary: 'Najpierw zatrzymanie zagrożenia: ruch pociągów, sieć trakcyjna i wtórne zdarzenia. Następnie dokładna lokalizacja i pierwsza pomoc.',
        sourceLabel: 'Procedura pomocnicza — wymaga dostosowania do instrukcji zakładowych',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Oceń z bezpiecznej odległości', text: 'Nie wchodź na tor bez potwierdzenia bezpieczeństwa. Zwróć uwagę na ruch kolejowy, sieć trakcyjną, wykolejony tabor, wycieki, ogień i niestabilne elementy.' },
          { title: 'Uruchom alarmowanie', text: 'Zadzwoń pod 112 oraz powiadom właściwego dyspozytora zgodnie z procedurą zakładową. Podaj liczbę poszkodowanych i główne zagrożenia.', tools: ['call'] },
          { title: 'Podaj precyzyjną lokalizację', text: 'Przekaż numer linii, tor, kilometr, szlak lub posterunek, najbliższy przejazd albo obiekt oraz współrzędne GPS i możliwy dojazd.' },
          { title: 'Zabezpiecz miejsce', text: 'Ostrzegaj inne osoby i uniemożliw wejście w strefę zagrożenia. Nie przemieszczaj elementów infrastruktury i taboru bez konieczności ratowania życia.' },
          { title: 'Pomagaj dopiero po dopuszczeniu', text: 'Po potwierdzeniu bezpieczeństwa oceń poszkodowanych. Priorytetem są brak prawidłowego oddechu i masywny krwotok. Aktualizuj służby o zmianie sytuacji.' }
        ]
      },
      {
        id: 'drgawki',
        icon: '≈',
        title: 'Drgawki',
        shortTitle: 'Drgawki',
        category: 'Nagłe zachorowanie',
        tone: 'blue',
        image: 'assets/topics/sec10.jpg',
        summary: 'Chroń przed urazem, mierz czas napadu i nie wkładaj niczego do ust.',
        sourceLabel: 'ERC 2025 — First Aid',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Zabezpiecz otoczenie', text: 'Odsuń twarde i ostre przedmioty. Podłóż coś miękkiego pod głowę i poluzuj ciasną odzież przy szyi.' },
          { title: 'Nie powstrzymuj drgawek', text: 'Nie przytrzymuj kończyn i nie wkładaj niczego do ust. Nie podawaj jedzenia, napoju ani leków doustnych.' },
          { title: 'Mierz czas', text: 'Zanotuj początek i obserwuj przebieg. Wezwij 112, jeśli napad trwa około 5 minut lub dłużej, powtarza się, to pierwszy napad, doszło do urazu, osoba jest w ciąży albo ma problemy z oddychaniem.', tools: [{ type: 'timer', seconds: 300, label: 'Czas napadu' }, 'call'] },
          { title: 'Po ustaniu oceń oddech', text: 'Udrożnij drogi oddechowe. Jeśli osoba oddycha prawidłowo i nie ma przeciwwskazań urazowych, ułóż ją na boku. Zostań przy niej do odzyskania kontaktu.', tools: ['breath'] }
        ]
      },
      {
        id: 'pozycja-boczna',
        icon: '↷',
        title: 'Nieprzytomny, ale oddycha',
        shortTitle: 'Pozycja boczna',
        category: 'Drogi oddechowe',
        tone: 'blue',
        image: 'assets/topics/sec08.jpg',
        summary: 'Wezwij pomoc, utrzymuj drożność dróg oddechowych i stale kontroluj oddech.',
        sourceLabel: 'ERC 2025 — Adult Basic Life Support',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'Wezwij 112', text: 'Osoba nieprzytomna wymaga pilnej oceny. Włącz tryb głośnomówiący i wykonuj instrukcje dyspozytora.', tools: ['call'] },
          { title: 'Kontroluj oddech', text: 'Udrożnij drogi oddechowe i upewnij się, że oddech jest prawidłowy. Sprawdzaj go regularnie.', tools: ['breath'] },
          { title: 'Ułóż na boku, jeśli to właściwe', text: 'Jeśli nie podejrzewasz urazu wymagającego pozostawienia w pozycji zastanej i musisz utrzymać drożność dróg oddechowych, ułóż osobę w stabilnej pozycji bocznej.' },
          { title: 'Reaguj na zmianę', text: 'Chroń przed wychłodzeniem. Jeśli oddech stanie się nieprawidłowy lub zaniknie, natychmiast ułóż osobę na plecach i rozpocznij RKO.', tools: ['metronome'] }
        ]
      },
      {
        id: 'udar',
        icon: 'F',
        title: 'Podejrzenie udaru — FAST',
        shortTitle: 'Podejrzenie udaru',
        category: 'Nagłe zachorowanie',
        tone: 'blue',
        image: 'assets/topics/sec04.jpg',
        summary: 'Opadnięty kącik ust, osłabiona ręka lub niewyraźna mowa oznaczają pilną potrzebę wezwania 112.',
        sourceLabel: 'ERC 2025 — First Aid',
        sourceUrl: sourceUrl,
        steps: [
          { title: 'F — twarz', text: 'Poproś o uśmiech. Sprawdź, czy jedna strona twarzy lub kącik ust opada.' },
          { title: 'A — ręce', text: 'Poproś o uniesienie obu rąk. Zobacz, czy jedna opada albo jest wyraźnie słabsza.' },
          { title: 'S — mowa', text: 'Poproś o powtórzenie prostego zdania. Oceń, czy mowa jest niewyraźna, niezrozumiała lub niemożliwa.' },
          { title: 'T — czas: dzwoń 112', text: 'Zanotuj godzinę, kiedy objawy zaczęły się lub kiedy osobę ostatnio widziano bez objawów. Natychmiast wezwij 112.', warning: 'Nie podawaj jedzenia, picia ani leków. Nie czekaj, aż objawy miną.', tools: [{ type: 'time-mark', label: 'Początek objawów / ostatni znany czas bez objawów' }, 'call'] }
        ]
      }
    ],
    firstAidModule: {
      "title": "Pierwsza pomoc",
      "groups": [
        {
          "title": "GRUPA I · Bezpieczeństwo",
          "topics": [
            {
              "title": "Bezpieczeństwo własne i miejsca zdarzenia",
              "path": "firstaid/bezpieczenstwo"
            }
          ]
        },
        {
          "title": "GRUPA II · Wstępna ocena poszkodowanego",
          "subgroups": [
            {
              "title": "PODGRUPA 1 · Ocena ogólna",
              "blocks": [
                {
                  "type": "p",
                  "text": "Podejdź do poszkodowanego dopiero po upewnieniu się, że miejsce zdarzenia jest bezpieczne."
                },
                {
                  "type": "p",
                  "text": "W pierwszych sekundach oceń przede wszystkim:"
                },
                {
                  "type": "bullets",
                  "items": [
                    "czy poszkodowany reaguje",
                    "orientacyjny wiek / grupę wiekową",
                    "pozycję poszkodowanego",
                    "wygląd ogólny i zachowanie",
                    "aktywność ruchową",
                    "kolor i wilgotność skóry",
                    "widoczne objawy urazu lub nagłego zachorowania",
                    "mechanizm zdarzenia, jeżeli jest znany",
                    "obecność masywnego krwotoku"
                  ]
                },
                {
                  "type": "p",
                  "text": "Szczególną uwagę zwróć na krwotok zagrażający życiu. Sprawdź nie tylko bezpośrednio widoczną ranę, ale również ubranie, podłoże oraz miejsca, w których krew może być częściowo ukryta."
                },
                {
                  "type": "p",
                  "text": "Jeżeli występuje masywny krwotok, rozpocznij jego tamowanie natychmiast. Zastosuj silny bezpośredni ucisk, odpowiedni opatrunek, a przy zagrażającym życiu krwotoku z kończyny — jeżeli jest to konieczne — opaskę uciskową zgodnie z zasadami pierwszej pomocy."
                },
                {
                  "type": "p",
                  "text": "Jeżeli poszkodowany nie reaguje, głośno wołaj o pomoc i zleć konkretnej osobie wezwanie 112 lub 999 oraz przyniesienie AED. Jeżeli jesteś sam, wykonaj połączenie w trybie głośnomówiącym i kontynuuj ocenę poszkodowanego."
                },
                {
                  "type": "subheading",
                  "text": "Dalszą ocenę prowadź według schematu X → A → B → C → D → E"
                },
                {
                  "type": "scheme",
                  "items": [
                    {
                      "label": "X",
                      "title": "eXsanguination",
                      "text": "masywny krwotok"
                    },
                    {
                      "label": "A",
                      "title": "Airway",
                      "text": "drogi oddechowe"
                    },
                    {
                      "label": "B",
                      "title": "Breathing",
                      "text": "oddychanie"
                    },
                    {
                      "label": "C",
                      "title": "Circulation",
                      "text": "krążenie"
                    },
                    {
                      "label": "D",
                      "title": "Disability",
                      "text": "świadomość i neurologia"
                    },
                    {
                      "label": "E",
                      "title": "Exposure",
                      "text": "ekspozycja i dalsza ocena urazowa"
                    }
                  ]
                },
                {
                  "type": "note",
                  "tone": "danger",
                  "text": "Zasada: krwotok bezpośrednio zagrażający życiu należy opanować przed przejściem do dalszej oceny ABCDE."
                }
              ]
            },
            {
              "title": "PODGRUPA 2 · Ocena stanu świadomości — ACVPU",
              "blocks": [
                {
                  "type": "p",
                  "text": "W ramach szkolenia pracowników stosuj skalę ACVPU jako prosty, uporządkowany sposób opisania stanu świadomości poszkodowanego."
                },
                {
                  "type": "p",
                  "text": "Skala pomaga przekazać informację innemu ratownikowi, dyspozytorowi medycznemu lub zespołowi ratownictwa medycznego oraz zauważyć pogarszanie się stanu poszkodowanego."
                },
                {
                  "type": "scheme",
                  "items": [
                    {
                      "label": "A",
                      "title": "Alert",
                      "text": "Poszkodowany jest przytomny, samodzielnie otwiera oczy, nawiązuje logiczny kontakt i prawidłowo reaguje na otoczenie."
                    },
                    {
                      "label": "C",
                      "title": "Confusion",
                      "text": "Poszkodowany jest przytomny, ale jest zdezorientowany, nie wie, gdzie się znajduje, nie pamięta zdarzenia, odpowiada nielogicznie, jest splątany lub zachowuje się inaczej niż zwykle."
                    },
                    {
                      "label": "V",
                      "title": "Voice",
                      "text": "Poszkodowany nie reaguje spontanicznie, ale reaguje na głos, np. otwiera oczy, odpowiada, wykonuje polecenie lub porusza się po zawołaniu."
                    },
                    {
                      "label": "P",
                      "title": "Pain",
                      "text": "Poszkodowany nie reaguje na głos, ale reaguje dopiero na bezpieczny bodziec bólowy."
                    },
                    {
                      "label": "U",
                      "title": "Unresponsive",
                      "text": "Poszkodowany nie wykazuje prawidłowej reakcji na głos ani inne bezpieczne próby nawiązania kontaktu."
                    }
                  ]
                },
                {
                  "type": "note",
                  "tone": "warning",
                  "text": "Nowe lub narastające splątanie jest objawem alarmowym."
                },
                {
                  "type": "p",
                  "text": "Ocena kategorii P ma przede wszystkim charakter szkoleniowy. Nie należy stosować agresywnych bodźców bólowych ani wykonywać czynności mogących spowodować dodatkowy uraz."
                },
                {
                  "type": "p",
                  "text": "U dzieci, niemowląt oraz osób z podejrzeniem urazu nie należy rutynowo stosować bodźców bólowych."
                },
                {
                  "type": "subheading",
                  "text": "Jak oceniać?"
                },
                {
                  "type": "numbered",
                  "items": [
                    "Podejdź od strony widocznej dla poszkodowanego.",
                    "Przedstaw się.",
                    "Zapytaj głośno: „Czy wszystko w porządku?”, „Czy mnie słyszysz?”.",
                    "Poproś o wykonanie prostego polecenia.",
                    "Jeżeli nie reaguje, delikatnie potrząśnij osobę dorosłą za ramiona i ponownie zawołaj.",
                    "Określ poziom reakcji według ACVPU.",
                    "Każde pogorszenie, np. A → C → V → U, traktuj jako sygnał alarmowy."
                  ]
                },
                {
                  "type": "note",
                  "tone": "danger",
                  "text": "WAŻNE: ocena ACVPU nie może opóźniać wezwania pomocy ani oceny oddechu. Jeżeli poszkodowany nie reaguje i nie oddycha prawidłowo, należy rozpocząć RKO."
                },
                {
                  "type": "p",
                  "text": "Jeżeli osoba ma obniżony poziom świadomości, ale oddycha prawidłowo i nie spełnia kryteriów rozpoczęcia RKO, należy stale kontrolować jej stan."
                },
                {
                  "type": "p",
                  "text": "Pozycję bezpieczną można zastosować u osoby oddychającej prawidłowo z obniżonym poziomem świadomości, jeżeli nie występują okoliczności przemawiające przeciw jej przemieszczaniu."
                },
                {
                  "type": "note",
                  "tone": "warning",
                  "text": "Nie stosuj rutynowo pozycji bezpiecznej przy urazie ani przy oddechu agonalnym."
                }
              ]
            },
            {
              "title": "PODGRUPA 3 · Dorosły — ocena poszkodowanego",
              "blocks": [
                {
                  "type": "p",
                  "text": "Postępuj według schematu XABCDE."
                },
                {
                  "type": "subheading",
                  "text": "X — masywny krwotok"
                },
                {
                  "type": "p",
                  "text": "Sprawdź, czy występuje krwotok bezpośrednio zagrażający życiu."
                },
                {
                  "type": "bullets",
                  "items": [
                    "zastosuj silny bezpośredni ucisk",
                    "zastosuj odpowiedni opatrunek",
                    "przy masywnym krwotoku z kończyny rozważ opaskę uciskową zgodnie z procedurą"
                  ]
                },
                {
                  "type": "p",
                  "text": "Nie przechodź dalej, dopóki nie podjąłeś działania zmierzającego do opanowania masywnego krwotoku."
                },
                {
                  "type": "subheading",
                  "text": "A — drogi oddechowe"
                },
                {
                  "type": "p",
                  "text": "Oceń, czy drogi oddechowe są drożne."
                },
                {
                  "type": "p",
                  "text": "Jeżeli osoba jest nieprzytomna, udrożnij drogi oddechowe metodą odchylenia głowy i uniesienia żuchwy."
                },
                {
                  "type": "p",
                  "text": "Przy podejrzeniu urazu szyi ogranicz niepotrzebne ruchy głowy i szyi. Osoba odpowiednio przeszkolona może zastosować wysunięcie żuchwy."
                },
                {
                  "type": "note",
                  "tone": "info",
                  "text": "Zapewnienie drożności dróg oddechowych ma pierwszeństwo przed obawą o ruch kręgosłupa."
                },
                {
                  "type": "subheading",
                  "text": "B — oddychanie"
                },
                {
                  "type": "p",
                  "text": "Oceń oddech przez maksymalnie 10 sekund:"
                },
                {
                  "type": "bullets",
                  "items": [
                    "patrz na ruchy klatki piersiowej",
                    "słuchaj oddechu",
                    "wyczuwaj przepływ powietrza"
                  ]
                },
                {
                  "type": "p",
                  "text": "Pojedyncze westchnienia, gasping, nieregularne lub agonalne ruchy oddechowe nie są prawidłowym oddechem."
                },
                {
                  "type": "metric",
                  "label": "Oddech dorosłego",
                  "value": "12–20/min",
                  "extra": "około 2,0–3,3 oddechu w 10 sekund"
                },
                {
                  "type": "p",
                  "text": "W praktyce 10 sekund służy przede wszystkim do oceny, czy oddech jest prawidłowy, a nie do dokładnego wyliczenia częstości."
                },
                {
                  "type": "note",
                  "tone": "danger",
                  "text": "Brak prawidłowego oddechu → przerwij dalszą ocenę XABCDE → rozpocznij RKO i zastosuj AED."
                },
                {
                  "type": "subheading",
                  "text": "C — krążenie"
                },
                {
                  "type": "p",
                  "text": "Jeżeli poszkodowany oddycha prawidłowo:"
                },
                {
                  "type": "bullets",
                  "items": [
                    "oceń kolor skóry",
                    "temperaturę skóry",
                    "wilgotność skóry",
                    "widoczne krwawienie",
                    "objawy wstrząsu",
                    "pogorszenie stanu świadomości"
                  ]
                },
                {
                  "type": "metric",
                  "label": "Tętno dorosłego",
                  "value": "60–100/min",
                  "extra": "około 10–16,7 uderzenia w 10 sekund"
                },
                {
                  "type": "p",
                  "text": "Pomiar tętna może być wykorzystywany szkoleniowo i do monitorowania stanu poszkodowanego, jeśli osoba udzielająca pomocy potrafi go wykonać."
                },
                {
                  "type": "note",
                  "tone": "warning",
                  "text": "Brak wyczuwalnego tętna nie powinien być dla osoby udzielającej podstawowej pierwszej pomocy jedynym kryterium rozpoczęcia RKO."
                },
                {
                  "type": "subheading",
                  "text": "D — świadomość i neurologia"
                },
                {
                  "type": "bullets",
                  "items": [
                    "ACVPU",
                    "mowę",
                    "symetrię twarzy",
                    "ruch kończyn",
                    "nagły niedowład",
                    "drgawki",
                    "nietypowe zachowanie",
                    "narastające splątanie"
                  ]
                },
                {
                  "type": "subheading",
                  "text": "E — ekspozycja i dalsza ocena"
                },
                {
                  "type": "bullets",
                  "items": [
                    "inne urazy",
                    "rany",
                    "deformacje",
                    "oparzenia",
                    "wysypka",
                    "obrzęki",
                    "inne nieprawidłowości"
                  ]
                },
                {
                  "type": "p",
                  "text": "Odsłaniaj tylko tyle ciała, ile jest konieczne do oceny."
                },
                {
                  "type": "p",
                  "text": "Chroń poszkodowanego przed wychłodzeniem i zapewnij mu możliwie dużo prywatności."
                },
                {
                  "type": "subheading",
                  "text": "Dalsze działania"
                },
                {
                  "type": "bullets",
                  "items": [
                    "stale obserwuj poszkodowanego",
                    "regularnie powtarzaj XABCDE",
                    "zwracaj uwagę na zmianę ACVPU",
                    "kontroluj oddech",
                    "chroń przed wychłodzeniem",
                    "przygotuj informacje dla ZRM"
                  ]
                }
              ]
            },
            {
              "title": "PODGRUPA 4 · Dziecko — ocena poszkodowanego",
              "blocks": [
                {
                  "type": "p",
                  "text": "Postępuj według schematu XABCDE, dostosowując działania do wieku i wielkości dziecka."
                },
                {
                  "type": "subheading",
                  "text": "X — masywny krwotok"
                },
                {
                  "type": "p",
                  "text": "Natychmiast rozpoznaj i rozpocznij tamowanie krwotoku zagrażającego życiu."
                },
                {
                  "type": "subheading",
                  "text": "A — drogi oddechowe"
                },
                {
                  "type": "p",
                  "text": "Oceń drożność dróg oddechowych. U małego dziecka nie odginaj głowy nadmiernie. Unosząc brodę, nie uciskaj tkanek miękkich pod żuchwą."
                },
                {
                  "type": "subheading",
                  "text": "B — oddychanie"
                },
                {
                  "type": "p",
                  "text": "Oceń oddech przez maksymalnie 10 sekund."
                },
                {
                  "type": "numbered",
                  "items": [
                    "Jeżeli dziecko nie reaguje i nie oddycha prawidłowo, wykonaj 5 początkowych oddechów ratowniczych.",
                    "Rozpocznij RKO.",
                    "Użyj AED tak szybko, jak jest to możliwe."
                  ]
                },
                {
                  "type": "p",
                  "text": "Dla osoby nieprzeszkolonej w PBLS po 5 oddechach stosuje się RKO 30:2. Osoba przeszkolona w pediatrycznym BLS może stosować 15:2."
                },
                {
                  "type": "procedure",
                  "label": "Przejdź do: RKO dziecka",
                  "procedureId": "rko-dziecko"
                },
                {
                  "type": "subheading",
                  "text": "C — krążenie"
                },
                {
                  "type": "bullets",
                  "items": [
                    "kolor i temperaturę skóry",
                    "stan ogólny",
                    "oznaki prawidłowego krążenia",
                    "czas nawrotu kapilarnego, jeśli potrafisz",
                    "pogorszenie świadomości"
                  ]
                },
                {
                  "type": "note",
                  "tone": "warning",
                  "text": "Pomiar tętna może być elementem monitorowania u osoby odpowiednio przeszkolonej, ale nie należy opóźniać RKO w celu poszukiwania tętna."
                },
                {
                  "type": "subheading",
                  "text": "D — świadomość i neurologia"
                },
                {
                  "type": "bullets",
                  "items": [
                    "ACVPU",
                    "zachowanie dziecka",
                    "kontakt",
                    "drgawki",
                    "nietypową senność",
                    "osłabienie",
                    "niedowład",
                    "inne objawy neurologiczne"
                  ]
                },
                {
                  "type": "subheading",
                  "text": "E — ekspozycja"
                },
                {
                  "type": "bullets",
                  "items": [
                    "urazy",
                    "wysypkę",
                    "oparzenia",
                    "obrzęki",
                    "nieprawidłowe ustawienie kończyn",
                    "inne zmiany"
                  ]
                },
                {
                  "type": "p",
                  "text": "Chroń dziecko przed wychłodzeniem."
                },
                {
                  "type": "subheading",
                  "text": "Dalsze działania"
                },
                {
                  "type": "bullets",
                  "items": [
                    "nie pozostawiaj dziecka samego",
                    "stale kontroluj oddech",
                    "ponawiaj XABCDE",
                    "obserwuj zmianę ACVPU",
                    "uspokajaj dziecko i opiekuna"
                  ]
                }
              ]
            },
            {
              "title": "PODGRUPA 5 · Niemowlę — ocena poszkodowanego",
              "blocks": [
                {
                  "type": "p",
                  "text": "Postępuj według schematu XABCDE."
                },
                {
                  "type": "subheading",
                  "text": "X — masywny krwotok"
                },
                {
                  "type": "p",
                  "text": "Sprawdź, czy występuje masywny krwotok. Zastosuj odpowiedni do miejsca urazu bezpośredni ucisk."
                },
                {
                  "type": "subheading",
                  "text": "A — drogi oddechowe"
                },
                {
                  "type": "p",
                  "text": "Utrzymuj głowę niemowlęcia w pozycji neutralnej. Delikatnie unieś żuchwę. Nie odginaj nadmiernie głowy, ponieważ może to pogorszyć drożność dróg oddechowych."
                },
                {
                  "type": "subheading",
                  "text": "B — oddychanie"
                },
                {
                  "type": "p",
                  "text": "Oceń oddech przez maksymalnie 10 sekund:"
                },
                {
                  "type": "bullets",
                  "items": [
                    "obserwuj ruchy klatki piersiowej",
                    "słuchaj oddechu",
                    "wyczuwaj przepływ powietrza"
                  ]
                },
                {
                  "type": "numbered",
                  "items": [
                    "Jeżeli niemowlę nie reaguje i nie oddycha prawidłowo, wykonaj 5 początkowych oddechów ratowniczych.",
                    "Rozpocznij RKO.",
                    "Zastosuj AED tak szybko, jak jest dostępny."
                  ]
                },
                {
                  "type": "p",
                  "text": "Preferowany jest tryb pediatryczny AED, jeżeli urządzenie go posiada."
                },
                {
                  "type": "p",
                  "text": "Jeżeli elektrody nie mieszczą się na klatce piersiowej bez zetknięcia się ze sobą, należy zastosować układ przód–tył zgodnie z instrukcją AED."
                },
                {
                  "type": "subheading",
                  "text": "C — krążenie"
                },
                {
                  "type": "bullets",
                  "items": [
                    "kolor skóry",
                    "temperaturę skóry",
                    "ruch",
                    "reakcję",
                    "ogólny wygląd",
                    "oznaki prawidłowego krążenia"
                  ]
                },
                {
                  "type": "note",
                  "tone": "warning",
                  "text": "Nie opóźniaj rozpoczęcia RKO w celu długiego poszukiwania tętna."
                },
                {
                  "type": "subheading",
                  "text": "D — świadomość i neurologia"
                },
                {
                  "type": "bullets",
                  "items": [
                    "reakcję",
                    "kontakt",
                    "wiotkość",
                    "nietypową senność",
                    "drgawki",
                    "zmianę zachowania"
                  ]
                },
                {
                  "type": "p",
                  "text": "ACVPU można wykorzystywać jako element szkoleniowego opisu stanu świadomości, pamiętając o ograniczeniach stosowania bodźców bólowych u niemowlęcia."
                },
                {
                  "type": "subheading",
                  "text": "E — ekspozycja"
                },
                {
                  "type": "bullets",
                  "items": [
                    "urazy",
                    "wysypkę",
                    "oparzenia",
                    "obrzęki",
                    "inne widoczne zmiany"
                  ]
                },
                {
                  "type": "p",
                  "text": "Ogranicz czas odsłonięcia ciała niemowlęcia i chroń je przed wychłodzeniem."
                },
                {
                  "type": "subheading",
                  "text": "Dalsze działania"
                },
                {
                  "type": "bullets",
                  "items": [
                    "stale kontroluj oddech",
                    "ponawiaj ocenę XABCDE",
                    "obserwuj zmianę stanu świadomości",
                    "chroń niemowlę przed utratą ciepła",
                    "przygotuj informacje dla zespołu ratownictwa medycznego"
                  ]
                }
              ]
            },
            {
              "title": "PODGRUPA 6 · Parametry życiowe — wartości orientacyjne do nauki",
              "blocks": [
                {
                  "type": "p",
                  "text": "Poniższe wartości służą przede wszystkim do szkolenia, obserwacji i rozpoznawania odchyleń."
                },
                {
                  "type": "p",
                  "text": "Nie należy traktować jednej wartości jako samodzielnego kryterium rozpoznania stanu zagrożenia życia."
                },
                {
                  "type": "p",
                  "text": "Wartości u dzieci zmieniają się stopniowo wraz z wiekiem."
                },
                {
                  "type": "table",
                  "headers": [
                    "Wiek",
                    "Oddech/min",
                    "Orientacyjnie / 10 s",
                    "Tętno/min",
                    "Orientacyjnie / 10 s"
                  ],
                  "rows": [
                    [
                      "ok. 1 miesiąca",
                      "25–60",
                      "4,2–10",
                      "110–180",
                      "18,3–30"
                    ],
                    [
                      "ok. 1 roku",
                      "20–50",
                      "3,3–8,3",
                      "100–170",
                      "16,7–28,3"
                    ],
                    [
                      "ok. 2 lat",
                      "18–40",
                      "3–6,7",
                      "90–160",
                      "15–26,7"
                    ],
                    [
                      "ok. 5 lat",
                      "17–30",
                      "2,8–5",
                      "70–140",
                      "11,7–23,3"
                    ],
                    [
                      "ok. 10 lat",
                      "14–25",
                      "2,3–4,2",
                      "60–120",
                      "10–20"
                    ],
                    [
                      "ok. 18 lat / dorosły",
                      "12–20",
                      "2–3,3",
                      "60–100",
                      "10–16,7"
                    ]
                  ]
                },
                {
                  "type": "note",
                  "tone": "info",
                  "text": "UWAGA SZKOLENIOWA: przeliczenie na 10 sekund ma ułatwiać naukę i szybką orientację. Ze względu na krótki czas obserwacji nie jest ono tak dokładne jak pomiar wykonywany przez dłuższy okres."
                },
                {
                  "type": "note",
                  "tone": "danger",
                  "text": "Przy podejrzeniu zatrzymania krążenia najważniejsze są brak prawidłowej reakcji i brak prawidłowego oddechu. Nie opóźniaj RKO w celu dokładnego liczenia tętna."
                }
              ]
            }
          ]
        },
        {
          "title": "GRUPA III · Stany nagłe i bezpośrednie zagrożenie życia",
          "subgroups": [
            {
              "title": "PODGRUPA 1 · Osoba dorosła",
              "topics": [
                {
                  "title": "Utrata przytomności — dorosły",
                  "path": "firstaid/ocena-dorosly"
                },
                {
                  "title": "Utrata przytomności — kobieta w ciąży",
                  "path": "firstaid/ocena-ciaza"
                },
                {
                  "title": "Udrożnienie dróg oddechowych — dorosły",
                  "path": "firstaid/drogi-oddechowe-dorosly"
                },
                {
                  "title": "Zadławienie — dorosły",
                  "path": "firstaid/zadlawienie-dorosly",
                  "procedureId": "zadlawienie"
                },
                {
                  "title": "RKO i AED — dorosły",
                  "path": "firstaid/rko-dorosly",
                  "procedureId": "rko-dorosly"
                },
                {
                  "title": "RKO i AED — kobieta w ciąży",
                  "path": "firstaid/rko-ciaza"
                }
              ]
            },
            {
              "title": "PODGRUPA 2 · Dziecko",
              "topics": [
                {
                  "title": "Udrożnienie dróg oddechowych — dziecko",
                  "path": "firstaid/drogi-oddechowe-dziecko"
                },
                {
                  "title": "Utrata przytomności — dziecko",
                  "path": "firstaid/ocena-dziecko"
                },
                {
                  "title": "Zadławienie — dziecko",
                  "path": "firstaid/zadlawienie-dziecko"
                },
                {
                  "title": "RKO i AED — dziecko",
                  "path": "firstaid/rko-dziecko",
                  "procedureId": "rko-dziecko"
                }
              ]
            },
            {
              "title": "PODGRUPA 3 · Niemowlę",
              "topics": [
                {
                  "title": "Udrożnienie dróg oddechowych — niemowlę",
                  "path": "firstaid/drogi-oddechowe-niemowle"
                },
                {
                  "title": "Utrata przytomności — niemowlę",
                  "path": "firstaid/ocena-niemowle"
                },
                {
                  "title": "Zadławienie — niemowlę",
                  "path": "firstaid/zadlawienie-niemowle"
                },
                {
                  "title": "RKO i AED — niemowlę",
                  "path": "firstaid/rko-niemowle"
                }
              ]
            },
            {
              "title": "PODGRUPA 4 · Pozostałe stany nagłe",
              "blocks": [
                {
                  "type": "p",
                  "text": "Poniższe stany mogą wystąpić u poszkodowanych w różnych grupach wiekowych."
                },
                {
                  "type": "p",
                  "text": "Objawy, wartości prawidłowe oraz szczegóły postępowania mogą różnić się zależnie od wieku, stanu poszkodowanego oraz przyczyny zdarzenia."
                },
                {
                  "type": "p",
                  "text": "W poszczególnych procedurach należy wskazać odrębności dotyczące dorosłych, dzieci, niemowląt oraz kobiet w ciąży — jeżeli ciąża wpływa na sposób postępowania."
                }
              ],
              "topics": [
                {
                  "title": "Duszność i ocena oddychania — tlenoterapia dla osób odpowiednio przeszkolonych",
                  "path": "firstaid/trudnosci-oddechowe"
                },
                {
                  "title": "Anafilaksja",
                  "path": "firstaid/anafilaksja"
                },
                {
                  "title": "Ból w klatce piersiowej — podejrzenie zawału",
                  "path": "firstaid/zawal"
                },
                {
                  "title": "Wstrząs i ochrona termiczna",
                  "path": "firstaid/wstrzas"
                },
                {
                  "title": "Drgawki",
                  "path": "firstaid/drgawki",
                  "procedureId": "drgawki"
                },
                {
                  "title": "Hipoglikemia — niski poziom cukru",
                  "path": "firstaid/hipoglikemia"
                },
                {
                  "title": "Hiperglikemia",
                  "path": "firstaid/hiperglikemia"
                },
                {
                  "title": "Podejrzenie udaru",
                  "path": "firstaid/udar",
                  "procedureId": "udar"
                },
                {
                  "title": "Omdlenie",
                  "path": "firstaid/omdlenie"
                }
              ]
            }
          ]
        },
        {
          "title": "GRUPA IV · Urazy, rany i krwotoki",
          "subgroups": [
            {
              "title": "PODGRUPA 1 · Krwotoki i rany",
              "topics": [
                {
                  "title": "Masywny krwotok",
                  "path": "firstaid/krwotok",
                  "procedureId": "krwotok"
                },
                {
                  "title": "Krwawienie i opatrunki",
                  "path": "firstaid/krwawienie-opatrunki"
                },
                {
                  "title": "Opatrunek uciskowy",
                  "path": "firstaid/opatrunek-uciskowy"
                },
                {
                  "title": "Rany — zasady ogólne",
                  "path": "firstaid/rany"
                },
                {
                  "title": "Ciało obce w ranie",
                  "path": "firstaid/cialo-obce-rana"
                },
                {
                  "title": "Rana penetrująca kończyny",
                  "path": "firstaid/rana-penetrujaca-konczyna"
                },
                {
                  "title": "Rana penetrująca brzucha",
                  "path": "firstaid/rana-penetrujaca-brzuch"
                },
                {
                  "title": "Otwarta / penetrująca rana klatki piersiowej",
                  "path": "firstaid/rana-klatki-piersiowej"
                },
                {
                  "title": "Amputacja urazowa",
                  "path": "firstaid/amputacja"
                }
              ]
            },
            {
              "title": "PODGRUPA 2 · Urazy",
              "topics": [
                {
                  "title": "Uraz głowy",
                  "path": "firstaid/uraz-glowy"
                },
                {
                  "title": "Podejrzenie urazu kręgosłupa",
                  "path": "firstaid/uraz-kregoslupa"
                },
                {
                  "title": "Podejrzenie urazu miednicy",
                  "path": "firstaid/uraz-miednicy"
                },
                {
                  "title": "Uraz klatki piersiowej",
                  "path": "firstaid/uraz-klatki"
                },
                {
                  "title": "Uraz brzucha",
                  "path": "firstaid/uraz-brzucha"
                },
                {
                  "title": "Uraz kończyny",
                  "path": "firstaid/uraz-konczyny"
                },
                {
                  "title": "Skręcenie",
                  "path": "firstaid/skrecenie"
                },
                {
                  "title": "Zwichnięcie",
                  "path": "firstaid/zwichniecie"
                },
                {
                  "title": "Złamanie",
                  "path": "firstaid/zlamanie"
                },
                {
                  "title": "Przygniecenie / zmiażdżenie",
                  "path": "firstaid/zmiazdzenie"
                }
              ]
            }
          ]
        },
        {
          "title": "GRUPA V · Czynniki środowiskowe",
          "topics": [
            {
              "title": "Oparzenie termiczne",
              "path": "firstaid/oparzenie",
              "procedureId": "oparzenie"
            },
            {
              "title": "Oparzenie chemiczne",
              "path": "firstaid/oparzenie-chemiczne"
            },
            {
              "title": "Porażenie prądem",
              "path": "firstaid/porazenie-pradem",
              "procedureId": "porazenie-pradem"
            },
            {
              "title": "Wychłodzenie i hipotermia",
              "path": "firstaid/wychlodzenie"
            },
            {
              "title": "Odmrożenie",
              "path": "firstaid/odmrozenie"
            },
            {
              "title": "Przegrzanie",
              "path": "firstaid/przegrzanie"
            },
            {
              "title": "Udar cieplny",
              "path": "firstaid/udar-cieplny"
            },
            {
              "title": "Podtopienie / tonięcie",
              "path": "firstaid/podtopienie"
            }
          ]
        }
      ]
    },
    defaultState: {
      schemaVersion: 2,
      aeds: [
        {
          id: 'aed-1',
          name: 'AED — wejście główne',
          location: 'Dane demonstracyjne: Zakład A, budynek administracyjny, parter',
          lat: 52.402,
          lon: 16.949,
          available: true,
          access: 'Dostęp 24/7 przy portierni',
          manufacturer: 'Producent demonstracyjny',
          model: 'Model A1',
          serialNumber: 'DEMO-AED-001',
          lastInspection: '2026-08-15',
          nextInspection: '2027-02-15',
          electrodesExpiry: '2028-06-30',
          batteryExpiry: '2029-12-31',
          notes: ''
        },
        {
          id: 'aed-2',
          name: 'AED — hala szkoleniowa',
          location: 'Dane demonstracyjne: Zakład B, przy recepcji',
          lat: 52.400,
          lon: 16.944,
          available: true,
          access: 'Dostęp w godzinach pracy obiektu',
          manufacturer: 'Producent demonstracyjny',
          model: 'Model B2',
          serialNumber: 'DEMO-AED-002',
          lastInspection: '2026-07-10',
          nextInspection: '2026-10-20',
          electrodesExpiry: '2026-11-15',
          batteryExpiry: '2027-11-30',
          notes: 'Przykład terminów wymagających uwagi.'
        },
        {
          id: 'aed-3',
          name: 'AED — samochód patrolowy',
          location: 'Dane demonstracyjne: brygada utrzymania',
          lat: 52.405,
          lon: 16.955,
          available: false,
          access: 'Czasowo niedostępny — przykład demonstracyjny',
          manufacturer: 'Producent demonstracyjny',
          model: 'Model C3',
          serialNumber: 'DEMO-AED-003',
          lastInspection: '2026-02-20',
          nextInspection: '2026-08-20',
          electrodesExpiry: '2027-04-30',
          batteryExpiry: '2026-08-10',
          notes: 'Przykład urządzenia wyłączonego z użycia.'
        }
      ],
      kits: [
        {
          id: 'kit-1',
          name: 'Apteczka — portiernia',
          location: 'Dane demonstracyjne: Zakład A, portiernia główna',
          lat: 52.4016,
          lon: 16.9486,
          type: 'zakładowa',
          available: true,
          lastInspection: '2026-08-15',
          nextInspection: '2027-01-15',
          contents: 'Rękawiczki, opatrunki, bandaże, maseczka CPR, koc termiczny',
          items: [
            { name: 'Rękawiczki nitrylowe — para', quantity: 8, minimum: 4, expiry: '2029-12-31' },
            { name: 'Opatrunek indywidualny', quantity: 6, minimum: 3, expiry: '2028-10-31' },
            { name: 'Koc termiczny', quantity: 3, minimum: 2, expiry: '' }
          ]
        },
        {
          id: 'kit-2',
          name: 'Apteczka — hala 2',
          location: 'Dane demonstracyjne: Zakład A, przy wejściu',
          lat: 52.4004,
          lon: 16.9461,
          type: 'zakładowa',
          available: true,
          lastInspection: '2026-07-10',
          nextInspection: '2026-10-10',
          contents: 'Rękawiczki, gaziki, opaska elastyczna, chusta, nożyczki',
          items: [
            { name: 'Rękawiczki nitrylowe — para', quantity: 4, minimum: 4, expiry: '2029-12-31' },
            { name: 'Kompres jałowy', quantity: 5, minimum: 3, expiry: '2026-11-10' },
            { name: 'Chusta trójkątna', quantity: 2, minimum: 2, expiry: '' }
          ]
        },
        {
          id: 'kit-3',
          name: 'Apteczka — pojazd techniczny',
          location: 'Dane demonstracyjne: Zakład B, samochód służbowy',
          lat: 52.4047,
          lon: 16.9544,
          type: 'samochodowa',
          available: true,
          lastInspection: '2026-02-01',
          nextInspection: '2026-08-01',
          contents: 'Opatrunki, hydrożele, plastry, bandaże, koc termiczny',
          items: [
            { name: 'Opatrunek indywidualny', quantity: 0, minimum: 2, expiry: '2027-04-30' },
            { name: 'Opatrunek hydrożelowy', quantity: 1, minimum: 1, expiry: '2026-08-01' },
            { name: 'Koc termiczny', quantity: 1, minimum: 2, expiry: '' }
          ]
        }
      ],
      location: null,
      preferences: {
        darkMode: false,
        largeText: false
      }
    }
  };
}());

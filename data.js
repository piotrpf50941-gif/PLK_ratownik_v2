(function () {
  'use strict';

  const sourceUrl = 'https://www.erc.edu/science-research/guidelines/guidelines-2025/guidelines-2025-english/';

  window.RATOWNIK_DATA = {
    version: '2.6.0',
    reviewedAt: '2026-08-29',
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

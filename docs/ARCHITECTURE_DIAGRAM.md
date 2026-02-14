# ARCHITECTURE_DIAGRAM v1.0
Logiczna architektura systemu

Status: obowiązujący
Wersja: 1.0
Owner: Web Project Manager


============================================================
1. Cel dokumentu
============================================================

Dokument opisuje logiczny podział systemu
oraz przepływ danych między modułami.

To nie jest diagram graficzny.
To jest diagram strukturalny w formie tekstowej.


============================================================
2. Warstwy systemu
============================================================

[ WARSTWA 1 ]  KLIENT
------------------------------------------------------------
- Allegro (zakup po transakcji)
- PrestaShop (projekt przed koszykiem)
- przyszłe kanały sprzedaży


[ WARSTWA 2 ]  LINK GENERATOR
------------------------------------------------------------
- generowanie linku do edytora
- przekazanie:
    order
    sku
    qty
    buyer
    token


[ WARSTWA 3 ]  EDITOR CORE
------------------------------------------------------------
Frontend:
- editor.js
- index.html
- style.css

Odpowiada za:
- render
- maski
- szablony
- multi-slot
- export
- upload


[ WARSTWA 4 ]  API
------------------------------------------------------------
- project.php
- upload.php
- templates.php

Odpowiada za:
- konfigurację produktu
- zapis plików
- walidację tokena
- autoryzację


[ WARSTWA 5 ]  STORAGE
------------------------------------------------------------
/uploads/
   /{order_directory}/
        pliki jpg
        pliki json
        arkusze produkcyjne


[ WARSTWA 6 ]  ADMIN PANEL (future)
------------------------------------------------------------
- przegląd zamówień
- status produkcji
- generowanie tokenów
- retencja plików


============================================================
3. Przepływ Allegro
============================================================

Klient kupuje →
System wysyła mail →
Link zawiera:
  ?order=...
  &sku=...
  &qty=...
  &buyer=...
  &token=...

Editor:
  - ładuje config
  - generuje projekty
  - uploaduje pliki
  - zapisuje JSON

Pliki trafiają do:
  /uploads/{order}/


============================================================
4. Przepływ PrestaShop
============================================================

Klient:
  wchodzi na stronę produktu →
  projektuje →
  dodaje do koszyka →
  zapis projektu powiązany z zamówieniem

(tryb pre-cart)


============================================================
5. Zasady architektoniczne
============================================================

1. Editor Core jest niezależny od kanału sprzedaży.
2. Kanały przekazują dane przez URL / token.
3. API jest cienką warstwą walidacji i zapisu.
4. Storage jest prosty (filesystem).
5. Admin Panel nie ingeruje w Editor Core.


============================================================
6. Docelowa architektura SaaS-ready
============================================================

W przyszłości:

[ Tenant ]
    ├── własne produkty
    ├── własne szablony
    ├── własne tokeny

System musi umożliwiać:
- izolację klientów
- oddzielne katalogi
- oddzielne konfiguracje


============================================================
KONIEC DOKUMENTU
============================================================

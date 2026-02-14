# PRODUCT_MODEL v1.0
Model produktu – skalowalna platforma edytorów

Status: obowiązujący
Wersja: 1.0
Owner: Web Project Manager


------------------------------------------------------------
1. Cel dokumentu
------------------------------------------------------------

Celem jest zdefiniowanie uniwersalnego modelu produktu,
który pozwoli obsługiwać:

- podkładki
- puzzle
- plakaty
- zdjęcia
- future personalizowane produkty

System musi być otwarty na nowe typy produktów bez refaktoryzacji rdzenia.


------------------------------------------------------------
2. Definicja produktu (Product Definition)
------------------------------------------------------------

Każdy produkt w systemie składa się z:

1) Typ produktu (type)
2) Wymiar fizyczny (size_mm)
3) Kształt (shape)
4) DPI produkcyjne
5) Render configuration
6) Zasoby (maski / szablony)
7) Reguły produkcyjne


------------------------------------------------------------
3. Struktura logiczna produktu
------------------------------------------------------------

Product {

  id: string
  type: string                // coaster, puzzle, poster, photo, future
  sku: string                 // identyfikator handlowy
  name: string

  physical: {
    width_mm: number
    height_mm: number
    depth_mm?: number
    corner_radius_mm?: number
    shape_options: string[]
  }

  render: {
    canvas_px: number
    print_dpi: number
    cut_ratio?: number
  }

  templates: {
    folder: string
    auto_scan: boolean
  }

  production: {
    allow_multi_slots: boolean
    allow_quantity_distribution: boolean
    generate_sheet: boolean
  }

  integrations: {
    allegro_enabled: boolean
    prestashop_enabled: boolean
  }

}


------------------------------------------------------------
4. Typy produktów (v1.0)
------------------------------------------------------------

coaster
- multi slot: TAK
- arkusz produkcyjny: TAK
- shape: square / circle

puzzle
- multi slot: NIE
- arkusz produkcyjny: NIE
- shape: rectangle

poster
- multi slot: NIE
- arkusz produkcyjny: NIE
- różne rozmiary ISO i klasyczne

photo
- multi slot: NIE


------------------------------------------------------------
5. Zasady skalowalności
------------------------------------------------------------

1. Każdy nowy produkt dodawany jest jako nowa konfiguracja,
   nie jako modyfikacja kodu rdzenia.

2. Edytor nie zawiera logiki specyficznej dla produktu.
   Produkt steruje edytorem przez konfigurację.

3. SKU jest identyfikatorem biznesowym,
   ale system działa na ID produktu.

4. Produkt może mieć wiele wariantów,
   ale rdzeń edytora pozostaje wspólny.


------------------------------------------------------------
6. Reguła przyszłości (Future-proofing)
------------------------------------------------------------

Jeśli nowy produkt wymaga:

- innych proporcji
- innych masek
- innych zasad arkusza
- innych reguł uploadu

Dodajemy rozszerzenie w modelu,
nie zmieniamy istniejących pól.


------------------------------------------------------------
7. Zależność od DATA_CONTRACT
------------------------------------------------------------

Product Model musi być zgodny z:

DATA_CONTRACT v1.0

Zmiana modelu produktu wymaga:
- aktualizacji DATA_CONTRACT
- aktualizacji dokumentacji
- decyzji architektonicznej (ADR)


------------------------------------------------------------
KONIEC DOKUMENTU
------------------------------------------------------------

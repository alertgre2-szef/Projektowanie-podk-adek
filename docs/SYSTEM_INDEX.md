# SYSTEM_INDEX — Edytor Podkładek (Allegro)
VERSION: 1.0
STATUS: SOURCE OF TRUTH

Ten dokument definiuje strukturę wiedzy projektu.
Każda decyzja techniczna musi być zgodna z dokumentami poniżej.

## Dokumenty systemowe
1) CORE_ARCHITECTURE.md
   - parametry URL
   - klucze danych (buyer/order)
   - struktura katalogów
   - nazewnictwo plików
   - tryby DEMO/PRODUKCJA
   - kontrakt tokenów i uploadu
   - kontrakt slots/qty

2) FLOW_SYSTEMU.md
   - ścieżka Allegro → mail → edytor → eksport → upload → produkcja

3) UX_CONTRACT.md
   - zasady działania UI, walidacje, komunikaty, blokady

## Zasada pracy
- Jeśli nie jestem pewien szczegółu: wskazuję, którego dokumentu dotyczy pytanie i proszę o fragment / potwierdzenie.
- Jeśli zmiana narusza dokument: najpierw aktualizacja dokumentu, dopiero potem kod.

## Kanoniczne źródła
### Mail (Niezbędnik Sprzedawcy)
- KANONICZNA wersja template: **2026-02-13-NS-01** (ta z token=TEST123 i parametrami: order, offerId, qty, buyer).
- W repo ma istnieć tylko jeden plik „aktywny” template (pozostałe wersje trzymamy w /docs/archive).

Rekomendowana struktura:
- /docs/mail/TEMPLATE_ACTIVE.jinja2        (jedyny aktywny)
- /docs/mail/archive/*.jinja2              (archiwum, nieużywane)

---

## Appendix A — PLAN DO WDROŻENIA ALLEGRO (operacyjny status)
PROJEKT EDYTORA PODKŁADEK — PLAN DO WDROŻENIA ALLEGRO

✅ ZROBIONE
- System wielu podkładek (sloty / sztuki)
- Walidacja brakujących zdjęć
- Twarda blokada eksportu
- Komunikaty wskazujące brakujące podkładki
- Automatyczne przejście do brakującej sztuki
- Tryb eksportu projektu
- Obsługa kształtów i szablonów
- UX drag / zoom / kadrowanie

⬜ DO ZROBIENIA — WYMAGANE DO ALLEGRO
- Obsługa parametru qty z linku Allegro
- Bezpieczne parsowanie parametrów URL
- Blokada podwójnego eksportu
- Obsługa błędów eksportu
- Integracja eksport → upload → zapis projektu
- Mail Allegro → link do edytora
- Tryb produkcyjny (wyłączenie debug/test)

🔵 OPCJONALNE — PO WDROŻENIU
- Miniatury projektów
- Rozszerzona historia undo
- Auto-save projektu
- Kontrola DPI / jakości wydruku

CEL KOŃCOWY
Zakup → mail → edytor → projekt → eksport → gotowe do produkcji
Zero ręcznej obsługi.

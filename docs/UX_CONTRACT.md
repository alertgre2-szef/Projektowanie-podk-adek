# UX_CONTRACT — Edytor Podkładek
VERSION: 1.0
STATUS: ZASADY UI (nie zmieniać bez potrzeby)

## A) Stany i komunikaty
1) Brakujące zdjęcia:
- czerwony baner
- komunikat: "Brakuje zdjęcia w podkładce nr X"
- dla wielu: "Brakuje zdjęcia w podkładkach nr X i Y"
- automatyczne przejście do pierwszego brakującego slotu

2) Komplet:
- zielony baner: "Projekt gotowy…"

3) Demo:
- widoczny komunikat „tryb demo” (productionHint)
- preview: watermark + maska cięcia
- brak możliwości uploadu (przycisk wysyłki ukryty/disabled)

4) Produkcja:
- upload dostępny wyłącznie po tokenie
- watermark opcjonalny (decyzja UX), ale demo zawsze z watermarkiem

## B) Blokady bezpieczeństwa (UX + logika)
- twarda blokada eksportu jeśli projekt niekompletny
- blokada podwójnego eksportu (anti-double-submit)
- czytelna obsługa błędów eksportu/uploadu (z request_id jeśli dostępne)

## C) Mobile UX
- pinch/drag/zoom bez „przeskoków” między slotami
- stabilny focus slotu podczas gestów

## D) Reset projektu
- reset czyści localStorage tylko dla konkretnego projektu (buyer+order(+offerId))
- reset nie kasuje projektów innych zamówień/produktów

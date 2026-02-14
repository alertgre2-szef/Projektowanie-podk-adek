# FLOW_SYSTEMU — Allegro → Edytor → Produkcja
VERSION: 1.0

## Cel
Zakup → mail → edytor → projekt → eksport → upload → gotowe do produkcji
Zero ręcznej obsługi.

## 1) Allegro: zakup
Klient kupuje produkt z listy SKU „podkładki”.

## 2) Niezbędnik Sprzedawcy: mail po zakupie
Template:
- wykrywa pozycje podkładek po SKU (external.id)
- generuje dla każdej pozycji link do edytora z parametrami:
  - token
  - order (order.id)
  - offerId (lineItem.offer.id)
  - qty (lineItem.quantity lub przeliczone wg kompletów)
  - buyer (order.buyer.login)

## 3) Edytor: start sesji
Edytor:
- parsuje parametry URL bezpiecznie
- ustawia liczbę slotów:
  - slots jeśli jest
  - inaczej slots = qty
- wiąże localStorage z (buyer + order + offerId) aby nie mieszać projektów

## 4) Edycja projektu
Użytkownik:
- dodaje zdjęcia do slotów
- kadruje (drag/zoom/pinch)
- widzi preview (maska cięcia + watermark w demo)

## 5) Walidacja kompletności
- jeśli brakuje zdjęć → czerwony baner + lista numerów braków
- jeśli komplet → zielony baner „Projekt gotowy…”

## 6) Eksport
Po zatwierdzeniu:
- generujemy pliki produkcyjne per slot (NN z łączną liczbą QQ)
- blokujemy podwójny eksport (anty-duplikaty)
- obsługujemy błędy eksportu (czytelny komunikat)

## 7) Upload (produkcja)
Jeśli mode=production:
- upload.php przyjmuje pliki
- zapis do: uploads/{buyer}/
- nazwa: {order}_s{NN}of{QQ}.jpg (+ opcjonalnie .json)

Jeśli mode=demo:
- upload_url pusty / upload.php odmawia (403)

## 8) Wynik dla produkcji (obsługa Puzzla)
W katalogu buyer:
- komplet plików gotowych do druku (NN..QQ)
- brak ręcznego kontaktu o zdjęcia (dla podkładek)

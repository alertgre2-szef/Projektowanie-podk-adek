# CORE_ARCHITECTURE — Edytor Podkładek (Allegro)
VERSION: 1.0
STATUS: NIEZMIENNE ZAŁOŻENIA (zmiany tylko decyzją właściciela projektu)

## 1) Parametry wejścia (URL edytora)
Edytor musi obsłużyć parametry (z maila):
- token
- order
- offerId
- qty
- buyer
Opcjonalnie (przyszłościowo): slots

Przykład:
editor/?token=TEST123&order=123&offerId=coaster_square_100_r5&qty=3&buyer=test_user

UWAGA: w URL nie może być końcowego znaku "?" (np. buyer=test_user? jest błędne).

## 2) Klucze danych i separacja
- buyer = login Allegro (nick) → **klucz katalogu produkcyjnego**
- order = ID zamówienia → **klucz logiczny projektu w obrębie buyer** (żeby rozróżniać projekty tego samego buyer)

## 3) Struktura katalogów (produkcja)
Katalog produkcyjny:
uploads/{buyer}/

Nie tworzymy katalogów po order.
Order wchodzi w nazwę pliku (i/lub metadata), ale katalog jest po buyer.

## 4) Nazewnictwo plików produkcyjnych
Wzór:
{order}_s{NN}of{QQ}.{ext}

- NN: numer slotu (01..)
- QQ: łączna liczba slotów (qty lub slots, zależnie od kontraktu)
- ext: jpg/png (produkcyjnie preferowane jpg)

Przykład:
123_s01of03.jpg
123_s02of03.jpg
123_s03of03.jpg

## 5) Kontrakt slots / qty (docelowy standard)
Definicje:
- slots = liczba projektów do zaprojektowania (UX) — ile ekranów/slotów widzi klient
- qty   = liczba sztuk do produkcji (kopie)

Reguła:
- Jeśli nie używamy slots w linku: przyjmujemy **slots = qty**
- Dla kompletów (np. 6x...):
  - slots = 1
  - qty   = liczba kompletów * 6

Na dziś (minimalnie do Allegro):
- wymagane: qty
- opcjonalnie: slots (jeśli wdrożymy “komplety” w mailu)

## 6) Tryby systemu (DEMO vs PRODUKCJA)
DEMO:
- brak tokena lub token niepoprawny
- upload zabroniony
- backend project.php zwraca mode=demo i upload_url=""

PRODUKCJA:
- token poprawny
- upload dozwolony
- backend project.php zwraca mode=production i upload_url="/api/upload.php"

Opcjonalny bezpiecznik:
- mode=demo (jeśli obecny) → wymusza demo nawet z tokenem

## 7) Kontrakt tokena
Token służy wyłącznie do autoryzacji:
- project.php: wydanie productConfig dla produkcji
- upload.php: zezwolenie na zapis na serwerze

Token nie wpływa na:
- strukturę katalogów (katalog zawsze po buyer)
- nazewnictwo plików (zawsze oparte o order + slot)

## 8) Minimalne dane wysyłane do upload.php (front → backend)
Wymagane:
- plik obrazu (jpg/png)
- order_id = "{order}_sNNofQQ" (lub order_id=order i file_base=order_sNNofQQ — dopuszczalne)
- file_base = "{order}_sNNofQQ"
- buyer (jeśli backend będzie go przyjmował; katalog po buyer)

Uwaga:
- Jeśli backend tworzy katalog po buyer, musi mieć buyer w żądaniu lub w token-map.

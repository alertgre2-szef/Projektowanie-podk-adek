# ARCHITECTURE_DIAGRAM_VISUAL v1.0

Status: obowiązujący
Wersja: 1.0


```mermaid
flowchart TB

    subgraph SALES_CHANNELS
        A1[Allegro]
        A2[PrestaShop]
        A3[Inne kanały]
    end

    subgraph LINK_LAYER
        B1[Generator linku<br/>order + sku + qty + token]
    end

    subgraph EDITOR_CORE
        C1[Frontend Editor<br/>editor.js]
        C2[Rendering Engine]
        C3[Template Loader]
        C4[Multi-slot Logic]
        C5[Export Engine]
    end

    subgraph API_LAYER
        D1[project.php]
        D2[upload.php]
        D3[templates.php]
    end

    subgraph STORAGE
        E1[/uploads/{order}/<br/>jpg + json + sheet/]
    end

    subgraph ADMIN_PANEL
        F1[Zarządzanie zamówieniami]
        F2[Status produkcji]
        F3[Token management]
    end


    A1 --> B1
    A2 --> B1
    A3 --> B1

    B1 --> C1

    C1 --> C2
    C1 --> C3
    C1 --> C4
    C1 --> C5

    C1 --> D1
    C5 --> D2
    C3 --> D3

    D2 --> E1

    F1 --> E1
    F3 --> D1

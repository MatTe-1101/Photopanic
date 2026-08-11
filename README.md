# Photopanic - Photo organizer

App desktop Windows per organizzare foto del telefono in cartelle basate sui metadati.

## Funzioni

- Selezione di una o più cartelle origine e una cartella destinazione.
- Interfaccia guidata step-by-step: percorsi, metadati, organizzazione.
- Area ricerca separata dalla procedura guidata.
- Lettura metadati EXIF/XMP/IPTC con priorità su `DateTimeOriginal`, poi campi data alternativi.
- Controllo iniziale su un campione di foto prima di procedere.
- Rilevamento luoghi più chiaro: nomi luogo se presenti nei metadati, oppure conversione online delle coordinate GPS.
- Opzione “Dividi anche per luogo” abilitata solo quando sono disponibili metadati luogo/GPS.
- Se non c’è connessione internet o il servizio luoghi non risponde, Photopanic avvisa e organizza solo per anno/mese.
- Creazione automatica struttura `anno/mese/luogo`, per esempio `2026/03/Milano/foto.jpeg`.
- Fallback alla sola cartella mese se il luogo non è presente o se l’opzione luogo è disattivata.
- Copia o spostamento dei file.
- Barra di avanzamento con anteprime casuali delle foto.
- Indice `.photopanic-index.json` nella destinazione e ricerca per luogo, coordinate GPS, data o nome file.
- Pulsante “Buy me a coffee”.

## Avvio

```powershell
npm install
npm start
```

## Build Windows

```powershell
npm run package:win
```

## Build Linux

```powershell
npm run package:linux
```

## Build macOS

```powershell
npm run package:mac
```

## Build multipiattaforma

```powershell
npm run package:all
```

Nota: la build macOS generata da Windows può essere utile per test preliminari, ma firma, notarizzazione e distribuzione finale richiedono normalmente macOS.

## Note sui luoghi

Molti telefoni salvano solo coordinate GPS, non il nome della città. Photopanic converte quelle coordinate in città/area usando Nominatim di OpenStreetMap, con cache interna e limite di una richiesta al secondo. Se la conversione non è disponibile, non crea cartelle GPS grezze: mette le foto direttamente nella cartella del mese.

Nominatim richiede un uso leggero, un `User-Agent` identificabile e attribuzione a OpenStreetMap. Per raccolte molto grandi o uso commerciale conviene configurare un provider dedicato o una propria istanza.

## File supportati

`.jpg`, `.jpeg`, `.png`, `.heic`, `.heif`, `.tif`, `.tiff`, `.webp`

# smillaetommaso ♡

Piccolo sito statico romantico realizzato con HTML, CSS e JavaScript.

## Aprirlo sul computer

1. Estrai la cartella `smillaetommaso` dallo ZIP.
2. Apri la cartella in Visual Studio Code.
3. Avvia `index.html` con l'estensione **Live Server** (consigliato), oppure apri direttamente il file nel browser.

## Password dimostrativa

La password di prova è definita all'inizio di `script.js`, nella costante `SITE_PASSWORD`.

**Attenzione:** il controllo della password avviene nel browser e non protegge davvero i contenuti. Non pubblicare foto private finché non sarà stato aggiunto un sistema di autenticazione reale e un archivio protetto.

## Album fotografico

- Una pagina corrisponde a una data.
- Ogni giornata può contenere al massimo tre fotografie.
- Le pagine vengono ordinate automaticamente in ordine cronologico.
- L'indice permette di saltare al primo giorno di un determinato mese.
- Il pulsante **Aggiungi una foto** permette di scegliere la data e caricare un'immagine.
- Le foto caricate vengono salvate in IndexedDB nel browser e sul dispositivo utilizzato. Non vengono caricate online e non si sincronizzano con altri dispositivi.
- Le foto già presenti nel progetto si possono inserire nell'array `photos` in `script.js`, indicando `src`, `date` (formato `AAAA-MM-GG`) e, facoltativamente, `caption`.

Per rendere l'album condiviso tra dispositivi servirà collegare un servizio di archiviazione online e un'autenticazione vera.

## Playlist

Quando hai il link di condivisione della playlist Spotify, inseriscilo nella costante `SPOTIFY_PLAYLIST_URL` in `script.js`. Il player integrato mostrerà la playlist tramite il lettore ufficiale Spotify.

## Contatore

La data di inizio è impostata nella costante `START_DATE` in `script.js`.

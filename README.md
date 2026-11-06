# smillaetommaso ♡

Sito romantico realizzato con HTML, CSS e JavaScript. Mantiene il tema, la navigazione, l'album cronologico, la lettera, Macchia, il contatore e il lettore Spotify.

## Avvio locale

1. Installa Node.js 20.19+ o 22.12+.
2. Copia `.env.example` in `.env` e inserisci il Project URL e la Publishable Key Supabase, se disponibili.
3. Esegui `npm install` e `npm run dev`.
4. Per creare i file pubblicabili esegui `npm run build`; l'output è `dist/`.

Per i passaggi Supabase, la migrazione SQL, Cloudflare Pages e i limiti della fase senza autenticazione consulta [SETUP_GUIDE.md](SETUP_GUIDE.md).

## Fase corrente e privacy

In questa fase non è stato aggiunto alcun login o sistema account. La schermata password già presente è solo dimostrativa e non protegge il sito. Il bucket Storage `album` resta privato; le funzioni remote verificano una sessione Supabase e l'appartenenza a `album_members`. Fino all'attivazione dell'autenticazione, lettura, caricamento e cancellazione online restano bloccati. Non rendere pubblici i file per aggirare questo limite.

Se Supabase non è configurato, l'album continua a salvare le foto in IndexedDB sul browser/dispositivo corrente; la cronologia Spotify resta in `localStorage` sul dispositivo corrente. Questi dati locali non si sincronizzano.

## Contatore

La data e il calcolo del contatore restano definiti all'inizio di `script.js`.

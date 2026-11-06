# smillaetommaso ♡

Sito romantico realizzato con HTML, CSS e JavaScript. Mantiene il tema, la navigazione, l'album cronologico, la lettera, Macchia, il contatore e il lettore Spotify.

## Avvio locale

1. Installa Node.js 20.19+ o 22.12+.
2. Copia `.env.example` in `.env` e inserisci il Project URL e la Publishable Key Supabase, se disponibili.
3. Esegui `npm install` e `npm run dev`.
4. Per creare i file pubblicabili esegui `npm run build`; l'output è `dist/`.

Per la configurazione Supabase Auth, gli utenti autorizzati, la migrazione SQL e Cloudflare Pages consulta [SETUP_GUIDE.md](SETUP_GUIDE.md).

## Fase corrente e privacy

Con Supabase configurato, il sito richiede un accesso email/password tramite Supabase Auth e accetta solo gli account presenti in `album_members`. Non esiste registrazione nel sito. Il bucket Storage `album` resta privato e le policy RLS/Storage continuano a verificare l'autorizzazione sul server. Senza configurazione Supabase, rimane disponibile la schermata password dimostrativa solo per l'album locale: non protegge contenuti remoti.

Se Supabase non è configurato, l'album continua a salvare le foto in IndexedDB sul browser/dispositivo corrente; la cronologia Spotify resta in `localStorage` sul dispositivo corrente. Questi dati locali non si sincronizzano.

## Contatore

La data e il calcolo del contatore restano definiti all'inizio di `script.js`.

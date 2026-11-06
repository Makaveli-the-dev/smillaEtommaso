# Guida di configurazione — fase iniziale Supabase

Il sito resta vanilla HTML, CSS e JavaScript, con Vite solo per costruire il frontend e includere `@supabase/supabase-js`. La migrazione prepara il database e il bucket `album` privato. **In questa fase non viene aggiunto login, registrazione, gestione account o alcuna autenticazione nel sito.**

Le foto online private non sono ancora consultabili, caricabili o cancellabili dal sito finché non verrà realizzata l'autenticazione nella fase successiva. Supabase richiede una sessione autorizzata per leggere un bucket privato; il codice non aggira questo requisito e non crea URL pubblici. Le operazioni previste nel client verificano la sessione e l'appartenenza all'elenco `album_members` prima di procedere.

## 1. Valori pubblici del progetto Supabase

1. Apri il progetto Supabase già creato.
2. In **Project Settings → API** copia il **Project URL** e una **Publishable key**. Se nel progetto è ancora mostrata la vecchia chiave `anon`, può essere usata al posto della publishable key.
3. Nella cartella del sito crea il file locale `.env` copiando `.env.example`:

   ```powershell
   Copy-Item .env.example .env
   ```

4. Inserisci i due valori nel file `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<chiave-pubblicabile>
   ```

   Questi valori sono destinati al browser. **Non inserire mai `service_role`, secret key, password o credenziali amministrative** in `.env`, nel sito o in GitHub. Il file `.env` è escluso da Git.

## 2. Verifica preliminare dello schema e del bucket

Il progetto locale non contiene migrazioni Supabase precedenti, ma non posso vedere il database del tuo progetto dalla cartella. Prima di applicare la migrazione, controlla in **Table Editor** che non esistano già tabelle equivalenti chiamate `album_members`, `photos`, `playlists` o `site_settings`. La migrazione usa `CREATE TABLE` senza sovrascritture: se una tabella omonima esiste, si fermerà e dovrai confrontare gli schemi prima di proseguire.

In **Storage** verifica che esista il bucket `album`. La migrazione lo imposta esplicitamente come **privato**, con limite di 12 MiB e tipo `image/webp`. L'upload del sito ricodifica le foto in WebP prima di inviarle.

## 3. Migrazione SQL

1. Apri **SQL Editor** nel progetto Supabase.
2. Crea una nuova query e incolla l'intero contenuto di [`supabase/migrations/20261106000100_private_album_schema.sql`](supabase/migrations/20261106000100_private_album_schema.sql).
3. Esegui la query e verifica che termini con `COMMIT` senza errori.

La migrazione crea le tabelle `photos`, `playlists`, `site_settings` e `album_members`, gli indici cronologici, RLS e policy specifiche per il bucket. La tabella `album_members` non è scrivibile dai client: gli ID Supabase dei due utenti dovranno essere inseriti manualmente solo nella fase in cui deciderai di attivare Auth. Non creare account per questo passaggio.

La policy restrittiva del bucket limita l'accesso ai membri autorizzati anche se nel progetto esistono altre policy permissive. La policy riguarda solo gli oggetti del bucket `album`; non concede accessi agli altri bucket.

## 4. Avvio locale

Installa Node.js 20.19+ o 22.12+ e npm, poi dalla cartella del progetto esegui:

```powershell
npm install
npm run dev
```

Apri l'indirizzo locale stampato da Vite. Non aprire `index.html` direttamente come `file://`, perché il progetto ora usa moduli JavaScript e variabili Vite.

Senza URL e chiave, l'album locale esistente continua a usare IndexedDB su questo dispositivo. Con la configurazione Supabase, la pagina mostra chiaramente che l'album remoto è in attesa dell'accesso Auth; non carica né rende pubbliche le foto in assenza di una sessione.

## 5. Cosa è predisposto nel codice

- Lettura dei metadati da `photos` e URL firmati temporanei di cinque minuti per immagini private.
- Upload singolo o multiplo, anteprima/rimozione dalla selezione, data condivisa del gruppo e didascalia facoltativa.
- Ricodifica WebP con dimensione massima di 2560 px: i nuovi file non contengono i metadati EXIF/GPS e gli originali sul computer non vengono modificati.
- Eliminazione con controllo degli errori e tentativo di ripristino del file se la cancellazione del record fallisce.
- Controllo dell'album online all'apertura della sezione e aggiornamento ogni 4 minuti quando la sezione Album è attiva.
- API dati per le playlist condivise; l'interfaccia Spotify attuale continua a usare la cronologia locale finché non sarà disponibile una sessione autorizzata.

La parte remota resterà bloccata fino all'autenticazione: non ci sono ancora login, utenti creati dal sito, logout o autorizzazione dei due account. Il controllo password dimostrativo preesistente è solo una schermata client-side e **non** protegge contenuti online.

## 6. Build e Cloudflare Pages

Per verificare il build locale:

```powershell
npm run build
```

Impostazioni Cloudflare Pages per il deployment, da configurare quando il repository GitHub privato è collegato:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variables di build:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`

Le variabili `VITE_` finiscono nel bundle browser: inserisci esclusivamente URL e chiave pubblicabili. Il deployment e la connessione del repository non sono stati eseguiti da questa modifica.

## 7. Backup manuale

Prima di usare dati reali, conserva periodicamente una copia fuori dal progetto:

1. Da **Table Editor** esporta `photos`, `playlists` e `site_settings` come CSV.
2. Da **Storage → album** scarica i file originali WebP, mantenendo i percorsi/mese.
3. Archivia CSV e file fotografici in una cartella di backup non pubblica e verifica ogni tanto di poterli riaprire.
4. Per ripristinare, ricarica prima i file in `album` e poi importa i metadati in modo che `storage_path` corrisponda ai percorsi caricati.

Non è implementato un backup automatico o un comando per cancellare l'intero album.

## 8. Verifiche di sicurezza da completare

Senza credenziali e senza autenticazione non è possibile testare l'accesso di un membro, upload o cancellazione reali. Dopo la fase Auth verifica nel progetto:

- anon non legge righe da `photos` e non può scaricare né caricare oggetti in `album`;
- un utente autenticato non presente in `album_members` è respinto;
- entrambi i membri possono leggere e gestire le foto;
- un URL firmato scade dopo cinque minuti;
- file e metadati sono rimossi/recuperati correttamente nei casi di errore.

Non applicare dati privati reali prima di aver completato questi controlli.

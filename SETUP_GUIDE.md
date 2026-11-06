# Configurazione Supabase Auth — Smilla & Tommaso

Il sito usa Supabase Auth per l'accesso email/password e consente di entrare solo agli account che si trovano in `public.album_members`. Non esiste una schermata di registrazione. La lettura, il caricamento e l'eliminazione delle foto continuano a essere protetti dalle policy RLS già presenti e dal bucket privato `album`.

## 1. Configura Auth dalla dashboard

Questi passaggi sono manuali: il repository non modifica la dashboard Supabase.

1. Apri **Authentication → Providers** e verifica che **Email** sia abilitato.
2. In **Authentication → Settings** disattiva **Allow new users to sign up**. Supabase documenta che, disattivando questa opzione, possono accedere solo gli utenti già esistenti ([configurazione Auth](https://supabase.com/docs/guides/auth/general-configuration)).
3. In **Authentication → Users**, crea manualmente i due utenti e assegna loro password personali. Non usare mai la stessa password per entrambi. Se l'interfaccia propone un invito, completalo e verifica l'email se richiesto.
4. Copia l'UUID di ciascun utente dalla pagina Users: servirà per autorizzare solo Tommaso e Smilla.

## 2. Autorizza i due account in `album_members`

La migrazione esistente ha già creato la tabella e non permette ai client di modificarla. Nel **SQL Editor** esegui una query per ciascun utente, sostituendo il segnaposto con l'UUID reale mostrato nella dashboard:

```sql
insert into public.album_members (user_id, display_name)
values ('<UUID_REALE_TOMMASO>', 'Tommaso')
on conflict (user_id) do update set display_name = excluded.display_name;

insert into public.album_members (user_id, display_name)
values ('<UUID_REALE_SMILLA>', 'Smilla')
on conflict (user_id) do update set display_name = excluded.display_name;
```

Controlla che ci siano esattamente le due righe attese:

```sql
select user_id, display_name from public.album_members order by display_name;
```

Gli UUID non vanno inseriti nel frontend. L'app verifica `is_album_member()` dopo il login e al successivo accesso alle foto. Un account esistente ma assente dalla tabella viene disconnesso e non entra nel sito.

## 3. Verifica database e Storage

La migrazione versionata è [`supabase/migrations/20261106000100_private_album_schema.sql`](supabase/migrations/20261106000100_private_album_schema.sql). Contiene `album_members`, `photos`, `playlists`, `site_settings`, RLS e policy Storage per `album`. Se l'hai già applicata, non occorre rieseguirla: questa fase non aggiunge tabelle, policy o funzioni.

In **Storage**, verifica che `album` risulti privato. Non renderlo pubblico. Le foto vengono mostrate tramite URL firmati temporanei di cinque minuti, generati soltanto dopo l'autorizzazione del membro.

## 4. Configura l'ambiente locale

1. In **Project Settings → API** copia il Project URL e la Publishable Key.
2. Nella cartella del progetto crea `.env` da `.env.example`:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Inserisci i valori:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<chiave-pubblicabile>
   ```

La Publishable Key è destinata al browser; non inserire mai `service_role`, una Secret Key o password nel repository. `.env` è escluso da Git.

Avvia il sito:

```powershell
npm install
npm run dev
```

Con Supabase configurato compare il login email/password e viene ripristinata automaticamente la sessione esistente. Senza configurazione resta disponibile la schermata dimostrativa preesistente per l'album locale; quella password non protegge dati online.

## 5. Build e Cloudflare Pages

Verifica il build locale con `npm run build`. Per Cloudflare Pages usa:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Variabili di build:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`

Imposta le stesse due variabili in **Settings → Environment variables** per gli ambienti Production e Preview che vuoi usare. Il sito usa accesso password, senza link di callback o recupero password; non occorre configurare redirect Auth per il login corrente. Il deployment non è incluso in questa modifica.

## 6. Test consigliati

1. Accedi localmente con ciascuno dei due account e ricarica la pagina: la sessione deve essere ripristinata.
2. Prova una password errata: deve apparire un messaggio in italiano.
3. Accedi con un account Auth presente ma non inserito in `album_members`: il sito deve respingerlo e disconnetterlo.
4. Con ciascun membro prova a leggere, caricare e rimuovere una foto. Controlla che le nuove immagini appaiano in Storage sotto `album` e restino non pubbliche.
5. Premi **Esci** e verifica che ritorni la schermata di login.
6. Come controllo RLS, usa una sessione anonima e verifica che non possa leggere `photos` né scaricare oggetti da `album`.

Le policy RLS restano l'autorità effettiva: nascondere l'interfaccia o non conoscere un URL non sostituisce i controlli sul database e sul bucket.

## 7. Cosa resta locale

La playlist Spotify continua a usare la cronologia locale del browser; l'API per le playlist condivise è preparata, ma la relativa interfaccia condivisa non fa parte di questo intervento. Le foto già salvate in IndexedDB restano sul dispositivo e non vengono migrate automaticamente. Il contatore, i testi e le altre sezioni non sono stati modificati.

## 8. Menu profilo e fotografia

Il menu mostra il nome da `album_members` e l'email della sessione Auth. Lo schema e le policy esistenti non distinguono i permessi di caricamento tra Tommaso e Smilla: entrambi i membri possono già inserire ed eliminare oggetti nel bucket `album`. Per questo il menu usa l'icona predefinita e non offre un caricamento avatar che sembrerebbe limitato all'amministratore senza esserlo davvero. Per aggiungere avatar personalizzati con permessi differenziati serve un'autorizzazione server-side o una policy dedicata, interventi esclusi da questa fase.

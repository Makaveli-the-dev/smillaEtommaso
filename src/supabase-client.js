import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export class AlbumAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AlbumAccessError";
    this.code = code;
  }
}

// Il client viene predisposto ora; nessun flusso di login o registrazione è abilitato in questa fase.
export async function requireAlbumMember() {
  if (!supabase) {
    throw new AlbumAccessError("not_configured", "Completa prima la configurazione Supabase nel file .env locale.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AlbumAccessError("session_error", "Non riesco a verificare la sessione Supabase.");
  if (!data.session) {
    throw new AlbumAccessError("auth_required", "L'album online è privato. Sarà disponibile dopo l'attivazione dell'accesso nella fase successiva.");
  }

  const { data: allowed, error: membershipError } = await supabase.rpc("is_album_member");
  if (membershipError) {
    throw new AlbumAccessError("membership_unavailable", "Non riesco a verificare l'autorizzazione per l'album. Controlla le migrazioni Supabase.");
  }
  if (!allowed) {
    throw new AlbumAccessError("not_authorized", "Questo account non è autorizzato a vedere l'album privato.");
  }

  return data.session;
}

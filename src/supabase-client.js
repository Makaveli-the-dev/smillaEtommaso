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

export async function requireAlbumMember() {
  if (!supabase) {
    throw new AlbumAccessError("not_configured", "Completa prima la configurazione Supabase nel file .env locale.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AlbumAccessError("session_error", "Non riesco a verificare la sessione Supabase.");
  if (!data.session) {
    throw new AlbumAccessError("auth_required", "Accedi con email e password per usare l'album privato.");
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

export async function signInAlbumMember(email, password) {
  if (!supabase) throw new AlbumAccessError("not_configured", "Completa prima la configurazione Supabase nel file .env locale.");
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new AlbumAccessError("sign_in_failed", getAuthErrorMessage(error));

  try {
    return await requireAlbumMember();
  } catch (error) {
    try { await supabase.auth.signOut(); } catch { /* La sessione non autorizzata resta comunque bloccata dalle policy RLS. */ }
    throw error;
  }
}

export async function signOutAlbumMember() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw new AlbumAccessError("sign_out_failed", "Non sono riuscito a chiudere la sessione. Riprova.");
}

export function getAuthErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return "Email o password non corretti.";
  }
  if (message.includes("email not confirmed") || message.includes("email_not_confirmed")) {
    return "L'indirizzo email non è ancora stato confermato. Verifica la configurazione dell'account.";
  }
  if (message.includes("too many requests") || message.includes("rate limit")) {
    return "Troppi tentativi ravvicinati. Attendi qualche minuto e riprova.";
  }
  if (message.includes("fetch") || message.includes("network") || message.includes("failed to fetch")) {
    return "Non riesco a raggiungere Supabase. Controlla la connessione e riprova.";
  }
  return "Non riesco ad accedere. Controlla email e password e riprova.";
}

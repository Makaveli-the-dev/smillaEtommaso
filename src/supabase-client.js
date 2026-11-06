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

console.info("[Supabase Auth diagnostica]", {
  stage: "configuration",
  category: supabaseConfigured ? "environment_present" : "environment_missing",
  urlPresent: Boolean(supabaseUrl),
  publishableKeyPresent: Boolean(supabasePublishableKey),
});

const AUTH_MESSAGES = {
  invalid_credentials: "Email o password non corretti.",
  email_not_confirmed: "L'indirizzo email non è ancora stato confermato. Verifica la configurazione dell'account.",
  rate_limited: "Troppi tentativi ravvicinati. Attendi qualche minuto e riprova.",
  connection: "Non riesco a raggiungere Supabase. Controlla la connessione e riprova.",
  configuration: "La configurazione Supabase non è valida. Controlla URL e Publishable Key nelle variabili d'ambiente della preview.",
  service: "Supabase non è riuscito a completare la richiesta. Riprova tra poco.",
  membership_check: "Il login è riuscito, ma non riesco a verificare l'autorizzazione in album_members. Controlla funzione e schema Supabase.",
  unexpected_auth: "Supabase ha rifiutato la richiesta di accesso. Se le credenziali sono corrette, verifica il provider Email e la configurazione del progetto.",
};

export class AlbumAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AlbumAccessError";
    this.code = code;
  }
}

function normalizedMessage(error) {
  return String(error?.message || "").toLowerCase();
}

function authErrorCategory(error, stage) {
  const code = String(error?.code || "").toLowerCase();
  const message = normalizedMessage(error);
  const status = Number(error?.status);

  if (code === "invalid_credentials" || message.includes("invalid login credentials") || message.includes("invalid credentials")) return "invalid_credentials";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "email_not_confirmed";
  if (["over_request_rate_limit", "over_email_send_rate_limit"].includes(code) || message.includes("too many requests") || message.includes("rate limit")) return "rate_limited";
  if (["email_provider_disabled", "provider_disabled", "no_authorization", "invalid_api_key", "bad_api_key"].includes(code)) return "configuration";
  if (message.includes("invalid url") || message.includes("failed to parse url") || message.includes("supabaseurl is required") || message.includes("invalid api key") || message.includes("project not found")) return "configuration";
  if (error?.name === "AuthRetryableFetchError" || error instanceof TypeError || message.includes("failed to fetch") || message.includes("networkerror") || message.includes("network request failed")) return "connection";
  if ((status === 404 || (status === 401 && stage === "sign_in" && !code)) && stage !== "membership_check") return "configuration";
  if (status >= 500) return "service";
  if (stage === "membership_check") return "membership_check";
  return "unexpected_auth";
}

function safeDiagnosticCode(error) {
  const code = String(error?.code || "");
  return /^[a-z][a-z0-9_]{0,47}$/i.test(code) ? code : undefined;
}

export function logAuthDiagnostic(stage, error, category = authErrorCategory(error, stage)) {
  const status = Number(error?.status);
  const name = ["AuthApiError", "AuthRetryableFetchError", "AuthError", "AuthUnknownError", "PostgrestError", "TypeError", "Error"].includes(error?.name)
    ? error.name
    : undefined;
  const diagnostic = {
    stage,
    category,
    ...(safeDiagnosticCode(error) ? { code: safeDiagnosticCode(error) } : {}),
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
    ...(name ? { errorName: name } : {}),
  };
  // Logga esclusivamente metadati diagnostici allowlistati: mai oggetto errore, email, credenziali o sessione.
  console.warn("[Supabase Auth diagnostica]", diagnostic);
}

function throwForAuthError(error, stage) {
  const category = authErrorCategory(error, stage);
  logAuthDiagnostic(stage, error, category);
  return new AlbumAccessError(category, AUTH_MESSAGES[category] || AUTH_MESSAGES.unexpected_auth);
}

export async function requireAlbumMember() {
  if (!supabase) {
    logAuthDiagnostic("configuration", null, "missing_configuration");
    throw new AlbumAccessError("not_configured", "Completa la configurazione Supabase nelle variabili d'ambiente.");
  }

  let sessionResult;
  try {
    sessionResult = await supabase.auth.getSession();
  } catch (error) {
    throw throwForAuthError(error, "session_restore");
  }
  if (sessionResult.error) throw throwForAuthError(sessionResult.error, "session_restore");
  if (!sessionResult.data.session) {
    throw new AlbumAccessError("auth_required", "Accedi con email e password per usare l'album privato.");
  }

  let membershipResult;
  try {
    membershipResult = await supabase.rpc("is_album_member");
  } catch (error) {
    throw throwForAuthError(error, "membership_check");
  }
  if (membershipResult.error) throw throwForAuthError(membershipResult.error, "membership_check");
  if (!membershipResult.data) {
    console.warn("[Supabase Auth diagnostica]", { stage: "membership_check", category: "not_in_album_members" });
    throw new AlbumAccessError("not_authorized", "Questo account non è presente tra i membri autorizzati dell'album.");
  }

  return sessionResult.data.session;
}

export async function signInAlbumMember(email, password) {
  if (!supabase) {
    logAuthDiagnostic("sign_in", null, "missing_configuration");
    throw new AlbumAccessError("not_configured", "Supabase non è configurato per questo sito. Controlla le variabili d'ambiente della preview.");
  }

  let signInResult;
  try {
    signInResult = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  } catch (error) {
    throw throwForAuthError(error, "sign_in");
  }
  if (signInResult.error) throw throwForAuthError(signInResult.error, "sign_in");
  console.info("[Supabase Auth diagnostica]", { stage: "sign_in", category: "credentials_accepted" });

  try {
    const session = await requireAlbumMember();
    console.info("[Supabase Auth diagnostica]", { stage: "membership_check", category: "authorized_member" });
    return session;
  } catch (error) {
    try { await supabase.auth.signOut(); } catch (signOutError) { logAuthDiagnostic("sign_out", signOutError); }
    throw error;
  }
}

export async function signOutAlbumMember() {
  if (!supabase) return;
  let result;
  try {
    result = await supabase.auth.signOut();
  } catch (error) {
    throw throwForAuthError(error, "sign_out");
  }
  if (result.error) throw throwForAuthError(result.error, "sign_out");
}

export function getAuthErrorMessage(error) {
  if (error?.code === "not_configured") return AUTH_MESSAGES.configuration;
  if (error?.code === "not_authorized") return "Questo account non è presente tra i membri autorizzati dell'album.";
  if (["membership_unavailable", "membership_check"].includes(error?.code)) return AUTH_MESSAGES.membership_check;
  if (["auth_required", "session_error"].includes(error?.code)) return "La sessione non è disponibile. Accedi di nuovo per continuare.";
  const category = authErrorCategory(error, "sign_in");
  return AUTH_MESSAGES[category] || AUTH_MESSAGES.unexpected_auth;
}

// ================================
/* smillaetommaso — impostazioni */
// ================================
import { getAuthErrorMessage, logAuthDiagnostic, requireAlbumMember, signInAlbumMember, signOutAlbumMember, supabase, supabaseConfigured } from "./src/supabase-client.js";
import { deleteAlbumPhoto, getAlbumAccessMessage, loadAlbumPhotos, prepareAlbumPhoto, refreshAlbumPhotoUrl, uploadAlbumPhoto } from "./src/supabase-album.js";

const SITE_PASSWORD = "orsa"; // Protezione dimostrativa: non è autenticazione reale.
const LETTER_PASSWORD = "cassago"; // Parola d'ordine per leggere la lettera.
const LETTER_COUPON_CODE = "050926"; // Codice della caccia al coupon.
const COUPON_IMAGE_URL = "/assets/coupon/coupon-smilla.png"; // File atteso in public/assets/coupon/coupon-smilla.png.
const START_DATE = new Date(2026, 10, 1, 0, 0, 0);
// Incolla qui il link della playlist Spotify: lo collegheremo appena mi mandi il link.
const SPOTIFY_PLAYLIST_URL = "https://open.spotify.com/playlist/37i9dQZF1EJCslRrsK5s1E";
// Le foto già presenti nel progetto si possono aggiungere qui. La data serve a raggrupparle per giornata.
const photos = [
  // { src: "assets/photos/foto-01.jpg", date: "2026-10-15", caption: "Una giornata speciale" },
];

const $ = (id) => document.getElementById(id);
const lockScreen = $("lock-screen"), site = $("site"), passwordForm = $("unlock-form");
const authForm = $("auth-form"), authChecking = $("auth-checking"), logoutButton = $("logout-button");
let siteAuthenticated = false, authEpoch = 0;
if (supabaseConfigured) {
  passwordForm.classList.add("hidden"); authChecking.classList.remove("hidden");
} else {
  passwordForm.classList.remove("hidden"); authChecking.classList.add("hidden");
}
passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (supabaseConfigured) return;
  if ($("password-input").value === SITE_PASSWORD) {
    lockScreen.classList.add("hidden"); site.classList.remove("hidden"); showView("home");
  } else {
    $("password-message").textContent = "Non è quella giusta… riprova con il nostro segreto ♡";
    $("password-input").value = ""; $("password-input").focus();
  }
});

function showLoginScreen(message = "") {
  siteAuthenticated = false; authEpoch += 1;
  lockLetter();
  site.classList.add("hidden"); lockScreen.classList.remove("hidden");
  authChecking.classList.add("hidden"); logoutButton.classList.add("hidden");
  supabasePhotos = []; buildPages();
  closeCat();
  lightboxPhotos = []; currentLightbox = 0;
  $("lightbox").classList.add("hidden"); $("lightbox-image").removeAttribute("src");
  if (supabaseConfigured) {
    passwordForm.classList.add("hidden"); authForm.classList.remove("hidden");
    $("auth-password").value = "";
    $("auth-message").textContent = message;
  } else {
    authForm.classList.add("hidden"); passwordForm.classList.remove("hidden");
  }
}

async function enterAuthenticatedSite() {
  siteAuthenticated = true; authEpoch += 1;
  lockScreen.classList.add("hidden"); site.classList.remove("hidden"); logoutButton.classList.remove("hidden");
  await readUploadedPhotos();
  buildPages();
  showView("home");
  await refreshRemoteAlbum();
  await refreshProfile();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseConfigured) return;
  const button = $("auth-submit"), feedback = $("auth-message");
  button.disabled = true; button.textContent = "Accesso in corso…"; feedback.textContent = "";
  try {
    await signInAlbumMember($("auth-email").value, $("auth-password").value);
    $("auth-password").value = "";
    await enterAuthenticatedSite();
  } catch (error) {
    feedback.textContent = error?.code ? error.message : getAuthErrorMessage(error);
  } finally {
    button.disabled = false; button.innerHTML = "Accedi al nostro mondo <span>♡</span>";
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await signOutAlbumMember();
    showLoginScreen();
  } catch (error) {
    $("supabase-status").textContent = getAlbumAccessMessage(error); $("supabase-status").classList.remove("hidden");
  } finally { logoutButton.disabled = false; }
});

async function refreshProfile() {
  const user = (await supabase?.auth.getUser())?.data?.user;
  if (!user) return;
  $("profile-email").textContent = user.email || "";
  try {
    const { data } = await supabase.from("album_members").select("display_name").eq("user_id", user.id).maybeSingle();
    $("profile-name").textContent = data?.display_name || "Il nostro angolino";
  } catch { $("profile-name").textContent = "Il nostro angolino"; }
}
const profileToggle = $("profile-toggle"), profilePanel = $("profile-panel");
profileToggle.addEventListener("click", () => {
  const opening = profilePanel.classList.contains("hidden");
  profilePanel.classList.toggle("hidden", !opening); profileToggle.setAttribute("aria-expanded", String(opening));
});
document.addEventListener("click", event => {
  if (!event.target.closest(".profile-wrap")) { profilePanel.classList.add("hidden"); profileToggle.setAttribute("aria-expanded", "false"); }
});
document.addEventListener("keydown", event => {
  const passwordModal = $("letter-password-modal"), couponModal = $("coupon-modal");
  const activeModal = [passwordModal, couponModal].find(modal => modal && !modal.classList.contains("hidden"));
  if (event.key === "Escape") {
    profilePanel.classList.add("hidden"); profileToggle.setAttribute("aria-expanded", "false");
    if (activeModal === passwordModal) closeLetterPasswordModal();
    else if (activeModal === couponModal) closeCouponModal();
    if (activeModal) { event.preventDefault(); return; }
  }
  if (activeModal && event.key === "Tab") {
    const controls = [...activeModal.querySelectorAll("button, input")].filter(control => !control.disabled);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (activeModal) return;
  if ($("letter-view").classList.contains("hidden")) return;
  if (/^\d$/.test(event.key)) { event.preventDefault(); appendLetterDigit(event.key); }
  else if (event.key === "Backspace") { event.preventDefault(); removeLetterDigit(); }
  else if (event.key === "Delete") { event.preventDefault(); clearLetterCode(); }
  else if (event.key === "Enter" && !event.target.closest("button")) { event.preventDefault(); submitLetterCode(); }
});

async function initializeAuthentication() {
  if (!supabaseConfigured) return;
  passwordForm.classList.add("hidden"); authForm.classList.add("hidden"); authChecking.classList.remove("hidden");
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      console.info("[Supabase Auth diagnostica]", { stage: "session_restore", category: "no_session" });
      showLoginScreen("Accedi con l'account privato autorizzato per continuare.");
      return;
    }
    console.info("[Supabase Auth diagnostica]", { stage: "session_restore", category: "session_present" });
    try {
      await requireAlbumMember();
      console.info("[Supabase Auth diagnostica]", { stage: "membership_check", category: "authorized_member" });
    } catch (membershipError) {
      try { await signOutAlbumMember(); } catch (signOutError) { logAuthDiagnostic("sign_out", signOutError); }
      showLoginScreen(membershipError.message || "Questo account non è autorizzato a usare l'album privato.");
      return;
    }
    await enterAuthenticatedSite();
  } catch (error) {
    logAuthDiagnostic("session_restore", error);
    showLoginScreen(getAuthErrorMessage(error));
  }
}

if (supabaseConfigured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && siteAuthenticated) showLoginScreen("La sessione è terminata. Accedi di nuovo per continuare.");
  });
}

function showView(name) {
  if (name === "memories" && supabaseConfigured && !siteAuthenticated) {
    showLoginScreen("Accedi con l'account privato autorizzato per aprire l'album.");
    return;
  }
  closeCat();
  if (name !== "letter") { closeLetter(); closeLetterPasswordModal(false); closeCouponModal(false); }
  document.querySelectorAll(".view").forEach(view => view.classList.add("hidden"));
  const target = $(`${name}-view`);
  if (target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  if (name === "memories") refreshRemoteAlbum();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));

function closeLetter() {
  const scene = $("letter-scene"), toggle = $("letter-toggle"), paper = $("letter-paper");
  if (!scene || !toggle || !paper) return;
  scene.classList.remove("letter-open"); toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Apri la lettera"); paper.setAttribute("aria-hidden", "true"); paper.inert = true;
  $("letter-keypad").inert = false;
}
let letterUnlocked = false;
let letterCode = "";
function closeLetterPasswordModal(restoreFocus = true) {
  const modal = $("letter-password-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  $("letter-scene").inert = false;
  $("letter-keypad").inert = false;
  if (restoreFocus) $("letter-toggle").focus();
}
function openLetterPasswordModal() {
  const modal = $("letter-password-modal");
  modal.classList.remove("hidden");
  $("letter-scene").inert = true;
  $("letter-password-input").value = "";
  $("letter-password-message").textContent = "";
  $("letter-keypad").inert = true;
  requestAnimationFrame(() => $("letter-password-input").focus());
}
$("letter-password-close").addEventListener("click", () => closeLetterPasswordModal());
$("letter-password-modal").addEventListener("click", event => {
  if (event.target === $("letter-password-modal")) closeLetterPasswordModal();
});
$("letter-password-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("letter-password-input"), message = $("letter-password-message");
  if (input.value !== LETTER_PASSWORD) {
    message.textContent = "La parola non è quella giusta… riprova con il nostro segreto ♡";
    input.value = ""; input.focus();
    return;
  }
  letterUnlocked = true;
  closeLetterPasswordModal(false);
  openLetter();
});
function renderLetterCode() {
  $("keypad-indicator").querySelectorAll("span").forEach((slot, index) => slot.classList.toggle("filled", index < letterCode.length));
  $("keypad-confirm").disabled = letterCode.length !== LETTER_COUPON_CODE.length;
  $("keypad-status").textContent = `${letterCode.length} di ${LETTER_COUPON_CODE.length} cifre inserite.`;
}
function appendLetterDigit(digit) {
  if (letterCode.length >= LETTER_COUPON_CODE.length) return;
  letterCode += digit;
  $("keypad-message").textContent = "";
  renderLetterCode();
}
function removeLetterDigit() {
  letterCode = letterCode.slice(0, -1);
  $("keypad-message").textContent = "";
  renderLetterCode();
}
function clearLetterCode() {
  letterCode = "";
  $("keypad-message").textContent = "";
  renderLetterCode();
}
function openLetter() {
  letterUnlocked = true;
  const scene = $("letter-scene"), toggle = $("letter-toggle"), paper = $("letter-paper");
  scene.classList.add("letter-open", "letter-unlocked");
  $("letter-keypad").inert = false;
  toggle.setAttribute("aria-expanded", "true"); toggle.setAttribute("aria-label", "Richiudi la lettera"); paper.setAttribute("aria-hidden", "false"); paper.inert = false;
  $("letter-close").focus({ preventScroll: true });
}
function submitLetterCode() {
  if (letterCode.length !== LETTER_COUPON_CODE.length) {
    $("keypad-message").textContent = "Inserisci tutte e sei le cifre per scoprire il coupon.";
    return;
  }
  if (letterCode !== LETTER_COUPON_CODE) {
    letterCode = ""; renderLetterCode();
    $("keypad-message").textContent = "Non è ancora il codice giusto… riprova, ci sei quasi ♡";
    return;
  }
  letterCode = ""; renderLetterCode(); $("keypad-message").textContent = "";
  openCouponModal();
}
function closeCouponModal(restoreFocus = true) {
  const modal = $("coupon-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  $("letter-scene").inert = false;
  if (restoreFocus) $("keypad-keys").querySelector("button")?.focus();
}
function openCouponModal() {
  $("coupon-modal").classList.remove("hidden");
  $("coupon-download-status").textContent = "";
  requestAnimationFrame(() => $("coupon-close").focus());
}
$("coupon-close").addEventListener("click", () => closeCouponModal());
$("coupon-modal").addEventListener("click", event => {
  if (event.target === $("coupon-modal")) closeCouponModal();
});
$("coupon-image").addEventListener("load", () => {
  $("coupon-image").classList.remove("hidden");
  $("coupon-image-placeholder").classList.add("hidden");
  $("coupon-download").disabled = false;
});
$("coupon-image").addEventListener("error", () => {
  $("coupon-image").classList.add("hidden");
  $("coupon-image-placeholder").classList.remove("hidden");
  $("coupon-image-placeholder").querySelector("small").textContent = "Aggiungi public/assets/coupon/coupon-smilla.png per attivare il download.";
  $("coupon-download").disabled = true;
});
$("coupon-download").addEventListener("click", () => {
  if (!$('coupon-image').naturalWidth) return;
  const link = document.createElement("a");
  link.href = COUPON_IMAGE_URL; link.download = "coupon-smilla.png";
  document.body.appendChild(link); link.click(); link.remove();
  $("coupon-download-status").textContent = "Il coupon è stato scaricato ♡";
});
$("keypad-keys").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.codeDigit !== undefined) appendLetterDigit(button.dataset.codeDigit);
  else if (button.dataset.codeAction === "backspace") removeLetterDigit();
  else if (button.dataset.codeAction === "clear") clearLetterCode();
});
$("keypad-confirm").addEventListener("click", submitLetterCode);
$("coupon-image").src = COUPON_IMAGE_URL;
function lockLetter() {
  letterUnlocked = false;
  closeLetter();
  closeLetterPasswordModal(false);
  closeCouponModal(false);
  $("letter-scene").classList.remove("letter-unlocked");
  letterCode = ""; renderLetterCode();
  $("letter-keypad").inert = false;
}
$("letter-toggle").addEventListener("click", () => {
  const scene = $("letter-scene"), toggle = $("letter-toggle"), paper = $("letter-paper");
  if (!letterUnlocked) { openLetterPasswordModal(); return; }
  const opening = !scene.classList.contains("letter-open");
  scene.classList.toggle("letter-open", opening); toggle.setAttribute("aria-expanded", String(opening)); toggle.setAttribute("aria-label", opening ? "Richiudi la lettera" : "Apri la lettera"); paper.setAttribute("aria-hidden", String(!opening)); paper.inert = !opening;
  $("letter-keypad").inert = false;
});
$("letter-close").addEventListener("click", () => { closeLetter(); $("letter-toggle").focus(); });

// Playlist Spotify: cronologia locale nel browser corrente.
const musicPanel = $("music-panel"), musicButton = $("music-toggle");
musicButton.addEventListener("click", () => {
  const opening = musicPanel.classList.contains("hidden");
  musicPanel.classList.toggle("hidden", !opening); musicButton.setAttribute("aria-expanded", String(opening));
});
function spotifyEmbedUrl(value) {
  if (!value) return "";
  const match = value.match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/|spotify:playlist:)([a-zA-Z0-9]+)/);
  return match ? `https://open.spotify.com/embed/playlist/${match[1]}?utm_source=generator&theme=0` : "";
}
const PLAYLIST_KEY = "smillaetommaso-playlists";
let playlists = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || "[]");
if (!playlists.some(item => item.url === SPOTIFY_PLAYLIST_URL)) playlists.unshift({ name: "La nostra playlist", url: SPOTIFY_PLAYLIST_URL });
function renderPlaylists(selected = playlists[0]?.url) {
  const select = $("playlist-history"); select.replaceChildren();
  playlists.forEach((item, i) => { const option = document.createElement("option"); option.value = item.url; option.textContent = item.name || `Playlist ${i + 1}`; select.appendChild(option); });
  if (selected && playlists.some(item => item.url === selected)) select.value = selected;
  const url = spotifyEmbedUrl(select.value);
  if (url) { const frame = document.createElement("iframe"); frame.src = url; frame.title = "La nostra playlist Spotify"; frame.width = "100%"; frame.height = "152"; frame.style.border = "0"; frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"; frame.loading = "lazy"; $("spotify-embed").replaceChildren(frame); }
}
function savePlaylists() { localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists)); renderPlaylists($("playlist-history").value); }
$("playlist-form").addEventListener("submit", event => { event.preventDefault(); const value = $("playlist-url").value.trim(), feedback = $("playlist-feedback"); if (!spotifyEmbedUrl(value)) { feedback.textContent = "Link Spotify non valido o non supportato: inserisci il link di una playlist."; return; } if (!playlists.some(item => item.url === value)) playlists.unshift({ name: `Playlist ${playlists.length + 1}`, url: value }); savePlaylists(); $("playlist-url").value = ""; feedback.textContent = "Playlist aggiunta e salvata su questo dispositivo."; });
$("playlist-history").addEventListener("change", () => renderPlaylists($("playlist-history").value));
$("copy-playlist").addEventListener("click", async () => { const selected = $("playlist-history").value; try { await navigator.clipboard.writeText(selected); $("playlist-feedback").textContent = "Link della playlist copiato negli appunti."; } catch { $("playlist-feedback").textContent = "Impossibile copiare il link: verifica i permessi del browser."; } });
$("remove-playlist").addEventListener("click", () => { const selected = $("playlist-history").value; if (selected === SPOTIFY_PLAYLIST_URL) { $("playlist-feedback").textContent = "La playlist già configurata viene mantenuta."; return; } playlists = playlists.filter(item => item.url !== selected); savePlaylists(); $("playlist-feedback").textContent = "Playlist rimossa dalla cronologia."; });
renderPlaylists();
/* const embedUrl = spotifyEmbedUrl(SPOTIFY_PLAYLIST_URL);
if (embedUrl) {
  const frame = document.createElement("iframe"); frame.src = embedUrl; frame.title = "La nostra playlist Spotify";
  frame.width = "100%"; frame.height = "152"; frame.style.border = "0"; frame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"; frame.loading = "lazy";
  $("spotify-embed").replaceChildren(frame); $("music-status").textContent = "Premi play e lascia partire la nostra colonna sonora.";
} */

// Album: una pagina per ogni data, massimo tre foto per pagina.
const DB_NAME = "smillaetommaso-album", STORE_NAME = "uploaded-photos";
let uploadedPhotos = [], supabasePhotos = [], albumPages = [], currentPage = 0, lightboxPhotos = [], currentLightbox = 0;
let selectedFiles = [], previewUrls = [], preparedPhotoCache = new WeakMap();
async function getPreparedPhoto(file) {
  let prepared = preparedPhotoCache.get(file);
  if (!prepared) { prepared = prepareAlbumPhoto(file); preparedPhotoCache.set(file, prepared); }
  try { return await prepared; }
  catch (error) { preparedPhotoCache.delete(file); throw error; }
}
function openPhotoDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("Questo browser non supporta il salvataggio locale delle foto."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function readUploadedPhotos() {
  try { const db = await openPhotoDB(); uploadedPhotos = await new Promise((resolve, reject) => { const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); }); db.close(); }
  catch (error) { console.warn(error); uploadedPhotos = []; }
}
async function saveUploadedPhoto(photo) {
  const db = await openPhotoDB();
  await new Promise((resolve, reject) => { const tx = db.transaction(STORE_NAME, "readwrite"); tx.objectStore(STORE_NAME).put(photo); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  db.close();
}
async function deleteUploadedPhoto(id) { const db=await openPhotoDB(); await new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,"readwrite");tx.objectStore(STORE_NAME).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();uploadedPhotos=uploadedPhotos.filter(p=>p.id!==id);buildPages();}
function allPhotos() {
  return [
    ...photos.filter(p => p.src && p.date).map((p, i) => ({ ...p, id: p.id || `built-${i}`, source: "static" })),
    ...uploadedPhotos.map(p => ({ ...p, source: "local" })),
    ...supabasePhotos,
  ].sort((a,b) => a.date.localeCompare(b.date) || (a.position ?? 0) - (b.position ?? 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
}
function formatDate(iso) { return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`)); }
function formatMonth(iso) { return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`)); }
function buildPages() {
  const grouped = new Map();
  allPhotos().forEach(photo => { if (!grouped.has(photo.date)) grouped.set(photo.date, []); grouped.get(photo.date).push(photo); });
  albumPages = [...grouped.entries()].flatMap(([date, items]) => Array.from({ length: Math.ceil(items.length / 3) }, (_, i) => ({ date, items: items.slice(i * 3, i * 3 + 3), part: i + 1, total: Math.ceil(items.length / 3) })));
  const months = [...new Set(albumPages.map(page => page.date.slice(0,7)))];
  const select = $("period-index"), previous = select.value;
  select.innerHTML = '<option value="">Scegli un mese…</option>';
  months.forEach(month => { const option = document.createElement("option"); option.value = month; option.textContent = formatMonth(`${month}-01`); select.appendChild(option); });
  if (months.includes(previous)) select.value = previous;
  select.disabled = !months.length;
  renderAlbum();
}
function seededLayout(date, index) {
  const variants = ["layout-one", "layout-two", "layout-three", "layout-four", "layout-five"];
  let seed = [...date].reduce((sum, char) => sum + char.charCodeAt(0), index * 13);
  return variants[seed % variants.length];
}
function renderAlbum() {
  const content = $("page-content"), empty = !albumPages.length;
  $("album-empty-note").classList.toggle("hidden", !empty);
  $("album-page").classList.toggle("empty-page", empty);
  $("album-prev").disabled = empty || currentPage <= 0; $("album-next").disabled = empty || currentPage >= albumPages.length - 1;
  $("page-dots").replaceChildren(); content.replaceChildren();
  if (empty) {
    content.innerHTML = '<div class="empty-album-art"><span>♡</span><strong>La nostra storia<br>inizia qui.</strong><small>Una pagina alla volta.</small></div>';
    $("page-date-label").textContent = "IN ATTESA DEI RICORDI"; $("page-number").textContent = "♡"; $("album-position").textContent = "L'album è ancora vuoto"; return;
  }
  currentPage = Math.max(0, Math.min(currentPage, albumPages.length - 1));
  const page = albumPages[currentPage];
  content.className = `page-content page-count-${Math.min(page.items.length,3)}`;
  $("page-date-label").textContent = formatDate(page.date).toLocaleUpperCase("it-IT");
  $("page-number").textContent = `${currentPage + 1} / ${albumPages.length}`;
  $("album-position").textContent = `Giorno ${currentPage + 1} di ${albumPages.length} · Pagina ${page.part} di ${page.total} · ${page.items.length} foto`;
  page.items.slice(0,3).forEach((photo, index) => {
    const figure = document.createElement("figure"); figure.className = `album-photo photo-count-${Math.min(page.items.length,3)}`;
    const img = document.createElement("img"); img.src = photo.src; img.alt = photo.caption || `Ricordo del ${formatDate(page.date)}`; img.loading = "lazy";
    img.addEventListener("click", () => openAlbumLightbox(photo, page.items)); figure.appendChild(img); if (photo.source === "local" || photo.source === "supabase") { const remove=document.createElement("button"); remove.type="button"; remove.className="remove-photo"; remove.textContent="Rimuovi foto"; remove.addEventListener("click",event=>{event.stopPropagation();if(confirm("Vuoi eliminare questa foto caricata?")) removeAlbumPhoto(photo);}); figure.appendChild(remove); }
    if (photo.caption) { const caption = document.createElement("figcaption"); caption.textContent = photo.caption; figure.appendChild(caption); }
    content.appendChild(figure);
  });
  if (page.items.length > 3) { const note = document.createElement("p"); note.className = "extra-photo-note"; note.textContent = `+ ${page.items.length - 3} altri ricordi di questa giornata`; content.appendChild(note); }
  albumPages.forEach((_, index) => { const dot = document.createElement("button"); dot.className = `page-dot ${index === currentPage ? "active" : ""}`; dot.setAttribute("aria-label", `Vai alla pagina ${index + 1}`); dot.addEventListener("click", () => goToPage(index)); $("page-dots").appendChild(dot); });
}
function goToPage(index) {
  if (index < 0 || index >= albumPages.length || index === currentPage) return;
  const page = $("album-page"); page.classList.remove("turning"); void page.offsetWidth; page.classList.add("turning");
  currentPage = index; renderAlbum();
  setTimeout(() => page.classList.remove("turning"), 520);
}
$("album-prev").addEventListener("click", () => goToPage(currentPage - 1));
$("album-next").addEventListener("click", () => goToPage(currentPage + 1));
$("period-index").addEventListener("change", event => { if (!event.target.value) return; const index = albumPages.findIndex(page => page.date.startsWith(event.target.value)); if (index >= 0) goToPage(index); });

// Inserimento foto: salvataggio persistente nel browser tramite IndexedDB.
$("add-photo-toggle").addEventListener("click", () => { $("add-photo-form").classList.toggle("hidden"); });
$("close-add-photo").addEventListener("click", () => $("add-photo-form").classList.add("hidden"));
function renderPhotoPreview() {
  previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = [];
  const preview = $("photo-preview"); preview.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const figure = document.createElement("figure"); figure.className = "photo-preview-item";
    const image = document.createElement("img"), url = URL.createObjectURL(file); previewUrls.push(url); image.src = url; image.alt = `Anteprima ${file.name}`;
    image.addEventListener("error", async () => {
      try {
        const prepared = await getPreparedPhoto(file);
        if (!figure.isConnected || !selectedFiles.includes(file)) return;
        const preparedUrl = URL.createObjectURL(prepared); previewUrls.push(preparedUrl); image.onerror = null; image.src = preparedUrl;
      } catch { if (figure.isConnected) { figure.classList.add("preview-unavailable"); image.alt = `Anteprima non disponibile per ${file.name}`; } }
    }, { once: true });
    const caption = document.createElement("figcaption"); caption.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    const remove = document.createElement("button"); remove.type = "button"; remove.dataset.removeSelection = String(index); remove.textContent = "Rimuovi";
    figure.append(image, caption, remove); preview.appendChild(figure);
  });
}
$("photo-file").addEventListener("change", event => { selectedFiles = Array.from(event.target.files || []); renderPhotoPreview(); });
$("photo-preview").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-selection]"); if (!button) return;
  selectedFiles.splice(Number(button.dataset.removeSelection), 1);
  try { const transfer = new DataTransfer(); selectedFiles.forEach(file => transfer.items.add(file)); $("photo-file").files = transfer.files; } catch { /* La selezione interna resta valida anche se il browser non espone DataTransfer. */ }
  renderPhotoPreview();
});
$("add-photo-form").addEventListener("submit", async event => {
  event.preventDefault(); const files = [...selectedFiles], date = $("photo-date").value, caption = $("photo-caption").value.trim();
  if (!files.length) { $("upload-status").textContent = "Seleziona almeno una foto."; return; }
  if (!date) { $("upload-status").textContent = "Scegli la data dello scatto."; return; }
  const submit = event.submitter; submit.disabled = true; submit.textContent = "Sto aggiungendo le foto…";
  const added = [], failed = [], errors = [];
  try {
    for (const [index, file] of files.entries()) {
      try {
        const prepared = await getPreparedPhoto(file);
        if (supabaseConfigured) {
          $("upload-status").textContent = `Caricamento della foto ${index + 1} di ${files.length}…`;
          const photo = await uploadAlbumPhoto(file, date, caption, prepared); supabasePhotos.push(photo); added.push(photo);
        } else {
          $("upload-status").textContent = `Salvataggio della foto ${index + 1} di ${files.length} su questo dispositivo…`;
          const dataUrl = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(prepared); });
          const name = `${file.name.replace(/\.[^.]+$/, "") || "foto"}.webp`;
          const photo = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, src: dataUrl, date, caption, name };
          await saveUploadedPhoto(photo); uploadedPhotos.push(photo); added.push(photo);
        }
      } catch (error) { console.error("Errore durante la preparazione di una foto dell'album.", error); failed.push(file); errors.push(error); }
    }
    buildPages();
    if (added.length) { const firstAddedPage = albumPages.findIndex(page => page.items.some(item => added.some(photo => photo.id === item.id))); if (firstAddedPage >= 0) currentPage = firstAddedPage; renderAlbum(); }
    if (failed.length) {
      selectedFiles = failed;
      try { const transfer = new DataTransfer(); failed.forEach(file => transfer.items.add(file)); $("photo-file").files = transfer.files; } catch { /* I file non riusciti restano nella selezione interna. */ }
      renderPhotoPreview();
      const firstError = errors[0];
      $("upload-status").textContent = `${failed.length} ${failed.length === 1 ? "foto non è stata aggiunta" : "foto non sono state aggiunte"}. ${firstError?.message || "Prova con un'altra immagine."}`;
    } else {
      $("upload-status").textContent = "";
      $("add-photo-form").reset(); selectedFiles = []; preparedPhotoCache = new WeakMap(); renderPhotoPreview();
    }
  } catch (error) {
    console.error(error);
    buildPages();
    $("upload-status").textContent = getAlbumAccessMessage(error) + (added.length ? ` Completate prima dell'errore: ${added.length} ${added.length === 1 ? "foto" : "foto"}.` : "");
  } finally { submit.disabled = false; submit.textContent = "Aggiungi al nostro album ♡"; }
});

async function removeAlbumPhoto(photo) {
  try {
    if (photo.source === "supabase") {
      await deleteAlbumPhoto(photo); supabasePhotos = supabasePhotos.filter(item => item.id !== photo.id);
    } else {
      await deleteUploadedPhoto(photo.id);
    }
    buildPages(); $("upload-status").textContent = "";
  } catch (error) { $("upload-status").textContent = getAlbumAccessMessage(error); }
}

// Lightbox per guardare le foto più da vicino.
const lightbox = $("lightbox"), lightboxImage = $("lightbox-image"), lightboxCaption = $("lightbox-caption");
let lightboxLoadId = 0;
function openAlbumLightbox(photo, sameDay) { lightboxPhotos = sameDay; currentLightbox = sameDay.indexOf(photo); lightbox.classList.remove("hidden"); updateLightbox(); }
async function updateLightbox() {
  const photo = lightboxPhotos[currentLightbox], loadId = ++lightboxLoadId;
  if (!photo) return;
  try {
    const src = photo.source === "supabase" ? await refreshAlbumPhotoUrl(photo) : photo.src;
    if (loadId !== lightboxLoadId) return;
    lightboxImage.src = src; lightboxImage.alt = photo.caption || "Un nostro ricordo"; lightboxCaption.textContent = photo.caption || formatDate(photo.date);
  } catch (error) { lightboxCaption.textContent = getAlbumAccessMessage(error); }
}
function moveLightbox(direction) { if (!lightboxPhotos.length) return; currentLightbox = (currentLightbox + direction + lightboxPhotos.length) % lightboxPhotos.length; updateLightbox(); }
$("lightbox-close").addEventListener("click", () => lightbox.classList.add("hidden")); $("lightbox-prev").addEventListener("click", () => moveLightbox(-1)); $("lightbox-next").addEventListener("click", () => moveLightbox(1));
lightbox.addEventListener("click", event => { if (event.target === lightbox) lightbox.classList.add("hidden"); });
document.addEventListener("keydown", event => { if (!lightbox.classList.contains("hidden")) { if (event.key === "Escape") lightbox.classList.add("hidden"); if (event.key === "ArrowLeft") moveLightbox(-1); if (event.key === "ArrowRight") moveLightbox(1); } });

// Contatore: lasciato invariato.
function updateCounter() {
  const elapsed = Math.max(0, Date.now() - START_DATE.getTime()), totalSeconds = Math.floor(elapsed / 1000);
  $("days").textContent = Math.floor(totalSeconds / 86400);
  $("hours").textContent = String(Math.floor((totalSeconds % 86400) / 3600)).padStart(2,"0");
  $("minutes").textContent = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2,"0");
  $("seconds").textContent = String(totalSeconds % 60).padStart(2,"0");
}
updateCounter(); setInterval(updateCounter,1000);
$("secret-button").addEventListener("click", () => $("secret-message").classList.toggle("hidden"));
$("album-clue").addEventListener("click", () => {
  $("album-clue-heart").classList.add("hidden");
  $("album-clue-code").classList.remove("hidden");
  $("album-clue").classList.add("revealed");
  $("album-clue").setAttribute("aria-expanded", "true");
  $("album-clue").setAttribute("aria-label", "Indizio dell'album: 26");
});
const catMessageText = $("cat-message-text");
const initialCatMessage = catMessageText.innerHTML;
let catHintShown = false, catMessageTimer = 0;
function resetCatHint() {
  window.clearTimeout(catMessageTimer); catHintShown = false;
  catMessageText.classList.remove("is-changing"); catMessageText.innerHTML = initialCatMessage;
}
function revealCatHint() {
  catHintShown = true; catMessageText.classList.add("is-changing");
  window.clearTimeout(catMessageTimer);
  catMessageTimer = window.setTimeout(() => {
    catMessageText.innerHTML = 'Ti dò una mano mamma: <strong class="clue-number">05</strong>';
    requestAnimationFrame(() => catMessageText.classList.remove("is-changing"));
  }, 150);
}
function closeCat() {
  const tail = $("cat-friend"), cat = $("cat-character");
  resetCatHint();
  $("cat-message")?.classList.remove("cat-touch-visible", "cat-touch-exiting");
  cat?.classList.remove("cat-entering", "cat-exiting"); cat?.classList.add("hidden");
  if (tail?._catReveal) tail.removeEventListener("transitionend", tail._catReveal);
  if (tail) { tail._catReveal = null; tail.classList.remove("tail-leaving"); tail.classList.add("hidden"); void tail.offsetWidth; tail.classList.remove("hidden"); }
}
$("cat-friend").addEventListener("click", () => {
  const tail = $("cat-friend"), cat = $("cat-character");
  if (!cat.classList.contains("hidden")) { closeCat(); return; }
  if (tail.classList.contains("tail-leaving")) return;
  tail.classList.add("tail-leaving");
  tail._catReveal = function revealCat(event) {
    if (event.propertyName !== "transform") return;
    tail.removeEventListener("transitionend", revealCat);
    tail._catReveal = null;
    if (!tail.classList.contains("tail-leaving")) return;
    resetCatHint();
    tail.classList.add("hidden"); cat.classList.remove("hidden");
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) $("cat-message").classList.add("cat-touch-visible");
    requestAnimationFrame(() => { cat.classList.add("cat-entering"); cat.focus(); });
  };
  tail.addEventListener("transitionend", tail._catReveal);
});
$("cat-character").addEventListener("click", () => {
  const tail = $("cat-friend"), cat = $("cat-character");
  if (cat.classList.contains("cat-exiting")) return;
  if (!catHintShown) { revealCatHint(); return; }
  const touchInteraction = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (touchInteraction) {
    $("cat-message").classList.remove("cat-touch-visible");
    $("cat-message").classList.add("cat-touch-exiting");
  }
  cat.classList.remove("cat-entering"); cat.classList.add("cat-exiting");
  cat.addEventListener("transitionend", function restoreTail(event) {
    if (event.propertyName !== "transform") return;
    cat.removeEventListener("transitionend", restoreTail);
    cat.classList.remove("cat-exiting"); cat.classList.add("hidden");
    resetCatHint();
    $("cat-message").classList.remove("cat-touch-visible", "cat-touch-exiting");
    tail.classList.remove("hidden");
    void tail.offsetWidth;
    tail.classList.remove("tail-leaving");
  });
});
$("cat-message").addEventListener("click", () => $("cat-character").click());
async function refreshRemoteAlbum() {
  const status = $("supabase-status"), note = $("upload-note");
  if (!supabaseConfigured) {
    status.textContent = ""; status.classList.add("hidden");
    note.textContent = "Le foto aggiunte qui vengono salvate solo in questo browser e su questo dispositivo.";
    return;
  }
  const requestEpoch = authEpoch;
  status.textContent = ""; status.classList.add("hidden");
  note.textContent = "Le foto aggiunte all'album sono condivise tra i due account autorizzati.";
  try {
    const remotePhotos = await loadAlbumPhotos();
    if (!siteAuthenticated || requestEpoch !== authEpoch) return;
    supabasePhotos = remotePhotos;
    buildPages();
    if (!$("lightbox").classList.contains("hidden") && lightboxPhotos[currentLightbox]?.source === "supabase") {
      const replacement = supabasePhotos.find(photo => photo.id === lightboxPhotos[currentLightbox].id);
      if (replacement) { lightboxPhotos[currentLightbox] = replacement; updateLightbox(); }
    }
    status.textContent = "";
  } catch (error) {
    if (!siteAuthenticated || requestEpoch !== authEpoch) return;
    if (["auth_required", "not_authorized", "membership_unavailable", "session_error"].includes(error?.code)) {
      supabasePhotos = [];
      buildPages();
      try { await signOutAlbumMember(); } catch { /* L'album resta comunque chiuso localmente. */ }
      showLoginScreen(error.code === "auth_required"
        ? "La sessione è terminata. Accedi di nuovo per aprire l'album privato."
        : getAlbumAccessMessage(error));
      return;
    }
    status.textContent = getAlbumAccessMessage(error); status.classList.remove("hidden");
  }
}

readUploadedPhotos().then(async () => {
  buildPages();
  if (supabaseConfigured) await initializeAuthentication();
  else await refreshRemoteAlbum();
});
setInterval(() => {
  if (supabaseConfigured && !$("memories-view").classList.contains("hidden") && document.visibilityState === "visible") refreshRemoteAlbum();
}, 240_000);
document.addEventListener("visibilitychange", () => {
  if (supabaseConfigured && document.visibilityState === "visible" && !$("memories-view").classList.contains("hidden")) refreshRemoteAlbum();
});

// Porta a maiuscola l'iniziale dei testi visibili, inclusi gli aggiornamenti dinamici.
function capitalizeInitial(value) { return value.replace(/^(\s*)([a-zà-öø-ÿ])/u, (_, space, letter) => space + letter.toLocaleUpperCase("it-IT")); }
function capitalizeNode(node) { if (node.nodeType === Node.TEXT_NODE) { if (!node.parentElement?.closest("[data-preserve-case]")) node.nodeValue = capitalizeInitial(node.nodeValue); } else if (node.nodeType === Node.ELEMENT_NODE) { if (node.closest("[data-preserve-case]")) return; for (const attr of ["placeholder", "aria-label", "title"]) if (node.hasAttribute(attr)) node.setAttribute(attr, capitalizeInitial(node.getAttribute(attr))); node.childNodes.forEach(capitalizeNode); } }
document.body.childNodes.forEach(capitalizeNode);
new MutationObserver(records => records.forEach(record => { if (record.type === "characterData") { if (record.target.parentElement?.closest("[data-preserve-case]")) return; const next = capitalizeInitial(record.target.nodeValue); if (next !== record.target.nodeValue) record.target.nodeValue = next; } else record.addedNodes.forEach(capitalizeNode); })).observe(document.body, {subtree:true,childList:true,characterData:true});

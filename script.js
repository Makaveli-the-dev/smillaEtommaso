// ================================
/* smillaetommaso — impostazioni */
// ================================
const SITE_PASSWORD = "orsa"; // Protezione dimostrativa: non è autenticazione reale.
const START_DATE = new Date(2026, 10, 1, 0, 0, 0);
// Incolla qui il link della playlist Spotify: lo collegheremo appena mi mandi il link.
const SPOTIFY_PLAYLIST_URL = "https://open.spotify.com/playlist/37i9dQZF1EJCslRrsK5s1E";
// Le foto già presenti nel progetto si possono aggiungere qui. La data serve a raggrupparle per giornata.
const photos = [
  // { src: "assets/photos/foto-01.jpg", date: "2026-10-15", caption: "Una giornata speciale" },
];

const $ = (id) => document.getElementById(id);
const lockScreen = $("lock-screen"), site = $("site"), passwordForm = $("unlock-form");
passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if ($("password-input").value === SITE_PASSWORD) {
    lockScreen.classList.add("hidden"); site.classList.remove("hidden"); showView("home");
  } else {
    $("password-message").textContent = "Non è quella giusta… riprova con il nostro segreto ♡";
    $("password-input").value = ""; $("password-input").focus();
  }
});

function showView(name) {
  closeCat();
  if (name !== "letter") closeLetter();
  document.querySelectorAll(".view").forEach(view => view.classList.add("hidden"));
  const target = $(`${name}-view`);
  if (target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));

function closeLetter() {
  const scene = $("letter-scene"), toggle = $("letter-toggle"), paper = $("letter-paper");
  if (!scene || !toggle || !paper) return;
  scene.classList.remove("letter-open"); toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Apri la lettera"); paper.setAttribute("aria-hidden", "true"); paper.inert = true;
}
$("letter-toggle").addEventListener("click", () => {
  const scene = $("letter-scene"), toggle = $("letter-toggle"), paper = $("letter-paper");
  const opening = !scene.classList.contains("letter-open");
  scene.classList.toggle("letter-open", opening); toggle.setAttribute("aria-expanded", String(opening)); toggle.setAttribute("aria-label", opening ? "Richiudi la lettera" : "Apri la lettera"); paper.setAttribute("aria-hidden", String(!opening)); paper.inert = !opening;
});
$("letter-close").addEventListener("click", () => { closeLetter(); $("letter-toggle").focus(); });

// Playlist Spotify: cronologia locale nel browser corrente.
const musicPanel = $("music-panel"), musicButton = $("music-toggle");
musicButton.addEventListener("click", () => {
  const opening = musicPanel.classList.contains("hidden");
  musicPanel.classList.toggle("hidden", !opening); musicButton.setAttribute("aria-expanded", String(opening));
  if (opening) musicPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
let uploadedPhotos = [], albumPages = [], currentPage = 0, lightboxPhotos = [], currentLightbox = 0;
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
  return [...photos.filter(p => p.src && p.date), ...uploadedPhotos].map((p, i) => ({ ...p, id: p.id || `built-${i}` })).sort((a,b) => a.date.localeCompare(b.date));
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
    img.addEventListener("click", () => openAlbumLightbox(photo, page.items)); figure.appendChild(img); if (photo.id && !String(photo.id).startsWith("built-")) { const remove=document.createElement("button"); remove.type="button"; remove.className="remove-photo"; remove.textContent="Rimuovi foto"; remove.addEventListener("click",event=>{event.stopPropagation();if(confirm("Vuoi eliminare questa foto caricata?")) deleteUploadedPhoto(photo.id);}); figure.appendChild(remove); }
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
$("add-photo-form").addEventListener("submit", async event => {
  event.preventDefault(); const file = $("photo-file").files[0], date = $("photo-date").value;
  if (!file || !date) return;

  if (!file.type.startsWith("image/")) { $("upload-status").textContent = "Scegli un file immagine valido."; return; }
  if (file.size > 12 * 1024 * 1024) { $("upload-status").textContent = "Questa foto supera i 12 MB: scegli una versione più leggera."; return; }
  const submit = event.submitter; submit.disabled = true; submit.textContent = "La sto aggiungendo…";
  try {
    const dataUrl = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const photo = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, src: dataUrl, date, caption: $("photo-caption").value.trim(), name: file.name };
    await saveUploadedPhoto(photo); uploadedPhotos.push(photo); buildPages(); currentPage = albumPages.findIndex(p => p.date === date && p.items.some(item => item.id === photo.id)); renderAlbum();
    $("upload-status").textContent = "Aggiunta! Il ricordo è al suo posto. ♡"; $("add-photo-form").reset();
  } catch (error) { console.error(error); $("upload-status").textContent = "Non sono riuscito a salvare la foto. Riprova con un'immagine più leggera."; }
  finally { submit.disabled = false; submit.textContent = "Aggiungi al nostro album ♡"; }
});

// Lightbox per guardare le foto più da vicino.
const lightbox = $("lightbox"), lightboxImage = $("lightbox-image"), lightboxCaption = $("lightbox-caption");
function openAlbumLightbox(photo, sameDay) { lightboxPhotos = sameDay; currentLightbox = sameDay.indexOf(photo); updateLightbox(); lightbox.classList.remove("hidden"); }
function updateLightbox() { const photo = lightboxPhotos[currentLightbox]; lightboxImage.src = photo.src; lightboxImage.alt = photo.caption || "Un nostro ricordo"; lightboxCaption.textContent = photo.caption || formatDate(photo.date); }
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
function closeCat() {
  const tail = $("cat-friend"), cat = $("cat-character");
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
    tail.classList.add("hidden"); cat.classList.remove("hidden");
    $("cat-message").classList.remove("hidden");
    requestAnimationFrame(() => { cat.classList.add("cat-entering"); cat.focus(); });
  };
  tail.addEventListener("transitionend", tail._catReveal);
});
$("cat-character").addEventListener("click", () => {
  const tail = $("cat-friend"), cat = $("cat-character");
  if (cat.classList.contains("cat-exiting")) return;
  cat.classList.remove("cat-entering"); cat.classList.add("cat-exiting");
  cat.addEventListener("transitionend", function restoreTail(event) {
    if (event.propertyName !== "transform") return;
    cat.removeEventListener("transitionend", restoreTail);
    cat.classList.remove("cat-exiting"); cat.classList.add("hidden");
    tail.classList.remove("hidden");
    void tail.offsetWidth;
    tail.classList.remove("tail-leaving");
  });
});
readUploadedPhotos().then(buildPages);

// Porta a maiuscola l'iniziale dei testi visibili, inclusi gli aggiornamenti dinamici.
function capitalizeInitial(value) { return value.replace(/^(\s*)([a-zà-öø-ÿ])/u, (_, space, letter) => space + letter.toLocaleUpperCase("it-IT")); }
function capitalizeNode(node) { if (node.nodeType === Node.TEXT_NODE) node.nodeValue = capitalizeInitial(node.nodeValue); else if (node.nodeType === Node.ELEMENT_NODE) { for (const attr of ["placeholder", "aria-label", "title"]) if (node.hasAttribute(attr)) node.setAttribute(attr, capitalizeInitial(node.getAttribute(attr))); node.childNodes.forEach(capitalizeNode); } }
document.body.childNodes.forEach(capitalizeNode);
new MutationObserver(records => records.forEach(record => { if (record.type === "characterData") { const next = capitalizeInitial(record.target.nodeValue); if (next !== record.target.nodeValue) record.target.nodeValue = next; } else record.addedNodes.forEach(capitalizeNode); })).observe(document.body, {subtree:true,childList:true,characterData:true});

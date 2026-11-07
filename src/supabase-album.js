import { AlbumAccessError, requireAlbumMember, supabase } from "./supabase-client.js";

const BUCKET = "album";
const SIGNED_URL_SECONDS = 300;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2560;

function asAlbumPhoto(row, signedUrl) {
  return {
    id: row.id,
    date: row.taken_at,
    caption: row.caption || "",
    position: row.position ?? 0,
    created_at: row.created_at,
    path: row.storage_path,
    src: signedUrl,
    source: "supabase",
    signedUntil: Date.now() + SIGNED_URL_SECONDS * 1000,
  };
}

async function signedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw new Error("Non riesco a generare il collegamento temporaneo per una fotografia privata.");
  return data.signedUrl;
}

export async function loadAlbumPhotos() {
  await requireAlbumMember();
  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, storage_path, taken_at, caption, position, created_at")
    .order("taken_at", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("Non riesco a leggere le fotografie dal database Supabase.");
  if (!rows?.length) return [];

  const signed = [];
  for (let offset = 0; offset < rows.length; offset += 100) {
    const chunk = rows.slice(offset, offset + 100);
    const { data, error: signingError } = await supabase.storage.from(BUCKET)
      .createSignedUrls(chunk.map((row) => row.storage_path), SIGNED_URL_SECONDS);
    if (signingError || data?.some((item) => item.error || !item.signedUrl)) throw new Error("Non riesco a creare gli URL temporanei per tutte le foto private.");
    signed.push(...(data || []));
  }

  const urlByPath = new Map(signed.filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]));
  return rows.filter((row) => urlByPath.has(row.storage_path))
    .map((row) => asAlbumPhoto(row, urlByPath.get(row.storage_path)));
}

export async function refreshAlbumPhotoUrl(photo) {
  await requireAlbumMember();
  if (photo.signedUntil && photo.signedUntil - Date.now() > 60_000) return photo.src;
  const url = await signedUrl(photo.path);
  photo.src = url;
  photo.signedUntil = Date.now() + SIGNED_URL_SECONDS * 1000;
  return url;
}

async function inspectImageFile(file) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...header);
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "jpeg";
  if (ascii.startsWith("\x89PNG\r\n\x1a\n")) return "png";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "gif";
  if (ascii.startsWith("BM")) return "bmp";
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12).toLowerCase();
    if (["avif", "avis"].includes(brand)) return "avif";
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand)) return "heif";
  }
  if (file.type?.startsWith("image/") && file.type !== "image/svg+xml") return "browser-image";
  throw new Error("Questo file non sembra una fotografia supportata.");
}

async function decodeInBrowser(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, release: () => bitmap.close() };
    } catch { /* Alcuni browser non decodificano HEIF nel percorso nativo. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Decodifica non disponibile."));
      element.src = url;
    });
    return { image, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

let heifDecoderPromise;
async function decodeHeifLocally(file) {
  heifDecoderPromise ||= import("heic-to").then(module => module.heicTo);
  const heicTo = await heifDecoderPromise;
  const bitmap = await heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } });
  if (!bitmap || !bitmap.width || !bitmap.height) throw new Error("Decodifica HEIF non riuscita.");
  return { image: bitmap, release: () => bitmap.close?.() };
}

async function encodeWebp(canvas, context, draw) {
  let quality = 0.94;
  for (;;) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.type !== "image/webp") throw new Error("WebP non è supportato da questo browser.");
    if (blob.size <= MAX_FILE_BYTES) return blob;
    if (quality > 0.78) { quality = Math.max(0.78, quality - 0.04); continue; }
    if (Math.max(canvas.width, canvas.height) <= 1280) throw new Error("La foto resta troppo grande anche dopo la preparazione.");
    canvas.width = Math.max(1, Math.round(canvas.width * 0.85));
    canvas.height = Math.max(1, Math.round(canvas.height * 0.85));
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    draw(context, canvas.width, canvas.height);
    quality = 0.90;
  }
}

export async function prepareAlbumPhoto(file) {
  let format;
  try { format = await inspectImageFile(file); } catch { throw new Error("Non siamo riusciti a preparare questa fotografia. Prova con un'altra immagine."); }
  let decoded;
  try { decoded = await decodeInBrowser(file); }
  catch (nativeError) {
    if (format !== "heif") throw new Error("Non siamo riusciti a preparare questa fotografia. Prova con un'altra immagine.", { cause: nativeError });
    try { decoded = await decodeHeifLocally(file); }
    catch (decoderError) { throw new Error("Non siamo riusciti a preparare questa fotografia. Prova con un'altra immagine.", { cause: decoderError }); }
  }

  const { image } = decoded;
  const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
  if (!width || !height) { decoded.release(); throw new Error("Non siamo riusciti a preparare questa fotografia. Prova con un'altra immagine."); }
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) { decoded.release(); throw new Error("Non siamo riusciti a preparare questa fotografia. Prova con un'altra immagine."); }
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  const draw = (ctx, targetWidth, targetHeight) => ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  draw(context, canvas.width, canvas.height);
  try { return await encodeWebp(canvas, context, draw); }
  catch (error) {
    if (error.message.includes("troppo grande")) throw error;
    throw new Error("Non siamo riusciti a preparare questa fotografia. Prova con un'altra immagine.", { cause: error });
  } finally { decoded.release(); canvas.width = 0; canvas.height = 0; }
}

export async function uploadAlbumPhoto(file, takenAt, caption = "", preparedImage = null) {
  const session = await requireAlbumMember();
  const image = preparedImage || await prepareAlbumPhoto(file);
  const path = `${takenAt.slice(0, 7)}/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, image, {
    contentType: "image/webp",
    cacheControl: "60",
    upsert: false,
  });
  if (uploadError) throw new Error("Il caricamento della foto su Supabase non è riuscito.");

  const { data: previous, error: positionError } = await supabase.from("photos")
    .select("position").eq("taken_at", takenAt).order("position", { ascending: false }).limit(1);
  if (positionError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error("Non riesco a preparare l'ordine delle foto. Il file temporaneo è stato rimosso.");
  }
  const position = (previous?.[0]?.position ?? -1) + 1;
  const { data: row, error: insertError } = await supabase.from("photos").insert({
    storage_path: path,
    taken_at: takenAt,
    caption: caption.trim() || null,
    position,
    created_by: session.user.id,
  }).select("id, storage_path, taken_at, caption, position, created_at").single();

  if (insertError) {
    const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([path]);
    if (cleanupError) throw new Error("Il database ha rifiutato la foto e il file temporaneo va rimosso dal bucket album.");
    throw new Error("Il database non ha salvato la foto; il file temporaneo è stato rimosso.");
  }

  try {
    return asAlbumPhoto(row, await signedUrl(path));
  } catch {
    const { data: removedRow, error: rowCleanupError } = await supabase.from("photos").delete().eq("id", row.id).select("id").maybeSingle();
    if (rowCleanupError || !removedRow) throw new Error("La foto è stata salvata ma non riesco a creare un URL privato né a rimuovere il record: controlla Supabase.");
    const { error: fileCleanupError } = await supabase.storage.from(BUCKET).remove([path]);
    if (fileCleanupError) throw new Error("Non è stato possibile generare l'anteprima; il record è stato rimosso ma resta un file da verificare nel bucket.");
    throw new Error("Non è stato possibile creare l'anteprima privata; la foto è stata rimossa per sicurezza.");
  }
}

export async function deleteAlbumPhoto(photo) {
  await requireAlbumMember();
  const { data: original, error: downloadError } = await supabase.storage.from(BUCKET).download(photo.path);
  if (downloadError) throw new Error("Non riesco a recuperare la foto privata per una cancellazione sicura.");

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([photo.path]);
  if (removeError) throw new Error("Non riesco a eliminare il file dal bucket privato.");

  const { data: deletedRow, error: rowError } = await supabase.from("photos").delete().eq("id", photo.id).select("id").maybeSingle();
  if (!rowError && deletedRow) return;

  const { error: restoreError } = await supabase.storage.from(BUCKET).upload(photo.path, original, {
    contentType: "image/webp",
    cacheControl: "60",
    upsert: false,
  });
  if (restoreError) {
    throw new Error("Il database non ha eliminato il record e il ripristino del file non è riuscito: verifica manualmente l'album.");
  }
  throw new Error("Il database non ha eliminato il record. La foto è stata ripristinata nel bucket.");
}

export function getAlbumAccessMessage(error) {
  if (error instanceof AlbumAccessError) return error.message;
  return error?.message || "Si è verificato un errore durante l'accesso all'album privato.";
}

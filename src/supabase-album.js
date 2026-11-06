import { AlbumAccessError, requireAlbumMember, supabase } from "./supabase-client.js";

const BUCKET = "album";
const SIGNED_URL_SECONDS = 300;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

async function optimizeForWeb(file) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error("Scegli una foto JPEG, PNG o WebP. HEIC non è supportato in questa versione.");
  }
  if (file.size > MAX_FILE_BYTES) throw new Error("La foto supera i 12 MB. Scegli una versione più leggera.");

  let bitmap;
  let width;
  let height;
  let draw;
  if ("createImageBitmap" in window) {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    width = bitmap.width;
    height = bitmap.height;
    draw = (context, targetWidth, targetHeight) => context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  } else {
    const imageUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = imageUrl;
      });
      width = image.naturalWidth;
      height = image.naturalHeight;
      draw = (context, targetWidth, targetHeight) => context.drawImage(image, 0, 0, targetWidth, targetHeight);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  const maxDimension = 2560;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Questo browser non riesce a preparare la foto per il caricamento.");
  draw(context, canvas.width, canvas.height);
  bitmap?.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob || blob.type !== "image/webp") throw new Error("Questo browser non riesce a preparare la foto in WebP.");
  // La nuova immagine non contiene i metadati EXIF/GPS del file originale.
  return blob;
}

export async function uploadAlbumPhoto(file, takenAt, caption = "") {
  const session = await requireAlbumMember();
  const image = await optimizeForWeb(file);
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

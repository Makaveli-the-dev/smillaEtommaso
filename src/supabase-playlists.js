import { requireAlbumMember, supabase } from "./supabase-client.js";

function getSpotifyPlaylistId(value) {
  const match = value.trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/|spotify:playlist:)([a-zA-Z0-9]+)/i);
  return match?.[1] || null;
}

export async function loadSharedPlaylists() {
  await requireAlbumMember();
  const [{ data: playlists, error: playlistError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("playlists").select("id, spotify_url, spotify_id, title, added_at, position").order("position").order("added_at"),
    supabase.from("site_settings").select("main_playlist_id").eq("id", "global").single(),
  ]);
  if (playlistError || settingsError) throw new Error("Non riesco a leggere le playlist condivise.");
  return { playlists: playlists || [], mainPlaylistId: settings.main_playlist_id };
}

export async function addSharedPlaylist(spotifyUrl, title = null) {
  const session = await requireAlbumMember();
  const spotifyId = getSpotifyPlaylistId(spotifyUrl);
  if (!spotifyId) throw new Error("Inserisci un link valido a una playlist Spotify.");
  const { data: last, error: orderError } = await supabase.from("playlists").select("position").order("position", { ascending: false }).limit(1);
  if (orderError) throw new Error("Non riesco a determinare l'ordine della cronologia Spotify.");
  const { data, error } = await supabase.from("playlists").insert({
    spotify_url: spotifyUrl.trim(), spotify_id: spotifyId, title: title?.trim() || null,
    position: (last?.[0]?.position ?? -1) + 1, added_by: session.user.id,
  }).select().single();
  if (error) throw new Error("Non riesco a salvare la playlist condivisa.");
  return data;
}

export async function selectMainPlaylist(playlistId) {
  const session = await requireAlbumMember();
  const { error } = await supabase.from("site_settings").update({ main_playlist_id: playlistId, updated_at: new Date().toISOString(), updated_by: session.user.id }).eq("id", "global");
  if (error) throw new Error("Non riesco ad aggiornare la playlist principale.");
}

export async function deleteSharedPlaylist(playlistId) {
  await requireAlbumMember();
  const { error } = await supabase.from("playlists").delete().eq("id", playlistId);
  if (error) throw new Error("Non riesco a rimuovere la playlist dalla cronologia condivisa.");
}

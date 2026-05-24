import axios from 'axios';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

export interface SpotifyResult {
  spotifyId: string;
  albumArt: string | null;
  previewUrl: string | null;
}

export interface SpotifySearchResult {
  spotifyId: string;
  title: string;
  artist: string;
  albumArt: string | null;
  previewUrl: string | null;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    'grant_type=client_credentials',
    { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  cachedToken = res.data.access_token;
  tokenExpiresAt = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken!;
}

export async function searchTrack(title: string, artist: string): Promise<SpotifyResult | null> {
  const token = await getToken();
  const query = encodeURIComponent(`track:${title} artist:${artist}`);

  const res = await axios.get(
    `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const track = res.data.tracks?.items?.[0];
  if (!track) return null;

  return {
    spotifyId: track.id,
    albumArt: track.album.images?.[0]?.url ?? null,
    previewUrl: track.preview_url ?? null,
  };
}

export async function searchTracks(query: string): Promise<SpotifySearchResult[]> {
  const token = await getToken();
  const encoded = encodeURIComponent(query);

  const res = await axios.get(
    `https://api.spotify.com/v1/search?q=${encoded}&type=track&limit=5`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const items = res.data.tracks?.items ?? [];

  return items.map((track: any) => ({
    spotifyId: track.id,
    title: track.name,
    artist: track.artists?.[0]?.name ?? 'Unknown Artist',
    albumArt: track.album.images?.[0]?.url ?? null,
    previewUrl: track.preview_url ?? null,
  }));
}

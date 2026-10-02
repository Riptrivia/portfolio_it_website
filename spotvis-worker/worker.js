const lyricCache = new Map();
const LYRIC_CACHE_MS = 60 * 60 * 1000;

function corsHeaders(origin, allowedOrigin) {
  const allowed = origin === allowedOrigin || origin === "http://localhost:8000" || origin === "http://127.0.0.1:8000";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": status === 200 ? "public, max-age=5, stale-while-revalidate=10" : "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function refreshAccessToken(env) {
  const credentials = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.SPOTIFY_REFRESH_TOKEN
    })
  });
  if (!response.ok) throw new Error(`Spotify token refresh failed (${response.status})`);
  const token = await response.json();
  return token.access_token;
}

async function getPlayback(accessToken) {
  return fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" }
  });
}

function parseLrc(value) {
  if (!value) return [];
  const lines = [];
  const pattern = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)/;
  for (const sourceLine of value.split(/\r?\n/)) {
    const match = sourceLine.match(pattern);
    if (!match) continue;
    const timeMs = Math.round((Number(match[1]) * 60 + Number(match[2])) * 1000);
    lines.push({ timeMs, text: match[3].trim() });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

async function getLyrics(track) {
  const cached = lyricCache.get(track.id);
  if (cached && Date.now() - cached.createdAt < LYRIC_CACHE_MS) return cached.lines;
  const query = new URLSearchParams({
    track_name: track.name,
    artist_name: track.artists.map((artist) => artist.name).join(", "),
    album_name: track.album.name,
    duration: String(Math.round(track.duration_ms / 1000))
  });
  let lines = [];
  try {
    const response = await fetch(`https://lrclib.net/api/get?${query}`, {
      headers: { "Accept": "application/json", "User-Agent": "MarcieloPortfolioSpotvis/1.0" }
    });
    if (response.ok) {
      const data = await response.json();
      lines = parseLrc(data.syncedLyrics);
    }
  } catch {
    lines = [];
  }
  lyricCache.set(track.id, { createdAt: Date.now(), lines });
  return lines;
}

async function handleNowPlaying(env, headers) {
  for (const key of ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN"]) {
    if (!env[key]) return json({ status: "unavailable", error: "Service configuration incomplete" }, 503, headers);
  }

  try {
    const accessToken = await refreshAccessToken(env);
    const response = await getPlayback(accessToken);
    if (response.status === 204) return json({ status: "idle", track: null, fetchedAt: Date.now() }, 200, headers);
    if (response.status === 429) {
      return json({ status: "unavailable", error: "Spotify rate limit", retryAfter: response.headers.get("Retry-After") }, 429, headers);
    }
    if (!response.ok) throw new Error(`Spotify playback request failed (${response.status})`);

    const data = await response.json();
    if (!data.item || data.item.type !== "track") return json({ status: "idle", track: null, fetchedAt: Date.now() }, 200, headers);
    const item = data.item;
    const images = Array.isArray(item.album.images) ? item.album.images : [];
    const image = images.reduce((best, candidate) => {
      if (!best) return candidate;
      return Math.abs((candidate.width || 0) - 300) < Math.abs((best.width || 0) - 300) ? candidate : best;
    }, null);
    const lyrics = await getLyrics(item);
    return json({
      status: data.is_playing ? "playing" : "paused",
      fetchedAt: Date.now(),
      track: {
        id: item.id,
        title: item.name,
        artists: item.artists.map((artist) => artist.name),
        album: item.album.name,
        imageUrl: image ? image.url : "",
        spotifyUrl: item.external_urls && item.external_urls.spotify || "",
        progressMs: data.progress_ms || 0,
        durationMs: item.duration_ms || 0,
        isPlaying: Boolean(data.is_playing),
        lyrics
      }
    }, 200, headers);
  } catch (error) {
    console.error("Spotvis request failed", error.message);
    return json({ status: "unavailable", error: "Playback service unavailable" }, 502, headers);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin, env.ALLOWED_ORIGIN || "https://riptrivia.github.io");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, headers);
    if (url.pathname === "/" || url.pathname === "/health") return json({ status: "ok", service: "spotvis" }, 200, headers);
    if (url.pathname === "/api/now-playing") return handleNowPlaying(env, headers);
    return json({ error: "Not found" }, 404, headers);
  }
};

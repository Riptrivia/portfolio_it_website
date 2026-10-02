# Spotvis portfolio connection

The website UI is safe to publish without credentials. Live playback requires the separate Cloudflare Worker in `spotvis-worker/`.

## 1. Create the Spotify authorization

Use a Spotify developer application and obtain a refresh token with only this scope:

```text
user-read-currently-playing
```

The existing desktop Spotvis token was authorized with playback-state and playback-control scopes. A new least-privilege refresh token is recommended for the public portfolio service.

## 2. Configure the Worker

From `spotvis-worker/`, authenticate Wrangler and add secrets interactively. Never paste secret values into source files or commit them.

```bash
npx wrangler login
npx wrangler secret put SPOTIFY_CLIENT_ID
npx wrangler secret put SPOTIFY_CLIENT_SECRET
npx wrangler secret put SPOTIFY_REFRESH_TOKEN
npx wrangler deploy
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to the portfolio origin. It intentionally excludes the path because browser Origin headers contain only the scheme and host.

## 3. Connect the frontend

Copy the deployed Worker endpoint into `spotvis-config.js`:

```js
window.SPOTVIS_CONFIG = Object.freeze({
  apiUrl: "https://YOUR-WORKER.workers.dev/api/now-playing"
});
```

That URL is public and safe. The Spotify client secret and refresh token must remain Worker secrets.

## Behavior

- The homepage polls the Worker every 15 seconds.
- The browser extrapolates playback progress locally between responses.
- Album artwork is displayed without cropping and links back to Spotify.
- Synchronized lyrics are requested from LRCLIB and displayed as a seven-line moving window.
- Plain lyrics are not assigned fake timestamps.
- No audio is streamed or captured by the website.
- Missing playback, lyrics, configuration, or connectivity degrades to a clear idle/private state.

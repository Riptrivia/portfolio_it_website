(() => {
  "use strict";

  const config = window.SPOTVIS_CONFIG || {};
  const apiUrl = String(config.apiUrl || "").trim();
  const state = {
    payload: null,
    receivedAt: 0,
    timer: 0,
    pollTimer: 0
  };

  const all = (selector) => Array.from(document.querySelectorAll(selector));
  const one = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const formatTime = (milliseconds) => {
    const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  };

  function progressNow() {
    const track = state.payload && state.payload.track;
    if (!track) return 0;
    const elapsed = track.isPlaying ? Date.now() - state.receivedAt : 0;
    return clamp((track.progressMs || 0) + elapsed, 0, track.durationMs || 0);
  }

  function setArtwork(element, imageUrl, alt) {
    if (!element) return;
    element.replaceChildren();
    if (!imageUrl) {
      const fallback = document.createElement("b");
      fallback.textContent = "♪";
      element.appendChild(fallback);
      element.classList.add("is-empty");
      return;
    }
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = alt || "Current Spotify album artwork";
    image.decoding = "async";
    element.appendChild(image);
    element.classList.remove("is-empty");
  }

  function renderMini(payload) {
    const card = one("[data-spotvis-mini]");
    if (!card) return;
    const track = payload && payload.track;
    const label = one("[data-spotvis-mini-label]");
    const title = one("[data-spotvis-mini-title]");
    const artist = one("[data-spotvis-mini-artist]");
    const light = one("[data-spotvis-mini-light]");

    card.classList.toggle("is-live", Boolean(track && track.isPlaying));
    card.classList.toggle("is-paused", Boolean(track && !track.isPlaying));
    if (light) light.className = track && track.isPlaying ? "is-live" : "";

    if (track) {
      label.textContent = track.isPlaying ? "SPOTVIS // NOW PLAYING" : "SPOTVIS // PAUSED";
      title.textContent = track.title;
      artist.textContent = track.artists.join(", ");
      setArtwork(one("[data-spotvis-mini-art]"), track.imageUrl, `${track.album} album artwork`);
      return;
    }

    const configured = Boolean(apiUrl);
    label.textContent = configured ? "SPOTVIS // OFFLINE" : "SPOTVIS // PRIVATE";
    title.textContent = configured ? "Nothing playing right now" : "Listening status unavailable";
    artist.textContent = configured ? "Check back later" : "Open the music page";
    setArtwork(one("[data-spotvis-mini-art]"), "", "");
  }

  function renderLyrics(track, progress) {
    const stage = one("[data-spotvis-lyrics]");
    if (!stage) return;
    const lines = track && Array.isArray(track.lyrics) ? track.lyrics : [];
    if (!lines.length) {
      stage.innerHTML = `<p class="lyrics-message">${track ? "Synchronized lyrics are unavailable for this track." : "Lyrics appear here while music is playing."}</p>`;
      return;
    }

    let active = 0;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].timeMs <= progress) active = index;
      else break;
    }
    const start = Math.max(0, active - 3);
    const end = Math.min(lines.length, active + 4);
    const fragment = document.createDocumentFragment();
    lines.slice(start, end).forEach((line, offset) => {
      const paragraph = document.createElement("p");
      const index = start + offset;
      paragraph.textContent = line.text || "♪";
      paragraph.className = index === active ? "is-active" : index < active ? "is-past" : "";
      if (index === active) paragraph.setAttribute("aria-current", "true");
      fragment.appendChild(paragraph);
    });
    stage.replaceChildren(fragment);
  }

  function renderPage(payload) {
    const page = one("[data-spotvis-page]");
    if (!page) return;
    const track = payload && payload.track;
    const status = one("[data-spotvis-status]");
    const title = one("[data-spotvis-title]");
    const artist = one("[data-spotvis-artist]");
    const album = one("[data-spotvis-album]");
    const spotifyLink = one("[data-spotvis-link]");

    page.classList.toggle("has-track", Boolean(track));
    status.textContent = track ? (track.isPlaying ? "LIVE // NOW PLAYING" : "PLAYBACK PAUSED") : (apiUrl ? "SPOTVIS // IDLE" : "SPOTVIS // PRIVATE");
    title.textContent = track ? track.title : "No public playback data";
    artist.textContent = track ? track.artists.join(", ") : "Marcielo’s listening status";
    album.textContent = track ? track.album : (apiUrl ? "Nothing is playing right now." : "The secure Spotify endpoint has not been connected yet.");
    setArtwork(one("[data-spotvis-art]"), track && track.imageUrl, track ? `${track.album} album artwork` : "");

    if (track && track.spotifyUrl) {
      spotifyLink.href = track.spotifyUrl;
      spotifyLink.hidden = false;
    } else {
      spotifyLink.hidden = true;
    }
    renderTimeline();
  }

  function renderTimeline() {
    const track = state.payload && state.payload.track;
    if (!track) {
      renderLyrics(null, 0);
      return;
    }
    const progress = progressNow();
    const ratio = track.durationMs ? progress / track.durationMs : 0;
    const bar = one("[data-spotvis-progress]");
    const current = one("[data-spotvis-current]");
    const duration = one("[data-spotvis-duration]");
    if (bar) bar.style.transform = `scaleX(${clamp(ratio, 0, 1)})`;
    if (current) current.textContent = formatTime(progress);
    if (duration) duration.textContent = formatTime(track.durationMs);
    renderLyrics(track, progress);
  }

  function normalize(data) {
    if (!data || typeof data !== "object" || !data.track) return { status: data && data.status || "idle", track: null };
    const track = data.track;
    return {
      status: data.status || (track.isPlaying ? "playing" : "paused"),
      track: {
        id: String(track.id || ""),
        title: String(track.title || "Unknown track"),
        artists: Array.isArray(track.artists) ? track.artists.map(String) : [],
        album: String(track.album || ""),
        imageUrl: String(track.imageUrl || ""),
        spotifyUrl: String(track.spotifyUrl || ""),
        progressMs: Number(track.progressMs) || 0,
        durationMs: Number(track.durationMs) || 0,
        isPlaying: Boolean(track.isPlaying),
        lyrics: Array.isArray(track.lyrics) ? track.lyrics
          .filter((line) => line && Number.isFinite(Number(line.timeMs)))
          .map((line) => ({ timeMs: Number(line.timeMs), text: String(line.text || "") })) : []
      }
    };
  }

  async function refresh() {
    if (!apiUrl) {
      state.payload = { status: "private", track: null };
      state.receivedAt = Date.now();
      renderMini(state.payload);
      renderPage(state.payload);
      return;
    }
    try {
      const response = await fetch(apiUrl, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error(`Spotvis endpoint returned ${response.status}`);
      state.payload = normalize(await response.json());
    } catch (error) {
      console.warn("Spotvis playback unavailable:", error.message);
      state.payload = { status: "unavailable", track: null };
    }
    state.receivedAt = Date.now();
    renderMini(state.payload);
    renderPage(state.payload);
  }

  refresh();
  state.pollTimer = window.setInterval(refresh, 15000);
  state.timer = window.setInterval(renderTimeline, 500);
  window.addEventListener("pagehide", () => {
    window.clearInterval(state.pollTimer);
    window.clearInterval(state.timer);
  }, { once: true });
})();

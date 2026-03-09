# Enterpret Offsite 2026 Photobook

Retro desktop-style photobook with an ASCII animated background, hidden SoundCloud soundtrack, and a draggable/resizable media viewer.

## Features

- ASCII video background rendered from precomputed text frames.
- macOS-classic inspired desktop UI with a `Memories` folder trigger.
- Photo + video viewer with keyboard navigation, draggable scrollbar, and window resize handles.
- Browser compatibility fallbacks for HEIC/HEIF files (auto-tries same-name converted files).

## Project structure

- `index.html`: Static page shell and script ordering.
- `styles.css`: Retro UI and photobook window styles.
- `main.js`: App bootstrap (loader, ASCII controller, navbar clock/link, SoundCloud controller).
- `photobook.js`: Media discovery, compatibility checks, and photobook interaction logic.
- `photos-manifest.js`: Explicit media key list (used for local files and R2 object keys).
- `ascii_video_frames_data.js`: Generated ASCII animation frame payload.
- `photos/`: Optional local media assets for local-only runs.

## Run locally

1. Put image/video files in `photos/` (optional if using R2 only).
2. Update `photos-manifest.js` with exact file names/object keys.
3. Open `index.html` in a browser.

Optional local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Cloudflare R2 + Pages setup

Use these settings for this project:

1. In Cloudflare Dashboard, open `R2 Object Storage` -> bucket `phuket-photos` -> `Settings`.
2. Ensure `Public Development URL` is enabled.
3. In `index.html`, set `window.PHOTOBOOK_MEDIA_BASE_URL` to your bucket base URL.
   - Current value: `https://pub-9c487fda6d0a4dc8acd61702b4b52470.r2.dev`
4. Keep `photos-manifest.js` as the source of object keys and ensure each entry exactly matches R2 key casing.
   - Example: `IMG_01440.jpg` is different from `IMG_01440.JPG`.
5. Deploy this repo to Cloudflare Pages as a static site (no build command required).

Optional hardening for production:

1. Add an R2 custom domain in the bucket `Settings` and swap `window.PHOTOBOOK_MEDIA_BASE_URL` to that domain.
2. Configure R2 CORS for your Pages host if you later need stricter cross-origin behavior (for example, canvas processing).

## Media loading order

Photobook files are resolved in this order:

1. `window.PHOTOBOOK_FILES` from `photos-manifest.js` (if present and non-empty)
2. `photos/manifest.json` (if served)
3. Server directory listing for `photos/` (if enabled by host)

When `window.PHOTOBOOK_MEDIA_BASE_URL` is set, rendered media URLs are loaded from that base (for example, R2).

## Supported formats

- Images: `avif`, `gif`, `heic`, `heif`, `jpg`, `jpeg`, `png`, `webp`
- Videos: `m4v`, `mov`, `mp4`, `ogv`, `webm`

Notes:

- Codec support is browser-dependent.
- If HEIC is not decodable in the browser, the app tries same-name fallbacks like `IMG_1234.jpg`, `IMG_1234.png`, etc.
- Video playback is probed before rendering to avoid broken-player states.

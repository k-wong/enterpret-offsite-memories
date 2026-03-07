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
- `photos-manifest.js`: Optional explicit media list for reliable `file://` usage.
- `ascii_video_frames_data.js`: Generated ASCII animation frame payload.
- `photos/`: Your media assets.

## Run locally

1. Put image/video files in `photos/`.
2. Update `photos-manifest.js` (recommended if opening `index.html` directly via `file://`).
3. Open `index.html` in a browser.

Optional local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Media loading order

Photobook files are resolved in this order:

1. `window.PHOTOBOOK_FILES` from `photos-manifest.js` (if present and non-empty)
2. `photos/manifest.json` (if served)
3. Server directory listing for `photos/` (if enabled by host)

## Supported formats

- Images: `avif`, `gif`, `heic`, `heif`, `jpg`, `jpeg`, `png`, `webp`
- Videos: `m4v`, `mov`, `mp4`, `ogv`, `webm`

Notes:

- Codec support is browser-dependent.
- If HEIC is not decodable in the browser, the app tries same-name fallbacks like `IMG_1234.jpg`, `IMG_1234.png`, etc.
- Video playback is probed before rendering to avoid broken-player states.

# Enterpret Offsite 2026 Photobook

Retro desktop-style photobook with an ASCII animated background, beach sounds, and a media viewer. View at phuket.enterpret.com.

## Features

- ASCII video background.
- macOS-classic inspired desktop UI with a `Memories` folder.
- Photo + video viewer with keyboard navigation, draggable scrollbar, and window resize handles.

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

## Supported formats

- Images: `avif`, `gif`, `heic`, `heif`, `jpg`, `jpeg`, `png`, `webp`
- Videos: `m4v`, `mov`, `mp4`, `ogv`, `webm`

Notes:

- Codec support is browser-dependent.
- Video playback is probed before rendering to avoid broken-player states.

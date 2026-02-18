const asciiBg = document.getElementById("ascii-bg");
const navbarTime = document.getElementById("mac-navbar-time");
const FPS = 8;
const FRAME_INTERVAL_MS = Math.round(1000 / FPS);
const ASCII_LINE_HEIGHT = 0.92;
const MEASURE_FONT_SIZE = 100;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const frames = Array.isArray(window.ASCII_VIDEO_FRAMES) ? window.ASCII_VIDEO_FRAMES : [];
let currentFrameIndex = 0;
let playbackTimer = null;
let frameRowCount = 0;
let frameColumnCount = 0;
let resizeRaf = null;

function computeFrameDimensions() {
  let maxRows = 0;
  let maxColumns = 0;
  for (const frame of frames) {
    const lines = frame.split("\n");
    maxRows = Math.max(maxRows, lines.length);
    for (const line of lines) {
      maxColumns = Math.max(maxColumns, line.length);
    }
  }
  frameRowCount = maxRows;
  frameColumnCount = maxColumns;
}

function fitAsciiToViewport() {
  if (!frameColumnCount || !frameRowCount) {
    return;
  }

  const canvas = fitAsciiToViewport.canvas || document.createElement("canvas");
  fitAsciiToViewport.canvas = canvas;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const fontFamily = window.getComputedStyle(asciiBg).fontFamily;
  context.font = `${MEASURE_FONT_SIZE}px ${fontFamily}`;
  const sampleLine = "M".repeat(frameColumnCount);
  const measuredWidth = context.measureText(sampleLine).width;
  if (!measuredWidth) {
    return;
  }

  const fontSizePx = (window.innerWidth / measuredWidth) * MEASURE_FONT_SIZE;
  asciiBg.style.fontSize = `${fontSizePx}px`;

  const renderedHeight = frameRowCount * fontSizePx * ASCII_LINE_HEIGHT;
  const topOffset = Math.max(0, (window.innerHeight - renderedHeight) / 2);
  asciiBg.style.top = `${topOffset}px`;
}

function scheduleFitAsciiToViewport() {
  if (resizeRaf !== null) {
    window.cancelAnimationFrame(resizeRaf);
  }
  resizeRaf = window.requestAnimationFrame(() => {
    resizeRaf = null;
    fitAsciiToViewport();
  });
}

function renderFrame(index) {
  asciiBg.textContent = frames[index];
}

function stopPlayback() {
  if (playbackTimer === null) {
    return;
  }
  window.clearInterval(playbackTimer);
  playbackTimer = null;
}

function shouldAnimate() {
  return !window.matchMedia(REDUCED_MOTION_QUERY).matches && !document.hidden;
}

function startPlayback() {
  if (!frames.length || !asciiBg) {
    return;
  }
  computeFrameDimensions();
  fitAsciiToViewport();
  renderFrame(0);
  window.addEventListener("resize", scheduleFitAsciiToViewport);

  if (!shouldAnimate()) {
    stopPlayback();
    return;
  }

  stopPlayback();

  playbackTimer = window.setInterval(() => {
    currentFrameIndex = (currentFrameIndex + 1) % frames.length;
    renderFrame(currentFrameIndex);
  }, FRAME_INTERVAL_MS);
}

function initAsciiBackground() {
  if (!asciiBg) {
    return;
  }

  if (frames.length === 0) {
    asciiBg.textContent =
      "ASCII video background could not be loaded.\nExpected ASCII_VIDEO_FRAMES in ascii_video_frames_data.js.";
    return;
  }

  startPlayback();

  const reducedMotionMediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  const onMotionPreferenceChange = () => startPlayback();
  if (typeof reducedMotionMediaQuery.addEventListener === "function") {
    reducedMotionMediaQuery.addEventListener("change", onMotionPreferenceChange);
  } else if (typeof reducedMotionMediaQuery.addListener === "function") {
    // Safari < 14 fallback.
    reducedMotionMediaQuery.addListener(onMotionPreferenceChange);
  }

  document.addEventListener("visibilitychange", () => {
    if (shouldAnimate()) {
      startPlayback();
      return;
    }
    stopPlayback();
  });
}

function formatTime12h(date) {
  let hours = date.getHours() % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${String(hours).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function initNavbarClock() {
  if (!navbarTime) {
    return;
  }

  const tick = () => {
    navbarTime.textContent = formatTime12h(new Date());
    const now = new Date();
    const delayMs = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    window.setTimeout(tick, Math.max(delayMs, 250));
  };

  tick();
}

initAsciiBackground();
initNavbarClock();

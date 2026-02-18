const asciiBg = document.getElementById("ascii-bg");
const FPS = 8;
const FRAME_INTERVAL_MS = Math.round(1000 / FPS);
const ASCII_LINE_HEIGHT = 0.92;
const MEASURE_FONT_SIZE = 100;

const frames = window.ASCII_VIDEO_FRAMES;
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

function startPlayback() {
  if (!frames.length) {
    return;
  }
  computeFrameDimensions();
  fitAsciiToViewport();
  renderFrame(0);
  window.addEventListener("resize", scheduleFitAsciiToViewport);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  if (playbackTimer !== null) {
    window.clearInterval(playbackTimer);
  }

  playbackTimer = window.setInterval(() => {
    currentFrameIndex = (currentFrameIndex + 1) % frames.length;
    renderFrame(currentFrameIndex);
  }, FRAME_INTERVAL_MS);
}

function loadAndPlayAsciiVideoBackground() {
  if (!Array.isArray(frames) || frames.length === 0) {
    asciiBg.textContent =
      "ASCII video background could not be loaded.\nExpected ASCII_VIDEO_FRAMES in ascii_video_frames_data.js.";
    return;
  }
  startPlayback();
}

loadAndPlayAsciiVideoBackground();

const ASCII_BACKGROUND_ERROR =
  "ASCII video background could not be loaded.\nExpected ASCII_VIDEO_FRAMES in ascii_video_frames_data.js.";
const ENTERPRET_HOMEPAGE_URL = "https://www.enterpret.com";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SOUNDCLOUD_WIDGET_API_SRC = "https://w.soundcloud.com/player/api.js";

const ASCII_CONFIG = {
  fps: 8,
  lineHeight: 0.92,
  measureFontSize: 100,
};

const LOADER_CONFIG = {
  visibleMs: 3000,
  fadeMs: 500,
};

const FRAME_INTERVAL_MS = Math.round(1000 / ASCII_CONFIG.fps);

const elements = {
  asciiBackground: document.getElementById("ascii-bg"),
  navbarTime: document.getElementById("mac-navbar-time"),
  navbar: document.querySelector(".mac-navbar"),
  pageLoader: document.getElementById("page-loader"),
  soundButton: document.getElementById("enable-sound-btn"),
};

function initPageLoader(loaderElement) {
  if (!loaderElement) {
    return;
  }

  document.body.classList.add("is-site-hidden");
  window.setTimeout(() => {
    loaderElement.classList.add("is-fading");
    loaderElement.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-site-hidden");
    window.setTimeout(() => loaderElement.remove(), LOADER_CONFIG.fadeMs);
  }, LOADER_CONFIG.visibleMs);
}

function computeFrameDimensions(frames) {
  let maxRows = 0;
  let maxColumns = 0;

  for (const frame of frames) {
    const lines = frame.split("\n");
    maxRows = Math.max(maxRows, lines.length);
    for (const line of lines) {
      maxColumns = Math.max(maxColumns, line.length);
    }
  }

  return { rows: maxRows, columns: maxColumns };
}

function createAsciiBackgroundController(asciiElement, frames) {
  let currentFrameIndex = 0;
  let playbackTimer = null;
  let resizeRaf = null;

  const dimensions = computeFrameDimensions(frames);
  const measurementCanvas = document.createElement("canvas");

  function fitToViewport() {
    if (!dimensions.columns || !dimensions.rows) {
      return;
    }

    const context = measurementCanvas.getContext("2d");
    if (!context) {
      return;
    }

    const fontFamily = window.getComputedStyle(asciiElement).fontFamily;
    context.font = `${ASCII_CONFIG.measureFontSize}px ${fontFamily}`;
    const measuredWidth = context.measureText("M".repeat(dimensions.columns)).width;
    if (!measuredWidth) {
      return;
    }

    const viewportWidth = asciiElement.clientWidth || window.innerWidth;
    const viewportHeight = asciiElement.clientHeight || window.innerHeight;
    const fontSizeForWidth = (viewportWidth / measuredWidth) * ASCII_CONFIG.measureFontSize;
    const fontSizeForHeight = viewportHeight / (dimensions.rows * ASCII_CONFIG.lineHeight);
    asciiElement.style.fontSize = `${Math.max(fontSizeForWidth, fontSizeForHeight)}px`;
  }

  function scheduleFit() {
    if (resizeRaf !== null) {
      window.cancelAnimationFrame(resizeRaf);
    }
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = null;
      fitToViewport();
    });
  }

  function renderFrame(index) {
    asciiElement.textContent = frames[index];
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
    fitToViewport();
    renderFrame(currentFrameIndex);
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

  function init() {
    window.addEventListener("resize", scheduleFit);

    const reducedMotionMediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleMotionPreferenceChange = () => startPlayback();
    if (typeof reducedMotionMediaQuery.addEventListener === "function") {
      reducedMotionMediaQuery.addEventListener("change", handleMotionPreferenceChange);
    } else if (typeof reducedMotionMediaQuery.addListener === "function") {
      // Safari < 14 fallback.
      reducedMotionMediaQuery.addListener(handleMotionPreferenceChange);
    }

    document.addEventListener("visibilitychange", () => {
      if (shouldAnimate()) {
        startPlayback();
        return;
      }
      stopPlayback();
    });

    startPlayback();
  }

  return { init };
}

function initAsciiBackground(asciiElement) {
  if (!asciiElement) {
    return;
  }

  const frames = Array.isArray(window.ASCII_VIDEO_FRAMES) ? window.ASCII_VIDEO_FRAMES : [];
  if (!frames.length) {
    asciiElement.textContent = ASCII_BACKGROUND_ERROR;
    return;
  }

  createAsciiBackgroundController(asciiElement, frames).init();
}

function formatTime12h(date) {
  let hours = date.getHours() % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${String(hours).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function initNavbarClock(timeElement) {
  if (!timeElement) {
    return;
  }

  const tick = () => {
    const now = new Date();
    timeElement.textContent = formatTime12h(now);
    const delayMs = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    window.setTimeout(tick, Math.max(delayMs, 250));
  };

  tick();
}

function initNavbarLink(navbarElement) {
  if (!navbarElement) {
    return;
  }

  navbarElement.addEventListener("click", () => {
    window.location.href = ENTERPRET_HOMEPAGE_URL;
  });
}

function createSoundCloudController() {
  let widget = null;
  let isWidgetReady = false;
  let pendingManualEnable = false;

  function enableSound() {
    if (!widget || !isWidgetReady) {
      pendingManualEnable = true;
      return;
    }

    try {
      // Must run from user click context for browser autoplay policies.
      widget.play();
      widget.setVolume(100);
    } catch (_error) {
      return;
    }

    window.setTimeout(() => {
      if (!widget || typeof widget.isPaused !== "function") {
        return;
      }
      widget.isPaused((_isPaused) => {
        // No state UI toggle requested; keep symbol minimal.
      });
    }, 300);
  }

  function initWidget() {
    if (!window.SC || typeof window.SC.Widget !== "function") {
      return;
    }

    const iframe = document.getElementById("soundcloud-player");
    if (!iframe) {
      return;
    }

    widget = window.SC.Widget(iframe);
    widget.bind(window.SC.Widget.Events.READY, () => {
      isWidgetReady = true;
      if (pendingManualEnable) {
        pendingManualEnable = false;
        enableSound();
      }
    });
  }

  function loadApi() {
    if (window.SC && typeof window.SC.Widget === "function") {
      initWidget();
      return;
    }

    const existingScript = document.querySelector(`script[src="${SOUNDCLOUD_WIDGET_API_SRC}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", initWidget, { once: true });
      return;
    }

    const apiScript = document.createElement("script");
    apiScript.src = SOUNDCLOUD_WIDGET_API_SRC;
    apiScript.async = true;
    apiScript.addEventListener("load", initWidget, { once: true });
    document.head.appendChild(apiScript);
  }

  return { enableSound, loadApi };
}

function initSoundButton(buttonElement, soundCloudController) {
  if (!buttonElement) {
    return;
  }

  buttonElement.addEventListener("click", () => {
    soundCloudController.enableSound();
  });
  soundCloudController.loadApi();
}

const soundCloudController = createSoundCloudController();
window.enableBackgroundSound = soundCloudController.enableSound;

initPageLoader(elements.pageLoader);
initAsciiBackground(elements.asciiBackground);
initNavbarClock(elements.navbarTime);
initNavbarLink(elements.navbar);
initSoundButton(elements.soundButton, soundCloudController);

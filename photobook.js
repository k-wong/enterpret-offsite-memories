const PHOTOBOOK_FOLDER_SELECTOR = ".desktop-folder-icon";
const PHOTOBOOK_IMAGE_EXTENSIONS = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;
const PHOTOBOOK_VIDEO_EXTENSIONS = /\.(m4v|mov|mp4|ogv|webm)$/i;
const PHOTOBOOK_HEIC_EXTENSIONS = /\.(heic|heif)$/i;
const PHOTOBOOK_VIDEO_PROBE_TIMEOUT_MS = 6000;
const PHOTOBOOK_LOCAL_MEDIA_DIRECTORY = "photos";
const PHOTOBOOK_REMOTE_MEDIA_BASE_URL = normalizeMediaBaseUrl(
  typeof window.PHOTOBOOK_MEDIA_BASE_URL === "string" ? window.PHOTOBOOK_MEDIA_BASE_URL : "",
);
const PHOTOBOOK_MIN_THUMB_PERCENT = 8;
const PHOTOBOOK_WINDOW_PADDING_PX = 12;
const PHOTOBOOK_WINDOW_MIN_WIDTH_PX = 560;
const PHOTOBOOK_WINDOW_MIN_HEIGHT_PX = 420;
const PHOTOBOOK_RESIZE_EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const photoVideoCompatibilityCache = new Map();
const PHOTOBOOK_MESSAGES = {
  noPhotos: "No photos found in the photos folder.",
  noPhotosFileProtocol:
    "No photos found. If opening via file://, update photos-manifest.js with your photo filenames.",
  loadingPhotos: "Loading memories...",
  unsupportedHeic:
    "No browser-compatible photos found. This browser cannot open .HEIC files without JPG/PNG copies.",
  checkingVideo: "Checking video compatibility...",
  unsupportedVideo: "Could not play this video in your browser. Try the next file.",
  unsupportedFile: "Could not load this file. Try the next one.",
};

function normalizePhotoFileName(fileName) {
  if (typeof fileName !== "string") {
    return "";
  }
  const normalized = fileName.trim().replace(/\?.*$/, "").replace(/#.*$/, "");
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/");
}

function normalizeMediaBaseUrl(mediaBaseUrl) {
  if (typeof mediaBaseUrl !== "string") {
    return "";
  }
  return mediaBaseUrl.trim().replace(/\/+$/, "");
}

function isSupportedPhotobookFile(fileName) {
  return PHOTOBOOK_IMAGE_EXTENSIONS.test(fileName) || PHOTOBOOK_VIDEO_EXTENSIONS.test(fileName);
}

function isVideoFile(fileName) {
  return PHOTOBOOK_VIDEO_EXTENSIONS.test(fileName);
}

function isHeicFile(fileName) {
  return PHOTOBOOK_HEIC_EXTENSIONS.test(fileName);
}

function getMediaTypeLabel(fileName) {
  return isVideoFile(fileName) ? "MOVI" : "PICT";
}

function sortPhotoNamesAlphabetically(fileNames) {
  const deduped = [...new Set(fileNames.map((fileName) => normalizePhotoFileName(fileName)).filter(Boolean))];
  return deduped.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function parseDirectoryListing(directoryHtml) {
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(directoryHtml, "text/html");
  const links = Array.from(htmlDoc.querySelectorAll("a[href]"));

  const files = [];
  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("?") || href.startsWith("#")) {
      continue;
    }
    if (href.includes("../")) {
      continue;
    }
    let decodedHref = href;
    try {
      decodedHref = decodeURIComponent(href);
    } catch (_error) {
      // Keep raw href if URI decoding fails.
    }
    if (decodedHref.endsWith("/")) {
      continue;
    }
    const fileName = normalizePhotoFileName(decodedHref.split("/").pop() || "");
    if (!fileName || !isSupportedPhotobookFile(fileName)) {
      continue;
    }
    files.push(fileName);
  }
  return sortPhotoNamesAlphabetically(files);
}

async function getPhotoFilesFromManifest() {
  const manifestResponse = await fetch(`${PHOTOBOOK_LOCAL_MEDIA_DIRECTORY}/manifest.json`, { cache: "no-store" });
  if (!manifestResponse.ok) {
    return [];
  }
  const manifestData = await manifestResponse.json();
  if (!Array.isArray(manifestData)) {
    return [];
  }
  return sortPhotoNamesAlphabetically(
    manifestData.map((entry) => normalizePhotoFileName(entry)).filter(isSupportedPhotobookFile),
  );
}

async function getPhotoFilesFromDirectoryListing() {
  const directoryResponse = await fetch(`${PHOTOBOOK_LOCAL_MEDIA_DIRECTORY}/`, { cache: "no-store" });
  if (!directoryResponse.ok) {
    return [];
  }
  const directoryHtml = await directoryResponse.text();
  return parseDirectoryListing(directoryHtml);
}

async function loadPhotobookFiles() {
  if (Array.isArray(window.PHOTOBOOK_FILES) && window.PHOTOBOOK_FILES.length) {
    return sortPhotoNamesAlphabetically(
      window.PHOTOBOOK_FILES.map((entry) => normalizePhotoFileName(entry)).filter(isSupportedPhotobookFile),
    );
  }

  try {
    const fromManifest = await getPhotoFilesFromManifest();
    if (fromManifest.length) {
      return fromManifest;
    }
  } catch (_error) {
    // Manifest file is optional.
  }

  try {
    const fromListing = await getPhotoFilesFromDirectoryListing();
    if (fromListing.length) {
      return fromListing;
    }
  } catch (_error) {
    // Directory listing support depends on the hosting server.
  }

  return [];
}

function encodePhotoPath(fileName) {
  const encodedFileName = fileName.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  if (PHOTOBOOK_REMOTE_MEDIA_BASE_URL) {
    return `${PHOTOBOOK_REMOTE_MEDIA_BASE_URL}/${encodedFileName}`;
  }
  return `${PHOTOBOOK_LOCAL_MEDIA_DIRECTORY}/${encodedFileName}`;
}

function canDecodeImageAtPath(path) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = path;
  });
}

function canDecodeVideoAtPath(path) {
  const cachedResult = photoVideoCompatibilityCache.get(path);
  if (typeof cachedResult === "boolean") {
    return Promise.resolve(cachedResult);
  }

  return new Promise((resolve) => {
    const videoProbe = document.createElement("video");
    let settled = false;
    const finalize = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      videoProbe.onloadedmetadata = null;
      videoProbe.onerror = null;
      videoProbe.removeAttribute("src");
      videoProbe.load();
      photoVideoCompatibilityCache.set(path, result);
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => finalize(false), PHOTOBOOK_VIDEO_PROBE_TIMEOUT_MS);
    videoProbe.preload = "metadata";
    videoProbe.muted = true;
    videoProbe.playsInline = true;
    videoProbe.onloadedmetadata = () => finalize(true);
    videoProbe.onerror = () => finalize(false);
    videoProbe.src = path;
    videoProbe.load();
  });
}

async function resolveDisplayFilesForBrowser(fileNames) {
  const heicEntries = fileNames.filter((fileName) => isHeicFile(fileName));
  if (!heicEntries.length) {
    return { files: fileNames, skippedHeicCount: 0 };
  }

  const heicLoads = await canDecodeImageAtPath(encodePhotoPath(heicEntries[0]));
  if (heicLoads) {
    return { files: fileNames, skippedHeicCount: 0 };
  }

  const displayFiles = fileNames.filter((fileName) => !isHeicFile(fileName));
  return { files: displayFiles, skippedHeicCount: fileNames.length - displayFiles.length };
}

function createPhotobookElements() {
  const overlay = document.createElement("div");
  overlay.className = "photobook-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const windowContainer = document.createElement("section");
  windowContainer.className = "photobook-window";
  windowContainer.setAttribute("role", "dialog");
  windowContainer.setAttribute("aria-modal", "true");
  windowContainer.setAttribute("aria-label", "Photo memories");

  const titleBar = document.createElement("header");
  titleBar.className = "photobook-titlebar";

  const title = document.createElement("p");
  title.className = "photobook-title";
  title.textContent = "Photobook";
  titleBar.appendChild(title);

  const viewport = document.createElement("div");
  viewport.className = "photobook-photo-viewport";

  const viewportInner = document.createElement("div");
  viewportInner.className = "photobook-photo-inner";

  const photoImage = document.createElement("img");
  photoImage.className = "photobook-photo";
  photoImage.alt = "Photobook memory";
  photoImage.decoding = "async";
  photoImage.loading = "eager";
  viewportInner.appendChild(photoImage);

  const photoVideo = document.createElement("video");
  photoVideo.className = "photobook-photo photobook-video";
  photoVideo.controls = true;
  photoVideo.preload = "metadata";
  photoVideo.playsInline = true;
  photoVideo.hidden = true;
  viewportInner.appendChild(photoVideo);

  const emptyMessage = document.createElement("div");
  emptyMessage.className = "photobook-empty-message";
  emptyMessage.textContent = PHOTOBOOK_MESSAGES.noPhotos;
  emptyMessage.hidden = true;
  viewportInner.appendChild(emptyMessage);
  viewport.appendChild(viewportInner);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "photobook-close";
  closeButton.setAttribute("aria-label", "Close photobook");
  titleBar.appendChild(closeButton);

  const scrollbar = document.createElement("div");
  scrollbar.className = "photobook-scrollbar";
  scrollbar.setAttribute("role", "group");
  scrollbar.setAttribute("aria-label", "Photobook scrollbar");

  const leftButton = document.createElement("button");
  leftButton.type = "button";
  leftButton.className = "photobook-scroll-button";
  leftButton.setAttribute("aria-label", "Previous photo");
  leftButton.textContent = "◀";

  const track = document.createElement("div");
  track.className = "photobook-scroll-track";

  const progress = document.createElement("div");
  progress.className = "photobook-scroll-progress";

  const thumb = document.createElement("button");
  thumb.type = "button";
  thumb.className = "photobook-scroll-thumb";
  thumb.setAttribute("aria-label", "Scroll photos");

  const rightButton = document.createElement("button");
  rightButton.type = "button";
  rightButton.className = "photobook-scroll-button";
  rightButton.setAttribute("aria-label", "Next photo");
  rightButton.textContent = "▶";

  track.append(progress, thumb);
  scrollbar.append(leftButton, track, rightButton);

  const status = document.createElement("div");
  status.className = "photobook-status";

  const statusCount = document.createElement("p");
  statusCount.className = "photobook-status-count";
  statusCount.textContent = "0 / 0";

  const statusType = document.createElement("p");
  statusType.className = "photobook-status-type";
  statusType.textContent = "PICT";

  status.append(statusCount, statusType);
  windowContainer.append(titleBar, viewport, scrollbar, status);

  for (const edge of PHOTOBOOK_RESIZE_EDGES) {
    const resizeHandle = document.createElement("div");
    resizeHandle.className = `photobook-resize-handle photobook-resize-handle-${edge}`;
    resizeHandle.dataset.edge = edge;
    resizeHandle.setAttribute("aria-hidden", "true");
    windowContainer.appendChild(resizeHandle);
  }

  overlay.appendChild(windowContainer);
  document.body.appendChild(overlay);

  return {
    overlay,
    windowContainer,
    titleBar,
    photoImage,
    photoVideo,
    emptyMessage,
    closeButton,
    leftButton,
    rightButton,
    track,
    progress,
    thumb,
    statusCount,
    statusType,
  };
}

function initPhotobook() {
  const folderIcon = document.querySelector(PHOTOBOOK_FOLDER_SELECTOR);
  if (!folderIcon) {
    return;
  }

  folderIcon.tabIndex = 0;
  folderIcon.setAttribute("role", "button");
  folderIcon.setAttribute("aria-label", "Open photobook");
  const {
    overlay,
    windowContainer,
    titleBar,
    photoImage,
    photoVideo,
    emptyMessage,
    closeButton,
    leftButton,
    rightButton,
    track,
    progress,
    thumb,
    statusCount,
    statusType,
  } = createPhotobookElements();

  let files = [];
  let currentIndex = 0;
  let isLoaded = false;
  let isLoading = false;
  let loadPromise = null;
  let currentThumbWidthPercent = 100;
  let dragStartX = 0;
  let dragStartLeftPercent = 0;
  let hasHandledFirstFolderClick = false;
  let windowFrame = null;
  let windowInteraction = null;
  let skippedUnsupportedHeicCount = 0;
  let pendingVideoRenderToken = 0;

  function isPrimaryPointer(event) {
    return event.pointerType !== "mouse" || event.button === 0;
  }

  function clampWindowFrame(frame) {
    const overlayRect = overlay.getBoundingClientRect();
    if (!overlayRect.width || !overlayRect.height) {
      return frame;
    }

    const maxWidth = Math.max(220, overlayRect.width - PHOTOBOOK_WINDOW_PADDING_PX * 2);
    const maxHeight = Math.max(180, overlayRect.height - PHOTOBOOK_WINDOW_PADDING_PX * 2);
    const minWidth = Math.min(PHOTOBOOK_WINDOW_MIN_WIDTH_PX, maxWidth);
    const minHeight = Math.min(PHOTOBOOK_WINDOW_MIN_HEIGHT_PX, maxHeight);

    const width = Math.min(Math.max(frame.width, minWidth), maxWidth);
    const height = Math.min(Math.max(frame.height, minHeight), maxHeight);

    const minLeft = PHOTOBOOK_WINDOW_PADDING_PX;
    const minTop = PHOTOBOOK_WINDOW_PADDING_PX;
    const maxLeft = Math.max(minLeft, overlayRect.width - PHOTOBOOK_WINDOW_PADDING_PX - width);
    const maxTop = Math.max(minTop, overlayRect.height - PHOTOBOOK_WINDOW_PADDING_PX - height);

    return {
      left: Math.min(Math.max(frame.left, minLeft), maxLeft),
      top: Math.min(Math.max(frame.top, minTop), maxTop),
      width,
      height,
    };
  }

  function applyWindowFrame() {
    if (!windowFrame) {
      return;
    }
    windowFrame = clampWindowFrame(windowFrame);
    windowContainer.style.left = `${windowFrame.left}px`;
    windowContainer.style.top = `${windowFrame.top}px`;
    windowContainer.style.width = `${windowFrame.width}px`;
    windowContainer.style.height = `${windowFrame.height}px`;
  }

  function initializeWindowFrame() {
    const overlayRect = overlay.getBoundingClientRect();
    if (!overlayRect.width || !overlayRect.height) {
      return;
    }

    if (!windowFrame) {
      windowContainer.style.left = "";
      windowContainer.style.top = "";
      windowContainer.style.width = "";
      windowContainer.style.height = "";

      const windowRect = windowContainer.getBoundingClientRect();
      windowFrame = {
        left: (overlayRect.width - windowRect.width) / 2,
        top: (overlayRect.height - windowRect.height) / 2,
        width: windowRect.width,
        height: windowRect.height,
      };
    }

    applyWindowFrame();
  }

  function startWindowInteraction(event, mode, edge = "") {
    if (!isPrimaryPointer(event) || !overlay.classList.contains("is-open")) {
      return;
    }

    event.preventDefault();
    initializeWindowFrame();
    if (!windowFrame) {
      return;
    }

    windowInteraction = {
      pointerId: event.pointerId,
      mode,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: windowFrame.left,
      startTop: windowFrame.top,
      startWidth: windowFrame.width,
      startHeight: windowFrame.height,
    };
  }

  function handleWindowPointerMove(event) {
    if (!windowInteraction || event.pointerId !== windowInteraction.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - windowInteraction.startX;
    const deltaY = event.clientY - windowInteraction.startY;

    if (windowInteraction.mode === "move") {
      windowFrame = clampWindowFrame({
        left: windowInteraction.startLeft + deltaX,
        top: windowInteraction.startTop + deltaY,
        width: windowInteraction.startWidth,
        height: windowInteraction.startHeight,
      });
      applyWindowFrame();
      return;
    }

    const nextFrame = {
      left: windowInteraction.startLeft,
      top: windowInteraction.startTop,
      width: windowInteraction.startWidth,
      height: windowInteraction.startHeight,
    };

    if (windowInteraction.edge.includes("e")) {
      nextFrame.width = windowInteraction.startWidth + deltaX;
    }
    if (windowInteraction.edge.includes("w")) {
      nextFrame.width = windowInteraction.startWidth - deltaX;
      nextFrame.left = windowInteraction.startLeft + deltaX;
    }
    if (windowInteraction.edge.includes("s")) {
      nextFrame.height = windowInteraction.startHeight + deltaY;
    }
    if (windowInteraction.edge.includes("n")) {
      nextFrame.height = windowInteraction.startHeight - deltaY;
      nextFrame.top = windowInteraction.startTop + deltaY;
    }

    windowFrame = clampWindowFrame(nextFrame);
    applyWindowFrame();
  }

  function stopWindowInteraction(event) {
    if (!windowInteraction || event.pointerId !== windowInteraction.pointerId) {
      return;
    }
    windowInteraction = null;
  }

  function updateScrollbarUI() {
    const hasPhotos = files.length > 0;
    const usableSteps = Math.max(files.length - 1, 1);
    currentThumbWidthPercent = hasPhotos
      ? Math.max(100 / files.length, PHOTOBOOK_MIN_THUMB_PERCENT)
      : 100;
    const progressFraction = hasPhotos ? currentIndex / usableSteps : 0;
    const maxTravelPercent = 100 - currentThumbWidthPercent;
    const leftPercent = maxTravelPercent * progressFraction;

    thumb.style.width = `${currentThumbWidthPercent}%`;
    thumb.style.left = `${leftPercent}%`;
    const progressPercent = leftPercent + currentThumbWidthPercent / 2;
    progress.style.width = `${progressPercent}%`;

    leftButton.disabled = !hasPhotos || currentIndex === 0;
    rightButton.disabled = !hasPhotos || currentIndex >= files.length - 1;
    thumb.disabled = !hasPhotos || files.length <= 1;
    track.style.pointerEvents = hasPhotos && files.length > 1 ? "auto" : "none";
  }

  function resetVideoPlayback() {
    photoVideo.pause();
    photoVideo.removeAttribute("src");
    photoVideo.load();
  }

  function showEmptyMessage(message) {
    emptyMessage.hidden = false;
    emptyMessage.textContent = message;
  }

  function hideEmptyMessage() {
    emptyMessage.hidden = true;
  }

  function showLoadingState() {
    photoImage.hidden = true;
    photoVideo.hidden = true;
    resetVideoPlayback();
    showEmptyMessage(PHOTOBOOK_MESSAGES.loadingPhotos);
    statusCount.textContent = "0 / 0";
    statusType.textContent = "PICT";
    updateScrollbarUI();
  }

  function setPhotobookOpen(isOpen) {
    overlay.classList.toggle("is-open", isOpen);
    overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }

  function releaseThumbPointerCapture(pointerId) {
    if (thumb.hasPointerCapture(pointerId)) {
      thumb.releasePointerCapture(pointerId);
    }
  }

  function renderCurrentPhoto() {
    const hasPhotos = files.length > 0;
    if (!hasPhotos) {
      photoImage.hidden = true;
      photoVideo.hidden = true;
      resetVideoPlayback();
      showEmptyMessage(
        window.location.protocol === "file:"
          ? PHOTOBOOK_MESSAGES.noPhotosFileProtocol
          : PHOTOBOOK_MESSAGES.noPhotos,
      );
      if (skippedUnsupportedHeicCount > 0) {
        showEmptyMessage(PHOTOBOOK_MESSAGES.unsupportedHeic);
      }
      statusCount.textContent = "0 / 0";
      statusType.textContent = "PICT";
      updateScrollbarUI();
      return;
    }

    const currentFile = files[currentIndex];
    const currentPath = encodePhotoPath(currentFile);
    const isCurrentVideo = isVideoFile(currentFile);

    hideEmptyMessage();
    statusCount.textContent = `${currentIndex + 1} / ${files.length}`;
    statusType.textContent = getMediaTypeLabel(currentFile);

    if (isCurrentVideo) {
      const renderToken = ++pendingVideoRenderToken;
      photoImage.hidden = true;
      photoImage.removeAttribute("src");
      photoVideo.hidden = true;
      resetVideoPlayback();
      showEmptyMessage(PHOTOBOOK_MESSAGES.checkingVideo);
      void canDecodeVideoAtPath(currentPath).then((canDecodeVideo) => {
        if (renderToken !== pendingVideoRenderToken) {
          return;
        }
        const activeFile = files[currentIndex];
        if (activeFile !== currentFile || !isVideoFile(activeFile)) {
          return;
        }
        if (!canDecodeVideo) {
          photoVideo.hidden = true;
          showEmptyMessage(PHOTOBOOK_MESSAGES.unsupportedVideo);
          return;
        }
        hideEmptyMessage();
        photoVideo.hidden = false;
        photoVideo.src = currentPath;
        photoVideo.currentTime = 0;
        void photoVideo.play().catch(() => {
          // Some browsers block autoplay; controls remain available for manual play.
        });
      });
      updateScrollbarUI();
      return;
    }

    pendingVideoRenderToken += 1;
    hideEmptyMessage();
    resetVideoPlayback();
    photoVideo.hidden = true;
    photoImage.hidden = false;
    photoImage.src = currentPath;
    photoImage.alt = `Photobook memory ${currentIndex + 1} of ${files.length}`;
    updateScrollbarUI();
    preloadNearbyImages();
  }

  function preloadNearbyImages() {
    if (files.length <= 1) {
      return;
    }
    const nearbyIndexes = [currentIndex - 1, currentIndex + 1].filter(
      (index) => index >= 0 && index < files.length,
    );
    for (const nearbyIndex of nearbyIndexes) {
      if (isVideoFile(files[nearbyIndex])) {
        continue;
      }
      const image = new Image();
      image.decoding = "async";
      image.src = encodePhotoPath(files[nearbyIndex]);
    }
  }

  function goToPhoto(newIndex) {
    if (!files.length) {
      return;
    }
    currentIndex = Math.max(0, Math.min(files.length - 1, newIndex));
    renderCurrentPhoto();
  }

  function stepPhotos(direction) {
    goToPhoto(currentIndex + direction);
  }

  function goToProgress(progressFraction) {
    if (files.length <= 1) {
      return;
    }
    const clampedProgress = Math.max(0, Math.min(1, progressFraction));
    const mappedIndex = Math.round(clampedProgress * (files.length - 1));
    goToPhoto(mappedIndex);
  }

  function openPhotobook() {
    setPhotobookOpen(true);
    initializeWindowFrame();
    closeButton.focus();
  }

  function closePhotobook() {
    windowInteraction = null;
    resetVideoPlayback();
    setPhotobookOpen(false);
    folderIcon.focus();
  }

  async function ensurePhotosLoaded() {
    if (isLoaded || isLoading) {
      if (loadPromise) {
        await loadPromise;
      }
      return;
    }

    isLoading = true;
    loadPromise = (async () => {
      const loadedFiles = await loadPhotobookFiles();
      const resolved = await resolveDisplayFilesForBrowser(loadedFiles);
      files = resolved.files;
      skippedUnsupportedHeicCount = resolved.skippedHeicCount;
      currentIndex = 0;
      isLoaded = true;
      renderCurrentPhoto();
    })();

    try {
      await loadPromise;
    } finally {
      isLoading = false;
    }
  }

  function openPhotobookWithPhotos() {
    openPhotobook();
    if (isLoaded) {
      renderCurrentPhoto();
      return;
    }

    showLoadingState();
    void ensurePhotosLoaded().catch(() => {
      isLoaded = true;
      files = [];
      renderCurrentPhoto();
    });
  }

  folderIcon.addEventListener("click", () => {
    if (!hasHandledFirstFolderClick) {
      hasHandledFirstFolderClick = true;
      if (typeof window.enableBackgroundSound === "function") {
        window.enableBackgroundSound();
      }
    }
    void openPhotobookWithPhotos();
  });
  folderIcon.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    void openPhotobookWithPhotos();
  });

  closeButton.addEventListener("click", closePhotobook);
  titleBar.addEventListener("pointerdown", (event) => {
    if (event.target === closeButton || closeButton.contains(event.target)) {
      return;
    }
    startWindowInteraction(event, "move");
  });
  windowContainer.addEventListener("pointerdown", (event) => {
    const targetElement = event.target instanceof Element ? event.target : null;
    const resizeHandle = targetElement?.closest(".photobook-resize-handle");
    if (!resizeHandle || !windowContainer.contains(resizeHandle)) {
      return;
    }
    startWindowInteraction(event, "resize", resizeHandle.dataset.edge || "");
  });
  document.addEventListener("pointermove", handleWindowPointerMove);
  document.addEventListener("pointerup", stopWindowInteraction);
  document.addEventListener("pointercancel", stopWindowInteraction);
  window.addEventListener("resize", () => {
    if (!windowFrame || !overlay.classList.contains("is-open")) {
      return;
    }
    applyWindowFrame();
  });

  leftButton.addEventListener("click", () => stepPhotos(-1));
  rightButton.addEventListener("click", () => stepPhotos(1));

  photoImage.addEventListener("error", () => {
    showEmptyMessage(PHOTOBOOK_MESSAGES.unsupportedFile);
    photoImage.hidden = true;
  });

  photoVideo.addEventListener("error", () => {
    resetVideoPlayback();
    photoVideo.hidden = true;
    showEmptyMessage(PHOTOBOOK_MESSAGES.unsupportedVideo);
  });

  track.addEventListener("pointerdown", (event) => {
    if (event.target === thumb || files.length <= 1) {
      return;
    }
    const trackRect = track.getBoundingClientRect();
    const progressFraction = (event.clientX - trackRect.left) / trackRect.width;
    goToProgress(progressFraction);
  });

  thumb.addEventListener("pointerdown", (event) => {
    if (files.length <= 1) {
      return;
    }
    event.preventDefault();
    dragStartX = event.clientX;
    dragStartLeftPercent = parseFloat(thumb.style.left || "0") || 0;
    thumb.setPointerCapture(event.pointerId);
  });

  thumb.addEventListener("pointermove", (event) => {
    if (!thumb.hasPointerCapture(event.pointerId) || files.length <= 1) {
      return;
    }
    const trackRect = track.getBoundingClientRect();
    if (!trackRect.width) {
      return;
    }
    const deltaPercent = ((event.clientX - dragStartX) / trackRect.width) * 100;
    const maxLeftPercent = 100 - currentThumbWidthPercent;
    const nextLeftPercent = Math.max(0, Math.min(maxLeftPercent, dragStartLeftPercent + deltaPercent));
    const progressFraction = maxLeftPercent === 0 ? 0 : nextLeftPercent / maxLeftPercent;
    goToProgress(progressFraction);
  });

  thumb.addEventListener("pointerup", (event) => {
    releaseThumbPointerCapture(event.pointerId);
  });
  thumb.addEventListener("pointercancel", (event) => {
    releaseThumbPointerCapture(event.pointerId);
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closePhotobook();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!overlay.classList.contains("is-open")) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closePhotobook();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepPhotos(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepPhotos(1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      goToPhoto(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      goToPhoto(files.length - 1);
    }
  });

}

initPhotobook();

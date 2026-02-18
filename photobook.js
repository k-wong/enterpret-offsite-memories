const PHOTOBOOK_FOLDER_SELECTOR = ".desktop-folder-icon";
const PHOTOBOOK_EXTENSIONS = /\.(avif|gif|jpe?g|png|webp)$/i;
const PHOTOBOOK_MIN_THUMB_PERCENT = 8;

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

function isSupportedPhotoFile(fileName) {
  return PHOTOBOOK_EXTENSIONS.test(fileName);
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
    if (!fileName || !isSupportedPhotoFile(fileName)) {
      continue;
    }
    files.push(fileName);
  }
  return sortPhotoNamesAlphabetically(files);
}

async function getPhotoFilesFromManifest() {
  const manifestResponse = await fetch("photos/manifest.json", { cache: "no-store" });
  if (!manifestResponse.ok) {
    return [];
  }
  const manifestData = await manifestResponse.json();
  if (!Array.isArray(manifestData)) {
    return [];
  }
  return sortPhotoNamesAlphabetically(
    manifestData.map((entry) => normalizePhotoFileName(entry)).filter(isSupportedPhotoFile),
  );
}

async function getPhotoFilesFromDirectoryListing() {
  const directoryResponse = await fetch("photos/", { cache: "no-store" });
  if (!directoryResponse.ok) {
    return [];
  }
  const directoryHtml = await directoryResponse.text();
  return parseDirectoryListing(directoryHtml);
}

async function loadPhotobookFiles() {
  if (Array.isArray(window.PHOTOBOOK_FILES) && window.PHOTOBOOK_FILES.length) {
    return sortPhotoNamesAlphabetically(
      window.PHOTOBOOK_FILES.map((entry) => normalizePhotoFileName(entry)).filter(isSupportedPhotoFile),
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
  return `photos/${fileName.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function initPhotobook() {
  const folderIcon = document.querySelector(PHOTOBOOK_FOLDER_SELECTOR);
  if (!folderIcon) {
    return;
  }

  folderIcon.tabIndex = 0;
  folderIcon.setAttribute("role", "button");
  folderIcon.setAttribute("aria-label", "Open photobook");

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

  const emptyMessage = document.createElement("div");
  emptyMessage.className = "photobook-empty-message";
  emptyMessage.textContent = "No photos found in the photos folder.";
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
  overlay.appendChild(windowContainer);
  document.body.appendChild(overlay);

  let files = [];
  let currentIndex = 0;
  let isLoaded = false;
  let isLoading = false;
  let loadPromise = null;
  let currentThumbWidthPercent = 100;
  let dragStartX = 0;
  let dragStartLeftPercent = 0;

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

  function renderCurrentPhoto() {
    const hasPhotos = files.length > 0;
    if (!hasPhotos) {
      photoImage.hidden = true;
      emptyMessage.hidden = false;
      if (window.location.protocol === "file:") {
        emptyMessage.textContent =
          "No photos found. If opening via file://, update photos-manifest.js with your photo filenames.";
      } else {
        emptyMessage.textContent = "No photos found in the photos folder.";
      }
      statusCount.textContent = "0 / 0";
      updateScrollbarUI();
      return;
    }

    photoImage.hidden = false;
    emptyMessage.hidden = true;
    photoImage.src = encodePhotoPath(files[currentIndex]);
    photoImage.alt = `Photobook memory ${currentIndex + 1} of ${files.length}`;
    statusCount.textContent = `${currentIndex + 1} / ${files.length}`;
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
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    closeButton.focus();
  }

  function closePhotobook() {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
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
      files = await loadPhotobookFiles();
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

  async function openPhotobookWithPhotos() {
    await ensurePhotosLoaded();
    openPhotobook();
  }

  folderIcon.addEventListener("click", openPhotobookWithPhotos);
  folderIcon.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    openPhotobookWithPhotos();
  });

  closeButton.addEventListener("click", closePhotobook);

  leftButton.addEventListener("click", () => stepPhotos(-1));
  rightButton.addEventListener("click", () => stepPhotos(1));

  photoImage.addEventListener("error", () => {
    emptyMessage.hidden = false;
    photoImage.hidden = true;
    emptyMessage.textContent = "Could not load this photo. Try the next one.";
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
    if (thumb.hasPointerCapture(event.pointerId)) {
      thumb.releasePointerCapture(event.pointerId);
    }
  });
  thumb.addEventListener("pointercancel", (event) => {
    if (thumb.hasPointerCapture(event.pointerId)) {
      thumb.releasePointerCapture(event.pointerId);
    }
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

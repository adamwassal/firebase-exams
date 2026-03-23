const LOADER_ID = "globalPageLoader";
let activeLoaderCount = 0;

function ensureLoader() {
  let loader = document.getElementById(LOADER_ID);
  if (loader) return loader;

  loader = document.createElement("div");
  loader.id = LOADER_ID;
  loader.className = "global-loader hidden";
  loader.setAttribute("aria-hidden", "true");
  loader.innerHTML = `
    <div class="global-loader__backdrop"></div>
    <div class="global-loader__content glass" role="status" aria-live="polite" aria-busy="true">
      <div class="global-loader__spinner" aria-hidden="true"></div>
      <p class="global-loader__text">جارٍ التنفيذ...</p>
    </div>
  `;

  document.body.appendChild(loader);
  return loader;
}

export function showGlobalLoader(message = "جارٍ التنفيذ...") {
  const loader = ensureLoader();
  const textNode = loader.querySelector(".global-loader__text");
  if (textNode) {
    textNode.textContent = message;
  }

  activeLoaderCount += 1;
  document.body.classList.add("is-loading");
  loader.classList.remove("hidden");
  loader.setAttribute("aria-hidden", "false");
}

export function hideGlobalLoader() {
  activeLoaderCount = Math.max(0, activeLoaderCount - 1);
  if (activeLoaderCount > 0) return;

  const loader = document.getElementById(LOADER_ID);
  if (loader) {
    loader.classList.add("hidden");
    loader.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("is-loading");
}

export async function withGlobalLoader(message, action) {
  showGlobalLoader(message);
  try {
    return await action();
  } finally {
    hideGlobalLoader();
  }
}

export function setInlineLoader(element, message = "جارٍ التحميل...") {
  if (!element) return;

  element.innerHTML = `
    <span class="inline-loader" aria-hidden="true"></span>
    <span>${message}</span>
  `;
}

function isEligibleLink(link) {
  if (!link?.href) return false;
  if (link.target && link.target !== "_self") return false;
  if (link.hasAttribute("download")) return false;
  if (link.dataset.skipLoader === "true") return false;
  return true;
}

export function enableAutoPageLoader() {
  ensureLoader();

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!isEligibleLink(link)) return;
    showGlobalLoader(link.dataset.loaderText || "جارٍ الانتقال...");
  });

  window.addEventListener("pageshow", () => {
    activeLoaderCount = 0;
    const loader = document.getElementById(LOADER_ID);
    if (loader) {
      loader.classList.add("hidden");
      loader.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("is-loading");
  });
}

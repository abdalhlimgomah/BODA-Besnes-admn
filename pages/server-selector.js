(function () {
  const STORAGE_KEY = "boda_admin_active_backend";
  const TTL_MS = 15 * 60 * 1000;
  const HEALTH_CHECK_CACHE_MS = 30 * 1000; // Cache health status for 30 seconds
  const STYLE_ID = "bodaServerSelectorStyles";
  const AUTO_CONTAINER_ID = "bodaServerSelector";

  let healthCache = { primary: null, backup: null, backup2: null };
  let healthCheckTimers = {};

  const SELECTOR_CSS = `
    .server-selector { padding:16px 20px; background:var(--card-bg,#fff); border-radius:16px; box-shadow:0 2px 12px rgba(0,0,0,0.05); border:2px solid transparent; }
    .server-selector-header { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:14px; }
    .server-selector-header i { font-size:1.3rem; color:#f59e0b; }
    .server-selector-header .section-title { font-size:1rem; margin:0; }
    .server-options { display:flex; gap:12px; flex-wrap:wrap; }
    .server-btn { flex:1; min-width:170px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; background:#f9fafb; border:2px solid #e5e7eb; border-radius:12px; cursor:pointer; transition:all 0.2s; font-family:inherit; }
    .server-btn:hover { border-color:#f59e0b; background:#fffbeb; }
    .server-btn.active { border-color:#0d9488; background:#ecfdf5; }
    .server-btn.disabled { opacity:0.5; cursor:not-allowed; border-color:#e5e7eb; background:#f9fafb; }
    .server-btn.disabled:hover { border-color:#e5e7eb; background:#f9fafb; }
    .server-info { display:flex; flex-direction:column; gap:4px; text-align:right; flex:1; }
    .server-name { font-size:1rem; font-weight:800; color:var(--text,#1f2937); }
    .server-status { font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:999px; background:#f3f4f6; color:#9ca3af; width:fit-content; align-self:flex-end; }
    .server-status.healthy { background:#dcfce7; color:#166534; }
    .server-status.down { background:#fef2f2; color:#dc2626; }
    .server-status.checking { background:#fef3c7; color:#92400e; }
    .server-btn.active .server-status { background:#0d9488; color:#fff; }
    .server-btn.active .server-check { opacity:1; color:#0d9488; }
    .server-check { font-size:1.2rem; opacity:0; transition:opacity 0.2s; }
    .health-refresh-btn { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border:1px solid #e5e7eb; border-radius:8px; background:#f9fafb; color:#6b7280; cursor:pointer; transition:all 0.2s; }
    .health-refresh-btn:hover { background:#f3f4f6; color:#374151; }
    .health-refresh-btn.spinning i { animation:bodaSsSpin 1s linear infinite; }
    @keyframes bodaSsSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    body.dark-mode .server-selector { background:var(--card-bg,#1e293b); }
    body.dark-mode .server-btn { background:#0f1824; border-color:#374151; }
    body.dark-mode .server-btn.active { border-color:#0d9488; background:#064e3b; }
    body.dark-mode .server-name { color:#f3f4f6; }
    body.dark-mode .health-refresh-btn { background:#0f1824; border-color:#374151; color:#9ca3af; }
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = SELECTOR_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function getActiveBackendName() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (saved && (saved.name === "backup" || saved.name === "backup2") && Number(saved.until) > Date.now()) {
        return saved.name;
      }
    } catch (_e) {}
    return "primary";
  }

  function setActiveBackend(name) {
    if (name === "backup" || name === "backup2") {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        name: name,
        reason: "manual",
        until: Date.now() + TTL_MS
      }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    window.__bodaAdminBackendName = name;
    const backend = window.adminAuth?.ADMIN_BACKENDS?.[name];
    if (backend) {
      window.SUPABASE_URL = backend.url;
      window.SUPABASE_ANON_KEY = backend.key;
    }
    document.dispatchEvent(new CustomEvent("boda:admin-failover", {
      detail: { from: getActiveBackendName() === "primary" ? "backup" : "primary", to: name, reason: "manual" }
    }));
    window.location.reload();
  }

  function getBackendDisplayName(name) {
    const names = {
      primary: "السيرفر الأساسي",
      backup: "السيرفر الاحتياطي",
      backup2: "السيرفر الثالث"
    };
    return names[name] || name;
  }

  function getBackendUrl(name) {
    const backend = window.adminAuth?.ADMIN_BACKENDS?.[name];
    return backend?.url || "";
  }

  async function checkBackendHealth(name) {
    const url = getBackendUrl(name);
    if (!url) return { name, status: "unknown", healthy: false };

    const now = Date.now();
    const cached = healthCache[name];
    if (cached && (now - cached.timestamp) < HEALTH_CHECK_CACHE_MS) {
      return cached;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // Use bypass header to skip failover routing
      const response = await fetch(`${url}/rest/v1/`, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "apikey": window.adminAuth?.ADMIN_BACKENDS?.[name]?.key || "",
          "x-bypass-failover": "true"
        }
      });
      
      clearTimeout(timeoutId);
      
      const healthy = response.status !== 402 && response.status < 500;
      const result = {
        name,
        status: healthy ? "healthy" : "down",
        healthy,
        statusCode: response.status,
        timestamp: now
      };
      healthCache[name] = result;
      return result;
    } catch (e) {
      const result = {
        name,
        status: "down",
        healthy: false,
        error: e.name === "AbortError" ? "timeout" : "network",
        timestamp: now
      };
      healthCache[name] = result;
      return result;
    }
  }

  async function checkAllBackends() {
    const backends = ["primary", "backup", "backup2"];
    const results = await Promise.all(backends.map(checkBackendHealth));
    return results.reduce((acc, r) => { acc[r.name] = r; return acc; }, {});
  }

  function getHealthStatusText(health) {
    if (!health) return "جاري الفحص...";
    if (health.healthy) return "شغال";
    return "واقع";
  }

  function getHealthStatusClass(health) {
    if (!health) return "checking";
    return health.healthy ? "healthy" : "down";
  }

  function buildInto(container) {
    if (!container || container.dataset.bodaSsInit === "1") return;
    container.dataset.bodaSsInit = "1";

    const active = getActiveBackendName();
    const backends = ["primary", "backup", "backup2"];

    const buttonsHtml = backends.map(name => `
      <button type="button" class="server-btn ${active === name ? "active" : ""}" data-backend="${name}">
        <span class="server-info">
          <span class="server-name">${getBackendDisplayName(name)}</span>
          <span class="server-status health-${name}" data-health="${name}">${getHealthStatusText(healthCache[name])}</span>
        </span>
        <i class="fa-solid fa-check server-check" id="boda${name}Check" style="opacity: ${active === name ? "1" : "0"}"></i>
      </button>
    `).join("");

    container.innerHTML = `
      <div class="server-selector card">
        <div class="server-selector-header">
          <i class="fa-solid fa-server"></i>
          <h3 class="section-title" style="margin:0">اختيار السيرفر</h3>
          <button type="button" class="health-refresh-btn" data-role="refresh" title="فحص حالة السيرفرات">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
        </div>
        <div class="server-options">
          ${buttonsHtml}
        </div>
      </div>
    `;

    const btnElements = {};
    const statusElements = {};
    const checkElements = {};

    backends.forEach(name => {
      btnElements[name] = container.querySelector(`[data-backend="${name}"]`);
      statusElements[name] = container.querySelector(`.health-${name}`);
      checkElements[name] = container.querySelector(`#boda${name}Check`);
    });

    const refreshBtn = container.querySelector('[data-role="refresh"]');
    let isChecking = false;

    function updateUI() {
      const current = getActiveBackendName();
      backends.forEach(name => {
        if (btnElements[name]) btnElements[name].classList.toggle("active", current === name);
        if (checkElements[name]) checkElements[name].style.opacity = current === name ? "1" : "0";
      });
    }

    async function updateHealthUI(healthResults) {
      backends.forEach(name => {
        const health = healthResults[name];
        const statusEl = statusElements[name];
        if (statusEl) {
          statusEl.textContent = getHealthStatusText(health);
          statusEl.className = `server-status health-${name} ${getHealthStatusClass(health)}`;
        }
        if (btnElements[name]) {
          if (!health?.healthy && name !== getActiveBackendName()) {
            btnElements[name].classList.add("disabled");
            btnElements[name].title = "السيرفر غير متاح";
          } else {
            btnElements[name].classList.remove("disabled");
            btnElements[name].title = "";
          }
        }
      });
    }

    async function runHealthCheck() {
      if (isChecking) return;
      isChecking = true;
      if (refreshBtn) { refreshBtn.classList.add("spinning"); refreshBtn.disabled = true; }

      backends.forEach(name => {
        const statusEl = statusElements[name];
        if (statusEl && !healthCache[name]) {
          statusEl.textContent = "جاري الفحص...";
          statusEl.className = `server-status health-${name} checking`;
        }
      });

      try {
        const results = await checkAllBackends();
        updateHealthUI(results);
      } finally {
        isChecking = false;
        if (refreshBtn) { refreshBtn.classList.remove("spinning"); refreshBtn.disabled = false; }
      }
    }

    backends.forEach(name => {
      if (!btnElements[name]) return;
      btnElements[name].addEventListener("click", () => {
        if (!btnElements[name].classList.contains("disabled")) {
          setActiveBackend(name);
        }
      });
    });

    if (refreshBtn) refreshBtn.addEventListener("click", runHealthCheck);

    runHealthCheck();

    const intervalId = setInterval(runHealthCheck, 60000);
    window.addEventListener("beforeunload", () => clearInterval(intervalId));

    document.addEventListener("boda:admin-failover", updateUI);
  }

  function renderServerSelector(containerId) {
    injectStyles();
    const container = typeof containerId === "string"
      ? document.getElementById(containerId)
      : containerId;
    if (!container) return;
    buildInto(container);
  }

  function pickHost() {
    return document.querySelector(".content-wrap")
      || document.querySelector("main.app-main")
      || document.querySelector(".app-main")
      || document.body;
  }

  function autoInit() {
    try {
      injectStyles();
      // Prefer an explicit container placed by the page.
      const manual = document.getElementById("serverSelector");
      if (manual) {
        if (!manual.dataset.bodaSsInit) buildInto(manual);
        return;
      }
      if (document.getElementById(AUTO_CONTAINER_ID)) return;

      const host = pickHost();
      if (!host) return;
      const div = document.createElement("div");
      div.id = AUTO_CONTAINER_ID;
      div.style.marginBottom = "16px";
      host.insertBefore(div, host.firstChild);
      buildInto(div);
    } catch (_e) {}
  }

  window.ServerSelector = { render: renderServerSelector, autoInit: autoInit };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }
})();

(function () {
  const STORAGE_KEY = "boda_admin_active_backend";
  const TTL_MS = 15 * 60 * 1000;
  const HEALTH_CHECK_CACHE_MS = 30 * 1000; // Cache health status for 30 seconds

  let healthCache = { primary: null, backup: null, backup2: null };
  let healthCheckTimers = {};

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
    if (window.adminAuth && window.adminAuth.getToken) {
      const token = window.adminAuth.getToken();
      if (token) {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
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

  function renderServerSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const active = getActiveBackendName();
    const backends = ["primary", "backup", "backup2"];

    const buttonsHtml = backends.map(name => `
      <button type="button" class="server-btn ${active === name ? "active" : ""}" data-backend="${name}">
        <span class="server-info">
          <span class="server-name">${getBackendDisplayName(name)}</span>
          <span class="server-status health-${name}" data-health="${name}">${getHealthStatusText(healthCache[name])}</span>
        </span>
        <i class="fa-solid fa-check server-check" id="${name}Check" style="opacity: ${active === name ? "1" : "0"}"></i>
      </button>
    `).join("");

    container.innerHTML = `
      <div class="server-selector card" id="serverSelector">
        <div class="server-selector-header">
          <i class="fa-solid fa-server"></i>
          <h3 class="section-title" style="margin:0">اختيار السيرفر</h3>
          <button type="button" class="health-refresh-btn" id="healthRefreshBtn" title="فحص حالة السيرفرات">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
        </div>
        <div class="server-options" id="serverOptions">
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
      checkElements[name] = container.querySelector(`#${name}Check`);
    });

    const refreshBtn = container.querySelector('#healthRefreshBtn');
    let isChecking = false;

    function updateUI() {
      const current = getActiveBackendName();
      backends.forEach(name => {
        btnElements[name].classList.toggle("active", current === name);
        checkElements[name].style.opacity = current === name ? "1" : "0";
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
        // Disable button if server is down (but keep active one enabled)
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
      refreshBtn.classList.add("spinning");
      refreshBtn.disabled = true;

      // Show checking state
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
        refreshBtn.classList.remove("spinning");
        refreshBtn.disabled = false;
      }
    }

    backends.forEach(name => {
      btnElements[name].addEventListener("click", () => {
        if (!btnElements[name].classList.contains("disabled")) {
          setActiveBackend(name);
        }
      });
    });

    refreshBtn.addEventListener("click", runHealthCheck);

    // Initial health check
    runHealthCheck();

    // Periodic health check every 60 seconds
    const intervalId = setInterval(runHealthCheck, 60000);
    
    // Cleanup on page unload
    window.addEventListener("beforeunload", () => clearInterval(intervalId));

    document.addEventListener("boda:admin-failover", updateUI);
  }

  window.ServerSelector = { render: renderServerSelector };
})();
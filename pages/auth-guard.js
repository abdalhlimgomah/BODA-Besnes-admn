(function () {
  var __authGuardScriptSrc = (document.currentScript && document.currentScript.src) || "";
  // ============================================================
  // Luha (Admin Panel)Failover بين 3 سيرفرات + هوية أدمن بتوكن ممضى
  // ------------------------------------------------------------
  // يبدأ دائماً بالسيرفر الأساسي؛ لو وقع (402 / 5xx / شبكة) يتحول
  // تلقائياً للنسخة الاحتياطية ويداوم العمل 15 دقيقة في التبويبة.
  // الهوية: x-user-email admin@example.com + x-admin-token (ممضى)
  // تُحقن في طبقة fetch حتى تعمل مع كل نسخ supabase-js والصفحات.
  // ============================================================
  const PRIMARY_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  const PRIMARY_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
  const BACKUP_URL = "https://wwlwwgqfjhmchrijaojr.supabase.co";
  const BACKUP_KEY = "sb_publishable_wIxpA7t3a2hII8asqYZ1Bg__NoMLLUU";
  const BACKUP2_URL = "https://qhqkgrpezoaugyhzrgyc.supabase.co";
  const BACKUP2_KEY = "sb_publishable_bHCWG6iYSkbONKG7HR6Rkw_UVZGsjUe";

  const ADMIN_BACKENDS = {
    primary: { name: "primary", url: PRIMARY_URL, key: PRIMARY_KEY },
    backup: { name: "backup", url: BACKUP_URL, key: BACKUP_KEY },
    backup2: { name: "backup2", url: BACKUP2_URL, key: BACKUP2_KEY },
  };
  const ADMIN_BACKEND_STORAGE_KEY = "boda_admin_active_backend";
  const ADMIN_BACKEND_TTL_MS = 15 * 60 * 1000;
  let _adminFailoverPromise = null;

  function getBackend(name) {
    return ADMIN_BACKENDS[name] || null;
  }

  function getStoredBackend() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(ADMIN_BACKEND_STORAGE_KEY) || "null");
      if (saved && (saved.name === "backup" || saved.name === "backup2") && Number(saved.until) > Date.now()) {
        return getBackend(saved.name);
      }
      sessionStorage.removeItem(ADMIN_BACKEND_STORAGE_KEY);
    } catch (_e) {}
    return null;
  }

  function getActiveBackend() {
    return getBackend(window.__bodaAdminBackendName) || ADMIN_BACKENDS.primary;
  }

  function applyActiveBackend(backend) {
    if (!backend) return;
    window.__bodaAdminBackendName = backend.name;
    window.SUPABASE_URL = backend.url;
    window.SUPABASE_ANON_KEY = backend.key;
  }

  function persistActiveBackup(reason) {
    try {
      sessionStorage.setItem(
        ADMIN_BACKEND_STORAGE_KEY,
        JSON.stringify({ name: "backup", reason: String(reason || "failover"), until: Date.now() + ADMIN_BACKEND_TTL_MS })
      );
    } catch (_e) {}
  }

  function activateBackup(reason) {
    if (getActiveBackend().name === "backup") return Promise.resolve(ADMIN_BACKENDS.backup);
    if (_adminFailoverPromise) return _adminFailoverPromise;
    _adminFailoverPromise = Promise.resolve().then(function () {
      const previous = getActiveBackend();
      applyActiveBackend(ADMIN_BACKENDS.backup);
      persistActiveBackup(reason);
      try {
        document.dispatchEvent(
          new CustomEvent("boda:admin-failover", {
            detail: { from: previous.name, to: "backup", reason: String(reason || "http") },
          })
        );
      } catch (_e) {}
      return ADMIN_BACKENDS.backup;
    });
    _adminFailoverPromise.then(
      function () { _adminFailoverPromise = null; },
      function () { _adminFailoverPromise = null; }
    );
    return _adminFailoverPromise;
  }

  applyActiveBackend(getStoredBackend() || ADMIN_BACKENDS.primary);
  window.getActiveAdminBackend = getActiveBackend;

  // ============================================================
  // الجلسة + التوكن
  // ============================================================
  const SESSION_KEY = "__boda_admin_session_v2";
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
  const LOGIN_PAGE = "login.html";
  const DASHBOARD_PAGE = "shacksf.html";
  const PROTECTED_PAGES = new Set([
    "shacksf.html",
    "admin.html",
    "admin-orders.html",
    "admin-today-orders.html",
    "admin-partners.html",
    "view-products.html",
    "taager-products.html",
    "taager-product-edit.html",
    "admin-coupons.html",
    "admin-support.html",
    "admin-categories.html",
    "analytics.html",
    "merchant-center.html",
    "seo-dashboard.html",
    "content-manager.html",
  ]);

  function getCurrentPage() {
    return window.location.pathname.split("/").pop() || LOGIN_PAGE;
  }

  function randomToken() {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const session = JSON.parse(raw);
      const validExpiresAt = Number(session?.expiresAt);
      const validToken = typeof session?.token === "string" && session.token.length >= 16;
      if (!validToken || !Number.isFinite(validExpiresAt) || validExpiresAt <= Date.now()) {
        clearSession();
        return null;
      }

      return session;
    } catch {
      clearSession();
      return null;
    }
  }

  function getAuthToken() {
    const session = readSession();
    const token = session?.authToken;
    return typeof token === "string" && token.trim() ? token.trim() : "";
  }

  function isAuthenticated() {
    return !!readSession() && getAuthToken() !== "";
  }

  function createSession(username, authToken) {
    const session = {
      token: randomToken(),
      authToken: typeof authToken === "string" && authToken.trim() ? authToken.trim() : "",
      username: username || "",
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function goToLogin() {
    if (getCurrentPage() !== LOGIN_PAGE) window.location.replace(LOGIN_PAGE);
  }

  function goToDashboard() {
    if (getCurrentPage() !== DASHBOARD_PAGE) window.location.replace(DASHBOARD_PAGE);
  }

  function requireAuth() {
    if (!isAuthenticated()) {
      goToLogin();
      return false;
    }
    return true;
  }

  function redirectIfAuthenticated() {
    if (isAuthenticated()) {
      goToDashboard();
      return true;
    }
    return false;
  }

  function enforceRouteGuard() {
    const currentPage = getCurrentPage();
    if (currentPage === LOGIN_PAGE) {
      redirectIfAuthenticated();
      return;
    }
    if (PROTECTED_PAGES.has(currentPage)) requireAuth();
  }

  window.adminAuth = {
    ADMIN_BACKENDS,
    getActiveBackend,
    createSession,
    clearSession,
    getToken: getAuthToken,
    isAuthenticated,
    requireAuth,
    redirectIfAuthenticated,
  };

  // ============================================================
  // طبقة fetch: توجيه بين السيرفرين + هوية + مفاتيح + Failover
  // ============================================================
  function injectAdminFetch() {
    if (window.__bodaAdminFetch) return;
    window.__bodaAdminFetch = true;
    const originalFetch = window.fetch;
    if (typeof originalFetch !== "function") return;

    function getFetchUrl(input) {
      if (typeof input === "string") return input;
      if (input && typeof input.url === "string") return input.url;
      if (input && typeof input.href === "string") return input.href;
      return "";
    }

    function getBackendNameForUrl(url) {
      const value = String(url || "");
      if (value.indexOf(PRIMARY_URL) === 0) return "primary";
      if (value.indexOf(BACKUP_URL) === 0) return "backup";
      if (value.indexOf(BACKUP2_URL) === 0) return "backup2";
      return "";
    }

    function applyBackendKey(init, backend) {
      const value = backend && backend.key;
      if (!value) return init;
      init = init || {};
      try {
        if (typeof Headers !== "undefined" && !(init.headers instanceof Headers)) {
          init.headers = new Headers(init.headers || {});
        }
      } catch (_e) {}
      try {
        if (init.headers) {
          const apikey = init.headers.get("apikey") || "";
          const auth = init.headers.get("Authorization") || init.headers.get("authorization") || "";
          if (apikey !== value) init.headers.set("apikey", value);
          if (auth !== value) init.headers.set("Authorization", value);
        }
      } catch (_e) {}
      return init;
    }

    function applyAdminIdentity(init, url) {
      init = init || {};
      try {
        if (typeof Headers !== "undefined" && !(init.headers instanceof Headers)) {
          init.headers = new Headers(init.headers || {});
        }
      } catch (_e) {}
      try {
        if (init.headers) {
          // صفحة الدخول نفسها لا ترسل هوية (حتى لا تعلق البريفلايت قبل إصدار التوكن)
          const isLoginUrl = String(url || "").indexOf("/functions/v1/admin-login") !== -1;
          if (!isLoginUrl) {
            init.headers.set("x-user-email", "admin@example.com");
            const token = getAuthToken();
            if (token) init.headers.set("x-admin-token", token);
          }
        }
      } catch (_e) {}
      return init;
    }

    function replaceSupabaseOrigin(url, targetBackend) {
      const value = String(url || "");
      if (!targetBackend || !getBackendNameForUrl(value)) return value;
      return value
        .replace(PRIMARY_URL, targetBackend.url)
        .replace(BACKUP_URL, targetBackend.url)
        .replace(BACKUP2_URL, targetBackend.url);
    }

    function routeFetchInput(input, targetBackend) {
      const sourceUrl = getFetchUrl(input);
      const routedUrl = replaceSupabaseOrigin(sourceUrl, targetBackend);
      if (!routedUrl || routedUrl === sourceUrl) return input;
      try {
        if (typeof input === "string") return routedUrl;
        if (typeof Request !== "undefined" && input instanceof Request) return new Request(routedUrl, input);
        if (typeof URL !== "undefined" && input instanceof URL) return new URL(routedUrl);
      } catch (_e) {}
      return input;
    }

    function cloneFetchInput(input) {
      try {
        if (typeof Request !== "undefined" && input instanceof Request) return input.clone();
      } catch (_e) {}
      return input;
    }

    function getFetchMethod(input, init) {
      return String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    }

    function isReadMethod(method) {
      return method === "GET" || method === "HEAD" || method === "OPTIONS";
    }

    function isRecoverableStatus(status) {
      return status === 402 || status === 500 || status === 502 || status === 503 || status === 504;
    }

    function isSafeToRetry(url, method) {
      // 402 يعني الطلب لم يُعالج أصلاً في السيرفر؛ والإجازة آمنة.
      // admin-login عملية بلا أثر جانبي (قراءة + إصدار توكن) فإعادتها آمنة.
      if (String(url || "").indexOf("/functions/v1/admin-login") !== -1) return true;
      return isReadMethod(method);
    }

    window.fetch = function (input, init) {
      const fetchThis = this;
      const retryInput = cloneFetchInput(input);
      let url = "";
      try {
        url = getFetchUrl(input);
      } catch (_e) {}

      let nextInit = init;
      const isSupabase = getBackendNameForUrl(url) !== "";
      const requestBackend = getBackendNameForUrl(url);
      const method = getFetchMethod(input, init);

      // صفحة نقل البيانات تحدد المصدر صراحةً — لا نعيد توجيهها للخادم النشط.
      if (url.indexOf("/functions/v1/data-migrate") !== -1) {
        return originalFetch.call(fetchThis, input, init);
      }

      if (isSupabase && url.indexOf("/rest/v1/") !== -1) {
        nextInit = applyAdminIdentity(nextInit, url);
      }

      const active = getActiveBackend();
      let routedInput = input;
      const bypassFailover = init?.headers?.["x-bypass-failover"] === "true" || 
                             (init?.headers instanceof Headers && init.headers.get("x-bypass-failover") === "true");
      if (isSupabase && !bypassFailover) {
        routedInput = routeFetchInput(input, active);
        if (active.name === "backup") {
          nextInit = applyBackendKey(nextInit, ADMIN_BACKENDS.backup);
        } else if (active.name === "backup2") {
          nextInit = applyBackendKey(nextInit, ADMIN_BACKENDS.backup2);
        }
      }

      return originalFetch.call(fetchThis, routedInput, nextInit).then(function (response) {
        const primaryFailed =
          requestBackend === "primary" &&
          getActiveBackend().name === "primary" &&
          response &&
          isRecoverableStatus(response.status);
        if (!primaryFailed) return response;

        return activateBackup("http-" + response.status).then(function () {
          if (response.status === 402 || isSafeToRetry(url, method)) {
            return retryToBackup(fetchThis, retryInput, nextInit, response.status === 402);
          }
          return response;
        });
      }).catch(function (error) {
        const failedOnPrimary = requestBackend === "primary" && getActiveBackend().name === "primary";
        if (!failedOnPrimary) throw error;

        return activateBackup("network").then(function () {
          if (isSafeToRetry(url, method)) {
            return retryToBackup(fetchThis, retryInput, nextInit, false);
          }
          throw error;
        });
      });
    };

    function retryToBackup(fetchThis, input, init, retryAfter402) {
      const backupInput = routeFetchInput(input, ADMIN_BACKENDS.backup);
      const backupInit = applyAdminIdentity(init || {}, String(getFetchUrl(input) || ""));
      return originalFetch.call(fetchThis, backupInput, applyBackendKey(backupInit, ADMIN_BACKENDS.backup)).then(function (response) {
        if (retryAfter402 && response && response.status === 402) {
          // السيرفران 402 (تعليق الاشتراك) — سيطلب المستخدم الصفحة المناسبة.
        }
        return response;
      });
    }
  }

  injectAdminFetch();

  // ============================================================
  // createClient: كل صفحات الأدمن تتجه للخادم النشط + الهوية
  // ============================================================
  if (window.supabase && !window.__bodaAdminClientPatched) {
    window.__bodaAdminClientPatched = true;
    const realCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function (url, key, options) {
      const active = getActiveBackend();
      options = options || {};
      const global = typeof options.global === "object" && options.global ? options.global : {};
      const headers = typeof global.headers === "object" && global.headers ? Object.assign({}, global.headers) : {};
      headers["x-user-email"] = "admin@example.com";
      const token = getAuthToken();
      if (token) headers["x-admin-token"] = token;
      return realCreateClient(
        active.url,
        active.key,
        Object.assign({}, options, { global: Object.assign({}, global, { headers }) })
      );
    };
  }

  enforceRouteGuard();

  // ============================================================
  // اختيار السيرفر: يُحمّل ويُفعّل تلقائياً في كل صفحات الأدمن
  // ============================================================
  function loadServerSelector() {
    if (window.ServerSelector && typeof window.ServerSelector.autoInit === "function") {
      window.ServerSelector.autoInit();
      return;
    }
    if (document.getElementById("bodaServerSelectorScript")) return;
    var script = document.createElement("script");
    script.id = "bodaServerSelectorScript";
    script.src = __authGuardScriptSrc
      ? __authGuardScriptSrc.replace(/auth-guard\.js(\?.*)?$/, "server-selector.js")
      : "server-selector.js";
    script.onload = function () {
      if (window.ServerSelector && typeof window.ServerSelector.autoInit === "function") {
        window.ServerSelector.autoInit();
      }
    };
    (document.head || document.documentElement).appendChild(script);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadServerSelector);
  } else {
    loadServerSelector();
  }
})();
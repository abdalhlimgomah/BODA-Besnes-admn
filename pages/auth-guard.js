(() => {
  if (window.supabase && !window.__bodaAdminHeaderPatched) {
    window.__bodaAdminHeaderPatched = true;
    const originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = (url, key, options) => {
      options = options || {};
      const global = typeof options.global === "object" && options.global ? options.global : {};
      const headers = typeof global.headers === "object" && global.headers ? Object.assign({}, global.headers) : {};
      headers["x-user-email"] = "admin@example.com";
      return originalCreateClient(url, key, Object.assign({}, options, { global: Object.assign({}, global, { headers }) }));
    };
  }

  const SESSION_KEY = "__boda_admin_session_v2";
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
  const LOGIN_PAGE = "login.html";
  const DASHBOARD_PAGE = "shacksf.html";
  const PROTECTED_PAGES = new Set([
    "shacksf.html",
    "admin.html",
    "admin-orders.html",
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
    if (window.crypto?.getRandomValues) {
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

  function isAuthenticated() {
    return !!readSession();
  }

  function createSession(username) {
    const session = {
      token: randomToken(),
      username: username || "",
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function goToLogin() {
    if (getCurrentPage() !== LOGIN_PAGE) {
      window.location.replace(LOGIN_PAGE);
    }
  }

  function goToDashboard() {
    if (getCurrentPage() !== DASHBOARD_PAGE) {
      window.location.replace(DASHBOARD_PAGE);
    }
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

    if (PROTECTED_PAGES.has(currentPage)) {
      requireAuth();
    }
  }

  window.adminAuth = {
    createSession,
    clearSession,
    isAuthenticated,
    requireAuth,
    redirectIfAuthenticated,
  };

  enforceRouteGuard();
})();


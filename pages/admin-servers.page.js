(function () {
  const SUPABASE_URL = window.SUPABASE_URL || "https://msgqzgzoslearaprgiqq.supabase.co";
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
  const supabase = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  const STORAGE_KEY = "boda_admin_active_backend";
  const TTL_MS = 15 * 60 * 1000;
  const HEALTH_CACHE_MS = 30 * 1000;

  const backendsMeta = {
    primary: { name: "primary", display: "السيرفر الرئيسي (Primary)" },
    backup: { name: "backup", display: "السيرفر الاحتياطي (Backup)" },
    backup2: { name: "backup2", display: "السيرفر الاحتياطي 2 (Backup2)" },
  };

  let dbServers = [];
  let healthCache = {};
  let checking = false;

  async function saveActiveBackendToStorage(name, url, key) {
    if (!supabase || !url || !key) return;
    try {
      const payload = { name: name || "primary", url: url, key: key, updated_at: new Date().toISOString(), source: "admin-panel" };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      await supabase.storage.from("site-config").upload("active-backend.json", blob, { upsert: true, contentType: "application/json", cacheControl: "0" });
    } catch (e) { console.warn("saveActiveBackendToStorage", e); }
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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name, reason: "manual", until: Date.now() + TTL_MS }));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    window.__bodaAdminBackendName = name;
    const backend = window.adminAuth?.ADMIN_BACKENDS?.[name];
    if (backend) {
      window.SUPABASE_URL = backend.url;
      window.SUPABASE_ANON_KEY = backend.key;
      saveActiveBackendToStorage(name, backend.url, backend.key).catch(function(){});
    }
    document.dispatchEvent(new CustomEvent("boda:admin-failover", { detail: { from: getActiveBackendName() === "primary" ? "backup" : "primary", to: name, reason: "manual" } }));
    window.location.reload();
  }

  function setSessionBackend(name, url, key) {
    if (name === "primary") {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name, reason: "db", until: Date.now() + TTL_MS }));
    }
    window.__bodaAdminBackendName = name;
    if (url) window.SUPABASE_URL = url;
    if (key) window.SUPABASE_ANON_KEY = key;
    saveActiveBackendToStorage(name, url, key).catch(function(){});
    window.location.reload();
  }

(function () {
  const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

  const TRUST_KEY = "__boda_site_entry_token";
  const TRUST_TS_KEY = "__boda_site_entry_ts";
  const TRUST_TTL_MS = 8 * 60 * 60 * 1000;

  let cachedClient = null;

  function getClient() {
    if (!window.supabase) {
      throw new Error("Supabase SDK is not loaded.");
    }

    if (!cachedClient) {
      cachedClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    return cachedClient;
  }

  function randomToken() {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function markTrustedEntry() {
    sessionStorage.setItem(TRUST_KEY, randomToken());
    sessionStorage.setItem(TRUST_TS_KEY, String(Date.now()));
  }

  function clearTrustedEntry() {
    sessionStorage.removeItem(TRUST_KEY);
    sessionStorage.removeItem(TRUST_TS_KEY);
  }

  function hasTrustedEntry() {
    const token = sessionStorage.getItem(TRUST_KEY);
    const ts = Number(sessionStorage.getItem(TRUST_TS_KEY) || 0);
    if (!token || !Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts <= TRUST_TTL_MS;
  }

  function requireTrustedEntry(options = {}) {
    const { redirectTo = "login.html" } = options;
    if (hasTrustedEntry()) return true;
    window.location.href = redirectTo;
    return false;
  }

  async function getSession() {
    const client = getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function getProfile(userId) {
    const client = getClient();
    const { data, error } = await client
      .from("profiles")
      .select("id, role, full_name, email, phone")
      .eq("id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data || null;
  }

  function getLocalAuthUser() {
    if (!window.siteAuth) return null;
    const localSession = window.siteAuth.getSession();
    if (!localSession) return null;

    return {
      session: { source: "site-local" },
      user: {
        id: localSession.id,
        email: localSession.email,
        user_metadata: { role: localSession.role },
      },
      profile: {
        id: localSession.id,
        role: localSession.role,
        full_name: localSession.username,
        email: localSession.email,
      },
      role: localSession.role,
      source: "site-local",
    };
  }

  async function getCurrentUser() {
    // Priority 1: Local site account
    const localAuth = getLocalAuthUser();
    if (localAuth) return localAuth;

    // Priority 2: Supabase Auth session (fallback)
    const session = await getSession();
    if (!session?.user) return null;

    let profile = null;
    try {
      profile = await getProfile(session.user.id);
    } catch (error) {
      console.error("Failed to load profile:", error);
    }

    const role = profile?.role || session.user.user_metadata?.role || "buyer";
    return {
      session,
      user: session.user,
      profile,
      role,
      source: "supabase",
    };
  }

  async function requireAuth(options = {}) {
    const { roles = [], redirectTo = "login.html" } = options;
    const authUser = await getCurrentUser();
    if (!authUser) {
      clearTrustedEntry();
      window.location.href = redirectTo;
      return null;
    }

    if (roles.length && !roles.includes(authUser.role)) {
      window.location.href = `${redirectTo}?unauthorized=1`;
      return null;
    }

    return authUser;
  }

  async function getApprovedSellerForUser(userId) {
    const client = getClient();
    const { data, error } = await client
      .from("sellers")
      .select("id, user_id, status, store_name")
      .eq("user_id", userId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data || null;
  }

  async function logout(redirectTo = "login.html") {
    clearTrustedEntry();
    if (window.siteAuth) {
      window.siteAuth.clearSession();
    }

    try {
      const client = getClient();
      await client.auth.signOut();
    } catch {
      // Ignore Supabase signOut failures when using local auth mode.
    }

    window.location.href = redirectTo;
  }

  window.appSupabase = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    getClient,
    getSession,
    getProfile,
    getCurrentUser,
    requireAuth,
    getApprovedSellerForUser,
    logout,
    markTrustedEntry,
    clearTrustedEntry,
    hasTrustedEntry,
    requireTrustedEntry,
  };
})();

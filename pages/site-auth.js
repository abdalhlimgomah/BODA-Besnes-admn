(function () {
  const ACCOUNTS_KEY = "__boda_site_accounts_v1";
  const SESSION_KEY = "__boda_site_session_v1";

  function normalizeIdentifier(rawValue) {
    const value = String(rawValue || "").trim().toLowerCase();
    if (!value) return { username: "", email: "" };
    if (value.includes("@")) {
      const username = value.split("@")[0] || value;
      return { username, email: value };
    }
    return { username: value, email: `${value}@boda.local` };
  }

  function readAccounts() {
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.id || !parsed.role) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function setSession(account) {
    const session = {
      id: account.id,
      username: account.username,
      email: account.email,
      role: account.role,
      login_at: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function randomUuid() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    // Fallback UUID v4-like generator
    let d = Date.now();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function register({ identifier, password }) {
    const { username, email } = normalizeIdentifier(identifier);
    const pwd = String(password || "").trim();
    if (!username || !pwd) {
      return { ok: false, error: "يرجى إدخال اسم مستخدم/بريد وكلمة مرور." };
    }
    if (pwd.length < 6) {
      return { ok: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." };
    }

    const accounts = readAccounts();
    const exists = accounts.some((acc) => acc.username === username || acc.email === email);
    if (exists) {
      return { ok: false, error: "هذا الحساب موجود بالفعل." };
    }

    const role = accounts.length === 0 ? "admin" : "seller";
    const password_hash = await sha256(pwd);
    const account = {
      id: randomUuid(),
      username,
      email,
      role,
      password_hash,
      active: true,
      created_at: new Date().toISOString(),
    };

    accounts.push(account);
    writeAccounts(accounts);
    return {
      ok: true,
      account: {
        id: account.id,
        username: account.username,
        email: account.email,
        role: account.role,
      },
    };
  }

  async function login({ identifier, password }) {
    const { username, email } = normalizeIdentifier(identifier);
    const pwd = String(password || "").trim();
    if (!pwd || (!username && !email)) {
      return { ok: false, error: "يرجى إدخال بيانات الدخول." };
    }

    const accounts = readAccounts();
    const account = accounts.find((acc) => acc.active && (acc.username === username || acc.email === email));
    if (!account) {
      return { ok: false, error: "الحساب غير موجود في الموقع." };
    }

    const enteredHash = await sha256(pwd);
    if (enteredHash !== account.password_hash) {
      return { ok: false, error: "كلمة المرور غير صحيحة." };
    }

    const session = setSession(account);
    return { ok: true, session };
  }

  function hasAnyAccount() {
    return readAccounts().length > 0;
  }

  window.siteAuth = {
    normalizeIdentifier,
    register,
    login,
    getSession,
    clearSession,
    hasAnyAccount,
  };
})();

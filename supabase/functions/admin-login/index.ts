import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const TOKEN_TTL_SECONDS = 12 * 60 * 60;

function b64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256HmacBase64Url(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64UrlEncode(new Uint8Array(signature));
}

async function getTokenSecret(supabaseAdmin: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "admin_token_secret")
    .maybeSingle();

  if (!error && data?.value) {
    return String(data.value);
  }

  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const secret = Array.from(raw)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await supabaseAdmin.from("app_settings").insert({ key: "admin_token_secret", value: secret });
  return secret;
}

async function handleLogin(body: Record<string, unknown>) {
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !password) {
    return jsonResponse({ error: "اسم المستخدم وكلمة المرور مطلوبان." }, { status: 400 });
  }

  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id, username, password")
    .ilike("username", username)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("admin-login: query error", error);
  }

  if (!data || String(data.password ?? "") !== password) {
    return jsonResponse({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, { status: 401 });
  }

  const secret = await getTokenSecret(supabaseAdmin);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;

  const claims = b64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ sub: data.username, role: "admin", iat: now, exp })
    )
  );
  const signature = await sha256HmacBase64Url(claims, secret);

  return jsonResponse({
    success: true,
    token: `${claims}.${signature}`,
    expiresAt: exp * 1000,
    username: data.username,
  });
}

async function handleVerify(body: Record<string, unknown>) {
  const token = String(body.token || "").trim();
  if (!token) {
    return jsonResponse({ valid: false }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();
  const secret = await getTokenSecret(supabaseAdmin);

  const parts = token.split(".");
  if (parts.length !== 2) {
    return jsonResponse({ valid: false }, { status: 401 });
  }

  const [payload, signature] = parts;
  const expected = await sha256HmacBase64Url(payload, secret);
  if (signature !== expected) {
    return jsonResponse({ valid: false }, { status: 401 });
  }

  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(decoded) as { exp?: number; sub?: string };
    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp < now) {
      return jsonResponse({ valid: false }, { status: 401 });
    }
    return jsonResponse({ valid: true, username: claims.sub || "" });
  } catch {
    return jsonResponse({ valid: false }, { status: 401 });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "login");

    if (action === "verify") {
      return await handleVerify(body);
    }

    return await handleLogin(body);
  } catch (error) {
    console.error("admin-login error", error);
    return jsonResponse({ error: "حدث خطأ غير متوقع." }, { status: 500 });
  }
});
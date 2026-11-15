import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

const DEFAULT_SAFKA_API_BASE = "https://api.safka-eg.com/api/v1";
const ENV_SAFKA_API_BASE = (Deno.env.get("SAFKA_API_BASE") || "").trim().replace(/\/+$/, "");

const MAX_ALL_PAGES = 100;
const DEFAULT_SIZE = 100;
const MAX_SIZE = 100;

type Json = Record<string, unknown>;

type ResolvedConfig = {
  token: string;
  source: string;
  apiBase: string;
};

function decodeJwtPayload(token: string): Json | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    // Handle UTF-8 payloads safely.
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Json;
  } catch {
    return null;
  }
}

function cleanSetting(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value);
  return text.trim().replace(/^"(.*)"$/s, "$1").trim();
}

function normalizeApiBase(value: unknown): string {
  const text = cleanSetting(value);
  return /^https?:\/\//i.test(text) ? text.replace(/\/+$/, "") : "";
}

async function readSettings(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  table: string,
  keys: string[]
): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabaseAdmin.from(table).select("key, value").in("key", keys);
    if (error) return {};

    const map: Record<string, string> = {};
    (data || []).forEach((row: { key?: string; value?: unknown }) => {
      if (row?.key) map[row.key] = cleanSetting(row.value);
    });
    return map;
  } catch {
    return {};
  }
}

async function resolveConfig(
  supabaseAdmin: ReturnType<typeof createAdminClient>
): Promise<ResolvedConfig> {
  const envToken = cleanSetting(Deno.env.get("SAFKA_AUTH_TOKEN"));
  if (envToken) {
    return {
      token: envToken,
      source: "env",
      apiBase: ENV_SAFKA_API_BASE || DEFAULT_SAFKA_API_BASE,
    };
  }

  const keys = ["safka_auth_token", "safka_api_base"];

  // Preferred: the dedicated table written by pages/admin-safka-token.html.
  const own = await readSettings(supabaseAdmin, "safka_settings", keys);
  const ownToken = cleanSetting(own.safka_auth_token);
  if (ownToken) {
    return {
      token: ownToken,
      source: "safka_settings",
      apiBase:
        normalizeApiBase(own.safka_api_base) ||
        ENV_SAFKA_API_BASE ||
        DEFAULT_SAFKA_API_BASE,
    };
  }

  // Legacy fallback: app_settings (may be read-only from the browser).
  const legacy = await readSettings(supabaseAdmin, "app_settings", keys);
  const legacyToken = cleanSetting(legacy.safka_auth_token);
  if (legacyToken) {
    return {
      token: legacyToken,
      source: "app_settings",
      apiBase:
        normalizeApiBase(legacy.safka_api_base) ||
        ENV_SAFKA_API_BASE ||
        DEFAULT_SAFKA_API_BASE,
    };
  }

  return {
    token: "",
    source: "none",
    apiBase: ENV_SAFKA_API_BASE || DEFAULT_SAFKA_API_BASE,
  };
}

function buildFilter(raw: string | null): Json {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Json;
    } catch {
      // Fall through to the default filter.
    }
  }
  return { is_active: true, is_archived: false };
}

async function callSafka(
  token: string,
  apiBase: string,
  params: { page: number; size: number; query: string; filter: Json; total: boolean }
) {
  const search = new URLSearchParams();
  search.set("page", String(params.page));
  search.set("size", String(params.size));
  search.set("query", params.query || "");
  search.set("filter", JSON.stringify(params.filter));
  search.set("total", params.total ? "true" : "false");

  const url = `${apiBase}/products/get_products?${search.toString()}`;

  // IMPORTANT: send only accept + authorization.
  // Adding browser-like headers (user-agent/origin/referer) makes Cloudflare
  // return a "Just a moment..." HTML challenge.
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: token,
    },
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error:
        response.status === 401 || response.status === 403
          ? "توكن Safka غير صالح أو منتهي الصلاحية."
          : `Safka API returned ${response.status}.`,
      code:
        contentType.includes("text/html")
          ? "CLOUDFLARE_BLOCKED"
          : response.status === 401
          ? "TOKEN_INVALID"
          : response.status === 403
          ? "TOKEN_FORBIDDEN"
          : "SAFKA_API_ERROR",
      raw: text.slice(0, 500),
    };
  }

  if (contentType.includes("text/html")) {
    return {
      ok: false as const,
      status: 502,
      error: "Safka returned an HTML challenge page instead of JSON.",
      code: "CLOUDFLARE_BLOCKED",
      raw: text.slice(0, 500),
    };
  }

  try {
    return { ok: true as const, data: JSON.parse(text) as Json };
  } catch {
    return {
      ok: false as const,
      status: 502,
      error: "Safka returned invalid JSON.",
      code: "INVALID_JSON",
      raw: text.slice(0, 500),
    };
  }
}

function pickNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function handleHealth(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  url: URL
) {
  const resolved = await resolveConfig(supabaseAdmin);
  const payload = resolved.token ? decodeJwtPayload(resolved.token) : null;
  const exp = payload && typeof payload.exp === "number" ? payload.exp : null;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const result: Json = {
    ok: true,
    service: "safka-proxy",
    api_base: resolved.apiBase,
    token_source: resolved.source,
    has_token: Boolean(resolved.token),
    account_id: payload && (payload.id || payload._id || payload.userId) ? String(payload.id || payload._id || payload.userId) : null,
    role: payload?.role ? String(payload.role) : null,
    expires_at: exp ? new Date(exp * 1000).toISOString() : null,
    expired: exp ? exp <= nowSeconds : null,
    server_time: new Date().toISOString(),
  };

  const shouldPing = url.searchParams.get("ping") === "1" || url.searchParams.get("ping") === "true";
  if (shouldPing) {
    if (!resolved.token) {
      result.ping = { ok: false, error: "لا يوجد توكن Safka محفوظ." };
    } else {
      const started = Date.now();
      const ping = await callSafka(resolved.token, resolved.apiBase, {
        page: 1,
        size: 1,
        query: "",
        filter: { is_active: true, is_archived: false },
        total: true,
      });
      if (ping.ok) {
        const data = ping.data as Json;
        result.ping = {
          ok: true,
          status: 200,
          ms: Date.now() - started,
          total_items: pickNumber(data.totalItems, 0),
          pages: pickNumber(data.pages, 0),
        };
      } else {
        result.ping = {
          ok: false,
          status: ping.status,
          code: ping.code,
          error: ping.error,
          ms: Date.now() - started,
        };
      }
    }
  }

  return jsonResponse(result);
}

async function handleProducts(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  url: URL,
  body: Json
) {
  const resolved = await resolveConfig(supabaseAdmin);
  if (!resolved.token) {
    return jsonResponse(
      {
        error: "لا يوجد توكن Safka. احفظه من صفحة جلسة Safka أو أضف SAFKA_AUTH_TOKEN.",
        code: "TOKEN_MISSING",
      },
      { status: 401 }
    );
  }

  const page = Math.max(1, Math.floor(pickNumber(url.searchParams.get("page") ?? body.page, 1)));
  const sizeRaw = Math.floor(pickNumber(url.searchParams.get("size") ?? body.size, DEFAULT_SIZE));
  const size = Math.min(MAX_SIZE, Math.max(1, sizeRaw || DEFAULT_SIZE));
  const query = String(url.searchParams.get("query") ?? body.query ?? "");
  const filter = buildFilter(String(url.searchParams.get("filter") ?? body.filter ?? ""));
  const total = String(url.searchParams.get("total") ?? body.total ?? "true") !== "false";
  const all = ["1", "true"].includes(String(url.searchParams.get("all") ?? body.all ?? ""));

  if (!all) {
    const result = await callSafka(resolved.token, resolved.apiBase, { page, size, query, filter, total });
    if (!result.ok) {
      return jsonResponse(
        { error: result.error, code: result.code, status: result.status, raw: result.raw },
        { status: result.status >= 400 ? result.status : 502 }
      );
    }
    return jsonResponse(result.data, {
      headers: { "x-safka-token-source": resolved.source },
    });
  }

  // Aggregate every page so the admin page can work with one request.
  const first = await callSafka(resolved.token, resolved.apiBase, { page: 1, size, query, filter, total: true });
  if (!first.ok) {
    return jsonResponse(
      { error: first.error, code: first.code, status: first.status, raw: first.raw },
      { status: first.status >= 400 ? first.status : 502 }
    );
  }

  const firstData = first.data as Json;
  const allItems: unknown[] = Array.isArray(firstData.data) ? [...(firstData.data as unknown[])] : [];
  const pages = Math.max(1, Math.floor(pickNumber(firstData.pages, 1)));

  for (let current = 2; current <= Math.min(pages, MAX_ALL_PAGES); current++) {
    const next = await callSafka(resolved.token, resolved.apiBase, { page: current, size, query, filter, total: false });
    if (!next.ok) break;
    const nextData = next.data as Json;
    if (Array.isArray(nextData.data)) allItems.push(...(nextData.data as unknown[]));
    if (!Array.isArray(nextData.data) || (nextData.data as unknown[]).length < size) break;
  }

  return jsonResponse(
    {
      data: allItems,
      totalItems: pickNumber(firstData.totalItems, allItems.length),
      pages,
      currentPage: 1,
      itemsPerPage: size,
      mostRecentCount: pickNumber(firstData.mostRecentCount, 0),
      mostPopularCount: pickNumber(firstData.mostPopularCount, 0),
      token_source: resolved.source,
    },
    { headers: { "x-safka-token-source": resolved.source } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let body: Json = {};
    if (req.method === "POST") {
      body = (await req.json().catch(() => ({}))) as Json;
    }

    const action = String(url.searchParams.get("action") || body.action || "products").toLowerCase();
    const supabaseAdmin = createAdminClient();

    if (action === "health") {
      return await handleHealth(supabaseAdmin, url);
    }

    if (action === "products") {
      return await handleProducts(supabaseAdmin, url, body);
    }

    return jsonResponse({ error: `Unknown action: ${action}`, code: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (error) {
    console.error("safka-proxy error", error);
    return jsonResponse(
      {
        error: "حدث خطأ غير متوقع في وسيط Safka.",
        code: "PROXY_ERROR",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
});

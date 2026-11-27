/**
 * Local Jumia scraper + dashboard server.
 *
 *   node server/jumia-server.mjs
 *   → http://localhost:8788/pages/product-lab.html
 *
 * Why: browsers cannot fetch jumia.com.eg directly (CORS), and Jumia blocks
 * many datacenter IPs. Running this small server on your own machine gives the
 * page a same-origin API with your residential IP.
 *
 * Routes:
 *   GET  /api/jumia/health
 *   GET  /api/jumia/discover?url=<listing-or-sitemap-url>&mode=listing|sitemap
 *   GET  /api/jumia/product?url=<product-url>
 *   POST /api/jumia/product        { url, html? }   (html = paste a saved page)
 *   GET  /api/jumia/robots
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  JUMIA_VERSION,
  discoverListing,
  discoverSitemap,
  fetchJumiaProduct,
  parseProduct,
  parseSitemap,
  readRobotsSitemaps,
  absoluteJumiaUrl,
} from "./jumia-core.mjs";
import { parseProxyList, proxyPool } from "./jumia-proxy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const START_PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY = 12 * 1024 * 1024;
const PROXY_STORE = path.join(__dirname, "jumia-proxies.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  // Chrome blocks fetch() from a public https page (jumia.com.eg) to a local
  // server unless the preflight opts into private-network access. The lab's
  // bookmarklet bridge relies on that call, so allow it explicitly.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function json(res, status, payload) {
  cors(res);
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("الطلب أكبر من المسموح (12MB)");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(req, res, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch (_error) {
    return json(res, 400, { ok: false, error: "رابط غير صالح" });
  }
  if (decoded === "/" || decoded === "") decoded = "/pages/shacksf.html";
  const filePath = path.resolve(ROOT, "." + decoded);
  if (!filePath.startsWith(ROOT)) {
    return json(res, 403, { ok: false, error: "ممنوع" });
  }
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch (_error) {
    return json(res, 404, { ok: false, error: "الملف غير موجود: " + decoded });
  }
  if (stat.isDirectory()) {
    return serveStatic(req, res, path.posix.join(decoded, "index.html"));
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(filePath).pipe(res);
}

let proxyStoreText = "";
let proxyStoreLoaded = false;

async function loadProxyStore() {
  try {
    const raw = await fsp.readFile(PROXY_STORE, "utf8");
    const data = JSON.parse(raw);
    proxyStoreText = String(data.text || "");
    proxyStoreLoaded = proxyStoreText.trim().length > 0;
  } catch (_error) {
    proxyStoreText = String(process.env.JUMIA_PROXIES || "");
    proxyStoreLoaded = proxyStoreText.trim().length > 0;
  }
  if (!proxyStoreText.trim() && process.env.JUMIA_PROXIES) {
    proxyStoreText = String(process.env.JUMIA_PROXIES || "");
    proxyStoreLoaded = proxyStoreText.trim().length > 0;
  }
  if (proxyStoreText.trim()) {
    const concurrency = Number(process.env.JUMIA_PROXY_CONCURRENCY) || 10;
    const parsed = proxyPool.set(proxyStoreText, { concurrency });
    console.log(
      "  الوسائط: " +
        parsed.proxies.length +
        " جاهز (تجاهل " +
        parsed.invalid +
        " سطر، مكرر " +
        parsed.duplicates +
        ")"
    );
  }
}

async function persistProxyStore(text) {
  proxyStoreText = String(text || "");
  proxyStoreLoaded = proxyStoreText.trim().length > 0;
  try {
    await fsp.writeFile(
      PROXY_STORE,
      JSON.stringify(
        {
          updated_at: new Date().toISOString(),
          concurrency: proxyPool.concurrency,
          text: proxyStoreText,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
  } catch (error) {
    console.error("تعذر حفظ ملف الوسائط:", error.message);
  }
}

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/\/+$/, "");
  const urlParam = url.searchParams.get("url") || "";
  const mode = (url.searchParams.get("mode") || "").toLowerCase();
  const fetchOptions = {};
  if (url.searchParams.get("retries")) {
    fetchOptions.retries = Number(url.searchParams.get("retries")) || 1;
  }
  const proxyParam = String(url.searchParams.get("proxy") || "").toLowerCase();
  if (proxyParam === "pool") {
    fetchOptions.proxyMode = "pool";
    fetchOptions.allowFallback = url.searchParams.get("fallback") !== "0";
    if (url.searchParams.get("poolAttempts")) {
      fetchOptions.poolAttempts = Number(url.searchParams.get("poolAttempts")) || 4;
    }
  } else if (proxyParam) {
    fetchOptions.allowProxy = proxyParam !== "0";
  } else if (url.searchParams.get("proxy")) {
    fetchOptions.allowProxy = url.searchParams.get("proxy") !== "0";
  }
  if (url.searchParams.get("timeout")) {
    fetchOptions.timeoutMs = Number(url.searchParams.get("timeout")) || 25000;
  }

  if (route === "/api/jumia/proxies") {
    if (req.method === "GET") {
      return json(res, 200, { ok: true, ...proxyPool.stats(), stored: proxyStoreLoaded });
    }
    if (req.method === "DELETE") {
      proxyPool.set("", { concurrency: proxyPool.concurrency });
      await persistProxyStore("");
      return json(res, 200, { ok: true, cleared: true, ...proxyPool.stats() });
    }
    if (req.method === "POST") {
      let payload = {};
      try {
        payload = JSON.parse(await readBody(req));
      } catch (error) {
        return json(res, 400, { ok: false, error: "JSON غير صالح: " + error.message });
      }
      if (payload.clear === true) {
        proxyPool.set("", { concurrency: proxyPool.concurrency });
        await persistProxyStore("");
        return json(res, 200, { ok: true, cleared: true, ...proxyPool.stats() });
      }
      const text = String(payload.text || "");
      if (!text.trim()) {
        return json(res, 400, { ok: false, error: "الصق قائمة الوسائط أولًا (سطر لكل وسيط)" });
      }
      const concurrency = Math.max(
        1,
        Math.min(1000, Number(payload.concurrency) || proxyPool.concurrency || 1)
      );
      const mode = String(payload.mode || "replace").toLowerCase();
      const existing = mode === "append" ? proxyStoreText : "";
      const existingCount = existing ? parseProxyList(existing).proxies.length : 0;
      const merged = existing ? existing + "\n" + text : text;
      const parsed = proxyPool.set(merged, { concurrency });
      await persistProxyStore(merged);
      return json(res, 200, {
        ok: true,
        mode,
        added:
          mode === "append"
            ? Math.max(0, parsed.proxies.length - existingCount)
            : parsed.proxies.length,
        duplicates: parsed.duplicates,
        invalid: parsed.invalid,
        ...parsed.stats,
      });
    }
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (route === "/api/jumia/proxies/test" && req.method === "POST") {
    let payload = {};
    try {
      payload = JSON.parse(await readBody(req));
    } catch (error) {
      return json(res, 400, { ok: false, error: "JSON غير صالح: " + error.message });
    }
    const text = String(payload.text || "");
    if (!text.trim() && proxyPool.size === 0) {
      return json(res, 400, { ok: false, error: "لا توجد وسائط للاختبار" });
    }
    try {
      const result = await proxyPool.test(text, {
        limit: Number(payload.limit) || 50,
        concurrency: Number(payload.concurrency) || 15,
        url: payload.url || "https://www.jumia.com.eg/robots.txt",
        timeoutMs: Number(payload.timeoutMs) || 12000,
      });
      return json(res, 200, result);
    } catch (error) {
      return json(res, 502, { ok: false, error: String(error && error.message) });
    }
  }

  if (route === "/api/jumia/health") {
    return json(res, 200, {
      ok: true,
      service: "jumia-scraper",
      version: JUMIA_VERSION,
      runtime: "local-node",
      node: process.version,
      proxy: process.env.JUMIA_ALLOW_PROXY !== "false",
      proxies: proxyPool.stats(),
      time: new Date().toISOString(),
    });
  }

  if (route === "/api/jumia/robots") {
    try {
      const sitemaps = await readRobotsSitemaps();
      return json(res, 200, { ok: true, sitemaps });
    } catch (error) {
      return json(res, 502, { ok: false, error: String(error && error.message), blocked: Boolean(error && error.blocked) });
    }
  }

  if (route === "/api/jumia/discover") {
    try {
      if (mode === "sitemap" || /sitemap|\.xml(\.gz)?$/i.test(urlParam)) {
        if (!urlParam) {
          const sitemaps = await readRobotsSitemaps();
          return json(res, 200, { ok: true, kind: "sitemap-index", sitemaps, urls: [] });
        }
        const result = await discoverSitemap(urlParam, fetchOptions);
        return json(res, 200, { ok: true, ...result, urls: result.urls.slice(0, 20000) });
      }
      if (!urlParam) return json(res, 400, { ok: false, error: "أضف رابط قسم أو بحث من جوميا" });
      const page = Number(url.searchParams.get("page") || 0);
      const target = page > 1 ? withPage(urlParam, page) : absoluteJumiaUrl(urlParam);
      const result = await discoverListing(target, fetchOptions);
      return json(res, 200, { ok: true, ...result });
    } catch (error) {
      return json(res, error && error.blocked ? 429 : 502, {
        ok: false,
        error: String(error && error.message ? error.message : error),
        blocked: Boolean(error && error.blocked),
        attempts: error && error.attempts,
      });
    }
  }

  if (route === "/api/jumia/product") {
    if (req.method === "POST") {
      let body = "";
      try {
        body = await readBody(req);
      } catch (error) {
        return json(res, 413, { ok: false, error: String(error.message) });
      }
      let payload = {};
      const contentType = String(req.headers["content-type"] || "");
      if (contentType.includes("application/json")) {
        try {
          payload = JSON.parse(body);
        } catch (_error) {
          payload = {};
        }
      } else {
        payload = { html: body };
      }
      const targetUrl = payload.url || urlParam;
      const html = payload.html || "";
      if (html && html.length > 200) {
        const product = parseProduct(html, targetUrl);
        return json(res, 200, { ok: true, product, via: "pasted-html" });
      }
      if (!targetUrl) return json(res, 400, { ok: false, error: "أضف رابط المنتج أو HTML الصفحة" });
      try {
        const product = await fetchJumiaProduct(targetUrl, fetchOptions);
        return json(res, 200, { ok: true, product });
      } catch (error) {
        return json(res, error && error.blocked ? 429 : 502, {
          ok: false,
          error: String(error && error.message ? error.message : error),
          blocked: Boolean(error && error.blocked),
        });
      }
    }
    if (!urlParam) return json(res, 400, { ok: false, error: "أضف رابط المنتج" });
    try {
      const product = await fetchJumiaProduct(urlParam, fetchOptions);
      return json(res, 200, { ok: true, product });
    } catch (error) {
      return json(res, error && error.blocked ? 429 : 502, {
        ok: false,
        error: String(error && error.message ? error.message : error),
        blocked: Boolean(error && error.blocked),
      });
    }
  }

  return json(res, 404, { ok: false, error: "مسار API غير معروف: " + route });
}

function withPage(value, page) {
  try {
    const url = new URL(value);
    url.searchParams.set("page", String(page));
    return url.toString();
  } catch (_error) {
    return value;
  }
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  } catch (_error) {
    return json(res, 400, { ok: false, error: "طلب غير صالح" });
  }

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  try {
    if (url.pathname.startsWith("/api/jumia/")) {
      await handleApi(req, res, url);
    } else if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res, url.pathname);
    } else {
      json(res, 405, { ok: false, error: "Method not allowed" });
    }
  } catch (error) {
    console.error("[server]", error);
    if (!res.headersSent) json(res, 500, { ok: false, error: String(error && error.message) });
    else res.end();
  } finally {
    if (url.pathname.startsWith("/api/")) {
      console.log(
        "[api]",
        req.method,
        url.pathname + (url.search || ""),
        res.statusCode,
        Date.now() - started + "ms"
      );
    }
  }
});

function listen(port, remaining) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && remaining > 0) {
      console.log("المنفذ " + port + " مشغول، أجرّب " + (port + 1) + "...");
      listen(port + 1, remaining - 1);
      return;
    }
    console.error("تعذر تشغيل السيرفر:", error.message);
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => {
    console.log("");
    console.log("  ╔══════════════════════════════════════════════════════╗");
    console.log("  ║        Jumia Product Lab — local scraper             ║");
    console.log("  ╚══════════════════════════════════════════════════════╝");
    console.log("");
    console.log("  الصفحة:  http://localhost:" + port + "/pages/product-lab.html");
    console.log("  الفحص:   http://localhost:" + port + "/api/jumia/health");
    console.log("  الإيقاف: Ctrl+C");
    console.log("");
  });
}

await loadProxyStore();
listen(START_PORT, 5);

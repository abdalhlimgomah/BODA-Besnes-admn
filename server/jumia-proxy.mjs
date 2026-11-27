#!/usr/bin/env node
/**
 * Proxy pool for the Jumia scraper.
 *
 * The direct connection (and the two public CORS proxies) gets HTTP 429 from
 * Jumia after a handful of pages. Paid/residential proxy lists solve that, but
 * they usually arrive as a huge text file. This module:
 *
 *   • parses the common proxy list formats,
 *   • keeps a health/cooldown state per proxy,
 *   • makes HTTP(S) requests through an HTTP/HTTPS proxy (CONNECT tunnel),
 *   • hands out one proxy per in-flight request so N products can be fetched
 *     at the same time, each through a different exit IP.
 *
 * Supported line formats:
 *   host:port
 *   host:port:user:pass
 *   user:pass@host:port
 *   http://user:pass@host:port
 *   https://host:port
 *   socks5://...        (parsed, reported as unsupported)
 *
 * Deliberately no dependency on `undici`/`https-proxy-agent`: Node 18 fetch
 * cannot take a proxy, and the admin server may run on a bare Node install.
 */

import http from "node:http";
import net from "node:net";
import tls from "node:tls";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 25000;

function decodePart(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function splitHostPort(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end === -1) return null;
    const host = raw.slice(1, end);
    const rest = raw.slice(end + 1);
    if (!rest.startsWith(":")) return null;
    return { host, port: rest.slice(1) };
  }
  const colon = raw.lastIndexOf(":");
  if (colon <= 0) return null;
  return { host: raw.slice(0, colon), port: raw.slice(colon + 1) };
}

/** Parses one proxy line. Returns null for blank/comment/invalid lines. */
export function parseProxy(line) {
  let raw = String(line == null ? "" : line).trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("//")) return null;

  // Providers sometimes prefix a label: "proxy-01|host:port:user:pass".
  if (/^[A-Za-z0-9_. -]{1,40}\|/.test(raw) && raw.indexOf("@") === -1) {
    raw = raw.slice(raw.indexOf("|") + 1).trim();
  }

  let protocol = "http";
  const scheme = raw.match(/^(https?|socks4a?|socks5h?):\/\//i);
  if (scheme) {
    protocol = scheme[1].toLowerCase();
    raw = raw.slice(scheme[0].length);
  }

  let username = "";
  let password = "";
  let host = "";
  let port = "";

  if (raw.includes("@")) {
    const at = raw.lastIndexOf("@");
    const credentials = raw.slice(0, at);
    const address = raw.slice(at + 1);
    const colon = credentials.indexOf(":");
    if (colon >= 0) {
      username = decodePart(credentials.slice(0, colon));
      password = decodePart(credentials.slice(colon + 1));
    } else {
      username = decodePart(credentials);
    }
    const parsed = splitHostPort(address);
    if (!parsed) return null;
    host = parsed.host;
    port = parsed.port;
  } else {
    const parts = raw.split(":");
    if (parts.length === 2) {
      host = parts[0];
      port = parts[1];
    } else if (parts.length === 3) {
      // host:port:user
      host = parts[0];
      port = parts[1];
      username = decodePart(parts[2]);
    } else if (parts.length >= 4) {
      // host:port:user:pass
      host = parts[0];
      port = parts[1];
      username = decodePart(parts[2]);
      password = decodePart(parts.slice(3).join(":"));
    } else {
      return null;
    }
  }

  host = String(host || "").trim();
  port = String(port || "").trim();
  const portNumber = Number(port);
  if (!host || !Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    return null;
  }

  const unsupported = /^socks/i.test(protocol);
  return {
    id: (unsupported ? protocol : "http") + "://" + host + ":" + portNumber +
      (username ? "|" + username : ""),
    protocol: unsupported ? protocol : "http",
    tunnelTls: protocol === "https",
    unsupported,
    host,
    port: portNumber,
    username,
    password,
    label: host + ":" + portNumber,
  };
}

export function parseProxyList(text) {
  const seen = new Set();
  const proxies = [];
  let invalid = 0;
  let duplicates = 0;
  String(text || "")
    .split(/\r?\n|,|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith("#") || line.startsWith("//")) return;
      const parsed = parseProxy(line);
      if (!parsed) {
        invalid += 1;
        return;
      }
      if (seen.has(parsed.id)) {
        duplicates += 1;
        return;
      }
      seen.add(parsed.id);
      proxies.push(parsed);
    });
  return { proxies, invalid, duplicates };
}

function proxyAuthorization(entry) {
  if (!entry.username) return "";
  const token = Buffer.from(entry.username + ":" + (entry.password || ""), "utf8").toString("base64");
  return "Basic " + token;
}

function openTunnel(entry, targetHost, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: entry.host, port: entry.port });
    let buffer = "";
    let settled = false;

    const timer = setTimeout(() => finish(new Error("انتهت مهلة الوسيط")), timeoutMs);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners("data");
      socket.removeAllListeners("error");
      if (error) {
        socket.destroy();
        reject(error);
      } else {
        resolve(value);
      }
    }

    socket.once("error", (error) => finish(error));
    socket.once("connect", () => {
      const auth = proxyAuthorization(entry);
      socket.write(
        "CONNECT " + targetHost + ":" + targetPort + " HTTP/1.1\r\n" +
          "Host: " + targetHost + ":" + targetPort + "\r\n" +
          (auth ? "Proxy-Authorization: " + auth + "\r\n" : "") +
          "Proxy-Connection: keep-alive\r\n\r\n"
      );
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      if (!buffer.includes("\r\n\r\n")) return;
      const match = buffer.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i);
      const status = match ? Number(match[1]) : 0;
      if (status === 200) return finish(null, socket);
      if (status === 407) return finish(new Error("الوسيط يرفض بيانات الدخول (407)"));
      return finish(new Error("فشل نفق الوسيط (HTTP " + (status || "?") + ")"));
    });
  });
}

function requestOnce(entry, targetUrl, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const isHttps = url.protocol === "https:";
    const host = url.hostname;
    const port = Number(url.port) || (isHttps ? 443 : 80);
    const path = url.pathname + url.search;
    const requestHeaders = Object.assign({}, headers, {
      Host: url.host,
      Connection: "close",
    });

    let request = null;

    const start = (connection) => {
      request = http.request(
        {
          host,
          port,
          method: "GET",
          path,
          headers: requestHeaders,
          createConnection: () => connection,
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            resolve({
              status: response.statusCode || 0,
              headers: response.headers,
              body: Buffer.concat(chunks),
              finalUrl: targetUrl,
            });
          });
          response.on("error", reject);
        }
      );
      request.setTimeout(Math.max(3000, timeoutMs), () => {
        request.destroy(new Error("انتهت مهلة الطلب"));
      });
      request.on("error", reject);
      request.end();
    };

    if (isHttps) {
      openTunnel(entry, host, port, timeoutMs)
        .then((socket) => {
          // A late RST from the proxy must never become an unhandled 'error'
          // event on the process. TLS forwards socket errors to `secure`.
          socket.on("error", () => {});
          const secure = tls.connect({ socket, servername: net.isIP(host) ? undefined : host });
          secure.on("error", reject);
          secure.once("secureConnect", () => start(secure));
        })
        .catch(reject);
    } else {
      const httpHeaders = Object.assign({}, requestHeaders, {
        "Proxy-Connection": "close",
      });
      const authHeader = proxyAuthorization(entry);
      if (authHeader) httpHeaders["Proxy-Authorization"] = authHeader;
      const proxyRequest = http.request(
        {
          host: entry.host,
          port: entry.port,
          method: "GET",
          path: targetUrl,
          headers: httpHeaders,
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            resolve({
              status: response.statusCode || 0,
              headers: response.headers,
              body: Buffer.concat(chunks),
              finalUrl: targetUrl,
            });
          });
          response.on("error", reject);
        }
      );
      proxyRequest.setTimeout(Math.max(3000, timeoutMs), () => {
        proxyRequest.destroy(new Error("انتهت مهلة الوسيط"));
      });
      proxyRequest.on("error", reject);
      proxyRequest.end();
    }
  });
}

/** Fetches a URL through one proxy entry, following redirects. */
export async function fetchThroughProxy(entry, targetUrl, options) {
  const opts = options || {};
  const timeoutMs = Math.max(5000, Math.min(60000, Number(opts.timeoutMs) || DEFAULT_TIMEOUT));
  let current = String(targetUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await requestOnce(entry, current, opts.headers || {}, timeoutMs);
    const location = result.headers && result.headers.location;
    if (result.status >= 300 && result.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return { ...result, finalUrl: current };
  }
  throw new Error("عدد تحويلات كبير جدًا");
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

function cooldownFor(entry, status, error) {
  if (status === 407 || status === 401) return 30 * 60 * 1000;
  if (status === 429) return 10 * 60 * 1000;
  if (status === 403 || status === 503) return 3 * 60 * 1000;
  if (status === 502 || status === 504) return 90 * 1000;
  if (error) return Math.min(5 * 60 * 1000, 45 * 1000 * Math.max(1, entry.failures));
  return 60 * 1000;
}

export class ProxyPool {
  constructor() {
    this.entries = [];
    this.cursor = 0;
    this.concurrency = 0;
    this.successes = 0;
    this.failures = 0;
    this.lastError = "";
    this.updatedAt = Date.now();
  }

  set(text, options) {
    const opts = options || {};
    const parsed = parseProxyList(text);
    this.entries = parsed.proxies.map((entry) => ({
      ...entry,
      inFlight: false,
      failures: 0,
      uses: 0,
      successes: 0,
      lastStatus: 0,
      lastError: "",
      lastUsedAt: 0,
      cooldownUntil: 0,
    }));
    if (opts.concurrency !== undefined) {
      this.concurrency = Math.max(1, Math.min(1000, Number(opts.concurrency) || 1));
    }
    this.updatedAt = Date.now();
    return { ...parsed, stats: this.stats() };
  }

  get size() {
    return this.entries.length;
  }

  /** Returns an idle, healthy proxy, or null when all are busy/cooling. */
  acquire() {
    const now = Date.now();
    const total = this.entries.length;
    if (!total) return null;
    for (let offset = 0; offset < total; offset += 1) {
      const index = (this.cursor + offset) % total;
      const entry = this.entries[index];
      if (entry.unsupported || entry.inFlight) continue;
      if (entry.cooldownUntil && entry.cooldownUntil > now) continue;
      entry.inFlight = true;
      entry.uses += 1;
      entry.lastUsedAt = now;
      this.cursor = (index + 1) % total;
      return entry;
    }
    return null;
  }

  /**
   * Like acquire(), but when every proxy is momentarily in flight it waits
   * for one to be released instead of letting the caller fall back to the
   * direct connection. Returns null when no release is likely (all cooling or
   * unsupported) or the wait times out.
   */
  async acquireWait(options) {
    const opts = options || {};
    const timeoutMs = Math.max(0, Math.min(30000, Number(opts.timeoutMs) || 10000));
    const pollMs = Math.max(50, Math.min(1000, Number(opts.pollMs) || 120));
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const entry = this.acquire();
      if (entry) return entry;
      const stats = this.stats();
      if (stats.inFlight === 0) return null;
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  release(entry, result) {
    if (!entry) return;
    const outcome = result || {};
    entry.inFlight = false;
    entry.lastStatus = Number(outcome.status) || 0;
    if (outcome.ok) {
      entry.failures = 0;
      entry.successes += 1;
      entry.cooldownUntil = 0;
      entry.lastError = "";
      this.successes += 1;
      return;
    }
    entry.failures += 1;
    entry.lastError = String(outcome.error || (entry.lastStatus ? "HTTP " + entry.lastStatus : "فشل"));
    entry.cooldownUntil = Date.now() + cooldownFor(entry, entry.lastStatus, outcome.error);
    this.failures += 1;
    this.lastError = entry.label + ": " + entry.lastError;
  }

  stats() {
    const now = Date.now();
    let ready = 0;
    let inFlight = 0;
    let cooling = 0;
    let unsupported = 0;
    const byStatus = {};
    this.entries.forEach((entry) => {
      if (entry.unsupported) unsupported += 1;
      else if (entry.inFlight) inFlight += 1;
      else if (entry.cooldownUntil && entry.cooldownUntil > now) cooling += 1;
      else ready += 1;
      if (entry.lastStatus) {
        const key = String(entry.lastStatus);
        byStatus[key] = (byStatus[key] || 0) + 1;
      }
    });
    return {
      ok: true,
      total: this.entries.length,
      ready,
      inFlight,
      cooling,
      unsupported,
      concurrency: this.concurrency,
      successes: this.successes,
      failures: this.failures,
      lastError: this.lastError,
      byStatus,
      updatedAt: this.updatedAt,
    };
  }

  /** Tests a slice of the pool (or an ad-hoc list) against a Jumia URL. */
  async test(text, options) {
    const opts = options || {};
    const list = text ? parseProxyList(text).proxies : this.entries.slice();
    const limit = Math.max(1, Math.min(500, Number(opts.limit) || 50));
    const concurrency = Math.max(1, Math.min(100, Number(opts.concurrency) || 15));
    const target = String(opts.url || "https://www.jumia.com.eg/robots.txt");
    const timeoutMs = Math.max(5000, Math.min(30000, Number(opts.timeoutMs) || 12000));
    const headers = opts.headers || {};
    const queue = list.slice(0, limit);
    const results = [];
    let cursor = 0;

    async function worker() {
      while (cursor < queue.length) {
        const entry = queue[cursor];
        cursor += 1;
        const started = Date.now();
        try {
          const result = await fetchThroughProxy(entry, target, { timeoutMs, headers });
          const ok = result.status >= 200 && result.status < 400 && result.body.length > 0;
          results.push({
            proxy: entry.label,
            ok,
            status: result.status,
            ms: Date.now() - started,
            error: ok ? "" : "HTTP " + result.status,
          });
        } catch (error) {
          results.push({
            proxy: entry.label,
            ok: false,
            status: 0,
            ms: Date.now() - started,
            error: String(error && error.message ? error.message : error),
          });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
    return {
      ok: true,
      tested: results.length,
      working: results.filter((entry) => entry.ok).length,
      failed: results.filter((entry) => !entry.ok).length,
      results: results.sort((a, b) => Number(b.ok) - Number(a.ok) || a.ms - b.ms),
      unavailable: list.length > limit ? list.length - limit : 0,
    };
  }
}

export const proxyPool = new ProxyPool();

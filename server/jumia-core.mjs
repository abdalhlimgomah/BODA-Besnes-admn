/**
 * Jumia Egypt scraper core (dependency-free, Node 18+ / Vercel compatible).
 *
 * Used by:
 *   - server/jumia-server.mjs              (local dashboard server)
 *   - api/jumia/*.js in the storefront     (Vercel functions)
 *
 * It deliberately avoids DOM libraries: Jumia's markup changes often, so the
 * parser combines JSON-LD, microdata/meta tags and several HTML fallbacks.
 * Every field is optional — callers must handle empty strings / empty arrays.
 *
 * IMPORTANT: keep this file and `موقع الخاص بك/api/_lib/jumia.js` identical.
 */

import { gunzipSync } from "node:zlib";
import { fetchThroughProxy, proxyPool } from "./jumia-proxy.mjs";

export const JUMIA_ORIGIN = "https://www.jumia.com.eg";
export const JUMIA_VERSION = "1.0.0";

export const JUMIA_DEFAULT_SOURCES = [
  "https://www.jumia.com.eg/ar/phones-tablets/",
  "https://www.jumia.com.eg/ar/electronics/",
  "https://www.jumia.com.eg/ar/home-kitchen/",
  "https://www.jumia.com.eg/ar/health-beauty/",
  "https://www.jumia.com.eg/ar/fashion/",
  "https://www.jumia.com.eg/ar/baby-products/",
  "https://www.jumia.com.eg/ar/sporting-goods/",
  "https://www.jumia.com.eg/ar/computing/",
  "https://www.jumia.com.eg/ar/appliances/",
  "https://www.jumia.com.eg/ar/games/",
  "https://www.jumia.com.eg/ar/automotive/",
  "https://www.jumia.com.eg/ar/supermarket/",
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ar-EG,ar;q=0.9,en-EG;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Upgrade-Insecure-Requests": "1",
  Referer: JUMIA_ORIGIN + "/",
};

// A pool mixes exit IPs; matching every request to the same hard-coded UA is
// an easy fingerprint. Rotate between a few current desktop/mobile strings.
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
];

function requestHeaders(options) {
  const opts = options || {};
  const headers = Object.assign({}, BROWSER_HEADERS);
  if (opts.rotateUserAgent) {
    headers["User-Agent"] = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    headers["Accept-Language"] = Math.random() > 0.5
      ? "ar-EG,ar;q=0.9,en-EG;q=0.8,en;q=0.7"
      : "en-EG,en;q=0.9,ar;q=0.8";
    headers["Sec-CH-UA-Mobile"] = /Mobile|Android|iPhone/.test(headers["User-Agent"]) ? "?1" : "?0";
    headers["Sec-CH-UA-Platform"] = /Windows/.test(headers["User-Agent"])
      ? '"Windows"'
      : /Macintosh/.test(headers["User-Agent"])
        ? '"macOS"'
        : /Android/.test(headers["User-Agent"])
          ? '"Android"'
          : /iPhone|iPad/.test(headers["User-Agent"])
            ? '"iOS"'
            : '"Linux"';
  }
  return headers;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function decodeEntities(input) {
  return String(input == null ? "" : input)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&hellip;/gi, "…")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => safeFromCodePoint(Number(dec)));
}

function safeFromCodePoint(code) {
  try {
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  } catch (_error) {
    return "";
  }
}

export function stripTags(html) {
  const source = String(html == null ? "" : html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|table|ul|ol|dt|dd|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(source)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\ufffd/g, "")
    .trim();
}

export function cleanText(value, maxLength) {
  const text = stripTags(String(value == null ? "" : value)).replace(/\s+/g, " ").trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim();
}

export function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value == null ? "" : value);
  text = text.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
  text = text.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  text = text.replace(/[^\d.,-]/g, "");
  if (!text) return 0;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // 1,234 => thousands; 12,5 => decimal
    const parts = text.split(",");
    text = parts.length === 2 && parts[1].length <= 2 ? parts.join(".") : parts.join("");
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : 0;
}

export function firstMatch(text, regex) {
  const match = regex.exec(String(text == null ? "" : text));
  return match ? match[1] || match[0] : "";
}

export function allMatches(text, regex) {
  const out = [];
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    out.push(match);
    if (out.length > 5000) break;
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

function takeSection(text, startMarkers, endMarkers, maxLength) {
  const source = String(text == null ? "" : text);
  let start = -1;
  let startLength = 0;
  for (const marker of startMarkers) {
    const index = source.indexOf(marker);
    if (index !== -1 && (start === -1 || index < start)) {
      start = index;
      startLength = marker.length;
    }
  }
  if (start === -1) return "";
  start += startLength;
  let end = Math.min(source.length, start + (maxLength || 4000));
  for (const marker of endMarkers || []) {
    const index = source.indexOf(marker, start);
    if (index !== -1 && index < end) end = index;
  }
  return source.slice(start, end).trim();
}

function linesOf(text, options) {
  const opts = options || {};
  const min = opts.min || 1;
  const max = opts.max || 600;
  const seen = new Set();
  const out = [];
  String(text == null ? "" : text)
    .split("\n")
    .map((line) => line.replace(/^[-•*·\u2022\s]+/, "").replace(/\s+/g, " ").trim())
    .forEach((line) => {
      if (line.length < min || line.length > max) return;
      const key = line.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(line);
    });
  return out;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function absoluteJumiaUrl(href, baseUrl) {
  const raw = decodeEntities(String(href == null ? "" : href)).trim();
  if (!raw || /^(javascript:|mailto:|tel:|data:)/i.test(raw)) return "";
  try {
    const base = baseUrl && /^https?:\/\//i.test(baseUrl) ? baseUrl : JUMIA_ORIGIN + "/";
    const url = new URL(raw, base);
    if (!/jumia\.com\.eg$/i.test(url.hostname) && url.hostname !== "www.jumia.com.eg") {
      // Keep Jumia CDN / affiliate hosts out of navigation links.
      if (!/jumia\.is$/i.test(url.hostname)) return url.toString();
    }
    url.hash = "";
    return url.toString();
  } catch (_error) {
    return "";
  }
}

export function isProductUrl(value) {
  const url = String(value == null ? "" : value);
  return /\/[^/?#]+-\d{5,}\.html/i.test(url) || /\/product\/\d{5,}/i.test(url);
}

export function numericIdFromUrl(value) {
  const url = String(value == null ? "" : value);
  const match =
    url.match(/-(\d{5,})\.html/i) ||
    url.match(/\/product\/(\d{5,})/i) ||
    url.match(/\/(\d{6,})(?:[/?#]|$)/);
  return match ? match[1] : "";
}

export function skuFromUrl(value) {
  // Some affiliate links carry the real SKU in a query parameter.
  const url = String(value == null ? "" : value);
  const match = url.match(/[?&](?:sku|SKU)=([A-Z0-9]{6,})/);
  return match ? match[1] : "";
}

export function withPageNumber(value, page) {
  try {
    const url = new URL(String(value));
    if (Number(page) > 1) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    return url.toString();
  } catch (_error) {
    return String(value || "");
  }
}

export function canonicalProductUrl(value) {
  const url = absoluteJumiaUrl(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch (_error) {
    return url;
  }
}

export function normalizeImageUrl(value) {
  let url = decodeEntities(String(value == null ? "" : value)).trim();
  if (!url) return "";
  if (url.startsWith("//")) url = "https:" + url;
  if (!/^https?:\/\//i.test(url)) return "";
  if (/\.(svg|gif)(\?|$)/i.test(url)) return "";
  return url;
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

export function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    let raw = match[1]
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch (_error) {
      try {
        blocks.push(JSON.parse(raw.replace(/,\s*([}\]])/g, "$1")));
      } catch (_error2) {
        // Ignore malformed LD blocks.
      }
    }
  }
  const flat = [];
  const walk = (value, depth) => {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => walk(entry, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    flat.push(value);
    if (value["@graph"]) walk(value["@graph"], depth + 1);
  };
  blocks.forEach((block) => walk(block, 0));
  return flat;
}

function ldTypes(entry) {
  const type = entry && entry["@type"];
  if (Array.isArray(type)) return type.map((t) => String(t).toLowerCase());
  return type ? [String(type).toLowerCase()] : [];
}

function findLd(entries, wanted) {
  const needle = String(wanted).toLowerCase();
  return entries.find((entry) => ldTypes(entry).some((type) => type.indexOf(needle) !== -1)) || null;
}

function ldImageList(value) {
  const out = [];
  const push = (entry) => {
    if (!entry) return;
    if (typeof entry === "string") {
      const url = normalizeImageUrl(entry);
      if (url) out.push(url);
    } else if (Array.isArray(entry)) {
      entry.forEach(push);
    } else if (typeof entry === "object") {
      push(entry.url || entry.contentUrl || entry["@id"]);
    }
  };
  push(value);
  return out;
}

// ---------------------------------------------------------------------------
// Listing pages
// ---------------------------------------------------------------------------

function cardBlock(html, anchorIndex) {
  const open = html.lastIndexOf("<article", anchorIndex);
  if (open !== -1 && anchorIndex - open <= 40000) {
    const close = html.indexOf("</article>", anchorIndex);
    if (close !== -1 && close - open <= 60000) return html.slice(open, close + 10);
  }
  return html.slice(Math.max(0, anchorIndex - 800), anchorIndex + 8000);
}

function cardName(block, url) {
  const h3 =
    firstMatch(block, /<h3[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i) ||
    firstMatch(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
  const name = cleanText(h3, 400);
  if (name) return name;
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(slug.replace(/-\d+\.html?$/i, "").replace(/[-_]+/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  } catch (_error) {
    return "";
  }
}

function cardPrice(block) {
  const priceHtml =
    firstMatch(block, /<div[^>]*class=["'][^"']*\b(?:prc|-prc)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    firstMatch(block, /<span[^>]*class=["'][^"']*\b(?:prc|-prc)\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  let priceText = cleanText(priceHtml, 300);
  if (!priceText) {
    const blockText = stripTags(block);
    const moneyLines = blockText.split("\n").filter((line) => /جنيه|ج\.م|EGP/i.test(line));
    priceText = moneyLines.slice(0, 2).join(" ");
  }
  const numbers = allMatches(priceText, /(\d[\d.,]*)/)
    .map((match) => toNumber(match[1]))
    .filter((value) => value > 0);
  const price = numbers[0] || 0;
  const old = numbers.slice(1).find((value) => value > price) || 0;
  return { price, original_price: old };
}

function cardRating(block) {
  const fill =
    firstMatch(block, /class=["'][^"']*\bfill\b[^"']*["'][^>]*style=["'][^"']*width\s*:\s*([\d.]+)%/i) ||
    firstMatch(block, /style=["'][^"']*width\s*:\s*([\d.]+)%[^"']*["'][^>]*class=["'][^"']*\bfill\b/i);
  const rating = fill ? Math.min(5, Math.round((Number(fill) / 20) * 10) / 10) : 0;
  const countText =
    firstMatch(block, /class=["'][^"']*\brev-total\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ||
    firstMatch(block, /\(([\d,]+)\s*(?:تقييم|review)/i);
  const reviews = Math.round(toNumber(cleanText(countText, 40)));
  return { rating, reviews };
}

function cardImage(block) {
  const imgTag =
    firstMatch(block, /<img[^>]*class=["'][^"']*\bimg\b[^"']*["'][^>]*>/i) ||
    firstMatch(block, /<img\b[^>]*>/i);
  if (!imgTag) return "";
  const attrs = ["data-src", "data-image", "src"];
  for (const attr of attrs) {
    const value = firstMatch(imgTag, new RegExp(attr + '=["\']([^"\']+)["\']', "i"));
    if (value) {
      const url = normalizeImageUrl(value);
      if (url) return url;
    }
  }
  return "";
}

/**
 * Extracts product cards from any Jumia listing / section HTML.
 * Returns { products, pages, total, next_page }.
 */
export function parseListing(html, pageUrl) {
  const source = String(html == null ? "" : html);
  const base = pageUrl || JUMIA_ORIGIN;
  const products = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"']*-\d{5,}\.html(?:[?#][^"']*)?)["'][^>]*>/gi;
  let match;
  while ((match = anchorRe.exec(source)) !== null) {
    const url = canonicalProductUrl(absoluteJumiaUrl(match[1], base));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const block = cardBlock(source, match.index);
    const name = cardName(block, url);
    if (!name || name.length < 3) continue;
    const prices = cardPrice(block);
    const rating = cardRating(block);
    const image = cardImage(block);
    products.push({
      url,
      numeric_id: numericIdFromUrl(url),
      name,
      price: prices.price,
      original_price: prices.original_price,
      image,
      rating: rating.rating,
      reviews: rating.reviews,
      brand: cleanText(
        firstMatch(block, /data-gtm-brand=["']([^"']+)["']/i) ||
          firstMatch(block, /class=["'][^"']*\bbrand\b[^"']*["'][^>]*>([\s\S]*?)<\//i),
        80
      ),
    });
  }

  const text = stripTags(source);
  const linkSource = source.replace(/&amp;/gi, "&");
  let pages = 1;
  allMatches(linkSource, /[?&]page=(\d+)/gi).forEach((entry) => {
    pages = Math.max(pages, Math.min(200, Number(entry[1]) || 1));
  });
  allMatches(text, /صفحة\s*(\d+)/g).forEach((entry) => {
    pages = Math.max(pages, Math.min(200, Number(entry[1]) || 1));
  });

  const totalMatch = text.match(/(\d[\d,.]*)\s*(?:منتج|نتيجة|products?|results?)/i);
  const total = totalMatch ? Math.round(toNumber(totalMatch[1])) : 0;
  let currentPage = 1;
  try {
    currentPage = Number(new URL(pageUrl).searchParams.get("page")) || 1;
  } catch (_error) {
    currentPage = 1;
  }

  return {
    kind: "listing",
    url: pageUrl || "",
    products,
    pages,
    page: currentPage,
    next_page: currentPage < pages ? withPageNumber(pageUrl, currentPage + 1) : "",
    total,
    title: cleanText(firstMatch(source, /<h1[^>]*>([\s\S]*?)<\/h1>/i), 200),
  };
}

// ---------------------------------------------------------------------------
// Product page
// ---------------------------------------------------------------------------

const SPEC_BLACKLIST = [
  "السعر",
  "الاجمالي",
  "الإجمالي",
  "الشحن",
  "التوصيل",
  "الكمية",
  "سلة التسوق",
  "اضف للسلة",
  "أضف للسلة",
  "اشتري",
  "تقييم",
  "المنتج",
];

function parseSpecPairsFromTables(html) {
  const rows = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let table;
  while ((table = tableRe.exec(html)) !== null) {
    const tableHtml = table[1];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let row;
    while ((row = rowRe.exec(tableHtml)) !== null) {
      const cells = allMatches(row[1], /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi).map((entry) =>
        cleanText(entry[1], 500)
      );
      if (cells.length < 2) continue;
      const label = cells[0];
      const value = cells.slice(1).join(" ").trim();
      if (!label || !value) continue;
      if (label.length > 80 || value.length > 500) continue;
      if (SPEC_BLACKLIST.some((word) => label === word || label.indexOf(word) === 0)) continue;
      rows.push({ label, value });
    }
    if (rows.length >= 80) break;
  }
  return rows;
}

/**
 * Jumia renders the spec table as:
 *   <li class="-pvxs"><span class="-b">SKU</span>: EA429EA2FA9BVNAFAMZ</li>
 * This is the most reliable spec source on the page.
 */
function parseSpecPairsFromListItems(html) {
  const rows = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let entry;
  while ((entry = liRe.exec(html)) !== null) {
    const body = entry[1];
    const labelSpan = body.match(/<span[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/span>/i);
    if (!labelSpan) continue;
    const classes = labelSpan[1].split(/\s+/).filter(Boolean);
    if (classes.indexOf("-b") === -1) continue;
    const label = cleanText(labelSpan[2], 90).replace(/[:：]\s*$/, "");
    if (!label) continue;
    const value = cleanText(body.replace(labelSpan[0], ""), 500).replace(/^[:：\s]+/, "");
    if (!value) continue;
    if (SPEC_BLACKLIST.some((word) => label === word || label.indexOf(word) === 0)) continue;
    rows.push({ label, value });
    if (rows.length >= 80) break;
  }
  return rows;
}

function parseSpecPairsFromText(text) {
  const rows = [];
  const knownLabels = [
    "SKU",
    "اللون",
    "العلامة التجارية",
    "الماركة",
    "الموديل",
    "النوع",
    "الخامة",
    "الوزن",
    "الأبعاد",
    "الضمان",
    "بلد المنشأ",
    "السعة",
    "الحجم",
    "المقاس",
    "المناسبة",
    "الاستخدام",
    "الطاقة",
    "الشاشة",
    "الكاميرا",
    "الذاكرة",
    "المعالج",
    "نظام التشغيل",
    "الاتصال",
    "البطارية",
  ];
  const lines = String(text || "").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || line.length > 320) continue;
    const match = line.match(/^([^:：]{2,50})\s*[:：]\s*(.+)$/);
    if (!match) continue;
    const label = match[1].trim().replace(/^[-•*\s]+/, "");
    const value = match[2].trim();
    if (!label || !value) continue;
    if (value.length > 400) continue;
    // Only trust well-known spec labels here; free-form "Title: sentence"
    // lines in the marketing description are highlights, not specs.
    if (!knownLabels.some((known) => label.toLowerCase().indexOf(known.toLowerCase()) !== -1)) {
      continue;
    }
    if (SPEC_BLACKLIST.some((word) => label === word)) continue;
    rows.push({ label, value });
  }
  return rows;
}

function dedupeSpecs(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row || !row.label) continue;
    const label = cleanText(row.label, 90);
    const value = cleanText(row.value, 500);
    if (!label || !value) continue;
    const key = label.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, value });
  }
  return out;
}

function parseSeller(text, html, productLd) {
  const offers = normalizedOffers(productLd);
  const ldSeller = offers && offers.seller;
  const seller = {
    name: "",
    url: "",
    rating: 0,
    followers: 0,
    performance: [],
    verified: false,
  };
  if (ldSeller) {
    seller.name = cleanText(typeof ldSeller === "string" ? ldSeller : ldSeller.name, 120);
    const ldUrl = typeof ldSeller === "object" ? ldSeller.url || ldSeller["@id"] : "";
    seller.url = absoluteJumiaUrl(ldUrl);
  }

  if (!seller.name) {
    const link = html.match(
      /<a\b[^>]*href=["']([^"']*\/(?:ar\/)?seller\/[^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/i
    );
    if (link) {
      seller.url = absoluteJumiaUrl(link[1]);
      seller.name = cleanText(link[2], 120);
    }
  }

  const sellerSection = takeSection(
    text,
    ["بيانات البائع", "Seller information", "Seller details"],
    ["أداء البائع", "مواصفات المنتج", "Product details", "منتجات ذات صلة", "آراء العملاء"],
    1200
  );
  if (!seller.name && sellerSection) {
    const firstLine = linesOf(sellerSection, { min: 2, max: 120 })[0];
    if (firstLine && !/تقييم|متابع|تابع/.test(firstLine)) seller.name = firstLine;
  }

  const ratingMatch =
    sellerSection.match(/(\d{1,3})\s*%\s*(?:تقييم البائع|Seller rating|positive)/i) ||
    text.match(/(\d{1,3})\s*%\s*تقييم البائع/i);
  if (ratingMatch) seller.rating = Math.min(100, Number(ratingMatch[1]) || 0);

  const followersMatch =
    sellerSection.match(/([\d,.]+)\s*(?:المتابعين|متابع|followers?)/i) ||
    text.match(/([\d,.]+)\s*(?:المتابعين|followers?)/i);
  if (followersMatch) seller.followers = Math.round(toNumber(followersMatch[1]));

  const performanceSection = takeSection(
    text,
    ["أداء البائع", "Seller performance"],
    ["مواصفات المنتج", "Product details", "منتجات ذات صلة"],
    1200
  );
  const perfSource = performanceSection || sellerSection;
  const perfDefs = [
    ["delivery_speed", "معدل سرعه توصيل الطلب", /معدل سرعه توصيل الطلب|سرعة توصيل الطلب|delivery speed/i],
    ["quality", "تقييم الجودة", /تقييم الجودة|quality/i],
    ["customer", "تقييم العملاء", /تقييم العملاء|customer/i],
    ["cancellation", "معدل الإلغاء", /معدل الإلغاء|cancellation/i],
  ];
  for (const [key, label, regex] of perfDefs) {
    const match = perfSource.match(regex);
    if (!match) continue;
    const after = perfSource.slice(match.index, match.index + 120);
    const valueMatch = after.match(
      /(ممتاز|جيد جدا|جيد|متوسط|ضعيف|excellent|very good|good|average|poor)/i
    );
    if (!valueMatch) continue;
    seller.performance.push({ key, label, value: valueMatch[1] });
  }
  if (seller.performance.length) seller.verified = true;
  return seller;
}

function normalizedOffers(productLd) {
  if (!productLd) return null;
  const offers = productLd.offers;
  if (!offers) return null;
  if (Array.isArray(offers)) return offers[0] || null;
  return offers;
}

function parseRatingBreakdown(text) {
  const section = takeSection(
    text,
    ["آراء العملاء", "تقييمات العملاء", "Customer reviews", "Ratings"],
    ["تعلييقات المنتج", "تعليقات المنتج", "نتائج مشابهة", "منتجات ذات صلة", "التوصيل"],
    2500
  );
  const source = section || text;
  const breakdown = { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };
  let found = false;
  const re = /(?:^|\n)\s*([1-5])\s*[\(\[]\s*([\d,]+)\s*[\)\]]/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    breakdown[match[1]] = Math.round(toNumber(match[2]));
    found = true;
  }
  return found ? breakdown : null;
}

function parseDelivery(text) {
  const delivery = {
    lines: [],
    free_shipping_text: "",
    pickup_lines: [],
    home_lines: [],
    shipping_fee: 0,
    free_over: 0,
    return_policy: "",
    warranty: "",
    eta_text: "",
  };
  const section = takeSection(
    text,
    ["التوصيل والارجاع", "التوصيل والإرجاع", "Delivery & returns", "Delivery and returns"],
    ["سياسة الارجاع", "سياسة الإرجاع", "الضمان", "بيانات البائع", "مواصفات المنتج"],
    1600
  );
  if (section) {
    delivery.lines = linesOf(section, { min: 3, max: 300 }).slice(0, 16);
    delivery.free_shipping_text =
      delivery.lines.find((line) => /شحن مجاني|توصيل مجاني|free shipping/i.test(line)) || "";
    delivery.pickup_lines = delivery.lines.filter((line) => /استلام|محطة|pickup/i.test(line)).slice(0, 5);
    delivery.home_lines = delivery.lines.filter((line) => /توصيل للمنزل|home delivery/i.test(line)).slice(0, 5);
    delivery.eta_text = delivery.lines.find((line) => /جاهز|يصل|التوصيل من|delivery/i.test(line)) || "";
    const fee = section.match(/(?:مصاريف الشحن|رسوم الشحن|shipping fee)\s*[:：]?\s*([\d.,]+)\s*(?:جنيه|EGP)/i);
    if (fee) delivery.shipping_fee = toNumber(fee[1]);
    const freeOver = section.match(/(?:الطلب بـ|أكثر من|over)\s*([\d.,]+)\s*(?:جنيه|EGP)/i);
    if (freeOver) delivery.free_over = toNumber(freeOver[1]);
  }

  const returnSection = takeSection(
    text,
    ["سياسة الارجاع", "سياسة الإرجاع", "Return policy"],
    ["الضمان", "بيانات البائع", "مواصفات المنتج"],
    1200
  );
  if (returnSection) delivery.return_policy = cleanText(returnSection, 1000);

  const warrantySection = takeSection(
    text,
    ["\nالضمان\n", "الضمان"],
    ["بيانات البائع", "مواصفات المنتج", "منتجات ذات صلة"],
    300
  );
  if (warrantySection) {
    const line = linesOf(warrantySection, { min: 1, max: 120 })[0] || "";
    delivery.warranty = /^\d+$/.test(line) ? line + " سنة" : cleanText(line, 160);
  }
  return delivery;
}

function parseRelated(html, pageUrl, currentUrl) {
  const markers = ["منتجات ذات صلة", "شاهد العملاء أيضًا", "منتجات مشابهة", "Similar products"];
  let slice = "";
  for (const marker of markers) {
    const index = html.indexOf(marker);
    if (index === -1) continue;
    slice = html.slice(index, index + 120000);
    break;
  }
  if (!slice) return [];
  const listing = parseListing(slice, pageUrl);
  const current = canonicalProductUrl(currentUrl);
  return (listing.products || [])
    .filter((item) => item.url !== current)
    .slice(0, 12)
    .map((item) => ({
      name: item.name,
      url: item.url,
      image: item.image,
      price: item.price,
      original_price: item.original_price,
      rating: item.rating,
      reviews: item.reviews,
    }));
}

function parseBreadcrumb(entries, html) {
  const list = findLd(entries, "BreadcrumbList");
  const out = [];
  if (list && Array.isArray(list.itemListElement)) {
    list.itemListElement.forEach((item) => {
      const name = cleanText(item && (item.name || (item.item && item.item.name)), 120);
      if (!name) return;
      let url = "";
      if (item && typeof item.item === "string") url = absoluteJumiaUrl(item.item);
      else if (item && item.item && item.item["@id"]) url = absoluteJumiaUrl(item.item["@id"]);
      out.push({ name, url });
    });
  }
  if (!out.length) {
    const nav = firstMatch(html, /<nav[^>]*class=["'][^"']*breadcrumbs?[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i);
    if (nav) {
      allMatches(nav, /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi).forEach((entry) => {
        const name = cleanText(entry[2], 120);
        if (name) out.push({ name, url: absoluteJumiaUrl(entry[1]) });
      });
    }
  }
  return out.slice(0, 8);
}

function parseHighlights(text, html) {
  const section = takeSection(
    text,
    ["المواصفات الرئيسية", "Main specifications", "أبرز المميزات", "Key features"],
    ["المواصفات", "Specifications", "منتجات ذات صلة", "آراء العملاء"],
    5000
  );
  let items = [];
  if (section) {
    items = linesOf(section, { min: 15, max: 320 }).filter(
      (line) => !/^(المواصفات|المواصفات الرئيسية|Specifications)$/i.test(line)
    );
  }
  if (!items.length) {
    allMatches(html, /<li[^>]*>([\s\S]*?)<\/li>/gi).forEach((entry) => {
      const line = cleanText(entry[1], 320);
      if (line.length >= 25 && !/^(الرئيسية|المنتجات|سلة|حسابي|تسجيل)/.test(line)) items.push(line);
    });
  }
  return Array.from(new Set(items)).slice(0, 8);
}

export function parseProduct(html, pageUrl) {
  const source = String(html == null ? "" : html);
  const url = canonicalProductUrl(pageUrl) || pageUrl || "";
  const text = stripTags(source);
  const entries = extractJsonLd(source);
  const productLd = findLd(entries, "product") || {};
  const offers = normalizedOffers(productLd) || {};
  const aggregate = productLd.aggregateRating || {};
  const brandLd = productLd.brand;
  const title =
    cleanText(productLd.name, 500) ||
    cleanText(firstMatch(source, /<h1[^>]*>([\s\S]*?)<\/h1>/i), 500) ||
    cleanText(firstMatch(source, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s*\|.*$/, ""), 500);

  const meta = (property) =>
    cleanText(
      firstMatch(
        source,
        new RegExp(
          '<meta[^>]+(?:property|name)=["\']' +
            property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            '["\'][^>]+content=["\']([^"\']*)["\']',
          "i"
        )
      ) ||
        firstMatch(
          source,
          new RegExp(
            '<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' +
              property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
              '["\']',
            "i"
          )
        ),
      2000
    );

  let price = toNumber(offers.price || (offers.priceSpecification && offers.priceSpecification.price));
  if (!price) {
    const priceBlock =
      firstMatch(
        source,
        /<div[^>]*class=["'][^"']*(?:-pvxs|prc|price)[^"']*["'][^>]*>([\s\S]{0,1200}?)<\/div>/i
      ) || "";
    const fromBlock = allMatches(stripTags(priceBlock), /(\d[\d.,]*)\s*(?:جنيه|ج\.م|EGP)/gi).map((m) =>
      toNumber(m[1])
    );
    price = fromBlock[0] || 0;
  }
  if (!price) {
    const matches = allMatches(text, /(\d[\d.,]{2,})\s*(?:جنيه|ج\.م|EGP)/gi).map((m) => toNumber(m[1]));
    price = matches.filter((value) => value > 0)[0] || 0;
  }

  let originalPrice = 0;
  const del =
    firstMatch(source, /<del[^>]*>([\s\S]*?)<\/del>/i) ||
    firstMatch(
      source,
      /<span[^>]*class=["'][^"']*(?:-old|old-price|oldPrice|price-old)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
    );
  if (del) originalPrice = toNumber(stripTags(del));
  if (originalPrice <= price) {
    const offerPrice = toNumber(offers.highPrice || offers.listPrice);
    if (offerPrice > price) originalPrice = offerPrice;
  }
  if (originalPrice <= price) {
    const nearby = allMatches(text, /(\d[\d.,]{2,})\s*(?:جنيه|ج\.م)/g)
      .map((m) => toNumber(m[1]))
      .filter((value) => value > price && value <= price * 6);
    originalPrice = nearby[0] || price;
  }
  const discountMatch =
    firstMatch(source, /-\s*(\d{1,2})\s*%/) ||
    (originalPrice > price ? String(Math.round(((originalPrice - price) / originalPrice) * 100)) : "");
  const discount = Math.max(0, Math.min(95, Math.round(toNumber(discountMatch))));

  const images = [];
  ldImageList(productLd.image).forEach((urlValue) => images.push(urlValue));
  const ogImage = meta("og:image");
  if (ogImage) {
    const urlValue = normalizeImageUrl(ogImage);
    if (urlValue) images.unshift(urlValue);
  }
  // Only scan the main product area: cards in "related products" sections must
  // not leak into the product gallery.
  const relatedMarkers = ["منتجات ذات صلة", "شاهد العملاء أيضًا", "منتجات مشابهة", "Similar products"];
  let mainEnd = source.length;
  relatedMarkers.forEach((marker) => {
    const index = source.indexOf(marker);
    if (index > 500 && index < mainEnd) mainEnd = index;
  });
  const mainHtml = source.slice(0, mainEnd);
  allMatches(mainHtml, /<img\b[^>]*>/gi).forEach((entry) => {
    const tag = entry[0];
    if (!/jumia\.is|cdn|product\//i.test(tag)) return;
    const value =
      firstMatch(tag, /data-zoom-image=["']([^"']+)["']/i) ||
      firstMatch(tag, /data-large-image=["']([^"']+)["']/i) ||
      firstMatch(tag, /data-src=["']([^"']+)["']/i) ||
      firstMatch(tag, /src=["']([^"']+)["']/i);
    const urlValue = normalizeImageUrl(value);
    if (urlValue) images.push(urlValue);
  });
  const imageKey = (value) => {
    try {
      const parsed = new URL(value);
      return parsed.pathname
        .replace(/fit-in\/[\d.]+x[\d.]+/gi, "fit-in")
        .replace(/\/[\d.]+x[\d.]+\//g, "/")
        .toLowerCase();
    } catch (_error) {
      return String(value).toLowerCase();
    }
  };
  const seenImageKeys = new Set();
  const uniqueImages = images.filter((value) => {
    if (/logo|sprite|icon|flag|placeholder|avatar/i.test(value)) return false;
    const key = imageKey(value);
    if (seenImageKeys.has(key)) return false;
    seenImageKeys.add(key);
    return true;
  });
  // Jumia injects CMS banners (BF-2026, StickyBanner, ...) into the gallery
  // markup. Real product photos always live under `/product/`.
  const productImages = uniqueImages.filter((value) => /\/product\//i.test(value));
  const galleryImages = productImages.length ? productImages : uniqueImages;

  let sku =
    cleanText(productLd.sku, 80) ||
    cleanText(productLd.mpn, 80) ||
    cleanText(productLd.gtin13, 80) ||
    skuFromUrl(url);

  const listSpecs = parseSpecPairsFromListItems(source);
  const tableSpecs = parseSpecPairsFromTables(source);
  const specsRegion = takeSection(
    text,
    ["مواصفات المنتج", "المواصفات", "Specifications", "Product details"],
    ["منتجات ذات صلة", "شاهد العملاء أيضًا", "آراء العملاء", "الضمان", "بيانات البائع"],
    8000
  );
  const textSpecs = parseSpecPairsFromText(specsRegion);
  // Sellers sometimes put "الماركة: ..." or "Brand: ..." inside the marketing
  // description instead of the spec table.
  const descriptionStart = source.indexOf('id="description"');
  const descriptionEnd = source.indexOf('id="specifications"');
  const descriptionHtml =
    descriptionStart !== -1
      ? source.slice(
          descriptionStart,
          descriptionEnd > descriptionStart ? descriptionEnd : descriptionStart + 30000
        )
      : "";
  const descriptionSpecs = parseSpecPairsFromText(stripTags(descriptionHtml));
  let specs = dedupeSpecs(listSpecs.concat(tableSpecs, textSpecs, descriptionSpecs));

  if (!sku) {
    const skuRow = specs.find((row) => /^sku$/i.test(row.label) || /رمز المنتج|product code/i.test(row.label));
    if (skuRow) sku = cleanText(skuRow.value, 80);
  }
  if (!sku) {
    const skuMatch = text.match(/SKU\s*[:：]?\s*([A-Z0-9][A-Z0-9._-]{5,})/);
    if (skuMatch) sku = skuMatch[1];
  }
  if (sku && !specs.some((row) => /^sku$/i.test(row.label))) {
    specs.unshift({ label: "SKU", value: sku });
  }

  const colorRow = specs.find((row) => /^(اللون|color)$/i.test(row.label));
  const brand =
    cleanText(typeof brandLd === "string" ? brandLd : brandLd && brandLd.name, 120) ||
    cleanText(meta("product:brand"), 120) ||
    (specs.find((row) => /العلامة التجارية|الماركة|brand/i.test(row.label)) || {}).value ||
    "";

  const breadcrumb = parseBreadcrumb(entries, source);
  const breadcrumbNames = breadcrumb.map((item) => item.name).filter(Boolean);
  const category =
    (breadcrumbNames.length >= 2 ? breadcrumbNames[breadcrumbNames.length - 2] : "") ||
    cleanText(productLd.category, 120) ||
    (specs.find((row) => /^(الفئة|القسم|category)$/i.test(row.label)) || {}).value ||
    "منتجات جوميا";

  const description =
    cleanText(productLd.description, 6000) ||
    cleanText(meta("og:description"), 3000) ||
    cleanText(
      takeSection(
        text,
        ["مواصفات المنتج"],
        ["المواصفات", "Specifications", "منتجات ذات صلة"],
        3000
      ),
      3000
    );

  const ratingFromLd = toNumber(aggregate.ratingValue);
  const ratingFromText = toNumber(
    firstMatch(text, /(\d(?:[.,]\d)?)\s*(?:out of 5|من\s*5|\/\s*5)/i)
  );
  const rating = Math.min(5, ratingFromLd || ratingFromText || 0);
  const reviewsFromLd = Math.round(toNumber(aggregate.reviewCount || aggregate.ratingCount));
  const reviewsFromText = Math.round(
    toNumber(
      firstMatch(text, /([\d,]+)\s*(?:تقييمات|تقييم موثق|تقييم|reviews?|ratings?)/i)
    )
  );
  const reviewCount = reviewsFromLd || reviewsFromText || 0;

  const availability = String(offers.availability || "").toLowerCase();
  const stockText = cleanText(
    firstMatch(text, /(Few units left|Only \d+ left|باقي\s*\d+\s*(?:قطع|وحدة)|غير متوفر|نفدت الكمية|Out of stock|In stock)/i),
    120
  );
  let stockStatus = "in_stock";
  if (/outofstock|out of stock|نفد|غير متوفر/i.test(availability + " " + stockText)) {
    stockStatus = "out_of_stock";
  } else if (/few units|باقي|only \d+ left/i.test(stockText)) {
    stockStatus = "low_stock";
  }

  const seller = parseSeller(text, source, productLd);
  const delivery = parseDelivery(text);
  const highlights = parseHighlights(text, source);
  const ratingBreakdown = parseRatingBreakdown(text);
  const related = parseRelated(source, url, url);
  const reviewsSnippet = cleanText(
    takeSection(
      text,
      ["تعلييقات المنتج", "تعليقات المنتج", "Customer comments"],
      ["نتائج مشابهة", "منتجات ذات صلة", "شاهد العملاء أيضًا", "التوصيل"],
      600
    ),
    500
  );

  const warnings = [];
  if (!title) warnings.push("لم يتم العثور على اسم المنتج");
  if (!(price > 0)) warnings.push("لم يتم العثور على السعر");
  if (!galleryImages.length) warnings.push("لم يتم العثور على صور");
  if (!specs.length) warnings.push("لم يتم العثور على مواصفات");
  if (!seller.name) warnings.push("لم يتم العثور على اسم البائع");

  return {
    ok: Boolean(title),
    source: "jumia",
    url,
    numeric_id: numericIdFromUrl(url),
    sku,
    name: title,
    brand,
    category,
    breadcrumb,
    price,
    original_price: originalPrice > price ? originalPrice : price,
    discount_percent: discount,
    currency: cleanText(offers.priceCurrency, 12) || "EGP",
    image: galleryImages[0] || "",
    images: galleryImages.slice(0, 20),
    description,
    highlights,
    specs,
    rating: Math.round(rating * 10) / 10,
    reviews_count: reviewCount,
    rating_breakdown: ratingBreakdown,
    seller,
    delivery,
    stock_status: stockStatus,
    stock_text: stockText,
    color: colorRow ? colorRow.value : "",
    warranty: delivery.warranty,
    return_policy: delivery.return_policy,
    related,
    reviews_snippet: reviewsSnippet,
    fetched_at: new Date().toISOString(),
    warnings,
    page_title: cleanText(firstMatch(source, /<title[^>]*>([\s\S]*?)<\/title>/i), 300),
  };
}

// ---------------------------------------------------------------------------
// Sitemaps
// ---------------------------------------------------------------------------

export function parseSitemap(xml) {
  const source = String(xml == null ? "" : xml);
  const urls = [];
  const sitemaps = [];
  const locRe = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let match;
  while ((match = locRe.exec(source)) !== null) {
    const url = decodeEntities(match[1]).trim();
    if (!url) continue;
    if (/\.xml(\.gz)?(?:\?|$)/i.test(url)) sitemaps.push(url);
    else urls.push(url);
  }
  return {
    kind: "sitemap",
    urls,
    sitemaps,
    is_index: sitemaps.length > 0 && urls.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

function detectBlocked(status, html) {
  const text = String(html || "").slice(0, 200000);
  if (status === 401 || status === 403 || status === 429) return true;
  if (status >= 500 && /captcha|cloudflare|access denied|just a moment/i.test(text)) return true;
  const title = (text.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1] || "";
  if (/access denied|just a moment|attention required|are you a robot|طلبك ليس آلي/i.test(title)) {
    return true;
  }
  return (
    text.length < 150000 &&
    /are you a robot|unusual traffic|cf-challenge|just a moment\.\.\./i.test(text)
  );
}

/**
 * Static sitemaps are served as raw gzip files (`*.xml.gz`) without a
 * `Content-Encoding` header, so `response.text()` would decode the binary
 * stream as UTF-8 and the `<loc>` tags would be unreadable. Detect the gzip
 * magic bytes and inflate when needed.
 */
function decodeResponseBody(buffer) {
  const bytes = Buffer.from(buffer);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      return gunzipSync(bytes).toString("utf8");
    } catch (_error) {
      // Fall through: some CDNs return a gzip stream that Node already
      // decompressed, leaving a short text body.
    }
  }
  return bytes.toString("utf8");
}

async function fetchOnce(url, timeoutMs, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 25000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers || BROWSER_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    const html = decodeResponseBody(await response.arrayBuffer());
    return { status: response.status, html, finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

const PROXY_TEMPLATES = [
  (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  (url) => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(url),
];

/**
 * Fetches a Jumia page.
 *
 * `proxyMode: "pool"` uses the configured proxy pool first (one proxy per
 * request, retried on a different proxy). Without it, the historical behavior
 * stays: direct first, then the two public CORS proxies.
 */
export async function fetchJumia(url, options) {
  const opts = options || {};
  const timeoutMs = Math.max(5000, Math.min(60000, Number(opts.timeoutMs) || 25000));
  const allowProxy = opts.allowProxy !== undefined ? opts.allowProxy : process.env.JUMIA_ALLOW_PROXY !== "false";
  const attempts = [];
  const maxAttempts = Math.max(1, Math.min(4, Number(opts.retries) || 2));
  const poolMode = String(opts.proxyMode || "").toLowerCase() === "pool";
  const usePool = poolMode && proxyPool.size > 0;

  if (usePool) {
    const poolAttempts = Math.max(
      1,
      Math.min(10, Number(opts.poolAttempts) || Math.min(6, maxAttempts + 3))
    );
    for (let attempt = 1; attempt <= poolAttempts; attempt += 1) {
      const entry = await proxyPool.acquireWait({
        timeoutMs: Math.min(90000, Math.max(15000, timeoutMs * 2)),
      });
      if (!entry) {
        attempts.push("لا يوجد وسيط شغّال الآن");
        break;
      }
      try {
        const result = await fetchThroughProxy(entry, url, {
          timeoutMs,
          headers: requestHeaders({ rotateUserAgent: true }),
        });
        const html = decodeResponseBody(result.body);
        const blocked = detectBlocked(result.status, html);
        const ok =
          result.status >= 200 &&
          result.status < 300 &&
          html &&
          html.length > 500 &&
          !blocked;
        proxyPool.release(entry, {
          ok,
          status: result.status,
          error: ok ? "" : blocked ? "حظر" : "HTTP " + result.status,
        });
        if (ok) {
          return {
            ...result,
            html,
            via: "proxy",
            proxy: entry.label,
            blocked: false,
          };
        }
        attempts.push(
          "وسيط " + entry.label + " HTTP " + result.status + (blocked ? " (حظر)" : "")
        );
      } catch (error) {
        proxyPool.release(entry, {
          ok: false,
          error: error && error.name === "AbortError" ? "timeout" : String(error && error.message),
        });
        attempts.push(
          "وسيط " + entry.label + " " +
            (error && error.name === "AbortError" ? "timeout" : String(error && error.message))
        );
      }
    }
    if (opts.allowFallback === false) {
      const error = new Error("تعذر الوصول إلى جوميا عبر الوسائط: " + attempts.join(" · "));
      error.attempts = attempts;
      error.blocked = true;
      throw error;
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fetchOnce(url, timeoutMs, requestHeaders({ rotateUserAgent: usePool }));
      if (result.status >= 200 && result.status < 300 && result.html && result.html.length > 500) {
        return {
          ...result,
          via: "direct",
          blocked: detectBlocked(result.status, result.html),
        };
      }
      attempts.push("HTTP " + result.status);
      if (detectBlocked(result.status, result.html)) break;
    } catch (error) {
      attempts.push(error && error.name === "AbortError" ? "timeout" : String(error && error.message));
    }
    if (attempt < maxAttempts) await sleep(900 * attempt);
  }

  if (allowProxy) {
    for (const template of PROXY_TEMPLATES) {
      try {
        const proxied = template(url);
        const result = await fetchOnce(proxied, Math.max(timeoutMs, 30000));
        if (result.status >= 200 && result.status < 300 && result.html && result.html.length > 500) {
          return {
            ...result,
            finalUrl: url,
            via: "proxy",
            blocked: detectBlocked(result.status, result.html),
          };
        }
        attempts.push("proxy HTTP " + result.status);
      } catch (error) {
        attempts.push("proxy " + (error && error.name === "AbortError" ? "timeout" : String(error && error.message)));
      }
    }
  }

  const error = new Error("تعذر الوصول إلى جوميا: " + (attempts.join(" · ") || "خطأ غير معروف"));
  error.attempts = attempts;
  throw error;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// High-level helpers
// ---------------------------------------------------------------------------

export async function discoverListing(url, options) {
  const opts = options || {};
  const absolute = absoluteJumiaUrl(url);
  if (!absolute) throw new Error("رابط غير صالح");
  const fetched = await fetchJumia(absolute, opts);
  if (fetched.blocked) {
    const error = new Error("جوميا رفضت الطلب (حماية من السحب). شغّل السيرفر المحلي وحاول مرة أخرى.");
    error.blocked = true;
    throw error;
  }
  const listing = parseListing(fetched.html, absolute);
  return { ...listing, via: fetched.via, status: fetched.status };
}

export async function discoverSitemap(url, options) {
  const absolute = absoluteJumiaUrl(url) || String(url || "");
  const fetched = await fetchJumia(absolute, options);
  if (fetched.blocked) {
    const error = new Error("جوميا رفضت طلب خريطة الموقع.");
    error.blocked = true;
    throw error;
  }
  const parsed = parseSitemap(fetched.html);
  return { ...parsed, url: absolute, via: fetched.via };
}

export async function fetchJumiaProduct(url, options) {
  const absolute = absoluteJumiaUrl(url);
  if (!absolute) throw new Error("رابط منتج غير صالح");
  const fetched = await fetchJumia(absolute, options);
  if (fetched.blocked) {
    const error = new Error("جوميا رفضت طلب صفحة المنتج (حماية من السحب).");
    error.blocked = true;
    throw error;
  }
  const product = parseProduct(fetched.html, absolute);
  return { ...product, via: fetched.via, status: fetched.status };
}

export async function readRobotsSitemaps(options) {
  const fetched = await fetchJumia(JUMIA_ORIGIN + "/robots.txt", options);
  const sitemaps = [];
  String(fetched.html || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (match) sitemaps.push(match[1]);
    });
  return sitemaps;
}

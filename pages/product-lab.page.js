/**
 * Product Lab — sحب/فحص/حفظ منتجات الشركاء.
 *
 * The page is intentionally static: it talks to the public BudoQ catalog
 * endpoint (`/api/catalog`) and writes to the existing `taager_products`
 * table. Jumia rows use `source='jumia'` and store the affiliate URL in
 * `taager_code`, which is how the public catalog already exposes
 * `external_url` for marketplace products. No schema migration needed.
 */
(function () {
  "use strict";

  const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
  const DEFAULT_API_BASE = "https://budoq.com";
  const SETTINGS_KEY = "productLabSettings";
  const PAGE_SIZE = 120;
  const MAX_LIMIT = 12000;
  const CHUNK_SIZE = 100;

  const PLACEHOLDER_IMAGE =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f3f4f6"/><path d="M50 22 76 36v28L50 78 24 64V36z" fill="none" stroke="#94a3b8" stroke-width="3"/><path d="M24 36l26 14 26-14M50 50v28" fill="none" stroke="#94a3b8" stroke-width="3"/></svg>'
    );

  const JUMIA_DESCRIPTION =
    "يُباع هذا المنتج عبر جوميا مصر. السعر والصور والبيانات معروضة من جوميا، " +
    "وإتمام الشراء والدفع والتوصيل يتم من خلال صفحة المنتج على جوميا.";

  const JUMIA_HIGHLIGHTS = [
    "يُباع عبر جوميا مصر",
    "الدفع والتوصيل عبر جوميا",
    "السعر المعروض بالجنيه المصري",
  ];

  const STOP_WORDS = new Set([
    "في", "من", "على", "عن", "مع", "الى", "إلى", "او", "أو", "و", "the",
    "and", "for", "with", "www", "https", "http", "com", "eg", "html", "ar",
  ]);

  const state = {
    products: [],
    selected: new Set(),
    savedIds: new Set(),
    saved: [],
    imported: [],
    byId: new Map(),
    jumiaBySku: new Map(),
    visibleCount: PAGE_SIZE,
    currentSource: "jumia",
    currentCountry: "EG",
    pullInfo: null,
    bulkHidden: false,
    busy: false,
    loadingSaved: false,
    loadedSaved: false,
    fullCatalogFetched: false,
    searchTimer: null,
  };

  const el = {};
  let supabaseClient = null;

  // ---------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function safeNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value == null ? "" : value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function norm(value) {
    return String(value == null ? "" : value)
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ئ/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ة/g, "ه")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanText(value, multiline) {
    let text = String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
    if (!text) return "";
    text = multiline
      ? text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
      : text.replace(/[\u0000-\u001f\u007f]/g, " ");
    return text.replace(/\ufffd/g, "").trim();
  }

  function cleanCategory(value, source) {
    const raw = String(value == null ? "" : value).trim();
    const fallback = source === "jumia" ? "منتجات جوميا" : "منتجات متنوعة";
    if (!raw) return fallback;
    // Early Jumia snapshots were built from a mis-decoded page.
    if (
      !/[\u0600-\u06FF]/.test(raw) &&
      /[UO^�]/.test(raw) &&
      !/^[\x20-\x7e]+$/.test(raw)
    ) {
      return fallback;
    }
    return cleanText(raw) || fallback;
  }

  function hashText(value) {
    let hash = 5381;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }

  function firstUrl(value) {
    if (Array.isArray(value)) return String(value[0] || "").trim();
    return String(value == null ? "" : value).trim();
  }

  function toUrlList(value, fallbackImage) {
    let list = [];
    if (Array.isArray(value)) {
      list = value;
    } else if (typeof value === "string" && value.trim()) {
      const text = value.trim();
      if (text.startsWith("[")) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) list = parsed;
        } catch (_error) {
          // not JSON: fall through to comma/newline splitting
        }
      }
      if (!list.length) list = text.split(/[\n,]+/);
    }
    const seen = new Set();
    const result = [];
    list.concat(fallbackImage ? [fallbackImage] : []).forEach((entry) => {
      const url = String(entry == null ? "" : entry).trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      result.push(url);
    });
    return result;
  }

  function isJumia(product) {
    if (!product) return false;
    return (
      String(product.source || "").toLowerCase() === "jumia" ||
      String(product.id || "").toLowerCase().indexOf("jumia_") === 0
    );
  }

  function inferSource(raw, id, url) {
    const explicit = String(raw.source || raw.supplier || "").trim().toLowerCase();
    if (explicit === "jumia" || explicit === "taager") return explicit;
    if (/^jumia[_-]/i.test(String(id || ""))) return "jumia";
    if (/jumia\.com\.eg|adj\.st/i.test(String(url || ""))) return "jumia";
    return explicit || "taager";
  }

  function discountPercent(product) {
    const price = safeNumber(product.price);
    const original = safeNumber(product.original_price);
    if (original > price && original > 0) {
      return Math.round(((original - price) / original) * 100);
    }
    return 0;
  }

  function currencyFor(product) {
    const countries = Array.isArray(product.available_countries)
      ? product.available_countries
      : [];
    if (isJumia(product)) return "ج.م";
    if (countries.indexOf("SA") !== -1 && countries.indexOf("EG") === -1) return "ر.س";
    if (String(state.currentCountry || "").toUpperCase() === "SA") return "ر.س";
    return "ج.م";
  }

  function money(product) {
    return safeNumber(product.price).toFixed(2) + " " + currencyFor(product);
  }

  function countriesLabel(product) {
    const countries = Array.isArray(product.available_countries)
      ? product.available_countries
      : [];
    if (!countries.length) return "غير محدد";
    return countries
      .map((code) => {
        if (code === "EG") return "مصر";
        if (code === "SA") return "السعودية";
        return String(code || "");
      })
      .join("، ");
  }

  function sourceLabel(product) {
    if (isJumia(product)) return "جوميا مصر";
    const source = String(product.source || "taager");
    if (source === "taager") return "Taager / مورد";
    return source;
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    try {
      return date.toLocaleString("ar-EG-u-nu-latn", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch (_error) {
      return date.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  function formatTime() {
    try {
      return new Date().toLocaleTimeString("ar-EG-u-nu-latn", { hour12: false });
    } catch (_error) {
      return new Date().toISOString().slice(11, 19);
    }
  }

  // ---------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------
  function toast(message, type) {
    if (!el.toasts) return;
    const kind = type || "info";
    const icons = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      info: "fa-circle-info",
    };
    const node = document.createElement("div");
    node.className = "lab-toast " + kind;
    node.innerHTML =
      '<i class="fa-solid ' + (icons[kind] || icons.info) + '"></i><span>' +
      escapeHtml(message) +
      "</span>";
    el.toasts.appendChild(node);
    window.setTimeout(() => {
      node.style.opacity = "0";
      node.style.transition = "opacity 180ms ease";
      window.setTimeout(() => node.remove(), 200);
    }, 4200);
  }

  function log(message, level) {
    if (!el.labLog) return;
    const line = document.createElement("div");
    line.className = "log-" + (level || "info");
    line.textContent = "[" + formatTime() + "] " + message;
    el.labLog.appendChild(line);
    while (el.labLog.children.length > 200) {
      el.labLog.removeChild(el.labLog.firstChild);
    }
    el.labLog.scrollTop = el.labLog.scrollHeight;
  }

  function setApiStatus(kind, text) {
    if (!el.apiStatus) return;
    el.apiStatus.classList.remove("is-busy", "is-error");
    if (kind === "busy") el.apiStatus.classList.add("is-busy");
    if (kind === "error") el.apiStatus.classList.add("is-error");
    if (el.apiStatusText) el.apiStatusText.textContent = text;
  }

  function setBusy(busy, statusText) {
    state.busy = Boolean(busy);
    if (el.pullBtn) {
      el.pullBtn.disabled = state.busy;
      el.pullBtn.innerHTML = state.busy
        ? '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ السحب...'
        : '<i class="fa-solid fa-cloud-arrow-down"></i> سحب المنتجات';
    }
    if (el.refreshAllBtn) el.refreshAllBtn.disabled = state.busy;
    if (statusText) setApiStatus(state.busy ? "busy" : "ok", statusText);
  }

  // ---------------------------------------------------------------
  // Normalisation
  // ---------------------------------------------------------------
  function normalizeProduct(raw) {
    if (!raw || typeof raw !== "object") return null;

    const name = cleanText(raw.name || raw.title || raw.product_name || "");
    if (!name) return null;

    const rawId = cleanText(raw.id || raw.product_id || raw.sku || raw.SKU || "");
    const rawUrl = String(
      raw.url || raw.product_url || raw.link || raw.affiliate_url || ""
    ).trim();
    const source = inferSource(raw, rawId, rawUrl);

    let id = rawId;
    if (!id) {
      id = (source === "jumia" ? "jumia_" : "lab_") + hashText(rawUrl || name + "|" + raw.price);
    }
    if (source === "jumia" && !/^jumia_/i.test(id)) {
      id = "jumia_" + id.replace(/^jumia[_-]?/i, "");
    }

    const image = firstUrl(raw.image || raw.image_url || raw.thumbnail || "");
    const images = toUrlList(raw.images || raw.gallery || raw.extra_images, image);
    const price = safeNumber(
      raw.price || raw.sale_price || raw.current_price || raw.discount_price
    );
    let originalPrice = safeNumber(
      raw.original_price || raw.old_price || raw.list_price || raw.compare_at_price
    );
    if (originalPrice < price) originalPrice = price;

    let externalUrl = String(
      raw.external_url || raw.affiliate_url || raw.affiliate_link || ""
    ).trim();
    if (!externalUrl && source === "jumia" && /^https?:\/\//i.test(rawUrl)) {
      externalUrl = rawUrl;
    }

    const rawCountries = Array.isArray(raw.available_countries)
      ? raw.available_countries
      : raw.country
        ? [raw.country]
        : [];
    const availableCountries = rawCountries
      .map((code) => String(code || "").trim().toUpperCase())
      .filter(Boolean);
    if (!availableCountries.length && source === "jumia") availableCountries.push("EG");

    const highlights = Array.isArray(raw.highlights)
      ? raw.highlights.map((entry) => cleanText(entry)).filter(Boolean)
      : [];

    return {
      id,
      name,
      brand: cleanText(raw.brand || ""),
      category: cleanCategory(raw.category || raw.main_category, source),
      price,
      original_price: originalPrice,
      image,
      images,
      description: cleanText(raw.description || raw.details || raw.quick_details, true),
      highlights,
      source,
      external_url: externalUrl,
      source_url: rawUrl,
      available_countries: availableCountries,
      stock: source === "jumia" ? 99 : Math.max(0, Math.round(safeNumber(raw.stock))),
      stock_status: cleanText(raw.stock_status || "") || "in_stock",
      rating: clamp(safeNumber(raw.rating), 0, 5),
      reviewCount: Math.max(
        0,
        Math.round(safeNumber(raw.reviewCount || raw.reviews || raw.review_count))
      ),
      taager_product_id: cleanText(raw.taager_product_id || ""),
      taager_code: cleanText(raw.taager_code || ""),
      seller: cleanText(raw.seller || ""),
      saved_from: cleanText(raw.saved_from || ""),
    };
  }

  function rebuildIndex() {
    state.byId.clear();
    state.jumiaBySku.clear();
    for (const product of state.products) {
      state.byId.set(product.id.toLowerCase(), product);
      if (isJumia(product)) {
        const sku = product.id.replace(/^jumia_/i, "").toLowerCase();
        if (sku) state.jumiaBySku.set(sku, product);
      }
    }
  }

  function mergeProducts(incoming, options) {
    const preferNew = !options || options.preferNew !== false;
    const map = new Map(state.products.map((product) => [product.id, product]));
    for (const product of incoming) {
      if (!product || !product.id) continue;
      if (!map.has(product.id) || preferNew) map.set(product.id, product);
    }
    state.products = Array.from(map.values());
    rebuildIndex();
  }

  // ---------------------------------------------------------------
  // API
  // ---------------------------------------------------------------
  function normalizeApiBase(value) {
    const raw = String(value || "").trim() || DEFAULT_API_BASE;
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
      return url.origin + url.pathname.replace(/\/+$/, "");
    } catch (_error) {
      return DEFAULT_API_BASE;
    }
  }

  async function fetchCatalog(options) {
    const opts = options || {};
    const base = normalizeApiBase(el.apiBase ? el.apiBase.value : DEFAULT_API_BASE);
    const url = new URL("/api/catalog", base);
    if (opts.source && opts.source !== "all") url.searchParams.set("source", opts.source);
    if (opts.country) url.searchParams.set("country", opts.country);
    url.searchParams.set("limit", String(clamp(opts.limit || 12000, 1, MAX_LIMIT)));
    url.searchParams.set("_v", String(Date.now()));

    log("GET " + url.toString());
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " من " + base);
    }
    const payload = await response.json();
    const list = Array.isArray(payload)
      ? payload
      : payload.products || payload.items || payload.data || [];
    if (!Array.isArray(list)) throw new Error("استجابة API غير متوقعة");
    const products = list.map(normalizeProduct).filter(Boolean);
    log("API -> " + products.length + " rows", "ok");
    return products;
  }

  async function pullProducts(options) {
    if (state.busy) return;
    const opts = options || {};
    const source = el.sourceSelect ? el.sourceSelect.value : "jumia";
    const country = el.countrySelect ? el.countrySelect.value : "EG";
    const limit = clamp(
      Math.round(safeNumber(el.limitInput ? el.limitInput.value : 12000)) || 12000,
      20,
      MAX_LIMIT
    );
    if (el.limitInput) el.limitInput.value = String(limit);
    state.currentSource = source;
    state.currentCountry = country;

    setBusy(true, "جارٍ السحب...");
    if (el.pullStatus) {
      el.pullStatus.textContent = "جارٍ سحب المنتجات من " + apiSourceLabel(source, country) + "...";
    }
    persistSettings();

    try {
      const products = await fetchCatalog({ source, country, limit });
      state.products = products;
      state.visibleCount = PAGE_SIZE;
      rebuildIndex();

      // Keep a selection only for products that survived the refresh.
      const ids = new Set(products.map((product) => product.id));
      state.selected = new Set(
        Array.from(state.selected).filter((id) => ids.has(id))
      );
      state.pullInfo = {
        total: products.length,
        source,
        country,
        at: new Date().toISOString(),
      };

      rebuildCategoryFilter();
      renderGrid();
      updateStats();

      const count = products.length;
      if (count) {
        setApiStatus("ok", "متصل");
        toast("تم سحب " + count + " منتج من " + apiSourceLabel(source, country), "success");
        log(
          "pull ok: " + count + " rows · source=" + source + " · country=" + (country || "all"),
          "ok"
        );
      } else {
        setApiStatus("error", "لا توجد بيانات");
        toast(
          "لم تُرجع الواجهة أي منتج. تحقق من المصدر والدولة أو جرّب رابط API آخر.",
          "error"
        );
        log("pull returned 0 rows", "error");
      }
      if (!opts.quiet) {
        // The status line is already rendered by updatePullStatus().
      }
    } catch (error) {
      setApiStatus("error", "تعذر الاتصال");
      if (el.pullStatus) {
        el.pullStatus.textContent =
          "تعذر السحب: " + (error && error.message ? error.message : "خطأ غير معروف");
      }
      toast(
        "تعذر سحب المنتجات: " + (error && error.message ? error.message : "خطأ غير معروف"),
        "error"
      );
      log("pull failed: " + (error && error.message ? error.message : error), "error");
    } finally {
      setBusy(false);
      updatePullStatus();
    }
  }

  function apiSourceLabel(source, country) {
    const sourceText =
      source === "jumia" ? "جوميا مصر" : source === "taager" ? "Taager / الموردون" : "كل المصادر";
    const countryText =
      country === "EG" ? "مصر" : country === "SA" ? "السعودية" : "كل الدول";
    return sourceText + " (" + countryText + ")";
  }

  function updatePullStatus() {
    if (!el.pullStatus) return;
    if (!state.products.length) {
      el.pullStatus.textContent =
        "لم يتم السحب بعد. اختر المصدر ثم اضغط «سحب المنتجات».";
      return;
    }
    const filtered = getFiltered();
    const shown = Math.min(state.visibleCount, filtered.length);
    const info = state.pullInfo;
    const parts = [];
    if (info) {
      parts.push(
        "تم سحب " +
          info.total +
          " منتج من " +
          apiSourceLabel(info.source, info.country) +
          " · " +
          formatDate(info.at)
      );
    }
    parts.push("عرض " + shown + " من " + filtered.length);
    if (filtered.length !== state.products.length) {
      parts.push("إجمالي " + state.products.length);
    }
    el.pullStatus.textContent = parts.join(" · ");
  }

  // ---------------------------------------------------------------
  // Filtering / rendering
  // ---------------------------------------------------------------
  function matchScore(product, query) {
    const q = norm(query);
    if (!q) return 0;
    const haystack = norm(
      [product.name, product.brand, product.category, product.id, product.external_url].join(" ")
    );
    if (!haystack) return 0;
    if (haystack === q) return 100;
    if (haystack.indexOf(q) === 0) return 85;
    if (haystack.indexOf(q) !== -1) return 70;
    const words = q.split(" ").filter(Boolean);
    if (!words.length) return 0;
    let hits = 0;
    for (const word of words) {
      if (haystack.indexOf(word) !== -1) hits += 1;
    }
    return hits ? Math.round((hits / words.length) * 55) : 0;
  }

  function getFiltered() {
    const query = el.localSearch ? el.localSearch.value.trim() : "";
    const category = el.categoryFilter ? el.categoryFilter.value : "";
    const onlySelected = el.onlySelected ? el.onlySelected.checked : false;
    const onlyDiscount = el.onlyDiscount ? el.onlyDiscount.checked : false;
    const onlyMissing = el.onlyMissing ? el.onlyMissing.checked : false;
    const sort = el.sortSelect ? el.sortSelect.value : "relevance";

    let rows = state.products.filter((product) => {
      if (category && product.category !== category) return false;
      if (onlySelected && !state.selected.has(product.id)) return false;
      if (onlyDiscount && discountPercent(product) <= 0) return false;
      if (onlyMissing && state.savedIds.has(product.id)) return false;
      if (query && matchScore(product, query) <= 0) return false;
      return true;
    });

    if (query && sort === "relevance") {
      rows = rows.slice().sort((a, b) => matchScore(b, query) - matchScore(a, query));
    }

    switch (sort) {
      case "price-asc":
        rows = rows.slice().sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
        break;
      case "price-desc":
        rows = rows.slice().sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
        break;
      case "rating":
        rows = rows.slice().sort((a, b) => safeNumber(b.rating) - safeNumber(a.rating));
        break;
      case "name":
        rows = rows
          .slice()
          .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
        break;
      default:
        break;
    }

    return rows;
  }

  function ratingMarkup(product) {
    if (product.rating > 0) {
      return (
        '<span class="lab-rating"><i class="fa-solid fa-star"></i>' +
        product.rating.toFixed(1) +
        (product.reviewCount ? " <span>(" + product.reviewCount + ")</span>" : "") +
        "</span>"
      );
    }
    if (product.reviewCount > 0) {
      return (
        '<span class="lab-rating"><i class="fa-regular fa-star"></i>بدون تقييم <span>(' +
        product.reviewCount +
        " مراجعة)</span></span>"
      );
    }
    return '<span class="lab-rating"><i class="fa-regular fa-star"></i>لم يُقيّم بعد</span>';
  }

  function cardMarkup(product) {
    const selected = state.selected.has(product.id);
    const saved = state.savedIds.has(product.id);
    const discount = discountPercent(product);
    const image = product.image || PLACEHOLDER_IMAGE;
    const sourceClass = isJumia(product) ? "jumia" : "taager";
    const oldPrice =
      discount > 0
        ? "<del>" + safeNumber(product.original_price).toFixed(2) + "</del>"
        : "";
    const discountTag = discount > 0 ? '<span class="lab-discount">-' + discount + "%</span>" : "";
    const externalAction = product.external_url
      ? '<a href="' +
        escapeHtml(product.external_url) +
        '" target="_blank" rel="noopener noreferrer" title="فتح صفحة الشريك"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>'
      : "";
    const idAttr = escapeHtml(product.id);

    return (
      '<article class="lab-card' +
      (selected ? " is-selected" : "") +
      (saved ? " is-saved" : "") +
      '" data-id="' +
      idAttr +
      '">' +
      '<div class="lab-card-media">' +
      '<img src="' +
      escapeHtml(image) +
      '" alt="' +
      escapeHtml(product.name) +
      '" loading="lazy" onerror="this.onerror=null;this.src=\'' +
      PLACEHOLDER_IMAGE +
      "'\" />" +
      '<div class="lab-badge-row">' +
      '<label class="lab-check" title="تحديد">' +
      '<input type="checkbox" data-select="' +
      idAttr +
      '"' +
      (selected ? " checked" : "") +
      " />" +
      "</label>" +
      '<span class="lab-badge source-' +
      sourceClass +
      '">' +
      (isJumia(product) ? "جوميا" : "مورد") +
      "</span>" +
      "</div>" +
      (saved
        ? '<span class="lab-badge saved" style="position:absolute;bottom:8px;inset-inline-start:8px">محفوظ</span>'
        : "") +
      "</div>" +
      '<div class="lab-card-body">' +
      "<h4>" +
      escapeHtml(product.name) +
      "</h4>" +
      '<span class="lab-card-brand">' +
      escapeHtml(product.brand || product.category || "") +
      "</span>" +
      '<div class="lab-price-row"><strong>' +
      escapeHtml(money(product)) +
      "</strong>" +
      oldPrice +
      discountTag +
      "</div>" +
      ratingMarkup(product) +
      '<div class="lab-tags">' +
      '<span class="lab-tag">' +
      escapeHtml(countriesLabel(product)) +
      "</span>" +
      '<span class="lab-tag">' +
      (isJumia(product)
        ? "شراء عبر جوميا"
        : product.stock > 0
          ? "مخزون " + product.stock
          : "تحقق من المخزون") +
      "</span>" +
      (product.category
        ? '<span class="lab-tag">' + escapeHtml(product.category) + "</span>"
        : "") +
      "</div>" +
      '<div class="lab-card-actions">' +
      '<button type="button" data-action="details" data-id="' +
      idAttr +
      '"><i class="fa-solid fa-eye"></i> تفاصيل</button>' +
      '<button type="button" class="is-primary" data-action="save" data-id="' +
      idAttr +
      '"><i class="fa-solid fa-floppy-disk"></i> ' +
      (saved ? "تحديث" : "حفظ") +
      "</button>" +
      externalAction +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function renderGrid() {
    if (!el.labGrid) return;
    const filtered = getFiltered();
    const visible = filtered.slice(0, state.visibleCount);
    el.labGrid.innerHTML = visible.map(cardMarkup).join("");

    if (el.labEmpty) {
      el.labEmpty.style.display = filtered.length ? "none" : "flex";
      const text = el.labEmpty.querySelector("p");
      if (text) {
        text.textContent = state.products.length
          ? "لا توجد نتائج مطابقة للفلاتر الحالية."
          : "لا توجد منتجات بعد. اضغط «سحب المنتجات» لبدء التجربة.";
      }
    }

    if (el.loadMoreBtn) {
      const more = filtered.length > state.visibleCount;
      el.loadMoreBtn.style.display = more ? "" : "none";
      el.loadMoreBtn.textContent =
        "عرض المزيد (" + visible.length + "/" + filtered.length + ")";
    }

    updatePullStatus();
  }

  function rebuildCategoryFilter() {
    if (!el.categoryFilter) return;
    const counts = new Map();
    for (const product of state.products) {
      const category = product.category || "غير مصنف";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    const previous = el.categoryFilter.value;
    const options = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(
        ([category, count]) =>
          '<option value="' +
          escapeHtml(category) +
          '">' +
          escapeHtml(category) +
          " (" +
          count +
          ")</option>"
      )
      .join("");
    el.categoryFilter.innerHTML =
      '<option value="">كل الأقسام</option>' + options;
    if (counts.has(previous)) el.categoryFilter.value = previous;
  }

  function updateStats() {
    if (el.statTotal) el.statTotal.textContent = String(state.products.length);
    if (el.statJumia) {
      el.statJumia.textContent = String(
        state.products.filter((product) => isJumia(product)).length
      );
    }
    if (el.statSelected) el.statSelected.textContent = String(state.selected.size);
    if (el.statSaved) el.statSaved.textContent = String(state.saved.length);
    if (el.savedTabCount) el.savedTabCount.textContent = String(state.saved.length);
    if (el.selectedCount) el.selectedCount.textContent = String(state.selected.size);
    if (el.saveSelectedBtn) el.saveSelectedBtn.disabled = state.selected.size === 0;
    if (el.bulkBar) {
      el.bulkBar.classList.toggle(
        "is-visible",
        state.selected.size > 0 && !state.bulkHidden
      );
    }
  }

  function toggleSelection(id, selected) {
    if (!id) return;
    if (selected) state.selected.add(id);
    else state.selected.delete(id);
    if (selected) state.bulkHidden = false;
    const card = el.labGrid
      ? el.labGrid.querySelector('[data-id="' + cssEscape(id) + '"]')
      : null;
    if (card) card.classList.toggle("is-selected", selected);
    updateStats();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value || "").replace(/["\\]/g, "\\$&");
  }

  // ---------------------------------------------------------------
  // Saving to Supabase
  // ---------------------------------------------------------------
  function buildJumiaRow(product, active) {
    const now = new Date().toISOString();
    const externalUrl = product.external_url || product.taager_code || "";
    const image = product.image || (product.images && product.images[0]) || "";
    const images = product.images && product.images.length ? product.images : image ? [image] : [];
    const description = product.description || JUMIA_DESCRIPTION;
    const highlights =
      product.highlights && product.highlights.length
        ? product.highlights
        : JUMIA_HIGHLIGHTS;

    return {
      id: product.id,
      // NOT NULL in `taager_products`; Jumia has no Taager id, so the Jumia
      // SKU (id without the `jumia_` prefix) is the stable stand-in.
      taager_product_id:
        product.taager_product_id || product.id.replace(/^jumia_/i, ""),
      name: product.name,
      description,
      category: product.category || "منتجات جوميا",
      brand: product.brand || null,
      price: safeNumber(product.price),
      original_price: Math.max(safeNumber(product.price), safeNumber(product.original_price)),
      image,
      images,
      available_countries:
        product.available_countries && product.available_countries.length
          ? product.available_countries
          : ["EG"],
      stock: 99,
      stock_status: "in_stock",
      source: "jumia",
      is_active: Boolean(active),
      seller: product.seller || "جوميا مصر",
      // The public catalog turns `taager_code` into `external_url` for
      // source='jumia'; this is what makes the PDP buy button work.
      taager_code: externalUrl,
      raw_data: {
        saved_from: "product-lab",
        saved_at: now,
        supplier_source: "jumia",
        supplier_id: product.id,
        external_url: externalUrl,
        source_url: product.source_url || "",
        rating: safeNumber(product.rating),
        reviews: Math.round(safeNumber(product.reviewCount)),
        highlights,
      },
      updated_at: now,
    };
  }

  function buildSupplierRow(product, active) {
    const now = new Date().toISOString();
    const image = product.image || (product.images && product.images[0]) || "";
    const images = product.images && product.images.length ? product.images : image ? [image] : [];
    const countries =
      product.available_countries && product.available_countries.length
        ? product.available_countries
        : [String(state.currentCountry || "EG").toUpperCase()];

    return {
      id: product.id,
      // NOT NULL in `taager_products`; supplier rows already use their own
      // catalog id as the Taager id.
      taager_product_id: product.taager_product_id || product.id,
      name: product.name,
      description: product.description || "",
      category: product.category || "منتجات متنوعة",
      brand: product.brand || null,
      price: safeNumber(product.price),
      original_price: Math.max(safeNumber(product.price), safeNumber(product.original_price)),
      image,
      images,
      available_countries: countries,
      stock: Math.max(0, Math.round(safeNumber(product.stock))),
      stock_status: product.stock_status || "in_stock",
      source: product.source || "taager",
      is_active: Boolean(active),
      seller: product.seller || null,
      raw_data: {
        saved_from: "product-lab",
        saved_at: now,
        supplier_source: product.source || "taager",
        supplier_id: product.id,
      },
      updated_at: now,
    };
  }

  function chunk(array, size) {
    const chunks = [];
    for (let index = 0; index < array.length; index += size) {
      chunks.push(array.slice(index, index + size));
    }
    return chunks;
  }

  async function saveProducts(products, options) {
    const opts = options || {};
    if (!supabaseClient) {
      toast("Supabase غير محمّل. أعد تحميل الصفحة.", "error");
      return { saved: 0, failed: 0 };
    }
    const list = (products || []).filter((product) => product && product.id);
    if (!list.length) {
      toast("لم يتم تحديد أي منتج للحفظ.", "info");
      return { saved: 0, failed: 0 };
    }

    const active = Boolean(opts.active);
    const jumiaProducts = list.filter((product) => isJumia(product));
    const supplierProducts = list.filter((product) => !isJumia(product));
    let savedCount = 0;
    let failedCount = 0;

    if (el.saveSelectedBtn) el.saveSelectedBtn.disabled = true;
    log(
      "save start: " + jumiaProducts.length + " jumia + " + supplierProducts.length +
        " supplier · active=" + active
    );

    try {
      // Jumia rows are upserts: activating/deactivating and price edits must
      // update the existing row, because it overrides the bundled snapshot.
      for (const group of chunk(jumiaProducts, CHUNK_SIZE)) {
        const rows = group.map((product) => buildJumiaRow(product, active));
        const { error } = await supabaseClient
          .from("taager_products")
          .upsert(rows, { onConflict: "id" })
          .select("id");
        if (error) throw error;
        group.forEach((product) => state.savedIds.add(product.id));
        savedCount += group.length;
      }

      // Supplier rows already live in Supabase. `ignoreDuplicates` adds only
      // new ids and never overwrites supplier-owned raw_data/taager_code.
      for (const group of chunk(supplierProducts, CHUNK_SIZE)) {
        const rows = group.map((product) => buildSupplierRow(product, active));
        const { data, error } = await supabaseClient
          .from("taager_products")
          .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        const inserted = (data || []).map((row) => row.id);
        group.forEach((product) => state.savedIds.add(product.id));
        savedCount += inserted.length;
        if (inserted.length < group.length) {
          log(
            "supplier rows already existed: " + (group.length - inserted.length) + " skipped",
            "info"
          );
        }
      }

      if (savedCount > 0) {
        toast(
          "تم حفظ " + savedCount + " منتج في Supabase" + (active ? " وتنشيطه." : " كمسودة."),
          "success"
        );
      } else {
        toast(
          "كل الصفوف المحددة موجودة مسبقًا في Supabase ولم تتغير. استخدم «إدارة جميع المنتجات» لتعديل منتجات الموردين.",
          "info"
        );
      }
      log("save ok: " + savedCount + " rows · active=" + active, "ok");
      state.loadedSaved = false;
      // PostgREST can return a stale/empty read for a moment right after the
      // upsert; retry once so the saved panel reflects what was just written.
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      await loadSaved();
      if (!state.saved.length && savedCount > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        await loadSaved();
      }
      renderGrid();
      updateStats();
    } catch (error) {
      failedCount = list.length - savedCount;
      toast(
        "تعذر الحفظ: " + (error && error.message ? error.message : "خطأ غير معروف"),
        "error"
      );
      log("save failed: " + (error && error.message ? error.message : error), "error");
    } finally {
      if (el.saveSelectedBtn) el.saveSelectedBtn.disabled = state.selected.size === 0;
    }

    if (opts.clearSelection) {
      state.selected.clear();
      renderGrid();
      updateStats();
    }

    return { saved: savedCount, failed: failedCount };
  }

  // ---------------------------------------------------------------
  // Saved rows panel
  // ---------------------------------------------------------------
  const SAVED_COLUMNS = [
    "id",
    "name",
    "category",
    "brand",
    "price",
    "original_price",
    "image",
    "images",
    "source",
    "is_active",
    "updated_at",
    "taager_code",
    "available_countries",
    "stock",
    "stock_status",
  ].join(",");

  async function loadSaved() {
    if (!supabaseClient || state.loadingSaved) return;
    state.loadingSaved = true;
    if (el.savedStatus) el.savedStatus.textContent = "جاري تحميل الصفوف المحفوظة...";

    try {
      const [jumiaResult, labResult] = await Promise.all([
        supabaseClient
          .from("taager_products")
          .select(SAVED_COLUMNS)
          .eq("source", "jumia")
          .order("updated_at", { ascending: false })
          .limit(1000),
        supabaseClient
          .from("taager_products")
          .select(SAVED_COLUMNS)
          .eq("raw_data->>saved_from", "product-lab")
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);

      if (jumiaResult.error) throw jumiaResult.error;
      if (labResult.error) {
        log("lab-marker query failed: " + labResult.error.message, "info");
      }

      const byId = new Map();
      (jumiaResult.data || []).concat(labResult.data || []).forEach((row) => {
        if (row && row.id) byId.set(row.id, row);
      });
      state.saved = Array.from(byId.values()).sort((a, b) =>
        String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
      );
      state.savedIds = new Set(state.saved.map((row) => row.id));
      state.loadedSaved = true;

      renderSaved();
      updateStats();
      if (el.savedStatus) {
        const active = state.saved.filter((row) => row.is_active).length;
        el.savedStatus.textContent =
          state.saved.length +
          " صف محفوظ (" +
          active +
          " نشط، " +
          (state.saved.length - active) +
          " مسودة). قد يستغرق ظهور التغييرات على الموقع حتى 5 دقائق.";
      }
      log("saved rows loaded: " + state.saved.length, "ok");
    } catch (error) {
      if (el.savedStatus) {
        el.savedStatus.textContent =
          "تعذر تحميل المحفوظات: " +
          (error && error.message ? error.message : "خطأ غير معروف");
      }
      log("saved load failed: " + (error && error.message ? error.message : error), "error");
    } finally {
      state.loadingSaved = false;
    }
  }

  function renderSaved() {
    if (!el.savedGrid) return;
    const filter = el.savedFilter ? el.savedFilter.value : "";
    let rows = state.saved;
    if (filter === "jumia") rows = rows.filter((row) => row.source === "jumia");
    if (filter === "taager") rows = rows.filter((row) => row.source !== "jumia");
    if (filter === "active") rows = rows.filter((row) => row.is_active);
    if (filter === "inactive") rows = rows.filter((row) => !row.is_active);

    el.savedGrid.innerHTML = rows.map(savedRowMarkup).join("");
    if (el.savedEmpty) el.savedEmpty.style.display = rows.length ? "none" : "flex";

    if (el.savedStatus && state.loadedSaved) {
      const active = state.saved.filter((row) => row.is_active).length;
      el.savedStatus.textContent =
        state.saved.length +
        " صف محفوظ (" +
        active +
        " نشط، " +
        (state.saved.length - active) +
        " مسودة). قد يستغرق ظهور التغييرات على الموقع حتى 5 دقائق.";
    }
  }

  function savedRowMarkup(row) {
    const id = String(row.id || "");
    const image =
      row.image || (Array.isArray(row.images) && row.images[0]) || PLACEHOLDER_IMAGE;
    const price = safeNumber(row.price).toFixed(2);
    const countries = countriesLabel({
      available_countries: row.available_countries,
      source: row.source,
    });
    const partnerLink =
      /^https?:\/\//i.test(String(row.taager_code || "")) && row.source === "jumia"
        ? '<a href="' +
          escapeHtml(row.taager_code) +
          '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> الشريك</a>'
        : "";

    return (
      '<article class="saved-row" data-id="' +
      escapeHtml(id) +
      '">' +
      '<img src="' +
      escapeHtml(image) +
      '" alt="' +
      escapeHtml(row.name || "منتج") +
      '" loading="lazy" onerror="this.onerror=null;this.src=\'' +
      PLACEHOLDER_IMAGE +
      "'\" />" +
      '<div class="saved-row-main">' +
      "<strong>" +
      escapeHtml(row.name || "-") +
      "</strong>" +
      "<span>" +
      price +
      " · " +
      escapeHtml(sourceLabel({ source: row.source, id })) +
      " · " +
      escapeHtml(countries) +
      " · " +
      formatDate(row.updated_at) +
      "</span>" +
      '<span class="lab-badge ' +
      (row.is_active ? "saved" : "draft") +
      '" style="width:fit-content;margin-top:4px">' +
      (row.is_active ? "نشط" : "مسودة") +
      "</span>" +
      "</div>" +
      '<div class="saved-row-actions">' +
      '<button type="button" data-saved-action="toggle" data-id="' +
      escapeHtml(id) +
      '" class="' +
      (row.is_active ? "danger" : "success") +
      '">' +
      (row.is_active ? "إيقاف" : "تنشيط") +
      "</button>" +
      '<a href="' +
      escapeHtml(productPageUrl(id)) +
      '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-eye"></i> معاينة</a>' +
      partnerLink +
      '<button type="button" data-saved-action="delete" data-id="' +
      escapeHtml(id) +
      '" class="danger"><i class="fa-solid fa-trash"></i> حذف</button>' +
      "</div>" +
      "</article>"
    );
  }

  async function toggleSavedRow(id, active) {
    if (!supabaseClient) return;
    const { error } = await supabaseClient
      .from("taager_products")
      .update({ is_active: Boolean(active), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast("تعذر تحديث الحالة: " + error.message, "error");
      log("toggle failed: " + error.message, "error");
      return;
    }
    const row = state.saved.find((entry) => entry.id === id);
    if (row) row.is_active = Boolean(active);
    renderSaved();
    toast(active ? "تم تنشيط المنتج على الموقع." : "تم إيقاف المنتج (مسودة).", "success");
    log("saved row " + id + " active=" + active, "ok");
  }

  async function deleteSavedRow(id) {
    if (!supabaseClient) return;
    const confirmed = window.confirm(
      "حذف الصف " +
        id +
        " من Supabase؟\nإذا كان المنتج موجودًا في اللقطة الأساسية فستعود بياناته الافتراضية بدلًا من الصف المحفوظ."
    );
    if (!confirmed) return;
    const { error } = await supabaseClient
      .from("taager_products")
      .delete()
      .eq("id", id);
    if (error) {
      toast("تعذر الحذف: " + error.message, "error");
      log("delete failed: " + error.message, "error");
      return;
    }
    state.saved = state.saved.filter((row) => row.id !== id);
    state.savedIds.delete(id);
    renderSaved();
    updateStats();
    toast("تم حذف الصف من Supabase.", "success");
    log("saved row deleted: " + id, "ok");
  }

  // ---------------------------------------------------------------
  // Product details modal
  // ---------------------------------------------------------------
  function productPageUrl(id) {
    const base = normalizeApiBase(el.apiBase ? el.apiBase.value : DEFAULT_API_BASE);
    try {
      const url = new URL("/pages/product.html", base);
      url.searchParams.set("id", id);
      return url.toString();
    } catch (_error) {
      return base + "/pages/product.html?id=" + encodeURIComponent(id);
    }
  }

  function openModal(product) {
    if (!el.productModal || !el.modalBody) return;
    const description = product.description
      ? '<p class="lab-hint" style="margin-top:12px;white-space:pre-line">' +
        escapeHtml(product.description) +
        "</p>"
      : '<p class="lab-hint" style="margin-top:12px">لا يوجد وصف محفوظ لهذا المنتج.</p>';
    const highlights =
      product.highlights && product.highlights.length
        ? '<div class="lab-tags" style="margin-top:10px">' +
          product.highlights
            .map((entry) => '<span class="lab-tag">' + escapeHtml(entry) + "</span>")
            .join("") +
          "</div>"
        : "";
    const external = product.external_url
      ? '<a class="btn btn-secondary" href="' +
        escapeHtml(product.external_url) +
        '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> صفحة الشريك</a>'
      : "";
    const json = JSON.stringify(product, null, 2);

    el.modalBody.innerHTML =
      '<div class="modal-product">' +
      '<div class="modal-product-media"><img src="' +
      escapeHtml(product.image || PLACEHOLDER_IMAGE) +
      '" alt="' +
      escapeHtml(product.name) +
      '" onerror="this.onerror=null;this.src=\'' +
      PLACEHOLDER_IMAGE +
      "'\" /></div>" +
      "<div>" +
      "<h2>" +
      escapeHtml(product.name) +
      "</h2>" +
      '<span class="lab-card-brand">' +
      escapeHtml([product.brand, product.category].filter(Boolean).join(" · ")) +
      "</span>" +
      '<div class="inspect-price">' +
      escapeHtml(money(product)) +
      (discountPercent(product) > 0
        ? "<del>" + safeNumber(product.original_price).toFixed(2) + "</del>"
        : "") +
      "</div>" +
      ratingMarkup(product) +
      highlights +
      '<div class="modal-meta">' +
      "<div><span>المعرّف</span><strong dir=\"ltr\">" +
      escapeHtml(product.id) +
      "</strong></div>" +
      "<div><span>المصدر</span><strong>" +
      escapeHtml(sourceLabel(product)) +
      "</strong></div>" +
      "<div><span>الدول</span><strong>" +
      escapeHtml(countriesLabel(product)) +
      "</strong></div>" +
      "<div><span>المخزون</span><strong>" +
      (isJumia(product) ? "على جوميا" : product.stock) +
      "</strong></div>" +
      "<div><span>التقييم</span><strong>" +
      (product.rating > 0 ? product.rating.toFixed(1) : "لا يوجد") +
      "</strong></div>" +
      "<div><span>المراجعات</span><strong>" +
      (product.reviewCount || 0) +
      "</strong></div>" +
      "</div>" +
      description +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-primary" data-modal-action="save-draft"><i class="fa-solid fa-floppy-disk"></i> حفظ كمسودة</button>' +
      '<button type="button" class="btn btn-primary" data-modal-action="save-active"><i class="fa-solid fa-square-check"></i> حفظ وتنشيط</button>' +
      '<a class="btn btn-secondary" href="' +
      escapeHtml(productPageUrl(product.id)) +
      '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-eye"></i> معاينة BudoQ</a>' +
      external +
      '<button type="button" class="btn btn-secondary" data-modal-action="copy"><i class="fa-solid fa-copy"></i> نسخ JSON</button>' +
      "</div>" +
      '<pre class="modal-json">' +
      escapeHtml(json) +
      "</pre>" +
      "</div>" +
      "</div>";

    el.productModal.classList.add("is-open");
    el.productModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    qsa("[data-modal-action]", el.modalBody).forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-modal-action");
        if (action === "save-draft") {
          await saveProducts([product], { active: false });
        } else if (action === "save-active") {
          await saveProducts([product], { active: true });
        } else if (action === "copy") {
          copyText(json);
        }
      });
    });
  }

  function closeModal() {
    if (!el.productModal) return;
    el.productModal.classList.remove("is-open");
    el.productModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function copyText(text) {
    const value = String(text || "");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        () => toast("تم النسخ.", "success"),
        () => toast("تعذر النسخ.", "error")
      );
      return;
    }
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("تم النسخ.", "success");
    } catch (_error) {
      toast("تعذر النسخ.", "error");
    }
    area.remove();
  }

  // ---------------------------------------------------------------
  // Inspect flow
  // ---------------------------------------------------------------
  function decodeAdjustRedirect(value) {
    const text = String(value || "").trim();
    if (!/^https?:\/\//i.test(text)) return "";
    try {
      const url = new URL(text);
      const redirect = url.searchParams.get("adjust_redirect");
      return redirect ? String(redirect) : "";
    } catch (_error) {
      return "";
    }
  }

  function extractJumiaDigits(value) {
    const text = String(value || "");
    const match =
      text.match(/-(\d{6,})\.html/i) ||
      text.match(/product\/(\d{5,})/i) ||
      text.match(/\/(\d{6,})(?:[?#/]|$)/);
    return match ? match[1] : "";
  }

  function jumiaSlug(value) {
    const text = String(value || "");
    try {
      const url = new URL(text);
      const last = url.pathname.split("/").filter(Boolean).pop() || "";
      return last.replace(/-\d+\.html?$/i, "").replace(/[-_]+/g, " ").trim();
    } catch (_error) {
      return "";
    }
  }

  function findByTokens(value) {
    const words = norm(value)
      .split(" ")
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
    if (!words.length) return null;
    let best = null;
    let bestScore = 0;
    for (const product of state.products) {
      const haystack = norm(
        [product.name, product.brand, product.category, product.id].join(" ")
      );
      let score = 0;
      for (const word of words) {
        if (haystack.indexOf(word) !== -1) score += word.length >= 5 ? 2 : 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = product;
      }
    }
    return bestScore >= Math.min(3, words.length) ? best : null;
  }

  function findProduct(value) {
    const input = String(value || "").trim();
    if (!input) return null;
    const lower = input.toLowerCase();

    const direct =
      state.byId.get(lower) ||
      state.byId.get("jumia_" + lower) ||
      state.jumiaBySku.get(lower.replace(/^jumia_/, ""));
    if (direct) return direct;

    // Somebody pasted a product id inside a longer string/URL.
    for (const product of state.products) {
      if (lower.indexOf(product.id.toLowerCase()) !== -1) return product;
    }

    if (/^https?:\/\//i.test(input)) {
      const redirect = decodeAdjustRedirect(input);
      const urls = redirect ? [input, redirect] : [input];
      for (const url of urls) {
        const digits = extractJumiaDigits(url);
        if (digits) {
          const byDigits = state.products.find(
            (product) =>
              String(product.external_url || "").indexOf(digits) !== -1 ||
              String(product.id || "").indexOf(digits) !== -1
          );
          if (byDigits) return byDigits;
        }
        const slug = jumiaSlug(url);
        if (slug) {
          const bySlug = findByTokens(slug);
          if (bySlug) return bySlug;
        }
      }
    }

    return findByTokens(input);
  }

  function findCandidates(value, limit) {
    const words = norm(value)
      .split(" ")
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
    if (!words.length) return [];
    return state.products
      .map((product) => {
        const haystack = norm(
          [product.name, product.brand, product.category, product.id].join(" ")
        );
        let score = 0;
        for (const word of words) {
          if (haystack.indexOf(word) !== -1) score += word.length >= 5 ? 2 : 1;
        }
        return { product, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 8)
      .map((entry) => entry.product);
  }

  async function ensureSearchCatalog(input) {
    const wantsJumia = /jumia|adj\.st/i.test(input) || /^jumia_/i.test(input);
    const hasJumia = state.products.some((product) => isJumia(product));
    const hasSupplier = state.products.some((product) => !isJumia(product));
    const needsJumia = wantsJumia && !hasJumia;
    const needsSupplier = !wantsJumia && !hasSupplier;
    if (!needsJumia && !needsSupplier) return;

    setApiStatus("busy", "تحضير البحث...");
    try {
      const products = await fetchCatalog({
        source: wantsJumia ? "jumia" : "all",
        country: "EG",
        limit: MAX_LIMIT,
      });
      mergeProducts(products);
      rebuildCategoryFilter();
      renderGrid();
      updateStats();
    } finally {
      setApiStatus("ok", "جاهز");
    }
  }

  function checkRow(label, level, detail) {
    const icon =
      level === "ok"
        ? "fa-circle-check"
        : level === "warn"
          ? "fa-triangle-exclamation"
          : "fa-circle-xmark";
    return (
      '<div class="inspect-check ' +
      level +
      '"><i class="fa-solid ' +
      icon +
      '"></i><span>' +
      escapeHtml(label) +
      "</span><code>" +
      escapeHtml(detail == null ? "" : String(detail)) +
      "</code></div>"
    );
  }

  function buildChecks(product) {
    const external = String(product.external_url || "");
    const externalOk = /^https?:\/\//i.test(external);
    const isJforceLink = /adj\.st|jumia\.com\.eg/i.test(external);
    const countries = Array.isArray(product.available_countries)
      ? product.available_countries
      : [];
    const categoryOk =
      Boolean(product.category) &&
      !/[\u0000-\u001f\u007f\ufffd]/.test(product.category);
    const descriptionLength = String(product.description || "").length;

    return [
      checkRow(
        "المعرّف",
        product.id ? "ok" : "fail",
        product.id || "غير موجود"
      ),
      checkRow(
        "الاسم",
        product.name && product.name.trim().length >= 3 ? "ok" : "fail",
        product.name ? product.name.slice(0, 70) : "اسم فارغ"
      ),
      checkRow(
        "الصورة",
        product.image ? "ok" : "warn",
        product.image ? "موجودة" : "بدون صورة — ستُستخدم صورة افتراضية"
      ),
      checkRow(
        "السعر",
        product.price > 0 ? "ok" : "fail",
        product.price > 0 ? money(product) : "السعر صفر"
      ),
      checkRow(
        "السعر قبل الخصم",
        product.original_price >= product.price && product.original_price > 0
          ? "ok"
          : "warn",
        product.original_price > 0
          ? safeNumber(product.original_price).toFixed(2)
          : "غير محدد"
      ),
      checkRow(
        "رابط الشراء الخارجي",
        externalOk ? "ok" : "fail",
        externalOk ? "موجود" : "غير موجود — لن يعمل زر الشراء"
      ),
      checkRow(
        "رابط جوميا / JForce",
        isJforceLink ? "ok" : externalOk ? "warn" : "fail",
        isJforceLink ? "رابط شريك" : externalOk ? "رابط عادي" : "غير موجود"
      ),
      checkRow(
        "الدولة",
        countries.indexOf("EG") !== -1 ? "ok" : "warn",
        countries.length ? countries.join(", ") : "غير محددة"
      ),
      checkRow(
        "القسم",
        categoryOk ? "ok" : "warn",
        product.category || "غير محدد"
      ),
      checkRow(
        "الوصف",
        descriptionLength >= 20 ? "ok" : "warn",
        descriptionLength ? descriptionLength + " حرف" : "سيُستخدم وصف جوميا الافتراضي"
      ),
      checkRow(
        "التقييم",
        product.rating > 0 ? "ok" : "warn",
        product.rating > 0
          ? product.rating.toFixed(1) + "/5"
          : "لا يوجد تقييم بعد"
      ),
    ];
  }

  function renderInspect(product, input) {
    if (!el.inspectResult) return;
    if (!product) {
      const candidates = findCandidates(input, 8);
      el.inspectResult.innerHTML =
        '<div class="card lab-inspect-box">' +
        '<h3 style="color:#b45309"><i class="fa-solid fa-triangle-exclamation"></i> المنتج غير موجود في كتالوج بودوكيو</h3>' +
        '<p class="lab-hint">تحقق من الرابط أو الاسم، أو اسحب الكتالوج أولًا. يمكنك أيضًا استيراد المنتج عبر تبويب «استيراد JSON» إذا كانت بياناته جاهزة.</p>' +
        (candidates.length
          ? '<div class="inspect-candidates"><h4>أقرب النتائج</h4>' +
            candidates
              .map(
                (candidate) =>
                  '<div class="inspect-candidate" data-inspect-candidate="' +
                  escapeHtml(candidate.id) +
                  '"><img src="' +
                  escapeHtml(candidate.image || PLACEHOLDER_IMAGE) +
                  '" alt="" /><span>' +
                  escapeHtml(candidate.name) +
                  "</span><code>" +
                  escapeHtml(candidate.id) +
                  "</code></div>"
              )
              .join("") +
            "</div>"
          : "") +
        "</div>";
      bindInspectCandidates();
      return;
    }

    const checks = buildChecks(product);
    const failures = checks.filter((entry) => entry.indexOf("inspect-check fail") !== -1).length;
    const warnings = checks.filter((entry) => entry.indexOf("inspect-check warn") !== -1).length;
    const verdict =
      failures === 0
        ? '<span style="color:#047857"><i class="fa-solid fa-circle-check"></i> المنتج جاهز للاختبار والحفظ</span>'
        : '<span style="color:#b91c1c"><i class="fa-solid fa-circle-xmark"></i> يحتاج مراجعة قبل النشر (' +
          failures +
          " مشكلة)</span>";
    const warningNote = warnings
      ? " · " + warnings + " تنبيه غير مانع"
      : "";

    el.inspectResult.innerHTML =
      '<div class="inspect-card">' +
      '<div class="inspect-media"><img src="' +
      escapeHtml(product.image || PLACEHOLDER_IMAGE) +
      '" alt="' +
      escapeHtml(product.name) +
      '" onerror="this.onerror=null;this.src=\'' +
      PLACEHOLDER_IMAGE +
      "'\" /></div>" +
      '<div class="inspect-body">' +
      "<h3>" +
      escapeHtml(product.name) +
      "</h3>" +
      '<span class="lab-card-brand">' +
      escapeHtml([product.brand, product.category].filter(Boolean).join(" · ")) +
      "</span>" +
      '<div class="inspect-price">' +
      escapeHtml(money(product)) +
      (discountPercent(product) > 0
        ? "<del>" + safeNumber(product.original_price).toFixed(2) + "</del>"
        : "") +
      "</div>" +
      ratingMarkup(product) +
      '<div class="inspect-checks">' +
      checks.join("") +
      "</div>" +
      '<p class="lab-hint">' +
      verdict +
      warningNote +
      "</p>" +
      '<div class="inspect-actions">' +
      '<button type="button" class="btn btn-primary" data-inspect-action="save-draft" data-id="' +
      escapeHtml(product.id) +
      '"><i class="fa-solid fa-floppy-disk"></i> حفظ كمسودة</button>' +
      '<button type="button" class="btn btn-primary" data-inspect-action="save-active" data-id="' +
      escapeHtml(product.id) +
      '"><i class="fa-solid fa-square-check"></i> حفظ وتنشيط</button>' +
      '<a class="btn btn-secondary" href="' +
      escapeHtml(productPageUrl(product.id)) +
      '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-eye"></i> معاينة BudoQ</a>' +
      (product.external_url
        ? '<a class="btn btn-secondary" href="' +
          escapeHtml(product.external_url) +
          '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> صفحة الشريك</a>'
        : "") +
      '<button type="button" class="btn btn-secondary" data-inspect-action="copy" data-id="' +
      escapeHtml(product.id) +
      '"><i class="fa-solid fa-copy"></i> نسخ JSON</button>' +
      "</div>" +
      "</div>" +
      "</div>";
    bindInspectCandidates();
    state.inspected = product;
  }

  function bindInspectCandidates() {
    if (!el.inspectResult) return;
    qsa("[data-inspect-candidate]", el.inspectResult).forEach((node) => {
      node.addEventListener("click", () => {
        const id = node.getAttribute("data-inspect-candidate");
        const product = state.byId.get(String(id || "").toLowerCase());
        if (product) {
          if (el.inspectInput) el.inspectInput.value = product.id;
          renderInspect(product, product.id);
        }
      });
    });
  }

  async function inspectProduct() {
    if (!el.inspectInput) return;
    const input = el.inspectInput.value.trim();
    if (!input) {
      toast("الصق رابطًا أو اسم منتج للفحص.", "info");
      return;
    }
    if (el.inspectBtn) el.inspectBtn.disabled = true;
    setApiStatus("busy", "جارٍ الفحص...");
    try {
      await ensureSearchCatalog(input);
      let product = findProduct(input);
      if (!product && !state.fullCatalogFetched) {
        // A partial pull (for example the first 2,000 rows) may not contain
        // the product. Search the full EG catalog once before reporting a miss.
        const extra = await fetchCatalog({
          source: "all",
          country: "EG",
          limit: MAX_LIMIT,
        });
        state.fullCatalogFetched = true;
        mergeProducts(extra);
        rebuildCategoryFilter();
        renderGrid();
        updateStats();
        product = findProduct(input);
      }
      renderInspect(product, input);
      if (product) {
        log("inspect ok: " + product.id, "ok");
        toast("تم العثور على المنتج وفحصه.", "success");
      } else {
        log("inspect miss: " + input, "error");
        toast("لم يتم العثور على المنتج في الكتالوج.", "error");
      }
    } catch (error) {
      toast("تعذر الفحص: " + (error && error.message ? error.message : "خطأ"), "error");
      log("inspect failed: " + (error && error.message ? error.message : error), "error");
    } finally {
      if (el.inspectBtn) el.inspectBtn.disabled = false;
      setApiStatus("ok", "جاهز");
    }
  }

  // ---------------------------------------------------------------
  // JSON import
  // ---------------------------------------------------------------
  function parseImportPayload(text) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    return (
      data.products ||
      data.items ||
      data.data ||
      data.JUMIA_PRODUCTS ||
      data.records ||
      []
    );
  }

  async function importJson() {
    if (!el.importJson) return;
    const text = el.importJson.value.trim();
    if (!text) {
      toast("الصق JSON أولًا.", "info");
      return;
    }
    let list;
    try {
      list = parseImportPayload(text);
    } catch (error) {
      toast("JSON غير صالح: " + error.message, "error");
      return;
    }
    if (!Array.isArray(list) || !list.length) {
      toast("لم يتم العثور على مصفوفة منتجات في JSON.", "error");
      return;
    }

    const normalized = list.map(normalizeProduct).filter(Boolean);
    state.imported = normalized;
    if (el.sendToPullBtn) el.sendToPullBtn.disabled = normalized.length === 0;
    renderImportPreview(list.length);

    if (!normalized.length) {
      toast("لم يتم التعرف على أي منتج صالح في JSON.", "error");
      return;
    }

    // Enrich imported Jumia rows with the affiliate URL the public catalog
    // already generated, so imported snapshots keep working links.
    try {
      await ensureSearchCatalog("jumia");
      let enriched = 0;
      for (const product of state.imported) {
        if (!isJumia(product)) continue;
        const match =
          state.byId.get(product.id.toLowerCase()) ||
          state.jumiaBySku.get(product.id.replace(/^jumia_/i, "").toLowerCase());
        if (!match) continue;
        if (!product.external_url && match.external_url) {
          product.external_url = match.external_url;
          enriched += 1;
        }
        if (!product.description && match.description) product.description = match.description;
        if (!product.highlights.length && match.highlights) {
          product.highlights = match.highlights.slice();
        }
        if (!product.image && match.image) product.image = match.image;
        if (!product.images.length && match.images) product.images = match.images.slice();
        if (!product.rating && match.rating) product.rating = match.rating;
        if (!product.reviewCount && match.reviewCount) product.reviewCount = match.reviewCount;
      }
      renderImportPreview(list.length);
      log("import parsed: " + normalized.length + " rows · enriched=" + enriched, "ok");
    } catch (error) {
      log("import enrichment skipped: " + (error && error.message ? error.message : error), "info");
    }
    toast("تم تحليل " + normalized.length + " منتج. راجع المعاينة ثم أضفها للسحب.", "success");
  }

  function renderImportPreview(total) {
    if (!el.importPreview) return;
    if (!state.imported.length) {
      el.importPreview.innerHTML = "";
      return;
    }
    const jumia = state.imported.filter((product) => isJumia(product)).length;
    const missingImage = state.imported.filter((product) => !product.image).length;
    const missingUrl = state.imported.filter((product) => !product.external_url).length;
    const missingPrice = state.imported.filter((product) => product.price <= 0).length;
    const valid = state.imported.length;
    const skipped = Math.max(0, safeNumber(total) - valid);

    el.importPreview.innerHTML =
      '<div class="import-summary">' +
      '<div class="ok">تم التعرف على ' +
      valid +
      " منتج صالح" +
      (skipped ? " · تم تجاهل " + skipped + " صف بدون اسم" : "") +
      "</div>" +
      "<div>جوميا: " +
      jumia +
      " · موردون: " +
      (valid - jumia) +
      " · بدون صورة: " +
      missingImage +
      " · بدون رابط شراء: " +
      missingUrl +
      "</div>" +
      (missingPrice
        ? '<div class="bad">' + missingPrice + " منتج بسعر صفر — راجع البيانات قبل الحفظ.</div>"
        : "") +
      "</div>";
    if (el.sendToPullBtn) el.sendToPullBtn.disabled = false;
  }

  function sendImportToPull() {
    if (!state.imported.length) return;
    mergeProducts(state.imported, { preferNew: true });
    state.imported = [];
    if (el.importPreview) el.importPreview.innerHTML = "";
    if (el.sendToPullBtn) el.sendToPullBtn.disabled = true;
    if (state.pullInfo) state.pullInfo.total = state.products.length;
    rebuildCategoryFilter();
    state.visibleCount = PAGE_SIZE;
    renderGrid();
    updateStats();
    switchTab("pull");
    toast("تمت إضافة الدفعة إلى قائمة المنتجات.", "success");
    log("import merged into pull list: " + state.products.length + " total products", "ok");
  }

  // ---------------------------------------------------------------
  // Tabs / settings / events
  // ---------------------------------------------------------------
  function switchTab(name) {
    qsa(".lab-tab").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-tab") === name);
    });
    qsa(".lab-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === "panel-" + name);
    });
    if (name === "saved" && !state.loadedSaved) loadSaved();
    if (name === "pull") renderGrid();
  }

  function persistSettings() {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          apiBase: el.apiBase ? el.apiBase.value : "",
          source: el.sourceSelect ? el.sourceSelect.value : "",
          country: el.countrySelect ? el.countrySelect.value : "",
          limit: el.limitInput ? el.limitInput.value : "",
        })
      );
    } catch (_error) {
      // storage can be disabled; the page still works for this session
    }
  }

  function loadSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (stored.apiBase && el.apiBase) el.apiBase.value = stored.apiBase;
      if (stored.source && el.sourceSelect) el.sourceSelect.value = stored.source;
      if (stored.country && el.countrySelect) el.countrySelect.value = stored.country;
      if (stored.limit && el.limitInput) el.limitInput.value = stored.limit;
    } catch (_error) {
      // ignore corrupt settings
    }
  }

  function syncCountryForSource() {
    if (!el.sourceSelect || !el.countrySelect) return;
    const jumia = el.sourceSelect.value === "jumia";
    const saOption = el.countrySelect.querySelector('option[value="SA"]');
    if (saOption) saOption.disabled = jumia;
    if (jumia && el.countrySelect.value !== "EG") {
      el.countrySelect.value = "EG";
      toast("منتجات جوميا متاحة في مصر فقط؛ تم اختيار مصر.", "info");
    }
  }

  function debounceSearch() {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.visibleCount = PAGE_SIZE;
      renderGrid();
    }, 140);
  }

  function bindEvents() {
    qsa(".lab-tab").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.getAttribute("data-tab")));
    });

    if (el.pullBtn) el.pullBtn.addEventListener("click", () => pullProducts());
    if (el.refreshAllBtn) {
      el.refreshAllBtn.addEventListener("click", async () => {
        await loadSaved();
        await pullProducts({ quiet: true });
      });
    }

    if (el.sourceSelect) {
      el.sourceSelect.addEventListener("change", () => {
        syncCountryForSource();
        persistSettings();
      });
    }
    if (el.countrySelect) el.countrySelect.addEventListener("change", persistSettings);
    if (el.limitInput) el.limitInput.addEventListener("change", persistSettings);
    if (el.apiBase) el.apiBase.addEventListener("change", persistSettings);
    if (el.activateOnSave) {
      el.activateOnSave.addEventListener("change", () => {
        try {
          localStorage.setItem("productLabActivate", el.activateOnSave.checked ? "1" : "0");
        } catch (_error) {}
      });
    }

    if (el.localSearch) el.localSearch.addEventListener("input", debounceSearch);
    if (el.categoryFilter) {
      el.categoryFilter.addEventListener("change", () => {
        state.visibleCount = PAGE_SIZE;
        renderGrid();
      });
    }
    if (el.sortSelect) {
      el.sortSelect.addEventListener("change", () => {
        state.visibleCount = PAGE_SIZE;
        renderGrid();
      });
    }
    [el.onlySelected, el.onlyDiscount, el.onlyMissing].forEach((input) => {
      if (!input) return;
      input.addEventListener("change", () => {
        state.visibleCount = PAGE_SIZE;
        renderGrid();
      });
    });

    if (el.loadMoreBtn) {
      el.loadMoreBtn.addEventListener("click", () => {
        state.visibleCount += PAGE_SIZE;
        renderGrid();
      });
    }

    if (el.selectAllVisible) {
      el.selectAllVisible.addEventListener("click", () => {
        getFiltered()
          .slice(0, state.visibleCount)
          .forEach((product) => state.selected.add(product.id));
        state.bulkHidden = false;
        renderGrid();
        updateStats();
        toast("تم تحديد " + state.selected.size + " منتج.", "info");
      });
    }
    if (el.clearSelectionBtn) {
      el.clearSelectionBtn.addEventListener("click", () => {
        state.selected.clear();
        renderGrid();
        updateStats();
      });
    }
    if (el.hideBulkBar) {
      el.hideBulkBar.addEventListener("click", () => {
        state.bulkHidden = true;
        updateStats();
      });
    }
    if (el.saveSelectedBtn) {
      el.saveSelectedBtn.addEventListener("click", async () => {
        const selected = state.products.filter((product) => state.selected.has(product.id));
        if (!selected.length) return;
        await saveProducts(selected, {
          active: el.activateOnSave ? el.activateOnSave.checked : false,
          clearSelection: true,
        });
      });
    }

    if (el.inspectBtn) el.inspectBtn.addEventListener("click", inspectProduct);
    if (el.inspectInput) {
      el.inspectInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          inspectProduct();
        }
      });
    }
    qsa("[data-sample]").forEach((button) => {
      button.addEventListener("click", () => {
        const sample = button.getAttribute("data-sample");
        const jumia = state.products.find((product) => isJumia(product));
        const supplier = state.products.find((product) => !isJumia(product));
        if (sample === "jumia") {
          if (!jumia) {
            toast("اسحب كتالوج جوميا أولًا.", "info");
            switchTab("pull");
            return;
          }
          if (el.inspectInput) el.inspectInput.value = jumia.id;
          switchTab("inspect");
          inspectProduct();
          return;
        }
        if (sample === "taager") {
          if (!supplier) {
            toast("اسحب كتالوج الموردين أو افحص اسمًا مباشرة.", "info");
            switchTab("pull");
            return;
          }
          if (el.inspectInput) el.inspectInput.value = supplier.name;
          switchTab("inspect");
          inspectProduct();
          return;
        }
        if (sample === "url") {
          if (!jumia) {
            toast("اسحب كتالوج جوميا أولاً للحصول على رابط منتج.", "info");
            switchTab("pull");
            return;
          }
          const redirect = decodeAdjustRedirect(jumia.external_url);
          if (el.inspectInput) {
            el.inspectInput.value = redirect || jumia.external_url || jumia.source_url || "";
          }
          switchTab("inspect");
          inspectProduct();
        }
      });
    });

    if (el.inspectResult) {
      el.inspectResult.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-inspect-action]");
        if (!button) return;
        const id = button.getAttribute("data-id");
        const product = state.byId.get(String(id || "").toLowerCase());
        if (!product) return;
        const action = button.getAttribute("data-inspect-action");
        if (action === "save-draft") await saveProducts([product], { active: false });
        if (action === "save-active") await saveProducts([product], { active: true });
        if (action === "copy") copyText(JSON.stringify(product, null, 2));
      });
    }

    if (el.parseImportBtn) el.parseImportBtn.addEventListener("click", importJson);
    if (el.sendToPullBtn) el.sendToPullBtn.addEventListener("click", sendImportToPull);

    if (el.savedFilter) el.savedFilter.addEventListener("change", renderSaved);
    if (el.reloadSavedBtn) {
      el.reloadSavedBtn.addEventListener("click", () => {
        state.loadedSaved = false;
        loadSaved();
      });
    }
    if (el.savedGrid) {
      el.savedGrid.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-saved-action]");
        if (!button) return;
        const id = button.getAttribute("data-id");
        const action = button.getAttribute("data-saved-action");
        if (!id) return;
        if (action === "toggle") {
          const row = state.saved.find((entry) => entry.id === id);
          await toggleSavedRow(id, row ? !row.is_active : true);
        }
        if (action === "delete") await deleteSavedRow(id);
      });
    }

    // Card grid: checkbox changes, action buttons, and card click for details.
    if (el.labGrid) {
      el.labGrid.addEventListener("change", (event) => {
        const box = event.target.closest("[data-select]");
        if (!box) return;
        toggleSelection(box.getAttribute("data-select"), box.checked);
      });
      el.labGrid.addEventListener("click", async (event) => {
        const action = event.target.closest("[data-action]");
        if (action) {
          const id = action.getAttribute("data-id");
          const product = state.byId.get(String(id || "").toLowerCase());
          if (!product) return;
          if (action.getAttribute("data-action") === "details") openModal(product);
          if (action.getAttribute("data-action") === "save") {
            await saveProducts([product], {
              active: el.activateOnSave ? el.activateOnSave.checked : false,
            });
          }
          return;
        }
        if (event.target.closest("input, a, button, label")) return;
        const card = event.target.closest(".lab-card");
        if (!card) return;
        const product = state.byId.get(String(card.getAttribute("data-id") || "").toLowerCase());
        if (product) openModal(product);
      });
    }

    if (el.productModal) {
      qsa("[data-close-modal]", el.productModal).forEach((node) => {
        node.addEventListener("click", closeModal);
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  function cacheElements() {
    [
      "apiStatus", "apiStatusText", "refreshAllBtn", "statTotal", "statJumia",
      "statSelected", "statSaved", "savedTabCount", "sourceSelect", "countrySelect",
      "limitInput", "apiBaseInput", "pullBtn", "pullStatus", "localSearch",
      "categoryFilter", "sortSelect", "onlySelected", "onlyDiscount", "onlyMissing",
      "selectAllVisible", "clearSelectionBtn", "labGrid", "labEmpty", "loadMoreBtn",
      "labLog", "inspectInput", "inspectBtn", "inspectResult", "savedStatus",
      "savedFilter", "reloadSavedBtn", "savedGrid", "savedEmpty", "importJson",
      "parseImportBtn", "sendToPullBtn", "importPreview", "bulkBar", "selectedCount",
      "activateOnSave", "saveSelectedBtn", "hideBulkBar", "productModal", "modalBody",
      "toasts",
    ].forEach((id) => {
      el[id] = $(id);
    });
    // The markup uses `apiBaseInput`; keep a short alias for the rest of the file.
    el.apiBase = el.apiBaseInput;
  }

  function boot() {
    cacheElements();
    if (!el.pullBtn) return;

    if (window.supabase && typeof window.supabase.createClient === "function") {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    loadSettings();
    syncCountryForSource();
    try {
      if (localStorage.getItem("productLabActivate") === "1" && el.activateOnSave) {
        el.activateOnSave.checked = true;
      }
    } catch (_error) {}

    bindEvents();
    updateStats();
    log("product lab ready · api=" + normalizeApiBase(el.apiBase ? el.apiBase.value : ""));

    if (!supabaseClient) {
      toast("تعذر تحميل عميل Supabase. أعد تحميل الصفحة.", "error");
    } else {
      loadSaved();
    }

    // First run: pull the Jumia slice so the lab is immediately testable.
    pullProducts({ quiet: true });

    // Expose a small debug surface for manual/automated checks.
    window.productLab = {
      state,
      pull: pullProducts,
      save: saveProducts,
      inspect: inspectProduct,
      loadSaved,
      findProduct,
      normalizeProduct,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

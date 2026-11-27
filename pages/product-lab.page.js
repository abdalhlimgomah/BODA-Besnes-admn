/**
 * مختبر منتجات جوميا — سحب، فحص، حفظ، ومزامنة مع Supabase.
 *
 * التصميم:
 *   • المتصفح لا يستطيع قراءة jumia.com.eg مباشرة (CORS + حماية).
 *   • الصفحة تتصل بسيرفر السحب: إمّا نسخة Vercel على budoq.com أو
 *     `node server/jumia-server.mjs` محليًا.
 *   • كل منتج يُسحب منفردًا، يُحلَّل في السيرفر، ويُعرض هنا مباشرة.
 *   • المنتجات تُحفظ في IndexedDB حتى لا تضيع عند تحديث الصفحة.
 *   • الحفظ في `taager_products` يستخدم أعمدة j_* الجديدة إن وُجدت،
 *     وإلا يسقط تلقائيًا إلى الأعمدة الأساسية + raw_data.
 */
(function () {
  "use strict";

  const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

  // السيرفرات الثلاثة المستخدمة في لوحة التحكم. المفاتيح عامة (anon/publishable)
  // وتُستخدم للقراءة والكتابة عبر RLS، وليست مفاتيح service_role.
  const BACKENDS = [
    {
      name: "primary",
      label: "السيرفر الأساسي",
      url: "https://msgqzgzoslearaprgiqq.supabase.co",
      key: SUPABASE_ANON_KEY,
    },
    {
      name: "backup",
      label: "السيرفر الاحتياطي",
      url: "https://wwlwwgqfjhmchrijaojr.supabase.co",
      key: "sb_publishable_wIxpA7t3a2hII8asqYZ1Bg__NoMLLUU",
    },
    {
      name: "backup2",
      label: "السيرفر الثالث",
      url: "https://qhqkgrpezoaugyhzrgyc.supabase.co",
      key: "sb_publishable_bHCWG6iYSkbONKG7HR6Rkw_UVZGsjUe",
    },
  ];
  // PostgREST يحدّ أقصى عدد صفوف في الاستجابة بـ 1000 على السيرفرات دي.
  const SERVER_ID_PAGE = 1000;
  const SERVER_FETCH_ID_CHUNK = 200;
  const SERVER_ADD_CHUNK = 100;
  // إضافة مئات الآلاف دفعة واحدة في المتصفح غير عملية؛ نضيف على دفعات
  // ونترك زر «إضافة الناقص» جاهزًا للمتابعة.
  const SERVER_ADD_BATCH = 2000;

  const SETTINGS_KEY = "productLabJumiaSettings.v2";
  const DB_NAME = "bodaJumiaLab";
  const DB_VERSION = 1;
  const PRODUCT_STORE = "products";
  const PAGE_SIZE = 60;
  const SAVED_PAGE_SIZE = 60;
  const SAVED_FETCH_PAGE = 150;
  const SAVE_CHUNK = 40;
  const DEFAULT_SQL_FILE = "../sql/jumia-products.sql";

  const DEFAULT_SOURCES = [
    "https://www.jumia.com.eg/ar/phones-tablets/",
    "https://www.jumia.com.eg/ar/electronics/",
    "https://www.jumia.com.eg/ar/home-kitchen/",
    "https://www.jumia.com.eg/ar/health-beauty/",
    "https://www.jumia.com.eg/ar/fashion/",
    "https://www.jumia.com.eg/ar/supermarket/",
  ];

  const PLACEHOLDER_IMAGE =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f3f4f6"/><path d="M50 22 76 36v28L50 78 24 64V36z" fill="none" stroke="#94a3b8" stroke-width="3"/><path d="M24 36l26 14 26-14M50 50v28" fill="none" stroke="#94a3b8" stroke-width="3"/></svg>'
    );

  const JUMIA_DESCRIPTION =
    "منتج من كتالوج جوميا مصر، متاح للشراء من متجر BudoQ بسعر المنتج " +
    "المعروض وبالجنيه المصري.";

  const JUMIA_HIGHLIGHTS = [
    "من كتالوج جوميا مصر",
    "متاح للشراء من متجر BudoQ",
    "السعر المعروض بالجنيه المصري",
  ];

  const SAVED_BASE_COLUMNS = [
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
    "stock",
    "stock_status",
  ].join(",");

  const SAVED_RICH_COLUMNS =
    SAVED_BASE_COLUMNS +
    ",j_sku,j_url,j_price_history,j_seller_name,j_seller_rating,j_reviews_count";

  const FALLBACK_SQL = [
    "-- Jumia Product Lab — شغّل هذا الملف في Supabase → SQL Editor",
    "ALTER TABLE public.taager_products",
    "  ADD COLUMN IF NOT EXISTS j_sku TEXT,",
    "  ADD COLUMN IF NOT EXISTS j_url TEXT,",
    "  ADD COLUMN IF NOT EXISTS j_seller_name TEXT,",
    "  ADD COLUMN IF NOT EXISTS j_seller_url TEXT,",
    "  ADD COLUMN IF NOT EXISTS j_seller_rating NUMERIC(5, 2),",
    "  ADD COLUMN IF NOT EXISTS j_seller_followers INTEGER,",
    "  ADD COLUMN IF NOT EXISTS j_seller_performance JSONB,",
    "  ADD COLUMN IF NOT EXISTS j_rating NUMERIC(3, 2),",
    "  ADD COLUMN IF NOT EXISTS j_reviews_count INTEGER,",
    "  ADD COLUMN IF NOT EXISTS j_rating_breakdown JSONB,",
    "  ADD COLUMN IF NOT EXISTS j_specs JSONB,",
    "  ADD COLUMN IF NOT EXISTS j_highlights JSONB,",
    "  ADD COLUMN IF NOT EXISTS j_breadcrumb JSONB,",
    "  ADD COLUMN IF NOT EXISTS j_delivery JSONB,",
    "  ADD COLUMN IF NOT EXISTS j_related JSONB,",
    "  ADD COLUMN IF NOT EXISTS j_warranty TEXT,",
    "  ADD COLUMN IF NOT EXISTS j_return_policy TEXT,",
    "  ADD COLUMN IF NOT EXISTS j_stock_text TEXT,",
    "  ADD COLUMN IF NOT EXISTS j_discount INTEGER,",
    "  ADD COLUMN IF NOT EXISTS j_currency TEXT DEFAULT 'EGP',",
    "  ADD COLUMN IF NOT EXISTS j_scraped_at TIMESTAMPTZ,",
    "  ADD COLUMN IF NOT EXISTS j_price_history JSONB DEFAULT '[]'::jsonb,",
    "  ADD COLUMN IF NOT EXISTS j_raw JSONB,",
    "  ADD COLUMN IF NOT EXISTS rating NUMERIC(3, 2),",
    "  ADD COLUMN IF NOT EXISTS review_count INTEGER,",
    "  ADD COLUMN IF NOT EXISTS rating_source TEXT,",
    "  ADD COLUMN IF NOT EXISTS external_url TEXT;",
    "CREATE INDEX IF NOT EXISTS taager_products_j_sku_idx ON public.taager_products (j_sku);",
    "CREATE INDEX IF NOT EXISTS taager_products_j_seller_idx ON public.taager_products (j_seller_name);",
    "CREATE INDEX IF NOT EXISTS taager_products_j_scraped_idx ON public.taager_products (j_scraped_at DESC);",
    "CREATE INDEX IF NOT EXISTS taager_products_source_active_idx ON public.taager_products (source, is_active);",
  ].join("\n");

  const state = {
    products: [],
    byId: new Map(),
    byUrl: new Map(),
    selected: new Set(),
    saved: [],
    savedById: new Map(),
    savedByUrl: new Map(),
    savedIds: new Set(),
    savedVisible: SAVED_PAGE_SIZE,
    savedTotal: 0,
    savedNextFrom: 0,
    savedHasMore: true,
    savedLoadingMore: false,
    visibleCount: PAGE_SIZE,
    loadedSaved: false,
    loadingSaved: false,
    idbReady: false,
    apiReady: false,
    apiBase: "",
    apiInfo: null,
    hasJumiaColumns: null,
    supabaseReady: false,
    bulkHidden: false,
    autoSaveBroken: false,
    importPreview: [],
    inspectProduct: null,
    modalProduct: null,
    settings: {},
    crawl: {
      running: false,
      paused: false,
      stopped: false,
      stopReason: "",
      phase: "idle",
      queue: [],
      statuses: new Map(),
      index: 0,
      done: 0,
      failed: 0,
      startedAt: 0,
      currentUrl: "",
      currentProduct: null,
      consecutiveErrors: 0,
      runId: 0,
    },
    sync: {
      running: false,
      stop: false,
      changes: [],
      checked: 0,
      total: 0,
      failed: 0,
    },
    proxy: {
      stats: null,
      loading: false,
      testing: false,
    },
    servers: {
      scanning: false,
      adding: false,
      expectedIds: [],
      results: [],
    },
  };

  const el = {};
  let supabaseClient = null;
  let dbPromise = null;
  let searchTimer = 0;
  let savedSearchTimer = 0;
  let pauseResolve = null;
  let savedLoadPromise = null;
  let savedLoadMorePromise = null;
  let savedFetchPageSize = SAVED_FETCH_PAGE;
  let serverSyncTimer = 0;
  let serverSyncIds = new Set();
  let serverSyncRunning = false;
  let queueRenderAt = 0;

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheEls();
    bindEvents();
    loadSettings();
    initSupabase();
    updateSqlState();
    updateSetupSummary();
    renderAll();
    renderProxyStats();
    renderServers();

    const tasks = [
      detectApi({ silent: true }),
      loadProductsFromIdb(),
      loadSavedIndex({ silent: true }),
      refreshProxyPool({ silent: true }),
    ];
    await Promise.allSettled(tasks);

    recomputeChangedFlags();
    rebuildCategoryFilter();
    renderAll();

    if (state.products.length) {
      setCrawlStatus(
        "يوجد " +
          state.products.length +
          " منتج محفوظ محليًا من جلسة سابقة. يمكنك المتابعة أو بدء سحب جديد."
      );
    } else {
      setCrawlStatus("جاهز. اضبط المصادر ثم اضغط «بدء السحب».");
    }
    updateSetupSummary();
  }

  const EL_IDS = [
    "apiStatus",
    "apiStatusText",
    "refreshAllBtn",
    "statScraped",
    "statPending",
    "statSelected",
    "statSaved",
    "statChanged",
    "setupCard",
    "setupSummary",
    "apiBaseInput",
    "detectApiBtn",
    "copyServerBtn",
    "apiSetupState",
    "sqlStatusSelect",
    "copySqlBtn",
    "sqlSetupState",
    "productsTabCount",
    "savedTabCount",
    "crawlMode",
    "pagesInput",
    "maxProductsInput",
    "delayInput",
    "crawlSources",
    "startCrawlBtn",
    "pauseCrawlBtn",
    "stopCrawlBtn",
    "skipSavedInput",
    "autoSaveInput",
    "workerCountInput",
    "proxyPoolBadge",
    "proxyText",
    "proxyTestLimitInput",
    "useProxyPoolInput",
    "saveProxyBtn",
    "appendProxyBtn",
    "testProxyBtn",
    "refreshProxyBtn",
    "clearProxyBtn",
    "proxyStatsText",
    "proxyResults",
    "checkServersBtn",
    "addMissingServersBtn",
    "autoServerSyncInput",
    "serversList",
    "serversStatus",
    "crawlStatusText",
    "crawlDone",
    "crawlFailed",
    "crawlRemaining",
    "crawlEta",
    "crawlBar",
    "crawlCurrent",
    "crawlCurrentImg",
    "crawlCurrentName",
    "crawlCurrentMeta",
    "crawlSpinner",
    "queueList",
    "labLog",
    "clearCrawlBtn",
    "exportJsonBtn",
    "goProductsBtn",
    "productSearch",
    "productCategory",
    "productSort",
    "onlySelected",
    "onlyDiscount",
    "onlySaved",
    "onlyChanged",
    "selectAllBtn",
    "selectAllCount",
    "selectVisibleBtn",
    "invertSelectionBtn",
    "clearSelectionBtn",
    "productsStatus",
    "labGrid",
    "labEmpty",
    "loadMoreBtn",
    "savedStatus",
    "savedSearch",
    "savedFilter",
    "reloadSavedBtn",
    "syncStartBtn",
    "syncStopBtn",
    "applySyncBtn",
    "syncApplyCount",
    "syncBar",
    "syncStatus",
    "syncList",
    "savedGrid",
    "savedEmpty",
    "savedMoreBtn",
    "inspectInput",
    "inspectBtn",
    "pasteBox",
    "pasteUrl",
    "pasteHtml",
    "parseHtmlBtn",
    "openBridgeBtn",
    "copyBridgeBtn",
    "bridgeCode",
    "inspectResult",
    "importJson",
    "parseImportBtn",
    "sendToPullBtn",
    "importPreview",
    "bulkBar",
    "selectedCount",
    "activateOnSave",
    "saveSelectedBtn",
    "saveAllBtn",
    "updateSelectedBtn",
    "hideBulkBar",
    "saveModal",
    "saveModalTitle",
    "saveModalHint",
    "saveBar",
    "saveStats",
    "saveDiffs",
    "productModal",
    "modalBody",
    "toasts",
  ];

  function cacheEls() {
    EL_IDS.forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  }

  // ------------------------------------------------------------------
  // Generic helpers
  // ------------------------------------------------------------------

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    var text = String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
    if (!text) return "";
    text = multiline
      ? text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
      : text.replace(/[\u0000-\u001f\u007f]/g, " ");
    return text.replace(/\ufffd/g, "").trim();
  }

  function hashText(value) {
    var hash = 5381;
    var text = String(value || "");
    for (var index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }

  function moneyValue(value) {
    var number = safeNumber(value);
    try {
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(number) + " ج.م";
    } catch (_error) {
      return number.toFixed(2) + " ج.م";
    }
  }

  function plainNumber(value) {
    var number = safeNumber(value);
    try {
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
    } catch (_error) {
      return String(Math.round(number));
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
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

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    var seconds = Math.round(ms / 1000);
    if (seconds < 60) return "~" + seconds + " ث";
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    if (minutes < 60) return "~" + minutes + " د" + (rest ? " " + rest + " ث" : "");
    var hours = Math.floor(minutes / 60);
    return "~" + hours + " س " + (minutes % 60) + " د";
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function uniqueList(list) {
    var seen = new Set();
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (entry) {
      var value = cleanText(entry);
      if (!value || seen.has(value)) return;
      seen.add(value);
      out.push(value);
    });
    return out;
  }

  function toUrlList(value, fallbackImage) {
    var list = [];
    if (Array.isArray(value)) {
      list = value.slice();
    } else if (typeof value === "string" && value.trim()) {
      var text = value.trim();
      if (text.charAt(0) === "[") {
        try {
          var parsed = JSON.parse(text);
          if (Array.isArray(parsed)) list = parsed;
        } catch (_error) {
          list = [];
        }
      }
      if (!list.length) list = text.split(/[\n,]+/);
    }
    if (fallbackImage) list.push(fallbackImage);
    var seen = new Set();
    var out = [];
    list.forEach(function (entry) {
      var url = cleanText(entry);
      if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) return;
      seen.add(url);
      out.push(url);
    });
    return out;
  }

  function canonicalUrl(value) {
    var raw = cleanText(value);
    if (!raw) return "";
    try {
      var url = new URL(raw, "https://www.jumia.com.eg");
      url.hash = "";
      return url.toString();
    } catch (_error) {
      return raw;
    }
  }

  function isProductUrl(value) {
    var url = String(value == null ? "" : value);
    return /\/[^/?#]+-\d{5,}\.html/i.test(url) || /\/product\/\d{5,}/i.test(url);
  }

  function numericIdFromUrl(value) {
    var url = String(value == null ? "" : value);
    var match =
      url.match(/-(\d{5,})\.html/i) ||
      url.match(/\/product\/(\d{5,})/i) ||
      url.match(/\/(\d{6,})(?:[/?#]|$)/);
    return match ? match[1] : "";
  }

  function urlKey(value) {
    var raw = cleanText(value);
    if (!raw) return "";
    try {
      var url = new URL(raw, "https://www.jumia.com.eg");
      url.hash = "";
      if (isProductUrl(url.toString())) url.search = "";
      return url.toString().toLowerCase().replace(/\/+$/, "");
    } catch (_error) {
      return raw.toLowerCase();
    }
  }

  function parseSourceLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return line && line.charAt(0) !== "#";
      });
  }

  function readInt(input, fallback, min, max) {
    var value = Number(input && input.value);
    if (!Number.isFinite(value)) value = fallback;
    return clamp(Math.round(value), min, max);
  }

  function readDelay() {
    return readInt(el.delayInput, 1200, 0, 15000);
  }

  function productExternalUrl(product) {
    if (!product) return "";
    var candidates = [product.url, product.external_url, product.source_url, product.taager_code];
    for (var index = 0; index < candidates.length; index += 1) {
      var value = cleanText(candidates[index]);
      if (/^https?:\/\//i.test(value)) return value;
    }
    return "";
  }

  function jumiaSlug(value) {
    try {
      var url = new URL(String(value || ""), "https://www.jumia.com.eg");
      var last = url.pathname.split("/").filter(Boolean).pop() || "";
      return cleanText(decodeURIComponent(last.replace(/-\d+\.html?$/i, "").replace(/[-_]+/g, " ")));
    } catch (_error) {
      return "";
    }
  }

  function stockInfo(status, text) {
    var key = cleanText(status || "in_stock").toLowerCase();
    if (key === "out_of_stock" || /نفد|غير متوفر|out of stock/i.test(String(text || ""))) {
      return { key: "out_of_stock", label: "غير متوفر", cls: "stock-out" };
    }
    if (key === "low_stock" || /باقي|كمية محدودة|few units|only \d+ left/i.test(String(text || ""))) {
      return { key: "low_stock", label: "كمية محدودة", cls: "stock-low" };
    }
    return { key: "in_stock", label: "متوفر", cls: "stock-in" };
  }

  function stockKey(value) {
    return cleanText(value || "in_stock").toLowerCase() || "in_stock";
  }

  function sellerName(product) {
    if (!product) return "";
    if (product.seller && typeof product.seller === "object") {
      return cleanText(product.seller.name || "");
    }
    return cleanText(product.seller || "");
  }

  function sellerRating(product) {
    if (!product) return 0;
    if (product.seller && typeof product.seller === "object") {
      return clamp(safeNumber(product.seller.rating), 0, 100);
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // Feedback
  // ------------------------------------------------------------------

  function toast(message, type) {
    if (!el.toasts) return;
    var kind = type || "info";
    var icons = {
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
      info: "fa-circle-info",
    };
    var node = document.createElement("div");
    node.className = "lab-toast " + kind;
    node.innerHTML =
      '<i class="fa-solid ' +
      (icons[kind] || icons.info) +
      '"></i><span>' +
      escapeHtml(message) +
      "</span>";
    el.toasts.appendChild(node);
    window.setTimeout(function () {
      node.style.opacity = "0";
      node.style.transition = "opacity 180ms ease";
      window.setTimeout(function () {
        node.remove();
      }, 200);
    }, 4600);
  }

  function log(message, level) {
    if (!el.labLog) {
      return;
    }
    var line = document.createElement("div");
    line.className = "log-" + (level || "info");
    line.textContent = "[" + formatTime() + "] " + message;
    el.labLog.appendChild(line);
    while (el.labLog.children.length > 250) {
      el.labLog.removeChild(el.labLog.firstChild);
    }
    el.labLog.scrollTop = el.labLog.scrollHeight;
  }

  function copyText(text) {
    var value = String(text == null ? "" : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        function () {
          toast("تم النسخ إلى الحافظة.", "success");
        },
        function () {
          fallbackCopy(value);
        }
      );
      return;
    }
    fallbackCopy(value);
  }

  function fallbackCopy(value) {
    var area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      toast("تم النسخ إلى الحافظة.", "success");
    } catch (_error) {
      toast("تعذر النسخ. انسخ يدويًا.", "error");
    }
    area.remove();
  }

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------

  function loadSettings() {
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
    } catch (_error) {
      saved = {};
    }
    state.settings = saved;

    if (el.apiBaseInput && saved.apiBase) el.apiBaseInput.value = saved.apiBase;
    if (el.crawlMode && saved.crawlMode) el.crawlMode.value = saved.crawlMode;
    if (el.pagesInput && saved.pages) el.pagesInput.value = String(saved.pages);
    if (el.maxProductsInput && saved.maxProducts) {
      el.maxProductsInput.value = String(saved.maxProducts);
    }
    if (el.delayInput && saved.delay !== undefined) el.delayInput.value = String(saved.delay);
    if (el.crawlSources) {
      el.crawlSources.value = saved.sources || DEFAULT_SOURCES.slice(0, 3).join("\n");
    }
    if (el.skipSavedInput) el.skipSavedInput.checked = Boolean(saved.skipSaved);
    if (el.autoSaveInput) el.autoSaveInput.checked = Boolean(saved.autoSave);
    if (el.activateOnSave) el.activateOnSave.checked = Boolean(saved.activateOnSave);
    if (el.sqlStatusSelect) el.sqlStatusSelect.value = saved.sqlStatus || "unknown";
    if (el.workerCountInput && saved.workers) el.workerCountInput.value = String(saved.workers);
    if (el.proxyTestLimitInput && saved.proxyTestLimit) {
      el.proxyTestLimitInput.value = String(saved.proxyTestLimit);
    }
    if (el.useProxyPoolInput) {
      el.useProxyPoolInput.checked = saved.useProxyPool !== false;
    }
    if (el.autoServerSyncInput) {
      el.autoServerSyncInput.checked = Boolean(saved.autoServerSync);
    }

    switchTab(saved.tab || "crawl", false);
  }

  function persistSettings() {
    var settings = {
      apiBase: el.apiBaseInput ? cleanText(el.apiBaseInput.value) : state.apiBase,
      crawlMode: el.crawlMode ? el.crawlMode.value : "listing",
      pages: readInt(el.pagesInput, 3, 1, 200),
      maxProducts: readInt(el.maxProductsInput, 500, 1, 100000),
      delay: readDelay(),
      sources: el.crawlSources ? el.crawlSources.value : "",
      skipSaved: el.skipSavedInput ? Boolean(el.skipSavedInput.checked) : false,
      autoSave: el.autoSaveInput ? Boolean(el.autoSaveInput.checked) : false,
      activateOnSave: el.activateOnSave ? Boolean(el.activateOnSave.checked) : false,
      sqlStatus: el.sqlStatusSelect ? el.sqlStatusSelect.value : "unknown",
      workers: readInt(el.workerCountInput, 6, 1, 64),
      proxyTestLimit: readInt(el.proxyTestLimitInput, 50, 1, 500),
      useProxyPool: el.useProxyPoolInput ? Boolean(el.useProxyPoolInput.checked) : true,
      autoServerSync: el.autoServerSyncInput
        ? Boolean(el.autoServerSyncInput.checked)
        : false,
      tab: state.settings.tab || "crawl",
    };
    state.settings = settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_error) {
      // التخزين المحلي قد يكون معطلًا؛ لا نوقف الصفحة.
    }
  }

  // ------------------------------------------------------------------
  // Setup / API discovery
  // ------------------------------------------------------------------

  function normalizeApiBase(value) {
    var raw = cleanText(value);
    if (!raw) return "";
    try {
      var url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      var pathname = url.pathname.replace(/\/+$/, "");
      pathname = pathname.replace(/\/api(\/jumia)?$/i, "");
      return url.origin + pathname;
    } catch (_error) {
      return "";
    }
  }

  function setApiStatus(kind, text) {
    if (!el.apiStatus) return;
    el.apiStatus.classList.remove("is-busy", "is-error");
    if (kind === "busy") el.apiStatus.classList.add("is-busy");
    if (kind === "error") el.apiStatus.classList.add("is-error");
    if (el.apiStatusText) el.apiStatusText.textContent = text;
  }

  function setSetupState(node, ok, okText, badText) {
    if (!node) return;
    node.className = "lab-setup-state " + (ok ? "is-ok" : "is-warn");
    node.innerHTML =
      '<i class="fa-solid ' +
      (ok ? "fa-circle-check" : "fa-circle-exclamation") +
      '"></i> ' +
      escapeHtml(ok ? okText : badText);
  }

  function updateSqlState() {
    var value = el.sqlStatusSelect ? el.sqlStatusSelect.value : "unknown";
    if (!el.sqlSetupState) return;
    if (value === "done") {
      setSetupState(el.sqlSetupState, true, "تم التشغيل", "");
    } else if (value === "later") {
      setSetupState(el.sqlSetupState, false, "", "لاحقًا — الحفظ الأساسي يعمل");
    } else {
      el.sqlSetupState.className = "lab-setup-state";
      el.sqlSetupState.innerHTML = '<i class="fa-solid fa-minus"></i> لم يُتحقق';
    }
  }

  function updateSetupSummary() {
    var apiOk = state.apiReady;
    if (el.apiSetupState) {
      if (apiOk) {
        var runtime = state.apiInfo && state.apiInfo.runtime === "local-node" ? "محلي" : "سحابة";
        setSetupState(el.apiSetupState, true, "متصل · " + runtime, "");
      } else {
        setSetupState(el.apiSetupState, false, "", "غير متصل");
      }
    }
    updateSqlState();
    if (el.setupSummary) {
      var sql = el.sqlStatusSelect ? el.sqlStatusSelect.value : "unknown";
      var text = apiOk ? "السحب جاهز" : "شغّل سيرفر السحب";
      if (apiOk && sql === "done") text += " · الحفظ الكامل جاهز";
      else if (apiOk) text += " · الحفظ الأساسي جاهز";
      el.setupSummary.textContent = text;
      el.setupSummary.className = "lab-setup-pill " + (apiOk ? "is-ok" : "is-warn");
    }
  }

  function probeApi(base) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, 5000);
    return fetch(base + "/api/jumia/health", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (!payload || payload.ok !== true) throw new Error("استجابة غير صحيحة");
        return payload;
      })
      .finally(function () {
        window.clearTimeout(timer);
      });
  }

  async function detectApi(options) {
    var opts = options || {};
    if (!opts.silent) setApiStatus("busy", "جارٍ الفحص...");
    else if (!state.apiReady) setApiStatus("busy", "جارٍ الفحص...");

    var candidates = [];
    var addCandidate = function (value) {
      var base = normalizeApiBase(value);
      if (base && candidates.indexOf(base) === -1) candidates.push(base);
    };

    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    // على localhost نجرب نفس الأصل أولًا (Live Server يعمل كـ proxy لـ /api/jumia)،
    // حتى نتجنب طلب budoq.com المباشر المحجوب بـ CORS.
    if (isLocal && /^https?:$/.test(window.location.protocol)) addCandidate(window.location.origin);
    addCandidate(el.apiBaseInput ? el.apiBaseInput.value : "");
    if (/^https?:$/.test(window.location.protocol)) addCandidate(window.location.origin);
    addCandidate("http://localhost:8788");
    addCandidate("http://127.0.0.1:8788");
    if (!isLocal) addCandidate("https://budoq.com");

    for (var index = 0; index < candidates.length; index += 1) {
      var base = candidates[index];
      try {
        var info = await probeApi(base);
        state.apiBase = base;
        state.apiReady = true;
        state.apiInfo = info;
        if (el.apiBaseInput) el.apiBaseInput.value = base;
        setApiStatus("ok", "متصل");
        updateSetupSummary();
        persistSettings();
        refreshBridgeUi();
        log("سيرفر السحب متصل: " + base + " · v" + (info.version || "?"), "ok");
        refreshProxyPool({ silent: true });
        if (!opts.silent) {
          toast("تم الاتصال بسيرفر السحب (" + (info.runtime || "API") + ").", "success");
        }
        return true;
      } catch (_error) {
        // جرّب المرشح التالي.
      }
    }

    state.apiReady = false;
    setApiStatus("error", "غير متصل");
    updateSetupSummary();
    log("لم يتم العثور على سيرفر سحب. شغّل: node server/jumia-server.mjs", "error");
    if (!opts.silent) {
      toast(
        "لم يتم العثور على سيرفر السحب. شغّل «node server/jumia-server.mjs» أو افتح الصفحة من budoq.com.",
        "error"
      );
    }
    return false;
  }

  async function apiRequest(pathname, options) {
    var opts = options || {};
    if (!state.apiReady) {
      var ready = await detectApi({ silent: true });
      if (!ready) {
        throw new Error("سيرفر السحب غير متصل. شغّل node server/jumia-server.mjs أولًا.");
      }
    }

    var controller = new AbortController();
    var timeout = Math.max(5000, Number(opts.timeoutMs) || 90000);
    var timer = window.setTimeout(function () {
      controller.abort();
    }, timeout);

    var headers = Object.assign({ Accept: "application/json" }, opts.headers || {});
    var response;
    try {
      response = await fetch(state.apiBase + pathname, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      window.clearTimeout(timer);
      if (error && error.name === "AbortError") {
        throw new Error("انتهت مهلة الاتصال بسيرفر السحب.");
      }
      if (!opts.retriedApi) {
        state.apiReady = false;
        var back = await detectApi({ silent: true });
        if (back) {
          return apiRequest(pathname, Object.assign({}, opts, { retriedApi: true }));
        }
      }
      throw error;
    }
    window.clearTimeout(timer);

    var payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }

    if (!response.ok || !payload || payload.ok === false) {
      var apiError = new Error(
        (payload && (payload.error || payload.message)) || "HTTP " + response.status
      );
      apiError.status = response.status;
      apiError.blocked = Boolean(payload && payload.blocked);
      apiError.attempts = payload && payload.attempts;
      throw apiError;
    }
    return payload;
  }

  function buildProductPath(url, mode) {
    var query = new URLSearchParams();
    query.set("url", url);
    if (mode === "pool") {
      // One product = one proxy exit. The server retries on another proxy
      // before falling back to the direct connection.
      query.set("proxy", "pool");
      query.set("poolAttempts", "4");
      query.set("timeout", "45000");
    } else if (mode === "public") {
      // Jumia rate-limits a residential/server IP with HTTP 429 after a few
      // page views. The scraper's public-proxy route is slower but keeps the
      // lab (and the enrichment script) working from that network.
      query.set("proxy", "1");
      query.set("retries", "1");
      query.set("timeout", "60000");
    }
    query.set("_v", String(Date.now()));
    return "/api/jumia/product?" + query.toString();
  }

  async function fetchProductRemote(url, options) {
    var opts = options || {};
    if ((opts.preferPool || opts.usePool) && proxyPoolActive()) {
      try {
        return await apiRequest(buildProductPath(url, "pool"), { timeoutMs: 180000 });
      } catch (error) {
        if (opts.poolOnly) throw error;
        log("تعذر السحب عبر مجمع الوسائط — محاولة مباشرة للمنتج.", "info");
      }
    }
    try {
      return await apiRequest(buildProductPath(url, "direct"), { timeoutMs: 120000 });
    } catch (error) {
      var retryable =
        error &&
        (error.blocked ||
          error.status === 429 ||
          error.status === 502 ||
          /429|502/.test(String(error.message || "")));
      if (!retryable || opts.noProxyFallback) throw error;
      log("جوميا ردّت بالحظر/429 — إعادة المحاولة عبر مسار الوسيط العام.", "info");
      return apiRequest(buildProductPath(url, "public"), { timeoutMs: 180000 });
    }
  }

  function discoverListingRemote(url, page) {
    var query = new URLSearchParams();
    query.set("url", url);
    query.set("mode", "listing");
    if (Number(page) > 1) query.set("page", String(page));
    query.set("_v", String(Date.now()));
    return apiRequest("/api/jumia/discover?" + query.toString(), { timeoutMs: 90000 });
  }

  function discoverSitemapRemote(url) {
    var query = new URLSearchParams();
    query.set("mode", "sitemap");
    if (url) query.set("url", url);
    query.set("_v", String(Date.now()));
    return apiRequest("/api/jumia/discover?" + query.toString(), { timeoutMs: 90000 });
  }

  function readRobotsRemote() {
    return apiRequest("/api/jumia/robots?_v=" + String(Date.now()), { timeoutMs: 45000 });
  }

  // ------------------------------------------------------------------
  // Proxy pool
  // ------------------------------------------------------------------

  function proxyPoolActive() {
    return Boolean(
      el.useProxyPoolInput &&
        el.useProxyPoolInput.checked &&
        state.proxy.stats &&
        Number(state.proxy.stats.total) > 0
    );
  }

  function readWorkerCount() {
    var workers = readInt(el.workerCountInput, 6, 1, 64);
    return proxyPoolActive() ? workers : 1;
  }

  function renderProxyStats(message) {
    var stats = state.proxy.stats;
    var total = stats ? Number(stats.total) || 0 : 0;
    var ready = stats ? Number(stats.ready) || 0 : 0;
    var cooling = stats ? Number(stats.cooling) || 0 : 0;
    var inFlight = stats ? Number(stats.inFlight) || 0 : 0;

    if (el.proxyPoolBadge) {
      el.proxyPoolBadge.textContent = total
        ? plainNumber(ready) + " جاهز من " + plainNumber(total)
        : "0 جاهز";
      el.proxyPoolBadge.classList.toggle("is-empty", total === 0);
      el.proxyPoolBadge.classList.toggle(
        "is-warn",
        total > 0 && ready === 0 && cooling > 0
      );
    }
    if (el.proxyStatsText) {
      if (message) {
        el.proxyStatsText.textContent = message;
      } else if (!total) {
        el.proxyStatsText.textContent =
          "لا توجد وسائط محفوظة بعد. الصق قائمة الوسائط واضغط «حفظ واستبدال».";
      } else {
        var parts = [
          "الإجمالي " + plainNumber(total),
          "جاهز " + plainNumber(ready),
          "يعمل الآن " + plainNumber(inFlight),
          "في التهدئة " + plainNumber(cooling),
        ];
        if (stats.unsupported) {
          parts.push("غير مدعوم " + plainNumber(stats.unsupported));
        }
        if (stats.successes || stats.failures) {
          parts.push(
            "نجاح " +
              plainNumber(stats.successes) +
              " · فشل " +
              plainNumber(stats.failures)
          );
        }
        el.proxyStatsText.textContent = parts.join(" · ");
      }
    }
  }

  async function refreshProxyPool(options) {
    var opts = options || {};
    if (state.proxy.loading) return state.proxy.stats;
    if (!state.apiReady) {
      renderProxyStats();
      return null;
    }
    state.proxy.loading = true;
    try {
      var data = await apiRequest("/api/jumia/proxies", { timeoutMs: 20000 });
      state.proxy.stats = data;
      renderProxyStats();
      if (!opts.silent && data.total) {
        log(
          "الوسائط: " +
            plainNumber(data.ready) +
            " جاهز من " +
            plainNumber(data.total) +
            ".",
          "info"
        );
      }
      return data;
    } catch (error) {
      state.proxy.stats = null;
      renderProxyStats("تعذر قراءة حالة الوسائط: " + (error.message || error));
      if (!opts.silent) toast("تعذر قراءة حالة الوسائط.", "error");
      return null;
    } finally {
      state.proxy.loading = false;
    }
  }

  function renderProxyResults(payload) {
    if (!el.proxyResults) return;
    var results = (payload && payload.results) || [];
    if (!results.length) {
      el.proxyResults.innerHTML = "";
      return;
    }
    el.proxyResults.innerHTML = results
      .slice(0, 120)
      .map(function (item) {
        return (
          '<div class="lab-proxy-result ' +
          (item.ok ? "is-ok" : "is-bad") +
          '"><i class="fa-solid ' +
          (item.ok ? "fa-circle-check" : "fa-circle-xmark") +
          '"></i><code>' +
          escapeHtml(item.proxy) +
          "</code><small>" +
          (item.ok
            ? plainNumber(item.ms) + "ms"
            : escapeHtml(item.error || "فشل")) +
          "</small></div>"
        );
      })
      .join("");
  }

  async function saveProxyList(mode) {
    var text = el.proxyText ? el.proxyText.value : "";
    if (!text.trim()) {
      toast("الصق قائمة الوسائط أولًا (سطر لكل وسيط).", "info");
      if (el.proxyText) el.proxyText.focus();
      return;
    }
    if (mode === "replace") {
      var total = state.proxy.stats ? Number(state.proxy.stats.total) || 0 : 0;
      if (total > 0 && !window.confirm("استبدال " + total + " وسيط محفوظ بالقائمة الجديدة؟")) {
        return;
      }
    }
    var buttons = [el.saveProxyBtn, el.appendProxyBtn, el.testProxyBtn];
    buttons.forEach(function (button) {
      if (button) button.disabled = true;
    });
    try {
      var data = await apiRequest("/api/jumia/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          mode: mode,
          concurrency: readInt(el.workerCountInput, 6, 1, 64),
        }),
        timeoutMs: 60000,
      });
      state.proxy.stats = data;
      if (el.proxyText) el.proxyText.value = "";
      renderProxyResults(null);
      renderProxyStats();
      log(
        "تم حفظ الوسائط (" +
          (mode === "append" ? "إضافة" : "استبدال") +
          "): " +
          plainNumber(data.added) +
          " وسيط" +
          (data.invalid ? " · " + plainNumber(data.invalid) + " سطر غير صالح" : "") +
          (data.duplicates ? " · " + plainNumber(data.duplicates) + " مكرر" : ""),
        data.total ? "ok" : "error"
      );
      toast(
        data.total
          ? "تم حفظ " + plainNumber(data.total) + " وسيط."
          : "لم يتم حفظ أي وسيط صالح.",
        data.total ? "success" : "error"
      );
      if (data.unsupported) {
        log(
          "تم تجاهل " + plainNumber(data.unsupported) + " وسيط SOCKS (غير مدعوم).",
          "info"
        );
      }
    } catch (error) {
      toast("تعذر حفظ الوسائط: " + (error.message || error), "error");
      log("proxy save failed: " + (error.message || error), "error");
    } finally {
      buttons.forEach(function (button) {
        if (button) button.disabled = false;
      });
    }
  }

  async function testProxyList() {
    if (state.proxy.testing) return;
    var text = el.proxyText ? el.proxyText.value : "";
    var limit = readInt(el.proxyTestLimitInput, 50, 1, 500);
    if (!text.trim() && !(state.proxy.stats && state.proxy.stats.total)) {
      toast("لا توجد وسائط للاختبار. الصق القائمة أولًا.", "info");
      return;
    }
    state.proxy.testing = true;
    if (el.testProxyBtn) el.testProxyBtn.disabled = true;
    if (el.proxyStatsText) el.proxyStatsText.textContent = "جارٍ اختبار الوسائط...";
    if (el.proxyResults) el.proxyResults.innerHTML = "";
    try {
      var data = await apiRequest("/api/jumia/proxies/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          limit: limit,
          concurrency: Math.min(30, readInt(el.workerCountInput, 6, 1, 64) * 2),
          timeoutMs: 15000,
        }),
        timeoutMs: 180000,
      });
      renderProxyResults(data);
      renderProxyStats();
      log(
        "اختبار الوسائط: " +
          plainNumber(data.working) +
          " ناجح من " +
          plainNumber(data.tested) +
          (data.unavailable
            ? " · لم يُختبر " + plainNumber(data.unavailable)
            : "") +
          ".",
        data.working ? "ok" : "error"
      );
      toast(
        "نجح " + plainNumber(data.working) + " من " + plainNumber(data.tested) + " وسيط.",
        data.working ? "success" : "error"
      );
    } catch (error) {
      renderProxyStats("فشل اختبار الوسائط: " + (error.message || error));
      toast("فشل اختبار الوسائط: " + (error.message || error), "error");
    } finally {
      state.proxy.testing = false;
      if (el.testProxyBtn) el.testProxyBtn.disabled = false;
    }
  }

  async function clearProxyList() {
    var total = state.proxy.stats ? Number(state.proxy.stats.total) || 0 : 0;
    if (total > 0 && !window.confirm("مسح كل الوسائط المحفوظة (" + total + ")؟")) {
      return;
    }
    try {
      var data = await apiRequest("/api/jumia/proxies", {
        method: "DELETE",
        timeoutMs: 30000,
      });
      state.proxy.stats = data;
      if (el.proxyText) el.proxyText.value = "";
      renderProxyResults(null);
      renderProxyStats();
      toast("تم مسح قائمة الوسائط.", "success");
      log("تم مسح قائمة الوسائط.", "info");
    } catch (error) {
      toast("تعذر مسح الوسائط: " + (error.message || error), "error");
    }
  }

  function parseHtmlRemote(html, url) {
    return apiRequest("/api/jumia/product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: html, url: url || "" }),
      timeoutMs: 60000,
    });
  }

  // ------------------------------------------------------------------
  // IndexedDB
  // ------------------------------------------------------------------

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB غير متاح"));
        return;
      }
      var request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(PRODUCT_STORE)) {
          db.createObjectStore(PRODUCT_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error("تعذر فتح IndexedDB"));
      };
    });
    return dbPromise;
  }

  function idbAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRODUCT_STORE, "readonly");
        var request = tx.objectStore(PRODUCT_STORE).getAll();
        request.onsuccess = function () {
          resolve(request.result || []);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    });
  }

  function idbPut(product) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRODUCT_STORE, "readwrite");
        tx.objectStore(PRODUCT_STORE).put(product);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function idbPutMany(products) {
    if (!products || !products.length) return Promise.resolve();
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRODUCT_STORE, "readwrite");
        var store = tx.objectStore(PRODUCT_STORE);
        products.forEach(function (product) {
          store.put(product);
        });
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function idbDelete(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRODUCT_STORE, "readwrite");
        tx.objectStore(PRODUCT_STORE).delete(id);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function idbClear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRODUCT_STORE, "readwrite");
        tx.objectStore(PRODUCT_STORE).clear();
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  async function loadProductsFromIdb() {
    try {
      var rows = await idbAll();
      state.idbReady = true;
      if (!rows.length) return;
      var products = rows
        .map(function (row) {
          return normalizeJumiaProduct(row, row.url || "");
        })
        .filter(Boolean);
      rebuildProductState(products);
      log("تم تحميل " + products.length + " منتج من الذاكرة المحلية.", "ok");
    } catch (error) {
      state.idbReady = false;
      log("تعذر تحميل IndexedDB: " + (error && error.message ? error.message : error), "error");
    }
  }

  // ------------------------------------------------------------------
  // Normalisation
  // ------------------------------------------------------------------

  function normalizeSpecs(value) {
    var list = [];
    if (Array.isArray(value)) {
      value.forEach(function (entry) {
        if (!entry) return;
        if (Array.isArray(entry) && entry.length >= 2) {
          list.push({ label: entry[0], value: entry[1] });
        } else if (typeof entry === "object") {
          list.push({
            label: entry.label || entry.name || entry.key || entry.title || "",
            value:
              entry.value ||
              entry.val ||
              entry.text ||
              (Array.isArray(entry.values) ? entry.values.join("، ") : ""),
          });
        } else {
          var text = cleanText(entry);
          var split = text.split(/\s*[:：]\s*/);
          if (split.length >= 2) list.push({ label: split[0], value: split.slice(1).join(": ") });
        }
      });
    } else if (value && typeof value === "object") {
      Object.keys(value).forEach(function (key) {
        var entryValue = value[key];
        if (entryValue == null || entryValue === "") return;
        list.push({
          label: key,
          value: Array.isArray(entryValue) ? entryValue.join("، ") : entryValue,
        });
      });
    } else if (typeof value === "string") {
      value.split(/\r?\n/).forEach(function (line) {
        var match = line.match(/^\s*([^:：]{2,80})\s*[:：]\s*(.+)\s*$/);
        if (match) list.push({ label: match[1], value: match[2] });
      });
    }

    var seen = new Set();
    return list
      .map(function (entry) {
        return {
          label: cleanText(entry.label, 90),
          value: cleanText(entry.value, 800),
        };
      })
      .filter(function (entry) {
        if (!entry.label || !entry.value) return false;
        var key = entry.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 200);
  }

  function normalizeSeller(value) {
    var seller = {
      name: "",
      url: "",
      rating: 0,
      followers: 0,
      performance: [],
      verified: false,
    };
    if (!value) return seller;
    if (typeof value === "string") {
      seller.name = cleanText(value, 120);
      return seller;
    }
    if (typeof value === "object") {
      seller.name = cleanText(value.name || value.seller_name || "", 120);
      seller.url = cleanText(value.url || value.seller_url || "");
      seller.rating = clamp(safeNumber(value.rating || value.positive || value.satisfaction), 0, 100);
      seller.followers = Math.max(0, Math.round(safeNumber(value.followers)));
      seller.verified = Boolean(value.verified);
      if (Array.isArray(value.performance)) {
        seller.performance = value.performance
          .map(function (entry) {
            if (!entry) return null;
            return {
              key: cleanText(entry.key || ""),
              label: cleanText(entry.label || entry.name || "", 120),
              value: cleanText(entry.value || entry.status || "", 80),
            };
          })
          .filter(function (entry) {
            return entry && entry.label && entry.value;
          });
      }
    }
    return seller;
  }

  function normalizeDelivery(value) {
    var delivery = {
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
    if (!value || typeof value !== "object") return delivery;
    delivery.lines = uniqueList(value.lines).slice(0, 20);
    delivery.free_shipping_text = cleanText(value.free_shipping_text || "");
    delivery.pickup_lines = uniqueList(value.pickup_lines).slice(0, 6);
    delivery.home_lines = uniqueList(value.home_lines).slice(0, 6);
    delivery.shipping_fee = safeNumber(value.shipping_fee);
    delivery.free_over = safeNumber(value.free_over);
    delivery.return_policy = cleanText(value.return_policy, 1500);
    delivery.warranty = cleanText(value.warranty, 200);
    delivery.eta_text = cleanText(value.eta_text || "");
    return delivery;
  }

  function normalizeBreadcrumb(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (entry) {
        if (!entry) return null;
        if (typeof entry === "string") return { name: cleanText(entry, 120), url: "" };
        return {
          name: cleanText(entry.name || "", 120),
          url: cleanText(entry.url || "", 500),
        };
      })
      .filter(function (entry) {
        return entry && entry.name;
      })
      .slice(0, 10);
  }

  function normalizeJumiaProduct(raw, fallbackUrl) {
    if (!raw || typeof raw !== "object") return null;
    var product = Object.assign({}, raw);
    var url = canonicalUrl(raw.url || raw.source_url || raw.external_url || fallbackUrl || "");
    var name = cleanText(raw.name || raw.title || raw.product_name || "", 500);
    if (!name) return null;

    var sku = cleanText(raw.sku || raw.SKU || raw.j_sku || "", 80);
    var numericId = cleanText(raw.numeric_id || numericIdFromUrl(url), 40);
    var rawId = cleanText(raw.id || "", 140);
    var id = rawId;
    if (id && id.indexOf("jumia_") !== 0) {
      id = "jumia_" + id.replace(/^jumia[_-]?/i, "");
    }
    if (!id) {
      id = "jumia_" + (sku || numericId || hashText(url || name + "|" + safeNumber(raw.price)));
    }
    id = id.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 150);

    var price = safeNumber(raw.price || raw.sale_price || raw.current_price);
    var originalPrice = safeNumber(
      raw.original_price || raw.old_price || raw.list_price || raw.compare_at_price
    );
    if (originalPrice < price) originalPrice = price;
    var discount = Math.round(
      safeNumber(
        raw.discount_percent !== undefined
          ? raw.discount_percent
          : originalPrice > price
            ? ((originalPrice - price) / originalPrice) * 100
            : 0
      )
    );
    discount = clamp(discount, 0, 99);

    var image = cleanText(raw.image || raw.image_url || raw.thumbnail || "");
    if (!/^https?:\/\//i.test(image)) image = "";
    var images = toUrlList(raw.images || raw.gallery, image);
    image = image || images[0] || "";

    var rating = clamp(safeNumber(raw.rating), 0, 5);
    var reviews = Math.max(
      0,
      Math.round(safeNumber(raw.reviews_count || raw.reviewCount || raw.reviews || raw.review_count))
    );
    var seller = normalizeSeller(raw.seller || raw.vendor || raw.seller_name);
    var delivery = normalizeDelivery(raw.delivery);
    var specs = normalizeSpecs(raw.specs || raw.specifications);
    var highlights = uniqueList(raw.highlights);

    var breadcrumb = normalizeBreadcrumb(raw.breadcrumb);
    var category =
      cleanText(raw.category || raw.main_category || "", 120) ||
      (breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2].name : "") ||
      "منتجات جوميا";
    var status = stockInfo(raw.stock_status, raw.stock_text);
    var fetchedAt = cleanText(raw.fetched_at || "");
    if (!/^\d{4}-\d{2}-\d{2}T/.test(fetchedAt)) fetchedAt = new Date().toISOString();

    product.id = id;
    product.source = "jumia";
    product.url = url;
    product.source_url = url;
    product.external_url = url;
    product.numeric_id = numericId;
    product.sku = sku;
    product.name = name;
    product.brand = cleanText(raw.brand || "", 160);
    product.category = category;
    product.breadcrumb = breadcrumb;
    product.price = price;
    product.original_price = originalPrice;
    product.discount_percent = discount;
    product.currency = cleanText(raw.currency || "EGP", 12) || "EGP";
    product.image = image;
    product.images = images;
    product.description = cleanText(raw.description || raw.details || "", true).slice(0, 8000);
    product.highlights = highlights;
    product.specs = specs;
    product.rating = Math.round(rating * 10) / 10;
    product.reviews_count = reviews;
    product.rating_breakdown =
      raw.rating_breakdown && typeof raw.rating_breakdown === "object"
        ? raw.rating_breakdown
        : null;
    product.seller = seller;
    product.delivery = delivery;
    product.stock_status = status.key;
    product.stock_text = cleanText(raw.stock_text || "", 160);
    product.color = cleanText(raw.color || "", 80);
    product.warranty = cleanText(raw.warranty || delivery.warranty || "", 200);
    product.return_policy = cleanText(raw.return_policy || delivery.return_policy || "", 1500);
    product.related = Array.isArray(raw.related) ? raw.related.slice(0, 16) : [];
    product.reviews_snippet = cleanText(raw.reviews_snippet || "", 800);
    product.fetched_at = fetchedAt;
    product.warnings = Array.isArray(raw.warnings)
      ? raw.warnings.map(function (entry) {
          return cleanText(entry);
        })
      : [];
    product.page_title = cleanText(raw.page_title || "", 300);
    product.ok = raw.ok !== false;
    return product;
  }

  // ------------------------------------------------------------------
  // Product state
  // ------------------------------------------------------------------

  function rebuildProductState(products) {
    state.products = [];
    state.byId.clear();
    state.byUrl.clear();
    var ids = new Set();
    (products || []).forEach(function (product) {
      if (!product || !product.id || ids.has(product.id)) return;
      ids.add(product.id);
      product.changed = isChanged(product);
      state.products.push(product);
      state.byId.set(product.id, product);
      if (product.url) state.byUrl.set(urlKey(product.url), product);
    });
    sortProductsNewest();
  }

  function sortProductsNewest() {
    state.products.sort(function (a, b) {
      return String(b.fetched_at || "").localeCompare(String(a.fetched_at || ""));
    });
  }

  function findSavedRowByUrl(url) {
    var key = urlKey(url);
    if (!key) return null;
    return state.savedByUrl.get(key) || null;
  }

  function upsertScrapedProduct(input) {
    var product = normalizeJumiaProduct(input, input && input.url);
    if (!product) return null;

    var savedMatch = findSavedRowByUrl(product.url);
    if (savedMatch && savedMatch.id && savedMatch.id !== product.id) {
      var oldId = product.id;
      product.id = savedMatch.id;
      if (state.selected.has(oldId)) {
        state.selected.delete(oldId);
        state.selected.add(product.id);
      }
    }

    var existing = state.byId.get(product.id);
    if (!existing && product.url) existing = state.byUrl.get(urlKey(product.url));
    if (existing && existing.id !== product.id) {
      state.selected.delete(existing.id);
      removeProductFromState(existing.id, false);
    }

    product.changed = isChanged(product);
    if (existing) {
      var index = state.products.indexOf(existing);
      if (index !== -1) state.products[index] = product;
      else state.products.unshift(product);
    } else {
      state.products.unshift(product);
    }

    state.byId.set(product.id, product);
    if (product.url) state.byUrl.set(urlKey(product.url), product);
    if (existing && existing.url && urlKey(existing.url) !== urlKey(product.url)) {
      state.byUrl.delete(urlKey(existing.url));
    }

    if (state.idbReady) {
      idbPut(product).catch(function (error) {
        log("تعذر حفظ المنتج محليًا: " + (error && error.message ? error.message : error), "error");
      });
    } else {
      openDb()
        .then(function () {
          state.idbReady = true;
          return idbPut(product);
        })
        .catch(function () {
          state.idbReady = false;
        });
    }

    return product;
  }

  function removeProductFromState(id, removeFromDb) {
    var index = state.products.findIndex(function (product) {
      return product.id === id;
    });
    if (index !== -1) {
      var product = state.products[index];
      state.products.splice(index, 1);
      if (product.url) state.byUrl.delete(urlKey(product.url));
    }
    state.byId.delete(id);
    state.selected.delete(id);
    if (removeFromDb && state.idbReady) {
      idbDelete(id).catch(function () {});
    }
  }

  function recomputeChangedFlags() {
    state.products.forEach(function (product) {
      product.changed = isChanged(product);
    });
  }

  function isChanged(product) {
    if (!product || !product.id) return false;
    var saved = state.savedById.get(product.id);
    if (!saved) return false;
    if (state.hasJumiaColumns === true && saved.j_sku !== undefined && !cleanText(saved.j_sku)) {
      return true;
    }
    return (
      safeNumber(saved.price) !== safeNumber(product.price) ||
      safeNumber(saved.original_price) !== safeNumber(product.original_price) ||
      cleanText(saved.name) !== cleanText(product.name) ||
      cleanText(saved.image) !== cleanText(product.image) ||
      stockKey(saved.stock_status) !== stockKey(product.stock_status)
    );
  }

  function changedProductCount() {
    var ids = new Set();
    state.products.forEach(function (product) {
      if (isChanged(product)) ids.add(product.id);
    });
    state.sync.changes.forEach(function (change) {
      if (change.status === "pending" && change.changes && change.changes.length) {
        ids.add(change.id);
      }
    });
    return ids.size;
  }

  // ------------------------------------------------------------------
  // Crawl engine
  // ------------------------------------------------------------------

  function setCrawlStatus(text) {
    if (el.crawlStatusText) el.crawlStatusText.textContent = text;
  }

  function setCrawlRunning(running) {
    state.crawl.running = Boolean(running);
    if (el.startCrawlBtn) el.startCrawlBtn.disabled = Boolean(running);
    if (el.pauseCrawlBtn) el.pauseCrawlBtn.disabled = !running;
    if (el.stopCrawlBtn) el.stopCrawlBtn.disabled = !running;
    if (el.refreshAllBtn) el.refreshAllBtn.disabled = Boolean(running);
    if (el.pauseCrawlBtn) {
      el.pauseCrawlBtn.innerHTML = state.crawl.paused
        ? '<i class="fa-solid fa-play"></i> متابعة'
        : '<i class="fa-solid fa-pause"></i> إيقاف مؤقت';
    }
    if (!running) {
      state.crawl.phase = "idle";
    }
    updateCrawlProgress();
  }

  function setCurrentProduct(url, product) {
    state.crawl.currentUrl = url || "";
    state.crawl.currentProduct = product || null;
    if (!el.crawlCurrent) return;
    if (!url) {
      el.crawlCurrent.hidden = true;
      return;
    }
    el.crawlCurrent.hidden = false;
    var image = product && product.image ? product.image : PLACEHOLDER_IMAGE;
    if (el.crawlCurrentImg) {
      el.crawlCurrentImg.src = image;
      el.crawlCurrentImg.alt = product && product.name ? product.name : "";
    }
    if (el.crawlCurrentName) {
      el.crawlCurrentName.textContent =
        (product && product.name) || jumiaSlug(url) || "منتج جوميا";
    }
    if (el.crawlCurrentMeta) {
      var parts = [];
      if (state.crawl.queue.length) {
        parts.push(
          "المنتج " +
            Math.min(state.crawl.index + 1, state.crawl.queue.length) +
            " من " +
            state.crawl.queue.length
        );
      }
      if (product && product.price) parts.push(moneyValue(product.price));
      if (product && sellerName(product)) parts.push(sellerName(product));
      if (!product) parts.push(url);
      el.crawlCurrentMeta.textContent = parts.join(" · ");
    }
    if (el.crawlSpinner) {
      el.crawlSpinner.style.display = state.crawl.running && !state.crawl.paused ? "" : "none";
    }
  }

  function buildQueueStatus(url) {
    return state.crawl.statuses.get(url) || { status: "pending", name: "" };
  }

  function setQueueStatus(url, status, name) {
    var current = buildQueueStatus(url);
    state.crawl.statuses.set(url, {
      status: status,
      name: name || current.name || "",
    });
  }

  function renderQueue() {
    if (!el.queueList) return;
    var queue = state.crawl.queue;
    if (!queue.length) {
      el.queueList.innerHTML =
        '<span class="lab-hint" style="margin:0">طابور المنتجات فارغ.</span>';
      return;
    }
    var index = state.crawl.index;
    var start = queue.length > 12 ? Math.max(0, index - 2) : 0;
    var end = Math.min(queue.length, start + 12);
    var html = [];
    for (var i = start; i < end; i += 1) {
      var url = queue[i];
      var info = buildQueueStatus(url);
      var label = info.name || jumiaSlug(url) || url;
      var icon = "fa-circle";
      if (info.status === "done") icon = "fa-circle-check";
      else if (info.status === "failed") icon = "fa-circle-xmark";
      else if (info.status === "current") icon = "fa-spinner fa-spin";
      else if (info.status === "skipped") icon = "fa-forward";
      html.push(
        '<span class="lab-queue-item is-' +
          escapeHtml(info.status) +
          '" title="' +
          escapeHtml(url) +
          '"><i class="fa-solid ' +
          icon +
          '"></i><span>' +
          escapeHtml(label) +
          "</span></span>"
      );
    }
    if (end < queue.length) {
      html.push('<span class="lab-queue-more">+' + (queue.length - end) + " منتج…</span>");
    }
    el.queueList.innerHTML = html.join("");
  }

  function updateCrawlProgress() {
    var crawl = state.crawl;
    var total = crawl.queue.length;
    var processed = crawl.done + crawl.failed;
    if (el.crawlDone) el.crawlDone.textContent = plainNumber(crawl.done);
    if (el.crawlFailed) el.crawlFailed.textContent = plainNumber(crawl.failed);
    if (el.crawlRemaining) {
      el.crawlRemaining.textContent = plainNumber(Math.max(0, total - processed));
    }
    if (el.crawlBar) {
      var percent = total ? Math.round((processed / total) * 100) : 0;
      el.crawlBar.style.width = Math.max(total ? 2 : 0, Math.min(100, percent)) + "%";
    }
    if (el.crawlEta) {
      if (!crawl.running || processed < 1 || !total) {
        el.crawlEta.textContent = "—";
      } else {
        var elapsed = Date.now() - crawl.startedAt;
        var average = elapsed / processed;
        el.crawlEta.textContent = formatDuration(average * Math.max(0, total - processed));
      }
    }
    if (el.crawlSpinner) {
      el.crawlSpinner.style.display = crawl.running && !crawl.paused ? "" : "none";
    }
    if (el.pauseCrawlBtn && crawl.running) {
      el.pauseCrawlBtn.innerHTML = crawl.paused
        ? '<i class="fa-solid fa-play"></i> متابعة'
        : '<i class="fa-solid fa-pause"></i> إيقاف مؤقت';
    }
  }

  function resetCrawlState() {
    state.crawl.queue = [];
    state.crawl.statuses = new Map();
    state.crawl.index = 0;
    state.crawl.done = 0;
    state.crawl.failed = 0;
    state.crawl.startedAt = 0;
    state.crawl.currentUrl = "";
    state.crawl.currentProduct = null;
    state.crawl.consecutiveErrors = 0;
    state.crawl.stopReason = "";
    state.crawl.paused = false;
    state.crawl.stopped = false;
    setCurrentProduct("", null);
    renderQueue();
    updateCrawlProgress();
  }

  function queueHasUrl(url) {
    var key = urlKey(url);
    if (!key) return true;
    for (var index = 0; index < state.crawl.queue.length; index += 1) {
      if (urlKey(state.crawl.queue[index]) === key) return true;
    }
    return false;
  }

  function addUrlToQueue(url, max) {
    if (!url || queueHasUrl(url)) return false;
    if (state.crawl.queue.length >= max) return false;
    state.crawl.queue.push(canonicalUrl(url));
    setQueueStatus(canonicalUrl(url), "pending");
    return true;
  }

  async function buildCrawlQueue(runId) {
    var mode = el.crawlMode ? el.crawlMode.value : "listing";
    var maxProducts = readInt(el.maxProductsInput, 500, 1, 100000);
    var pages = readInt(el.pagesInput, 3, 1, 200);
    var sources = parseSourceLines(el.crawlSources ? el.crawlSources.value : "");
    var skipSaved = el.skipSavedInput ? el.skipSavedInput.checked : false;
    var run = state.crawl;

    if (skipSaved && !state.loadedSaved) {
      await loadSavedIndex({ silent: true });
    }

    var shouldSkip = function (url) {
      if (!skipSaved) return false;
      return Boolean(state.savedByUrl.get(urlKey(url)));
    };

    if (mode === "links") {
      setCrawlStatus("جارٍ تجهيز روابط المنتجات...");
      sources.forEach(function (source) {
        if (state.crawl.stopped || runId !== state.crawl.runId) return;
        if (!/^https?:\/\//i.test(source)) return;
        if (isProductUrl(source)) {
          if (!shouldSkip(source)) addUrlToQueue(source, maxProducts);
        } else {
          log("تخطي رابط ليس صفحة منتج: " + source, "info");
        }
      });
      return;
    }

    if (mode === "sitemap") {
      setCrawlStatus("جارٍ قراءة خريطة موقع جوميا...");
      var sitemapQueue = [];
      var visitedSitemaps = new Set();
      var addSitemap = function (value) {
        var url = cleanText(value);
        if (!url || visitedSitemaps.has(url) || sitemapQueue.indexOf(url) !== -1) return;
        sitemapQueue.push(url);
      };

      if (!sources.length) {
        try {
          var robots = await readRobotsRemote();
          (robots.sitemaps || []).forEach(addSitemap);
          log("robots.txt أعاد " + (robots.sitemaps || []).length + " خريطة.", "info");
        } catch (error) {
          addSitemap("https://www.jumia.com.eg/sitemap.xml");
          log("تعذر قراءة robots.txt: " + error.message, "info");
        }
      } else {
        for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
          var source = sources[sourceIndex];
          if (/robots\.txt/i.test(source)) {
            try {
              var robotsInfo = await readRobotsRemote();
              (robotsInfo.sitemaps || []).forEach(addSitemap);
            } catch (error) {
              log("تعذر قراءة robots.txt: " + error.message, "info");
            }
          } else {
            addSitemap(source);
          }
        }
      }

      var sitemapFetches = 0;
      while (
        sitemapQueue.length &&
        state.crawl.queue.length < maxProducts &&
        sitemapFetches < 30 &&
        !state.crawl.stopped &&
        runId === state.crawl.runId
      ) {
        var sitemapUrl = sitemapQueue.shift();
        if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) continue;
        visitedSitemaps.add(sitemapUrl);
        sitemapFetches += 1;
        try {
          var result = await discoverSitemapRemote(sitemapUrl);
          (result.sitemaps || []).forEach(addSitemap);
          (result.urls || []).forEach(function (entry) {
            if (state.crawl.queue.length >= maxProducts) return;
            if (!isProductUrl(entry) || shouldSkip(entry)) return;
            addUrlToQueue(entry, maxProducts);
          });
          setCrawlStatus(
            "قُرئت " +
              sitemapFetches +
              " خريطة · تم العثور على " +
              state.crawl.queue.length +
              " منتج..."
          );
          log(
            "sitemap " +
              sitemapUrl +
              " → " +
              (result.urls || []).length +
              " رابط · queue=" +
              state.crawl.queue.length,
            "info"
          );
          await sleep(250);
        } catch (error) {
          log("تعذر قراءة sitemap: " + sitemapUrl + " — " + error.message, "error");
          if (error.blocked) {
            state.crawl.stopReason = "blocked";
            state.crawl.stopped = true;
          }
        }
      }
      return;
    }

    // listing mode
    for (var s = 0; s < sources.length; s += 1) {
      if (state.crawl.stopped || runId !== state.crawl.runId) break;
      var listingSource = sources[s];
      if (!/^https?:\/\//i.test(listingSource)) continue;
      for (var page = 1; page <= pages; page += 1) {
        if (state.crawl.stopped || runId !== state.crawl.runId) break;
        if (state.crawl.queue.length >= maxProducts) break;
        setCrawlStatus(
          "جارٍ قراءة الصفحة " +
            page +
            " من " +
            pages +
            " — " +
            (jumiaSlug(listingSource) || listingSource) +
            " · " +
            state.crawl.queue.length +
            " منتج..."
        );
        try {
          var listing = await discoverListingRemote(listingSource, page);
          var cards = listing.products || [];
          log(
            "listing ص" +
              page +
              " · " +
              listingSource +
              " → " +
              cards.length +
              " منتج" +
              (listing.via ? " (" + listing.via + ")" : ""),
            cards.length ? "ok" : "info"
          );
          if (!cards.length) break;
          for (var c = 0; c < cards.length; c += 1) {
            if (state.crawl.queue.length >= maxProducts) break;
            var cardUrl = cards[c] && cards[c].url;
            if (!cardUrl || !isProductUrl(cardUrl) || shouldSkip(cardUrl)) continue;
            addUrlToQueue(cardUrl, maxProducts);
          }
          if (listing.page && listing.next_page === "" && page >= (listing.pages || 1)) break;
          await sleep(450);
        } catch (error) {
          log(
            "تعذر قراءة الصفحة " + page + " من " + listingSource + ": " + error.message,
            "error"
          );
          if (error.blocked) {
            state.crawl.stopReason = "blocked";
            state.crawl.stopped = true;
            break;
          }
        }
      }
      if (state.crawl.queue.length >= maxProducts) break;
    }
  }

  function waitWhilePaused() {
    if (!state.crawl.paused) return Promise.resolve();
    return new Promise(function (resolve) {
      pauseResolve = resolve;
    });
  }

  function scheduleQueueRender(force) {
    var now = Date.now();
    if (!force && now - queueRenderAt < 450) return;
    queueRenderAt = now;
    renderQueue();
  }

  async function processCrawlQueue(runId) {
    var crawl = state.crawl;
    var baseDelay = readDelay();
    var autoSave = el.autoSaveInput ? Boolean(el.autoSaveInput.checked) : false;
    var poolActive = proxyPoolActive();
    var workers = readWorkerCount();
    var nextIndex = 0;
    var autoSaveChain = Promise.resolve();

    if (!poolActive && workers > 1) {
      workers = 1;
      log(
        "السحب المتوازي يحتاج مجمع وسائط. شغّل المجمع أو أضف وسائط — تم الرجوع لعامل واحد.",
        "info"
      );
    }

    if (!crawl.queue.length) return;

    function enqueueAutoSave(product) {
      if (!autoSave) return;
      autoSaveChain = autoSaveChain
        .then(function () {
          return saveProducts([product], { force: false, silent: true });
        })
        .catch(function (error) {
          log("حفظ تلقائي فشل: " + (error.message || error), "error");
        });
    }

    function poolHasNoReady() {
      var stats = state.proxy.stats;
      return Boolean(
        poolActive &&
          stats &&
          Number(stats.total) > 0 &&
          Number(stats.ready) === 0 &&
          Number(stats.inFlight) === 0
      );
    }

    async function worker() {
      while (true) {
        if (crawl.stopped || runId !== crawl.runId) return;
        if (crawl.paused) {
          await waitWhilePaused();
          continue;
        }
        var index = nextIndex;
        if (index >= crawl.queue.length) return;
        nextIndex += 1;

        var url = crawl.queue[index];
        crawl.index = index;
        setQueueStatus(url, "current");
        scheduleQueueRender(true);
        updateCrawlProgress();

        try {
          var payload = await fetchProductRemote(url, { preferPool: poolActive });
          var product = normalizeJumiaProduct(payload.product || payload, url);
          if (!product) throw new Error("تعذر تحليل صفحة المنتج");
          product = upsertScrapedProduct(product);
          crawl.done += 1;
          crawl.consecutiveErrors = 0;
          setQueueStatus(url, "done", product.name);
          setCurrentProduct(url, product);
          log(
            "✓ " +
              product.name +
              " · " +
              moneyValue(product.price) +
              (product.seller && product.seller.name ? " · " + product.seller.name : ""),
            "ok"
          );

          enqueueAutoSave(product);

          if (crawl.done % 25 === 0) rebuildCategoryFilter();
          updateStats();
        } catch (error) {
          crawl.failed += 1;
          crawl.consecutiveErrors += 1;
          setQueueStatus(url, "failed", jumiaSlug(url));
          log("✗ " + url + " — " + (error && error.message ? error.message : error), "error");
          if (error && error.blocked && !poolActive) {
            crawl.stopReason = "blocked";
            crawl.stopped = true;
            setCrawlStatus(
              "توقّف السحب: جوميا رفضت الطلبات (حماية من السحب). أضف وسائط في مجمع الوسائط أو استخدم «لصق HTML»."
            );
            toast(
              "جوميا حجبت السيرفر. أضف قائمة وسائط لمواصلة السحب المتوازي.",
              "error"
            );
            return;
          }
          if (crawl.consecutiveErrors >= (poolActive ? 30 : 8)) {
            crawl.stopReason = "errors";
            crawl.stopped = true;
            setCrawlStatus(
              "توقّف السحب بعد " +
                crawl.consecutiveErrors +
                " أخطاء متتالية. راجع السجل وحالة الوسائط."
            );
            toast("توقف السحب بسبب أخطاء متتالية. راجع السجل.", "error");
            return;
          }
          if (poolHasNoReady()) {
            setCrawlStatus("كل الوسائط في تهدئة — انتظار 15 ثانية قبل المتابعة...");
            await sleep(15000);
            await refreshProxyPool({ silent: true });
          }
        }

        updateCrawlProgress();
        scheduleQueueRender(true);
        if (baseDelay > 0) {
          var jitter = Math.floor(Math.random() * Math.min(1200, Math.max(150, baseDelay * 0.35)));
          await sleep(baseDelay + jitter);
        }
      }
    }

    setCrawlStatus(
      "جارٍ سحب " +
        crawl.queue.length +
        " منتج عبر " +
        workers +
        (workers > 1 ? " عامل متوازٍ" : " عامل") +
        (poolActive ? " ومجمع الوسائط" : "") +
        "..."
    );

    await Promise.all(
      Array.from({ length: workers }, function () {
        return worker();
      })
    );

    if (autoSave) await autoSaveChain;
  }

  async function startCrawl() {
    if (state.crawl.running) return;
    if (!state.apiReady) {
      var connected = await detectApi({ silent: false });
      if (!connected) return;
    }
    var mode = el.crawlMode ? el.crawlMode.value : "listing";
    var sources = parseSourceLines(el.crawlSources ? el.crawlSources.value : "");
    if (!sources.length && mode !== "sitemap") {
      toast("أضف رابط قسم أو بحث من جوميا أولًا.", "error");
      if (el.crawlSources) el.crawlSources.focus();
      return;
    }

    resetCrawlState();
    state.crawl.runId += 1;
    var runId = state.crawl.runId;
    state.crawl.startedAt = Date.now();
    state.crawl.phase = "discovery";
    setCrawlRunning(true);
    setCrawlStatus("جارٍ قراءة صفحات جوميا وتجميع المنتجات...");
    log("بدء السحب · mode=" + mode + " · max=" + readInt(el.maxProductsInput, 500, 1, 100000), "info");

    try {
      await buildCrawlQueue(runId);
      if (state.crawl.stopped || runId !== state.crawl.runId) {
        finishCrawl(runId);
        return;
      }
      if (!state.crawl.queue.length) {
        setCrawlStatus("لم يتم العثور على روابط منتجات. جرّب رابط قسم مختلفًا.");
        toast("لم يتم العثور على منتجات في المصادر المحددة.", "error");
        finishCrawl(runId);
        return;
      }
      state.crawl.phase = "products";
      renderQueue();
      updateCrawlProgress();
      setCrawlStatus("تم تجميع " + state.crawl.queue.length + " منتج. بدء السحب التفصيلي...");
      log("الطابور جاهز: " + state.crawl.queue.length + " منتج.", "ok");
      await processCrawlQueue(runId);
    } catch (error) {
      log("توقف السحب: " + (error && error.message ? error.message : error), "error");
      setCrawlStatus("توقف السحب: " + (error && error.message ? error.message : error));
      toast("توقف السحب: " + (error && error.message ? error.message : error), "error");
    } finally {
      finishCrawl(runId);
    }
  }

  function finishCrawl(runId) {
    if (runId !== state.crawl.runId) return;
    var crawl = state.crawl;
    crawl.running = false;
    crawl.paused = false;
    crawl.phase = "idle";
    if (pauseResolve) {
      pauseResolve();
      pauseResolve = null;
    }
    setCrawlRunning(false);
    setCurrentProduct("", null);
    renderQueue();
    updateCrawlProgress();
    rebuildCategoryFilter();
    recomputeChangedFlags();
    renderGrid();
    renderSaved();
    updateStats();
    persistSettings();
    refreshProxyPool({ silent: true });

    var message =
      "انتهى السحب: " +
      crawl.done +
      " منتج ناجح" +
      (crawl.failed ? " · " + crawl.failed + " فشل" : "") +
      (crawl.queue.length ? " من " + crawl.queue.length : "");
    if (crawl.stopReason === "blocked") {
      message = "توقف السحب بسبب حماية جوميا. استخدم لصق HTML أو الاستيراد للمتابعة.";
    } else if (crawl.stopReason === "errors") {
      message = "توقف السحب بعد أخطاء متتالية. راجع سجل العمليات.";
    }
    setCrawlStatus(message);
    log(message, crawl.stopReason ? "error" : "ok");
    if (crawl.done > 0) toast(message, "success");
    else if (crawl.stopReason) toast(message, "error");
  }

  function togglePauseCrawl() {
    if (!state.crawl.running) return;
    state.crawl.paused = !state.crawl.paused;
    if (state.crawl.paused) {
      setCrawlStatus("السحب متوقف مؤقتًا. اضغط «متابعة» للاستئناف.");
      if (el.crawlSpinner) el.crawlSpinner.style.display = "none";
    } else {
      setCrawlStatus("جارٍ استئناف السحب...");
      if (el.crawlSpinner) el.crawlSpinner.style.display = "";
      if (pauseResolve) {
        pauseResolve();
        pauseResolve = null;
      }
    }
    if (el.pauseCrawlBtn) {
      el.pauseCrawlBtn.innerHTML = state.crawl.paused
        ? '<i class="fa-solid fa-play"></i> متابعة'
        : '<i class="fa-solid fa-pause"></i> إيقاف مؤقت';
    }
  }

  function stopCrawl() {
    if (!state.crawl.running) return;
    state.crawl.stopped = true;
    state.crawl.paused = false;
    if (pauseResolve) {
      pauseResolve();
      pauseResolve = null;
    }
    setCrawlStatus("جارٍ إنهاء السحب...");
    log("طلب إنهاء السحب.", "info");
  }

  async function clearScrapedProducts() {
    if (!state.products.length) {
      toast("لا توجد منتجات مسحوبة لمسحها.", "info");
      return;
    }
    if (state.crawl.running) {
      var stopNow = window.confirm("السحب يعمل الآن. إيقافه ومسح كل المنتجات المسحوبة؟");
      if (!stopNow) return;
      stopCrawl();
      await sleep(400);
    }
    var confirmed = window.confirm(
      "مسح " + state.products.length + " منتج مسحوب من هذه الصفحة والذاكرة المحلية؟\n" +
        "لن تُحذف المنتجات المحفوظة في Supabase."
    );
    if (!confirmed) return;
    state.products = [];
    state.byId.clear();
    state.byUrl.clear();
    state.selected.clear();
    state.visibleCount = PAGE_SIZE;
    resetCrawlState();
    try {
      await idbClear();
    } catch (_error) {
      // لا مشكلة: الذاكرة فارغة أصلًا.
    }
    rebuildCategoryFilter();
    renderGrid();
    updateStats();
    setCrawlStatus("تم مسح المنتجات المسحوبة. جاهز لسحب جديد.");
    toast("تم مسح المنتجات المسحوبة.", "success");
    log("cleared scraped products", "info");
  }

  function exportProductsJson() {
    if (!state.products.length) {
      toast("لا توجد منتجات لتصديرها.", "info");
      return;
    }
    var payload = {
      exported_at: new Date().toISOString(),
      source: "jumia.com.eg",
      count: state.products.length,
      products: state.products,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download =
      "jumia-products-" +
      new Date().toISOString().slice(0, 10) +
      "-" +
      new Date().toTimeString().slice(0, 5).replace(":", "") +
      ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
    toast("تم تصدير " + state.products.length + " منتج.", "success");
  }

  // ------------------------------------------------------------------
  // Products rendering
  // ------------------------------------------------------------------

  function rebuildCategoryFilter() {
    if (!el.productCategory) return;
    var counts = new Map();
    state.products.forEach(function (product) {
      var category = cleanText(product.category || "غير مصنف");
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    var previous = el.productCategory.value;
    var options = Array.from(counts.entries())
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .slice(0, 100)
      .map(function (entry) {
        return (
          '<option value="' +
          escapeHtml(entry[0]) +
          '">' +
          escapeHtml(entry[0]) +
          " (" +
          entry[1] +
          ")</option>"
        );
      })
      .join("");
    el.productCategory.innerHTML = '<option value="">كل الأقسام</option>' + options;
    if (counts.has(previous)) el.productCategory.value = previous;
  }

  function productMatchesQuery(product, query) {
    if (!query) return true;
    var haystack = norm(
      [
        product.name,
        product.id,
        product.sku,
        product.brand,
        product.category,
        sellerName(product),
        product.color,
        product.url,
      ].join(" ")
    );
    var words = query.split(" ").filter(Boolean);
    if (!words.length) return true;
    for (var index = 0; index < words.length; index += 1) {
      if (haystack.indexOf(words[index]) === -1) return false;
    }
    return true;
  }

  function getFilteredProducts() {
    var query = norm(el.productSearch ? el.productSearch.value : "");
    var category = el.productCategory ? el.productCategory.value : "";
    var onlySelected = el.onlySelected ? el.onlySelected.checked : false;
    var onlyDiscount = el.onlyDiscount ? el.onlyDiscount.checked : false;
    var onlySaved = el.onlySaved ? el.onlySaved.checked : false;
    var onlyChanged = el.onlyChanged ? el.onlyChanged.checked : false;
    var sort = el.productSort ? el.productSort.value : "newest";

    var rows = state.products.filter(function (product) {
      if (category && product.category !== category) return false;
      if (onlySelected && !state.selected.has(product.id)) return false;
      if (onlyDiscount && !(product.original_price > product.price)) return false;
      if (onlySaved && !state.savedIds.has(product.id)) return false;
      if (onlyChanged && !isChanged(product)) return false;
      if (!productMatchesQuery(product, query)) return false;
      return true;
    });

    switch (sort) {
      case "price-asc":
        rows.sort(function (a, b) {
          return safeNumber(a.price) - safeNumber(b.price);
        });
        break;
      case "price-desc":
        rows.sort(function (a, b) {
          return safeNumber(b.price) - safeNumber(a.price);
        });
        break;
      case "discount":
        rows.sort(function (a, b) {
          return discountOf(b) - discountOf(a);
        });
        break;
      case "rating":
        rows.sort(function (a, b) {
          return safeNumber(b.rating) - safeNumber(a.rating);
        });
        break;
      case "name":
        rows.sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name), "ar");
        });
        break;
      default:
        rows.sort(function (a, b) {
          return String(b.fetched_at || "").localeCompare(String(a.fetched_at || ""));
        });
        break;
    }
    return rows;
  }

  function discountOf(product) {
    var price = safeNumber(product.price);
    var original = safeNumber(product.original_price);
    if (original > price && original > 0) {
      return Math.round(((original - price) / original) * 100);
    }
    return clamp(Math.round(safeNumber(product.discount_percent)), 0, 99);
  }

  function ratingMarkup(product) {
    var rating = safeNumber(product.rating);
    var reviews = Math.round(safeNumber(product.reviews_count));
    if (rating > 0) {
      return (
        '<span class="lab-rating"><i class="fa-solid fa-star"></i>' +
        rating.toFixed(1) +
        (reviews ? ' <span>(' + plainNumber(reviews) + ")</span>" : "") +
        "</span>"
      );
    }
    if (reviews > 0) {
      return (
        '<span class="lab-rating"><i class="fa-regular fa-star"></i>بدون تقييم <span>(' +
        plainNumber(reviews) +
        ")</span></span>"
      );
    }
    return '<span class="lab-rating"><i class="fa-regular fa-star"></i>لم يُقيّم بعد</span>';
  }

  function imageTag(src, alt, className) {
    return (
      '<img src="' +
      escapeHtml(src || PLACEHOLDER_IMAGE) +
      '" alt="' +
      escapeHtml(alt || "") +
      '"' +
      (className ? ' class="' + escapeHtml(className) + '"' : "") +
      ' loading="lazy" onerror="this.onerror=null;this.src=\'' +
      PLACEHOLDER_IMAGE +
      "'\" />"
    );
  }

  function cardMarkup(product) {
    var selected = state.selected.has(product.id);
    var saved = state.savedIds.has(product.id);
    var changed = isChanged(product);
    var discount = discountOf(product);
    var stock = stockInfo(product.stock_status, product.stock_text);
    var seller = sellerName(product);
    var sellerPercent = sellerRating(product);
    var specsCount = Array.isArray(product.specs) ? product.specs.length : 0;
    var imageCount = Array.isArray(product.images) ? product.images.length : 0;
    var external = productExternalUrl(product);
    var idAttr = escapeHtml(product.id);
    var oldPrice =
      discount > 0
        ? "<del>" + escapeHtml(moneyValue(product.original_price)) + "</del>"
        : "";
    var discountTag = discount > 0 ? '<span class="lab-discount">-' + discount + "%</span>" : "";

    return (
      '<article class="lab-card' +
      (selected ? " is-selected" : "") +
      (saved ? " is-saved" : "") +
      (changed ? " is-changed" : "") +
      '" data-id="' +
      idAttr +
      '">' +
      '<div class="lab-card-media">' +
      imageTag(product.image, product.name) +
      '<div class="lab-badge-row">' +
      '<label class="lab-check" title="تحديد">' +
      '<input type="checkbox" data-select="' +
      idAttr +
      '"' +
      (selected ? " checked" : "") +
      " />" +
      "</label>" +
      '<span class="lab-badge source-jumia">جوميا</span>' +
      "</div>" +
      '<div class="lab-media-badges">' +
      (saved ? '<span class="lab-badge saved">محفوظ</span>' : "") +
      (changed ? '<span class="lab-badge changed">تغيّر</span>' : "") +
      "</div>" +
      "</div>" +
      '<div class="lab-card-body">' +
      "<h4 title=\"" +
      escapeHtml(product.name) +
      '">' +
      escapeHtml(product.name) +
      "</h4>" +
      '<span class="lab-card-brand">' +
      escapeHtml([product.brand, product.category].filter(Boolean).join(" · ") || "جوميا مصر") +
      "</span>" +
      (seller
        ? '<span class="lab-seller" title="البائع"><i class="fa-solid fa-store"></i>' +
          escapeHtml(seller) +
          (sellerPercent
            ? '<em><i class="fa-solid fa-thumbs-up"></i> ' + sellerPercent + "%</em>"
            : "") +
          "</span>"
        : "") +
      '<div class="lab-price-row"><strong>' +
      escapeHtml(moneyValue(product.price)) +
      "</strong>" +
      oldPrice +
      discountTag +
      "</div>" +
      ratingMarkup(product) +
      '<div class="lab-tags">' +
      '<span class="lab-tag ' +
      stock.cls +
      '">' +
      escapeHtml(stock.label) +
      "</span>" +
      (specsCount
        ? '<span class="lab-tag"><i class="fa-solid fa-list"></i> ' + specsCount + " مواصفة</span>"
        : "") +
      (imageCount > 1
        ? '<span class="lab-tag"><i class="fa-regular fa-images"></i> ' + imageCount + "</span>"
        : "") +
      (product.delivery && product.delivery.free_shipping_text
        ? '<span class="lab-tag is-green"><i class="fa-solid fa-truck-fast"></i> شحن مجاني</span>'
        : "") +
      (product.warranty
        ? '<span class="lab-tag"><i class="fa-solid fa-shield-halved"></i> ' +
          escapeHtml(product.warranty) +
          "</span>"
        : "") +
      "</div>" +
      '<div class="lab-card-actions">' +
      '<button type="button" data-action="details" data-id="' +
      idAttr +
      '"><i class="fa-solid fa-eye"></i> تفاصيل</button>' +
      '<button type="button" class="is-primary" data-action="save" data-id="' +
      idAttr +
      '"><i class="fa-solid fa-floppy-disk"></i> ' +
      (saved ? (changed ? "تحديث" : "محفوظ") : "حفظ") +
      "</button>" +
      (external
        ? '<a href="' +
          escapeHtml(external) +
          '" target="_blank" rel="noopener noreferrer" title="فتح المنتج على جوميا"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>'
        : "") +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function renderGrid() {
    if (!el.labGrid) return;
    var filtered = getFilteredProducts();
    var visible = filtered.slice(0, state.visibleCount);
    el.labGrid.innerHTML = visible.map(cardMarkup).join("");

    if (el.labEmpty) {
      el.labEmpty.style.display = filtered.length ? "none" : "flex";
      var text = el.labEmpty.querySelector("p");
      if (text) {
        text.textContent = state.products.length
          ? "لا توجد منتجات مطابقة للفلاتر الحالية."
          : "لا توجد منتجات بعد. ابدأ السحب من تبويب «سحب جوميا».";
      }
    }
    if (el.loadMoreBtn) {
      var more = filtered.length > state.visibleCount;
      el.loadMoreBtn.style.display = more ? "" : "none";
      el.loadMoreBtn.textContent =
        "عرض المزيد (" + Math.min(state.visibleCount, filtered.length) + "/" + filtered.length + ")";
    }
    if (el.productsStatus) {
      var parts = [];
      parts.push("عرض " + Math.min(state.visibleCount, filtered.length) + " من " + filtered.length);
      if (filtered.length !== state.products.length) {
        parts.push("إجمالي " + state.products.length + " مسحوب");
      } else {
        parts.push(state.products.length + " منتج مسحوب");
      }
      if (savedTotalCount()) parts.push(savedTotalCount() + " محفوظ");
      el.productsStatus.textContent = parts.join(" · ");
    }
  }

  function updateStats() {
    var pending = state.products.filter(function (product) {
      return !state.savedIds.has(product.id);
    }).length;
    var changed = changedProductCount();
    var filteredCount = getFilteredProducts().length;

    if (el.statScraped) el.statScraped.textContent = plainNumber(state.products.length);
    if (el.statPending) el.statPending.textContent = plainNumber(pending);
    if (el.statSelected) el.statSelected.textContent = plainNumber(state.selected.size);
    if (el.statSaved) el.statSaved.textContent = plainNumber(savedTotalCount());
    if (el.statChanged) el.statChanged.textContent = plainNumber(changed);
    if (el.productsTabCount) el.productsTabCount.textContent = plainNumber(state.products.length);
    if (el.savedTabCount) el.savedTabCount.textContent = plainNumber(savedTotalCount());
    if (el.selectedCount) el.selectedCount.textContent = plainNumber(state.selected.size);
    if (el.selectAllCount) el.selectAllCount.textContent = plainNumber(filteredCount);

    if (el.saveSelectedBtn) el.saveSelectedBtn.disabled = state.selected.size === 0;
    if (el.saveAllBtn) el.saveAllBtn.disabled = state.products.length === 0;
    if (el.updateSelectedBtn) {
      var hasSavedSelection = Array.from(state.selected).some(function (id) {
        return state.savedIds.has(id);
      });
      el.updateSelectedBtn.disabled = !hasSavedSelection;
    }
    if (el.bulkBar) {
      el.bulkBar.classList.toggle(
        "is-visible",
        state.selected.size > 0 && !state.bulkHidden
      );
    }
  }

  function toggleSelection(id, selected) {
    if (!id) return;
    if (selected) {
      state.selected.add(id);
      state.bulkHidden = false;
    } else {
      state.selected.delete(id);
    }
    var card = null;
    if (el.labGrid) {
      qsa(".lab-card", el.labGrid).some(function (node) {
        if (node.getAttribute("data-id") === id) {
          card = node;
          return true;
        }
        return false;
      });
    }
    if (card) card.classList.toggle("is-selected", selected);
    updateStats();
  }

  function selectAllFiltered() {
    var filtered = getFilteredProducts();
    filtered.forEach(function (product) {
      state.selected.add(product.id);
    });
    if (filtered.length) state.bulkHidden = false;
    renderGrid();
    updateStats();
    toast("تم تحديد " + filtered.length + " منتج.", filtered.length ? "success" : "info");
  }

  function selectVisible() {
    var filtered = getFilteredProducts();
    filtered.slice(0, state.visibleCount).forEach(function (product) {
      state.selected.add(product.id);
    });
    state.bulkHidden = false;
    renderGrid();
    updateStats();
  }

  function invertSelection() {
    var filtered = getFilteredProducts();
    filtered.forEach(function (product) {
      if (state.selected.has(product.id)) state.selected.delete(product.id);
      else state.selected.add(product.id);
    });
    if (state.selected.size) state.bulkHidden = false;
    renderGrid();
    updateStats();
  }

  function clearSelection() {
    state.selected.clear();
    renderGrid();
    updateStats();
  }

  // ------------------------------------------------------------------
  // Supabase
  // ------------------------------------------------------------------

  function initSupabase() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      state.supabaseReady = false;
      log("supabase-js غير محمّل. أعد تحميل الصفحة.", "error");
      return;
    }
    try {
      supabaseClient = window.supabase.createClient(
        window.SUPABASE_URL || SUPABASE_URL,
        window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
        { auth: { persistSession: false } }
      );
      state.supabaseReady = true;
    } catch (error) {
      state.supabaseReady = false;
      log("تعذر تهيئة Supabase: " + (error && error.message ? error.message : error), "error");
    }
  }

  function ensureSupabase() {
    if (!supabaseClient) initSupabase();
    if (!supabaseClient) {
      toast("Supabase غير محمّل. أعد تحميل الصفحة.", "error");
      return false;
    }
    return true;
  }

  function isMissingColumnError(error) {
    if (!error) return false;
    var code = String(error.code || "");
    var text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
    if (code === "42703" || code === "PGRST204") return true;
    return /column .* does not exist|could not find the ['"]?.*['"]? column|schema cache/i.test(text);
  }

  function isStatementTimeout(error) {
    if (!error) return false;
    var code = String(error.code || "");
    var text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
    return code === "57014" || /statement timeout|canceling statement/i.test(text);
  }

  function chunkList(list, size) {
    var chunks = [];
    for (var index = 0; index < list.length; index += size) {
      chunks.push(list.slice(index, index + size));
    }
    return chunks;
  }

  function parseHistory(value) {
    var list = value;
    if (typeof value === "string") {
      try {
        list = JSON.parse(value);
      } catch (_error) {
        list = [];
      }
    }
    if (!Array.isArray(list)) return [];
    return list
      .map(function (entry) {
        if (!entry || typeof entry !== "object") return null;
        var price = safeNumber(entry.price);
        if (!(price > 0)) return null;
        return {
          at: cleanText(entry.at || entry.date || ""),
          price: price,
          original_price: safeNumber(entry.original_price || entry.original || price),
        };
      })
      .filter(Boolean)
      .slice(-60);
  }

  function buildPriceHistory(existing, product, now) {
    var history = [];
    if (existing) {
      history = parseHistory(existing.j_price_history);
      if (!history.length) history = parseHistory(existing.price_history);
    }
    var price = safeNumber(product.price);
    var original = Math.max(price, safeNumber(product.original_price));
    var last = history[history.length - 1];
    if (
      !last ||
      safeNumber(last.price) !== price ||
      safeNumber(last.original_price) !== original
    ) {
      history.push({
        at: now,
        price: price,
        original_price: original,
      });
    }
    return history.slice(-50);
  }

  function buildJumiaRow(product, options) {
    var opts = options || {};
    var now = opts.now || new Date().toISOString();
    var existing = opts.existing || null;
    var active = Boolean(opts.active);
    var url = productExternalUrl(product);
    var sku =
      cleanText(product.sku || "") ||
      (product.id ? product.id.replace(/^jumia_/i, "") : "");
    var seller = normalizeSeller(product.seller);
    var delivery = normalizeDelivery(product.delivery);
    var specs = normalizeSpecs(product.specs || product.specifications);
    var highlights = uniqueList(product.highlights);
    if (!highlights.length) highlights = JUMIA_HIGHLIGHTS.slice();
    var breadcrumb = normalizeBreadcrumb(product.breadcrumb);
    var images = toUrlList(product.images, product.image);
    var image = cleanText(product.image || images[0] || "");
    var description = cleanText(product.description || "", true) || JUMIA_DESCRIPTION;
    var category = cleanText(product.category || "منتجات جوميا", 120);
    var stock = stockInfo(product.stock_status, product.stock_text);
    var rating = safeNumber(product.rating);
    var reviews = Math.round(safeNumber(product.reviews_count));
    var history = buildPriceHistory(existing, product, now);
    var price = safeNumber(product.price);
    var originalPrice = Math.max(price, safeNumber(product.original_price));
    var stockValue = stock.key === "out_of_stock" ? 0 : stock.key === "low_stock" ? 5 : 99;
    var related = Array.isArray(product.related) ? product.related.slice(0, 16) : [];

    var rawJumia = Object.assign({}, product, {
      id: product.id,
      sku: sku,
      url: url,
      name: product.name,
      price: price,
      original_price: originalPrice,
      image: image,
      images: images,
      seller: seller,
      delivery: delivery,
      specs: specs,
      highlights: highlights,
      breadcrumb: breadcrumb,
      related: related,
      price_history: history,
    });

    var rawData = {
      saved_from: "product-lab",
      saved_at: now,
      supplier_source: "jumia",
      supplier_id: product.id,
      external_url: url,
      source_url: url,
      rating: rating,
      reviews: reviews,
      highlights: highlights,
      specifications: specs,
      specs: specs,
      seller: seller.name || "جوميا مصر",
      seller_info: seller,
      delivery: delivery,
      breadcrumb: breadcrumb,
      related: related,
      warranty: cleanText(product.warranty || delivery.warranty || ""),
      return_policy: cleanText(product.return_policy || delivery.return_policy || ""),
      price_history: history,
      jumia: rawJumia,
    };

    var base = {
      id: product.id,
      taager_product_id: sku || product.id,
      name: product.name,
      description: description,
      category: category,
      brand: cleanText(product.brand || "") || null,
      price: price,
      original_price: originalPrice,
      image: image,
      images: images,
      available_countries: ["EG"],
      stock: stockValue,
      stock_status: stock.key,
      source: "jumia",
      is_active: active,
      seller: seller.name || "جوميا مصر",
      taager_code: url,
      raw_data: rawData,
      updated_at: now,
    };

    var rich = {
      j_sku: sku || null,
      j_url: url || null,
      j_seller_name: seller.name || null,
      j_seller_url: seller.url || null,
      j_seller_rating: seller.rating > 0 ? seller.rating : null,
      j_seller_followers: seller.followers > 0 ? seller.followers : 0,
      j_seller_performance: seller.performance.length ? seller.performance : [],
      j_rating: rating,
      j_reviews_count: reviews,
      j_rating_breakdown: product.rating_breakdown || null,
      j_specs: specs,
      j_highlights: highlights,
      j_breadcrumb: breadcrumb,
      j_delivery: delivery,
      j_related: related,
      j_warranty: cleanText(product.warranty || delivery.warranty || "") || null,
      j_return_policy: cleanText(product.return_policy || delivery.return_policy || "") || null,
      j_stock_text: cleanText(product.stock_text || "") || null,
      j_discount: discountOf(product),
      j_currency: cleanText(product.currency || "EGP", 12) || "EGP",
      j_scraped_at: product.fetched_at || now,
      j_price_history: history,
      j_raw: rawJumia,
      rating: rating,
      review_count: reviews,
      rating_source: "jumia",
      external_url: url || null,
    };

    return {
      full: Object.assign({}, base, rich),
      safe: base,
      history: history,
    };
  }

  async function upsertRows(rows) {
    try {
      var result = await supabaseClient.from("taager_products").upsert(rows, {
        onConflict: "id",
      });
      return result || { error: null };
    } catch (error) {
      return { error: error };
    }
  }

  var richWarningShown = false;

  async function flushRows(builtRows) {
    if (!builtRows.length) return;
    if (state.hasJumiaColumns !== false) {
      var fullResult = await upsertRows(
        builtRows.map(function (row) {
          return row.full;
        })
      );
      if (!fullResult.error) {
        state.hasJumiaColumns = true;
        return;
      }
      if (!isMissingColumnError(fullResult.error)) throw fullResult.error;
      state.hasJumiaColumns = false;
      log("أعمدة j_* غير موجودة؛ سيتم الحفظ بالأعمدة الأساسية + raw_data.", "info");
      if (!richWarningShown) {
        richWarningShown = true;
        toast("الحفظ يعمل، لكن أعمدة j_* غير مضافة. شغّل sql/jumia-products.sql لتفعيلها.", "info");
      }
    }

    var safeResult = await upsertRows(
      builtRows.map(function (row) {
        return row.safe;
      })
    );
    if (safeResult.error) throw safeResult.error;
  }

  function applyRowToSavedIndex(product, built) {
    var existing = state.savedById.get(product.id) || findSavedRowByUrl(product.url);
    var row = state.hasJumiaColumns !== false ? built.full : built.safe;
    var next = Object.assign({}, existing || {}, {
      id: product.id,
      name: row.name,
      category: row.category,
      brand: row.brand,
      price: row.price,
      original_price: row.original_price,
      image: row.image,
      images: row.images,
      source: "jumia",
      is_active: row.is_active,
      updated_at: row.updated_at,
      taager_code: row.taager_code,
      stock: row.stock,
      stock_status: row.stock_status,
    });
    if (state.hasJumiaColumns !== false) {
      next.j_sku = row.j_sku;
      next.j_url = row.j_url;
      next.j_price_history = row.j_price_history;
      next.j_seller_name = row.j_seller_name;
      next.j_seller_rating = row.j_seller_rating;
      next.j_reviews_count = row.j_reviews_count;
    }

    var existed = Boolean(existing);
    if (!existed) state.saved.unshift(next);
    else {
      var index = state.saved.indexOf(existing);
      if (index !== -1) state.saved[index] = next;
    }
    state.savedById.set(product.id, next);
    if (row.taager_code) state.savedByUrl.set(urlKey(row.taager_code), next);
    state.savedIds.add(product.id);
    product.changed = false;
  }

  function markAsSaved(product) {
    if (!product) return;
    state.savedIds.add(product.id);
    product.changed = false;
  }

  function openSaveModal(title, hint) {
    if (!el.saveModal) return;
    el.saveModal.classList.add("is-open");
    el.saveModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (el.saveModalTitle) el.saveModalTitle.textContent = title || "جارٍ الحفظ في Supabase...";
    if (el.saveModalHint) el.saveModalHint.textContent = hint || "لا تغلق الصفحة أثناء الحفظ.";
    if (el.saveBar) el.saveBar.style.width = "0%";
    if (el.saveStats) el.saveStats.innerHTML = "";
    if (el.saveDiffs) el.saveDiffs.innerHTML = "";
  }

  function closeSaveModal() {
    if (!el.saveModal) return;
    el.saveModal.classList.remove("is-open");
    el.saveModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function setSaveProgress(done, total) {
    var percent = total ? Math.round((done / total) * 100) : 0;
    if (el.saveBar) el.saveBar.style.width = Math.max(2, Math.min(100, percent)) + "%";
    if (el.saveStats) {
      el.saveStats.textContent = "تم " + plainNumber(done) + " من " + plainNumber(total);
    }
  }

  function addSaveDiff(kind, title, detail) {
    if (!el.saveDiffs) return;
    if (el.saveDiffs.children.length >= 250) return;
    var node = document.createElement("div");
    node.className = "lab-save-diff is-" + (kind || "info");
    node.innerHTML =
      '<span class="lab-save-diff-title">' +
      escapeHtml(title) +
      "</span>" +
      (detail ? '<span class="lab-save-diff-detail">' + escapeHtml(detail) + "</span>" : "");
    el.saveDiffs.appendChild(node);
  }

  function finishSaveModal(result) {
    if (!el.saveModal) return;
    if (el.saveModalTitle) el.saveModalTitle.textContent = "اكتمل الحفظ";
    if (el.saveModalHint) {
      el.saveModalHint.textContent =
        "تم حفظ " +
        plainNumber(result.saved) +
        " · تم تخطي " +
        plainNumber(result.skipped) +
        " بدون تغيير · فشل " +
        plainNumber(result.failed) +
        ". يمكنك إغلاق النافذة.";
    }
    if (el.saveBar) el.saveBar.style.width = "100%";
    if (el.saveStats) {
      el.saveStats.textContent =
        "محفوظ " +
        plainNumber(result.saved) +
        " · متخطى " +
        plainNumber(result.skipped) +
        " · فشل " +
        plainNumber(result.failed);
    }
  }

  async function saveProducts(products, options) {
    var opts = options || {};
    if (!ensureSupabase()) return { saved: 0, skipped: 0, failed: 0 };
    var list = [];
    var seen = new Set();
    (products || []).forEach(function (product) {
      if (!product || !product.id || !product.name || seen.has(product.id)) return;
      seen.add(product.id);
      list.push(product);
    });
    if (!list.length) {
      toast("لا توجد منتجات صالحة للحفظ.", "info");
      return { saved: 0, skipped: 0, failed: 0 };
    }

    var jobs = [];
    var skipped = 0;
    list.forEach(function (product) {
      var existing = state.savedById.get(product.id) || findSavedRowByUrl(product.url);
      var changed = isChanged(product);
      var active =
        opts.active !== undefined
          ? Boolean(opts.active)
          : existing
            ? Boolean(existing.is_active)
            : el.activateOnSave
              ? Boolean(el.activateOnSave.checked)
              : false;
      if (!opts.force && existing && !changed) {
        skipped += 1;
        markAsSaved(product);
        return;
      }
      jobs.push({
        product: product,
        existing: existing || null,
        active: active,
        kind: !existing ? "new" : changed ? "update" : "refresh",
      });
    });

    if (!jobs.length) {
      scheduleServerSync(
        list.map(function (product) {
          return product.id;
        })
      );
      updateStats();
      renderGrid();
      if (!opts.silent) {
        toast("كل المنتجات المحددة محفوظة بالفعل ولا توجد تغييرات.", "info");
      }
      return { saved: 0, skipped: skipped, failed: 0 };
    }

    if (!opts.silent) {
      openSaveModal(
        "جارٍ حفظ " + plainNumber(jobs.length) + " منتج في Supabase...",
        "يتم تحديث الصفوف الموجودة واستبدال بياناتها بالبيانات الجديدة."
      );
      setSaveProgress(0, list.length);
    }

    var savedCount = 0;
    var failed = 0;
    var processed = skipped;
    var groups = chunkList(jobs, SAVE_CHUNK);
    var completed = false;

    try {
      for (var groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
        var group = groups[groupIndex];
        var builtRows = group.map(function (job) {
          return buildJumiaRow(job.product, {
            existing: job.existing,
            active: job.active,
          });
        });
        await flushRows(builtRows);
        group.forEach(function (job, index) {
          applyRowToSavedIndex(job.product, builtRows[index]);
          savedCount += 1;
          processed += 1;
          if (job.kind === "new") {
            addSaveDiff(
              "new",
              job.product.name,
              "جديد · " + moneyValue(job.product.price)
            );
          } else if (job.kind === "update") {
            var oldPrice = job.existing ? safeNumber(job.existing.price) : 0;
            var newPrice = safeNumber(job.product.price);
            addSaveDiff(
              "update",
              job.product.name,
              oldPrice !== newPrice
                ? moneyValue(oldPrice) + " → " + moneyValue(newPrice)
                : "تم تحديث بيانات المنتج"
            );
          }
        });
        if (el.saveBar) {
          setSaveProgress(processed, list.length);
        }
        await sleep(30);
      }
      completed = true;
    } catch (error) {
      failed = list.length - processed;
      addSaveDiff("error", "فشل الحفظ", error && error.message ? error.message : String(error));
      log("save failed: " + (error && error.message ? error.message : error), "error");
      toast("تعذر الحفظ: " + (error && error.message ? error.message : error), "error");
    }

    if (!opts.silent) {
      setSaveProgress(processed, list.length);
      finishSaveModal({ saved: savedCount, skipped: skipped, failed: failed });
    }

    recomputeChangedFlags();
    renderGrid();
    renderSaved();
    updateStats();
    if (completed && savedCount > 0) {
      scheduleServerSync(
        list.map(function (product) {
          return product.id;
        })
      );
      toast(
        "تم حفظ " + plainNumber(savedCount) + " منتج" +
          (skipped ? " وتخطي " + plainNumber(skipped) + " بدون تغيير" : "") +
          ".",
        "success"
      );
      log(
        "save ok: " + savedCount + " saved · " + skipped + " skipped · active preserved",
        "ok"
      );
    }
    return { saved: savedCount, skipped: skipped, failed: failed };
  }

  async function saveSelectedProducts() {
    var list = state.products.filter(function (product) {
      return state.selected.has(product.id);
    });
    if (!list.length) {
      toast("حدد منتجات أولًا.", "info");
      return;
    }
    await saveProducts(list, { force: false });
  }

  async function saveAllProducts() {
    if (!state.products.length) {
      toast("لا توجد منتجات محفوظة محليًا.", "info");
      return;
    }
    if (state.products.length > 200) {
      var confirmed = window.confirm(
        "حفظ " + state.products.length + " منتج في Supabase؟\n" +
          "الصفوف غير المتغيرة سيتم تخطيها تلقائيًا."
      );
      if (!confirmed) return;
    }
    await saveProducts(state.products, { force: false });
  }

  async function updateSelectedProducts() {
    var list = state.products.filter(function (product) {
      return state.selected.has(product.id) && state.savedIds.has(product.id);
    });
    if (!list.length) {
      toast("حدد منتجات محفوظة مسبقًا لتحديث أسعارها.", "info");
      return;
    }
    await saveProducts(list, { force: false });
  }

  // ------------------------------------------------------------------
  // Saved rows
  // ------------------------------------------------------------------

  function savedTotalCount() {
    return state.savedTotal > 0 ? state.savedTotal : state.saved.length;
  }

  function markJumiaColumnsMissing() {
    state.hasJumiaColumns = false;
    if (el.sqlStatusSelect && el.sqlStatusSelect.value !== "later") {
      el.sqlStatusSelect.value = "later";
      persistSettings();
      updateSqlState();
      updateSetupSummary();
    }
  }

  function markJumiaColumnsRich() {
    state.hasJumiaColumns = true;
    if (el.sqlStatusSelect && el.sqlStatusSelect.value !== "done") {
      el.sqlStatusSelect.value = "done";
      persistSettings();
      updateSqlState();
      updateSetupSummary();
    }
  }

  // العدد الحقيقي من السيرفر: count=planned سريع حتى مع مئات الآلاف من الصفوف،
  // بينما count=exact يسبب statement timeout على السيرفر الأساسي.
  async function fetchSavedTotal() {
    var result = await supabaseClient
      .from("taager_products")
      .select("id", { count: "planned", head: true })
      .eq("source", "jumia");
    if (!result.error && typeof result.count === "number") return result.count;
    var alternative = await supabaseClient
      .from("taager_products")
      .select("id", { count: "estimated", head: true })
      .eq("source", "jumia");
    if (!alternative.error && typeof alternative.count === "number") return alternative.count;
    return 0;
  }

  // صفحة واحدة فقط من نفس السيرفر المختار، بدون ORDER BY (يسبب timeout).
  // الترتيب في الواجهة محلي على الصفوف المحمّلة فقط.
  async function fetchSavedPage(from, size) {
    var useRich = state.hasJumiaColumns !== false;
    var pageSize = Math.min(size, savedFetchPageSize || size);
    var timeoutRetries = 0;
    while (true) {
      var result = await supabaseClient
        .from("taager_products")
        .select(useRich ? SAVED_RICH_COLUMNS : SAVED_BASE_COLUMNS)
        .eq("source", "jumia")
        .range(from, from + pageSize - 1);

      if (result.error && useRich && isMissingColumnError(result.error)) {
        markJumiaColumnsMissing();
        useRich = false;
        result = await supabaseClient
          .from("taager_products")
          .select(SAVED_BASE_COLUMNS)
          .eq("source", "jumia")
          .range(from, from + pageSize - 1);
      }

      if (result.error && isStatementTimeout(result.error) && timeoutRetries < 4) {
        timeoutRetries += 1;
        if (useRich) {
          markJumiaColumnsMissing();
          useRich = false;
          result = await supabaseClient
            .from("taager_products")
            .select(SAVED_BASE_COLUMNS)
            .eq("source", "jumia")
            .range(from, from + pageSize - 1);
        }
        if (result.error && isStatementTimeout(result.error)) {
          pageSize = Math.max(50, Math.floor(pageSize / 2));
          savedFetchPageSize = pageSize;
          continue;
        }
      }

      if (result.error) throw result.error;
      if (useRich) markJumiaColumnsRich();

      var fetched = (result.data || []).length;
      var rows = (result.data || []).filter(function (row) {
        return row && row.id;
      });
      return { rows: rows, fetched: fetched, size: pageSize };
    }
  }

  function appendSavedRows(rows) {
    rows.forEach(function (row) {
      if (state.savedById.has(row.id)) return;
      state.saved.push(row);
      state.savedById.set(row.id, row);
      state.savedIds.add(row.id);
      var url = savedRowUrl(row);
      if (url) state.savedByUrl.set(urlKey(url), row);
    });
  }

  async function loadMoreSaved() {
    if (savedLoadMorePromise) return savedLoadMorePromise;
    if (state.savedLoadingMore || !state.loadedSaved || !state.savedHasMore) return;

    state.savedLoadingMore = true;
    if (el.savedMoreBtn) el.savedMoreBtn.disabled = true;
    savedLoadMorePromise = (async function () {
      try {
        var page = await fetchSavedPage(state.savedNextFrom, SAVED_FETCH_PAGE);
        appendSavedRows(page.rows);
        state.savedNextFrom += page.fetched;
        if (page.fetched < page.size) state.savedHasMore = false;
        if (state.savedTotal > 0 && state.savedNextFrom >= state.savedTotal) {
          state.savedHasMore = false;
        }
        state.savedVisible = Math.max(state.savedVisible, filterSavedRows().length);
        recomputeChangedFlags();
        renderSaved();
        renderGrid();
        updateStats();
      } catch (error) {
        log("load more saved failed: " + (error && error.message ? error.message : error), "error");
        if (el.savedStatus) {
          el.savedStatus.textContent =
            "تعذر جلب صفوف إضافية: " + (error && error.message ? error.message : error);
        }
      } finally {
        state.savedLoadingMore = false;
        if (el.savedMoreBtn) el.savedMoreBtn.disabled = false;
      }
    })();

    return savedLoadMorePromise.finally(function () {
      savedLoadMorePromise = null;
    });
  }

  function loadSavedIndex(options) {
    var opts = options || {};
    if (opts.force) state.hasJumiaColumns = null;
    if (savedLoadPromise) return savedLoadPromise;

    savedLoadPromise = (async function () {
      if (!ensureSupabase()) return false;
      if (state.loadedSaved && !opts.force) return true;

      state.loadingSaved = true;
      state.saved = [];
      state.savedById.clear();
      state.savedByUrl.clear();
      state.savedIds.clear();
      state.savedTotal = 0;
      state.savedNextFrom = 0;
      state.savedHasMore = true;
      state.loadedSaved = false;
      if (el.savedStatus) el.savedStatus.textContent = "جاري تحميل الصفوف المحفوظة من Supabase...";
      try {
        // العدد الحقيقي من السيرفر (مثلاً 219989) حتى لو لم نجلب كل الصفوف.
        state.savedTotal = await fetchSavedTotal();
        var firstPage = await fetchSavedPage(0, SAVED_FETCH_PAGE);
        appendSavedRows(firstPage.rows);
        state.savedNextFrom = firstPage.fetched;
        if (firstPage.fetched < firstPage.size) state.savedHasMore = false;
        if (state.savedTotal > 0 && state.savedNextFrom >= state.savedTotal) {
          state.savedHasMore = false;
        }
        state.savedTotal = Math.max(state.savedTotal, state.saved.length);
        state.loadedSaved = true;
        // نعرض كل ما تم جلبه، وكل ضغطة «عرض المزيد» تجلب صفحة جديدة.
        state.savedVisible = Math.max(SAVED_PAGE_SIZE, state.saved.length);
        recomputeChangedFlags();

        renderSaved();
        renderGrid();
        updateStats();
        log("saved rows loaded: " + state.saved.length + " / " + state.savedTotal, "ok");
        return true;
      } catch (error) {
        if (el.savedStatus) {
          el.savedStatus.textContent =
            "تعذر تحميل المحفوظات: " +
            (error && error.message ? error.message : "خطأ غير معروف");
        }
        log(
          "saved load failed: " + (error && error.message ? error.message : error),
          "error"
        );
        if (!opts.silent) {
          toast(
            "تعذر تحميل المحفوظات: " + (error && error.message ? error.message : error),
            "error"
          );
        }
        return false;
      } finally {
        state.loadingSaved = false;
      }
    })();

    return savedLoadPromise.finally(function () {
      savedLoadPromise = null;
    });
  }

  function savedRowUrl(row) {
    if (!row) return "";
    var candidates = [row.taager_code, row.j_url, row.external_url];
    for (var index = 0; index < candidates.length; index += 1) {
      var value = cleanText(candidates[index]);
      if (/^https?:\/\//i.test(value)) return value;
    }
    return "";
  }

  function isJumiaRow(row) {
    return Boolean(
      row &&
        (String(row.source || "").toLowerCase() === "jumia" ||
          String(row.id || "").indexOf("jumia_") === 0)
    );
  }

  function savedRowIsIncomplete(row) {
    return !row || !cleanText(row.name) || !(safeNumber(row.price) > 0) || !cleanText(row.image);
  }

  function filterSavedRows() {
    var query = norm(el.savedSearch ? el.savedSearch.value : "");
    var filter = el.savedFilter ? el.savedFilter.value : "";
    return state.saved.filter(function (row) {
      if (filter === "jumia" && !isJumiaRow(row)) return false;
      if (filter === "active" && !row.is_active) return false;
      if (filter === "draft" && row.is_active) return false;
      if (filter === "incomplete" && !savedRowIsIncomplete(row)) return false;
      if (query) {
        var haystack = norm(
          [row.name, row.id, row.brand, row.category, row.j_seller_name, savedRowUrl(row)].join(" ")
        );
        if (haystack.indexOf(query) === -1) return false;
      }
      return true;
    });
  }

  function renderSaved() {
    if (!el.savedGrid) return;
    var rows = filterSavedRows();
    var visible = rows.slice(0, state.savedVisible);
    el.savedGrid.innerHTML = visible.map(savedRowMarkup).join("");
    if (el.savedEmpty) {
      el.savedEmpty.style.display =
        state.loadedSaved && rows.length === 0 ? "flex" : "none";
    }
    if (el.savedMoreBtn) {
      // نُظهر زر «عرض المزيد» إما لكشف صفوف محمّلة مخفية أو لجلب صفحة جديدة.
      var more = rows.length > state.savedVisible || state.savedHasMore;
      el.savedMoreBtn.style.display = more ? "" : "none";
      el.savedMoreBtn.textContent =
        "عرض المزيد (" +
        Math.min(state.savedVisible, rows.length) +
        "/" +
        savedTotalCount() +
        ")";
    }
    if (el.savedStatus && state.loadedSaved) {
      var active = state.saved.filter(function (row) {
        return row.is_active;
      }).length;
      var parts = [
        "عرض " + Math.min(state.savedVisible, rows.length) + " من " + state.saved.length + " محمّل",
        "إجمالي السيرفر " + savedTotalCount() + " محفوظ",
      ];
      if (state.hasJumiaColumns === false) {
        parts.push("الحفظ بالأعمدة الأساسية (لم تُشغّل SQL بعد)");
      } else {
        parts.push(active + " نشط، " + (state.saved.length - active) + " مسودة (في المحمّل)");
      }
      el.savedStatus.textContent = parts.join(" · ") + ".";
    }
  }

  function savedRowMarkup(row) {
    var id = String(row.id || "");
    var image = row.image || (Array.isArray(row.images) && row.images[0]) || PLACEHOLDER_IMAGE;
    var url = savedRowUrl(row);
    var price = safeNumber(row.price);
    var oldPrice = safeNumber(row.original_price);
    var discount =
      oldPrice > price && oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    var incomplete = savedRowIsIncomplete(row);
    var seller = cleanText(row.j_seller_name || "");
    var rating = safeNumber(row.j_rating);

    return (
      '<article class="saved-row' +
      (row.is_active ? "" : " is-inactive") +
      (incomplete ? " is-incomplete" : "") +
      '" data-id="' +
      escapeHtml(id) +
      '">' +
      imageTag(image, row.name || "منتج", "saved-row-img") +
      '<div class="saved-row-main">' +
      "<strong>" +
      escapeHtml(row.name || "—") +
      "</strong>" +
      '<span class="saved-row-sub">' +
      escapeHtml(moneyValue(price)) +
      (discount ? ' <em class="lab-discount">-' + discount + "%</em>" : "") +
      (seller ? " · " + escapeHtml(seller) : "") +
      (rating ? " · ⭐ " + rating.toFixed(1) : "") +
      " · " +
      formatDate(row.updated_at) +
      "</span>" +
      '<span class="saved-row-badges">' +
      '<span class="lab-badge ' +
      (row.is_active ? "saved" : "draft") +
      '">' +
      (row.is_active ? "نشط" : "مسودة") +
      "</span>" +
      (incomplete ? '<span class="lab-badge warn">بيانات ناقصة</span>' : "") +
      (state.hasJumiaColumns === false ? "" : '<span class="lab-badge source-jumia">جوميا</span>') +
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
      '<button type="button" data-saved-action="details" data-id="' +
      escapeHtml(id) +
      '"><i class="fa-solid fa-eye"></i> تفاصيل</button>' +
      '<a href="' +
      escapeHtml(productPageUrl(id)) +
      '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> معاينة</a>' +
      (url
        ? '<button type="button" data-saved-action="sync" data-id="' +
          escapeHtml(id) +
          '"><i class="fa-solid fa-arrows-rotate"></i> فحص</button>'
        : "") +
      (url
        ? '<a href="' +
          escapeHtml(url) +
          '" target="_blank" rel="noopener noreferrer" title="صفحة جوميا"><i class="fa-solid fa-store"></i></a>'
        : "") +
      '<button type="button" data-saved-action="delete" data-id="' +
      escapeHtml(id) +
      '" class="danger"><i class="fa-solid fa-trash"></i></button>' +
      "</div>" +
      "</article>"
    );
  }

  function savedRowById(id) {
    return state.savedById.get(id) || null;
  }

  async function toggleSavedRow(id, active) {
    if (!ensureSupabase()) return;
    if (!id) return;
    var result = await supabaseClient
      .from("taager_products")
      .update({ is_active: Boolean(active), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (result.error) {
      toast("تعذر تحديث الحالة: " + result.error.message, "error");
      log("toggle failed: " + result.error.message, "error");
      return;
    }
    var row = savedRowById(id);
    if (row) row.is_active = Boolean(active);
    renderSaved();
    updateStats();
    toast(active ? "تم تنشيط المنتج على الموقع." : "تم إيقاف المنتج (مسودة).", "success");
    log("saved row " + id + " active=" + active, "ok");
    propagateServerMutation(id, { type: "active", active: active });
  }

  async function deleteSavedRow(id) {
    if (!ensureSupabase()) return;
    var confirmed = window.confirm(
      "حذف الصف " + id + " من Supabase؟\n" +
        "إذا كان المنتج موجودًا في اللقطة الأساسية فستعود بياناته الافتراضية بدلًا من الصف المحفوظ."
    );
    if (!confirmed) return;
    var result = await supabaseClient.from("taager_products").delete().eq("id", id);
    if (result.error) {
      toast("تعذر الحذف: " + result.error.message, "error");
      log("delete failed: " + result.error.message, "error");
      return;
    }
    var row = savedRowById(id);
    state.saved = state.saved.filter(function (entry) {
      return entry.id !== id;
    });
    state.savedById.delete(id);
    state.savedIds.delete(id);
    if (row) {
      var url = savedRowUrl(row);
      if (url) state.savedByUrl.delete(urlKey(url));
    }
    var product = state.byId.get(id);
    if (product) product.changed = false;
    renderSaved();
    renderGrid();
    updateStats();
    toast("تم حذف الصف من Supabase.", "success");
    log("saved row deleted: " + id, "ok");
    propagateServerMutation(id, { type: "delete" });
  }

  async function openSavedDetails(id) {
    var row = savedRowById(id);
    if (!row) return;
    var product = state.byId.get(id) || (savedRowUrl(row) ? state.byUrl.get(urlKey(savedRowUrl(row))) : null);
    if (product) {
      openProductModal(product);
      return;
    }
    var url = savedRowUrl(row);
    if (!url) {
      toast("لا توجد تفاصيل كاملة محفوظة لهذا الصف. أعد سحبه من جوميا.", "info");
      return;
    }
    if (!state.apiReady) {
      var ready = await detectApi({ silent: false });
      if (!ready) return;
    }
    toast("جارٍ جلب تفاصيل المنتج من جوميا...", "info");
    try {
      var payload = await fetchProductRemote(url);
      var fetched = normalizeJumiaProduct(payload.product || payload, url);
      if (!fetched) throw new Error("تعذر تحليل المنتج");
      fetched.id = id;
      fetched.changed = true;
      openProductModal(fetched);
    } catch (error) {
      toast("تعذر جلب التفاصيل: " + (error && error.message ? error.message : error), "error");
    }
  }

  function productPageUrl(id) {
    try {
      var url = new URL("product.html", window.location.href);
      url.searchParams.set("id", id);
      return url.toString();
    } catch (_error) {
      return "product.html?id=" + encodeURIComponent(id);
    }
  }

  // ------------------------------------------------------------------
  // Sync / price update
  // ------------------------------------------------------------------

  function syncRowsWithUrl(rows) {
    return (rows || []).filter(function (row) {
      return isJumiaRow(row) && Boolean(savedRowUrl(row));
    });
  }

  function compareSavedWithProduct(row, product) {
    var changes = [];
    var oldPrice = safeNumber(row.price);
    var newPrice = safeNumber(product.price);
    if (oldPrice !== newPrice) {
      changes.push({
        field: "price",
        label: "السعر",
        old: moneyValue(oldPrice),
        new: moneyValue(newPrice),
        changed: true,
      });
    }
    var oldOriginal = safeNumber(row.original_price);
    var newOriginal = safeNumber(product.original_price);
    if (oldOriginal !== newOriginal) {
      changes.push({
        field: "original_price",
        label: "السعر الأصلي",
        old: moneyValue(oldOriginal),
        new: moneyValue(newOriginal),
        changed: true,
      });
    }
    if (cleanText(row.name) !== cleanText(product.name)) {
      changes.push({
        field: "name",
        label: "الاسم",
        old: cleanText(row.name),
        new: cleanText(product.name),
        changed: true,
      });
    }
    if (cleanText(row.image) !== cleanText(product.image)) {
      changes.push({
        field: "image",
        label: "الصورة",
        old: "صورة قديمة",
        new: "صورة جديدة",
        changed: true,
      });
    }
    if (stockKey(row.stock_status) !== stockKey(product.stock_status)) {
      var oldStock = stockInfo(row.stock_status).label;
      var newStock = stockInfo(product.stock_status).label;
      changes.push({
        field: "stock_status",
        label: "المخزون",
        old: oldStock,
        new: newStock,
        changed: true,
      });
    }
    return changes;
  }

  function updateSyncProgress(done, total, text) {
    if (el.syncBar) {
      var percent = total ? Math.round((done / total) * 100) : 0;
      el.syncBar.style.width = Math.max(total ? 2 : 0, Math.min(100, percent)) + "%";
    }
    if (el.syncStatus && text) el.syncStatus.textContent = text;
    var selected = state.sync.changes.filter(function (change) {
      return change.selected && change.status === "pending" && change.changes && change.changes.length;
    }).length;
    if (el.syncApplyCount) el.syncApplyCount.textContent = plainNumber(selected);
    if (el.applySyncBtn) el.applySyncBtn.disabled = selected === 0 || state.sync.running;
    if (el.syncStartBtn) el.syncStartBtn.disabled = state.sync.running;
    if (el.syncStopBtn) el.syncStopBtn.disabled = !state.sync.running;
  }

  async function startSync(targetRows) {
    if (state.sync.running) return;
    if (!state.apiReady) {
      var connected = await detectApi({ silent: false });
      if (!connected) return;
    }
    if (!state.loadedSaved) await loadSavedIndex({ silent: false });
    var rows = syncRowsWithUrl(targetRows || state.saved);
    if (!rows.length) {
      toast("لا توجد منتجات جوميا محفوظة برابط صفحة قابل للفحص.", "info");
      return;
    }

    state.sync.running = true;
    state.sync.stop = false;
    state.sync.changes = [];
    state.sync.checked = 0;
    state.sync.total = rows.length;
    state.sync.failed = 0;
    if (el.syncStartBtn) el.syncStartBtn.disabled = true;
    if (el.syncStopBtn) el.syncStopBtn.disabled = false;
    if (el.applySyncBtn) el.applySyncBtn.disabled = true;
    renderSyncList();
    updateSyncProgress(0, rows.length, "بدء فحص " + rows.length + " منتج...");
    log("sync start: " + rows.length + " rows", "info");

    var poolActive = proxyPoolActive();
    var workers = readWorkerCount();
    var nextIndex = 0;
    var completed = 0;
    var consecutiveErrors = 0;

    function syncFailure(error, row, url) {
      state.sync.failed += 1;
      consecutiveErrors += 1;
      state.sync.changes.push({
        id: row.id,
        row: row,
        product: null,
        changes: [],
        selected: false,
        status: "error",
        error: error && error.message ? error.message : String(error),
      });
      log("sync error " + (row.name || row.id) + ": " + (error.message || error), "error");
      if (error && error.blocked && !poolActive) {
        state.sync.stop = true;
        toast(
          "جوميا حجبت الفحص. أضف وسائط في مجمع الوسائط ثم أعد المحاولة.",
          "error"
        );
        return;
      }
      if (consecutiveErrors >= (poolActive ? 25 : 6)) {
        state.sync.stop = true;
        toast("توقف فحص التحديثات بعد أخطاء متتالية. راجع السجل.", "error");
      }
    }

    async function syncWorker() {
      while (!state.sync.stop && nextIndex < rows.length) {
        var index = nextIndex;
        nextIndex += 1;
        var row = rows[index];
        var url = savedRowUrl(row);
        try {
          var payload = await fetchProductRemote(url, { preferPool: poolActive });
          var product = normalizeJumiaProduct(payload.product || payload, url);
          if (!product) throw new Error("تعذر تحليل المنتج");
          product.id = row.id;
          consecutiveErrors = 0;
          var changes = compareSavedWithProduct(row, product);
          if (changes.length) {
            state.sync.changes.push({
              id: row.id,
              row: row,
              product: product,
              changes: changes,
              selected: true,
              status: "pending",
              error: "",
            });
            log(
              "⇄ " + (row.name || row.id) + " · " + changes.length + " تغيير",
              "ok"
            );
          } else {
            log("= " + (row.name || row.id) + " · لا تغيير", "info");
          }
        } catch (error) {
          syncFailure(error, row, url);
        }

        completed += 1;
        state.sync.checked = completed;
        updateSyncProgress(
          completed,
          rows.length,
          "فحص " +
            completed +
            " من " +
            rows.length +
            " — تم العثور على " +
            state.sync.changes.filter(function (change) {
              return change.changes.length;
            }).length +
            " تغيير"
        );
        renderSyncList();
        if (completed < rows.length) await sleep(Math.max(150, readDelay() / 2));
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(workers, rows.length) }, function () {
          return syncWorker();
        })
      );
    } finally {
      state.sync.running = false;
      if (el.syncStartBtn) el.syncStartBtn.disabled = false;
      if (el.syncStopBtn) el.syncStopBtn.disabled = true;
      var changedRows = state.sync.changes.filter(function (change) {
        return change.changes.length;
      }).length;
      var summary =
        "انتهى الفحص: " +
        changedRows +
        " منتج فيه تغييرات من " +
        rows.length +
        (state.sync.failed ? " · " + state.sync.failed + " فشل" : "") +
        (state.sync.stop ? " · تم الإيقاف مبكرًا" : "") +
        ".";
      updateSyncProgress(state.sync.checked, rows.length, summary);
      renderSyncList();
      updateStats();
      log(summary, changedRows ? "ok" : "info");
      toast(summary, changedRows ? "success" : "info");
    }
  }

  function syncChangeMarkup(change) {
    if (change.status === "error") {
      return (
        '<div class="lab-sync-row is-error" data-sync-id="' +
        escapeHtml(change.id) +
        '">' +
        '<span class="lab-sync-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>' +
        '<div class="lab-sync-main"><strong>' +
        escapeHtml((change.row && change.row.name) || change.id) +
        "</strong><span>" +
        escapeHtml(change.error || "تعذر الفحص") +
        "</span></div>" +
        '<span class="lab-sync-badge is-error">فشل</span>' +
        "</div>"
      );
    }
    var product = change.product;
    var image = (product && product.image) || PLACEHOLDER_IMAGE;
    var statusLabels = { pending: "جاهز للتطبيق", applied: "تم التطبيق", error: "فشل" };
    var diffs = change.changes
      .map(function (item) {
        return (
          '<span class="lab-sync-diff"><b>' +
          escapeHtml(item.label) +
          "</b> " +
          escapeHtml(item.old) +
          ' <i class="fa-solid fa-arrow-left"></i> <em>' +
          escapeHtml(item.new) +
          "</em></span>"
        );
      })
      .join("");
    return (
      '<div class="lab-sync-row is-' +
      escapeHtml(change.status) +
      '" data-sync-id="' +
      escapeHtml(change.id) +
      '">' +
      '<label class="lab-sync-check"><input type="checkbox" data-sync-select="' +
      escapeHtml(change.id) +
      '"' +
      (change.selected ? " checked" : "") +
      (change.status !== "pending" ? " disabled" : "") +
      " /></label>" +
      imageTag(image, product && product.name, "lab-sync-img") +
      '<div class="lab-sync-main"><strong>' +
      escapeHtml((product && product.name) || change.id) +
      "</strong><div class=\"lab-sync-diffs\">" +
      diffs +
      "</div></div>" +
      '<div class="lab-sync-aside">' +
      '<span class="lab-sync-badge is-' +
      escapeHtml(change.status) +
      '">' +
      escapeHtml(statusLabels[change.status] || change.status) +
      "</span>" +
      (product
        ? '<button type="button" class="lab-link-btn" data-sync-details="' +
          escapeHtml(change.id) +
          '"><i class="fa-solid fa-eye"></i> تفاصيل</button>'
        : "") +
      "</div>" +
      "</div>"
    );
  }

  function renderSyncList() {
    if (!el.syncList) return;
    var changes = state.sync.changes;
    if (!changes.length) {
      el.syncList.innerHTML =
        '<p class="lab-hint" style="margin:0">لم يتم العثور على تغييرات بعد. اضغط «فحص التحديثات».</p>';
      updateSyncProgress(0, 0, el.syncStatus ? el.syncStatus.textContent : "");
      return;
    }
    var pending = changes.filter(function (change) {
      return change.status === "pending" && change.changes.length;
    });
    var allSelected =
      pending.length > 0 &&
      pending.every(function (change) {
        return change.selected;
      });
    var toolbar =
      '<div class="lab-sync-toolbar">' +
      '<label><input type="checkbox" data-sync-all' +
      (allSelected ? " checked" : "") +
      " /> تحديد كل التغييرات (" +
      pending.length +
      ")</label>" +
      '<span class="lab-spacer"></span>' +
      '<span class="lab-hint" style="margin:0">' +
      changes.length +
      " صف</span>" +
      "</div>";
    el.syncList.innerHTML = toolbar + changes.map(syncChangeMarkup).join("");
    var selected = pending.filter(function (change) {
      return change.selected;
    }).length;
    if (el.syncApplyCount) el.syncApplyCount.textContent = plainNumber(selected);
    if (el.applySyncBtn) el.applySyncBtn.disabled = selected === 0 || state.sync.running;
  }

  function applySyncChanges() {
    if (state.sync.running) return;
    var selected = state.sync.changes.filter(function (change) {
      return change.selected && change.status === "pending" && change.product;
    });
    if (!selected.length) {
      toast("حدد التغييرات التي تريد تطبيقها.", "info");
      return;
    }
    if (!ensureSupabase()) return;

    openSaveModal(
      "جارٍ تطبيق " + plainNumber(selected.length) + " تحديث على Supabase...",
      "يُسجَّل السعر القديم في سجل الأسعار j_price_history قبل استبدال الصف."
    );
    state.sync.running = true;
    state.sync.stop = false;
    if (el.applySyncBtn) el.applySyncBtn.disabled = true;
    if (el.syncStartBtn) el.syncStartBtn.disabled = true;
    if (el.syncStopBtn) el.syncStopBtn.disabled = false;

    var applied = 0;
    var failed = 0;
    var appliedIds = [];

    (async function () {
      try {
        for (var index = 0; index < selected.length; index += 1) {
          if (state.sync.stop) break;
          var change = selected[index];
          var product = change.product;
          var existing = state.savedById.get(change.id) || change.row;
          product.id = change.id;
          var built = buildJumiaRow(product, {
            existing: existing,
            active: existing ? Boolean(existing.is_active) : false,
          });
          try {
            await flushRows([built]);
            applyRowToSavedIndex(product, built);
            change.status = "applied";
            applied += 1;
            appliedIds.push(change.id);
            addSaveDiff(
              "update",
              product.name,
              change.changes
                .map(function (item) {
                  return item.label + ": " + item.old + " → " + item.new;
                })
                .join(" · ")
            );
            var scraped = state.byId.get(change.id) || (product.url ? state.byUrl.get(urlKey(product.url)) : null);
            if (scraped) {
              upsertScrapedProduct(product);
              scraped.changed = false;
            }
          } catch (error) {
            change.status = "error";
            change.error = error && error.message ? error.message : String(error);
            failed += 1;
            addSaveDiff("error", product.name, change.error);
            log("sync apply failed: " + change.error, "error");
          }
          setSaveProgress(index + 1, selected.length);
          updateSyncProgress(
            index + 1,
            selected.length,
            "تطبيق " + (index + 1) + " من " + selected.length
          );
          renderSyncList();
          await sleep(120);
        }
      } finally {
        state.sync.running = false;
        finishSaveModal({ saved: applied, skipped: 0, failed: failed });
        renderSaved();
        renderSyncList();
        renderGrid();
        updateStats();
        if (el.syncStartBtn) el.syncStartBtn.disabled = false;
        if (el.syncStopBtn) el.syncStopBtn.disabled = true;
        if (appliedIds.length) scheduleServerSync(appliedIds);
        var message =
          "تم تطبيق " +
          applied +
          " تحديث" +
          (failed ? " · فشل " + failed : "") +
          ".";
        if (el.syncStatus) el.syncStatus.textContent = message;
        toast(message, failed ? "error" : "success");
        log(message, failed ? "error" : "ok");
      }
    })();
  }

  // ------------------------------------------------------------------
  // 3-server reconciliation
  // ------------------------------------------------------------------

  function backendByName(name) {
    for (var index = 0; index < BACKENDS.length; index += 1) {
      if (BACKENDS[index].name === name) return BACKENDS[index];
    }
    return null;
  }

  function friendlyServerError(error) {
    var message = String((error && error.message) || error || "");
    if (/Failed to fetch|fetch failed|ENOTFOUND|getaddrinfo|name could not be resolved/i.test(message)) {
      return "غير متاح (تعذر الاتصال بالنطاق)";
    }
    if (/401|403/.test(message)) return "مفتاح غير صالح أو صلاحيات مرفوضة";
    return message.slice(0, 200);
  }

  async function serverFetch(backend, path, options) {
    var opts = options || {};
    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, Math.max(5000, Number(opts.timeoutMs) || 45000));
    try {
      var response = await fetch(backend.url + path, {
        method: opts.method || "GET",
        headers: Object.assign(
          {
            apikey: backend.key,
            Authorization: "Bearer " + backend.key,
            // auth-guard يعيد توجيه كل طلبات Supabase للسيرفر النشط؛
            // هذا الهيدر يمنع إعادة التوجيه حتى نستطيع فحص السيرفر المحدد.
            "x-bypass-failover": "true",
          },
          opts.headers || {}
        ),
        body: opts.body,
        signal: controller.signal,
      });
      var text = await response.text();
      if (!response.ok) {
        var error = new Error(
          "HTTP " + response.status + (text ? " · " + text.slice(0, 260) : "")
        );
        error.status = response.status;
        error.body = text;
        throw error;
      }
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (_error) {
        return text;
      }
    } finally {
      window.clearTimeout(timer);
    }
  }

  // كل معرفات منتجات جوميا على سيرفر واحد، صفحة صفحة، بدون تحويل للسيرفر النشط.
  // نستخدم keyset pagination (id > آخر معرف) لأن OFFSET الكبير مع فلتر source
  // يسبب statement timeout على السيرفر الأساسي بعد حوالي 50 ألف صف.
  async function serverAllIds(backend, onProgress) {
    var ids = [];
    var lastId = "";
    var seenLast = new Set();
    for (var page = 0; page < 2000; page += 1) {
      var query =
        "/rest/v1/taager_products?select=id&source=eq.jumia&order=id.asc" +
        (lastId ? "&id=gt." + encodeURIComponent(lastId) : "");
      var rows = await serverFetch(backend, query, {
        timeoutMs: 60000,
        headers: { Range: "0-" + (SERVER_ID_PAGE - 1) },
      });
      if (!Array.isArray(rows)) break;
      rows.forEach(function (row) {
        if (row && row.id != null) ids.push(String(row.id));
      });
      if (onProgress) onProgress(ids.length);
      if (rows.length < SERVER_ID_PAGE) break;
      var nextLast = String(rows[rows.length - 1].id || "");
      // حماية من التكرار لو السيرفر تجاهل الفلتر أو رجع نفس الصفحة.
      if (!nextLast || nextLast === lastId || seenLast.has(nextLast)) break;
      seenLast.add(nextLast);
      lastId = nextLast;
    }
    return ids;
  }

  function setServersStatus(text) {
    if (el.serversStatus) el.serversStatus.textContent = text;
  }

  /**
   * يطبّق تغيير الحالة/الحذف على السيرفرين الاحتياطيين أيضًا حتى لا يظهر
   * المنتج هناك عند التحويل التلقائي بين السيرفرات. الأخطاء لا تُفشل العملية
   * الأساسية — تُسجَّل فقط.
   */
  async function propagateServerMutation(id, action) {
    if (!id) return;
    for (var index = 0; index < BACKENDS.length; index += 1) {
      var backend = BACKENDS[index];
      if (backend.name === "primary") continue;
      var path =
        "/rest/v1/taager_products?id=eq." + encodeURIComponent(String(id));
      try {
        if (action.type === "active") {
          await serverFetch(backend, path, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ is_active: Boolean(action.active) }),
            timeoutMs: 20000,
          });
        } else if (action.type === "delete") {
          await serverFetch(backend, path, {
            method: "DELETE",
            headers: { Prefer: "return=minimal" },
            timeoutMs: 20000,
          });
        }
      } catch (error) {
        log(
          "تعذر تحديث [" + backend.label + "]: " + friendlyServerError(error),
          "info"
        );
      }
    }
  }

  function postgrestInFilter(ids) {
    return ids.map(function (id) {
      return encodeURIComponent(String(id));
    }).join(",");
  }

  async function serverExistingIds(backend, ids) {
    var present = new Set();
    var chunks = chunkList(ids, SERVER_SCAN_CHUNK);
    for (var index = 0; index < chunks.length; index += 1) {
      var rows = await serverFetch(
        backend,
        "/rest/v1/taager_products?select=id&id=in.(" + postgrestInFilter(chunks[index]) + ")",
        { timeoutMs: 45000 }
      );
      if (Array.isArray(rows)) {
        rows.forEach(function (row) {
          if (row && row.id != null) present.add(String(row.id));
        });
      }
    }
    return present;
  }

  async function fetchPrimaryRows(ids) {
    var primary = backendByName("primary") || BACKENDS[0];
    var rows = [];
    var chunks = chunkList(ids, SERVER_FETCH_ID_CHUNK);
    for (var index = 0; index < chunks.length; index += 1) {
      var data = await serverFetch(
        primary,
        "/rest/v1/taager_products?select=*&id=in.(" + postgrestInFilter(chunks[index]) + ")",
        { timeoutMs: 60000 }
      );
      if (Array.isArray(data)) rows = rows.concat(data);
    }
    return rows;
  }

  function detectMissingColumn(body) {
    var text = String(body || "");
    var match = text.match(/Could not find the '([^']+)' column/i);
    if (match) return match[1];
    match = text.match(/column "([^"]+)" of relation/i);
    if (match) return match[1];
    match = text.match(/column "([^"]+)" does not exist/i);
    if (match) return match[1];
    return "";
  }

  async function insertServerRows(backend, rows) {
    var remaining = rows.map(function (row) {
      return Object.assign({}, row);
    });
    for (var attempt = 0; attempt < 10; attempt += 1) {
      if (!remaining.length) return [];
      try {
        await serverFetch(
          backend,
          "/rest/v1/taager_products?on_conflict=id",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(remaining),
            timeoutMs: 90000,
          }
        );
        return remaining;
      } catch (error) {
        var column = detectMissingColumn(error.body || error.message);
        if (!column) throw error;
        log(
          "السيرفر [" + backend.label + "] لا يحتوي العمود " + column + " — استبعاده والمحاولة.",
          "info"
        );
        remaining = remaining.map(function (row) {
          var copy = Object.assign({}, row);
          delete copy[column];
          return copy;
        });
      }
    }
    throw new Error("تعذر إضافة الصفوف: أعمدة السيرفر لا تتوافق.");
  }

  async function addRowsToServer(backend, rows) {
    var inserted = [];
    var chunks = chunkList(rows, SERVER_ADD_CHUNK);
    for (var index = 0; index < chunks.length; index += 1) {
      var accepted = await insertServerRows(backend, chunks[index]);
      accepted.forEach(function (row) {
        if (row && row.id != null) inserted.push(String(row.id));
      });
    }
    return inserted;
  }

  function savedRowName(id) {
    var row = state.savedById.get(String(id));
    if (row && row.name) return row.name;
    var product = state.byId.get(String(id));
    return (product && product.name) || String(id);
  }

  function totalMissingOnServers() {
    return state.servers.results.reduce(function (sum, result) {
      return sum + (result.status === "offline" ? 0 : result.missing.length);
    }, 0);
  }

  function renderServers() {
    if (!el.serversList) return;
    var results = state.servers.results;
    if (!results.length) {
      el.serversList.innerHTML =
        '<p class="lab-hint" style="margin:0">اضغط «فحص السيرفرات» لعرض حالة منتجات جوميا على السيرفرات الثلاثة.</p>';
      if (el.addMissingServersBtn) el.addMissingServersBtn.disabled = true;
      return;
    }
    el.serversList.innerHTML = results
      .map(function (result) {
        var offline = result.status === "offline";
        var scanning = result.status === "scanning";
        var missing = result.missing.length;
        var cls = offline ? "is-offline" : scanning ? "" : missing ? "is-missing" : "is-ok";
        var icon = offline
          ? "fa-plug-circle-xmark"
          : scanning
            ? "fa-spinner fa-spin"
            : missing
              ? "fa-triangle-exclamation"
              : "fa-circle-check";
        var countText = offline
          ? "غير متاح"
          : scanning
            ? "جارٍ الفحص"
            : missing
              ? "ناقص " + plainNumber(missing)
              : "مكتمل";
        var sub = offline
          ? escapeHtml(result.error || "تعذر الاتصال")
          : "موجود " +
            plainNumber(result.present) +
            " من " +
            plainNumber(state.servers.expectedIds.length);
        var missingNames = "";
        if (!offline && !scanning && missing) {
          missingNames =
            '<span class="lab-server-missing-list">' +
            result.missing
              .slice(0, 4)
              .map(function (id) {
                return escapeHtml(savedRowName(id));
              })
              .join(" · ") +
            (missing > 4 ? " · +" + plainNumber(missing - 4) + " أخرى" : "") +
            "</span>";
        }
        return (
          '<div class="lab-server-row ' + cls + '">' +
          '<span class="lab-server-icon"><i class="fa-solid ' + icon + '"></i></span>' +
          '<div class="lab-server-main">' +
          "<strong>" + escapeHtml(result.label) + "</strong>" +
          "<span>" + sub + "</span>" +
          missingNames +
          "</div>" +
          '<span class="lab-server-count">' + countText + "</span>" +
          "</div>"
        );
      })
      .join("");
    var missingTotal = totalMissingOnServers();
    if (el.addMissingServersBtn) {
      el.addMissingServersBtn.disabled = state.servers.adding || missingTotal === 0;
      el.addMissingServersBtn.innerHTML =
        '<i class="fa-solid fa-cloud-arrow-up"></i> إضافة الناقص' +
        (missingTotal ? " (" + plainNumber(missingTotal) + ")" : "");
    }
  }

  async function scanServers(options) {
    var opts = options || {};
    if (state.servers.scanning) return;
    state.servers.scanning = true;
    if (el.checkServersBtn) el.checkServersBtn.disabled = true;
    // المرجع هو كل منتجات جوميا الموجودة فعليًا على السيرفر الأساسي،
    // وليس الصفوف الـ 150 المحمّلة في الواجهة فقط.
    var primary = backendByName("primary") || BACKENDS[0];
    var allPrimaryIds = [];
    try {
      setServersStatus("جارٍ جلب كل معرفات منتجات جوميا من السيرفر الأساسي...");
      allPrimaryIds = await serverAllIds(primary, function (count) {
        setServersStatus("جارٍ جلب " + plainNumber(count) + " معرف من السيرفر الأساسي...");
      });
    } catch (error) {
      state.servers.results = [];
      renderServers();
      var primaryError = "تعذر قراءة السيرفر الأساسي: " + friendlyServerError(error);
      setServersStatus(primaryError);
      if (!opts.silent) toast(primaryError, "error");
      state.servers.scanning = false;
      if (el.checkServersBtn) el.checkServersBtn.disabled = false;
      return;
    }
    var seen = new Set();
    var expected = [];
    allPrimaryIds.forEach(function (id) {
      if (seen.has(id)) return;
      seen.add(id);
      expected.push(id);
    });
    state.servers.expectedIds = expected;
    if (!expected.length) {
      state.servers.results = [];
      renderServers();
      setServersStatus("لا توجد منتجات جوميا محفوظة للفحص.");
      state.servers.scanning = false;
      if (el.checkServersBtn) el.checkServersBtn.disabled = false;
      return;
    }

    state.servers.results = BACKENDS.map(function (backend) {
      return {
        name: backend.name,
        label: backend.label,
        url: backend.url,
        status: "scanning",
        present: 0,
        missing: [],
        error: "",
      };
    });
    renderServers();
    if (el.checkServersBtn) el.checkServersBtn.disabled = true;
    if (el.serversStatus) {
      el.serversStatus.textContent =
        "جارٍ فحص " + plainNumber(expected.length) + " منتج على 3 سيرفرات...";
    }

    try {
      for (var index = 0; index < BACKENDS.length; index += 1) {
        var backend = BACKENDS[index];
        var result = state.servers.results[index];
        if (backend.name === "primary") {
          result.status = "ok";
          result.present = expected.length;
          result.missing = [];
          renderServers();
          continue;
        }
        try {
          setServersStatus(
            "جارٍ فحص [" + backend.label + "] — " +
              plainNumber(expected.length) + " منتج متوقع..."
          );
          var foundIds = await serverAllIds(backend, function (count) {
            setServersStatus(
              "جارٍ فحص [" + backend.label + "]: " + plainNumber(count) + " معرف..."
            );
          });
          var present = new Set(foundIds);
          var presentCount = 0;
          result.missing = expected.filter(function (id) {
            if (present.has(id)) {
              presentCount += 1;
              return false;
            }
            return true;
          });
          result.present = presentCount;
          result.status = result.missing.length ? "missing" : "ok";
        } catch (error) {
          result.status = "offline";
          result.error = friendlyServerError(error);
          result.present = 0;
          result.missing = [];
          log(
            "تعذر فحص السيرفر [" + backend.label + "]: " + result.error,
            "error"
          );
        }
        renderServers();
      }

      var missingTotal = totalMissingOnServers();
      var offlineCount = state.servers.results.filter(function (result) {
        return result.status === "offline";
      }).length;
      var summary =
        "تم فحص " +
        plainNumber(expected.length) +
        " منتج · الناقص " +
        plainNumber(missingTotal) +
        (offlineCount ? " · سيرفرات غير متاحة " + plainNumber(offlineCount) : "") +
        ".";
      if (el.serversStatus) el.serversStatus.textContent = summary;
      if (!opts.silent) {
        log(summary, missingTotal ? "info" : "ok");
        toast(
          missingTotal
            ? "يوجد " + plainNumber(missingTotal) + " صف ناقص على السيرفرات."
            : "كل منتجات جوميا موجودة على السيرفرات المتاحة.",
          missingTotal ? "info" : "success"
        );
      }
    } finally {
      state.servers.scanning = false;
      if (el.checkServersBtn) el.checkServersBtn.disabled = false;
      renderServers();
    }
  }

  async function addMissingToServers() {
    if (state.servers.adding) return;
    if (!state.servers.results.length) {
      await scanServers({ silent: true });
    }
    var missingIds = [];
    var seen = new Set();
    state.servers.results.forEach(function (result) {
      if (result.status === "offline" || result.name === "primary") return;
      result.missing.forEach(function (id) {
        if (!seen.has(id)) {
          seen.add(id);
          missingIds.push(id);
        }
      });
    });
    if (!missingIds.length) {
      toast("لا يوجد صف ناقص على السيرفرات المتاحة.", "info");
      return;
    }

    // على دفعات: المتصفح لا يحتمل إضافة مئات الآلاف من الصفوف في عملية واحدة.
    var batchIds = missingIds.slice(0, SERVER_ADD_BATCH);
    state.servers.adding = true;
    renderServers();
    if (el.addMissingServersBtn) el.addMissingServersBtn.disabled = true;
    if (el.serversStatus) {
      el.serversStatus.textContent =
        "جارٍ إضافة " + plainNumber(batchIds.length) + " صف ناقص" +
        (remainingAfter ? " من أصل " + plainNumber(missingIds.length) : "") + "...";
    }

    try {
      var rows = await fetchPrimaryRows(batchIds);
      if (!rows.length) throw new Error("تعذر جلب الصفوف من السيرفر الأساسي.");
      var byId = new Map();
      rows.forEach(function (row) {
        if (row && row.id != null) byId.set(String(row.id), row);
      });

      var insertedTotal = 0;
      var notes = [];
      for (var index = 0; index < state.servers.results.length; index += 1) {
        var result = state.servers.results[index];
        if (result.name === "primary" || result.status === "offline") continue;
        if (!result.missing.length) continue;
        var backend = backendByName(result.name);
        if (!backend) continue;
        var targets = result.missing
          .map(function (id) {
            return byId.get(id);
          })
          .filter(Boolean);
        if (!targets.length) continue;
        try {
          var inserted = await addRowsToServer(backend, targets);
          insertedTotal += inserted.length;
          var insertedSet = new Set(inserted);
          result.missing = result.missing.filter(function (id) {
            return !insertedSet.has(id);
          });
          result.present += inserted.length;
          result.status = result.missing.length ? "missing" : "ok";
          notes.push(backend.label + ": +" + plainNumber(inserted.length));
        } catch (error) {
          notes.push(backend.label + ": فشل (" + friendlyServerError(error) + ")");
          log(
            "فشل إضافة الناقص إلى [" + backend.label + "]: " +
              friendlyServerError(error),
            "error"
          );
        }
        renderServers();
      }

      var stillMissing = totalMissingOnServers();
      var message =
        (insertedTotal > 0
          ? "تمت إضافة " + plainNumber(insertedTotal) + " صف — " + notes.join(" · ")
          : "لم تتم إضافة صفوف — " + notes.join(" · ")) +
        (stillMissing
          ? ". متبقي " + plainNumber(stillMissing) + " — اضغط «إضافة الناقص» للمتابعة."
          : ".");
      if (el.serversStatus) el.serversStatus.textContent = message;
      toast(message, insertedTotal > 0 ? "success" : "error");
      log(message, insertedTotal > 0 ? "ok" : "error");
      renderServers();
    } catch (error) {
      var failure = friendlyServerError(error);
      if (el.serversStatus) el.serversStatus.textContent = "تعذرت الإضافة: " + failure;
      toast("تعذرت الإضافة: " + failure, "error");
      log("servers add failed: " + failure, "error");
    } finally {
      state.servers.adding = false;
      renderServers();
    }
  }

  function scheduleServerSync(ids) {
    if (!el.autoServerSyncInput || !el.autoServerSyncInput.checked) return;
    var list = (ids || []).filter(Boolean).map(String);
    if (!list.length) return;
    list.forEach(function (id) {
      serverSyncIds.add(id);
    });
    if (serverSyncTimer) window.clearTimeout(serverSyncTimer);
    serverSyncTimer = window.setTimeout(function () {
      serverSyncTimer = 0;
      runScheduledServerSync();
    }, 5000);
  }

  async function runScheduledServerSync() {
    if (serverSyncRunning) {
      serverSyncTimer = window.setTimeout(runScheduledServerSync, 5000);
      return;
    }
    var ids = Array.from(serverSyncIds);
    serverSyncIds.clear();
    if (!ids.length) return;
    serverSyncRunning = true;
    try {
      var rows = await fetchPrimaryRows(ids);
      if (!rows.length) return;
      var insertedTotal = 0;
      var notes = [];
      for (var index = 0; index < BACKENDS.length; index += 1) {
        var backend = BACKENDS[index];
        if (backend.name === "primary") continue;
        try {
          var present = await serverExistingIds(backend, ids);
          var missing = ids.filter(function (id) {
            return !present.has(id);
          });
          if (!missing.length) continue;
          var missingSet = new Set(missing);
          var targets = rows.filter(function (row) {
            return row && row.id != null && missingSet.has(String(row.id));
          });
          if (!targets.length) continue;
          var inserted = await addRowsToServer(backend, targets);
          insertedTotal += inserted.length;
          notes.push(backend.label + ": +" + plainNumber(inserted.length));
          var result = state.servers.results.find(function (item) {
            return item.name === backend.name;
          });
          if (result && result.status !== "offline") {
            var insertedSet = new Set(inserted);
            result.missing = result.missing.filter(function (id) {
              return !insertedSet.has(id);
            });
            result.present += inserted.length;
            result.status = result.missing.length ? "missing" : "ok";
          }
        } catch (error) {
          notes.push(backend.label + ": " + friendlyServerError(error));
        }
      }
      if (insertedTotal > 0) {
        var message =
          "مزامنة تلقائية: أُضيف " + plainNumber(insertedTotal) + " صف — " + notes.join(" · ") + ".";
        log(message, "ok");
        if (el.serversStatus) el.serversStatus.textContent = message;
      }
      renderServers();
    } catch (error) {
      log("مزامنة السيرفرات التلقائية فشلت: " + friendlyServerError(error), "error");
    } finally {
      serverSyncRunning = false;
    }
  }

  // ------------------------------------------------------------------
  // Product details modal
  // ------------------------------------------------------------------

  function sellerPerformanceMarkup(seller) {
    if (!seller || !Array.isArray(seller.performance) || !seller.performance.length) {
      return '<p class="lab-muted">لا توجد بيانات أداء بائع متاحة.</p>';
    }
    return (
      '<div class="lab-seller-perf-list">' +
      seller.performance
        .map(function (item) {
          var value = cleanText(item.value || "");
          var cls = /ممتاز|excellent/i.test(value)
            ? "is-great"
            : /جيد جدا|very good/i.test(value)
              ? "is-good"
              : /^(جيد|good)$/i.test(value)
                ? "is-ok"
                : /ضعيف|poor/i.test(value)
                  ? "is-bad"
                  : "";
          return (
            '<div class="lab-seller-perf"><span>' +
            escapeHtml(item.label || "") +
            '</span><strong class="' +
            cls +
            '">' +
            escapeHtml(value) +
            "</strong></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function starsMarkup(rating) {
    var rounded = Math.round(clamp(safeNumber(rating), 0, 5) * 2) / 2;
    var html = "";
    for (var index = 1; index <= 5; index += 1) {
      if (rounded >= index) html += '<i class="fa-solid fa-star"></i>';
      else if (rounded >= index - 0.5) html += '<i class="fa-solid fa-star-half-stroke"></i>';
      else html += '<i class="fa-regular fa-star"></i>';
    }
    return '<span class="lab-stars">' + html + "</span>";
  }

  function ratingBreakdownMarkup(product) {
    var breakdown = product.rating_breakdown;
    var rating = safeNumber(product.rating);
    var reviews = Math.round(safeNumber(product.reviews_count));
    if ((!breakdown || typeof breakdown !== "object") && !rating) {
      return '<p class="lab-muted">لا توجد تقييمات محفوظة لهذا المنتج.</p>';
    }
    var counts = {};
    var total = 0;
    for (var star = 5; star >= 1; star -= 1) {
      var value = breakdown ? safeNumber(breakdown[star] || breakdown[String(star)]) : 0;
      counts[star] = value;
      total += value;
    }
    if (!total) total = reviews;
    var bars = "";
    for (var s = 5; s >= 1; s -= 1) {
      var count = counts[s] || 0;
      var percent = total ? Math.round((count / total) * 100) : 0;
      bars +=
        '<div class="lab-rating-bar"><span>' +
        s +
        ' <i class="fa-solid fa-star"></i></span><div><i style="width:' +
        percent +
        '%"></i></div><em>' +
        plainNumber(count) +
        "</em></div>";
    }
    return (
      '<div class="lab-rating-breakdown">' +
      '<div class="lab-rating-overview"><strong>' +
      (rating ? rating.toFixed(1) : "—") +
      "</strong>" +
      starsMarkup(rating) +
      "<em>" +
      plainNumber(reviews) +
      " تقييم</em></div>" +
      '<div class="lab-rating-bars">' +
      bars +
      "</div>" +
      "</div>"
    );
  }

  function specsMarkup(specs) {
    if (!specs || !specs.length) return '<p class="lab-muted">لا توجد مواصفات محفوظة.</p>';
    return (
      '<div class="lab-specs-wrap"><table class="lab-spec-table"><tbody>' +
      specs
        .slice(0, 100)
        .map(function (row) {
          return (
            "<tr><th>" +
            escapeHtml(row.label) +
            "</th><td>" +
            escapeHtml(row.value) +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function deliveryMarkup(product) {
    var delivery = normalizeDelivery(product.delivery);
    var lines = delivery.lines;
    var parts = [];
    if (delivery.free_shipping_text) {
      parts.push(
        '<div class="lab-delivery-highlight"><i class="fa-solid fa-truck-fast"></i>' +
          escapeHtml(delivery.free_shipping_text) +
          "</div>"
      );
    }
    if (lines.length) {
      parts.push(
        '<ul class="lab-delivery-lines">' +
          lines
            .map(function (line) {
              return "<li>" + escapeHtml(line) + "</li>";
            })
            .join("") +
          "</ul>"
      );
    } else {
      parts.push('<p class="lab-muted">لا توجد تفاصيل توصيل محفوظة.</p>');
    }
    if (delivery.shipping_fee) {
      parts.push(
        '<p class="lab-delivery-line"><strong>مصاريف الشحن:</strong> ' +
          escapeHtml(moneyValue(delivery.shipping_fee)) +
          "</p>"
      );
    }
    if (delivery.free_over) {
      parts.push(
        '<p class="lab-delivery-line"><strong>شحن مجاني فوق:</strong> ' +
          escapeHtml(moneyValue(delivery.free_over)) +
          "</p>"
      );
    }
    if (delivery.eta_text) {
      parts.push(
        '<p class="lab-delivery-line"><strong>موعد التوصيل:</strong> ' +
          escapeHtml(delivery.eta_text) +
          "</p>"
      );
    }
    if (product.warranty || delivery.warranty) {
      parts.push(
        '<p class="lab-delivery-line"><strong>الضمان:</strong> ' +
          escapeHtml(product.warranty || delivery.warranty) +
          "</p>"
      );
    }
    var returnPolicy = product.return_policy || delivery.return_policy;
    if (returnPolicy) {
      parts.push(
        '<p class="lab-delivery-line"><strong>سياسة الإرجاع:</strong> ' +
          escapeHtml(returnPolicy) +
          "</p>"
      );
    }
    return parts.join("");
  }

  function relatedMarkup(related) {
    if (!related || !related.length) {
      return '<p class="lab-muted">لا توجد منتجات ذات صلة محفوظة.</p>';
    }
    return (
      '<div class="lab-related-grid">' +
      related
        .slice(0, 12)
        .map(function (item) {
          var url = productExternalUrl(item);
          var content =
            imageTag(item.image, item.name, "lab-related-img") +
            '<div class="lab-related-body"><strong>' +
            escapeHtml(item.name || "") +
            "</strong><span>" +
            escapeHtml(moneyValue(item.price)) +
            "</span></div>";
          return url
            ? '<a class="lab-related-card" href="' +
                escapeHtml(url) +
                '" target="_blank" rel="noopener noreferrer">' +
                content +
                "</a>"
            : '<div class="lab-related-card">' + content + "</div>";
        })
        .join("") +
      "</div>"
    );
  }

  function productDetailMarkup(product) {
    var images = toUrlList(product.images, product.image);
    var imagesHtml =
      images.length > 1
        ? '<div class="lab-detail-thumbs">' +
          images
            .slice(0, 12)
            .map(function (url, index) {
              return (
                '<button type="button" class="lab-detail-thumb' +
                (index === 0 ? " is-active" : "") +
                '" data-thumb-index="' +
                index +
                '" data-thumb-url="' +
                escapeHtml(url) +
                '">' +
                imageTag(url, product.name) +
                "</button>"
              );
            })
            .join("") +
          "</div>"
        : "";
    var breadcrumb =
      Array.isArray(product.breadcrumb) && product.breadcrumb.length
        ? '<div class="lab-detail-breadcrumb">' +
          product.breadcrumb
            .map(function (item) {
              return "<span>" + escapeHtml(item.name) + "</span>";
            })
            .join('<i class="fa-solid fa-angle-left"></i>') +
          "</div>"
        : "";
    var external = productExternalUrl(product);
    var seller = normalizeSeller(product.seller);
    var delivery = normalizeDelivery(product.delivery);
    var specs = normalizeSpecs(product.specs);
    var highlights = uniqueList(product.highlights);
    var discount = discountOf(product);
    var stock = stockInfo(product.stock_status, product.stock_text);
    var saved = state.savedIds.has(product.id);
    var preview = saved
      ? '<a class="btn btn-secondary" href="' +
        escapeHtml(productPageUrl(product.id)) +
        '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-eye"></i> معاينة BudoQ</a>'
      : "";
    var warnings =
      Array.isArray(product.warnings) && product.warnings.length
        ? '<div class="lab-warning-box"><strong><i class="fa-solid fa-triangle-exclamation"></i> ملاحظات السحب</strong><ul>' +
          product.warnings
            .map(function (warning) {
              return "<li>" + escapeHtml(warning) + "</li>";
            })
            .join("") +
          "</ul></div>"
        : "";

    var facts = [
      ["SKU", product.sku || "—"],
      ["البائع", seller.name || "—"],
      ["تقييم البائع", seller.rating ? seller.rating + "%" : "—"],
      ["متابعو البائع", seller.followers ? plainNumber(seller.followers) : "—"],
      ["حالة المخزون", stock.label],
      ["التقييم", product.rating ? product.rating.toFixed(1) + " / 5" : "—"],
      ["عدد التقييمات", product.reviews_count ? plainNumber(product.reviews_count) : "0"],
      ["الضمان", product.warranty || delivery.warranty || "—"],
      ["القسم", product.category || "—"],
      ["اللون", product.color || "—"],
      ["آخر سحب", formatDate(product.fetched_at)],
      ["العملة", product.currency || "EGP"],
    ];

    var jsonText = "";
    try {
      jsonText = JSON.stringify(product, null, 2);
    } catch (_error) {
      jsonText = "{}";
    }

    return (
      '<div class="lab-detail">' +
      '<div class="lab-detail-gallery">' +
      '<div class="lab-detail-main-image">' +
      imageTag(images[0] || product.image, product.name, "") +
      "</div>" +
      imagesHtml +
      "</div>" +
      '<div class="lab-detail-info">' +
      breadcrumb +
      "<h2>" +
      escapeHtml(product.name) +
      "</h2>" +
      '<div class="lab-detail-brand">' +
      escapeHtml([product.brand, product.category].filter(Boolean).join(" · ") || "جوميا مصر") +
      "</div>" +
      '<div class="lab-detail-price"><strong>' +
      escapeHtml(moneyValue(product.price)) +
      "</strong>" +
      (product.original_price > product.price
        ? "<del>" + escapeHtml(moneyValue(product.original_price)) + "</del>"
        : "") +
      (discount ? '<span class="lab-discount">-' + discount + "%</span>" : "") +
      "</div>" +
      '<div class="lab-detail-rating">' +
      starsMarkup(product.rating) +
      "<strong>" +
      (product.rating ? product.rating.toFixed(1) : "—") +
      "</strong><span>(" +
      plainNumber(product.reviews_count || 0) +
      " تقييم)</span>" +
      '<span class="lab-detail-stock ' +
      stock.cls +
      '">' +
      escapeHtml(stock.label) +
      "</span>" +
      "</div>" +
      '<div class="lab-detail-actions">' +
      '<button type="button" class="btn btn-primary" data-modal-action="save-draft"><i class="fa-solid fa-floppy-disk"></i> حفظ كمسودة</button>' +
      '<button type="button" class="btn btn-primary" data-modal-action="save-active"><i class="fa-solid fa-square-check"></i> حفظ وتنشيط</button>' +
      (external
        ? '<a class="btn btn-secondary" href="' +
          escapeHtml(external) +
          '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-store"></i> صفحة جوميا</a>'
        : "") +
      preview +
      '<button type="button" class="btn btn-secondary" data-modal-action="copy"><i class="fa-solid fa-copy"></i> نسخ JSON</button>' +
      '<button type="button" class="btn btn-secondary lab-danger-btn" data-modal-action="remove"><i class="fa-solid fa-trash"></i> حذف من القائمة</button>' +
      "</div>" +
      '<div class="lab-detail-facts">' +
      facts
        .map(function (fact) {
          return (
            '<div><span>' +
            escapeHtml(fact[0]) +
            "</span><strong>" +
            escapeHtml(fact[1]) +
            "</strong></div>"
          );
        })
        .join("") +
      "</div>" +
      warnings +
      "</div>" +
      "</div>" +
      '<div class="lab-detail-sections">' +
      '<section class="lab-detail-section">' +
      "<h3><i class=\"fa-solid fa-list\"></i> المواصفات</h3>" +
      specsMarkup(specs) +
      "</section>" +
      '<section class="lab-detail-section">' +
      "<h3><i class=\"fa-solid fa-wand-magic-sparkles\"></i> أبرز المميزات</h3>" +
      (highlights.length
        ? '<ul class="lab-highlights-list">' +
          highlights
            .map(function (item) {
              return "<li>" + escapeHtml(item) + "</li>";
            })
            .join("") +
          "</ul>"
        : '<p class="lab-muted">لا توجد مميزات محفوظة.</p>') +
      "</section>" +
      '<section class="lab-detail-section">' +
      "<h3><i class=\"fa-solid fa-star\"></i> التقييمات</h3>" +
      ratingBreakdownMarkup(product) +
      "</section>" +
      '<section class="lab-detail-section">' +
      "<h3><i class=\"fa-solid fa-store\"></i> البائع</h3>" +
      (seller.name
        ? '<div class="lab-seller-card"><div class="lab-seller-head"><strong>' +
          escapeHtml(seller.name) +
          "</strong>" +
          (seller.rating
            ? '<span class="lab-seller-score"><i class="fa-solid fa-thumbs-up"></i> ' +
              seller.rating +
              "%</span>"
            : "") +
          (seller.followers
            ? '<span class="lab-seller-followers"><i class="fa-solid fa-user-group"></i> ' +
              plainNumber(seller.followers) +
              " متابع</span>"
            : "") +
          "</div>" +
          sellerPerformanceMarkup(seller) +
          (seller.url
            ? '<a class="lab-mini-link" href="' +
              escapeHtml(seller.url) +
              '" target="_blank" rel="noopener noreferrer">صفحة البائع على جوميا <i class="fa-solid fa-arrow-up-right-from-square"></i></a>'
            : "") +
          "</div>"
        : '<p class="lab-muted">لا توجد بيانات بائع.</p>') +
      "</section>" +
      '<section class="lab-detail-section">' +
      "<h3><i class=\"fa-solid fa-truck-fast\"></i> التوصيل والإرجاع</h3>" +
      deliveryMarkup(product) +
      "</section>" +
      '<section class="lab-detail-section lab-detail-section-wide">' +
      "<h3><i class=\"fa-solid fa-align-right\"></i> الوصف</h3>" +
      '<p class="lab-detail-description">' +
      escapeHtml(cleanText(product.description || JUMIA_DESCRIPTION, true)) +
      "</p>" +
      "</section>" +
      '<section class="lab-detail-section lab-detail-section-wide">' +
      "<h3><i class=\"fa-solid fa-layer-group\"></i> منتجات ذات صلة</h3>" +
      relatedMarkup(product.related) +
      "</section>" +
      "</div>" +
      '<details class="lab-detail-json"><summary><i class="fa-solid fa-code"></i> JSON الكامل للمنتج</summary><pre>' +
      escapeHtml(jsonText) +
      "</pre></details>"
    );
  }

  function openProductModal(product) {
    if (!product || !el.productModal || !el.modalBody) return;
    state.modalProduct = product;
    el.modalBody.innerHTML = productDetailMarkup(product);
    el.productModal.classList.add("is-open");
    el.productModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeProductModal() {
    if (!el.productModal) return;
    el.productModal.classList.remove("is-open");
    el.productModal.setAttribute("aria-hidden", "true");
    if (!el.saveModal || !el.saveModal.classList.contains("is-open")) {
      document.body.style.overflow = "";
    }
  }

  function removeProductFromLab(product) {
    if (!product) return;
    var confirmed = window.confirm("حذف «" + product.name + "» من قائمة المنتجات المسحوبة؟");
    if (!confirmed) return;
    removeProductFromState(product.id, true);
    closeProductModal();
    rebuildCategoryFilter();
    renderGrid();
    updateStats();
    toast("تم حذف المنتج من القائمة المحلية.", "success");
  }

  // ------------------------------------------------------------------
  // Inspect
  // ------------------------------------------------------------------

  function renderInspectLoading(text) {
    if (!el.inspectResult) return;
    el.inspectResult.innerHTML =
      '<div class="card lab-inspect-loading"><span class="lab-spinner"><i class="fa-solid fa-spinner fa-spin"></i></span><strong>' +
      escapeHtml(text || "جارٍ الفحص...") +
      "</strong><p class=\"lab-hint\">قد يستغرق حتى دقيقة إذا كانت جوميا بطيئة.</p></div>";
  }

  function renderInspectError(message) {
    if (!el.inspectResult) return;
    el.inspectResult.innerHTML =
      '<div class="card lab-inspect-error"><i class="fa-solid fa-circle-exclamation"></i><strong>تعذر الفحص</strong><p>' +
      escapeHtml(message) +
      '</p><p class="lab-hint">جرّب «لصق HTML» من صفحة المنتج المحفوظة في متصفحك كبديل.</p></div>';
  }

  function renderInspectCandidates(result) {
    if (!el.inspectResult) return;
    var products = (result && result.products) || [];
    if (!products.length) {
      renderInspectError("لم يتم العثور على منتجات في هذا الرابط. جرّب رابط قسم أو بحث مختلف.");
      return;
    }
    el.inspectResult.innerHTML =
      '<div class="card inspect-candidates"><h4><i class="fa-solid fa-list"></i> منتجات الصفحة (' +
      products.length +
      ")</h4><div class=\"lab-candidate-list\">" +
      products
        .slice(0, 40)
        .map(function (item) {
          return (
            '<button type="button" class="inspect-candidate" data-inspect-url="' +
            escapeHtml(item.url) +
            '">' +
            imageTag(item.image, item.name) +
            "<span>" +
            escapeHtml(item.name) +
            "</span><em>" +
            escapeHtml(moneyValue(item.price)) +
            "</em></button>"
          );
        })
        .join("") +
      "</div></div>";
  }

  function renderInspectProduct(product) {
    if (!el.inspectResult) return;
    state.inspectProduct = product;
    var checks = [
      { label: "اسم المنتج", ok: Boolean(product.name), detail: product.name ? "موجود" : "مفقود" },
      { label: "السعر", ok: safeNumber(product.price) > 0, detail: moneyValue(product.price) },
      {
        label: "الصور",
        ok: product.images && product.images.length > 0,
        detail: (product.images || []).length + " صورة",
      },
      {
        label: "المواصفات",
        ok: product.specs && product.specs.length > 0,
        detail: (product.specs || []).length + " مواصفة",
      },
      {
        label: "البائع",
        ok: Boolean(product.seller && product.seller.name),
        detail: (product.seller && product.seller.name) || "مفقود",
      },
      {
        label: "التقييمات",
        ok: safeNumber(product.rating) > 0 || safeNumber(product.reviews_count) > 0,
        detail: product.rating ? product.rating.toFixed(1) + " / 5" : "لا يوجد",
      },
      {
        label: "الوصف",
        ok: cleanText(product.description).length > 20,
        detail: cleanText(product.description).length + " حرف",
      },
      {
        label: "التوصيل والضمان",
        ok: Boolean(
          (product.delivery && product.delivery.lines && product.delivery.lines.length) ||
            product.warranty ||
            (product.delivery && product.delivery.warranty)
        ),
        detail: product.warranty || (product.delivery && product.delivery.warranty) || "غير محدد",
      },
    ];
    var failed = checks.filter(function (check) {
      return !check.ok;
    }).length;
    var verdict =
      failed === 0
        ? '<span class="inspect-verdict is-ok"><i class="fa-solid fa-circle-check"></i> جاهز للحفظ</span>'
        : '<span class="inspect-verdict is-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' +
          failed +
          " حقول ناقصة</span>";
    var warnings =
      Array.isArray(product.warnings) && product.warnings.length
        ? '<div class="lab-warning-box"><strong>ملاحظات</strong><ul>' +
          product.warnings
            .map(function (warning) {
              return "<li>" + escapeHtml(warning) + "</li>";
            })
            .join("") +
          "</ul></div>"
        : "";
    var specs = normalizeSpecs(product.specs);
    var highlights = uniqueList(product.highlights);
    var external = productExternalUrl(product);
    el.inspectResult.innerHTML =
      '<div class="card inspect-card">' +
      '<div class="inspect-media">' +
      imageTag(product.image, product.name) +
      "</div>" +
      '<div class="inspect-body">' +
      '<div class="lab-inspect-topline">' +
      verdict +
      '<span class="lab-badge source-jumia">جوميا</span>' +
      "</div>" +
      "<h3>" +
      escapeHtml(product.name) +
      "</h3>" +
      '<span class="lab-card-brand">' +
      escapeHtml([product.brand, product.category].filter(Boolean).join(" · ") || "جوميا مصر") +
      "</span>" +
      '<div class="inspect-price">' +
      escapeHtml(moneyValue(product.price)) +
      (product.original_price > product.price
        ? "<del>" + escapeHtml(moneyValue(product.original_price)) + "</del>"
        : "") +
      "</div>" +
      ratingMarkup(product) +
      '<div class="inspect-checks">' +
      checks
        .map(function (check) {
          return (
            '<div class="inspect-check ' +
            (check.ok ? "ok" : "fail") +
            '"><i class="fa-solid ' +
            (check.ok ? "fa-circle-check" : "fa-circle-xmark") +
            '"></i><span>' +
            escapeHtml(check.label) +
            "</span><code>" +
            escapeHtml(check.detail) +
            "</code></div>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="inspect-actions">' +
      '<button type="button" class="btn btn-primary" data-inspect-add><i class="fa-solid fa-plus"></i> إضافة إلى القائمة</button>' +
      '<button type="button" class="btn btn-primary" data-inspect-save><i class="fa-solid fa-floppy-disk"></i> حفظ في Supabase</button>' +
      '<button type="button" class="btn btn-secondary" data-inspect-details><i class="fa-solid fa-eye"></i> التفاصيل الكاملة</button>' +
      (external
        ? '<a class="btn btn-secondary" href="' +
          escapeHtml(external) +
          '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-store"></i> صفحة جوميا</a>'
        : "") +
      "</div>" +
      warnings +
      (specs.length
        ? '<div class="lab-inspect-mini"><h4>أول ' +
          Math.min(8, specs.length) +
          " مواصفة</h4><ul>" +
          specs
            .slice(0, 8)
            .map(function (row) {
              return (
                "<li><span>" +
                escapeHtml(row.label) +
                ":</span> " +
                escapeHtml(row.value) +
                "</li>"
              );
            })
            .join("") +
          "</ul></div>"
        : "") +
      (highlights.length
        ? '<div class="lab-inspect-mini"><h4>أبرز المميزات</h4><ul>' +
          highlights
            .slice(0, 6)
            .map(function (item) {
              return "<li>" + escapeHtml(item) + "</li>";
            })
            .join("") +
          "</ul></div>"
        : "") +
      "</div>" +
      "</div>";
  }

  async function inspectProductByUrl(url) {
    if (!url) {
      toast("أضف رابط منتج أو بحث.", "info");
      return;
    }
    if (el.inspectInput) el.inspectInput.value = url;
    renderInspectLoading("جارٍ فتح صفحة جوميا وسحب التفاصيل...");
    if (el.inspectBtn) el.inspectBtn.disabled = true;
    try {
      var payload = await fetchProductRemote(url);
      var product = normalizeJumiaProduct(payload.product || payload, url);
      if (!product) throw new Error("تعذر تحليل صفحة المنتج");
      renderInspectProduct(product);
      log("inspect ok: " + product.name, "ok");
      toast("تم سحب المنتج. راجع التفاصيل قبل الحفظ.", "success");
    } catch (error) {
      renderInspectError(error && error.message ? error.message : String(error));
      log("inspect failed: " + (error && error.message ? error.message : error), "error");
    } finally {
      if (el.inspectBtn) el.inspectBtn.disabled = false;
    }
  }

  async function inspectFromInput() {
    if (!el.inspectInput) return;
    var input = cleanText(el.inspectInput.value);
    if (!input) {
      toast("أضف رابط منتج من جوميا أولًا.", "info");
      return;
    }
    if (!/^https?:\/\//i.test(input)) {
      input = "https://www.jumia.com.eg/ar/catalog/?q=" + encodeURIComponent(input);
    }
    if (isProductUrl(input) || /\/product\/\d{5,}/i.test(input)) {
      await inspectProductByUrl(input);
      return;
    }
    renderInspectLoading("جارٍ قراءة صفحة القسم/البحث...");
    if (el.inspectBtn) el.inspectBtn.disabled = true;
    try {
      var result = await discoverListingRemote(input, 1);
      renderInspectCandidates(result);
      toast(
        "تم العثور على " + ((result.products && result.products.length) || 0) + " منتج.",
        "success"
      );
    } catch (error) {
      renderInspectError(error && error.message ? error.message : String(error));
      log("inspect listing failed: " + error.message, "error");
    } finally {
      if (el.inspectBtn) el.inspectBtn.disabled = false;
    }
  }

  async function parsePastedHtml() {
    if (!el.pasteHtml) return;
    var html = String(el.pasteHtml.value || "");
    if (html.length < 200) {
      toast("الصق كود HTML كاملًا لصفحة المنتج.", "error");
      return;
    }
    var url = el.pasteUrl ? cleanText(el.pasteUrl.value) : "";
    renderInspectLoading("جارٍ تحليل HTML المُلصق...");
    if (el.parseHtmlBtn) el.parseHtmlBtn.disabled = true;
    try {
      var payload = await parseHtmlRemote(html, url);
      var product = normalizeJumiaProduct(payload.product || payload, url);
      if (!product) throw new Error("تعذر تحليل HTML — تأكد من لصق صفحة منتج كاملة.");
      if (!product.url && url) product.url = canonicalUrl(url);
      renderInspectProduct(product);
      toast("تم تحليل الصفحة. راجع التفاصيل قبل الحفظ.", "success");
      log("paste parse ok: " + product.name, "ok");
    } catch (error) {
      renderInspectError(error && error.message ? error.message : String(error));
    } finally {
      if (el.parseHtmlBtn) el.parseHtmlBtn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Browser bridge: Jumia rate-limits the scraper (HTTP 429) but the
  // admin's own browser can open the page. The bookmarklet posts the
  // parsed product back to this tab via window.opener.postMessage.
  // ------------------------------------------------------------------

  function bridgeEndpoint() {
    var base = String(state.apiBase || "http://127.0.0.1:8788").replace(/\/+$/, "");
    return base + "/api/jumia/product";
  }

  function buildBridgeCode() {
    return (
      "javascript:(async()=>{try{" +
      "const r=await fetch(" +
      JSON.stringify(bridgeEndpoint()) +
      ",{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:location.href,html:'<!doctype html>'+document.documentElement.outerHTML})});" +
      "const j=await r.json();if(!j.ok)throw new Error(j.error||('HTTP '+r.status));" +
      "if(!window.opener)throw new Error('افتح الصفحة من زر «فتح الصفحة» في المختبر أولًا');" +
      "window.opener.postMessage({type:'boda:jumia-product',product:j.product},'*');" +
      "}catch(e){alert('تعذر إرسال المنتج: '+e.message);}})()"
    );
  }

  function refreshBridgeUi() {
    var code = buildBridgeCode();
    if (el.bridgeCode) el.bridgeCode.textContent = code;
  }

  function copyBridgeCode() {
    var code = buildBridgeCode();
    if (el.bridgeCode) el.bridgeCode.textContent = code;
    var done = function () {
      toast("تم نسخ كود الربط. أضفه كإشارة مرجعية في المتصفح.", "success");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(function () {
        toast("انسخ الكود يدويًا من الصندوق بالأسفل.", "info");
      });
      return;
    }
    toast("انسخ الكود يدويًا من الصندوق بالأسفل.", "info");
  }

  function openBridgePage() {
    var url = cleanText(el.inspectInput ? el.inspectInput.value : "");
    if (!url) {
      toast("الصق رابط صفحة المنتج أولًا.", "info");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      url = "https://www.jumia.com.eg/ar/catalog/?q=" + encodeURIComponent(url);
    }
    refreshBridgeUi();
    var win = window.open(url, "jumiaBridgeProduct");
    if (!win) toast("المتصفح منع فتح النافذة. اسمح بالنوافذ المنبثقة.", "error");
  }

  function handleBridgeMessage(event) {
    if (!/^https:\/\/([a-z0-9-]+\.)?jumia\.com\.eg$/i.test(String(event.origin || ""))) return;
    var data = event.data;
    if (!data || data.type !== "boda:jumia-product" || !data.product) return;
    var product = normalizeJumiaProduct(data.product, data.product.url || "");
    if (!product) {
      toast("وصل منتج غير صالح من جسر المتصفح.", "error");
      return;
    }
    if (el.inspectInput && product.url) el.inspectInput.value = product.url;
    renderInspectProduct(product);
    switchTab("inspect", true);
    if (el.inspectResult) el.inspectResult.scrollIntoView({ behavior: "smooth", block: "center" });
    window.focus();
    toast("وصل المنتج من المتصفح: " + product.name, "success");
    log("bridge received: " + product.name, "ok");
  }

  function addInspectProductToLab() {
    var product = state.inspectProduct;
    if (!product) {
      toast("افحص منتجًا أولًا.", "info");
      return null;
    }
    var added = upsertScrapedProduct(product);
    if (!added) {
      toast("تعذر إضافة المنتج.", "error");
      return null;
    }
    state.selected.add(added.id);
    state.bulkHidden = false;
    rebuildCategoryFilter();
    renderGrid();
    updateStats();
    switchTab("products");
    toast("تمت إضافة المنتج إلى القائمة وتحديده.", "success");
    log("inspect product added: " + added.name, "ok");
    return added;
  }

  // ------------------------------------------------------------------
  // Import
  // ------------------------------------------------------------------

  function normalizeImportItem(item) {
    if (!item || typeof item !== "object") return null;
    var url = cleanText(item.url || item.link || item.product_url || "");
    var normalized = normalizeJumiaProduct(
      Object.assign({}, item, {
        url: url,
        source: "jumia",
        fetched_at: new Date().toISOString(),
      }),
      url
    );
    return normalized;
  }

  function renderImportPreview() {
    if (!el.importPreview) return;
    var list = state.importPreview;
    if (!list.length) {
      el.importPreview.innerHTML = "";
      return;
    }
    var withImages = list.filter(function (product) {
      return product.image;
    }).length;
    var withSpecs = list.filter(function (product) {
      return product.specs && product.specs.length;
    }).length;
    el.importPreview.innerHTML =
      '<div class="import-summary"><strong>' +
      list.length +
      " منتج صالح</strong> · " +
      withImages +
      " بصورة · " +
      withSpecs +
      " بمواصفات</div>" +
      '<div class="lab-import-list">' +
      list
        .slice(0, 8)
        .map(function (product) {
          return (
            '<div class="lab-import-row">' +
            imageTag(product.image, product.name) +
            "<div><strong>" +
            escapeHtml(product.name) +
            "</strong><span>" +
            escapeHtml(moneyValue(product.price)) +
            (product.seller && product.seller.name
              ? " · " + escapeHtml(product.seller.name)
              : "") +
            "</span></div></div>"
          );
        })
        .join("") +
      "</div>";
  }

  function parseImportJson() {
    if (!el.importJson) return;
    var text = el.importJson.value.trim();
    if (!text) {
      toast("الصق JSON أولًا.", "info");
      return;
    }
    var payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      toast("JSON غير صالح: " + error.message, "error");
      return;
    }
    var list = Array.isArray(payload)
      ? payload
      : payload.products || payload.items || payload.data || [];
    if (!Array.isArray(list)) {
      toast("لم أجد مصفوفة منتجات في JSON.", "error");
      return;
    }
    var normalized = list.map(normalizeImportItem).filter(Boolean);
    state.importPreview = normalized;
    renderImportPreview();
    if (el.sendToPullBtn) el.sendToPullBtn.disabled = normalized.length === 0;
    if (normalized.length) {
      toast(
        "تم تحليل " +
          normalized.length +
          " منتج من " +
          list.length +
          ". راجع ثم أضفها للقائمة.",
        "success"
      );
    } else {
      toast("لم يتم العثور على منتجات صالحة (كل منتج يحتاج اسمًا على الأقل).", "error");
    }
  }

  function sendImportToLab() {
    var list = state.importPreview;
    if (!list.length) {
      toast("حلّل JSON أولًا.", "info");
      return;
    }
    var added = [];
    list.forEach(function (product) {
      var result = upsertScrapedProduct(product);
      if (result) added.push(result);
    });
    if (!added.length) {
      toast("لم تتم إضافة أي منتج.", "error");
      return;
    }
    rebuildCategoryFilter();
    renderGrid();
    updateStats();
    switchTab("products");
    toast("تمت إضافة " + added.length + " منتج إلى القائمة.", "success");
    log("imported " + added.length + " products", "ok");
  }

  // ------------------------------------------------------------------
  // Tabs / setup helpers
  // ------------------------------------------------------------------

  function switchTab(name, persist) {
    var valid = ["crawl", "products", "saved", "inspect", "import"];
    var tab = valid.indexOf(name) === -1 ? "crawl" : name;
    qsa("[data-tab]").forEach(function (button) {
      var active = button.getAttribute("data-tab") === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    valid.forEach(function (key) {
      var panel = document.getElementById("panel-" + key);
      if (panel) panel.classList.toggle("is-active", key === tab);
    });
    state.settings.tab = tab;
    if (persist !== false) persistSettings();
    if (tab === "products") renderGrid();
    if (tab === "saved" && !state.loadedSaved && !state.loadingSaved) {
      loadSavedIndex({ silent: false });
    }
  }

  function updateCrawlModeUi() {
    if (!el.crawlMode) return;
    var mode = el.crawlMode.value;
    if (el.pagesInput) el.pagesInput.disabled = mode !== "listing";
    if (el.crawlSources) {
      if (mode === "sitemap") {
        el.crawlSources.placeholder =
          "https://www.jumia.com.eg/sitemap.xml\nاتركه فارغًا لقراءة robots.txt تلقائيًا";
      } else if (mode === "links") {
        el.crawlSources.placeholder =
          "https://www.jumia.com.eg/ar/product-name-123456789.html";
      } else {
        el.crawlSources.placeholder =
          "https://www.jumia.com.eg/ar/catalog/?q=earbuds";
      }
    }
  }

  function applyPreset(name) {
    if (!el.crawlMode) return;
    if (name === "categories") {
      el.crawlMode.value = "listing";
      if (el.crawlSources) el.crawlSources.value = DEFAULT_SOURCES.join("\n");
      if (el.pagesInput) el.pagesInput.value = "3";
      if (el.maxProductsInput) el.maxProductsInput.value = "500";
    } else if (name === "offers") {
      el.crawlMode.value = "listing";
      if (el.crawlSources) {
        el.crawlSources.value = "https://www.jumia.com.eg/ar/catalog/?q=offers";
      }
      if (el.pagesInput) el.pagesInput.value = "3";
    } else if (name === "search") {
      var term = window.prompt("اكتب كلمة البحث على جوميا مصر:", "earbuds");
      if (!term) return;
      el.crawlMode.value = "listing";
      if (el.crawlSources) {
        el.crawlSources.value =
          "https://www.jumia.com.eg/ar/catalog/?q=" + encodeURIComponent(term.trim());
      }
      if (el.pagesInput) el.pagesInput.value = "2";
    } else if (name === "sitemap") {
      el.crawlMode.value = "sitemap";
      if (el.crawlSources) el.crawlSources.value = "";
      if (el.maxProductsInput) el.maxProductsInput.value = "1000";
    }
    updateCrawlModeUi();
    persistSettings();
    toast("تم تطبيق المصدر الجاهز.", "success");
  }

  async function copyServerCommand() {
    copyText("node server/jumia-server.mjs");
  }

  async function copySqlFile() {
    var sql = FALLBACK_SQL;
    try {
      var response = await fetch(DEFAULT_SQL_FILE, { cache: "no-store" });
      if (response.ok) {
        var text = await response.text();
        if (text && text.length > 100) sql = text;
      }
    } catch (_error) {
      // نستخدم النسخة المدمجة.
    }
    copyText(sql);
  }

  async function refreshEverything() {
    if (state.crawl.running) {
      toast("أوقف السحب قبل التحديث الشامل.", "info");
      return;
    }
    if (el.refreshAllBtn) el.refreshAllBtn.disabled = true;
    try {
      await detectApi({ silent: true });
      await loadSavedIndex({ force: true, silent: false });
      recomputeChangedFlags();
      rebuildCategoryFilter();
      renderAll();
      toast("تم تحديث حالة السيرفر والمحفوظات.", "success");
    } finally {
      if (el.refreshAllBtn) el.refreshAllBtn.disabled = false;
    }
  }

  function renderAll() {
    rebuildCategoryFilter();
    renderGrid();
    renderSaved();
    renderSyncList();
    updateStats();
    renderQueue();
    updateCrawlProgress();
    updateSqlState();
    updateSetupSummary();
    updateCrawlModeUi();
  }

  // ------------------------------------------------------------------
  // Event wiring
  // ------------------------------------------------------------------

  function bindEvents() {
    qsa("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        switchTab(button.getAttribute("data-tab"), true);
      });
    });

    if (el.refreshAllBtn) el.refreshAllBtn.addEventListener("click", refreshEverything);
    if (el.detectApiBtn) el.detectApiBtn.addEventListener("click", function () { detectApi({ silent: false }); });
    if (el.copyServerBtn) el.copyServerBtn.addEventListener("click", copyServerCommand);
    if (el.copySqlBtn) el.copySqlBtn.addEventListener("click", copySqlFile);
    if (el.sqlStatusSelect) {
      el.sqlStatusSelect.addEventListener("change", function () {
        persistSettings();
        updateSqlState();
        updateSetupSummary();
      });
    }
    if (el.apiBaseInput) {
      el.apiBaseInput.addEventListener("change", persistSettings);
      el.apiBaseInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          detectApi({ silent: false });
        }
      });
    }

    if (el.startCrawlBtn) el.startCrawlBtn.addEventListener("click", startCrawl);
    if (el.pauseCrawlBtn) el.pauseCrawlBtn.addEventListener("click", togglePauseCrawl);
    if (el.stopCrawlBtn) el.stopCrawlBtn.addEventListener("click", stopCrawl);
    if (el.clearCrawlBtn) el.clearCrawlBtn.addEventListener("click", clearScrapedProducts);
    if (el.exportJsonBtn) el.exportJsonBtn.addEventListener("click", exportProductsJson);
    if (el.goProductsBtn) el.goProductsBtn.addEventListener("click", function () { switchTab("products", true); });

    qsa("[data-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyPreset(button.getAttribute("data-preset"));
      });
    });

    if (el.crawlMode) {
      el.crawlMode.addEventListener("change", function () {
        updateCrawlModeUi();
        persistSettings();
      });
    }
    [el.pagesInput, el.maxProductsInput, el.delayInput, el.crawlSources].forEach(function (node) {
      if (node) node.addEventListener("change", persistSettings);
    });
    [el.skipSavedInput, el.autoSaveInput, el.activateOnSave].forEach(function (node) {
      if (node) node.addEventListener("change", persistSettings);
    });

    if (el.productSearch) {
      el.productSearch.addEventListener("input", function () {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(function () {
          state.visibleCount = PAGE_SIZE;
          renderGrid();
          updateStats();
        }, 180);
      });
    }
    [el.productCategory, el.productSort, el.onlySelected, el.onlyDiscount, el.onlySaved, el.onlyChanged].forEach(function (node) {
      if (node) {
        node.addEventListener("change", function () {
          state.visibleCount = PAGE_SIZE;
          renderGrid();
          updateStats();
        });
      }
    });
    if (el.selectAllBtn) el.selectAllBtn.addEventListener("click", selectAllFiltered);
    if (el.selectVisibleBtn) el.selectVisibleBtn.addEventListener("click", selectVisible);
    if (el.invertSelectionBtn) el.invertSelectionBtn.addEventListener("click", invertSelection);
    if (el.clearSelectionBtn) el.clearSelectionBtn.addEventListener("click", clearSelection);
    if (el.loadMoreBtn) {
      el.loadMoreBtn.addEventListener("click", function () {
        state.visibleCount += PAGE_SIZE;
        renderGrid();
      });
    }

    if (el.labGrid) {
      el.labGrid.addEventListener("change", function (event) {
        var checkbox = event.target.closest("[data-select]");
        if (!checkbox) return;
        toggleSelection(checkbox.getAttribute("data-select"), checkbox.checked);
      });
      el.labGrid.addEventListener("click", function (event) {
        var actionNode = event.target.closest("[data-action]");
        if (!actionNode) return;
        var id = actionNode.getAttribute("data-id");
        var product = state.byId.get(id);
        if (!product) return;
        var action = actionNode.getAttribute("data-action");
        if (action === "details") openProductModal(product);
        else if (action === "save") {
          saveProducts([product], { force: true, silent: false }).catch(function () {});
        }
      });
    }

    if (el.bulkBar) {
      if (el.saveSelectedBtn) el.saveSelectedBtn.addEventListener("click", saveSelectedProducts);
      if (el.saveAllBtn) el.saveAllBtn.addEventListener("click", saveAllProducts);
      if (el.updateSelectedBtn) el.updateSelectedBtn.addEventListener("click", updateSelectedProducts);
      if (el.hideBulkBar) {
        el.hideBulkBar.addEventListener("click", function () {
          state.bulkHidden = true;
          updateStats();
        });
      }
    }

    if (el.savedSearch) {
      el.savedSearch.addEventListener("input", function () {
        window.clearTimeout(savedSearchTimer);
        savedSearchTimer = window.setTimeout(function () {
          state.savedVisible = SAVED_PAGE_SIZE;
          renderSaved();
        }, 180);
      });
    }
    if (el.savedFilter) {
      el.savedFilter.addEventListener("change", function () {
        state.savedVisible = SAVED_PAGE_SIZE;
        renderSaved();
      });
    }
    if (el.reloadSavedBtn) {
      el.reloadSavedBtn.addEventListener("click", function () {
        loadSavedIndex({ force: true, silent: false });
      });
    }
    if (el.savedMoreBtn) {
      el.savedMoreBtn.addEventListener("click", function () {
        // أولاً نكشف ما تم جلبه، وبعدها نجلب صفحة جديدة من نفس السيرفر.
        if (filterSavedRows().length > state.savedVisible) {
          state.savedVisible += SAVED_PAGE_SIZE;
          renderSaved();
          return;
        }
        loadMoreSaved();
      });
    }
    if (el.savedGrid) {
      el.savedGrid.addEventListener("click", function (event) {
        var actionNode = event.target.closest("[data-saved-action]");
        if (!actionNode) return;
        var id = actionNode.getAttribute("data-id");
        var action = actionNode.getAttribute("data-saved-action");
        var row = savedRowById(id);
        if (!row) return;
        if (action === "toggle") toggleSavedRow(id, !row.is_active);
        else if (action === "delete") deleteSavedRow(id);
        else if (action === "details") openSavedDetails(id);
        else if (action === "sync") startSync([row]);
      });
    }

    if (el.syncStartBtn) el.syncStartBtn.addEventListener("click", function () { startSync(); });
    if (el.syncStopBtn) {
      el.syncStopBtn.addEventListener("click", function () {
        state.sync.stop = true;
        if (el.syncStatus) el.syncStatus.textContent = "جارٍ إيقاف الفحص...";
      });
    }
    if (el.applySyncBtn) el.applySyncBtn.addEventListener("click", applySyncChanges);

    if (el.saveProxyBtn) {
      el.saveProxyBtn.addEventListener("click", function () {
        saveProxyList("replace");
      });
    }
    if (el.appendProxyBtn) {
      el.appendProxyBtn.addEventListener("click", function () {
        saveProxyList("append");
      });
    }
    if (el.testProxyBtn) el.testProxyBtn.addEventListener("click", testProxyList);
    if (el.refreshProxyBtn) {
      el.refreshProxyBtn.addEventListener("click", function () {
        refreshProxyPool({ silent: false });
      });
    }
    if (el.clearProxyBtn) el.clearProxyBtn.addEventListener("click", clearProxyList);
    [el.workerCountInput, el.proxyTestLimitInput].forEach(function (node) {
      if (node) node.addEventListener("change", persistSettings);
    });
    if (el.useProxyPoolInput) {
      el.useProxyPoolInput.addEventListener("change", function () {
        persistSettings();
        renderProxyStats();
      });
    }
    if (el.checkServersBtn) el.checkServersBtn.addEventListener("click", scanServers);
    if (el.addMissingServersBtn) {
      el.addMissingServersBtn.addEventListener("click", addMissingToServers);
    }
    if (el.autoServerSyncInput) {
      el.autoServerSyncInput.addEventListener("change", persistSettings);
    }
    if (el.syncList) {
      el.syncList.addEventListener("change", function (event) {
        if (event.target.matches("[data-sync-all]")) {
          var checked = event.target.checked;
          state.sync.changes.forEach(function (change) {
            if (change.status === "pending" && change.changes.length) change.selected = checked;
          });
          renderSyncList();
          return;
        }
        var checkbox = event.target.closest("[data-sync-select]");
        if (!checkbox) return;
        var id = checkbox.getAttribute("data-sync-select");
        var change = state.sync.changes.find(function (entry) {
          return entry.id === id;
        });
        if (change) {
          change.selected = checkbox.checked;
          updateSyncProgress(state.sync.checked, state.sync.total, el.syncStatus ? el.syncStatus.textContent : "");
        }
      });
      el.syncList.addEventListener("click", function (event) {
        var node = event.target.closest("[data-sync-details]");
        if (!node) return;
        var id = node.getAttribute("data-sync-details");
        var change = state.sync.changes.find(function (entry) {
          return entry.id === id;
        });
        if (change && change.product) openProductModal(change.product);
      });
    }

    if (el.inspectBtn) el.inspectBtn.addEventListener("click", inspectFromInput);
    if (el.inspectInput) {
      el.inspectInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          inspectFromInput();
        }
      });
    }
    qsa("[data-sample]").forEach(function (button) {
      button.addEventListener("click", function () {
        var sample = button.getAttribute("data-sample");
        if (sample === "first") {
          var product = state.products[0];
          if (!product || !productExternalUrl(product)) {
            toast("لا يوجد منتج مسحوب بعد.", "info");
            return;
          }
          inspectProductByUrl(productExternalUrl(product));
        } else if (sample === "search") {
          var term = window.prompt("كلمة البحث:", "earbuds");
          if (!term) return;
          inspectProductByUrl(
            "https://www.jumia.com.eg/ar/catalog/?q=" + encodeURIComponent(term.trim())
          );
        } else if (sample === "paste") {
          if (el.pasteBox) {
            el.pasteBox.open = true;
            el.pasteBox.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          if (el.pasteHtml) el.pasteHtml.focus();
        }
      });
    });
    if (el.parseHtmlBtn) el.parseHtmlBtn.addEventListener("click", parsePastedHtml);
    if (el.openBridgeBtn) el.openBridgeBtn.addEventListener("click", openBridgePage);
    if (el.copyBridgeBtn) el.copyBridgeBtn.addEventListener("click", copyBridgeCode);
    window.addEventListener("message", handleBridgeMessage);
    refreshBridgeUi();
    if (el.inspectResult) {
      el.inspectResult.addEventListener("click", function (event) {
        var candidate = event.target.closest("[data-inspect-url]");
        if (candidate) {
          inspectProductByUrl(candidate.getAttribute("data-inspect-url"));
          return;
        }
        if (event.target.closest("[data-inspect-add]")) {
          addInspectProductToLab();
          return;
        }
        if (event.target.closest("[data-inspect-save]")) {
          (async function () {
            var added = addInspectProductToLab();
            if (added) await saveProducts([added], { active: false, force: false });
          })();
          return;
        }
        if (event.target.closest("[data-inspect-details]") && state.inspectProduct) {
          openProductModal(state.inspectProduct);
        }
      });
    }

    if (el.parseImportBtn) el.parseImportBtn.addEventListener("click", parseImportJson);
    if (el.sendToPullBtn) el.sendToPullBtn.addEventListener("click", sendImportToLab);

    qsa("[data-close-modal]").forEach(function (node) {
      node.addEventListener("click", closeProductModal);
    });
    qsa("[data-close-save]").forEach(function (node) {
      node.addEventListener("click", closeSaveModal);
    });
    if (el.modalBody) {
      el.modalBody.addEventListener("click", function (event) {
        var thumb = event.target.closest("[data-thumb-index]");
        if (thumb) {
          var main = el.modalBody.querySelector(".lab-detail-main-image img");
          if (main) main.src = thumb.getAttribute("data-thumb-url") || main.src;
          qsa(".lab-detail-thumb", el.modalBody).forEach(function (node) {
            node.classList.toggle("is-active", node === thumb);
          });
          return;
        }
        var actionNode = event.target.closest("[data-modal-action]");
        if (!actionNode) return;
        var action = actionNode.getAttribute("data-modal-action");
        var product = state.modalProduct;
        if (!product) return;
        if (action === "save-draft") {
          saveProducts([product], { active: false, force: true, silent: false }).catch(function () {});
        } else if (action === "save-active") {
          saveProducts([product], { active: true, force: true, silent: false }).catch(function () {});
        } else if (action === "copy") {
          var json = "";
          try {
            json = JSON.stringify(product, null, 2);
          } catch (_error) {
            json = "{}";
          }
          copyText(json);
        } else if (action === "remove") {
          removeProductFromLab(product);
        }
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (el.saveModal && el.saveModal.classList.contains("is-open")) closeSaveModal();
      else if (el.productModal && el.productModal.classList.contains("is-open")) closeProductModal();
    });

    window.addEventListener("beforeunload", function (event) {
      if (!state.crawl.running && !state.sync.running) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  // __INIT__
})();

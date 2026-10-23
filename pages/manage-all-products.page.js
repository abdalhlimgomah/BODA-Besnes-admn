const PAGE_SIZE = 50;
const BATCH_SIZE = 1000;
const PRODUCTS_TABLE = "taager_products";
const LIST_COLUMNS = [
  "id",
  "taager_product_id",
  "taager_code",
  "name",
  "price",
  "original_price",
  "stock",
  "stock_status",
  "category",
  "brand",
  "seller",
  "company_name",
  "vendor",
  "is_active",
  "sales_count",
  "image",
  "images",
  "image1",
  "updated_at",
].join(",");
const BACKEND_ORDER = ["primary", "backup", "backup2"];
const BACKEND_STORAGE_KEY = "boda_admin_active_backend";
const BACKEND_TTL_MS = 15 * 60 * 1000;
const BACKEND_LABELS = {
  primary: "السيرفر الأساسي",
  backup: "السيرفر الاحتياطي",
  backup2: "السيرفر الثالث",
};
const FALLBACK_BACKEND = {
  name: "primary",
  url: "https://msgqzgzoslearaprgiqq.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE",
};

let allProducts = [];
let currentPage = 0;
let filteredProducts = [];
let supabaseClient = null;
let activeBackendName = "primary";
let switchNotice = "";
let loadFailure = "";
const backendReport = [];

const existenceCache = new Map();
const existenceFetched = new Set();
const pendingEdits = new Map();
let savingEdits = false;

function getBackends() {
  const fromGuard = window.adminAuth && window.adminAuth.ADMIN_BACKENDS;
  if (fromGuard && fromGuard.primary) return fromGuard;
  return {
    primary: FALLBACK_BACKEND,
    backup: { name: "backup", url: "", key: "" },
    backup2: { name: "backup2", url: "", key: "" },
  };
}

function isDebugMode() {
  try {
    return new URLSearchParams(window.location.search).has("debug");
  } catch (_e) {
    return false;
  }
}

function readStoredBackendName() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(BACKEND_STORAGE_KEY) || "null");
    if (saved && BACKEND_ORDER.indexOf(saved.name) !== -1 && Number(saved.until) > Date.now()) {
      return saved.name;
    }
    sessionStorage.removeItem(BACKEND_STORAGE_KEY);
  } catch (_e) {}
  return "";
}

function writeStoredBackendName(name) {
  try {
    if (name === "primary") {
      sessionStorage.removeItem(BACKEND_STORAGE_KEY);
    } else {
      sessionStorage.setItem(
        BACKEND_STORAGE_KEY,
        JSON.stringify({ name: name, reason: "auto", until: Date.now() + BACKEND_TTL_MS })
      );
    }
  } catch (_e) {}
}

function getChosenBackendName() {
  const stored = readStoredBackendName();
  if (stored) return stored;
  const active = window.__bodaAdminBackendName;
  if (active && getBackends()[active]) return active;
  return "primary";
}

function applyActiveBackendName(name, previous) {
  const backends = getBackends();
  const backend = backends[name];
  if (!backend) return;
  activeBackendName = name;
  window.__bodaAdminBackendName = name;
  window.SUPABASE_URL = backend.url;
  window.SUPABASE_ANON_KEY = backend.key;
  writeStoredBackendName(name);
  supabaseClient = null;
  try {
    document.dispatchEvent(
      new CustomEvent("boda:admin-failover", {
        detail: { from: previous || name, to: name, reason: "auto" },
      })
    );
  } catch (_e) {}
}

// auth-guard.js يعيد كتابة createClient ليعتمد على السيرفر النشط فقط،
// لذلك أي استعلام لازم يتم بعد تثبيت السيرفر المختار.
function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  supabaseClient = window.supabase.createClient(undefined, undefined, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabaseClient;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function getIdGroup(product) {
  const id = String(product.id || "").trim();
  if (!id) return "other";
  const lower = id.toLowerCase();
  if (lower.startsWith("taager")) return "taager";
  if (lower.startsWith("vendor")) return "vendor";
  if (/^[a-z][a-z0-9]*[_-]/i.test(id)) return "prefixed";
  if (/^\d+(\.\d+)?$/.test(id)) return "numeric";
  return "other";
}

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27" +
  "%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E" +
  "%3Ctext x=%2750%27 y=%2758%27 text-anchor=%27middle%27 fill=%27%2394a3b8%27 font-size=%2730%27%3E%F0%9F%93%A6%3C/text%3E" +
  "%3C/svg%3E";

function firstImage(p) {
  if (p.image) return p.image;
  if (Array.isArray(p.images) && p.images.length) return p.images[0];
  if (typeof p.images === "string" && p.images) return p.images;
  return p.image1 || "";
}

function categoryLabel(p) {
  const cat = String(p.category || "").trim();
  if (cat && cat !== "product") return cat;
  return String(p.brand || p.seller || p.company_name || "").trim() || "-";
}

function buildRow(p) {
  const img = escapeHtml(firstImage(p) || PLACEHOLDER_IMAGE);
  const name = escapeHtml(p.name || "-");
  const id = escapeHtml(p.id || "");
  const idKey = encodeURIComponent(p.id || "");
  const sellPrice = toNumber(p.price);
  const originalPrice = toNumber(p.original_price);
  const price = originalPrice > sellPrice ? originalPrice : sellPrice;
  const priceAfterDiscount = sellPrice;
  const stock = toNumber(p.stock);
  const category = escapeHtml(categoryLabel(p));

  const isActive = p.is_active !== false;
  const statusText = isActive ? "نشط" : "غير نشط";
  const statusClass = isActive ? "stat-active" : "stat-inactive";

  const soldCount = toNumber(p.sales_count);

  const pending = pendingEdits.get(String(p.id || ""));
  const inputValue = pending === undefined ? stock : pending;
  const dirtyCls = pending === undefined ? "" : " dirty";

  return `
    <tr data-id="${id}">
      <td>
        <img src="${img}" alt="${name}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}'" />
      </td>
      <td class="product-name-cell">
        <strong>${name}</strong>
        <small>ID: ${id}</small>
      </td>
      <td>${price.toFixed(2)} ج.م</td>
      <td>${priceAfterDiscount.toFixed(2)} ج.م</td>
      <td class="stock-cell">${inputValue}</td>
      <td>${category}</td>
      <td><span class="stat-badge ${statusClass}">${statusText}</span></td>
      <td>${soldCount}</td>
      <td class="servers-cell" data-servers="${idKey}">
        <span class="srv-badge unknown">جاري الفحص...</span>
      </td>
      <td>
        <div class="row-actions">
          <a class="edit-btn" href="taager-product-full-edit.html?id=${encodeURIComponent(p.id)}">
            <i class="fa-solid fa-pen-to-square"></i> تعديل
          </a>
          <div class="row-stock">
            <input
              type="number"
              class="stock-input${dirtyCls}"
              data-id="${idKey}"
              data-original="${stock}"
              value="${inputValue}"
              min="0"
              title="تعديل الكمية"
            />
            <span class="row-msg"></span>
          </div>
        </div>
      </td>
    </tr>`;
}

function setBodyMessage(message, className) {
  const body = document.getElementById("productsBody");
  if (!body) return;
  body.innerHTML =
    '<tr><td colspan="10" class="' +
    escapeHtml(className || "empty-state") +
    '">' +
    escapeHtml(message) +
    "</td></tr>";
}

function renderProducts() {
  const body = document.getElementById("productsBody");
  const countEl = document.getElementById("productsCount");
  const total = filteredProducts.length;
  const label = BACKEND_LABELS[activeBackendName] || activeBackendName;

  if (countEl) countEl.textContent = "إجمالي: " + total + " منتج · " + label;

  const start = currentPage * PAGE_SIZE;
  const visible = filteredProducts.slice(start, start + PAGE_SIZE);

  if (!visible.length) {
    if (loadFailure) {
      setBodyMessage(loadFailure, "empty-state");
    } else if (allProducts.length === 0) {
      setBodyMessage("جدول products فاضي على " + label + ". جرّب تختار سيرفر تاني من الأعلى.", "empty-state");
    } else {
      setBodyMessage("لا توجد منتجات مطابقة للبحث", "empty-state");
    }
  } else {
    body.innerHTML = visible.map(buildRow).join("");
    hydrateServerCells();
    primeExistence(visible);
  }
  updateEditsCount();

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  if (prevBtn) prevBtn.disabled = currentPage === 0;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;
  if (pageInfo) pageInfo.textContent = "صفحة " + (currentPage + 1) + " من " + totalPages;
}

const SERVER_SHORT_LABELS = {
  primary: "أساسي",
  backup: "احتياطي",
  backup2: "ثالث",
};

function buildServerBadges(info) {
  if (!info) return '<span class="srv-badge unknown">جاري الفحص...</span>';
  return BACKEND_ORDER.map(function (name) {
    const label = SERVER_SHORT_LABELS[name] || name;
    const val = info[name];
    if (val === "unknown") return '<span class="srv-badge unknown">' + label + " ؟</span>";
    return '<span class="srv-badge ' + (val ? "yes" : "no") + '">' + label + " " + (val ? "✓" : "✗") + "</span>";
  }).join("");
}

function hydrateServerCells() {
  const cells = document.querySelectorAll(".servers-cell[data-servers]");
  cells.forEach(function (cell) {
    const id = decodeURIComponent(cell.getAttribute("data-servers") || "");
    cell.innerHTML = buildServerBadges(existenceCache.get(id));
  });
}

async function fetchIdsPresent(backend, ids) {
  if (!ids.length || !backend || !backend.url || !backend.key) return [];
  const filter = "in.(" + ids.map(function (id) { return '"' + String(id).replace(/"/g, "") + '"'; }).join(",") + ")";
  const url = backend.url + "/rest/v1/" + PRODUCTS_TABLE + "?select=id&id=" + encodeURIComponent(filter);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: backend.key,
      Authorization: "Bearer " + backend.key,
      "x-bypass-failover": "true",
    },
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  const rows = await response.json();
  return (rows || []).map(function (r) { return String(r.id); });
}

async function primeExistence(visible) {
  const backends = getBackends();
  const active = activeBackendName;
  const ids = [];
  visible.forEach(function (p) {
    const id = String(p.id || "");
    if (!id) return;
    if (!existenceCache.has(id)) existenceCache.set(id, { primary: false, backup: false, backup2: false });
    existenceCache.get(id)[active] = true;
    if (!existenceFetched.has(id)) ids.push(id);
  });
  if (!ids.length) {
    hydrateServerCells();
    return;
  }
  const others = BACKEND_ORDER.filter(function (name) {
    return name !== active && backends[name] && backends[name].url && backends[name].key;
  });
  await Promise.all(
    others.map(async function (name) {
      try {
        const present = new Set((await fetchIdsPresent(backends[name], ids)).map(String));
        ids.forEach(function (id) { existenceCache.get(id)[name] = present.has(id); });
      } catch (_e) {
        ids.forEach(function (id) {
          const info = existenceCache.get(id);
          if (info && info[name] !== true) info[name] = "unknown";
        });
      }
    })
  );
  ids.forEach(function (id) { existenceFetched.add(id); });
  hydrateServerCells();
}

function updateEditsCount() {
  const inputs = document.querySelectorAll(".stock-input");
  inputs.forEach(function (input) {
    const id = decodeURIComponent(input.getAttribute("data-id") || "");
    input.classList.toggle("dirty", pendingEdits.has(id));
  });
  const el = document.getElementById("editsCount");
  if (el) el.textContent = pendingEdits.size ? "تعديلات غير محفوظة: " + pendingEdits.size : "لا توجد تعديلات";
}

function findStockInput(id) {
  return document.querySelector('.stock-input[data-id="' + encodeURIComponent(id) + '"]');
}

function setBulkMessage(message, kind) {
  const el = document.getElementById("bulkMessage");
  if (!el) return;
  el.textContent = message || "";
  el.className = "bulk-message" + (kind ? " " + kind : "");
}

function setRowMessage(input, text, kind) {
  const row = input && input.closest ? input.closest("tr") : null;
  const msgEl = row ? row.querySelector(".row-msg") : null;
  if (!msgEl) return;
  msgEl.textContent = text || "";
  msgEl.className = "row-msg" + (kind ? " " + kind : "");
}

async function renderTopSummary() {
  const el = document.getElementById("serverSummary");
  if (!el) return;
  el.innerHTML = '<span class="edits-count">جاري فحص السيرفرات...</span>';
  const results = await probeAllBackends();
  el.innerHTML = results
    .map(function (r) {
      const label = BACKEND_LABELS[r.name] || r.name;
      const activeCls = r.name === activeBackendName ? " active" : "";
      const detail = r.reachable ? (r.count === null ? "-" : r.count + " منتج") : r.note;
      return (
        '<span class="server-summary-item ' +
        (r.reachable ? "healthy" : "down") +
        activeCls +
        '"><span class="dot"></span>' +
        escapeHtml(label) +
        ' <span style="color:var(--muted)">' +
        escapeHtml(detail) +
        "</span></span>"
      );
    })
    .join("");
}

function stockStatusFor(value) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return "out_of_stock";
  if (n <= 10) return "low_stock";
  return "in_stock";
}

function shouldPublishEditsToAll() {
  const box = document.getElementById("publishAllServers");
  return !!(box && box.checked);
}

async function mirrorStockToBackends(id, payload) {
  const backends = getBackends();
  const active = activeBackendName;
  const others = BACKEND_ORDER.filter(function (name) {
    return name !== active && backends[name] && backends[name].url && backends[name].key;
  });
  const results = [];
  for (const name of others) {
    const backend = backends[name];
    try {
      const response = await fetch(
        backend.url + "/rest/v1/" + PRODUCTS_TABLE + "?id=eq." + encodeURIComponent(id),
        {
          method: "PATCH",
          headers: {
            apikey: backend.key,
            Authorization: "Bearer " + backend.key,
            "Content-Type": "application/json",
            Prefer: "return=representation",
            "x-bypass-failover": "true",
          },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        let message = "HTTP " + response.status;
        try {
          const info = await response.json();
          message = info.message || info.error_description || info.details || message;
        } catch (_e) {}
        throw new Error(message);
      }
      let updated = null;
      try {
        updated = await response.json();
      } catch (_e) {}
      const exists = Array.isArray(updated) ? updated.length > 0 : !!updated;
      if (exists) {
        results.push({ name: name, ok: true });
      } else {
        results.push({ name: name, ok: false, missing: true });
      }
    } catch (error) {
      results.push({ name: name, ok: false, error: error.message || String(error) });
    }
  }
  return results;
}

async function saveEdits() {
  if (savingEdits) return;

  const entries = Array.from(pendingEdits.entries());
  if (!entries.length) {
    setBulkMessage("لا توجد تعديلات جديدة لحفظها.", "info");
    return;
  }

  savingEdits = true;
  const btn = document.getElementById("saveEditsBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
  }
  setBulkMessage("جاري حفظ " + entries.length + " تعديل...", "info");

  const publishAll = shouldPublishEditsToAll();
  const now = new Date().toISOString();
  let okCount = 0;
  let failCount = 0;
  const failedServers = {};

  for (const entry of entries) {
    const id = entry[0];
    const value = entry[1];
    const input = findStockInput(id);
    if (input) setRowMessage(input, "جاري الحفظ...", "");
    try {
      const { error } = await getSupabaseClient()
        .from(PRODUCTS_TABLE)
        .update({ stock: value, stock_status: stockStatusFor(value), updated_at: now })
        .eq("id", id);
      if (error) throw error;
      okCount++;
      pendingEdits.delete(id);
      if (input) {
        input.setAttribute("data-original", String(value));
        input.classList.remove("dirty");
        setRowMessage(input, "تم الحفظ ✓", "ok");
      }
      const row = input && input.closest ? input.closest("tr") : null;
      const stockCell = row ? row.querySelector(".stock-cell") : null;
      if (stockCell) stockCell.textContent = String(value);
    } catch (error) {
      failCount++;
      const reason =
        (error && (error.message || error.error_description || error.details || error.hint)) ||
        (error ? String(error) : "خطأ غير معروف");
      console.error("تعذر حفظ الكمية للمنتج", id, error);
      if (input) {
        setRowMessage(input, "فشل: " + reason, "error");
      }
      continue;
    }

    if (!publishAll) continue;
    const results = await mirrorStockToBackends(id, { stock: value, stock_status: stockStatusFor(value), updated_at: now });
    const bad = results.filter(function (r) { return !r.ok; });
    if (bad.length) {
      bad.forEach(function (r) {
        failedServers[r.name] = true;
      });
      if (input) {
        const names = bad
          .map(function (r) {
            return (SERVER_SHORT_LABELS[r.name] || r.name) + (r.missing ? " (غير موجود)" : "");
          })
          .join("، ");
        setRowMessage(input, "تم الحفظ، لكن فشل على: " + names, "error");
      }
    }
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات';
  }
  savingEdits = false;
  updateEditsCount();

  const failedNames = Object.keys(failedServers)
    .map(function (name) { return BACKEND_LABELS[name] || name; })
    .join("، ");

  if (failCount === 0 && !failedNames) {
    setBulkMessage(
      publishAll
        ? "تم حفظ " + okCount + " تعديل على السيرفرات الثلاثة بنجاح."
        : "تم حفظ " + okCount + " تعديل على " + (BACKEND_LABELS[activeBackendName] || activeBackendName) + ".",
      "ok"
    );
  } else if (failCount === 0 && failedNames) {
    setBulkMessage("تم الحفظ محلياً، لكن فشل النشر على: " + failedNames, "error");
  } else {
    setBulkMessage("تم حفظ " + okCount + " وفشل " + failCount + " تعديل." + (failedNames ? " سيرفرات فشلت: " + failedNames : ""), "error");
  }

  renderTopSummary();
}

function applyFilters() {
  const input = document.getElementById("searchInput");
  const query = input ? input.value.trim().toLowerCase() : "";

  const groupFilter = document.getElementById("idGroupFilter");
  const group = groupFilter ? groupFilter.value : "all";

  filteredProducts = allProducts.filter(function (p) {
    if (group !== "all" && getIdGroup(p) !== group) {
      return false;
    }
    if (!query) return true;
    return (
      String(p.name || "").toLowerCase().includes(query) ||
      String(p.id || "").toLowerCase().includes(query) ||
      String(p.taager_code || "").toLowerCase().includes(query) ||
      String(categoryLabel(p)).toLowerCase().includes(query)
    );
  });

  currentPage = 0;
  renderProducts();
}

function changePage(delta) {
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE) || 1;
  const newPage = currentPage + delta;
  if (newPage >= 0 && newPage < totalPages) {
    currentPage = newPage;
    renderProducts();
  }
}

function describeStatus(status) {
  if (status === 402) return "موقوف (تجاوز حصة البيانات)";
  if (status === 401 || status === 403) return "مفتاح الدخول مرفوض";
  if (status === 404) return "الجدول غير موجود";
  if (status >= 500) return "خطأ في السيرفر (" + status + ")";
  return "غير متاح (" + (status || "شبكة") + ")";
}

function parseContentRange(value) {
  const match = String(value || "").match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

// فحص حقيقي لكل سيرفر على حدة: نستخدم fetch مباشر مع x-bypass-failover
// حتى لا يعيد auth-guard.js توجيه الطلب للسيرفر النشط.
async function probeBackend(name, backend) {
  if (!backend || !backend.url) {
    return { name: name, reachable: false, count: null, note: "غير مضبوط" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, 8000);

  try {
    const response = await fetch(
      backend.url + "/rest/v1/" + PRODUCTS_TABLE + "?select=id&limit=1",
      {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          apikey: backend.key,
          Authorization: "Bearer " + backend.key,
          Prefer: "count=exact",
          Range: "0-0",
          "x-bypass-failover": "true",
        },
      }
    );

    const count = parseContentRange(response.headers.get("content-range"));
    if (!response.ok) {
      return { name: name, reachable: false, count: count, note: describeStatus(response.status) };
    }
    return { name: name, reachable: true, count: count === null ? 0 : count, note: "شغال" };
  } catch (e) {
    return {
      name: name,
      reachable: false,
      count: null,
      note: e && e.name === "AbortError" ? "انتهت المدة" : "تعذر الاتصال",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function probeAllBackends() {
  const backends = getBackends();
  const results = [];
  for (const name of BACKEND_ORDER) {
    results.push(await probeBackend(name, backends[name]));
  }
  return results;
}

// نبدأ بالسيرفر اللي المستخدم اختاره، ولو اشتغل بنستخدمه على طول.
// لو هو مش شغال بنجرب الباقي بالترتيب لحد ما نلقى واحد شغال.
async function resolveBackend() {
  const chosen = getChosenBackendName();
  const probes = await probeAllBackends();
  const byName = {};
  probes.forEach(function (p) {
    byName[p.name] = p;
  });

  const chosenProbe = byName[chosen];
  if (chosenProbe && chosenProbe.reachable) {
    switchNotice = "";
    applyActiveBackendName(chosen, chosen);
    return { name: chosen, switchedFrom: "", report: probes };
  }

  const fallback = probes.find(function (p) {
    return p.name !== chosen && p.reachable;
  });

  if (fallback) {
    switchNotice =
      "السيرفر " +
      (BACKEND_LABELS[chosen] || chosen) +
      " غير متاح (" +
      ((chosenProbe && chosenProbe.note) || "غير معروف") +
      ")، تم التحويل تلقائياً إلى " +
      (BACKEND_LABELS[fallback.name] || fallback.name) +
      ".";
    applyActiveBackendName(fallback.name, chosen);
    return { name: fallback.name, switchedFrom: chosen, report: probes };
  }

  loadFailure =
    "مش قادر أوصل لأي سيرفر دلوقتي. كل السيرفرات رجعت خطأ: " +
    probes
      .map(function (p) {
        return (BACKEND_LABELS[p.name] || p.name) + " (" + p.note + ")";
      })
      .join(" · ");
  applyActiveBackendName(chosen, chosen);
  return { name: chosen, switchedFrom: "", report: probes };
}

function renderStatusPanel(report, switchedFrom) {
  const panel = document.getElementById("debugInfo");
  if (!panel) return;

  if (!switchedFrom && !isDebugMode() && allProducts.length > 0) {
    panel.innerHTML = "";
    return;
  }

  const rows = report
    .map(function (p) {
      const isActive = p.name === activeBackendName;
      const countText = p.count === null ? "-" : p.count + " منتج";
      return (
        '<div style="display:flex;gap:10px;align-items:center;padding:6px 8px;border-radius:8px;' +
        "background:" +
        (isActive ? "rgba(0,184,169,0.12)" : "transparent") +
        '">' +
        '<strong style="min-width:130px">' +
        escapeHtml(BACKEND_LABELS[p.name] || p.name) +
        (isActive ? " (مفعّل)" : "") +
        "</strong>" +
        '<span style="min-width:120px;color:' +
        (p.reachable ? "#1f9d55" : "#e03131") +
        '">' +
        escapeHtml(p.note) +
        "</span>" +
        '<span style="color:#667085">' +
        escapeHtml(countText) +
        "</span>" +
        "</div>"
      );
    })
    .join("");

  panel.innerHTML =
    '<div style="padding:10px;background:#f7f9fc;border:1px solid #d8dee9;margin:10px 0;border-radius:10px;' +
    'font-size:12px;display:grid;gap:4px">' +
    (switchedFrom
      ? '<strong style="color:#f08c00">' + escapeHtml(switchNotice) + "</strong>"
      : "") +
    '<strong>حالة السيرفرات</strong>' +
    rows +
    "</div>";
}

async function fetchAllProducts() {
  const client = getSupabaseClient();
  let totalCount = 0;
  const all = [];

  const countResult = await client
    .from(PRODUCTS_TABLE)
    .select("id", { count: "exact", head: true });

  if (countResult.error) {
    console.error("Count error:", countResult.error);
    loadFailure = "تعذر القراءة من السيرفر: " + String(countResult.error.message || countResult.error);
  } else {
    totalCount = countResult.count || 0;
  }

  console.log("Total products in table:", totalCount);

  const maxBatches = totalCount > 0 ? Math.ceil(totalCount / BATCH_SIZE) : 50;

  for (let i = 0; i < maxBatches; i++) {
    const from = i * BATCH_SIZE;
    const to = from + BATCH_SIZE - 1;
    const result = await client
      .from(PRODUCTS_TABLE)
      .select(LIST_COLUMNS)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (result.error) {
      console.error("Batch " + i + " error:", result.error);
      loadFailure = "تعذر القراءة من السيرفر: " + String(result.error.message || result.error);
      break;
    }

    const rows = result.data || [];
    if (rows.length === 0) break;
    all.push.apply(all, rows);
    if (rows.length < BATCH_SIZE) break;
  }

  return { all: all, totalCount: Math.max(totalCount, all.length) };
}

async function loadProducts() {
  loadFailure = "";
  switchNotice = "";
  backendReport.length = 0;
  existenceCache.clear();
  existenceFetched.clear();
  setBodyMessage("جاري تحميل المنتجات...", "empty-state");

  const chosen = await resolveBackend();
  backendReport.push.apply(backendReport, chosen.report);
  console.log("Using backend:", chosen.name, chosen.switchedFrom ? "(auto-switched)" : "");

  let all = [];
  let totalCount = 0;

  if (!loadFailure) {
    try {
      const result = await fetchAllProducts();
      all = result.all;
      totalCount = result.totalCount;
    } catch (e) {
      console.error("Load exception:", e);
      loadFailure = "خطأ أثناء تحميل المنتجات: " + String((e && e.message) || e);
    }
  }

  console.log("All products fetched:", all.length);
  if (all.length > 0) {
    console.log("Sample product names:", all.slice(0, 5).map((p) => p.name || p.product_name));
  }

  allProducts = all.slice();
  console.log("Products loaded:", allProducts.length);

  filteredProducts = allProducts.slice();
  currentPage = 0;
  renderProducts();
  renderStatusPanel(chosen.report, chosen.switchedFrom);
  if (isDebugMode()) {
    const debugDiv = document.getElementById("debugInfo");
    if (debugDiv) {
      debugDiv.innerHTML +=
        '<div style="padding:8px;background:#f3f4f6;margin:6px 0;border-radius:8px;font-size:11px;' +
        'font-family:monospace;direction:ltr;text-align:left">' +
        "Table: " +
        escapeHtml(PRODUCTS_TABLE) +
        " | Fetched: " +
        all.length +
        " | Shown: " +
        allProducts.length +
        "</div>";
    }
  }

  renderTopSummary();
}

document.addEventListener("DOMContentLoaded", function () {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.addEventListener("input", applyFilters);

  const idGroupFilter = document.getElementById("idGroupFilter");
  if (idGroupFilter) idGroupFilter.addEventListener("change", applyFilters);

  const body = document.getElementById("productsBody");
  if (body) {
    body.addEventListener("input", function (e) {
      const input = e.target && e.target.closest ? e.target.closest(".stock-input") : null;
      if (!input) return;
      const id = decodeURIComponent(input.getAttribute("data-id") || "");
      const original = Number(input.getAttribute("data-original"));
      const raw = input.value.trim();
      const value = Number(raw);
      const row = input.closest("tr");
      const stockCell = row ? row.querySelector(".stock-cell") : null;

      if (raw !== "" && Number.isFinite(value) && value >= 0 && value !== original) {
        pendingEdits.set(id, value);
        input.classList.add("dirty");
        setRowMessage(input, "غير محفوظ", "dirty");
        if (stockCell) stockCell.textContent = String(value);
      } else {
        pendingEdits.delete(id);
        input.classList.remove("dirty");
        setRowMessage(input, "", "");
        if (stockCell) stockCell.textContent = raw === "" ? String(original) : raw;
      }
      updateEditsCount();
    });
  }

  const saveBtn = document.getElementById("saveEditsBtn");
  if (saveBtn) saveBtn.addEventListener("click", saveEdits);

  loadProducts();
});

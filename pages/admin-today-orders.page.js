const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORDER_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 120 120%27%3E%3Crect width=%27120%27 height=%27120%27 rx=%2714%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M60 32a14 14 0 110 28 14 14 0 010-28zm-24 46c0-10 8-18 18-18h12c10 0 18 8 18 18v8H36v-8z%27 fill=%27%2394a3b8%27/%3E%3C/svg%3E";
const EXCEL_TEMPLATE_PATH = "../assets/templates/العربة.xlsx";

const FILTER_STATUSES = ["cancelled", "returned", "delivered"];

// أعمدة ملف التصدير (بنفس ترتيب قالب «العربة.xlsx»)
const PREVIEW_COLUMNS = [
  { key: "A", label: "كود المنتج" },
  { key: "B", label: "اسم المنتج" },
  { key: "C", label: "السعر" },
  { key: "D", label: "الكمية" },
  { key: "E", label: "اسم العميل" },
  { key: "F", label: "المحافظة" },
  { key: "G", label: "العنوان" },
  { key: "H", label: "العنوان السعودي" },
  { key: "I", label: "الهاتف" },
  { key: "J", label: "الهاتف 2" },
  { key: "K", label: "الملاحظات" },
  { key: "L", label: "الصفحة" },
  { key: "M", label: "رابط الصفحة" },
  { key: "N", label: "الدولة" },
  { key: "O", label: "اللون" },
  { key: "P", label: "المقاس" },
  { key: "Q", label: "وقت الطلب" },
  { key: "R", label: "رقم الطلب" },
  { key: "S", label: "سوبا بست" },
];

let previewState = { rows: [], fileName: "" };

let dayOrders = []; // الطلبات الكاملة لليوم (محمّلة من Supabase)
let dayOrdersEnriched = []; // نفسها بعد إضافة بيانات taager لكل منتج
let selectedDate = toLocalDateString(new Date());
let countryFilter = "all";
let companyFilter = "all";
let statusFilter = "all";
let countryCounts = { SA: 0, EG: 0 };
// نتائج enrichItemsWithTaagerProducts تُحفظ هنا لأن extractOrderItems يعيد إنشاء الكائنات في كل مرة
const taagerRowLookup = new Map();

const STATUS_OPTIONS = [
  ["pending", "قيد الانتظار"],
  ["review", "قيد المراجعة"],
  ["confirmed", "تم التأكيد"],
  ["preparing", "جارٍ التجهيز"],
  ["shipped", "تم الشحن"],
  ["delivered", "تم التسليم"],
  ["onhold", "معلق مؤقتًا"],
  ["cancelled", "ملغي"],
  ["returned", "مرتجع"],
];

// الشركة/البائع لكل منتج — من صف taager_products أو من بيانات الطلب نفسه
function getItemCompany(item) {
  if (!item) return "غير معروف";
  const t = resolveTaagerRow(item);
  if (t) {
    const company = String(
      t.company_name || t.seller || t.vendor || t.brand || ""
    ).trim();
    if (company) return company;
  }
  return String(
    item.company_name || item.seller || item.vendor || item.store_name || item.brand || ""
  ).trim() || "غير معروف";
}

function getCompanyKey(item) {
  return getItemCompany(item);
}

// يسجّل (يحفظ محليًا) ترتيب ظهور الشركات حتى تتجه القوائم المنسدلة
let companyOrder = [];

function collectCompanyOrder(orders) {
  const list = [];
  const seen = new Set();
  orders.forEach((order) =>
    extractOrderItems(order).forEach((it) => {
      const key = getCompanyKey(it);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(key);
      }
    })
  );
  return list;
}

function showToast(message, type = "info") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const toast = document.createElement("div");
  toast.className = `toast-item toast-${type}`;
  toast.textContent = message;
  wrap.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 220);
  }, 2400);
}

function statusLabel(status) {
  const labels = {
    pending: "قيد الانتظار",
    review: "قيد المراجعة",
    preparing: "جارٍ التجهيز",
    shipped: "تم الشحن",
    delivered: "تم التسليم",
    confirmed: "تم التأكيد",
    cancelled: "ملغي",
    onhold: "معلق مؤقتًا",
    returned: "مرتجع",
  };
  return labels[status] || status || "-";
}

function statusClass(status) {
  return {
    pending: "status-pending",
    review: "status-review",
    preparing: "status-preparing",
    shipped: "status-shipped",
    delivered: "status-delivered",
    confirmed: "status-confirmed",
    cancelled: "status-cancelled",
    onhold: "status-onhold",
    returned: "status-returned",
  }[status] || "status-pending";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ar-EG");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseLocalDate(dateStr) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dayRangeISO(dateStr) {
  const start = parseLocalDate(dateStr);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function normalizeToArray(value) {
  if (!value) return [];
  const parsed = parseJsonSafe(value);
  const data = parsed ?? value;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractOrderItems(order) {
  for (const payload of [order.items_snapshot, order.items_json, order.items, order.order_items, order.type]) {
    const items = normalizeToArray(payload);
    if (items.length) return items;
  }
  return [];
}

function extractTaagerId(item) {
  if (item.taager_product_id) return String(item.taager_product_id).trim();
  const id = String(item.id || item.product_id || "");
  if (id.startsWith("taager_")) return id.slice(7);
  return "";
}

function parseTaagerVariantId(tid) {
  const s = String(tid || "").trim();
  const m = s.match(/^(.+?)_c_(.+?)(?:_s_(.*))?$/);
  if (!m) return { base: s, color: "", size: "" };
  return { base: m[1], color: m[2], size: m[3] || "" };
}

function stripVariantSuffix(value) {
  const s = String(value || "").trim();
  if (!s) return s;
  const isTaager = s.indexOf("taager_") === 0;
  const bare = isTaager ? s.slice(7) : s;
  const parsed = parseTaagerVariantId(bare);
  if (parsed.color || parsed.size) {
    const base = parsed.base || bare;
    return isTaager ? "taager_" + base : base;
  }
  return s;
}

function getOrderEmail(order) {
  return String(order?.user_email || order?.email || order?.customer_email || "").trim().toLowerCase();
}

function getOrderPhone(order) {
  return String(order?.phone || order?.customer_phone || "").trim();
}

function getOrderStatus(order) {
  return String(order?.status || order?.order_status || "pending").trim();
}

function mapSourceToCountry(source, fallback) {
  const s = String(source || "").trim().toLowerCase();
  if (s === "ksa" || s === "sa" || s === "saudi" || s === "saudi-arabia") return "SA";
  if (s === "egypt" || s === "eg" || s === "egy") return "EG";
  if (s === "uae" || s === "ae") return "AE";
  if (s === "iraq" || s === "iq") return "IQ";
  if (s === "oman" || s === "om") return "OM";
  return String(fallback || "").trim().toUpperCase();
}

function getItemCountry(item, order) {
  const countryFromItem = String(item.country || item.country_code || "").trim();
  const countryFromOrder = String(order?.country || order?.country_code || "").trim();
  const taager = resolveTaagerRow(item);
  const source = taager ? (taager.source || "") : "";
  const countries = Array.isArray(taager?.available_countries) ? taager.available_countries : [];
  const firstCountry = countries.length ? String(countries[0]) : "";
  return mapSourceToCountry(source, countryFromItem || countryFromOrder || firstCountry);
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

// يربط كل منتج في الطلبات بصفّه في جدول taager_products (كود تاجر + معرف السوبابايسي + البائع + البلد)
async function enrichItemsWithTaagerProducts(orders) {
  const itemList = [];
  orders.forEach((order) => extractOrderItems(order).forEach((it) => itemList.push(it)));
  if (!itemList.length) return;

  const idKeys = [];
  const prodKeys = [];
  const addU = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };

  itemList.forEach((it) => {
    const rawId = String(it?.id || it?.product_id || "").trim();
    if (rawId) addU(idKeys, rawId);
    const tid = extractTaagerId(it);
    if (!tid) return;
    const keys = [tid];
    const base = parseTaagerVariantId(tid).base;
    if (base && base !== tid) keys.push(base);
    keys.forEach((k) => {
      addU(prodKeys, k);
      addU(idKeys, "taager_" + k);
    });
  });

  const rows = [];
  const chunkSize = 100;

  if (idKeys.length) {
    for (let i = 0; i < idKeys.length; i += chunkSize) {
      const chunk = idKeys.slice(i, i + chunkSize);
      let res = await supabaseClient
        .from("taager_products")
        .select("id,taager_product_id,taager_code,name,seller,source,brand,vendor,company_name,available_countries")
        .in("id", chunk);
      if (res.error) {
        res = await supabaseClient.from("taager_products").select("*").in("id", chunk);
      }
      if (!res.error && Array.isArray(res.data)) rows.push(...res.data);
    }
  }

  if (prodKeys.length) {
    for (let i = 0; i < prodKeys.length; i += chunkSize) {
      const chunk = prodKeys.slice(i, i + chunkSize);
      let res = await supabaseClient
        .from("taager_products")
        .select("id,taager_product_id,taager_code,name,seller,source,brand,vendor,company_name,available_countries")
        .in("taager_product_id", chunk);
      if (res.error) {
        res = await supabaseClient.from("taager_products").select("*").in("taager_product_id", chunk);
      }
      if (!res.error && Array.isArray(res.data)) rows.push(...res.data);
    }
  }

  const map = new Map();
  const freshLookup = new Map();
  rows.forEach((row) => {
    if (!row) return;
    if (row.id) {
      map.set(String(row.id).trim(), row);
      const rowId = String(row.id).trim();
      freshLookup.set(rowId, row);
      freshLookup.set(rowId.replace(/^taager_/, ""), row);
      freshLookup.set(stripVariantSuffix(rowId), row);
    }
    if (row.taager_product_id != null) {
      map.set(String(row.taager_product_id).trim(), row);
      freshLookup.set(String(row.taager_product_id).trim(), row);
    }
  });

  taagerRowLookup.clear();
  freshLookup.forEach((row, key) => taagerRowLookup.set(key, row));

  itemList.forEach((it) => {
    let row = null;
    const rawId = String(it?.id || it?.product_id || "").trim();
    if (rawId) row = map.get(rawId) || map.get(stripVariantSuffix(rawId));
    const tid = extractTaagerId(it);
    if (!row && tid) row = map.get(tid) || map.get(parseTaagerVariantId(tid).base);
    it.__taager = row || null;
  });
}

// يعيد صف taager_products للمنتج حتى بعد إعادة تفسير items (لأن extractOrderItems يخلق كائنات جديدة)
function resolveTaagerRow(it) {
  if (!it) return null;
  if (it.__taager) return it.__taager;
  const rawId = String(it.id || it.product_id || "").trim();
  if (rawId) {
    const hit = taagerRowLookup.get(rawId) || taagerRowLookup.get(stripVariantSuffix(rawId));
    if (hit) return hit;
  }
  const tid = extractTaagerId(it);
  if (tid) {
    const base = parseTaagerVariantId(tid).base;
    const hit = taagerRowLookup.get(tid) || taagerRowLookup.get(base) || taagerRowLookup.get("taager_" + base);
    if (hit) return hit;
  }
  return null;
}

// بلد الطلب = بلد أول منتج فيه (إن لم يوجد حقل بلد على الطلب نفسه)
function getOrderCountry(order) {
  const direct = mapSourceToCountry("", order?.country || order?.country_code || "") || "";
  if (direct && direct !== "") return direct;
  const items = extractOrderItems(order);
  if (items.length) {
    const itemCountry = getItemCountry(items[0], order);
    if (itemCountry) return itemCountry;
  }
  return "";
}

function itemCountry(item, order) {
  const code = getItemCountry(item, order);
  return code === "SA" ? "SA" : code === "EG" ? "EG" : "";
}

// كود تاجر الحقيقي (sku) المحفوظ في عمود taager_code بجدول سوبا بست
function getTaagerRealCode(item) {
  const row = resolveTaagerRow(item);
  const s = row && String(row.taager_code || "").trim();
  return s || "";
}

// كود المنتج الأساسي على تاجر (يحذف لاحقة اللون/المقاس مثل _c_أسود_s_XL)
function getTaagerBaseCode(item) {
  const real = getTaagerRealCode(item);
  if (real) return real;
  const tid = extractTaagerId(item);
  if (tid) return parseTaagerVariantId(tid).base || tid;
  const row = resolveTaagerRow(item);
  const fromRow = row && (row.taager_product_id || row.id || "");
  if (fromRow) return parseTaagerVariantId(String(fromRow).replace(/^taager_/, "")).base || String(fromRow);
  return String(item?.sku || item?.code || "");
}

// ────────────────────────── استرجاع الطلبات ──────────────────────────
async function fetchDayOrders() {
  const dateStr = selectedDate;
  const { startISO, endISO } = dayRangeISO(dateStr);

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    showToast("تعذر تحميل طلبات اليوم", "error");
    return;
  }

  dayOrders = Array.isArray(data) ? data : [];
  await enrichItemsWithTaagerProducts(dayOrders);

  countryCounts = { SA: 0, EG: 0 };
  dayOrders.forEach((order) => {
    const used = new Set();
    extractOrderItems(order).forEach((it) => {
      const cc = itemCountry(it, order);
      if (cc && !used.has(cc)) {
        used.add(cc);
        countryCounts[cc] = (countryCounts[cc] || 0) + 1;
      }
    });
  });

  companyOrder = collectCompanyOrder(dayOrders);
  dayOrdersEnriched = dayOrders;
  applyFiltersAndRender();
  renderWeekStrip();
}

function getFilteredOrders() {
  return dayOrdersEnriched.filter((order) => {
    const items = extractOrderItems(order);
    if (countryFilter !== "all" && !items.some((it) => itemCountry(it, order) === countryFilter)) return false;
    if (companyFilter !== "all" && !items.some((it) => getCompanyKey(it) === companyFilter)) return false;
    if (statusFilter !== "all" && getOrderStatus(order) !== statusFilter) return false;
    return true;
  });
}

// طلبات اليوم التي تحتوي منتجات بلا شركة معروفة أو بلا تمييز واضح (غير مسجلة)
function getUnregisteredItems() {
  const results = [];
  dayOrdersEnriched.forEach((order) => {
    extractOrderItems(order).forEach((it) => {
      const company = getItemCompany(it);
      const hasCode = Boolean(getTaagerBaseCode(it) || getTaagerRealCode(it));
      if (company === "غير معروف" || !hasCode) {
        results.push({ order, item: it, company, hasCode });
      }
    });
  });
  return results;
}

// ────────────────────────── العرض ──────────────────────────
function todayRangeTotals(orders) {
  let itemsCount = 0;
  let total = 0;
  let prepared = 0;
  orders.forEach((order) => {
    const status = getOrderStatus(order);
    if (status === "preparing" || status === "shipped" || status === "delivered" || status === "confirmed") prepared++;
    extractOrderItems(order).forEach((it) => {
      itemsCount += Number(it.quantity) || 1;
      total += (Number(it.price) || 0) * (Number(it.quantity) || 1);
    });
  });
  return { itemsCount, total, prepared };
}

function renderSummary() {
  const counts = {};
  dayOrdersEnriched.forEach((o) => {
    const st = getOrderStatus(o);
    counts[st] = (counts[st] || 0) + 1;
  });

  const statusOrder = ["review", "pending", "confirmed", "preparing", "shipped", "delivered", "onhold", "cancelled", "returned"];
  const pills = statusOrder
    .filter((s) => (counts[s] || 0) > 0)
    .map((s) =>
      '<span class="status-count-pill ' + statusClass(s) + '"><i class="fa-solid fa-circle"></i> ' + (counts[s] || 0) + ' ' + statusLabel(s) + "</span>"
    )
    .join("");

  const summaryEl = document.getElementById("statusSummary");
  summaryEl.innerHTML = pills
    ? `<div class="status-summary-title">حالات اليوم</div><div class="status-summary-pills">${pills}</div>`
    : '<div class="status-summary-empty">لا توجد طلبات لهذا اليوم</div>';
}

function aggregateByCompany() {
  const map = new Map();
  dayOrdersEnriched.forEach((order) => {
    const status = getOrderStatus(order);
    extractOrderItems(order).forEach((it) => {
      const company = getCompanyKey(it);
      if (!map.has(company)) {
        map.set(company, { company, orders: new Set(), items: 0, total: 0, countStatus: {} });
      }
      const entry = map.get(company);
      entry.orders.add(String(order.id || ""));
      entry.items += Number(it.quantity) || 1;
      entry.total += (Number(it.price) || 0) * (Number(it.quantity) || 1);
      entry.countStatus[status] = (entry.countStatus[status] || 0) + 1;
    });
  });
  return map;
}

function renderCompanies() {
  const grid = document.getElementById("companiesGrid");
  const map = aggregateByCompany();

  // ترتيب حسب الإجمالي تنازليًا
  const entries = [...map.values()].sort((a, b) => b.total - a.total);

  if (!entries.length) {
    grid.innerHTML = '<div class="empty-text">لا توجد منتجات لهذا اليوم</div>';
    return;
  }

  grid.innerHTML = entries
    .map((e) => {
      const statusChips = Object.keys(e.countStatus)
        .map(
          (s) =>
            '<span class="status-count-pill ' +
            statusClass(s) +
            '"><i class="fa-solid fa-circle"></i> ' +
            e.countStatus[s] +
            " " +
            statusLabel(s) +
            "</span>"
        )
        .join(" ");
      return `
        <div class="company-card">
          <div class="company-card-head">
            <strong class="company-name">${escapeAttr(e.company)}</strong>
            <span class="company-badge">${e.orders.size} طلب</span>
          </div>
          <div class="company-stats">
            <span class="company-stat"><i class="fa-solid fa-cubes"></i> ${e.items} منتج</span>
            <span class="company-stat company-total"><i class="fa-solid fa-coins"></i> ${e.total} ج.م</span>
          </div>
          <div class="company-statuses">${statusChips || '-'.trim()}</div>
          <div class="company-actions">
            <button class="btn btn-soft company-filter-btn" onclick="filterByCompany('${encodeURIComponent(e.company)}')">
              <i class="fa-solid fa-filter"></i> عرض
            </button>
            <button class="btn btn-secondary company-export-btn" onclick="exportCompanyExcel('${encodeURIComponent(e.company)}')">
              <i class="fa-solid fa-file-excel"></i> تصدير
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderUnregistered() {
  const list = document.getElementById("unregisteredList");
  const results = getUnregisteredItems();
  if (!results.length) {
    list.innerHTML = '<div class="unregistered-empty"><i class="fa-solid fa-circle-check"></i> كل المنتجات مسجلة ومعروفة الشركة</div>';
    return;
  }
  list.innerHTML = results
    .map((r) => {
      const orderStatus = getOrderStatus(r.order);
      const name = String(r.item?.name || r.item?.product_name || r.item?.title || "منتج");
      return `
        <div class="unregistered-row">
          <div class="ur-name">${escapeAttr(name)}</div>
          <div class="ur-company">${escapeAttr(r.company)}</div>
          <span class="status-count-pill ${statusClass(orderStatus)}"><i class="fa-solid fa-circle"></i> ${statusLabel(orderStatus)}</span>
          <div class="ur-reason">${r.hasCode ? "" : '<span class="ur-reason-badge">بدون كود</span>'}</div>
          <button class="btn btn-ghost ur-view-btn" onclick="goToUserOrders('${encodeURIComponent(getOrderEmail(r.order))}')"><i class="fa-solid fa-eye"></i></button>
        </div>
      `;
    })
    .join("");
}

// نافذة الأسبوع الحالية وعدّاداتها (لتفادي إعادة الاستعلام كل 30 ثانية)
let weekWindowCache = { key: "", week: [], counts: {} };

async function fetchWeekCounts() {
  // مفتاح النافذة = تاريخ أول يوم في الأسبوع المحسوب من selectedDate
  const anchor = parseLocalDate(selectedDate);
  anchor.setDate(anchor.getDate() - 6);
  const key = toLocalDateString(anchor);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    week.push({ date: toLocalDateString(d) });
  }

  if (weekWindowCache.key === key && weekWindowCache.week.length === 7) {
    renderWeekStripWithCounts(weekWindowCache.week, weekWindowCache.counts);
    return;
  }

  try {
    const counts = {};
    for (const day of week) {
      const { startISO, endISO } = dayRangeISO(day.date);
      const { count, error } = await supabaseClient
        .from("orders")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startISO)
        .lte("created_at", endISO);
      if (error) throw error;
      counts[day.date] = count || 0;
    }
    weekWindowCache = { key, week, counts };
    renderWeekStripWithCounts(week, counts);
  } catch (e) {
    console.error(e);
  }
}

function renderWeekStrip() {
  const strip = document.getElementById("weekStrip");
  const anchor = parseLocalDate(selectedDate);
  anchor.setDate(anchor.getDate() - 6);
  const key = toLocalDateString(anchor);
  if (weekWindowCache.key === key && weekWindowCache.week.length === 7) {
    renderWeekStripWithCounts(weekWindowCache.week, weekWindowCache.counts);
    return;
  }
  strip.innerHTML = '<span class="week-loading">جارٍ تحميل الأيام...</span>';
  fetchWeekCounts().then(() => {});
}

function renderWeekStripWithCounts(week, counts) {
  const strip = document.getElementById("weekStrip");
  strip.innerHTML = week
    .map((day) => {
      const isSelected = day.date === selectedDate;
      const count = counts[day.date] || 0;
      const isToday = day.date === toLocalDateString(new Date());
      const label = isToday ? "اليوم" : ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][parseLocalDate(day.date).getDay()];
      return `
        <button class="week-day ${isSelected ? "week-day-selected" : ""}" onclick="jumpToDate('${day.date}')">
          <span class="week-day-name">${label}</span>
          <span class="week-day-date">${day.date.split("-").slice(1).join("/")}</span>
          <span class="week-day-count">${count} طلب</span>
        </button>
      `;
    })
    .join("");
}

async function applyBulkStatus() {
  const select = document.getElementById("bulkStatusSelect");
  const newStatus = select.value;
  const targets = getFilteredOrders();
  if (!targets.length) {
    showToast("لا توجد طلبات مطابقة (بعد الفلاتر) لتغيير حالتها", "info");
    return;
  }

  const statusName = statusLabel(newStatus);
  if (!confirm(`تغيير حالة ${targets.length} طلب إلى «${statusName}»؟`)) return;

  let ok = 0;
  const deliveredTargets = [];
  for (let i = 0; i < targets.length; i++) {
    const order = targets[i];
    if (!order || !order.id) continue;
    const wasDelivered = getOrderStatus(order) === "delivered";
    const { error } = await supabaseClient
      .from("orders")
      .update({ status: newStatus })
      .eq("id", order.id);
    if (!error) {
      ok++;
      if (newStatus === "delivered" && !wasDelivered) deliveredTargets.push(order);
    }
  }

  // خصم المخزون لكل طلب انتقل إلى «تم التسليم»
  for (const order of deliveredTargets) {
    await deductOrderItemsStock(order);
  }

  const deducted = deliveredTargets.length;
  showToast(
    `تم تحديث ${ok} طلب إلى «${statusName}»${deducted ? ` وخصم مخزون ${deducted} طلب` : ""}`,
    ok ? "success" : "error"
  );
  fetchDayOrders();
}

function renderOrders(orders) {
  const grid = document.getElementById("ordersGrid");
  if (!orders.length) {
    grid.innerHTML = '<p class="empty-text">لا توجد طلبات مطابقة لهذا اليوم</p>';
    return;
  }

  grid.innerHTML = orders.map((order) => {
    const email = getOrderEmail(order) || "غير معروف";
    const status = getOrderStatus(order);
    const encodedEmail = encodeURIComponent(email);
    const items = extractOrderItems(order);

    const statusOptions = [
      ["pending", "قيد الانتظار"],
      ["review", "قيد المراجعة"],
      ["confirmed", "تم التأكيد"],
      ["preparing", "جارٍ التجهيز"],
      ["shipped", "تم الشحن"],
      ["delivered", "تم التسليم"],
      ["onhold", "معلق مؤقتًا"],
      ["cancelled", "ملغي"],
      ["returned", "مرتجع"],
    ].map(([value, label]) =>
      '<option value="' + value + '"' + (status === value ? " selected" : "") + ">" + label + "</option>"
    ).join("");

    const itemHtml = items.map((it) => {
      const img = String(it?.image || it?.image_url || it?.product_image || it?.thumbnail || it?.img || "").trim();
      const name = String(it?.name || it?.product_name || it?.title || "منتج");
      const qty = Number(it?.quantity) || 1;
      const price = Number(it?.price) || 0;
      const variant = parseTaagerVariantId(extractTaagerId(it));
      const color = String(it?.selected_color || it?.selectedColor || it?.color || variant.color || "").trim();
      const size = String(it?.selected_size || it?.selectedSize || it?.size || variant.size || "").trim();
      const taagerCode = getTaagerBaseCode(it);
      const taager = resolveTaagerRow(it);
      const supabaseId = (taager && taager.id) || String(it?.id || it?.product_id || "");
      const subasaCode = getTaagerRealCode(it) || supabaseId;
      const country = itemCountry(it, order);
      const sku = String(it?.sku || it?.code || "");
      const seller = (taager?.seller || taager?.company_name || taager?.vendor || it?.seller || it?.vendor || "").trim() || "تاجر";

      return `
        <div class="order-item-row">
          <img class="order-item-img" src="${escapeAttr(img || ORDER_IMAGE_PLACEHOLDER)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${ORDER_IMAGE_PLACEHOLDER}'" />
          <div class="order-item-info">
            <div class="order-item-name">${escapeAttr(name)}${country ? '<span class="country-badge country-' + country.toLowerCase() + '">' + country + "</span>" : ""}</div>
            <div class="order-item-seller">${escapeAttr(seller)}</div>
            <div class="order-item-details">
              <span class="oid-label">السعر:</span><span class="oid-value">${price}</span>
              <span class="oid-label">الكمية:</span><span class="oid-value">${qty}</span>
              <span class="oid-label">الإجمالي:</span><span class="oid-value oid-total">${price * qty}</span>
              ${color ? '<span class="oid-label">اللون:</span><span class="oid-value">' + escapeAttr(color) + "</span>" : ""}
              ${size ? '<span class="oid-label">المقاس:</span><span class="oid-value">' + escapeAttr(size) + "</span>" : ""}
            </div>
            <div class="order-item-codes">
              ${taagerCode ? '<span class="oid-code">كود تاجر: ' + escapeAttr(taagerCode) + "</span>" : ""}
              ${subasaCode && subasaCode !== taagerCode ? '<span class="oid-code">سوبا بست: ' + escapeAttr(subasaCode) + "</span>" : ""}
              ${sku && sku !== taagerCode ? '<span class="oid-code">SKU: ' + escapeAttr(sku) + "</span>" : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");

    const countryBadge = (() => {
      const used = new Set();
      items.forEach((it) => {
        const cc = itemCountry(it, order);
        if (cc) used.add(cc);
      });
      return [...used].map((c) => '<span class="country-badge country-' + c.toLowerCase() + '">' + c + "</span>").join(" ");
    })();

    const address = String(order?.address || order?.customer_address || "-");
    const governorate = String(order?.governorate || order?.city || "");

    return `
      <article class="order-card batch-card">
        <div class="order-head">
          <p class="order-name">${escapeAttr(order?.user_name || order?.name || "-")} ${countryBadge}</p>
          <span class="status-pill ${statusClass(status)}">${statusLabel(status)}</span>
        </div>
        <div class="order-items-list">${itemHtml || '<div class="empty-text">بدون منتجات</div>'}</div>
        <div class="order-grid">
          <div class="order-row"><strong>المحافظة</strong><span>${escapeAttr(governorate || "-")}</span></div>
          <div class="order-row"><strong>العنوان</strong><span>${escapeAttr(address)}</span></div>
          <div class="order-row"><strong>الهاتف</strong><span dir="ltr">${escapeAttr(getOrderPhone(order) || "-")}</span></div>
          <div class="order-row"><strong>الإيميل</strong><span dir="ltr">${escapeAttr(email)}</span></div>
          <div class="order-row"><strong>التاريخ</strong><span>${formatDate(order?.created_at)}</span></div>
        </div>
        <div class="status-control-row">
          <select id="status_select_${escapeAttr(String(order?.id || ""))}">${statusOptions}</select>
          <button class="btn btn-secondary status-btn" onclick="changeOrderStatus('${escapeAttr(String(order?.id || ""))}')">تحديث</button>
        </div>
        <button class="btn btn-primary view-details-btn" onclick="goToUserOrders('${encodedEmail}')">
          <i class="fa-solid fa-eye"></i> عرض كل طلبات العميل
        </button>
      </article>
    `;
  }).join("");
}

function applyFiltersAndRender() {
  const filtered = getFilteredOrders();
  const { itemsCount, total, prepared } = todayRangeTotals(filtered);

  document.getElementById("summaryOrders").innerText = `${filtered.length} طلب`;
  document.getElementById("summaryItems").innerText = `${itemsCount} منتج`;
  document.getElementById("summaryTotal").innerText = `${total}`;
  document.getElementById("summaryPrepared").innerText = `${prepared} طلب`;
  document.getElementById("dateInput").value = selectedDate;

  // تحديث خيارات الفلاتر (شركة/حالة)
  const companySelect = document.getElementById("companyFilter");
  companySelect.innerHTML =
    '<option value="all">كل الشركات</option>' +
    companyOrder
      .map((c) => `<option value="${escapeAttr(c)}">${escapeAttr(c)}</option>`)
      .join("");
  companySelect.value = companyFilter && companyOrder.includes(companyFilter) ? companyFilter : "all";
  companyFilter = companySelect.value;

  const statusSelect = document.getElementById("statusFilterSelect");
  statusSelect.innerHTML =
    '<option value="all">كل الحالات</option>' +
    STATUS_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  statusSelect.value = statusFilter;

  document.getElementById("bulkStatusSelect").innerHTML = STATUS_OPTIONS.map(
    ([v, l]) => `<option value="${v}">${l}</option>`
  ).join("");
  document.getElementById("bulkCount").innerText = filtered.length
    ? `${filtered.length} طلب سيتم تطبيق الحالة عليه`
    : "لا توجد طلبات مطابقة";

  renderSummary();
  renderCompanies();
  renderUnregistered();
  renderOrders(filtered);
}

function jumpToDate(dateStr) {
  selectedDate = dateStr;
  fetchDayOrders();
}

function filterByCompany(encodedCompany) {
  companyFilter = decodeURIComponent(encodedCompany);
  document.getElementById("companyFilter").value = companyFilter;
  applyFiltersAndRender();
  document.getElementById("ordersGrid").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ────────────────────────── تحديث الحالة ────────────────────────── */
function handleSingleStatus(order, newStatus) {
  if (newStatus === getOrderStatus(order)) return Promise.resolve(0);
  return supabaseClient.from("orders").update({ status: newStatus }).eq("id", order.id);
}

// خصم كميات المخزون عند تحويل الطلب إلى «تم التسليم» (وحدة موحدة + سجل stock_change_log)
async function deductOrderItemsStock(order) {
  try {
    if (typeof StockDeduction !== "undefined" && StockDeduction && typeof StockDeduction.deductForOrder === "function") {
      await StockDeduction.deductForOrder(order, { sourcePage: "admin-today-orders" });
      return true;
    }
  } catch (e) {
    console.warn("Stock deduction failed:", e && e.message);
  }
  return false;
}

async function changeOrderStatus(id) {
  const select = document.getElementById(`status_select_${id}`);
  if (!select) return;
  const newStatus = select.value;
  const order = dayOrders.find((o) => String(o.id) === String(id));
  if (!order) return;

  const wasDelivered = getOrderStatus(order) === "delivered";
  const { error } = await handleSingleStatus(order, newStatus);
  if (error) {
    console.error(error);
    showToast("حدث خطأ أثناء تحديث الحالة", "error");
    return;
  }
  if (newStatus === "delivered" && !wasDelivered) {
    await deductOrderItemsStock(order);
  }
  showToast("تم تحديث حالة الطلب", "success");
  fetchDayOrders();
}

async function prepareAllOrders() {
  const filtered = getFilteredOrders();
  const targets = filtered.filter((o) => {
    const st = getOrderStatus(o);
    return st !== "preparing" && !FILTER_STATUSES.includes(st);
  });

  if (!targets.length) {
    showToast("لا توجد طلبات بحاجة إلى تجهيز (بعد الفلترة الحالية)", "info");
    return;
  }

  if (!confirm(`تجهيز ${targets.length} طلب (تغيير الحالة إلى جارٍ التجهيز)؟`)) return;

  let ok = 0;
  for (let i = 0; i < targets.length; i++) {
    const { error } = await supabaseClient
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", targets[i].id);
    if (!error) ok++;
  }
  showToast(`تم تحديث ${ok} طلب إلى جارٍ التجهيز`, ok ? "success" : "error");
  fetchDayOrders();
}

/* ────────────────────────── تصدير Excel ────────────────────────── */
function excelCountryCode(code) {
  return code === "SA" ? "SAU" : code === "EG" ? "EGY" : "";
}

function formatExcelTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function buildExcelRows(orders) {
  const add = (order, it) => {
    const variant = parseTaagerVariantId(extractTaagerId(it));
    const color = String(it?.selected_color || it?.selectedColor || it?.color || variant.color || "").trim();
    const size = String(it?.selected_size || it?.selectedSize || it?.size || variant.size || "").trim();
    const taagerCode = getTaagerBaseCode(it);
    const taager = resolveTaagerRow(it);
    const supabaseId = (taager && taager.id) || String(it?.id || it?.product_id || "");
    const subasaCode = getTaagerRealCode(it) || supabaseId;
    const country = excelCountryCode(itemCountry(it, order));

    return {
      A: taagerCode,                                    // (Product ID) كود المنتج — كود تاجر الحقيقي
      B: String(it?.name || it?.product_name || it?.title || "").trim(), // (Product Name)
      C: Number(it?.price) || 0,                        // (Product Price)
      D: Number(it?.quantity) || 1,                     // (Quantity)
      E: String(order?.user_name || order?.name || "").trim(), // (Customer Name)
      F: String(order?.governorate || order?.city || "").trim(), // (Province)
      G: String(order?.address || order?.customer_address || "").trim(), // (Address)
      H: "", // (Saudi National Address) العنوان الوطني السعودي
      I: String(getOrderPhone(order) || ""),            // (Phone Number)
      J: "", // (Phone Number 2)
      K: String(order?.notes || order?.order_notes || "").trim(), // (Notes)
      L: "BudoQ", // (Facebook Page)
      M: "budoq.com", // (Facebook Page Link)
      N: country || "SAU",                              // (Country)
      O: color,                                         // (Product Color)
      P: size,                                          // (Product Size)
      Q: formatExcelTime(order?.created_at),            // (Order Placement Time)
      R: String(order?.id || ""),                       // (Order ID on your store)
      S: subasaCode,                                    // سوبا بست (كود تاجر الحقيقي أو المعرف الداخلي)
    };
  };

  const rows = [];
  orders.forEach((order) => {
    const items = extractOrderItems(order);
    if (!items.length) {
      rows.push({
        A: "", B: "", C: 0, D: 1,
        E: String(order?.user_name || order?.name || "").trim(),
        F: String(order?.governorate || order?.city || "").trim(),
        G: String(order?.address || order?.customer_address || "").trim(),
        H: "", I: String(getOrderPhone(order) || ""), J: "",
        K: String(order?.notes || order?.order_notes || "").trim(),
        L: "BudoQ", M: "budoq.com", N: excelCountryCode(getOrderCountry(order)) || "SAU",
        O: "", P: "", Q: formatExcelTime(order?.created_at), R: String(order?.id || ""), S: "",
      });
      return;
    }
    items.forEach((it) => rows.push(add(order, it)));
  });
  return rows;
}

async function exportExcel() {
  const filtered = getFilteredOrders();
  if (!filtered.length) {
    showToast("لا توجد طلبات للتصدير", "error");
    return;
  }
  openExportPreview(filtered, `العربة-${selectedDate}${countryFilter !== "all" ? "-" + countryFilter : ""}.xlsx`);
}

async function exportCompanyExcel(encodedCompany) {
  const company = decodeURIComponent(encodedCompany);
  const orders = dayOrdersEnriched.filter((order) =>
    extractOrderItems(order).some((it) => getCompanyKey(it) === company)
  );
  if (!orders.length) {
    showToast("لا توجد طلبات لهذه الشركة", "error");
    return;
  }
  const safeName = String(company)
    .replace(/[^\w\u0600-\u06FF\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  openExportPreview(orders, `العربة-${safeName}-${selectedDate}.xlsx`);
}

async function exportByCompanyAll() {
  const map = aggregateByCompany();
  const companies = [...map.keys()];
  if (!companies.length) {
    showToast("لا توجد شركات للتصدير", "error");
    return;
  }
  let total = 0;
  for (const company of companies) {
    const orders = dayOrdersEnriched.filter((order) =>
      extractOrderItems(order).some((it) => getCompanyKey(it) === company)
    );
    const safeName = String(company)
      .replace(/[^\w\u0600-\u06FF\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const count = await doExport(orders, `العربة-${safeName}-${selectedDate}.xlsx`, true);
    total += count;
  }
  showToast(`تم تصدير ${total} سطر لكل الشركات (${companies.length} ملف)`, "success");
}

// يبني بيانات الورقة من الصفوف (جلب القالب ووضع الصفوف والترويسة)
async function buildWorkbookRows(rows) {
  const templateResp = await fetch(EXCEL_TEMPLATE_PATH);
  if (!templateResp.ok) throw new Error("لم يتم العثور على القالب (assets/templates/العربة.xlsx)");
  const templateBuf = await templateResp.arrayBuffer();

  const wb = XLSX.read(templateBuf, { type: "array" });
  const sheetName = wb.SheetNames.includes("Cart") ? "Cart" : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const header = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, range: 0 }))[0] || [];
  const instructions = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, range: 1 }))[0] || [];
  header[18] = "سوبا بست";

  const aoa = [[...header], [...instructions]];
  rows.forEach((r) => {
    aoa.push([r.A, r.B, r.C, r.D, r.E, r.F, r.G, r.H, r.I, r.J, r.K, r.L, r.M, r.N, r.O, r.P, r.Q, r.R, r.S]);
  });

  const finalWs = XLSX.utils.aoa_to_sheet(aoa);
  ["A1", "B1", "N1", "A2", "B2", "N2"].forEach((ref) => {
    if (ws[ref] && ws[ref].s) finalWs[ref] = Object.assign({}, finalWs[ref], { s: ws[ref].s });
  });
  wb.Sheets[sheetName] = finalWs;
  return wb;
}

function downloadWorkbookArray(wb, fileName) {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

async function doExport(orders, fileName, silent = false) {
  const rows = buildExcelRows(orders);
  return downloadRowsToWorkbook(rows, fileName, silent);
}

async function downloadRowsToWorkbook(rows, fileName, silent = false) {
  if (typeof XLSX === "undefined") {
    showToast("مكتبة Excel غير محمّلة", "error");
    return 0;
  }
  try {
    const wb = await buildWorkbookRows(rows);
    downloadWorkbookArray(wb, fileName);
    if (!silent) showToast(`تم تصدير ${rows.length} سطر إلى Excel`, "success");
    return rows.length;
  } catch (e) {
    console.error(e);
    if (!silent) showToast("فشل التصدير: " + (e.message || e), "error");
    return 0;
  }
}

/* ────────────────────────── معاينة التصدير قبل التنزيل ────────────────────────── */
function openExportPreview(orders, fileName) {
  const rows = buildExcelRows(orders);
  if (!rows.length) {
    showToast("لا توجد بيانات للمعاينة", "error");
    return;
  }
  previewState = { rows, fileName };
  document.getElementById("previewTitle").textContent = "معاينة وتعديل قبل التنزيل";
  document.getElementById("previewFileName").textContent = fileName;
  renderPreviewRows(rows);
  document.getElementById("exportPreviewModal").classList.add("open");
}

function renderPreviewRows(rows) {
  const wrap = document.getElementById("previewTableWrap");
  let total = 0;
  let html = '<div class="preview-table-scroll"><table class="preview-table"><thead><tr>';
  html += '<th class="pv-actions-col"></th>';
  html += PREVIEW_COLUMNS.map((c) => `<th>${c.label}</th>`).join("");
  html += "</tr></thead><tbody>";

  rows.forEach((r, ri) => {
    total += (Number(r.C) || 0) * (Number(r.D) || 1);
    const rowClass = ri % 2 === 1 ? ' class="pv-row-alt"' : "";
    html += `<tr${rowClass}>`;
    html += `<td class="pv-actions-col"><button class="pv-del" title="حذف السطر" onclick="previewDeleteRow(${ri})"><i class="fa-solid fa-trash-can"></i></button></td>`;
    PREVIEW_COLUMNS.forEach((c) => {
      html += `<td><input class="pv-in" data-row="${ri}" data-col="${c.key}" value="${escapeAttr(r[c.key])}" spellcheck="false" /></td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table></div>";
  wrap.innerHTML = html;

  document.getElementById("previewRowCount").innerText = `${rows.length} سطر`;
  document.getElementById("previewTotal").innerText = `الإجمالي: ${total}`;
  document.getElementById("previewAddRowBtn").style.display = rows.length ? "inline-flex" : "none";
}

function collectPreviewRows() {
  return previewState.rows.map((r, ri) => {
    const copy = Object.assign({}, r);
    PREVIEW_COLUMNS.forEach((c) => {
      const cell = document.querySelector(`.pv-in[data-row="${ri}"][data-col="${c.key}"]`);
      if (!cell) return;
      let v = cell.value;
      if ((c.key === "C" || c.key === "D") && v !== "" && !Number.isNaN(Number(v))) v = Number(v);
      copy[c.key] = v;
    });
    return copy;
  });
}

function previewAddRow() {
  previewState.rows = collectPreviewRows();
  previewState.rows.push({
    A: "", B: "", C: 0, D: 1, E: "", F: "", G: "", H: "", I: "", J: "", K: "",
    L: "BudoQ", M: "budoq.com", N: "SAU", O: "", P: "", Q: "", R: "", S: "",
  });
  renderPreviewRows(previewState.rows);
}

function previewDeleteRow(ri) {
  previewState.rows = collectPreviewRows();
  previewState.rows.splice(ri, 1);
  renderPreviewRows(previewState.rows);
}

async function downloadPreviewFile() {
  const fileName = previewState.fileName;
  const rows = collectPreviewRows();
  const count = await downloadRowsToWorkbook(rows, fileName);
  if (count > 0) closeExportPreview();
}

function closeExportPreview() {
  document.getElementById("exportPreviewModal").classList.remove("open");
}

/* ────────────────────────── روابط ────────────────────────── */
function goToUserOrders(email) {
  window.location.href = `admin-user-orders.html?email=${email}`;
}

/* ────────────────────────── التنقل بالتاريخ ────────────────────────── */
function shiftDate(days) {
  const d = parseLocalDate(selectedDate);
  d.setDate(d.getDate() + days);
  selectedDate = toLocalDateString(d);
  fetchDayOrders();
}

function bindEvents() {
  document.getElementById("dateInput").addEventListener("change", (e) => {
    if (e.target.value) {
      selectedDate = e.target.value;
      fetchDayOrders();
    }
  });
  document.getElementById("prevDayBtn").addEventListener("click", () => shiftDate(-1));
  document.getElementById("nextDayBtn").addEventListener("click", () => shiftDate(1));
  document.getElementById("todayBtn").addEventListener("click", () => {
    selectedDate = toLocalDateString(new Date());
    fetchDayOrders();
  });
  document.getElementById("countryFilter").addEventListener("change", (e) => {
    countryFilter = e.target.value;
    applyFiltersAndRender();
  });
  document.getElementById("companyFilter").addEventListener("change", (e) => {
    companyFilter = e.target.value;
    applyFiltersAndRender();
  });
  document.getElementById("statusFilterSelect").addEventListener("change", (e) => {
    statusFilter = e.target.value;
    document.getElementById("clearStatusFilterBtn").style.display = statusFilter !== "all" ? "inline-flex" : "none";
    applyFiltersAndRender();
  });
  document.getElementById("clearStatusFilterBtn").addEventListener("click", () => {
    statusFilter = "all";
    document.getElementById("statusFilterSelect").value = "all";
    document.getElementById("clearStatusFilterBtn").style.display = "none";
    applyFiltersAndRender();
  });
  document.getElementById("prepareAllBtn").addEventListener("click", prepareAllOrders);
  document.getElementById("exportBtn").addEventListener("click", exportExcel);
  document.getElementById("exportByCompanyBtn").addEventListener("click", exportByCompanyAll);
  document.getElementById("applyBulkStatusBtn").addEventListener("click", applyBulkStatus);
}

// اختصارات لوحة المفاتيح
function bindKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (document.getElementById("exportPreviewModal").classList.contains("open")) closeExportPreview();
      return;
    }
    const previewOpen = document.getElementById("exportPreviewModal").classList.contains("open");
    if (previewOpen) return;
    const tag = (e.key || "").toLowerCase();
    if (tag === "arrowleft" && e.shiftKey) { shiftDate(-1); }
    else if (tag === "arrowright" && e.shiftKey) { shiftDate(1); }
    else if (tag === "t") { selectedDate = toLocalDateString(new Date()); fetchDayOrders(); }
    else if (tag === "e") { exportExcel(); }
    else if (tag === "p") { prepareAllOrders(); }
    else if (tag === "1") { applyBulkStatusWith("preparing"); }
    else if (tag === "2") { applyBulkStatusWith("shipped"); }
    else if (tag === "3") { applyBulkStatusWith("delivered"); }
  });
}

async function applyBulkStatusWith(status) {
  document.getElementById("bulkStatusSelect").value = status;
  await applyBulkStatus();
}

window.changeOrderStatus = changeOrderStatus;
window.goToUserOrders = goToUserOrders;
window.jumpToDate = jumpToDate;
window.filterByCompany = filterByCompany;
window.exportCompanyExcel = exportCompanyExcel;
window.exportByCompanyAll = exportByCompanyAll;
window.applyBulkStatus = applyBulkStatus;
window.openExportPreview = openExportPreview;
window.closeExportPreview = closeExportPreview;
window.previewAddRow = previewAddRow;
window.previewDeleteRow = previewDeleteRow;
window.downloadPreviewFile = downloadPreviewFile;

bindEvents();
bindKeyboardShortcuts();
fetchDayOrders();
setInterval(fetchDayOrders, 30000);
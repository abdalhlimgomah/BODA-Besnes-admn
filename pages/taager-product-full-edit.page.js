const TABLE = "taager_products";

const ADMIN_BACKEND_ORDER = ["primary", "backup", "backup2"];
const ADMIN_BACKEND_LABELS = {
  primary: "السيرفر الأساسي",
  backup: "السيرفر الاحتياطي",
  backup2: "السيرفر الثالث",
};
const FALLBACK_ADMIN_BACKENDS = {
  primary: {
    name: "primary",
    url: "https://msgqzgzoslearaprgiqq.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE",
  },
  backup: {
    name: "backup",
    url: "https://wwlwwgqfjhmchrijaojr.supabase.co",
    key: "sb_publishable_wIxpA7t3a2hII8asqYZ1Bg__NoMLLUU",
  },
  backup2: {
    name: "backup2",
    url: "https://qhqkgrpezoaugyhzrgyc.supabase.co",
    key: "sb_publishable_bHCWG6iYSkbONKG7HR6Rkw_UVZGsjUe",
  },
};

let supabaseClient = null;
let original = null;
let draft = null;
let activeTab = "basic";
const dirtyKeys = new Set();

const TEXT_FIELDS = [
  "name",
  "description",
  "category",
  "brand",
  "seller",
  "source",
  "vendor",
  "company_name",
  "taager_code",
  "stock_status",
  "quick_details",
  "content_ideas",
  "how_to_use",
  "warranty",
];

const NUMBER_FIELDS = ["price", "original_price", "stock", "sales_count"];

const ARRAY_FIELDS = ["images", "videos", "available_countries", "colors", "sizes"];

const BOOLEAN_FIELDS = ["is_active", "return_allowed"];

const IMAGE_SLOTS = ["image1", "image2", "image3", "image4", "image5", "image6", "image7", "image8"];

const TABS = [
  { key: "basic", label: "الأساسيات", icon: "fa-solid fa-box" },
  { key: "content", label: "المحتوى والنصوص", icon: "fa-solid fa-align-right" },
  { key: "media", label: "الصور والفيديوهات", icon: "fa-solid fa-images" },
  { key: "variants", label: "الألوان والمقاسات", icon: "fa-solid fa-swatchbook" },
  { key: "meta", label: "بيانات إضافية", icon: "fa-solid fa-database" },
  { key: "raw", label: "Raw Data (JSON)", icon: "fa-solid fa-code" },
];

function getClient() {
  if (supabaseClient) return supabaseClient;
  supabaseClient = window.supabase.createClient(undefined, undefined, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return supabaseClient;
}

function getProductId() {
  return new URLSearchParams(window.location.search).get("id") || "";
}

function getBackendName() {
  try {
    if (window.adminAuth && typeof window.adminAuth.getActiveBackend === "function") {
      const b = window.adminAuth.getActiveBackend();
      if (b && b.name) return b.name;
    }
  } catch (e) {}
  return "active";
}

function getAdminBackends() {
  const guard = window.adminAuth && window.adminAuth.ADMIN_BACKENDS;
  if (guard && guard.primary) return guard;
  return FALLBACK_ADMIN_BACKENDS;
}

function getActiveBackendName() {
  try {
    if (window.adminAuth && typeof window.adminAuth.getActiveBackend === "function") {
      const b = window.adminAuth.getActiveBackend();
      if (b && b.name) return b.name;
    }
  } catch (e) {}
  return window.__bodaAdminBackendName || "primary";
}

function shouldPublishAll() {
  const box = document.getElementById("fxPublishAll");
  return !!(box && box.checked);
}

function getOtherBackends() {
  const backends = getAdminBackends();
  const activeName = getActiveBackendName();
  return ADMIN_BACKEND_ORDER.filter(function (name) {
    return name !== activeName && backends[name] && backends[name].url && backends[name].key;
  }).map(function (name) {
    return { name: name, backend: backends[name] };
  });
}

async function backendRest(backend, tablePath, method, body, extraHeaders) {
  const headers = Object.assign(
    {
      apikey: backend.key,
      Authorization: "Bearer " + backend.key,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "x-bypass-failover": "true",
    },
    extraHeaders || {}
  );
  const response = await fetch(backend.url + "/rest/v1/" + tablePath, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "HTTP " + response.status;
    try {
      const info = await response.json();
      message = (info && (info.message || info.error_description || info.details || info.hint)) || message;
    } catch (e) {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch (e) {
    return null;
  }
}

async function fetchProductOnBackend(backend, id) {
  const rows = await backendRest(
    backend,
    "taager_products?select=id,name,updated_at&id=eq." + encodeURIComponent(id),
    "GET"
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { name: backend.name, exists: !!row, row: row || null, ok: true };
}

function renderServerStatus(results) {
  const list = document.getElementById("fxServerList");
  if (!list) return;
  const activeName = getActiveBackendName();
  list.innerHTML = results
    .map(function (r) {
      const label = ADMIN_BACKEND_LABELS[r.name] || r.name;
      const stateClass = r.ok ? (r.exists ? "ok" : "missing") : "error";
      const stateText = r.ok ? (r.exists ? "موجود" : "غير موجود") : "خطأ في الفحص";
      return (
        '<div class="fx-server-item ' +
        stateClass +
        (r.name === activeName ? " active" : "") +
        '">' +
        '<span class="dot"></span>' +
        "<span>" +
        escapeHtml(label) +
        (r.name === activeName ? " (النشط)" : "") +
        "</span>" +
        '<span class="st">' +
        escapeHtml(stateText) +
        "</span>" +
        "</div>"
      );
    })
    .join("");
}

async function refreshServerStatus() {
  const id = draft && draft.id ? draft.id : getProductId();
  const list = document.getElementById("fxServerList");
  if (!id) {
    if (list) list.innerHTML = '<div class="hint">لا يوجد معرف منتج للفحص.</div>';
    return [];
  }
  const backends = getAdminBackends();
  const names = ADMIN_BACKEND_ORDER.filter(function (n) {
    return backends[n] && backends[n].url && backends[n].key;
  });
  if (list) list.innerHTML = '<div class="hint">جاري فحص السيرفرات...</div>';
  const results = await Promise.all(
    names.map(function (name) {
      return fetchProductOnBackend(backends[name], id).catch(function (error) {
        return { name: name, exists: false, row: null, ok: false, error: error.message || String(error) };
      });
    })
  );
  renderServerStatus(results);
  return results;
}

async function mirrorSaveToBackends(payload, id, createdAt) {
  const others = getOtherBackends();
  const results = [];
  for (let i = 0; i < others.length; i++) {
    const target = others[i];
    try {
      const updated = await backendRest(
        target.backend,
        "taager_products?id=eq." + encodeURIComponent(id),
        "PATCH",
        payload
      );
      const exists = Array.isArray(updated) ? updated.length > 0 : !!updated;
      if (exists) {
        results.push({ name: target.name, ok: true, action: "updated" });
        continue;
      }
      const createPayload = Object.assign({}, payload, { id: id });
      if (createdAt) createPayload.created_at = createdAt;
      await backendRest(target.backend, "taager_products", "POST", [createPayload]);
      results.push({ name: target.name, ok: true, action: "created" });
    } catch (error) {
      console.warn("mirror save failed on " + target.name + ":", error);
      results.push({ name: target.name, ok: false, action: "failed", error: error.message || String(error) });
    }
  }
  return results;
}

function buildMirrorToast(activeName, results) {
  if (!results.length) return "تم حفظ كل التعديلات بنجاح.";
  const allOk = results.every(function (r) {
    return r.ok;
  });
  if (allOk) return "تم حفظ التعديلات على السيرفرات الثلاثة بنجاح.";
  const failed = results
    .filter(function (r) {
      return !r.ok;
    })
    .map(function (r) {
      return ADMIN_BACKEND_LABELS[r.name] || r.name;
    })
    .join("، ");
  return "تم الحفظ على " + (ADMIN_BACKEND_LABELS[activeName] || activeName) + "، وفشل: " + failed;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showToast(message, type = "info") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const toast = document.createElement("div");
  toast.className = "toast-item toast-" + type;
  toast.textContent = message;
  wrap.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function markDirty(key) {
  dirtyKeys.add(key);
  renderSaveState();
}

function renderSaveState() {
  const chip = document.getElementById("fxMeta");
  const state = document.getElementById("fxSaveState");
  if (!state) return;
  const n = dirtyKeys.size;
  state.textContent = n ? "تعديلات غير محفوظة: " + n + " حقل" : "لا توجد تعديلات غير محفوظة";
  if (!chip) return;
  const existing = chip.querySelector(".fx-chip.dirty, .fx-chip.ok");
  if (existing) existing.remove();
  const span = document.createElement("span");
  span.className = "fx-chip " + (n ? "dirty" : "ok");
  span.innerHTML =
    '<i class="fa-solid ' + (n ? "fa-circle-exclamation" : "fa-circle-check") + '"></i> ' +
    (n ? n + " حقل معدّل" : "محفوظ");
  chip.appendChild(span);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      return t
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [value];
}

function fieldWrap(label, control, spanClass, hint, required) {
  return (
    '<div class="fx-field ' +
    (spanClass || "") +
    '">' +
    "<label>" +
    escapeHtml(label) +
    (required ? ' <span class="req">*</span>' : "") +
    "</label>" +
    control +
    (hint ? '<span class="hint">' + escapeHtml(hint) + "</span>" : "") +
    "</div>"
  );
}

function textInput(key, spanClass, hint, ltr) {
  const value = draft[key] === null || draft[key] === undefined ? "" : draft[key];
  const dir = ltr ? ' dir="ltr"' : "";
  return fieldWrap(
    key,
    '<input type="text" data-key="' + key + '"' + dir + ' value="' + escapeHtml(value) + '" />',
    spanClass,
    hint
  );
}

function numberInput(key, spanClass, hint, step) {
  const value = draft[key] === null || draft[key] === undefined ? "" : draft[key];
  return fieldWrap(
    key,
    '<input type="number" data-key="' + key + '" step="' + (step || "any") + '" value="' + escapeHtml(value) + '" />',
    spanClass,
    hint
  );
}

function textArea(key, spanClass, hint, tall) {
  const value = draft[key] === null || draft[key] === undefined ? "" : draft[key];
  return fieldWrap(
    key,
    '<textarea data-key="' + key + '"' + (tall ? ' class="tall"' : "") + ">" + escapeHtml(value) + "</textarea>",
    spanClass || "span-2",
    hint
  );
}

function selectField(key, options, spanClass, hint) {
  const current = draft[key] === null || draft[key] === undefined ? "" : String(draft[key]);
  const opts = options
    .map(
      (o) =>
        '<option value="' + escapeHtml(o) + '"' + (o === current ? " selected" : "") + ">" + escapeHtml(o || "—") + "</option>"
    )
    .join("");
  return fieldWrap(key, '<select data-key="' + key + '">' + opts + "</select>", spanClass, hint);
}

function switchField(key, label, hint) {
  const on = draft[key] === true || draft[key] === "true";
  return (
    '<div class="fx-field span-3">' +
    '<label>' +
    escapeHtml(key) +
    "</label>" +
    '<label class="fx-switch"><input type="checkbox" data-bool="' + key + '"' + (on ? " checked" : "") + " />" +
    "<span>" + escapeHtml(label) + "</span></label>" +
    (hint ? '<span class="hint">' + escapeHtml(hint) + "</span>" : "") +
    "</div>"
  );
}

function listEditor(key, hint) {
  const items = normalizeArray(draft[key]).map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  const rows = items
    .map(
      (v, i) =>
        '<div class="fx-list-row" data-list="' + key + '" data-index="' + i + '">' +
        (key === "images"
          ? '<img src="' + escapeHtml(v) + '" alt="" loading="lazy" onerror="this.onerror=null;this.outerHTML=\'<div class=&quot;fx-thumb&quot;><i class=&quot;fa-solid fa-image&quot;></i></div>\'" />'
          : '<div class="fx-thumb"><i class="fa-solid fa-grip-vertical"></i></div>') +
        '<input type="text" data-list-input="' + key + '" data-index="' + i + '" dir="ltr" value="' + escapeHtml(v) + '" />' +
        '<button type="button" class="fx-icon-btn" data-list-remove="' + key + '" data-index="' + i + '" title="حذف">' +
        '<i class="fa-solid fa-trash"></i></button>' +
        "</div>"
    )
    .join("");
  return (
    '<div class="fx-list">' +
    '<div class="fx-list-head"><strong>' + escapeHtml(key) + "</strong>" +
    '<button type="button" class="fx-icon-btn add" data-list-add="' + key + '" title="إضافة">' +
    '<i class="fa-solid fa-plus"></i></button></div>' +
    rows +
    (hint ? '<span class="hint">' + escapeHtml(hint) + "</span>" : "") +
    "</div>"
  );
}

function renderTabs() {
  const tabs = document.getElementById("fxTabs");
  if (!tabs) return;
  tabs.innerHTML = TABS.map(
    (t) =>
      '<button type="button" class="fx-tab' + (t.key === activeTab ? " active" : "") + '" data-tab="' + t.key + '">' +
      '<i class="' + t.icon + '"></i>' + escapeHtml(t.label) + "</button>"
  ).join("");
}

function switchTab(key) {
  activeTab = key;
  TABS.forEach((t) => {
    const btn = document.querySelector('.fx-tab[data-tab="' + t.key + '"]');
    if (btn) btn.classList.toggle("active", t.key === key);
    const panel = document.querySelector('.fx-panel[data-panel="' + t.key + '"]');
    if (panel) panel.classList.toggle("active", t.key === key);
  });
}

function renderBasic() {
  const grid = document.getElementById("fxBasicGrid");
  if (!grid) return;
  grid.innerHTML =
    '<div class="fx-section-title"><i class="fa-solid fa-cube"></i> بيانات أساسية</div>' +
    textInput("name", "span-2", "اسم المنتج كما يظهر في الموقع", false) +
    selectField("category", ["product", "", "electronics", "fashion", "home", "beauty", "sports", "toys", "grocery"], "span-3", "القسم") +
    textInput("brand", "span-3", "الماركة", false) +
    textInput("seller", "span-3", "البائع", false) +
    textInput("company_name", "span-3", "اسم الشركة", false) +
    textInput("taager_code", "span-3", "كود المنتج", true) +
    textInput("taager_product_id", "span-3", "رقم المنتج في تاجر", true) +
    textInput("vendor", "span-3", "معرّف البائع", true) +
    textInput("source", "span-3", "المصدر", true) +
    '<div class="fx-section-title"><i class="fa-solid fa-tags"></i> الأسعار</div>' +
    numberInput("price", "span-3", "سعر البيع الحالي") +
    numberInput("original_price", "span-3", "السعر قبل الخصم") +
    numberInput("sales_count", "span-3", "عدد المبيعات") +
    numberInput("stock", "span-3", "الكمية في المخزون") +
    '<div class="fx-section-title"><i class="fa-solid fa-toggle-on"></i> الحالة</div>' +
    switchField("is_active", "منشور في الموقع", "إظهار المنتج للعملاء") +
    switchField("return_allowed", "الإرجاع مسموح", "السماح بإرجاع المنتج") +
    selectField("stock_status", ["in_stock", "out_of_stock", "low_stock"], "span-3", "حالة المخزون") +
    textInput("warranty", "span-3", "مدة الضمان", false);
}

function renderContent() {
  const grid = document.getElementById("fxContentGrid");
  if (!grid) return;
  grid.innerHTML =
    textArea("description", "span-2", "الوصف الكامل الظاهر في صفحة المنتج", true) +
    textArea("quick_details", "span-2", "ملخص سريع يظهر في البطاقات") +
    textArea("content_ideas", "span-2", "أفكار المحتوى / المميزات", true) +
    textArea("how_to_use", "span-2", "طريقة الاستخدام");
}

function renderMedia() {
  const grid = document.getElementById("fxMediaGrid");
  if (!grid) return;
  const images = normalizeArray(draft.images).map((v) => (typeof v === "string" ? v : ""));
  const slots = IMAGE_SLOTS.map((k, i) => {
    const v = draft[k] === null || draft[k] === undefined ? "" : draft[k];
    return (
      '<div class="fx-thumb-box">' +
      '<button type="button" class="fx-icon-btn" data-clear="' + k + '" title="تفريغ">' +
      '<i class="fa-solid fa-xmark"></i></button>' +
      (v ? '<img src="' + escapeHtml(v) + '" alt="" loading="lazy" />' : '<div class="fx-thumb" style="width:96px;height:96px;border:1px dashed var(--border);border-radius:var(--radius-sm);display:grid;place-items:center;color:var(--muted)"><i class="fa-solid fa-image"></i></div>') +
      '<input type="text" data-key="' + k + '" dir="ltr" value="' + escapeHtml(v) + '" placeholder="image' + (i + 1) + '" />' +
      "</div>"
    );
  }).join("");
  const main = draft.image === null || draft.image === undefined ? "" : draft.image;
  grid.innerHTML =
    '<div class="fx-preview">' +
    (main
      ? '<img src="' + escapeHtml(main) + '" alt="" id="fxPreviewImg" />'
      : '<div class="fx-thumb" style="aspect-ratio:1;display:grid;place-items:center;font-size:30px;color:var(--muted);border:1px dashed var(--border);border-radius:var(--radius-sm)"><i class="fa-solid fa-image"></i></div>') +
    "<div>" +
    "<h4>" + escapeHtml(draft.name || "بدون اسم") + "</h4>" +
    '<div class="meta">' +
    "<span>" + escapeHtml(String(toNumber(draft.price).toFixed(2))) + " ج.م</span>" +
    "<span>المخزون: " + escapeHtml(String(draft.stock ?? 0)) + "</span>" +
    "<span>" + escapeHtml(draft.stock_status || "-") + "</span>" +
    "</div>" +
    '<div class="desc">' + escapeHtml(draft.description || "لا يوجد وصف") + "</div>" +
    '<div class="thumbs">' +
    images
      .filter(Boolean)
      .map((s) => '<img src="' + escapeHtml(s) + '" alt="" loading="lazy" />')
      .join("") +
    "</div></div></div>" +
    '<div class="fx-section-title"><i class="fa-solid fa-star"></i> الصورة الرئيسية</div>' +
    fieldWrap("image", '<input type="text" data-key="image" dir="ltr" value="' + escapeHtml(main) + '" />', "span-2") +
    '<div class="fx-section-title"><i class="fa-solid fa-layer-group"></i> مصفوفة الصور (images)</div>' +
    listEditor("images", "كل رابط في سطر — تُحفظ كمصفوفة JSON") +
    '<div class="fx-section-title"><i class="fa-solid fa-grip"></i> خانات الصور image1 … image8</div>' +
    '<div class="fx-thumbs">' + slots + "</div>" +
    '<div class="fx-section-title"><i class="fa-solid fa-video"></i> الفيديوهات</div>' +
    listEditor("videos", "روابط الفيديوهات") +
    '<div class="fx-section-title"><i class="fa-solid fa-earth-asia"></i> الدول المتاحة</div>' +
    listEditor("available_countries", "مثال: EG أو SA");
}

function renderVariants() {
  const grid = document.getElementById("fxVariantsGrid");
  if (!grid) return;

  const sizes = normalizeArray(draft.sizes);
  const sizeRows = sizes
    .map(
      (s, i) =>
        '<div class="fx-size-row" data-size-index="' + i + '">' +
        '<input type="text" data-size="name" data-index="' + i + '" value="' + escapeHtml(s.name || "") + '" placeholder="المقاس" />' +
        '<input type="number" data-size="price" data-index="' + i + '" step="any" value="' + escapeHtml(s.price ?? "") + '" placeholder="السعر" />' +
        '<input type="number" data-size="stock" data-index="' + i + '" value="' + escapeHtml(s.stock ?? "") + '" placeholder="المخزون" />' +
        '<button type="button" class="fx-icon-btn" data-size-remove="' + i + '" title="حذف"><i class="fa-solid fa-trash"></i></button>' +
        "</div>"
    )
    .join("");

  const colors = normalizeArray(draft.colors);
  const colorBlocks = colors
    .map((c, ci) => {
      const inner = normalizeArray(c.sizes)
        .map(
          (s, si) =>
            '<div class="fx-size-row" data-color-size-index="' + ci + '" data-index="' + si + '">' +
            '<input type="text" data-color-size-name="' + ci + '" data-index="' + si + '" value="' + escapeHtml(s.size || "") + '" placeholder="المقاس" />' +
            '<input type="number" data-color-size-stock="' + ci + '" data-index="' + si + '" value="' + escapeHtml(s.stock ?? "") + '" placeholder="المخزون" />' +
            '<button type="button" class="fx-icon-btn" data-color-size-remove="' + ci + '" data-index="' + si + '"><i class="fa-solid fa-trash"></i></button>' +
            "</div>"
        )
        .join("");
      return (
        '<div class="fx-variant" data-color-index="' + ci + '">' +
        '<div class="fx-variant-head">' +
        '<i class="fa-solid fa-palette"></i>' +
        '<input type="text" data-color="name" data-index="' + ci + '" value="' + escapeHtml(c.name || "") + '" placeholder="اسم اللون" />' +
        '<button type="button" class="fx-icon-btn add" data-color-size-add="' + ci + '" title="إضافة مقاس"><i class="fa-solid fa-plus"></i></button>' +
        '<button type="button" class="fx-icon-btn" data-color-remove="' + ci + '" title="حذف اللون"><i class="fa-solid fa-trash"></i></button>' +
        "</div>" +
        '<div class="fx-variant-body">' +
        (inner || '<span class="hint">لا توجد مقاسات لهذا اللون</span>') +
        "</div></div>"
      );
    })
    .join("");

  grid.innerHTML =
    '<div class="fx-section-title"><i class="fa-solid fa-ruler"></i> المقاسات (sizes)</div>' +
    '<div class="fx-list"><div class="fx-list-head"><strong>المقاس / السعر / المخزون</strong>' +
    '<button type="button" class="fx-icon-btn add" data-size-add="1" title="إضافة مقاس"><i class="fa-solid fa-plus"></i></button></div>' +
    sizeRows +
    "</div>" +
    '<div class="fx-section-title"><i class="fa-solid fa-palette"></i> الألوان (colors)</div>' +
    '<div class="fx-list">' +
    '<div class="fx-list-head"><strong>كل لون ومعاه مقاساته ومخزونه</strong>' +
    '<button type="button" class="fx-icon-btn add" data-color-add="1" title="إضافة لون"><i class="fa-solid fa-plus"></i></button></div>' +
    colorBlocks +
    "</div>";
}

function renderMeta() {
  const grid = document.getElementById("fxMetaGrid");
  if (!grid) return;
  const ro = [
    "id",
    "created_at",
    "updated_at",
    "last_synced_at",
  ]
    .map((k) => {
      const v = draft[k];
      return (
        '<div class="kv"><span>' + escapeHtml(k) + "</span><strong>" + escapeHtml(v === null || v === undefined ? "—" : v) + "</strong></div>"
      );
    })
    .join("");
  grid.innerHTML =
    '<div class="fx-section-title"><i class="fa-solid fa-circle-info"></i> سجلات النظام (غير قابلة للتعديل)</div>' +
    '<div class="fx-readonly">' + ro + "</div>" +
    '<div class="fx-section-title"><i class="fa-solid fa-globe"></i> رابط المنتج في تاجر</div>' +
    fieldWrap(
      "taager_link",
      '<input type="text" dir="ltr" readonly value="' +
        escapeHtml(
          draft.taager_product_id
            ? "https://eg.taager.com/g/" + encodeURIComponent(draft.taager_product_id)
            : ""
        ) +
        '" />',
      "span-2",
      "رابط仅供参考"
    );
}

function renderRaw() {
  const grid = document.getElementById("fxRawGrid");
  if (!grid) return;
  const json = JSON.stringify(draft.raw_data === null || draft.raw_data === undefined ? {} : draft.raw_data, null, 2);
  grid.innerHTML =
    '<div class="fx-section-title"><i class="fa-solid fa-database"></i> raw_data (الكائن الخام القادم من المصدر)</div>' +
    fieldWrap("raw_data", '<textarea class="json" id="fxRawJson">' + escapeHtml(json) + "</textarea>", "span-2", "JSON صالح فقط — سيُحفظ كما هو") +
    '<div class="fx-section-title"><i class="fa-solid fa-copy"></i> نسخة احتياطية من كل الحقول</div>' +
    fieldWrap(
      "all_json",
      '<textarea class="json" id="fxAllJson">' + escapeHtml(JSON.stringify(draft, null, 2)) + "</textarea>",
      "span-2",
      "تعديل هنا ثم اضغط زر الكود في الأسفل لتطبيق التعديلات"
    );
}

function renderAll() {
  renderTabs();
  renderBasic();
  renderContent();
  renderMedia();
  renderVariants();
  renderMeta();
  renderRaw();
  renderSaveState();
}

function renderHeader() {
  const sub = document.getElementById("fxSubtitle");
  const meta = document.getElementById("fxMeta");
  const title = document.getElementById("fxTitle");
  if (title) title.textContent = draft.name || "محرر المنتج المتقدم";
  if (sub) sub.textContent = draft.id || "";
  if (!meta) return;
  meta.innerHTML =
    '<span class="fx-chip"><i class="fa-solid fa-database"></i> ' + escapeHtml(getBackendName()) + "</span>" +
    '<span class="fx-chip"><i class="fa-solid fa-hashtag"></i> ' + escapeHtml(draft.taager_product_id || "-") + "</span>" +
    '<span class="fx-chip"><i class="fa-solid fa-tag"></i> ' + escapeHtml(draft.source || "-") + "</span>";
  renderSaveState();
}

function collectScalar(target, el) {
  const key = el.getAttribute("data-key");
  if (!key) return;
  if (NUMBER_FIELDS.includes(key)) {
    const raw = el.value.trim();
    target[key] = raw === "" ? null : toNumber(raw);
  } else {
    target[key] = el.value;
  }
}

function readLists(key) {
  const inputs = document.querySelectorAll('[data-list-input="' + key + '"]');
  const out = [];
  inputs.forEach((el) => {
    const v = el.value.trim();
    if (v) out.push(v);
  });
  return out;
}

function readSizes() {
  const rows = document.querySelectorAll("[data-size-index]");
  const byIndex = new Map();
  rows.forEach((row) => {
    const i = Number(row.getAttribute("data-size-index"));
    const obj = byIndex.get(i) || {};
    row.querySelectorAll("[data-size]").forEach((el) => {
      const f = el.getAttribute("data-size");
      const raw = el.value.trim();
      if (f === "name") obj.name = raw;
      if (f === "price") obj.price = raw === "" ? null : toNumber(raw);
      if (f === "stock") obj.stock = raw === "" ? null : toNumber(raw);
    });
    byIndex.set(i, obj);
  });
  return Array.from(byIndex.keys())
    .sort((a, b) => a - b)
    .map((i) => {
      const o = byIndex.get(i);
      if (o.is_available === undefined && (o.price !== undefined || o.stock !== undefined)) {
        o.is_available = toNumber(o.stock) > 0;
      }
      return o;
    });
}

function readColors() {
  const blocks = document.querySelectorAll("[data-color-index]");
  const out = [];
  blocks.forEach((block) => {
    const ci = Number(block.getAttribute("data-color-index"));
    const nameInput = block.querySelector('[data-color="name"]');
    const inner = [];
    block.querySelectorAll("[data-color-size-index]").forEach((row) => {
      const si = Number(row.getAttribute("data-index"));
      const size = (row.querySelector('[data-color-size-name="' + ci + '"]') || {}).value || "";
      const stockInput = row.querySelector('[data-color-size-stock="' + ci + '"]');
      const stockRaw = stockInput ? stockInput.value.trim() : "";
      inner[si] = { size: size.trim(), stock: stockRaw === "" ? null : toNumber(stockRaw) };
    });
    out[ci] = {
      name: nameInput ? nameInput.value.trim() : "",
      sizes: inner.filter(Boolean),
      value: "",
    };
  });
  return out.filter(Boolean);
}

function syncDraftFromInputs() {
  const panels = ["basic", "content", "media", "variants", "meta"];
  panels.forEach((p) => {
    const panel = document.querySelector('.fx-panel[data-panel="' + p + '"]');
    if (!panel) return;
    panel.querySelectorAll("[data-key]").forEach((el) => collectScalar(draft, el));
    panel.querySelectorAll("[data-bool]").forEach((el) => {
      draft[el.getAttribute("data-bool")] = el.checked;
    });
  });

  ARRAY_FIELDS.filter((k) => k !== "colors" && k !== "sizes").forEach((k) => {
    const inputs = document.querySelectorAll('[data-list-input="' + k + '"]');
    if (inputs.length) {
      draft[k] = readLists(k);
      markDirty(k);
    }
  });

  if (document.querySelector("[data-size-index]") || draft.sizes.length) {
    draft.sizes = readSizes();
    markDirty("sizes");
  }
  if (document.querySelector("[data-color-index]") || draft.colors.length) {
    draft.colors = readColors();
    markDirty("colors");
  }

  const rawBox = document.getElementById("fxRawJson");
  if (rawBox) {
    try {
      draft.raw_data = JSON.parse(rawBox.value);
      markDirty("raw_data");
    } catch (e) {}
  }

  syncImageArray();

  const previewImg = document.getElementById("fxPreviewImg");
  const previewName = document.querySelector('.fx-preview h4');
  const previewDesc = document.querySelector(".fx-preview .desc");
  const previewMeta = document.querySelector(".fx-preview .meta");
  const mainImage = typeof draft.image === "string" ? draft.image : "";
  if (previewImg && mainImage && previewImg.getAttribute("src") !== mainImage) previewImg.setAttribute("src", mainImage);
  if (previewName) previewName.textContent = draft.name || "بدون اسم";
  if (previewDesc) previewDesc.textContent = draft.description || "لا يوجد وصف";
  if (previewMeta) {
    previewMeta.innerHTML =
      "<span>" + escapeHtml(toNumber(draft.price).toFixed(2)) + " ج.م</span>" +
      "<span>المخزون: " + escapeHtml(String(draft.stock ?? 0)) + "</span>" +
      "<span>" + escapeHtml(draft.stock_status || "-") + "</span>";
  }
}

function syncImageArray() {
  const slots = IMAGE_SLOTS.map((k) => draft[k]).filter((v) => typeof v === "string" && v.trim());
  const list = readLists("images");
  const merged = [];
  list.concat(slots).forEach((v) => {
    const t = String(v).trim();
    if (t && !merged.includes(t)) merged.push(t);
  });
  draft.images = merged;
}

function onInput(e) {
  const el = e.target;
  if (el.hasAttribute && el.hasAttribute("data-key")) {
    collectScalar(draft, el);
    markDirty(el.getAttribute("data-key"));
    if (el.getAttribute("data-key") === "name" || el.getAttribute("data-key") === "image") renderHeader();
  }
  if (el.hasAttribute && el.hasAttribute("data-bool")) {
    draft[el.getAttribute("data-bool")] = el.checked;
    markDirty(el.getAttribute("data-bool"));
  }
  if (el.hasAttribute && el.hasAttribute("data-list-input")) {
    const key = el.getAttribute("data-list-input");
    const inputs = document.querySelectorAll('[data-list-input="' + key + '"]');
    const arr = [];
    inputs.forEach((i) => {
      const v = i.value.trim();
      if (v) arr.push(v);
    });
    draft[key] = arr;
    markDirty(key);
  }
  if (el.hasAttribute && el.hasAttribute("data-size")) {
    draft.sizes = readSizes();
    markDirty("sizes");
  }
  if (el.hasAttribute && el.hasAttribute("data-color")) {
    draft.colors = readColors();
    markDirty("colors");
  }
  if (el.id === "fxRawJson") {
    try {
      draft.raw_data = JSON.parse(el.value);
      markDirty("raw_data");
    } catch (e) {}
  }
}

function handleClick(e) {
  const el = e.target.closest("button");
  if (!el) return;

  if (el.classList.contains("fx-tab")) {
    syncDraftFromInputs();
    switchTab(el.getAttribute("data-tab"));
    return;
  }

  syncDraftFromInputs();

  if (el.hasAttribute("data-list-add")) {
    const key = el.getAttribute("data-list-add");
    draft[key] = normalizeArray(draft[key]).concat([""]);
    markDirty(key);
    renderMedia();
    return;
  }
  if (el.hasAttribute("data-list-remove")) {
    const key = el.getAttribute("data-list-remove");
    const i = Number(el.getAttribute("data-index"));
    const arr = normalizeArray(draft[key]);
    arr.splice(i, 1);
    draft[key] = arr.filter((v) => v !== "");
    markDirty(key);
    renderMedia();
    return;
  }
  if (el.hasAttribute("data-clear")) {
    const k = el.getAttribute("data-clear");
    draft[k] = "";
    markDirty(k);
    renderMedia();
    return;
  }
  if (el.hasAttribute("data-size-add")) {
    draft.sizes = readSizes().concat([{ name: "", price: null, stock: null, is_available: true }]);
    markDirty("sizes");
    renderVariants();
    return;
  }
  if (el.hasAttribute("data-size-remove")) {
    const i = Number(el.getAttribute("data-size-remove"));
    const arr = readSizes();
    arr.splice(i, 1);
    draft.sizes = arr;
    markDirty("sizes");
    renderVariants();
    return;
  }
  if (el.hasAttribute("data-color-add")) {
    draft.colors = readColors().concat([{ name: "", sizes: [{ size: "", stock: null }], value: "" }]);
    markDirty("colors");
    renderVariants();
    return;
  }
  if (el.hasAttribute("data-color-remove")) {
    const i = Number(el.getAttribute("data-color-remove"));
    const arr = readColors();
    arr.splice(i, 1);
    draft.colors = arr;
    markDirty("colors");
    renderVariants();
    return;
  }
  if (el.hasAttribute("data-color-size-add")) {
    const ci = Number(el.getAttribute("data-color-size-add"));
    const arr = readColors();
    arr[ci] = arr[ci] || { name: "", sizes: [], value: "" };
    arr[ci].sizes = normalizeArray(arr[ci].sizes).concat([{ size: "", stock: null }]);
    draft.colors = arr;
    markDirty("colors");
    renderVariants();
    return;
  }
  if (el.hasAttribute("data-color-size-remove")) {
    const ci = Number(el.getAttribute("data-color-size-remove"));
    const i = Number(el.getAttribute("data-index"));
    const arr = readColors();
    if (arr[ci]) arr[ci].sizes.splice(i, 1);
    draft.colors = arr;
    markDirty("colors");
    renderVariants();
    return;
  }
}

function applyJsonPatch() {
  const box = document.getElementById("fxAllJson");
  if (!box) return;
  try {
    const parsed = JSON.parse(box.value);
    const id = draft.id;
    const taagerId = draft.taager_product_id;
    const created = draft.created_at;
    draft = Object.assign({}, parsed);
    draft.id = id;
    draft.taager_product_id = taagerId;
    draft.created_at = created;
    if (!Array.isArray(draft.images)) draft.images = normalizeArray(draft.images);
    if (!Array.isArray(draft.videos)) draft.videos = normalizeArray(draft.videos);
    if (!Array.isArray(draft.available_countries)) draft.available_countries = normalizeArray(draft.available_countries);
    if (!Array.isArray(draft.colors)) draft.colors = normalizeArray(draft.colors);
    if (!Array.isArray(draft.sizes)) draft.sizes = normalizeArray(draft.sizes);
    if (draft.raw_data === undefined) draft.raw_data = {};
    dirtyKeys.clear();
    Object.keys(draft).forEach((k) => markDirty(k));
    renderAll();
    renderHeader();
    showToast("تم تطبيق الـ JSON على النموذج (لم يُحفظ بعد).", "info");
  } catch (e) {
    showToast("JSON غير صالح: " + e.message, "error");
  }
}

async function save() {
  syncDraftFromInputs();
  if (!draft.id) return;

  const payload = {};
  Object.keys(draft).forEach((k) => {
    if (k === "id" || k === "created_at") return;
    payload[k] = draft[k];
  });
  payload.updated_at = new Date().toISOString();

  const btn = document.getElementById("fxSaveBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';
  }

  const { error } = await getClient().from(TABLE).update(payload).eq("id", draft.id);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ كل التعديلات';
  }

  if (error) {
    console.error("Save error:", error);
    showToast("فشل الحفظ: " + (error.message || error.error_description || "خطأ غير معروف"), "error");
    return;
  }

  original = JSON.parse(JSON.stringify(draft));
  dirtyKeys.clear();
  renderSaveState();
  renderAll();

  if (shouldPublishAll()) {
    const activeName = getActiveBackendName();
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> نشر على السيرفرات...';
    }
    const results = await mirrorSaveToBackends(payload, draft.id, draft.created_at);
    await refreshServerStatus();
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ كل التعديلات';
    }
    const allOk = results.length > 0 && results.every(function (r) {
      return r.ok;
    });
    showToast(buildMirrorToast(activeName, results), allOk ? "success" : "error");
    return;
  }

  showToast("تم حفظ كل التعديلات بنجاح.", "success");
  refreshServerStatus();
}

function resetDraft() {
  if (!original) return;
  draft = JSON.parse(JSON.stringify(original));
  dirtyKeys.clear();
  renderAll();
  renderHeader();
  showToast("تم استرجاع القيم الأصلية (لم يُحفظ بعد).", "info");
}

async function load() {
  const id = getProductId();
  const loading = document.getElementById("fxLoading");
  const shell = document.getElementById("fxShell");

  if (!id) {
    loading.innerHTML =
      '<div class="fx-error-box"><i class="fa-solid fa-circle-exclamation"></i> لا يوجد معرف منتج في الرابط. ارجع للقائمة وافتح المنتج من زر تعديل.</div>';
    return;
  }

  try {
    const { data, error } = await getClient().from(TABLE).select("*").eq("id", id).limit(1);
    if (error) throw error;
    if (!data || !data.length) {
      loading.innerHTML =
        '<div class="fx-error-box"><i class="fa-solid fa-circle-exclamation"></i> لم يتم العثور على المنتج <strong>' +
        escapeHtml(id) +
        "</strong> على السيرفر الحالي (<strong>" +
        escapeHtml(getBackendName()) +
        "</strong>). جرّب تبديل السيرفر من أعلى الصفحة أو ارجع للقائمة.</div>";
      return;
    }
    original = data[0];
    draft = JSON.parse(JSON.stringify(original));
    IMAGE_SLOTS.forEach((k) => {
      if (draft[k] === undefined) draft[k] = "";
    });
    ["images", "videos", "available_countries", "colors", "sizes"].forEach((k) => {
      draft[k] = normalizeArray(draft[k]);
    });
    if (draft.raw_data === null || draft.raw_data === undefined) draft.raw_data = {};

    loading.style.display = "none";
    shell.style.display = "block";
    renderAll();
    renderHeader();
    refreshServerStatus();
  } catch (e) {
    console.error(e);
    loading.innerHTML =
      '<div class="fx-error-box"><i class="fa-solid fa-triangle-exclamation"></i> فشل تحميل المنتج: ' +
      escapeHtml(e.message || String(e)) +
      "</div>";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  document.addEventListener("input", onInput);
  document.addEventListener("change", onInput);
  document.addEventListener("click", handleClick);
  const saveBtn = document.getElementById("fxSaveBtn");
  if (saveBtn) saveBtn.addEventListener("click", save);
  const resetBtn = document.getElementById("fxResetBtn");
  if (resetBtn) resetBtn.addEventListener("click", resetDraft);
  const jsonBtn = document.getElementById("fxJsonBtn");
  if (jsonBtn) jsonBtn.addEventListener("click", applyJsonPatch);
  const refreshStatusBtn = document.getElementById("fxRefreshStatus");
  if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      refreshServerStatus();
    });
  }
  window.addEventListener("beforeunload", (e) => {
    if (dirtyKeys.size) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
});

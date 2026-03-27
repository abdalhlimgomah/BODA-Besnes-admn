const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const REVIEW_TABLE = "my_products";
const STORE_TABLE = "products";
const REFRESH_INTERVAL_MS = 4000;

const STORE_LINKS_KEY = "review_store_links_v2";
const REVIEW_STATUS_OVERRIDES_KEY = "review_status_overrides_v2";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const runtime = {
  products: [],
  missingStoreFilterColumns: new Set(),
  typeMismatchStoreFilterColumns: new Set(),
};

function safeText(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isUuidLike(value) {
  const text = safeText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text);
}

function isIntegerLike(value) {
  return /^-?\d+$/.test(safeText(value));
}

function normalizeReviewStatus(value) {
  const key = safeText(value).toLowerCase().replace(/\s+/g, "_");
  if (!key) return "pending";
  if (key.includes("reviewed") || key.includes("approved") || key.includes("published") || key.includes("قبول")) {
    return "reviewed";
  }
  if (key.includes("rejected") || key.includes("رفض")) return "rejected";
  if (key.includes("pending") || key.includes("review") || key.includes("draft") || key.includes("قيد") || key.includes("مراج")) {
    return "pending";
  }
  return "pending";
}

function statusLabel(status) {
  const key = normalizeReviewStatus(status);
  if (key === "reviewed") return "تمت المراجعة";
  if (key === "rejected") return "مرفوض";
  return "قيد المراجعة";
}

function statusClass(status) {
  const key = normalizeReviewStatus(status);
  if (key === "reviewed") return "status-reviewed";
  if (key === "rejected") return "status-rejected";
  return "status-review";
}

function cleanPayload(payload = {}, options = {}) {
  const keepNull = Boolean(options.keepNull);
  const out = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (typeof value === "undefined") return;
    if (value === null && !keepNull) return;
    if (typeof value === "string") {
      out[key] = value.trim();
      return;
    }
    out[key] = value;
  });
  return out;
}

function escapeHtml(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function readJsonObject(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeJsonObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value || {}));
  } catch {
    // Ignore localStorage failures.
  }
}

function readStoreLinks() {
  return readJsonObject(STORE_LINKS_KEY);
}

function writeStoreLinks(links = {}) {
  writeJsonObject(STORE_LINKS_KEY, links);
}

function setStoreLink(reviewProductId, storeProductId) {
  const reviewId = safeText(reviewProductId);
  const storeId = safeText(storeProductId);
  if (!reviewId || !storeId) return;
  const links = readStoreLinks();
  links[reviewId] = storeId;
  writeStoreLinks(links);
}

function getStoreLink(reviewProductId) {
  const reviewId = safeText(reviewProductId);
  if (!reviewId) return "";
  const links = readStoreLinks();
  return safeText(links[reviewId] || "");
}

function clearStoreLink(reviewProductId) {
  const reviewId = safeText(reviewProductId);
  if (!reviewId) return;
  const links = readStoreLinks();
  if (!Object.prototype.hasOwnProperty.call(links, reviewId)) return;
  delete links[reviewId];
  writeStoreLinks(links);
}

function readReviewStatusOverrides() {
  return readJsonObject(REVIEW_STATUS_OVERRIDES_KEY);
}

function writeReviewStatusOverrides(map = {}) {
  writeJsonObject(REVIEW_STATUS_OVERRIDES_KEY, map);
}

function setReviewStatusOverride(productId, status) {
  const id = safeText(productId);
  if (!id) return;
  const map = readReviewStatusOverrides();
  map[id] = normalizeReviewStatus(status);
  writeReviewStatusOverrides(map);
}

function getReviewStatusOverride(productId) {
  const id = safeText(productId);
  if (!id) return "";
  const map = readReviewStatusOverrides();
  return normalizeReviewStatus(map[id] || "");
}

function clearReviewStatusOverride(productId) {
  const id = safeText(productId);
  if (!id) return;
  const map = readReviewStatusOverrides();
  if (!Object.prototype.hasOwnProperty.call(map, id)) return;
  delete map[id];
  writeReviewStatusOverrides(map);
}

function getProductReviewStatus(product = {}) {
  const id = safeText(product.id);
  const override = getReviewStatusOverride(id);
  if (override) return override;

  return normalizeReviewStatus(
    product.review_status ||
      product.reviewStatus ||
      product.product_status ||
      product.status ||
      product.review ||
      ""
  );
}

function getStoreStatusFromReview(reviewStatus) {
  return normalizeReviewStatus(reviewStatus) === "reviewed" ? "published" : "pending_review";
}

function getPrimaryImage(item) {
  return safeText(
    item.img1 ||
      item.image ||
      item.image_url ||
      item.image_link1 ||
      item.image1 ||
      item.thumbnail ||
      ""
  );
}

function priceAfterDiscount(item) {
  const explicit = toNumber(item.price_after_discount);
  if (explicit > 0) return explicit;
  const price = toNumber(item.price || item.amount);
  const discount = toNumber(item.discount_percent || item.discount);
  return Math.max(0, price - (price * discount) / 100);
}

function getErrorText(error) {
  return `${error?.message || ""} ${error?.details || ""}`.trim();
}

function isMissingColumnError(error) {
  if (!error) return false;
  const code = safeText(error.code).toLowerCase();
  const msg = getErrorText(error).toLowerCase();
  return (
    code === "42703" ||
    safeText(error.code) === "PGRST204" ||
    (msg.includes("column") && msg.includes("does not exist")) ||
    (msg.includes("could not find the") && msg.includes("column"))
  );
}

function isTypeMismatchError(error) {
  if (!error) return false;
  const code = safeText(error.code).toLowerCase();
  const msg = getErrorText(error).toLowerCase();
  return (
    code === "22p02" ||
    code === "42804" ||
    msg.includes("invalid input syntax for type") ||
    (msg.includes("is of type") && msg.includes("but expression is of type"))
  );
}

function extractMissingColumnName(error) {
  const text = getErrorText(error);
  if (!text) return "";
  const patterns = [
    /could not find the ['"]?([a-z0-9_]+)['"]? column/i,
    /column ['"]?([a-z0-9_]+)['"]? of relation/i,
    /column ['"]?([a-z0-9_]+)['"]? does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return safeText(match[1]);
  }
  return "";
}

function hasOwnKeyCaseInsensitive(payload, keyName) {
  const cleanKey = safeText(keyName).toLowerCase();
  if (!cleanKey) return false;
  return Object.keys(payload || {}).some((key) => safeText(key).toLowerCase() === cleanKey);
}

function omitColumnCaseInsensitive(payload, columnName) {
  const cleanColumn = safeText(columnName).toLowerCase();
  if (!cleanColumn) return payload;
  let changed = false;
  const out = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (safeText(key).toLowerCase() === cleanColumn) {
      changed = true;
      return;
    }
    out[key] = value;
  });
  return changed ? out : payload;
}

function stripIncompatibleIdFields(payload, error) {
  const text = getErrorText(error).toLowerCase();
  if (!text) return payload;

  const expectsUuid = text.includes("type uuid");
  const expectsInteger = text.includes("type bigint") || text.includes("type integer") || text.includes("type smallint");
  if (!expectsUuid && !expectsInteger) return payload;

  let changed = false;
  const out = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    const cleanKey = safeText(key).toLowerCase();
    const isIdKey = cleanKey === "id" || cleanKey.endsWith("_id");
    if (!isIdKey) {
      out[key] = value;
      return;
    }

    const textValue = safeText(value);
    if (!textValue) {
      out[key] = value;
      return;
    }

    if (expectsUuid && !isUuidLike(textValue)) {
      changed = true;
      return;
    }
    if (expectsInteger && !isIntegerLike(textValue)) {
      changed = true;
      return;
    }

    out[key] = value;
  });

  return changed ? out : payload;
}

async function runAdaptiveWrite(writeFn, basePayload = {}, maxAttempts = 6) {
  let payload = cleanPayload(basePayload);
  let lastError = null;

  for (let i = 0; i < maxAttempts; i += 1) {
    const { data, error } = await writeFn(payload);
    if (!error) return { ok: true, data, payload };
    lastError = error;

    if (isMissingColumnError(error)) {
      const missingColumn = extractMissingColumnName(error);
      if (missingColumn && hasOwnKeyCaseInsensitive(payload, missingColumn)) {
        payload = omitColumnCaseInsensitive(payload, missingColumn);
        continue;
      }
    }

    if (isTypeMismatchError(error)) {
      const reduced = stripIncompatibleIdFields(payload, error);
      if (reduced !== payload) {
        payload = reduced;
        continue;
      }
    }

    break;
  }

  return { ok: false, error: lastError, payload };
}

function buildSlug(name, id) {
  const base = `${safeText(name) || "product"}-${safeText(id) || Date.now()}`.toLowerCase();
  return base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function buildStorePayloadFromReview(product, reviewStatus) {
  const cleanStatus = normalizeReviewStatus(reviewStatus);
  const reviewId = safeText(product.id);
  const name = safeText(product.product_name || product.name || product.title || "منتج");
  const category = safeText(product.category || product.store_category || "");
  const description = safeText(product.description || product.desc || "");
  const image = getPrimaryImage(product);
  const email = safeText(product.owner_email || product.seller_email || product.user_email || product.email || "").toLowerCase();
  const phone = safeText(product.owner_phone || product.phone || product.phone_number || "");
  const price = toNumber(product.price || product.amount);
  const finalPrice = priceAfterDiscount(product);
  const quantity = Math.max(0, Math.round(toNumber(product.quantity || product.stock)));
  const now = new Date().toISOString();

  return cleanPayload({
    legacy_my_products_id: reviewId || undefined,
    name,
    title: name,
    product_name: name,
    slug: buildSlug(name, reviewId),
    price,
    amount: price,
    price_after_discount: finalPrice,
    description,
    category,
    image,
    img1: image,
    stock: quantity,
    quantity,
    status: getStoreStatusFromReview(cleanStatus),
    seller_email: email || undefined,
    owner_email: email || undefined,
    email: email || undefined,
    phone: phone || undefined,
    owner_phone: phone || undefined,
    updated_at: now,
    created_at: safeText(product.created_at) || now,
  });
}

function buildStoreInsertCandidates(payload = {}) {
  const base = cleanPayload(payload);
  const legacyShape = cleanPayload({
    product_name: base.product_name || base.name,
    price: base.price,
    quantity: base.quantity || base.stock,
    category: base.category,
    img1: base.img1 || base.image,
    email: base.email || base.owner_email || base.seller_email,
    phone: base.phone || base.owner_phone,
    status: base.status,
  });
  const minimalShape = cleanPayload({
    name: base.name || base.product_name,
    price: base.price,
    image: base.image || base.img1,
    status: base.status,
  });

  const candidates = [base, legacyShape, minimalShape];
  const unique = [];
  const seen = new Set();

  candidates.forEach((candidate) => {
    const key = JSON.stringify(candidate || {});
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(candidate);
  });

  return unique;
}

function canUseStoreFilterColumn(column) {
  const clean = safeText(column).toLowerCase();
  if (!clean) return false;
  if (runtime.missingStoreFilterColumns.has(clean)) return false;
  if (runtime.typeMismatchStoreFilterColumns.has(clean)) return false;
  return true;
}

function markStoreFilterColumnMissing(column) {
  const clean = safeText(column).toLowerCase();
  if (!clean) return;
  runtime.missingStoreFilterColumns.add(clean);
}

function markStoreFilterColumnTypeMismatch(column) {
  const clean = safeText(column).toLowerCase();
  if (!clean) return;
  runtime.typeMismatchStoreFilterColumns.add(clean);
}

async function tryUpdateStoreByColumn(column, value, payload) {
  const cleanColumn = safeText(column);
  const cleanValue = safeText(value);
  if (!cleanColumn || !cleanValue) return { updated: false, ids: [], error: null };
  if (!canUseStoreFilterColumn(cleanColumn)) return { updated: false, ids: [], error: null };

  const result = await runAdaptiveWrite((candidate) =>
    supabaseClient
      .from(STORE_TABLE)
      .update(candidate)
      .eq(cleanColumn, cleanValue)
      .select("id")
      .limit(50), payload);

  if (result.ok) {
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      updated: rows.length > 0,
      ids: rows.map((row) => safeText(row?.id)).filter(Boolean),
      error: null,
    };
  }

  if (isMissingColumnError(result.error)) {
    const missingColumn = extractMissingColumnName(result.error);
    if (missingColumn && missingColumn.toLowerCase() === cleanColumn.toLowerCase()) {
      markStoreFilterColumnMissing(cleanColumn);
    }
    return { updated: false, ids: [], error: null };
  }

  if (isTypeMismatchError(result.error)) {
    markStoreFilterColumnTypeMismatch(cleanColumn);
    return { updated: false, ids: [], error: null };
  }

  return { updated: false, ids: [], error: result.error };
}

async function tryDeleteStoreByColumn(column, value) {
  const cleanColumn = safeText(column);
  const cleanValue = safeText(value);
  if (!cleanColumn || !cleanValue) return { deletedCount: 0, error: null };
  if (!canUseStoreFilterColumn(cleanColumn)) return { deletedCount: 0, error: null };

  const { data, error } = await supabaseClient
    .from(STORE_TABLE)
    .delete()
    .eq(cleanColumn, cleanValue)
    .select("id")
    .limit(200);

  if (!error) {
    return { deletedCount: Array.isArray(data) ? data.length : 0, error: null };
  }

  if (isMissingColumnError(error)) {
    const missingColumn = extractMissingColumnName(error);
    if (missingColumn && missingColumn.toLowerCase() === cleanColumn.toLowerCase()) {
      markStoreFilterColumnMissing(cleanColumn);
    }
    return { deletedCount: 0, error: null };
  }

  if (isTypeMismatchError(error)) {
    markStoreFilterColumnTypeMismatch(cleanColumn);
    return { deletedCount: 0, error: null };
  }

  return { deletedCount: 0, error };
}

async function publishProductToStore(product) {
  const payload = buildStorePayloadFromReview(product, "reviewed");
  const productId = safeText(product.id);
  let lastError = null;

  const linkedStoreId = getStoreLink(productId);
  if (linkedStoreId) {
    const byLinkedId = await tryUpdateStoreByColumn("id", linkedStoreId, payload);
    if (byLinkedId.updated) return true;
    lastError = byLinkedId.error || lastError;
  }

  const byLegacy = await tryUpdateStoreByColumn("legacy_my_products_id", productId, payload);
  if (byLegacy.updated) {
    if (byLegacy.ids[0]) setStoreLink(productId, byLegacy.ids[0]);
    return true;
  }
  lastError = byLegacy.error || lastError;

  const candidates = buildStoreInsertCandidates(payload);
  for (const candidate of candidates) {
    const result = await runAdaptiveWrite((adapted) =>
      supabaseClient
        .from(STORE_TABLE)
        .insert([adapted])
        .select("id")
        .limit(1), candidate);

    if (result.ok) {
      const rows = Array.isArray(result.data) ? result.data : [];
      const insertedId = safeText(rows[0]?.id || "");
      if (insertedId) setStoreLink(productId, insertedId);
      return true;
    }
    lastError = result.error || lastError;
  }

  throw lastError || new Error("PUBLISH_TO_STORE_FAILED");
}

async function removeProductFromStore(productOrId) {
  const reviewId = typeof productOrId === "object" ? safeText(productOrId?.id) : safeText(productOrId);
  if (!reviewId) return 0;

  let deletedCount = 0;
  let lastError = null;

  const linkedStoreId = getStoreLink(reviewId);
  if (linkedStoreId) {
    const byLinked = await tryDeleteStoreByColumn("id", linkedStoreId);
    deletedCount += byLinked.deletedCount;
    lastError = byLinked.error || lastError;
  }

  const byLegacy = await tryDeleteStoreByColumn("legacy_my_products_id", reviewId);
  deletedCount += byLegacy.deletedCount;
  lastError = byLegacy.error || lastError;

  if (lastError) throw lastError;
  if (deletedCount > 0) clearStoreLink(reviewId);
  return deletedCount;
}

async function updateReviewRowStatus(reviewId, reviewStatus) {
  const cleanId = safeText(reviewId);
  if (!cleanId) return { updated: false, fallbackOnly: true };

  const normalized = normalizeReviewStatus(reviewStatus);
  const attempts = [
    { column: "review_status", value: normalized },
    { column: "status", value: normalized === "reviewed" ? "reviewed" : "pending" },
    { column: "status", value: getStoreStatusFromReview(normalized) },
    { column: "product_status", value: normalized },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const { error } = await supabaseClient
      .from(REVIEW_TABLE)
      .update({ [attempt.column]: attempt.value })
      .eq("id", cleanId);

    if (!error) {
      setReviewStatusOverride(cleanId, normalized);
      return { updated: true, fallbackOnly: false };
    }

    if (isMissingColumnError(error)) continue;
    lastError = error;
    break;
  }

  if (lastError) throw lastError;

  // No usable status column in this schema: keep UI/status behavior via local override.
  setReviewStatusOverride(cleanId, normalized);
  return { updated: false, fallbackOnly: true };
}

async function setReviewStatusWithStoreSync(product, nextStatus) {
  const normalized = normalizeReviewStatus(nextStatus);

  if (normalized === "reviewed") {
    await publishProductToStore(product);
    await updateReviewRowStatus(product.id, normalized);
    return;
  }

  await updateReviewRowStatus(product.id, normalized);
  await removeProductFromStore(product.id);
}

function findProductRow(productId) {
  const id = safeText(productId);
  if (!id) return null;
  return runtime.products.find((item) => safeText(item.id) === id) || null;
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

function updateSummary(items) {
  const pendingCount = items.filter((item) => getProductReviewStatus(item) === "pending").length;
  const reviewedCount = items.filter((item) => getProductReviewStatus(item) === "reviewed").length;
  document.getElementById("productsCount").textContent = String(items.length);
  document.getElementById("pendingCount").textContent = String(pendingCount);
  document.getElementById("reviewedCount").textContent = String(reviewedCount);
}

function renderProducts(products) {
  const container = document.getElementById("productsGrid");
  if (!container) return;

  if (!products.length) {
    container.innerHTML = '<div class="empty-state">لا توجد منتجات مطابقة</div>';
    return;
  }

  container.innerHTML = products
    .map((product) => {
      const status = getProductReviewStatus(product);
      const safeId = escapeAttr(product.id);
      const image = escapeAttr(getPrimaryImage(product));
      const name = escapeHtml(product.product_name || product.name || product.title || "-");
      const category = escapeHtml(product.category || product.store_category || "-");
      const email = escapeHtml(product.email || product.owner_email || product.seller_email || "-");
      const phone = escapeHtml(product.phone || product.owner_phone || "-");
      const quantity = escapeHtml(toNumber(product.quantity || product.stock));
      const price = toNumber(product.price || product.amount);
      const after = priceAfterDiscount(product);

      return `
        <article class="product-card">
          <img src="${image}" alt="${name || "منتج"}" />
          <h4>${name}</h4>
          <div class="product-meta">
            <p><strong>السعر:</strong> ${price.toFixed(2)}</p>
            <p><strong>بعد الخصم:</strong> ${after.toFixed(2)}</p>
            <p><strong>الكمية:</strong> ${quantity}</p>
            <p><strong>القسم:</strong> ${category}</p>
            <p><strong>التاجر:</strong> ${email} | ${phone}</p>
          </div>
          <div class="status-row">
            <span>الحالة</span>
            <span class="status-pill ${statusClass(status)}">${statusLabel(status)}</span>
          </div>
          <div class="product-actions">
            <button class="review-btn" data-action="set-review" data-id="${safeId}" data-status="pending">قيد المراجعة</button>
            <button class="review-btn" data-action="set-review" data-id="${safeId}" data-status="reviewed">تمت المراجعة</button>
            <button class="delete-btn" data-action="delete-product" data-id="${safeId}">حذف</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function applyFilters() {
  const query = safeText(document.getElementById("searchInput")?.value).toLowerCase();
  const reviewFilter = safeText(document.getElementById("reviewFilter")?.value || "all");

  let filtered = [...runtime.products];
  if (query) {
    filtered = filtered.filter((item) => {
      const name = safeText(item.product_name || item.name || item.title).toLowerCase();
      const email = safeText(item.email || item.owner_email || item.seller_email).toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }

  if (reviewFilter !== "all") {
    filtered = filtered.filter((item) => getProductReviewStatus(item) === reviewFilter);
  }

  renderProducts(filtered);
  updateSummary(filtered);
}

async function loadProducts(showErrorToast = false) {
  const { data, error } = await supabaseClient
    .from(REVIEW_TABLE)
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    if (showErrorToast) showToast("تعذر تحميل المنتجات", "error");
    return;
  }

  runtime.products = Array.isArray(data) ? data : [];

  const overrides = readReviewStatusOverrides();
  runtime.products = runtime.products.map((row) => {
    const id = safeText(row?.id);
    if (!id) return row;
    const override = overrides[id];
    if (!override) return row;
    return { ...row, review_status: normalizeReviewStatus(override) };
  });

  applyFilters();
}

async function updateProductReview(id, status) {
  const product = findProductRow(id);
  if (!product) {
    showToast("المنتج غير موجود أو تم تحديث الصفحة.", "error");
    await loadProducts();
    return;
  }

  const nextStatus = normalizeReviewStatus(status);
  try {
    await setReviewStatusWithStoreSync(product, nextStatus);
    showToast(
      nextStatus === "reviewed"
        ? "تمت مراجعة المنتج ونشره في الموقع."
        : "تم تحويل المنتج إلى قيد المراجعة وسحبه من الموقع.",
      "success"
    );
    await loadProducts();
  } catch (error) {
    console.error(error);
    showToast("فشل تحديث حالة المراجعة.", "error");
  }
}

async function deleteProduct(id) {
  if (!confirm("هل أنت متأكد أنك تريد حذف المنتج؟")) return;

  const cleanId = safeText(id);
  if (!cleanId) {
    showToast("معرّف المنتج غير صالح.", "error");
    return;
  }

  let deletedReviewRows = 0;
  let deletedStoreRows = 0;
  let firstError = null;

  try {
    const reviewDelete = await supabaseClient
      .from(REVIEW_TABLE)
      .delete()
      .eq("id", cleanId)
      .select("id")
      .limit(50);
    if (reviewDelete.error) {
      firstError = reviewDelete.error;
    } else {
      deletedReviewRows = Array.isArray(reviewDelete.data) ? reviewDelete.data.length : 0;
    }
  } catch (error) {
    firstError = firstError || error;
  }

  try {
    deletedStoreRows = await removeProductFromStore(cleanId);
  } catch (error) {
    firstError = firstError || error;
  }

  clearStoreLink(cleanId);
  clearReviewStatusOverride(cleanId);

  if (deletedReviewRows > 0 || deletedStoreRows > 0) {
    showToast("تم حذف المنتج", "success");
    await loadProducts();
    return;
  }

  if (firstError) {
    console.error(firstError);
  }
  showToast("فشل حذف المنتج", "error");
}

async function handleGridClick(event) {
  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const action = safeText(btn.getAttribute("data-action"));
  const id = safeText(btn.getAttribute("data-id"));
  if (!id) return;

  btn.disabled = true;
  try {
    if (action === "set-review") {
      const status = safeText(btn.getAttribute("data-status"));
      await updateProductReview(id, status);
      return;
    }

    if (action === "delete-product") {
      await deleteProduct(id);
    }
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("searchInput")?.addEventListener("input", applyFilters);
document.getElementById("reviewFilter")?.addEventListener("change", applyFilters);
document.getElementById("productsGrid")?.addEventListener("click", handleGridClick);

window.updateProductReview = updateProductReview;
window.deleteProduct = deleteProduct;

loadProducts(true);
setInterval(() => {
  loadProducts(false);
}, REFRESH_INTERVAL_MS);

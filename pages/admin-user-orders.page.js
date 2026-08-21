const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORDER_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 120 120%27%3E%3Crect width=%27120%27 height=%27120%27 rx=%2714%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M60 32a14 14 0 110 28 14 14 0 010-28zm-24 46c0-10 8-18 18-18h12c10 0 18 8 18 18v8H36v-8z%27 fill=%27%2394a3b8%27/%3E%3C/svg%3E";

function extractTaagerId(item) {
  if (item.taager_product_id) return String(item.taager_product_id).trim();
  var id = String(item.id || item.product_id || "");
  if (id.startsWith("taager_")) return id.slice(7);
  return "";
}

// يفرز المعرف المركب الخاص بتاجر (مثل 1998_c_اسود_s_XL)
// إلى: معرف أساسي (1998) + لون (اسود) + مقاس (XL)
function parseTaagerVariantId(tid) {
  var s = String(tid || "").trim();
  var m = s.match(/^(.+?)_c_(.+?)(?:_s_(.*))?$/);
  if (!m) return { base: s, color: "", size: "" };
  return { base: m[1], color: m[2], size: m[3] || "" };
}

// يحذف اللاحقة (اللون/المقاس) المدمجة من المعرف المعروض
function stripVariantSuffix(value) {
  var s = String(value || "").trim();
  if (!s) return s;
  var isTaager = s.indexOf("taager_") === 0;
  var bare = isTaager ? s.slice(7) : s;
  var parsed = parseTaagerVariantId(bare);
  if (parsed.color || parsed.size) {
    var base = parsed.base || bare;
    return isTaager ? "taager_" + base : base;
  }
  return s;
}

let userEmail = "";
let userOrders = [];

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

function normalizeImageSource(value) {
  const source = String(value ?? "").trim();
  if (!source) return "";
  if (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("data:") ||
    source.startsWith("blob:")
  ) {
    return source;
  }
  if (source.startsWith("//")) return `https:${source}`;
  if (source.startsWith("/storage/v1/object/public/")) return `${SUPABASE_URL}${source}`;
  if (source.startsWith("storage/v1/object/public/")) return `${SUPABASE_URL}/${source}`;
  if (source.startsWith("product-images/")) return `${SUPABASE_URL}/storage/v1/object/public/${source}`;
  return source;
}

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

function normalizeToArray(value) {
  if (!value) return [];
  const parsed = parseJsonSafe(value);
  const data = parsed ?? value;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function extractImageFromOrderItem(item) {
  if (!item || typeof item !== "object") return "";
  const candidates = [
    item.image, item.image_url, item.product_image,
    item.thumbnail, item.img, parseJsonSafe(item.metadata)?.image,
    Array.isArray(item.images) ? item.images[0] : item.images || "",
  ];
  for (const c of candidates) {
    const v = normalizeImageSource(c);
    if (v) return v;
  }
  return "";
}

function extractProductNameFromOrder(order) {
  if (!order || typeof order !== "object") return "";
  const direct = String(order.product_name || order.productName || "").trim();
  if (direct) return direct;
  const payloadFields = [order.items_json, order.items, order.order_items, order.items_snapshot, order.type];
  for (const payload of payloadFields) {
    const entries = normalizeToArray(payload);
    if (entries.length > 0) {
      const name = String(entries[0]?.name || entries[0]?.product_name || entries[0]?.title || "").trim();
      if (name) return name;
    }
  }
  return "";
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

function getOrderShipping(order) {
  return Number(order?.shipping_cost ?? order?.shipping_fee ?? order?.shipping ?? 0) || 0;
}

function getOrderCodFee(order) {
  return Number(order?.tax ?? order?.tax_amount ?? order?.cod_fee ?? order?.payment_fee ?? 0) || 0;
}

function getOrderTotal(order) {
  return Number(order?.total_price ?? order?.total ?? order?.amount ?? 0) || 0;
}

const LEGACY_BATCH_WINDOW_MS = 3 * 60 * 1000;

function parseOrderTime(order) {
  const ts = new Date(order?.created_at ?? order?.updated_at);
  return Number.isNaN(ts.getTime()) ? 0 : ts.getTime();
}

function sameLegacyBatch(a, b) {
  if (a.order_batch_id || b.order_batch_id) return false;
  if (getOrderEmail(a) !== getOrderEmail(b)) return false;
  if (getOrderPhone(a) !== getOrderPhone(b)) return false;
  if (getOrderStatus(a) !== getOrderStatus(b)) return false;
  return Math.abs(parseOrderTime(a) - parseOrderTime(b)) <= LEGACY_BATCH_WINDOW_MS;
}

// تقسّم الطلبات إلى مجموعات: كل مجموعة = طلبات صدرت من نفس السلة (نفس صفحة الدفع)
function buildBatches(orders) {
  const list = Array.isArray(orders) ? [...orders] : [];
  const batches = [];
  const used = new Set();

  for (const order of list) {
    const orderId = String(order?.id ?? "").trim();
    if (!orderId || used.has(orderId)) continue;

    const groupOrders = [order];
    used.add(orderId);
    const batchId = String(order?.order_batch_id || "").trim();

    for (const other of list) {
      const otherId = String(other?.id ?? "").trim();
      if (!otherId || used.has(otherId)) continue;
      if (batchId) {
        if (String(other?.order_batch_id || "").trim() === batchId) {
          groupOrders.push(other);
          used.add(otherId);
        }
      } else if (sameLegacyBatch(order, other)) {
        groupOrders.push(other);
        used.add(otherId);
      }
    }

    batches.push({
      key: batchId || `legacy-${orderId}`,
      batchId,
      legacy: !batchId,
      orders: groupOrders,
    });
  }

  batches.sort((a, b) => parseOrderTime(b.orders[0]) - parseOrderTime(a.orders[0]));
  return batches;
}

// إجماليات المجموعة: الشحن ورسوم الدفع تُحسب مرة واحدة فقط
function computeBatchTotals(batch) {
  const orders = batch?.orders || [];
  let subtotal = 0;
  let discount = 0;
  let shipping = 0;
  let cod = 0;
  let couponCode = "";

  orders.forEach((order) => {
    const items = extractOrderItems(order);
    items.forEach((item) => {
      subtotal += (Number(item?.price) || 0) * (Number(item?.quantity) || 1);
    });
    discount += Number(order?.discount ?? order?.discount_amount ?? 0) || 0;
    shipping = Math.max(shipping, getOrderShipping(order));
    cod = Math.max(cod, getOrderCodFee(order));
    if (!couponCode && order?.coupon_code) couponCode = String(order.coupon_code);
  });

  const total = Math.max(subtotal - discount + shipping + cod, 0);
  return { subtotal, discount, shipping, cod, couponCode, total, ordersCount: orders.length };
}

const extractItemsCache = new Map();

function extractOrderItems(order) {
  const orderId = String(order?.id || "");
  if (orderId && extractItemsCache.has(orderId)) {
    return extractItemsCache.get(orderId);
  }
  const payloadFields = [order.items_json, order.items, order.order_items, order.items_snapshot, order.type];
  let items = [];
  for (const payload of payloadFields) {
    const parsed = normalizeToArray(payload);
    if (parsed.length) { items = parsed; break; }
  }
  if (orderId) extractItemsCache.set(orderId, items);
  return items;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

// جلب اسم الشركة (seller) والمصدر (source) من جدول taager_products
// العمودان المتاحان في الجدول: id (مثل taager_1998) و taager_product_id (مثل 1998)
async function enrichItemsWithTaagerProducts(orders) {
  const itemList = [];
  orders.forEach((order) => extractOrderItems(order).forEach((it) => itemList.push(it)));
  if (!itemList.length) return;

  const idKeys = [];   // لقيم عمود id: UUID أو taager_1998
  const prodKeys = []; // لقيم عمود taager_product_id: 1998 أو 1998_c_اسود_s_XL
  const addU = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };

  itemList.forEach((it) => {
    const rawId = String(it?.id || it?.product_id || "").trim();
    if (isUuidLike(rawId)) addU(idKeys, rawId);
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
        .select("id,taager_product_id,name,seller,source,brand,vendor,company_name,colors,sizes,available_countries")
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
        .select("id,taager_product_id,name,seller,source,brand,vendor,company_name,colors,sizes,available_countries")
        .in("taager_product_id", chunk);
      if (res.error) {
        res = await supabaseClient.from("taager_products").select("*").in("taager_product_id", chunk);
      }
      if (!res.error && Array.isArray(res.data)) rows.push(...res.data);
    }
  }

  const map = new Map();
  rows.forEach((row) => {
    if (!row) return;
    if (row.id) map.set(String(row.id).trim(), row);
    if (row.taager_product_id != null) map.set(String(row.taager_product_id).trim(), row);
  });

  itemList.forEach((it) => {
    let row = null;
    const rawId = String(it?.id || it?.product_id || "").trim();
    if (rawId) row = map.get(rawId) || map.get(stripVariantSuffix(rawId));
    const tid = extractTaagerId(it);
    if (!row && tid) row = map.get(tid) || map.get(parseTaagerVariantId(tid).base);
    it.__taager = row || null;
  });
}

function getItemSeller(item) {
  if (!item) return "";
  const t = item.__taager;
  const seller = String(
    (t && (t.seller || t.company_name || t.vendor || t.brand || (t.product_data && (t.product_data.seller || t.product_data.brand)))) ||
    item.seller ||
    item.vendor ||
    item.store_name ||
    item.brand ||
    ""
  ).trim();
  return seller || "تاجر";
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
  const source = item.__taager ? (item.__taager.source || "") : "";
  const countries = Array.isArray(item.__taager?.available_countries) ? item.__taager.available_countries : [];
  const firstCountry = countries.length ? String(countries[0]) : "";
  var code = mapSourceToCountry(source, countryFromItem || countryFromOrder || firstCountry);
  return code;
}

function renderBatchTotals(batch) {
  const totals = computeBatchTotals(batch);
  const rows = [
    ['<strong>المنتجات (السلع)</strong>', `${totals.subtotal}`],
  ];
  if (totals.discount > 0) {
    rows.push(['<strong>الخصم</strong>', `<span style="color:#16a34a;">-${totals.discount}</span>`]);
  }
  rows.push(['<strong>الشحن</strong>', `${totals.shipping}`]);
  if (totals.cod > 0) rows.push(['<strong>رسوم الدفع</strong>', `${totals.cod}`]);
  rows.push(['<strong>الإجمالي</strong>', `<strong>${totals.total}</strong>`]);
  var html = rows.map(([label, value]) => `<div class="order-row">${label}<span>${value}</span></div>`).join("");
  if (totals.couponCode) {
    html += '<div class="order-row"><strong>كوبون</strong><span>' + escapeAttr(totals.couponCode) + '</span></div>';
  }
  return html;
}

function renderBatchProducts(batch) {
  const orders = batch.orders;
  const items = [];
  orders.forEach((order) => {
    extractOrderItems(order).forEach((it) => items.push({ item: it, order }));
  });

  return items.map(({ item, order }) => {
    var img = normalizeImageSource(
      item.image || item.image_url || item.product_image || item.thumbnail || item.img ||
      (Array.isArray(item.images) ? item.images[0] : item.images) || ""
    ) || ORDER_IMAGE_PLACEHOLDER;
    var name = String(item.name || item.product_name || item.title || "منتج");
    var qty = Number(item.quantity) || 1;
    var price = Number(item.price) || 0;
    var total = price * qty;
    var taagerId = extractTaagerId(item);
    var variant = parseTaagerVariantId(taagerId);
    var sku = String(item.sku || item.code || "");
    var seller = getItemSeller(item);
    var countryCode = getItemCountry(item, order);
    var size = String(
      item.selected_size || item.size || item.variant_label || item.variant_name || item.selectedSize || variant.size || ""
    ).trim();
    if (/^(اللون|المقاس)/.test(size)) size = size.split(":")[1]?.trim() || size;
    var color = String(item.selected_color || item.selectedColor || item.color || variant.color || "").trim();
    var productNumber = stripVariantSuffix(item.taager_product_id || taagerId || "");
    var rawId = stripVariantSuffix(String(item.id || item.product_id || ""));
    var countryBadge = countryCode
      ? '<span class="country-badge country-' + countryCode.toLowerCase() + '">' + countryCode + '</span>'
      : '';

    return '<div class="order-item-row">'
      + '<img class="order-item-img" src="' + escapeAttr(img) + '" alt="' + escapeAttr(name) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + ORDER_IMAGE_PLACEHOLDER + '\'" />'
      + '<div class="order-item-info">'
      + '<div class="order-item-name">' + escapeAttr(name.length > 35 ? name.slice(0, 35) + "…" : name) + countryBadge + '</div>'
      + (seller ? '<div class="order-item-seller"><i class="fa-solid fa-store"></i> ' + escapeAttr(seller) + '</div>' : '')
      + '<div class="order-item-details">'
      + '<span class="oid-label">السعر:</span><span class="oid-value">' + price + '</span>'
      + '<span class="oid-label">الكمية:</span><span class="oid-value">' + qty + '</span>'
      + '<span class="oid-label">الإجمالي:</span><span class="oid-value oid-total">' + total + '</span>'
      + (color ? '<span class="oid-label">اللون:</span><span class="oid-value">' + escapeAttr(color) + '</span>' : '')
      + (size ? '<span class="oid-label">المقاس:</span><span class="oid-value">' + escapeAttr(size) + '</span>' : '')
      + '</div>'
      + '<div class="order-item-codes">'
      + (productNumber ? '<span class="oid-code">رقم المنتج: ' + escapeAttr(productNumber) + '</span>' : '')
      + (rawId ? '<span class="oid-code">معرف: ' + escapeAttr(rawId) + '</span>' : '')
      + (sku ? '<span class="oid-code">SKU: ' + escapeAttr(sku) + '</span>' : '')
      + '</div>'
      + '</div>'
      + '</div>';
  }).join("");
}

function getBatchIdsParam(batch) {
  const ids = batch.orders.map((o) => String(o.id || "")).filter(Boolean);
  return encodeURIComponent(ids.join(","));
}

function renderBatchCard(batch) {
  const orders = batch.orders;
  const primary = orders[0];
  const isGroup = orders.length > 1;
  const statusPills = orders
    .map((o) => '<span class="status-pill ' + statusClass(getOrderStatus(o)) + '">' + statusLabel(getOrderStatus(o)) + '</span>')
    .join(" ");
  const idsParam = getBatchIdsParam(batch);
  const batchQuery = batch.batchId ? '&batch=' + encodeURIComponent(batch.batchId) : "";

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
    '<option value="' + value + '"' + (getOrderStatus(primary) === value ? " selected" : "") + '>' + label + '</option>'
  ).join("");

  return `
    <article class="order-card batch-card${isGroup ? " batch-group" : ""}">
      <div class="order-head">
        <p class="order-name">${escapeAttr(primary.user_name || primary.name || "-")}</p>
        <span class="status-pill ${statusClass(getOrderStatus(primary))}">${statusLabel(getOrderStatus(primary))}</span>
      </div>
      ${isGroup ? '<div class="batch-badge"><i class="fa-solid fa-cart-plus"></i>' + orders.length + ' أوامر معًا في نفس السلة</div>' : '<div class="batch-badge batch-single"><i class="fa-solid fa-receipt"></i> طلب واحد</div>'}
      <div class="batch-status-pills">${statusPills}</div>
      <div class="order-items-list">${renderBatchProducts(batch)}</div>
      <div class="order-grid">
        <div class="order-row"><strong>الهاتف</strong><span>${escapeAttr(primary.phone || "-")}</span></div>
        <div class="order-row"><strong>الإيميل</strong><span>${escapeAttr(primary.user_email || primary.email || "-")}</span></div>
        <div class="order-row"><strong>العنوان</strong><span>${escapeAttr(primary.address || "-")}</span></div>
        <div class="order-row"><strong>التاريخ</strong><span>${formatDate(primary.created_at)}</span></div>
      </div>
      <div class="order-totals-box">
        <div class="totals-title"><i class="fa-solid fa-calculator"></i> إجماليات ${isGroup ? "السلة" : "الطلب"}</div>
        ${renderBatchTotals(batch)}
      </div>
      <div class="status-control-row">
        <select id="status_select_${batch.key}">
          ${statusOptions}
        </select>
        <button class="btn btn-secondary status-btn" onclick="changeBatchStatus('${batch.key}')">تحديث</button>
      </div>
      <button class="btn btn-primary view-details-btn" onclick="openOrderGroup('${idsParam}', '${escapeAttr(batch.batchId || "")}')">
        <i class="fa-solid fa-eye"></i> عرض البيانات
      </button>
    </article>
  `;
}

function getFilteredOrders() {
  const status = document.getElementById("statusFilter").value;
  if (status === "all") return userOrders;
  return userOrders.filter(order => getOrderStatus(order) === status);
}

function renderOrders() {
  const filtered = getFilteredOrders();
  const grid = document.getElementById("ordersGrid");
  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-text">لا توجد طلبات مطابقة</p>';
    return;
  }

  const batches = buildBatches(filtered);
  grid.innerHTML = batches.map(renderBatchCard).join("");
}

/* ── خصم الكميات من مخزون المنتج عند تسليم الطلب (وحدة موحدة مع سجل stock_change_log) ── */
async function deductOrderItemsStock(order) {
  try {
    await StockDeduction.deductForOrder(order, { sourcePage: "admin-user-orders" });
  } catch (e) {
    console.warn("Stock deduction failed:", e && e.message);
  }
}

async function changeBatchStatus(batchKey) {
  const select = document.getElementById(`status_select_${batchKey}`);
  if (!select) return;
  const newStatus = select.value;
  const batches = buildBatches(userOrders);
  const batch = batches.find((b) => b.key === batchKey);
  if (!batch) return;

  let hasError = false;
  for (const order of batch.orders) {
    const wasDelivered = getOrderStatus(order) === "delivered";
    const { error } = await supabaseClient.from("orders").update({ status: newStatus }).eq("id", order.id);
    if (error) {
      console.error(error);
      hasError = true;
      continue;
    }
    if (newStatus === "delivered" && !wasDelivered) {
      await deductOrderItemsStock(order);
    }
  }

  if (hasError) {
    showToast("حدث خطأ أثناء تحديث بعض الطلبات", "error");
  } else {
    showToast((batch.orders.length > 1 ? "تم تحديث جميع طلبات السلة" : "تم تحديث حالة الطلب") + " بنجاح", "success");
  }
  fetchUserOrders();
}

function openOrderGroup(idsParam, batchId) {
  window.location.href = `admin-order-group.html?ids=${idsParam}` + (batchId ? "&batch=" + encodeURIComponent(batchId) : "");
}

async function fetchUserOrders() {
  if (!userEmail) return;
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    showToast("تعذر تحميل الطلبات", "error");
    return;
  }

  const target = String(userEmail).trim().toLowerCase();
  userOrders = (Array.isArray(data) ? data : []).filter((order) => getOrderEmail(order) === target);
  extractItemsCache.clear();
  try {
    await enrichItemsWithTaagerProducts(userOrders);
  } catch (e) {
    console.warn("taager enrichment failed", e);
  }
  updateSummary();
  renderOrders();
}

function updateSummary() {
  const filtered = getFilteredOrders();
  const isFiltered = document.getElementById("statusFilter").value !== "all";
  const batches = buildBatches(filtered);
  const total = batches.reduce((sum, b) => sum + computeBatchTotals(b).total, 0);
  document.getElementById("userOrdersCount").innerText = isFiltered
    ? `${filtered.length} من ${userOrders.length} طلب`
    : `${userOrders.length} طلب`;
  document.getElementById("userTotalAmount").innerText = `${total}`;
  document.getElementById("userEmailHeader").innerText = userEmail;
  document.getElementById("userSummary").innerText = isFiltered
    ? `طلبات ${userEmail} - ${filtered.length} من ${userOrders.length}`
    : `عرض جميع طلبات ${userEmail} - ${userOrders.length} طلب`;
}

function getEmailFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("email") || "";
}

window.changeBatchStatus = changeBatchStatus;
window.openOrderGroup = openOrderGroup;
window.changeStatus = changeBatchStatus;

document.getElementById("statusFilter").addEventListener("change", () => {
  updateSummary();
  renderOrders();
});

userEmail = getEmailFromUrl();
if (!userEmail) {
  document.getElementById("ordersGrid").innerHTML = '<p class="empty-text">لم يتم تحديد مستخدم. الرجاء العودة إلى صفحة الطلبات.</p>';
  document.getElementById("userEmailHeader").innerText = "خطأ";
  document.getElementById("userSummary").innerText = "لم يتم تحديد البريد الإلكتروني";
} else {
  document.getElementById("userEmailHeader").innerText = userEmail;
  document.getElementById("userSummary").innerText = `جاري تحميل طلبات ${userEmail}...`;
  fetchUserOrders();
}
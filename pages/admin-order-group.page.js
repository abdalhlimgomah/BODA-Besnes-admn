const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORDER_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 120 120%27%3E%3Crect width=%27120%27 height=%27120%27 rx=%2714%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M60 32a14 14 0 110 28 14 14 0 010-28zm-24 46c0-10 8-18 18-18h12c10 0 18 8 18 18v8H36v-8z%27 fill=%27%2394a3b8%27/%3E%3C/svg%3E";

let groupOrders = [];

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

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

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

function getOrderStatus(order) {
  return String(order?.status || order?.order_status || "pending").trim();
}

function getOrderShipping(order) {
  return Number(order?.shipping_cost ?? order?.shipping_fee ?? order?.shipping ?? 0) || 0;
}

function getOrderCodFee(order) {
  return Number(order?.tax ?? order?.tax_amount ?? order?.cod_fee ?? order?.payment_fee ?? 0) || 0;
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

function computeTotals() {
  let subtotal = 0;
  let discount = 0;
  let shipping = 0;
  let cod = 0;
  let couponCode = "";

  groupOrders.forEach((order) => {
    extractOrderItems(order).forEach((item) => {
      subtotal += (Number(item?.price) || 0) * (Number(item?.quantity) || 1);
    });
    discount += Number(order?.discount ?? order?.discount_amount ?? 0) || 0;
    shipping = Math.max(shipping, getOrderShipping(order));
    cod = Math.max(cod, getOrderCodFee(order));
    if (!couponCode && order?.coupon_code) couponCode = String(order.coupon_code);
  });

  const total = Math.max(subtotal - discount + shipping + cod, 0);
  return { subtotal, discount, shipping, cod, couponCode, total };
}

// جلب المنتجات من taager_products للحصول على اسم الشركة (seller) والمصدر (source)
// العمودان المتاحان في الجدول: id (مثل taager_1998) و taager_product_id (مثل 1998)
async function enrichItemsWithTaagerProducts() {
  const itemList = [];
  groupOrders.forEach((order) => extractOrderItems(order).forEach((it) => itemList.push(it)));
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

// دمج بيانات order_items (مقاس / صورة / اسم) مع لقطات الطلب
async function mergeOrderItemsData() {
  const ids = groupOrders.map((o) => String(o.id || "")).filter(Boolean);
  if (!ids.length) return;

  const { data, error } = await supabaseClient
    .from("order_items")
    .select("*")
    .in("order_id", ids);

  if (error || !Array.isArray(data) || !data.length) return;

  groupOrders.forEach((order) => {
    const items = extractOrderItems(order);
    const linked = (data || []).filter((row) => String(row.order_id) === String(order.id));
    items.forEach((item) => {
      const candidates = [
        String(item?.product_id || item?.id || ""),
        String(item?.taager_product_id || ""),
      ].filter(Boolean);

      let match = null;
      for (const row of linked) {
        if (candidates.length && candidates.includes(String(row.product_id || ""))) {
          match = row;
          break;
        }
      }
      if (!match) match = linked.find((row) => !row.product_id) || null;
      if (!match) return;

      if (!item.selected_size && match.selected_size) item.selected_size = match.selected_size;
      if (!item.size && match.selected_size) item.size = match.selected_size;
      if (!item.name && match.product_name) item.name = match.product_name;
      if (!item.image && match.image) item.image = match.image;
    });
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
  return mapSourceToCountry(source, countryFromItem || countryFromOrder || firstCountry);
}

function renderInfoRows(rows) {
  return rows
    .map(([label, value, extraClass]) =>
      '<div class="info-row">'
      + '<span class="info-label">' + escapeAttr(label) + '</span>'
      + '<span class="info-value ' + (extraClass || "") + '">' + value + '</span>'
      + '</div>'
    )
    .join("");
}

function renderCustomerInfo() {
  const primary = groupOrders[0] || {};
  const email = String(primary.user_email || primary.email || primary.customer_email || "-");
  const address = String(primary.address || primary.customer_address || "-");
  const governorate = String(primary.governorate || primary.city || "");

  const rows = [
    ["الاسم", escapeAttr(primary.user_name || primary.name || "-")],
    ["الإيميل", `<span dir="ltr">${escapeAttr(email)}</span>`],
    ["الهاتف", `<span dir="ltr">${escapeAttr(primary.phone || "-")}</span>`],
    ["العنوان", escapeAttr(address)],
  ];
  if (governorate) rows.push(["المحافظة", escapeAttr(governorate)]);
  rows.push(["تاريخ الطلب", escapeAttr(formatDate(primary.created_at))]);
  document.getElementById("customerInfo").innerHTML = renderInfoRows(rows);
}

function renderPaymentInfo() {
  const totals = computeTotals();
  const primary = groupOrders[0] || {};

  const rows = [
    ["طريقة الدفع", escapeAttr(primary.payment_method || "-")],
    ["المنتجات (السلع)", String(totals.subtotal)],
    ["الشحن", String(totals.shipping)],
  ];
  if (totals.cod > 0) rows.push(["رسوم الدفع (COD)", String(totals.cod)]);
  if (totals.discount > 0) rows.push(["الخصم", '<span class="text-success">-' + totals.discount + '</span>']);
  if (totals.couponCode) rows.push(["كوبون", escapeAttr(totals.couponCode)]);
  rows.push(["الإجمالي النهائي", '<strong>' + totals.total + '</strong>']);

  const batchId = groupOrders[0]?.order_batch_id || "";
  if (batchId) rows.push(["معرف السلة", `<span dir="ltr" class="code-chip">${escapeAttr(batchId)}</span>`]);

  document.getElementById("paymentInfo").innerHTML = renderInfoRows(rows);
}

function renderProductsTable() {
  const rows = [];
  groupOrders.forEach((order) => {
    extractOrderItems(order).forEach((item) => {
      rows.push({ item, order });
    });
  });

  const countLabel = document.getElementById("productsCountLabel");
  if (countLabel) countLabel.textContent = String(rows.length);

  if (!rows.length) {
    document.getElementById("productsTable").innerHTML = '<p class="empty-text">لا توجد منتجات</p>';
    return;
  }

  const html = rows.map(({ item, order }, index) => {
    const img = normalizeImageSource(
      item.image || item.image_url || item.product_image || item.thumbnail || item.img ||
      (Array.isArray(item.images) ? item.images[0] : item.images) || ""
    ) || ORDER_IMAGE_PLACEHOLDER;
    const name = String(item.name || item.product_name || item.title || "منتج");
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price) || 0;
    const lineTotal = price * qty;
    const seller = getItemSeller(item);
    const countryCode = getItemCountry(item, order);
    const taagerId = extractTaagerId(item);
    const variant = parseTaagerVariantId(taagerId);
    const productNumber = stripVariantSuffix(String(item.taager_product_id || taagerId || ""));
    const rawId = stripVariantSuffix(String(item.id || item.product_id || ""));
    const sku = String(item.sku || item.code || "");
    let size = String(
      item.selected_size || item.selectedSize || item.size || item.variant_label || item.variant_name || variant.size || ""
    ).trim();
    if (/^(اللون|المقاس)/.test(size)) size = size.split(":")[1]?.trim() || size;
    const color = String(item.selected_color || item.selectedColor || item.color || variant.color || "").trim();

    const source = item.__taager?.source ? String(item.__taager.source) : "";

    const countryBadge = countryCode
      ? '<span class="country-badge country-' + countryCode.toLowerCase() + '">' + countryCode + '</span>'
      : '';

    return `
      <div class="product-row">
        <img class="product-img" src="${escapeAttr(img)}" alt="${escapeAttr(name)}" loading="lazy" onerror="this.onerror=null;this.src='${ORDER_IMAGE_PLACEHOLDER}'" />
        <div class="product-main">
          <div class="product-name-line">${escapeAttr(name)} ${countryBadge}</div>
          <div class="product-seller"><i class="fa-solid fa-store"></i> ${escapeAttr(seller)}</div>
          ${source ? '<div class="product-source"><i class="fa-solid fa-earth-americas"></i> المصدر: ' + escapeAttr(source) + '</div>' : ''}
          <div class="product-codes">
            ${productNumber ? '<span class="oid-code">رقم المنتج: ' + escapeAttr(productNumber) + '</span>' : ''}
            ${rawId ? '<span class="oid-code">معرف: ' + escapeAttr(rawId) + '</span>' : ''}
            ${sku ? '<span class="oid-code">SKU: ' + escapeAttr(sku) + '</span>' : ''}
          </div>
        </div>
        <div class="product-facts">
          ${color ? '<div class="pf-cell"><span>اللون</span><strong>' + escapeAttr(color) + '</strong></div>' : ''}
          ${size ? '<div class="pf-cell"><span>المقاس</span><strong>' + escapeAttr(size) + '</strong></div>' : ''}
          <div class="pf-cell"><span>الكمية</span><strong>${qty}</strong></div>
          <div class="pf-cell"><span>سعر الوحدة</span><strong>${price}</strong></div>
          <div class="pf-cell pf-total"><span>الإجمالي</span><strong>${lineTotal}</strong></div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("productsTable").innerHTML = html;
}

function renderSubOrders() {
  const list = document.getElementById("subOrdersList");
  const html = groupOrders.map((order) => {
    const id = String(order.id || "");
    const options = [
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
      '<option value="' + value + '"' + (getOrderStatus(order) === value ? " selected" : "") + '>' + label + '</option>'
    ).join("");

    return `
      <div class="suborder-row">
        <div class="suborder-id" dir="ltr">${escapeAttr(id)}</div>
        <div class="suborder-date">${escapeAttr(formatDate(order.created_at))}</div>
        <span class="status-pill ${statusClass(getOrderStatus(order))}">${statusLabel(getOrderStatus(order))}</span>
        <select id="sub_status_${id}" class="suborder-select">${options}</select>
        <button class="btn btn-secondary status-btn" onclick="changeSubOrderStatus('${id}')">تحديث</button>
      </div>
    `;
  }).join("");
  list.innerHTML = html || '<p class="empty-text">لا توجد أوامر فرعية</p>';
}

function renderPage() {
  if (!groupOrders.length) {
    document.getElementById("pageSummary").textContent = "لا توجد بيانات لهذه المجموعة";
    return;
  }

  const totals = computeTotals();
  const productsTotal = groupOrders.reduce(
    (sum, order) => sum + extractOrderItems(order).reduce((s, it) => s + (Number(it.quantity) || 1), 0),
    0
  );

  document.getElementById("groupSummary").style.display = "grid";
  document.getElementById("groupOrdersCount").textContent = String(groupOrders.length);
  document.getElementById("groupProductsCount").textContent = String(productsTotal);
  document.getElementById("groupTotalAmount").textContent = String(totals.total);

  const primary = groupOrders[0];
  document.getElementById("pageTitle").textContent =
    groupOrders.length > 1 ? `بيانات السلة (${groupOrders.length} أوامر معًا)` : "بيانات الطلب";
  document.getElementById("pageSummary").textContent =
    `${escapeAttr(primary.user_name || primary.name || "-")} - ${escapeAttr(primary.user_email || primary.email || "")}`;

  const backEmail = encodeURIComponent(primary.user_email || primary.email || "");
  document.getElementById("backLink").href = `admin-user-orders.html?email=${backEmail}`;

  renderCustomerInfo();
  renderPaymentInfo();
  renderProductsTable();
  renderSubOrders();
}

/* ── خصم الكميات من مخزون المنتج عند تسليم الطلب (وحدة موحدة مع سجل stock_change_log) ── */
async function deductOrderItemsStock(order) {
  try {
    await StockDeduction.deductForOrder(order, { sourcePage: "admin-order-group" });
  } catch (e) {
    console.warn("Stock deduction failed:", e && e.message);
  }
}

async function changeSubOrderStatus(orderId) {
  const select = document.getElementById(`sub_status_${orderId}`);
  if (!select) return;
  const newStatus = select.value;
  const order = groupOrders.find((o) => String(o.id) === String(orderId));
  const wasDelivered = order ? getOrderStatus(order) === "delivered" : false;
  const { error } = await supabaseClient.from("orders").update({ status: newStatus }).eq("id", orderId);
  if (error) {
    console.error(error);
    showToast("حدث خطأ أثناء تحديث الحالة", "error");
    return;
  }
  if (newStatus === "delivered" && !wasDelivered && order) {
    await deductOrderItemsStock(order);
  }
  showToast("تم تحديث حالة الطلب بنجاح", "success");
  loadOrders();
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  const ids = (params.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const batch = (params.get("batch") || "").trim();
  const email = (params.get("email") || "").trim();
  return { ids, batch, email };
}

async function loadOrders() {
  const { ids, batch, email } = getParams();
  let query = supabaseClient.from("orders").select("*").order("created_at", { ascending: false });

  if (ids.length) {
    query = query.in("id", ids);
  } else if (batch) {
    query = query.eq("order_batch_id", batch);
  } else if (email) {
    const { data: allData, error: allError } = await supabaseClient.from("orders").select("*").order("created_at", { ascending: false });
    if (!allError && Array.isArray(allData)) {
      const target = String(email).trim().toLowerCase();
      groupOrders = allData.filter((o) => String(o.user_email || o.email || o.customer_email || "").trim().toLowerCase() === target);
    } else {
      console.error(allError);
      showToast("تعذر تحميل الطلبات", "error");
      return;
    }
  } else {
    document.getElementById("pageSummary").textContent = "لم يتم تحديد سلة. الرجاء العودة إلى صفحة الطلبات.";
    return;
  }

  if (ids.length || batch) {
    const { data, error } = await query;
    if (error) {
      console.error(error);
      showToast("تعذر تحميل الطلبات", "error");
      return;
    }
    groupOrders = Array.isArray(data) ? data : [];
  }

  extractItemsCache.clear();

  try {
    await enrichItemsWithTaagerProducts();
    await mergeOrderItemsData();
  } catch (e) {
    console.warn("enrichment failed", e);
  }
  renderPage();
}

window.changeSubOrderStatus = changeSubOrderStatus;

loadOrders();
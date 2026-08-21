const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORDER_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 120 120%27%3E%3Crect width=%27120%27 height=%27120%27 rx=%2714%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M60 32a14 14 0 110 28 14 14 0 010-28zm-24 46c0-10 8-18 18-18h12c10 0 18 8 18 18v8H36v-8z%27 fill=%27%2394a3b8%27/%3E%3C/svg%3E";

let allOrders = [];

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

function normalizeText(value) {
  return String(value ?? "").trim();
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

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toOrderId(value) {
  return String(value ?? "").trim();
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
  const emailA = getOrderEmail(a);
  const emailB = getOrderEmail(b);
  if (!emailA || emailA !== emailB) return false;
  if (getOrderPhone(a) !== getOrderPhone(b)) return false;
  if (getOrderStatus(a) !== getOrderStatus(b)) return false;
  const diff = Math.abs(parseOrderTime(a) - parseOrderTime(b));
  return diff <= LEGACY_BATCH_WINDOW_MS;
}

// تقسّم الطلبات إلى مجموعات: كل مجموعة = طلبات صدرت من نفس السلة (نفس صفحة الدفع)
function buildBatches(orders) {
  const list = Array.isArray(orders) ? [...orders] : [];
  const batches = [];
  const used = new Set();

  for (const order of list) {
    const orderId = toOrderId(order?.id);
    if (!orderId || used.has(orderId)) continue;

    const groupOrders = [order];
    used.add(orderId);
    const batchId = String(order?.order_batch_id || "").trim();

    for (const other of list) {
      const otherId = toOrderId(other?.id);
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
    for (const payload of [order.items_snapshot, order.items_json, order.items, order.order_items, order.type]) {
      const entries = normalizeToArray(payload);
      entries.forEach((item) => {
        subtotal += (Number(item?.price) || 0) * (Number(item?.quantity) || 1);
      });
    }
    discount += Number(order?.discount ?? order?.discount_amount ?? 0) || 0;
    shipping = Math.max(shipping, getOrderShipping(order));
    cod = Math.max(cod, getOrderCodFee(order));
    if (!couponCode && order?.coupon_code) couponCode = String(order.coupon_code);
  });

  const total = Math.max(subtotal - discount + shipping + cod, 0);
  return { subtotal, discount, shipping, cod, couponCode, total, ordersCount: orders.length };
}

function extractOrderItems(order) {
  for (const payload of [order.items_snapshot, order.items_json, order.items, order.order_items, order.type]) {
    const items = normalizeToArray(payload);
    if (items.length) return items;
  }
  return [];
}

function totalItemsCount(batch) {
  const orders = batch?.orders || [];
  return orders.reduce((sum, order) => {
    return sum + extractOrderItems(order).reduce((s, item) => s + (Number(item?.quantity) || 1), 0);
  }, 0);
}

function normalizeImageSource(value) {
  const source = normalizeText(value);
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

function normalizeToArray(value) {
  if (!value) return [];
  const parsed = parseJsonSafe(value);
  const data = parsed ?? value;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function extractImageFromMetadata(metadata) {
  const meta = parseJsonSafe(metadata);
  if (!meta || typeof meta !== "object") return "";

  const images = Array.isArray(meta.images) ? meta.images : [];
  const candidates = [
    meta.image,
    meta.image_url,
    meta.product_image,
    meta.thumbnail,
    meta.img,
    images[0],
    meta.product?.image,
    meta.product?.image_url,
  ];

  for (const candidate of candidates) {
    const value = normalizeImageSource(candidate);
    if (value) return value;
  }
  return "";
}

function extractImageFromOrderItem(item) {
  if (!item || typeof item !== "object") return "";

  const candidates = [
    item.image,
    item.image_url,
    item.product_image,
    item.thumbnail,
    item.img,
    extractImageFromMetadata(item.metadata),
  ];

  for (const candidate of candidates) {
    const value = normalizeImageSource(candidate);
    if (value) return value;
  }
  return "";
}

function extractProductNameFromOrder(order) {
  if (!order || typeof order !== "object") return "";

  const directName = normalizeText(order.product_name || order.productName);
  if (directName) return directName;

  const payloadFields = [order.items_json, order.items, order.order_items, order.items_snapshot, order.type];
  for (const payload of payloadFields) {
    const entries = normalizeToArray(payload);
    if (entries.length > 0) {
      const firstEntry = entries[0];
      if (firstEntry && typeof firstEntry === "object") {
        const name = normalizeText(firstEntry.name || firstEntry.product_name || firstEntry.title || firstEntry.productName);
        if (name) return name;
      }
    }
  }

  return "";
}

function toggleProductName(btn) {
  const wrap = btn.parentNode;
  const fullEl = wrap.querySelector(".product-name-full");
  const shortEl = wrap.querySelector(".product-name-short");
  if (fullEl.classList.contains("hidden")) {
    fullEl.classList.remove("hidden");
    shortEl.classList.add("hidden");
    btn.textContent = "عرض أقل";
  } else {
    fullEl.classList.add("hidden");
    shortEl.classList.remove("hidden");
    btn.textContent = "عرض المزيد";
  }
}

function extractImageFromOrder(order) {
  if (!order || typeof order !== "object") return "";

  const direct = extractImageFromOrderItem(order);
  if (direct) return direct;

  const payloadFields = [
    order.items_snapshot,
    order.items_json,
    order.items,
    order.order_items,
    order.type,
    order.metadata,
  ];

  for (const payload of payloadFields) {
    const entries = normalizeToArray(payload);
    for (const entry of entries) {
      const entryImage = extractImageFromOrderItem(entry);
      if (entryImage) return entryImage;

      const nestedProductImage = extractImageFromOrderItem(entry?.product);
      if (nestedProductImage) return nestedProductImage;
    }
  }

  return "";
}

function extractFirstProductIdFromOrder(order) {
  if (!order || typeof order !== "object") return "";

  const direct = normalizeText(order.product_id || order.productId || order.id_product);
  if (direct) return direct;

  const payloadFields = [order.items_snapshot, order.items_json, order.items, order.order_items, order.type];
  for (const payload of payloadFields) {
    const entries = normalizeToArray(payload);
    for (const entry of entries) {
      const pid = normalizeText(entry?.product_id || entry?.productId || entry?.id);
      if (pid) return pid;
      const nestedPid = normalizeText(entry?.product?.id || entry?.product?.product_id);
      if (nestedPid) return nestedPid;
    }
  }

  return "";
}

function extractImageFromProductRecord(product) {
  if (!product || typeof product !== "object") return "";

  const links = normalizeToArray(product.extra_links);
  const candidates = [
    product.image,
    product.image_url,
    product.product_image,
    product.thumbnail,
    product.img,
    product.img1,
    product.image1,
    product.image2,
    product.image3,
    product.image4,
    product.image5,
    links[0],
  ];

  for (const candidate of candidates) {
    const image = normalizeImageSource(candidate);
    if (image) return image;
  }
  return "";
}

async function fetchProductImageMap(productIds) {
  const ids = [...new Set((productIds || []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!ids.length) return new Map();

  const imageMap = new Map();
  let productsData = null;

  const primary = await supabaseClient.from("products").select("id,image").in("id", ids);
  if (!primary.error && Array.isArray(primary.data)) {
    productsData = primary.data;
  } else {
    const fallback = await supabaseClient.from("products").select("*").in("id", ids);
    if (!fallback.error && Array.isArray(fallback.data)) {
      productsData = fallback.data;
    } else {
      console.warn("Failed to fetch products for order images:", fallback.error || primary.error);
      return imageMap;
    }
  }

  productsData.forEach((product) => {
    const id = String(product?.id ?? "").trim();
    const image = extractImageFromProductRecord(product);
    if (id && image) imageMap.set(id, image);
  });

  return imageMap;
}

async function buildOrderImageMap(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const orderIds = list.map((order) => toOrderId(order?.id)).filter(Boolean);
  if (!orderIds.length) return new Map();

  const imageMap = new Map();
  const firstItemByOrder = new Map();
  const productIdByOrder = new Map();

  list.forEach((order) => {
    const orderId = toOrderId(order?.id);
    if (!orderId) return;

    const orderImage = extractImageFromOrder(order);
    if (orderImage) {
      imageMap.set(orderId, orderImage);
      return;
    }

    const fallbackProductId = extractFirstProductIdFromOrder(order);
    if (fallbackProductId) {
      productIdByOrder.set(orderId, fallbackProductId);
    }
  });

  const orderIdsMissingImage = orderIds.filter((orderId) => !imageMap.has(orderId));
  if (!orderIdsMissingImage.length) return imageMap;

  const { data: itemsData, error: itemsError } = await supabaseClient
    .from("order_items")
    .select("*")
    .in("order_id", orderIdsMissingImage)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.warn("Failed to fetch order_items:", itemsError);
  }

  const items = Array.isArray(itemsData) ? itemsData : [];
  items.forEach((item) => {
    const orderId = toOrderId(item?.order_id);
    if (!orderId || imageMap.has(orderId) || firstItemByOrder.has(orderId)) return;
    firstItemByOrder.set(orderId, item);
  });

  const productIdsForFallback = [];

  firstItemByOrder.forEach((item, orderId) => {
    const directImage = extractImageFromOrderItem(item);
    if (directImage) {
      imageMap.set(orderId, directImage);
      return;
    }

    const productId = String(item?.product_id ?? "").trim();
    if (productId) productIdsForFallback.push(productId);
  });

  productIdByOrder.forEach((productId, orderId) => {
    if (!imageMap.has(orderId) && productId) {
      productIdsForFallback.push(productId);
    }
  });

  if (productIdsForFallback.length) {
    const productImageMap = await fetchProductImageMap(productIdsForFallback);
    firstItemByOrder.forEach((item, orderId) => {
      if (imageMap.has(orderId)) return;
      const productId = String(item?.product_id ?? "").trim();
      const productImage = productId ? normalizeImageSource(productImageMap.get(productId)) : "";
      if (productImage) imageMap.set(orderId, productImage);
    });

    productIdByOrder.forEach((productId, orderId) => {
      if (imageMap.has(orderId)) return;
      const productImage = normalizeImageSource(productImageMap.get(productId));
      if (productImage) imageMap.set(orderId, productImage);
    });
  }

  return imageMap;
}

function updateHeaderCounters(ordersList) {
  document.getElementById("ordersCount").innerText = `${ordersList.length} طلب`;
  const todayDate = new Date().toDateString();
  const todayOrders = allOrders.filter((order) => new Date(order.created_at).toDateString() === todayDate);
  document.getElementById("todayOrders").innerText = `${todayOrders.length} طلب`;
}

function currentFilters() {
  return {
    query: document.getElementById("searchInput").value.trim().toLowerCase(),
    status: document.getElementById("statusFilter").value,
  };
}

function applyFilters() {
  const { query, status } = currentFilters();
  let filtered = [...allOrders];

  if (query) {
    filtered = filtered.filter((order) => {
      const name = (order.user_name || "").toLowerCase();
      const phone = (order.phone || "").toLowerCase();
      const prod = (order.product_name || "").toLowerCase();
      const email = getOrderEmail(order).toLowerCase();
      return name.includes(query) || phone.includes(query) || prod.includes(query) || email.includes(query);
    });
  }

  if (status !== "all") {
    filtered = filtered.filter((order) => order.status === status);
  }

  updateHeaderCounters(filtered);
  renderOrders(filtered);
}

function renderOrders(orders) {
  const grid = document.getElementById("ordersGrid");
  if (!orders.length) {
    grid.innerHTML = '<p class="empty-text">لا توجد طلبات مطابقة</p>';
    return;
  }

  const grouped = {};
  orders.forEach(order => {
    const email = getOrderEmail(order) || "غير معروف";
    if (!grouped[email]) {
      grouped[email] = { email: order.user_email || order.email || order.customer_email || "غير معروف", name: order.user_name || "", orders: [] };
    }
    grouped[email].orders.push(order);
  });

  const entries = Object.values(grouped);
  entries.sort((a, b) => b.orders.length - a.orders.length);

  grid.innerHTML = entries.map(entry => {
    const firstLetter = (entry.email || "?").charAt(0).toUpperCase();
    const count = entry.orders.length;
    const encodedEmail = encodeURIComponent(entry.email);
    const latestOrder = entry.orders[0];
    const latestDate = formatDate(latestOrder?.created_at);
    var latestImage = normalizeImageSource(latestOrder?.product_image) || "";

    const batches = buildBatches(entry.orders);
    const multiBatchCount = batches.filter((b) => b.orders.length > 1).length;
    const ordersInMultiBatches = batches.reduce((s, b) => s + (b.orders.length > 1 ? b.orders.length : 0), 0);
    var totalSpent = batches.reduce(function (s, b) { return s + computeBatchTotals(b).total; }, 0);
    const multiBadge = multiBatchCount > 0
      ? `<span class="multi-batch-badge"><i class="fa-solid fa-cart-plus"></i> ${ordersInMultiBatches} طلب من سلة مشتركة (${multiBatchCount} مجموعة)</span>`
      : "";
    // عدّ لعدد الطلبات في كل حالة (تم التسليم / جارٍ التجهيز / تم الشحن ...)
    const statusCounts = {};
    entry.orders.forEach((o) => {
      const st = getOrderStatus(o);
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });
    const statusOrder = ["review", "pending", "confirmed", "preparing", "shipped", "delivered", "onhold", "cancelled", "returned"];
    const statusCountsHtml = statusOrder
      .filter((s) => (statusCounts[s] || 0) > 0 || s === "review" || s === "preparing")
      .map((s) =>
        '<span class="status-count-pill ' + statusClass(s) + '"><i class="fa-solid fa-circle"></i> ' + (statusCounts[s] || 0) + ' ' + statusLabel(s) + '</span>'
      )
      .join("");
    return `
      <article class="user-card" onclick="goToUserOrders('${encodedEmail}')">
        <div class="user-count-badge">${count}</div>
        <div class="user-row">
          ${latestImage ? '<div class="user-thumb"><img src="' + escapeAttr(latestImage) + '" alt="" onerror="this.onerror=null;this.parentElement.classList.add(\'user-thumb-fallback\')" /></div>' : '<div class="user-avatar">' + escapeAttr(firstLetter) + '</div>'}
          <div class="user-details">
            <span class="user-email">${escapeAttr(entry.email)}</span>
            ${entry.name ? `<span class="user-name">${escapeAttr(entry.name)}</span>` : ''}
            <span class="user-latest">آخر طلب: ${latestDate}</span>
            <span class="user-total">الإجمالي: ${totalSpent}</span>
            ${statusCountsHtml ? `<div class="user-status-counts">${statusCountsHtml}</div>` : ''}
            ${multiBadge}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function goToUserOrders(email) {
  window.location.href = `admin-user-orders.html?email=${email}`;
}

async function fetchOrders(showErrorToast = false) {
  const { data, error } = await supabaseClient.from("orders").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    if (showErrorToast) showToast("تعذر تحميل الطلبات", "error");
    return;
  }

  const fetchedOrders = Array.isArray(data) ? data : [];
  const orderImageMap = await buildOrderImageMap(fetchedOrders);
  allOrders = fetchedOrders.map((order) => {
    const orderId = toOrderId(order?.id);
    const productImage = normalizeImageSource(orderImageMap.get(orderId)) || ORDER_IMAGE_PLACEHOLDER;
    const productName = extractProductNameFromOrder(order);
    return { ...order, product_image: productImage, product_name: productName };
  });
  applyFilters();
}

/* ── خصم الكميات من مخزون المنتج عند تسليم الطلب (وحدة موحدة مع سجل stock_change_log) ── */
async function deductOrderItemsStock(order) {
  try {
    await StockDeduction.deductForOrder(order, { sourcePage: "admin-orders" });
  } catch (e) {
    console.warn("Stock deduction failed:", e && e.message);
  }
}

async function changeStatus(id) {
  const select = document.getElementById(`status_select_${id}`);
  if (!select) return;

  const newStatus = select.value;
  const order = allOrders.find((o) => String(o.id) === String(id));
  const wasDelivered = order ? getOrderStatus(order) === "delivered" : false;

  const { error } = await supabaseClient.from("orders").update({ status: newStatus }).eq("id", id);
  if (error) {
    console.error(error);
    showToast("حدث خطأ أثناء تحديث الحالة", "error");
    return;
  }

  if (newStatus === "delivered" && !wasDelivered && order) {
    await deductOrderItemsStock(order);
  }

  showToast("تم تحديث حالة الطلب", "success");
  fetchOrders();
}

document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("searchBtn").addEventListener("click", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);

window.changeStatus = changeStatus;
window.toggleProductName = toggleProductName;

fetchOrders(true);
setInterval(fetchOrders, 30000);

const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORDER_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='14' fill='%23f3f4f6'/%3E%3Cpath d='M60 32a14 14 0 110 28 14 14 0 010-28zm-24 46c0-10 8-18 18-18h12c10 0 18 8 18 18v8H36v-8z' fill='%2394a3b8'/%3E%3C/svg%3E";

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
    preparing: "جارٍ التجهيز",
    shipped: "تم الشحن",
    delivered: "تم التسليم",
  };
  return labels[status] || status || "-";
}

function statusClass(status) {
  return {
    pending: "status-pending",
    preparing: "status-preparing",
    shipped: "status-shipped",
    delivered: "status-delivered",
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
  const todayOrders = ordersList.filter((order) => new Date(order.created_at).toDateString() === todayDate);
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
      return name.includes(query) || phone.includes(query);
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

  grid.innerHTML = orders
    .map(
      (order) => `
      <article class="order-card">
        <div class="order-head">
          <p class="order-name">${order.user_name || "-"}</p>
          <span class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</span>
        </div>
        <div class="order-product-preview">
          <img
            class="order-product-image"
            src="${escapeAttr(order.product_image || ORDER_IMAGE_PLACEHOLDER)}"
            alt="Product image"
            loading="lazy"
            onerror="this.onerror=null;this.src='${ORDER_IMAGE_PLACEHOLDER}'"
          />
        </div>
        <div class="order-grid">
          <div class="order-row"><strong>الهاتف</strong><span>${order.phone || "-"}</span></div>
          <div class="order-row"><strong>الإيميل</strong><span>${order.email || "-"}</span></div>
          <div class="order-row"><strong>العنوان</strong><span>${order.address || "-"}</span></div>
          <div class="order-row"><strong>السعر</strong><span>${order.total_price || 0}</span></div>
          <div class="order-row"><strong>التاريخ</strong><span>${formatDate(order.created_at)}</span></div>
        </div>
        <div class="status-control-row">
          <select id="status_select_${order.id}">
            <option value="pending" ${order.status === "pending" ? "selected" : ""}>قيد الانتظار</option>
            <option value="preparing" ${order.status === "preparing" ? "selected" : ""}>جارٍ التجهيز</option>
            <option value="shipped" ${order.status === "shipped" ? "selected" : ""}>تم الشحن</option>
            <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>تم التسليم</option>
          </select>
          <button class="btn btn-secondary status-btn" onclick="changeStatus('${order.id}')">تحديث</button>
        </div>
      </article>`
    )
    .join("");
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
    return { ...order, product_image: productImage };
  });
  applyFilters();
}

async function changeStatus(id) {
  const select = document.getElementById(`status_select_${id}`);
  if (!select) return;

  const newStatus = select.value;
  const { error } = await supabaseClient.from("orders").update({ status: newStatus }).eq("id", id);
  if (error) {
    console.error(error);
    showToast("حدث خطأ أثناء تحديث الحالة", "error");
    return;
  }

  showToast("تم تحديث حالة الطلب", "success");
  fetchOrders();
}

document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("searchBtn").addEventListener("click", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);

window.changeStatus = changeStatus;

fetchOrders(true);
setInterval(fetchOrders, 4000);

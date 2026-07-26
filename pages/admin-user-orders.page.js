const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORDER_IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 120 120%27%3E%3Crect width=%27120%27 height=%27120%27 rx=%2714%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M60 32a14 14 0 110 28 14 14 0 010-28zm-24 46c0-10 8-18 18-18h12c10 0 18 8 18 18v8H36v-8z%27 fill=%27%2394a3b8%27/%3E%3C/svg%3E";

function extractTaagerId(item) {
  if (item.taager_product_id) return item.taager_product_id;
  var id = String(item.id || item.product_id || "");
  if (id.startsWith("taager_")) return id.slice(7);
  return "";
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

function getFilteredOrders() {
  const status = document.getElementById("statusFilter").value;
  if (status === "all") return userOrders;
  return userOrders.filter(order => order.status === status);
}

function extractOrderItems(order) {
  const payloadFields = [order.items_json, order.items, order.order_items, order.items_snapshot, order.type];
  for (const payload of payloadFields) {
    const items = normalizeToArray(payload);
    if (items.length) return items;
  }
  return [];
}

function getItemCountry(item, order) {
  var c = item.country || item.country_code || order.country || order.country_code || "";
  return c.toUpperCase();
}

function renderOrderItems(items, order) {
  if (!items || !items.length) return '<div class="order-row"><strong>المنتجات</strong><span>-</span></div>';
  var orderDiscount = order && Number(order.discount) > 0 ? Number(order.discount) : 0;
  var subtotal = items.reduce(function(s, it) {
    return s + (Number(it.price) || 0) * (Number(it.quantity) || 1);
  }, 0);
  var html = items.map(function(item) {
    var img = normalizeImageSource(
      item.image || item.image_url || item.product_image || item.thumbnail || item.img ||
      (Array.isArray(item.images) ? item.images[0] : item.images) || ""
    ) || ORDER_IMAGE_PLACEHOLDER;
    var name = item.name || item.product_name || item.title || "منتج";
    var qty = Number(item.quantity) || 1;
    var price = Number(item.price) || 0;
    var total = price * qty;
    var taagerId = extractTaagerId(item);
    var sku = item.sku || item.code || "";
    var itemDiscount = orderDiscount > 0 && subtotal > 0
      ? Math.round((total / subtotal) * orderDiscount)
      : 0;
    var countryCode = getItemCountry(item, order);
    var countryBadge = countryCode
      ? '<span class="country-badge country-' + countryCode.toLowerCase() + '">' + countryCode + '</span>'
      : '';
    return '<div class="order-item-row">'
      + '<img class="order-item-img" src="' + escapeAttr(img) + '" alt="' + escapeAttr(name) + '" loading="lazy" onerror="this.onerror=null;this.src=\'' + ORDER_IMAGE_PLACEHOLDER + '\'" />'
      + '<div class="order-item-info">'
      + '<div class="order-item-name">' + escapeAttr(name.length > 35 ? name.slice(0, 35) + "…" : name) + countryBadge + '</div>'
      + '<div class="order-item-details">'
      + '<span class="oid-label">السعر:</span><span class="oid-value">' + price + '</span>'
      + '<span class="oid-label">الكمية:</span><span class="oid-value">' + qty + '</span>'
      + '<span class="oid-label">الإجمالي:</span><span class="oid-value oid-total">' + total + '</span>'
      + (itemDiscount > 0 ? '<span class="oid-label">الخصم:</span><span class="oid-value oid-discount">-' + itemDiscount + '</span>' : '')
      + '</div>'
      + (taagerId || sku ? '<div class="order-item-codes">' : '')
      + (taagerId ? '<span class="oid-code">تاجر: ' + escapeAttr(taagerId) + '</span>' : '')
      + (sku ? '<span class="oid-code">كود: ' + escapeAttr(sku) + '</span>' : '')
      + (taagerId || sku ? '</div>' : '')
      + '</div>'
      + '</div>';
  }).join("");
  if (orderDiscount > 0) {
    html += '<div class="order-discount-summary">'
      + '<span>إجمالي الخصم: <strong>' + orderDiscount + '</strong></span>'
      + (order.coupon_code ? '<span class="oid-code">كود: ' + escapeAttr(order.coupon_code) + '</span>' : '')
      + '</div>';
  }
  return html;
}

function renderOrders() {
  const filtered = getFilteredOrders();
  const grid = document.getElementById("ordersGrid");
  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-text">لا توجد طلبات مطابقة</p>';
    return;
  }

  grid.innerHTML = filtered.map(order => {
    const items = extractOrderItems(order);
    return `
      <article class="order-card">
        <div class="order-head">
          <p class="order-name">${escapeAttr(order.user_name || "-")}</p>
          <span class="status-pill ${statusClass(order.status)}">${statusLabel(order.status)}</span>
        </div>
        <div class="order-items-list">${renderOrderItems(items, order)}</div>
        <div class="order-grid">
          <div class="order-row"><strong>الهاتف</strong><span>${escapeAttr(order.phone || "-")}</span></div>
          <div class="order-row"><strong>الإيميل</strong><span>${escapeAttr(order.email || "-")}</span></div>
          <div class="order-row"><strong>العنوان</strong><span>${escapeAttr(order.address || "-")}</span></div>
          <div class="order-row"><strong>السعر</strong><span>${order.total_price || 0}</span></div>
          ${order.discount && Number(order.discount) > 0 ? '<div class="order-row"><strong>الخصم</strong><span style="color:#16a34a;">-' + order.discount + '</span></div>' : ''}
          ${order.coupon_code ? '<div class="order-row"><strong>كوبون</strong><span>' + escapeAttr(order.coupon_code) + '</span></div>' : ''}
          <div class="order-row"><strong>التاريخ</strong><span>${formatDate(order.created_at)}</span></div>
        </div>
        <div class="status-control-row">
          <select id="status_select_${order.id}">
            <option value="pending" ${order.status === "pending" ? "selected" : ""}>قيد الانتظار</option>
            <option value="review" ${order.status === "review" ? "selected" : ""}>قيد المراجعة</option>
            <option value="confirmed" ${order.status === "confirmed" ? "selected" : ""}>تم التأكيد</option>
            <option value="preparing" ${order.status === "preparing" ? "selected" : ""}>جارٍ التجهيز</option>
            <option value="shipped" ${order.status === "shipped" ? "selected" : ""}>تم الشحن</option>
            <option value="delivered" ${order.status === "delivered" ? "selected" : ""}>تم التسليم</option>
            <option value="onhold" ${order.status === "onhold" ? "selected" : ""}>معلق مؤقتًا</option>
            <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>ملغي</option>
            <option value="returned" ${order.status === "returned" ? "selected" : ""}>مرتجع</option>
          </select>
          <button class="btn btn-secondary status-btn" onclick="changeStatus('${order.id}')">تحديث</button>
        </div>
      </article>
    `;
  }).join("");
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
  fetchUserOrders();
}

async function fetchUserOrders() {
  if (!userEmail) return;
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .eq("email", userEmail)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    showToast("تعذر تحميل الطلبات", "error");
    return;
  }

  userOrders = Array.isArray(data) ? data : [];
  updateSummary();
  renderOrders();
}

function updateSummary() {
  const filtered = getFilteredOrders();
  const isFiltered = document.getElementById("statusFilter").value !== "all";
  document.getElementById("userOrdersCount").innerText = isFiltered
    ? `${filtered.length} من ${userOrders.length} طلب`
    : `${userOrders.length} طلب`;
  const total = filtered.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
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

window.changeStatus = changeStatus;

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

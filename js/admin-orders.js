const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  allOrders = data || [];
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

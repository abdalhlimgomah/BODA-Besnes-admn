/* ── صفحة حركات المخزون: عرض سجل stock_change_log ── */
const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 120 120%27%3E%3Crect width=%27120%27 height=%27120%27 rx=%2714%27 fill=%27%23f3f4f6%27/%3E%3Cpath d=%27M60 32a14 14 0 110 28 14 14 0 010-28zm-24 46c0-10 8-18 18-18h12c10 0 18 8 18 18v8H36v-8z%27 fill=%27%2394a3b8%27/%3E%3C/svg%3E";

let allLogs = [];
const filters = { q: "", status: "all", period: "today" };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusBadge(status) {
  const map = {
    success: '<span class="badge-status badge-success"><i class="fa-solid fa-check"></i> ناجحة</span>',
    partial: '<span class="badge-status badge-partial"><i class="fa-solid fa-triangle-exclamation"></i> جزئية</span>',
    error: '<span class="badge-status badge-error"><i class="fa-solid fa-xmark"></i> خطأ</span>',
  };
  return map[status] || map.error;
}

function normalizeImage(value) {
  const v = String(value || "").trim();
  if (!v) return IMAGE_PLACEHOLDER;
  if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:")) return v;
  if (v.startsWith("/storage/v1/object/public/")) return SUPABASE_URL + v;
  if (v.startsWith("storage/v1/object/public/")) return `${SUPABASE_URL}/${v}`;
  if (v.startsWith("product-images/")) return `${SUPABASE_URL}/storage/v1/object/public/${v}`;
  return IMAGE_PLACEHOLDER;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getFilteredLogs() {
  const q = filters.q.trim().toLowerCase();
  let since = null;
  if (filters.period === "today") since = startOfToday();
  else if (filters.period !== "all") {
    since = new Date();
    since.setDate(since.getDate() - Number(filters.period));
    since.setHours(0, 0, 0, 0);
  }
  return allLogs.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (since && new Date(row.created_at) < since) return false;
    if (q) {
      const hay = [row.product_name, row.product_id, row.order_id, row.customer_name]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderStats() {
  const today = startOfToday();
  const todayRows = allLogs.filter((r) => new Date(r.created_at) >= today);
  document.getElementById("todayCount").textContent = todayRows.length;
  document.getElementById("todayQty").textContent = todayRows.reduce((s, r) => s + (Number(r.qty_deducted) || 0), 0);
  document.getElementById("totalCount").textContent = allLogs.length;
  document.getElementById("errorCount").textContent = allLogs.filter((r) => r.status === "error").length;
}

function renderTable() {
  const rows = getFilteredLogs();
  const body = document.getElementById("logBody");
  const empty = document.getElementById("emptyState");
  empty.hidden = rows.length > 0;

  body.innerHTML = rows
    .map((row) => {
      const img = normalizeImage(row.product_image);
      const name = escapeHtml(row.product_name || row.product_id || "-");
      const delta =
        row.old_stock === null || row.old_stock === undefined
          ? "-"
          : `${Number(row.old_stock)} ← ${Number(row.new_stock)}`;
      const target = escapeHtml(String(row.target_table || "").replace(/,/g, " + ") || "-");
      const source = escapeHtml(row.source_page || "-");
      const errMsg = row.error_message ? `<div class="stock-error-msg" title="${escapeHtml(row.error_message)}">${escapeHtml(row.error_message)}</div>` : "";
      return `
        <tr>
          <td>${formatDateTime(row.created_at)}</td>
          <td>
            <div class="stock-product-cell">
              <img src="${img}" alt="" loading="lazy" onerror="this.src='${IMAGE_PLACEHOLDER}'" />
              <span class="stock-product-name" title="${name}">${name}</span>
            </div>
          </td>
          <td><strong>${Number(row.qty_deducted) || 0}</strong></td>
          <td><span class="stock-delta">${escapeHtml(delta)}</span></td>
          <td>${escapeHtml(row.order_id || "-")}</td>
          <td>${escapeHtml(row.customer_name || "-")}</td>
          <td>${target}</td>
          <td>${statusBadge(row.status)}${errMsg}</td>
          <td>${source}</td>
        </tr>`;
    })
    .join("");
}

async function fetchLogs(showErrorToast = false) {
  const btn = document.getElementById("refreshBtn");
  if (btn) btn.classList.add("refresh-btn-spin");
  try {
    const { data, error } = await supabaseClient
      .from("stock_change_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    allLogs = Array.isArray(data) ? data : [];
    renderStats();
    renderTable();
  } catch (e) {
    console.error(e);
    if (showErrorToast) alert("تعذر تحميل سجل حركات المخزون: " + (e.message || ""));
  } finally {
    if (btn) btn.classList.remove("refresh-btn-spin");
  }
}

document.getElementById("searchInput").addEventListener("input", (e) => {
  filters.q = e.target.value;
  renderTable();
});
document.getElementById("searchBtn").addEventListener("click", () => {
  filters.q = document.getElementById("searchInput").value;
  renderTable();
});
document.getElementById("statusFilter").addEventListener("change", (e) => {
  filters.status = e.target.value;
  renderTable();
});
document.getElementById("periodFilter").addEventListener("change", (e) => {
  filters.period = e.target.value;
  renderTable();
});
document.getElementById("refreshBtn").addEventListener("click", () => fetchLogs(false));

fetchLogs(true);
setInterval(() => fetchLogs(false), 30000);

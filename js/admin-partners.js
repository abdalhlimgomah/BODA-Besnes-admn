const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allApplications = [];

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
  }, 2200);
}

function statusClass(status) {
  return {
    approved: "status-approved",
    rejected: "status-rejected",
    pending: "status-pending",
  }[status] || "status-pending";
}

function statusLabel(status) {
  return {
    approved: "مقبول",
    rejected: "مرفوض",
    pending: "قيد الانتظار",
  }[status] || status || "-";
}

function formatDate(dateString) {
  if (!dateString) return "غير متوفر";
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return "غير متوفر";
  return value.toLocaleString("ar-EG");
}

function nowClock() {
  return new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function filterApplications() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;

  let filtered = [...allApplications];
  if (query) {
    filtered = filtered.filter((app) => {
      const owner = (app.owner_name || "").toLowerCase();
      const email = (app.owner_email || "").toLowerCase();
      const phone = (app.owner_phone || "").toLowerCase();
      const store = (app.store_name || "").toLowerCase();
      return owner.includes(query) || email.includes(query) || phone.includes(query) || store.includes(query);
    });
  }

  if (status !== "all") {
    filtered = filtered.filter((app) => (app.status || "pending") === status);
  }

  renderApplications(filtered);
}

function cardSection(title, items) {
  return `
    <details>
      <summary>${title}</summary>
      <div class="kv-list">
        ${items
          .map(
            (item) => `
              <div class="kv-item"><strong>${item.label}:</strong> ${item.value || "-"}</div>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderApplications(applications) {
  const container = document.getElementById("applications");
  if (!applications.length) {
    container.innerHTML = '<div class="empty-state">لا توجد طلبات مطابقة</div>';
    return;
  }

  container.innerHTML = applications
    .map((app) => {
      const currentStatus = app.status || "pending";
      return `
        <article class="partner-card">
          <div class="partner-head">
            <div>
              <strong>${app.store_name || "متجر بدون اسم"}</strong>
              <p class="partner-meta">تاريخ التقديم: ${formatDate(app.created_at)}</p>
            </div>
            <span class="status-pill ${statusClass(currentStatus)}">${statusLabel(currentStatus)}</span>
          </div>
          <div class="partner-content">
            ${cardSection("معلومات المالك", [
              { label: "الاسم", value: app.owner_name },
              { label: "البريد", value: app.owner_email },
              { label: "الهاتف", value: app.owner_phone },
              { label: "رقم الهوية", value: app.national_id },
            ])}
            ${cardSection("معلومات المتجر", [
              { label: "الفئة", value: app.store_category },
              { label: "الوصف", value: app.description },
              { label: "هاتف المتجر", value: app.store_phone },
            ])}
            ${cardSection("الموقع", [
              { label: "الدولة", value: app.country },
              { label: "المدينة", value: app.city },
              { label: "العنوان", value: app.address },
            ])}
            ${cardSection("الأعمال والبنك", [
              { label: "السجل التجاري", value: app.commercial_register },
              { label: "نوع النشاط", value: app.business_type },
              { label: "VAT", value: app.vat_number || "غير متوفر" },
              { label: "اسم البنك", value: app.bank_name },
              { label: "صاحب الحساب", value: app.account_holder },
              { label: "IBAN", value: app.iban },
              { label: "نوع الحساب", value: app.account_type },
            ])}
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadRequests(showErrorToast = false) {
  const { data, error } = await supabaseClient
    .from("partners_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    if (showErrorToast) showToast("تعذر تحميل طلبات الشراكة", "error");
    return;
  }

  allApplications = data || [];
  document.getElementById("partnersCount").textContent = allApplications.length;
  document.getElementById("lastRefresh").textContent = nowClock();
  filterApplications();
}

document.getElementById("searchInput").addEventListener("input", filterApplications);
document.getElementById("statusFilter").addEventListener("change", filterApplications);

loadRequests(true);
setInterval(loadRequests, 4000);

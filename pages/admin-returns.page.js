const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RETURN_STATUS_META = {
  reviewing: { label: "قيد المراجعة", badge: "status-review", color: "#075985" },
  accepted: { label: "تم طلب الإرجاع", badge: "status-delivered", color: "#065f46" },
  cancelled: { label: "تم إلغاء طلبك", badge: "status-cancelled", color: "#991b1b" },
};

let allReturns = [];
let ordersById = {}; /* مخزن الطلبات الأصلية المرتبطة بطلبات الإرجاع */
let currentFilter = "all";
let currentSearch = "";
let currentSort = "newest";
let currentDay = ""; /* "YYYY-MM-DD" أو فارغ = كل الأيام */

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

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function parseImages(request) {
  try {
    const parsed = typeof request.images === "string" ? JSON.parse(request.images) : request.images;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseAddress(request) {
  const raw = request.address;
  if (!raw) return "";
  const data = typeof raw === "string" ? safeJsonParse(raw) : raw;
  if (!data) return "";
  const st = data.full_address || data.street || data.manual || "";
  const bits = [data.name || data.type, st, data.area, data.building, data.floor ? "دور " + data.floor : ""].filter(Boolean);
  return bits.join(" — ");
}

function safeJsonParse(value) {
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

const ORDER_STATUS_LABELS = {
  pending: "قيد الانتظار",
  review: "قيد المراجعة",
  preparing: "جارٍ التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  confirmed: "تم التأكيد",
  cancelled: "ملغي",
  onhold: "معلق مؤقتًا",
  returned: "مرتجع",
  returned_partial: "مرتجع جزئي",
};

const ORDER_STATUS_BADGES = {
  pending: "status-pending",
  review: "status-review",
  preparing: "status-preparing",
  shipped: "status-shipped",
  delivered: "status-delivered",
  confirmed: "status-confirmed",
  cancelled: "status-cancelled",
  onhold: "status-onhold",
  returned: "status-returned",
  returned_partial: "status-returned",
};

function orderFromRequest(request) {
  if (!request) return null;
  const byId = request.order_id ? ordersById[String(request.order_id)] : null;
  if (byId) return byId;
  if (request.order_reference) {
    return Object.values(ordersById).find((o) => String(o.order_reference || "") === String(request.order_reference)) || null;
  }
  return null;
}

function normalizeOrderItems(order) {
  if (!order) return [];
  for (const payload of [order.items_snapshot, order.items_json, order.items, order.order_items]) {
    const entries = safeJsonParse(payload);
    if (Array.isArray(entries) && entries.length) {
      return entries.filter((it) => it && typeof it === "object");
    }
  }
  return [];
}

function orderItemLines(order) {
  const items = normalizeOrderItems(order);
  return items
    .map((it) => {
      const name = String(it.name || it.product_name || it.title || "منتج");
      const qty = Number(it.quantity || it.qty || it.count) || 1;
      const price = Number(it.price || it.price_egp || it.unit_price || 0) || 0;
      const variant = [
        it.selected_color,
        it.selected_color_value,
        it.color,
        it.size,
        it.variant,
      ]
        .filter(Boolean)
        .join(" / ");
      let line = `${name} × ${qty}`;
      if (variant) line += ` (${variant})`;
      if (price) line += ` — ${price} ج.م`;
      return line;
    })
    .filter(Boolean);
}

function orderTotalText(order) {
  if (!order) return "";
  const total = Number(order.total_price ?? order.total?? 0) || 0;
  if (!total) {
    const items = normalizeOrderItems(order);
    const sum = items.reduce((acc, it) => acc + (Number(it.price || it.price_egp || 0) || 0) * (Number(it.quantity || it.qty || 1) || 1), 0);
    return sum ? `${sum} ج.م` : "";
  }
  return `${total} ج.م`;
}

function statusMeta(request) {
  return RETURN_STATUS_META[request.status] || RETURN_STATUS_META.reviewing;
}

function two(n) { return String(n).padStart(2, "0"); }

function dateKey(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${two(n.getMonth() + 1)}-${two(n.getDate())}`;
}

function sortRows(rows) {
  const list = [...rows];
  if (currentSort === "oldest") {
    list.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
  } else if (currentSort === "customer") {
    list.sort((a, b) => String(a.user_name || "").localeCompare(String(b.user_name || ""), "ar"));
  } else if (currentSort === "status") {
    const order = { reviewing: 0, accepted: 1, cancelled: 2 };
    list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  } else {
    list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }
  return list;
}

function filteredRows() {
  const keyword = String(currentSearch || "").trim().toLowerCase();
  const rows = allReturns.filter((r) => {
    if (currentFilter !== "all" && r.status !== currentFilter) return false;
    if (currentDay && dateKey(r.created_at) !== currentDay) return false;
    if (!keyword) return true;
    return [
      r.request_code,
      r.user_name,
      r.user_email,
      r.user_phone,
      r.product_name,
      r.order_reference,
      r.order_id,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(keyword));
  });
  return sortRows(rows);
}

function renderSummary() {
  const counts = { all: allReturns.length, reviewing: 0, accepted: 0, cancelled: 0 };
  allReturns.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });

  const el = document.getElementById("returnsSummary");
  if (el) {
    el.innerHTML =
      `<div class="summary-item"><p>جميع طلبات الإرجاع</p><strong style="color:#fbbf24">${counts.all} طلب</strong></div>` +
      `<div class="summary-item"><p>قيد المراجعة</p><strong style="color:#7dd3fc">${counts.reviewing}</strong></div>` +
      `<div class="summary-item"><p>تم طلب الإرجاع</p><strong style="color:#6ee7b7">${counts.accepted}</strong></div>` +
      `<div class="summary-item"><p>تم الإلغاء</p><strong style="color:#fca5a5">${counts.cancelled}</strong></div>`;
  }
}

function imageThumbnails(images) {
  if (!images.length) return "";
  return (
    `<div class="ret-imgs">` +
    images
      .map((url) => {
        const safe = esc(url);
        return (
          `<span class="ret-thumb-wrap">` +
          `<button type="button" class="ret-thumb" data-lightbox="${safe}" title="تكبير"><img src="${safe}" alt="صورة الإرجاع" loading="lazy" /></button>` +
          `<button type="button" class="ret-dl" data-img="${safe}" title="تحميل الصورة"><i class="fa-solid fa-download"></i></button>` +
          `</span>`
        );
      })
      .join("") +
    `</div>`
  );
}

/* تجميع نص كامل قابل للنسخ للطلب */
function compileRequestText(request) {
  const meta = statusMeta(request);
  const imgs = parseImages(request);
  const address = parseAddress(request);
  const order = orderFromRequest(request);
  const lines = [
    `طلب إرجاع: ${request.request_code || "-"}`,
    `الحالة: ${meta.label}`,
    `التاريخ: ${formatDate(request.created_at)}`,
    `العميل: ${request.user_name || "-"}${request.user_phone ? `\nالهاتف: ${request.user_phone}` : ""}`,
    `البريد: ${request.user_email || "-"}`,
    `الدولة: ${request.country || "EG"}`,
  ].filter(Boolean);
  if (order) {
    lines.push(
      `الطلب الأصلي: ${order.order_reference || order.id || "-"}`,
      `حالة الطلب: ${ORDER_STATUS_LABELS[order.status] || "—"}`,
      `تاريخ الطلب: ${formatDate(order.created_at)}`,
      `إجمالي الطلب: ${orderTotalText(order)}`
    );
    const itemLines = orderItemLines(order);
    if (itemLines.length) {
      lines.push(`منتجات الطلب (${itemLines.length}):`);
      itemLines.forEach((l) => lines.push(`- ${l}`));
    }
  } else {
    lines.push(`الطلب الأصلي: ${request.order_reference || request.order_id || "-"}`);
  }
  lines.push(`المنتج: ${request.product_name || "-"}`);
  if (request.variant) lines.push(`المواصفات: ${request.variant}`);
  lines.push(`الكمية: ${request.quantity || 1}`);
  lines.push(`السعر: ${request.product_price ?? "-"}`);
  lines.push(`السبب: ${request.reason || "-"}`);
  if (request.details) lines.push(`التفاصيل: ${request.details}`);
  if (address) lines.push(`العنوان: ${address}`);
  if (request.admin_note) lines.push(`ملاحظة الإدارة: ${request.admin_note}`);
  imgs.forEach((url, i) => lines.push(`الصورة ${i + 1}: ${url}`));
  return lines.join("\n");
}

function sectionBlock(innerHtml, text) {
  return (
    `<div class="ret-sec">` +
    `<button type="button" class="ret-sec-copy" data-copy="${esc(text)}" title="نسخ هذا الجزء"><i class="fa-solid fa-copy"></i></button>` +
    innerHtml +
    `</div>`
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("تم النسخ إلى الحافظة", "success");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); showToast("تم النسخ إلى الحافظة", "success"); } catch { showToast("تعذر النسخ", "error"); }
    ta.remove();
  }
}

async function downloadImage(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("http");
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = (String(url).split("/").pop() || "return-image").split("?")[0] || "return-image.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
  } catch {
    window.open(url, "_blank");
  }
}

function renderCard(request) {
  const meta = statusMeta(request);
  const imgs = parseImages(request);
  const images = imageThumbnails(imgs);
  const address = parseAddress(request);

  const customerText = [
    request.user_name ? `العميل: ${request.user_name}` : null,
    request.user_phone ? `الهاتف: ${request.user_phone}` : null,
    request.user_email ? `البريد: ${request.user_email}` : null,
    request.country ? `الدولة: ${request.country}` : null,
  ].filter(Boolean).join("\n") || "—";

  const customer =
    `<div class="ret-customer">
      <strong>${esc(request.user_name || "عميل")}</strong>
      <span>${esc(request.user_email)}</span>
      ${request.user_phone ? `<span>📞 ${esc(request.user_phone)}</span>` : ""}
      <span>🌍 ${esc(request.country || "EG")}</span>
    </div>`;

  const productText = [
    `المنتج: ${request.product_name || "-"}`,
    request.variant ? `المواصفات: ${request.variant}` : null,
    `الكمية: ${request.quantity || 1}`,
    `السعر: ${request.product_price ?? "-"}`,
    `الطلب: ${request.order_reference || request.order_id || "-"}`,
  ].filter(Boolean).join("\n");

  const product =
    `<div class="ret-product">
      <img class="ret-pimg" src="${esc(request.product_image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23eef2f6'/%3E%3C/svg%3E")}" alt="" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2760%27 height=%2760%27%3E%3Crect width=%2760%27 height=%2760%27 fill=%27%23eef2f6%27/%3E%3C/svg%3E'" />
      <div class="ret-pinfo">
        <strong>${esc(request.product_name || "منتج")}</strong>
        ${request.variant ? `<span>${esc(request.variant)}</span>` : ""}
        <span>الكمية: ${esc(request.quantity || 1)} · ${esc(request.product_price || "")} ج.م</span>
        <span>الطلب: ${esc(request.order_reference || request.order_id || "-")}</span>
      </div>
    </div>`;

  const reasonBlock =
    `<div class="ret-reason">
      <strong>السبب: ${esc(request.reason || "-")}</strong>
      ${request.details ? `<p>${esc(request.details)}</p>` : ""}
    </div>`;

  const order = orderFromRequest(request);
  const orderRefText = request.order_reference || order?.order_reference || request.order_id || "-";
  const orderMeta = order ? {
    statusLabel: ORDER_STATUS_LABELS[order.status] || "—",
    statusBadge: ORDER_STATUS_BADGES[order.status] || "status-pending",
    createdAt: formatDate(order.created_at),
    updateAt: formatDate(order.delivered_at || order.updated_at),
    total: orderTotalText(order),
    itemLines: orderItemLines(order),
  } : null;

  const orderInfoBlock = orderMeta
    ? sectionBlock(
        `<div class="ret-order-info">
          <div class="ret-order-left">
            <strong>الطلب الأصلي</strong>
            <span class="order-ref">${esc(orderRefText)}</span>
            <span class="ret-order-date">📅 ${orderMeta.createdAt}</span>
            ${orderMeta.updateAt !== "-" ? `<span class="ret-order-date">🚚 ${orderMeta.updateAt}</span>` : ""}
          </div>
          <div class="ret-order-right">
            <span class="status-badge ${orderMeta.statusBadge}">${esc(orderMeta.statusLabel)}</span>
            <span class="ret-order-total">الإجمالي: <b>${esc(orderMeta.total)}</b></span>
          </div>
        </div>
        ${
          orderMeta.itemLines.length
            ? `<ul class="ret-order-items">${orderMeta.itemLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`
            : ""
        }`,
        [
          `الطلب الأصلي: ${orderRefText}`,
          `حالة الطلب: ${orderMeta.statusLabel}`,
          `تاريخ الطلب: ${orderMeta.createdAt}`,
          `الإجمالي: ${orderMeta.total}`,
          ...orderMeta.itemLines.map((l) => `- ${l}`),
        ].join("\n")
      )
    : sectionBlock(
        `<div class="ret-order-info ret-order-info-plain"><strong>الطلب الأصلي</strong><span class="order-ref">${esc(orderRefText)}</span></div>`,
        `الطلب الأصلي: ${orderRefText}`
      );

  const adminNote = request.admin_note
    ? `<div class="ret-note"><strong>ملاحظة الإدارة/الرفض:</strong> ${esc(request.admin_note)}</div>`
    : "";

  const actions =
    request.status === "reviewing"
      ? `<button type="button" class="btn btn-primary ret-accept" data-id="${esc(request.id)}"><i class="fa-solid fa-check"></i> موافقة</button>
         <button type="button" class="btn btn-danger ret-reject" data-id="${esc(request.id)}"><i class="fa-solid fa-xmark"></i> رفض</button>`
      : `<button type="button" class="btn btn-secondary ret-reopen" data-id="${esc(request.id)}">إعادة للمراجعة</button>`;

  const copyFull = esc(compileRequestText(request));

  return (
    `<article class="card ret-card" data-status="${esc(request.status)}" data-open-id="${esc(request.id)}">
      <div class="ret-head">
        <div class="ret-code">
          <strong>${esc(request.request_code || "طلب إرجاع")}</strong>
          <span>${formatDate(request.created_at)}</span>
        </div>
        <div class="ret-headright">
          <button type="button" class="ret-open-detail" data-open-id="${esc(request.id)}" title="فتح الصفحة الكاملة">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> التفاصيل
          </button>
          <button type="button" class="ret-copy" data-copy="${copyFull}" title="نسخ الطلب كامل"><i class="fa-solid fa-copy"></i> نسخ الكل</button>
          <span class="status-badge ${meta.badge}">${meta.label}</span>
        </div>
      </div>
      ${orderInfoBlock}
      ${sectionBlock(customer, customerText)}
      ${sectionBlock(product, productText)}
      ${sectionBlock(reasonBlock, `السبب: ${request.reason || "-"}${request.details ? "\nالتفاصيل: " + request.details : ""}`)}
      ${images}
      ${address ? sectionBlock(`<div class="ret-address"><strong>العنوان:</strong> ${esc(address)}</div>`, address) : ""}
      ${adminNote}
      <div class="ret-actions">${actions}</div>
    </article>`
  );
}

function renderDayBar() {
  const input = document.getElementById("retDayInput");
  const countEl = document.getElementById("retDayCount");
  const headEl = document.getElementById("retGroupHead");
  if (input) input.value = currentDay || "";

  if (countEl) {
    if (!currentDay) {
      countEl.textContent = "";
    } else {
      const n = allReturns.filter((r) => dateKey(r.created_at) === currentDay).length;
      countEl.textContent = `عرض ${n} طلب من يوم ${currentDay}`;
    }
  }
  if (headEl) {
    const rows = filteredRows();
    headEl.innerHTML = currentDay
      ? `طلبات يوم <strong>${currentDay}</strong> — <span>${rows.length} طلب</span>`
      : `كل الطلبات — <span>${rows.length} طلب</span>`;
  }
}

function renderList() {
  const container = document.getElementById("returnsGrid");
  if (!container) return;
  renderSummary();
  renderDayBar();

  const rows = filteredRows();
  if (!rows.length) {
    container.innerHTML =
      `<div class="card ret-empty">
        <i class="fa-solid fa-rotate-left"></i>
        <p>لا توجد طلبات إرجاع${currentFilter !== "all" ? " في هذه الحالة" : ""}${currentDay ? ` في يوم ${currentDay}` : ""}.</p>
      </div>`;
    return;
  }
  container.innerHTML = rows.map(renderCard).join("");

  document.querySelectorAll(".status-count-pill-total").forEach((el) => { el.remove(); });
  updateFilterPill();
}

function updateFilterPill() {
  const counts = { reviewing: 0, accepted: 0, cancelled: 0 };
  allReturns.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    const key = btn.getAttribute("data-filter");
    btn.classList.remove("active");
    if (key === currentFilter) btn.classList.add("active");
    const badge = btn.querySelector(".status-count-pill");
    if (badge) badge.textContent = counts[key] || 0;
  });
}

async function setStatus(id, status, note) {
  const payload = { status, decided_at: new Date().toISOString() };
  if (note) payload.admin_note = note;
  try {
    const { error } = await supabaseClient.from("return_requests").update(payload).eq("id", id);
    if (error) throw error;
    allReturns = allReturns.map((r) => (r.id === id ? { ...r, ...payload } : r));
    renderList();
    const meta = RETURN_STATUS_META[status];
    showToast(meta ? `تم التحديث: ${meta.label}` : "تم التحديث بنجاح", "success");
  } catch (err) {
    console.error("update return status failed", err);
    showToast("تعذر تحديث الطلب. حاول مرة أخرى.", "error");
  }
}

async function acceptRequest(id) {
  const request = allReturns.find((r) => r.id === id);
  if (!request) return;
  const ok = window.confirm(`الموافقة على طلب الإرجاع ${request.request_code || ""}؟\nسيظهر للعميل على أنه "تم طلب الإرجاع".`);
  if (!ok) return;
  await setStatus(id, "accepted", null);
}

async function rejectRequest(id) {
  const request = allReturns.find((r) => r.id === id);
  if (!request) return;
  const note = window.prompt("سبب إلغاء/رفض طلب الإرجاع (سيظهر للعميل):", "");
  if (note === null) return;
  await setStatus(id, "cancelled", note.trim() || "لم يوضَّح سبب");
}

async function reopenRequest(id) {
  const request = allReturns.find((r) => r.id === id);
  if (!request) return;
  await setStatus(id, "reviewing", null);
}

function openLightbox(url) {
  const old = document.querySelector(".ret-lightbox");
  if (old) old.remove();
  const overlay = document.createElement("div");
  overlay.className = "ret-lightbox";
  overlay.innerHTML = `<img src="${esc(url)}" alt="صورة" /><button type="button" class="ret-lightbox-dl" data-img="${esc(url)}"><i class="fa-solid fa-download"></i> تحميل</button>`;
  overlay.addEventListener("click", (e) => {
    if (e.target.closest(".ret-lightbox-dl")) {
      e.stopPropagation();
      downloadImage(url);
      return;
    }
    overlay.remove();
  });
  document.body.appendChild(overlay);
}

function bindEvents() {
  const grid = document.getElementById("returnsGrid");
  if (grid) {
    grid.addEventListener("click", async (event) => {
      const copyBtn = event.target.closest("[data-copy]");
      const acceptBtn = event.target.closest(".ret-accept");
      const rejectBtn = event.target.closest(".ret-reject");
      const reopenBtn = event.target.closest(".ret-reopen");
      const thumb = event.target.closest(".ret-thumb");
      const dlBtn = event.target.closest("[data-img]");
      const openBtn = event.target.closest(".ret-open-detail");
      if (copyBtn) {
        event.preventDefault();
        return copyText(copyBtn.getAttribute("data-copy"));
      }
      if (dlBtn) {
        event.preventDefault();
        return downloadImage(dlBtn.getAttribute("data-img"));
      }
      if (acceptBtn) return acceptRequest(acceptBtn.getAttribute("data-id"));
      if (rejectBtn) return rejectRequest(rejectBtn.getAttribute("data-id"));
      if (reopenBtn) return reopenRequest(reopenBtn.getAttribute("data-id"));
      if (thumb) return openLightbox(thumb.getAttribute("data-lightbox"));
      if (openBtn) {
        return window.open(`admin-return-detail.html?id=${encodeURIComponent(openBtn.getAttribute("data-open-id"))}`, "_blank");
      }
      const card = event.target.closest(".ret-card");
      if (card) {
        const openId = card.getAttribute("data-open-id");
        if (openId) window.open(`admin-return-detail.html?id=${encodeURIComponent(openId)}`, "_blank");
      }
    });
  }

  const filterWrap = document.querySelector(".ret-filters");
  if (filterWrap) {
    filterWrap.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-filter]");
      if (!btn) return;
      currentFilter = btn.getAttribute("data-filter");
      renderList();
    });
  }

  const searchInput = document.getElementById("retSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      currentSearch = searchInput.value || "";
      renderList();
    });
  }

  const sortSelect = document.getElementById("retSort");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      currentSort = sortSelect.value || "newest";
      renderList();
    });
  }

  const dayInput = document.getElementById("retDayInput");
  if (dayInput) {
    dayInput.addEventListener("change", () => {
      currentDay = dayInput.value || "";
      renderList();
    });
  }
  const todayBtn = document.getElementById("retTodayBtn");
  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      currentDay = todayKey();
      renderList();
    });
  }
  const allDaysBtn = document.getElementById("retAllDaysBtn");
  if (allDaysBtn) {
    allDaysBtn.addEventListener("click", () => {
      currentDay = "";
      renderList();
    });
  }

  window.addEventListener("resize", () => {
    // no-op placeholder to match admin pages
  });
}

async function loadLinkedOrders() {
  const ids = [
    ...new Set(allReturns.map((r) => String(r.order_id || "").trim()).filter(Boolean)),
  ];
  if (ids.length) {
    try {
      const { data } = await supabaseClient.from("orders").select("*").in("id", ids);
      const list = Array.isArray(data) ? data : [];
      list.forEach((order) => { ordersById[String(order.id)] = order; });
    } catch (err) {
      console.warn("loadLinkedOrders by id failed", err);
    }
  }
  const refs = [
    ...new Set(allReturns.map((r) => String(r.order_reference || "").trim()).filter(Boolean)),
  ].filter((ref) => !Object.values(ordersById).some((o) => String(o.order_reference || "") === ref));
  if (refs.length) {
    try {
      const { data } = await supabaseClient.from("orders").select("*").in("order_reference", refs);
      const list = Array.isArray(data) ? data : [];
      list.forEach((order) => { ordersById[String(order.id)] = order; });
    } catch (err) {
      console.warn("loadLinkedOrders by ref failed", err);
    }
  }
}

async function loadReturns() {
  renderSummary();
  const container = document.getElementById("returnsGrid");
  if (container) {
    container.innerHTML = `<div class="card ret-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><p>جارٍ تحميل طلبات الإرجاع...</p></div>`;
  }
  try {
    const { data, error } = await supabaseClient.from("return_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    allReturns = Array.isArray(data) ? data : [];
    await loadLinkedOrders();
    renderList();
  } catch (err) {
    console.error("load returns failed", err);
    if (container) {
      container.innerHTML = `<div class="card ret-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>تعذر تحميل طلبات الإرجاع.</p></div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadReturns();
});
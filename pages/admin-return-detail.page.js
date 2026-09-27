const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RETURN_STATUS_META = {
  reviewing: { label: "قيد المراجعة", badge: "status-review", color: "#075985" },
  accepted: { label: "تم طلب الإرجاع", badge: "status-delivered", color: "#065f46" },
  cancelled: { label: "تم إلغاء طلبك", badge: "status-cancelled", color: "#991b1b" },
};

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

let detailRequest = null;
let detailOrder = null;
let detailOrderItems = [];

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

function safeJsonParse(value) {
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
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

function statusMeta(request) {
  return RETURN_STATUS_META[request.status] || RETURN_STATUS_META.reviewing;
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

function itemImageSrc(item) {
  const src = String(
    item.image ||
    item.image_url ||
    item.product_image ||
    item.thumbnail ||
    item.img ||
    (typeof item.metadata === "string" ? safeJsonParse(item.metadata)?.image || "" : item.metadata?.image || "") ||
    ""
  ).trim();
  if (!src) return "";
  if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (src.startsWith("/storage/v1/object/public/")) return `${SUPABASE_URL}${src}`;
  if (src.startsWith("storage/v1/object/public/")) return `${SUPABASE_URL}/${src}`;
  if (src.startsWith("product-images/")) return `${SUPABASE_URL}/storage/v1/object/public/${src}`;
  return src;
}

const IMG_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23eef2f6'/%3E%3C/svg%3E";

function itemName(item) {
  return String(item.name || item.product_name || item.title || "منتج");
}

function itemVariant(item) {
  return [
    item.selected_color,
    item.selected_color_value,
    item.color,
    item.size,
    item.variant,
  ].filter(Boolean).join(" / ");
}

function itemPrice(item) {
  return Number(item.price || item.price_egp || item.unit_price || 0) || 0;
}

function itemQty(item) {
  return Number(item.quantity || item.qty || item.count) || 1;
}

function orderTotal(order) {
  const total = Number(order.total_price ?? order.total ?? 0) || 0;
  if (total) return total;
  return normalizeOrderItems(order).reduce((acc, it) => acc + itemPrice(it) * itemQty(it), 0);
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

function compileRequestText() {
  const r = detailRequest;
  const meta = statusMeta(r);
  const imgs = parseImages(r);
  const address = parseAddress(r);
  const lines = [
    `طلب إرجاع: ${r.request_code || "-"}`,
    `الحالة: ${meta.label}`,
    `التاريخ: ${formatDate(r.created_at)}`,
    `العميل: ${r.user_name || "-"}${r.user_phone ? `\nالهاتف: ${r.user_phone}` : ""}`,
    `البريد: ${r.user_email || "-"}`,
    `الدولة: ${r.country || "EG"}`,
  ];
  if (detailOrder) {
    lines.push(`الطلب الأصلي: ${detailOrder.order_reference || detailOrder.id || "-"}`);
    lines.push(`حالة الطلب: ${ORDER_STATUS_LABELS[detailOrder.status] || "—"}`);
    lines.push(`تاريخ الطلب: ${formatDate(detailOrder.created_at)}`);
    const items = normalizeOrderItems(detailOrder);
    if (items.length) {
      lines.push(`منتجات الطلب (${items.length}):`);
      items.forEach((it) => {
        let line = `- ${itemName(it)} × ${itemQty(it)}`;
        const v = itemVariant(it);
        if (v) line += ` (${v})`;
        line += ` ${itemPrice(it) ? `— ${itemPrice(it)} ج.م` : ""}`;
        lines.push(line);
      });
      lines.push(`إجمالي الطلب: ${orderTotal(detailOrder)} ج.م`);
    }
  } else {
    lines.push(`الطلب الأصلي: ${r.order_reference || r.order_id || "-"}`);
  }
  lines.push(`المنتج: ${r.product_name || "-"}`);
  if (r.variant) lines.push(`المواصفات: ${r.variant}`);
  lines.push(`الكمية: ${r.quantity || 1}`);
  lines.push(`السعر: ${r.product_price ?? "-"}`);
  lines.push(`السبب: ${r.reason || "-"}`);
  if (r.details) lines.push(`التفاصيل: ${r.details}`);
  if (address) lines.push(`العنوان: ${address}`);
  if (r.admin_note) lines.push(`ملاحظة الإدارة: ${r.admin_note}`);
  imgs.forEach((url, i) => lines.push(`الصورة ${i + 1}: ${url}`));
  return lines.join("\n");
}

function sectionCard(title, icon, innerHtml, copyTextContent = "") {
  return (
    `<section class="card ret-dsec ${copyTextContent ? "ret-sec" : ""}">
      <div class="ret-dsec-title">
        <i class="fa-solid ${icon}"></i>
        <h3>${esc(title)}</h3>
        ${
          copyTextContent
            ? `<button type="button" class="ret-sec-copy" data-copy="${esc(copyTextContent)}" title="نسخ هذا الجزء"><i class="fa-solid fa-copy"></i></button>`
            : ""
        }
      </div>
      ${innerHtml}
    </section>`
  );
}

function renderDetail() {
  const root = document.getElementById("retDetailRoot");
  const r = detailRequest;
  const meta = statusMeta(r);
  const imgs = parseImages(r);
  const address = parseAddress(r);
  const copyFull = esc(compileRequestText());

  const backBtn =
    `<a class="btn btn-secondary ret-dback" href="admin-returns.html"><i class="fa-solid fa-arrow-right"></i> العودة للمرتجعات</a>`;

  const actions =
    `<div class="ret-dactions card">
      ${backBtn}
      <button type="button" class="ret-copy" data-copy="${copyFull}"><i class="fa-solid fa-copy"></i> نسخ الكل</button>
      ${
        r.status === "reviewing"
          ? `<button type="button" class="btn btn-primary ret-accept" data-id="${esc(r.id)}"><i class="fa-solid fa-check"></i> موافقة</button>
             <button type="button" class="btn btn-danger ret-reject" data-id="${esc(r.id)}"><i class="fa-solid fa-xmark"></i> رفض</button>`
          : `<button type="button" class="btn btn-secondary ret-reopen" data-id="${esc(r.id)}">إعادة للمراجعة</button>`
      }
    </div>`;

  const customerCard = sectionCard(
    "بيانات العميل",
    "fa-user",
    `<dl class="ret-ddl">
      <div class="ret-drow"><dt>الاسم</dt><dd>${esc(r.user_name || "-")}</dd></div>
      <div class="ret-drow"><dt>البريد</dt><dd>${esc(r.user_email || "-")}</dd></div>
      ${
        r.user_phone
          ? `<div class="ret-drow"><dt>الهاتف</dt><dd dir="ltr">${esc(r.user_phone)}</dd></div>`
          : ""
      }
      <div class="ret-drow"><dt>الدولة</dt><dd>${esc(r.country || "EG")}</dd></div>
    </dl>`,
    `العميل: ${r.user_name || "-"}\nالهاتف: ${r.user_phone || "-"}\nالبريد: ${r.user_email || "-"}\nالدولة: ${r.country || "EG"}`
  );

  const returnInfoCard = sectionCard(
    "بيانات طلب الإرجاع",
    "fa-rotate-left",
    `<dl class="ret-ddl">
      <div class="ret-drow"><dt>رمز الطلب</dt><dd>${esc(r.request_code || "-")}</dd></div>
      <div class="ret-drow"><dt>الحالة</dt><dd><span class="status-badge ${meta.badge}">${meta.label}</span></dd></div>
      <div class="ret-drow"><dt>تاريخ التقديم</dt><dd>${formatDate(r.created_at)}</dd></div>
      <div class="ret-drow"><dt>السبب</dt><dd>${esc(r.reason || "-")}</dd></div>
      ${
        r.details
          ? `<div class="ret-drow"><dt>التفاصيل</dt><dd>${esc(r.details)}</dd></div>`
          : ""
      }
    </dl>`,
    `سبب الإرجاع: ${r.reason || "-"}${r.details ? "\nالتفاصيل: " + r.details : ""}`
  );

  const productCard = sectionCard(
    "المنتج المطلوب إرجاعه",
    "fa-cube",
    `<div class="ret-product">
      <img class="ret-pimg" src="${esc(r.product_image || IMG_PLACEHOLDER)}" alt="" onerror="this.src='${IMG_PLACEHOLDER}'" />
      <div class="ret-pinfo">
        <strong>${esc(r.product_name || "منتج")}</strong>
        ${r.variant ? `<span>${esc(r.variant)}</span>` : ""}
        <span>الكمية: ${esc(r.quantity || 1)} · السعر: ${esc(r.product_price || "")} ج.م</span>
      </div>
    </div>`,
    `المنتج: ${r.product_name || "-"}\nالمواصفات: ${r.variant || "-"}\nالكمية: ${r.quantity || 1}\nالسعر: ${r.product_price || "-"}`
  );

  let orderCard = "";
  if (detailOrder) {
    const items = normalizeOrderItems(detailOrder);
    const itemsHtml = items.length
      ? `<div class="ret-ditems">
          ${items.map((it) => {
            const img = itemImageSrc(it);
            return `<div class="ret-ditem">
              <img src="${esc(img || IMG_PLACEHOLDER)}" alt="" onerror="this.src='${IMG_PLACEHOLDER}'" />
              <div class="ret-ditem-info">
                <strong>${esc(itemName(it))}</strong>
                ${itemVariant(it) ? `<span>${esc(itemVariant(it))}</span>` : ""}
                <span>الكمية: ${itemQty(it)}${itemPrice(it) ? ` · ${itemPrice(it)} ج.م` : ""}</span>
              </div>
            </div>`;
          }).join("")}
        </div>`
      : "";

    const addressRow = detailOrder.full_address || parseAddress({ address: detailOrder.address });

    orderCard = sectionCard(
      "الطلب الأصلي",
      "fa-receipt",
      `<dl class="ret-ddl">
        <div class="ret-drow"><dt>رقم الطلب</dt><dd>${esc(detailOrder.order_reference || detailOrder.id || "-")}</dd></div>
        <div class="ret-drow"><dt>الحالة</dt><dd><span class="status-badge ${ORDER_STATUS_BADGES[detailOrder.status] || "status-pending"}">${esc(ORDER_STATUS_LABELS[detailOrder.status] || "—")}</span></dd></div>
        <div class="ret-drow"><dt>تاريخ الطلب</dt><dd>${formatDate(detailOrder.created_at)}</dd></div>
        ${detailOrder.delivered_at ? `<div class="ret-drow"><dt>تاريخ التسليم</dt><dd>${formatDate(detailOrder.delivered_at)}</dd></div>` : ""}
        <div class="ret-drow"><dt>عدد المنتجات</dt><dd>${items.length}</dd></div>
        <div class="ret-drow"><dt>إجمالي الطلب</dt><dd><b>${orderTotal(detailOrder)} ج.م</b></dd></div>
        ${
          addressRow
            ? `<div class="ret-drow"><dt>عنوان الاستلام</dt><dd class="ret-dd-wrap">${esc(addressRow)}</dd></div>`
            : ""
        }
      </dl>
      ${itemsHtml}`,
      [
        `الطلب الأصلي: ${detailOrder.order_reference || detailOrder.id || "-"}`,
        `حالة الطلب: ${ORDER_STATUS_LABELS[detailOrder.status] || "—"}`,
        `تاريخ الطلب: ${formatDate(detailOrder.created_at)}`,
        `إجمالي الطلب: ${orderTotal(detailOrder)} ج.م`,
        ...items.map((it) => `- ${itemName(it)} × ${itemQty(it)}${itemVariant(it) ? ` (${itemVariant(it)})` : ""} — ${itemPrice(it) || ""} ج.م`),
      ].join("\n")
    );
  }

  const addressCard = address
    ? sectionCard("عنوان استلام المرتجع", "fa-location-dot", `<div class="ret-address"><strong>العنوان:</strong> ${esc(address)}</div>`, `العنوان: ${address}`)
    : "";

  const imagesCard = `<section class="card ret-dsec">
      <div class="ret-dsec-title"><i class="fa-solid fa-images"></i><h3>صور الإرجاع</h3></div>
      ${
        imgs.length
          ? `<div class="ret-imgs">${imgs
              .map((url) => {
                const safe = esc(url);
                return `<span class="ret-thumb-wrap">
                  <button type="button" class="ret-thumb ret-thumb-lg" data-lightbox="${safe}" title="تكبير"><img src="${safe}" alt="صورة الإرجاع" loading="lazy" /></button>
                  <button type="button" class="ret-dl" data-img="${safe}" title="تحميل الصورة"><i class="fa-solid fa-download"></i></button>
                </span>`;
              })
              .join("")}</div>`
          : `<p class="ret-dmuted">لا توجد صور مرفقة.</p>`
      }
    </section>`;

  const adminNote = r.admin_note
    ? `<div class="ret-note"><strong>ملاحظة الإدارة/الرفض:</strong> ${esc(r.admin_note)}</div>`
    : "";

  root.innerHTML =
    `<div class="ret-dhead card">
      <div class="ret-dhead-code">
        <span class="status-badge ${meta.badge}">${meta.label}</span>
        <h2>${esc(r.request_code || "طلب إرجاع")}</h2>
        <p>${formatDate(r.created_at)}</p>
      </div>
    </div>
    ${actions}
    <div class="ret-dgrid">
      <div class="ret-dcol ret-dcol-main">
        ${orderCard || returnInfoCard}
        ${productCard}
        ${imagesCard}
      </div>
      <div class="ret-dcol">
        ${customerCard}
        ${addressCard}
        ${!orderCard ? returnInfoCard : ""}
        ${adminNote}
      </div>
    </div>`;
}

async function setStatus(id, status, note) {
  const payload = { status, decided_at: new Date().toISOString() };
  if (note) payload.admin_note = note;
  try {
    const { error } = await supabaseClient.from("return_requests").update(payload).eq("id", id);
    if (error) throw error;
    detailRequest = { ...detailRequest, ...payload };
    renderDetail();
    const meta = RETURN_STATUS_META[status];
    showToast(meta ? `تم التحديث: ${meta.label}` : "تم التحديث بنجاح", "success");
  } catch (err) {
    console.error("update return status failed", err);
    showToast("تعذر تحديث الطلب. حاول مرة أخرى.", "error");
  }
}

async function acceptRequest(id) {
  const ok = window.confirm(`الموافقة على طلب الإرجاع ${detailRequest?.request_code || ""}؟\nسيظهر للعميل على أنه "تم طلب الإرجاع".`);
  if (!ok) return;
  await setStatus(id, "accepted", null);
}

async function rejectRequest(id) {
  const note = window.prompt("سبب إلغاء/رفض طلب الإرجاع (سيظهر للعميل):", "");
  if (note === null) return;
  await setStatus(id, "cancelled", note.trim() || "لم يوضَّح سبب");
}

async function reopenRequest(id) {
  await setStatus(id, "reviewing", null);
}

function bindEvents() {
  const root = document.getElementById("retDetailRoot");
  if (!root) return;
  root.addEventListener("click", async (event) => {
    const copyBtn = event.target.closest("[data-copy]");
    const acceptBtn = event.target.closest(".ret-accept");
    const rejectBtn = event.target.closest(".ret-reject");
    const reopenBtn = event.target.closest(".ret-reopen");
    const thumb = event.target.closest(".ret-thumb");
    const dlBtn = event.target.closest("[data-img]");
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
  });
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

async function loadDetail() {
  const root = document.getElementById("retDetailRoot");
  const id = getParam("id");
  if (!id) {
    root.innerHTML = `<div class="card ret-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>معرّف الطلب غير موجود.</p></div>`;
    return;
  }
  try {
    const { data, error } = await supabaseClient.from("return_requests").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("not found");
    detailRequest = data;

    let order = null;
    if (data.order_id) {
      const { data: o } = await supabaseClient.from("orders").select("*").eq("id", data.order_id).maybeSingle();
      if (o) order = o;
    }
    if (!order && data.order_reference) {
      const { data: o } = await supabaseClient.from("orders").select("*").in("order_reference", [data.order_reference]).limit(1).maybeSingle();
      if (o) order = o;
    }
    detailOrder = order || null;

    if (detailOrder) {
      const { data: items } = await supabaseClient.from("order_items").select("*").eq("order_id", detailOrder.id);
      detailOrderItems = Array.isArray(items) ? items : [];
      if (!normalizeOrderItems(detailOrder).length && detailOrderItems.length) {
        detailOrder.items = detailOrderItems;
      }
    }

    renderDetail();
  } catch (err) {
    console.error("load detail failed", err);
    root.innerHTML = `<div class="card ret-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>تعذر تحميل التفاصيل.</p></div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadDetail();
});
var pdClient = window.supabase.createClient(
  "https://msgqzgzoslearaprgiqq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE"
);
var pdMoney = new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2 });
var pdInteger = new Intl.NumberFormat("ar-EG");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showToast(message, type) {
  var existing = document.querySelector(".app-toast");
  if (existing) existing.remove();
  var toast = document.createElement("div");
  toast.className = "app-toast " + (type || "info");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 4000);
}

function getParams() {
  var params = new URLSearchParams(window.location.search);
  return { userId: params.get("user_id") || "", email: params.get("email") || "" };
}

async function loadDetail() {
  var { userId, email } = getParams();
  if (!userId && !email) {
    document.getElementById("partnerDetailContent").innerHTML = "<p class='muted'>لم يتم تحديد شريك.</p>";
    return;
  }

  var subtitle = document.getElementById("partnerDetailSubtitle");
  if (subtitle) subtitle.textContent = email || userId;

  var { data: account } = await pdClient.from("partner_accounts").select("*")
    .or("user_id.eq." + userId + (email ? ",email.eq." + email : ""))
    .maybeSingle();

  var displayEmail = email || (account ? account.email : "");
  var displayName = account ? (account.full_name || displayEmail) : displayEmail;
  var displayAvatar = account ? account.avatar_url : "";
  var displayStatus = account ? account.status : "active";
  var displayFees = account ? (account.total_fees || 0) : 0;
  var displayTax = account ? (account.total_tax || 0) : 0;
  var displayAmount = account ? (account.total_amount || 0) : 0;
  var suspendedAt = account ? account.suspended_at : null;

  var { data: invoices } = await pdClient.from("partner_invoices").select("*")
    .or("user_id.eq." + userId + (email ? ",email.eq." + email : ""))
    .order("created_at", { ascending: false });

  var { data: products } = await pdClient.from("my_products").select("*")
    .eq("email", displayEmail).limit(50);

  var { data: orders } = await pdClient.from("orders").select("*").limit(200);

  var partnerOrders = [];
  if (orders) {
    orders.forEach(function(row) {
      try {
        var typeData = typeof row.type === "string" ? JSON.parse(row.type) : (row.type || {});
        if (typeData && typeData.seller_email && typeData.seller_email.toLowerCase().trim() === displayEmail.toLowerCase().trim()) {
          partnerOrders.push({
            id: row.id,
            created_at: row.created_at,
            total: row.total_price || row.total || 0,
            status: row.status || "pending",
            customer_name: row.user_name || "",
            items: [typeData]
          });
        }
      } catch(e) {}
    });
  }

  renderHeader(displayName, displayAvatar, displayEmail, displayStatus, displayFees, displayTax, displayAmount, suspendedAt, userId, displayEmail);
  renderInvoices(invoices || []);
  renderProducts(products || []);
  renderOrders(partnerOrders);
}

function renderHeader(name, avatar, email, status, fees, tax, amount, suspendedAt, userId, userEmail) {
  var isSuspended = status === "suspended";
  var initial = (name || "?").charAt(0).toUpperCase();
  var avatarHtml = avatar
    ? '<img src="' + escapeHtml(avatar) + '" alt="">'
    : initial;
  var statusLabel = isSuspended ? "معلق" : status === "flagged" ? "مُبلّغ" : "نشط";
  var statusBadge = '<span class="status-badge status-' + status + '">' + statusLabel + '</span>';

  document.getElementById("partnerDetailContent").innerHTML =
    '<div class="partner-detail-header">' +
      '<div class="partner-detail-avatar">' + avatarHtml + '</div>' +
      '<div><div class="partner-detail-name">' + escapeHtml(name) + ' ' + statusBadge + '</div><div class="partner-detail-email">' + escapeHtml(email) + '</div></div>' +
    '</div>' +
    '<div class="detail-grid">' +
      '<div class="detail-card">' +
        '<h3><i class="fa-solid fa-file-invoice"></i> الملخص المالي</h3>' +
        '<div class="detail-row"><span class="label">إجمالي رسوم المنصة</span><span class="value">' + pdMoney.format(fees) + '</span></div>' +
        '<div class="detail-row"><span class="label">إجمالي الضريبة</span><span class="value">' + pdMoney.format(tax) + '</span></div>' +
        '<div class="detail-row"><span class="label">إجمالي المستحق</span><span class="value" style="color:#0d6efd;font-size:1.1rem;">' + pdMoney.format(amount) + '</span></div>' +
      '</div>' +
      '<div class="detail-card">' +
        '<h3><i class="fa-solid fa-sliders"></i> الإجراءات</h3>' +
        '<div class="action-bar">' +
          '<button class="btn-notify" onclick="sendNotification(\'' + escapeHtml(userId) + '\',\'' + escapeHtml(userEmail) + '\')"><i class="fa-solid fa-bell"></i> إرسال إشعار</button>' +
          (isSuspended
            ? '<button class="btn-activate" onclick="toggleSuspend(\'' + escapeHtml(userId) + '\',\'' + escapeHtml(userEmail) + '\',false)"><i class="fa-solid fa-check"></i> إلغاء التعليق</button>'
            : '<button class="btn-suspend" onclick="toggleSuspend(\'' + escapeHtml(userId) + '\',\'' + escapeHtml(userEmail) + '\',true)"><i class="fa-solid fa-ban"></i> تعليق الحساب</button>') +
        '</div>' +
        (isSuspended ? '<div class="suspended-overlay-preview"><i class="fa-solid fa-lock" style="font-size:2rem;display:block;margin-bottom:8px;"></i>الحساب معلق — جميع صلاحيات الشريك معطلة عدا صفحة الدفع</div>' : '') +
      '</div>' +
    '</div>';
}

function renderInvoices(invoices) {
  var html = '<div class="detail-card"><h3><i class="fa-solid fa-receipt"></i> الفواتير</h3>';
  if (!invoices.length) {
    html += '<p class="muted">لا توجد فواتير بعد.</p>';
  } else {
    html += '<table class="invoice-table"><thead><tr><th>التاريخ</th><th>الفترة</th><th>الإيرادات</th><th>الرسوم</th><th>الضريبة</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>';
    invoices.forEach(function(inv) {
      var invStatus = inv.status === "paid" ? "مدفوع" : inv.status === "overdue" ? "متأخر" : "معلق";
      var invStatusClass = inv.status === "paid" ? "status-delivered" : inv.status === "overdue" ? "status-pending" : "status-pending";
      html += '<tr><td>' + (inv.created_at ? inv.created_at.slice(0,10) : "-") + '</td><td>' + (inv.period_start || "-") + ' - ' + (inv.period_end || "-") + '</td><td>' + pdMoney.format(inv.total_revenue || 0) + '</td><td>' + pdMoney.format(inv.total_fees || 0) + '</td><td>' + pdMoney.format(inv.total_tax || 0) + '</td><td><strong>' + pdMoney.format(inv.total_amount || 0) + '</strong></td><td><span class="status-badge ' + invStatusClass + '">' + invStatus + '</span></td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';
  document.getElementById("partnerInvoicesContent").innerHTML = html;
}

function renderProducts(products) {
  var html = '<div class="detail-card"><h3><i class="fa-solid fa-box"></i> المنتجات المباعة (' + products.length + ')</h3>';
  if (!products.length) {
    html += '<p class="muted">لا توجد منتجات.</p>';
  } else {
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    products.forEach(function(p) {
      html += '<span class="product-tag">' + escapeHtml(p.name || p.product_name || "منتج") + '</span>';
    });
    html += '</div>';
  }
  html += '</div>';
  document.getElementById("partnerProductsContent").innerHTML = html;
}

function renderOrders(orders) {
  var html = '<div class="detail-card"><h3><i class="fa-solid fa-truck"></i> الطلبات (' + orders.length + ')</h3>';
  if (!orders.length) {
    html += '<p class="muted">لا توجد طلبات.</p>';
  } else {
    html += '<table class="invoice-table"><thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>العميل</th><th>المنتج</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>';
    orders.forEach(function(o) {
      var itemsList = (o.items || []).map(function(i) { return i.name || ""; }).filter(Boolean).join(", ");
      var orderStatus = o.status === "delivered" ? "تم التسليم" : o.status === "shipped" ? "تم الشحن" : o.status === "preparing" ? "جاري التجهيز" : "قيد المراجعة";
      html += '<tr><td>' + escapeHtml(String(o.id).slice(0,8)) + '</td><td>' + (o.created_at ? o.created_at.slice(0,10) : "-") + '</td><td>' + escapeHtml(o.customer_name || "") + '</td><td>' + escapeHtml(itemsList) + '</td><td>' + pdMoney.format(o.total || 0) + '</td><td>' + orderStatus + '</td></tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';
  document.getElementById("partnerOrdersContent").innerHTML = html;
}

async function toggleSuspend(userId, email, suspend) {
  if (!userId && !email) { showToast("بيانات الشريك غير مكتملة", "error"); return; }
  var action = suspend ? "تعليق" : "إلغاء تعليق";
  if (!confirm("تأكيد " + action + " الحساب؟")) return;

  var match = {};
  if (userId) match.user_id = userId;
  if (email) match.email = email;

  var newStatus = suspend ? "suspended" : "active";
  var updateData = { status: newStatus, updated_at: new Date().toISOString() };
  if (suspend) updateData.suspended_at = new Date().toISOString();
  else updateData.suspended_at = null;

  var { data: existing } = await pdClient.from("partner_accounts").select("id")
    .or("user_id.eq." + userId + (email ? ",email.eq." + email : ""))
    .maybeSingle();

  if (existing) {
    var { error } = await pdClient.from("partner_accounts").update(updateData).eq("id", existing.id);
    if (error) { showToast("خطأ: " + error.message, "error"); return; }
  } else {
    var insertData = { user_id: userId, email: email, full_name: "", status: newStatus };
    if (suspend) insertData.suspended_at = new Date().toISOString();
    var { error } = await pdClient.from("partner_accounts").insert(insertData);
    if (error) { showToast("خطأ: " + error.message, "error"); return; }
  }

  showToast(suspend ? "تم تعليق الحساب" : "تم إلغاء تعليق الحساب", "success");
  setTimeout(function() { loadDetail(); }, 500);
}

async function sendNotification(userId, email) {
  if (!email) { showToast("البريد الإلكتروني مطلوب", "error"); return; }
  var msg = prompt("رسالة الإشعار:", "يرجى دفع الفواتير المستحقة خلال 7 أيام وإلا سيتم تعليق الحساب.");
  if (!msg) return;
  showToast("جاري إرسال الإشعار...", "info");
  var { error } = await pdClient.from("partner_notifications").insert({
    partner_email: email,
    partner_id: userId || "",
    type: "admin_note",
    title: "إشعار من الإدارة",
    message: msg
  }).maybeSingle();
  if (error && !error.message.includes("does not exist")) {
    showToast("خطأ: " + error.message, "error");
  } else {
    showToast("تم إرسال الإشعار", "success");
  }
}

document.addEventListener("DOMContentLoaded", loadDetail);

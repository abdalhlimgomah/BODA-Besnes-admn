const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allComplaints = [];

function showToast(message, type) {
  if (!type) type = "info";
  var wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  var toast = document.createElement("div");
  toast.className = "toast-item toast-" + type;
  toast.textContent = message;
  wrap.appendChild(toast);
  setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(function () { toast.remove(); }, 220);
  }, 2200);
}

function badge(status) {
  if (status === "replied") return '<span class="badge-replied">تم الرد</span>';
  if (status === "closed") return '<span class="badge-closed">مغلقة</span>';
  return '<span class="badge-pending">قيد الانتظار</span>';
}

function formatDate(d) {
  if (!d) return "-";
  var dt = new Date(d);
  if (isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("ar-EG");
}

function filterComplaints() {
  var query = document.getElementById("searchInput").value.trim().toLowerCase();
  var statusFilter = document.getElementById("filterStatus").value;
  return allComplaints.filter(function (c) {
    if (statusFilter && c.status !== statusFilter) return false;
    if (query) {
      var name = (c.name || "").toLowerCase();
      var email = (c.email || "").toLowerCase();
      var subject = (c.subject || "").toLowerCase();
      if (name.indexOf(query) === -1 && email.indexOf(query) === -1 && subject.indexOf(query) === -1) return false;
    }
    return true;
  });
}

function renderComplaints() {
  var filtered = filterComplaints();
  var list = document.getElementById("complaints-list");

  if (!filtered.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">لا توجد شكاوي</div>';
    updateSummary();
    return;
  }

  var html =
    '<table class="comp-table"><thead><tr>' +
    "<th>#</th><th>الاسم</th><th>البريد</th><th>الموضوع</th><th>الرسالة</th><th>الرد</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th>" +
    "</tr></thead><tbody>";

  filtered.forEach(function (c, i) {
    html +=
      "<tr>" +
      "<td>" + (i + 1) + "</td>" +
      "<td>" + escapeHtml(c.name || "-") + "</td>" +
      "<td style='direction:ltr;text-align:right;'>" + escapeHtml(c.email || "-") + "</td>" +
      "<td><div class='comp-subject'>" + escapeHtml(c.subject || "-") + "</div></td>" +
      "<td><div class='comp-message-preview' title='" + escapeAttr(c.message || "") + "'>" + escapeHtml((c.message || "").slice(0, 60)) + (c.message && c.message.length > 60 ? "..." : "") + "</div></td>" +
      "<td>" + (c.reply ? "<div class='reply-text'>" + escapeHtml(c.reply.slice(0, 50)) + (c.reply.length > 50 ? "..." : "") + "</div>" : '<span style="color:#9ca3af;">-</span>') + "</td>" +
      "<td>" + badge(c.status) + "</td>" +
      "<td style='font-size:0.8rem;white-space:nowrap;'>" + formatDate(c.created_at) + "</td>" +
      "<td><button class='btn btn-sm btn-primary' onclick='openReplyModal(\"" + c.id + "\")'><i class='fa-solid fa-reply'></i></button></td>" +
      "</tr>";
  });

  html += "</tbody></table>";
  list.innerHTML = html;
  updateSummary();
}

function updateSummary() {
  var total = allComplaints.length;
  var pending = allComplaints.filter(function (c) { return c.status === "pending"; }).length;
  var replied = allComplaints.filter(function (c) { return c.status === "replied"; }).length;

  document.getElementById("summary-cards").innerHTML =
    "<div style='flex:1;min-width:140px;background:#fff;padding:14px 18px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);'>" +
    "<div style='font-size:0.75rem;color:#64748b;font-weight:700;'>الكل</div>" +
    "<div style='font-size:1.5rem;font-weight:900;color:#0f172a;'>" + total + "</div></div>" +
    "<div style='flex:1;min-width:140px;background:#fff;padding:14px 18px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);'>" +
    "<div style='font-size:0.75rem;color:#64748b;font-weight:700;'>بانتظار الرد</div>" +
    "<div style='font-size:1.5rem;font-weight:900;color:#d97706;'>" + pending + "</div></div>" +
    "<div style='flex:1;min-width:140px;background:#fff;padding:14px 18px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05);'>" +
    "<div style='font-size:0.75rem;color:#64748b;font-weight:700;'>تم الرد</div>" +
    "<div style='font-size:1.5rem;font-weight:900;color:#2563eb;'>" + replied + "</div></div>";
}

function escapeHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return String(str || "").replace(/"/g, "&quot;").replace(/&/g, "&amp;");
}

var currentReplyId = null;

function openReplyModal(id) {
  currentReplyId = id;
  var c = null;
  for (var i = 0; i < allComplaints.length; i++) {
    if (String(allComplaints[i].id) === String(id)) { c = allComplaints[i]; break; }
  }
  if (!c) return;

  document.getElementById("reply-info").innerHTML =
    "<strong>" + escapeHtml(c.name || "-") + "</strong> &lt;" + escapeHtml(c.email || "") + "&gt;<br>" +
    "<strong>الموضوع:</strong> " + escapeHtml(c.subject || "") + "<br>" +
    "<strong>الرسالة:</strong> " + escapeHtml(c.message || "");

  document.getElementById("reply-textarea").value = c.reply || "";
  document.getElementById("reply-modal").classList.add("show");
}

function closeReplyModal() {
  document.getElementById("reply-modal").classList.remove("show");
  currentReplyId = null;
}

async function sendReply() {
  if (!currentReplyId) return;
  var reply = document.getElementById("reply-textarea").value.trim();
  if (!reply) {
    showToast("يرجى كتابة الرد", "error");
    return;
  }

  var btn = document.getElementById("send-reply-btn");
  btn.disabled = true;
  btn.textContent = "جاري الإرسال...";

  try {
    var { error } = await supabaseClient.from("complaints").update({
      reply: reply,
      replied_at: new Date().toISOString(),
      status: "replied",
    }).eq("id", currentReplyId);

    if (error) throw error;

    showToast("تم إرسال الرد بنجاح", "success");
    closeReplyModal();
    loadComplaints();
  } catch (err) {
    console.error("[admin-complaints] reply error:", err);
    showToast("فشل إرسال الرد", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "إرسال الرد";
  }
}

async function loadComplaints() {
  try {
    var { data, error } = await supabaseClient.from("complaints").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    allComplaints = data || [];
    renderComplaints();
  } catch (err) {
    console.error("[admin-complaints] load error:", err);
    document.getElementById("complaints-list").innerHTML =
      '<div style="text-align:center;padding:40px;color:#dc2626;">فشل تحميل الشكاوي</div>';
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadComplaints();
  document.getElementById("searchInput").addEventListener("input", renderComplaints);
  document.getElementById("filterStatus").addEventListener("change", renderComplaints);
  setInterval(loadComplaints, 30000);
});

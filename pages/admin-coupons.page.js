const { createClient } = supabase;
const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var coupons = [];
var editingId = null;
var deletingId = null;

function showToast(message, type) {
  var wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  var toast = document.createElement("div");
  toast.className = "toast-item toast-" + (type || "info");
  toast.textContent = message;
  wrap.appendChild(toast);
  setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(function () { toast.remove(); }, 220);
  }, 2600);
}

function readValue(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function safeNumber(val) {
  var n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

var Coupon = {
  async load() {
    var { data, error } = await supabaseClient.from("kobon").select("*").order("cbon");
    if (error) { showToast("خطأ في تحميل الكوبونات: " + error.message, "error"); return; }
    coupons = data || [];
    Coupon.render();
  },

  render() {
    var tbody = document.getElementById("couponsBody");
    var empty = document.getElementById("emptyState");
    var total = document.getElementById("totalCoupons");
    var searchVal = (document.getElementById("couponSearch").value || "").trim().toLowerCase();

    if (total) total.textContent = coupons.length;

    var filtered = coupons;
    if (searchVal) {
      filtered = coupons.filter(function (c) {
        return (c.cbon || "").toLowerCase().includes(searchVal);
      });
    }

    if (!filtered.length) {
      if (tbody) tbody.innerHTML = "";
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";

    tbody.innerHTML = filtered.map(function (c, i) {
      var rate = safeNumber(c.rate);
      var minAmount = safeNumber(c.minimum_amount);
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><span class="coupon-code">' + escapeHtml(c.cbon || "") + '</span></td>' +
        '<td><span class="coupon-rate">' + rate + '%</span></td>' +
        '<td><span class="coupon-min">' + (minAmount > 0 ? minAmount + ' ج.م' : '—') + '</span></td>' +
        '<td class="cell-actions">' +
          '<button class="btn-icon btn-edit" onclick="Coupon.openForm(\'' + escapeAttr(c.id) + '\')" title="تعديل"><i class="fa-solid fa-pen"></i></button>' +
          '<button class="btn-icon btn-delete" onclick="Coupon.openDelete(\'' + escapeAttr(c.id) + '\', \'' + escapeAttr(c.cbon || "") + '\')" title="حذف"><i class="fa-solid fa-trash"></i></button>' +
        '</td>' +
      '</tr>';
    }.bind(this)).join("");
  },

  search() {
    Coupon.render();
  },

  openForm(id) {
    editingId = id || null;
    document.getElementById("cfCode").value = "";
    document.getElementById("cfRate").value = "";
    document.getElementById("cfMinAmount").value = "";
    document.getElementById("couponModalTitle").textContent = id ? "تعديل الكوبون" : "إضافة كوبون جديد";

    if (id) {
      var coupon = coupons.find(function (c) { return c.id === id; });
      if (coupon) {
        document.getElementById("cfCode").value = coupon.cbon || "";
        document.getElementById("cfRate").value = safeNumber(coupon.rate);
        document.getElementById("cfMinAmount").value = safeNumber(coupon.minimum_amount);
      }
    }

    document.getElementById("couponFormModal").classList.add("open");
  },

  closeForm() {
    document.getElementById("couponFormModal").classList.remove("open");
    editingId = null;
  },

  async saveForm() {
    var code = readValue("cfCode");
    var rate = safeNumber(document.getElementById("cfRate").value);
    var minAmount = safeNumber(document.getElementById("cfMinAmount").value);

    if (!code) { showToast("يرجى إدخال كود الكوبون.", "error"); return; }
    if (rate <= 0 || rate > 100) { showToast("نسبة الخصم يجب أن تكون بين 1 و 100.", "error"); return; }

    var payload = { cbon: code, rate: rate, minimum_amount: minAmount };

    if (editingId) {
      var { error } = await supabaseClient.from("kobon").update(payload).eq("id", editingId);
      if (error) { showToast("خطأ في التعديل: " + error.message, "error"); return; }
      showToast("تم تعديل الكوبون بنجاح.", "success");
    } else {
      var { error } = await supabaseClient.from("kobon").insert([payload]);
      if (error) { showToast("خطأ في الإضافة: " + error.message, "error"); return; }
      showToast("تم إضافة الكوبون بنجاح.", "success");
    }

    Coupon.closeForm();
    await Coupon.load();
  },

  openDelete(id, code) {
    deletingId = id;
    document.getElementById("deleteCouponCode").textContent = code || "";
    document.getElementById("deleteCouponModal").classList.add("open");
  },

  closeDelete() {
    document.getElementById("deleteCouponModal").classList.remove("open");
    deletingId = null;
  },

  async confirmDelete() {
    if (!deletingId) return;
    var { error } = await supabaseClient.from("kobon").delete().eq("id", deletingId);
    if (error) { showToast("خطأ في الحذف: " + error.message, "error"); return; }
    showToast("تم حذف الكوبون بنجاح.", "success");
    Coupon.closeDelete();
    await Coupon.load();
  }
};

function escapeHtml(str) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", function () {
  Coupon.load();
});

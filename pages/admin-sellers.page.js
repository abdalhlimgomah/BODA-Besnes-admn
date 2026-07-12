const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

var sb = null;
try {
  if (typeof window !== "undefined" && window.supabase && typeof window.supabase.createClient === "function") {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) { console.warn("Supabase init failed", e); }

var MAX_USES = 8;
var allProfiles = [];
var allAssignments = [];
var activeTab = "profiles";

function showToast(msg, type) {
  type = type || "info";
  var w = document.querySelector(".toast-wrap");
  if (!w) { w = document.createElement("div"); w.className = "toast-wrap"; document.body.appendChild(w); }
  var t = document.createElement("div");
  t.className = "toast-item toast-" + type;
  t.textContent = msg;
  w.appendChild(t);
  setTimeout(function () { t.style.opacity = "0"; t.style.transform = "translateY(-6px)"; setTimeout(function () { t.remove(); }, 220); }, 2200);
}

function esc(v) { return String(v == null ? "" : v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function nowClock() { return new Date().toLocaleTimeString("ar-EG", {hour:"2-digit",minute:"2-digit"}); }

// ─── Tabs ───────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".section-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.section === tab); });
  document.getElementById("profilesSection").style.display = tab === "profiles" ? "" : "none";
  document.getElementById("assignmentsSection").style.display = tab === "assignments" ? "" : "none";
  document.getElementById("poolActions").style.display = tab === "profiles" ? "" : "none";
  filterView();
}

// ─── Profiles ───────────────────────────────────────────
function renderProfiles(list) {
  var el = document.getElementById("profilesList");
  if (!list.length) {
    el.innerHTML = sb
      ? '<div class="empty-state">لا توجد ملفات بائعين في المجموعة</div>'
      : '<div class="empty-state" style="background:#fff3e0;">⚠️ قاعدة البيانات غير متصلة. الملفات تحتاج اتصال بـ Supabase لعرضها.</div>';
    return;
  }
  // Count assignments by profile (for per-card display) + total unused
  var assignCountByProfile = {};
  var localCount = 0;
  allAssignments.forEach(function (a) {
    if (a.profile_id != null) assignCountByProfile[a.profile_id] = (assignCountByProfile[a.profile_id] || 0) + 1;
    if (a._local) localCount++;
  });
  var capTotal = list.length * MAX_USES;
  var usedTotal = Math.min(allAssignments.length, capTotal);

  document.getElementById("profileStats").innerHTML =
    '<div class="summary-box"><p>إجمالي الملفات</p><strong>' + list.length + '</strong></div>' +
    '<div class="summary-box"><p>مستعمل</p><strong>' + usedTotal + ' / ' + capTotal + '</strong></div>' +
    '<div class="summary-box"><p>السعة المتبقية</p><strong style="color:' + (capTotal - usedTotal > 0 ? '#2e7d32' : '#dc3545') + '">' + (capTotal - usedTotal) + '</strong></div>';

  el.innerHTML = list.map(function (p) {
    var realUsed = assignCountByProfile[p.id] || 0;
    var used = Math.max(realUsed, p.used_count || 0);
    var pct = Math.round((used / MAX_USES) * 100);
    var barColor = pct >= 100 ? "#dc3545" : pct > 50 ? "#ffc107" : "#2e7d32";
    var official = p.is_official ? '<span class="official-badge" title="رسمي"><i class="fa-solid fa-check-circle" style="color:#1d72b8;font-size:0.75rem;"></i></span>' : "";
    return (
      '<div class="seller-card">' +
        '<div class="seller-card-inner">' +
          '<div class="seller-info" style="flex:1;min-width:120px;">' +
            '<span class="seller-name">' + esc(p.seller_name) + "</span>" + official +
          "</div>" +
          '<div class="seller-stats" style="flex:2;">' +
            '<span class="seller-stat"><i class="fa-regular fa-clock"></i> ' + esc(p.years_with_buda) + ' س</span>' +
            '<span class="seller-stat"><i class="fa-regular fa-star"></i> ' + Number(p.rating).toFixed(1) + '</span>' +
            '<span class="seller-stat"><i class="fa-regular fa-thumbs-up"></i> ' + esc(p.satisfaction) + '%</span>' +
            '<span class="seller-stat"><i class="fa-regular fa-cart-shopping"></i> ' + esc(p.sales_count) + '+</span>' +
          "</div>" +
          '<div style="flex:1;min-width:100px;">' +
            '<div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;">' +
              '<div style="flex:1;height:6px;background:#eee;border-radius:3px;overflow:hidden;">' +
                '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px;transition:width 0.3s;"></div>' +
              '</div>' +
              '<strong style="font-size:0.72rem;color:' + barColor + '">' + used + '/' + MAX_USES + '</strong>' +
            '</div>' +
          "</div>" +
          '<div class="seller-actions">' +
            '<button class="btn-icon btn-edit" onclick="Admin.openProfileEdit(' + p.id + ')" title="تعديل"><i class="fa-solid fa-pen"></i></button>' +
            '<button class="btn-icon btn-delete" onclick="Admin.openProfileDelete(' + p.id + ')" title="حذف"><i class="fa-solid fa-trash"></i></button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }).join("");
}

// ─── Assignments ────────────────────────────────────────
function renderAssignments(list) {
  var el = document.getElementById("assignmentsList");
  if (!list.length) { el.innerHTML = '<div class="empty-state">لا توجد منتجات مرتبطة ببائعين بعد</div>'; return; }
  var localCount = list.filter(function (s) { return s._local; }).length;
  document.getElementById("assignStats").innerHTML =
    '<div class="summary-box"><p>إجمالي التعيينات</p><strong>' + list.length + '</strong></div>' +
    (localCount ? '<div class="summary-box" style="background:#fff3e0;"><p>محلي فقط (غير مسجل)</p><strong style="color:#e65100;">' + localCount + '</strong></div>' : '');

  el.innerHTML = list.map(function (s) {
    var official = s.is_official ? '<span class="official-badge" title="رسمي"><i class="fa-solid fa-check-circle" style="color:#1d72b8;font-size:0.75rem;"></i></span>' : "";
    return (
      '<div class="seller-card">' +
        '<div class="seller-card-inner">' +
          '<div class="seller-info" style="flex:1;min-width:120px;">' +
            '<span class="seller-name">' + esc(s.seller_name) + "</span>" + official +
            (s._local ? ' <span class="badge badge-local" style="font-size:0.6rem;background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:3px;">محلي</span>' : '') +
          "</div>" +
          '<div class="seller-product-id" style="flex:1;" title="' + esc(s.product_id) + '">' +
            '<code style="font-size:0.72rem;color:#666;direction:ltr;display:inline-block;">' + esc(s.product_id) + '</code>' +
            (s.profile_id ? ' <span style="font-size:0.65rem;color:#999;">→ #' + s.profile_id + '</span>' : "") +
          "</div>" +
          '<div class="seller-stats" style="flex:2;">' +
            '<span class="seller-stat"><i class="fa-regular fa-clock"></i> ' + esc(s.years_with_buda) + ' س</span>' +
            '<span class="seller-stat"><i class="fa-regular fa-star"></i> ' + Number(s.rating).toFixed(1) + '</span>' +
            '<span class="seller-stat"><i class="fa-regular fa-thumbs-up"></i> ' + esc(s.satisfaction) + '%</span>' +
            '<span class="seller-stat"><i class="fa-regular fa-truck"></i> ' + esc(s.shipping_speed || "شحن سريع") + '</span>' +
          "</div>" +
          '<div class="seller-actions">' +
            '<button class="btn-icon btn-delete" onclick="Admin.openAssignDelete(\'' + esc(s.product_id) + '\')" title="حذف التعيين"><i class="fa-solid fa-trash"></i></button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }).join("");
}

function filterView() {
  var q = (document.getElementById("searchInput").value || "").trim().toLowerCase();
  if (activeTab === "profiles") {
    var f = q ? allProfiles.filter(function (p) { return (p.seller_name||"").toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q); }) : allProfiles;
    renderProfiles(f);
  } else {
    var f = q ? allAssignments.filter(function (s) { return (s.seller_name||"").toLowerCase().includes(q) || (s.product_id||"").toLowerCase().includes(q); }) : allAssignments;
    renderAssignments(f);
  }
}

function loadLocalAssignments() {
  try { return JSON.parse(localStorage.getItem("buda_seller_assignments") || "{}"); } catch (e) { return {}; }
}

// ─── Load ──────────────────────────────────────────────
async function loadAll() {
  allProfiles = [];
  allAssignments = [];

  // Load profiles + assignments from Supabase if available
  if (sb) {
    var pRes = await sb.from("seller_profiles").select("*").order("used_count", { ascending: true });
    if (pRes.error) { console.error(pRes.error); showToast("فشل تحميل الملفات", "error"); } else { allProfiles = pRes.data || []; }

    var aRes = await sb.from("product_sellers").select("*").order("updated_at", { ascending: false });
    if (aRes.error) { console.error(aRes.error); showToast("فشل تحميل التعيينات", "error"); } else { allAssignments = aRes.data || []; }
  } else {
    showToast("Supabase غير متصل — يتم عرض البيانات المحلية فقط", "warning");
  }

  // Also load localStorage assignments (from file:// / offline usage)
  var localMap = loadLocalAssignments();
  var localKeys = Object.keys(localMap);
  if (localKeys.length) {
    var seenIds = {};
    allAssignments.forEach(function (a) { seenIds[a.product_id] = true; });
    localKeys.forEach(function (pid) {
      if (seenIds[pid]) return; // Supabase wins for duplicates
      var record = localMap[pid];
      if (!record || !record.seller) return;
      var s = record.seller;
      allAssignments.push({
        product_id: pid,
        seller_name: s.name || "بائع",
        years_with_buda: s.yearsWithBuda || 0,
        rating: s.rating || 0,
        satisfaction: s.positivePercent || 0,
        sales_count: s.salesCount || 0,
        shipping_speed: s.shippingSpeedText || "شحن سريع",
        is_official: s.isOfficial || false,
        profile_id: null,
        _local: true, // mark as local-only
      });
    });
  }

  document.getElementById("lastRefresh").textContent = nowClock();
  filterView();
  updateSyncButton();
}

function updateSyncButton() {
  var hasLocal = allAssignments.some(function (a) { return a._local; });
  var wrap = document.getElementById("assignStats") || document.body;
  var existing = document.getElementById("syncLocalBtn");
  if (!hasLocal) { if (existing) existing.style.display = "none"; return; }
  if (!existing) {
    var btn = document.createElement("button");
    btn.id = "syncLocalBtn";
    btn.className = "btn btn-primary";
    btn.innerHTML = '<i class="fa-solid fa-upload"></i> مزامنة التعيينات المحلية مع Supabase';
    btn.onclick = syncLocalToSupabase;
    wrap.parentNode.insertBefore(btn, wrap.nextSibling);
  } else { existing.style.display = ""; }
}

async function syncLocalToSupabase() {
  if (!sb) { showToast("Supabase غير متصل", "error"); return; }
  var btn = document.getElementById("syncLocalBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري المزامنة...';
  var localItems = allAssignments.filter(function (a) { return a._local; });
  var ok = 0, fail = 0;
  for (var i = 0; i < localItems.length; i++) {
    var a = localItems[i];
    var { error } = await sb.from("product_sellers").upsert({
      product_id: a.product_id,
      seller_name: a.seller_name,
      years_with_buda: a.years_with_buda,
      rating: a.rating,
      satisfaction: a.satisfaction,
      sales_count: a.sales_count,
      shipping_speed: a.shipping_speed,
      is_official: a.is_official,
      updated_at: new Date().toISOString(),
    }, { onConflict: "product_id" });
    if (error) { console.error("sync failed", a.product_id, error); fail++; }
    else ok++;
  }
  showToast("تمت مزامنة " + ok + " تعيين" + (fail ? "، فشل " + fail : ""), fail ? "warning" : "success");
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> مزامنة التعيينات المحلية مع Supabase';
  loadAll();
}

// ─── Profile add/edit modal ────────────────────────────
var editProfileId = null;

function resetProfileForm() {
  editProfileId = null;
  document.getElementById("pfModalTitle").textContent = "إضافة ملف بائع جديد";
  document.getElementById("pfSellerName").value = "";
  document.getElementById("pfYears").value = "3";
  document.getElementById("pfRating").value = "4.5";
  document.getElementById("pfSatisfaction").value = "95";
  document.getElementById("pfSales").value = "500";
  document.getElementById("pfShipping").value = "شحن سريع";
  document.getElementById("pfOfficial").checked = false;
  document.getElementById("profileFormModal").classList.add("open");
}

function fillProfileForm(p) {
  editProfileId = p.id;
  document.getElementById("pfModalTitle").textContent = "تعديل الملف #" + p.id + " — " + p.seller_name;
  document.getElementById("pfSellerName").value = p.seller_name || "";
  document.getElementById("pfYears").value = p.years_with_buda || 1;
  document.getElementById("pfRating").value = p.rating || 4.5;
  document.getElementById("pfSatisfaction").value = p.satisfaction || 95;
  document.getElementById("pfSales").value = p.sales_count || 0;
  document.getElementById("pfShipping").value = p.shipping_speed || "شحن سريع";
  document.getElementById("pfOfficial").checked = !!p.is_official;
  document.getElementById("profileFormModal").classList.add("open");
}

function saveProfileForm() {
  if (!sb) { showToast("قاعدة البيانات غير متصلة", "error"); return; }
  var name = document.getElementById("pfSellerName").value.trim();
  if (!name) { showToast("يرجى إدخال اسم البائع", "error"); return; }
  var payload = {
    seller_name: name,
    years_with_buda: parseInt(document.getElementById("pfYears").value, 10) || 1,
    rating: parseFloat(document.getElementById("pfRating").value) || 4.5,
    satisfaction: parseInt(document.getElementById("pfSatisfaction").value, 10) || 95,
    sales_count: parseInt(document.getElementById("pfSales").value, 10) || 0,
    shipping_speed: document.getElementById("pfShipping").value.trim() || "شحن سريع",
    is_official: document.getElementById("pfOfficial").checked,
    updated_at: new Date().toISOString(),
  };
  var btn = document.querySelector("#profileFormModal .btn-primary");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  var op = editProfileId
    ? sb.from("seller_profiles").update(payload).eq("id", editProfileId)
    : sb.from("seller_profiles").insert(payload);

  op.then(function (res) {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ';
    if (res && res.error) { showToast("فشل الحفظ: " + res.error.message, "error"); return; }
    showToast(editProfileId ? "تم تحديث الملف" : "تم إضافة الملف", "success");
    document.getElementById("profileFormModal").classList.remove("open");
    loadAll();
  }).catch(function (e) {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ';
    console.error(e); showToast("حدث خطأ", "error");
  });
}

// ─── Delete profile ────────────────────────────────────
var deleteProfileId = null;
function confirmProfileDelete() {
  if (!sb) { showToast("قاعدة البيانات غير متصلة", "error"); return; }
  if (!deleteProfileId) return;
  var btn = document.querySelector("#deleteProfileModal .btn-danger");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحذف...';
  sb.from("seller_profiles").delete().eq("id", deleteProfileId).then(function (res) {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> حذف';
    if (res && res.error) { showToast("فشل الحذف", "error"); return; }
    showToast("تم حذف الملف", "success");
    document.getElementById("deleteProfileModal").classList.remove("open");
    loadAll();
  }).catch(function (e) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> حذف'; console.error(e); showToast("حدث خطأ", "error"); });
}

// ─── Delete assignment ────────────────────────────────
var deleteAssignProductId = null;
function confirmAssignDelete() {
  if (!sb) { showToast("قاعدة البيانات غير متصلة", "error"); return; }
  if (!deleteAssignProductId) return;
  var btn = document.querySelector("#deleteAssignModal .btn-danger");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحذف...';
  sb.from("product_sellers").delete().eq("product_id", deleteAssignProductId).then(function (res) {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> حذف';
    if (res && res.error) { showToast("فشل حذف التعيين", "error"); return; }
    showToast("تم حذف التعيين", "success");
    document.getElementById("deleteAssignModal").classList.remove("open");
    loadAll();
  }).catch(function (e) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> حذف'; console.error(e); showToast("حدث خطأ", "error"); });
}

// ─── Pool batch generator ─────────────────────────────
async function generateBatch() {
  if (!sb) { showToast("قاعدة البيانات غير متصلة — لا يمكن توليد ملفات بدون Supabase", "error"); return; }
  var count = parseInt(document.getElementById("batchCount").value, 10) || 500;
  if (count < 10 || count > 10000) { showToast("العدد يجب أن يكون بين 10 و 10000", "error"); return; }
  var btn = document.getElementById("batchBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التوليد...';
  try {
    var { data, error } = await sb.rpc("generate_seller_profiles", { p_count: count });
    if (error) {
      // RPC not available — fall back to JS-side batch insert
      var profiles = generateProfilesJS(count);
      var { error: insErr } = await sb.from("seller_profiles").insert(profiles);
      if (insErr) throw insErr;
    }
    showToast("تم توليد " + count + " ملف بائع بنجاح", "success");
    loadAll();
  } catch (e) {
    console.error(e);
    showToast("فشل التوليد: " + (e.message || "خطأ غير معروف"), "error");
  }
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> توليد';
}

var NAMES_CORE = [
  "نجوم","سنسن","بصمة","إبداع","أصالة","تميز","فخامة","أناقة",
  "رقي","درة","لؤلؤ","مرجان","ياقوت","زمرد","فيروز","سحر",
  "أمل","ورد","نرجس","ياسمين","فل","ريحان","ندى","شهد",
  "عنبر","مسك","عطر","بهاء","ضياء","نور","قمر",
  "بدر","هلال","شمس","نجم","كوكب","أثير","سمو","مجد",
  "علياء","سندس","إستبرق","حرير","ديباج","أطلس","مخمل",
  "نخيل","بستان","واحة","زهرة","ربيع","كوثر","سلسبيل",
  "نماء","ازدهار","رفعة","علو","سؤدد","مهابة","وقار",
  "حكمة","دراية","خبرة","إتقان","براعة","مهارة",
  "نبع","مورد","غدير","فيض","مدد","عطاء","سنابل",
];
var NAMES_PREFIXES = ["متجر", "بوتيك", "م shop", "ستور", "هاوس", "جallery", "فاشون", "كورنر"];
var NAMES_SUFFIXES = [" للتجارة", " أونلاين", " ستور", " shop", " store", " للتسوق", " الإلكتروني"];
var SPEEDS = ["شحن سريع","شحن فوري","شحن خلال 24 ساعة","توصيل سريع","شحن ممتاز","توصيل فوري"];

function smartSellerName(rng) {
  var core = NAMES_CORE[rng(NAMES_CORE.length)];
  var roll = rng(100);
  if (roll < 20) return NAMES_PREFIXES[rng(NAMES_PREFIXES.length)] + " " + core;
  if (roll < 35) return core + NAMES_SUFFIXES[rng(NAMES_SUFFIXES.length)];
  if (roll < 45) return NAMES_PREFIXES[rng(NAMES_PREFIXES.length)] + " " + core + NAMES_SUFFIXES[rng(NAMES_SUFFIXES.length)];
  return core;
}

function generateProfilesJS(n) {
  var list = [];
  for (var i = 0; i < n; i++) {
    var y = 1 + Math.floor(Math.random() * 10);
    var base = 50 + Math.floor(Math.random() * 200);
    var rating = parseFloat((38 + Math.floor(Math.random() * 12)) / 10);
    // Smarter correlation: higher rating → higher satisfaction (AI-style logic)
    var sat = Math.min(99, Math.round(75 + rating * 5 + Math.random() * 10));
    var official = rating > 4.2 && Math.random() > 0.45;
    list.push({
      seller_name: smartSellerName(function(max) { return Math.floor(Math.random() * max); }),
      years_with_buda: y,
      rating: rating,
      satisfaction: sat,
      sales_count: Math.round(base * (1 + y * 0.25) / 10) * 10,
      shipping_speed: SPEEDS[Math.floor(Math.random() * SPEEDS.length)],
      is_official: official,
    });
  }
  return list;
}

// ─── Auto-assign profiles to products ─────────────────
async function autoAssign() {
  if (!sb) { showToast("قاعدة البيانات غير متصلة", "error"); return; }
  if (!confirm("سيتم توزيع البائعين المتاحين على جميع المنتجات التي ليس لها بائع. هل تريد الاستمرار؟")) return;
  var btn = document.getElementById("autoAssignBtn");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التوزيع...'; }

  try {
    // 1. Get all products
    var { data: products, error: prodErr } = await sb.from("products").select("id,name").limit(5000);
    if (prodErr) {
      // Try taager_products as fallback
      var r2 = await sb.from("taager_products").select("id,name").limit(5000);
      if (r2.error) throw r2.error;
      products = r2.data;
    }
    if (!products || !products.length) { showToast("لا توجد منتجات", "warning"); return; }

    // 2. Get existing assignments
    var { data: existingAssign, error: existErr } = await sb.from("product_sellers").select("product_id");
    if (existErr) throw existErr;
    var assignedIds = {};
    (existingAssign || []).forEach(function (a) { assignedIds[a.product_id] = true; });

    // Filter to only unassigned products
    var unassigned = products.filter(function (p) { return !assignedIds[String(p.id)]; });
    if (!unassigned.length) { showToast("كل المنتجات لها بائعين بالفعل", "info"); return; }

    // 3. Get available profiles (used_count < MAX_USES)
    var { data: profiles, error: profErr } = await sb
      .from("seller_profiles")
      .select("*")
      .lt("used_count", MAX_USES)
      .order("used_count", { ascending: true });
    if (profErr) throw profErr;
    if (!profiles || !profiles.length) { showToast("لا توجد ملفات بائعين متاحة — وَلّد مجموعة جديدة أولاً", "error"); return; }

    // 4. Assign round-robin
    var ok = 0, fail = 0;
    var pi = 0;
    for (var i = 0; i < unassigned.length; i++) {
      var p = unassigned[i];
      var profile = profiles[pi % profiles.length];

      // Check if this profile has capacity
      var currProfiles = profiles.filter(function (x) { return x.id === profile.id; });
      var currUsed = profile.used_count || 0;
      if (currUsed >= MAX_USES) {
        // Move to next profile with capacity
        var found = false;
        for (var j = 0; j < profiles.length; j++) {
          var candidate = profiles[(pi + j) % profiles.length];
          if ((candidate.used_count || 0) < MAX_USES) {
            profile = candidate;
            pi = (pi + j) % profiles.length;
            found = true;
            break;
          }
        }
        if (!found) break; // no more capacity
      }

      var seller = {
        name: profile.seller_name,
        yearsWithBuda: profile.years_with_buda,
        rating: Number(profile.rating) || 4.5,
        positivePercent: Number(profile.satisfaction) || 95,
        salesCount: Number(profile.sales_count) || 500,
        shippingSpeedText: profile.shipping_speed || "شحن سريع",
        isOfficial: Boolean(profile.is_official),
      };

      var { error: upsertErr } = await sb.from("product_sellers").upsert({
        product_id: String(p.id),
        seller_name: seller.name,
        years_with_buda: seller.yearsWithBuda,
        rating: seller.rating,
        satisfaction: seller.positivePercent,
        sales_count: seller.salesCount,
        shipping_speed: seller.shippingSpeedText,
        is_official: seller.isOfficial,
        profile_id: profile.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "product_id" });
      if (upsertErr) { fail++; continue; }
      ok++;

      // Increment used_count
      var newCount = (profile.used_count || 0) + 1;
      profile.used_count = newCount; // update in-memory
      await sb.from("seller_profiles").update({ used_count: newCount, updated_at: new Date().toISOString() }).eq("id", profile.id);
    }

    showToast("تم توزيع " + ok + " بائع" + (fail ? "، فشل " + fail : ""), fail ? "warning" : "success");
    loadAll();
  } catch (e) {
    console.error(e);
    showToast("فشل التوزيع: " + (e.message || "خطأ"), "error");
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrows-split-up-and-left"></i> توزيع تلقائي'; }
}

// ─── Expose ────────────────────────────────────────────
var Admin = {
  switchTab: switchTab,
  openProfileAdd: resetProfileForm,
  openProfileEdit: function (id) { var p = allProfiles.find(function (x) { return Number(x.id) === Number(id); }); if (p) fillProfileForm(p); },
  openProfileDelete: function (id) { deleteProfileId = id; document.getElementById("deleteProfileModal").classList.add("open"); },
  confirmProfileDelete: confirmProfileDelete,
  closeProfileDelete: function () { document.getElementById("deleteProfileModal").classList.remove("open"); },
  openAssignDelete: function (pid) { deleteAssignProductId = pid; document.getElementById("deleteAssignModal").classList.add("open"); },
  confirmAssignDelete: confirmAssignDelete,
  closeAssignDelete: function () { document.getElementById("deleteAssignModal").classList.remove("open"); },
  saveProfileForm: saveProfileForm,
  closeProfileForm: function () { document.getElementById("profileFormModal").classList.remove("open"); },
  generateBatch: generateBatch,
  autoAssign: autoAssign,
};
window.Admin = Admin;
document.getElementById("searchInput").addEventListener("input", filterView);
loadAll();
setInterval(loadAll, 30000);

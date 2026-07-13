const { createClient } = supabase;
const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var partnerEmail = "";
var partnerProducts = [];
var allPartnerProducts = [];

function getPartnerEmail() {
  var params = new URLSearchParams(window.location.search);
  return params.get("email") || "";
}

function getUserEmail(p) {
  return p.email || p.owner_email || p.seller_email || "";
}

function getEmailFirstLetter(email) {
  if (!email) return "?";
  return email.trim().charAt(0).toUpperCase();
}

function escapeHtml(v) { return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function safeText(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }

function safeNumber(value, fallback) {
  if (fallback === undefined) fallback = 0;
  var n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function statusClass(s) { return s === "reviewed" ? "status-reviewed" : s === "rejected" ? "status-rejected" : "status-review"; }
function statusLabel(s) { return s === "reviewed" ? "مقبول" : s === "rejected" ? "مرفوض" : "قيد المراجعة"; }

function showToast(message, type) {
  if (type === undefined) type = "info";
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
  setTimeout(function() {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(function() { toast.remove(); }, 220);
  }, 2600);
}

function splitImageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(function(s) { return String(s || "").trim(); }).filter(Boolean);
  var raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(function(s) { return String(s || "").trim(); }).filter(Boolean);
    } catch(e) {}
  }
  if (/^data:image\//i.test(raw)) return [raw];
  var separators = /[,\n\r;|]+/g;
  if (separators.test(raw)) {
    separators.lastIndex = 0;
    return raw.split(separators).map(function(s) { return s.trim().replace(/^['"]|['"]$/g, ""); }).filter(Boolean);
  }
  return [raw.replace(/^['"]|['"]$/g, "")].filter(Boolean);
}

function collectProductImages(product) {
  var urls = [];
  var push = function(val) {
    if (!val) return;
    var parts = splitImageList(val);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && urls.indexOf(parts[i]) === -1) urls.push(parts[i]);
    }
  };
  push(product.image);
  push(product.img1 || product.image1 || product.image_link1);
  push(product.img2 || product.image2 || product.image_link2);
  push(product.img3 || product.image3 || product.image_link3);
  push(product.img4 || product.image4 || product.image_link4);
  push(product.img5 || product.image5 || product.image_link5);
  push(product.img6 || product.image6 || product.image_link6);
  push(product.img7 || product.image7 || product.image_link7);
  push(product.img8 || product.image8 || product.image_link8);
  push(product.images);
  push(product.extra_links);
  push(product.extraImages);
  push(product.gallery);
  if (product.image_url) push(product.image_url);
  if (product.thumbnail) push(product.thumbnail);
  var dynamicFields = Object.entries(product).filter(function(entry) { return /^image[\s_-]?\d+$/i.test(entry[0]) || /^img[\s_-]?\d+$/i.test(entry[0]); });
  for (var d = 0; d < dynamicFields.length; d++) push(dynamicFields[d][1]);
  return urls.filter(function(u) { return u && u !== "null" && u !== "undefined"; });
}

function getProductVideo(product) {
  return product.video_url || product.video || product.product_video || product.video_link || "";
}

function estimatedDiscount(p) {
  if (safeNumber(p.discount_percent)) return safeNumber(p.discount_percent);
  var orig = safeNumber(p.price);
  var after = safeNumber(p.price_after_discount);
  if (orig > 0 && after > 0 && after < orig) return Math.round((1 - after / orig) * 100);
  return 0;
}

async function loadPartnerProducts() {
  partnerEmail = getPartnerEmail();
  if (!partnerEmail) {
    var loadingEl = document.getElementById("partnerLoading");
    if (loadingEl) loadingEl.textContent = "لم يتم تحديد البريد الإلكتروني";
    return;
  }

  var subEl = document.getElementById("partnerPageSubtitle");
  if (subEl) subEl.textContent = "عرض منتجات: " + partnerEmail;

  // Load partner ID from partner_requests
  try {
    var pr = await supabaseClient.from("partners_requests").select("id").eq("email", partnerEmail).limit(1);
    if (!pr.error && Array.isArray(pr.data) && pr.data.length) {
      safeText("partnerId", pr.data[0].id);
    } else {
      safeText("partnerId", "---");
    }
  } catch(e) {
    safeText("partnerId", "---");
  }

  // Load products
  try {
    var allData = [];
    var page = 0;
    var pageSize = 1000;
    var hasMore = true;
    while (hasMore) {
      var rangeStart = page * pageSize;
      var rangeEnd = rangeStart + pageSize - 1;
      var res = await supabaseClient.from("my_products").select("*").range(rangeStart, rangeEnd);
      if (res.error) throw res.error;
      if (!Array.isArray(res.data)) break;
      allData = allData.concat(res.data);
      if (res.data.length < pageSize) { hasMore = false; }
      else { page++; }
    }
    allPartnerProducts = allData.filter(function(p) {
      return getUserEmail(p).toLowerCase() === partnerEmail.toLowerCase();
    });
  } catch(e) {
    showToast("فشل تحميل المنتجات: " + e.message, "error");
    allPartnerProducts = [];
  }

  renderPartnerProfile();
  applyFilters();
  var loadingEl = document.getElementById("partnerLoading");
  var contentEl = document.getElementById("partnerContent");
  if (loadingEl) loadingEl.classList.add("hidden");
  if (contentEl) contentEl.classList.remove("hidden");
}

function renderPartnerProfile() {
  var letter = getEmailFirstLetter(partnerEmail);
  var total = allPartnerProducts.length;
  var pending = allPartnerProducts.filter(function(p) { return (p.review_status || "pending") === "pending"; }).length;
  var reviewed = allPartnerProducts.filter(function(p) { return p.review_status === "reviewed"; }).length;
  var rejected = allPartnerProducts.filter(function(p) { return p.review_status === "rejected"; }).length;

  safeText("partnerAvatarLetter", letter);
  var badgeEl = document.getElementById("partnerAvatarBadge");
  if (badgeEl) {
    badgeEl.textContent = pending > 0 ? pending : "0";
    badgeEl.style.display = pending > 0 ? "flex" : "none";
  }
  safeText("partnerEmail", partnerEmail);
  safeText("partnerTotalCount", total);
  safeText("partnerPendingCount", pending);
  safeText("partnerApprovedCount", reviewed);
  safeText("partnerRejectedCount", rejected);

  // First product date
  var dates = allPartnerProducts.map(function(p) { return p.created_at; }).filter(Boolean).sort();
  if (dates.length) {
    safeText("partnerFirstDate", new Date(dates[0]).toLocaleDateString("ar-EG"));
  }
}

function applyFilters() {
  var searchEl = document.getElementById("partnerSearch");
  var filterEl = document.getElementById("partnerReviewFilter");
  var query = searchEl ? searchEl.value.trim().toLowerCase() : "";
  var reviewFilter = filterEl ? filterEl.value : "all";
  var filtered = allPartnerProducts.slice();

  if (query) {
    filtered = filtered.filter(function(item) {
      return (item.product_name || "").toLowerCase().includes(query) ||
             (item.name || "").toLowerCase().includes(query);
    });
  }
  if (reviewFilter !== "all") {
    filtered = filtered.filter(function(item) { return (item.review_status || "pending") === reviewFilter; });
  }

  filtered.sort(function(a, b) {
    var aStatus = a.review_status || "pending";
    var bStatus = b.review_status || "pending";
    if (aStatus === "pending" && bStatus !== "pending") return -1;
    if (aStatus !== "pending" && bStatus === "pending") return 1;
    return 0;
  });

  partnerProducts = filtered;
  renderProducts(filtered);
}

function renderProducts(products) {
  var grid = document.getElementById("partnerProductsGrid");
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = '<div class="empty-state">لا توجد منتجات</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var status = p.review_status || "pending";
    var images = collectProductImages(p);
    var video = getProductVideo(p);
    var priceAfter = p.price_after_discount ? safeNumber(p.price_after_discount) : safeNumber(p.price);
    var discount = estimatedDiscount(p);

    var imgHtml = "";
    if (images.length) {
      var galleryClass = images.length > 1 ? " has-gallery" : "";
      imgHtml += '<div class="product-card-media' + galleryClass + '">';
      for (var j = 0; j < images.length; j++) {
        imgHtml += '<img class="admin-card-img' + (j === 0 ? ' active' : '') + '" data-index="' + j + '" src="' + escapeHtml(images[j]) + '" onerror="this.style.display=\'none\'" />';
      }
      imgHtml += '<span class="admin-card-counter"><i class="fa-solid fa-image"></i> ' + images.length + '</span>';
      if (video) {
        imgHtml += '<span class="admin-video-badge"><i class="fa-solid fa-play"></i></span>';
      }
      if (images.length > 1) {
        imgHtml += '<div class="admin-card-dots">';
        for (var k = 0; k < images.length; k++) {
          imgHtml += '<span class="' + (k === 0 ? 'active' : '') + '" data-index="' + k + '"></span>';
        }
        imgHtml += '</div>';
      }
      imgHtml += '</div>';
    } else if (video) {
      imgHtml += '<div class="product-card-media">';
      imgHtml += '<span class="admin-card-counter"><i class="fa-solid fa-video"></i> فيديو</span>';
      imgHtml += '</div>';
    }

    html += '<article class="product-card" data-id="' + p.id + '"' + (video ? ' data-video="' + escapeHtml(video) + '"' : '') + '>';
    if (imgHtml) html += imgHtml;
    html += '<div class="product-card-header">';
    html += '<h4>' + escapeHtml(p.product_name || p.name || "-") + '</h4>';
    html += '<span class="status-pill ' + statusClass(status) + '">' + statusLabel(status) + '</span>';
    html += '</div>';
    html += '<div class="product-meta">';
    html += '<span><i class="fa-solid fa-tag"></i> ' + safeNumber(p.price || 0).toFixed(2) + '</span>';
    html += '<span><i class="fa-solid fa-percent"></i> ' + priceAfter.toFixed(2) + '</span>';
    html += '<span><i class="fa-solid fa-box"></i> ' + (p.quantity || p.stock || 0) + '</span>';
    html += '<span><i class="fa-solid fa-layer-group"></i> ' + escapeHtml(p.category || "-") + '</span>';
    html += '</div>';
    if (p.description) {
      html += '<p class="product-card-desc">' + escapeHtml(p.description.slice(0, 120)) + (p.description.length > 120 ? "..." : "") + '</p>';
    }
    html += '<div class="product-card-footer">';
    html += '<small>' + (p.created_at ? new Date(p.created_at).toLocaleDateString("ar-EG") : "") + '</small>';
    html += '</div>';
    html += '<div class="product-actions">';
    html += '<button class="review-btn approve-btn" data-action="review" data-status="reviewed" data-id="' + p.id + '"><i class="fa-solid fa-check"></i> موافقة</button>';
    html += '<button class="review-btn pending-btn" data-action="review" data-status="pending" data-id="' + p.id + '"><i class="fa-solid fa-clock"></i> انتظار</button>';
    html += '<button class="review-btn reject-btn" data-action="review" data-status="rejected" data-id="' + p.id + '"><i class="fa-solid fa-xmark"></i> رفض</button>';
    html += '<button class="delete-btn" data-action="delete" data-id="' + p.id + '"><i class="fa-solid fa-trash"></i></button>';
    html += '</div>';
    html += '</article>';
  }
  grid.innerHTML = html;
}

function cleanPayload_obj(obj) {
  var out = {};
  for (var k in obj) {
    if (obj.hasOwnProperty(k) && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k];
  }
  return out;
}

async function syncProductToLive(product) {
  var existing = await supabaseClient.from("products").select("id").eq("id", product.id).limit(1);
  if (!existing.error && Array.isArray(existing.data) && existing.data.length) return true;

  var images = [];
  if (product.image) images.push(product.image);
  if (product.img1) images.push(product.img1);
  if (product.img2) images.push(product.img2);
  if (product.img3) images.push(product.img3);
  if (product.img4) images.push(product.img4);
  if (product.img5) images.push(product.img5);
  [1,2,3,4,5,6,7,8].forEach(function(i) {
    var v = product["image"+i] || product["image_link"+i] || "";
    if (v && images.indexOf(v) === -1) images.push(v);
  });
  if (product.images) {
    var arr = Array.isArray(product.images) ? product.images : String(product.images).split(",");
    arr.forEach(function(v) { if (v && images.indexOf(v) === -1) images.push(v); });
  }
  var firstImage = images[0] || "";

  var email = product.email || product.owner_email || product.seller_email || "";
  var phone = product.phone || product.owner_phone || "";
  var price = Number(product.price || product.amount || 0) || 0;
  var quantity = Number(product.quantity || product.stock || 0) || 0;
  var now = new Date().toISOString();

  var payloads = [];
  payloads.push(cleanPayload_obj({
    name: product.name || product.product_name || "",
    product_name: product.name || product.product_name || "",
    title: product.name || product.product_name || "",
    price: price,
    amount: price,
    quantity: quantity,
    stock: quantity,
    description: product.description || product.desc || "",
    desc: product.description || product.desc || "",
    category: product.category || product.store_category || "",
    store_category: product.category || product.store_category || "",
    image: firstImage,
    image_url: firstImage,
    image_link1: firstImage,
    img1: firstImage,
    video_url: product.video_url || product.video || "",
    video: product.video_url || product.video || "",
    email: email,
    owner_email: email,
    seller_email: email,
    phone: phone,
    owner_phone: phone,
    created_at: now,
    updated_at: now,
    source: "partner",
    legacy_my_products_id: String(product.id || ""),
  }));

  payloads.push(cleanPayload_obj({
    name: product.name || product.product_name || "",
    price: price,
    description: product.description || product.desc || "",
    category: product.category || product.store_category || "",
    quantity: quantity,
    image: firstImage,
    email: email,
    seller_email: email,
    phone: phone,
    created_at: now,
    updated_at: now,
    source: "partner",
    legacy_my_products_id: String(product.id || ""),
  }));

  var lastError = null;
  for (var pi = 0; pi < payloads.length; pi++) {
    var candidate = payloads[pi];
    for (var attempt = 0; attempt < 10; attempt++) {
      if (!Object.keys(candidate).length) break;
      var res = await supabaseClient.from("products").insert([candidate]);
      if (!res.error) return true;
      lastError = res.error;
      var msg = (res.error && res.error.message) || "";
      var badCol = null;
      var m = msg.match(/['"]([^'"]+)['"]/);
      if (m) badCol = m[1];
      if (badCol && candidate.hasOwnProperty(badCol)) { delete candidate[badCol]; continue; }
      if (Number(res.status) === 400) {
        var keys = Object.keys(candidate);
        if (keys.length) delete candidate[keys[keys.length - 1]];
        continue;
      }
      break;
    }
  }
  console.warn("syncProductToLive failed", lastError);
  return false;
}

async function removeProductFromLive(id) {
  var sid = String(id);
  var r1 = await supabaseClient.from("products").delete().eq("legacy_my_products_id", sid);
  if (r1.error) {
    await supabaseClient.from("products").delete().eq("id", sid);
  }
}

async function updateProductReview(id, status, btn) {
  btn.disabled = true;
  btn.textContent = "...";
  try {
    var payload = { review_status: status };
    if (status === "reviewed") payload.reviewed_at = new Date().toISOString();
    var res = await supabaseClient.from("my_products").update(payload).eq("id", id);
    if (res.error) throw res.error;
    if (status === "reviewed") {
      var getRes = await supabaseClient.from("my_products").select("*").eq("id", id).limit(1);
      if (!getRes.error && Array.isArray(getRes.data) && getRes.data.length) {
        var synced = await syncProductToLive(getRes.data[0]);
        if (!synced) showToast("تم التحديث لكن فشل الإضافة للمنتجات الحية", "warning");
      }
    } else {
      await removeProductFromLive(id);
    }
    showToast("تم تحديث الحالة", "success");
    loadPartnerProducts();
  } catch(e) {
    showToast("فشل التحديث: " + e.message, "error");
    btn.disabled = false;
    btn.textContent = status === "reviewed" ? "موافقة" : status === "rejected" ? "رفض" : "انتظار";
  }
}

async function deleteProduct(id) {
  if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;
  try {
    var res = await supabaseClient.from("my_products").delete().eq("id", id);
    if (res.error) throw res.error;
    showToast("تم الحذف", "success");
    loadPartnerProducts();
  } catch(e) {
    showToast("فشل الحذف: " + e.message, "error");
  }
}

function handleGridClick(e) {
  var card = e.target.closest(".product-card");
  if (!card) return;

  var btn = e.target.closest("button[data-action]");
  if (btn) {
    e.stopPropagation();
    var action = btn.dataset.action;
    var id = btn.dataset.id;
    if (!id) return;
    if (action === "review") {
      updateProductReview(id, btn.dataset.status, btn);
    } else if (action === "delete") {
      deleteProduct(id);
    }
    return;
  }

  var dot = e.target.closest(".admin-card-dots span");
  if (dot) {
    e.stopPropagation();
    var idx = parseInt(dot.dataset.index, 10);
    var imgs = card.querySelectorAll(".admin-card-img");
    imgs.forEach(function(img, i) { img.classList.toggle("active", i === idx); });
    var dots = card.querySelectorAll(".admin-card-dots span");
    dots.forEach(function(d, i) { d.classList.toggle("active", i === idx); });
    var counter = card.querySelector(".admin-card-counter");
    if (counter) counter.innerHTML = '<i class="fa-solid fa-image"></i> ' + (idx + 1) + "/" + imgs.length;
    return;
  }

  var mediaArea = e.target.closest(".product-card-media");
  if (mediaArea) {
    e.stopPropagation();
    var images = [];
    mediaArea.querySelectorAll(".admin-card-img").forEach(function(img) { if (img.src) images.push(img.src); });
    var card = mediaArea.closest(".product-card");
    var videoUrl = card ? card.dataset.video : "";
    if (videoUrl && images.indexOf(videoUrl) === -1) images.push(videoUrl);
    var activeImg = mediaArea.querySelector(".admin-card-img.active");
    var startIdx = activeImg ? parseInt(activeImg.dataset.index, 10) : 0;
    if (images.length > 0) openGallery(images, startIdx);
    return;
  }
}

function openGallery(images, startIndex) {
  var overlay = document.createElement("div");
  overlay.className = "admin-gallery-overlay";
  var currentIdx = startIndex || 0;

  function renderGallery() {
    var slidesHtml = "";
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      if (/\.(mp4|webm|ogg|mov)$/i.test(img) || img.indexOf("video") !== -1) {
        slidesHtml += '<video class="admin-gallery-slide' + (i === currentIdx ? ' active' : '') + '" data-index="' + i + '" controls><source src="' + escapeHtml(img) + '"></video>';
      } else {
        slidesHtml += '<img class="admin-gallery-slide' + (i === currentIdx ? ' active' : '') + '" data-index="' + i + '" src="' + escapeHtml(img) + '" />';
      }
    }
    var dotsHtml = "";
    for (var j = 0; j < images.length; j++) {
      dotsHtml += '<span class="' + (j === currentIdx ? 'active' : '') + '" data-index="' + j + '"></span>';
    }
    overlay.innerHTML = '<div class="admin-gallery-inner">' +
      '<button class="admin-gallery-close" id="galleryClose"><i class="fa-solid fa-xmark"></i></button>' +
      '<div class="admin-gallery-main">' +
        (images.length > 1 ? '<button class="admin-gallery-arrow" id="galleryPrev"><i class="fa-solid fa-chevron-right"></i></button>' : '') +
        '<div class="admin-gallery-stage">' + slidesHtml + '</div>' +
        (images.length > 1 ? '<button class="admin-gallery-arrow" id="galleryNext"><i class="fa-solid fa-chevron-left"></i></button>' : '') +
      '</div>' +
      '<div class="admin-gallery-bottom">' +
        '<span class="admin-gallery-counter">' + (currentIdx + 1) + '/' + images.length + '</span>' +
        '<div class="admin-gallery-dots">' + dotsHtml + '</div>' +
      '</div>' +
    '</div>';

    var closeBtn = overlay.querySelector("#galleryClose");
    if (closeBtn) closeBtn.addEventListener("click", function() { overlay.remove(); });

    var prevBtn = overlay.querySelector("#galleryPrev");
    var nextBtn = overlay.querySelector("#galleryNext");
    if (prevBtn) prevBtn.addEventListener("click", function() { currentIdx = (currentIdx - 1 + images.length) % images.length; renderGallery(); });
    if (nextBtn) nextBtn.addEventListener("click", function() { currentIdx = (currentIdx + 1) % images.length; renderGallery(); });

    overlay.querySelectorAll(".admin-gallery-dots span").forEach(function(dot) {
      dot.addEventListener("click", function() { currentIdx = parseInt(dot.dataset.index, 10); renderGallery(); });
    });

    overlay.addEventListener("click", function(e) { if (e.target === overlay) overlay.remove(); });
    document.addEventListener("keydown", function keyHandler(ke) {
      if (ke.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", keyHandler); }
      if (ke.key === "ArrowLeft") { currentIdx = (currentIdx + 1) % images.length; renderGallery(); document.removeEventListener("keydown", keyHandler); }
      if (ke.key === "ArrowRight") { currentIdx = (currentIdx - 1 + images.length) % images.length; renderGallery(); document.removeEventListener("keydown", keyHandler); }
    });
  }
  renderGallery();
  document.body.appendChild(overlay);
}

var psEl = document.getElementById("partnerSearch");
if (psEl) psEl.addEventListener("input", applyFilters);
var rfEl = document.getElementById("partnerReviewFilter");
if (rfEl) rfEl.addEventListener("change", applyFilters);
var pgEl = document.getElementById("partnerProductsGrid");
if (pgEl) pgEl.addEventListener("click", handleGridClick);
var exportEl = document.getElementById("partnerExportBtn");
if (exportEl) exportEl.addEventListener("click", exportCSV);

function exportCSV() {
  if (!partnerProducts.length) { showToast("لا توجد منتجات للتصدير", "warning"); return; }
  var rows = [["المنتج", "السعر", "السعر بعد الخصم", "الكمية", "التصنيف", "الحالة", "التاريخ"]];
  for (var i = 0; i < partnerProducts.length; i++) {
    var p = partnerProducts[i];
    rows.push([
      p.product_name || p.name || "",
      safeNumber(p.price || 0).toFixed(2),
      (p.price_after_discount ? safeNumber(p.price_after_discount) : safeNumber(p.price)).toFixed(2),
      p.quantity || p.stock || 0,
      p.category || "",
      p.review_status || "pending",
      p.created_at || ""
    ]);
  }
  var csv = rows.map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
  var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "منتجات_الشريك_" + partnerEmail.replace(/[^a-zA-Z0-9]/g, "_") + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  showToast("تم التصدير", "success");
}

loadPartnerProducts();
setInterval(loadPartnerProducts, 10000);

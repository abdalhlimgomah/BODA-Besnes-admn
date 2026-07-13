const { createClient } = supabase;
const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let allProducts = [];
let pendingApprovalsCount = 0;

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
  }, 2600);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(v) { return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function splitImageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(s => String(s || "").trim()).filter(Boolean);
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(s => String(s || "").trim()).filter(Boolean);
    } catch {}
  }
  if (/^data:image\//i.test(raw)) return [raw];
  const separators = /[,\n\r;|]+/g;
  if (separators.test(raw)) {
    separators.lastIndex = 0;
    return raw.split(separators).map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  return [raw.replace(/^['"]|['"]$/g, "")].filter(Boolean);
}

function collectProductImages(product) {
  const urls = [];
  const push = (val) => {
    if (!val) return;
    const parts = splitImageList(val);
    parts.forEach(p => { if (p && urls.indexOf(p) === -1) urls.push(p); });
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
  const dynamicFields = Object.entries(product).filter(([k]) => /^image[\s_-]?\d+$/i.test(k) || /^img[\s_-]?\d+$/i.test(k));
  dynamicFields.forEach(([, v]) => push(v));
  return urls.filter(u => u && u !== "null" && u !== "undefined");
}

function getProductVideo(product) {
  return product.video_url || product.video || product.product_video || product.video_link || "";
}

function buildStorePayloadFromReview(product) {
  const price = safeNumber(product.price);
  const discountPct = safeNumber(product.discount_percent);
  const discountedPrice = price - (price * discountPct) / 100;
  const images = collectProductImages(product);
  const primaryImage = images[0] || "";
  const extraLinks = images.slice(1).join(", ");
  const video = getProductVideo(product);
  const productName = product.product_name || product.name || "";
  const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || `product-${product.id || Date.now()}`;

  const payload = {
    product_name: productName,
    name: productName,
    price: price || safeNumber(product.amount),
    price_after_discount: discountedPrice || safeNumber(product.price_after_discount || product.final_price || product.sale_price),
    description: product.description || product.desc || "",
    stock: safeNumber(product.quantity || product.stock),
    category: product.category || product.store_category || "",
    img1: primaryImage,
    image: primaryImage,
    extra_links: extraLinks,
    video_url: video,
    video: video,
    product_video: video,
    video_link: video,
    slug: slug,
    status: "active",
    legacy_my_products_id: product.id,
  };

  for (let i = 2; i <= 8; i++) {
    const val = product[`img${i}`] || product[`image${i}`] || product[`image_link${i}`] || "";
    if (val) {
      payload[`image${i}`] = val;
      payload[`img${i}`] = val;
    }
  }
  if (product.email || product.owner_email || product.seller_email) {
    payload.seller_email = product.email || product.owner_email || product.seller_email || "";
    payload.owner_email = product.email || product.owner_email || product.seller_email || "";
  }
  if (product.phone || product.owner_phone || product.mobile) {
    payload.owner_phone = product.phone || product.owner_phone || product.mobile || "";
  }

  return payload;
}

function buildStoreInsertCandidates(product) {
  const payload = buildStorePayloadFromReview(product);
  const candidates = [];

  candidates.push({
    label: "base",
    payload: { ...payload },
  });

  const minimalPayload = {
    product_name: payload.product_name,
    name: payload.name,
    price: payload.price,
    price_after_discount: payload.price_after_discount,
    image: payload.image,
    extra_links: payload.extra_links,
    video_url: payload.video_url,
    slug: payload.slug,
    status: "active",
    category: payload.category,
    description: payload.description,
    stock: payload.stock,
    legacy_my_products_id: payload.legacy_my_products_id,
  };
  candidates.push({
    label: "minimal",
    payload: minimalPayload,
  });

  candidates.push({
    label: "core",
    payload: {
      product_name: payload.product_name,
      name: payload.name,
      price: payload.price,
      price_after_discount: payload.price_after_discount,
      image: payload.image,
      extra_links: payload.extra_links,
      category: payload.category,
      description: payload.description,
      stock: payload.stock,
      slug: payload.slug || `product-${Date.now()}`,
      status: "active",
      legacy_my_products_id: product.id,
    },
  });

  return candidates;
}

async function insertWithFallback(table, payload, id, attempt = 1, maxAttempts = 30) {
  const candidate = { ...payload };
  try {
    const { data, error } = await supabaseClient.from(table).insert([candidate]).select();
    if (error) {
      if (attempt >= maxAttempts) {
        console.error(`insertWithFallback فشل بعد ${attempt} محاولة:`, error.message, Object.keys(candidate));
        return { error };
      }
      const msg = (error.message || "").toLowerCase();
      let columnToRemove = null;

      const schemaCacheMatch = msg.match(/could not find the '([^']+)' column/i);
      if (schemaCacheMatch) {
        columnToRemove = schemaCacheMatch[1];
      } else {
        const colMatch = msg.match(/column\s+"([^"]+)"/i);
        if (colMatch) {
          columnToRemove = colMatch[1];
        } else {
          const doesNotExist = msg.match(/([a-z_][a-z0-9_]*)\s+does\s+not\s+exist/i);
          if (doesNotExist) columnToRemove = doesNotExist[1];
        }
      }

      if (columnToRemove && columnToRemove in candidate) {
        console.log(`إزالة العمود غير الموجود: ${columnToRemove} (محاولة ${attempt})`);
        delete candidate[columnToRemove];
        return insertWithFallback(table, candidate, id, attempt + 1, maxAttempts);
      }

      const typeMatch = msg.match(/column\s+"([^"]+)"\s+is\s+of\s+type/i);
      if (typeMatch) {
        columnToRemove = typeMatch[1];
        if (columnToRemove in candidate) {
          console.log(`إزالة العمود: ${columnToRemove} (خطأ نوع) (محاولة ${attempt})`);
          delete candidate[columnToRemove];
          return insertWithFallback(table, candidate, id, attempt + 1, maxAttempts);
        }
      }

      console.error(`insertWithFallback غير قادر على معالجة الخطأ (محاولة ${attempt}):`, error.message, Object.keys(candidate));
      return { error };
    }
    return { data, error: null };
  } catch (err) {
    if (attempt >= maxAttempts) {
      console.error(`insertWithFallback استثناء بعد ${attempt} محاولة:`, err);
      return { error: err };
    }
    return insertWithFallback(table, candidate, id, attempt + 1, maxAttempts);
  }
}

async function publishProductToStore(product) {
  // Check if product already exists in products table (edited product)
  var existingProduct = null;
  for (var searchCol of ["legacy_my_products_id", "id"]) {
    try {
      var searchResult = await supabaseClient.from("products").select("*").eq(searchCol, product.id).limit(1);
      if (!searchResult.error && Array.isArray(searchResult.data) && searchResult.data.length) {
        existingProduct = searchResult.data[0];
        break;
      }
    } catch (e) {}
  }

  if (existingProduct) {
    // Product exists → UPDATE instead of INSERT
    var updatePayload = buildStorePayloadFromReview(product);
    if (updatePayload.legacy_my_products_id) delete updatePayload.legacy_my_products_id;
    if (updatePayload.slug) delete updatePayload.slug;
    if (updatePayload.status) delete updatePayload.status;

    console.log("publishProductToStore تحديث المنتج الموجود:", existingProduct.id);
    var upResult = await supabaseClient.from("products").update(updatePayload).eq("id", existingProduct.id).select("*").limit(1);
    if (!upResult.error) {
      console.log("publishProductToStore نجح التحديث");
      return { success: true, label: "update" };
    }
    console.error("publishProductToStore فشل التحديث:", upResult.error.message);
    // Fall through to INSERT if update fails
  }

  const candidates = buildStoreInsertCandidates(product);

  for (const candidate of candidates) {
    console.log(`publishProductToStore محاولة: ${candidate.label}`, Object.keys(candidate.payload));
    const result = await insertWithFallback("products", candidate.payload, product.id);
    if (!result.error) {
      console.log(`publishProductToStore نجح بـ: ${candidate.label}`);
      return { success: true, label: candidate.label };
    }
    console.error(`publishProductToStore فشل ${candidate.label}:`, result.error.message);
  }

  const emergencyPayload = {
    name: product.product_name || product.name || "منتج",
    price: safeNumber(product.price || product.amount),
    image: product.image || product.img1 || "",
    extra_links: collectProductImages(product).join(", "),
    status: "active",
    legacy_my_products_id: product.id,
  };
  console.log("publishProductToStore محاولة أخيرة (طارئة)", Object.keys(emergencyPayload));
  const result = await insertWithFallback("products", emergencyPayload, product.id, 1, 50);
  if (!result.error) {
    console.log("publishProductToStore نجحت المحاولة الطارئة");
    return { success: true, label: "emergency" };
  }
  console.error("publishProductToStore جميع المحاولات فشلت:", result.error);
  return { success: false, error: result.error };
}

function statusLabel(status) {
  if (status === "reviewed") return "تمت الموافقة";
  if (status === "rejected") return "مرفوض";
  return "قيد الانتظار";
}

function statusClass(status) {
  if (status === "reviewed") return "status-reviewed";
  if (status === "rejected") return "status-rejected";
  return "status-review";
}

function priceAfterDiscount(item) {
  const price = Number(item.price) || 0;
  const discount = Number(item.discount_percent) || 0;
  return price - (price * discount) / 100;
}

function estimatedDiscount(price, priceAfterDiscount) {
  if (!price || !priceAfterDiscount || price <= 0 || priceAfterDiscount > price) return 0;
  return Math.round(((price - priceAfterDiscount) / price) * 100);
}

function getUserEmail(p) {
  return p.email || p.owner_email || p.seller_email || "";
}

function getEmailFirstLetter(email) {
  if (!email) return "?";
  return email.trim().charAt(0).toUpperCase();
}

function renderProducts(products) {
  var grid = document.getElementById("productsGrid");
  if (!products.length) {
    grid.innerHTML = '<div class="empty-state">لا توجد منتجات مطابقة</div>';
    return;
  }
  var grouped = {};
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var email = getUserEmail(p);
    if (!email) email = "غير معروف";
    var normEmail = email.trim().toLowerCase();
    if (!grouped[normEmail]) {
      grouped[normEmail] = { email: email, products: [] };
    }
    grouped[normEmail].products.push(p);
  }
  var entries = Object.values(grouped);
  entries.sort(function(a, b) {
    var aPending = a.products.filter(function(p) { return (p.review_status || "pending") === "pending"; }).length;
    var bPending = b.products.filter(function(p) { return (p.review_status || "pending") === "pending"; }).length;
    return bPending - aPending || b.products.length - a.products.length;
  });
  var html = "";
  for (var e = 0; e < entries.length; e++) {
    var entry = entries[e];
    var firstLetter = getEmailFirstLetter(entry.email);
    var total = entry.products.length;
    var pendingCount = entry.products.filter(function(p) { return (p.review_status || "pending") === "pending"; }).length;
    var reviewedCount = entry.products.filter(function(p) { return p.review_status === "reviewed"; }).length;
    var rejectedCount = entry.products.filter(function(p) { return p.review_status === "rejected"; }).length;
    var encodedEmail = encodeURIComponent(entry.email);
    var dates = entry.products.map(function(p) { return p.created_at; }).filter(Boolean).sort();
    var latestDate = dates.length ? new Date(dates[dates.length - 1]).toLocaleDateString("ar-EG") : "";
    html += '<article class="user-card" data-email="' + encodedEmail + '">';
    if (pendingCount > 0) {
      html += '<div class="user-count-badge">' + pendingCount + '</div>';
    }
    html += '<div class="user-row">';
    html += '  <div class="user-avatar">' + firstLetter + '</div>';
    html += '  <div class="user-details">';
    html += '    <span class="user-email">' + escapeHtml(entry.email) + '</span>';
    html += '    <span class="user-name"><span class="stat-total">' + total + ' منتج</span> · <span class="stat-pending">' + pendingCount + ' قيد المراجعة</span> · <span class="stat-reviewed">' + reviewedCount + ' مقبول</span> · <span class="stat-rejected">' + rejectedCount + ' مرفوض</span></span>';
    if (latestDate) {
      html += '    <span class="user-latest">آخر منتج: ' + latestDate + '</span>';
    }
    html += '  </div>';
    html += '  <i class="fa-solid fa-chevron-left user-arrow"></i>';
    html += '</div>';
    html += '</article>';
  }
  grid.innerHTML = html;
}

function applyFilters() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const emailQuery = document.getElementById("emailFilter").value.trim().toLowerCase();
  const reviewFilter = document.getElementById("reviewFilter").value;
  let filtered = [...allProducts];
  if (query) {
    filtered = filtered.filter(item =>
      (item.product_name || "").toLowerCase().includes(query) ||
      (item.name || "").toLowerCase().includes(query)
    );
  }
  if (emailQuery) {
    filtered = filtered.filter(item =>
      getUserEmail(item).toLowerCase().includes(emailQuery)
    );
  }
  if (reviewFilter !== "all") {
    filtered = filtered.filter(item => (item.review_status || "pending") === reviewFilter);
  }
  renderProducts(filtered);
  updateSummary(filtered);
}

function updateSummary(items) {
  const pendingCount = items.filter(item => (item.review_status || "pending") === "pending").length;
  const reviewedCount = items.filter(item => item.review_status === "reviewed").length;
  const rejectedCount = items.filter(item => item.review_status === "rejected").length;
  document.getElementById("productsCount").textContent = items.length;
  document.getElementById("pendingCount").textContent = pendingCount;
  const badge = document.getElementById("pendingCountBadge");
  if (badge) {
    badge.setAttribute("data-count", pendingApprovalsCount > 0 ? String(pendingApprovalsCount) : "");
  }
  document.getElementById("reviewedCount").textContent = reviewedCount;
  if (document.getElementById("rejectedCount")) {
    document.getElementById("rejectedCount").textContent = rejectedCount;
  }
}

async function loadProducts(showErrorToast = false) {
  const { data, error } = await supabaseClient.from("my_products").select("*").order("id", { ascending: false });
  if (error) {
    console.error(error);
    if (showErrorToast) showToast("تعذر تحميل المنتجات", "error");
    return;
  }
  allProducts = data || [];
  pendingApprovalsCount = allProducts.filter(p => (p.review_status || "pending") === "pending").length;
  applyFilters();
}

async function bulkApprove() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const emailQuery = document.getElementById("emailFilter").value.trim().toLowerCase();
  const reviewFilter = document.getElementById("reviewFilter").value;
  let targets = [...allProducts];
  if (query) {
    targets = targets.filter(item =>
      (item.product_name || "").toLowerCase().includes(query) ||
      (item.name || "").toLowerCase().includes(query)
    );
  }
  if (emailQuery) {
    targets = targets.filter(item =>
      (item.email || "").toLowerCase().includes(emailQuery) ||
      (item.owner_email || "").toLowerCase().includes(emailQuery) ||
      (item.seller_email || "").toLowerCase().includes(emailQuery)
    );
  }
  if (reviewFilter !== "all") {
    targets = targets.filter(item => (item.review_status || "pending") === reviewFilter);
  }
  const pending = targets.filter(item => (item.review_status || "pending") === "pending");
  if (!pending.length) {
    showToast("لا توجد منتجات في الانتظار للموافقة", "warning");
    return;
  }
  if (!confirm(`هل أنت متأكد من الموافقة على ${pending.length} منتج؟`)) return;
  const btn = document.getElementById("bulkApproveBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري...';
  let success = 0;
  let failed = 0;
  for (const product of pending) {
    const result = await publishProductToStore(product);
    if (result.success) {
      await supabaseClient.from("my_products").update({ review_status: "reviewed" }).eq("id", product.id);
      success++;
    } else {
      failed++;
    }
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check-double"></i> موافقة على الكل';
  showToast(`تمت الموافقة على ${success} منتج${failed ? `, فشل ${failed}` : ""}`, failed ? "warning" : "success");
  loadProducts();
}

function exportCSV() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const emailQuery = document.getElementById("emailFilter").value.trim().toLowerCase();
  const reviewFilter = document.getElementById("reviewFilter").value;
  let items = [...allProducts];
  if (query) {
    items = items.filter(item =>
      (item.product_name || "").toLowerCase().includes(query) ||
      (item.name || "").toLowerCase().includes(query)
    );
  }
  if (emailQuery) {
    items = items.filter(item =>
      (item.email || "").toLowerCase().includes(emailQuery) ||
      (item.owner_email || "").toLowerCase().includes(emailQuery) ||
      (item.seller_email || "").toLowerCase().includes(emailQuery)
    );
  }
  if (reviewFilter !== "all") {
    items = items.filter(item => (item.review_status || "pending") === reviewFilter);
  }
  const headers = ["الاسم", "السعر", "بعد الخصم", "الكمية", "القسم", "البريد", "التليفون", "الحالة", "التاريخ", "الصور"];
  const rows = items.map(p => [
    p.product_name || p.name || "",
    p.price || 0,
    priceAfterDiscount(p).toFixed(2),
    p.quantity || p.stock || 0,
    p.category || "",
    p.email || p.owner_email || p.seller_email || "",
    p.phone || p.owner_phone || "",
    statusLabel(p.review_status || "pending"),
    p.created_at ? new Date(p.created_at).toLocaleDateString("ar-EG") : "",
    collectProductImages(p).length,
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `products_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("تم التصدير", "success");
}

function handleGridClick(e) {
  const userCard = e.target.closest(".user-card");
  if (userCard) {
    e.stopPropagation();
    var encodedEmail = userCard.dataset.email;
    if (encodedEmail) {
      window.location.href = "partner-products.html?email=" + encodedEmail;
    }
    return;
  }
}

document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("emailFilter").addEventListener("input", applyFilters);
document.getElementById("reviewFilter").addEventListener("change", applyFilters);
document.getElementById("bulkApproveBtn").addEventListener("click", bulkApprove);
document.getElementById("exportBtn").addEventListener("click", exportCSV);
document.getElementById("productsGrid").addEventListener("click", handleGridClick);

loadProducts(true);
setInterval(loadProducts, 5000);

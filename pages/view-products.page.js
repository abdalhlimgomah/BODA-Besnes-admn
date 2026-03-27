const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let allProducts = [];

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

function statusLabel(status) {
  return status === "reviewed" ? "تمت المراجعة" : "قيد المراجعة";
}

function statusClass(status) {
  return status === "reviewed" ? "status-reviewed" : "status-review";
}

function applyFilters() {
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const reviewFilter = document.getElementById("reviewFilter").value;

  let filtered = [...allProducts];
  if (query) {
    filtered = filtered.filter((item) => {
      const name = (item.product_name || "").toLowerCase();
      const email = (item.email || "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }

  if (reviewFilter !== "all") {
    filtered = filtered.filter((item) => (item.review_status || "pending") === reviewFilter);
  }

  renderProducts(filtered);
  updateSummary(filtered);
}

function updateSummary(items) {
  const pendingCount = items.filter((item) => (item.review_status || "pending") === "pending").length;
  const reviewedCount = items.filter((item) => item.review_status === "reviewed").length;
  document.getElementById("productsCount").textContent = items.length;
  document.getElementById("pendingCount").textContent = pendingCount;
  document.getElementById("reviewedCount").textContent = reviewedCount;
}

function priceAfterDiscount(item) {
  const price = Number(item.price) || 0;
  const discount = Number(item.discount_percent) || 0;
  return price - (price * discount) / 100;
}

function renderProducts(products) {
  const container = document.getElementById("productsGrid");
  if (!products.length) {
    container.innerHTML = '<div class="empty-state">لا توجد منتجات مطابقة</div>';
    return;
  }

  container.innerHTML = products
    .map((product) => {
      const status = product.review_status || "pending";
      return `
        <article class="product-card">
          <img src="${product.img1 || ""}" alt="${product.product_name || "منتج"}" />
          <h4>${product.product_name || "-"}</h4>
          <div class="product-meta">
            <p><strong>السعر:</strong> ${Number(product.price || 0).toFixed(2)}</p>
            <p><strong>بعد الخصم:</strong> ${priceAfterDiscount(product).toFixed(2)}</p>
            <p><strong>الكمية:</strong> ${product.quantity || 0}</p>
            <p><strong>القسم:</strong> ${product.category || "-"}</p>
            <p><strong>التاجر:</strong> ${product.email || "-"} | ${product.phone || "-"}</p>
          </div>
          <div class="status-row">
            <span>الحالة</span>
            <span class="status-pill ${statusClass(status)}">${statusLabel(status)}</span>
          </div>
          <div class="product-actions">
            <button class="review-btn" onclick="updateProductReview(${product.id}, 'pending')">قيد المراجعة</button>
            <button class="review-btn" onclick="updateProductReview(${product.id}, 'reviewed')">تمت المراجعة</button>
            <button class="delete-btn" onclick="deleteProduct(${product.id})">حذف</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadProducts(showErrorToast = false) {
  const { data, error } = await supabaseClient.from("my_products").select("*").order("id", { ascending: false });
  if (error) {
    console.error(error);
    if (showErrorToast) showToast("تعذر تحميل المنتجات", "error");
    return;
  }

  allProducts = data || [];
  applyFilters();
}

async function updateProductReview(id, status) {
  const { error } = await supabaseClient.from("my_products").update({ review_status: status }).eq("id", id);
  if (error) {
    console.error(error);
    showToast("فشل تحديث حالة المراجعة", "error");
    return;
  }
  showToast("تم تحديث حالة المنتج", "success");
  loadProducts();
}

async function deleteProduct(id) {
  if (!confirm("هل أنت متأكد أنك تريد حذف المنتج؟")) return;
  const { error } = await supabaseClient.from("my_products").delete().eq("id", id);
  if (error) {
    console.error(error);
    showToast("فشل حذف المنتج", "error");
    return;
  }
  showToast("تم حذف المنتج", "success");
  loadProducts();
}

document.getElementById("searchInput").addEventListener("input", applyFilters);
document.getElementById("reviewFilter").addEventListener("change", applyFilters);

window.updateProductReview = updateProductReview;
window.deleteProduct = deleteProduct;

loadProducts(true);
setInterval(loadProducts, 4000);

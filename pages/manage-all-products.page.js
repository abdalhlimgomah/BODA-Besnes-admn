const PAGE_SIZE = 50;

function getSupabaseClient() {
  const url = window.SUPABASE_URL || "https://msgqzgzoslearaprgiqq.supabase.co";
  const key = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
  return window.supabase.createClient(url, key);
}

let allProducts = [];
let currentPage = 0;
let filteredProducts = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', '"');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isVendorProduct(product) {
  const name = (product.product_name || product.name || "").toLowerCase();
  return name.startsWith("vendor_");
}

function buildRow(p) {
  const img = escapeHtml(p.image || p.img1 || p.image1 || p.image_link1 || "");
  const name = escapeHtml(p.product_name || p.name || "-");
  const id = escapeHtml(p.id || "");
  const price = toNumber(p.price).toFixed(2);
  const discountPct = toNumber(p.discount_percent);
  const priceAfterDiscount = discountPct > 0 
    ? (toNumber(p.price) - (toNumber(p.price) * discountPct) / 100).toFixed(2)
    : (toNumber(p.price_after_discount) || toNumber(p.final_price) || toNumber(p.sale_price) || price);
  const stock = toNumber(p.quantity || p.stock);
  const category = escapeHtml(p.category || p.store_category || "-");
  const isActive = p.is_active !== false && p.status !== "inactive";
  const statusText = isActive ? "نشط" : "غير نشط";
  const statusClass = isActive ? "stat-active" : "stat-inactive";
  const soldCount = toNumber(p.sold_count || p.sales_count || p.total_sold || 0);

  return `
  <tr data-id="${escapeHtml(p.id)}">
    <td>
      <img src="${img}" alt="${name}" loading="lazy" 
        onerror="this.src='data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3Ctext x=%2750%27 y=%2755%27 text-anchor=%27middle%27 fill=%27%2394a3b8%27 font-size=%2730%27%3E📦%3C/text%3E%3C/svg%3E'" />
    </td>
    <td class="product-name-cell">
      <strong>${name}</strong>
      <small>ID: ${id}</small>
    </td>
    <td>${price} ج.م</td>
    <td>${priceAfterDiscount} ج.م</td>
    <td>${stock}</td>
    <td>${category}</td>
    <td><span class="stat-badge ${statusClass}">${statusText}</span></td>
    <td>${soldCount}</td>
    <td>
      <a class="edit-btn" href="manage-product-edit.html?id=${encodeURIComponent(p.id)}">
        <i class="fa-solid fa-pen-to-square"></i> تعديل
      </a>
    </td>
  </tr>`;
}

function renderProducts() {
  const body = document.getElementById("productsBody");
  const countEl = document.getElementById("productsCount");
  const total = filteredProducts.length;
  
  if (countEl) countEl.textContent = `إجمالي: ${total} منتج`;

  const start = currentPage * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const visible = filteredProducts.slice(start, end);

  if (!visible.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty-state">لا توجد منتجات مطابقة</td></tr>';
  } else {
    body.innerHTML = visible.map(buildRow).join("");
  }

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  if (prevBtn) prevBtn.disabled = currentPage === 0;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;
  if (pageInfo) pageInfo.textContent = `صفحة ${currentPage + 1} من ${totalPages}`;
}

function applyFilters() {
  const query = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  
  if (!query) {
    filteredProducts = [...allProducts];
  } else {
    filteredProducts = allProducts.filter(p =>
      (p.product_name || "").toLowerCase().includes(query) ||
      (p.name || "").toLowerCase().includes(query) ||
      (p.id || "").toString().includes(query) ||
      (p.category || "").toLowerCase().includes(query) ||
      (p.sku || "").toLowerCase().includes(query)
    );
  }
  
  currentPage = 0;
  renderProducts();
}

function changePage(delta) {
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE) || 1;
  const newPage = currentPage + delta;
  if (newPage >= 0 && newPage < totalPages) {
    currentPage = newPage;
    renderProducts();
  }
}

async function loadProducts() {
  const body = document.getElementById("productsBody");
  body.innerHTML = '<tr><td colspan="9" class="empty-state">جاري تحميل المنتجات...</td></tr>';

  const { count } = await getSupabaseClient()
    .from("products")
    .select("*", { count: "exact", head: true });

  const totalCount = count || 0;
  console.log("Total products in table:", totalCount);
  
  let all = [];

  if (totalCount > 0) {
    const batchSize = 1000;
    const batches = Math.ceil(totalCount / batchSize);

    for (let i = 0; i < batches; i++) {
      const from = i * batchSize;
      const to = from + batchSize - 1;
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("*")
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("Batch error:", error);
        continue;
      }
      all = all.concat(Array.isArray(data) ? data : []);
    }
  }

  console.log("All products fetched:", all.length);
  if (all.length > 0) {
    console.log("Sample product names:", all.slice(0, 5).map(p => p.product_name || p.name));
    console.log("Sample product IDs:", all.slice(0, 5).map(p => p.id));
  }

  // Filter out vendor products
  const vendorProducts = all.filter(p => isVendorProduct(p));
  console.log("Vendor products filtered out:", vendorProducts.length);
  allProducts = all.filter(p => !isVendorProduct(p));
  console.log("Non-vendor products:", allProducts.length);
  
  filteredProducts = [...allProducts];
  currentPage = 0;
  renderProducts();

  // Show debug info on page
  const debugDiv = document.getElementById("debugInfo");
  if (debugDiv) {
    debugDiv.innerHTML = `
      <div style="padding:10px;background:#f0f0f0;margin:10px 0;border-radius:4px;font-size:12px;font-family:monospace;direction:ltr">
        <strong>Debug Info:</strong><br>
        Total in table: ${totalCount}<br>
        Fetched: ${all.length}<br>
        Vendor (filtered): ${vendorProducts.length}<br>
        Non-vendor (shown): ${allProducts.length}<br>
        Sample names: ${all.slice(0,3).map(p => p.product_name || p.name || 'NO NAME').join(', ')}
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.addEventListener("input", applyFilters);

  loadProducts();
});
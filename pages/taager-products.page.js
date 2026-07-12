const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PAGE_SIZE = 50;

let allProducts = [];
let displayedCount = 0;
let isLoadingMore = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildCard(p) {
  const img = escapeHtml(p.image || p.images?.[0] || "");
  const name = escapeHtml(p.name || "-");
  const cat = escapeHtml(p.category || "-");
  const price = toNumber(p.price).toFixed(2);
  const stock = toNumber(p.stock);
  const status = p.is_active ? "نشط" : "غير نشط";
  const statusClass = p.is_active ? "status-active" : "status-inactive";

  return `
  <article class="taager-card">
    <img src="${img}" alt="${name}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23f3f4f6%27/%3E%3Ctext x=%2750%27 y=%2755%27 text-anchor=%27middle%27 fill=%27%2394a3b8%27 font-size=%2730%27%3E📦%3C/text%3E%3C/svg%3E'" />
    <div class="taager-card-body">
      <div class="taager-card-head">
        <h4>${name}</h4>
        <span class="status-pill ${statusClass}">${status}</span>
      </div>
      <div class="taager-card-meta">
        <span><strong>السعر:</strong> ${price} ج.م</span>
        <span><strong>المخزون:</strong> ${stock}</span>
        <span><strong>القسم:</strong> ${cat}</span>
      </div>
      <div class="taager-card-actions">
        <a class="edit-link" href="taager-product-edit.html?id=${encodeURIComponent(p.id)}">
          <i class="fa-solid fa-pen-to-square"></i> تعديل
        </a>
      </div>
    </div>
  </article>`;
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const count = document.getElementById("productsCount");
  const total = allProducts.length;
  if (count) count.textContent = total;

  const visible = allProducts.slice(0, displayedCount);
  grid.innerHTML = visible.map(buildCard).join("");

  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const loadMoreWrap = document.getElementById("loadMoreWrap");
  if (displayedCount >= total) {
    if (loadMoreWrap) loadMoreWrap.style.display = "none";
  } else {
    if (loadMoreWrap) loadMoreWrap.style.display = "flex";
    if (loadMoreBtn) loadMoreBtn.textContent = `عرض المزيد (${displayedCount}/${total})`;
  }
}

function loadMore() {
  if (isLoadingMore) return;
  isLoadingMore = true;
  displayedCount = Math.min(displayedCount + PAGE_SIZE, allProducts.length);
  renderProducts();
  isLoadingMore = false;
}

function applyFilters() {
  const query = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  if (!query) {
    displayedCount = Math.min(PAGE_SIZE, allProducts.length);
    renderProducts();
    return;
  }
  const filtered = allProducts.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(query) ||
      (p.category || "").toLowerCase().includes(query) ||
      (p.id || "").toLowerCase().includes(query)
  );
  const grid = document.getElementById("productsGrid");
  const count = document.getElementById("productsCount");
  if (count) count.textContent = filtered.length;
  grid.innerHTML = filtered.map(buildCard).join("");
  const loadMoreWrap = document.getElementById("loadMoreWrap");
  if (loadMoreWrap) loadMoreWrap.style.display = "none";
}

async function loadProducts() {
  const grid = document.getElementById("productsGrid");
  grid.innerHTML = '<div class="empty-text">جاري تحميل المنتجات...</div>';

  const { count } = await supabaseClient
    .from("taager_products")
    .select("*", { count: "exact", head: true });

  const totalCount = count || 0;
  let all = [];

  if (totalCount > 0) {
    const batchSize = 1000;
    const batches = Math.ceil(totalCount / batchSize);

    for (let i = 0; i < batches; i++) {
      const from = i * batchSize;
      const to = from + batchSize - 1;
      const { data, error } = await supabaseClient
        .from("taager_products")
        .select("*")
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) {
        console.error(error);
        continue;
      }
      all = all.concat(Array.isArray(data) ? data : []);
    }
  }

  allProducts = all;
  displayedCount = Math.min(PAGE_SIZE, allProducts.length);
  renderProducts();
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.addEventListener("input", applyFilters);

  const loadMoreBtn = document.getElementById("loadMoreBtn");
  if (loadMoreBtn) loadMoreBtn.addEventListener("click", loadMore);

  loadProducts();
});

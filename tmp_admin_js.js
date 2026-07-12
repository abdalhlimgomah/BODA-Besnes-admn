const { createClient } = supabase;

const supabaseClient = createClient(
  "https://msgqzgzoslearaprgiqq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE"
);

const CATEGORIES = [
  "هواتف",
  "ساعات",
  "لوحات مفاتيح",
  "سماعات رأس",
  "ملابس أطفال",
  "منتجات تجميل وعناية",
  "منتجات رياضية",
];

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

async function uploadImage(file) {
  if (!file) return "";
  const fileName = `${Date.now()}_${file.name.replace(/ /g, "_")}`;
  const { error } = await supabaseClient.storage.from("Buda").upload(fileName, file, { upsert: true });
  if (error) {
    showToast(error.message, "error");
    return "";
  }
  const { data } = await supabaseClient.storage.from("Buda").getPublicUrl(fileName);
  return data?.publicUrl || "";
}

function safeNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

async function addProduct() {
  const name = document.getElementById("name").value.trim();
  const price = safeNumber(document.getElementById("price").value);
  const discount = safeNumber(document.getElementById("discount").value);
  const description = document.getElementById("description").value.trim();
  const stock = safeNumber(document.getElementById("stock").value);
  const category = document.getElementById("category").value;

  if (!name || !price || !category) {
    showToast("يرجى إدخال الاسم والسعر والقسم.", "error");
    return;
  }

  let imageURL = "";
  const file = document.getElementById("imageFile").files[0];
  if (file) imageURL = await uploadImage(file);

  const extraLinks = [];
  for (let i = 1; i <= 5; i += 1) {
    const link = document.getElementById(`imageLink${i}`).value.trim();
    if (!link) continue;
    extraLinks.push(link);
    if (!imageURL) imageURL = link;
  }

  const discountedPrice = price - (price * discount) / 100;

  const { error } = await supabaseClient.from("products").insert([
    {
      name,
      price,
      price_after_discount: discountedPrice,
      description,
      stock,
      image: imageURL,
      extra_links: JSON.stringify(extraLinks),
      category,
    },
  ]);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("تمت إضافة المنتج بنجاح", "success");
  document.getElementById("name").value = "";
  document.getElementById("price").value = "";
  document.getElementById("discount").value = "";
  document.getElementById("description").value = "";
  document.getElementById("stock").value = "";
  document.getElementById("category").value = "";
  document.getElementById("imageFile").value = "";
  for (let i = 1; i <= 5; i += 1) {
    document.getElementById(`imageLink${i}`).value = "";
  }

  loadProducts();
}

async function updateProduct(id) {
  const name = document.getElementById(`name_${id}`).value.trim();
  const price = safeNumber(document.getElementById(`price_${id}`).value);
  const discount = safeNumber(document.getElementById(`discount_${id}`).value);
  const description = document.getElementById(`description_${id}`).value.trim();
  const stock = safeNumber(document.getElementById(`stock_${id}`).value);
  const category = document.getElementById(`category_${id}`).value;

  const discountedPrice = price - (price * discount) / 100;
  const { error } = await supabaseClient
    .from("products")
    .update({
      name,
      price,
      price_after_discount: discountedPrice,
      description,
      stock,
      category,
    })
    .eq("id", id);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("تم تعديل المنتج", "success");
  loadProducts();
}

async function deleteProduct(id) {
  if (!confirm("هل أنت متأكد من حذف المنتج؟")) return;

  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("تم حذف المنتج", "success");
  loadProducts();
}

function categoryOptions(selectedCategory = "") {
  return CATEGORIES.map(
    (category) => `<option value="${category}" ${category === selectedCategory ? "selected" : ""}>${category}</option>`
  ).join("");
}

function estimatedDiscount(price, priceAfterDiscount) {
  if (!price || !priceAfterDiscount || price <= 0 || priceAfterDiscount > price) return 0;
  return Math.round(((price - priceAfterDiscount) / price) * 100);
}

async function loadProducts() {
  const container = document.getElementById("products");
  container.innerHTML = '<div class="empty-state">جاري تحميل المنتجات...</div>';

  const { data, error } = await supabaseClient.from("products").select("*").order("created_at", { ascending: false });
  if (error) {
    container.innerHTML = '<div class="empty-state">تعذر تحميل المنتجات</div>';
    showToast(error.message, "error");
    return;
  }

  if (!data || !data.length) {
    container.innerHTML = '<div class="empty-state">لا توجد منتجات حالياً</div>';
    return;
  }

  container.innerHTML = data
    .map((product) => {
      const discountValue =
        product.price_after_discount != null
          ? estimatedDiscount(Number(product.price), Number(product.price_after_discount))
          : 0;

      return `
      <article class="product-card">
        <img src="${product.image || ""}" alt="${product.name || "منتج"}" />
        <div class="product-summary">
          <p class="product-name">${product.name || "-"}</p>
          <div class="price-row">
            <del>${safeNumber(product.price).toFixed(2)}</del>
            <span>${safeNumber(product.price_after_discount).toFixed(2)}</span>
          </div>
          <p>القسم: ${product.category || "-"}</p>
          <p>الكمية: ${safeNumber(product.stock)}</p>
          <p>${product.description || ""}</p>
        </div>
        <div class="inline-grid">
          <input type="text" id="name_${product.id}" value="${product.name || ""}" />
          <input type="number" id="price_${product.id}" value="${safeNumber(product.price)}" />
          <input type="number" id="discount_${product.id}" value="${discountValue}" placeholder="الخصم %" />
          <input type="text" id="description_${product.id}" value="${product.description || ""}" />
          <input type="number" id="stock_${product.id}" value="${safeNumber(product.stock)}" />
          <select id="category_${product.id}">
            ${categoryOptions(product.category || "")}
          </select>
        </div>
        <div class="product-actions">
          <button class="update-btn" onclick="updateProduct('${product.id}')">تعديل</button>
          <button class="delete-btn" onclick="deleteProduct('${product.id}')">حذف</button>
        </div>
      </article>`;
    })
    .join("");
}

loadProducts();

window.addProduct = addProduct;
window.updateProduct = updateProduct;
window.deleteProduct = deleteProduct;

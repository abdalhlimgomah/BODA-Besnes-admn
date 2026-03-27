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

function readInputValue(id) {
  const element = document.getElementById(id);
  return element && typeof element.value === "string" ? element.value.trim() : "";
}

async function addProduct() {
  const name = readInputValue("name");
  const price = safeNumber(document.getElementById("price")?.value);
  const discount = safeNumber(document.getElementById("discount")?.value);
  const description = readInputValue("description");
  const stock = safeNumber(document.getElementById("stock")?.value);
  const category = readInputValue("category");

  if (!name || !price || !category) {
    showToast("يرجى إدخال الاسم والسعر والقسم.", "error");
    return;
  }

  const imageLinks = [];
  for (let i = 1; i <= 5; i += 1) {
    imageLinks.push(readInputValue(`imageLink${i}`));
  }
  const [imageLink1, imageLink2, imageLink3, imageLink4, imageLink5] = imageLinks;

  let imageURL = "";
  const file = document.getElementById("imageFile")?.files?.[0];
  if (file) imageURL = await uploadImage(file);

  if (!imageURL) imageURL = imageLink1 || imageLink2 || imageLink3 || imageLink4 || imageLink5;
  const extraLinks = imageLinks.filter(Boolean);

  const discountedPrice = price - (price * discount) / 100;

  const { error } = await supabaseClient.from("products").insert([
    {
      name,
      price,
      price_after_discount: discountedPrice,
      description,
      stock,
      image: imageURL || null,
      image2: imageLink2 || null,
      image3: imageLink3 || null,
      image4: imageLink4 || null,
      image5: imageLink5 || null,
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
  const name = readInputValue(`name_${id}`);
  const price = safeNumber(readInputValue(`price_${id}`));
  const discount = safeNumber(readInputValue(`discount_${id}`));
  const description = readInputValue(`description_${id}`);
  const stock = safeNumber(readInputValue(`stock_${id}`));
  const category = readInputValue(`category_${id}`);
  const imageLinks = [];
  for (let i = 1; i <= 5; i += 1) {
    imageLinks.push(readInputValue(`imageLink${i}_${id}`));
  }
  const [imageLink1, imageLink2, imageLink3, imageLink4, imageLink5] = imageLinks;
  const imageURL = imageLink1 || imageLink2 || imageLink3 || imageLink4 || imageLink5;

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
      image: imageURL || null,
      image2: imageLink2 || null,
      image3: imageLink3 || null,
      image4: imageLink4 || null,
      image5: imageLink5 || null,
      extra_links: JSON.stringify(imageLinks.filter(Boolean)),
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
        <img src="${product.image || product.image2 || product.image3 || product.image4 || product.image5 || ""}" alt="${product.name || "منتج"}" />
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
          <div class="edit-field">
            <label for="name_${product.id}">اسم المنتج</label>
            <input type="text" id="name_${product.id}" value="${product.name || ""}" />
          </div>
          <div class="edit-field">
            <label for="price_${product.id}">السعر الأساسي</label>
            <input type="number" id="price_${product.id}" value="${safeNumber(product.price)}" />
          </div>
          <div class="edit-field">
            <label for="discount_${product.id}">الخصم %</label>
            <input type="number" id="discount_${product.id}" value="${discountValue}" placeholder="الخصم %" />
          </div>
          <div class="edit-field">
            <label for="description_${product.id}">الوصف</label>
            <input type="text" id="description_${product.id}" value="${product.description || ""}" />
          </div>
          <div class="edit-field">
            <label for="stock_${product.id}">الكمية</label>
            <input type="number" id="stock_${product.id}" value="${safeNumber(product.stock)}" />
          </div>
          <div class="edit-field">
            <label for="category_${product.id}">القسم</label>
            <select id="category_${product.id}">
              ${categoryOptions(product.category || "")}
            </select>
          </div>
          <div class="edit-field">
            <label for="imageLink1_${product.id}">رابط الصورة الرئيسية</label>
            <input type="url" id="imageLink1_${product.id}" value="${product.image || ""}" placeholder="https://..." dir="ltr" />
          </div>
          <div class="edit-field">
            <label for="imageLink2_${product.id}">رابط صورة المعرض 2</label>
            <input type="url" id="imageLink2_${product.id}" value="${product.image2 || ""}" placeholder="https://..." dir="ltr" />
          </div>
          <div class="edit-field">
            <label for="imageLink3_${product.id}">رابط صورة المعرض 3</label>
            <input type="url" id="imageLink3_${product.id}" value="${product.image3 || ""}" placeholder="https://..." dir="ltr" />
          </div>
          <div class="edit-field">
            <label for="imageLink4_${product.id}">رابط صورة المعرض 4</label>
            <input type="url" id="imageLink4_${product.id}" value="${product.image4 || ""}" placeholder="https://..." dir="ltr" />
          </div>
          <div class="edit-field">
            <label for="imageLink5_${product.id}">رابط صورة المعرض 5</label>
            <input type="url" id="imageLink5_${product.id}" value="${product.image5 || ""}" placeholder="https://..." dir="ltr" />
          </div>
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

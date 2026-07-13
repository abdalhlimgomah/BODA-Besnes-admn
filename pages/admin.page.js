const { createClient } = supabase;

const supabaseClient = createClient(
  "https://msgqzgzoslearaprgiqq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE"
);

const CATEGORIES = [
  "إلكترونيات",
  "موبايلات وملحقاتها",
  "ملابس وأحذية",
  "تجميل وعناية",
  "عطور",
  "منتجات رياضية",
  "منزل ومطبخ",
  "مستلزمات المنزل",
  "مكتب ودراسة",
  "ساعات",
  "حفاضات وأطفال",
  "ألعاب",
  "كتب ومجلات",
  "حيوانات أليفة",
  "سيارات",
  "مجوهرات وإكسسوارات",
  "كاميرات وتصوير",
  "سماعات",
  "هدايا",
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
  console.log("Uploading to Buda bucket:", fileName);
  const { error } = await supabaseClient.storage.from("Buda").upload(fileName, file, { upsert: true });
  if (error) {
    console.error("Upload error:", error);
    showToast("فشل رفع الصورة: " + (error.message || "خطأ غير معروف"), "error");
    return "";
  }
  const { data } = await supabaseClient.storage.from("Buda").getPublicUrl(fileName);
  console.log("Upload success, URL:", data?.publicUrl);
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

var _uploadedVideoUrl = "";

async function uploadVideo(file) {
  if (!file) return "";
  const fileName = `videos/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabaseClient.storage.from("Buda").upload(fileName, file, { upsert: true });
  if (error) { showToast("فشل رفع الفيديو: " + error.message, "error"); return ""; }
  const { data } = await supabaseClient.storage.from("Buda").getPublicUrl(fileName);
  return data?.publicUrl || "";
}

function removeVideo() {
  _uploadedVideoUrl = "";
  document.getElementById("videoPreviewBox").classList.add("hidden");
  document.getElementById("videoPreview").removeAttribute("src");
  document.getElementById("videoUploadText").textContent = "اختر فيديو المنتج";
  document.getElementById("videoFile").value = "";
}

async function addProduct() {
  const name = readInputValue("name");
  const price = safeNumber(document.getElementById("price")?.value);
  const discount = safeNumber(document.getElementById("discount")?.value);
  const description = readInputValue("description");
  const stock = safeNumber(document.getElementById("stock")?.value);
  const category = readInputValue("category");

  const finalPriceEl = document.getElementById("finalPriceDisplay");
  if (finalPriceEl) finalPriceEl.textContent = "—";

  if (!name || !price || !category) {
    showToast("يرجى إدخال الاسم والسعر والقسم.", "error");
    return;
  }

  const fileInput = document.getElementById("imageFile");
  const files = fileInput?.files ? Array.from(fileInput.files) : [];
  if (files.length > 8) {
    showToast("يمكنك رفع 8 صور كحد أقصى.", "error");
    return;
  }

  var uploadedUrls = [];
  for (var i = 0; i < files.length; i++) {
    var url = await uploadImage(files[i]);
    if (url) uploadedUrls.push(url);
  }

  const discountedPrice = price - (price * discount) / 100;

  var videoUrl = _uploadedVideoUrl || "";

  var payload = {
    product_name: name,
    name: name,
    price: price,
    price_after_discount: discountedPrice,
    description: description,
    stock: stock,
    category: category,
    image: uploadedUrls[0] || "",
    extra_links: uploadedUrls.slice(1).join(", "),
    video_url: videoUrl,
    video: videoUrl,
    product_video: videoUrl,
    video_link: videoUrl,
    status: "active",
  };
  for (var i = 0; i < uploadedUrls.length; i++) {
    var col = i === 0 ? "img1" : "img" + (i + 1);
    payload[col] = uploadedUrls[i];
    payload["image" + (i + 1)] = uploadedUrls[i];
  }

  const { error } = await supabaseClient.from("products").insert([payload]);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("تمت إضافة المنتج بنجاح", "success");
  clearForm();
  loadProducts();
}

async function updateProduct(id) {
  const name = readInputValue(`name_${id}`);
  const price = safeNumber(readInputValue(`price_${id}`));
  const discount = safeNumber(readInputValue(`discount_${id}`));
  const description = readInputValue(`description_${id}`);
  const stock = safeNumber(readInputValue(`stock_${id}`));
  const category = readInputValue(`category_${id}`);

  const discountedPrice = price - (price * discount) / 100;

  const { data: existing } = await supabaseClient.from("products").select("*").eq("id", id).single();
  var updatePayload = {
    name: name, price: price, price_after_discount: discountedPrice,
    description: description, stock: stock, category: category,
    product_name: name,
    image: existing?.image || null,
    extra_links: existing?.extra_links || null,
    video_url: existing?.video_url || "",
    video: existing?.video || "",
    product_video: existing?.product_video || "",
    video_link: existing?.video_link || "",
    img1: existing?.img1 || null,
    img2: existing?.img2 || null, img3: existing?.img3 || null, img4: existing?.img4 || null,
    img5: existing?.img5 || null, img6: existing?.img6 || null, img7: existing?.img7 || null, img8: existing?.img8 || null,
    image2: existing?.image2 || null, image3: existing?.image3 || null, image4: existing?.image4 || null, image5: existing?.image5 || null,
    image6: existing?.image6 || null, image7: existing?.image7 || null, image8: existing?.image8 || null,
  };

  const fileInput = document.getElementById("imageFile");
  const files = fileInput?.files ? Array.from(fileInput.files) : [];
  if (files.length > 0) {
    var uploadedUrls = [];
    for (var i = 0; i < Math.min(files.length, 8); i++) {
      var url = await uploadImage(files[i]);
      if (url) uploadedUrls.push(url);
    }
    updatePayload.image = uploadedUrls[0] || "";
    updatePayload.extra_links = uploadedUrls.slice(1).join(", ");
    for (var i = 0; i < uploadedUrls.length; i++) {
      var col = i === 0 ? "img1" : "img" + (i + 1);
      updatePayload[col] = uploadedUrls[i];
      updatePayload["image" + (i + 1)] = uploadedUrls[i];
    }
  }

  if (_uploadedVideoUrl) {
    updatePayload.video_url = _uploadedVideoUrl;
    updatePayload.video = _uploadedVideoUrl;
    updatePayload.product_video = _uploadedVideoUrl;
    updatePayload.video_link = _uploadedVideoUrl;
  }

  const { error } = await supabaseClient.from("products").update(updatePayload).eq("id", id);

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

function updatePricePreview() {
  const price = safeNumber(document.getElementById("price")?.value);
  const discount = safeNumber(document.getElementById("discount")?.value);
  const display = document.getElementById("finalPriceDisplay");
  if (!display) return;
  if (!price) { display.textContent = "—"; return; }
  const finalPrice = price - (price * discount) / 100;
  display.textContent = finalPrice.toFixed(2) + " EGP";
}

function clearForm() {
  document.getElementById("name").value = "";
  document.getElementById("price").value = "";
  document.getElementById("discount").value = "";
  document.getElementById("description").value = "";
  document.getElementById("stock").value = "";
  document.getElementById("category").value = "";
  document.getElementById("imageFile").value = "";
  document.getElementById("imagePreviews").innerHTML = "";
  removeVideo();
  const display = document.getElementById("finalPriceDisplay");
  if (display) display.textContent = "—";
}

function renderImagePreviews() {
  var previews = document.getElementById("imagePreviews");
  var files = document.getElementById("imageFile").files;
  previews.innerHTML = "";
  for (var i = 0; i < files.length; i++) {
    (function (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var div = document.createElement("div");
        div.className = "product-image-preview";
        div.innerHTML = '<img src="' + e.target.result + '" alt="صورة" />' +
          '<button type="button" class="product-image-preview-remove" data-index="' + i + '">&times;</button>';
        div.querySelector(".product-image-preview-remove").addEventListener("click", function () {
          removeImage(i);
        });
        previews.appendChild(div);
      };
      reader.readAsDataURL(file);
    })(files[i]);
  }
}

function removeImage(index) {
  var fileInput = document.getElementById("imageFile");
  var dt = new DataTransfer();
  var files = fileInput.files;
  for (var i = 0; i < files.length; i++) {
    if (i !== index) dt.items.add(files[i]);
  }
  fileInput.files = dt.files;
  renderImagePreviews();
}

function toggleEdit(id) {
  const fields = document.getElementById(`editFields_${id}`);
  const card = document.getElementById(`card_${id}`);
  const btn = document.getElementById(`editBtn_${id}`);
  if (!fields || !card || !btn) return;

  const isOpen = fields.classList.contains("open");
  if (isOpen) {
    updateProduct(id);
    fields.classList.remove("open");
    card.classList.remove("editing");
    btn.textContent = "تعديل";
  } else {
    fields.classList.add("open");
    card.classList.add("editing");
    btn.textContent = "حفظ التعديلات";
  }
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

  window.__adminProducts = data;
  container.innerHTML = data
    .map((product) => {
      const discountValue =
        product.price_after_discount != null
          ? estimatedDiscount(Number(product.price), Number(product.price_after_discount))
          : 0;

      var productImages = getProductImages(product);
      var hasMultipleImages = productImages.length > 1;
      var video = getProductVideo(product);
      return `
      <article class="product-card" id="card_${product.id}">
        <div class="product-card-media${hasMultipleImages ? " has-gallery" : ""}" onclick="openGalleryById('${product.id}')">
          ${productImages.map(function(img, idx) {
            return '<img class="admin-card-img' + (idx === 0 ? " active" : "") + '" src="' + img + '" alt="' + (product.name || "منتج") + '" data-index="' + idx + '" loading="lazy" />';
          }).join("")}
          ${video ? '<div class="admin-video-badge"><i class="fa-solid fa-video"></i></div>' : ""}
          ${hasMultipleImages ? '<div class="admin-card-counter">1/' + productImages.length + '</div>' : ""}
          ${hasMultipleImages ? '<div class="admin-card-dots">' + productImages.map(function(_, idx) {
            return '<span class="' + (idx === 0 ? "active" : "") + '" data-index="' + idx + '"></span>';
          }).join("") + '</div>' : ""}
        </div>
        <div class="product-summary">
          <p class="product-name">${product.name || product.product_name || "-"}</p>
          <div class="price-row">
            <del>${safeNumber(product.price).toFixed(2)}</del>
            <span>${safeNumber(product.price_after_discount).toFixed(2)}</span>
          </div>
          <p>القسم: ${product.category || "-"}</p>
          <p>الكمية: ${safeNumber(product.stock)}</p>
          <p>${product.description || ""}</p>
          ${video ? '<p><i class="fa-solid fa-video"></i> فيديو</p>' : ""}
        </div>
        <div class="inline-grid" id="editFields_${product.id}">
          <div class="edit-field">
            <label for="name_${product.id}">اسم المنتج</label>
            <input type="text" id="name_${product.id}" value="${product.name || product.product_name || ""}" />
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
          <div class="edit-field" style="grid-column:1/-1;">
            <label>صور المنتج</label>
            <input type="file" accept="image/*" multiple onchange="renderImagePreviews()" />
          </div>
        </div>
        <div class="product-actions">
          <button class="update-btn" id="editBtn_${product.id}" onclick="toggleEdit('${product.id}')">تعديل</button>
          <button class="delete-btn" onclick="deleteProduct('${product.id}')">حذف</button>
        </div>
      </article>`;
    })
    .join("");
}

/* ─── Image Gallery ─── */
var galleryImages = [];
var galleryIndex = 0;

function getProductImages(product) {
  var images = [];
  function pushUrl(url) { if (url && images.indexOf(url) === -1) images.push(url); }
  pushUrl(product.image);
  pushUrl(product.img1);
  pushUrl(product.img2 || product.image2);
  pushUrl(product.img3 || product.image3);
  pushUrl(product.img4 || product.image4);
  pushUrl(product.img5 || product.image5);
  pushUrl(product.img6 || product.image6);
  pushUrl(product.img7 || product.image7);
  pushUrl(product.img8 || product.image8);
  pushUrl(product.image_link1);
  pushUrl(product.image_link2);
  pushUrl(product.image_link3);
  pushUrl(product.image_link4);
  pushUrl(product.image_link5);
  pushUrl(product.image_link6);
  pushUrl(product.image_link7);
  pushUrl(product.image_link8);
  if (product.extra_links) {
    try {
      var parsed = JSON.parse(product.extra_links);
      if (Array.isArray(parsed)) {
        parsed.forEach(function (url) { pushUrl(url); });
      }
    } catch (_) {
      product.extra_links.split(/[,\n\r;|]+/g).forEach(function (s) { pushUrl(s.trim()); });
    }
  }
  if (product.images) {
    if (Array.isArray(product.images)) product.images.forEach(function (url) { pushUrl(url); });
    else if (typeof product.images === "string") pushUrl(product.images);
  }
  return images;
}

function getProductVideo(product) {
  return product.video_url || product.video || product.product_video || product.video_link || "";
}

function openGallery(product) {
  galleryImages = [];
  getProductImages(product).forEach(function(url) { galleryImages.push(url); });
  var video = getProductVideo(product);
  if (video) {
    var found = false;
    for (var i = 0; i < galleryImages.length; i++) { if (galleryImages[i] === video) { found = true; break; } }
    if (!found) galleryImages.push(video);
  }
  if (!galleryImages.length) return;
  galleryIndex = 0;
  document.getElementById("galleryOverlay").style.display = "flex";
  showGalleryImage();
}

function openGalleryById(id) {
  var products = window.__adminProducts || [];
  for (var i = 0; i < products.length; i++) {
    if (products[i].id == id) { openGallery(products[i]); return; }
  }
}

function showGalleryImage() {
  var img = document.getElementById("galleryImg");
  var isVideo = /\.(mp4|webm|ogg|mov)$/i.test(galleryImages[galleryIndex]) || galleryImages[galleryIndex].includes("video");
  if (isVideo) {
    img.style.display = "none";
    var videoEl = document.getElementById("galleryVideo");
    if (!videoEl) {
      videoEl = document.createElement("video");
      videoEl.id = "galleryVideo";
      videoEl.controls = true;
      videoEl.className = "admin-gallery-slide active";
      videoEl.style.cssText = "max-width:100%;max-height:80vh;border-radius:12px;";
      img.parentNode.appendChild(videoEl);
    }
    videoEl.style.display = "";
    videoEl.src = galleryImages[galleryIndex];
    videoEl.load();
  } else {
    var videoEl = document.getElementById("galleryVideo");
    if (videoEl) { videoEl.style.display = "none"; videoEl.pause(); }
    img.style.display = "";
    if (galleryImages[galleryIndex]) img.src = galleryImages[galleryIndex];
  }
  img.alt = "صورة " + (galleryIndex + 1);
  var counter = document.getElementById("galleryCounter");
  if (counter) counter.textContent = (galleryIndex + 1) + " / " + galleryImages.length;
  updateGalleryDots();
  document.getElementById("galleryPrev").style.display = galleryIndex > 0 ? "" : "none";
  document.getElementById("galleryNext").style.display = galleryIndex < galleryImages.length - 1 ? "" : "none";
}

function galleryNav(dir) {
  galleryIndex += dir;
  if (galleryIndex < 0) galleryIndex = 0;
  if (galleryIndex >= galleryImages.length) galleryIndex = galleryImages.length - 1;
  showGalleryImage();
}

function closeGallery(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("galleryOverlay").style.display = "none";
  var videoEl = document.getElementById("galleryVideo");
  if (videoEl) { videoEl.pause(); videoEl.removeAttribute("src"); }
}

function updateGalleryDots() {
  var container = document.getElementById("galleryDots");
  container.innerHTML = "";
  for (var i = 0; i < galleryImages.length; i++) {
    var dot = document.createElement("span");
    dot.className = "gallery-dot" + (i === galleryIndex ? " active" : "");
    dot.onclick = (function (idx) { return function () { galleryIndex = idx; showGalleryImage(); }; })(i);
    container.appendChild(dot);
  }
}

document.addEventListener("keydown", function (e) {
  if (document.getElementById("galleryOverlay").style.display !== "flex") return;
  if (e.key === "Escape") closeGallery();
  if (e.key === "ArrowLeft") galleryNav(-1);
  if (e.key === "ArrowRight") galleryNav(1);
});

loadProducts();

function populateCategorySelect() {
  var sel = document.getElementById("category");
  if (!sel) return;
  CATEGORIES.forEach(function (cat) {
    var opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });
}

populateCategorySelect();

window.addProduct = addProduct;
window.updateProduct = updateProduct;
window.deleteProduct = deleteProduct;
window.toggleEdit = toggleEdit;
window.updatePricePreview = updatePricePreview;
window.clearForm = clearForm;
window.renderImagePreviews = renderImagePreviews;
window.removeImage = removeImage;
window.removeVideo = removeVideo;
window.openGallery = openGallery;
window.openGalleryById = openGalleryById;
window.closeGallery = closeGallery;
window.galleryNav = galleryNav;

document.addEventListener("click", function (e) {
  var dot = e.target.closest(".admin-card-dots span");
  if (dot) {
    e.stopPropagation();
    var card = dot.closest(".product-card");
    if (!card) return;
    var idx = parseInt(dot.dataset.index, 10);
    card.querySelectorAll(".admin-card-img").forEach(function (img, i) { img.classList.toggle("active", i === idx); });
    card.querySelectorAll(".admin-card-dots span").forEach(function (d, i) { d.classList.toggle("active", i === idx); });
    var counter = card.querySelector(".admin-card-counter");
    if (counter) counter.textContent = (idx + 1) + "/" + card.querySelectorAll(".admin-card-img").length;
  }
});

document.getElementById("imageUploadArea").addEventListener("click", function () {
  document.getElementById("imageFile").click();
});
document.getElementById("imageFile").addEventListener("change", renderImagePreviews);

document.getElementById("videoFile").addEventListener("change", async function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var videoBox = document.getElementById("videoPreviewBox");
  var videoEl = document.getElementById("videoPreview");
  var uploadText = document.getElementById("videoUploadText");
  videoEl.src = URL.createObjectURL(file);
  videoBox.classList.remove("hidden");
  uploadText.textContent = "تغيير الفيديو";
  showToast("جاري رفع الفيديو...", "info");
  var url = await uploadVideo(file);
  if (url) {
    _uploadedVideoUrl = url;
    showToast("تم رفع الفيديو", "success");
  }
});

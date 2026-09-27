const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

function getSupabaseClient() {
  const url = window.SUPABASE_URL || "https://msgqzgzoslearaprgiqq.supabase.co";
  const key = window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
  return window.supabase.createClient(url, key);
}

const supabaseClient = getSupabaseClient();

let currentProduct = null;

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
    toast.style.transform = "translateX(-50%) translateY(-6px)";
    setTimeout(() => toast.remove(), 220);
  }, 2400);
}

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

function parseSizes(sizesStr) {
  if (!sizesStr) return {};
  const sizes = {};
  sizesStr.split(",").forEach(pair => {
    const [size, qty] = pair.split(":").map(s => s.trim());
    if (size && qty) sizes[size] = parseInt(qty) || 0;
  });
  return sizes;
}

function formatSizes(sizesObj) {
  if (!sizesObj || typeof sizesObj !== "object") return "";
  return Object.entries(sizesObj).map(([size, qty]) => `${size}:${qty}`).join(",");
}

function updateSizesPreview() {
  const input = document.getElementById("sizes_input");
  const preview = document.getElementById("sizesPreview");
  const sizes = parseSizes(input.value);
  
  if (Object.keys(sizes).length === 0) {
    preview.style.display = "none";
    return;
  }
  
  preview.style.display = "grid";
  preview.innerHTML = Object.entries(sizes).map(([size, qty]) => `
    <div class="size-item">
      <label>${escapeHtml(size)}</label>
      <input type="number" value="${qty}" min="0" readonly style="text-align:center;" />
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', '"');
}

async function loadProduct() {
  const id = getProductId();
  if (!id) {
    document.getElementById("loadingState").textContent = "معرف المنتج غير موجود.";
    return;
  }

  const { data, error } = await supabaseClient.from("products").select("*").eq("id", id).limit(1);
  if (error || !data || !data.length) {
    document.getElementById("loadingState").textContent = "فشل تحميل المنتج.";
    return;
  }

  currentProduct = data[0];
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("editForm").style.display = "block";
  document.getElementById("editProductName").textContent = currentProduct.product_name || currentProduct.name || "تعديل المنتج";

  // Basic Info
  document.getElementById("product_name").value = currentProduct.product_name || "";
  document.getElementById("name").value = currentProduct.name || "";
  document.getElementById("sku").value = currentProduct.sku || "";
  document.getElementById("slug").value = currentProduct.slug || "";
  document.getElementById("category").value = currentProduct.category || "";
  document.getElementById("store_category").value = currentProduct.store_category || "";
  document.getElementById("brand").value = currentProduct.brand || "";
  document.getElementById("status").value = currentProduct.status || "active";
  document.getElementById("is_active").value = currentProduct.is_active !== false ? "true" : "false";

  // Pricing
  document.getElementById("price").value = currentProduct.price ?? "";
  document.getElementById("price_after_discount").value = currentProduct.price_after_discount ?? "";
  document.getElementById("discount_percent").value = currentProduct.discount_percent ?? "";
  document.getElementById("original_price").value = currentProduct.original_price ?? "";
  document.getElementById("cost_price").value = currentProduct.cost_price ?? "";
  document.getElementById("compare_at_price").value = currentProduct.compare_at_price ?? "";

  // Inventory
  document.getElementById("quantity").value = currentProduct.quantity ?? "";
  document.getElementById("stock").value = currentProduct.stock ?? "";
  document.getElementById("reserved_quantity").value = currentProduct.reserved_quantity ?? "";
  document.getElementById("low_stock_threshold").value = currentProduct.low_stock_threshold ?? "";
  document.getElementById("track_inventory").value = currentProduct.track_inventory !== false ? "true" : "false";
  document.getElementById("allow_backorder").value = currentProduct.allow_backorder ? "true" : "false";

  // Sizes
  const sizesObj = currentProduct.sizes || currentProduct.variants || {};
  document.getElementById("sizes_input").value = formatSizes(sizesObj);
  updateSizesPreview();

  // Sales & Stats
  document.getElementById("sold_count").value = currentProduct.sold_count ?? "";
  document.getElementById("total_sold").value = currentProduct.total_sold ?? "";
  document.getElementById("sales_count").value = currentProduct.sales_count ?? "";
  document.getElementById("view_count").value = currentProduct.view_count ?? "";
  document.getElementById("rating").value = currentProduct.rating ?? "";
  document.getElementById("review_count").value = currentProduct.review_count ?? "";

  // Description
  document.getElementById("description").value = currentProduct.description || "";
  document.getElementById("short_description").value = currentProduct.short_description || "";

  // Images
  document.getElementById("image").value = currentProduct.image || "";
  document.getElementById("images").value = Array.isArray(currentProduct.images) ? currentProduct.images.join(", ") : (currentProduct.images || "");
  document.getElementById("img1").value = currentProduct.img1 || currentProduct.image1 || currentProduct.image_link1 || "";
  document.getElementById("img2").value = currentProduct.img2 || currentProduct.image2 || currentProduct.image_link2 || "";
  document.getElementById("img3").value = currentProduct.img3 || currentProduct.image3 || currentProduct.image_link3 || "";
  document.getElementById("img4").value = currentProduct.img4 || currentProduct.image4 || currentProduct.image_link4 || "";
  document.getElementById("img5").value = currentProduct.img5 || currentProduct.image5 || currentProduct.image_link5 || "";
  document.getElementById("thumbnail").value = currentProduct.thumbnail || "";

  // Image preview
  const imgPreview = document.getElementById("imagePreview");
  if (currentProduct.image) {
    imgPreview.src = currentProduct.image;
    imgPreview.style.display = "block";
  }

  // Video
  document.getElementById("video_url").value = currentProduct.video_url || currentProduct.video || currentProduct.product_video || currentProduct.video_link || "";

  // SEO
  document.getElementById("meta_title").value = currentProduct.meta_title || "";
  document.getElementById("meta_description").value = currentProduct.meta_description || "";
  document.getElementById("meta_keywords").value = currentProduct.meta_keywords || "";

  // Shipping
  document.getElementById("weight").value = currentProduct.weight ?? "";
  document.getElementById("length").value = currentProduct.length ?? "";
  document.getElementById("width").value = currentProduct.width ?? "";
  document.getElementById("height").value = currentProduct.height ?? "";
  document.getElementById("shipping_class").value = currentProduct.shipping_class || "";
  document.getElementById("free_shipping").value = currentProduct.free_shipping ? "true" : "false";

  // Other fields
  document.getElementById("product_type").value = currentProduct.product_type || "simple";
  document.getElementById("tax_class").value = currentProduct.tax_class || "";
  document.getElementById("manage_stock").value = currentProduct.manage_stock !== false ? "true" : "false";
  document.getElementById("backorders").value = currentProduct.backorders || "no";
  document.getElementById("purchasable").value = currentProduct.purchasable !== false ? "true" : "false";
  document.getElementById("virtual").value = currentProduct.virtual ? "true" : "false";
  document.getElementById("downloadable").value = currentProduct.downloadable ? "true" : "false";
  document.getElementById("featured").value = currentProduct.featured ? "true" : "false";
}

async function saveProduct() {
  if (!currentProduct) return;

  const product_name = document.getElementById("product_name").value.trim();
  const name = document.getElementById("name").value.trim();
  const sku = document.getElementById("sku").value.trim();
  const slug = document.getElementById("slug").value.trim();
  const category = document.getElementById("category").value.trim();
  const store_category = document.getElementById("store_category").value.trim();
  const brand = document.getElementById("brand").value.trim();
  const status = document.getElementById("status").value;
  const is_active = document.getElementById("is_active").value === "true";

  const price = parseFloat(document.getElementById("price").value) || 0;
  const price_after_discount = parseFloat(document.getElementById("price_after_discount").value) || 0;
  const discount_percent = parseFloat(document.getElementById("discount_percent").value) || 0;
  const original_price = parseFloat(document.getElementById("original_price").value) || 0;
  const cost_price = parseFloat(document.getElementById("cost_price").value) || 0;
  const compare_at_price = parseFloat(document.getElementById("compare_at_price").value) || 0;

  const quantity = parseInt(document.getElementById("quantity").value, 10) || 0;
  const stock = parseInt(document.getElementById("stock").value, 10) || 0;
  const reserved_quantity = parseInt(document.getElementById("reserved_quantity").value, 10) || 0;
  const low_stock_threshold = parseInt(document.getElementById("low_stock_threshold").value, 10) || 0;
  const track_inventory = document.getElementById("track_inventory").value === "true";
  const allow_backorder = document.getElementById("allow_backorder").value === "true";

  const sizes = parseSizes(document.getElementById("sizes_input").value);

  const sold_count = parseInt(document.getElementById("sold_count").value, 10) || 0;
  const total_sold = parseInt(document.getElementById("total_sold").value, 10) || 0;
  const sales_count = parseInt(document.getElementById("sales_count").value, 10) || 0;
  const view_count = parseInt(document.getElementById("view_count").value, 10) || 0;
  const rating = parseFloat(document.getElementById("rating").value) || 0;
  const review_count = parseInt(document.getElementById("review_count").value, 10) || 0;

  const description = document.getElementById("description").value.trim();
  const short_description = document.getElementById("short_description").value.trim();

  const image = document.getElementById("image").value.trim();
  const images = document.getElementById("images").value.trim();
  const img1 = document.getElementById("img1").value.trim();
  const img2 = document.getElementById("img2").value.trim();
  const img3 = document.getElementById("img3").value.trim();
  const img4 = document.getElementById("img4").value.trim();
  const img5 = document.getElementById("img5").value.trim();
  const thumbnail = document.getElementById("thumbnail").value.trim();

  const video_url = document.getElementById("video_url").value.trim();

  const meta_title = document.getElementById("meta_title").value.trim();
  const meta_description = document.getElementById("meta_description").value.trim();
  const meta_keywords = document.getElementById("meta_keywords").value.trim();

  const weight = parseFloat(document.getElementById("weight").value) || 0;
  const length = parseFloat(document.getElementById("length").value) || 0;
  const width = parseFloat(document.getElementById("width").value) || 0;
  const height = parseFloat(document.getElementById("height").value) || 0;
  const shipping_class = document.getElementById("shipping_class").value.trim();
  const free_shipping = document.getElementById("free_shipping").value === "true";

  const product_type = document.getElementById("product_type").value;
  const tax_class = document.getElementById("tax_class").value.trim();
  const manage_stock = document.getElementById("manage_stock").value === "true";
  const backorders = document.getElementById("backorders").value;
  const purchasable = document.getElementById("purchasable").value === "true";
  const virtual = document.getElementById("virtual").value === "true";
  const downloadable = document.getElementById("downloadable").value === "true";
  const featured = document.getElementById("featured").value === "true";

  if (!product_name) {
    showToast("يرجى إدخال اسم المنتج.", "error");
    return;
  }

  const btn = document.querySelector(".submit-btn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الحفظ...';

  try {
    const { error } = await supabaseClient
      .from("products")
      .update({
        product_name,
        name,
        sku,
        slug,
        category,
        store_category,
        brand,
        status,
        is_active,
        price,
        price_after_discount,
        discount_percent,
        original_price,
        cost_price,
        compare_at_price,
        quantity,
        stock,
        reserved_quantity,
        low_stock_threshold,
        track_inventory,
        allow_backorder,
        sizes,
        sold_count,
        total_sold,
        sales_count,
        view_count,
        rating,
        review_count,
        description,
        short_description,
        image,
        images,
        img1,
        img2,
        img3,
        img4,
        img5,
        thumbnail,
        video_url,
        meta_title,
        meta_description,
        meta_keywords,
        weight,
        length,
        width,
        height,
        shipping_class,
        free_shipping,
        product_type,
        tax_class,
        manage_stock,
        backorders,
        purchasable,
        virtual,
        downloadable,
        featured,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentProduct.id);

    if (error) {
      console.error("Save error:", error);
      showToast("فشل حفظ التعديلات: " + (error.message || error.error_description || "خطأ غير معروف"), "error");
      return;
    }

    showToast("تم حفظ التعديلات بنجاح.", "success");
    currentProduct.product_name = product_name;
    document.getElementById("editProductName").textContent = product_name;
  } catch (err) {
    console.error("Save exception:", err);
    showToast("حدث خطأ غير متوقع: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات';
  }
}

window.saveProduct = saveProduct;

document.addEventListener("DOMContentLoaded", () => {
  loadProduct();
  
  // Update sizes preview on input
  document.getElementById("sizes_input")?.addEventListener("input", updateSizesPreview);
  
  // Image preview on change
  document.getElementById("image")?.addEventListener("input", (e) => {
    const preview = document.getElementById("imagePreview");
    if (e.target.value) {
      preview.src = e.target.value;
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  });
});
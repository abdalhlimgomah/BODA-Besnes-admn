const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 220);
  }, 2400);
}

function getProductId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "";
}

async function loadProduct() {
  const id = getProductId();
  if (!id) {
    document.getElementById("loadingState").textContent = "معرف المنتج غير موجود.";
    return;
  }

  const { data, error } = await supabaseClient.from("taager_products").select("*").eq("id", id).limit(1);
  if (error || !data || !data.length) {
    document.getElementById("loadingState").textContent = "فشل تحميل المنتج.";
    return;
  }

  currentProduct = data[0];
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("editForm").style.display = "block";
  document.getElementById("editProductName").textContent = currentProduct.name || "تعديل المنتج";

  document.getElementById("name").value = currentProduct.name || "";
  document.getElementById("price").value = currentProduct.price ?? "";
  document.getElementById("stock").value = currentProduct.stock ?? "";
  document.getElementById("category").value = currentProduct.category || "";
  document.getElementById("is_active").value = currentProduct.is_active ? "true" : "false";
  document.getElementById("description").value = currentProduct.description || "";
  document.getElementById("image").value = currentProduct.image || "";
}

async function saveProduct() {
  if (!currentProduct) return;

  const name = document.getElementById("name").value.trim();
  const price = parseFloat(document.getElementById("price").value) || 0;
  const stock = parseInt(document.getElementById("stock").value, 10) || 0;
  const category = document.getElementById("category").value.trim();
  const is_active = document.getElementById("is_active").value === "true";
  const description = document.getElementById("description").value.trim();
  const image = document.getElementById("image").value.trim();

  if (!name) {
    showToast("يرجى إدخال اسم المنتج.", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("taager_products")
    .update({
      name,
      price,
      stock,
      category,
      is_active,
      description,
      image,
      updated_at: new Date().toISOString(),
    })
    .eq("id", currentProduct.id);

  if (error) {
    console.error("Save error:", error);
    showToast("فشل حفظ التعديلات: " + (error.message || error.error_description || "خطأ غير معروف"), "error");
    return;
  }

  showToast("تم حفظ التعديلات بنجاح.", "success");
  currentProduct.name = name;
  document.getElementById("editProductName").textContent = name;
}

window.saveProduct = saveProduct;

document.addEventListener("DOMContentLoaded", loadProduct);

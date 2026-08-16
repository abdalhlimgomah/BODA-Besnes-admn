const { createClient } = supabase;

const supabaseClient = createClient(
  "https://msgqzgzoslearaprgiqq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE"
);

const PRODUCT_COLUMNS = [
  "id",
  "taager_product_id",
  "name",
  "created_at",
  "description",
  "quick_details",
  "content_ideas",
  "category",
  "price",
  "original_price",
  "image",
  "images",
  "image1", "image2", "image3", "image4", "image5", "image6", "image7", "image8",
  "available_countries",
  "stock",
  "sales_count",
  "seller",
  "vendor",
  "company_name",
  "source",
  "return_allowed",
  "warranty",
  "colors",
  "sizes",
  "videos",
].join(",");

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

const COUNTRIES = [
  { code: "EG", name: "مصر" },
  { code: "SA", name: "السعودية" },
];

/* ── حالة محرر المقاسات/الألوان (للإضافة الجديدة) ── */
let newSizes = [];
let newColors = [];
const newMatrixStock = {};

/* ── حالة المحررات لكل منتج في وضع التعديل ── */
const editSizes = {};
const editColors = {};
const editMatrixStock = {};

/* ── التحميل التدريجي ── */
let allProducts = [];
let displayedCount = 0;
const PAGE_SIZE = 24;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function uploadImage(file) {
  if (!file) return "";
  const fileName = `${Date.now()}_${file.name.replace(/ /g, "_")}`;
  const { error } = await supabaseClient.storage.from("Buda").upload(fileName, file, { upsert: true });
  if (error) {
    console.error("Upload error:", error);
    showToast("فشل رفع الصورة: " + (error.message || "خطأ غير معروف"), "error");
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

function parseArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.slice();
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return value.split(/[,\n\r|]+/g).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseColors(value) {
  const raw = parseArray(value);
  return raw.map((c) => {
    if (typeof c === "string") return { name: c, value: "" };
    return { name: String(c.name || c.label || c.value || ""), value: String(c.value || c.hex || "") };
  });
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
  document.getElementById("videoFile").value = "";
}

/* ═══════════════ محرر مصفوفة المقاسات × الألوان ═══════════════ */
function sizeLabel(s) {
  return typeof s === "string" ? s : String((s && (s.name || s.size)) != null ? s.name || s.size : s || "");
}

function colorLabel(c) {
  return typeof c === "string" ? c : String((c && (c.name || c.label || c.value)) != null ? c.name || c.label || c.value : c || "");
}

function normalizeSizeObjects(arr) {
  return parseArray(arr)
    .map(function (s) {
      if (typeof s === "string") return { name: s, price: 0, stock: 0 };
      return { name: String(s.name || s.size || ""), price: safeNumber(s.price), stock: safeNumber(s.stock) };
    })
    .filter(function (s) { return s.name; });
}

function normalizeColorObjects(arr) {
  return parseColors(arr).map(function (c) {
    return {
      name: c.name,
      value: c.value || "",
      sizes: Array.isArray(c.sizes)
        ? c.sizes.map(function (cs) {
            return { size: String(cs.size || cs.name || ""), stock: safeNumber(cs.stock) };
          })
        : [],
    };
  });
}

function matrixKey(ci, si) { return ci + "_" + si; }

function matrixStock(store, ci, si) {
  const n = Number(store[matrixKey(ci, si)]);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function setMatrixCell(store, ci, si, value) {
  store[matrixKey(ci, si)] = safeNumber(value);
}

function setSizePriceAt(sizes, si, value) {
  if (sizes[si]) sizes[si].price = safeNumber(value);
}

function setSizeStockAt(sizes, si, value) {
  if (sizes[si]) sizes[si].stock = safeNumber(value);
}

function colorTotal(sizes, colors, store, ci) {
  return sizes.reduce((sum, s, si) => sum + matrixStock(store, ci, si), 0);
}

function sizeTotal(sizes, colors, store, si) {
  return colors.reduce((sum, c, ci) => sum + matrixStock(store, ci, si), 0);
}

function grandTotal(sizes, colors, store) {
  return colors.reduce((sum, c, ci) => sum + colorTotal(sizes, colors, store, ci), 0);
}

function matrixTableHtml(store, sizes, colors, cellHandler, priceHandler, qtyHandler, tableId) {
  if (!sizes.length && !colors.length) return "";
  const rows = [];
  const qtyLocked = colors.length > 0;

  const head = ['<th class="corner">اللون</th>'];
  sizes.forEach((s, si) => {
    const p = safeNumber(s.price) > 0 ? safeNumber(s.price).toFixed(2) : "";
    const q = colors.length ? sizeTotal(sizes, colors, store, si) : Math.max(0, safeNumber(s.stock));
    head.push(
      '<th class="m-size-th"><div class="m-size-name">' + escapeHtml(sizeLabel(s)) + "</div>" +
      '<div class="m-size-price-wrap"><span>السعر</span><input type="number" class="m-size-price" min="0" step="0.01" placeholder="—" value="' + p + '" oninput="' + priceHandler + '(' + si + ', this.value)" /></div>' +
      '<div class="m-size-qty-wrap"><span>العدد</span><input type="number" class="m-size-qty" data-size-qty="' + si + '" min="0" value="' + q + '" oninput="' + qtyHandler + '(' + si + ', this.value)" ' + (qtyLocked ? 'readonly disabled style="width:52px;background:transparent;border:none;text-align:center;"' : 'style="width:52px;"') + ' /></div>' +
      "</th>"
    );
  });
  head.push('<th class="m-row-total-head">إجمالي اللون</th>');
  rows.push("<tr>" + head.join("") + "</tr>");

  colors.forEach((c, ci) => {
    const tds = [
      '<td class="m-color-name"><span class="swatch" style="background:' + escapeHtml(c.value || "#999") + ';"></span><span>' + escapeHtml(colorLabel(c)) + "</span></td>",
    ];
    sizes.forEach((s, si) => {
      tds.push(
        '<td><input type="number" class="m-cell" min="0" placeholder="0" title="كمية ' + escapeHtml(colorLabel(c)) + ' × ' + escapeHtml(sizeLabel(s)) + '" value="' + matrixStock(store, ci, si) + '" oninput="' + cellHandler + '(' + ci + ', ' + si + ', this.value)" /></td>'
      );
    });
    tds.push('<td class="m-row-total">' + colorTotal(sizes, colors, store, ci) + "</td>");
    rows.push("<tr>" + tds.join("") + "</tr>");
  });

  if (colors.length) {
    const foot = ['<td class="m-foot-label">إجمالي المقاس</td>'];
    sizes.forEach((s, si) => {
      foot.push('<td class="m-foot-total">' + sizeTotal(sizes, colors, store, si) + "</td>");
    });
    foot.push('<td class="m-foot-grand">الإجمالي العام: <b>' + grandTotal(sizes, colors, store) + "</b></td>");
    rows.push('<tr class="m-foot">' + foot.join("") + "</tr>");
  }

  return '<table class="variant-matrix"' + (tableId ? ' id="' + tableId + '"' : "") + ">" + rows.join("") + "</table>";
}

function refreshMatrixTotals(table, sizes, colors, store) {
  if (!table) return;
  const rows = table.querySelectorAll("tr");
  colors.forEach((c, ci) => {
    const row = rows[ci + 1];
    const td = row && row.lastElementChild;
    if (td) td.textContent = colorTotal(sizes, colors, store, ci);
  });
  const foot = rows[colors.length + 1];
  if (foot) {
    sizes.forEach((s, si) => {
      const td = foot.children[si + 1];
      if (td) td.textContent = sizeTotal(sizes, colors, store, si);
    });
    const grand = foot.lastElementChild;
    if (grand) grand.textContent = grandTotal(sizes, colors, store);
  }
}

function renderVariantMatrix() {
  const table = document.getElementById("variantMatrix");
  if (!table) return;
  const empty = document.getElementById("matrixEmpty");
  const hasAny = newSizes.length > 0 || newColors.length > 0;
  if (empty) empty.style.display = hasAny ? "none" : "";
  table.innerHTML = matrixTableHtml(newMatrixStock, newSizes, newColors, "setCell", "setSizePrice", "setSizeStock");
}

function setCell(ci, si, value) {
  setMatrixCell(newMatrixStock, ci, si, value);
  refreshMatrixTotals(document.getElementById("variantMatrix"), newSizes, newColors, newMatrixStock);
  syncSizeStockInputs();
  syncColorStockInputs();
}

function setSizePrice(si, value) {
  setSizePriceAt(newSizes, si, value);
}

function setSizeStock(si, value) {
  setSizeStockAt(newSizes, si, value);
}

function sizeDisplayQty(sizes, colors, store, si) {
  const s = sizes[si] || {};
  return colors.length ? sizeTotal(sizes, colors, store, si) : Math.max(0, safeNumber(s.stock));
}

function syncSizeStockInputs() {
  document.querySelectorAll("#sizesList .size-qty-input").forEach((input) => {
    const idx = Number(input.getAttribute("data-size-qty"));
    if (Number.isFinite(idx)) input.value = sizeDisplayQty(newSizes, newColors, newMatrixStock, idx);
  });
  document.querySelectorAll("#variantMatrix .m-size-qty").forEach((input) => {
    const idx = Number(input.getAttribute("data-size-qty"));
    if (Number.isFinite(idx)) input.value = sizeDisplayQty(newSizes, newColors, newMatrixStock, idx);
  });
}

function renderSizesList() {
  const list = document.getElementById("sizesList");
  if (!list) return;
  list.innerHTML = "";
  const locked = newColors.length > 0;
  newSizes.forEach((size, idx) => {
    const qty = sizeDisplayQty(newSizes, newColors, newMatrixStock, idx);
    const chip = document.createElement("span");
    chip.className = "opt-chip";
    chip.innerHTML =
      `<span>${escapeHtml(sizeLabel(size))}</span>` +
      `<span class="chip-qty" title="${locked ? "العدد المحسوب من مصفوفة الألوان × المقاسات" : "عدد القطع لهذا المقاس"}">` +
      `<input type="number" class="size-qty-input" data-size-qty="${idx}" min="0" value="${qty}" oninput="setSizeStock(${idx}, this.value)" ${locked ? 'readonly disabled style="width:52px;background:transparent;border:none;text-align:center;"' : 'style="width:52px;"'} />` +
      `</span>` +
      (safeNumber(size.price) > 0 ? `<small title="السعر">ب${safeNumber(size.price).toFixed(2)}</small>` : "") +
      `<span class="chip-actions">
        <button type="button" title="تحريك لأعلى" class="move" onclick="moveSize(${idx},-1)"><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" title="تحريك لأسفل" class="move" onclick="moveSize(${idx},1)"><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" title="حذف" onclick="removeSize(${idx})"><i class="fa-solid fa-xmark"></i></button>
      </span>`;
    list.appendChild(chip);
  });
}

function addSize() {
  const input = document.getElementById("sizeInput");
  const priceInput = document.getElementById("sizePriceInput");
  const value = input.value.trim();
  if (!value) { input.focus(); return; }
  if (newSizes.some((s) => sizeLabel(s).toLowerCase() === value.toLowerCase())) {
    showToast("هذا المقاس موجود بالفعل", "error");
    return;
  }
  newSizes.push({ name: value, price: safeNumber(priceInput?.value), stock: 0 });
  input.value = "";
  if (priceInput) priceInput.value = "";
  renderSizesList();
  renderVariantMatrix();
}

function moveSize(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= newSizes.length) return;
  const tmp = newSizes[idx];
  newSizes[idx] = newSizes[target];
  newSizes[target] = tmp;
  renderSizesList();
  renderVariantMatrix();
}

function removeSize(idx) {
  newSizes.splice(idx, 1);
  renderSizesList();
  renderVariantMatrix();
}

function renderColorsList() {
  const list = document.getElementById("colorsList");
  if (!list) return;
  list.innerHTML = "";
  const locked = newSizes.length > 1;
  const showQty = newSizes.length >= 1;
  newColors.forEach((color, idx) => {
    const name = escapeHtml(colorLabel(color));
    const qty = showQty ? (newSizes.length === 1 ? matrixStock(newMatrixStock, idx, 0) : colorTotal(newSizes, newColors, newMatrixStock, idx)) : 0;
    const chip = document.createElement("span");
    chip.className = "opt-chip";
    chip.innerHTML =
      (color.value ? `<span class="swatch" style="background:${escapeHtml(color.value)};"></span>` : "") +
      `<span>${name}</span>` +
      (showQty
        ? `<span class="chip-qty" title="${locked ? "العدد المحسوب من مصفوفة الألوان × المقاسات" : "عدد القطع لهذا اللون"}">` +
          `<input type="number" class="color-qty-input" data-color-qty="${idx}" min="0" value="${qty}" oninput="setColorStock(${idx}, this.value)" ${locked ? 'readonly disabled style="width:52px;background:transparent;border:none;text-align:center;"' : 'style="width:52px;"'} /></span>`
        : "") +
      `<span class="chip-actions">
        <button type="button" title="تحريك لأعلى" class="move" onclick="moveColor(${idx},-1)"><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" title="تحريك لأسفل" class="move" onclick="moveColor(${idx},1)"><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" title="حذف" onclick="removeColor(${idx})"><i class="fa-solid fa-xmark"></i></button>
      </span>`;
    list.appendChild(chip);
  });
}

function setColorStock(ci, value) {
  if (newSizes.length !== 1) return;
  setMatrixCell(newMatrixStock, ci, 0, value);
  refreshMatrixTotals(document.getElementById("variantMatrix"), newSizes, newColors, newMatrixStock);
  syncSizeStockInputs();
}

function syncColorStockInputs() {
  document.querySelectorAll("#colorsList .color-qty-input").forEach((input) => {
    const ci = Number(input.getAttribute("data-color-qty"));
    if (!Number.isFinite(ci) || newSizes.length < 1) return;
    input.value = newSizes.length === 1 ? matrixStock(newMatrixStock, ci, 0) : colorTotal(newSizes, newColors, newMatrixStock, ci);
  });
}

function addColor() {
  const nameInput = document.getElementById("colorName");
  const valueInput = document.getElementById("colorValue");
  const name = nameInput.value.trim();
  const value = valueInput.value.trim();
  if (!name && !value) { nameInput.focus(); return; }
  const label = (name || value).toLowerCase();
  if (newColors.some((c) => (c.name || c.value).toLowerCase() === label)) {
    showToast("هذا اللون موجود بالفعل", "error");
    return;
  }
  newColors.push({ name, value });
  nameInput.value = "";
  renderColorsList();
  renderVariantMatrix();
}

function moveColor(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= newColors.length) return;
  const tmp = newColors[idx];
  newColors[idx] = newColors[target];
  newColors[target] = tmp;
  renderColorsList();
  renderVariantMatrix();
}

function removeColor(idx) {
  newColors.splice(idx, 1);
  renderColorsList();
  renderVariantMatrix();
}

/* ── إخراج المقاسات والألوان النهائيين (مع الكميات) ── */
function finalizeSizes(sizes, colors, store, fallbackStock) {
  const hasAnyCell = colors.some((c, ci) => sizes.some((s, si) => matrixStock(store, ci, si) > 0));
  return sizes.map((s, si) => {
    const typedStock = safeNumber(s.stock);
    const baseStock = Math.max(0, typedStock || Number(fallbackStock) || 0);
    return {
      name: sizeLabel(s),
      price: safeNumber(s.price) || 0,
      stock: colors.length && hasAnyCell ? sizeTotal(sizes, colors, store, si) : baseStock,
    };
  });
}

function sizeBasedTotal(sizes, colors, store) {
  if (!sizes.length) return 0;
  if (colors.length) return grandTotal(sizes, colors, store);
  return sizes.reduce((sum, s) => sum + Math.max(0, safeNumber(s.stock) || 0), 0);
}

function finalizeColors(sizes, colors, store) {
  return colors.map((c, ci) => ({
    name: colorLabel(c),
    value: c.value || "",
    sizes: sizes.map((s, si) => ({ size: sizeLabel(s), stock: matrixStock(store, ci, si) })),
  }));
}

/* ═══════════════ المصدر اليدوي ═══════════════ */
function onSourceChange() {
  const source = readInputValue("source");
  const wrap = document.getElementById("customSourceWrap");
  if (!wrap) return;
  wrap.classList.toggle("show", source === "manual");
  if (source === "manual") document.getElementById("custom_source").focus();
}

function getSourceValue() {
  const source = readInputValue("source");
  if (source === "manual") {
    const custom = readInputValue("custom_source");
    return custom || "manual";
  }
  return source || null;
}

/* ═══════════════ الدول المتاحة ═══════════════ */
function getSelectedCountries() {
  return Array.from(document.querySelectorAll("#countryChips .country-chip.on input"))
    .map((el) => el.value);
}

function setSelectedCountries(codes) {
  const selected = new Set(parseArray(codes));
  document.querySelectorAll("#countryChips .country-chip").forEach((chip) => {
    const input = chip.querySelector("input");
    const on = selected.has(input.value);
    chip.classList.toggle("on", on);
    input.checked = on;
  });
}

function renderCountryChips() {
  const wrap = document.getElementById("countryChips");
  wrap.innerHTML = "";
  COUNTRIES.forEach((c) => {
    const chip = document.createElement("label");
    chip.className = "country-chip";
    chip.innerHTML = `<input type="checkbox" value="${c.code}" />
      <i class="fa-solid fa-${c.code === "ALL" ? "globe" : "flag"}"></i>
      <span>${c.name}</span>`;
    chip.addEventListener("change", () => {
      chip.classList.toggle("on", chip.querySelector("input").checked);
      if (c.code === "ALL" && chip.querySelector("input").checked) {
        document.querySelectorAll("#countryChips .country-chip").forEach((other) => {
          if (other !== chip) other.classList.remove("on");
          if (other !== chip) other.querySelector("input").checked = false;
        });
      }
    });
    wrap.appendChild(chip);
  });
}

/* ═══════════════ قراءة بيانات النموذج ═══════════════ */
function collectFormPayload() {
  const name = readInputValue("name");
  const price = safeNumber(document.getElementById("price")?.value);
  const originalPrice = safeNumber(document.getElementById("original_price")?.value);
  const description = readInputValue("description");
  const stock = safeNumber(document.getElementById("stock")?.value);
  const salesCount = safeNumber(document.getElementById("sales_count")?.value);
  const category = readInputValue("category");
  const taagerProductId = readInputValue("taager_product_id");
  const seller = readInputValue("seller");
  const vendor = readInputValue("vendor");
  const companyName = readInputValue("company_name");
  const returnAllowed = document.getElementById("return_allowed")?.value === "true";
  const warranty = readInputValue("warranty");
  const quickDetails = readInputValue("quick_details");
  const contentIdeas = readInputValue("content_ideas");
  const availableCountries = getSelectedCountries();

  return {
    name: name,
    price: price,
    original_price: originalPrice || null,
    description: description,
    stock: stock > 0 ? stock : sizeBasedTotal(newSizes, newColors, newMatrixStock),
    sales_count: salesCount,
    category: category,
    seller: seller || null,
    vendor: vendor || null,
    company_name: companyName || null,
    source: getSourceValue(),
    return_allowed: returnAllowed,
    warranty: warranty || null,
    quick_details: quickDetails,
    content_ideas: contentIdeas,
    available_countries: availableCountries,
    is_active: true,
    taager_product_id: taagerProductId || null,
    colors: finalizeColors(newSizes, newColors, newMatrixStock),
    sizes: finalizeSizes(newSizes, newColors, newMatrixStock, stock),
  };
}

function parentKeyFor(productId, taagerProductId) {
  return taagerProductId || String(productId);
}

/* ═══════════════ حفظ المقاسات في taager_variant_groups ═══════════════ */
async function saveVariantGroup(rowId, parentId, sizes, name, thumbnail) {
  if (!sizes.length) return;
  const variants = sizes.map((size) => ({
    id: String(rowId),
    size: sizeLabel(size),
    price: safeNumber(size.price) || 0,
    name: name,
    sku: "",
    thumbnail: thumbnail || "",
  }));
  const { error } = await supabaseClient.from("taager_variant_groups").upsert(
    {
      parent_id: parentId,
      variants: variants,
      product_name: name,
      variant_count: variants.length,
      thumbnail: thumbnail || null,
    },
    { onConflict: "parent_id", ignoreDuplicates: false }
  );
  if (error) {
    console.warn("Variant group upsert error:", error.message);
    showToast("تمت إضافة المنتج لكن فشل حفظ المقاسات: " + error.message, "error");
  }
}

async function deleteVariantGroup(parentId) {
  const { error } = await supabaseClient.from("taager_variant_groups").delete().eq("parent_id", parentId);
  if (error) console.warn("Variant group delete error:", error.message);
}

/* ═══════════════ إضافة منتج ═══════════════ */
async function addProduct() {
  const payload = collectFormPayload();

  if (!payload.name || !payload.price || !payload.category) {
    showToast("يرجى إدخال الاسم والسعر والقسم.", "error");
    return;
  }

  const generatedId = payload.taager_product_id
    ? "taager_" + payload.taager_product_id
    : "prod_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const fileInput = document.getElementById("imageFile");
  const files = fileInput?.files ? Array.from(fileInput.files) : [];
  if (files.length > 8) {
    showToast("يمكنك رفع 8 صور كحد أقصى.", "error");
    return;
  }

  const uploadedUrls = [];
  for (let i = 0; i < files.length; i++) {
    const url = await uploadImage(files[i]);
    if (url) uploadedUrls.push(url);
  }

  const linkUrls = collectImageLinks();
  const allImages = uploadedUrls.concat(linkUrls).slice(0, 8);
  if (allImages.length) {
    payload.image = allImages[0];
    payload.images = allImages;
    for (let i = 0; i < allImages.length; i++) {
      payload["image" + (i + 1)] = allImages[i];
    }
  }

  if (_uploadedVideoUrl) {
    payload.videos = [_uploadedVideoUrl];
  } else {
    const videoUrlInput = document.getElementById("videoUrlInput");
    const videoUrl = videoUrlInput ? videoUrlInput.value.trim() : "";
    if (videoUrl) payload.videos = [videoUrl];
  }

  payload.id = generatedId;
  const sizes = payload.sizes;

  const { data, error } = await supabaseClient.from("taager_products").insert([payload]).select("id, name, image, taager_product_id");

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const row = data && data[0];
  if (row && sizes.length) {
    await saveVariantGroup(row.id, parentKeyFor(row.id, row.taager_product_id), sizes, row.name, row.image);
  }

  showToast("تمت إضافة المنتج بنجاح", "success");
  clearForm();
  await loadProducts();
}

/* ═══════════════ تعديل منتج ═══════════════ */
async function updateProduct(id) {
  const name = readInputValue(`name_${id}`);
  const price = safeNumber(readInputValue(`price_${id}`));
  const originalPriceEl = document.getElementById(`original_price_${id}`);
  const originalPrice = originalPriceEl ? safeNumber(originalPriceEl.value) : undefined;
  const description = readInputValue(`description_${id}`);
  const stock = safeNumber(readInputValue(`stock_${id}`));
  const salesCountEl = document.getElementById(`sales_count_${id}`);
  const salesCount = salesCountEl ? safeNumber(salesCountEl.value) : undefined;
  const category = readInputValue(`category_${id}`);
  const seller = readInputValue(`seller_${id}`) || null;
  const vendor = readInputValue(`vendor_${id}`) || null;
  const companyName = readInputValue(`company_name_${id}`) || null;
  const returnAllowedEl = document.getElementById(`return_allowed_${id}`);
  const returnAllowed = returnAllowedEl ? returnAllowedEl.value === "true" : undefined;
  const warranty = readInputValue(`warranty_${id}`) || null;
  const quickDetails = readInputValue(`quick_details_${id}`);
  const contentIdeas = readInputValue(`content_ideas_${id}`);
  const sourceEl = document.getElementById(`source_${id}`);
  let source = sourceEl ? sourceEl.value || null : null;
  if (source === "manual") {
    const customEl = document.getElementById(`custom_source_${id}`);
    source = customEl && customEl.value.trim() ? customEl.value.trim() : "manual";
  }
  const taagerProductId = readInputValue(`taager_product_id_${id}`) || null;
  const countriesWrap = document.getElementById(`countryChips_${id}`);
  const availableCountries = countriesWrap
    ? Array.from(countriesWrap.querySelectorAll(".country-chip.on input")).map((el) => el.value)
    : undefined;

  const editSizesArr = editSizes[id] || [];
  const editColorsArr = editColors[id] || [];
  const sizes = finalizeSizes(editSizesArr, editColorsArr, editMatrixStock[id] || {}, stock);
  const colors = finalizeColors(editSizesArr, editColorsArr, editMatrixStock[id] || {});
  const derivedStock = sizeBasedTotal(editSizesArr, editColorsArr, editMatrixStock[id] || {});

  const updatePayload = {
    name: name,
    price: price,
    description: description,
    stock: stock > 0 ? stock : derivedStock,
    category: category,
    seller: seller,
    vendor: vendor,
    company_name: companyName,
    source: source,
    warranty: warranty,
    quick_details: quickDetails,
    content_ideas: contentIdeas,
    sizes: sizes,
    colors: colors,
    updated_at: new Date().toISOString(),
  };

  if (originalPrice !== undefined) updatePayload.original_price = originalPrice || null;
  if (salesCount !== undefined) updatePayload.sales_count = salesCount;
  if (returnAllowed !== undefined) updatePayload.return_allowed = returnAllowed;
  if (availableCountries !== undefined) updatePayload.available_countries = availableCountries;
  if (taagerProductId) updatePayload.taager_product_id = taagerProductId;

  const { error } = await supabaseClient.from("taager_products").update(updatePayload).eq("id", id);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const parentId = taagerProductId || String(id);
  if (sizes.length) {
    await saveVariantGroup(id, parentId, sizes, name, "");
  } else {
    await deleteVariantGroup(parentId);
  }

  showToast("تم تعديل المنتج", "success");
  await loadProducts();
}

async function deleteProduct(id) {
  if (!confirm("هل أنت متأكد من حذف المنتج؟")) return;

  const { data: existing } = await supabaseClient.from("taager_products").select("taager_product_id").eq("id", id).single();

  const { error } = await supabaseClient.from("taager_products").delete().eq("id", id);
  if (error) {
    showToast(error.message, "error");
    return;
  }

  if (existing && existing.taager_product_id) {
    await deleteVariantGroup(existing.taager_product_id);
  }

  showToast("تم حذف المنتج", "success");
  await loadProducts();
}

/* ═══════════════ عرض القوائم ═══════════════ */
function categoryOptions(selectedCategory = "") {
  return CATEGORIES.map(
    (category) => `<option value="${category}" ${category === selectedCategory ? "selected" : ""}>${category}</option>`
  ).join("");
}

function countryChipsHtml(id, selected) {
  const selectedSet = new Set(parseArray(selected));
  return `<div class="country-chips" id="countryChips_${id}">${COUNTRIES.map((c) => {
    const on = selectedSet.has(c.code);
    return `<label class="country-chip ${on ? "on" : ""}">
      <input type="checkbox" value="${c.code}" ${on ? "checked" : ""} />
      <i class="fa-solid fa-${c.code === "ALL" ? "globe" : "flag"}"></i>
      <span>${c.name}</span>
    </label>`;
  }).join("")}</div>`;
}

function renderEditChips(id, sizes, colors) {
  const sizesArr = editSizes[id] || normalizeSizeObjects(sizes);
  const colorsArr = editColors[id] || normalizeColorObjects(colors);
  editSizes[id] = sizesArr;
  editColors[id] = colorsArr;

  if (!editMatrixStock[id]) {
    const seed = {};
    colorsArr.forEach((c, ci) => {
      (c.sizes || []).forEach((cs) => {
        const si = sizesArr.findIndex((s) => sizeLabel(s).toLowerCase() === String(cs.size || "").toLowerCase());
        if (si >= 0) seed[matrixKey(ci, si)] = safeNumber(cs.stock);
      });
    });
    editMatrixStock[id] = seed;
  }

  const sizesChips = `
    <div class="edit-opt-list" id="sizesChips_${id}">
      ${sizesArr.length ? sizesArr.map((s, i) => {
        const editQty = colorsArr.length ? sizeTotal(sizesArr, colorsArr, editMatrixStock[id], i) : Math.max(0, safeNumber(s.stock));
        return `<span class="edit-opt-chip">${escapeHtml(sizeLabel(s))}
          <span class="chip-qty" title="${colorsArr.length ? "العدد المحسوب من مصفوفة الألوان × المقاسات" : "عدد القطع لهذا المقاس"}">
            <input type="number" class="edit-size-qty-input" data-edit-size-qty="${i}" min="0" value="${editQty}" oninput="editSetSizeStock('${id}', ${i}, this.value)" ${colorsArr.length ? 'readonly disabled style="width:48px;background:transparent;border:none;text-align:center;"' : 'style="width:48px;"'} />
          </span>
          ${safeNumber(s.price) > 0 ? `<small title="السعر">ب${safeNumber(s.price).toFixed(2)}</small>` : ""}
          <button type="button" onclick="editMoveSize('${id}', ${i}, -1)" title="أعلى"><i class="fa-solid fa-arrow-up"></i></button>
          <button type="button" onclick="editMoveSize('${id}', ${i}, 1)" title="أسفل"><i class="fa-solid fa-arrow-down"></i></button>
          <button type="button" onclick="editRemoveSize('${id}', ${i})" title="حذف"><i class="fa-solid fa-xmark"></i></button>
        </span>`;
      }).join("") : `<span class="opt-empty">لا توجد مقاسات.</span>`}
      <input type="text" id="sizeInput_${id}" placeholder="أضف مقاس..." style="width:110px;padding:5px 8px;border:1px solid var(--border,#d8dee9);border-radius:14px;font-size:0.72rem;font-family:inherit;background:var(--card-bg,#fff);color:var(--text,#1f2937);"
        onkeydown="if(event.key==='Enter'){event.preventDefault();editAddSize('${id}')}" />
      <input type="number" id="sizePriceInput_${id}" placeholder="سعر المقاس" min="0" step="0.01" style="width:96px;padding:5px 8px;border:1px solid var(--border,#d8dee9);border-radius:14px;font-size:0.72rem;font-family:inherit;background:var(--card-bg,#fff);color:var(--text,#1f2937);" />
      <button type="button" class="btn btn-primary" onclick="editAddSize('${id}')" style="padding:4px 12px;font-size:0.72rem;"><i class="fa-solid fa-plus"></i></button>
    </div>`;

  const colorsChips = `
    <div class="edit-opt-list" id="colorsChips_${id}">
      ${colorsArr.length ? colorsArr.map((c, i) => {
        const editColorLocked = sizesArr.length > 1;
        const editColorQty = sizesArr.length >= 1 ? (sizesArr.length === 1 ? matrixStock(editMatrixStock[id], i, 0) : colorTotal(sizesArr, colorsArr, editMatrixStock[id], i)) : 0;
        return `<span class="edit-opt-chip">${c.value ? `<span class="swatch" style="background:${escapeHtml(c.value)};"></span>` : ""}${escapeHtml(colorLabel(c))}
          ${sizesArr.length >= 1 ? `<span class="chip-qty" title="${editColorLocked ? "العدد المحسوب من مصفوفة الألوان × المقاسات" : "عدد القطع لهذا اللون"}">
            <input type="number" class="edit-color-qty-input" data-edit-color-qty="${i}" min="0" value="${editColorQty}" oninput="editSetColorStock('${id}', ${i}, this.value)" ${editColorLocked ? 'readonly disabled style="width:48px;background:transparent;border:none;text-align:center;"' : 'style="width:48px;"'} />
          </span>` : ""}
          <button type="button" onclick="editRemoveColor('${id}', ${i})" title="حذف"><i class="fa-solid fa-xmark"></i></button>
        </span>`;
      }).join("") : `<span class="opt-empty">لا توجد ألوان.</span>`}
      <input type="color" id="colorValue_${id}" value="#ff6b1a" style="width:34px;height:26px;border:1px solid var(--border,#d8dee9);border-radius:6px;padding:1px;cursor:pointer;" />
      <input type="text" id="colorName_${id}" placeholder="لون جديد..." style="width:110px;padding:5px 8px;border:1px solid var(--border,#d8dee9);border-radius:14px;font-size:0.72rem;font-family:inherit;background:var(--card-bg,#fff);color:var(--text,#1f2937);"
        onkeydown="if(event.key==='Enter'){event.preventDefault();editAddColor('${id}')}" />
      <button type="button" class="btn btn-primary" onclick="editAddColor('${id}')" style="padding:4px 12px;font-size:0.72rem;"><i class="fa-solid fa-plus"></i></button>
    </div>`;

  const matrixHtml = `
    <div class="edit-matrix-wrap" id="editMatrixWrap_${id}" style="margin-top:6px;">
      ${!sizesArr.length && !colorsArr.length ? '<div class="opt-empty">لا توجد مقاسات وألوان بعد.</div>' : matrixTableHtml(editMatrixStock[id], sizesArr, colorsArr, "editSetCell('" + id + "')", "editSetSizePrice('" + id + "')", "editSetSizeStock('" + id + "')", "editMatrix_" + id)}
    </div>`;

  return { sizesChips, colorsChips, matrixHtml };
}

function editSetCell(id, ci, si, value) {
  setMatrixCell(editMatrixStock[id], ci, si, value);
  refreshMatrixTotals(document.getElementById("editMatrix_" + id), editSizes[id] || [], editColors[id] || [], editMatrixStock[id]);
  syncEditSizeStockInputs(id);
  syncEditColorStockInputs(id);
}

function editSetSizePrice(id, si, value) {
  setSizePriceAt(editSizes[id], si, value);
}

function editSetSizeStock(id, si, value) {
  setSizeStockAt(editSizes[id], si, value);
}

function syncEditSizeStockInputs(id) {
  document.querySelectorAll(`#sizesChips_${id} [data-edit-size-qty], #editMatrix_${id} .m-size-qty`).forEach((input) => {
    const idx = Number(input.getAttribute("data-edit-size-qty") || input.getAttribute("data-size-qty"));
    if (Number.isFinite(idx)) {
      input.value = (editColors[id] || []).length
        ? sizeTotal(editSizes[id] || [], editColors[id] || [], editMatrixStock[id], idx)
        : Math.max(0, safeNumber((editSizes[id] || [])[idx]?.stock));
    }
  });
}

function editSetColorStock(id, ci, value) {
  const sizesArr = editSizes[id] || [];
  if (sizesArr.length !== 1) return;
  setMatrixCell(editMatrixStock[id], ci, 0, value);
  refreshMatrixTotals(document.getElementById("editMatrix_" + id), sizesArr, editColors[id] || [], editMatrixStock[id]);
  syncEditSizeStockInputs(id);
}

function syncEditColorStockInputs(id) {
  document.querySelectorAll(`[data-edit-color-qty]`).forEach((input) => {
    if (!input.closest(`#colorsChips_${id}`)) return;
    const ci = Number(input.getAttribute("data-edit-color-qty"));
    const sizesArr = editSizes[id] || [];
    if (!Number.isFinite(ci) || sizesArr.length < 1) return;
    input.value = sizesArr.length === 1 ? matrixStock(editMatrixStock[id], ci, 0) : colorTotal(sizesArr, editColors[id] || [], editMatrixStock[id], ci);
  });
}

function editAddSize(id) {
  const input = document.getElementById(`sizeInput_${id}`);
  const priceInput = document.getElementById(`sizePriceInput_${id}`);
  const value = input.value.trim();
  if (!value) return;
  const arr = editSizes[id] || (editSizes[id] = []);
  if (arr.some((s) => sizeLabel(s).toLowerCase() === value.toLowerCase())) {
    showToast("هذا المقاس موجود بالفعل", "error");
    return;
  }
  arr.push({ name: value, price: safeNumber(priceInput?.value), stock: 0 });
  input.value = "";
  if (priceInput) priceInput.value = "";
  renderEditChipsFor(id);
}

function editMoveSize(id, idx, dir) {
  const arr = editSizes[id] || [];
  const target = idx + dir;
  if (target < 0 || target >= arr.length) return;
  const tmp = arr[idx];
  arr[idx] = arr[target];
  arr[target] = tmp;
  renderEditChipsFor(id);
}

function editRemoveSize(id, idx) {
  const arr = editSizes[id] || [];
  arr.splice(idx, 1);
  renderEditChipsFor(id);
}

function editAddColor(id) {
  const nameInput = document.getElementById(`colorName_${id}`);
  const valueInput = document.getElementById(`colorValue_${id}`);
  const name = nameInput.value.trim();
  const value = valueInput.value.trim();
  if (!name && !value) return;
  const arr = editColors[id] || (editColors[id] = []);
  const label = (name || value).toLowerCase();
  if (arr.some((c) => (c.name || c.value).toLowerCase() === label)) {
    showToast("هذا اللون موجود بالفعل", "error");
    return;
  }
  arr.push({ name, value, sizes: [] });
  nameInput.value = "";
  renderEditChipsFor(id);
}

function editRemoveColor(id, idx) {
  const arr = editColors[id] || [];
  arr.splice(idx, 1);
  renderEditChipsFor(id);
}

function renderEditChipsFor(id) {
  const product = (allProducts || []).find((p) => String(p.id) === String(id));
  const { sizesChips, colorsChips, matrixHtml } = renderEditChips(id, product?.sizes, product?.colors);
  const sizesContainer = document.getElementById(`sizesChips_${id}`);
  const colorsContainer = document.getElementById(`colorsChips_${id}`);
  const matrixWrap = document.getElementById(`editMatrixWrap_${id}`);
  if (sizesContainer) sizesContainer.outerHTML = sizesChips;
  if (colorsContainer) colorsContainer.outerHTML = colorsChips;
  if (matrixWrap) matrixWrap.outerHTML = matrixHtml;
}

/* ═══════════════ قائمة المنتجات ═══════════════ */
function getProductImages(product) {
  const images = [];
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
  if (product.extra_links) {
    try {
      const parsed = JSON.parse(product.extra_links);
      if (Array.isArray(parsed)) parsed.forEach((url) => pushUrl(url));
    } catch (_) {
      product.extra_links.split(/[,\n\r;|]+/g).forEach((s) => pushUrl(s.trim()));
    }
  }
  if (product.images) {
    if (Array.isArray(product.images)) product.images.forEach((url) => pushUrl(url));
    else if (typeof product.images === "string") pushUrl(product.images);
  }
  return images;
}

function getProductVideo(product) {
  let video = "";
  if (product.videos) {
    if (Array.isArray(product.videos)) video = product.videos[0] || "";
    else video = product.videos;
  }
  return video || product.video_url || product.video || product.product_video || product.video_link || "";
}

function estimatedDiscount(price, originalPrice) {
  if (!originalPrice || !price || originalPrice <= 0 || price >= originalPrice) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

function buildCard(product) {
  const id = product.id;
  const discountValue = estimatedDiscount(Number(product.price), Number(product.original_price || 0));
  const sizes = editSizes[id] || normalizeSizeObjects(product.sizes);
  const colors = editColors[id] || parseColors(product.colors);
  const editChips = renderEditChips(id, product.sizes, product.colors);
  const countries = parseArray(product.available_countries).join("، ") || "-";
  const returnOk = product.return_allowed !== false;
  const video = getProductVideo(product);
  const productImages = getProductImages(product);
  const hasMultipleImages = productImages.length > 1;

  return `
  <article class="product-card" id="card_${id}">
    <div class="product-card-media${hasMultipleImages ? " has-gallery" : ""}" onclick="openGalleryById('${id}')">
      ${productImages.map(function (img, idx) {
        return '<img class="admin-card-img' + (idx === 0 ? " active" : "") + '" src="' + escapeHtml(img) + '" alt="' + escapeHtml(product.name || "منتج") + '" data-index="' + idx + '" loading="lazy" />';
      }).join("")}
      ${video ? '<div class="admin-video-badge"><i class="fa-solid fa-video"></i></div>' : ""}
      ${hasMultipleImages ? '<div class="admin-card-counter">1/' + productImages.length + '</div>' : ""}
      ${hasMultipleImages ? '<div class="admin-card-dots">' + productImages.map(function (_, idx) {
        return '<span class="' + (idx === 0 ? "active" : "") + '" data-index="' + idx + '"></span>';
      }).join("") + '</div>' : ""}
    </div>
    <div class="product-summary">
      <p class="product-name">${escapeHtml(product.name || product.product_name || "-")}</p>
      <div class="price-row">
        ${product.original_price ? `<del>${safeNumber(product.original_price).toFixed(2)}</del>` : ""}
        <span>${safeNumber(product.price).toFixed(2)} ج.م</span>
        ${discountValue ? `<span class="admin-status-pill ok" style="margin-inline-start:6px;">-${discountValue}%</span>` : ""}
      </div>
      <p>القسم: ${escapeHtml(product.category || "-")}</p>
      <div class="mini-info-row">
        <span><i class="fa-solid fa-box"></i> مخزون: ${safeNumber(product.stock)}</span>
        <span><i class="fa-solid fa-cart-shopping"></i> مأخوذ: ${safeNumber(product.sales_count)}</span>
        <span><i class="fa-solid fa-user-tie"></i> ${escapeHtml(product.seller || "-")}</span>
        ${product.vendor ? `<span><i class="fa-solid fa-truck"></i> ${escapeHtml(product.vendor)}</span>` : ""}
        ${product.company_name ? `<span><i class="fa-solid fa-building"></i> ${escapeHtml(product.company_name)}</span>` : ""}
        ${product.source ? `<span><i class="fa-solid fa-database"></i> ${escapeHtml(product.source)}</span>` : ""}
        ${product.taager_product_id ? `<span><i class="fa-solid fa-hashtag"></i> ${escapeHtml(product.taager_product_id)}</span>` : ""}
        <span><i class="fa-solid fa-globe"></i> ${escapeHtml(countries)}</span>
        <span class="admin-status-pill ${returnOk ? "ok" : "no"}">${returnOk ? "قابل للإرجاع" : "غير قابل للإرجاع"}</span>
        ${product.warranty ? `<span><i class="fa-solid fa-shield-halved"></i> ضمان: ${escapeHtml(product.warranty)}</span>` : ""}
        <span><i class="fa-solid fa-ruler-combined"></i> ${sizes.length ? sizes.map(sizeLabel).join("، ") : "بدون مقاسات"}</span>
        <span>${
          colors.length
            ? colors.map((c) => `<span class="swatch" style="width:12px;height:12px;border-radius:50%;display:inline-block;background:${escapeHtml(c.value || "#999")};border:1px solid rgba(0,0,0,0.15);" title="${escapeHtml(c.name || c.value)}"></span>`).join(" ")
            : "بدون ألوان"
        }</span>
      </div>
      ${product.quick_details ? `<p style="font-size:0.78rem;color:var(--muted,#667085);"><i class="fa-solid fa-eye"></i> ${escapeHtml(product.quick_details)}</p>` : ""}
      ${product.content_ideas ? `<p style="font-size:0.78rem;color:var(--muted,#667085);"><i class="fa-solid fa-list"></i> ${escapeHtml(product.content_ideas)}</p>` : ""}
      ${product.description ? `<p style="font-size:0.78rem;">${escapeHtml(product.description)}</p>` : ""}
      ${video ? '<p><i class="fa-solid fa-video"></i> فيديو</p>' : ""}
    </div>
    <div class="inline-grid" id="editFields_${id}">
      <div class="edit-field span-2">
        <label for="name_${id}">اسم المنتج</label>
        <input type="text" id="name_${id}" value="${escapeHtml(product.name || product.product_name || "")}" />
      </div>
      <div class="edit-field">
        <label for="price_${id}">السعر</label>
        <input type="number" id="price_${id}" value="${safeNumber(product.price)}" />
      </div>
      <div class="edit-field">
        <label for="original_price_${id}">قبل الخصم</label>
        <input type="number" id="original_price_${id}" value="${safeNumber(product.original_price)}" />
      </div>
      <div class="edit-field">
        <label for="stock_${id}">الكمية</label>
        <input type="number" id="stock_${id}" value="${safeNumber(product.stock)}" />
      </div>
      <div class="edit-field">
        <label for="sales_count_${id}">المأخوذ</label>
        <input type="number" id="sales_count_${id}" value="${safeNumber(product.sales_count)}" />
      </div>
      <div class="edit-field">
        <label for="taager_product_id_${id}">كود المنتج</label>
        <input type="text" id="taager_product_id_${id}" value="${escapeHtml(product.taager_product_id || "")}" dir="ltr" />
      </div>
      <div class="edit-field">
        <label for="category_${id}">القسم</label>
        <select id="category_${id}">
          ${categoryOptions(product.category || "")}
        </select>
      </div>
      <div class="edit-field">
        <label for="seller_${id}">التاجر</label>
        <input type="text" id="seller_${id}" value="${escapeHtml(product.seller || "")}" />
      </div>
      <div class="edit-field">
        <label for="vendor_${id}">Vendor</label>
        <input type="text" id="vendor_${id}" value="${escapeHtml(product.vendor || "")}" />
      </div>
      <div class="edit-field">
        <label for="company_name_${id}">الشركة</label>
        <input type="text" id="company_name_${id}" value="${escapeHtml(product.company_name || "")}" />
      </div>
      <div class="edit-field">
        <label for="source_${id}">المصدر</label>
        <select id="source_${id}">
          <option value="">—</option>
          <option value="taager" ${product.source === "taager" ? "selected" : ""}>Taager</option>
          <option value="manual" ${product.source && product.source !== "taager" ? "selected" : ""}>يدوي</option>
        </select>
        ${product.source && product.source !== "taager" ? `<input type="text" id="custom_source_${id}" value="${escapeHtml(product.source)}" placeholder="اكتب اسم المصدر..." style="margin-top:5px;" />` : ""}
      </div>
      <div class="edit-field">
        <label for="return_allowed_${id}">الإرجاع</label>
        <select id="return_allowed_${id}">
          <option value="true" ${product.return_allowed !== false ? "selected" : ""}>نعم</option>
          <option value="false" ${product.return_allowed === false ? "selected" : ""}>لا</option>
        </select>
      </div>
      <div class="edit-field">
        <label for="warranty_${id}">الضمان</label>
        <input type="text" id="warranty_${id}" value="${escapeHtml(product.warranty || "")}" placeholder="مثال: 12 شهر" />
      </div>
      <div class="edit-field span-2">
        <label for="quick_details_${id}">نظرة عامة</label>
        <textarea id="quick_details_${id}">${escapeHtml(product.quick_details || "")}</textarea>
      </div>
      <div class="edit-field span-2">
        <label for="content_ideas_${id}">المواصفات</label>
        <textarea id="content_ideas_${id}">${escapeHtml(product.content_ideas || "")}</textarea>
      </div>
      <div class="edit-field span-2">
        <label for="description_${id}">الوصف</label>
        <input type="text" id="description_${id}" value="${escapeHtml(product.description || "")}" />
      </div>
      <div class="edit-field span-2">
        <label><i class="fa-solid fa-ruler-combined"></i> المقاسات (السعر والترتيب بالأسهم)</label>
        ${editChips.sizesChips}
      </div>
      <div class="edit-field span-2">
        <label><i class="fa-solid fa-palette"></i> الألوان</label>
        ${editChips.colorsChips}
      </div>
      <div class="edit-field span-2">
        <label><i class="fa-solid fa-table-cells-large"></i> الكميات (لون × مقاس) — إجمالي كل لون ومقاس يحسب تلقائياً</label>
        ${editChips.matrixHtml}
      </div>
      <div class="edit-field span-2">
        <label>الدول المتاحة</label>
        ${countryChipsHtml(id, product.available_countries)}
      </div>
      <div class="edit-field" style="grid-column:1/-1;">
        <label>صور المنتج (لإضافة صور جديدة)</label>
        <input type="file" accept="image/*" multiple onchange="renderImagePreviews()" />
      </div>
    </div>
    <div class="product-actions">
      <button class="update-btn" id="editBtn_${id}" onclick="toggleEdit('${id}')">تعديل</button>
      <button class="delete-btn" onclick="deleteProduct('${id}')">حذف</button>
    </div>
  </article>`;
}

function renderProductsList() {
  const container = document.getElementById("products");
  const visible = allProducts.slice(0, displayedCount);
  container.innerHTML = visible.length ? visible.map(buildCard).join("") : '<div class="empty-state">لا توجد منتجات حالياً</div>';

  const wrap = document.getElementById("loadMoreWrap");
  if (wrap) {
    wrap.style.display = displayedCount < allProducts.length ? "flex" : "none";
    const btn = document.getElementById("loadMoreBtn");
    if (btn) btn.textContent = `عرض المزيد (${displayedCount}/${allProducts.length})`;
  }
}

function loadMoreProducts() {
  displayedCount = Math.min(displayedCount + PAGE_SIZE, allProducts.length);
  renderProductsList();
}

async function loadProducts() {
  const container = document.getElementById("products");
  container.innerHTML = '<div class="empty-state">جاري تحميل المنتجات...</div>';

  let all = [];
  const batchSize = 1000;
  let from = 0;
  let hasMore = true;
  let attempts = 0;

  while (hasMore && attempts < 60) {
    const to = from + batchSize - 1;
    const { data, error } = await supabaseClient
      .from("taager_products")
      .select(PRODUCT_COLUMNS)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      showToast(error.message, "error");
      break;
    }
    if (!Array.isArray(data) || !data.length) break;
    all = all.concat(data);
    if (data.length < batchSize) break;
    from += batchSize;
    attempts++;
  }

  allProducts = all;
  displayedCount = Math.min(PAGE_SIZE, allProducts.length);

  if (!allProducts.length) {
    container.innerHTML = '<div class="empty-state">لا توجد منتجات حالياً</div>';
    return;
  }

  renderProductsList();
}

/* ═══════════════ التعديل داخل البطاقة ═══════════════ */
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

/* ═══════════════ معاينة السعر ═══════════════ */
function updatePricePreview() {
  const price = safeNumber(document.getElementById("price")?.value);
  const originalPrice = safeNumber(document.getElementById("original_price")?.value);
  const display = document.getElementById("finalPriceDisplay");
  const discountDisplay = document.getElementById("discountDisplay");
  if (!display) return;
  if (!price) { display.textContent = "—"; if (discountDisplay) discountDisplay.textContent = "0%"; return; }
  if (originalPrice > price && discountDisplay) {
    discountDisplay.textContent = Math.round(((originalPrice - price) / originalPrice) * 100) + "%";
  } else if (discountDisplay) {
    discountDisplay.textContent = "0%";
  }
  display.textContent = price.toFixed(2) + " EGP";
}

/* ═══════════════ مسح النموذج ═══════════════ */
function clearForm() {
  document.getElementById("name").value = "";
  document.getElementById("price").value = "";
  document.getElementById("original_price").value = "";
  document.getElementById("description").value = "";
  document.getElementById("stock").value = "";
  document.getElementById("sales_count").value = "";
  document.getElementById("category").value = "";
  document.getElementById("taager_product_id").value = "";
  document.getElementById("seller").value = "";
  document.getElementById("vendor").value = "";
  document.getElementById("company_name").value = "";
  document.getElementById("source").value = "";
  document.getElementById("custom_source").value = "";
  document.getElementById("customSourceWrap").classList.remove("show");
  document.getElementById("warranty").value = "";
  document.getElementById("quick_details").value = "";
  document.getElementById("content_ideas").value = "";
  document.getElementById("return_allowed").value = "true";
  document.getElementById("imageFile").value = "";
  document.getElementById("imagePreviews").innerHTML = "";
  clearImageLinks();
  const videoUrlInput = document.getElementById("videoUrlInput");
  if (videoUrlInput) videoUrlInput.value = "";
  newSizes = [];
  newColors = [];
  Object.keys(newMatrixStock).forEach((key) => delete newMatrixStock[key]);
  setSelectedCountries([]);
  removeVideo();
  updatePricePreview();
  renderSizesList();
  renderColorsList();
  renderVariantMatrix();
}

/* ═══════════════ روابط الصور (8 حقول) ═══════════════ */
function renderImageLinkInputs() {
  const list = document.getElementById("imageLinksList");
  if (!list || list.children.length) return;
  for (let i = 1; i <= 8; i++) {
    const row = document.createElement("div");
    row.className = "img-link-row";
    const input = document.createElement("input");
    input.type = "text";
    input.id = "imageLink" + i;
    input.className = "form-input";
    input.dir = "ltr";
    input.placeholder = "رابط الصورة " + i + " — https://...";
    input.addEventListener("input", function () { updateLinkPreview(i); });
    const preview = document.createElement("img");
    preview.id = "imageLinkPreview" + i;
    preview.className = "img-link-preview hidden";
    preview.alt = "صورة " + i;
    preview.addEventListener("error", function () { this.classList.add("hidden"); });
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "img-link-clear";
    clearBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    clearBtn.title = "مسح الرابط";
    clearBtn.addEventListener("click", function () {
      input.value = "";
      preview.classList.add("hidden");
      preview.removeAttribute("src");
      input.focus();
    });
    row.appendChild(input);
    row.appendChild(preview);
    row.appendChild(clearBtn);
    list.appendChild(row);
  }
}

function updateLinkPreview(index) {
  const input = document.getElementById("imageLink" + index);
  const preview = document.getElementById("imageLinkPreview" + index);
  if (!input || !preview) return;
  const value = input.value.trim();
  if (value) {
    preview.src = value;
    preview.classList.remove("hidden");
  } else {
    preview.classList.add("hidden");
    preview.removeAttribute("src");
  }
}

function collectImageLinks() {
  const links = [];
  for (let i = 1; i <= 8; i++) {
    const input = document.getElementById("imageLink" + i);
    if (input) {
      const value = input.value.trim();
      if (value) links.push(value);
    }
  }
  return links;
}

function clearImageLinks() {
  for (let i = 1; i <= 8; i++) {
    const input = document.getElementById("imageLink" + i);
    const preview = document.getElementById("imageLinkPreview" + i);
    if (input) input.value = "";
    if (preview) { preview.classList.add("hidden"); preview.removeAttribute("src"); }
  }
}

/* ═══════════════ معاينات الصور ═══════════════ */
function renderImagePreviews() {
  const previews = document.getElementById("imagePreviews");
  const files = document.getElementById("imageFile").files;
  previews.innerHTML = "";
  for (let i = 0; i < files.length; i++) {
    (function (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const div = document.createElement("div");
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
  const fileInput = document.getElementById("imageFile");
  const dt = new DataTransfer();
  const files = fileInput.files;
  for (let i = 0; i < files.length; i++) {
    if (i !== index) dt.items.add(files[i]);
  }
  fileInput.files = dt.files;
  renderImagePreviews();
}

/* ═══════════════ المعرض ═══════════════ */
var galleryImages = [];
var galleryIndex = 0;

function openGallery(product) {
  galleryImages = [];
  getProductImages(product).forEach(function (url) { galleryImages.push(url); });
  const video = getProductVideo(product);
  if (video && galleryImages.indexOf(video) === -1) galleryImages.push(video);
  if (!galleryImages.length) return;
  galleryIndex = 0;
  document.getElementById("galleryOverlay").style.display = "flex";
  showGalleryImage();
}

function openGalleryById(id) {
  const products = allProducts || [];
  for (let i = 0; i < products.length; i++) {
    if (products[i].id == id) { openGallery(products[i]); return; }
  }
}

function showGalleryImage() {
  const img = document.getElementById("galleryImg");
  const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(galleryImages[galleryIndex]) || galleryImages[galleryIndex].includes("video");
  let videoEl = document.getElementById("galleryVideo");
  if (isVideo) {
    img.style.display = "none";
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
    if (videoEl) { videoEl.style.display = "none"; videoEl.pause(); }
    img.style.display = "";
    if (galleryImages[galleryIndex]) img.src = galleryImages[galleryIndex];
  }
  img.alt = "صورة " + (galleryIndex + 1);
  const counter = document.getElementById("galleryCounter");
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
  const videoEl = document.getElementById("galleryVideo");
  if (videoEl) { videoEl.pause(); videoEl.removeAttribute("src"); }
}

function updateGalleryDots() {
  const container = document.getElementById("galleryDots");
  container.innerHTML = "";
  for (let i = 0; i < galleryImages.length; i++) {
    const dot = document.createElement("span");
    dot.className = "gallery-dot" + (i === galleryIndex ? " active" : "");
    dot.onclick = (function (idx) { return function () { galleryIndex = idx; showGalleryImage(); }; })(i);
    container.appendChild(dot);
  }
}

/* ═══════════════ ربط الأحداث ═══════════════ */
document.addEventListener("keydown", function (e) {
  if (document.getElementById("galleryOverlay").style.display !== "flex") return;
  if (e.key === "Escape") closeGallery();
  if (e.key === "ArrowLeft") galleryNav(-1);
  if (e.key === "ArrowRight") galleryNav(1);
});

/* النقر على أي كبسولة دولة داخل التعديل */
document.addEventListener("click", function (e) {
  const chip = e.target.closest(".country-chip");
  if (!chip) return;
  const input = chip.querySelector("input");
  if (!input) return;
  input.checked = !input.checked;
  chip.classList.toggle("on", input.checked);
  if (input.value === "ALL" && input.checked) {
    document.querySelectorAll(".country-chip").forEach((other) => {
      if (other !== chip) { other.classList.remove("on"); other.querySelector("input").checked = false; }
    });
  }
});

/* أزرار اختيار الملفات (بدون label حتى لا يُفتح المتصفح من أي ضغطة) */
document.getElementById("imagePickBtn").addEventListener("click", function () {
  document.getElementById("imageFile").click();
});
document.getElementById("videoPickBtn").addEventListener("click", function () {
  document.getElementById("videoFile").click();
});
document.getElementById("imageFile").addEventListener("change", renderImagePreviews);

document.getElementById("videoFile").addEventListener("change", async function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const videoBox = document.getElementById("videoPreviewBox");
  const videoEl = document.getElementById("videoPreview");
  const videoPick = document.getElementById("videoPickBtn");
  videoEl.src = URL.createObjectURL(file);
  videoBox.classList.remove("hidden");
  videoPick.innerHTML = '<i class="fa-solid fa-video"></i> تغيير الفيديو';
  showToast("جاري رفع الفيديو...", "info");
  const url = await uploadVideo(file);
  if (url) {
    _uploadedVideoUrl = url;
    showToast("تم رفع الفيديو", "success");
  }
});

/* ═══════════════ التهيئة ═══════════════ */
function populateCategorySelect() {
  const sel = document.getElementById("category");
  if (!sel) return;
  CATEGORIES.forEach(function (cat) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });
}

function init() {
  populateCategorySelect();
  renderCountryChips();
  renderImageLinkInputs();
  renderSizesList();
  renderColorsList();
  renderVariantMatrix();
  loadProducts();
}

window.addEventListener("DOMContentLoaded", init);

window.addProduct = addProduct;
window.updateProduct = updateProduct;
window.deleteProduct = deleteProduct;
window.toggleEdit = toggleEdit;
window.updatePricePreview = updatePricePreview;
window.clearForm = clearForm;
window.renderImagePreviews = renderImagePreviews;
window.updateLinkPreview = updateLinkPreview;
window.clearImageLinks = clearImageLinks;
window.removeImage = removeImage;
window.removeVideo = removeVideo;
window.openGallery = openGallery;
window.openGalleryById = openGalleryById;
window.closeGallery = closeGallery;
window.galleryNav = galleryNav;
window.addSize = addSize;
window.removeSize = removeSize;
window.moveSize = moveSize;
window.addColor = addColor;
window.removeColor = removeColor;
window.moveColor = moveColor;
window.setCell = setCell;
window.setSizePrice = setSizePrice;
window.setSizeStock = setSizeStock;
window.setColorStock = setColorStock;
window.editAddSize = editAddSize;
window.editRemoveSize = editRemoveSize;
window.editMoveSize = editMoveSize;
window.editAddColor = editAddColor;
window.editRemoveColor = editRemoveColor;
window.editSetCell = editSetCell;
window.editSetSizePrice = editSetSizePrice;
window.editSetSizeStock = editSetSizeStock;
window.editSetColorStock = editSetColorStock;
window.onSourceChange = onSourceChange;
window.loadMoreProducts = loadMoreProducts;
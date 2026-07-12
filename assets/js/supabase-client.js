// Central Supabase helper. Load once per page after supabase-js library.

const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

let _clientInstance = null;
let _ordersColumnsCache = null;
let _keyValidated = false;
const DEFAULT_ORDERS_COLUMNS = [
  "user_name",
  "name",
  "customer_name",
  "user_email",
  "email",
  "customer_email",
  "phone",
  "customer_phone",
  "address",
  "customer_address",
  "status",
  "order_status",
  "total_price",
  "total",
  "amount",
  "payment_method",
  "user_id",
  "type",
  "items_json",
  "items",
  "order_items",
  "discount",
  "discount_amount",
  "discount_value",
  "coupon_code",
  "coupon",
  "cbon",
];

const TAAGER_PRODUCTS_FEED_URL = window.TAAGER_PRODUCTS_FEED_URL || "";
const TAAGER_PRODUCTS_API_KEY = window.TAAGER_PRODUCTS_API_KEY || "";

function isTaagerFeedConfigured() {
  return typeof TAAGER_PRODUCTS_FEED_URL === "string" && TAAGER_PRODUCTS_FEED_URL.trim().length > 0;
}

function parseArrayField(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        // Fall back to splitting below.
      }
    }
    return text
      .split(/[,\n;|]+/g)
      .map((entry) => sanitizeText(entry))
      .filter(Boolean);
  }
  return [];
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeTaagerProduct(item) {
  if (!item || typeof item !== "object") return null;
  const id = String(
    item.id ?? item.product_id ?? item.productId ?? item.sku ?? item.code ?? ""
  ).trim();
  if (!id) return null;

  const price = safeNumber(
    item.price ?? item.current_price ?? item.final_price ?? item.amount ?? item.sale_price ?? item.price_amount
  );
  const originalPrice = safeNumber(
    item.original_price ?? item.old_price ?? item.list_price ?? item.compare_at_price
  );
  const image = pickFirstImageSource(item) || sanitizeText(item.image_url || item.image || item.thumbnail || item.media);
  const category = sanitizeText(
    item.category || item.category_name || item.type || item.tags?.[0] || item.tag || "بدون تصنيف"
  );
  const description = sanitizeText(item.description || item.summary || item.details || "");

  return cleanPayload({
    id,
    product_id: item.product_id ?? item.productId ?? id,
    name: sanitizeText(item.name || item.title || item.product_name || "منتج"),
    price,
    original_price: originalPrice || undefined,
    image,
    category,
    description,
    seller_id: item.seller_id || item.vendor_id || item.owner_id,
    seller_email: sanitizeText(item.seller_email || item.vendor_email || item.owner_email),
    brand: sanitizeText(item.brand || item.vendor || item.store_name),
    url: sanitizeText(item.url || item.product_url || item.link),
  });
}

function normalizeTaagerDbProduct(item) {
  if (!item || typeof item !== "object") return null;

  const storedId = sanitizeText(item.id);
  const taagerProductId = sanitizeText(
    item.taager_product_id ??
      item.product_id ??
      item.productId ??
      item.variantId ??
      (storedId.startsWith("taager_") ? storedId.slice(7) : storedId)
  );
  const id = storedId
    ? storedId.startsWith("taager_")
      ? storedId
      : taagerProductId && storedId === taagerProductId
      ? `taager_${taagerProductId}`
      : storedId
    : taagerProductId
    ? `taager_${taagerProductId}`
    : "";

  if (!id) return null;

  const image = pickFirstImageSource(item) || sanitizeText(item.image_url || item.image || item.thumbnail);
  const images = parseArrayField(item.images);
  const availableCountries = parseArrayField(item.available_countries).map((entry) =>
    sanitizeText(entry).toUpperCase()
  );

  return cleanPayload({
    id,
    source: "taager",
    taager_product_id: taagerProductId || (id.startsWith("taager_") ? id.slice(7) : id),
    product_id: taagerProductId || (id.startsWith("taager_") ? id.slice(7) : id),
    name: sanitizeText(item.name || item.title || item.product_name || "منتج من تاجر"),
    description: sanitizeText(item.description || item.summary || item.details),
    category: sanitizeText(item.category || item.category_name || item.type || "بدون تصنيف"),
    price: safeNumber(item.price ?? item.current_price ?? item.final_price ?? item.amount),
    original_price: safeNumber(
      item.original_price ?? item.old_price ?? item.list_price ?? item.compare_at_price
    ) || undefined,
    image,
    images: images.length ? images : image ? [image] : [],
    image1: sanitizeText(item.image1 || item.image_1),
    image2: sanitizeText(item.image2 || item.image_2),
    image3: sanitizeText(item.image3 || item.image_3),
    image4: sanitizeText(item.image4 || item.image_4),
    image5: sanitizeText(item.image5 || item.image_5),
    image_url: sanitizeText(item.image_url || item.imageUrl || image),
    imageUrl: sanitizeText(item.imageUrl || item.image_url || image),
    gallery: item.gallery || item.extra_images || item.additional_images || "",
    available_countries: availableCountries,
    seller: sanitizeText(item.seller || item.vendor || "تاجر") || "تاجر",
    seller_id: sanitizeText(item.seller_id || "taager") || "taager",
    seller_email: sanitizeText(item.seller_email || item.vendor_email || item.owner_email),
    brand: sanitizeText(item.brand || item.vendor || item.store_name),
    stock: safeNumber(item.stock ?? item.quantity ?? 999) || 0,
    stockStatus: sanitizeText(item.stock_status || item.stockStatus || "in_stock") || "in_stock",
    stock_status: sanitizeText(item.stock_status || item.stockStatus || "in_stock") || "in_stock",
    rating: safeNumber(item.rating),
    reviewCount: safeNumber(item.reviewCount ?? item.review_count),
    ratingSource: sanitizeText(item.ratingSource || item.rating_source || "ratings") || "ratings",
    rating_source: sanitizeText(item.rating_source || item.ratingSource || "ratings") || "ratings",
    hasSupabaseRatings: true,
    created_at: item.created_at,
    updated_at: item.updated_at,
    last_synced_at: item.last_synced_at,
    is_active: item.is_active !== false,
  });
}

function filterTaagerProductsByCountry(products = [], countryCode = "") {
  if (!countryCode) return [...products];
  const iso2to3 = { EG: "EGY", SA: "SAU", AE: "ARE", IQ: "IRQ", OM: "OMN" };
  const upperCode = String(countryCode || "").toUpperCase();
  const iso3Code = iso2to3[upperCode] || upperCode;
  return products.filter((product) => {
    const countries = Array.isArray(product?.available_countries) ? product.available_countries : [];
    if (!countries.length) return true;
    return countries.some((entry) => {
      const code = String(entry || "").toUpperCase().trim();
      return code === upperCode || code === iso3Code;
    });
  });
}

async function fetchTaagerProducts(countryCode = "") {
  const client = getSupabaseClient();

  try {
    const pageSize = 1000;
    const allRows = [];
    let useActiveFilter = true;

    for (let offset = 0; offset < 100000; offset += pageSize) {
      let query = client
        .from("taager_products")
        .select("*")
        .range(offset, offset + pageSize - 1);

      if (useActiveFilter) {
        query = query.eq("is_active", true);
      }

      let { data, error } = await query;
      if (error && useActiveFilter && isMissingColumnError(error)) {
        useActiveFilter = false;
        offset -= pageSize;
        continue;
      }
      if (error) {
        console.warn("failed fetching taager_products from supabase", error);
        break;
      }

      const batch = Array.isArray(data) ? data : [];
      allRows.push.apply(allRows, batch);
      if (batch.length < pageSize) break;
    }

    if (allRows.length) {
      const products = allRows.map(normalizeTaagerDbProduct).filter(Boolean);
      const filtered = filterTaagerProductsByCountry(products, countryCode);
      return annotateProductsWithRatingsTable(client, filtered);
    }
  } catch (error) {
    console.warn("failed fetching taager_products from supabase", error);
  }

  if (!isTaagerFeedConfigured()) return [];

  try {
    const headers = {};
    if (TAAGER_PRODUCTS_API_KEY) {
      headers.Authorization = `Bearer ${TAAGER_PRODUCTS_API_KEY}`;
    }

    const response = await fetch(TAAGER_PRODUCTS_FEED_URL, { headers });
    if (!response.ok) {
      throw new Error(`Taager feed request failed with status ${response.status}`);
    }

    const data = await response.json();
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data.products)
      ? data.products
      : [];

    const products = items.map(normalizeTaagerProduct).filter(Boolean);
    return filterTaagerProductsByCountry(products, countryCode);
  } catch (error) {
    console.warn("failed fetching Taager products", error);
    return [];
  }
}

function validatePublicKeySafety() {
  if (_keyValidated) return;
  _keyValidated = true;

  try {
    const payloadPart = String(SUPABASE_ANON_KEY || "").split(".")[1] || "";
    const payloadJson = atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    const role = String(payload?.role || "").toLowerCase();

    if (role && role !== "anon") {
      console.error("Unsafe Supabase key detected in frontend. Use anon key only.");
    }
  } catch {
    // Ignore malformed key parsing; Supabase client will fail normally if invalid.
  }
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null)
  );
}

function sanitizeText(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const lowered = text.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || lowered === "n/a") return "";
  return text;
}

function normalizeCouponToken(value) {
  const raw = sanitizeText(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "";

  const arabicIndicDigits = "Ù Ù¡Ù¢Ù£Ù¤Ù¥Ù¦Ù§Ù¨Ù©";
  const easternArabicDigits = "Û°Û±Û²Û³Û´ÛµÛ¶Û·Û¸Û¹";

  let normalized = "";
  for (const ch of raw) {
    const idxArabic = arabicIndicDigits.indexOf(ch);
    if (idxArabic >= 0) {
      normalized += String(idxArabic);
      continue;
    }
    const idxEastern = easternArabicDigits.indexOf(ch);
    if (idxEastern >= 0) {
      normalized += String(idxEastern);
      continue;
    }
    normalized += ch;
  }

  return normalized.normalize("NFKC").toLowerCase();
}

function normalizeCouponTokenStrict(value) {
  const raw = sanitizeText(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "";

  return raw
    .normalize("NFKC")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .toLowerCase();
}

function pickFirstImageSource(item) {
  if (!item || typeof item !== "object") return "";

  const directCandidates = [
    item.image_url,
    item.image,
    item.product_image,
    item.thumbnail,
    item.img,
    item.imageUrl,
    item.image1,
    item.image_1,
  ];

  for (const candidate of directCandidates) {
    const text = sanitizeText(candidate);
    if (text) return text;
  }

  const collectionCandidates = [item.images, item.gallery, item.thumbnails];
  for (const listValue of collectionCandidates) {
    if (!listValue) continue;

    if (Array.isArray(listValue)) {
      const first = listValue.map((entry) => sanitizeText(entry)).find(Boolean);
      if (first) return first;
      continue;
    }

    if (typeof listValue === "string") {
      const normalized = listValue.trim();
      if (!normalized) continue;

      if ((normalized.startsWith("[") && normalized.endsWith("]")) || (normalized.startsWith("{") && normalized.endsWith("}"))) {
        try {
          const parsed = JSON.parse(normalized);
          const parsedImage = pickFirstImageSource({ images: parsed });
          if (parsedImage) return parsedImage;
        } catch {
          // Continue with delimiter fallback.
        }
      }

      const first = normalized
        .split(/[,\n;|]+/g)
        .map((entry) => sanitizeText(entry))
        .find(Boolean);
      if (first) return first;
    }
  }

  return "";
}

function resolvePrimaryOrderItem(items = []) {
  if (!Array.isArray(items) || !items.length) return null;
  for (const item of items) {
    if (item && typeof item === "object") return item;
  }
  return null;
}

function buildOrderTypeSnapshot(order, items = []) {
  const currentType = sanitizeText(order?.type);
  if (currentType) return currentType;

  const primary = resolvePrimaryOrderItem(items);
  if (!primary) return "";

  const productId = sanitizeText(primary.product_id ?? primary.productId ?? primary.id);
  const productName = sanitizeText(primary.product_name ?? primary.productName ?? primary.name ?? primary.title);
  const productImage = pickFirstImageSource(primary);
  const quantity = Math.max(1, Number(primary.quantity ?? primary.qty ?? 1) || 1);
  const unitPrice = Number(primary.price ?? primary.unit_price ?? primary.amount ?? 0) || 0;

  const snapshot = cleanPayload({
    product_id: productId || undefined,
    name: productName || undefined,
    image: productImage || undefined,
    quantity,
    price: unitPrice || undefined,
  });

  if (!Object.keys(snapshot).length) return "";

  try {
    return JSON.stringify(snapshot);
  } catch {
    return productName || productId || "";
  }
}

function saveLocalOrderSnapshot(orderId, items = []) {
  const key = String(orderId || "").trim();
  if (!key || !Array.isArray(items) || !items.length) return;

  const snapshots = items.map((item) =>
    cleanPayload({
      id: item.product_id ?? item.productId ?? item.id ?? null,
      product_id: item.product_id ?? item.productId ?? item.id ?? null,
      name: sanitizeText(item.product_name ?? item.productName ?? item.name ?? item.title) || undefined,
      image: pickFirstImageSource(item) || undefined,
      quantity: Math.max(1, Number(item.quantity ?? item.qty ?? 1) || 1),
      price: Number(item.price ?? item.unit_price ?? item.amount ?? 0) || 0,
    })
  );

  if (!snapshots.length) return;

  try {
    localStorage.setItem(`order_snapshot_${key}`, JSON.stringify(snapshots));
  } catch {
    // Ignore storage quota or privacy mode failures.
  }
}

function getSupabaseClient() {
  if (_clientInstance) return _clientInstance;

  validatePublicKeySafety();

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase library not loaded");
  }

  _clientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _clientInstance;
}

window.getSupabaseClient = getSupabaseClient;

function isMissingColumnError(error) {
  if (!error) return false;
  const message = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  const code = String(error.code || "").toLowerCase();
  return (
    error.code === "PGRST204" ||
    code === "42703" ||
    message.includes("schema cache") ||
    message.includes("could not find") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || "").toLowerCase();
  const message = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return (
    code === "42p01" ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("table") && message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

function isPermissionError(error) {
  if (!error) return false;
  const code = String(error.code || "").toLowerCase();
  const message = `${error.message || ""}`.toLowerCase();
  return code === "42501" || message.includes("permission denied") || message.includes("not allowed");
}

async function detectOrdersColumns(client) {
  if (_ordersColumnsCache) return _ordersColumnsCache;

  try {
    const { data, error } = await client.from("orders").select("*").limit(1);
    if (error) {
      _ordersColumnsCache = new Set(DEFAULT_ORDERS_COLUMNS);
      return _ordersColumnsCache;
    }

    const firstRow = Array.isArray(data) && data.length ? data[0] : null;
    if (!firstRow || typeof firstRow !== "object") {
      _ordersColumnsCache = new Set(DEFAULT_ORDERS_COLUMNS);
      return _ordersColumnsCache;
    }

    _ordersColumnsCache = new Set(Object.keys(firstRow));
    return _ordersColumnsCache;
  } catch {
    _ordersColumnsCache = new Set(DEFAULT_ORDERS_COLUMNS);
    return _ordersColumnsCache;
  }
}

function pickColumn(columnsSet, options) {
  for (const col of options) {
    if (columnsSet.has(col)) return col;
  }
  return null;
}

function isUuidLike(value) {
  const text = sanitizeText(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text);
}

function isIntegerLike(value) {
  return /^\d+$/.test(sanitizeText(value));
}

function normalizeSellerId(value) {
  const text = sanitizeText(value);
  if (!text) return "";
  if (isUuidLike(text) || isIntegerLike(text)) return text;
  return "";
}

function normalizeSellerEmail(value) {
  const text = sanitizeText(value).toLowerCase();
  return text.includes("@") ? text : "";
}

function collectItemProductIds(items = []) {
  const ids = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const candidates = [
      item?.id,
      item?.product_id,
      item?.productId,
      item?.legacy_my_products_id,
      item?.legacy_product_id,
      item?.product_uuid,
      item?.uuid,
    ];
    candidates.forEach((value) => {
      const id = sanitizeText(value);
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
  });
  return ids;
}

function collectSellerIdentityFromItems(items = []) {
  const idSet = new Set();
  const emailSet = new Set();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const idCandidates = [
      item?.seller_id,
      item?.owner_id,
      item?.vendor_id,
      item?.merchant_id,
      item?.partner_id,
      item?.user_id,
    ];
    idCandidates.forEach((value) => {
      const id = normalizeSellerId(value);
      if (id) idSet.add(id);
    });

    const emailCandidates = [
      item?.seller_email,
      item?.owner_email,
      item?.vendor_email,
      item?.merchant_email,
      item?.partner_email,
      item?.user_email,
      item?.email,
    ];
    emailCandidates.forEach((value) => {
      const email = normalizeSellerEmail(value);
      if (email) emailSet.add(email);
    });
  });

  return {
    ids: [...idSet],
    emails: [...emailSet],
  };
}

async function resolveSellerIdentityForOrder(client, items = []) {
  const fromItems = collectSellerIdentityFromItems(items);
  const idSet = new Set(fromItems.ids);
  const emailSet = new Set(fromItems.emails);
  const productIds = collectItemProductIds(items);

  if (productIds.length && (!idSet.size || !emailSet.size)) {
    const productTables = ["products", "my_products", "partner_products", "seller_products", "product"];
    const productIdColumns = ["id", "product_id", "legacy_my_products_id", "legacy_product_id", "product_uuid", "uuid"];

    for (const table of productTables) {
      for (let i = 0; i < productIds.length; i += 150) {
        const chunk = productIds.slice(i, i + 150);

        for (const idColumn of productIdColumns) {
          const { data, error } = await client.from(table).select("*").in(idColumn, chunk);

          if (error) {
            if (isMissingTableError(error) || isMissingColumnError(error) || isPermissionError(error)) {
              continue;
            }
            continue;
          }

          (Array.isArray(data) ? data : []).forEach((row) => {
            [
              row?.seller_id,
              row?.owner_id,
              row?.vendor_id,
              row?.merchant_id,
              row?.partner_id,
              row?.user_id,
            ].forEach((value) => {
              const id = normalizeSellerId(value);
              if (id) idSet.add(id);
            });

            [
              row?.seller_email,
              row?.owner_email,
              row?.vendor_email,
              row?.merchant_email,
              row?.partner_email,
              row?.user_email,
              row?.email,
            ].forEach((value) => {
              const email = normalizeSellerEmail(value);
              if (email) emailSet.add(email);
            });
          });
        }
      }

      if (idSet.size && emailSet.size) break;
    }
  }

  const ids = [...idSet];
  const emails = [...emailSet];

  return {
    ids,
    emails,
    primaryId: ids.length === 1 ? ids[0] : "",
    primaryEmail: emails.length === 1 ? emails[0] : "",
  };
}

function applySellerIdentityToPayload(payload = {}, columnsSet = new Set(), sellerIdentity = null) {
  const next = { ...(payload || {}) };
  const seller = sellerIdentity || {};
  const sellerId = normalizeSellerId(seller.primaryId);
  const sellerEmail = normalizeSellerEmail(seller.primaryEmail);

  const idColumns = ["seller_id", "owner_id", "partner_id", "merchant_id", "vendor_id", "store_owner_id"];
  const emailColumns = ["seller_email", "owner_email", "partner_email", "merchant_email", "vendor_email"];

  if (sellerId) {
    idColumns.forEach((column) => {
      if (columnsSet.has(column)) next[column] = sellerId;
    });
  }

  if (sellerEmail) {
    emailColumns.forEach((column) => {
      if (columnsSet.has(column)) next[column] = sellerEmail;
    });
  }

  return next;
}

function resolveItemSellerIdentity(item = {}, fallbackSellerIdentity = null) {
  const id = normalizeSellerId(
    item?.seller_id ??
      item?.owner_id ??
      item?.vendor_id ??
      item?.merchant_id ??
      item?.partner_id ??
      item?.user_id
  );
  const email = normalizeSellerEmail(
    item?.seller_email ??
      item?.owner_email ??
      item?.vendor_email ??
      item?.merchant_email ??
      item?.partner_email ??
      item?.user_email ??
      item?.email
  );

  return {
    id: id || normalizeSellerId(fallbackSellerIdentity?.primaryId),
    email: email || normalizeSellerEmail(fallbackSellerIdentity?.primaryEmail),
  };
}

function buildOrderPayload(order, items, columnsSet) {
  const payload = {};
  const serializedItems = Array.isArray(items) ? JSON.stringify(items) : "[]";
  const typeSnapshot = buildOrderTypeSnapshot(order, items);
  const sellerIdentity = order?.__sellerIdentity || null;

  const nameCol = pickColumn(columnsSet, ["user_name", "name", "customer_name"]);
  const emailCol = pickColumn(columnsSet, ["user_email", "email", "customer_email"]);
  const phoneCol = pickColumn(columnsSet, ["phone", "customer_phone"]);
  const addressCol = pickColumn(columnsSet, ["address", "customer_address"]);
  const statusCol = pickColumn(columnsSet, ["status", "order_status"]);
  const totalCol = pickColumn(columnsSet, ["total_price", "total", "amount"]);
  const paymentCol = pickColumn(columnsSet, ["payment_method"]);
  const userIdCol = pickColumn(columnsSet, ["user_id"]);
  const typeCol = pickColumn(columnsSet, ["type"]);
  const itemsCol = pickColumn(columnsSet, ["items_json", "items", "order_items"]);
  const discountCol = pickColumn(columnsSet, ["discount", "discount_amount", "discount_value"]);
  const couponCol = pickColumn(columnsSet, ["coupon_code", "coupon", "cbon"]);

  if (nameCol) payload[nameCol] = order.user_name;
  if (emailCol) payload[emailCol] = order.user_email;
  if (phoneCol) payload[phoneCol] = order.phone;
  if (addressCol) payload[addressCol] = order.address;
  if (statusCol) payload[statusCol] = order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©";
  if (totalCol) payload[totalCol] = order.total_price;
  if (paymentCol && order.payment_method !== undefined) payload[paymentCol] = order.payment_method;
  if (userIdCol && order.user_id !== undefined && order.user_id !== null) payload[userIdCol] = order.user_id;
  if (typeCol && typeSnapshot) payload[typeCol] = typeSnapshot;
  if (itemsCol) payload[itemsCol] = serializedItems;
  if (discountCol && order.discount !== undefined && order.discount !== null) {
    payload[discountCol] = Number(order.discount) || 0;
  }
  if (couponCol && order.coupon_code) {
    payload[couponCol] = String(order.coupon_code).trim();
  }

  // Taager integration fields
  const orderSourceCol = pickColumn(columnsSet, ["order_source"]);
  const countryCodeCol = pickColumn(columnsSet, ["country_code"]);
  const taagerStatusCol = pickColumn(columnsSet, ["taager_order_status"]);

  if (orderSourceCol && order.order_source) payload[orderSourceCol] = order.order_source;
  if (countryCodeCol && order.country_code) payload[countryCodeCol] = order.country_code;
  if (taagerStatusCol && order.taager_order_status) payload[taagerStatusCol] = order.taager_order_status;

  const withSellerIdentity = applySellerIdentityToPayload(payload, columnsSet, sellerIdentity);
  return cleanPayload(withSellerIdentity);
}

async function validateCoupon(code) {
  const normalizedCode = normalizeCouponTokenStrict(code);
  if (!normalizedCode) {
    return { valid: false, code: "" };
  }

  const client = getSupabaseClient();
  const sourceCode = sanitizeText(code);

  const exactResult = await client
    .from("kobon")
    .select("cbon")
    .ilike("cbon", sourceCode)
    .limit(100);
  if (exactResult.error) throw exactResult.error;

  let rows = Array.isArray(exactResult.data) ? exactResult.data : [];
  if (!rows.length) {
    const fullResult = await client
      .from("kobon")
      .select("cbon")
      .limit(5000);
    if (fullResult.error) throw fullResult.error;
    rows = Array.isArray(fullResult.data) ? fullResult.data : [];
  }

  const match = rows.find((row) => normalizeCouponTokenStrict(row?.cbon) === normalizedCode);
  if (!match) {
    return { valid: false, code: normalizedCode };
  }

  return {
    valid: true,
    code: sanitizeText(match.cbon) || sanitizeText(code) || normalizedCode,
  };
}

async function insertOrderWithFallbackPatterns(client, order, items = []) {
  const serializedItems = Array.isArray(items) ? JSON.stringify(items) : "[]";
  const typeSnapshot = buildOrderTypeSnapshot(order, items);
  const sellerIdentity = order?.__sellerIdentity || null;
  const sellerId = normalizeSellerId(order?.seller_id ?? order?.owner_id ?? sellerIdentity?.primaryId);
  const sellerEmail = normalizeSellerEmail(order?.seller_email ?? order?.owner_email ?? sellerIdentity?.primaryEmail);
  const sellerFields = cleanPayload({
    seller_id: sellerId || undefined,
    owner_id: sellerId || undefined,
    seller_email: sellerEmail || undefined,
    owner_email: sellerEmail || undefined,
  });
  const orderStatus = order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©";
  const baseUser = {
    user_name: order.user_name,
    user_email: order.user_email,
    phone: order.phone,
    address: order.address,
    status: orderStatus,
    total_price: order.total_price,
    type: typeSnapshot || undefined,
  };
  const baseName = {
    name: order.user_name,
    email: order.user_email,
    phone: order.phone,
    address: order.address,
    status: orderStatus,
    total: order.total_price,
    type: typeSnapshot || undefined,
  };
  const baseCustomer = {
    customer_name: order.user_name,
    customer_email: order.user_email,
    customer_phone: order.phone,
    customer_address: order.address,
    order_status: orderStatus,
    amount: order.total_price,
    type: typeSnapshot || undefined,
  };
  const patterns = [
    {
      user_name: order.user_name,
      email: order.user_email,
      phone: order.phone,
      address: order.address,
      status: orderStatus,
      total_price: order.total_price,
      type: typeSnapshot || undefined,
    },
    {
      ...baseUser,
    },
    {
      ...baseName,
    },
    {
      ...baseCustomer,
    },
    {
      user_name: order.user_name,
      user_email: order.user_email,
      phone: order.phone,
      address: order.address,
      status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      total_price: order.total_price,
      items_json: serializedItems,
    },
    {
      user_name: order.user_name,
      user_email: order.user_email,
      phone: order.phone,
      address: order.address,
      status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      total_price: order.total_price,
      items: serializedItems,
    },
    {
      user_name: order.user_name,
      user_email: order.user_email,
      phone: order.phone,
      address: order.address,
      status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      total_price: order.total_price,
      order_items: serializedItems,
    },
    {
      name: order.user_name,
      email: order.user_email,
      phone: order.phone,
      address: order.address,
      status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      total: order.total_price,
      items_json: serializedItems,
    },
    {
      name: order.user_name,
      email: order.user_email,
      phone: order.phone,
      address: order.address,
      status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      total: order.total_price,
      items: serializedItems,
    },
    {
      customer_name: order.user_name,
      customer_email: order.user_email,
      customer_phone: order.phone,
      customer_address: order.address,
      order_status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      amount: order.total_price,
      items_json: serializedItems,
    },
    {
      customer_name: order.user_name,
      customer_email: order.user_email,
      customer_phone: order.phone,
      customer_address: order.address,
      order_status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      amount: order.total_price,
      items: serializedItems,
    },
    {
      customer_name: order.user_name,
      customer_email: order.user_email,
      customer_phone: order.phone,
      customer_address: order.address,
      order_status: order.status || "Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©",
      amount: order.total_price,
      order_items: serializedItems,
    },
  ];

  // Taager integration fields for fallback patterns
  const taagerFields = cleanPayload({
    order_source: order.order_source || undefined,
    country_code: order.country_code || undefined,
    taager_order_status: order.taager_order_status || undefined,
  });

  let lastError = null;
  for (const raw of patterns) {
    const payload = cleanPayload({ ...sellerFields, ...taagerFields, ...(raw || {}) });
    const { error } = await client.from("orders").insert([payload]);
    if (!error) return { payload, error: null };
    lastError = error;
  }

  return { payload: null, error: lastError };
}

async function annotateProductsWithRatingsTable(client, products = []) {
  if (!Array.isArray(products) || !products.length) return [];

  const ids = products
    .map((product) => String(product?.id || "").trim())
    .filter((id) => id !== "");

  if (!ids.length) {
    return products.map((product) => ({
      ...product,
      rating: 0,
      reviewCount: 0,
      ratingSource: "ratings",
      rating_source: "ratings",
      hasSupabaseRatings: true,
    }));
  }

  try {
    const { data, error } = await client.from("ratings").select("item_id,rating").in("item_id", ids);
    if (error || !Array.isArray(data)) {
      if (error) console.warn("supabase ratings fetch error", error);
      return products.map((product) => ({
        ...product,
        rating: 0,
        reviewCount: 0,
        ratingSource: "ratings",
        rating_source: "ratings",
        hasSupabaseRatings: true,
      }));
    }

    const ratingsMap = {};
    data.forEach((row) => {
      const itemId = String(row.item_id || "");
      const ratingValue = Number(row.rating) || 0;
      if (!itemId || ratingValue <= 0) return;
      if (!ratingsMap[itemId]) ratingsMap[itemId] = [];
      ratingsMap[itemId].push(ratingValue);
    });

    return products.map((product) => {
      const itemId = String(product?.id || "");
      const values = ratingsMap[itemId] || [];

      if (!values.length) {
        return {
          ...product,
          rating: 0,
          reviewCount: 0,
          ratingSource: "ratings",
          rating_source: "ratings",
          hasSupabaseRatings: true,
        };
      }

      const sum = values.reduce((total, value) => total + value, 0);
      const average = Number((sum / values.length).toFixed(1));
      return {
        ...product,
        rating: average,
        reviewCount: values.length,
        ratingSource: "ratings",
        rating_source: "ratings",
        hasSupabaseRatings: true,
      };
    });
  } catch (error) {
    console.warn("supabase ratings annotate error", error);
    return products.map((product) => ({
      ...product,
      rating: 0,
      reviewCount: 0,
      ratingSource: "ratings",
      rating_source: "ratings",
      hasSupabaseRatings: true,
    }));
  }
}

async function fetchAllProducts() {
  const client = getSupabaseClient();
  const { data, error } = await client.from("products").select("*");
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return annotateProductsWithRatingsTable(client, rows);
}

async function createOrder(order, items) {
  const client = getSupabaseClient();
  const sellerIdentity = await resolveSellerIdentityForOrder(client, items);
  const orderWithSeller = {
    ...(order || {}),
    __sellerIdentity: sellerIdentity,
    seller_id: normalizeSellerId(order?.seller_id ?? order?.owner_id ?? sellerIdentity?.primaryId),
    seller_email: normalizeSellerEmail(order?.seller_email ?? order?.owner_email ?? sellerIdentity?.primaryEmail),
  };

  // Try using discovered schema first.
  let columnsSet = await detectOrdersColumns(client);
  let payload = buildOrderPayload(orderWithSeller, items, columnsSet);

  if (!Object.keys(payload).length) {
    const fallback = await insertOrderWithFallbackPatterns(client, orderWithSeller, items);
    if (fallback.error) throw fallback.error;
    return "ORDER_CREATED";
  }

  let { error } = await client.from("orders").insert([payload]);

  // Schema cache may be stale in client; refresh detection once and retry.
  if (error && isMissingColumnError(error)) {
    _ordersColumnsCache = null;
    columnsSet = await detectOrdersColumns(client);
    payload = buildOrderPayload(orderWithSeller, items, columnsSet);

    if (!Object.keys(payload).length) {
      const fallback = await insertOrderWithFallbackPatterns(client, orderWithSeller, items);
      if (fallback.error) throw fallback.error;
      return "ORDER_CREATED";
    }

    ({ error } = await client.from("orders").insert([payload]));
  }

  if (error) {
    const fallback = await insertOrderWithFallbackPatterns(client, orderWithSeller, items);
    if (fallback.error) throw fallback.error;
    return "ORDER_CREATED";
  }

  // Best-effort order ID fetch (skip if unavailable).
  const idCol = pickColumn(columnsSet, ["id", "order_id", "uuid", "order_uuid"]);
  let orderId = null;

  if (idCol) {
    const emailCol = pickColumn(columnsSet, ["user_email", "email", "customer_email"]);
    const totalCol = pickColumn(columnsSet, ["total_price", "total", "amount"]);

    let query = client.from("orders").select(idCol).limit(1);
    const orderByCol = columnsSet.has("created_at") ? "created_at" : idCol;
    query = query.order(orderByCol, { ascending: false });
    if (emailCol && orderWithSeller.user_email) query = query.eq(emailCol, orderWithSeller.user_email);
    if (totalCol && orderWithSeller.total_price !== undefined) query = query.eq(totalCol, orderWithSeller.total_price);

    const { data: idRows } = await query;
    if (Array.isArray(idRows) && idRows.length) {
      orderId = idRows[0]?.[idCol] || null;
    }
  }

  // Best-effort order_items insert only if order_id column exists and id resolved.
  if (orderId && Array.isArray(items) && items.length) {
    const richRows = items.map((item) => {
      const itemSeller = resolveItemSellerIdentity(item, sellerIdentity);
      return cleanPayload({
        order_id: orderId,
        product_id: item.product_id ?? item.productId ?? item.id ?? null,
        quantity: item.quantity,
        price: item.price,
        product_name: item.name || item.product_name || item.title || null,
        image:
          item.image ||
          item.image_url ||
          item.product_image ||
          item.thumbnail ||
          item.img ||
          (Array.isArray(item.images) ? item.images[0] : item.images) ||
          null,
        brand: item.brand || item.vendor || item.store_name || null,
        seller_id: itemSeller.id || undefined,
        owner_id: itemSeller.id || undefined,
        seller_email: itemSeller.email || undefined,
        owner_email: itemSeller.email || undefined,
      });
    });

    let { error: itemsError } = await client.from("order_items").insert(richRows);

    if (itemsError && isMissingColumnError(itemsError)) {
      const minimalRows = items.map((item) =>
        cleanPayload({
          order_id: orderId,
          product_id: item.product_id ?? item.productId ?? item.id ?? null,
          quantity: item.quantity,
          price: item.price,
        })
      );
      ({ error: itemsError } = await client.from("order_items").insert(minimalRows));
    }

    if (itemsError && !isMissingColumnError(itemsError) && !isPermissionError(itemsError)) {
      console.warn("order_items insert skipped:", itemsError);
    }
  }

  if (orderId) {
    saveLocalOrderSnapshot(orderId, items);
  }

  return orderId || "ORDER_CREATED";
}

async function getOrders(filter = {}) {
  const client = getSupabaseClient();
  let columnsSet = await detectOrdersColumns(client);

  function resolveColumns() {
    return {
      emailCol: filter.user_email
        ? pickColumn(columnsSet, ["user_email", "email", "customer_email"])
        : null,
      statusCol: filter.status ? pickColumn(columnsSet, ["status", "order_status"]) : null,
      orderCol: columnsSet.has("created_at")
        ? "created_at"
        : pickColumn(columnsSet, ["id", "order_id", "uuid", "order_uuid"]),
    };
  }

  let { emailCol, statusCol, orderCol } = resolveColumns();

  async function runQuery() {
    let query = client.from("orders").select("*");
    if (orderCol) query = query.order(orderCol, { ascending: false });
    if (emailCol && filter.user_email) query = query.eq(emailCol, filter.user_email);
    if (statusCol && filter.status) query = query.eq(statusCol, filter.status);
    return query;
  }

  let { data, error } = await runQuery();

  // If schema cache was stale, re-detect once then retry.
  if (error && isMissingColumnError(error)) {
    _ordersColumnsCache = null;
    columnsSet = await detectOrdersColumns(client);
    ({ emailCol, statusCol, orderCol } = resolveColumns());
    ({ data, error } = await runQuery());
  }

  if (error) throw error;

  let rows = Array.isArray(data) ? data : [];

  // If we could not apply server-side email/status filters (because columns unknown),
  // apply best-effort client-side filtering on common keys.
  if (filter.user_email && !emailCol) {
    rows = rows.filter((row) =>
      [row.user_email, row.email, row.customer_email].some(
        (value) => String(value || "").toLowerCase() === String(filter.user_email).toLowerCase()
      )
    );
  }

  if (filter.status && !statusCol) {
    rows = rows.filter((row) =>
      [row.status, row.order_status].some(
        (value) => String(value || "").toLowerCase() === String(filter.status).toLowerCase()
      )
    );
  }

  return rows;
}

async function updateOrderStatus(orderId, status) {
  const client = getSupabaseClient();
  const variants = [{ status }, { order_status: status }];
  const idColumns = ["id", "order_id"];
  let lastError = null;

  for (const payload of variants) {
    for (const idColumn of idColumns) {
      const { error } = await client.from("orders").update(payload).eq(idColumn, orderId);
      if (!error) return true;
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to update order status");
}

async function fetchAllProductsWithTaager(countryCode) {
  const all = await fetchAllProducts();
  const taagerProducts = await fetchTaagerProducts(countryCode);

  if (window.TaagerIntegration) {
    window.TaagerIntegration.mergeTaagerIntoStore(taagerProducts);
  }

  const seen = new Set();
  const merged = [];

  all.forEach((product) => {
    const id = String(product.id);
    if (!seen.has(id)) {
      seen.add(id);
      merged.push({ ...product, source: product.source || "internal" });
    }
  });

  taagerProducts.forEach((product) => {
    const id = String(product.id);
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(product);
    }
  });

  if (countryCode) {
    if (window.TaagerIntegration && typeof window.TaagerIntegration.filterByCountry === "function") {
      return window.TaagerIntegration.filterByCountry(merged, countryCode);
    }
    var iso2to3 = { EG: "EGY", SA: "SAU", AE: "ARE", IQ: "IRQ", OM: "OMN" };
    var upperCode = countryCode.toUpperCase();
    var iso3Code = iso2to3[upperCode] || upperCode;
    return merged.filter(function (product) {
      var countries = product.available_countries;
      if (!Array.isArray(countries) || !countries.length) return true;
      for (var i = 0; i < countries.length; i++) {
        var c = String(countries[i] || "").toUpperCase().trim();
        if (c === upperCode || c === iso3Code) return true;
      }
      return false;
    });
  }

  return merged;
}

async function createOrderWithTaager(order, items) {
  const selectedCountry = window.TaagerIntegration
    ? window.TaagerIntegration.getSelectedCountry()
    : null;

  const annotatedItems = Array.isArray(items)
    ? items.map((item) => {
        if (window.TaagerIntegration) {
          return window.TaagerIntegration.annotateCartItemWithSource(item, selectedCountry);
        }
        return item;
      })
    : items;

  const taagerExtra = window.TaagerIntegration
    ? window.TaagerIntegration.getOrderPayloadExtra(selectedCountry)
    : {};

  const enrichedOrder = {
    ...order,
    ...taagerExtra,
  };

  return createOrder(enrichedOrder, annotatedItems);
}

async function getTaagerOrders(filter = {}) {
  const orders = await getOrders(filter);
  return orders.filter((order) => order.order_source === "taager");
}

window.supabaseClient = {
  from: (table) => getSupabaseClient().from(table),
  raw: getSupabaseClient,
  fetchAllProducts,
  fetchTaagerProducts,
  fetchAllProductsWithTaager,
  createOrder,
  createOrderWithTaager,
  getOrders,
  getTaagerOrders,
  updateOrderStatus,
  validateCoupon,
};

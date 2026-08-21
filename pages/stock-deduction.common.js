/* ═══════════════════════════════════════════════════════════════
   stock-deduction.common.js — الوحدة الموحدة لخصم كميات المخزون
   ───────────────────────────────────────────────────────────────
   تُستدعى عند تحويل الطلب إلى "تم التسليم" وتقوم بـ:
   1) تجميع عناصر الطلب حسب المنتج الأساسي (مع فك ألوان/مقاسات تاجر)
   2) خصم الكميات من الجدولين: taager_products + products
   3) زيادة عدّاد المبيعات (sales_count / sold_count)
   4) تسجيل كل محاولة (نجاح/جزئي/خطأ) في جدول stock_change_log
   5) منع الخصم المزدوج عبر سجل stock_change_log نفسه
   الاستخدام:
     await StockDeduction.deductForOrder(order, { sourcePage: "admin-orders" });
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

  function getDb() {
    try {
      if (typeof supabaseClient !== "undefined" && supabaseClient && typeof supabaseClient.from === "function") {
        return supabaseClient;
      }
    } catch (e) {
      /* لم يُهيَّأ بعد */
    }
    if (window.supabase && typeof window.supabase.createClient === "function") {
      return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return null;
  }

  function parseJsonSafe(value) {
    try {
      if (typeof value === "string") return JSON.parse(value);
    } catch (e) {
      return null;
    }
    return null;
  }

  function normalizeToArray(value) {
    if (!value) return [];
    const parsed = parseJsonSafe(value);
    const data = parsed ?? value;
    if (Array.isArray(data)) return data.filter(Boolean);
    if (typeof data === "object") return Object.values(data).filter(Boolean);
    return [];
  }

  function parseTaagerVariantId(tid) {
    const s = String(tid || "").trim();
    let m = s.match(/^(.+?)_c_(.+?)_s_(.+)$/);
    if (m) return { base: m[1], color: m[2], size: m[3] };
    m = s.match(/^(.+?)_c_(.+)$/);
    if (m) return { base: m[1], color: m[2], size: "" };
    m = s.match(/^(.+?)_s_(.+)$/);
    if (m) return { base: m[1], color: "", size: m[2] };
    return { base: s, color: "", size: "" };
  }

  function normLabel(value) {
    return String(value || "").trim().toLowerCase().replace(/_/g, " ");
  }

  /* العناصر قد تكون في أعمدة JSON داخل orders أو في جدول order_items المنفصل */
  async function extractOrderItems(db, order) {
    for (const payload of [order.items_snapshot, order.items_json, order.items, order.order_items]) {
      const items = normalizeToArray(payload);
      if (items.length) return items;
    }
    const orderId = String(order.id ?? order.order_id ?? "").trim();
    if (!orderId || !db) return [];
    try {
      const { data, error } = await db
        .from("order_items")
        .select("product_id,quantity,selected_color,selected_size,selected_color_value")
        .eq("order_id", orderId)
        .limit(200);
      if (!error && Array.isArray(data) && data.length) {
        return data.map((r) => ({
          product_id: r.product_id,
          quantity: r.quantity,
          color: r.selected_color || r.selected_color_value || "",
          size: r.selected_size || "",
        }));
      }
    } catch (e) {
      /* تجاهل — الجدول قد لا يكون متاحاً */
    }
    return [];
  }

  async function fetchRow(db, table, candidates, cols) {
    for (const cand of candidates) {
      const { data, error } = await db.from(table).select(cols).eq(cand.col, cand.val).limit(1);
      if (!error && Array.isArray(data) && data.length) return data[0];
    }
    return null;
  }

  function buildDeductPayload(row, picks) {
    const colors = Array.isArray(row.colors) ? JSON.parse(JSON.stringify(row.colors)) : [];
    const sizes = Array.isArray(row.sizes) ? JSON.parse(JSON.stringify(row.sizes)) : [];
    const totalQty = picks.reduce((sum, p) => sum + p.qty, 0);

    picks.forEach((p) => {
      if (!p.size) return;
      const si = sizes.findIndex((s) => {
        const label = typeof s === "string" ? s : (s && (s.name || s.size)) || "";
        return normLabel(label) === normLabel(p.size);
      });
      if (si >= 0 && typeof sizes[si] === "object") {
        sizes[si].stock = Math.max(0, (Number(sizes[si].stock) || 0) - p.qty);
      }
      const ci = colors.findIndex(
        (c) => normLabel((c && (c.name || c.value)) || "") === normLabel(p.color)
      );
      if (ci >= 0 && p.color) {
        const sizesOfColor = Array.isArray(colors[ci].sizes) ? colors[ci].sizes : [];
        const cell = sizesOfColor.find((cs) => normLabel((cs && cs.size) || "") === normLabel(p.size));
        if (cell) cell.stock = Math.max(0, (Number(cell.stock) || 0) - p.qty);
      }
    });

    const oldStock = Number(row.stock) || 0;
    const newStock = Math.max(0, oldStock - totalQty);
    const payload = { stock: newStock };
    if (sizes.length) payload.sizes = sizes;
    if (colors.length) payload.colors = colors;
    return { payload, oldStock, newStock, totalQty };
  }

  async function bumpCounter(db, table, id, col, qty) {
    if (!id || !qty) return;
    try {
      const { data, error } = await db.from(table).select("id," + col).eq("id", id).limit(1);
      if (error || !data || !data.length) return;
      const next = Math.max(0, (Number(data[0][col]) || 0) + qty);
      await db.from(table).update({ [col]: next }).eq("id", id);
    } catch (e) {
      /* العمود قد لا يكون موجوداً — تجاهل بهدوء */
    }
  }

  async function logChange(db, entry) {
    try {
      const { error } = await db.from("stock_change_log").insert(entry);
      if (error && error.code !== "23505") {
        console.warn("StockDeduction log:", error.message);
      }
    } catch (e) {
      console.warn("StockDeduction log:", e && e.message);
    }
  }

  async function processProduct(db, ctx) {
    const { pid, picks, orderId, customerName, sourcePage, sample } = ctx;
    const totalQty = picks.reduce((sum, p) => sum + p.qty, 0);
    const productName = sample.name || "";
    const productImage = sample.image || "";

    /* حماية من التكرار: هل خُصص هذا المنتج لهذا الطلب سابقاً؟ */
    if (orderId) {
      const { data: existing } = await db
        .from("stock_change_log")
        .select("id")
        .eq("order_id", orderId)
        .eq("product_id", pid)
        .eq("action", "deduct")
        .limit(1);
      if (existing && existing.length) return;
    }

    const bareId = pid.indexOf("taager_") === 0 ? pid.slice(7) : pid;
    const tRow = await fetchRow(
      db,
      "taager_products",
      [
        { col: "id", val: pid },
        { col: "taager_product_id", val: pid },
      ],
      "id,stock,colors,sizes"
    );
    const pRow = await fetchRow(
      db,
      "products",
      [
        { col: "id", val: pid },
        { col: "id", val: bareId },
      ],
      "id,stock,colors,sizes"
    );

    if (!tRow && !pRow) {
      await logChange(db, {
        action: "deduct",
        product_id: pid,
        product_name: productName || null,
        product_image: productImage || null,
        order_id: orderId || null,
        customer_name: customerName || null,
        qty_deducted: totalQty,
        old_stock: null,
        new_stock: null,
        target_table: null,
        status: "error",
        error_message: "المنتج غير موجود في taager_products ولا في products",
        source_page: sourcePage || null,
      });
      return;
    }

    const results = [];
    let oldStock = null;
    let newStock = null;

    if (tRow) {
      const calc = buildDeductPayload(tRow, picks);
      const { error } = await db.from("taager_products").update(calc.payload).eq("id", tRow.id);
      results.push({ table: "taager_products", ok: !error, error });
      if (oldStock === null) {
        oldStock = calc.oldStock;
        newStock = calc.newStock;
      }
    }
    if (pRow) {
      const calc = buildDeductPayload(pRow, picks);
      const { error } = await db.from("products").update(calc.payload).eq("id", pRow.id);
      results.push({ table: "products", ok: !error, error });
      if (oldStock === null) {
        oldStock = calc.oldStock;
        newStock = calc.newStock;
      }
    }

    /* عدّادات المبيعات (أفضل جهد) */
    await bumpCounter(db, "taager_products", tRow && tRow.id, "sales_count", totalQty);
    await bumpCounter(db, "products", pRow && pRow.id, "sold_count", totalQty);

    const okAny = results.some((r) => r.ok);
    const errs = results.filter((r) => !r.ok).map((r) => r.table + ": " + ((r.error && r.error.message) || ""));
    const status = !results.length ? "error" : okAny ? (errs.length ? "partial" : "success") : "error";

    await logChange(db, {
      action: "deduct",
      product_id: pid,
      product_name: productName || null,
      product_image: productImage || null,
      order_id: orderId || null,
      customer_name: customerName || null,
      qty_deducted: totalQty,
      old_stock: oldStock,
      new_stock: newStock,
      target_table: results.map((r) => r.table).join(",") || null,
      status: status,
      error_message: errs.join(" | ") || null,
      source_page: sourcePage || null,
    });
  }

  async function deductForOrder(order, opts) {
    opts = opts || {};
    const db = getDb();
    if (!db || !order) return;

    const items = await extractOrderItems(db, order);
    if (!items.length) return;

    const grouped = {};
    items.forEach((it) => {
      const rawId = String(it?.product_id || it?.id || "").trim();
      if (!rawId) return;
      const stripped = rawId.indexOf("taager_") === 0 ? rawId.slice(7) : rawId;
      const parsed = parseTaagerVariantId(stripped);
      let base = String(parsed.base || stripped || rawId);
      if (base.indexOf("taager_") !== 0) base = "taager_" + base;
      if (!grouped[base]) grouped[base] = [];
      grouped[base].push({
        color: String(it?.color ?? "").trim() || parsed.color || "",
        size: String(it?.size ?? "").trim() || parsed.size || "",
        qty: Math.max(1, Number(it?.quantity) || 1),
      });
      if (!grouped[base].sample) {
        grouped[base].sample = {
          name: String(it?.title || it?.name || it?.product_name || "").trim(),
          image: String(it?.image || it?.img || it?.thumbnail || "").trim(),
        };
      }
    });

    const orderId = String(order.id ?? order.order_id ?? "").trim();
    const customerName = String(order.customer_name || order.customer || order.name || order.shipping_name || "").trim();

    for (const pid of Object.keys(grouped)) {
      const picks = grouped[pid].filter((p) => p && typeof p === "object" && p.qty);
      const sample = grouped[pid].sample || { name: "", image: "" };
      try {
        await processProduct(db, { pid, picks, orderId, customerName, sourcePage: opts.sourcePage || "", sample });
      } catch (e) {
        console.warn("StockDeduction:", e && e.message);
        await logChange(db, {
          action: "deduct",
          product_id: pid,
          product_name: sample.name || null,
          product_image: sample.image || null,
          order_id: orderId || null,
          customer_name: customerName || null,
          qty_deducted: picks.reduce((s, p) => s + p.qty, 0),
          old_stock: null,
          new_stock: null,
          target_table: null,
          status: "error",
          error_message: (e && e.message) || "خطأ غير متوقع",
          source_page: opts.sourcePage || null,
        });
      }
    }
  }

  window.StockDeduction = { deductForOrder };
})();

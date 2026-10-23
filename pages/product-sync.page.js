(function () {
  const BACKENDS = [
    { name: "primary", label: "السيرفر الأساسي", url: "https://msgqzgzoslearaprgiqq.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE" },
    { name: "backup", label: "السيرفر الاحتياطي", url: "https://wwlwwgqfjhmchrijaojr.supabase.co", key: "sb_publishable_wIxpA7t3a2hII8asqYZ1Bg__NoMLLUU" },
    { name: "backup2", label: "السيرفر الثالث", url: "https://qhqkgrpezoaugyhzrgyc.supabase.co", key: "sb_publishable_bHCWG6iYSkbONKG7HR6Rkw_UVZGsjUe" },
  ];

  const CANDIDATE_TABLES = [
    "taager_products",
    "taager_variant_groups",
    "product_sellers",
    "home_mega_products",
    "product_sections",
    "product_section_items",
    "smart_page_blocks",
    "reviews",
    "product_reviews",
    "stock_change_log",
    "return_requests",
  ];

  const PAGE_SIZE = 1000;
  const BATCH_SIZE = 250;
  let state = {
    source: null,
    running: false,
    stopped: false,
    tables: [],
    analysis: null,
    totalMissing: 0,
  };

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function time() { return new Date().toLocaleTimeString("ar-EG"); }
  function logLine(html, cls) { const el = $("log"); if (!el) return; const div = "<div style='margin:2px 0'>" + (cls ? '<span class="' + cls + '">' : "") + "[" + time() + "] " + html + (cls ? "</span>" : "") + "</div>"; el.innerHTML += div; el.scrollTop = el.scrollHeight; }
  function setProgress(p) { const bar = $("progress"); if (bar) bar.style.width = Math.max(0, Math.min(100, p)) + "%"; }
  function setPhase(t) { const p = $("phase"); if (p) p.textContent = t || ""; }

  function backendKey(name) {
    const b = BACKENDS.find((x) => x.name === name);
    return b ? b.key : "";
  }
  function backendUrl(name) {
    const b = BACKENDS.find((x) => x.name === name);
    return b ? b.url : "";
  }

  async function createClient(name) {
    const b = BACKENDS.find((x) => x.name === name);
    if (!b) throw new Error("سيرفر غير معروف");
    if (window.supabase && window.supabase.createClient) {
      return window.supabase.createClient(b.url, b.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    }
    return null;
  }

  async function restGet(name, path) {
    const url = backendUrl(name) + path;
    const key = backendKey(name);
    const r = await fetch(url, {
      headers: { apikey: key, Authorization: "Bearer " + key, Prefer: "count=exact" },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error("GET " + path + " → " + r.status + (t ? " " + t : ""));
    }
    return await r.json();
  }

  async function restPostJson(name, path, body) {
    const url = backendUrl(name) + path;
    const key = backendKey(name);
    const r = await fetch(url, {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error("POST " + path + " → " + r.status + (t ? " " + t : ""));
    }
    try { return await r.json(); } catch (_) { return null; }
  }

  async function restRpc(name, fn, args) {
    const url = backendUrl(name) + "/rest/v1/rpc/" + fn;
    const key = backendKey(name);
    const r = await fetch(url, {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error("RPC " + fn + " → " + r.status + (t ? " " + t : ""));
    }
    try { return await r.json(); } catch (_) { return null; }
  }

  async function tableExists(name, table) {
    try {
      const data = await restGet(name, "/rest/v1/" + table + "?select=*&limit=1");
      return Array.isArray(data);
    } catch (e) {
      return false;
    }
  }

  async function hasColumn(name, table, col) {
    try {
      const data = await restGet(name, "/rest/v1/" + table + "?select=" + encodeURIComponent(col) + "&limit=1");
      return Array.isArray(data);
    } catch (e) {
      return false;
    }
  }

  async function countRows(name, table) {
    try {
      const key = backendKey(name);
      const url = backendUrl(name) + "/rest/v1/" + table + "?select=id&limit=0";
      const r = await fetch(url, { headers: { apikey: key, Authorization: "Bearer " + key, Prefer: "count=exact" } });
      if (!r.ok) return 0;
      const c = r.headers.get("Content-Range");
      if (!c) return 0;
      const m = c.match(/\/(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    } catch (_) { return 0; }
  }

  async function fetchAllRows(name, table, columns) {
    const all = [];
    let from = 0;
    while (true) {
      const to = from + PAGE_SIZE - 1;
      const path = "/rest/v1/" + table + "?select=" + encodeURIComponent(columns) + "&order=id.asc.nullsfirst,created_at.asc.nullsfirst&range=" + from + "-" + to;
      const data = await restGet(name, path);
      if (!Array.isArray(data) || data.length === 0) break;
      for (let i = 0; i < data.length; i++) all.push(data[i]);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
      if (state.stopped) break;
    }
    return all;
  }

  function getDedupKey(table, row) {
    if (table === "taager_variant_groups") {
      if (row.parent_id !== undefined && row.parent_id !== null) return String(row.parent_id);
    }
    if (row.id !== undefined && row.id !== null) return String(row.id);
    if (row.product_id !== undefined && row.product_id !== null) return String(row.product_id);
    if (row.parent_id !== undefined && row.parent_id !== null) return String(row.parent_id);
    return null;
  }

  function stripIdentity(table, row) {
    const out = {};
    for (const k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (table === "taager_variant_groups" && k === "id") continue;
      out[k] = row[k];
    }
    return out;
  }

  async function detectTables() {
    const list = [];
    for (let i = 0; i < CANDIDATE_TABLES.length; i++) {
      const t = CANDIDATE_TABLES[i];
      const ex = await tableExists(state.source, t);
      if (!ex) continue;
      let rel = false;
      if (t === "taager_variant_groups") rel = await hasColumn(state.source, t, "parent_id");
      else rel = (await hasColumn(state.source, t, "product_id")) || (await hasColumn(state.source, t, "parent_id"));
      if (!rel && t !== "taager_products" && t !== "taager_variant_groups" && t !== "product_sellers") {
        rel = await hasColumn(state.source, t, "product_id");
      }
      if (!rel) continue;
      const c = await countRows(state.source, t);
      list.push({ name: t, count: c, exists: true, related: true });
    }
    state.tables = list;
    return list;
  }

  function renderServers() {
    const wrap = $("servers");
    if (!wrap) return;
    wrap.innerHTML = "";
    BACKENDS.forEach((b) => {
      const id = "srv-" + b.name;
      const opt = document.createElement("label");
      opt.className = "server-option" + (state.source === b.name ? " active" : "");
      opt.innerHTML =
        '<input type="radio" name="source" id="' + id + '" value="' + b.name + '"' + (state.source === b.name ? " checked" : "") + '>' +
        '<div class="server-meta">' +
        '<div class="server-name">' + esc(b.label) + '</div>' +
        '<div class="server-url">' + esc(b.url) + '</div>' +
        '<div class="server-health" id="h-' + b.name + '">جاهز</div>' +
        '</div>';
      opt.addEventListener("click", () => { state.source = b.name; renderServers(); $("btnStart").disabled = !state.source; });
      wrap.appendChild(opt);
    });
  }

  function renderTables() {
    const wrap = $("tables");
    const hint = $("tablesHint");
    const none = $("noTables");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (state.tables.length === 0) { if (none) none.style.display = ""; if (hint) hint.textContent = ""; return; }
    if (none) none.style.display = "none";
    if (hint) hint.textContent = state.tables.length + " جدول مرتبط بالمنتج";
    state.tables.forEach((t) => {
      const row = document.createElement("div");
      row.className = "table-row";
      row.innerHTML =
        '<div class="table-info">' +
        '<div class="table-name">' + esc(t.name) + '</div>' +
        '<div class="table-meta">' +
        '<span>الصفوف في المصدر: <b>' + t.count.toLocaleString("en") + '</b></span>' +
        '<span id="m-' + t.name + '">الناقص: —</span>' +
        '<span id="i-' + t.name + '">المضافة: —</span>' +
        '</div>' +
        '</div>' +
        '<div><span class="badge muted" id="st-' + t.name + '">جاهز</span></div>';
      wrap.appendChild(row);
    });
  }

  async function analyze() {
    if (!state.source) return;
    state.analysis = {};
    setPhase("جاري فحص الفروقات...");
    logLine("فحص الجداول عند المصدر...", "ok");
    await detectTables();
    renderTables();
    const targets = BACKENDS.filter((b) => b.name !== state.source);
    let totalMissing = 0;
    for (let i = 0; i < state.tables.length; i++) {
      const t = state.tables[i];
      setPhase("تحليل [" + t.name + "]...");
      let sourceRows = [];
      try {
        const cols = t.name === "taager_products" ? "*" : (t.name === "taager_variant_groups" ? "parent_id,variants,product_name,thumbnail,variant_count,created_at,updated_at" : "*");
        sourceRows = await fetchAllRows(state.source, t.name, cols);
      } catch (e) {
        logLine("فشل جلب [" + t.name + "] من المصدر: " + esc(e.message || e), "err");
        continue;
      }
      const srcMap = new Map();
      for (let j = 0; j < sourceRows.length; j++) {
        const k = getDedupKey(t.name, sourceRows[j]);
        if (k) srcMap.set(k, sourceRows[j]);
      }
      state.analysis[t.name] = { srcMap, missingByTarget: {} };
      for (let ti = 0; ti < targets.length; ti++) {
        const tgt = targets[ti];
        let tgtKeys = new Set();
        try {
          const r = await restRpc(tgt.name, "migration_existing_ids", { p_table: t.name, p_ids: Array.from(srcMap.keys()) });
          if (Array.isArray(r)) { for (let x = 0; x < r.length; x++) tgtKeys.add(String(r[x])); }
        } catch (e) {
          logLine("فشل فحص الموجود في [" + tgt.name + "] جدول [" + t.name + "]: " + esc(e.message || e), "warn");
        }
        const missing = [];
        for (const [k, v] of srcMap) { if (!tgtKeys.has(k)) missing.push(stripIdentity(t.name, v)); }
        state.analysis[t.name].missingByTarget[tgt.name] = missing;
        totalMissing += missing.length;
        const mEl = $("m-" + t.name);
        if (mEl) mEl.innerHTML = "الناقص (إجمالي): <b>" + totalMissingForTable(state.analysis, t.name).toLocaleString("en") + "</b>";
      }
    }
    state.totalMissing = totalMissing;
    setPhase("");
    logLine("تم التحليل. إجمالي الصفوف الناقصة: <b>" + totalMissing.toLocaleString("en") + "</b>", totalMissing === 0 ? "ok" : "warn");
    setProgress(20);
    updateSummary();
    $("btnStart").disabled = !state.source || state.running;
  }

  function totalMissingForTable(analysis, table) {
    let s = 0;
    const a = analysis && analysis[table];
    if (!a || !a.missingByTarget) return 0;
    for (const k in a.missingByTarget) s += (a.missingByTarget[k] || []).length;
    return s;
  }

  function updateSummary() {
    const sum = $("summary");
    if (!sum) return;
    sum.innerHTML = "";
    let rowsMissing = 0;
    for (let i = 0; i < state.tables.length; i++) {
      const t = state.tables[i];
      const m = totalMissingForTable(state.analysis, t.name);
      rowsMissing += m;
      const r = document.createElement("div");
      r.className = "summary-row";
      r.innerHTML = '<div class="summary-key">' + esc(t.name) + '</div><div class="summary-val">ناقص: ' + m.toLocaleString("en") + ' صف</div>';
      sum.appendChild(r);
    }
    const r2 = document.createElement("div");
    r2.className = "summary-row";
    r2.innerHTML = '<div class="summary-key">الإجمالي</div><div class="summary-val">إجمالي الناقص: <b>' + rowsMissing.toLocaleString("en") + '</b> صف</div>';
    sum.appendChild(r2);
    const ok = $("summaryOk");
    const bad = $("summaryBad");
    if (ok) ok.style.display = rowsMissing === 0 ? "" : "none";
    if (bad) bad.style.display = rowsMissing > 0 ? "" : "none";
  }

  async function chunkInsert(target, table, rows) {
    if (!rows || rows.length === 0) return { inserted: 0 };
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      if (state.stopped) break;
      const chunk = rows.slice(i, i + BATCH_SIZE);
      try {
        await restRpc(target, "migration_import", { p_table: table, p_rows: chunk, p_update: false });
        inserted += chunk.length;
      } catch (e) {
        logLine("فشل إدراج دفعة في [" + target + "] جدول [" + table + "]: " + esc(e.message || e), "err");
        break;
      }
    }
    return { inserted };
  }

  async function startSync() {
    if (!state.source || state.running) return;
    const targets = BACKENDS.filter((b) => b.name !== state.source);
    if (targets.length === 0) { alert("محتاج سيرفرين هدف على الأقل"); return; }
    state.running = true;
    state.stopped = false;
    $("btnStart").disabled = true;
    $("btnStop").disabled = false;
    $("btnCheck").disabled = true;
    setProgress(25);
    await analyze();
    if (state.stopped) { finish(); return; }
    setProgress(40);
    let totalInserted = 0;
    for (let i = 0; i < state.tables.length; i++) {
      const t = state.tables[i];
      const a = state.analysis[t.name];
      if (!a) continue;
      for (let ti = 0; ti < targets.length; ti++) {
        const tgt = targets[ti];
        const missing = a.missingByTarget[tgt.name] || [];
        if (missing.length === 0) continue;
        setPhase("نقل [" + t.name + "] → " + tgt.name + " (" + missing.length.toLocaleString("en") + ")...");
        logLine("يبدأ نقل [" + esc(t.name) + "] إلى <b>" + esc(tgt.name) + "</b>: " + missing.length.toLocaleString("en") + " صف ناقص", "ok");
        const res = await chunkInsert(tgt.name, t.name, missing);
        totalInserted += res.inserted;
        const st = $("st-" + t.name);
        if (st) { st.className = "badge ok"; st.textContent = "تم النقل +" + res.inserted.toLocaleString("en"); }
        const iEl = $("i-" + t.name);
        if (iEl) iEl.innerHTML = "المضافة (هذا التشغيل): <b>" + res.inserted.toLocaleString("en") + "</b>";
        logLine("انتهى نقل [" + esc(t.name) + "] إلى <b>" + esc(tgt.name) + "</b>: +" + res.inserted.toLocaleString("en") + " صف", "ok");
        if (state.stopped) break;
      }
      if (state.stopped) break;
    }
    setProgress(90);
    setPhase("إعادة فحص الفروقات للتأكد...");
    logLine("إعادة فحص نهائي للتأكد من التطابق...", "ok");
    await analyze();
    setProgress(100);
    logLine("<b>انتهت المزامنة.</b> إجمالي الناقص دلوقتي: <b>" + state.totalMissing.toLocaleString("en") + "</b>", state.totalMissing === 0 ? "ok" : "warn");
    finish();
  }

  function finish() {
    state.running = false;
    state.stopped = false;
    $("btnStart").disabled = !state.source;
    $("btnStop").disabled = true;
    $("btnCheck").disabled = false;
    setPhase("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderServers();
    $("btnCheck").addEventListener("click", () => analyze());
    $("btnStart").addEventListener("click", () => startSync());
    $("btnStop").addEventListener("click", () => { state.stopped = true; logLine("تم إيقاف العملية مؤقتًا.", "warn"); });
    $("btnClearLog").addEventListener("click", () => { const el = $("log"); if (el) el.innerHTML = ""; });
    if (window.adminAuth && window.adminAuth.getActiveBackend) {
      const act = window.adminAuth.getActiveBackend();
      if (act && act.name) { state.source = act.name; renderServers(); }
    }
    $("btnStart").disabled = !state.source;
  });
})();

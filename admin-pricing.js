/* ============================================
   Admin — إدارة شرائح الأسعار (Pricing Tiers)
   ============================================ */

var AdminPricing = {
  editingId: null,
  supabase: null,
  currentCountry: "EG",

  // Normalize tier country (legacy rows without country_code = EG)
  tierCountry: function (t) {
    var tc = t.country_code ? String(t.country_code).toUpperCase() : "EG";
    return tc === "SA" ? "SA" : "EG";
  },

  // Currency label per country
  currency: function () {
    return this.currentCountry === "SA" ? "ريال" : "جنيه";
  },

  // Switch country tab (EG/SA)
  setCountry: function (cc) {
    this.currentCountry = cc === "SA" ? "SA" : "EG";
    PricingEngine.activeCountry = this.currentCountry;
    document.querySelectorAll(".country-tab").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-country") === AdminPricing.currentCountry);
    });
    var simCur = document.getElementById("simulatorCurrency");
    if (simCur) simCur.textContent = this.currency();
    this.renderTable();
    this.runSimulator();
  },

  init: async function () {
    this.supabase = window.supabaseClient;
    if (!this.supabase) {
      this.showToast("Supabase client not available", "error");
      return;
    }
    await PricingEngine.loadTiers();
    this.setCountry("EG");
  },

  // ========== RENDER TABLE ==========
  renderTable: function () {
    var wrap = document.getElementById("tierTableWrap");
    var cur = this.currency();
    var allTiers = PricingEngine.tiers || [];
    var tiers = allTiers.filter(function (t) {
      return AdminPricing.tierCountry(t) === AdminPricing.currentCountry;
    });

    if (!allTiers.length) {
      wrap.innerHTML = '<div class="empty-state">لا توجد شرائح بعد. أضف الشريحة الأولى.</div>';
      return;
    }

    if (!tiers.length) {
      wrap.innerHTML = '<div class="empty-state">لا توجد شرائح لهذه الدولة بعد. أضف أول شريحة.</div>';
      return;
    }

    var html = '<table><thead><tr>' +
      '<th style="width:30px;">#</th>' +
      '<th>الحد الأدنى</th>' +
      '<th>الحد الأعلى</th>' +
      '<th>الزيادة</th>' +
      '<th>سعر البيع (مثال: 1000)</th>' +
      '<th>الحالة</th>' +
      '<th>الإجراءات</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      var maxStr = t.max_price === null || t.max_price === undefined ? "غير محدود" : Number(t.max_price).toFixed(0) + " " + cur;
      var example = PricingEngine.calculate(1000);
      var isActive = t.is_active !== false;
      var inTier = (1000 >= t.min_price && (t.max_price === null || 1000 <= t.max_price));

      html += '<tr>' +
        '<td class="text-muted">' + (i + 1) + '</td>' +
        '<td><strong>' + Number(t.min_price).toFixed(0) + '</strong> ' + cur + '</td>' +
        '<td>' + maxStr + '</td>' +
        '<td><strong style="color:#e67e22;">+' + Number(t.markup).toFixed(0) + '</strong> ' + cur + '</td>' +
        '<td>' + (inTier ? '<strong style="color:#28a745;">' + Number(example).toFixed(0) + ' ' + cur + '</strong>' : '<span class="text-muted">—</span>') + '</td>' +
        '<td>' +
        '<label class="toggle">' +
        '<input type="checkbox" ' + (isActive ? "checked" : "") + ' onchange="AdminPricing.toggleTier(' + t.id + ', this.checked)" />' +
        '<span class="toggle-slider"></span>' +
        '</label>' +
        '</td>' +
        '<td>' +
        '<div class="flex" style="justify-content:center;">' +
        '<button class="btn btn-sm btn-warning" onclick="AdminPricing.openEditModal(' + t.id + ')" style="margin-left:4px;">تعديل</button>' +
        '<button class="btn btn-sm btn-danger" onclick="AdminPricing.deleteTier(' + t.id + ')">حذف</button>' +
        '</div>' +
        '</td>' +
        '</tr>';
    }

    html += '</tbody></table>';
    wrap.innerHTML = html;
  },

  // ========== OPEN ADD MODAL ==========
  openAddModal: function () {
    this.editingId = null;
    var cur = this.currency();
    var sameCountryCount = (PricingEngine.tiers || []).filter(function (t) {
      return AdminPricing.tierCountry(t) === AdminPricing.currentCountry;
    }).length;
    document.getElementById("modalTitle").textContent =
      "إضافة شريحة جديدة — " + (this.currentCountry === "SA" ? "السعودية 🇸🇦" : "مصر 🇪🇬");
    document.getElementById("inputCountry").value = this.currentCountry;
    document.getElementById("inputMin").value = "";
    document.getElementById("inputMax").value = "";
    document.getElementById("inputMarkup").value = "";
    document.getElementById("inputSort").value = sameCountryCount + 1;
    document.getElementById("inputActive").checked = true;
    this.updateModalCurrency();
    document.getElementById("tierModal").classList.add("open");
  },

  // Update currency labels inside the modal
  updateModalCurrency: function () {
    var cc = document.getElementById("inputCountry").value;
    var cur = cc === "SA" ? "ريال" : "جنيه";
    document.getElementById("labelMin").textContent = "الحد الأدنى (" + cur + ")";
    document.getElementById("labelMax").textContent = "الحد الأعلى (" + cur + ")";
    document.getElementById("labelMarkup").textContent = "قيمة الزيادة (" + cur + ")";
  },

  // ========== OPEN EDIT MODAL ==========
  openEditModal: function (id) {
    var tier = null;
    for (var i = 0; i < PricingEngine.tiers.length; i++) {
      if (PricingEngine.tiers[i].id === id) { tier = PricingEngine.tiers[i]; break; }
    }
    if (!tier) { this.showToast("الشريحة غير موجودة", "error"); return; }

    this.editingId = id;
    document.getElementById("modalTitle").textContent = "تعديل الشريحة";
    document.getElementById("inputCountry").value = this.tierCountry(tier);
    document.getElementById("inputMin").value = tier.min_price;
    document.getElementById("inputMax").value = tier.max_price === null ? "" : tier.max_price;
    document.getElementById("inputMarkup").value = tier.markup;
    document.getElementById("inputSort").value = tier.sort_order;
    document.getElementById("inputActive").checked = tier.is_active !== false;
    this.updateModalCurrency();
    document.getElementById("tierModal").classList.add("open");
  },

  // ========== CLOSE MODAL ==========
  closeModal: function () {
    document.getElementById("tierModal").classList.remove("open");
    this.editingId = null;
  },

  // ========== SAVE TIER (Add/Update) ==========
  saveTier: async function () {
    var min = parseFloat(document.getElementById("inputMin").value);
    var maxVal = document.getElementById("inputMax").value;
    var max = maxVal === "" || maxVal === null ? null : parseFloat(maxVal);
    var markup = parseFloat(document.getElementById("inputMarkup").value);
    var sort = parseInt(document.getElementById("inputSort").value, 10);
    var active = document.getElementById("inputActive").checked;
    var country = document.getElementById("inputCountry").value === "SA" ? "SA" : "EG";

    // Validation
    if (isNaN(min) || min < 0) { this.showToast("الحد الأدنى يجب أن يكون 0 أو أكثر", "error"); return; }
    if (isNaN(markup) || markup <= 0) { this.showToast("قيمة الزيادة يجب أن تكون أكبر من 0", "error"); return; }
    if (isNaN(sort) || sort < 1) { this.showToast("الترتيب يجب أن يكون 1 أو أكثر", "error"); return; }
    if (max !== null && max <= min) { this.showToast("الحد الأعلى يجب أن يكون أكبر من الحد الأدنى", "error"); return; }

    // Check overlap (within the same country only)
    if (!this.checkNoOverlap(min, max, country, this.editingId)) return;

    var data = {
      min_price: min,
      max_price: max,
      markup: markup,
      sort_order: sort,
      is_active: active,
      country_code: country,
    };

    try {
      if (this.editingId) {
        // Update
        var oldTier = null;
        for (var i = 0; i < PricingEngine.tiers.length; i++) {
          if (PricingEngine.tiers[i].id === this.editingId) { oldTier = PricingEngine.tiers[i]; break; }
        }
        var result = await this.supabase.from("price_tiers")
          .update(data)
          .eq("id", this.editingId);
        if (result.error) throw result.error;
        await this.logAudit("update", this.editingId, oldTier, data);
        this.showToast("تم تعديل الشريحة بنجاح", "success");
      } else {
        // Insert
        var newResult = await this.supabase.from("price_tiers")
          .insert(data)
          .select();
        if (newResult.error) throw newResult.error;
        var newId = newResult.data && newResult.data[0] ? newResult.data[0].id : null;
        if (newId) await this.logAudit("create", newId, null, data);
        this.showToast("تمت إضافة الشريحة بنجاح", "success");
      }

      this.closeModal();
      await PricingEngine.refresh();
      this.renderTable();
      this.runSimulator();
    } catch (e) {
      console.error("[AdminPricing] save error:", e);
      this.showToast("فشل الحفظ: " + (e.message || "خطأ غير معروف"), "error");
    }
  },

  // ========== TOGGLE ACTIVE ==========
  toggleTier: async function (id, active) {
    try {
      var oldTier = null;
      for (var i = 0; i < PricingEngine.tiers.length; i++) {
        if (PricingEngine.tiers[i].id === id) { oldTier = PricingEngine.tiers[i]; break; }
      }
      var result = await this.supabase.from("price_tiers")
        .update({ is_active: active })
        .eq("id", id);
      if (result.error) throw result.error;
      await this.logAudit("toggle", id, oldTier, { is_active: active });
      await PricingEngine.refresh();
      this.renderTable();
      this.runSimulator();
      this.showToast(active ? "تم تفعيل الشريحة" : "تم إيقاف الشريحة", "success");
    } catch (e) {
      console.error("[AdminPricing] toggle error:", e);
      this.showToast("فشل التعديل", "error");
    }
  },

  // ========== DELETE TIER ==========
  deleteTier: async function (id) {
    if (!confirm("هل أنت متأكد من حذف هذه الشريحة؟")) return;
    try {
      var oldTier = null;
      for (var i = 0; i < PricingEngine.tiers.length; i++) {
        if (PricingEngine.tiers[i].id === id) { oldTier = PricingEngine.tiers[i]; break; }
      }
      var result = await this.supabase.from("price_tiers")
        .delete()
        .eq("id", id);
      if (result.error) throw result.error;
      await this.logAudit("delete", id, oldTier, null);
      await PricingEngine.refresh();
      this.renderTable();
      this.runSimulator();
      this.showToast("تم حذف الشريحة", "success");
    } catch (e) {
      console.error("[AdminPricing] delete error:", e);
      this.showToast("فشل الحذف", "error");
    }
  },

  // ========== OVERLAP CHECK ==========
  checkNoOverlap: function (min, max, country, excludeId) {
    var tiers = PricingEngine.tiers;
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      if (this.tierCountry(t) !== country) continue;
      if (excludeId && t.id === excludeId) continue;
      var tMax = t.max_price === null ? Infinity : t.max_price;
      var newMax = max === null ? Infinity : max;
      // Check overlap
      if (min <= tMax && newMax >= t.min_price) {
        this.showToast(
          "تتداخل الشريحة الجديدة مع شريحة موجودة: " +
          Number(t.min_price).toFixed(0) + " - " +
          (t.max_price === null ? "غير محدود" : Number(t.max_price).toFixed(0)),
          "error"
        );
        return false;
      }
    }
    return true;
  },

  // ========== AUDIT LOG ==========
  logAudit: async function (action, tierId, oldData, newData) {
    try {
      await this.supabase.from("price_tier_audit_log").insert({
        tier_id: tierId,
        action: action,
        old_data: oldData ? JSON.parse(JSON.stringify(oldData)) : null,
        new_data: newData ? JSON.parse(JSON.stringify(newData)) : null,
        changed_by: localStorage.getItem("userEmail") || "unknown",
      });
    } catch (e) {
      console.warn("[AdminPricing] audit log failed:", e);
    }
  },

  // ========== SIMULATOR ==========
  runSimulator: function () {
    var cur = this.currency();
    var val = parseFloat(document.getElementById("simulatorInput").value);
    if (isNaN(val) || val < 0) {
      document.getElementById("simulatorTier").value = "";
      document.getElementById("simulatorMarkup").value = "";
      document.getElementById("simulatorResult").value = "";
      return;
    }
    var tier = PricingEngine.findTier(val);
    var markup = tier ? tier.markup : 0;
    var selling = PricingEngine.calculate(val);
    document.getElementById("simulatorTier").value = tier
      ? Number(tier.min_price).toFixed(0) + " - " + (tier.max_price === null ? "غير محدود" : Number(tier.max_price).toFixed(0))
      : "لا توجد شريحة";
    document.getElementById("simulatorMarkup").value = "+" + Number(markup).toFixed(0) + " " + cur;
    document.getElementById("simulatorResult").value = Number(selling).toFixed(0) + " " + cur;
  },

  // ========== TOAST ==========
  showToast: function (message, type) {
    var el = document.getElementById("toast");
    el.textContent = message;
    el.className = "toast show toast-" + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3500);
  },
};

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", function () { AdminPricing.init(); });

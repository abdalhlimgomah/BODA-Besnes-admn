/* ============================================
   Pricing Engine — حساب سعر البيع تلقائياً
   ============================================ */

var PricingEngine = {
  tiers: [],
  tiersLoaded: false,
  loadPromise: null,
  activeCountry: null, // when set (EG/SA), findTier only matches that country's tiers

  // Normalize tier country (legacy rows without country_code = EG)
  tierCountry: function (t) {
    var tc = t.country_code ? String(t.country_code).toUpperCase() : "EG";
    return tc === "SA" ? "SA" : "EG";
  },

  // Load price tiers from Supabase only
  loadTiers: async function () {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async function () {
      try {
        var client = window.supabaseClient;
        if (!client || typeof client.from !== "function") {
          console.warn("[PricingEngine] Supabase client not ready");
          PricingEngine.tiersLoaded = false;
          return;
        }
        var result = await client.from("price_tiers")
          .select("id,min_price,max_price,markup,sort_order,is_active,country_code")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (result.error) {
          // Fallback: country_code column not added yet (pre-migration DB)
          result = await client.from("price_tiers")
            .select("id,min_price,max_price,markup,sort_order,is_active")
            .eq("is_active", true)
            .order("sort_order", { ascending: true });
        }
        if (result.error) throw result.error;
        if (result.data && result.data.length) {
          PricingEngine.tiers = result.data;
          PricingEngine.tiersLoaded = true;
        } else {
          console.warn("[PricingEngine] No active tiers found in Supabase");
          PricingEngine.tiers = [];
          PricingEngine.tiersLoaded = false;
        }
      } catch (e) {
        console.error("[PricingEngine] Failed to load tiers:", e);
        PricingEngine.tiers = [];
        PricingEngine.tiersLoaded = false;
      }
    })();
    return this.loadPromise;
  },

  // Find the matching tier for a price
  findTier: function (supplierPrice) {
    if (!this.tiersLoaded || !this.tiers.length) return null;
    var price = Number(supplierPrice) || 0;
    for (var i = 0; i < this.tiers.length; i++) {
      var t = this.tiers[i];
      if (this.activeCountry && this.tierCountry(t) !== this.activeCountry) continue;
      if (price >= t.min_price && (t.max_price === null || price <= t.max_price)) {
        return t;
      }
    }
    return null;
  },

  // Calculate selling price from supplier price
  calculate: function (supplierPrice) {
    if (!this.tiersLoaded) return Number(supplierPrice) || 0;
    var price = Number(supplierPrice) || 0;
    var tier = this.findTier(price);
    var markup = tier ? Number(tier.markup) : 0;
    var selling = price + markup;
    return selling < price ? price : selling;
  },

  // Calculate for multiple products at once
  calculateBatch: function (products, priceField) {
    if (!products || !products.length) return [];
    priceField = priceField || "price";
    return products.map(function (p) {
      var sp = Number(p[priceField]) || 0;
      var selling = PricingEngine.calculate(sp);
      return { product: p, supplierPrice: sp, sellingPrice: selling, markup: selling - sp };
    });
  },

  // Get the effective markup for a price
  getMarkup: function (supplierPrice) {
    var tier = this.findTier(Number(supplierPrice) || 0);
    return tier ? Number(tier.markup) : 0;
  },

  // Refresh tiers from Supabase
  refresh: async function () {
    this.loadPromise = null;
    this.tiersLoaded = false;
    await this.loadTiers();
  },
};

// Auto-load tiers when script loads
if (document.readyState === "complete" || document.readyState === "interactive") {
  PricingEngine.loadTiers();
} else {
  document.addEventListener("DOMContentLoaded", function () { PricingEngine.loadTiers(); });
}

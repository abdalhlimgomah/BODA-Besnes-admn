const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

class DashboardManager {
  constructor() {
    this.username = localStorage.getItem("adminUsername") || (() => { try { var s = JSON.parse(sessionStorage.getItem("__boda_admin_session_v2")); return s?.username || ""; } catch(_) { return ""; } })() || "";
    this.owner = { name: "", email: "", description: "", profileImage: null };
    this.settings = this.loadSettings();
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadOwnerProfile();
    this.loadThemeSettings();
    this.loadCurrencySettings();
    this.updateStats();
    window.addEventListener("focus", () => this.updateStats());
  }

  setupEventListeners() {
    const imageUpload = document.getElementById("imageUpload");
    if (imageUpload) {
      imageUpload.addEventListener("change", (event) => this.handleImageUpload(event));
    }

    document.querySelectorAll(".menu-link[data-section]").forEach((link) => {
      link.addEventListener("click", (event) => this.switchSection(event));
    });

    const settingsForm = document.getElementById("settingsForm");
    if (settingsForm) {
      settingsForm.addEventListener("submit", (event) => this.handleSettingsSubmit(event));
    }

    const currencyForm = document.getElementById("currencyForm");
    if (currencyForm) {
      currencyForm.addEventListener("submit", (event) => this.handleCurrencySubmit(event));
    }

    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) {
      themeToggle.addEventListener("change", (event) => this.toggleTheme(event));
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => this.handleLogout());
    }
  }

  switchSection(event) {
    event.preventDefault();
    const sectionId = event.currentTarget.getAttribute("data-section");
    if (!sectionId) return;

    document.querySelectorAll(".menu-link[data-section]").forEach((link) => {
      link.classList.remove("active");
    });
    event.currentTarget.classList.add("active");

    document.querySelectorAll(".section").forEach((section) => {
      section.classList.remove("active");
    });

    const targetSection = document.getElementById(sectionId);
    if (targetSection) targetSection.classList.add("active");
  }

  async handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!this.username) {
      this.showNotification("لم يتم التعرف على اسم المستخدم. سجل الدخول مرة أخرى.", "error");
      return;
    }

    var ext = (file.name || "").split('.').pop() || "jpg";
    const fileName = `profile_${this.username}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabaseClient.storage
      .from("profile-images")
      .upload(fileName, file, { upsert: true });
    if (uploadError) {
      this.showNotification("فشل رفع الصورة: " + uploadError.message, "error");
      return;
    }
    const { data } = await supabaseClient.storage.from("profile-images").getPublicUrl(fileName);
    const imageUrl = data?.publicUrl || "";
    if (!imageUrl) {
      this.showNotification("فشل الحصول على رابط الصورة", "error");
      return;
    }

    const profileImage = document.getElementById("profileImage");
    if (profileImage) profileImage.src = imageUrl;
    this.owner.profileImage = imageUrl;
    this.saveOwnerData();
    await this.saveProfileToSupabase();
    this.showNotification("تم تحديث صورة المالك", "success");
  }

  async loadOwnerProfile() {
    const ownerName = document.getElementById("ownerName");
    const ownerEmail = document.getElementById("ownerEmail");
    const profileImage = document.getElementById("profileImage");
    const storeName = document.getElementById("storeName");
    const storeDescription = document.getElementById("storeDescription");

    // Try to load from localStorage cache first
    var cached = this.loadOwnerData();
    if (cached.profileImage && profileImage) profileImage.src = cached.profileImage;
    if (cached.name && ownerName) ownerName.textContent = cached.name;
    if (cached.email && ownerEmail) ownerEmail.textContent = cached.email;
    if (cached.name && storeName) storeName.value = cached.name;
    if (cached.description && storeDescription) storeDescription.value = cached.description;

    if (!this.username) return;

    // Fetch latest from Supabase
    console.log("Fetching profile for username:", this.username);
    var { data, error } = await supabaseClient
      .from("admin_profiles")
      .select("*")
      .eq("username", this.username)
      .limit(1);

    if (error) {
      console.error("Failed to load profile:", error);
      if (error.code === "PGRST116" || error.message?.includes("relation") || error.message?.includes("does not exist")) {
        console.warn("admin_profiles table not found. Run the SQL migration first.");
      }
      return;
    }

    if (data && data.length > 0) {
      var profile = data[0];
      this.owner.name = profile.store_name || "";
      this.owner.email = profile.email || "";
      this.owner.description = profile.store_description || "";
      this.owner.profileImage = profile.profile_image || "";

      this.saveOwnerData();

      if (ownerName) ownerName.textContent = this.owner.name || "مالك المتجر";
      if (ownerEmail) ownerEmail.textContent = this.owner.email || this.username;
      if (profileImage && this.owner.profileImage) profileImage.src = this.owner.profileImage;
      if (storeName) storeName.value = this.owner.name || "";
      if (storeDescription) storeDescription.value = this.owner.description || "";
    }
  }

  async updateStats() {
    const currencySymbol = this.getCurrencySymbol();

    const [{ count: productCount }, { count: orderCount }, { data: deliveredOrders }, { count: taagerCount }, { count: complaintsCount }, { count: variantGroupsCount }, { count: stockChangesCount }] = await Promise.all([
      supabaseClient.from("products").select("*", { count: "exact", head: true }),
      supabaseClient.from("orders").select("*", { count: "exact", head: true }),
      supabaseClient.from("orders").select("total_price,total").eq("status", "completed"),
      supabaseClient.from("taager_products").select("*", { count: "exact", head: true }),
      supabaseClient.from("complaints").select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabaseClient.from("taager_variant_groups").select("*", { count: "exact", head: true }),
      supabaseClient.from("stock_change_log").select("*", { count: "exact", head: true }),
    ]);

    const totalSales = (deliveredOrders || []).reduce((sum, order) => {
      const val = Number(order.total_price ?? order.total ?? order.amount ?? 0);
      return sum + val;
    }, 0);

    const productEl = document.getElementById("productCount");
    const orderEl = document.getElementById("orderCount");
    const salesEl = document.getElementById("salesAmount");
    const revenueEl = document.getElementById("revenueAmount");

    if (productEl) productEl.textContent = productCount ?? 0;
    if (orderEl) orderEl.textContent = orderCount ?? 0;
    if (salesEl) salesEl.textContent = `${totalSales.toFixed(2)} ${currencySymbol}`;
    if (revenueEl) revenueEl.textContent = `${totalSales.toFixed(2)} ${currencySymbol}`;
    const taagerEl = document.getElementById("taagerCount");
    if (taagerEl) taagerEl.textContent = taagerCount ?? 0;

    const complaintsEl = document.getElementById("complaintsCount");
    if (complaintsEl) complaintsEl.textContent = complaintsCount ?? 0;
    const variantGroupsEl = document.getElementById("variantGroupsCount");
    if (variantGroupsEl) variantGroupsEl.textContent = variantGroupsCount ?? 0;

    const stockChangesEl = document.getElementById("stockChangesCount");
    if (stockChangesEl) stockChangesEl.textContent = stockChangesCount ?? 0;
  }

  async handleSettingsSubmit(event) {
    event.preventDefault();

    const storeName = document.getElementById("storeName");
    const storeDescription = document.getElementById("storeDescription");

    this.owner.name = storeName ? storeName.value.trim() : this.owner.name;
    this.owner.description = storeDescription ? storeDescription.value.trim() : this.owner.description;

    await this.saveProfileToSupabase();
    this.saveOwnerData();
    this.loadOwnerProfile();
    this.showNotification("تم حفظ الإعدادات بنجاح", "success");
  }

  async saveProfileToSupabase() {
    if (!this.username) {
      console.warn("no username set, can't save profile");
      return;
    }
    var payload = {
      username: this.username,
      store_name: this.owner.name || "",
      store_description: this.owner.description || "",
      profile_image: this.owner.profileImage || "",
      email: this.owner.email || "",
      updated_at: new Date().toISOString(),
    };
    console.log("Saving profile to Supabase:", payload);
    var { error } = await supabaseClient.from("admin_profiles").upsert(payload, { onConflict: "username" });
    if (error) {
      console.error("Failed to save profile:", error);
      this.showNotification("فشل حفظ البيانات في سوبا بيز: " + error.message, "error");
    } else {
      console.log("Profile saved successfully");
    }
  }

  handleCurrencySubmit(event) {
    event.preventDefault();
    const currencySelect = document.getElementById("currencySelect");
    if (!currencySelect) return;

    this.settings.currency = currencySelect.value;
    this.saveSettings();
    this.updateStats();
    this.showNotification("تم تحديث العملة", "success");
  }

  handleLogout() {
    if (!confirm("هل تريد تسجيل الخروج؟")) return;
    if (window.adminAuth?.clearSession) {
      window.adminAuth.clearSession();
    }
    window.location.replace("login.html");
  }

  loadThemeSettings() {
    const themeToggle = document.getElementById("themeToggle");
    const isDark = this.settings.theme === "dark";
    if (themeToggle) themeToggle.checked = isDark;
    document.body.classList.toggle("dark-mode", isDark);
  }

  toggleTheme(event) {
    const isDark = event.target.checked;
    this.settings.theme = isDark ? "dark" : "light";
    this.saveSettings();
    document.body.classList.toggle("dark-mode", isDark);
    this.showNotification(isDark ? "تم تفعيل الوضع الليلي" : "تم إيقاف الوضع الليلي", "info");
  }

  loadCurrencySettings() {
    const currencySelect = document.getElementById("currencySelect");
    if (currencySelect) currencySelect.value = this.settings.currency || "EGP";
  }

  getCurrencySymbol() {
    const symbols = {
      EGP: "ج.م", USD: "$", EUR: "€", SAR: "ر.س", AED: "د.إ",
      KWD: "د.ك", QAR: "ر.ق", BHD: "د.ب", OMR: "ر.ع",
      JOD: "د.أ", LBP: "ل.ل", SYP: "ل.س",
    };
    return symbols[this.settings.currency] || "ج.م";
  }

  saveOwnerData() {
    localStorage.setItem("dashboardOwner", JSON.stringify(this.owner));
  }

  loadOwnerData() {
    const saved = localStorage.getItem("dashboardOwner");
    if (saved) {
      try { return JSON.parse(saved); } catch (_) {}
    }
    return { name: "", email: "", description: "", profileImage: null };
  }

  saveSettings() {
    localStorage.setItem("dashboardSettings", JSON.stringify(this.settings));
  }

  loadSettings() {
    const saved = localStorage.getItem("dashboardSettings");
    if (saved) {
      try { return JSON.parse(saved); } catch (_) {}
    }
    return { theme: "light", currency: "EGP" };
  }

  showNotification(message, type = "info") {
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
}

let dashboardManager;
document.addEventListener("DOMContentLoaded", () => {
  dashboardManager = new DashboardManager();
});

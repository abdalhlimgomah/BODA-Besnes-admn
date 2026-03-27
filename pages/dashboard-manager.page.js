class DashboardManager {
  constructor() {
    this.userEmail = this.getCurrentUserEmail();
    this.owner = this.loadOwnerData();
    this.settings = this.loadSettings();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadOwnerProfile();
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

  getCurrentUserEmail() {
    return localStorage.getItem("currentSellerEmail") || localStorage.getItem("userEmail") || "";
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

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const imageData = readerEvent.target.result;
      const profileImage = document.getElementById("profileImage");
      if (profileImage) profileImage.src = imageData;
      this.owner.profileImage = imageData;
      this.saveOwnerData();
      this.showNotification("تم تحديث صورة المالك", "success");
    };
    reader.readAsDataURL(file);
  }

  loadOwnerProfile() {
    const ownerName = document.getElementById("ownerName");
    const ownerEmail = document.getElementById("ownerEmail");
    const profileImage = document.getElementById("profileImage");

    if (ownerName) ownerName.textContent = this.owner.name || "مالك المتجر";
    if (ownerEmail) ownerEmail.textContent = this.owner.email || "manager@example.com";
    if (profileImage && this.owner.profileImage) profileImage.src = this.owner.profileImage;

    const storeName = document.getElementById("storeName");
    const storeDescription = document.getElementById("storeDescription");
    if (storeName) storeName.value = this.owner.name || "";
    if (storeDescription) storeDescription.value = this.owner.description || "";
  }

  updateStats() {
    const sellerProductsKey = `seller_products_${this.userEmail}`;
    const sellerProducts = JSON.parse(localStorage.getItem(sellerProductsKey) || "[]");
    const allOrders = JSON.parse(localStorage.getItem("seller_orders") || "[]");

    const sellerOrders = allOrders.filter((order) => order.seller_email === this.userEmail);
    const deliveredOrders = sellerOrders.filter((order) => order.status === "delivered");

    const totalSales = deliveredOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const currencySymbol = this.getCurrencySymbol();

    const productCount = document.getElementById("productCount");
    const orderCount = document.getElementById("orderCount");
    const salesAmount = document.getElementById("salesAmount");
    const revenueAmount = document.getElementById("revenueAmount");

    if (productCount) productCount.textContent = sellerProducts.length;
    if (orderCount) orderCount.textContent = sellerOrders.length;
    if (salesAmount) salesAmount.textContent = `${totalSales.toFixed(2)} ${currencySymbol}`;
    if (revenueAmount) revenueAmount.textContent = `${totalSales.toFixed(2)} ${currencySymbol}`;
  }

  handleSettingsSubmit(event) {
    event.preventDefault();

    const storeName = document.getElementById("storeName");
    const storeDescription = document.getElementById("storeDescription");

    this.owner.name = storeName ? storeName.value.trim() : this.owner.name;
    this.owner.description = storeDescription ? storeDescription.value.trim() : this.owner.description;
    this.saveOwnerData();
    this.loadOwnerProfile();
    this.showNotification("تم حفظ الإعدادات بنجاح", "success");
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
      EGP: "ج.م",
      USD: "$",
      EUR: "€",
      SAR: "ر.س",
      AED: "د.إ",
      KWD: "د.ك",
      QAR: "ر.ق",
      BHD: "د.ب",
      OMR: "ر.ع",
      JOD: "د.أ",
      LBP: "ل.ل",
      SYP: "ل.س",
    };
    return symbols[this.settings.currency] || "ج.م";
  }

  saveOwnerData() {
    localStorage.setItem("dashboardOwner", JSON.stringify(this.owner));
  }

  loadOwnerData() {
    const saved = localStorage.getItem("dashboardOwner");
    if (saved) return JSON.parse(saved);
    return {
      name: "*ᬼ👑𓆩Buda*⚡",
      email: "قاعدة البيانات",
      description: "",
      profileImage: null,
    };
  }

  saveSettings() {
    localStorage.setItem("dashboardSettings", JSON.stringify(this.settings));
  }

  loadSettings() {
    const saved = localStorage.getItem("dashboardSettings");
    if (saved) return JSON.parse(saved);
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

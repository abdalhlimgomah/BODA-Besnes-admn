/* ============================================================
   HS — Home Studio admin app (vanilla JS)
   RTL visual builder for the storefront home page.
   ============================================================ */
(function () {
  "use strict";

  // The literal URL/key are taken from pages/supabase-client.js. auth-guard.js
  // patches createClient so the active backend + admin headers are enforced.
  var SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
  var BUCKET = "home-images";
  var MAX_UPLOAD = 5 * 1024 * 1024;
  var ALLOWED_MIME = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
  var LS_DOC = "hs_studio_doc_v1";
  var LS_META = "hs_studio_meta_v1";
  var LS_LOG = "hs_studio_activity_v1";
  var LS_STORE_HOME = "hs_storefront_home_v1";

  var TYPES = {
    banner: { name: "بانر", icon: "fa-image" },
    hero: { name: "هيرو", icon: "fa-bolt" },
    categories: { name: "فئات", icon: "fa-grip" },
    products: { name: "منتجات", icon: "fa-boxes-stacked" },
    ads: { name: "إعلان", icon: "fa-bullhorn" },
    text: { name: "نص", icon: "fa-font" },
    image: { name: "صورة", icon: "fa-photo-film" },
    sticker: { name: "ملصق", icon: "fa-stamp" },
    spacer: { name: "مسافة", icon: "fa-arrows-up-down" },
  };

  /* ---------------- ready-made template library (Noon / Amazon style) ---------------- */
  var TPL_PRESETS = {
    noon:    { background: "#fff1f2", color: "#9f1239", gradient: false, border: "1px solid #fecdd3", radius: "18px", padding: "22px", fontSize: "23px", fontWeight: "900" },
    amazon:  { background: "#131921", color: "#ffffff", gradient: false, border: "0", radius: "12px", padding: "22px", fontSize: "21px", fontWeight: "800" },
    sale:    { background: "#dc2626", color: "#ffffff", gradient: false, border: "0", radius: "16px", padding: "24px", fontSize: "28px", fontWeight: "900" },
    flash:   { background: "#111827", color: "#fde047", gradient: false, border: "1px solid #facc15", radius: "16px", padding: "22px", fontSize: "25px", fontWeight: "900" },
    dark:    { background: "#0f172a", color: "#f8fafc", gradient: false, border: "0", radius: "18px", padding: "26px", fontSize: "24px", fontWeight: "900" },
    cyan:    { background: "#ecfeff", color: "#0e7490", gradient: false, border: "1px solid #a5f3fc", radius: "16px", padding: "20px", fontSize: "22px", fontWeight: "800" },
    royal:   { background: "#eef2ff", color: "#4338ca", gradient: false, border: "1px solid #c7d2fe", radius: "16px", padding: "20px", fontSize: "22px", fontWeight: "800" },
    green:   { background: "#ecfdf5", color: "#047857", gradient: false, border: "1px solid #a7f3d0", radius: "16px", padding: "20px", fontSize: "22px", fontWeight: "800" },
    gold:    { background: "#fffbeb", color: "#b45309", gradient: false, border: "1px solid #fde68a", radius: "16px", padding: "20px", fontSize: "22px", fontWeight: "800" },
    pink:    { background: "#fdf2f8", color: "#be185d", gradient: false, border: "1px solid #fbcfe8", radius: "18px", padding: "20px", fontSize: "22px", fontWeight: "800" },
    minimal: { background: "#ffffff", color: "#111827", gradient: false, border: "1px solid #e5e7eb", radius: "12px", padding: "18px", fontSize: "20px", fontWeight: "700" },
    compact: { background: "#f8fafc", color: "#1e293b", gradient: false, border: "1px solid #e2e8f0", radius: "10px", padding: "12px", fontSize: "16px", fontWeight: "700" },
    tall:    { background: "#f5f3ff", color: "#5b21b6", gradient: false, border: "1px solid #ddd6fe", radius: "18px", padding: "34px", fontSize: "26px", fontWeight: "900" },
    soft:    { background: "#fff7ed", color: "#9a3412", gradient: false, border: "1px solid #fed7aa", radius: "16px", padding: "20px", fontSize: "21px", fontWeight: "800" },
    bold:    { background: "#7c3aed", color: "#ffffff", gradient: false, border: "0", radius: "14px", padding: "24px", fontSize: "26px", fontWeight: "900" },
    gradient:{ background: "#ffffff", color: "#ffffff", gradient: true, border: "0", radius: "20px", padding: "26px", fontSize: "25px", fontWeight: "900" },
    ocean:   { background: "#eff6ff", color: "#1d4ed8", gradient: false, border: "1px solid #bfdbfe", radius: "16px", padding: "20px", fontSize: "22px", fontWeight: "800" },
    night:   { background: "#111827", color: "#f472b6", gradient: false, border: "1px solid #4c1d95", radius: "16px", padding: "22px", fontSize: "23px", fontWeight: "900" },
    cream:   { background: "#fefce8", color: "#854d0e", gradient: false, border: "1px solid #fef08a", radius: "14px", padding: "18px", fontSize: "20px", fontWeight: "700" },
    tech:    { background: "#0b1220", color: "#38bdf8", gradient: false, border: "1px solid #1e40af", radius: "14px", padding: "20px", fontSize: "21px", fontWeight: "800" },
  };

  var TEMPLATE_GROUPS = [
    { id: "all", name: "الكل", icon: "fa-border-all" },
    { id: "offers", name: "عروض", icon: "fa-tags" },
    { id: "hero", name: "هيرو", icon: "fa-bolt" },
    { id: "categories", name: "فئات", icon: "fa-grip" },
    { id: "products", name: "منتجات", icon: "fa-boxes-stacked" },
    { id: "ads", name: "إعلانات", icon: "fa-bullhorn" },
    { id: "text", name: "نصوص", icon: "fa-font" },
    { id: "media", name: "صور وملصقات", icon: "fa-photo-film" },
  ];

  var TEMPLATES = [];
  function addTpl(id, name, group, type, title, subtitle, preset, extra) {
    TEMPLATES.push(Object.assign({
      id: id, name: name, group: group, type: type,
      title: title, subtitle: subtitle, preset: preset || "minimal",
    }, extra || {}));
  }
  (function buildTemplates() {
    // --- عروض (18) ---
    addTpl("sale50", "خصم 50%", "offers", "banner", "خصم 50% على كل المنتجات", "أفضل العروض لفترة محدودة", "sale", { anim: { type: "pulse", power: 5 } });
    addTpl("flash", "فلاش سيل", "offers", "banner", " FLASH SALE ⚡", "عروض تنتهي خلال ساعات", "flash", { anim: { type: "fade", duration: 1.4 } });
    addTpl("coupon", "كوبون خصم", "offers", "text", "كوبون خصم 20%", "انسخ الكوبون عند الدفع", "gold");
    addTpl("today", "عرض اليوم", "offers", "banner", "عرض اليوم", "منتجات مختارة بأسعار مذهلة", "noon");
    addTpl("week", "عرض الأسبوع", "offers", "banner", "عرض الأسبوع", "كل جديد في عالم التوفير", "royal");
    addTpl("friday", "الجمعة البيضاء", "offers", "banner", "الجمعة البيضاء", "خصومات لا تُفوّت", "dark");
    addTpl("ramadan", "عروض رمضان", "offers", "banner", "عروض رمضان", "توفير كل يوم", "green");
    addTpl("eid", "عروض العيد", "offers", "banner", "عروض العيد", "استعد للعيد بأفضل الأسعار", "pink");
    addTpl("summer", "تخفيضات الصيف", "offers", "banner", "تخفيضات الصيف", "حرارة الأسعار تنخفض", "cyan");
    addTpl("school", "العودة للمدرسة", "offers", "banner", "العودة للمدرسة", "كل احتياجاتك بسعر واحد", "ocean");
    addTpl("bundle", "باقة توفير", "offers", "banner", "باقة توفير", "اشترِ أكثر وادفع أقل", "soft");
    addTpl("ship", "شحن مجاني", "offers", "banner", "شحن مجاني", "على الطلبات فوق 199", "green");
    addTpl("cashback", "استرجاع نقدي", "offers", "banner", "استرجاع نقدي", "نظير يرجع لك بعد الشراء", "gold");
    addTpl("lowest", "أقل سعر", "offers", "banner", "أقل سعر", "مقارنة الأسعار بسهولة", "amazon");
    addTpl("last", "آخر فرصة", "offers", "banner", "آخر فرصة", "الكمية محدودة", "sale");
    addTpl("exclusive", "عرض حصري", "offers", "banner", "عرض حصري", "لأعضاء المتجر فقط", "night");
    addTpl("noonDeals", "عروض نون", "offers", "banner", "عروض نون", "أسعار تنافسية كل يوم", "noon");
    addTpl("amazonDeals", "عروض أمازون", "offers", "banner", "Deals of the Day", "أفضل العروض على الإنترنت", "amazon");
    // --- هيرو (12) ---
    addTpl("heroNoon", "هيرو نون", "hero", "hero", "تسوق الأكثر مبيعاً", "اكتشف آلاف المنتجات بأسعار مذهلة", "noon", { height: "440px" });
    addTpl("heroAmazon", "هيرو أمازون", "hero", "hero", "كل ما تبحث عنه في مكان واحد", "تسوّق بثقة، وصل سريع", "amazon", { height: "440px" });
    addTpl("heroTech", "هيرو إلكترونيات", "hero", "hero", "أحدث الإلكترونيات", "هواتف، لابتوبات، وسماعات", "tech", { height: "420px" });
    addTpl("heroFashion", "هيرو أزياء", "hero", "hero", "إطلالتك تبدأ من هنا", "أزياء للرجال والنساء", "pink", { height: "420px" });
    addTpl("heroHome", "هيرو المنزل", "hero", "hero", "بيتك بلمسة جديدة", "أثاث وديكور بأسعار بسيطة", "soft", { height: "420px" });
    addTpl("heroBeauty", "هيرو التجميل", "hero", "hero", "جمالك أولويتنا", "عناية وتجميل من أفضل الماركات", "pink", { height: "420px" });
    addTpl("heroKids", "هيرو الأطفال", "hero", "hero", "عالم الأطفال", "ألعاب وملابس وهدايا", "cyan", { height: "420px" });
    addTpl("heroSport", "هيرو الرياضة", "hero", "hero", "ابدأ رياضتك اليوم", "معدات وملابس رياضية", "green", { height: "420px" });
    addTpl("heroBlack", "هيرو بلاك فرايداي", "hero", "hero", "بلاك فرايداي", "خصومات ضخمة لساعات محدودة", "dark", { height: "460px", anim: { type: "pulse", power: 4 } });
    addTpl("heroMobile", "هيرو للجوال", "hero", "hero", "عروض بين يديك", "تسوّق في أي وقت ومن أي مكان", "royal", { height: "380px" });
    addTpl("heroWide", "هيرو عريض", "hero", "hero", "مرحباً بك في متجرنا", "كل ما تحتاجه في صفحة واحدة", "minimal", { height: "340px" });
    addTpl("heroGradient", "هيرو متدرج", "hero", "hero", "تسوّق بلا حدود", "تجربة تسوق سهلة وسريعة", "gradient", { height: "450px" });
    // --- فئات (10) ---
    addTpl("catCircle", "فئات دائرية", "categories", "categories", "تسوّق حسب الفئة", "اختر ما يناسبك", "pink");
    addTpl("catSquare", "فئات مربعة", "categories", "categories", "فئات المتجر", "كل الأقسام في مكان واحد", "minimal");
    addTpl("catGrid", "فئات شبكة", "categories", "categories", "استكشف الفئات", "وصول سريع لكل قسم", "royal");
    addTpl("catTech", "فئات إلكترونيات", "categories", "categories", "إلكترونيات", "هواتف، كمبيوترات، إكسسوارات", "tech");
    addTpl("catFashion", "فئات أزياء", "categories", "categories", "أزياء وموضة", "لكل المناسبات", "pink");
    addTpl("catHome", "فئات المنزل", "categories", "categories", "المنزل والمطبخ", "كل احتياجات بيتك", "soft");
    addTpl("catBeauty", "فئات التجميل", "categories", "categories", "الجمال والعناية", "منتجات مختارة بعناية", "noon");
    addTpl("catKids", "فئات الأطفال", "categories", "categories", "عالم الأطفال", "ألعاب وهدايا", "cyan");
    addTpl("catSport", "فئات الرياضة", "categories", "categories", "الرياضة واللياقة", "معدات لكل رياضة", "green");
    addTpl("catBooks", "فئات الكتب", "categories", "categories", "الكتب والثقافة", "اقرأ أكثر", "cream");
    // --- منتجات (14) ---
    addTpl("prod4", "منتجات 4 أعمدة", "products", "products", "منتجات مختارة", "الأكثر مبيعاً هذا الأسبوع", "minimal", { cols: 4, cardSize: "md" });
    addTpl("prod3", "منتجات 3 أعمدة", "products", "products", "منتجات للجميع", "اختيارات تناسب كل الميزانيات", "royal", { cols: 3, cardSize: "md" });
    addTpl("prod2", "منتجات عمودين", "products", "products", "منتجات مميزة", "عرض أكبر وتفاصيل أوضح", "soft", { cols: 2, cardSize: "lg" });
    addTpl("prod5", "منتجات 5 أعمدة", "products", "products", "شبكة المنتجات", "عرض سريع للكثير من المنتجات", "cyan", { cols: 5, cardSize: "sm" });
    addTpl("prodBest", "الأكثر مبيعاً", "products", "products", "الأكثر مبيعاً", "ما يشتريه الجميع", "noon", { cols: 4 });
    addTpl("prodNew", "وصل حديثاً", "products", "products", "وصل حديثاً", "جديد في المتجر", "green", { cols: 4 });
    addTpl("prodTop", "الأكثر تقييماً", "products", "products", "الأكثر تقييماً", "أفضل الآراء من العملاء", "gold", { cols: 4 });
    addTpl("prodDiscount", "منتجات مخفضة", "products", "products", "منتجات مخفضة", "خصومات حقيقية", "sale", { cols: 4 });
    addTpl("prodLarge", "بطاقات كبيرة", "products", "products", "منتجات بارزة", "صور كبيرة وتفاصيل واضحة", "minimal", { cols: 2, cardSize: "lg" });
    addTpl("prodSmall", "بطاقات صغيرة", "products", "products", "عرض سريع", "كثير من المنتجات في مساحة أقل", "compact", { cols: 5, cardSize: "sm" });
    addTpl("prodCompare", "مقارنة الأسعار", "products", "products", "قارن الأسعار", "اختر الأفضل لك", "ocean", { cols: 3 });
    addTpl("prodNoon", "شبكة نون", "products", "products", "منتجات موصى بها", "تجربة تسوق بنمط نون", "noon", { cols: 5, cardSize: "sm" });
    addTpl("prodAmazon", "شبكة أمازون", "products", "products", "منتجات مختارة", "تجربة تسوق بنمط أمازون", "amazon", { cols: 4 });
    addTpl("prodCountdown", "منتجات العدّاد", "products", "products", "عروض العدّاد", "remaining time محدود", "flash", { cols: 4, anim: { type: "pulse", power: 3 } });
    // --- إعلانات (8) ---
    addTpl("adTop", "إعلان أعلى", "ads", "ads", "إعلان ممول", "أعلى الصفحة", "royal", { ad: { position: "top" } });
    addTpl("adMiddle", "إعلان وسط", "ads", "ads", "إعلان في الوسط", "بين الأقسام", "pink", { ad: { position: "middle" } });
    addTpl("adBottom", "إعلان أسفل", "ads", "ads", "إعلان أسفل الصفحة", "قبل التذييل", "green", { ad: { position: "bottom" } });
    addTpl("adInline", "إعلان داخل المحتوى", "ads", "ads", "إعلان داخل المحتوى", "داخل نفس السياق", "compact", { ad: { position: "inline" } });
    addTpl("adNoon", "إعلان نون", "ads", "ads", "عرض من نون", "إعلان ممول", "noon", { ad: { position: "top" } });
    addTpl("adAmazon", "إعلان أمازون", "ads", "ads", "Sponsored", "إعلان ممول", "amazon", { ad: { position: "middle" } });
    addTpl("adClick", "إعلان بالنقر", "ads", "ads", "اضغط للكشف", "إعلان يظهر عند النقر", "dark", { ad: { trigger: "click" } });
    addTpl("adScroll", "إعلان بالتمرير", "ads", "ads", "اكتشف عند التمرير", "إعلان يظهر عند الوصول إليه", "gradient", { ad: { trigger: "scroll" } });
    // --- نصوص (8) ---
    addTpl("textTitle", "عنوان جذاب", "text", "text", "عنوان يلفت الانتباه", "اكتب وصفاً مختصراً", "bold");
    addTpl("textSub", "عنوان فرعي", "text", "text", "تفاصيل العرض", "معلومات إضافية", "minimal", { style: { fontSize: "17px" } });
    addTpl("textPara", "فقرة وصف", "text", "text", "وصف المنتجات", "نص طويل يشرح ما يميز متجرك", "compact", { style: { fontSize: "14px", lineHeight: "1.9" } });
    addTpl("textSlogan", "شعار المتجر", "text", "text", "تسوّق بثقة", "جودة عالية وأسعار مناسبة", "gradient");
    addTpl("textCounter", "عدّاد العرض", "text", "text", "ينتهي خلال 02:45:10", "سارع قبل انتهاء الوقت", "flash", { anim: { type: "pulse", power: 3 } });
    addTpl("textShip", "نص الشحن", "text", "text", "شحن سريع لكل المحافظات", "التوصيل خلال 24 ساعة", "green");
    addTpl("textWarranty", "نص الضمان", "text", "text", "ضمان الجودة", "استرجاع خلال 14 يوماً", "ocean");
    addTpl("textLetters", "عنوان بألوان حروف", "text", "text", "ألوان لكل حرف", "اضبط لون كل حرف من الخصائص", "minimal", {
      letters: ["#dc2626", "#f59e0b", "#7c3aed", "#22d3ee", "#16a34a", "#db2777", "#0f172a"],
    });
    // --- صور وملصقات (8) ---
    addTpl("imgWide", "صورة بانورامية", "media", "image", "صورة بانورامية", "أضف صورة من الرابط أو الرفع", "minimal", { height: "280px" });
    addTpl("imgCenter", "صورة مركزية", "media", "image", "صورة مركزية", "مساحة للصورة في المنتصف", "soft", { height: "340px" });
    addTpl("imgFloat", "صورة بحركة float", "media", "image", "صورة متحركة", "حركة تعويم خفيفة", "cyan", { height: "300px", anim: { type: "float", power: 5 } });
    addTpl("imgRocket", "صورة بحركة rocket", "media", "image", "صورة تنطلق", "حركة انطلاق لافتة", "night", { height: "320px", anim: { type: "rocket", power: 6 } });
    addTpl("stickNew", "ملصق جديد", "media", "sticker", "✨ جديد", "ملصق صغير", "royal", { style: { fontSize: "16px", padding: "8px" } });
    addTpl("stickSale", "ملصق خصم", "media", "sticker", "خصم!", "ملصق مبيعات", "sale", { style: { fontSize: "18px", padding: "9px" } });
    addTpl("stickStar", "ملصق نجمة", "media", "sticker", "⭐ الأفضل", "ملصق تقييم", "gold", { style: { fontSize: "17px", padding: "9px" }, anim: { type: "pulse", power: 5 } });
    addTpl("spacer", "مسافة فاصلة", "media", "spacer", "", "", "minimal", { height: "60px" });
  })();

  var KEYFRAMES = [
    "@keyframes hs-float{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--hs-power,4) * -1px))}}",
    "@keyframes hs-rocket{0%{transform:translateY(0) scale(1);opacity:1}70%{transform:translateY(calc(var(--hs-power,4) * -14px)) scale(1.04);opacity:1}100%{transform:translateY(calc(var(--hs-power,4) * -30px));opacity:0}}",
    "@keyframes hs-fade{0%{opacity:.1}50%{opacity:1}100%{opacity:.1}}",
    "@keyframes hs-slide{0%{transform:translateX(calc(var(--hs-power,4) * 14px))}100%{transform:translateX(calc(var(--hs-power,4) * -14px))}}",
    "@keyframes hs-pulse{0%,100%{transform:scale(1)}50%{transform:scale(calc(1 + var(--hs-power,4) / 100))}}",
  ].join("\n");

  var state = {
    doc: freshDoc(),
    country: "EG",
    device: "all",
    name: "الصفحة الرئيسية",
    selectedId: null,
    imageIndex: 0,
    animTarget: "block",
    scrollToSelected: false,
    tab: "style",
    zoom: 75,
    animate: true,
    dirty: false,
    published: false,
    serverVersion: 0,
    undo: [],
    redo: [],
    log: [],
    editSnapshot: null,
    editNameSnapshot: null,
    modalSnapshot: null,
    autoProducts: [],
    pickerProducts: [],
    pickerQuery: "",
    templateCategory: "all",
    templateQuery: "",
    focusTimer: null,
    viewPromise: null,
    saveTimer: null,
    busy: false,
  };
  var sb = null;
  var uploadSeq = 0;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function uid(prefix) {
    return (prefix || "hs") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeCss(value) { return String(value == null ? "" : value).replace(/[<>;"'{}\\]/g, "").trim(); }
  function safeUrl(value) {
    var v = String(value == null ? "" : value).trim();
    if (!v) return "#";
    return /^(https?:\/\/|\/|\.\/|\.\.\/|#|\?)/i.test(v) || /^[a-z0-9_.-]+(?:\/|$|\?)/i.test(v) ? v : "#";
  }
  function getPath(obj, path) {
    return String(path || "").split(".").reduce(function (o, k) {
      return o == null ? undefined : o[k];
    }, obj);
  }
  function setPath(obj, path, value) {
    var keys = String(path || "").split(".");
    var cur = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]] || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }
  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }
  function liveDevice() {
    return window.matchMedia && window.matchMedia("(max-width: 700px)").matches ? "mobile" : "desktop";
  }
  // The live storefront never renders with device="all": it picks mobile/desktop
  // from the viewport. The studio must use the exact same rule.
  function viewDevice() { return state.device === "all" ? liveDevice() : state.device; }

  async function setDevice(device) {
    if (["all", "mobile", "desktop"].indexOf(device) < 0 || device === state.device) return;
    flushAutosave();
    state.device = device;
    $$("#hsDeviceSeg button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-device") === device); });
    var label = $("#hsStageDevice");
    if (label) label.textContent = device === "all" ? "حسب الجهاز" : device === "mobile" ? "موبايل" : "ديسكتوب";
    await loadInitial({ keepDevice: true, keepName: true });
    renderAll();
    addLog("edit", "جهاز العرض: " + (device === "all" ? "حسب الجهاز" : device === "mobile" ? "موبايل" : "ديسكتوب"));
  }

  /* ---------------- document model ---------------- */
  function freshDoc() {
    return {
      version: 1,
      theme: {
        bg: "#ffffff", text: "#101828", accent: "#7c3aed",
        fontFamily: "Cairo", radius: "14px", pageWidth: "100%",
      },
      blocks: [],
    };
  }

  function makeAnim() {
    return { type: "none", power: 4, delay: 0, duration: 1.2, repeat: "infinite" };
  }

  function makeImage(url) {
    return {
      id: uid("img"), url: url || "",
      x: 50, y: 50, w: 100, h: 100,
      zoom: 1, cropX: 50, cropY: 50,
      radius: "12px", opacity: 1, z: 1,
      anim: makeAnim(),
    };
  }

  function makeBlock(type) {
    var defaults = {
      banner: { title: "بانر جديد", subtitle: "اكتب نص البانر هنا" },
      hero: { title: "أهلًا بك في متجرنا", subtitle: "أفضل العروض وأحدث المنتجات" },
      categories: { title: "تسوّق حسب الفئة", subtitle: "" },
      products: { title: "منتجات مختارة", subtitle: "" },
      ads: { title: "إعلان ممول", subtitle: "" },
      text: { title: "نص جديد", subtitle: "أضف وصفًا مختصرًا" },
      image: { title: "صورة", subtitle: "" },
      sticker: { title: "✨ جديد", subtitle: "" },
      spacer: { title: "", subtitle: "" },
    };
    var d = defaults[type] || { title: "بلوك جديد", subtitle: "" };
    return {
      id: uid(type),
      type: type,
      name: (TYPES[type] && TYPES[type].name) || "بلوك",
      visible: true,
      device: "all",
      style: {
        background: "#ffffff", color: "#101828", gradient: false,
        border: "1px solid #eef2f7", radius: "14px", padding: "18px", margin: "0 0 12px",
        width: "100%", height: "", align: "center", fontFamily: "Cairo",
        fontSize: "18px", fontWeight: "700", letterSpacing: "0px", shadow: "",
      },
      text: { title: d.title, subtitle: d.subtitle, perLetter: [] },
      images: [],
      items: [],
      productLayout: {
        mode: "auto", category: "", cols: 4, cardSize: "md",
        cardBg: "#ffffff", cardColor: "#101828", cardRadius: "14px",
        show: { image: true, name: true, price: true, oldPrice: true, discount: true, rating: true, badge: true, button: true },
      },
      ad: { startAt: "", endAt: "", power: 5, position: "top", trigger: "always", link: "#", badge: "مدفوع" },
      source: null,
      anim: makeAnim(),
    };
  }

  function syncLetters(block) {
    if (!block || !block.text) return;
    var chars = Array.from(String(block.text.title || ""));
    var old = Array.isArray(block.text.perLetter) ? block.text.perLetter : [];
    block.text.perLetter = chars.map(function (char, i) {
      return { char: char, color: old[i] && old[i].color ? old[i].color : (block.style && block.style.color) || "#101828" };
    });
  }

  function normalizeDoc(doc) {
    var out = freshDoc();
    if (!doc || typeof doc !== "object") return out;
    out.version = num(doc.version, 1);
    if (doc.theme && typeof doc.theme === "object") {
      Object.keys(out.theme).forEach(function (k) {
        if (doc.theme[k] != null) out.theme[k] = doc.theme[k];
      });
    }
    var blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    out.blocks = blocks.filter(Boolean).map(function (raw) {
      var base = makeBlock(raw.type && TYPES[raw.type] ? raw.type : "text");
      Object.keys(base).forEach(function (k) {
        if (raw[k] == null) return;
        if (k === "style" || k === "text" || k === "productLayout" || k === "ad" || k === "anim") {
          base[k] = Object.assign({}, base[k], raw[k]);
          if (k === "productLayout") base[k].show = Object.assign({}, base.productLayout.show, (raw[k] && raw[k].show) || {});
        } else {
          base[k] = raw[k];
        }
      });
      var texts = Array.isArray(base.text.perLetter) ? base.text.perLetter : [];
      if (!texts.length && base.text.title) syncLetters(base);
      base.images = Array.isArray(base.images) ? base.images.map(function (im) {
        return Object.assign(makeImage(im && im.url), im || {}, { anim: Object.assign(makeAnim(), (im && im.anim) || {}) });
      }) : [];
      base.items = Array.isArray(base.items) ? base.items : [];
      return base;
    });
    return out;
  }

  function getSelected() {
    return state.doc.blocks.find(function (b) { return b && b.id === state.selectedId; }) || null;
  }
  function currentImage() {
    var b = getSelected();
    return b && b.images[state.imageIndex] ? b.images[state.imageIndex] : null;
  }
  function currentAnim() {
    var b = getSelected();
    if (!b) return makeAnim();
    if (state.animTarget !== "block" && state.animTarget.indexOf("img:") === 0) {
      var idx = num(state.animTarget.slice(4), -1);
      if (b.images[idx] && b.images[idx].anim) return b.images[idx].anim;
    }
    if (!b.anim) b.anim = makeAnim();
    return b.anim;
  }

  /* ---------------- history / activity / status ---------------- */
  function pushUndo(entry) {
    state.undo.push(entry);
    if (state.undo.length > 60) state.undo.shift();
    state.redo = [];
  }
  function mutate(label, fn) {
    pushUndo({ doc: clone(state.doc), label: label });
    fn();
    markDirty();
    renderAll();
    addLog("edit", label);
  }
  function undo() {
    if (!state.undo.length) { toast("لا يوجد تراجع متاح", "info"); return; }
    state.redo.push({ doc: clone(state.doc), name: state.name, label: "الحالة الحالية" });
    var entry = state.undo.pop();
    state.doc = normalizeDoc(entry.doc);
    if (typeof entry.name === "string") state.name = entry.name;
    var nameEl = $("#hsDocName");
    if (nameEl) nameEl.value = state.name;
    markDirty();
    renderAll();
    addLog("edit", "تراجع: " + entry.label);
  }
  function redo() {
    if (!state.redo.length) { toast("لا يوجد إعادة متاحة", "info"); return; }
    state.undo.push({ doc: clone(state.doc), name: state.name, label: "الحالة الحالية" });
    var entry = state.redo.pop();
    state.doc = normalizeDoc(entry.doc);
    if (typeof entry.name === "string") state.name = entry.name;
    var nameEl = $("#hsDocName");
    if (nameEl) nameEl.value = state.name;
    markDirty();
    renderAll();
    addLog("edit", "إعادة: " + entry.label);
  }

  function setStatus(kind, text) {
    var el = $("#hsStatus");
    if (!el) return;
    el.setAttribute("data-state", kind);
    el.innerHTML = '<i class="fa-solid ' +
      (kind === "published" ? "fa-circle-check" : kind === "unsaved" ? "fa-circle" : kind === "error" ? "fa-circle-exclamation" : "fa-check") +
      '"></i> ' + esc(text || "");
  }
  function refreshStatus() {
    if (state.dirty) setStatus("unsaved", "تعديلات غير محفوظة");
    else if (state.published) setStatus("published", "منشور");
    else setStatus("saved", "محفوظ");
  }
  function markDirty() { state.dirty = true; refreshStatus(); scheduleAutosave(); }

  function addLog(kind, text) {
    state.log.unshift({ at: new Date().toISOString(), kind: kind, text: String(text || "") });
    if (state.log.length > 200) state.log.length = 200;
    renderLog();
    try { localStorage.setItem(LS_LOG, JSON.stringify(state.log.slice(0, 100))); } catch (_e) {}
  }
  function renderLog() {
    var el = $("#hsLog");
    if (!el) return;
    if (!state.log.length) {
      el.innerHTML = '<li class="hs-log-empty">لا يوجد نشاط بعد. أضف بلوكاً أو ابدأ بالمزامنة.</li>';
    } else {
      el.innerHTML = state.log.map(function (item) {
        var d = new Date(item.at);
        var time = isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        return '<li data-kind="' + esc(item.kind) + '"><time>' + esc(time) + "</time><span>" + esc(item.text) + "</span></li>";
      }).join("");
    }
    var count = $("#hsLogCount");
    if (count) count.textContent = String(state.log.length);
  }

  function toast(message, kind) {
    var box = $("#hsToasts");
    if (!box) return;
    var el = document.createElement("div");
    el.className = "hs-toast " + (kind || "info");
    var icon = kind === "success" ? "fa-circle-check" : kind === "error" ? "fa-circle-exclamation" : "fa-circle-info";
    el.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + esc(message) + "</span>";
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  function scopeKey(base) { return base + "_" + state.country + "_" + (state.device || "all"); }
  function docKey() { return scopeKey(LS_DOC); }
  function metaKey() { return scopeKey(LS_META); }

  function flushAutosave() {
    clearTimeout(state.saveTimer);
    try {
      localStorage.setItem(docKey(), JSON.stringify(state.doc));
      localStorage.setItem(metaKey(), JSON.stringify({
        country: state.country, device: state.device, name: state.name,
        dirty: state.dirty, published: state.published, serverVersion: state.serverVersion,
      }));
    } catch (_e) { /* storage may be disabled */ }
  }

  function scheduleAutosave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(flushAutosave, 400);
  }

  /* ---------------- supabase ---------------- */
  function initClient() {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      toast("مكتبة Supabase غير محملة", "error");
      return null;
    }
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (err) {
      toast("تعذر تهيئة Supabase: " + (err && err.message ? err.message : err), "error");
    }
    return sb;
  }

  function isMissingColumn(error) {
    var text = String((error && (error.message || error.details || error.hint)) || error || "");
    return /device/i.test(text) && /(column|exist|cache|42703|PGRST204)/i.test(text);
  }

  async function selectRows(table, sectionId, device) {
    var base = function () { return sb.from(table).select("*").eq("section_id", sectionId); };
    if (device && device !== "all") {
      try {
        var filtered = await base().eq("device", device).order("sort_order");
        if (!filtered.error) return filtered.data || [];
        if (!isMissingColumn(filtered.error)) console.warn("[HS] device filter on " + table + ":", filtered.error);
      } catch (err) {
        if (!isMissingColumn(err)) console.warn("[HS] device filter on " + table + ":", err);
      }
    }
    var plain = await base().order("sort_order");
    if (plain.error) throw plain.error;
    return plain.data || [];
  }

  function rowImage(row) {
    if (!row) return "";
    return String(row.image_url || row.image || row.url || (Array.isArray(row.images) && row.images[0]) || "");
  }
  function productImage(row) {
    if (!row) return "";
    var img = row.image || row.image_url || row.thumbnail || row.photo ||
      (Array.isArray(row.images) && row.images[0]) ||
      (row.raw_data && (row.raw_data.image || row.raw_data.image_url)) || "";
    if (window.BudaStore && typeof window.BudaStore.getImagePath === "function") {
      try { return window.BudaStore.getImagePath(img); } catch (_e) { return img; }
    }
    return img;
  }

  function applyServerRows(block, table, rows) {
    var changed = 0;
    if (!Array.isArray(rows)) return 0;
    if (table === "home_categories" || table === "home_mega_products") {
      rows.forEach(function (row) {
        var id = String(row.id || row.product_id || "");
        var item = block.items.find(function (it) { return it && String(it.rowId || it.id) === id; });
        var data;
        if (table === "home_mega_products") {
          var pid = String(row.product_id || id);
          var known = (state.autoProducts || []).find(function (p) { return String(p && (p.id || p.product_id)) === pid; });
          data = known
            ? { id: pid, name: known.name || known.title || row.name || ("منتج " + pid), image: productImage(known), price: known.price != null ? known.price : known.selling_price, source: known.source || "taager_products" }
            : { id: pid, name: row.name || row.product_name || ("منتج " + pid), image: productImage(row), price: row.price, source: "taager_products" };
        } else {
          data = { id: id, name: String(row.name || "فئة"), image: rowImage(row), link: row.link_url || "#" };
        }
        data.rowId = id;
        if (!item) { block.items.push(data); changed++; }
        else {
          Object.keys(data).forEach(function (k) {
            if (k !== "rowId" && item[k] !== data[k]) { item[k] = data[k]; changed++; }
          });
        }
      });
      return changed;
    }
    rows.forEach(function (row, index) {
      var id = String(row.id || row.product_id || ("row_" + index));
      var url = rowImage(row);
      var image = block.images.find(function (im) { return im && String(im.sourceRowId || "") === id; });
      // Metadata must survive even when the server row has no image yet.
      if (url) {
        if (!image) {
          image = makeImage(url);
          image.sourceRowId = id;
          block.images.push(image);
          changed++;
        } else if (image.url !== url) {
          image.url = url;
          changed++;
        }
      }
      if (table === "home_ad_banners") {
        if (row.link_url) block.ad.link = row.link_url;
        if (row.badge_text) block.ad.badge = row.badge_text;
        if (/^(top|middle|bottom|inline)$/.test(String(row.position || row.ad_position || ""))) {
          block.ad.position = String(row.position || row.ad_position);
        }
        if (!block.text.title || block.text.title === "إعلان ممول") block.text.title = row.title || "إعلان ممول";
      }
      if (table === "home_banners") {
        // Banner appearance lives in the server row; keep it when importing the
        // live site so the studio canvas matches the storefront.
        if (row.background_color) block.style.background = row.background_color;
        if (row.text_color) block.style.color = row.text_color;
        if (row.border_color) block.style.border = "1px solid " + row.border_color;
      }
      if (table === "home_banners" || table === "home_mega_banners") {
        if (row.heading && (!block.text.title || block.text.title.indexOf("بانر") === 0)) block.text.title = row.heading;
        if (row.subtext && !block.text.subtitle) block.text.subtitle = row.subtext;
        if (row.title && (!block.text.title || block.text.title.indexOf("بانر") === 0)) block.text.title = row.title;
        if (row.subtitle && !block.text.subtitle) block.text.subtitle = row.subtitle;
      }
    });
    if (changed && block.text.perLetter.length !== Array.from(String(block.text.title || "")).length) syncLetters(block);
    return changed;
  }

  var SYNC_MAP = [
    { sectionTypes: ["hero"], table: "home_hero_slides", blockType: "hero", name: "هيرو من السيرفر" },
    { sectionTypes: ["categories"], table: "home_categories", blockType: "categories", name: "فئات من السيرفر" },
    { sectionTypes: ["banner_top"], table: "home_banners", blockType: "banner", name: "بانر من السيرفر" },
    { sectionTypes: ["mega_offers"], table: "home_mega_banners", blockType: "banner", name: "عروض من السيرفر" },
    { sectionTypes: ["mega_offers"], table: "home_mega_products", blockType: "products", name: "منتجات العروض" },
    { sectionTypes: ["ad_banners"], table: "home_ad_banners", blockType: "ads", name: "إعلانات من السيرفر" },
  ];

  function rowFitsDevice(row, device) {
    var d = String((row && row.device) || "all");
    return d === "all" || d === device;
  }

  async function syncFromServer() {
    if (!sb) { toast("لا يوجد اتصال بالسيرفر", "error"); return; }
    var btn = $("#hsBtnSync");
    if (btn) btn.disabled = true;
    try {
      // Having the product catalogue ready lets mega-offer rows hydrate real names/images.
      await loadAutoProducts();

      // First import the layout visitors actually see. The published snapshot is
      // the source of truth; only when it doesn't exist do we rebuild from tables.
      var imported = false;
      try {
        var liveDoc = await fetchPublishedSiteDoc();
        if (liveDoc && JSON.stringify(liveDoc) !== JSON.stringify(state.doc)) {
          pushUndo({ doc: clone(state.doc), label: "قبل استيراد الموقع المنشور" });
          state.doc = liveDoc;
          state.selectedId = null;
          state.dirty = true;
          imported = true;
        }
      } catch (importErr) { console.warn("[HS] published layout import skipped:", importErr); }

      var secRes = await sb.from("home_page_sections").select("*").eq("country", state.country).eq("is_active", true).order("sort_order");
      if (secRes.error) secRes = await sb.from("home_page_sections").select("*").eq("country", state.country).order("sort_order");
      if (secRes.error) throw secRes.error;
      var sections = secRes.data || [];
      var before = clone(state.doc);
      var added = 0, updated = 0;
      for (var si = 0; si < sections.length; si++) {
        var sec = sections[si];
        for (var mi = 0; mi < SYNC_MAP.length; mi++) {
          var map = SYNC_MAP[mi];
          if (map.sectionTypes.indexOf(String(sec.section_type || "")) === -1) continue;
          var rows;
          try { rows = await selectRows(map.table, sec.id, "all"); }
          catch (err) { console.warn("[HS] skip " + map.table + ":", err); continue; }
          var hasDevice = rows.some(function (r) { return !!r.device; });
          var bundles = [];
          if (state.device === "all" && hasDevice) {
            var mobileRows = rows.filter(function (r) { return rowFitsDevice(r, "mobile"); });
            var desktopRows = rows.filter(function (r) { return rowFitsDevice(r, "desktop"); });
            if (mobileRows.length) bundles.push({ device: "mobile", rows: mobileRows });
            if (desktopRows.length) bundles.push({ device: "desktop", rows: desktopRows });
          } else {
            var device = hasDevice ? state.device : "all";
            bundles.push({ device: device, rows: hasDevice ? rows.filter(function (r) { return rowFitsDevice(r, device); }) : rows });
          }
          for (var bi = 0; bi < bundles.length; bi++) {
            var bundle = bundles[bi];
            if (!bundle.rows.length) continue;
            var key = String(sec.id || "");
            var block = state.doc.blocks.find(function (b) {
              return b && b.source && b.source.table === map.table &&
                String(b.source.sectionId || "") === key && b.source.sectionType === sec.section_type &&
                String(b.source.device || "all") === bundle.device;
            });
            if (!block) {
              block = makeBlock(map.blockType);
              block.name = map.name + (bundle.device === "all" ? "" : " · " + (bundle.device === "mobile" ? "موبايل" : "ديسكتوب"));
              block.device = bundle.device;
              block.source = {
                table: map.table, sectionType: sec.section_type, sectionId: key,
                rowId: key, device: bundle.device, sectionOrder: num(sec.sort_order, 999),
              };
              state.doc.blocks.push(block);
              added++;
            }
            if (block.source) {
              block.source.device = bundle.device;
              block.source.sectionOrder = num(sec.sort_order, 999);
            }
            block.device = bundle.device;
            updated += applyServerRows(block, map.table, bundle.rows);
          }
        }
      }
      if (!imported && JSON.stringify(before) !== JSON.stringify(state.doc)) {
        pushUndo({ doc: before, label: "مزامنة من السيرفر" });
        // With no published layout, order blocks by the real section order.
        state.doc.blocks = state.doc.blocks.map(function (b, i) { return { b: b, i: i }; })
          .sort(function (a, b) {
            var ao = a.b.source ? num(a.b.source.sectionOrder, 999) : 999;
            var bo = b.b.source ? num(b.b.source.sectionOrder, 999) : 999;
            return ao - bo || a.i - b.i;
          }).map(function (x) { return x.b; });
      }
      if (imported || JSON.stringify(before) !== JSON.stringify(state.doc)) markDirty();
      renderAll();
      var msg = (imported ? "تم استيراد شكل الموقع المنشور" : "تمت المزامنة من جداول الموقع") +
        ": " + added + " بلوك جديد، " + updated + " صورة/عنصر محدث";
      addLog("sync", msg);
      toast(msg, "success");
    } catch (err) {
      var message = (err && err.message) ? err.message : String(err);
      addLog("error", "فشل المزامنة: " + message);
      toast("فشل المزامنة: " + message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function loadAutoProducts() {
    if (!sb) return [];
    var out = [];
    var tables = ["taager_products", "partner_products"];
    for (var i = 0; i < tables.length; i++) {
      try {
        var res = await sb.from(tables[i]).select("*").limit(24);
        if (!res.error && Array.isArray(res.data)) out = out.concat(res.data);
      } catch (_e) { /* optional table */ }
    }
    var seen = {};
    state.autoProducts = out.filter(function (p) {
      var key = String(p && p.id || "");
      if (!key || seen[key]) return false;
      seen[key] = 1;
      return true;
    }).slice(0, 36);
    return state.autoProducts;
  }

  function getProducts() {
    if (window.HM && Array.isArray(window.HM.allProducts) && window.HM.allProducts.length) return window.HM.allProducts;
    if (window.BudaStore && typeof window.BudaStore.getAllProducts === "function") {
      var all = window.BudaStore.getAllProducts();
      var arr = Array.isArray(all) ? all : Object.values(all || {});
      if (arr.length) return arr.filter(Boolean);
    }
    return state.autoProducts;
  }

  async function persist(publish) {
    if (!sb) { toast("لا يوجد اتصال بالسيرفر", "error"); return; }
    if (state.busy) return;
    state.busy = true;
    var scope = state.device === "all" ? "all" : state.device;
    try {
      var existingRes = await sb.from("home_studio_docs")
        .select("id,version,is_published,published_doc,doc").eq("country", state.country).eq("scope", scope).maybeSingle();
      if (existingRes.error && existingRes.error.code !== "PGRST116") throw existingRes.error;
      var existing = existingRes.data || null;
      var version = num(existing && existing.version, 0) + 1;
      var payload = {
        country: state.country,
        scope: scope,
        name: state.name || "الصفحة الرئيسية",
        doc: clone(state.doc),
        // A draft save must never change what visitors see. The live snapshot is
        // updated only by Publish; drafts stay in `doc` for the studio to reload.
        // Legacy rows may be published without a snapshot; freeze the server doc
        // so a draft save never changes what visitors see.
        published_doc: publish ? clone(state.doc) : ((existing && existing.published_doc) ||
          (existing && existing.is_published && existing.doc ? clone(existing.doc) : null)),
        is_published: publish ? true : !!(existing && existing.is_published),
        version: version,
        updated_by: "admin@example.com",
        updated_at: new Date().toISOString(),
      };
      var res = await sb.from("home_studio_docs").upsert(payload, { onConflict: "country,scope" }).select("id").single();
      if (res.error) throw res.error;
      try {
        await sb.from("home_studio_log").insert({
          doc_id: res.data && res.data.id ? res.data.id : null,
          country: state.country,
          scope: scope,
          action: publish ? "publish" : "save",
          detail: { name: payload.name, version: version, blocks: state.doc.blocks.length },
        });
      } catch (logErr) { console.warn("[HS] log insert failed:", logErr); }
      state.serverVersion = version;
      state.dirty = false;
      state.published = payload.is_published;
      refreshStatus();
      scheduleAutosave();
      var label = publish ? "تم نشر الصفحة (" + scope + ") — الإصدار " + version : "تم حفظ المسودة (" + scope + ") — الإصدار " + version;
      addLog(publish ? "publish" : "save", label);
      toast(label, "success");
    } catch (err) {
      var message = (err && err.message) ? err.message : String(err);
      setStatus("error", "فشل الحفظ");
      addLog("error", "فشل الحفظ/النشر: " + message);
      toast("فشل الحفظ: " + message, "error");
    } finally {
      state.busy = false;
    }
  }

  async function loadInitial(options) {
    options = options || {};
    try {
      var legacy = state.country === "EG" && state.device === "all";
      var raw = localStorage.getItem(docKey()) || (legacy ? localStorage.getItem(LS_DOC) : null);
      // When a device scope is opened for the first time, seed it from the
      // "all" layout instead of starting empty. From then on mobile and
      // desktop are edited and saved independently.
      var copiedAll = false;
      if (!raw && state.device !== "all") {
        raw = localStorage.getItem(LS_DOC + "_" + state.country + "_all");
        if (!raw && state.country === "EG") raw = localStorage.getItem(LS_DOC);
        copiedAll = !!raw;
      }
      var meta = {};
      try {
        meta = JSON.parse(localStorage.getItem(metaKey()) || (legacy ? localStorage.getItem(LS_META) : "{}") || "{}") || {};
      } catch (_e) {}
      if (!options.keepDevice && ["all", "mobile", "desktop"].indexOf(meta.device) >= 0) state.device = meta.device;
      if (!options.keepName && meta.name) state.name = meta.name;
      state.doc = raw ? normalizeDoc(JSON.parse(raw)) : freshDoc();
      state.dirty = !!meta.dirty;
      state.published = !!meta.published;
      state.serverVersion = num(meta.serverVersion, 0);
      try {
        var logRaw = JSON.parse(localStorage.getItem(LS_LOG) || "[]");
        if (Array.isArray(logRaw)) state.log = logRaw.slice(0, 100);
      } catch (_e) {}
    } catch (_e) { /* bad local data */ }

    if (sb) {
      var scope = state.device === "all" ? "all" : state.device;
      try {
        var row = await fetchDocRow(scope);
        var usedFallback = false;
        // The live storefront falls back to the "all" row when no device-specific
        // published row exists. The studio must open the same document.
        if (!row && scope !== "all") { row = await fetchDocRow("all"); usedFallback = !!row; }
        var serverDoc = row && (row.doc || row.published_doc);
        if (serverDoc && (!state.dirty || num(row.version, 0) > state.serverVersion || !raw)) {
          copiedAll = false;
          state.doc = normalizeDoc(serverDoc);
          if (row.name) state.name = row.name;
          state.serverVersion = num(row.version, 0);
          state.published = !!row.is_published;
          state.dirty = false;
          addLog("sync", "تم تحميل " + (usedFallback ? "تخطيط المتجر (كل الأجهزة)" : "المستند المحفوظ") +
            " من السيرفر — الإصدار " + state.serverVersion);
        }
      } catch (err) { console.warn("[HS] initial server load skipped:", err); }
    }
    if (copiedAll) addLog("sync", "تم نسخ التصميم من عرض كل الأجهزة إلى " +
      (state.device === "mobile" ? "الموبايل" : "الديسكتوب") + " — يمكنك تعديله بشكل مستقل");
  }

  async function fetchDocRow(scope) {
    if (!sb) return null;
    var res = await sb.from("home_studio_docs")
      .select("country,scope,name,doc,published_doc,version,is_published")
      .eq("country", state.country).eq("scope", scope).maybeSingle();
    if (res.error && res.error.code !== "PGRST116") throw res.error;
    return res.data || null;
  }

  async function fetchPublishedSiteDoc() {
    if (!sb) return null;
    var res = await sb.from("home_studio_docs")
      .select("scope,doc,published_doc,name,version")
      .eq("country", state.country).eq("is_published", true);
    if (res.error) throw res.error;
    var rows = Array.isArray(res.data) ? res.data : [];
    if (!rows.length) return null;
    var scope = state.device === "all" ? "all" : state.device;
    var row = rows.find(function (r) { return r && r.scope === scope; }) ||
      rows.find(function (r) { return r && r.scope === "all"; });
    if (!row) return null;
    var live = row.published_doc || row.doc;
    return live && typeof live === "object" ? normalizeDoc(live) : null;
  }

  /* ---------------- renderers ---------------- */
  function animStyle(anim) {
    if (!anim || !anim.type || anim.type === "none") return "";
    var type = /^(float|rocket|fade|slide|pulse)$/.test(anim.type) ? anim.type : "fade";
    var power = Math.max(1, Math.min(20, num(anim.power, 4)));
    var delay = Math.max(0, num(anim.delay, 0));
    var duration = Math.max(0.1, num(anim.duration, 1.2));
    var repeat = anim.repeat == null || anim.repeat === "" ? "infinite" : /^(infinite|\d+)$/.test(String(anim.repeat)) ? String(anim.repeat) : "infinite";
    return "--hs-power:" + power + ";animation:hs-" + type + " " + duration + "s ease-in-out " + delay + "s " + repeat + ";";
  }
  function blockStyle(block, opts) {
    var s = block.style || {};
    var pieces = [];
    if (s.gradient) pieces.push("background:linear-gradient(135deg,#7c3aed,#22d3ee)");
    else if (s.background) pieces.push("background:" + safeCss(s.background));
    if (s.color) pieces.push("color:" + safeCss(s.color));
    if (s.border) pieces.push("border:" + safeCss(s.border));
    if (s.radius) pieces.push("border-radius:" + safeCss(s.radius));
    if (s.padding) pieces.push("padding:" + safeCss(s.padding));
    if (s.margin) pieces.push("margin:" + safeCss(s.margin));
    if (s.width) pieces.push("width:" + safeCss(s.width));
    if (s.height) pieces.push("height:" + safeCss(s.height));
    if (s.fontFamily) pieces.push("font-family:'" + safeCss(s.fontFamily).replace(/'/g, "") + "',sans-serif");
    if (s.fontSize) pieces.push("font-size:" + safeCss(s.fontSize));
    if (s.fontWeight) pieces.push("font-weight:" + safeCss(s.fontWeight));
    if (s.letterSpacing) pieces.push("letter-spacing:" + safeCss(s.letterSpacing));
    if (s.shadow) pieces.push("box-shadow:" + safeCss(s.shadow));
    if (s.align) pieces.push("text-align:" + (/^(center|right|left)$/.test(s.align) ? s.align : "center"));
    if (opts && opts.animate === false) pieces.push("animation:none!important");
    else pieces.push(animStyle(block.anim));
    return pieces.filter(Boolean).join(";");
  }
  function imageStyle(img, opts) {
    var pieces = [
      "position:absolute", "display:block",
      "left:" + num(img.x, 50) + "%", "top:" + num(img.y, 50) + "%",
      "width:" + num(img.w, 100) + "%", "height:" + num(img.h, 100) + "%",
      "object-fit:cover",
      "object-position:" + num(img.cropX, 50) + "% " + num(img.cropY, 50) + "%",
      "transform:scale(" + Math.max(1, num(img.zoom, 1)) + ")",
      "border-radius:" + safeCss(img.radius || "0px"),
      "opacity:" + num(img.opacity, 1), "z-index:" + num(img.z, 1),
    ];
    if (opts && opts.animate === false) pieces.push("animation:none!important");
    else pieces.push(animStyle(img.anim));
    return pieces.filter(Boolean).join(";");
  }
  function lettersHTML(block, text) {
    var chars = Array.from(String(text || ""));
    var colors = (block.text && block.text.perLetter) || [];
    return chars.map(function (ch, i) {
      var color = colors[i] && colors[i].color ? safeCss(colors[i].color) : safeCss((block.style && block.style.color) || "#101828");
      return '<span style="color:' + color + '">' + esc(ch) + "</span>";
    }).join("");
  }
  function adActive(block) {
    if (block.type !== "ads") return true;
    var ad = block.ad || {};
    var now = Date.now();
    if (ad.startAt && new Date(ad.startAt).getTime() > now) return false;
    if (ad.endAt && new Date(ad.endAt).getTime() < now) return false;
    return true;
  }
  function deviceAllowed(block, device) {
    var d = block.device || "all";
    return d === "all" || !device || device === "all" || d === device;
  }
  function productsFor(block, products) {
    var pl = block.productLayout || {};
    if (pl.mode === "manual" && block.items && block.items.length) return block.items.slice(0, 40);
    var arr = Array.isArray(products) ? products.slice() : [];
    var cat = String(pl.category || "").trim().toLowerCase();
    if (cat) {
      arr = arr.filter(function (p) {
        return [p.category, p.category_name, p.categoryName, p.section, p.tag].some(function (v) {
          return String(v || "").toLowerCase().indexOf(cat) >= 0;
        });
      });
    }
    var cols = Math.max(1, Math.min(8, num(pl.cols, 4)));
    return arr.slice(0, Math.max(8, cols * 3));
  }
  function money(value) {
    var n = num(value, 0);
    if (window.BudaStore && typeof window.BudaStore.formatMoney === "function") {
      try { return window.BudaStore.formatMoney(n); } catch (_e) {}
    }
    return n.toFixed(2).replace(/\.00$/, "");
  }
  function productCardsHTML(block, products) {
    var pl = block.productLayout || {};
    var show = pl.show || {};
    var list = productsFor(block, products);
    if (!list.length) return '<div class="hs-view-empty">لا توجد منتجات لعرضها</div>';
    var cols = Math.max(1, Math.min(8, num(pl.cols, 4)));
    var cardStyle = "background:" + safeCss(pl.cardBg || "#fff") + ";color:" + safeCss(pl.cardColor || "#101828") +
      ";border-radius:" + safeCss(pl.cardRadius || "14px") + ";padding:10px;box-shadow:0 4px 14px rgba(15,23,42,.07)";
    var size = pl.cardSize === "sm" ? "130px" : pl.cardSize === "lg" ? "230px" : "175px";
    return '<div class="hs-view-product-grid" style="display:grid;grid-template-columns:repeat(' + cols +
      ',minmax(0,1fr));gap:10px">' + list.map(function (p) {
      if (!p) return "";
      var img = productImage(p);
      var price = p.price != null ? p.price : p.selling_price;
      var old = p.oldPrice || p.old_price || p.original_price || p.compare_at_price;
      var discount = "";
      if (show.discount && num(old, 0) > num(price, 0) && num(old, 0) > 0) {
        discount = Math.round((1 - num(price, 0) / num(old, 0)) * 100) + "%";
      }
      return '<article class="hs-view-card" style="' + cardStyle + ';max-width:' + size + '">' +
        (show.image ? '<img src="' + esc(img) + '" alt="' + esc(p.name || "") + '" style="width:100%;height:' + size +
          ';object-fit:cover;border-radius:8px;background:#eef2f7" loading="lazy" />' : "") +
        (show.badge && (p.badge || p.tag) ? '<span style="display:inline-block;font-size:10px;color:#7c3aed;font-weight:800">' + esc(p.badge || p.tag) + "</span>" : "") +
        (discount ? '<span style="display:inline-block;font-size:10px;color:#dc2626;font-weight:800">' + esc(discount) + "</span>" : "") +
        (show.name ? '<h4 style="margin:6px 0;font-size:12px;line-height:1.5">' + esc(p.name || p.title || "") + "</h4>" : "") +
        (show.price ? '<strong style="color:' + safeCss(pl.cardColor || "#101828") + '">' + esc(money(price)) + "</strong> " : "") +
        (show.oldPrice && num(old, 0) > num(price, 0) ? '<small style="text-decoration:line-through;color:#94a3b8">' + esc(money(old)) + "</small>" : "") +
        (show.rating && num(p.rating, 0) > 0 ? '<div style="font-size:11px;color:#f59e0b">★ ' + esc(num(p.rating, 0).toFixed(1)) + "</div>" : "") +
        (show.button ? '<div style="margin-top:8px;padding:6px;border-radius:8px;background:#7c3aed;color:#fff;font-size:11px;font-weight:800;text-align:center">تسوق الآن</div>' : "") +
        "</article>";
    }).join("") + "</div>";
  }
  function itemsHTML(block) {
    var items = Array.isArray(block.items) ? block.items.slice(0, 24) : [];
    if (!items.length) return '<div class="hs-view-empty">أضف عناصر من تبويب المنتجات</div>';
    return '<div class="hs-view-items" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px">' +
      items.map(function (item) {
        var img = productImage(item);
        return '<span style="text-decoration:none;color:inherit;text-align:center">' +
          (img ? '<img src="' + esc(img) + '" alt="' + esc(item.name || "") + '" style="width:100%;height:90px;object-fit:cover;border-radius:10px;background:#eef2f7" loading="lazy" />' : "") +
          '<span style="display:block;font-size:11px;font-weight:700;margin-top:5px">' + esc(item.name || "") + "</span></span>";
      }).join("") + "</div>";
  }

  // Small local renderer — used by the studio canvas and as preview fallback.
  function renderFallback(el, doc, products, opts) {
    if (!el || !doc) return;
    opts = opts || {};
    var theme = doc.theme || {};
    var device = opts.device || "all";
    var blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    var html = '<div class="hs-view-root" style="background:' + safeCss(theme.bg || "#fff") + ";color:" +
      safeCss(theme.text || "#101828") + ";font-family:'" + safeCss(theme.fontFamily || "Cairo").replace(/'/g, "") +
      "',sans-serif;max-width:" + safeCss(theme.pageWidth || "100%") + ';margin:auto">';
    blocks.forEach(function (b) {
      if (!b || b.visible === false || !deviceAllowed(b, device) || (!opts.studio && !adActive(b))) return;
      var body = "";
      if (b.type === "products") body = productCardsHTML(b, products);
      else if (b.type === "categories") body = itemsHTML(b);
      else if (b.type === "spacer") body = '<div style="height:' + safeCss((b.style && b.style.height) || "40px") + '"></div>';
      else {
        var title = b.text && b.text.title ? lettersHTML(b, b.text.title) : "";
        var subtitle = b.text && b.text.subtitle ? esc(b.text.subtitle) : "";
        body = (title ? '<h3 style="margin:0 0 6px;font-size:' + safeCss((b.style && b.style.fontSize) || "18px") + '">' + title + "</h3>" : "") +
          (subtitle ? '<p style="margin:0;font-size:12px;opacity:.82">' + subtitle + "</p>" : "");
      }
      var imageHTML = (b.images || []).map(function (im) {
        return im && im.url ? '<img src="' + esc(im.url) + '" alt="" style="' + imageStyle(im, opts) + '" />' : "";
      }).join("");
      html += '<section class="hs-view-block" data-hs-block="' + esc(b.id) + '" style="position:relative;overflow:hidden;' +
        blockStyle(b, opts) + '">' + imageHTML +
        (b.type === "ads" && b.ad && b.ad.badge ? '<span style="position:absolute;top:6px;right:6px;z-index:9;background:rgba(0,0,0,.6);color:#fff;padding:2px 7px;border-radius:99px;font-size:9px">' + esc(b.ad.badge) + "</span>" : "") +
      (b.type === "ads" && b.ad && b.ad.link && b.ad.link !== "#" ? '<span style="position:absolute;inset:0;z-index:3"></span>' : "") +
        '<div style="position:relative;z-index:2">' + body + "</div></section>";
    });
    html += "</div>";
    el.innerHTML = html;
  }

  function injectKeyframes() {
    if (document.getElementById("hs-studio-anim")) return;
    var style = document.createElement("style");
    style.id = "hs-studio-anim";
    style.textContent = KEYFRAMES;
    document.head.appendChild(style);
  }

  function decorateCanvas() {
    var canvas = $("#hsCanvas");
    if (!canvas) return;
    $$("[data-hs-block]", canvas).forEach(function (node) {
      var id = node.getAttribute("data-hs-block");
      node.setAttribute("data-block-id", id);
      node.classList.add("hs-canvas-block");
      if (id === state.selectedId) {
        node.classList.add("selected");
        var hasHandle = Array.prototype.some.call(node.children, function (child) {
          return child.classList && child.classList.contains("hs-canvas-handle");
        });
        if (!hasHandle) {
          var handle = document.createElement("span");
          handle.className = "hs-canvas-handle";
          handle.textContent = (TYPES[(getSelected() || {}).type] && TYPES[getSelected().type].name) || "Element";
          node.appendChild(handle);
        }
        if (state.scrollToSelected) {
          node.scrollIntoView({ block: "nearest" });
          state.scrollToSelected = false;
        }
      }
    });
  }

  function paintCanvas() {
    var canvas = $("#hsCanvas");
    if (!canvas) return;
    var frame = $("#hsFrame");
    var device = viewDevice();
    if (frame) frame.classList.toggle("desktop", device === "desktop");
    var empty = $("#hsEmpty");
    if (empty) empty.hidden = state.doc.blocks.length > 0;
    if (frame) frame.hidden = state.doc.blocks.length === 0;
    if (!state.doc.blocks.length) { canvas.innerHTML = ""; return; }
    var opts = { device: device, animate: state.animate, studio: true };
    var render = window.HSView && typeof window.HSView.render === "function" ? window.HSView.render : renderFallback;
    try { render(canvas, state.doc, getProducts(), opts); }
    catch (err) { console.warn("[HS] renderer failed, using fallback:", err); renderFallback(canvas, state.doc, getProducts(), opts); }
    decorateCanvas();
  }

  /* ---------------- layers / inspector ---------------- */
  var ICON_FOR_TYPE = TYPES;
  function renderLayers() {
    var list = $("#hsLayers");
    if (!list) return;
    list.innerHTML = state.doc.blocks.map(function (b, i) {
      var t = ICON_FOR_TYPE[b.type] || TYPES.text;
      return '<li class="hs-layer' + (b.id === state.selectedId ? " selected" : "") +
        (b.visible === false ? " hidden-layer" : "") + '" draggable="true" data-id="' + esc(b.id) + '" tabindex="0">' +
        '<span class="hs-grip" title="اسحب للترتيب"><i class="fa-solid fa-grip-vertical"></i></span>' +
        '<span class="hs-layer-icon"><i class="fa-solid ' + esc(t.icon) + '"></i></span>' +
        '<span class="hs-layer-name">' + esc(b.name || t.name) + "</span>" +
        '<button type="button" class="hs-layer-act" data-act="eye" data-id="' + esc(b.id) + '" title="إظهار/إخفاء"><i class="fa-solid ' +
        (b.visible === false ? "fa-eye-slash" : "fa-eye") + '"></i></button>' +
        '<button type="button" class="hs-layer-act" data-act="dup" data-id="' + esc(b.id) + '" title="نسخ"><i class="fa-solid fa-copy"></i></button>' +
        '<button type="button" class="hs-layer-act del" data-act="del" data-id="' + esc(b.id) + '" title="حذف"><i class="fa-solid fa-trash"></i></button>' +
        "</li>";
    }).join("");
    var count = $("#hsLayerCount");
    if (count) count.textContent = String(state.doc.blocks.length);
  }

  function renderInspector() {
    var b = getSelected();
    var name = $("#hsSelectedName");
    if (name) name.textContent = b ? ((TYPES[b.type] && TYPES[b.type].name) + " · " + (b.name || b.id)) : "لا يوجد عنصر محدد";
    $$("[data-bind]").forEach(function (el) {
      var path = el.getAttribute("data-bind");
      var bindPath = path;
      var target = b || {};
      if (path.indexOf("anim.") === 0) { target = currentAnim(); bindPath = path.slice(5); }
      var value = getPath(target, bindPath);
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value == null ? "" : String(value);
      var out = $('[data-output="' + path + '"]');
      if (out) out.textContent = value == null ? "" : String(value);
    });
    var title = $("#hsTitle"), subtitle = $("#hsSubtitle");
    if (title) title.value = b && b.text ? String(b.text.title || "") : "";
    if (subtitle) subtitle.value = b && b.text ? String(b.text.subtitle || "") : "";
    renderLetterChips();
    renderImageList();
    renderProductChips();
    var targetSel = $("#hsAnimTarget");
    if (targetSel && b) {
      var options = '<option value="block">البلوك كاملاً</option>' + b.images.map(function (im, i) {
        return '<option value="img:' + i + '">صورة ' + (i + 1) + "</option>";
      }).join("");
      targetSel.innerHTML = options;
      targetSel.value = state.animTarget;
      if (targetSel.value !== state.animTarget) { state.animTarget = "block"; targetSel.value = "block"; }
    }
    var guard = !b;
    $$("#hsInspectorBody input, #hsInspectorBody select, #hsInspectorBody textarea, #hsInspectorBody button").forEach(function (el) {
      el.disabled = guard;
    });
  }

  function renderLetterChips() {
    var box = $("#hsLetterChips");
    if (!box) return;
    var b = getSelected();
    var chars = b && b.text ? Array.from(String(b.text.title || "")) : [];
    if (!chars.length) { box.innerHTML = '<span class="hs-hint">اكتب عنوانًا أولاً</span>'; return; }
    box.innerHTML = chars.map(function (ch, i) {
      var color = b.text.perLetter[i] && b.text.perLetter[i].color ? b.text.perLetter[i].color : "#101828";
      return '<label class="hs-letter-chip" title="حرف ' + (i + 1) + '"><b>' + esc(ch) + '</b><input type="color" data-letter="' + i + '" value="' + esc(color) + '" /></label>';
    }).join("");
  }

  function renderImageList() {
    var list = $("#hsImageList");
    if (!list) return;
    var b = getSelected();
    var images = b ? b.images : [];
    if (!images.length) { list.innerHTML = '<span class="hs-hint">لا توجد صور بعد</span>'; }
    else {
      list.innerHTML = images.map(function (im, i) {
        return '<div class="hs-image-row' + (i === state.imageIndex ? " active" : "") + '" data-img="' + i + '">' +
          '<img src="' + esc(im.url || "") + '" alt="" />' +
          '<em>#' + (i + 1) + "</em><span>" + esc((im.url || "بدون رابط").slice(0, 80)) + "</span></div>";
      }).join("");
    }
    var im = currentImage();
    var setVal = function (sel, value) { var el = $(sel); if (el && document.activeElement !== el) el.value = value; };
    setVal("#hsImgUrl", im ? im.url : "");
    setVal("#hsImgZoom", im ? num(im.zoom, 1) : 1);
    setVal("#hsImgX", im ? num(im.cropX, 50) : 50);
    setVal("#hsImgY", im ? num(im.cropY, 50) : 50);
    setVal("#hsImgW", im ? num(im.w, 100) : 100);
    setVal("#hsImgH", im ? num(im.h, 100) : 100);
    setVal("#hsImgRadius", im ? im.radius || "" : "");
    setVal("#hsImgOpacity", im ? num(im.opacity, 1) : 1);
    setVal("#hsImgZ", im ? num(im.z, 1) : 1);
    var out = $("#hsImgZoomOut");
    if (out) out.textContent = (im ? num(im.zoom, 1) : 1).toFixed(2) + "×";
    var count = $("#hsImgCount");
    if (count) count.textContent = images.length ? images.length + " صور" : "لا توجد صور";
  }

  function renderProductChips() {
    var box = $("#hsProductChips");
    if (!box) return;
    var b = getSelected();
    var items = b && Array.isArray(b.items) ? b.items : [];
    box.innerHTML = items.map(function (item, i) {
      return '<span class="hs-product-chip">' + esc(item.name || item.id || "منتج") +
        '<button type="button" data-remove-item="' + i + '" title="إزالة"><i class="fa-solid fa-xmark"></i></button></span>';
    }).join("") || '<span class="hs-hint">لم يتم اختيار منتجات</span>';
  }

  function renderAll() {
    renderLayers();
    renderTemplates();
    renderInspector();
    paintCanvas();
    refreshStatus();
    scheduleAutosave();
  }

  function selectBlock(id) {
    state.selectedId = id;
    state.imageIndex = 0;
    state.animTarget = "block";
    state.scrollToSelected = true;
    renderLayers();
    renderInspector();
    paintCanvas();
  }

  function addBlock(type) {
    if (!TYPES[type]) return;
    mutate("إضافة " + TYPES[type].name, function () {
      var block = makeBlock(type);
      if (state.device !== "all") block.device = state.device;
      syncLetters(block);
      state.doc.blocks.push(block);
      state.selectedId = block.id;
      state.imageIndex = 0;
      state.animTarget = "block";
      state.scrollToSelected = true;
    });
    toast("تمت إضافة " + TYPES[type].name, "success");
  }

  /* ---------------- template library ---------------- */
  function renderTemplateGroups() {
    var box = $("#hsTemplateGroups");
    if (!box) return;
    box.innerHTML = TEMPLATE_GROUPS.map(function (g) {
      var count = g.id === "all" ? TEMPLATES.length : TEMPLATES.filter(function (t) { return t.group === g.id; }).length;
      return '<button type="button" data-tpl-group="' + esc(g.id) + '" class="' + (state.templateCategory === g.id ? "active" : "") + '">' +
        '<i class="fa-solid ' + esc(g.icon) + '"></i> ' + esc(g.name) + ' (' + count + ')</button>';
    }).join("");
  }

  function renderTemplates() {
    var list = $("#hsTemplateList");
    if (!list) return;
    var q = String(state.templateQuery || "").trim().toLowerCase();
    var items = TEMPLATES.filter(function (t) {
      if (state.templateCategory !== "all" && t.group !== state.templateCategory) return false;
      if (!q) return true;
      var group = TEMPLATE_GROUPS.find(function (g) { return g.id === t.group; });
      return [t.name, t.title, t.subtitle, t.type, group && group.name].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    list.innerHTML = items.length ? items.map(function (t) {
      var icon = (TYPES[t.type] && TYPES[t.type].icon) || "fa-shapes";
      return '<button type="button" data-tpl="' + esc(t.id) + '" title="' + esc(t.name) + '"><i class="fa-solid ' + esc(icon) + '"></i><span>' + esc(t.name) + "</span></button>";
    }).join("") : '<div class="hs-template-empty">لا توجد قوالب مطابقة</div>';
    var count = $("#hsTemplateCount");
    if (count) count.textContent = String(items.length) + "/" + TEMPLATES.length;
  }

  function applyTemplate(id) {
    var t = TEMPLATES.find(function (x) { return x.id === id; });
    if (!t) return;
    mutate("قالب: " + t.name, function () {
      var block = makeBlock(t.type);
      block.name = t.name;
      if (state.device !== "all") block.device = state.device;
      block.text.title = t.title || "";
      block.text.subtitle = t.subtitle || "";
      block.style = Object.assign({}, block.style, TPL_PRESETS[t.preset] || {});
      if (t.height) block.style.height = t.height;
      if (t.cols) block.productLayout.cols = num(t.cols, 4);
      if (t.cardSize) block.productLayout.cardSize = t.cardSize;
      if (t.ad) block.ad = Object.assign({}, block.ad, t.ad);
      if (t.anim) block.anim = Object.assign(makeAnim(), t.anim);
      syncLetters(block);
      if (Array.isArray(t.letters) && block.text.perLetter.length) {
        block.text.perLetter.forEach(function (letter, i) {
          letter.color = t.letters[i % t.letters.length];
        });
      }
      state.doc.blocks.push(block);
      state.selectedId = block.id;
      state.imageIndex = 0;
      state.animTarget = "block";
      state.scrollToSelected = true;
    });
    toast("تمت إضافة قالب «" + t.name + "»", "success");
  }

  function removeBlock(id) {
    if (!id) return;
    var block = state.doc.blocks.find(function (b) { return b.id === id; });
    if (!block) return;
    mutate("حذف " + (block.name || block.type), function () {
      state.doc.blocks = state.doc.blocks.filter(function (b) { return b.id !== id; });
      if (state.selectedId === id) { state.selectedId = null; state.imageIndex = 0; }
    });
  }

  function duplicateBlock(id) {
    var block = state.doc.blocks.find(function (b) { return b.id === id; });
    if (!block) return;
    mutate("نسخ " + (block.name || block.type), function () {
      var copy = clone(block);
      copy.id = uid(block.type || "block");
      copy.name = (block.name || block.type) + " (نسخة)";
      copy.source = null;
      (copy.images || []).forEach(function (im) { im.id = uid("img"); });
      var idx = state.doc.blocks.findIndex(function (b) { return b.id === id; });
      state.doc.blocks.splice(idx + 1, 0, copy);
      state.selectedId = copy.id;
      state.scrollToSelected = true;
    });
  }

  /* ---------------- upload ---------------- */
  function extensionFor(file) {
    var name = String(file && file.name || "");
    var ext = name.indexOf(".") >= 0 ? name.split(".").pop().toLowerCase() : "";
    if (!/^[a-z0-9]{2,5}$/.test(ext)) {
      var mime = String(file && file.type || "");
      ext = mime.split("/")[1] || "png";
      if (ext === "jpeg") ext = "jpg";
    }
    return ext.replace(/[^a-z0-9]/g, "") || "png";
  }

  async function uploadImage(file) {
    if (!sb) { toast("لا يوجد اتصال بالسيرفر", "error"); return; }
    if (!file) return;
    if (file.size > MAX_UPLOAD) { toast("حجم الصورة أكبر من 5MB", "error"); return; }
    if (ALLOWED_MIME.indexOf(String(file.type || "").toLowerCase()) === -1) {
      toast("نوع الصورة غير مدعوم (png/jpg/webp/gif)", "error");
      return;
    }
    var country = state.country === "SA" ? "SA" : "EG";
    var selectedId = state.selectedId;
    var imageIndex = state.imageIndex;
    var selected = getSelected();
    var prefix = String((selected && selected.type) || "hs").replace(/[^a-z0-9]/gi, "").slice(0, 18) || "hs";
    var path = country + "/" + prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "." + extensionFor(file);
    var token = ++uploadSeq;
    try {
      var res = await sb.storage.from(BUCKET).upload(path, file, { cacheControl: "3600", upsert: true });
      if (res.error) throw res.error;
      var baseUrl = String(window.SUPABASE_URL || SUPABASE_URL).replace(/\/$/, "");
      var url = baseUrl + "/storage/v1/object/public/" + BUCKET + "/" + path;
      if (token !== uploadSeq || country !== state.country) {
        addLog("info", "تم رفع الصورة أثناء تغيير السياق ولم تُطبّق: " + path);
        toast("تم رفع الصورة، لكن السياق تغيّر — أعد الإضافة", "info");
        return;
      }
      var snapshot = clone(state.doc);
      var block = state.doc.blocks.find(function (b) { return b && b.id === selectedId; });
      if (!block) {
        block = makeBlock("image");
        state.doc.blocks.push(block);
        selectedId = block.id;
        imageIndex = 0;
        state.selectedId = block.id;
      }
      var image = block.images[imageIndex];
      if (!image) { image = makeImage(""); block.images.splice(imageIndex, 0, image); }
      image.url = url;
      state.imageIndex = block.images.indexOf(image);
      if (JSON.stringify(snapshot) !== JSON.stringify(state.doc)) {
        pushUndo({ doc: snapshot, label: "رفع صورة" });
        markDirty();
      }
      renderAll();
      addLog("edit", "رفع صورة: " + path);
      toast("تم رفع الصورة", "success");
    } catch (err) {
      var message = (err && err.message) ? err.message : String(err);
      addLog("error", "فشل رفع الصورة: " + message);
      toast("فشل الرفع: " + message, "error");
    }
  }

  /* ---------------- modals ---------------- */
  function openModal(title, body, opts) {
    opts = opts || {};
    var modal = $("#hsModal"), box = $("#hsModalBox"), bodyEl = $("#hsModalBody"), head = $("#hsModalTitle");
    if (!modal || !bodyEl || !head) return;
    head.textContent = title;
    bodyEl.innerHTML = body;
    if (box) box.classList.toggle("wide", !!opts.wide);
    modal.hidden = false;
    state.modalSnapshot = opts.snapshot ? clone(state.doc) : null;
    state.modalKind = opts.kind || "";
    var close = $("#hsModalClose");
    if (close) close.focus();
  }
  function closeModal() {
    var modal = $("#hsModal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    if (state.modalSnapshot && JSON.stringify(state.modalSnapshot) !== JSON.stringify(state.doc)) {
      pushUndo({ doc: state.modalSnapshot, label: "تعديل عبر نافذة" });
      markDirty();
      renderAll();
    }
    state.modalSnapshot = null;
    state.modalKind = "";
    $("#hsModalBody").innerHTML = "";
  }

  function showSqlHint() {
    openModal("إعداد قاعدة البيانات", '<div class="hs-sql-hint">' +
      "<p>نفّذ ملف <code>sql/hs.sql</code> في Supabase SQL Editor لإنشاء <b>home_studio_docs</b> و<b>home_studio_log</b>، " +
      "وإضافة عمود <b>device</b> لجداول الهيرو والبانرات والعروض والإعلانات، وضبط سياسات القراءة/الكتابة العامة.</p>" +
      "<p>يُحفظ «حفظ مسودة» في <code>doc</code> فقط، بينما يحدّث «نشر» النسخة التي يراها الزوار في <code>published_doc</code>.</p>" +
      "<p>تأكد أيضاً من وجود حاوية التخزين <b>home-images</b> العامة (الحد الأقصى 5MB).</p>" +
      "<p>زر <b>من الموقع</b> يفتح الصفحة الرئيسية الحقيقية داخل النافذة ويقرأ ترتيب أقسامها وشكلها كما يظهر للزوار، وله زر بديل يفتح المتجر في تبويب ويستقبل التصميم تلقائياً لو كان الإطار ممنوعاً. " +
      "لو ظهر <code>Cannot GET</code> أو لم توجد أقسام، اكتب الرابط الحقيقي لصفحة الهوم في حقل <b>رابط المتجر</b> واضغط حفظ الرابط. " +
      "زر <b>مزامنة</b> يستورد أولاً الشكل المنشور الذي يراه الزوار، ثم يحدّث البانرات والأقسام من الجداول. " +
      "زرا <b>تنزيل/فتح ملف</b> يحفظان التصميم على الجهاز كـ JSON ويعيدان تحميله لاحقاً. " +
      "مكتبة القوالب فيها 78 قالباً بنمط نون وأمازون، ووضع ملء الشاشة يخفي اللوحات ويُظهر الأدوات على الجانب عند تحريك الماوس.</p>" +
      '<div class="hs-modal-foot"><code>sql/hs.sql</code></div></div>', { kind: "sql" });
  }

  function showResetModal() {
    openModal("تصفير اللوحة", '<div class="hs-sql-hint"><p>سيتم حذف جميع البلوكات في المستند الحالي. يمكنك التراجع بـ Ctrl+Z.</p>' +
      '<div class="hs-modal-foot"><button type="button" class="hs-btn danger" id="hsResetConfirm"><i class="fa-solid fa-trash"></i> تأكيد التصفير</button>' +
      '<button type="button" class="hs-btn ghost" id="hsResetCancel">إلغاء</button></div></div>', { kind: "reset", snapshot: true });
    var ok = $("#hsResetConfirm"), cancel = $("#hsResetCancel");
    if (ok) ok.onclick = function () {
      var snapshot = clone(state.doc);
      var cleared = freshDoc();
      cleared.theme = clone(state.doc.theme || {});
      state.doc = cleared;
      state.selectedId = null;
      pushUndo({ doc: snapshot, label: "تصفير اللوحة" });
      state.modalSnapshot = null;
      markDirty();
      renderAll();
      closeModal();
      addLog("edit", "تم تصفير اللوحة");
    };
    if (cancel) cancel.onclick = closeModal;
  }

  function clearLocalForCountry(country) {
    try {
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf(LS_DOC + "_" + country + "_") === 0 ||
            key.indexOf(LS_META + "_" + country + "_") === 0) localStorage.removeItem(key);
      });
      if (country === "EG") { localStorage.removeItem(LS_DOC); localStorage.removeItem(LS_META); }
    } catch (_e) {}
  }

  function showRestoreModal() {
    var label = state.country === "EG" ? "مصر" : "السعودية";
    openModal("استعادة المتجر كما كان",
      '<div class="hs-sql-hint">' +
      '<p>سيتم حذف مستندات HS المنشورة والمسودات من السيرفر، ومسح النسخة المحلية، ليعود المتجر لشكله الأصلي كما لو لم تعمل أي تعديل. لن يحتاج الزوار لتحديث الصفحة.</p>' +
      '<div class="hs-row-buttons">' +
      '<button type="button" class="hs-btn danger" id="hsRestoreCountry"><i class="fa-solid fa-rotate-left"></i> استعادة ' + esc(label) + '</button>' +
      '<button type="button" class="hs-btn ghost" id="hsRestoreAll"><i class="fa-solid fa-globe"></i> استعادة كل الدول</button>' +
      '<button type="button" class="hs-btn ghost" id="hsRestoreCancel">إلغاء</button>' +
      '</div></div>', { kind: "restore" });
    var one = $("#hsRestoreCountry"), all = $("#hsRestoreAll"), cancel = $("#hsRestoreCancel");
    if (one) one.onclick = function () { restoreServer([state.country]); };
    if (all) all.onclick = function () { restoreServer(["EG", "SA"]); };
    if (cancel) cancel.onclick = closeModal;
  }

  async function restoreServer(countries) {
    if (!sb) { toast("لا يوجد اتصال بالسيرفر", "error"); return; }
    if (state.busy) return;
    state.busy = true;
    try {
      var changed = [];
      for (var i = 0; i < countries.length; i++) {
        var country = countries[i];
        var res = await sb.from("home_studio_docs")
          .delete().eq("country", country).in("scope", ["all", "mobile", "desktop"]);
        if (res.error) throw res.error;
        changed.push(country);
        clearLocalForCountry(country);
        try {
          await sb.from("home_studio_log").insert({
            country: country, scope: "all", action: "restore",
            detail: { by: "admin@example.com", note: "حذف كل تعديلات HS — المتجر عاد لشكله الأصلي" },
          });
        } catch (_logErr) {}
      }
      if (changed.indexOf(state.country) >= 0) {
        state.doc = freshDoc();
        state.name = "الصفحة الرئيسية";
        state.selectedId = null;
        state.dirty = false;
        state.published = false;
        state.serverVersion = 0;
        state.undo = [];
        state.redo = [];
      }
      state.modalSnapshot = null;
      closeModal();
      var docName = $("#hsDocName");
      if (docName) docName.value = state.name;
      addLog("sync", "تمت استعادة المتجر لشكله الأصلي — حُذفت تعديلات HS: " + changed.join(", "));
      toast("تمت الاستعادة لشكل المتجر الأصلي", "success");
      flushAutosave();
      await loadInitial({ keepDevice: true, keepName: true });
      renderAll();
    } catch (err) {
      var message = (err && err.message) ? err.message : String(err);
      setStatus("error", "فشلت الاستعادة");
      addLog("error", "فشلت استعادة المتجر: " + message);
      toast("فشلت الاستعادة: " + message, "error");
    } finally {
      state.busy = false;
    }
  }

  async function searchProducts(query) {
    if (!sb) return [];
    var q = String(query || "").replace(/[,()"'\\*]/g, "").trim().slice(0, 40);
    var out = [];
    for (var t = 0; t < 2; t++) {
      var table = t === 0 ? "taager_products" : "partner_products";
      try {
        var builder = sb.from(table).select("*");
        if (q) builder = builder.or("name.ilike.*" + q + "*,id.ilike.*" + q + "*");
        var res = await builder.limit(18);
        if (res.error) {
          var fallback = await sb.from(table).select("*").limit(18);
          if (fallback.error) continue;
          res = fallback;
        }
        (res.data || []).forEach(function (row) {
          out.push({
            id: String(row.id || row.product_id || ""),
            name: String(row.name || row.title || row.product_name || "منتج"),
            price: row.price,
            image: productImage(row),
            source: table,
          });
        });
      } catch (_e) { /* table might not exist */ }
    }
    var seen = {}, filtered = [];
    out.forEach(function (p) {
      if (!p.id || seen[p.id]) return;
      if (q && String(p.name).toLowerCase().indexOf(q.toLowerCase()) === -1 && p.id.indexOf(q) === -1) return;
      seen[p.id] = 1;
      filtered.push(p);
    });
    return filtered.slice(0, 30);
  }

  function pickerResultHTML(p) {
    var b = getSelected();
    var selected = b && b.items && b.items.some(function (it) { return String(it.id) === String(p.id); });
    return '<div class="hs-product-result' + (selected ? " selected" : "") + '" data-pick="' + esc(p.id) + '">' +
      '<img src="' + esc(p.image) + '" alt="" loading="lazy" />' +
      "<b>" + esc(p.name) + "</b><small>" + esc(money(p.price)) + "</small>" +
      '<small style="color:#94a3b8">' + esc(p.source) + "</small></div>";
  }

  function renderPicker(selected) {
    var results = $("#hsPickerResults");
    if (results) {
      results.innerHTML = state.pickerProducts.length
        ? state.pickerProducts.map(pickerResultHTML).join("")
        : '<p class="hs-modal-status">لا توجد نتائج. جرّب كلمة بحث أخرى.</p>';
    }
    var chips = $("#hsPickerChips");
    if (chips) {
      var b = getSelected();
      chips.innerHTML = b && b.items && b.items.length
        ? b.items.map(function (it, i) {
          return '<span class="hs-product-chip">' + esc(it.name || it.id) +
            '<button type="button" data-remove-item="' + i + '"><i class="fa-solid fa-xmark"></i></button></span>';
        }).join("")
        : '<span class="hs-modal-status">لم يتم اختيار منتجات بعد.</span>';
    }
    var status = $("#hsPickerStatus");
    if (status) status.textContent = state.pickerProducts.length + " نتيجة (بحد أقصى 30)";
  }

  async function openProductPicker() {
    var b = getSelected();
    if (!b || b.type !== "products") { toast("اختر بلوك منتجات أولاً", "info"); return; }
    openModal("اختيار المنتجات", '<div class="hs-search-row"><input id="hsPickerSearch" type="text" placeholder="ابحث بالاسم أو المعرّف..." value="' +
      esc(state.pickerQuery) + '" /><button type="button" class="hs-btn primary" id="hsPickerGo"><i class="fa-solid fa-magnifying-glass"></i> بحث</button></div>' +
      '<p class="hs-modal-status" id="hsPickerStatus">جارٍ التحميل...</p><div class="hs-product-results" id="hsPickerResults"></div>' +
      '<div class="hs-subhead"><span>المنتجات المختارة</span><small>انقر على × للإزالة</small></div><div class="hs-product-chips" id="hsPickerChips"></div>',
      { kind: "picker", snapshot: true, wide: true });
    var run = async function () {
      var input = $("#hsPickerSearch");
      state.pickerQuery = input ? input.value : "";
      var status = $("#hsPickerStatus");
      if (status) status.textContent = "جارٍ البحث...";
      state.pickerProducts = await searchProducts(state.pickerQuery);
      renderPicker();
    };
    var go = $("#hsPickerGo"), search = $("#hsPickerSearch");
    if (go) go.onclick = run;
    if (search) search.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } };
    await run();
  }

  function togglePickedProduct(id) {
    var b = getSelected();
    if (!b) return;
    var p = state.pickerProducts.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    var idx = b.items.findIndex(function (it) { return String(it.id) === String(p.id); });
    if (idx >= 0) b.items.splice(idx, 1);
    else b.items.push({ id: p.id, name: p.name, image: p.image, price: p.price, source: p.source });
    if (b.productLayout) b.productLayout.mode = "manual";
    markDirty();
    renderPicker();
    renderInspector();
    paintCanvas();
  }

  function openCropModal() {
    var im = currentImage();
    if (!im || !im.url) { toast("اختر صورة أولاً", "info"); return; }
    openModal("قصّ الصورة", '<div class="hs-crop-stage"><img id="hsCropPreview" src="' + esc(im.url) + '" alt="" /></div>' +
      '<div class="hs-grid-2">' +
      '<div class="hs-field"><label>تكبير</label><input id="hsCropZoom" type="range" min="1" max="3" step="0.05" value="' + num(im.zoom, 1) + '" /></div>' +
      '<div class="hs-field"><label>موضع X</label><input id="hsCropX" type="range" min="0" max="100" value="' + num(im.cropX, 50) + '" /></div>' +
      '<div class="hs-field"><label>موضع Y</label><input id="hsCropY" type="range" min="0" max="100" value="' + num(im.cropY, 50) + '" /></div>' +
      '<div class="hs-field"><label>الانحناء</label><input id="hsCropRadius" type="text" value="' + esc(im.radius || "12px") + '" /></div>' +
      "</div><div class=\"hs-modal-foot\"><button type=\"button\" class=\"hs-btn primary\" id=\"hsCropDone\">تم</button></div>",
      { kind: "crop", snapshot: true, wide: true });
    var preview = $("#hsCropPreview");
    var apply = function () {
      var image = currentImage();
      if (!image || !preview) return;
      image.zoom = num($("#hsCropZoom") && $("#hsCropZoom").value, 1);
      image.cropX = num($("#hsCropX") && $("#hsCropX").value, 50);
      image.cropY = num($("#hsCropY") && $("#hsCropY").value, 50);
      image.x = image.cropX;
      image.y = image.cropY;
      image.radius = $("#hsCropRadius") ? $("#hsCropRadius").value : image.radius;
      preview.style.transform = "scale(" + image.zoom + ")";
      preview.style.objectPosition = image.cropX + "% " + image.cropY + "%";
      preview.style.borderRadius = safeCss(image.radius);
      renderInspector();
      paintCanvas();
      markDirty();
    };
    ["hsCropZoom", "hsCropX", "hsCropY", "hsCropRadius"].forEach(function (id) {
      var el = $("#" + id);
      if (el) { el.oninput = apply; el.onchange = apply; }
    });
    var done = $("#hsCropDone");
    if (done) done.onclick = closeModal;
  }

  /* ---------------- local file save / open ---------------- */
  function exportDocFile() {
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    var payload = {
      app: "HS Home Studio", format: "hs-layout", version: 1,
      exportedAt: new Date().toISOString(),
      country: state.country, scope: state.device === "all" ? "all" : state.device,
      name: state.name, doc: clone(state.doc),
    };
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "hs-" + state.country.toLowerCase() + "-" + payload.scope + "-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      addLog("save", "تم تنزيل ملف التصميم: " + a.download);
      toast("تم تنزيل نسخة من التصميم على الجهاز", "success");
    } catch (err) {
      toast("تعذر تنزيل الملف: " + (err && err.message ? err.message : String(err)), "error");
    }
  }

  async function importDocFile(file) {
    if (!file) return;
    try {
      var text = typeof file.text === "function" ? await file.text() : await new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || "")); };
        reader.onerror = function () { reject(reader.error || new Error("read failed")); };
        reader.readAsText(file);
      });
      var parsed = JSON.parse(text);
      var doc = parsed && parsed.doc ? parsed.doc : parsed;
      if (!doc || !Array.isArray(doc.blocks)) throw new Error("ملف التصميم غير صالح");
      pushUndo({ doc: clone(state.doc), label: "قبل فتح ملف التصميم", name: state.name });
      state.doc = normalizeDoc(doc);
      if (parsed && parsed.name) state.name = String(parsed.name);
      var nameEl = $("#hsDocName");
      if (nameEl) nameEl.value = state.name;
      state.selectedId = null;
      markDirty();
      renderAll();
      addLog("save", "تم فتح ملف تصميم: " + file.name + " (" + state.doc.blocks.length + " بلوك)");
      toast("تم تحميل التصميم من الملف", "success");
    } catch (err) {
      var message = err && err.message ? err.message : String(err);
      addLog("error", "فشل فتح ملف التصميم: " + message);
      toast("فشل فتح الملف: " + message, "error");
    }
  }

  /* ---------------- fullscreen focus mode ---------------- */
  function scheduleFocusHide() {
    clearTimeout(state.focusTimer);
    state.focusTimer = setTimeout(function () {
      var bar = $("#hsFocusBar");
      if (bar && bar.matches(":hover")) { scheduleFocusHide(); return; }
      document.body.classList.remove("hs-tools-visible");
    }, 2200);
  }
  function revealFocusTools() {
    if (!document.body.classList.contains("hs-focus")) return;
    document.body.classList.add("hs-tools-visible");
    scheduleFocusHide();
  }
  function toggleFocus(force) {
    var on = typeof force === "boolean" ? force : !document.body.classList.contains("hs-focus");
    document.body.classList.toggle("hs-focus", on);
    var btn = $("#hsBtnFocus");
    if (btn) {
      btn.innerHTML = on ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
      btn.title = on ? "الخروج من ملء الشاشة" : "لوحة التصميم بملء الشاشة";
    }
    if (on) revealFocusTools();
    else {
      clearTimeout(state.focusTimer);
      document.body.classList.remove("hs-tools-visible", "hs-show-rail", "hs-show-inspector", "hs-show-dock");
    }
    addLog("edit", on ? "وضع ملء الشاشة" : "الخروج من ملء الشاشة");
  }
  function autoFitCanvas() {
    var wrap = $("#hsCanvasWrap");
    var frame = $("#hsFrame");
    var zoom = $("#hsZoom");
    if (!wrap || !frame) return;
    var target = (viewDevice() === "desktop" ? 900 : 390) + 28;
    var available = Math.max(320, wrap.clientWidth - 46);
    var pct = Math.max(40, Math.min(120, Math.round((available / target) * 100 / 5) * 5));
    if (zoom) {
      zoom.value = String(pct);
      var label = $("#hsZoomLabel");
      if (label) label.textContent = pct + "%";
    }
    state.zoom = pct;
    frame.style.setProperty("--hs-zoom", String(pct / 100));
  }
  function focusAction(action) {
    if (action === "exit") { toggleFocus(false); return; }
    if (action === "rail" || action === "inspector" || action === "dock") {
      var cls = action === "rail" ? "hs-show-rail" : action === "inspector" ? "hs-show-inspector" : "hs-show-dock";
      document.body.classList.toggle(cls);
      revealFocusTools();
      return;
    }
    if (action === "mobile" || action === "desktop") { setDevice(action); revealFocusTools(); return; }
    if (action === "fit") { autoFitCanvas(); revealFocusTools(); return; }
    if (action === "undo") { undo(); revealFocusTools(); return; }
    if (action === "redo") { redo(); revealFocusTools(); return; }
    if (action === "preview") { openPreview(); revealFocusTools(); return; }
    if (action === "save") { persist(false); revealFocusTools(); }
  }

  /* ---------------- capture the real home page ---------------- */
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function liveHomeURL() { return storefrontHomeURL() + "?hs_capture=1"; }

  function cleanText(el) {
    return String(el && el.textContent || "").replace(/\s+/g, " ").trim();
  }
  function cssPath(el, root) {
    var parts = [];
    if (!el) return "config";
    while (el && el.nodeType === 1 && el !== root) {
      var tag = el.tagName.toLowerCase();
      if (el.id) tag += "#" + String(el.id).replace(/[^a-zA-Z0-9_-]/g, "");
      else if (el.className && typeof el.className === "string") {
        var cls = el.className.trim().split(/\s+/).slice(0, 2)
          .map(function (c) { return String(c).replace(/[^a-zA-Z0-9_-]/g, ""); }).filter(Boolean);
        if (cls.length) tag += "." + cls.join(".");
      }
      parts.unshift(tag);
      el = el.parentElement;
    }
    return parts.slice(-5).join(" > ");
  }
  function sectionScore(el, view) {
    var raw = [el.getAttribute("data-section-type"), el.getAttribute("data-section"),
      el.id, typeof el.className === "string" ? el.className : ""].join(" ").toLowerCase();
    var score = 0;
    if (/ad|sponsor|advert|إعلان|مدفوع/.test(raw)) score = 7;
    if (/hero|slider|swiper|main.?banner/.test(raw)) score = 6;
    if (/categor|department|dept|فئات/.test(raw)) score = 6;
    if (/mega|offer|عروض/.test(raw)) score = 5;
    if (/banner|بانر/.test(raw)) score = 5;
    if (/product|منتجات|card.?grid/.test(raw)) score = 4;
    if (/section/.test(raw) || el.tagName === "SECTION") score = Math.max(score, 2);
    return score;
  }
  function computedStyleOf(el, view) {
    try { return view.getComputedStyle(el); } catch (_e) { return {}; }
  }
  function visibleInFrame(el, view) {
    var cs = computedStyleOf(el, view);
    return cs.display !== "none" && cs.visibility !== "hidden";
  }
  function capturedImages(el, view, kind) {
    if (!el) return [];
    var rect = el.getBoundingClientRect();
    var list = $$("img", el).filter(function (img) {
      var r = img.getBoundingClientRect();
      return r.width >= 24 && r.height >= 24 && visibleInFrame(img, view);
    });
    if (kind === "categories" || kind === "products") list = list.slice(0, 1);
    else list = list.slice(0, 4);
    return list.map(function (img, i) {
      var r = img.getBoundingClientRect();
      var image = makeImage(img.currentSrc || img.src || "");
      if (list.length === 1 || (r.width >= rect.width * 0.8)) {
        image.x = 0; image.y = 0; image.w = 100; image.h = 100;
      } else {
        image.x = Math.max(0, Math.min(100, Math.round(((r.left - rect.left) / Math.max(1, rect.width)) * 100)));
        image.y = Math.max(0, Math.min(100, Math.round(((r.top - rect.top) / Math.max(1, rect.height)) * 100)));
        image.w = Math.max(5, Math.min(100 - image.x, Math.round((r.width / Math.max(1, rect.width)) * 100)));
        image.h = Math.max(5, Math.min(100 - image.y, Math.round((r.height / Math.max(1, rect.height)) * 100)));
      }
      image.radius = computedStyleOf(img, view).borderRadius || "8px";
      image.sourceRowId = String(img.getAttribute("data-id") || img.closest("[data-id]")?.getAttribute("data-id") || ("img_" + i));
      return image;
    });
  }
  function capturedItems(el, view, kind) {
    if (!el) return [];
    var nodes = $$("a", el).filter(function (a) { return a.querySelector("img") || cleanText(a); });
    if (!nodes.length) nodes = $$("[class*=item],[class*=card]", el);
    return nodes.slice(0, 24).map(function (node, i) {
      var img = node.querySelector("img");
      var href = node.getAttribute("href") || "";
      var m = href.match(/[?&]id=([^&#]+)/);
      return {
        id: m ? decodeURIComponent(m[1]) : ("item_" + i),
        name: cleanText(node) || ("عنصر " + (i + 1)),
        image: img ? (img.currentSrc || img.src || "") : "",
        link: href,
        localName: kind,
      };
    });
  }
  function classifyCaptured(el, view) {
    var raw = [el.getAttribute("data-section-type"), el.id,
      typeof el.className === "string" ? el.className : "", cleanText(el).slice(0, 60)].join(" ").toLowerCase();
    var imgCount = $$("img", el).filter(function (i) { return i.getBoundingClientRect().width >= 24; }).length;
    if (/ad|sponsor|advert|إعلان|مدفوع/.test(raw)) return "ads";
    if (/hero|slider|swiper/.test(raw)) return "hero";
    if (/categor|department|dept|فئات/.test(raw)) return "categories";
    if (/product|منتجات/.test(raw)) return "products";
    if (/mega|offer|عروض|banner|بانر/.test(raw)) return imgCount > 2 && /card|grid|product/.test(raw) ? "products" : "banner";
    if (imgCount && cleanText(el).length < 90) return "image";
    return "text";
  }
  function mapHomeType(type) {
    var t = String(type || "");
    if (t === "hero") return "hero";
    if (t === "ad-hero") return "ads";
    if (t === "categories" || t === "smart-categories" || t === "brands") return "categories";
    if (t === "features") return "text";
    if (/banner/i.test(t)) return "banner";
    return "products";
  }
  function blockFromHomeConfig(view, node, cfg, index, device, root) {
    cfg = cfg || {};
    // banner index 0 is the announcement strip; the rest are real ad slots.
    var type = (String(cfg.type) === "banner" && num(cfg.index, 0) > 0) ? "ads" : mapHomeType(cfg.type);
    var block = makeBlock(type);
    var label = TYPES[type].name;
    var title = cleanText(cfg.title) || (node && (cleanText(node.querySelector("h1,h2,h3,h4,strong,[class*=title]")) ||
      cleanText(node).slice(0, 80))) || label;
    block.name = cleanText(cfg.title) || (cleanText(cfg.id) ? cfg.id : label + " " + (index + 1));
    block.text.title = title;
    block.text.subtitle = cleanText(cfg.subtitle) || "";
    if (device !== "all") block.device = device;
    if (node) {
      var cs = computedStyleOf(node, view);
      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") block.style.background = cs.backgroundColor;
      if (cs.color) block.style.color = cs.color;
      if (cs.borderRadius && cs.borderRadius !== "0px") block.style.radius = cs.borderRadius;
      if (cs.padding && cs.padding !== "0px") block.style.padding = cs.padding;
    }
    block.images = capturedImages(node, view, type);
    if (type === "categories" || type === "products") block.items = capturedItems(node, view, type);
    if (type === "ads") {
      var link = node ? $$("a", node).find(function (a) { return a.getAttribute("href"); }) : null;
      if (link) block.ad.link = link.getAttribute("href");
      else if (cfg.link) block.ad.link = cfg.link;
      if (/banner/i.test(String(cfg.type)) && (cfg.index || 0) > 0) block.ad.position = "middle";
    }
    block.source = {
      live: true, sectionType: cfg.type, sectionIndex: index,
      sectionId: cleanText(cfg.id) || "", order: index,
      selector: node ? cssPath(node, root) : "config:" + index,
    };
    syncLetters(block);
    return block;
  }
  function docFromHomeConfig(view, doc, device) {
    var configs = (view.HOME_CONFIG && Array.isArray(view.HOME_CONFIG.sections)) ? view.HOME_CONFIG.sections : [];
    if (!configs.length) return null;
    var mount = doc.getElementById("hm-content") || doc.body;
    var nodes = $$("[data-hm-section-index]", mount).sort(function (a, b) {
      return num(a.getAttribute("data-hm-section-index"), 999) - num(b.getAttribute("data-hm-section-index"), 999);
    });
    if (!nodes.length && doc.body && /home-loading|home-hydrating/.test(doc.body.className)) return null;

    var nodeMap = {};
    nodes.forEach(function (node) { nodeMap[num(node.getAttribute("data-hm-section-index"), -1)] = node; });
    function usableNode(node) {
      if (!node) return null;
      var rect = node.getBoundingClientRect();
      return rect.width >= 24 && rect.height >= 24 && visibleInFrame(node, view) ? node : null;
    }
    var children = Array.prototype.slice.call(mount.children);
    var entries = configs.map(function (cfg, i) {
      return { kind: "config", cfg: cfg, node: usableNode(nodeMap[i]), index: i };
    });
    // Sections added outside HOME_CONFIG (summer strip, Supabase sections) are
    // real parts of the page too, so include them instead of dropping them.
    children.forEach(function (el, i) {
      if (el.id === "hm-skeleton" || el.id === "hs-storefront-root") return;
      var idx = num(el.getAttribute("data-hm-section-index"), -1);
      if (el.hasAttribute("data-hm-section-index") && idx >= 0 && idx < configs.length) return;
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) return;
      var rect = el.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 28 || !visibleInFrame(el, view)) return;
      entries.push({ kind: "extra", node: el, index: configs.length + i });
    });

    function entryPos(entry) {
      if (!entry.node) return { dom: entry.index + 1000, top: entry.index * 1000, left: 0 };
      var rect = entry.node.getBoundingClientRect();
      var dom = children.indexOf(entry.node);
      return { dom: dom < 0 ? entry.index + 1000 : dom, top: rect.top, left: rect.left };
    }
    entries.sort(function (a, b) {
      var pa = entryPos(a), pb = entryPos(b);
      if (device === "desktop") return pa.top - pb.top || pa.left - pb.left || pa.dom - pb.dom;
      return pa.dom - pb.dom;
    });

    var blocks = entries.map(function (entry, order) {
      var block = entry.kind === "config"
        ? blockFromHomeConfig(view, entry.node, entry.cfg, order, device, mount)
        : blockFromLiveElement(entry.node, view, order, device, mount);
      if (block.source) block.source.order = order;
      return block;
    });
    return {
      version: 1,
      theme: { bg: "#ffffff", text: "#101828", accent: "#7c3aed", fontFamily: "Cairo", radius: "14px", pageWidth: "100%" },
      blocks: blocks,
    };
  }

  function blockFromLiveElement(el, view, index, device, root) {
    var type = classifyCaptured(el, view);
    var block = makeBlock(type);
    var cs = computedStyleOf(el, view);
    var titleEl = el.querySelector("h1,h2,h3,h4,strong,[class*=title],[class*=heading]");
    var subEl = el.querySelector("p,[class*=subtitle],[class*=desc]");
    var title = cleanText(titleEl) || cleanText(el).slice(0, 80) || TYPES[type].name;
    var subtitle = cleanText(subEl);
    if (subtitle && title.indexOf(subtitle) >= 0) subtitle = "";
    block.name = (TYPES[type] && TYPES[type].name) + " " + (index + 1);
    block.text.title = title;
    block.text.subtitle = subtitle;
    if (device !== "all") block.device = device;
    block.style.background = cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : (TYPES[type].name === "بانر" ? "#ffffff" : block.style.background);
    block.style.color = cs.color || block.style.color;
    block.style.radius = cs.borderRadius && cs.borderRadius !== "0px" ? cs.borderRadius : block.style.radius;
    block.style.padding = cs.padding && cs.padding !== "0px" ? cs.padding : block.style.padding;
    if (/^(center|right|left)$/.test(cs.textAlign || "")) block.style.align = cs.textAlign;
    if (cs.fontSize && num(parseFloat(cs.fontSize), 0) <= 44) block.style.fontSize = cs.fontSize;
    block.images = capturedImages(el, view, type);
    if (type === "categories" || type === "products") block.items = capturedItems(el, view, type);
    if (type === "ads") {
      var link = $$("a", el).find(function (a) { return a.getAttribute("href"); });
      if (link) block.ad.link = link.getAttribute("href");
      var badge = cleanText(el).match(/مدفوع|Sponsored|إعلان/);
      if (badge) block.ad.badge = badge[0];
    }
    block.source = { live: true, order: index, selector: cssPath(el, root) };
    syncLetters(block);
    return block;
  }
  function scrapeLiveDoc(view, doc, device) {
    var mount = doc.getElementById("hm-content") || doc.body;
    var root = doc.getElementById("hs-storefront-root") || mount;
    var candidates = [];
    $$("*", mount).forEach(function (el) {
      if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|PATH)$/.test(el.tagName)) return;
      var score = sectionScore(el, view);
      if (score < 2 || !visibleInFrame(el, view)) return;
      var r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 28) return;
      var parent = el.parentElement;
      while (parent && parent !== mount) {
        if (sectionScore(parent, view) >= score) return;
        parent = parent.parentElement;
      }
      candidates.push({ el: el, rect: r });
    });
    candidates.sort(function (a, b) { return a.rect.top - b.rect.top || a.rect.left - b.rect.left; });
    var themeBg = computedStyleOf(root, view).backgroundColor;
    return {
      version: 1,
      theme: { bg: themeBg && themeBg !== "rgba(0, 0, 0, 0)" ? themeBg : "#ffffff", text: "#101828", accent: "#7c3aed", fontFamily: "Cairo", radius: "14px", pageWidth: "100%" },
      blocks: candidates.slice(0, 40).map(function (c, i) { return blockFromLiveElement(c.el, view, i, device, mount); }),
    };
  }
  async function readLiveHome(frame, device) {
    var view = frame.contentWindow, doc = frame.contentDocument;
    if (!view || !doc) throw new Error("تعذر قراءة الصفحة — افتح الاستوديو والمتجر على نفس النطاق");
    var startText = cleanText(doc.body || doc.documentElement);
    if (/cannot get|not found|404/i.test(startText) && !doc.getElementById("hm-content")) {
      throw new Error("رابط المتجر غير صحيح — عدّل «رابط المتجر» فوق ثم اضغط حفظ الرابط");
    }
    for (var i = 0; i < 48; i++) {
      // When the storefront is already using an HS published layout, read the exact
      // document from the page itself instead of guessing from DOM classes.
      if (view.HSView && typeof view.HSView.current === "function") {
        try {
          var active = view.HSView.current();
          if (active && active.blocks && active.blocks.length) return normalizeDoc(active);
        } catch (_e) {}
      }
      var hydrated = $$("[data-hm-section-index]", doc).length;
      var busy = doc.body && /home-loading|home-hydrating/.test(doc.body.className);
      if (doc.readyState === "complete" && hydrated && !busy) break;
      await wait(250);
    }
    await wait(400);
    // HOME_CONFIG.sections is the site's own ordered section list. Combined with
    // the hydrated DOM nodes it gives the exact real order and content.
    var configured = docFromHomeConfig(view, doc, device);
    if (configured && configured.blocks.length) return normalizeDoc(configured);
    var scraped = scrapeLiveDoc(view, doc, device);
    if (!scraped.blocks.length) throw new Error("لم يتم العثور على أقسام داخل الصفحة");
    return normalizeDoc(scraped);
  }
  function installLiveDoc(doc, shouldDownload) {
    var safe = normalizeDoc(doc);
    pushUndo({ doc: clone(state.doc), label: "قبل استيراد الصفحة الحقيقية" });
    state.doc = safe;
    state.selectedId = null;
    markDirty();
    renderAll();
    addLog("sync", "تم استيراد شكل وترتيب الصفحة الحقيقية — " + safe.blocks.length + " قسم");
    closeModal();
    toast("تم بناء التصميم من الصفحة الحقيقية (" + safe.blocks.length + " قسم)", "success");
    if (shouldDownload) exportDocFile();
  }

  async function applyLiveDoc(frame, device, shouldDownload) {
    var status = $("#hsLiveStatus");
    if (status) { status.textContent = "جارٍ قراءة ترتيب الأقسام..."; status.className = "hs-live-status"; }
    try {
      installLiveDoc(await readLiveHome(frame, device), shouldDownload);
    } catch (err) {
      var message = err && err.message ? err.message : String(err);
      if (status) { status.textContent = message; status.className = "hs-live-status error"; }
      addLog("error", "فشل استيراد الصفحة الحقيقية: " + message);
    }
  }

  function captureScore(doc) {
    var blocks = Array.isArray(doc && doc.blocks) ? doc.blocks : [];
    return blocks.length * 100 + blocks.reduce(function (n, b) {
      return n + (Array.isArray(b.images) ? b.images.length * 3 : 0) + (Array.isArray(b.items) ? b.items.length : 0);
    }, 0);
  }

  function captureFromTab(shouldDownload) {
    var status = $("#hsLiveStatus");
    var requestId = "hs_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    var best = null;
    var attempts = 0;
    var finished = false;
    if (status) { status.textContent = "جارٍ فتح المتجر في تبويب جديد..."; status.className = "hs-live-status"; }
    var win = window.open(liveHomeURL(), "hs_live_capture_tab", "");
    if (!win) {
      if (status) { status.textContent = "اسمح للنوافذ المنبثقة من هذا الموقع ثم جرّب مرة أخرى"; status.className = "hs-live-status error"; }
      toast("تعذر فتح تبويب المتجر — اسمح بالنوافذ المنبثقة", "error");
      return;
    }
    function onMessage(e) {
      var data = e.data;
      if (!data || data.source !== "hs-storefront" || data.type !== "hs-capture-response") return;
      if (data.requestId !== requestId || e.source !== win) return;
      if (!data.doc || !Array.isArray(data.doc.blocks)) {
        if (data.error && status) status.textContent = data.error;
        return;
      }
      var score = captureScore(data.doc);
      if (!best || score > best.score) best = { doc: data.doc, score: score };
      if (status) {
        status.textContent = "تم استلام التصميم — جارٍ انتظار اكتمال تحميل الأقسام...";
        status.className = "hs-live-status ok";
      }
    }
    function send() {
      try { win.postMessage({ source: "hs-studio-capture", type: "hs-capture-request", requestId: requestId }, "*"); }
      catch (_e) {}
    }
    var timer = setInterval(function () {
      attempts++;
      send();
      if (attempts >= 12) finish();
    }, 900);
    function finish() {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      window.removeEventListener("message", onMessage, false);
      if (best) installLiveDoc(best.doc, shouldDownload);
      else {
        if (status) { status.textContent = "لم يستجب المتجر. حدّث الصفحة في التبويب الجديد ثم جرّب مرة أخرى"; status.className = "hs-live-status error"; }
        addLog("error", "فشل استيراد التصميم من تبويب المتجر");
      }
    }
    window.addEventListener("message", onMessage, false);
    send();
  }
  function openLiveImport() {
    var captureDevice = viewDevice();
    openModal("استيراد شكل الصفحة الحقيقية", '<p class="hs-hint">الصفحة أدناه هي المتجر نفسه. استعرضها كما هي، ثم اضغط «اقرأ الترتيب وابنِ التصميم». لو لم تظهر داخل الإطار، استخدم زر فتح تبويب؛ المتجر سيرسل التصميم تلقائياً.</p>' +
      '<div class="hs-store-url"><label for="hsLiveBase">رابط المتجر</label>' +
      '<input type="text" id="hsLiveBase" dir="ltr" placeholder="https://example.com/pages/home.html">' +
      '<button type="button" class="hs-btn small" id="hsLiveBaseSave">حفظ الرابط</button>' +
      '<button type="button" class="hs-btn small ghost" id="hsLiveBaseReset">افتراضي</button></div>' +
      '<div class="hs-row-buttons" id="hsLiveDevices">' +
      '<button type="button" class="hs-btn small" data-live-device="mobile">موبايل</button>' +
      '<button type="button" class="hs-btn small" data-live-device="desktop">ديسكتوب</button>' +
      '<button type="button" class="hs-btn small" id="hsLiveTab"><i class="fa-solid fa-up-right-from-square"></i> فتح تبويب واستيراد</button>' +
      '<button type="button" class="hs-btn small" id="hsLiveTabSave"><i class="fa-solid fa-file-arrow-down"></i> تبويب + ملف</button></div>' +
      '<div class="hs-live-shell"><iframe id="hsLiveFrame" class="hs-live-frame" src="' + esc(liveHomeURL()) + '" title="الصفحة الرئيسية الحقيقية"></iframe></div>' +
      '<div class="hs-modal-foot"><span class="hs-live-status" id="hsLiveStatus">جارٍ تحميل الصفحة...</span>' +
      '<button type="button" class="hs-btn ghost" id="hsLiveCancel">إغلاق</button>' +
      '<button type="button" class="hs-btn primary" id="hsLiveCapture"><i class="fa-solid fa-file-import"></i> اقرأ الترتيب وابنِ التصميم</button>' +
      '<button type="button" class="hs-btn" id="hsLiveCaptureSave"><i class="fa-solid fa-file-arrow-down"></i> اقرأ ونزّل ملف</button></div>', { wide: true, kind: "live" });
    var frame = $("#hsLiveFrame");
    var status = $("#hsLiveStatus");
    var baseInput = $("#hsLiveBase");
    function saveBase() {
      if (!baseInput) return;
      var fixed = normalizeHomeURL(baseInput.value);
      if (!fixed) { toast("رابط المتجر غير صالح", "error"); return; }
      try { localStorage.setItem(LS_STORE_HOME, fixed); } catch (_e) {}
      baseInput.value = fixed;
      toast("تم حفظ رابط المتجر", "success");
      setFrameDevice(captureDevice);
    }
    function resetBase() {
      try { localStorage.removeItem(LS_STORE_HOME); } catch (_e) {}
      if (baseInput) baseInput.value = storefrontHomeURL();
      toast("تم الرجوع للرابط الافتراضي", "success");
      setFrameDevice(captureDevice);
    }
    if (baseInput) {
      baseInput.value = storefrontHomeURL();
      baseInput.addEventListener("keydown", function (e) { if (e.key === "Enter") saveBase(); });
    }
    var baseSave = $("#hsLiveBaseSave");
    if (baseSave) baseSave.onclick = saveBase;
    var baseReset = $("#hsLiveBaseReset");
    if (baseReset) baseReset.onclick = resetBase;
    function setFrameDevice(device) {
      captureDevice = device;
      $$("#hsLiveDevices button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-live-device") === device); });
      if (frame) {
        frame.className = "hs-live-frame" + (device === "mobile" ? " mobile" : "");
        // The storefront switches to its desktop layout at 1024/1200px. Make the
        // frame wide enough so the captured view really is the desktop view.
        frame.style.width = device === "desktop" ? "1220px" : "";
        frame.src = liveHomeURL();
        if (status) { status.textContent = "جارٍ تحميل الصفحة..."; status.className = "hs-live-status"; }
      }
    }
    setFrameDevice(captureDevice);
    if (frame) frame.onload = function () {
      setTimeout(function () {
        if (!status) return;
        var bodyText = "";
        try { bodyText = cleanText(frame.contentDocument && (frame.contentDocument.body || frame.contentDocument.documentElement)); }
        catch (_e) {}
        if (/cannot get|not found|404/i.test(bodyText)) {
          status.textContent = "رابط المتجر غير صحيح — عدّل «رابط المتجر» فوق ثم اضغط حفظ الرابط";
          status.className = "hs-live-status error";
          return;
        }
        status.textContent = "الصفحة جاهزة للقراءة";
        status.className = "hs-live-status ok";
      }, 1800);
    };
    $$("#hsLiveDevices button").forEach(function (b) {
      b.onclick = function () { setFrameDevice(b.getAttribute("data-live-device")); };
    });
    var cancel = $("#hsLiveCancel");
    if (cancel) cancel.onclick = closeModal;
    var capture = $("#hsLiveCapture");
    if (capture) capture.onclick = function () { applyLiveDoc(frame, captureDevice, false); };
    var captureSave = $("#hsLiveCaptureSave");
    if (captureSave) captureSave.onclick = function () { applyLiveDoc(frame, captureDevice, true); };
    var tabCapture = $("#hsLiveTab");
    if (tabCapture) tabCapture.onclick = function () { captureFromTab(false); };
    var tabCaptureSave = $("#hsLiveTabSave");
    if (tabCaptureSave) tabCaptureSave.onclick = function () { captureFromTab(true); };
  }

  /* ---------------- preview / shared renderer ---------------- */
  // The two projects are siblings on disk, but after deployment the storefront
  // often lives at a different path/domain. Keep the real home URL configurable.
  function normalizeHomeURL(value) {
    var v = String(value || "").trim();
    if (!v) return "";
    try {
      var url = new URL(v, location.href);
      url.hash = "";
      url.search = "";
      if (/\/pages\/home\.html$/i.test(url.pathname)) return url.href;
      return new URL("pages/home.html", url.href.replace(/\/$/, "") + "/").href;
    } catch (_e) { return ""; }
  }
  function storefrontHomeURL() {
    var saved = "";
    try { saved = localStorage.getItem(LS_STORE_HOME) || ""; } catch (_e) {}
    var fixed = normalizeHomeURL(saved);
    if (fixed) return fixed;
    try {
      return normalizeHomeURL(new URL("pages/home.html", new URL("../../موقع الخاص بك/", location.href)).href);
    } catch (_e) { return "../../موقع الخاص بك/pages/home.html"; }
  }
  function storefrontBaseURL() {
    return storefrontHomeURL().replace(/\/pages\/home\.html$/i, "/");
  }
  function storefrontURL(relative) {
    try { return new URL(relative, storefrontBaseURL()).href; }
    catch (_e) { return relative; }
  }

  function ensureViewScript() {
    if (window.HSView && typeof window.HSView.render === "function") return Promise.resolve(true);
    if (state.viewPromise) return state.viewPromise;
    state.viewPromise = new Promise(function (resolve) {
      var script = document.createElement("script");
      script.src = storefrontURL("assets/js/hs-view.js?v=20261126d");
      script.onload = function () { resolve(!!(window.HSView && typeof window.HSView.render === "function")); };
      script.onerror = function () { state.viewPromise = null; resolve(false); };
      document.head.appendChild(script);
    });
    return state.viewPromise;
  }

  async function openPreview() {
    var ready = await ensureViewScript();
    if (!ready) toast("تعذر تحميل العارض المشترك — سيُستخدم العارض المحلي", "info");
    openModal("معاينة الصفحة", '<div class="hs-row-buttons" id="hsPreviewDevices">' +
      '<button type="button" class="hs-btn small active" data-prev-device="mobile">موبايل</button>' +
      '<button type="button" class="hs-btn small" data-prev-device="desktop">ديسكتوب</button></div>' +
      '<div class="hs-preview-shell"><div class="hs-preview-screen" id="hsPreviewMount"></div></div>' +
      '<div class="hs-modal-foot"><a class="hs-btn primary" target="_blank" rel="noopener" href="' + esc(storefrontURL("pages/home.html")) + '">' +
      '<i class="fa-solid fa-arrow-up-right-from-square"></i> فتح المتجر الحقيقي</a>' +
      '<button type="button" class="hs-btn ghost" id="hsPreviewClose">إغلاق</button></div>', { kind: "preview", wide: true });
    var renderPreview = function (device) {
      var mount = $("#hsPreviewMount");
      if (!mount) return;
      mount.className = "hs-preview-screen" + (device === "desktop" ? " desktop" : "");
      var fn = window.HSView && typeof window.HSView.render === "function" ? window.HSView.render : renderFallback;
      try { fn(mount, clone(state.doc), getProducts(), { device: device, animate: state.animate, interactive: false, studio: true }); }
      catch (err) { console.warn("[HS] preview renderer failed:", err); renderFallback(mount, state.doc, getProducts(), { device: device, animate: state.animate, studio: true }); }
    };
    var startDevice = viewDevice();
    renderPreview(startDevice);
    $$("#hsPreviewDevices button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-prev-device") === startDevice);
      btn.onclick = function () {
        $$("#hsPreviewDevices button").forEach(function (x) { x.classList.remove("active"); });
        btn.classList.add("active");
        renderPreview(btn.getAttribute("data-prev-device"));
      };
    });
    var close = $("#hsPreviewClose");
    if (close) close.onclick = closeModal;
  }

  /* ---------------- events ---------------- */
  function bindEvents() {
    $("#hsBtnSync").addEventListener("click", syncFromServer);
    $("#hsBtnLive").addEventListener("click", openLiveImport);
    var emptySync = $("#hsEmptySync");
    if (emptySync) emptySync.addEventListener("click", syncFromServer);
    $("#hsBtnSave").addEventListener("click", function () { persist(false); });
    $("#hsBtnPublish").addEventListener("click", function () { persist(true); });
    $("#hsBtnPreview").addEventListener("click", openPreview);
    $("#hsBtnReset").addEventListener("click", showResetModal);
    var restoreBtn = $("#hsBtnRestore");
    if (restoreBtn) restoreBtn.addEventListener("click", showRestoreModal);
    $("#hsBtnHelp").addEventListener("click", showSqlHint);
    $("#hsBtnExport").addEventListener("click", exportDocFile);
    $("#hsBtnImport").addEventListener("click", function () {
      var input = $("#hsImportInput");
      if (input) input.click();
    });
    var importInput = $("#hsImportInput");
    if (importInput) importInput.addEventListener("change", function () {
      if (importInput.files && importInput.files[0]) importDocFile(importInput.files[0]);
      importInput.value = "";
    });
    $("#hsBtnFocus").addEventListener("click", function () { toggleFocus(); });
    document.addEventListener("mousemove", revealFocusTools, { passive: true });
    var focusBar = $("#hsFocusBar");
    if (focusBar) {
      focusBar.addEventListener("mouseenter", scheduleFocusHide);
      focusBar.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-focus-act]");
        if (btn) focusAction(btn.getAttribute("data-focus-act"));
      });
    }
    $("#hsBtnActivity").addEventListener("click", function () {
      var dock = $("#hsDock");
      if (dock) dock.classList.toggle("collapsed");
    });
    $("#hsDockToggle").addEventListener("click", function () {
      var dock = $("#hsDock");
      if (dock) dock.classList.toggle("collapsed");
    });
    $("#hsModalClose").addEventListener("click", closeModal);
    $("#hsModal").addEventListener("click", function (e) { if (e.target === $("#hsModal")) closeModal(); });

    var docName = $("#hsDocName");
    if (docName) {
      docName.value = state.name;
      docName.addEventListener("focus", function () {
        state.editSnapshot = clone(state.doc);
        state.editNameSnapshot = state.name;
      });
      docName.addEventListener("input", function () { state.name = docName.value; markDirty(); });
      docName.addEventListener("change", function () {
        if (state.editSnapshot && (JSON.stringify(state.editSnapshot) !== JSON.stringify(state.doc) || state.editNameSnapshot !== state.name)) {
          pushUndo({ doc: state.editSnapshot, label: "تغيير اسم الصفحة", name: state.editNameSnapshot });
        }
        state.editSnapshot = null;
        state.editNameSnapshot = null;
        addLog("edit", "اسم الصفحة: " + state.name);
      });
    }

    var country = $("#hsCountry");
    if (country) {
      country.value = state.country;
      country.addEventListener("change", async function () {
        flushAutosave();
        state.country = country.value;
        state.selectedId = null;
        state.dirty = false;
        await loadInitial({ keepDevice: true, keepName: true });
        renderAll();
        addLog("sync", "تبديل الدولة إلى " + state.country);
      });
    }
    $$("#hsDeviceSeg button").forEach(function (btn) {
      if (btn.getAttribute("data-device") === state.device) {
        $$("#hsDeviceSeg button").forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
      }
      btn.addEventListener("click", function () { setDevice(btn.getAttribute("data-device")); });
    });

    $("#hsPalette").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-add]");
      if (btn) addBlock(btn.getAttribute("data-add"));
    });

    var templateSearch = $("#hsTemplateSearch");
    if (templateSearch) templateSearch.addEventListener("input", function () {
      state.templateQuery = templateSearch.value;
      renderTemplates();
    });
    $("#hsTemplateGroups").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tpl-group]");
      if (!btn) return;
      state.templateCategory = btn.getAttribute("data-tpl-group");
      renderTemplateGroups();
      renderTemplates();
    });
    $("#hsTemplateList").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tpl]");
      if (btn) applyTemplate(btn.getAttribute("data-tpl"));
    });

    var layers = $("#hsLayers");
    layers.addEventListener("click", function (e) {
      var act = e.target.closest("[data-act]");
      if (act) {
        e.stopPropagation();
        var id = act.getAttribute("data-id");
        var what = act.getAttribute("data-act");
        if (what === "eye") mutate("تبديل ظهور البلوك", function () {
          var b = state.doc.blocks.find(function (x) { return x.id === id; });
          if (b) b.visible = b.visible === false;
        });
        else if (what === "dup") duplicateBlock(id);
        else if (what === "del") removeBlock(id);
        return;
      }
      var li = e.target.closest(".hs-layer");
      if (li) selectBlock(li.getAttribute("data-id"));
    });
    layers.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        var li = e.target.closest(".hs-layer");
        if (li) { e.preventDefault(); selectBlock(li.getAttribute("data-id")); }
      }
    });
    var dragId = null;
    layers.addEventListener("dragstart", function (e) {
      var li = e.target.closest(".hs-layer");
      if (!li) return;
      dragId = li.getAttribute("data-id");
      li.classList.add("dragging");
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); }
    });
    layers.addEventListener("dragover", function (e) {
      var li = e.target.closest(".hs-layer");
      if (!li || !dragId) return;
      e.preventDefault();
      $$(".hs-layer", layers).forEach(function (x) { x.classList.remove("drag-over"); });
      if (li.getAttribute("data-id") !== dragId) li.classList.add("drag-over");
    });
    layers.addEventListener("drop", function (e) {
      var li = e.target.closest(".hs-layer");
      if (!li || !dragId) return;
      e.preventDefault();
      var targetId = li.getAttribute("data-id");
      if (targetId === dragId) return;
      mutate("تغيير ترتيب الطبقات", function () {
        var from = state.doc.blocks.findIndex(function (b) { return b.id === dragId; });
        var to = state.doc.blocks.findIndex(function (b) { return b.id === targetId; });
        if (from < 0 || to < 0) return;
        var moved = state.doc.blocks.splice(from, 1)[0];
        var insertAt = from < to ? to - 1 : to;
        state.doc.blocks.splice(insertAt, 0, moved);
      });
      dragId = null;
    });
    layers.addEventListener("dragend", function () {
      dragId = null;
      $$(".hs-layer", layers).forEach(function (x) { x.classList.remove("dragging", "drag-over"); });
    });

    var canvas = $("#hsCanvas");
    canvas.addEventListener("click", function (e) {
      var node = e.target.closest("[data-hs-block]");
      if (!node) return;
      e.preventDefault();
      selectBlock(node.getAttribute("data-hs-block"));
    });

    var zoom = $("#hsZoom");
    if (zoom) {
      zoom.value = String(state.zoom);
      var applyZoom = function (setInline) {
        state.zoom = num(zoom.value, 75);
        var frame = $("#hsFrame");
        // Only pin an inline value after the user moves the slider, so the
        // responsive defaults in CSS still work on smaller screens.
        if (setInline && frame) frame.style.setProperty("--hs-zoom", String(state.zoom / 100));
        var label = $("#hsZoomLabel");
        if (label) label.textContent = state.zoom + "%";
      };
      zoom.addEventListener("input", function () { applyZoom(true); });
      applyZoom(false);
    }
    var animToggle = $("#hsAnimateToggle");
    if (animToggle) animToggle.addEventListener("click", function () {
      state.animate = !state.animate;
      animToggle.classList.toggle("active", state.animate);
      paintCanvas();
    });

    $("#hsTabs").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      state.tab = btn.getAttribute("data-tab");
      $$("#hsTabs button").forEach(function (x) { x.classList.toggle("active", x === btn); });
      $$(".hs-panel").forEach(function (p) { p.classList.toggle("active", p.getAttribute("data-panel") === state.tab); });
    });

    var inspector = $("#hsInspectorBody");
    inspector.addEventListener("focusin", function (e) {
      if (e.target.matches("input, select, textarea")) state.editSnapshot = clone(state.doc);
    });
    inspector.addEventListener("input", function (e) { handleInspectorInput(e.target, false); });
    inspector.addEventListener("change", function (e) { handleInspectorInput(e.target, true); });
    inspector.addEventListener("click", function (e) { handleInspectorClick(e); });

    var upload = $("#hsUploadInput");
    if (upload) upload.addEventListener("change", function () {
      if (upload.files && upload.files[0]) uploadImage(upload.files[0]);
      upload.value = "";
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeModal(); return; }
      var modal = $("#hsModal");
      if (modal && !modal.hidden) return;
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      var key = String(e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        if (typing) return; // keep native text-field undo
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (!typing && (e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        e.preventDefault();
        removeBlock(state.selectedId);
      }
    });

    var modal = $("#hsModal");
    modal.addEventListener("click", function (e) {
      var pick = e.target.closest("[data-pick]");
      if (pick) { togglePickedProduct(pick.getAttribute("data-pick")); return; }
      var rm = e.target.closest("[data-remove-item]");
      if (rm) {
        var idx = num(rm.getAttribute("data-remove-item"), -1);
        var b = getSelected();
        if (b && b.items && b.items[idx]) {
          mutate("إزالة منتج", function () { b.items.splice(idx, 1); });
          renderProductChips();
          if (state.modalKind === "picker") renderPicker();
        }
      }
    });
  }

  function handleInspectorInput(el, isChange) {
    if (!el || !el.id && !el.getAttribute("data-bind") && !el.getAttribute("data-letter")) return;
    var b = getSelected();
    var changed = false;

    if (el.id === "hsTitle" && b) {
      b.text.title = el.value;
      syncLetters(b);
      changed = true;
    } else if (el.id === "hsSubtitle" && b) {
      b.text.subtitle = el.value;
      changed = true;
    } else if (el.getAttribute("data-letter") != null && b) {
      var idx = num(el.getAttribute("data-letter"), -1);
      if (b.text.perLetter[idx]) { b.text.perLetter[idx].color = el.value; changed = true; }
    } else if (el.id === "hsImgUrl") {
      var im = currentImage();
      if (im) { im.url = el.value.trim(); changed = true; }
    } else if (el.id === "hsImgZoom" || el.id === "hsImgX" || el.id === "hsImgY" ||
      el.id === "hsImgW" || el.id === "hsImgH" || el.id === "hsImgRadius" ||
      el.id === "hsImgOpacity" || el.id === "hsImgZ") {
      var image = currentImage();
      if (image) {
        if (el.id === "hsImgZoom") { image.zoom = num(el.value, 1); var out = $("#hsImgZoomOut"); if (out) out.textContent = image.zoom.toFixed(2) + "×"; }
        if (el.id === "hsImgX") { image.cropX = num(el.value, 50); image.x = image.cropX; }
        if (el.id === "hsImgY") { image.cropY = num(el.value, 50); image.y = image.cropY; }
        if (el.id === "hsImgW") image.w = num(el.value, 100);
        if (el.id === "hsImgH") image.h = num(el.value, 100);
        if (el.id === "hsImgRadius") image.radius = el.value;
        if (el.id === "hsImgOpacity") image.opacity = num(el.value, 1);
        if (el.id === "hsImgZ") image.z = num(el.value, 1);
        changed = true;
      }
    } else if (el.id === "hsAnimTarget") {
      state.animTarget = el.value;
      renderInspector();
      return;
    } else if (el.getAttribute("data-bind")) {
      var path = el.getAttribute("data-bind");
      var bindPath = path;
      var target = b || {};
      if (path.indexOf("anim.") === 0) { target = currentAnim(); bindPath = path.slice(5); }
      var value = el.type === "checkbox" ? el.checked : el.value;
      if (el.type === "range" || el.type === "number") value = num(el.value, 0);
      if (getPath(target, bindPath) !== value) { setPath(target, bindPath, value); changed = true; }
      var output = $('[data-output="' + path + '"]');
      if (output) output.textContent = String(value);
      if (path === "style.background" && el.type === "color") {
        $$('[data-bind="style.background"]').forEach(function (x) { if (x !== el) x.value = value; });
      }
      if (path === "style.color" && el.type === "color") {
        $$('[data-bind="style.color"]').forEach(function (x) { if (x !== el) x.value = value; });
      }
    }

    if (!b) return;
    var label = "تعديل " + (el.id === "hsTitle" ? "العنوان" : el.id === "hsSubtitle" ? "العنوان الفرعي" : (el.getAttribute("data-bind") || el.id || "العنصر"));
    // `input` already mutated the doc, so `change` usually sees no delta.
    // Commit the undo snapshot on `change` regardless of that second delta.
    if (isChange) {
      if (state.editSnapshot && JSON.stringify(state.editSnapshot) !== JSON.stringify(state.doc)) {
        pushUndo({ doc: state.editSnapshot, label: label });
      }
      state.editSnapshot = null;
      addLog("edit", label);
    }
    if (!changed) return;
    markDirty();
    if (el.id === "hsTitle" || el.id === "hsSubtitle") renderLetterChips();
    paintCanvas();
  }

  function handleInspectorClick(e) {
    var imgRow = e.target.closest("[data-img]");
    if (imgRow) {
      state.imageIndex = num(imgRow.getAttribute("data-img"), 0);
      renderInspector();
      return;
    }
    var action = e.target.closest("#hsImgAdd, #hsImgRemove, #hsImgUpload, #hsImgCropModal, #hsProductPick, #hsProductClear");
    if (!action) return;
    var b = getSelected();
    if (!b) { toast("اختر بلوكاً أولاً", "info"); return; }
    if (action.id === "hsImgAdd") {
      mutate("إضافة صورة", function () {
        b.images.push(makeImage(""));
        state.imageIndex = b.images.length - 1;
        state.animTarget = "img:" + state.imageIndex;
      });
    } else if (action.id === "hsImgRemove") {
      var im = currentImage();
      if (!im) { toast("لا توجد صورة للحذف", "info"); return; }
      mutate("حذف صورة", function () {
        b.images = b.images.filter(function (x) { return x.id !== im.id; });
        state.imageIndex = Math.max(0, state.imageIndex - 1);
        state.animTarget = "block";
      });
    } else if (action.id === "hsImgUpload") {
      var input = $("#hsUploadInput");
      if (input) input.click();
    } else if (action.id === "hsImgCropModal") {
      openCropModal();
    } else if (action.id === "hsProductPick") {
      openProductPicker();
    } else if (action.id === "hsProductClear") {
      mutate("مسح المنتجات المختارة", function () { b.items = []; });
    }
  }

  /* ---------------- boot ---------------- */
  async function init() {
    if (window.adminAuth && typeof window.adminAuth.requireAuth === "function" && !window.adminAuth.requireAuth()) return;
    injectKeyframes();
    initClient();
    renderLog();
    renderTemplateGroups();
    renderTemplates();
    var stageDevice = $("#hsStageDevice");
    if (stageDevice) stageDevice.textContent = state.device === "all" ? "حسب الجهاز" : state.device === "mobile" ? "موبايل" : "ديسكتوب";
    bindEvents();
    // Paint with the same renderer the storefront uses. If the shared script
    // cannot be loaded, paintCanvas() keeps working with its local fallback.
    var sharedViewReady = ensureViewScript();
    await loadInitial();
    if (sb) loadAutoProducts().then(paintCanvas).catch(function () {});
    sharedViewReady.then(function (ok) { if (ok && state.doc.blocks.length) paintCanvas(); });
    var country = $("#hsCountry");
    if (country) country.value = state.country;
    var docName = $("#hsDocName");
    if (docName) docName.value = state.name;
    var deviceBtn = $('#hsDeviceSeg button[data-device="' + state.device + '"]');
    if (deviceBtn) {
      $$("#hsDeviceSeg button").forEach(function (x) { x.classList.remove("active"); });
      deviceBtn.classList.add("active");
    }
    refreshStatus();
    renderAll();
    addLog("info", "تم فتح استوديو الهوم — " + state.doc.blocks.length + " بلوك");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

// the inâ€‘memory database is initially hardâ€‘coded for offline/demo mode.
// we declare it with `let` so we can merge remote products later.
let productsDatabase = {
  "shirt-001": {
    id: "shirt-001",
    name: "Ù‚Ù…ÙŠØµ Ø±Ø¬Ø§Ù„ÙŠ ÙƒÙ„Ø§Ø³ÙŠÙƒÙŠ",
    category: "Ù…Ù„Ø§Ø¨Ø³ ÙˆØ£Ø­Ø°ÙŠØ©",
    price: 89.99,
    originalPrice: 129.99,
    rating: 4.5,
    reviewCount: 145,
    image: "assets/images/0950a0e8-7f10-4804-98a9-62039206aa80.jpg",
    images: ["assets/images/0950a0e8-7f10-4804-98a9-62039206aa80.jpg"],
    description: "Ù‚Ù…ÙŠØµ Ø±Ø¬Ø§Ù„ÙŠ ÙØ§Ø®Ø± Ù…ØµÙ†ÙˆØ¹ Ù…Ù† Ø§Ù„Ù‚Ø·Ù† Ø§Ù„Ø·Ø¨ÙŠØ¹ÙŠ 100% Ø¨Ø¬ÙˆØ¯Ø© Ø¹Ø§Ù„ÙŠØ©. ÙŠØªÙ…ÙŠØ² Ø¨ØªØµÙ…ÙŠÙ… ÙƒÙ„Ø§Ø³ÙŠÙƒÙŠ Ø£Ù†ÙŠÙ‚ ÙŠÙ†Ø§Ø³Ø¨ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ù†Ø§Ø³Ø¨Ø§Øª."
  },
  "jeans-001": {
    id: "jeans-001",
    name: "Ø¨Ù†Ø·Ø§Ù„ Ø¬ÙŠÙ†Ø² Ø±Ø¬Ø§Ù„ÙŠ",
    category: "Ù…Ù„Ø§Ø¨Ø³ ÙˆØ£Ø­Ø°ÙŠØ©",
    price: 149.99,
    originalPrice: 199.99,
    rating: 4.3,
    reviewCount: 98,
    image: "assets/images/b666b5e1-4df9-4c22-9ef8-ce04ccd627.jpg",
    images: ["assets/images/b666b5e1-4df9-4c22-9ef8-ce04ccd627.jpg"],
    description: "Ø¨Ù†Ø·Ø§Ù„ Ø¬ÙŠÙ†Ø² Ø¹ØµØ±ÙŠ Ø¨Ø£Ø³Ù„ÙˆØ¨ ÙƒØ§Ø¬ÙˆØ§Ù„ Ù…Ø±ÙŠØ­. Ù…ØµÙ†ÙˆØ¹ Ù…Ù† Ø§Ù„Ø¬ÙŠÙ†Ø² Ø§Ù„ÙƒØ«ÙŠÙ Ø§Ù„Ø°ÙŠ ÙŠØ¯ÙˆÙ… Ø·ÙˆÙŠÙ„Ø§Ù‹."
  },
  "phone-001": {
    id: "phone-001",
    name: "Ù‡Ø§ØªÙ Ø°ÙƒÙŠ 5G",
    category: "Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ§Øª",
    price: 799.99,
    originalPrice: 999.99,
    rating: 4.7,
    reviewCount: 523,
    image: "assets/images/cdd9565a-22a5-49f9-903a-ec55a93d54fa.jpg",
    images: ["assets/images/cdd9565a-22a5-49f9-903a-ec55a93d54fa.jpg"],
    description: "Ù‡Ø§ØªÙ Ø°ÙƒÙŠ Ø­Ø¯ÙŠØ« Ø¨ØªÙ‚Ù†ÙŠØ© 5G Ø³Ø±ÙŠØ¹Ø©. Ø´Ø§Ø´Ø© OLED Ø¨Ø¯Ù‚Ø© Ø¹Ø§Ù„ÙŠØ© ÙˆÙƒØ§Ù…ÙŠØ±Ø§ Ø§Ø­ØªØ±Ø§ÙÙŠØ©."
  },
  "laptop-001": {
    id: "laptop-001",
    name: "Ù„Ø§Ø¨ØªÙˆØ¨ Ø§Ø­ØªØ±Ø§ÙÙŠ",
    category: "Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ§Øª",
    price: 1299.99,
    originalPrice: 1599.99,
    rating: 4.8,
    reviewCount: 412,
    image: "assets/images/4c84d7a6-8257-473a-846c-ef2d58c30b2f.jpg",
    images: ["assets/images/4c84d7a6-8257-473a-846c-ef2d58c30b2f.jpg"],
    description: "Ù„Ø§Ø¨ØªÙˆØ¨ Ø§Ø­ØªØ±Ø§ÙÙŠ Ø®ÙÙŠÙ ÙˆÙ‚ÙˆÙŠ. Ù…ØµÙ…Ù… Ù„Ù„Ø¹Ù…Ù„ ÙˆØ§Ù„Ø¥Ù†ØªØ§Ø¬ÙŠØ© Ø§Ù„Ø¹Ø§Ù„ÙŠØ©."
  },
  "camera-001": {
    id: "camera-001",
    name: "ÙƒØ§Ù…ÙŠØ±Ø§ Ø¯ÙŠØ¬ÙŠØªØ§Ù„ Ø§Ø­ØªØ±Ø§ÙÙŠØ©",
    category: "Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠØ§Øª",
    price: 899.99,
    originalPrice: 1199.99,
    rating: 4.6,
    reviewCount: 287,
    image: "assets/images/32618787-22d7-46e5-9f80-423e2b39f8a7.jpg",
    images: ["assets/images/32618787-22d7-46e5-9f80-423e2b39f8a7.jpg"],
    description: "ÙƒØ§Ù…ÙŠØ±Ø§ Ø¯ÙŠØ¬ÙŠØªØ§Ù„ Ø§Ø­ØªØ±Ø§ÙÙŠØ© Ù„Ø§Ù„ØªÙ‚Ø§Ø· Ø§Ù„ØµÙˆØ± ÙˆØ§Ù„ÙÙŠØ¯ÙŠÙˆÙ‡Ø§Øª Ø¨Ø¯Ù‚Ø© Ø¹Ø§Ù„ÙŠØ©."
  },
  "skincare-001": {
    id: "skincare-001",
    name: "Ù…Ø¬Ù…ÙˆØ¹Ø© Ø§Ù„Ø¹Ù†Ø§ÙŠØ© Ø¨Ø§Ù„Ø¨Ø´Ø±Ø©",
    category: "Ø¬Ù…Ø§Ù„ ÙˆØ¹Ù†Ø§ÙŠØ©",
    price: 59.99,
    originalPrice: 89.99,
    rating: 4.4,
    reviewCount: 178,
    image: "assets/images/5f1a3ca3-36b5-49f8-aa46-fe4d0a45c7fb.jpg",
    images: ["assets/images/5f1a3ca3-36b5-49f8-aa46-fe4d0a45c7fb.jpg"],
    description: "Ù…Ø¬Ù…ÙˆØ¹Ø© Ø´Ø§Ù…Ù„Ø© Ù„Ù„Ø¹Ù†Ø§ÙŠØ© Ø¨Ø§Ù„Ø¨Ø´Ø±Ø© ØªØ¶Ù… Ù…Ù†ØªØ¬Ø§Øª Ø·Ø¨ÙŠØ¹ÙŠØ© Ù„Ù„ØªØ±Ø·ÙŠØ¨ ÙˆØ§Ù„ØªÙ†Ø¹ÙŠÙ…."
  },
  "perfume-001": {
    id: "perfume-001",
    name: "Ø¹Ø·Ø± ÙØ§Ø®Ø±",
    category: "Ø¬Ù…Ø§Ù„ ÙˆØ¹Ù†Ø§ÙŠØ©",
    price: 79.99,
    originalPrice: 119.99,
    rating: 4.7,
    reviewCount: 234,
    image: "assets/images/e3ce92e4-aaeb-4d95-ac7c-3c4fffa74128..jpg",
    images: ["assets/images/e3ce92e4-aaeb-4d95-ac7c-3c4fffa74128..jpg"],
    description: "Ø¹Ø·Ø± ÙØ§Ø®Ø± Ø¨Ø±Ø§Ø¦Ø­Ø© Ø³Ø§Ø­Ø±Ø© ÙˆØ·ÙˆÙŠÙ„Ø© Ø§Ù„Ø£Ù…Ø¯. Ù…Ø²ÙŠØ¬ Ù…ØªÙˆØ§Ø²Ù† Ù…Ù† Ø§Ù„Ø±ÙˆØ§Ø¦Ø­ Ø§Ù„Ø±Ø§Ù‚ÙŠØ©."
  },
  "makeup-001": {
    id: "makeup-001",
    name: "Ù…Ø¬Ù…ÙˆØ¹Ø© Ù…Ø³ØªØ­Ø¶Ø±Ø§Øª Ø§Ù„ØªØ¬Ù…ÙŠÙ„",
    category: "Ø¬Ù…Ø§Ù„ ÙˆØ¹Ù†Ø§ÙŠØ©",
    price: 49.99,
    originalPrice: 74.99,
    rating: 4.5,
    reviewCount: 312,
    image: "assets/images/7d7a0e08-5ebb-44ff-9b3c-286cc7a779ba.jpg",
    images: ["assets/images/7d7a0e08-5ebb-44ff-9b3c-286cc7a779ba.jpg"],
    description: "Ù…Ø¬Ù…ÙˆØ¹Ø© Ø´Ø§Ù…Ù„Ø© Ù…Ù† Ù…Ø³ØªØ­Ø¶Ø±Ø§Øª Ø§Ù„ØªØ¬Ù…ÙŠÙ„ Ù…Ø«Ø§Ù„ÙŠØ© Ù„Ù„Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„ÙŠÙˆÙ…ÙŠ ÙˆØ§Ù„Ù…Ù†Ø§Ø³Ø¨Ø§Øª."
  },
  "shoes-001": {
    id: "shoes-001",
    name: "Ø­Ø°Ø§Ø¡ Ø±ÙŠØ§Ø¶ÙŠ Ø§Ø­ØªØ±Ø§ÙÙŠ",
    category: "Ø±ÙŠØ§Ø¶Ø© ÙˆØªØ±ÙÙŠÙ‡",
    price: 129.99,
    originalPrice: 179.99,
    rating: 4.6,
    reviewCount: 267,
    image: "assets/images/1f2269e3-3b3c-4c33-9bfe-606c60be3058.jpg",
    images: ["assets/images/1f2269e3-3b3c-4c33-9bfe-606c60be3058.jpg"],
    description: "Ø­Ø°Ø§Ø¡ Ø±ÙŠØ§Ø¶ÙŠ Ø§Ø­ØªØ±Ø§ÙÙŠ Ø¨ØªÙ‚Ù†ÙŠØ© ØªÙ‚Ù„ÙŠÙ„ Ø§Ù„ØµØ¯Ù…Ø§Øª Ù„Ù„Ø±Ø§Ø­Ø© ÙˆØ§Ù„Ø¯Ø¹Ù… Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø¬Ø±ÙŠ."
  },
  "dumbbells-001": {
    id: "dumbbells-001",
    name: "Ù…Ø¬Ù…ÙˆØ¹Ø© Ø£ÙˆØ²Ø§Ù† ØªÙ…Ø±ÙŠÙ†",
    category: "Ø±ÙŠØ§Ø¶Ø© ÙˆØªØ±ÙÙŠÙ‡",
    price: 89.99,
    originalPrice: 129.99,
    rating: 4.5,
    reviewCount: 145,
    image: "assets/images/def93bdc-ec4d-4423-b7fe-5a61d3f38e99.jpg",
    images: ["assets/images/def93bdc-ec4d-4423-b7fe-5a61d3f38e99.jpg"],
    description: "Ù…Ø¬Ù…ÙˆØ¹Ø© Ø£ÙˆØ²Ø§Ù† ØªÙ…Ø±ÙŠÙ† Ø§Ø­ØªØ±Ø§ÙÙŠØ© Ù…Ø«Ø§Ù„ÙŠØ© Ù„Ù„ØªÙ…Ø§Ø±ÙŠÙ† Ø§Ù„Ù…Ù†Ø²Ù„ÙŠØ© ÙˆØ§Ù„Ø¬ÙŠÙ…."
  },
  "pillow-001": {
    id: "pillow-001",
    name: "ÙˆØ³Ø§Ø¯Ø© Ø´Ø§Ø·Ø¦ ÙØ§Ø®Ø±Ø©",
    category: "Ù…Ù†Ø²Ù„ ÙˆÙ…Ø·Ø¨Ø®",
    price: 39.99,
    originalPrice: 59.99,
    rating: 4.4,
    reviewCount: 89,
    image: "assets/images/40acd78f-ff3c-4e91-9861-32406a7a6633.jpg",
    images: ["assets/images/40acd78f-ff3c-4e91-9861-32406a7a6633.jpg"],
    description: "ÙˆØ³Ø§Ø¯Ø© Ø´Ø§Ø·Ø¦ ÙØ§Ø®Ø±Ø© ØªÙˆÙØ± Ø±Ø§Ø­Ø© Ù‚ØµÙˆÙ‰ ÙˆØ¯Ø¹Ù… Ù„Ù„Ø¹Ù†Ù‚ ÙˆØ§Ù„Ø±Ø£Ø³."
  }
};

// Fix legacy mojibake text in bundled seed products.
const SEED_ARABIC_COPY = {
  "shirt-001": {
    name: "قميص رجالي كلاسيكي",
    category: "ملابس وأحذية",
    description: "قميص رجالي فاخر من القطن الطبيعي بتصميم أنيق مناسب للاستخدام اليومي والمناسبات.",
  },
  "jeans-001": {
    name: "بنطال جينز رجالي",
    category: "ملابس وأحذية",
    description: "بنطال جينز مريح بخامة متينة وقصّة عصرية تناسب الإطلالات اليومية.",
  },
  "phone-001": {
    name: "هاتف ذكي 5G",
    category: "إلكترونيات",
    description: "هاتف ذكي حديث يدعم شبكات 5G مع شاشة عالية الدقة وكاميرا قوية.",
  },
  "laptop-001": {
    name: "لاب توب احترافي",
    category: "إلكترونيات",
    description: "لاب توب خفيف وسريع مناسب للعمل والدراسة وتشغيل البرامج الثقيلة.",
  },
  "camera-001": {
    name: "كاميرا ديجيتال احترافية",
    category: "إلكترونيات",
    description: "كاميرا ديجيتال تلتقط صورًا وفيديوهات بجودة ممتازة في مختلف ظروف الإضاءة.",
  },
  "skincare-001": {
    name: "مجموعة العناية بالبشرة",
    category: "جمال وعناية",
    description: "مجموعة عناية متكاملة لترطيب البشرة وتنظيفها بتركيبة لطيفة.",
  },
  "perfume-001": {
    name: "عطر فاخر",
    category: "جمال وعناية",
    description: "عطر ثابت برائحة مميزة تجمع بين الانتعاش والأناقة.",
  },
  "makeup-001": {
    name: "مجموعة مستحضرات التجميل",
    category: "جمال وعناية",
    description: "باقة متنوعة من مستحضرات التجميل المناسبة للاستخدام اليومي.",
  },
  "shoes-001": {
    name: "حذاء رياضي احترافي",
    category: "رياضة وترفيه",
    description: "حذاء رياضي مريح بخفة عالية ودعم جيد للحركة اليومية.",
  },
  "dumbbells-001": {
    name: "مجموعة أوزان تمرين",
    category: "رياضة وترفيه",
    description: "أوزان متعددة لتدريبات المنزل والجيم مع قبضة مريحة وثبات جيد.",
  },
  "pillow-001": {
    name: "وسادة فاخرة",
    category: "منزل ومطبخ",
    description: "وسادة مريحة بخامة ناعمة لدعم أفضل أثناء النوم.",
  },
};

Object.entries(SEED_ARABIC_COPY).forEach(([id, copy]) => {
  if (!productsDatabase[id]) return;
  productsDatabase[id] = { ...productsDatabase[id], ...copy };
});

const getPagePrefix = () => (window.location.pathname.includes("/pages/") ? "../" : "");

const SUPABASE_BACKOFF_MS = 5 * 60 * 1000;
const DEFAULT_PRODUCT_IMAGE = "assets/images/unnamed.png";

function parseNumeric(value) {
  if (value === null || value === undefined) return 0;
  const normalized = String(value)
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٫]/g, ".")
    .replace(/[،]/g, "")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundPrice(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function repairMojibakeText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/[ÙØÂâ]/.test(text)) return text;

  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) {
      bytes[i] = text.charCodeAt(i) & 0xff;
    }
    const decoded = new TextDecoder("utf-8").decode(bytes).trim();
    if (decoded && /[\u0600-\u06FF]/.test(decoded)) return decoded;
  } catch {
    // ignore conversion failures and keep original text
  }

  return text;
}

function splitImageString(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (/^data:image\//i.test(raw)) return [raw];

  if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || "").trim()).filter(Boolean);
      }
    } catch {
      // non-JSON text falls back to splitting below
    }
  }

  const fromPgArray = raw.startsWith("{") && raw.endsWith("}") ? raw.slice(1, -1) : raw;
  const hasExplicitSeparators = /[;\n\r|]/.test(fromPgArray);

  if (hasExplicitSeparators) {
    return fromPgArray
      .split(/[;\n\r|]+/g)
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  if (fromPgArray.includes(",")) {
    const httpLinks = fromPgArray.match(/https?:\/\//gi) || [];
    const startsLikeSingleUrl = /^\s*['"]?\s*(https?:|data:|blob:)/i.test(fromPgArray);
    if (startsLikeSingleUrl && httpLinks.length <= 1) {
      return [fromPgArray.trim().replace(/^['"]|['"]$/g, "")].filter(Boolean);
    }

    return fromPgArray
      .split(/\s*,\s*/g)
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  return [fromPgArray.trim().replace(/^['"]|['"]$/g, "")].filter(Boolean);
}

function toDirectImageUrl(value) {
  const source = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  if (!source || !/^https?:\/\//i.test(source)) return source;

  const drivePathMatch = source.match(/^https?:\/\/drive\.google\.com\/file\/d\/([^/?#]+)\//i);
  if (drivePathMatch && drivePathMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${drivePathMatch[1]}`;
  }

  try {
    const parsed = new URL(source);
    const host = parsed.hostname.toLowerCase();

    if (host === "drive.google.com") {
      const openId = parsed.searchParams.get("id");
      if (openId) {
        return `https://drive.google.com/uc?export=view&id=${openId}`;
      }

      if (parsed.pathname.toLowerCase() === "/uc") {
        const ucId = parsed.searchParams.get("id");
        if (ucId) {
          parsed.searchParams.set("export", "view");
          return parsed.toString();
        }
      }
    }

    if (host.endsWith("dropbox.com") || host === "dl.dropboxusercontent.com") {
      parsed.hostname = "dl.dropboxusercontent.com";
      parsed.searchParams.delete("dl");
      parsed.searchParams.set("raw", "1");
      return parsed.toString();
    }
  } catch {
    // Keep original URL on parse errors.
  }

  return source;
}

function collectImageCandidates(...values) {
  const bucket = [];

  const append = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => append(entry));
      return;
    }
    if (typeof value === "string") {
      splitImageString(value).forEach((entry) => bucket.push(entry));
      return;
    }
    if (typeof value === "object") {
      if (typeof value.url === "string") bucket.push(value.url);
      if (typeof value.src === "string") bucket.push(value.src);
    }
  };

  values.forEach((value) => append(value));

  const unique = new Set();
  bucket.forEach((entry) => {
    const normalized = toDirectImageUrl(String(entry || "").trim().replace(/\\/g, "/"));
    if (!normalized) return;
    const lowered = normalized.toLowerCase();
    if (lowered === "null" || lowered === "undefined") return;
    unique.add(normalized);
  });

  return [...unique];
}

function extractProductImages(product = {}) {
  const dynamicImageFields = Object.entries(product || {})
    .filter(([key]) => {
      const normalizedKey = String(key || "").trim().toLowerCase();
      if (!normalizedKey) return false;
      return (
        /^image[\s_-]*\d+$/i.test(normalizedKey) ||
        /^img[\s_-]*\d+$/i.test(normalizedKey) ||
        normalizedKey === "extra_links" ||
        normalizedKey === "extra_images" ||
        normalizedKey === "additional_images" ||
        normalizedKey === "more_images"
      );
    })
    .map(([, value]) => value);

  const candidates = collectImageCandidates(
    product.images,
    product.image,
    product.image1,
    product.image2,
    product.image3,
    product.image4,
    product.image5,
    product.image_1,
    product.image_2,
    product.image_3,
    product.image_4,
    product.image_5,
    product.image_url,
    product.imageUrl,
    product.thumbnail,
    product.thumb,
    product.img,
    product.gallery,
    product.extra_links,
    product.extraImages,
    dynamicImageFields
  );

  return candidates.length ? candidates : [DEFAULT_PRODUCT_IMAGE];
}

function resolveProductPrice(product = {}) {
  const listedPrice = parseNumeric(product.price || product.currentPrice || product.finalPrice);
  const originalCandidate = parseNumeric(
    product.originalPrice ||
      product.original_price ||
      product.old_price ||
      product.price_before_discount ||
      product.priceBeforeDiscount
  );
  const discountCandidate = parseNumeric(
    product.price_after_discount ||
      product.discountPrice ||
      product.discount_price ||
      product.sale_price ||
      product.salePrice
  );
  const discountPercentCandidate = parseNumeric(
    product.discount_percent ||
      product.discountPercent ||
      product.discountPercentage ||
      product.discount
  );

  let currentPrice = 0;
  let originalPrice = 0;

  if (listedPrice > 0 && originalCandidate > 0) {
    currentPrice = Math.min(listedPrice, originalCandidate);
    originalPrice = Math.max(listedPrice, originalCandidate);
  } else if (listedPrice > 0) {
    currentPrice = listedPrice;
    originalPrice = listedPrice;
  } else if (originalCandidate > 0) {
    currentPrice = originalCandidate;
    originalPrice = originalCandidate;
  }

  if (discountCandidate > 0) {
    if (originalPrice <= 0 && currentPrice > 0) {
      originalPrice = currentPrice;
    }
    if (currentPrice <= 0 && originalPrice > 0) {
      currentPrice = originalPrice;
    }

    if (originalPrice > 0 && discountCandidate < originalPrice) {
      currentPrice = discountCandidate;
    } else if (listedPrice > 0 && discountCandidate > listedPrice && originalCandidate <= 0) {
      // Handle swapped data where `price` is already discounted and `price_after_discount` carries old price.
      currentPrice = listedPrice;
      originalPrice = discountCandidate;
    } else if (currentPrice <= 0) {
      currentPrice = discountCandidate;
      if (originalPrice <= 0) originalPrice = discountCandidate;
    }
  }

  if (discountPercentCandidate > 0 && discountPercentCandidate < 100) {
    if (originalPrice <= 0 && currentPrice > 0) {
      originalPrice = currentPrice;
    }
    if (originalPrice > 0) {
      const percentBasedPrice = originalPrice * (1 - discountPercentCandidate / 100);
      if (percentBasedPrice > 0 && (currentPrice <= 0 || percentBasedPrice < currentPrice)) {
        currentPrice = percentBasedPrice;
      }
    }
  }

  if (currentPrice <= 0 && originalPrice > 0) currentPrice = originalPrice;
  if (originalPrice <= 0) originalPrice = currentPrice;
  if (currentPrice > originalPrice) {
    const swap = currentPrice;
    currentPrice = originalPrice;
    originalPrice = swap;
  }

  currentPrice = roundPrice(currentPrice);
  originalPrice = roundPrice(originalPrice);

  const hasDiscount = currentPrice > 0 && originalPrice > 0 && currentPrice < originalPrice;
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
    : 0;

  return { currentPrice, originalPrice, hasDiscount, discountPercent };
}

function resolveRatingsSource(product = {}) {
  const source = String(
    product.ratingSource ||
      product.rating_source ||
      product.ratingsSource ||
      product.ratings_source ||
      ""
  )
    .trim()
    .toLowerCase();

  if (source === "ratings" || source === "supabase_ratings" || source === "supabase") {
    return "ratings";
  }

  if (product.hasSupabaseRatings === true || product.fromRatingsTable === true) {
    return "ratings";
  }

  return "";
}

function resolveProductRating(product = {}) {
  // Ratings are considered authoritative only when they are explicitly marked
  // as coming from the `ratings` table.
  const source = resolveRatingsSource(product);
  if (source !== "ratings") {
    return { rating: 0, reviewCount: 0 };
  }

  const storedRating = parseNumeric(
    product.rating || product.rate || product.average_rating || product.avg_rating
  );
  const storedCount = Math.max(
    0,
    Math.round(
      parseNumeric(
        product.reviewCount ||
          product.review_count ||
          product.reviews_count ||
          product.ratings_count
      )
    )
  );

  return {
    rating: storedCount > 0 ? Math.max(0, Math.min(5, storedRating || 0)) : 0,
    reviewCount: storedCount > 0 ? storedCount : 0,
  };
}

function renderProductStars(ratingValue) {
  const rating = Math.max(0, Math.min(5, Number(ratingValue) || 0));
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  const icons = [];

  for (let i = 0; i < full; i += 1) icons.push("star");
  if (half) icons.push("star_half");
  for (let i = 0; i < empty; i += 1) icons.push("star_border");

  return icons.map((icon) => `<span class="material-icons-outlined">${icon}</span>`).join("");
}

function normalizeProductRecord(product = {}) {
  const productId = product.id ?? product.product_id;
  if (productId === null || typeof productId === "undefined") return null;

  const images = extractProductImages(product);
  const priceInfo = resolveProductPrice(product);
  const ratingInfo = resolveProductRating(product);
  const ratingSource = resolveRatingsSource(product);
  const sellerEmail = String(
    product.sellerEmail ||
      product.seller_email ||
      product.owner_email ||
      product.user_email ||
      product.email ||
      product.seller ||
      ""
  ).trim();
  const sellerId = String(product.seller_id ?? product.owner_id ?? product.user_id ?? "").trim();
  const ownerId = String(product.owner_id ?? product.seller_id ?? product.user_id ?? "").trim();
  const userId = String(product.user_id ?? product.owner_id ?? product.seller_id ?? "").trim();
  const ownerEmail = String(
    product.owner_email ||
      product.seller_email ||
      product.user_email ||
      product.email ||
      sellerEmail ||
      ""
  ).trim();
  const userEmail = String(
    product.user_email ||
      product.owner_email ||
      product.seller_email ||
      product.email ||
      sellerEmail ||
      ""
  ).trim();
  const genericEmail = String(product.email || userEmail || ownerEmail || sellerEmail || "").trim();

  const source = product.source || "internal";
  const availableCountries = Array.isArray(product.available_countries)
    ? product.available_countries
    : [];

  return {
    id: String(productId),
    name: repairMojibakeText(
      product.name || product.productName || product.product_name || product.title || ""
    ),
    category: repairMojibakeText(product.category || product.cat || product.type || ""),
    price: priceInfo.currentPrice,
    originalPrice: priceInfo.originalPrice,
    discountPrice: priceInfo.hasDiscount ? priceInfo.currentPrice : null,
    price_after_discount: priceInfo.hasDiscount ? priceInfo.currentPrice : null,
    rating: ratingInfo.rating,
    reviewCount: ratingInfo.reviewCount,
    ratingSource: ratingSource || "",
    rating_source: ratingSource || "",
    image: images[0],
    images,
    image1: product.image1 || product.image_1 || images[0] || "",
    image2: product.image2 || product.image_2 || "",
    image3: product.image3 || product.image_3 || "",
    image4: product.image4 || product.image_4 || "",
    image5: product.image5 || product.image_5 || "",
    image_url: product.image_url || product.imageUrl || "",
    imageUrl: product.imageUrl || product.image_url || "",
    thumbnail: product.thumbnail || "",
    thumb: product.thumb || "",
    img: product.img || "",
    gallery: product.gallery || "",
    extra_links: product.extra_links || product.extraImages || product.additional_images || product.more_images || "",
    description: repairMojibakeText(
      product.description || product.desc || product.details || "لا يوجد وصف متاح لهذا المنتج."
    ),
    reviews: Array.isArray(product.reviews) ? product.reviews : [],
    stockStatus: product.stockStatus || product.stock_status || "in_stock",
    stock: Math.max(0, Math.round(parseNumeric(product.stock || product.quantity || 0))),
    seller: product.seller || (sellerEmail ? sellerEmail.split("@")[0] : "boda"),
    seller_id: sellerId,
    owner_id: ownerId,
    user_id: userId,
    seller_email: sellerEmail,
    owner_email: ownerEmail,
    user_email: userEmail,
    email: genericEmail,
    sellerEmail: sellerEmail,
    source: source,
    available_countries: availableCountries,
    taager_product_id: product.taager_product_id || "",
  };
}

function isNetworkResolutionError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("err_name_not_resolved") ||
    message.includes("networkerror") ||
    message.includes("network request failed")
  );
}

function isSupabaseTemporarilyUnavailable() {
  return Number(window.__Buda_SUPABASE_UNAVAILABLE_UNTIL || 0) > Date.now();
}

function markSupabaseUnavailable(reason = "network") {
  window.__Buda_SUPABASE_UNAVAILABLE_UNTIL = Date.now() + SUPABASE_BACKOFF_MS;
  window.__Buda_SUPABASE_UNAVAILABLE_REASON = reason;
}

// Offline-first sync: when DNS/network fails we back off and keep local products.
async function loadProductsFromSupabase() {
  if (isSupabaseTemporarilyUnavailable()) return;
  if (!window.supabaseClient || typeof window.supabaseClient.from !== "function") return;

  try {
    const { data, error } = await window.supabaseClient.from("products").select("*");
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) return;

    let addedCount = 0;
    data.forEach((p) => {
      const normalized = normalizeProductRecord(p);
      if (!normalized) return;

      if (!productsDatabase[normalized.id]) {
        addedCount += 1;
      }

      productsDatabase[normalized.id] = {
        ...(productsDatabase[normalized.id] || {}),
        ...normalized,
        created_at: p.created_at || productsDatabase[normalized.id]?.created_at,
      };
    });

    if (addedCount > 0) {
      console.log("synced products from Supabase:", Object.keys(productsDatabase).length, "(+" + addedCount + " new)");
      if (typeof renderHomeProducts === "function") renderHomeProducts();
      if (typeof renderDailyProducts === "function") renderDailyProducts();
      document.dispatchEvent(new CustomEvent("boda:products-updated", { detail: { added: addedCount } }));
    }
  } catch (error) {
    if (isNetworkResolutionError(error)) {
      markSupabaseUnavailable("network");
      if (!window.__Buda_SUPABASE_DOWN_NOTICE_SHOWN__) {
        console.warn("Supabase is temporarily unreachable. Using local product data.");
        window.__Buda_SUPABASE_DOWN_NOTICE_SHOWN__ = true;
      }
      return;
    }

    console.error("Supabase sync error", error);
    if (error.code === "42501" || /policy/i.test(String(error.message || ""))) {
      console.warn("RLS may block product reads. Add a SELECT policy for anon users.");
    }
  }
}

function trySync() {
  if (isSupabaseTemporarilyUnavailable()) return;
  if (window.supabaseClient && typeof window.supabaseClient.from === "function") {
    loadProductsFromSupabase();
    return;
  }
  requestAnimationFrame(trySync);
}

trySync();

const getImagePath = (path) => {
  const isFile = window.location && window.location.protocol === "file:";
  const fallback = isFile
    ? window.location.pathname.includes("/pages/")
      ? `../${DEFAULT_PRODUCT_IMAGE}`
      : DEFAULT_PRODUCT_IMAGE
    : `/${DEFAULT_PRODUCT_IMAGE}`;

  const source = collectImageCandidates(path)[0] || "";
  if (!source) return fallback;
  if (/^\s*javascript:/i.test(source)) return fallback;
  if (/^(https?:|data:|blob:)/i.test(source)) return source;

  let normalized = source.replace(/^\.{1,2}\//, "").replace(/^\//, "");
  if (isFile) {
    const prefix = window.location.pathname.includes("/pages/") ? "../" : "";
    return prefix + normalized;
  }
  return "/" + normalized;
};

const _getAllProducts = () => {
  let all = { ...productsDatabase };

  // include any products cached from Supabase queries; these are stored by
  // `addProductToStore` using stringified ids, so merge them as well.
  if (window._supabaseProductCache) {
    all = { ...all, ...window._supabaseProductCache };
  }

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (
      key === "boda_all_products" ||
      key.startsWith("seller_products_") ||
      key.startsWith("partner_products_")
    ) {
      try {
        const sellerProducts = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(sellerProducts)) {
          sellerProducts.forEach((product) => {
            let sellerEmail = product.sellerEmail || product.seller_email || product.seller;
            if (!sellerEmail && key.startsWith("seller_products_")) {
              sellerEmail = key.replace("seller_products_", "");
            }

            const normalized = normalizeProductRecord({
              ...product,
              sellerEmail,
            });

            if (!normalized || all[normalized.id]) return;
            all[normalized.id] = normalized;
          });
        }
      } catch (error) {
        console.error("Error loading products:", error);
      }
    }

    // Merge local comments without overriding ratings sourced from the ratings table.
    if (key && key.startsWith("product_comments_")) {
      const productId = key.replace("product_comments_", "");
      const target = all[productId];
      if (!target) continue;

      try {
        const comments = JSON.parse(localStorage.getItem(key));
        if (!Array.isArray(comments) || !comments.length) continue;

        const validRatings = comments
          .map((item) => ({
            rating: Number(item.rating) || 0,
            text: item.text || "",
            name: item.name || "",
            createdAt: item.createdAt || "",
          }))
          .filter((item) => item.rating > 0);

        if (!validRatings.length) continue;

        all[productId] = {
          ...target,
          reviews: validRatings,
          comments: validRatings,
        };
      } catch (error) {
        console.warn("Invalid product comments for", productId, error);
      }
    }
  }

  return all;
};

const getProductById = (id) => {
  const all = _getAllProducts();
  const key = String(id);
  return all[key] || null;
};

const getCartKey = () => {
  const userEmail = localStorage.getItem("userEmail");
  return userEmail ? `cart_${userEmail}` : "cart";
};

const getCartUserEmail = () => {
  return (localStorage.getItem("userEmail") || "").toString().trim().toLowerCase();
};

const getWishlistKey = () => {
  const userEmail = localStorage.getItem("userEmail");
  return userEmail ? `wishlist_${userEmail}` : "wishlist";
};

const getSupabaseForCart = () => {
  if (window.supabaseClient && typeof window.supabaseClient.from === "function") {
    return window.supabaseClient;
  }
  if (typeof getSupabaseClient === "function") {
    try { return getSupabaseClient(); } catch { return null; }
  }
  return null;
};

async function syncCartToSupabase(cart) {
  const client = getSupabaseForCart();
  const email = getCartUserEmail();
  if (!client || !email) return;

  const items = Array.isArray(cart) ? cart : [];
  try {
    await client.from("cart_items").delete().eq("user_email", email);
    if (items.length) {
      const rows = items.map((item) => ({
        user_email: email,
        product_id: String(item.id || item.product_id || ""),
        name: String(item.name || item.product_name || ""),
        price: Number(item.price) || 0,
        quantity: Math.max(1, Number(item.quantity) || 1),
        image: String(item.image || item.image_url || item.imageUrl || item.thumbnail || ""),
        category: String(item.category || ""),
        description: String(item.description || ""),
        seller_id: String(item.seller_id || item.owner_id || ""),
        seller_email: String(item.seller_email || item.owner_email || ""),
        owner_id: String(item.owner_id || item.seller_id || ""),
        owner_email: String(item.owner_email || item.seller_email || ""),
        source: String(item.source || "internal"),
        taager_product_id: String(item.taager_product_id || ""),
        country_code: String(item.country_code || ""),
      }));
      await client.from("cart_items").insert(rows);
    }
  } catch (e) {
    console.warn("syncCartToSupabase error (non-fatal):", e);
  }
}

async function loadCartFromSupabase() {
  const client = getSupabaseForCart();
  const email = getCartUserEmail();
  if (!client || !email) return null;

  try {
    const { data, error } = await client
      .from("cart_items")
      .select("*")
      .eq("user_email", email);
    if (error) return null;
    if (!Array.isArray(data) || !data.length) return [];

    return data.map((row) => ({
      id: row.product_id,
      product_id: row.product_id,
      name: row.name,
      price: Number(row.price) || 0,
      quantity: Math.max(1, Number(row.quantity) || 1),
      image: row.image,
      image_url: row.image || "",
      category: row.category,
      description: row.description,
      seller_id: row.seller_id,
      seller_email: row.seller_email,
      owner_id: row.owner_id,
      owner_email: row.owner_email,
      source: row.source || "internal",
      taager_product_id: row.taager_product_id || "",
      country_code: row.country_code || "",
    }));
  } catch (e) {
    console.warn("loadCartFromSupabase error (non-fatal):", e);
    return null;
  }
}

let _cartLoadedFromSupabase = false;
let _wishlistLoadedFromSupabase = false;

async function syncWishlistToSupabase(wishlist) {
  const client = getSupabaseForCart();
  const email = getCartUserEmail();
  if (!client || !email) return;

  const items = Array.isArray(wishlist) ? wishlist : [];
  try {
    await client.from("wishlist_items").delete().eq("user_email", email);
    if (items.length) {
      const rows = items.map((item) => ({
        user_email: email,
        product_id: String(item.id || item.product_id || ""),
        name: String(item.name || item.product_name || ""),
        price: Number(item.price) || 0,
        image: String(item.image || item.image_url || item.imageUrl || item.thumbnail || ""),
        image_url: String(item.image_url || item.image || item.imageUrl || ""),
        category: String(item.category || ""),
        description: String(item.description || ""),
        seller_id: String(item.seller_id || item.owner_id || ""),
        seller_email: String(item.seller_email || item.owner_email || ""),
        source: String(item.source || "internal"),
        taager_product_id: String(item.taager_product_id || ""),
      }));
      await client.from("wishlist_items").insert(rows);
    }
  } catch (e) {
    console.warn("syncWishlistToSupabase error (non-fatal):", e);
  }
}

async function loadWishlistFromSupabase() {
  const client = getSupabaseForCart();
  const email = getCartUserEmail();
  if (!client || !email) return null;

  try {
    const { data, error } = await client
      .from("wishlist_items")
      .select("*")
      .eq("user_email", email);
    if (error) return null;
    if (!Array.isArray(data) || !data.length) return [];

    return data.map((row) => ({
      id: row.product_id,
      product_id: row.product_id,
      name: row.name,
      price: Number(row.price) || 0,
      image: row.image,
      image_url: row.image_url || row.image || "",
      category: row.category,
      description: row.description,
      seller_id: row.seller_id,
      seller_email: row.seller_email,
      source: row.source || "internal",
      taager_product_id: row.taager_product_id || "",
    }));
  } catch (e) {
    console.warn("loadWishlistFromSupabase error (non-fatal):", e);
    return null;
  }
}

async function autoLoadWishlistFromSupabase() {
  const email = getCartUserEmail();
  if (!email) {
    _wishlistLoadedFromSupabase = true;
    return;
  }

  const supabaseWishlist = await loadWishlistFromSupabase();
  const localWishlist = getWishlist();

  if (supabaseWishlist === null) {
    _wishlistLoadedFromSupabase = true;
    return;
  }

  if (supabaseWishlist.length > 0) {
    if (localWishlist.length === 0) {
      localStorage.setItem(getWishlistKey(), JSON.stringify(supabaseWishlist));
    } else {
      const merged = [...supabaseWishlist];
      localWishlist.forEach((localItem) => {
        const exists = merged.some((s) => String(s.id) === String(localItem.id));
        if (!exists) merged.push(localItem);
      });
      localStorage.setItem(getWishlistKey(), JSON.stringify(merged));
    }
  } else {
    if (localWishlist.length > 0) {
      localStorage.removeItem(getWishlistKey());
    }
  }

  _wishlistLoadedFromSupabase = true;
  const finalWishlist = getWishlist();
  if (finalWishlist.length > 0) {
    syncWishlistToSupabase(finalWishlist);
  }
  document.dispatchEvent(new CustomEvent("boda:wishlist-loaded", { detail: { wishlist: getWishlist() } }));
}

const getCart = () => {
  const cart = localStorage.getItem(getCartKey());
  return cart ? JSON.parse(cart) : [];
};

const saveCart = (cart) => {
  localStorage.setItem(getCartKey(), JSON.stringify(cart));
  updateCartCount();
  if (_cartLoadedFromSupabase) {
    syncCartToSupabase(cart);
  }
};

const getWishlist = () => {
  try {
    const wishlist = localStorage.getItem(getWishlistKey());
    const parsed = wishlist ? JSON.parse(wishlist) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveWishlist = (wishlist, metadata = {}) => {
  const normalizedWishlist = Array.isArray(wishlist)
    ? wishlist
        .map((item) => normalizeProductRecord(item))
        .filter(Boolean)
    : [];
  localStorage.setItem(getWishlistKey(), JSON.stringify(normalizedWishlist));

  if (_wishlistLoadedFromSupabase) {
    syncWishlistToSupabase(normalizedWishlist);
  }

  document.dispatchEvent(
    new CustomEvent("boda:wishlist-updated", {
      detail: {
        ...metadata,
        wishlist: normalizedWishlist,
      },
    })
  );

  return normalizedWishlist;
};

const isInWishlist = (productId) => {
  const targetId = String(productId);
  return getWishlist().some((item) => String(item?.id) === targetId);
};

const updateCartCount = () => {
  const cart = getCart();
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const cartCountElement = document.getElementById("cart-count");
  if (cartCountElement) {
    cartCountElement.textContent = count;
  }
  const navCartCount = document.getElementById("nav-cart-count");
  const deskCartCount = document.getElementById("nav-cart-count-desk");
  if (deskCartCount) {
    deskCartCount.textContent = count;
    if (count > 0) { deskCartCount.classList.remove("nav-cart-0"); }
    else { deskCartCount.classList.add("nav-cart-0"); }
  }
  if (navCartCount) {
    navCartCount.textContent = count;
    if (count > 0) {
      navCartCount.classList.remove("nav-cart-0");
    } else {
      navCartCount.classList.add("nav-cart-0");
    }
  }
};

const notifyCartAdded = (product, quantity = 1) => {
  if (!window.BudaUI?.notify) return;

  const productName = String(product?.name || t("المنتج")).trim();
  const normalizedQuantity = Math.max(1, Number(quantity) || 1);
  const template = normalizedQuantity > 1 ? t("تمت إضافة {0} من {1} إلى السلة") : t("تمت إضافة {1} إلى السلة");
  const message = template.replace("{0}", normalizedQuantity).replace("{1}", productName);

  window.BudaUI.notify(message, { type: "success", duration: 2600 });
};

const addToCart = (product, quantity = 1, options = {}) => {
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  if (!isLoggedIn) {
    // Determine correct relative path to signin page depending on current location
    const loginPath = window.location.pathname.includes('/pages/') ? 'signin/login.html' : 'pages/signin/login.html';
    window.location.href = loginPath;
    return;
  }

  const cart = getCart();
  const targetId = String(product.id);
  const priceInfo = resolveProductPrice(product);
  const existingItem = cart.find((item) => String(item.id) === targetId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    var source = product.source || "internal";
    var taagerProductId = product.taager_product_id || "";
    var countryCode = "";
    if (window.TaagerIntegration) {
      var selected = window.TaagerIntegration.getSelectedCountry();
      if (selected) countryCode = selected.code;
    }

    const productImage = product.image || product.image_url || product.imageUrl || product.thumbnail || product.img || (Array.isArray(product.images) ? product.images[0] : product.images) || "";

    cart.push({
      id: targetId,
      product_id: product.product_id ?? product.id ?? targetId,
      legacy_my_products_id: product.legacy_my_products_id ?? "",
      legacy_product_id: product.legacy_product_id ?? "",
      product_uuid: product.product_uuid ?? product.uuid ?? "",
      name: product.name,
      price: priceInfo.currentPrice,
      quantity,
      image: productImage,
      image_url: product.image_url || product.imageUrl || productImage,
      category: product.category,
      description: product.description,
      seller_id: product.seller_id ?? product.owner_id ?? product.user_id ?? "",
      owner_id: product.owner_id ?? product.seller_id ?? product.owner_id ?? "",
      seller_email: product.seller_email ?? product.owner_email ?? product.user_email ?? product.email ?? "",
      owner_email: product.owner_email ?? product.seller_email ?? product.user_email ?? product.email ?? "",
      source: source,
      taager_product_id: taagerProductId,
      country_code: countryCode,
    });
  }

  saveCart(cart);

  if (options?.silent !== true) {
    notifyCartAdded(product, quantity);
  }
};

const removeFromCart = (productId) => {
  const targetId = String(productId);
  const cart = getCart().filter((item) => String(item.id) !== targetId);
  saveCart(cart);
};

const updateQuantity = (productId, newQuantity) => {
  const cart = getCart();
  const targetId = String(productId);
  const item = cart.find((entry) => String(entry.id) === targetId);
  if (!item) return;
  if (newQuantity <= 0) {
    removeFromCart(targetId);
    return;
  }
  item.quantity = newQuantity;
  saveCart(cart);
};

// clear entire cart (used after checkout)
const clearCart = () => {
  saveCart([]);
  const client = getSupabaseForCart();
  const email = getCartUserEmail();
  if (client && email) {
    client.from("cart_items").delete().eq("user_email", email).catch(() => {});
  }
};

// helper to get total item count in cart
const getCartCount = () => {
  const cart = getCart();
  return cart.reduce((total, item) => total + item.quantity, 0);
};

const toggleWishlist = (productId) => {
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  if (!isLoggedIn) {
    const loginPath = window.location.pathname.includes('/pages/') ? 'signin/login.html' : 'pages/signin/login.html';
    window.location.href = loginPath;
    return false;
  }

  const targetId = String(productId);
  const allProducts = _getAllProducts();
  const product = allProducts[targetId];
  if (!product) return false;

  const wishlist = getWishlist();
  const existingIndex = wishlist.findIndex((item) => String(item?.id) === targetId);
  let wishlistState = false;

  if (existingIndex !== -1) {
    wishlist.splice(existingIndex, 1);
  } else {
    const normalizedProduct = normalizeProductRecord(product);
    if (!normalizedProduct) return false;
    wishlist.push(normalizedProduct);
    wishlistState = true;
  }

  saveWishlist(wishlist, {
    productId: targetId,
    isInWishlist: wishlistState,
  });

  return wishlistState;
};

var LANGUAGE_STORAGE_KEY = "boda_language";

function getLanguage() {
  try {
    var raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw === "en" || raw === "ar") return raw;
  } catch (_a) {}
  return "ar";
}

function setLanguage(lang) {
  var normalized = lang === "en" ? "en" : "ar";
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  } catch (_a) {}
  applyLanguage(normalized);
  document.dispatchEvent(new CustomEvent("boda:language-changed", { detail: normalized }));
}

function applyLanguage(lang) {
  var locale = lang || getLanguage();
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

function t(key) {
  var locale = getLanguage();
  if (locale === "ar") return key;
  var translations = window.__boda_en_translations || {};
  return translations[key] || key;
}

window.BudaStore = {
  DEFAULT_PRODUCT_IMAGE,
  LANGUAGE_STORAGE_KEY: LANGUAGE_STORAGE_KEY,
  getImagePath,
  getProductImages: extractProductImages,
  resolveProductPrice,
  resolveProductRating,
  renderProductStars,
  normalizeProductRecord,
  getAllProducts: _getAllProducts,
  getProductById,
  getCart,
  saveCart,
  addToCart,
  removeFromCart,
  updateQuantity,
  updateCartCount,
  clearCart,
  getCartCount,
  syncCartToSupabase,
  loadCartFromSupabase,
  syncWishlistToSupabase,
  loadWishlistFromSupabase,
  getWishlist,
  saveWishlist,
  isInWishlist,
  toggleWishlist,
  resolveCurrencyConfig: function () {
    var selected = window.TaagerIntegration ? window.TaagerIntegration.getSelectedCountry() : null;
    var code = selected ? selected.code : "EG";
    var lang = getLanguage();
    var localeMap = {
      "ar": { EG: "ar-EG", SA: "ar-SA" },
      "en": { EG: "en-EG", SA: "en-SA" },
    };
    var locales = localeMap[lang] || localeMap.ar;
    return { locale: locales[code] || locales.EG, currency: code === "SA" ? "SAR" : "EGP" };
  },
  formatMoney: function (value, options) {
    var cfg = this.resolveCurrencyConfig();
    var num = Number(value) || 0;
    var plain = options && options.plain;
    var formatted = new Intl.NumberFormat(cfg.locale, {
      minimumFractionDigits: options && options.minimumFractionDigits != null ? options.minimumFractionDigits : 0,
      maximumFractionDigits: options && options.maximumFractionDigits != null ? options.maximumFractionDigits : 2,
    }).format(num);
    var labels = { EGP: "جنيه", SAR: "ريال" };
    var label = labels[cfg.currency] || cfg.currency;
    if (plain) return formatted + " " + label;
    return '<span class="noon-price-num">' + formatted + '</span> <small class="noon-currency">' + label + '</small>';
  },
  getCurrencyLabel: function () {
    var cfg = this.resolveCurrencyConfig();
    var labels = { EGP: "جنيه", SAR: "ريال" };
    return labels[cfg.currency] || cfg.currency;
  },
  getLanguage: getLanguage,
  setLanguage: setLanguage,
  applyLanguage: applyLanguage,
  t: t,
};

applyLanguage();

// Auto-sync profile from localStorage to Supabase on any page
function autoSyncProfile() {
  var email = (localStorage.getItem("userEmail") || "").trim().toLowerCase();
  if (!email) return;
  var firstName = localStorage.getItem("userFirstName") || "";
  var lastName = localStorage.getItem("userLastName") || "";
  var phone = localStorage.getItem("userPhone") || "";
  var birthDay = localStorage.getItem("userBirthDay") || "";
  var birthMonth = localStorage.getItem("userBirthMonth") || "";
  var birthYear = localStorage.getItem("userBirthYear") || "";
  var gender = localStorage.getItem("userGender") || "";
  var nationality = localStorage.getItem("userNationality") || "";
  var fullName = localStorage.getItem("userFullName") || (firstName + " " + lastName).trim();
  if (!fullName && !phone && !birthDay && !gender && !nationality) return;
  try {
    if (typeof getSupabaseClient !== "function") return;
    var client = getSupabaseClient();
    if (!client) return;

    function buildPayload(existing) {
      var payload = { email: email };
      if (firstName) payload.first_name = firstName;
      if (lastName) payload.last_name = lastName;
      if (fullName) payload.full_name = fullName;
      if (phone) payload.phone = phone;
      if (gender) payload.gender = gender;
      if (nationality) payload.nationality = nationality;
      // Only set birthday from localStorage if not already in Supabase
      if (birthDay && birthMonth && birthYear) {
        if (!existing || !existing.birth_day) {
          payload.birth_day = parseInt(birthDay) || null;
          payload.birth_month = parseInt(birthMonth) || null;
          payload.birth_year = parseInt(birthYear) || null;
        }
      }
      return payload;
    }

    client.from("profiles").select("*").eq("email", email).limit(1).then(function (result) {
      if (result.error) return;
      var existing = Array.isArray(result.data) && result.data.length ? result.data[0] : null;
      var payload = buildPayload(existing);
      if (Object.keys(payload).length <= 1) return;
      if (existing) {
        client.from("profiles").update(payload).eq("email", email).then(function (res) {
          if (res.error) console.warn("auto-sync update error", res.error);
        });
      } else {
        client.from("profiles").insert(payload).then(function (res) {
          if (res.error) console.warn("auto-sync insert error", res.error);
        });
      }
    });
  } catch (e) { console.warn("auto-sync error", e); }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoSyncProfile);
} else {
  autoSyncProfile();
}

// تحميل العربة من Supabase عند تسجيل الدخول
async function autoLoadCartFromSupabase() {
  const email = getCartUserEmail();
  if (!email) {
    _cartLoadedFromSupabase = true;
    return;
  }

  const supabaseCart = await loadCartFromSupabase();
  const localCart = getCart();

  if (supabaseCart === null) {
    // Error اتصال بـ Supabase → خلينا على localStorage
    _cartLoadedFromSupabase = true;
    updateCartCount();
    document.dispatchEvent(new CustomEvent("boda:cart-loaded", { detail: { cart: localCart } }));
    return;
  }

  if (supabaseCart.length > 0) {
    // في بيانات في Supabase → دمج مع localStorage
    if (localCart.length === 0) {
      localStorage.setItem(getCartKey(), JSON.stringify(supabaseCart));
    } else {
      const merged = [...supabaseCart];
      localCart.forEach((localItem) => {
        const exists = merged.some((s) => String(s.id) === String(localItem.id));
        if (!exists) merged.push(localItem);
      });
      localStorage.setItem(getCartKey(), JSON.stringify(merged));
    }
  } else {
    // Supabase فاضي والمستخدم مسحها يدوي → طهر localStorage كمان
    if (localCart.length > 0) {
      localStorage.removeItem(getCartKey());
    }
  }

  _cartLoadedFromSupabase = true;
  const finalCart = getCart();
  if (finalCart.length > 0) {
    syncCartToSupabase(finalCart);
  }
  updateCartCount();
  document.dispatchEvent(new CustomEvent("boda:cart-loaded", { detail: { cart: getCart() } }));
}

// تنفيذ بعد تحميل الصفحة
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    autoLoadCartFromSupabase();
    autoLoadWishlistFromSupabase();
  });
} else {
  autoLoadCartFromSupabase();
  autoLoadWishlistFromSupabase();
}

// لما user يعمل تسجيل دخول، reload العربة والمفضلة
document.addEventListener("boda:user-logged-in", function () {
  _cartLoadedFromSupabase = false;
  _wishlistLoadedFromSupabase = false;
  autoLoadCartFromSupabase();
  autoLoadWishlistFromSupabase();
});

window.__boda_en_translations = {
  "الرئيسية": "Home",
  "المنتجات": "Products",
  "الفئات": "Categories",
  "الحساب": "Account",
  "حسابي": "My Account",
  "السلة": "Cart",
  "العربة": "Basket",
  "حسابي": "My Account",
  "ابحث عن منتج": "Search for a product",
  "ابحث عن منتج أو فئة": "Search for a product or category",
  "تسجيل الدخول": "Login",
  "إنشاء حساب": "Create Account",
  "تسجيل الخروج": "Logout",
  "الطلبات": "Orders",
  "المفضلة": "Wishlist",
  "العناوين": "Addresses",
  "اللغة": "Language",
  "الدولة": "Country",
  "اختر الدولة": "Select Country",
  "اختر اللغة": "Select Language",
  "العربية": "Arabic",
  "English": "English",
  "الدعم الفني": "Support",
  "إلغاء": "Cancel",
  "حفظ": "Save",
  "تأكيد": "Confirm",
  "تعديل الملف الشخصي": "Edit Profile",
  "الاسم الكامل": "Full Name",
  "البريد الإلكتروني": "Email",
  "رقم الهاتف": "Phone Number",
  "تواصل معنا": "Contact Us",
  "إرسال": "Send",
  "متابعة الطلبات وتحديث الحالة": "Track orders and update status",
  "إدارة العناصر المحفوظة": "Manage saved items",
  "إضافة وتعديل عنوان التوصيل": "Add and edit delivery address",
  "تسوق الآن": "Shop Now",
  "أضف إلى السلة": "Add to Cart",
  "المجموع": "Subtotal",
  "السعر": "Price",
  "الكمية": "Quantity",
  "الإجمالي": "Grand Total",
  "إتمام الشراء": "Checkout",
  "الشحن": "Shipping",
  "الضريبة": "Tax",
  "الخصم": "Discount",
  "الرمز الترويجي": "Promo Code",
  "تطبيق": "Apply",
  "السلة فارغة": "Cart is empty",
  "تصفح المنتجات": "Browse Products",
  "العروض": "Offers",
  "قد يعجبك": "You May Like",
  "مختارات اليوم": "Today's Picks",
  "توصيل إلى": "Deliver to",
  "اختر عنوان التوصيل": "Select delivery address",
  "تحديد موقعي الحالي": "Detect my location",
  "مصر": "Egypt",
  "السعودية": "Saudi Arabia",
  "المنتج": "Product",
  "الوصف": "Description",
  "التقييمات": "Reviews",
  "منتجات": "Products",
  "طلباتي": "My Orders",
  "العنوان النشط": "Active Address",
  "الملف الشخصي": "Profile",
  "اختصارات الحساب": "Account Shortcuts",
  "الاسم": "Name",
  "حذف": "Delete",
  "إضافة": "Add",
  "العنوان الافتراضي": "Default Address",
  "تعيين افتراضي": "Set as Default",
  "تعديل الملف": "Edit Profile",
  "الموقع الحالي": "Current Location",
  "عنوان جديد": "New Address",
  "تمت إضافة {1} إلى السلة": "{1} added to cart",
  "تمت إضافة {0} من {1} إلى السلة": "{0}x {1} added to cart",
  "تم حفظ العنوان بنجاح.": "Address saved successfully.",
  "تم حفظ بيانات الحساب.": "Profile saved successfully.",
  "تم تعيين العنوان الافتراضي.": "Default address set.",
  "تم حفظ تفضيل اللغة العربية.": "Language preference saved.",
  "الرجاء إدخال عنوان صحيح.": "Please enter a valid address.",
  "الاسم والبريد الإلكتروني مطلوبان.": "Name and email are required.",
  "تعذر تحديد موقعك الآن. حاول مرة أخرى.": "Could not detect location. Try again.",
  "تم رفض إذن الوصول للموقع. فعّل الإذن ثم أعد المحاولة.": "Location access denied. Enable permission and try again.",
  "تعذر الوصول لإحداثيات الموقع. تأكد من تشغيل GPS.": "Could not access GPS coordinates.",
  "انتهت مهلة تحديد الموقع. حاول مرة أخرى في مكان مفتوح.": "Location request timed out. Try again in an open area.",
  "المتصفح الحالي لا يدعم تحديد الموقع الجغرافي.": "Your browser does not support geolocation.",
  "جاري طلب الموقع الحالي...": "Requesting current location...",
  "تم تحديد موقعك بنجاح. يمكنك استخدام العنوان مباشرة.": "Location detected. You can use this address.",
  "تم نسخ العنوان المكتشف إلى خانة العنوان.": "Address copied to field.",
  "حدد موقعك أولًا ثم استخدم العنوان المكتشف.": "Detect your location first.",
  "لا توجد عناوين محفوظة.": "No saved addresses.",
  "جارٍ تحديد الموقع...": "Detecting location...",
  "العنوان النشط": "Active Address",
  "الموقع المكتشف": "Detected Location",
  "عرض على الخريطة": "View on Map",
  "استخدام العنوان المكتشف": "Use Detected Address",
  "اختر عنوان التوصيل": "Select delivery address",
  "تأكيد العملية": "Confirm Action",
  "جارٍ التحميل...": "Loading...",
  "لا توجد منتجات": "No products",
  "الكل": "All",
  "هواتف": "Phones",
  "ساعات": "Watches",
  "لوحات مفاتيح": "Keyboards",
  "سماعات رأس": "Headphones",
  "ملابس": "Clothes",
  "منتجات تجميل وعناية": "Beauty & Care",
  "منتجات رياضية": "Sports",
  "إلكترونيات": "Electronics",
  "جمال وعناية": "Beauty & Care",
  "رياضة وترفيه": "Sports & Leisure",
  "منزل ومطبخ": "Home & Kitchen",
  "عروض لك": "Offers For You",
  "خصم أكبر من 30%": "Discount over 30%",
  "قد يعجبك": "You May Like",
  "مختارات اليوم لك": "Today's Picks",
  "روتين جمالك يبدأ هنا": "Your Beauty Routine Starts Here",
  "تقنية وصوت بجودة أعلى": "Tech & Sound at Higher Quality",
  "اكتشافات جديدة كل يوم": "New Discoveries Every Day",
  "مفاجآت تستحق التجربة": "Surprises Worth Trying",
  "اشتري حسب الفئة": "Shop by Category",
  "تسوق من أفضل الماركات": "Shop Top Brands",
  "شحن سريع": "Fast Shipping",
  "توصيل خلال 3-7 أيام": "Delivery in 3-7 days",
  "إرجاع مجاني": "Free Returns",
  "خلال 14 يوم": "Within 14 days",
  "دعم فني": "Support",
  "على مدار الساعة": "24/7",
  "دفع آمن": "Secure Payment",
  "بياناتك مشفرة": "Your data is encrypted",
  "كل المنتجات": "All Products",
  "فلترة سهلة حسب القسم مع نفس تجربة التسوق الموحدة في كل الصفحات.": "Easy filtering by category with the same unified shopping experience.",
  "لا توجد منتجات في هذا القسم.": "No products in this section.",
  "إضافة إلى المفضلة": "Add to Wishlist",
  "عرض المنتج": "View Product",

  "خصم": "Discount",
  "تقييم": "Rating",
  "منتج": "Product",
  "الرمز البريدي": "Postal Code",
  "المدينة": "City",
  "المحافظة": "Governorate",
  "تفاصيل العنوان": "Address Details",
  "متابعة": "Continue",
  "تراجع": "Back",
  "إتمام الطلب": "Place Order",
  "ملخص الطلب": "Order Summary",
  "حالة الطلب": "Order Status",
  "رقم الطلب": "Order Number",
  "تاريخ الطلب": "Order Date",
  "إجمالي الطلب": "Order Total",
  "تم": "Done",
  "خطأ": "Error",
  "تحذير": "Warning",
  "معلومات": "Info",
  "نجاح": "Success",
  "فشل": "Failed",
  "حاول مرة أخرى": "Try Again",
  "موافق": "OK",
  "نعم": "Yes",
  "لا": "No",
  "البحث": "Search",
  "بحث": "Search",
  "سلة التسوق": "Shopping Cart",
  "إزالة": "Remove",
  "تحديث": "Update",
  "السلة - Buda": "Cart - Buda",
  "الرئيسية - Buda": "Home - Buda",
  "حسابي - Buda": "My Account - Buda",
  "المنتجات - Buda": "Products - Buda",
  "المفضلة - Buda": "Wishlist - Buda",
  "الطلبات - Buda": "Orders - Buda",
  "بحث - Buda": "Search - Buda",
  "المنتج - Buda": "Product - Buda",
  "إتمام الشراء - Buda": "Checkout - Buda",
  "المتجر": "Store",
  "تسجيل": "Register",
  "كلمة المرور": "Password",
  "تأكيد كلمة المرور": "Confirm Password",
  "نسيت كلمة المرور": "Forgot Password",
  "إعادة تعيين كلمة المرور": "Reset Password",
  "مرحبًا": "Welcome",
  "مرحبا": "Welcome",
  "أهلاً بك": "Welcome",
  "user@example.com": "user@example.com",
  "المستخدم": "User",
  "اختر": "Select",
  "تحديد": "Select",
  "إضهار": "Show",
  "إخفاء": "Hide",
  "تحميل المزيد": "Load More",
  "عرض الكل": "View All",
  "عرض المزيد": "View More",
  "عرض أقل": "View Less",
  "تم الحفظ": "Saved",
  "تم الحفظ بنجاح": "Saved successfully",
  "فشل الحفظ": "Save failed",
  "جاري التحميل...": "Loading...",
  "لا توجد منتجات": "No products",
  "لم يتم العثور على نتائج": "No results found",
  "حدث خطأ": "An error occurred",
  "حدث خطأ ما": "Something went wrong",
  "يرجى المحاولة مرة أخرى": "Please try again",
  "تم التقييم بنجاح": "Rating submitted",
  "فشل التقييم": "Rating failed",
  "تم الإبلاغ": "Reported",
  "تم الحذف": "Deleted",
  "تم الحذف بنجاح": "Deleted successfully",
  "تم التحديث": "Updated",
  "تمت الإضافة": "Added",
  "تمت الإضافة بنجاح": "Added successfully",
  "تم نسخ الرابط": "Link copied",
  "الرجاء تسجيل الدخول أولاً": "Please login first",
  "يجب تسجيل الدخول للوصول إلى هذه الصفحة.": "You must be logged in to access this page.",
  "يجب تسجيل الدخول للوصول إلى صفحة الحساب.": "You must be logged in to access the account page.",
  "تسجيل الدخول مطلوب": "Login Required",
  "الصفحة الرئيسية": "Home",
  "سياسة الخصوصية": "Privacy Policy",
  "الشروط والأحكام": "Terms & Conditions",
  "من نحن": "About Us",
  "اتصل بنا": "Contact Us",
  "الأسئلة الشائعة": "FAQ",
  "المساعدة": "Help",
  "الإعدادات": "Settings",
  "الإشعارات": "Notifications",
  "المرتبطة": "Linked",
  "غير مرتبط": "Not Linked",
  "تم القبول": "Accepted",
  "تم الرفض": "Rejected",
  "في الانتظار": "Pending",
  "مكتمل": "Completed",
  "ملغي": "Cancelled",
  "مرجع": "Refunded",
  "جديد": "New",
  "مستخدم": "Used",
  "متوفر": "Available",
  "غير متوفر": "Unavailable",
  "مخفض": "Discounted",
  "الأكثر مبيعاً": "Best Seller",
  "الأعلى تقييماً": "Highest Rated",
  "الأحدث": "Newest",
  "الأقل سعراً": "Lowest Price",
  "الأعلى سعراً": "Highest Price",
  "ترتيب حسب": "Sort by",
  "تصفية": "Filter",
  "الموقع الحالي": "Current Location",
  "العنوان الافتراضي": "Default Address",
  "عنوان التوصيل": "Delivery Address",
  "طريقة الدفع": "Payment Method",
  "الدفع عند الاستلام": "Cash on Delivery",
  "بطاقة ائتمان": "Credit Card",
  "تحويل بنكي": "Bank Transfer",
  "محفظة إلكترونية": "E-Wallet",
  "أضف تعليقاً": "Add a Comment",
  "كتابة تقييم": "Write a Review",
  "التقييمات": "Reviews",
  "لا توجد تقييمات": "No reviews",
  "شكراً لتقييمك": "Thank you for your review",
  "تم إضافة التقييم": "Review added",
  "فشل إضافة التقييم": "Failed to add review",
  "الحد الأدنى 3 أحرف": "Minimum 3 characters",
  "الحد الأقصى 10 أحرف": "Maximum 10 characters",
  "أضف إلى المفضلة": "Add to Wishlist",
  "إزالة من المفضلة": "Remove from Wishlist",
  "تمت الإضافة إلى المفضلة": "Added to Wishlist",
  "تمت الإزالة من المفضلة": "Removed from Wishlist",
  "تم تحديث المفضلة": "Wishlist updated",
  "المفضلة فارغة": "Wishlist is empty",
  "التوصيل": "Delivery",
  "التوصيل مجاني": "Free Delivery",
  "التوصيل خلال": "Delivery within",
  "أيام": "days",
  "سلة التسوق فارغة": "Your cart is empty",
  "أضف منتجات إلى السلة": "Add products to your cart",
  "إجمالي السلة": "Cart Total",
  "لديك كود خصم؟": "Have a promo code?",
  "أدخل الكود": "Enter code",
  "تم تطبيق الخصم": "Discount applied",
  "كود خصم غير صالح": "Invalid promo code",
  "انتهت صلاحية الكود": "Code expired",
  "الحد الأدنى للطلب": "Minimum order",
  "رسوم التوصيل": "Delivery fee",
  "المبلغ المطلوب": "Amount due",
  "سيتم الدفع عند الاستلام": "Will be paid on delivery",
  "تأكيد الطلب": "Confirm Order",
  "تم تأكيد الطلب": "Order confirmed",
  "رقم التتبع": "Tracking Number",
  "تتبع الطلب": "Track Order",
  "الطلبات السابقة": "Previous Orders",
  "لا توجد طلبات": "No orders",
  "تم إلغاء الطلب": "Order cancelled",
  "طلب مرتجع": "Return requested",
  "حالة التوصيل": "Delivery Status",
  "تم التوصيل": "Delivered",
  "جاري التوصيل": "Out for delivery",
  "قيد التجهيز": "Processing",
  "تم تجهيز الطلب": "Order ready",
  "تم الشحن": "Shipped",
  "التوصيل إلى": "Deliver to",
  "شحن سريع": "Fast Shipping",
  "توصيل خلال 3-7 أيام": "Delivery within 3-7 days",
  "إرجاع مجاني": "Free Returns",
  "خلال 14 يوم": "Within 14 days",
  "دعم فني": "Support",
  "على مدار الساعة": "24/7",
  "دفع آمن": "Secure Payment",
  "بياناتك مشفرة": "Your data is encrypted",
  "اشتري حسب الفئة": "Shop by Category",
  "خصم أكبر من 30%": "Discount over 30%",
  "مختارات اليوم لك": "Today's Picks for You",
  "روتين جمالك يبدأ هنا": "Your Beauty Routine Starts Here",
  "تقنية وصوت بجودة أعلى": "Tech & Sound at Higher Quality",
  "تسوق من أفضل الماركات": "Shop Top Brands",
  "اكتشافات جديدة كل يوم": "New Discoveries Every Day",
  "مفاجآت تستحق التجربة": "Surprises Worth Trying",
  "منصتك المفضلة للتسوق": "Your favorite online shopping platform",
  "حمل تطبيق Buda الآن": "Download Buda App Now",
  "تسوق بسهولة — عروض حصرية": "Shop easily — exclusive offers & instant notifications",
  "احصل عليه من": "Get it on",
  "جميع الحقوق محفوظة": "All Rights Reserved",
  "طرق الدفع": "Payment Methods",
  "ادخل الكود": "Enter code",
  "توصيل سريع": "Fast Delivery",
  "إمكانية الاسترجاع": "Return Policy",
  "العودة": "Back",
  "إجمالي المفضلة": "Wishlist Total",
  "أضف الكل إلى السلة": "Add All to Cart",
  "مسح المفضلة": "Clear Wishlist",
  "منتجاتك المفضلة": "Your Favorite Products",
  "قائمة المفضلة فارغة": "Wishlist is Empty",
  "ابدأ بإضافة منتجاتك": "Start adding your favorite products",
  "احفظ المنتجات التي نالت إعجابك": "Save products you love. Add to cart anytime.",
  "سلتك فارغة": "Your Cart is Empty",
  "ابدأ الشراء الآن وأضف منتجاتك المفضلة إلى السلة.": "Start shopping now and add your favorite items to the cart.",
  "ابدأ التسوق": "Start Shopping",
  "منتجات مقترحة لك": "Suggested for You",
  "متوسط التقييم": "Average Rating",
  "عرض جميع المراجعات": "View All Reviews",
  "منتجات مشابهة": "Similar Products",
  "أدخل بيانات صحيحة لتأكيد الطلب": "Enter correct details to confirm the order",
  "الدفع عند الاستلام فقط": "Cash on Delivery Only",
  "الإجمالي المستحق": "Total Due",
  "صفحة الدفع": "Checkout Page",
  "رسوم الشحن": "Shipping Fee",
  "المجموع شامل الضريبة": "Total Including Tax",
  "تفاصيل الطلبية": "Order Details",
  "وفرت": "You Saved",
  "أضف تقييمك": "Add Your Review",
  "بعد الشراء": "After Purchase",
  "اختر عدد النجوم": "Select star rating",
  "عنوان التقييم": "Review Title",
  "تفاصيل التقييم": "Review Details",
  "مجهول": "Anonymous",
  "إرسال التقييم": "Submit Review",
  "تقييمات المنتج": "Product Reviews",
  "شاهد آراء المستخدمين قبل الشراء": "See what others are saying before you buy",
  "كل المنتجات": "All Products",
  "فلترة سهلة حسب القسم": "Easy filtering by category",
  "الأقسام": "Categories",
  "نتائج المنتجات": "Product Results",
  "البيانات": "Data",
  "سجل": "Log",
  "تفاصيل المنتج": "Product Details",
  "بحث المنتجات": "Search Products",
  "سلة التسوق": "Shopping Cart",
  "ملخص الطلب": "Order Summary",
  "تفاصيل التتبع": "Tracking Details",
  "من نحن": "About Us",
  "تأكيد تسجيل الخروج": "Confirm Logout",
  "تسجيل الخروج؟": "Logout?",
  "هل أنت متأكد من تسجيل الخروج من حسابك؟": "Are you sure you want to logout?",
  "نعم، تسجيل خروج": "Yes, Logout",
  "لوحة الإدارة": "Admin Dashboard",
  "إضافة منتج جديد": "Add New Product",
  "مدفوع": "Sponsored",
  "عن Buda": "About Buda",
  "منصة تجارة إلكترونية عربية": "An Arabic e-commerce platform with a fast, easy experience",
  "فريق الدعم جاهز لمساعدتك": "Support team is ready to help with orders and technical issues",
  "الهاتف": "Phone",
  "واتساب": "WhatsApp",
  "ساعات العمل": "Working Hours",
  "يوميًا من 10 صباحًا حتى 10 مساءً": "Daily from 10 AM to 10 PM",
  "تواصل الآن": "Contact Now",
  "نلتزم بحماية بياناتك الشخصية": "We are committed to protecting your personal data and using it only for store operations",
  "البيانات التي نجمعها": "Data We Collect",
  "الاستخدام": "Usage",
  "الحماية": "Protection",
};

// Backwards-compat: expose old global helpers for pages that call them directly
if (typeof window !== 'undefined') {
  window.getAllProducts = window.getAllProducts || _getAllProducts;
  window.getProductById = window.getProductById || getProductById;
  window.getImagePath = window.getImagePath || getImagePath;
  window.updateCartCount = window.updateCartCount || updateCartCount;
  // Expose addToCart globally for pages that call it directly
  window.addToCart = window.addToCart || addToCart;
  // expose wishlist helpers for legacy code
  window.getWishlist = window.getWishlist || getWishlist;
  window.saveWishlist = window.saveWishlist || saveWishlist;
  window.isInWishlist = window.isInWishlist || isInWishlist;
  window.toggleWishlist = window.toggleWishlist || toggleWishlist;
  // allow other code to seed products for persistence (e.g. supabase results)
  if (!window.addProductToStore) {
    window.addProductToStore = (prod) => {
      const normalized = normalizeProductRecord(prod);
      if (!normalized) return;
      window._supabaseProductCache = window._supabaseProductCache || {};
      window._supabaseProductCache[normalized.id] = normalized;
    };
  }
  // expose cart helpers
  window.clearCart = window.clearCart || clearCart;
  window.getCartCount = window.getCartCount || getCartCount;
}

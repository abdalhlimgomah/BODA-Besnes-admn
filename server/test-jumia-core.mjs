/**
 * Parser smoke tests. Run: npm run lab:test
 * These fixtures mirror Jumia's public markup patterns (JSON-LD + card HTML +
 * Arabic product sections) so the parser can be verified without network.
 */
import assert from "node:assert/strict";
import { parseListing, parseProduct, parseSitemap, toNumber, withPageNumber } from "./jumia-core.mjs";

const CARD = (id, name, price, old, ratingPct, reviews) => `
<article class="prd _fb col c-prd">
  <a class="core" href="/ar/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id}.html#catalog-listing">
    <div class="img-c">
      <img class="img" data-src="https://eg.jumia.is/unsafe/fit-in/300x300/filters:fill(white)/product/68/741628/1.jpg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${name}">
    </div>
    <div class="info">
      <h3 class="name">${name}</h3>
      <div class="prc">${price.toFixed(2)} جنيه <del>${old.toFixed(2)} جنيه</del></div>
      <div class="rev"><div class="stars _m _al"><span class="fill" style="width:${ratingPct}%"></span></div><span class="rev-total">(${reviews})</span></div>
    </div>
  </a>
</article>`;

const LISTING_HTML = `<!doctype html><html lang="ar"><head><title>سماعات | جوميا مصر</title></head>
<body>
<h1>سماعات</h1>
<div class="-fs16">1-40 من 1,234 منتج</div>
${CARD("582714686", "Apple iPhone 15 128GB Black", 49969, 58999, 84, 23)}
${CARD("7416288", "Pro2 Wireless Bluetooth Earbuds White", 280, 399, 90, 2)}
<a href="/ar/catalog/?q=earbuds&amp;page=2">التالي</a>
<a href="/ar/catalog/?q=earbuds&amp;page=34">34</a>
</body></html>`;

const listing = parseListing(LISTING_HTML, "https://www.jumia.com.eg/ar/catalog/?q=earbuds");
assert.equal(listing.products.length, 2, "two cards");
assert.equal(listing.products[0].name, "Apple iPhone 15 128GB Black");
assert.equal(listing.products[0].price, 49969);
assert.equal(listing.products[0].original_price, 58999);
assert.equal(listing.products[0].rating, 4.2);
assert.equal(listing.products[0].reviews, 23);
assert.equal(listing.products[0].numeric_id, "582714686");
assert.match(listing.products[0].image, /^https:\/\/eg\.jumia\.is/);
assert.equal(listing.pages, 34);
assert.equal(listing.total, 1234);
assert.equal(
  listing.next_page,
  "https://www.jumia.com.eg/ar/catalog/?q=earbuds&page=2"
);
assert.equal(
  withPageNumber("https://www.jumia.com.eg/ar/catalog/?q=earbuds", 3),
  "https://www.jumia.com.eg/ar/catalog/?q=earbuds&page=3"
);

const PRODUCT_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Pro2 Wireless Bluetooth Earbuds - TWS In-Ear Earphones with Charging Case - White",
  image: [
    "https://eg.jumia.is/unsafe/fit-in/680x680/filters:fill(white)/product/88/264718/1.jpg",
    "https://eg.jumia.is/unsafe/fit-in/680x680/filters:fill(white)/product/88/264718/2.jpg",
  ],
  description:
    "Experience high-quality wireless sound with these Pro Wireless Bluetooth Earbuds. Designed for ultimate comfort and crystal-clear audio.",
  sku: "GE810EA208F0DNAFAMZ",
  brand: { "@type": "Brand", name: "Generic" },
  offers: {
    "@type": "Offer",
    price: "280.00",
    priceCurrency: "EGP",
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: "BATOL", url: "https://www.jumia.com.eg/ar/seller/batol/" },
  },
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.5", reviewCount: "2" },
};

const BREADCRUMB_LD = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "الرئيسية", item: "https://www.jumia.com.eg/ar/" },
    { "@type": "ListItem", position: 2, name: "موبايلات وتابلت", item: "https://www.jumia.com.eg/ar/phones-tablets/" },
    { "@type": "ListItem", position: 3, name: "سماعات", item: "https://www.jumia.com.eg/ar/headphones/" },
    { "@type": "ListItem", position: 4, name: "Pro2 Wireless Bluetooth Earbuds" },
  ],
};

const PRODUCT_HTML = `<!doctype html><html lang="ar" dir="rtl"><head>
<title>Pro2 Wireless Bluetooth Earbuds - TWS In-Ear Earphones with Charging Case - White | جوميا مصر</title>
<meta property="og:image" content="https://eg.jumia.is/unsafe/fit-in/500x500/filters:fill(white)/product/88/264718/1.jpg">
<script type="application/ld+json">${JSON.stringify(PRODUCT_LD)}</script>
<script type="application/ld+json">${JSON.stringify(BREADCRUMB_LD)}</script>
</head>
<body>
<nav class="breadcrumbs"><a href="/ar/">الرئيسية</a> / <a href="/ar/phones-tablets/">موبايلات وتابلت</a> / <a href="/ar/headphones/">سماعات</a></nav>
<h1 class="-fs20 -pts -pbxs">Pro2 Wireless Bluetooth Earbuds - TWS In-Ear Earphones with Charging Case - White</h1>
<div class="-pvxs">
  <span class="-b -ltr -tal -fs24">280.00 جنيه</span>
  <span class="-old -ltr -tal -fs16"><del>399.00 جنيه</del></span>
  <span class="-pvs -fs12 -b">-30%</span>
  <span class="-f30 -b">Few units left</span>
</div>
<div class="stars _al _m"><span class="fill" style="width:90%"></span></div>
<div>4.5 out of 5</div>
<div>( 2 تقييمات موثقة للمنتج)</div>
<div>شحن مجاني الي الفيوم</div>

<h2>بيانات البائع</h2>
<div><a href="/ar/seller/batol/">BATOL</a></div>
<div>78% تقييم البائع</div>
<div>3 المتابعين</div>

<h2>أداء البائع</h2>
<div>معدل سرعه توصيل الطلب: ممتاز</div>
<div>تقييم الجودة: ضعيف</div>
<div>تقييم العملاء: متوسط</div>
<div>معدل الإلغاء: ممتاز</div>

<h2>مواصفات المنتج</h2>
<div class="markup">
  <h3>المواصفات الرئيسية</h3>
  <ul>
    <li>Immersive Sound Quality: Delivers balanced audio with rich bass and clear highs for music, podcasts, and calls.</li>
    <li>Seamless Wireless Pairing: Advanced Bluetooth technology ensures fast, stable connectivity and low latency.</li>
    <li>Ergonomic In-Ear Fit: Lightweight design equipped with soft silicone ear tips for passive noise isolation and all-day comfort.</li>
    <li>Portable Charging Case: Protective magnetic case with an LED power indicator provides on-the-go power and safe storage.</li>
  </ul>
  <p>Experience high-quality wireless sound with these Pro Wireless Bluetooth Earbuds. Designed for ultimate comfort and crystal-clear audio, these in-ear headphones feature a sleek design with soft silicone tips.</p>
</div>
<h3>المواصفات</h3>
<table>
  <tr><td>SKU</td><td>GE810EA208F0DNAFAMZ</td></tr>
  <tr><td>اللون</td><td>white</td></tr>
  <tr><td>العلامة التجارية</td><td>Generic</td></tr>
  <tr><td>نوع الاتصال</td><td>Bluetooth 5.0</td></tr>
</table>

<h2>التوصيل والارجاع</h2>
<div>شحن مجاني</div>
<div>جاهز للإستلام من ١٨ نوفمبر إلى ١٩ نوفمبر</div>
<div>توصيل للمنزل</div>
<div>مصاريف الشحن 25.00 جنيه (شحن مجاني عند الطلب بـ 500.00 جنيه أو اكتر)</div>
<h3>سياسة الارجاع</h3>
<div>يمكنك إرجاع المنتج مجانًا خلال 14 يوم من الاستلام إذا كان مؤهلًا للإرجاع.</div>
<h3>الضمان</h3>
<div>1</div>

<h2>آراء العملاء الموثقة</h2>
<div>5</div><div>(1)</div>
<div>4</div><div>(1)</div>
<div>3</div><div>(0)</div>
<div>2</div><div>(0)</div>
<div>1</div><div>(0)</div>

<h2>تعلييقات المنتج (0)</h2>
<div>العملاء الذين قاموا بشراء هذا المنتج لم يضيفوا اى تعليقات حتى الآن.</div>

<h2>منتجات ذات صلة</h2>
${CARD("1111111", "Wireless Headphones Black", 500, 700, 80, 12)}
${CARD("2222222", "Bluetooth Earbuds Pro", 305.55, 500, 84, 23)}
</body></html>`;

const product = parseProduct(PRODUCT_HTML, "https://www.jumia.com.eg/ar/pro2-earbuds-7416288.html");
assert.equal(product.ok, true);
assert.equal(product.sku, "GE810EA208F0DNAFAMZ");
assert.equal(product.price, 280);
assert.equal(product.original_price, 399);
assert.equal(product.discount_percent, 30);
assert.equal(product.rating, 4.5);
assert.equal(product.reviews_count, 2);
assert.equal(product.stock_status, "low_stock");
assert.equal(product.brand, "Generic");
assert.equal(product.category, "سماعات");
assert.equal(product.images.length, 2);
assert.equal(product.breadcrumb.length, 4);
assert.equal(product.seller.name, "BATOL");
assert.equal(product.seller.rating, 78);
assert.equal(product.seller.followers, 3);
assert.equal(product.seller.performance.length, 4);
assert.equal(product.seller.performance[0].value, "ممتاز");
assert.ok(product.highlights.length >= 4, "highlights found");
assert.equal(product.specs.find((row) => row.label === "SKU").value, "GE810EA208F0DNAFAMZ");
assert.equal(product.specs.find((row) => row.label === "اللون").value, "white");
assert.equal(product.rating_breakdown["5"], 1);
assert.equal(product.rating_breakdown["4"], 1);
assert.match(product.delivery.return_policy, /14 يوم/);
assert.equal(product.delivery.warranty, "1 سنة");
assert.equal(product.related.length, 2);
assert.equal(product.related[0].name, "Wireless Headphones Black");
assert.equal(product.warnings.length, 0);

const sitemap = parseSitemap(`<?xml version="1.0"?><urlset>
<url><loc>https://www.jumia.com.eg/ar/foo-1234567.html</loc></url>
<url><loc>https://www.jumia.com.eg/ar/bar-7654321.html</loc></url>
</urlset>`);
assert.equal(sitemap.urls.length, 2);
assert.equal(sitemap.is_index, false);

assert.equal(toNumber("77,770.00"), 77770);
assert.equal(toNumber("١٢٣٤"), 1234);

console.log("✓ jumia-core parser tests passed");
console.log("  listing:", listing.products.length, "cards · pages:", listing.pages);
console.log("  product:", product.name.slice(0, 40), "· specs:", product.specs.length, "· images:", product.images.length);

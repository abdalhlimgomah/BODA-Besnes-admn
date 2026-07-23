# دليل لوحة تحكم صفحات الهبوط - شرح كامل ومفصل

## مقدمة: ما هي هذه الصفحة؟

هذه **لوحة تحكم** تسمح لك بإدارة **محتوى صفحات الهبوط** (Landing Pages) عبر الإنترنت.
بدلاً من تعديل الأكواد يدوياً، تفتح هذه الصفحة وتضيف/تعدل/تحذف البيانات و现场的 تظهر تلقائياً في صفحات الموقع.

---

## 1. بنية المشروع (الملفات المهمة)

```
صفحه التحكم في الموقع بلكامل وا مراجعه البينات الشراكه/
├── pages/
│   ├── admin-landing-pages.html       ← لوحة التحكم (هذه الصفحة)
│   ├── admin.html                     ← لوحة التحكم الرئيسية
│   └── admin-home-layout.html         ← تحكم الصفحة الرئيسية
│
├── sql/
│   ├── setup_landing_pages.sql        ← ملف إنشاء الجداول (شغله أولاً)
│   ├── create_category_landing_schema.sql  ← السكيما الأصلية
│   └── seed_category_landing_data.sql      ← بيانات تجريبية قديمة
│
موقع الخاص بك/
├── assets/js/
│   ├── category-landing.js            ← صفحة عرض التصنيفات (الواجهة الأمامية)
│   ├── brand-landing.js               ← صفحة عرض الماركات (الواجهة الأمامية)
│   ├── home.js                        ← الصفحة الرئيسية
│   └── supabase-client.js             ← اتصال Supabase
│
├── pages/
│   ├── category-landing.html          ← صفحة التصنيف (مثال: ?slug=fashion)
│   └── brand-landing.html             ← صفحة الماركة (مثال: ?slug=nike)
│
└── sql/
    └── create_category_landing_schema.sql  ← نسخة أخرى من السكيما
```

---

## 2. كيف تعمل الدائرة الكاملة (Full Flow)

### مسار البيانات

```
أنت (المستخدم)
    │
    ▼
admin-landing-pages.html  ← تضغط "إضافة" أو "تعديل"
    │
    ▼ (يرسل طلب HTTP إلى Supabase)
SUPABASE_API (REST API)
    │
    ▼ (يخزن في الجدول)
PostgreSQL Database (جداول Supabase)
    │
    ▼ (عند زيارتك للموقع)
category-landing.html?slug=fashion
    │
    ▼ (يطلب البيانات من Supabase)
category-landing.js ← client.from("categories").select(...)
    │
    ▼ (يعرضها على الشاشة)
HTML + CSS ← بانرات، منتجات، أقسام، ماركات، مجموعات
```

**باختصار**: تضيف بيانات في `admin-landing-pages.html` ← تُحفظ في Supabase ← تظهر تلقائياً في `category-landing.html` / `brand-landing.html`.

---

## 3. شرح كل جدول في قاعدة البيانات

### جدول: `categories` (التصنيفات)
**الغرض**: التصنيفات الرئيسية للموقع (أزياء، إلكترونيات، أحذية، ...)
**تستخدمه**: `category-landing.js` لعرض أسم التصنيف ووصفه.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد (يُولد تلقائياً) |
| `name` | نص | اسم التصنيف بالعربية (مثال: الأزياء والموضة) |
| `name_en` | نص | الاسم بالإنجليزية (اختياري) |
| `slug` | نص **فريد** | المعرف في الرابط (مثال: `fashion`) ← هذا يربط الصفحة! |
| `description` | نص | وصف التصنيف |
| `image_url` | رابط | صورة التصنيف الرئيسية |
| `icon` | نص | أيقونة (من Material Icons) |
| `is_active` | منطقي | هل التصنيف نشط؟ |
| `sort_order` | رقم | الترتيب (الأصغر = الأول) |

**كيف يظهر على الموقع**:  
عند فتح `category-landing.html?slug=fashion`، يبحث الكود عن تصنيف حيث `slug = 'fashion'` ويعرض اسمه وصورته.

---

### جدول: `category_banners` (بنرات التصنيفات - السلايدر)
**الغرض**: السلايدر المتحرك (hero slider) في أعلى صفحة التصنيف.
**تستخدمه**: `category-landing.js` (سطر 251) لعرض البنرات.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `category_id` | UUID | **مهم** - معرف التصنيف الذي ينتمي إليه هذا البنر (ربط مع جدول categories) |
| `image_url` | رابط | صورة البنر (حجم مناسب: 1200×600) |
| `title` | نص | عنوان كبير على البنر |
| `subtitle` | نص | نص صغير تحت العنوان |
| `button_text` | نص | نص الزر (مثال: "تسوق الآن") |
| `button_link` | رابط | الرابط عند الضغط على الزر |
| `sort_order` | رقم | ترتيب السلايدات |
| `is_active` | منطقي | هل السلايد نشط؟ |

**الربط**: `category_banners.category_id` ← `categories.id`  
**كيف يظهر**: يتم جلب جميع البنرات التي `category_id` يطابق التصنيف المفتوح.

---

### جدول: `category_sections` (أقسام التصنيفات)
**الغرض**: الأقسام الداخلية في صفحة التصنيف (مثل: "الأكثر مبيعاً"، "وصل حديثاً").
**تستخدمه**: `category-landing.js` (سطر 261) لعرض الأقسام.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `category_id` | UUID | معرف التصنيف |
| `section_type` | نص | نوع القسم (حالياً `products` فقط) |
| `title` | نص | عنوان القسم (مثال: "الأكثر مبيعاً") |
| `subtitle` | نص | نص تحت العنوان |
| `badge` | نص | شارة صغيرة (مثال: "حصري"، "جديد") |
| `sort_order` | رقم | ترتيب الأقسام |
| `is_active` | منطقي | هل القسم نشط؟ |
| `display_count` | رقم | عدد المنتجات المراد عرضها (الافتراضي 6) |
| `selection_mode` | نص | طريقة اختيار المنتجات (`auto` = تلقائي، `manual` = يدوي) |
| `auto_rules` | JSON | قواعد اختيار المنتجات التلقائي |

**الربط**: `category_sections.category_id` ← `categories.id`  
**كيف يظهر**: يظهر كل قسم كشريط أفقي من المنتجات.

---

### جدول: `category_section_products` (منتجات الأقسام)
**الغرض**: ربط منتجات محددة بكل قسم (إذا كان `selection_mode = 'manual'`).
**تستخدمه**: `category-landing.js` (سطر 271) لجلب product_ids.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `section_id` | UUID | معرف القسم (ربط مع category_sections) |
| `product_id` | نص | معرف المنتج (نفس id في جدول `products`) |
| `sort_order` | رقم | ترتيب المنتج داخل القسم |

**الربط**: `category_section_products.section_id` ← `category_sections.id`  
**ملاحظة**: المنتجات الفعلية تجلب من جدول `products` (جدول المنتجات الرئيسي في المتجر).

---

### جدول: `featured_collections` (المجموعات المميزة)
**الغرض**: مجموعات مميزة تظهر في صفحة التصنيف (مجموعة الصيف، ...).
**تستخدمه**: `category-landing.js` (سطر 294) لربطها بالتصنيف.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `category_id` | UUID | **مهم** - ربط المجموعة بتصنيف معين |
| `title` | نص | اسم المجموعة |
| `subtitle` | نص | وصف قصير |
| `image_url` | رابط | صورة المجموعة |
| `link_url` | رابط | رابط عند الضغط |
| `sort_order` | رقم | الترتيب |
| `is_active` | منطقي | نشط أم لا |

**الربط**: `featured_collections.category_id` ← `categories.id`  
**ملاحظة**: تم إضافة `category_id` للجدول حديثاً، أعد تشغيل SQL إذا كان الجدول موجوداً مسبقاً.

---

### جدول: `collection_products` (منتجات المجموعات)
**الغرض**: ربط منتجات معينة بكل مجموعة مميزة.
**تستخدمه**: حاليًا **لا تستخدمه** أي صفحة أمامية! لكنه موجود في لوحة التحكم للإدارة المستقبلية.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `collection_slug` | نص | معرف المجموعة (نفس slug في featured_collections أو رابط) |
| `product_id` | نص | معرف المنتج |
| `product_name` | نص | اسم المنتج (اختياري للعرض السريع) |
| `product_image` | رابط | صورة المنتج |
| `product_price` | رقم | السعر |
| `product_old_price` | رقم | السعر القديم (قبل الخصم) |
| `product_rating` | رقم | التقييم (0-5) |
| `sort_order` | رقم | الترتيب |

---

### جدول: `smart_category_showcase` (الشريط الذكي)
**الغرض**: البطاقات الكبيرة في الصفحة الرئيسية (smart category showcase).
**تستخدمه**: `home.js` (سطر 2790) لعرض بطاقات التصنيفات في الصفحة الرئيسية.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `category_id` | UUID | ربط اختياري بتصنيف (يمكن أن يكون null) |
| `title` | نص | عنوان البطاقة |
| `subtitle` | نص | وصف قصير |
| `image_url` | رابط | صورة البطاقة |
| `link_url` | رابط | رابط البطاقة (مثال: `category-landing.html?slug=fashion`) |
| `gradient_from` | لون | لون التدرج العلوي |
| `gradient_to` | لون | لون التدرج السفلي |
| `sort_order` | رقم | الترتيب |
| `is_active` | منطقي | نشط أم لا |

**كيف يظهر**: يظهر في الصفحة الرئيسية (`index.html`) كبطاقات 2×2 أو 4 بطاقات مع خلفية متدرجة.

---

### جدول: `promotional_banners` (البانرات الترويجية)
**الغرض**: بانرات ترويجية تظهر في صفحات الماركات (brand landing).
**تستخدمه**: `brand-landing.js` (سطر 192) لعرض بانتر ترويجي.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `slug` | نص | معرف البانر (يمكن أن يكون slug الماركة للربط) |
| `title` | نص | عنوان البانر |
| `subtitle` | نص | وصف قصير |
| `image_url` | رابط | صورة البانر |
| `link_url` | رابط | رابط عند الضغط |
| `bg_color` | لون | لون الخلفية (اختياري) |
| `brand_id` | نص | معرف الماركة (لربط البانر بماركة معينة) |
| `brand_slug` | نص | اسم الماركة في الرابط (مثال: nike) للربط التلقائي |
| `is_active` | منطقي | نشط أم لا |
| `sort_order` | رقم | الترتيب |

**ملاحظة**: الكود الأمامي في `brand-landing.js` يحاول مطابقة البانر بواسطة `brand_id` أو `brand_slug`. املأ أحد هذين الحقلين لربط البانر بماركة معينة.

---

### جدول: `brands` (الماركات)
**الغرض**: الماركات التجارية (نايك، أديداس، ...).
**تستخدمه**: `brand-landing.js` (سطر 94) لعرض صفحة الماركة.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `name` | نص | اسم الماركة بالعربية |
| `name_en` | نص | الاسم بالإنجليزية |
| `slug` | نص **فريد** | المعرف في الرابط (مثال: `nike`) |
| `description` | نص | وصف الماركة |
| `logo_url` | رابط | رابط شعار الماركة (SVG أو PNG) |
| `cover_url` | رابط | صورة غلاف الماركة |
| `website` | رابط | موقع الماركة الرسمي |
| `is_active` | منطقي | نشط أم لا |
| `sort_order` | رقم | الترتيب |

**كيف يظهر**: عند فتح `brand-landing.html?slug=nike` ← يبحث عن ماركة حيث `slug = 'nike'`.

---

### جدول: `brand_banners` (بنرات الماركات)
**الغرض**: سلايدر الماركة (مثل بنرات التصنيفات لكن للماركات).
**تستخدمه**: `brand-landing.js` (سطر 112) لعرض السلايدر.
**الحقول**: مشابهة لـ `category_banners` لكن بـ `brand_id` بدلاً من `category_id`.

---

### جدول: `brand_sections` (أقسام الماركات)
**الغرض**: أقسام داخل صفحة الماركة (مثل: "الأكثر مبيعاً من نايك").
**تستخدمه**: `brand-landing.js` (سطر 126) لعرض الأقسام.
**الحقول**: مشابهة لـ `category_sections` لكن بـ `brand_id` بدلاً من `category_id`.

---

### جدول: `brand_section_products` (منتجات أقسام الماركات)
**الغرض**: ربط منتجات محددة بأقسام الماركات.
**تستخدمه**: `brand-landing.js` (سطر 141) - لكنه يستخدم `section_products` وليس `brand_section_products`!
**الحقول**: مشابهة لـ `category_section_products`.

**⚠️ ملاحظة**: الكود الأمامي في `brand-landing.js` سطر 141 يستخدم جدول `section_products` وليس `brand_section_products`! هذا خطأ - إما تعديل الكود ليستخدم `brand_section_products` أو إنشاء مزامنة.

---

### جدول: `category_brands` (ربط التصنيفات بالماركات)
**الغرض**: ربط الماركات بالتصنيفات (مثلاً: نايك ← تصنيف الأحذية).
**تستخدمه**: `category-landing.js` (سطر 284) لعرض الماركات المرتبطة بالتصنيف.
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `category_id` | UUID | معرف التصنيف |
| `brand_id` | UUID | معرف الماركة |
| `sort_order` | رقم | الترتيب |

---

### جدول: `brand_submissions` (طلبات تسجيل ماركات)
**الغرض**: يستقبل طلبات الشركاء الراغبين في تسجيل ماركاتهم في الموقع.
**تستخدمه**: صفحة التقديم (توجد في موقع العميل).
**الحقول**:
| الحقل | النوع | الشرح |
|-------|------|-------|
| `id` | UUID | معرف فريد |
| `brand_name` | نص | اسم الماركة |
| `owner_name` | نص | اسم المالك |
| `phone` | نص | رقم الهاتف |
| `email` | نص | البريد الإلكتروني |
| `website` | نص | الموقع الإلكتروني |
| `instagram` | نص | حساب إنستغرام |
| `category` | نص | التصنيف المهتم به |
| `message` | نص | رسالة إضافية |
| `status` | نص | الحالة (`pending`، `approved`، `rejected`) |
| `created_at` | وقت | تاريخ الإرسال |

---

## 4. كيف تستخدم لوحة التحكم

### أول مرة تفتح الصفحة
1. تفتح `admin-landing-pages.html`
2. تفحص الاتصال بقاعدة البيانات (`checkConnection()`)
3. إذا الجداول غير موجودة ← تظهر رسالة حمراء تطلب تشغيل SQL
4. تضغط "عرض كود SQL" ← يظهر كود إنشاء الجداول
5. تنسخ الكود وتفتح Supabase Dashboard → SQL Editor → لصق → Run
6. ترجع وتحدث الصفحة ← تظهر بطاقات الإحصائيات والأزرار

### بعد أن تعمل الجداول
- تظهر **13 بطاقة إحصائية** تعرض عدد العناصر في كل جدول
- فوقها **13 تبويب** (واحد لكل جدول)
- تضغط على أي تبويب ← يظهر جدول بالبيانات + زر إضافة + بحث

### إضافة عنصر جديد
1. تختار التبويب المطلوب (مثلاً "بنرات التصنيفات")
2. تضغط "إضافة" (زر أخضر)
3. يظهر مربع حوار يحتوي على حقول الجدول
4. تملأ البيانات وتضغط "حفظ"
5. يتم إرسال طلب POST إلى Supabase API
6. بعد النجاح، يظهر إشعار "تمت الإضافة" ويتم تحديث الجدول

### تعديل عنصر
1. تضغط على أيقونة القلم الرصاص (✏️) بجانب أي صف
2. يظهر مربع حوار بالبيانات الحالية
3. تعدل ما تريد وتضغط "حفظ"
4. يتم إرسال طلب PATCH إلى Supabase API

### حذف عنصر
1. تضغط على أيقونة سلة المهملات (🗑️)
2. يظهر تأكيد "هل أنت متأكد؟"
3. إذا ضغطت موافق ← يتم إرسال طلب DELETE إلى Supabase API

### البحث
- يوجد حقل بحث في أعلى كل جدول
- يبحث في جميع الحقول المعروضة (نص فقط)
- يعمل فوراً عند الكتابة (filter فوري)

---

## 5. ربط البيانات بين الجداول (العلاقات)

```
categories (id)
    ├── category_banners (category_id)
    ├── category_sections (category_id)
    │       └── category_section_products (section_id)
    │               └── products (product_id)
    ├── category_brands (category_id)
    │       └── brands (brand_id)
    └── featured_collections (category_id ← مفقود حالياً!)
            └── collection_products (collection_slug)

brands (id)
    ├── brand_banners (brand_id)
    ├── brand_sections (brand_id)
    │       └── brand_section_products (section_id)
    └── promotional_banners (slug → brand_slug)

smart_category_showcase (category_id اختياري)
```

**مثال عملي**: عند إضافة بنر سلايدر جديد:
1. أولاً: تأكد من وجود تصنيف (categories) له id
2. ثانياً: في تبويب "بنرات التصنيفات" أضف بنر جديد
3. حقل `category_id` = ضع id التصنيف الذي تريد
4. حقل `image_url` = رابط الصورة
5. بعد الحفظ ← افتح `category-landing.html?slug=...` ← السلايدر يظهر

---

## 6. كيف تظهر البيانات في الموقع (مثال خطوة بخطوة)

### مثال: إضافة سلايدر ترحيبي لتصنيف "الأزياء"

**في لوحة التحكم (admin-landing-pages.html)**:
1. افتح تبويب "التصنيفات" ← تأكد من وجود تصنيف باسم "الأزياء" و `slug = 'fashion'`
2. اكتب id هذا التصنيف (مثلاً: `a0000001-0000-0000-0000-000000000001`)
3. افتح تبويب "بنرات التصنيفات" ← إضافة
4. املأ:

| الحقل | القيمة |
|-------|--------|
| category_id | a0000001-... |
| image_url | `https://example.com/banner.jpg` |
| title | "تخفيضات تصل إلى 70%" |
| subtitle | "على مجموعة الصيف الجديدة" |
| button_text | "تسوق الآن" |
| button_link | `#` |
| sort_order | 1 |
| is_active | نشط |

5. احفظ

**في الموقع (category-landing.html?slug=fashion)**:
- الكود في `category-landing.js` سطر 251:
  ```js
  client.from("category_banners")
    .select("*")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
  ```
- هذا الكود يجلب جميع البنرات النشطة التي `category_id` تطابق التصنيف الحالي
- يعرضها كسلايدر متحرك في أعلى الصفحة

---

## 7. الأسئلة الشائعة

### س: أضفت بيانات في لوحة التحكم لكنها لا تظهر في الموقع!

**الأسباب المحتملة**:
1. **الجدول غير موجود** في Supabase → شغل setup_landing_pages.sql
2. **حقل `is_active` = false** → اجعله "نشط"
3. **الربط خطأ** → تأكد من `category_id` / `brand_id` صحيح
4. **الـ slug خطأ** → تأكد أن slug التصنيف يطابق الرابط
5. **الموقع يستخدم بيانات تجريبية** → أضف `?demo=0` في الرابط

### س: ما الفرق بين category_banners و promotional_banners؟

- **category_banners**: سلايدر متحرك في أعلى **صفحة التصنيف** (مرتبط بتصنيف معين)
- **promotional_banners**: بانر ترويجي يظهر في **صفحة الماركة** (أو في أي مكان)

### س: لماذا بعض الجداول لا تظهر في الموقع رغم أنني أضفت فيها بيانات؟

بعض الجداول هي للاستخدام المستقبلي أو لم تكتمل بعد:
- `collection_products`: لا تستخدمه أي صفحة حالياً (للاستخدام المستقبلي)
- `featured_collections`: الكود يحاول استخدامه لكن هناك خطأ في الربط
- `brand_submissions`: هذا جدول يستقبل طلبات من المستخدمين (يستخدم في صفحة منفصلة)

### س: كيف أعرف id التصنيف أو id الماركة؟

عند فتح تبويب "التصنيفات" في لوحة التحكم، يظهر عمود `id` (لكنه مخفي لأننا لا نعرض id في الجدول).  
**لكن**: حقل `slug` يظهر. استخدم slug للربط.

للحصول على id: افتح تبويب التصنيفات ← اضغط تعديل على أي تصنيف ← يظهر مربع الحوار ← id موجود في العنوان أو يمكنك رؤيته في الـ URL (في المستقبل).

**حل أفضل**: أضف عمود id ليظهر في الجدول (يمكن تعديل `displayFields` في الكود).

---

## 8. هيكل الكود في admin-landing-pages.html

```
HTML:
├── <head>           ← التنسيقات (CSS) وخط Tajawal وأيقونات Material
├── <body>
│   ├── .page-header ← العنوان وزر التحديث
│   ├── .ref-box     ← روابط سريعة لصفحات الموقع
│   ├── #tabs        ← الأزرار العلوية (13 تبويب)
│   ├── #tabContents ← محتوى التبويب النشط (جدول + أزرار)
│   └── #modalOverlay ← نافذة الإضافة/التعديل
│
JavaScript:
├── CONSTANTS        ← SUPABASE_URL, SUPABASE_KEY, TABLES, TABLE_NAMES
├── STATE            ← currentTable, editingId, dataCache
│
├── init()           ← البداية: ترسم الأزرار وتفحص الاتصال
│
├── checkConnection() ← تختبر اتصال Supabase
│   ├── ناجح ← renderStats() + switchTab()
│   └── فاشل ← setup-banner (رسالة خطأ)
│
├── renderStats()    ← ترسم 13 بطاقة إحصائية
│   └── لكل جدول ← تسأل Supabase عن عدد الصفوف
│
├── renderTabs()     ← ترسم 13 زر تبويب
│
├── switchTab(t)     ← تختار تبويب وتحميل بياناته
│
├── loadTable(t)     ← تجلب البيانات من Supabase API
│   ├── GET /rest/v1/{table}?select=*
│   ├── ناجح ← renderTable()
│   └── فاشل ← رسالة خطأ
│
├── renderTable(t, data) ← ترسم جدول HTML
│
├── openAdd(t)       ← فتح نافذة الإضافة
├── openEdit(t, id)  ← فتح نافذة التعديل
├── buildForm(t, data) ← بناء حقول النموذج
├── saveItem()       ← حفظ (POST أو PATCH حسب editingId)
├── deleteItem(t, id) ← حذف (DELETE)
├── closeModal()     ← إغلاق النافذة
│
├── filterTable()    ← بحث في الجدول
├── formatCell()     ← تنسيق الخلايا (صور، شارات، إلخ)
├── supabaseFetch()  ← دالة مساعدة لطلبات API
├── toast()          ← إشعارات منبثقة
└── escapeHtml()     ← حماية من هجمات XSS
```

---

## 9. كيف يعمل الاتصال بـ Supabase

```javascript
const SUPABASE_URL = 'https://msgqzgzoslearaprgiqq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIs...';

function supabaseFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  };
  // ...
  return fetch(url, { ...opts, headers });
}
```

كل عملية (عرض، إضافة، تعديل، حذف) تترجم إلى طلب HTTP:

| العملية | طريقة HTTP | مثال الرابط |
|---------|-----------|------------|
| عرض البيانات | `GET` | `/rest/v1/categories?select=*` |
| إضافة | `POST` | `/rest/v1/categories` |
| تعديل | `PATCH` | `/rest/v1/categories?id=eq.{id}` |
| حذف | `DELETE` | `/rest/v1/categories?id=eq.{id}` |

**مهم**: تستخدم الـ Admin API (REST) مباشرة، وليس مكتبة `@supabase/supabase-js`. هذا لأنها تعمل بدون أي dependencies.

---

## 10. ملاحظات مهمة ومشاكل معروفة

### مشكلة 1: featured_collections لا يحتوي category_id ✅ تم الإصلاح
`category-landing.js` سطر 294 يبحث عن `category_id` في جدول `featured_collections`.
**تم**: إضافة عمود `category_id` للجدول عبر `ALTER TABLE` في `setup_landing_pages.sql`.
أعد تشغيل SQL لإضافة العمود للجدول الموجود.

### مشكلة 2: brand-landing.js يستخدم section_products وليس brand_section_products ⚠️ لم يُصلح
`brand-landing.js` سطر 141: `client.from('section_products')` بينما الجدول الصحيح هو `brand_section_products`.
**الحل**: يحتاج تعديل في `brand-landing.js` نفسه (تغيير اسم الجدول).

### مشكلة 3: promotional_banners لا يحتوي brand_id ✅ تم الإصلاح
`brand-landing.js` يحاول مطابقة البانر بواسطة `brand_id` أو `brand_slug`.
**تم**: إضافة عمودي `brand_id` و `brand_slug` إلى جدول `promotional_banners` في SQL.

### مشكلة 4: الروابط النسبية
عند فتح `admin-landing-pages.html` من متصفح محلي:
- روابط `../../موقع الخاص بك/pages/category-landing.html` تعمل فقط إذا كان هيكل المجلدات صحيحاً
- المسار الصحيح من `وا مراجعه البينات الشراكه/pages/` ← `موقع الخاص بك/pages/` هو `../../موقع الخاص بك/pages/`

---

## 11. كيفية إضافة جدول جديد للوحة التحكم

### الخطوات:
1. **أضف الجدول في SQL** ← أضف `CREATE TABLE` في `setup_landing_pages.sql`
2. **أضف الجدول في TABLES** ← في `admin-landing-pages.html` أضف مدخل جديد في `const TABLES`:
   ```javascript
   my_new_table: {
     label: 'اسم الجدول',
     icon: 'اسم_الأيقونة',
     fields: ['id', 'field1', 'field2', 'created_at']
   }
   ```
3. **شغل SQL** في Supabase
4. **حدث الصفحة** ← التبويب الجديد يظهر تلقائياً

### مثال: إضافة جدول "التقييمات"
```javascript
ratings: {
  label: 'التقييمات',
  icon: 'star',
  fields: ['id', 'product_id', 'user_name', 'rating', 'comment', 'created_at']
}
```
ثم أضف `ratings` إلى مصفوفة `icons` و `colors` في `renderStats()`.

---

## 12. الخلاصة

### الملفات التي يجب أن تعرفها:

| تفعل ماذا؟ | الملف |
|-----------|-------|
| تدير المحتوى | `admin-landing-pages.html` |
| ينشئ الجداول | `sql/setup_landing_pages.sql` |
| يعرض التصنيفات | `category-landing.html` ← `category-landing.js` |
| يعرض الماركات | `brand-landing.html` ← `brand-landing.js` |
| الصفحة الرئيسية | `index.html` ← `home.js` |

### سير العمل الطبيعي:
1. شغل `setup_landing_pages.sql` في Supabase
2. افتح `admin-landing-pages.html`
3. أضف التصنيفات ← أضف الماركات ← أضف البنرات ← أضف الأقسام
4. افتح `category-landing.html?slug=fashion` ← شاهد النتيجة

### إذا واجهت مشكلة:
1. تأكد أن الجداول موجودة في Supabase (افتح Table Editor)
2. تأكد أن `is_active = true`
3. تأكد أن الـ `slug` صحيح (نفس القيمة في الرابط)
4. تأكد من الـ `category_id` / `brand_id` في البيانات المرتبطة

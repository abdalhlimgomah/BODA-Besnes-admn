import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

// ============================================================
// data-migrate — نسخ/مزامنة صفوف بين مشاريع Supabase
// ------------------------------------------------------------
// المنشورة في المشروع = المصدر (يقرأ نفسه بـ service_role).
// الهدف(ة) من MIG_TARGETS (Secret) — المفتاح kapus موجود server-side فقط.
// الأمان: يشترط توكن أدمن صالح (نفس توقيع admin-login) في body.adminToken.
// الوضعيات:
//   insert    -> إضافة الجديد فقط، تجاهل الموجود (الافتراضي)
//   sync      -> إضافة الجديد + تحديث الموجود
//   copy      -> نفس sync لكل الصفوف (للمشروع الجديد الفاضي)
// ============================================================

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 250;
const MAX_BATCH_SINCE_ERROR = true;
// المعاينة تكتفي بعدّ الموجود للجداول الصغيرة؛ الأضخم تُعلَّم ولا تتعطل.
const PREVIEW_MAX_ROWS = 25000;

const REGISTRY: { name: string; label: string; group: string }[] = [
  // مبيعات
  { name: "orders", label: "الطلبات", group: "المبيعات والطلبات" },
  { name: "order_items", label: "عناصر الطلبات", group: "المبيعات والطلبات" },
  { name: "return_requests", label: "طلبات المرتجع", group: "المبيعات والطلبات" },
  { name: "transfer_requests", label: "طلبات التحويل", group: "المبيعات والطلبات" },
  { name: "complaints", label: "الشكاوى", group: "المبيعات والطلبات" },

  // منتجات
  { name: "taager_products", label: "منتجات Taager", group: "المنتجات" },
  { name: "taager_variant_groups", label: "مقاسات Taager", group: "المنتجات" },
  { name: "products", label: "منتجات المتجر", group: "المنتجات" },
  { name: "my_products", label: "منتجات الشراكة (legacy)", group: "المنتجات" },
  { name: "product_sellers", label: "بائعي المنتجات", group: "المنتجات" },
  { name: "product_original_prices", label: "الأسعار الأصلية", group: "المنتجات" },
  { name: "taager_quantity_discounts", label: "الخصم على الكميات", group: "المنتجات" },
  { name: "product_seo", label: "SEO المنتجات", group: "المنتجات" },
  { name: "seller_profiles", label: "البائعون", group: "المنتجات" },
  { name: "seller_seo", label: "SEO البائعين", group: "المنتجات" },

  // دعم وشركاء
  { name: "support_conversations", label: "محادثات الدعم", group: "الدعم والشركاء" },
  { name: "support_messages", label: "رسائل الدعم", group: "الدعم والشركاء" },
  { name: "partners_requests", label: "طلبات الشراكة", group: "الدعم والشركاء" },
  { name: "partner_accounts", label: "حسابات الشركاء", group: "الدعم والشركاء" },
  { name: "partner_invoices", label: "فواتير الشركاء", group: "الدعم والشركاء" },
  { name: "partner_notifications", label: "إشعارات الشركاء", group: "الدعم والشركاء" },

  // مستخدمون
  { name: "users", label: "مستخدمو المتجر", group: "المستخدمون" },
  { name: "profiles", label: "ملفات المستخدمين", group: "المستخدمون" },
  { name: "user_addresses", label: "عناوين المستخدمين", group: "المستخدمون" },
  { name: "cart_items", label: "سلة التسوق", group: "المستخدمون" },
  { name: "wishlist_items", label: "المفضلة", group: "المستخدمون" },
  { name: "referrals", label: "الدعوات", group: "المستخدمون" },
  { name: "ratings", label: "التقييمات", group: "المستخدمون" },

  // محتوى المتجر
  { name: "categories", label: "الأقسام", group: "محتوى المتجر" },
  { name: "category_seo", label: "SEO الأقسام", group: "محتوى المتجر" },
  { name: "brands", label: "البراندات", group: "محتوى المتجر" },
  { name: "brand_seo", label: "SEO البراندات", group: "محتوى المتجر" },
  { name: "brand_sections", label: "أقسام البراندات", group: "محتوى المتجر" },
  { name: "brand_section_products", label: "منتجات أقسام البراندات", group: "محتوى المتجر" },
  { name: "section_products", label: "منتجات الأقسام", group: "محتوى المتجر" },
  { name: "featured_collections", label: "مجموعات مميزة", group: "محتوى المتجر" },
  { name: "collection_products", label: "منتجات المجموعات", group: "محتوى المتجر" },
  { name: "store_config", label: "إعدادات المتجر", group: "محتوى المتجر" },
  { name: "landing_pages", label: "صفحات الفئات الذكية", group: "محتوى المتجر" },
  { name: "smart_pages", label: "صفحات سمارت", group: "محتوى المتجر" },
  { name: "smart_page_blocks", label: "بلوكات سمارت", group: "محتوى المتجر" },
  { name: "smart_category_showcase", label: "عرض سمارت للأقسام", group: "محتوى المتجر" },
  { name: "buying_guides", label: "أدلة الشراء", group: "محتوى المتجر" },
  { name: "knowledge_sections", label: "أقسام المعرفة", group: "محتوى المتجر" },
  { name: "comparison_pages", label: "صفحات المقارنة", group: "محتوى المتجر" },
  { name: "promotional_banners", label: "بانرات ترويجية", group: "محتوى المتجر" },

  // البيت الرئيسي
  { name: "home_sections", label: "أقسام الصفحة الرئيسية", group: "الصفحة الرئيسية" },
  { name: "home_section_config", label: "إعدادات أقسام الرئيسية", group: "الصفحة الرئيسية" },
  { name: "home_page_sections", label: "أجزاء الصفحة الرئيسية", group: "الصفحة الرئيسية" },
  { name: "home_hero_slides", label: "سلايدات Hero", group: "الصفحة الرئيسية" },
  { name: "home_banners", label: "بانرات الرئيسية", group: "الصفحة الرئيسية" },
  { name: "home_categories", label: "فئات الرئيسية", group: "الصفحة الرئيسية" },
  { name: "home_mega_banners", label: "بانرات الميجا", group: "الصفحة الرئيسية" },
  { name: "home_mega_products", label: "منتجات الميجا", group: "الصفحة الرئيسية" },
  { name: "home_ad_banners", label: "بانرات مدفوعة", group: "الصفحة الرئيسية" },

  // بلوج وcampaigns
  { name: "blog_categories", label: "أقسام البلوج", group: "البلوج والمسابقات" },
  { name: "blog_authors", label: "كتّاب البلوج", group: "البلوج والمسابقات" },
  { name: "blog_tags", label: "وسوم البلوج", group: "البلوج والمسابقات" },
  { name: "blog_posts", label: "مقالات البلوج", group: "البلوج والمسابقات" },
  { name: "blog_post_tags", label: "وسوم المقالات", group: "البلوج والمسابقات" },
  { name: "blog_related_products", label: "منتجات مرتبطة بالبلوج", group: "البلوج والمسابقات" },
  { name: "blog_comments", label: "تعليقات البلوج", group: "البلوج والمسابقات" },
  { name: "blog_media", label: "وسائط البلوج", group: "البلوج والمسابقات" },
  { name: "kobon", label: "الكوبونات", group: "البلوج والمسابقات" },
  { name: "price_tiers", label: "شرائح الأسعار", group: "البلوج والمسابقات" },
  { name: "reward_assignments", label: "مكافآت Buda Rewards", group: "البلوج والمسابقات" },
  { name: "contest_campaigns", label: "حملات المسابقات", group: "البلوج والمسابقات" },
  { name: "contest_settings", label: "إعدادات المسابقات", group: "البلوج والمسابقات" },
  { name: "contest_participants", label: "مشتركي المسابقات", group: "البلوج والمسابقات" },
  { name: "contest_messages", label: "رسائل المسابقات", group: "البلوج والمسابقات" },
  { name: "contest_rewards", label: "جوائز المسابقات", group: "البلوج والمسابقات" },
];

interface Target {
  name: string;
  url: string;
  key: string;
}

function getTargets(): Target[] {
  // صيغة بسيطة من غير أقواس/نصوص اقتباس عشان بيئة الأوامر:
  //   MIG_TARGETS="name|url|key;name2|url2|key2"
  const raw = String(Deno.env.get("MIG_TARGETS") || "");
  if (!raw) return [];
  const out: Target[] = [];
  for (const entry of raw.split(";")) {
    const parts = entry.split("|");
    if (parts.length !== 3) continue;
    const [name, url, key] = parts.map((p) => p.trim());
    if (name && url && key) out.push({ name, url, key });
  }
  return out;
}

function selfUrl(): string {
  return String(Deno.env.get("SUPABASE_URL") || "");
}

function selfKey(): string {
  return String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
}

function b64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256HmacBase64Url(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64UrlEncode(new Uint8Array(signature));
}

async function getTokenSecret(): Promise<string | null> {
  const res = await fetch(`${selfUrl()}/rest/v1/app_settings?select=value&key=eq.admin_token_secret`, {
    headers: {
      apikey: selfKey(),
      Authorization: `Bearer ${selfKey()}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => []);
  if (!Array.isArray(rows) || !rows.length || !rows[0]?.value) return null;
  return String(rows[0].value);
}

async function isValidAdminToken(token: string): Promise<boolean> {
  if (!token) return false;
  const secret = await getTokenSecret();
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = await sha256HmacBase64Url(payload, secret);
  if (signature !== expected) return false;

  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(decoded) as { exp?: number; role?: string };
    if (claims.role !== "admin") return false;
    const now = Math.floor(Date.now() / 1000);
    return !!(claims.exp && claims.exp >= now);
  } catch {
    return false;
  }
}

function restHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function selfMeta(tables: string[]): Promise<Record<string, { has_date: boolean; id_identity: boolean; columns: string[] }>> {
  const res = await fetch(`${selfUrl()}/rest/v1/rpc/migration_table_meta`, {
    method: "POST",
    headers: restHeaders(selfKey()),
    body: JSON.stringify({ p_tables: tables }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`migration_table_meta فشل: ${res.status} ${text.slice(0, 300)}`);
  }
  const rows = (await res.json().catch(() => [])) as Record<string, unknown>[];
  const out: Record<string, { has_date: boolean; id_identity: boolean; columns: string[] }> = {};
  for (const r of rows) {
    out[String(r.name)] = {
      has_date: !!r.has_date,
      id_identity: !!r.id_identity,
      columns: Array.isArray(r.columns) ? r.columns.map((c) => String(c)) : [],
    };
  }
  return out;
}

async function sourceCount(table: string): Promise<number | null> {
  const res = await fetch(`${selfUrl()}/rest/v1/${table}?select=id`, {
    headers: {
      ...restHeaders(selfKey()),
      Range: "0-0",
      Prefer: "count=exact",
    },
  });
  if (!res.ok) return null;
  const cr = res.headers.get("content-range") || "";
  const total = Number(cr.split("/")[1]);
  return Number.isFinite(total) ? total : null;
}

async function readAllRows(
  table: string,
  hasDate: boolean,
  since?: string,
  orderCol = "id",
  onlyId = false
): Promise<{ rows: Record<string, unknown>[]; allCount: number }> {
  const out: Record<string, unknown>[] = [];
  // keyset (id=gt.XX) أسرع بكثير ولا يتكرر كل صفحة — الصفحات الأخيرة كانت تموت بوقت المهلة على الجداول الضخمة.
  const keyset = orderCol === "id";
  const select = onlyId && keyset ? "id" : "*";
  let last: string | number | null = null;
  for (;;) {
    let url = `${selfUrl()}/rest/v1/${table}?select=${select}`;
    if (keyset) {
      url += "&order=id.asc";
      if (last !== null) url += `&id=gt.${encodeURIComponent(String(last))}`;
    } else {
      url += `&offset=${out.length}`;
    }
    url += `&limit=${PAGE_SIZE}`;
    if (since && hasDate) url += `&created_at=gte.${encodeURIComponent(since)}`;
    const res = await fetch(url, { headers: restHeaders(selfKey()) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`قراءة ${table} فشل: ${res.status} ${text.slice(0, 300)}`);
    }
    const page = (await res.json().catch(() => [])) as Record<string, unknown>[];
    if (page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (keyset) last = page[page.length - 1].id as string | number;
  }
  return { rows: out, allCount: out.length };
}

// قراءة صفحة واحدة فقط (بحد أقصى limit صف) بنمط keyset على id —
// يُستخدم للنقل الكامل دفعة-بدفعة حيث كل استدعاء ينقل جزءًا محددًا
// ويَرجع nextLastId ليُكمَّل من عنده في الاستدعاء التالي (قابل للاستئناف).
async function readPageForStep(
  table: string,
  hasDate: boolean,
  lastIdStr: string | null,
  since: string,
  orderCol: string,
  limit: number
): Promise<{ rows: Record<string, unknown>[]; nextLastId: string | null; done: boolean }> {
  const keyset = orderCol === "id";
  if (!keyset) {
    // جداول نادرة بدون عمود id: ننقل كل صفوفها دفعة واحدة لضمان عدم نسيان أي صف.
    let url = `${selfUrl()}/rest/v1/${table}?select=*`;
    if (since && hasDate) url += `&created_at=gte.${encodeURIComponent(since)}`;
    const res = await fetch(url, { headers: restHeaders(selfKey()) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`قراءة ${table} فشل: ${res.status} ${text.slice(0, 300)}`);
    }
    const page = (await res.json().catch(() => [])) as Record<string, unknown>[];
    return { rows: page, nextLastId: null, done: true };
  }
  let url = `${selfUrl()}/rest/v1/${table}?select=*&order=id.asc&limit=${limit}`;
  if (lastIdStr) url += `&id=gt.${encodeURIComponent(lastIdStr)}`;
  if (since && hasDate) url += `&created_at=gte.${encodeURIComponent(since)}`;
  const res = await fetch(url, { headers: restHeaders(selfKey()) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`قراءة ${table} فشل: ${res.status} ${text.slice(0, 300)}`);
  }
  const page = (await res.json().catch(() => [])) as Record<string, unknown>[];
  const done = page.length < limit;
  const nextLastId = page.length ? String(page[page.length - 1].id) : lastIdStr;
  return { rows: page, nextLastId, done };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function importToTarget(
  target: Target,
  table: string,
  rows: Record<string, unknown>[],
  updateMode: boolean
): Promise<{ inserted: number; existing: number; updated: number; errors: string[] }> {
  let inserted = 0;
  let existing = 0;
  let errors: string[] = [];
  for (const part of chunk(rows, CHUNK_SIZE)) {
    let r: { inserted?: number; existing?: number; updated?: number } | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`${target.url}/rest/v1/rpc/migration_import`, {
          method: "POST",
          headers: restHeaders(target.key),
          body: JSON.stringify({ p_table: table, p_rows: part, p_update: updateMode }),
        });
        if (res.ok) {
          r = (await res.json().catch(() => null)) as { inserted?: number; existing?: number; updated?: number } | null;
          break;
        }
        lastErr = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
        if (res.status >= 400 && res.status < 500) break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
      await new Promise((x) => setTimeout(x, 500 * (attempt + 1)));
    }
    if (r) {
      inserted += Number(r.inserted) || 0;
      existing += Number(r.existing) || 0;
      continue;
    }

    // بديل (1): REST مباشر نحو الهدف بعد احتساب الموجود — يعمل حتى لو RPC migration_import
    // لديه مشكلة 42601 في الهدف القديم (التقاطعات عبر on_conflict على id).
    const hasIds = part.some((row) => row.id !== undefined && row.id !== null);
    if (hasIds) {
      try {
        let present = 0;
        let existingIds: Set<string> | null = null;
        try {
          const pre = await existingIdsOf(target, table, part.map((x) => String(x.id)));
          present = pre.found.size;
          existingIds = pre.found;
          if (pre.errors.length && present === 0 && pre.errors.some((e) => String(e).indexOf("HTTP") === 0)) {
            throw new Error(pre.errors.slice(0, 2).join(", "));
          }
        } catch (_e) {
          // لو فشل حساب الموجود، نرسل الحزمة كاملة — على العموم ستتعامل معها on_conflict
        }
        // في وضع التحديث (sync/copy) نرسل الحزمة كاملة — المكرر يُدمج (يُحدَّث)
        // ويتحاشى أي 409. في وضع insert نرسل الجديد فقط.
        const newRows = existingIds ? part.filter((row) => !existingIds.has(String(row.id))) : part;
        const payloadRows = updateMode ? part : newRows;
        const resolution = updateMode ? "merge-duplicates" : "ignore-duplicates";
        const res = await fetch(`${target.url}/rest/v1/${table}`, {
          method: "POST",
          headers: { ...restHeaders(target.key), Prefer: `${resolution},return=minimal` },
          body: JSON.stringify(payloadRows),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`REST upsert فشل: ${res.status} ${text.slice(0, 200)}`);
        }
        inserted += part.length - present;
        existing += present;
      } catch (e) {
        errors.push(`حزمة ${part.length} صف: رفض RPC ثم بديل REST: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    // بديل (2): جدول بلا عمود id (مفتاح مركّب) → إدراج صف-بصف مع احتساب المكرر
    // (409) كموجود حتى لا تُفقد أي بيانات ولا يُضاعف أي صف.
    const rowErrors: string[] = [];
    for (const row of part) {
      try {
        const res = await fetch(`${target.url}/rest/v1/${table}`, {
          method: "POST",
          headers: { ...restHeaders(target.key), Prefer: "return=minimal" },
          body: JSON.stringify([row]),
        });
        if (res.ok) {
          inserted++;
          continue;
        }
        const text = await res.text().catch(() => "");
        if (res.status === 409) {
          existing++;
          continue;
        }
        rowErrors.push(`${res.status} ${text.slice(0, 120)}`);
        if (rowErrors.length >= 3) break;
      } catch (e) {
        rowErrors.push(e instanceof Error ? e.message : String(e));
        if (rowErrors.length >= 3) break;
      }
    }
    if (rowErrors.length) {
      errors.push(`حزمة ${part.length} صف بلا id: ${rowErrors.join(" • ")}`);
    }
  }
  return { inserted, existing, updated: updateMode ? existing : 0, errors };
}

async function setSequencesOnTarget(target: Target, tables: string[]): Promise<void> {
  const res = await fetch(`${target.url}/rest/v1/rpc/migration_set_sequences`, {
    method: "POST",
    headers: restHeaders(target.key),
    body: JSON.stringify({ p_tables: tables }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`إصلاح العدادات فشل: ${res.status} ${text.slice(0, 200)}`);
  }
}

async function existingIdsOf(target: Target, table: string, ids: (string | number)[]): Promise<{ found: Set<string>; errors: string[] }> {
  const found = new Set<string>();
  const errors: string[] = [];
  if (!ids.length) return { found, errors };
  const strIds = ids.map((x) => String(x));

  // 1) الطريق الأسرع والأكثر أمانًا: RPC migration_existing_ids على الهدف (فى داخل قاعدة البيانات، ولا تضخم الرابط أبدًا)
  try {
    const res = await fetch(`${target.url}/rest/v1/rpc/migration_existing_ids`, {
      method: "POST",
      headers: restHeaders(target.key),
      body: JSON.stringify({ p_table: table, p_ids: strIds }),
    });
    if (res.ok) {
      const rows = (await res.json().catch(() => [])) as unknown[];
      for (const r of rows) if (r !== null && r !== undefined) found.add(String(r));
      return { found, errors };
    }
    // 404 = الدالة غير منصوبة في الهدف القديم → نكمل بالبديل. غير ذلك نسجل الخطأ.
    if (res.status !== 404) errors.push(`HTTP ${res.status}`);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // 2) البديل: id=in.(...) على دفعات صغيرة (200) مع إعادة محاولة لكل دفعة حتى لا يقطع الرابط الضخم الاتصال
  for (const part of chunk(strIds, 200)) {
    const inList = part.join(",");
    let res: Response | null = null;
    let lastErr = "";
    let attempt = 0;
    for (; attempt < 3; attempt++) {
      try {
        res = await fetch(`${target.url}/rest/v1/${table}?select=id&id=in.(${inList})`, {
          headers: restHeaders(target.key),
        });
        if (res.ok) break;
        lastErr = `HTTP ${res.status}`;
        if (res.status === 402 || res.status === 403 || res.status === 400) break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
    if (!res || !res.ok) {
      errors.push(lastErr || "فشل الاتصال");
      continue;
    }
    const rows = (await res.json().catch(() => [])) as { id?: unknown }[];
    for (const r of rows) if (r.id !== undefined && r.id !== null) found.add(String(r.id));
  }
  return { found, errors };
}

interface InfoRow {
  name: string;
  label: string;
  group: string;
  exists: boolean;
  has_date: boolean;
  count: number | null;
}

async function handleInfo() {
  const targets = getTargets().map((t) => ({ name: t.name, url: t.url }));
  let meta: Record<string, { has_date: boolean; id_identity: boolean; columns: string[] }> = {};
  try {
    meta = await selfMeta(REGISTRY.map((r) => r.name));
  } catch (e) {
    console.error("meta error", e);
  }

  const infoRows: InfoRow[] = [];
  const existingRows = REGISTRY.filter((r) => meta[r.name]);
  await Promise.all(
    existingRows.map(async (r) => {
      const m = meta[r.name];
      const count = await sourceCount(r.name);
      infoRows.push({
        name: r.name,
        label: r.label,
        group: r.group,
        exists: true,
        has_date: m.has_date,
        count,
      });
    })
  );
  for (const r of REGISTRY) {
    if (!meta[r.name]) {
      infoRows.push({ name: r.name, label: r.label, group: r.group, exists: false, has_date: false, count: null });
    }
  }

  return jsonResponse({
    success: true,
    project: { url: selfUrl(), active: true },
    targets,
    tables: infoRows,
  });
}

// ============================================================
// النسخة الكاملة (Full Clone): Schema + Data + Storage + Auth
// ============================================================

interface SchemaTable {
  name: string;
  columns: { name: string; type: string; not_null: boolean; default: string | null; identity: string; generated: string }[];
  constraints: { name: string; type: string; def: string }[];
  indexes: { name: string; def: string }[];
  triggers: string[];
  rls: boolean;
  policies: { name: string; cmd: string; roles: string[]; permissive: boolean; qual: string | null; with_check: string | null }[];
  sequences: string[];
}

interface SchemaDump {
  enums: { name: string; values: string[] }[];
  tables: SchemaTable[];
  views: { name: string; definition: string }[];
  matviews: { name: string; definition: string; populated: boolean; indexes: string[] }[];
  functions: string[];
}

function qI(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

function qL(value: string): string {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function buildCreateTable(t: SchemaTable): string {
  const line = t.columns.map((c) => {
    if (c.generated === "s" && c.default) {
      let out = `  ${qI(c.name)} ${c.type} GENERATED ALWAYS AS (${c.default}) STORED`;
      if (c.not_null) out += " NOT NULL";
      return out;
    }
    let out = `  ${qI(c.name)} ${c.type}`;
    if (c.identity === "always") out += " GENERATED ALWAYS AS IDENTITY";
    else if (c.identity === "default") out += " GENERATED BY DEFAULT AS IDENTITY";
    if (c.not_null) out += " NOT NULL";
    if (c.default && !c.identity && c.generated !== "s") out += ` DEFAULT ${c.default}`;
    return out;
  });
  return `CREATE TABLE IF NOT EXISTS public.${qI(t.name)} (\n${line.join(",\n")}\n);`;
}

const POLICY_CMD: Record<string, string> = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE", "*": "ALL" };

const NEXTVAL_RE = /nextval\('([^']+)'::regclass\)/;

async function ensureSerialSequences(target: Target, tables: SchemaTable[]): Promise<string[]> {
  const errors: string[] = [];
  const seqs: string[] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.identity || !c.default) continue;
      const m = NEXTVAL_RE.exec(c.default);
      if (!m) continue;
      const parts = m[1].split(".");
      const name = parts.length > 1 ? parts[parts.length - 1] : m[1];
      const schema = parts.length > 1 ? parts.slice(0, -1).join(".") : "public";
      const full = `${qI(schema)}.${qI(name)}`;
      if (!seqs.includes(full)) seqs.push(full);
    }
  }
  for (const s of seqs) {
    const r = await execOnTarget(target, `CREATE SEQUENCE IF NOT EXISTS ${s};`);
    if (!r.ok) errors.push(`sequence ${s}: ${r.status} ${r.text.slice(0, 120)}`);
  }
  return errors;
}

function buildPolicy(t: SchemaTable, p: SchemaTable["policies"][number]): string {
  const cmd = POLICY_CMD[p.cmd] || "ALL";
  const asTxt = p.permissive === false ? "AS RESTRICTIVE" : "AS PERMISSIVE";
  const roles = p.roles && p.roles.length ? ` TO ${p.roles.map((r) => (r === "public" ? "public" : qI(r))).join(", ")}` : "";
  const using = p.qual ? ` USING (${p.qual})` : "";
  const check = p.with_check ? ` WITH CHECK (${p.with_check})` : "";
  return `CREATE POLICY ${qI(p.name)} ON public.${qI(t.name)} ${asTxt} FOR ${cmd}${roles}${using}${check};`;
}

async function selfRpc(fn: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${selfUrl()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: restHeaders(selfKey()),
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch (_e) {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, data };
}

async function targetRpc(target: Target, fn: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${target.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: restHeaders(target.key),
    body: JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch (_e) {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, data };
}

async function execOnTarget(target: Target, sql: string): Promise<{ ok: boolean; status: number; text: string }> {
  if (!sql || !sql.trim()) return { ok: true, status: 200, text: "" };
  const res = await fetch(`${target.url}/rest/v1/rpc/migration_exec`, {
    method: "POST",
    headers: restHeaders(target.key),
    body: JSON.stringify({ p_sql: sql }),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

async function applySchemaToTarget(target: Target, schema: { enums: { name: string; values: string[] }[]; tables: SchemaTable[]; views: { name: string; definition: string }[]; matviews: { name: string; definition: string; populated: boolean; indexes: string[] }[]; functions: string[] }, wipe: boolean) {
  const report: Record<string, unknown> = { tables: 0, constraints: 0, indexes: 0, policies: 0, triggers: 0, views: 0, matviews: 0, functions: 0, errors: [] as string[] };
  const bad = (what: string, r: { ok: boolean; status: number; text: string }) => {
    (report.errors as string[]).push(`${what}: ${r.status} ${r.text.slice(0, 160)}`);
  };

  if (wipe) {
    for (const t of schema.tables || []) {
      const r = await execOnTarget(target, `DO $$ BEGIN IF to_regclass('public.${qI(t.name)}') IS NOT NULL THEN TRUNCATE TABLE public.${qI(t.name)} CASCADE; END IF; END $$;`);
      if (!r.ok) bad(`wipe ${t.name}`, r);
    }
  }

  for (const e of schema.enums || []) {
    const vals = (e.values || []).map((v) => qL(String(v))).join(", ");
    const sql = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=${qL(String(e.name))}) THEN CREATE TYPE public.${qI(e.name)} AS ENUM (${vals}); END IF; END $$;`;
    const r = await execOnTarget(target, sql);
    if (!r.ok) bad(`enum ${e.name}`, r);
  }

  const tables = schema.tables || [];

  const seqErrors = await ensureSerialSequences(target, tables);
  for (const e of seqErrors) (report.errors as string[]).push(e);

  for (const t of tables) {
    const r = await execOnTarget(target, buildCreateTable(t));
    if (!r.ok) {
      bad(`table ${t.name}`, r);
      continue;
    }
    report.tables = Number(report.tables) + 1;
  }

  for (const t of tables) {
    for (const con of t.constraints || []) {
      if (con.type !== "p" && con.type !== "u") continue;
      const r = await execOnTarget(target, `ALTER TABLE ONLY public.${qI(t.name)} ADD CONSTRAINT ${qI(con.name)} ${con.def};`);
      if (r.ok) report.constraints = Number(report.constraints) + 1;
      else bad(`constraint ${con.name}@${t.name}`, r);
    }
  }
  for (const t of tables) {
    for (const ix of t.indexes || []) {
      const r = await execOnTarget(target, ix.def + ";");
      if (r.ok) report.indexes = Number(report.indexes) + 1;
      else bad(`index ${ix.name}@${t.name}`, r);
    }
  }
  for (const t of tables) {
    for (const con of t.constraints || []) {
      if (con.type !== "f" && con.type !== "c") continue;
      const r = await execOnTarget(target, `ALTER TABLE ONLY public.${qI(t.name)} ADD CONSTRAINT ${qI(con.name)} ${con.def};`);
      if (r.ok) report.constraints = Number(report.constraints) + 1;
      else bad(`constraint ${con.name}@${t.name}`, r);
    }
  }

  for (const f of schema.functions || []) {
    const r = await execOnTarget(target, f.trimEnd() + ";");
    if (r.ok) report.functions = Number(report.functions) + 1;
    else bad("function", r);
  }

  for (const t of tables) {
    for (const tr of t.triggers || []) {
      const r = await execOnTarget(target, tr + ";");
      if (r.ok) report.triggers = Number(report.triggers) + 1;
      else bad(`trigger@${t.name}`, r);
    }
    if (t.rls) {
      const r = await execOnTarget(target, `ALTER TABLE public.${qI(t.name)} ENABLE ROW LEVEL SECURITY;`);
      if (!r.ok) bad(`rls ${t.name}`, r);
    }
    for (const p of t.policies || []) {
      const r = await execOnTarget(target, buildPolicy(t, p));
      if (r.ok) report.policies = Number(report.policies) + 1;
      else bad(`policy ${p.name}@${t.name}`, r);
    }
  }

  for (const v of schema.views || []) {
    const r = await execOnTarget(target, `CREATE OR REPLACE VIEW public.${qI(v.name)} AS\n${v.definition};`);
    if (r.ok) report.views = Number(report.views) + 1;
    else bad(`view ${v.name}`, r);
  }

  for (const m of schema.matviews || []) {
    const r = await execOnTarget(target, `CREATE MATERIALIZED VIEW IF NOT EXISTS public.${qI(m.name)} AS\n${m.definition};`);
    if (r.ok) {
      report.matviews = Number(report.matviews) + 1;
      for (const ix of m.indexes || []) {
        const r2 = await execOnTarget(target, ix + ";");
        if (!r2.ok) bad(`matview index ${m.name}`, r2);
      }
    } else bad(`matview ${m.name}`, r);
  }

  return report;
}

async function cloneDataInto(target: Target, tables: SchemaTable[]): Promise<{ tables: Record<string, unknown>[]; inserted: number; existing: number }> {
  const out: { tables: Record<string, unknown>[]; inserted: number; existing: number } = { tables: [], inserted: 0, existing: 0 };
  for (const t of tables) {
    let inserted = 0;
    let existing = 0;
    const errs: string[] = [];
    let offset = 0;
    for (;;) {
      const url = `${selfUrl()}/rest/v1/${t.name}?select=*&offset=${offset}&limit=${PAGE_SIZE}`;
      const res = await fetch(url, { headers: restHeaders(selfKey()) });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        errs.push(`قراءة ${t.name}: ${res.status} ${text.slice(0, 160)}`);
        break;
      }
      const page = (await res.json().catch(() => [])) as Record<string, unknown>[];
      if (!page.length) break;
      for (const part of chunk(page, CHUNK_SIZE)) {
        const r = await importToTarget(target, t.name, part, true);
        inserted += r.inserted;
        existing += r.existing;
        if (r.errors.length) errs.push(...r.errors.map((e) => `${t.name}: ${e}`));
      }
      offset += page.length;
      if (page.length < PAGE_SIZE) break;
    }
    out.tables.push({ name: t.name, inserted, existing, errors: errs });
    out.inserted += inserted;
    out.existing += existing;
  }
  return out;
}

async function cloneStorage(target: Target): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { buckets: 0, objects: 0, bytes: 0, skipped: 0, errors: [] as string[] };
  const srcHeaders = restHeaders(selfKey());
  let buckets: { name: string; public?: boolean; file_size_limit?: number | null; allowed_mime_types?: string[] | null }[] = [];
  try {
    const res = await fetch(`${selfUrl()}/storage/v1/bucket`, { headers: srcHeaders });
    if (res.ok) buckets = (await res.json()) as typeof buckets;
  } catch (e) {
    (out.errors as string[]).push("buckets list: " + (e instanceof Error ? e.message : String(e)));
    return out;
  }

  const MAX_OBJECT = 30 * 1024 * 1024;
  const CONC = 2;
  for (const b of buckets) {
    const targetHeaders = restHeaders(target.key);
    const exists = await fetch(`${target.url}/storage/v1/bucket/${b.name}`, { headers: targetHeaders })
      .then((r) => r.ok)
      .catch(() => false);
    const body = JSON.stringify({ id: b.name, name: b.name, public: !!b.public, file_size_limit: b.file_size_limit || null, allowed_mime_types: b.allowed_mime_types || null });
    if (exists) {
      await fetch(`${target.url}/storage/v1/bucket/${b.name}`, { method: "PUT", headers: targetHeaders, body }).catch(() => {});
    } else {
      const c = await fetch(`${target.url}/storage/v1/bucket`, { method: "POST", headers: targetHeaders, body });
      if (!c.ok) {
        (out.errors as string[]).push(`bucket ${b.name}: ${c.status}`);
        continue;
      }
    }
    out.buckets = Number(out.buckets) + 1;

    const objects: { name: string; metadata?: { size?: number; mimetype?: string; cacheControl?: string } }[] = [];
    let offset = 0;
    for (;;) {
      const lr = await fetch(`${selfUrl()}/storage/v1/object/list/${b.name}`, {
        method: "POST",
        headers: { ...srcHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit: 1000, offset }),
      });
      const page = lr.ok ? ((await lr.json().catch(() => [])) as typeof objects) : [];
      if (!page.length) break;
      objects.push(...page);
      offset += page.length;
      if (page.length < 1000) break;
    }

    let idx = 0;
    async function worker() {
      while (idx < objects.length) {
        const o = objects[idx++];
        const size = Number(o.metadata?.size || 0);
        if (size > MAX_OBJECT) {
          out.skipped = Number(out.skipped) + 1;
          continue;
        }
        try {
          const d = await fetch(`${selfUrl()}/storage/v1/object/authenticated/${encodeURIComponent(b.name)}/${encodeURIComponent(o.name)}`, {
            headers: srcHeaders,
          });
          if (!d.ok) {
            (out.errors as string[]).push(`${b.name}/${o.name}: dl ${d.status}`);
            continue;
          }
          const buf = await d.arrayBuffer();
          const up = await fetch(`${target.url}/storage/v1/object/${encodeURIComponent(b.name)}/${encodeURIComponent(o.name)}`, {
            method: "POST",
            headers: {
              ...restHeaders(target.key),
              "x-upsert": "true",
              "cache-control": o.metadata?.cacheControl || "max-age=3600",
              "Content-Type": o.metadata?.mimetype || "application/octet-stream",
            },
            body: buf,
          });
          if (!up.ok) {
            (out.errors as string[]).push(`${b.name}/${o.name}: up ${up.status}`);
            continue;
          }
          out.objects = Number(out.objects) + 1;
          out.bytes = Number(out.bytes) + size;
        } catch (e) {
          (out.errors as string[]).push(`${b.name}/${o.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    await Promise.all(Array.from({ length: CONC }, worker));
  }
  return out;
}

async function cloneAuth(target: Target): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const dump = await selfRpc("migration_auth_dump");
  if (!dump.ok) return { ok: false, error: `auth dump: ${dump.status}` };
  const d = dump.data as { users?: unknown[]; identities?: unknown[] };
  const res = await targetRpc(target, "migration_auth_import", {
    p_users: d.users || [],
    p_identities: d.identities || [],
  });
  if (!res.ok) return { ok: false, error: `auth import: ${res.status} ${String(res.data || "").slice(0, 200)}` };
  return { ok: true, data: res.data };
}

async function handleFullInfo() {
  const stats = await selfRpc("migration_full_stats");
  let sourceStorage: Record<string, unknown> | null = null;
  try {
    const buckets = await fetch(`${selfUrl()}/storage/v1/bucket`, { headers: restHeaders(selfKey()) })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    const perBucket: Record<string, unknown>[] = [];
    let objects = 0;
    let bytes = 0;
    for (const b of Array.isArray(buckets) ? (buckets as { name: string }[]) : []) {
      let cnt = 0;
      let off = 0;
      let by = 0;
      for (;;) {
        const lr = await fetch(`${selfUrl()}/storage/v1/object/list/${b.name}`, {
          method: "POST",
          headers: { ...restHeaders(selfKey()), "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: "", limit: 1000, offset: off }),
        });
        const page = lr.ok ? ((await lr.json().catch(() => [])) as { name: string; metadata?: { size?: number } }[]) : [];
        if (!page.length) break;
        cnt += page.length;
        by += page.reduce((a, o) => a + Number(o.metadata?.size || 0), 0);
        off += page.length;
        if (page.length < 1000) break;
      }
      objects += cnt;
      bytes += by;
      perBucket.push({ name: b.name, objects: cnt, bytes: by });
    }
    sourceStorage = { buckets: perBucket, objects, bytes };
  } catch (e) {
    sourceStorage = { error: e instanceof Error ? e.message : String(e) };
  }

  const targetStates: Record<string, unknown>[] = [];
  for (const t of getTargets()) {
    const probe = await execOnTarget(t, "SELECT 1");
    targetStates.push({
      name: t.name,
      url: t.url,
      sqlInstalled: probe.ok,
      reason: probe.ok ? "مثبّت" : `SQL غير مثبّت أو مفتاح خاطئ (${probe.status})`,
    });
  }

  return jsonResponse({
    success: true,
    source: stats.ok ? stats.data : { error: `stats: ${stats.status} — شغّل الـ SQL المحدّث في المصدر أولاً`, sqlMissing: !stats.ok },
    sourceStorage,
    targets: targetStates,
  });
}

async function handleClone(body: Record<string, unknown>) {
  const targetNames = Array.isArray(body.targets) ? body.targets.map((t) => String(t)) : [];
  const targets = getTargets().filter((t) => targetNames.includes(t.name) && t.url !== selfUrl());
  if (!targets.length) return jsonResponse({ error: "لم تختر أي هدف." }, { status: 400 });

  const phases = (body.phases && typeof body.phases === "object" ? body.phases : {}) as Record<string, boolean>;
  const doSchema = phases.schema !== false;
  const doData = phases.data !== false;
  const doStorage = phases.storage !== false;
  const doAuth = phases.auth !== false;
  const wipe = !!body.wipe;
  const dryRun = !!body.dryRun;
  if (!doSchema && !doData && !doStorage && !doAuth) return jsonResponse({ error: "اختر قسمًا واحدًا على الأقل." }, { status: 400 });

  const schema = doSchema || doData ? await selfRpc("migration_schema_dump") : { ok: true, status: 200, data: null };
  if (!schema.ok) {
    return jsonResponse({ error: `المصدر عنده SQL قديم — شغّل ملف migration_rpc.sql المحدّث في المصدر أولاً (${schema.status}).` }, { status: 400 });
  }
  const schemaData = (schema.data || {}) as SchemaDump;

  const report: Record<string, unknown> = { source: selfUrl(), targets: {}, phases: { schema: doSchema, data: doData, storage: doStorage, auth: doAuth }, dryRun, wipe };

  for (const target of targets) {
    const perTarget: Record<string, unknown> = { url: target.url };
    if (doSchema) {
      const r = await applySchemaToTarget(target, schemaData, wipe);
      perTarget.schema = r;
    }
    if (doData && !dryRun) {
      const r = await cloneDataInto(target, schemaData.tables || []);
      perTarget.data = { tables: r.tables, inserted: r.inserted, existing: r.existing };
      try {
        const jumps = (schemaData.tables || [])
          .filter((t) => t.sequences && t.sequences.length)
          .map((t) => ({ table: t.name, columns: t.sequences }));
        await targetRpc(target, "migration_jump_sequences", { p_tables: jumps });
      } catch (e) {
        (perTarget as Record<string, any>).seqWarning = e instanceof Error ? e.message : String(e);
      }
      const mvErrors: string[] = [];
      for (const m of schemaData.matviews || []) {
        if (!m.populated) continue;
        const rr = await execOnTarget(target, `REFRESH MATERIALIZED VIEW public.${qI(m.name)};`);
        if (!rr.ok) mvErrors.push(`${m.name}: ${rr.status}`);
      }
      if (mvErrors.length) ((perTarget.data as Record<string, unknown>).matviewRefreshErrors as string[]) = mvErrors;
    }
    if (doData && dryRun) {
      const counts: Record<string, unknown>[] = [];
      for (const t of schemaData.tables || []) {
        const c = await sourceCount(t.name);
        counts.push({ name: t.name, rows: c });
      }
      perTarget.data = { dry: true, tables: counts };
    }
    if (doStorage) {
      perTarget.storage = await cloneStorage(target);
    }
    if (doAuth && !dryRun) {
      const r = await cloneAuth(target);
      perTarget.auth = r.ok ? r.data : { error: r.error };
    }
    if (doAuth && dryRun) {
      const c = await selfRpc("migration_full_stats");
      const sd = c.data as { auth_users?: number } | null;
      perTarget.auth = { dry: true, users: sd?.auth_users ?? "?" };
    }
    report.targets = { ...(report.targets as Record<string, unknown>), [target.name]: perTarget };
  }

  return jsonResponse({ success: true, report });
}

async function handleMigrate(body: Record<string, unknown>) {
  const mode = String(body.mode || "insert");
  if (!["insert", "sync", "copy"].includes(mode)) {
    return jsonResponse({ error: "وضعية غير معروفة. اختر insert أو sync أو copy." }, { status: 400 });
  }

  const rawTables = Array.isArray(body.tables) ? body.tables.map((t) => String(t)) : [];
  const requested = new Set(rawTables);
  const statsRes = await selfRpc("migration_full_stats");
  const allNames: string[] = [];
  const sd = statsRes.data as any;
  if (statsRes.ok && sd && Array.isArray(sd.tables)) {
    allNames.push(...sd.tables.map((x: any) => String(x.name || x)));
  }
  const tables = allNames.filter((t) => requested.has(t));
  if (!tables.length) {
    return jsonResponse({ error: "لم تختر أي جدول." }, { status: 400 });
  }

  const since = body.since ? String(body.since) : "";
  const dryRun = !!body.dryRun;
  const targetNames = Array.isArray(body.targets) ? body.targets.map((t) => String(t)) : [];
  const targets = getTargets().filter((t) => targetNames.includes(t.name));
  const usableTargets = targets.filter((t) => t.url !== selfUrl());
  if (!usableTargets.length) {
    return jsonResponse({ error: "لم تختر أي هدف (أو الهدف هو نفس المشروع المصدر)." }, { status: 400 });
  }

  const updateMode = mode === "sync" || mode === "copy";
  const meta = await selfMeta(tables);

  const results: Record<string, unknown>[] = [];

  for (const table of tables) {
    const m = meta[table];
    if (!m) {
      results.push({ table, label: labelOf(table), error: "جدول غير موجود في المصدر", rows: 0 });
      continue;
    }
    try {
      const orderCol = m.columns.includes("id") ? "id" : (m.columns[0] || "");
      // المعاينة: الجداول الضخمة لا تُعَدّ بالتفصيل (كانت تموت بوقت المهلة) — نلغي الحساب الدقيق ونخبر المستخدم.
      if (dryRun && orderCol === "id") {
        const cnt = await sourceCount(table);
        if (cnt !== null && cnt > PREVIEW_MAX_ROWS) {
          results.push({
            table,
            label: labelOf(table),
            rows: cnt,
            huge: true,
            error: `جدول كبير (${cnt.toLocaleString("en")} صف) — المعاينة لا تحسب الموجود بالتفصيل لتوفير الوقت. نفّذ مزامنة/نسخة كاملة مباشرة، أو استثنِ الجدول.`,
            targets: {},
          });
          continue;
        }
      }
      const { rows } = await readAllRows(table, m.has_date, since ? since : undefined, orderCol, dryRun);
      const tableResult: Record<string, unknown> & { targets: Record<string, unknown> } = {
        table,
        label: labelOf(table),
        rows: rows.length,
        targets: {},
      };

      for (const target of usableTargets) {
        if (dryRun) {
          const ids = rows.map((r) => r.id as string | number);
          const existing = await existingIdsOf(target, table, ids);
          const present = existing.found.size;
          if (existing.errors.length && present === 0) {
            tableResult.targets[target.name] = {
              dry: true,
              down: true,
              error: "الهدف غير متاح من المصدر (" + existing.errors.slice(0, 3).join(", ") + ") — تحقق من مفتاح الخدمة وحالة المشروع.",
            };
            continue;
          }
          tableResult.targets[target.name] = {
            dry: true,
            toInsert: ids.length - present,
            present,
            willUpdate: updateMode ? present : 0,
          };
          continue;
        }
        const r = await importToTarget(target, table, rows, updateMode);
        tableResult.targets[target.name] = {
          inserted: r.inserted,
          existing: r.existing,
          updated: r.updated,
          errors: r.errors,
        };
      }

      results.push(tableResult);
    } catch (e) {
      results.push({ table, label: labelOf(table), error: e instanceof Error ? e.message : String(e), rows: 0 });
    }
  }

  if (!dryRun) {
    for (const target of usableTargets) {
      try {
        await setSequencesOnTarget(target, tables);
      } catch (e) {
        console.warn("setSequences warning", e);
      }
    }
  }

  return jsonResponse({
    success: true,
    mode,
    dryRun,
    source: selfUrl(),
    results,
  });
}

// النقل بالمراحل: كل استدعاء ينقل صفحة واحدة (حتى limit صفًا) من جدول واحد
// إلى كل الأهداف المختارة، ويَرجع nextLastId ليُكمَّل من عنده بعدها.
// بهذه الطريقة تُنقل كل الصفوف حتى للجداول العملاقة (ملايين الصفوف)
// بدون التعرض لـ timeout، والنقل قابل للاستئناف عند أي انقطاع.
async function handleMigrateStep(body: Record<string, unknown>) {
  const table = String(body.table || "");
  if (!table || !REGISTRY.some((r) => r.name === table)) {
    return jsonResponse({ error: "جدول غير مسموح به في النسخ." }, { status: 400 });
  }
  const mode = String(body.mode || "sync");
  if (!["insert", "sync", "copy"].includes(mode)) {
    return jsonResponse({ error: "وضعية غير معروفة." }, { status: 400 });
  }
  const targetNames = Array.isArray(body.targets) ? body.targets.map((t) => String(t)) : [];
  const targets = getTargets().filter((t) => targetNames.includes(t.name));
  const usableTargets = targets.filter((t) => t.url !== selfUrl());
  if (!usableTargets.length) {
    return jsonResponse({ error: "لم تختر هدفًا صالحًا (أو الهدف هو نفسه المصدر)." }, { status: 400 });
  }
  const since = body.since ? String(body.since) : "";
  const updateMode = mode === "sync" || mode === "copy";
  const limit = Math.min(Math.max(Number(body.limit) || PAGE_SIZE, 50), PAGE_SIZE);
  const lastIdStr = body.lastId != null && String(body.lastId) !== "" ? String(body.lastId) : null;

  const meta = await selfMeta([table]);
  const m = meta[table];
  if (!m) {
    return jsonResponse({ error: `جدول ${table} غير موجود في المصدر.` }, { status: 400 });
  }

  const orderCol = m.columns.includes("id") ? "id" : (m.columns[0] || "id");
  const { rows, nextLastId, done } = await readPageForStep(table, m.has_date, lastIdStr, since, orderCol, limit);

  let inserted = 0;
  let existing = 0;
  const errors: string[] = [];
  for (const target of usableTargets) {
    const r = await importToTarget(target, table, rows, updateMode);
    inserted += r.inserted;
    existing += r.existing;
    for (const e of r.errors) {
      errors.push(`${target.name}: ${e}`);
    }
  }

  if (done) {
    for (const target of usableTargets) {
      try {
        await setSequencesOnTarget(target, [table]);
      } catch (e) {
        console.warn("setSequences warning", table, e);
      }
    }
  }

  return jsonResponse({
    success: true,
    table,
    mode,
    source: selfUrl(),
    rows: rows.length,
    done,
    nextLastId,
    inserted,
    existing,
    updated: updateMode ? existing : 0,
    targets: usableTargets.map((t) => t.name),
    errors: errors.slice(0, 20),
  });
}

function labelOf(table: string): string {
  return REGISTRY.find((r) => r.name === table)?.label || table;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "info");

    if (action === "info") {
      return await handleInfo();
    }

    if (action === "migrate") {
      const token = String(body.adminToken || "");
      const ok = await isValidAdminToken(token);
      if (!ok) {
        return jsonResponse({ error: "توكن الأدمن غير صالح." }, { status: 401 });
      }
      return await handleMigrate(body);
    }

    if (action === "migrate-step") {
      const token = String(body.adminToken || "");
      const ok = await isValidAdminToken(token);
      if (!ok) {
        return jsonResponse({ error: "توكن الأدمن غير صالح." }, { status: 401 });
      }
      return await handleMigrateStep(body);
    }

    if (action === "fullinfo") {
      const token = String(body.adminToken || "");
      const ok = await isValidAdminToken(token);
      if (!ok) {
        return jsonResponse({ error: "توكن الأدمن غير صالح." }, { status: 401 });
      }
      return await handleFullInfo();
    }

    if (action === "clone") {
      const token = String(body.adminToken || "");
      const ok = await isValidAdminToken(token);
      if (!ok) {
        return jsonResponse({ error: "توكن الأدمن غير صالح." }, { status: 401 });
      }
      return await handleClone(body);
    }

    return jsonResponse({ error: "action غير معروف." }, { status: 400 });
  } catch (error) {
    console.error("data-migrate error", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." }, { status: 500 });
  }
});
-- ============================================================
-- Migration: Seller Profiles Pool + Product Assignments
-- Execute this in Supabase SQL Editor
-- ============================================================

-- 1. Create seller_profiles table (the pool)
CREATE TABLE IF NOT EXISTS seller_profiles (
  id SERIAL PRIMARY KEY,
  seller_name TEXT NOT NULL,
  years_with_buda INT DEFAULT 1,
  rating NUMERIC(3,1) DEFAULT 4.5,
  satisfaction INT DEFAULT 95,
  sales_count INT DEFAULT 100,
  shipping_speed TEXT DEFAULT 'شحن سريع',
  is_official BOOLEAN DEFAULT FALSE,
  used_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create product_sellers table if not exists (the assignments)
CREATE TABLE IF NOT EXISTS product_sellers (
  product_id TEXT PRIMARY KEY,
  seller_name TEXT NOT NULL,
  years_with_buda INT DEFAULT 0,
  rating NUMERIC(3,1) DEFAULT 0,
  satisfaction INT DEFAULT 0,
  sales_count INT DEFAULT 0,
  shipping_speed TEXT DEFAULT '',
  is_official BOOLEAN DEFAULT FALSE,
  profile_id INT REFERENCES seller_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add profile_id to existing product_sellers table (legacy)
ALTER TABLE product_sellers ADD COLUMN IF NOT EXISTS profile_id INT REFERENCES seller_profiles(id);

-- 3. Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_seller_profiles_used_count ON seller_profiles(used_count);
CREATE INDEX IF NOT EXISTS idx_product_sellers_profile_id ON product_sellers(profile_id);

-- 4. Enable RLS for seller_profiles
ALTER TABLE seller_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON seller_profiles;
CREATE POLICY "Public read" ON seller_profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public write" ON seller_profiles;
CREATE POLICY "Public write" ON seller_profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update" ON seller_profiles;
CREATE POLICY "Public update" ON seller_profiles FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public delete" ON seller_profiles;
CREATE POLICY "Public delete" ON seller_profiles FOR DELETE USING (true);

-- 5. Enable RLS for product_sellers
ALTER TABLE product_sellers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON product_sellers;
CREATE POLICY "Public read" ON product_sellers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public write" ON product_sellers;
CREATE POLICY "Public write" ON product_sellers FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update" ON product_sellers;
CREATE POLICY "Public update" ON product_sellers FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Public delete" ON product_sellers;
CREATE POLICY "Public delete" ON product_sellers FOR DELETE USING (true);

-- ============================================================
-- PostgreSQL function: generate_seller_profiles(p_count)
-- Generates p_count random seller profiles directly in SQL.
-- Run: SELECT * FROM generate_seller_profiles(2500);
-- ============================================================
DROP FUNCTION IF EXISTS generate_seller_profiles;
CREATE FUNCTION generate_seller_profiles(p_count INT DEFAULT 100)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  names TEXT[] := ARRAY[
    'نجوم','سنسن','بصمة','إبداع','أصالة','تميز','فخامة','أناقة',
    'رقي','درة','لؤلؤ','مرجان','ياقوت','زمرد','فيروز','سحر',
    'أمل','ورد','نرجس','ياسمين','فل','ريحان','ندى','شهد',
    'عنبر','مسك','عطر','بهاء','ضياء','نور','قمر',
    'بدر','هلال','شمس','نجم','كوكب','أثير','سمو','مجد',
    'علياء','سندس','إستبرق','حرير','ديباج','أطلس','مخمل',
    'نخيل','بستان','واحة','زهرة','ربيع','كوثر','سلسبيل',
    'نماء','ازدهار','رفعة','علو','سؤدد','مهابة','وقار',
    'حكمة','دراية','خبرة','إتقان','براعة','مهارة',
    'نبع','مورد','غدير','فيض','مدد','عطاء','سنابل'
  ];
  speeds TEXT[] := ARRAY['شحن سريع','شحن فوري','شحن خلال 24 ساعة','توصيل سريع','شحن ممتاز','توصيل فوري'];
  i INT;
  y INT;
  base_sales INT;
BEGIN
  FOR i IN 1..p_count LOOP
    y := 1 + floor(random() * 10)::INT;
    base_sales := 50 + floor(random() * 200)::INT;
    INSERT INTO seller_profiles (seller_name, years_with_buda, rating, satisfaction, sales_count, shipping_speed, is_official)
    VALUES (
      names[1 + floor(random() * array_length(names, 1))::INT],
      y,
      round((38 + random() * 12)::NUMERIC, 1) / 10,
      85 + floor(random() * 15)::INT,
      round((base_sales * (1 + y * 0.25)) / 10) * 10,
      speeds[1 + floor(random() * array_length(speeds, 1))::INT],
      random() > 0.65
    );
  END LOOP;
  RETURN p_count;
END;
$$;

-- ============================================================
-- IMPORTANT: After creating the function, run this to seed:
-- SELECT * FROM generate_seller_profiles(2500);
--
-- This generates 2500 seller profiles in the pool.
-- Each profile can serve up to 8 products (MAX_USES in JS code).
-- ============================================================

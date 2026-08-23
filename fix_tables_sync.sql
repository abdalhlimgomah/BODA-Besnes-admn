-- إضافة review_status لجدول my_products (لو مش موجود)
ALTER TABLE IF EXISTS public.my_products ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';

-- إضافة review_status و legacy_my_products_id لجدول products (لو مش موجود)
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending';
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS legacy_my_products_id TEXT;

-- صلاحية كاملة لـ anon على products
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_anon_all" ON public.products;
CREATE POLICY "products_anon_all" ON public.products FOR ALL TO anon USING (true) WITH CHECK (true);

-- صلاحية كاملة لـ anon على my_products
ALTER TABLE IF EXISTS public.my_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "my_products_anon_all" ON public.my_products;
CREATE POLICY "my_products_anon_all" ON public.my_products FOR ALL TO anon USING (true) WITH CHECK (true);

-- صلاحية كاملة لـ anon على taager_products (للقراءة والتعديل)
ALTER TABLE IF EXISTS public.taager_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "taager_products_anon_all" ON public.taager_products;
CREATE POLICY "taager_products_anon_all" ON public.taager_products FOR ALL TO anon USING (true) WITH CHECK (true);

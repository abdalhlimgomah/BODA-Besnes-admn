-- إضافة عمود product_name إلى جدول orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_name TEXT;

-- تحديث الطلبات القديمة بجلب اسم المنتج من items_json
UPDATE public.orders
SET product_name = (
  SELECT (items_json::json->0->>'name')
  WHERE items_json IS NOT NULL AND items_json != ''
)
WHERE product_name IS NULL;

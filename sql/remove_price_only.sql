-- إزالة السعر فقط من الأوصاف (بدون مسح المحتوى)
UPDATE taager_products
SET
  quick_details = regexp_replace(quick_details, '\s*سعر\s*(منافس|:)?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)', '', 'g'),
  content_ideas = regexp_replace(content_ideas, '\s*سعر\s*(منافس|:)?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)', '', 'g')
WHERE
  quick_details ~ 'سعر.*[\d,]+\.?\d*\s*(ج\.م|جنيه)'
  OR content_ideas ~ 'سعر.*[\d,]+\.?\d*\s*(ج\.م|جنيه)';

SELECT COUNT(*) AS "تم التحديث" FROM taager_products
WHERE quick_details !~ 'سعر.*[\d,]+\.?\d*\s*(ج\.م|جنيه)'
  AND content_ideas !~ 'سعر.*[\d,]+\.?\d*\s*(ج\.م|جنيه)';

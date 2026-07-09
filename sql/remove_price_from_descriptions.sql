-- إزالة أي ذكر للسعر من quick_details و content_ideas
UPDATE taager_products
SET
  quick_details = regexp_replace(
    regexp_replace(
      regexp_replace(quick_details, '\n?[💡📌🎯✨🔥✅\-•]?\s*سعر\s*(منافس|:)?.+', '', 'g'),
      '\d[\d,]*\.?\d*\s*ج\.م', '', 'g'
    ),
    '\n{2,}', '\n', 'g'
  ),
  content_ideas = regexp_replace(
    regexp_replace(
      regexp_replace(content_ideas, '\n?[💡📌🎯✨🔥✅\-•]?\s*سعر\s*(منافس|:)?.+', '', 'g'),
      '\d[\d,]*\.?\d*\s*ج\.م', '', 'g'
    ),
    '\n{2,}', '\n', 'g'
  )
WHERE
  quick_details ~ 'سعر|ج\.م|[\d,]+\.?\d*\s*جنيه'
  OR content_ideas ~ 'سعر|ج\.م|[\d,]+\.?\d*\s*جنيه';

-- عرض عدد المتأثرين
SELECT COUNT(*) AS "تم التحديث" FROM taager_products
WHERE quick_details !~ 'سعر|ج\.م' AND content_ideas !~ 'سعر|ج\.م';

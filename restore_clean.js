const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const HEADERS = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" };

async function main() {
  console.log("1. جلب قائمة الملفات من ai-details...");
  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/ai-details`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({ limit: 10000, offset: 0, prefix: "" }),
  });
  if (!listRes.ok) { console.error("فشل جلب القائمة"); return; }
  const files = await listRes.json();
  console.log(`   -> ${files.length} ملف`);

  let restored = 0, skipped = 0;
  const priceRegex = /\s*سعر\s*(منافس|:)?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)/g;
  const priceRegex2 = /✅\s*سعر\s*منافس\s*:?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)\s*/g;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.name.endsWith(".json")) continue;
    const productId = f.name.replace(".json", "");

    try {
      const dlRes = await fetch(`${SUPABASE_URL}/storage/v1/object/ai-details/${encodeURIComponent(f.name)}`, { headers: HEADERS });
      if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
      const buf = await dlRes.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(buf);

      let content;
      try { content = JSON.parse(text); }
      catch(e) {
        // Try fixing truncated JSON (add closing brace)
        const fixed = text.trimEnd() + '"}';
        try { content = JSON.parse(fixed); }
        catch(e2) { throw new Error("JSON parse failed: " + text.slice(-50)); }
      }

      if (!content.quick_details || !content.content_ideas) { skipped++; continue; }

      const cleanQd = content.quick_details.replace(priceRegex, "").replace(/\s{2,}/g, " ").trim();
      const cleanCi = content.content_ideas.replace(priceRegex, "").replace(priceRegex2, "").replace(/\n{3,}/g, "\n\n").trim();

      const updRes = await fetch(`${SUPABASE_URL}/rest/v1/taager_products?id=eq.${encodeURIComponent(productId)}`, {
        method: "PATCH", headers: HEADERS,
        body: JSON.stringify({ quick_details: cleanQd, content_ideas: cleanCi }),
      });
      if (!updRes.ok) throw new Error(`Update failed: ${updRes.status}`);
      restored++;
    } catch (e) {
      process.stdout.write(`\r   فشل ${productId}: ${e.message.slice(0, 60)}`);
    }

    if ((i + 1) % 100 === 0) console.log(`\n   تقدم: ${i + 1}/${files.length} - استعيد ${restored}`);
    await new Promise(r => setTimeout(r, 30));
  }

  console.log(`\n\n✅ تم استعادة ${restored} منتج`);
  console.log(`⏭️  تم تخطي ${skipped} (بدون محتوى)`);
}

main().catch(console.error);

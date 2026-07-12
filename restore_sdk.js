const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const sb = createClient(SUPABASE_URL, ANON_KEY);

const BUCKET = "ai-details";
const priceRx = /\s*سعر\s*(منافس|:)?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)/g;
const priceRx2 = /✅\s*سعر\s*منافس\s*:?\s*[\d,]+\.?\d*\s*(ج\.م|جنيه)\s*/g;

async function main() {
  console.log("1. جلب قائمة الملفات...");
  let allFiles = [];
  let offset = 0;
  const LIMIT = 500;
  while (true) {
    const { data: batch, error } = await sb.storage.from(BUCKET).list("", { limit: LIMIT, offset: offset, sortBy: { column: "name", order: "asc" } });
    if (error) { console.error("فشل:", error); return; }
    if (!batch || !batch.length) break;
    allFiles = allFiles.concat(batch);
    offset += batch.length;
    if (batch.length < LIMIT) break;
  }
  const files = allFiles;
  console.log(`   -> ${files.length} ملف`);

  let restored = 0, skipped = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.name.endsWith(".json")) continue;
    const productId = f.name.replace(".json", "");

    try {
      const { data, error: dlErr } = await sb.storage.from(BUCKET).download(f.name);
      if (dlErr) throw dlErr;
      const text = await data.text();
      let content = JSON.parse(text);

      if (!content.quick_details && !content.content_ideas) { skipped++; continue; }

      const cleanQd = (content.quick_details || "").replace(priceRx, "").replace(/\s{2,}/g, " ").trim();
      const cleanCi = (content.content_ideas || "").replace(priceRx, "").replace(priceRx2, "").replace(/\n{3,}/g, "\n\n").trim();

      const { error: updErr } = await sb.from("taager_products").update({ quick_details: cleanQd, content_ideas: cleanCi }).eq("id", productId);
      if (updErr) throw updErr;
      restored++;
    } catch (e) {
      process.stdout.write(`\rخطأ ${productId}: ${(e.message||"").slice(0,60)}`);
    }
    if ((i+1) % 100 === 0) console.log(`\n   ${i+1}/${files.length} - استعيد ${restored}`);
  }

  console.log(`\n\n✅ ${restored} منتج`);
  console.log(`⏭️ ${skipped}`);
}
main().catch(console.error);

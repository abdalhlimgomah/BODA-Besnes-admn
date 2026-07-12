import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getProvider } from "../_shared/provider.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const body = await req.json();
    const signature = req.headers.get("x-signature") || undefined;
    const provider = getProvider();
    const parsed = await provider.verifyWebhook(body, signature);

    if (parsed.type !== "payment") {
      return jsonResponse({ error: "This webhook is not a payment event." }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    const providerRef = parsed.providerRef;

    const { data: existingTx } = await supabaseAdmin
      .from("payment_transactions")
      .select("id, order_id, status")
      .eq("provider_ref", providerRef)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let targetOrderId = parsed.orderId || existingTx?.order_id || null;

    if (existingTx?.id) {
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: parsed.status,
          payload: parsed.raw,
          updated_at: new Date().toISOString(),
          order_id: targetOrderId,
        })
        .eq("id", existingTx.id);
    } else {
      await supabaseAdmin.from("payment_transactions").insert([
        {
          order_id: targetOrderId,
          provider: provider.name,
          provider_ref: providerRef,
          amount: Number(body.amount || 0),
          currency: String(body.currency || "EGP"),
          status: parsed.status,
          payload: parsed.raw,
        },
      ]);
    }

    if (targetOrderId) {
      const { data: order } = await supabaseAdmin.from("orders").select("id,status").eq("id", targetOrderId).maybeSingle();
      const updatePayload: Record<string, unknown> = {
        payment_status: parsed.status,
        payment_provider: provider.name,
        payment_ref: providerRef,
        updated_at: new Date().toISOString(),
      };

      if (parsed.status === "paid") {
        updatePayload.paid_at = new Date().toISOString();
        if (order?.status === "pending" || order?.status === "paid" || !order?.status) {
          updatePayload.status = "paid";
        }
      }

      if (parsed.status === "failed" && order?.status === "pending") {
        updatePayload.status = "cancelled";
      }

      await supabaseAdmin.from("orders").update(updatePayload).eq("id", targetOrderId);
    }

    return jsonResponse({
      success: true,
      provider_ref: providerRef,
      status: parsed.status,
      order_id: targetOrderId,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: (error as Error).message || "Unexpected error." }, { status: 500 });
  }
});

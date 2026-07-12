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
    const parsed = await provider.verifyWebhook({ ...body, type: "payout" }, signature);

    if (parsed.type !== "payout") {
      return jsonResponse({ error: "This webhook is not a payout event." }, { status: 400 });
    }

    const providerRef = parsed.providerRef;
    const payoutId = String(body.payout_id || body.payoutId || "");

    const normalizedStatus = parsed.status === "paid" ? "sent" : parsed.status === "failed" ? "failed" : "pending";
    const supabaseAdmin = createAdminClient();
    const updatePayload: Record<string, unknown> = {
      status: normalizedStatus,
      updated_at: new Date().toISOString(),
      metadata: parsed.raw,
    };
    if (normalizedStatus === "sent") {
      updatePayload.processed_at = new Date().toISOString();
    }

    if (providerRef) {
      await supabaseAdmin.from("payouts").update(updatePayload).eq("provider_ref", providerRef);
    } else if (payoutId) {
      await supabaseAdmin.from("payouts").update(updatePayload).eq("id", payoutId);
    } else {
      return jsonResponse({ error: "provider_ref or payout_id is required." }, { status: 400 });
    }

    return jsonResponse({
      success: true,
      provider_ref: providerRef || null,
      payout_id: payoutId || null,
      status: normalizedStatus,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: (error as Error).message || "Unexpected error." }, { status: 500 });
  }
});

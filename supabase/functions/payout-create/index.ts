import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getProvider } from "../_shared/provider.ts";
import { createAdminClient, getUserFromAuthHeader, isAdminUser } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  try {
    const supabaseAdmin = createAdminClient();
    const { user, error: authError } = await getUserFromAuthHeader(supabaseAdmin, req.headers.get("Authorization"));
    if (authError || !user) {
      return jsonResponse({ error: authError?.message || "Unauthorized." }, { status: 401 });
    }

    const admin = await isAdminUser(supabaseAdmin, user.id);
    if (!admin) {
      return jsonResponse({ error: "Admin role is required." }, { status: 403 });
    }

    const body = await req.json();
    const sellerId = String(body.seller_id || body.sellerId || "");
    const amount = Number(body.amount || 0);
    const currency = String(body.currency || "EGP");
    if (!sellerId) {
      return jsonResponse({ error: "seller_id is required." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: "amount must be a positive number." }, { status: 400 });
    }

    const payoutId = crypto.randomUUID();
    const provider = getProvider();
    const payoutResult = await provider.createPayout({
      payoutId,
      sellerId,
      amount,
      currency,
      metadata: {
        created_by: user.id,
        order_id: body.order_id || null,
      },
    });

    const { error: insertError } = await supabaseAdmin.from("payouts").insert([
      {
        id: payoutId,
        seller_id: sellerId,
        amount,
        currency,
        status: payoutResult.status,
        payment_provider: payoutResult.provider,
        provider_ref: payoutResult.providerRef,
        metadata: payoutResult.raw,
      },
    ]);

    if (insertError) {
      return jsonResponse({ error: insertError.message }, { status: 500 });
    }

    return jsonResponse({
      success: true,
      payout_id: payoutId,
      provider: payoutResult.provider,
      provider_ref: payoutResult.providerRef,
      status: payoutResult.status,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: (error as Error).message || "Unexpected error." }, { status: 500 });
  }
});

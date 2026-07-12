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

    const body = await req.json();
    const orderId = String(body.order_id || body.orderId || "");
    if (!orderId) {
      return jsonResponse({ error: "order_id is required." }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) {
      return jsonResponse({ error: "Order not found." }, { status: 404 });
    }

    const isAdmin = await isAdminUser(supabaseAdmin, user.id);
    if (!isAdmin && order.buyer_id && order.buyer_id !== user.id) {
      return jsonResponse({ error: "You are not allowed to create payment for this order." }, { status: 403 });
    }

    const amount = Number(body.amount ?? order.total ?? order.total_price ?? 0);
    const currency = String(body.currency || order.currency || "EGP");
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: "amount must be a positive number." }, { status: 400 });
    }

    const provider = getProvider();
    const paymentResult = await provider.createPayment({
      orderId,
      amount,
      currency,
      customerEmail: order.email || undefined,
      metadata: {
        initiated_by: user.id,
      },
    });

    const { error: txError } = await supabaseAdmin.from("payment_transactions").insert([
      {
        order_id: orderId,
        provider: paymentResult.provider,
        provider_ref: paymentResult.providerRef,
        amount,
        currency,
        status: "pending",
        payload: paymentResult.raw,
      },
    ]);

    if (txError) {
      return jsonResponse({ error: txError.message }, { status: 500 });
    }

    const { error: orderUpdateError } = await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "pending",
        payment_provider: paymentResult.provider,
        payment_ref: paymentResult.providerRef,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (orderUpdateError) {
      return jsonResponse({ error: orderUpdateError.message }, { status: 500 });
    }

    return jsonResponse({
      success: true,
      provider: paymentResult.provider,
      provider_ref: paymentResult.providerRef,
      checkout_url: paymentResult.checkoutUrl,
      status: paymentResult.status,
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: (error as Error).message || "Unexpected error." }, { status: 500 });
  }
});

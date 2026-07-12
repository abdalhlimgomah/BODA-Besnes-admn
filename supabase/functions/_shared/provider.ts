export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PayoutStatus = "pending" | "sent" | "failed";

export interface CreatePaymentInput {
  orderId: string;
  amount: number;
  currency: string;
  customerEmail?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentResult {
  provider: string;
  providerRef: string;
  checkoutUrl: string;
  status: PaymentStatus;
  raw: Record<string, unknown>;
}

export interface VerifyWebhookResult {
  ok: boolean;
  providerRef: string;
  orderId?: string;
  status: PaymentStatus | PayoutStatus;
  type: "payment" | "payout";
  raw: Record<string, unknown>;
}

export interface CreatePayoutInput {
  payoutId: string;
  sellerId: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePayoutResult {
  provider: string;
  providerRef: string;
  status: PayoutStatus;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult>;
  verifyWebhook(payload: Record<string, unknown>, signature?: string): Promise<VerifyWebhookResult>;
  getStatus(reference: string, type: "payment" | "payout"): Promise<{ status: PaymentStatus | PayoutStatus; raw: Record<string, unknown> }>;
}

class MockProvider implements PaymentProvider {
  readonly name = "mock";

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerRef = `pay_${crypto.randomUUID()}`;
    return {
      provider: this.name,
      providerRef,
      checkoutUrl: `https://example.local/checkout/${providerRef}`,
      status: "pending",
      raw: {
        provider_ref: providerRef,
        order_id: input.orderId,
        amount: input.amount,
        currency: input.currency,
      },
    };
  }

  async createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
    const providerRef = `po_${crypto.randomUUID()}`;
    return {
      provider: this.name,
      providerRef,
      status: "pending",
      raw: {
        provider_ref: providerRef,
        payout_id: input.payoutId,
        seller_id: input.sellerId,
        amount: input.amount,
        currency: input.currency,
      },
    };
  }

  async verifyWebhook(payload: Record<string, unknown>, _signature?: string): Promise<VerifyWebhookResult> {
    const type = String(payload.type || "payment") === "payout" ? "payout" : "payment";
    const providerRef = String(payload.provider_ref || payload.providerRef || "");
    if (!providerRef) {
      throw new Error("Webhook payload is missing provider_ref.");
    }

    const statusRaw = String(payload.status || "pending").toLowerCase();
    const status = (["pending", "paid", "failed", "refunded", "sent"].includes(statusRaw)
      ? statusRaw
      : "pending") as PaymentStatus | PayoutStatus;

    return {
      ok: true,
      type,
      providerRef,
      orderId: payload.order_id ? String(payload.order_id) : undefined,
      status,
      raw: payload,
    };
  }

  async getStatus(reference: string, type: "payment" | "payout") {
    return {
      status: type === "payout" ? "pending" : "pending",
      raw: {
        provider_ref: reference,
        type,
      },
    };
  }
}

export function getProvider(): PaymentProvider {
  const configured = (Deno.env.get("PAYMENT_PROVIDER") || "mock").toLowerCase();
  switch (configured) {
    case "mock":
    default:
      return new MockProvider();
  }
}

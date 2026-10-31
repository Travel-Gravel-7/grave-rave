import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => new Uint8Array(value.match(/.{2}/g)?.map(x => parseInt(x, 16)) ?? []);
async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",").map(x => x.split("="));
  const timestamp = parts.find(x => x[0] === "t")?.[1];
  const signatures = parts.filter(x => x[0] === "v1").map(x => x[1]);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const message = new TextEncoder().encode(timestamp + "." + payload);
  for (const sig of signatures) if (await crypto.subtle.verify("HMAC", key, fromHex(sig), message)) return true;
  return false;
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"), stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !stripeKey || !url || !service) return response({ error: "Webhook is not configured." }, 503);
  const raw = await req.text(), signature = req.headers.get("Stripe-Signature") ?? "";
  if (!await verifyStripeSignature(raw, signature, secret)) return response({ error: "Invalid signature" }, 400);
  let event: any;
  try { event = JSON.parse(raw); } catch { return response({ error: "Invalid JSON" }, 400); }

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const object = event.data?.object ?? {};
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
  let userId = object.metadata?.supabase_user_id ?? object.client_reference_id ?? null;
  if (!userId && customerId) {
    const { data } = await admin.from("inklab_entitlements").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    userId = data?.user_id ?? null;
  }
  if (!userId) return response({ received: true, ignored: "No matching InkLab account" });

  let plan = "free", status = "inactive", subscriptionId: string | null = null, periodEnd: string | null = null, cancelAtPeriodEnd = false;
  if (event.type.startsWith("customer.subscription.")) {
    subscriptionId = object.id;
    status = object.status ?? "inactive";
    plan = ["active", "trialing"].includes(status) ? "premium" : "free";
    periodEnd = object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null;
    cancelAtPeriodEnd = !!object.cancel_at_period_end;
  } else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    subscriptionId = typeof object.subscription === "string" ? object.subscription : object.subscription?.id;
    if (subscriptionId) {
      const subRes = await fetch("https://api.stripe.com/v1/subscriptions/" + subscriptionId, { headers: { Authorization: `Bearer ${stripeKey}`, "Stripe-Version": "2026-09-30.endive" } });
      const sub = await subRes.json();
      if (subRes.ok) {
        status = sub.status ?? "inactive";
        plan = ["active", "trialing"].includes(status) ? "premium" : "free";
        periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        cancelAtPeriodEnd = !!sub.cancel_at_period_end;
      }
    }
  } else if (event.type === "invoice.payment_failed") {
    status = "past_due"; plan = "free";
  } else if (event.type === "invoice.paid") {
    status = "active"; plan = "premium";
  } else {
    return response({ received: true, ignored: event.type });
  }

  const { error } = await admin.from("inklab_entitlements").upsert({
    user_id: userId, plan, status, stripe_customer_id: customerId ?? undefined,
    stripe_subscription_id: subscriptionId ?? undefined, current_period_end: periodEnd,
    cancel_at_period_end: cancelAtPeriodEnd, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return response({ error: "Could not update subscription state" }, 500);
  await admin.from("inklab_stripe_events").upsert({ event_id: event.id, event_type: event.type }, { onConflict: "event_id", ignoreDuplicates: true });
  return response({ received: true });
});

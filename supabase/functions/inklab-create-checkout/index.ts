import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_URL") ?? "https://travel-gravel-7.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const priceId = Deno.env.get("STRIPE_PRICE_ID");
  const appUrl = Deno.env.get("APP_URL");
  if (!supabaseUrl || !anonKey || !serviceKey || !stripeKey || !priceId || !appUrl) {
    return json({ error: "Billing is not configured yet. No payment was attempted." }, 503);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid or expired session" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = userData.user;
  const { data: entitlement, error: entitlementError } = await admin
    .from("inklab_entitlements").select("plan,status,stripe_customer_id")
    .eq("user_id", user.id).maybeSingle();
  if (entitlementError) return json({ error: "Could not verify account status" }, 500);
  if (entitlement?.plan === "premium" && ["active", "trialing"].includes(entitlement.status)) {
    return json({ error: "This account already has Premium access." }, 409);
  }

  try {
    let customerId = entitlement?.stripe_customer_id;
    if (!customerId) {
      const customerBody = new URLSearchParams({ email: user.email ?? "", "metadata[supabase_user_id]": user.id });
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2026-09-30.endive" },
        body: customerBody,
      });
      const customer = await customerRes.json();
      if (!customerRes.ok) return json({ error: "Stripe could not create the customer record." }, 502);
      customerId = customer.id;
      const { error } = await admin.from("inklab_entitlements").upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id" });
      if (error) return json({ error: "Could not attach billing customer to account." }, 500);
    }

    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => String.fromCharCode(97 + (b % 26))).join("");
    const body = new URLSearchParams({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: appUrl + "/?billing=success",
      cancel_url: appUrl + "/?billing=cancelled",
      "subscription_data[metadata][supabase_user_id]": user.id,
      "metadata[supabase_user_id]": user.id,
      integration_identifier: "gravex_inklab_" + suffix,
    });
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2026-09-30.endive" },
      body,
    });
    const session = await response.json();
    if (!response.ok || !session.url) return json({ error: "Stripe checkout could not be started." }, 502);
    return json({ url: session.url });
  } catch {
    return json({ error: "Billing service temporarily unavailable." }, 502);
  }
});
